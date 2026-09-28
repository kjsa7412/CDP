// 명부와 토큰. 설계서 §4.4 · 제품관리서비스 검토 §4.3.
//
// **`auth.json` 은 토큰 대장이 아니라 명부다.** 사람이 먼저 있고 토큰이 거기
// 달린다. 권한(`repos` · `role`)은 **사람에게** 붙고 토큰은 신원만 증명한다.
//
// 그래야 한 사람이 기계마다 토큰을 따로 들어도 권한이 한 줄이다. 프로젝트에서
// 빠지면 `repos` 한 줄을 고치고, 퇴사하면 `active: false` -- 토큰을 일일이
// 찾아 지우지 않아도 그 사람 것 전부가 다음 요청부터 막힌다.
//
// **v1.2 (2026-09-23)** — 권한 축이 `write` 하나에서 `role`(viewer · writer · admin)
// 셋이 됐다. v1.1 파일의 `write:true` 는 읽을 때 `writer` 로 접는다 — 파일을 손대지
// 않아도 그대로 돈다. 토큰 폐기는 줄을 지우지 않고 `status: revoked` 로 남긴다 —
// "이 사람 토큰이 언제 있었나" 가 이력이다.
//
// 판정(`decide`)은 **순수 함수**다. 파일도 시계도 보지 않는다(`now` 를 받는다)
// -- 그래야 만료·비활성·고아·폐기 토큰을 테스트로 고정할 수 있다.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_EXPIRES_DAYS = 90
// 관리자 토큰은 짧다 — 명부를 바꾸는 열쇠라 자주 갱신한다(검토 v0.1 §3.3).
export const ADMIN_EXPIRES_DAYS = 30
export const ROLES = ['viewer', 'writer', 'admin']
const DAY = 86400_000
const VERSION = '1.2'

export class AuthError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.detail = detail
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')
const day = (ms) => new Date(ms).toISOString().slice(0, 10)

// ── 역할 ────────────────────────────────────────────────────────────────────
//
// `role` 이 있으면 그것, 없으면 옛 `write` 로 접는다. **이 함수 하나가 v1.1 과
// v1.2 를 잇는다** — 다른 곳에서 `u.write` 를 직접 보지 않는다.

export function roleOf(u) {
  if (u && ROLES.includes(u.role)) return u.role
  return u?.write ? 'writer' : 'viewer'
}
const canWrite = (role) => role === 'writer' || role === 'admin'

function assertRole(role) {
  if (!ROLES.includes(role)) throw new AuthError('E_INPUT', '역할은 viewer · writer · admin 중 하나다', { role })
  return role
}

// 권한 묶음 — `decide` 와 `decideSession` 이 같은 모양을 낸다.
function grantOf(u) {
  const repos = Array.isArray(u.repos) ? u.repos : []
  const all = repos.includes('*')
  const role = roleOf(u)
  return {
    user: u.name,
    label: u.label ?? null,
    role,
    admin: role === 'admin',
    write: canWrite(role),
    allow: all ? null : (name) => repos.includes(name),
  }
}

// ── 판정 (§4.4) ─────────────────────────────────────────────────────────────
//
// 매 요청 다섯 단계를 탄다. **상태를 기억하지 않는다는 것은 매번 다시 확인한다는
// 뜻이다** -- 세션 테이블 방식은 로그인 때 한 번 보고 그 뒤로는 id 를 믿는다.
//
// 3번이 있어야 명부에서 지운 사람의 토큰이 살아남지 못한다(고아 토큰).
// **권한의 근거는 언제나 명부다.**

export function decide(db, rawToken, now = Date.now()) {
  const deny = (why) => ({ ok: false, status: 401, code: 'E_AUTH', message: why })

  if (!rawToken) return deny('토큰이 없다')
  const rec = (db.tokens || []).find((t) => t.sha256 === sha256(rawToken))
  if (!rec) return deny('토큰을 찾을 수 없다') // ①
  if (rec.status === 'revoked') return deny('폐기된 토큰') // ① — 줄은 남고 문은 닫힌다

  if (rec.expires && rec.expires !== 'never') {
    const at = Date.parse(rec.expires + 'T23:59:59')
    if (Number.isFinite(at) && now > at) return deny('만료') // ②
  }

  const u = (db.users || []).find((x) => x.name === rec.user)
  if (!u) return deny('명부에 없는 토큰') // ③ 고아 토큰
  if (u.active === false) return deny('사용 중지된 사용자') // ④

  // ⑤ 권한은 users[] 에서. 토큰은 여기에 아무것도 보태지 않는다.
  return {
    ok: true,
    ...grantOf(u),
    // 만료가 가까우면 알린다(§4.4.2). 만료된 뒤에 아는 것은 늦다 --
    // 그때는 이미 붙어 있던 세션이 끊긴 뒤다.
    expiresInDays: daysLeft(rec, now),
    tokenExpires: rec.expires || 'never',
    tokenId: rec.sha256.slice(0, 8),
  }
}

// 남은 일수는 **달력 날짜의 차이**다 — 만료일 자정 대 오늘 자정(둘 다 UTC, `day()` 와 같은 기준).
// 갓 발급한 30일 토큰이 30일이어야 하고, 만료일 당일은 0일(그날 23:59:59 까지는 산다 — decide).
export function daysLeft(rec, now = Date.now()) {
  if (!rec?.expires || rec.expires === 'never') return null
  const at = Date.parse(rec.expires)
  if (!Number.isFinite(at)) return null
  return Math.round((at - Date.parse(day(now))) / DAY)
}

// ── 파일 ────────────────────────────────────────────────────────────────────

export function emptyDb() {
  return { users: [], tokens: [] }
}

// 읽는 경계에서 v1.1 → v1.2 로 접는다. 파일은 그대로 두고 메모리만 새 모양이다 —
// `store()` 가 다음에 쓸 때 v1.2 가 된다.
function normUser(u) {
  const { write, ...rest } = u
  return { ...rest, role: roleOf(u) }
}
function normToken(t) {
  return { ...t, id: t.id || String(t.sha256 || '').slice(0, 8), status: t.status === 'revoked' ? 'revoked' : 'active' }
}

export async function load(file) {
  const raw = await fs.readFile(file, 'utf8').catch((e) => {
    if (e.code === 'ENOENT') return null
    throw new AuthError('E_REPO', `auth.json 을 읽을 수 없다: ${e.message}`, { file })
  })
  if (raw == null) return emptyDb()
  let db
  try {
    db = JSON.parse(raw)
  } catch (e) {
    throw new AuthError('E_INPUT', `auth.json 이 JSON 이 아니다: ${e.message}`, { file })
  }
  if (!db || typeof db !== 'object') throw new AuthError('E_INPUT', 'auth.json 이 객체가 아니다', { file })
  // **v1.0 형식(토큰에 repos·write)을 조용히 받아 주지 않는다.** 그러면 권한이
  // 두 곳에 살고, 어느 쪽이 이겼는지 아무도 모른 채 돈다.
  const bad = (db.tokens || []).find((t) => t && ('repos' in t || 'write' in t))
  if (bad) {
    throw new AuthError('E_INPUT', '토큰에 repos·write 가 있다 — 권한은 users[] 에만 둔다(§4.4)', { user: bad.user })
  }
  return { users: (db.users || []).map(normUser), tokens: (db.tokens || []).map(normToken) }
}

export async function store(file, db) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true }).catch(() => {})
  await fs.writeFile(file, JSON.stringify({ version: VERSION, users: db.users, tokens: db.tokens }, null, 2) + '\n', 'utf8')
  // POSIX 에서만 의미가 있다. Windows 는 ACL 이라 이 호출이 조용히 지나간다 --
  // 그래서 서버는 시작할 때 권한을 확인하지 않고, 운영 항목에 남긴다(§9.4).
  await fs.chmod(file, 0o600).catch(() => {})
}

// ── 명부 (§4.4.0) ───────────────────────────────────────────────────────────

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function userAdd(db, { name, label = null, repos = [], role = null, write = false }) {
  if (!NAME_RE.test(String(name || ''))) throw new AuthError('E_INPUT', '이름 형식이 아니다', { name })
  if (db.users.some((u) => u.name === name)) throw new AuthError('E_EXISTS', '이미 명부에 있다', { name })
  // `write` 는 옛 이름이다 — `--write` 로 부르던 자리가 그대로 돈다.
  const r = assertRole(role ?? (write ? 'writer' : 'viewer'))
  const u = { name, label, active: true, repos: normRepos(repos), role: r }
  db.users.push(u)
  return u
}

export function admins(db) {
  return db.users.filter((u) => u.active !== false && roleOf(u) === 'admin')
}

// `actor` 는 이 변경을 요청한 사람이다(화면 · API). 셸(CLI)은 actor 가 없다 —
// 셸은 이미 서버를 가진 사람이라 자기 해제 가드를 두지 않는다.
export function userSet(db, name, patch, { actor = null } = {}) {
  const u = db.users.find((x) => x.name === name)
  if (!u) throw new AuthError('E_NOT_FOUND', '명부에 없다', { name })

  const before = roleOf(u)
  let nextRole = before
  if (patch.role !== undefined) nextRole = assertRole(patch.role)
  else if (patch.write !== undefined) {
    // 옛 축 — `--write` 는 writer 로 올리고(admin 은 그대로 둔다) `--no-write` 는 viewer 로 내린다
    nextRole = patch.write ? (before === 'admin' ? 'admin' : 'writer') : 'viewer'
  }
  const wasActive = u.active !== false
  const nextActive = patch.active === undefined ? wasActive : !!patch.active

  // **자기 자신의 역할 · 활성은 바꾸지 못한다.** 마지막 관리자가 실수로 자기를 내리는
  // 것이 가장 흔한 사고다 — 다른 관리자가 한다.
  if (actor && actor === name && (nextRole !== before || nextActive !== wasActive)) {
    throw new AuthError('E_SELF', '자기 자신의 역할 · 활성은 바꿀 수 없다 — 다른 관리자가 한다', { name })
  }
  // **마지막 활성 admin 을 잃지 않는다.** 콘솔에 아무도 못 들어가는 상태는 셸로만 풀린다.
  if (before === 'admin' && wasActive && (nextRole !== 'admin' || !nextActive)) {
    const others = admins(db).filter((a) => a.name !== name)
    if (!others.length) {
      throw new AuthError('E_LAST_ADMIN', '마지막 관리자다 — 다른 사람을 먼저 admin 으로 올린다', { name })
    }
  }

  if (patch.label !== undefined) u.label = patch.label
  if (patch.repos !== undefined) u.repos = normRepos(patch.repos)
  u.role = nextRole
  if (patch.active !== undefined) {
    u.active = nextActive
    // **토큰을 지우지 않는다.** 되돌릴 수 있어야 하고 이력이 남아야 한다.
    if (!u.active) u.left = day(Date.now())
    else delete u.left
  }
  return u
}

function normRepos(v) {
  const a = Array.isArray(v) ? v : String(v || '').split(',')
  const out = a.map((s) => String(s).trim()).filter(Boolean)
  return out.includes('*') ? ['*'] : out
}

// "이 레포를 지금 볼 수 있는 사람 전원" — 명부를 둔 목적이 이 질문이다.
export function userList(db, { repo = null, now = Date.now() } = {}) {
  return db.users
    .filter((u) => !repo || (u.active !== false && (u.repos || []).some((r) => r === '*' || r === repo)))
    .map((u) => {
      const mine = db.tokens.filter((t) => t.user === u.name)
      const live = mine.filter((t) => {
        if (t.status === 'revoked') return false
        const d = daysLeft(t, now)
        return d === null || d > 0
      })
      const role = roleOf(u)
      return {
        name: u.name,
        label: u.label ?? null,
        active: u.active !== false,
        repos: u.repos || [],
        role,
        admin: role === 'admin',
        write: canWrite(role),
        tokens: mine.length,
        liveTokens: live.length,
        left: u.left ?? null,
      }
    })
}

// ── 토큰 (§4.4.1 · §4.4.2) ──────────────────────────────────────────────────
//
// 발급은 서버 셸의 CLI 와 콘솔(`/admin/tokens` · admin · 재인증)이 부른다.
// 누구에게 줄지는 사람이 정하고, 원문은 **돌려주기만 한다** — 파일에는 해시만 남는다.

export function issue(db, { user, expiresDays, note = null, now = Date.now() }) {
  // **명부에 없는 이름을 거부한다.** v1.0 은 `--user` 가 자유 문자열이라
  // 오타 하나로 유령 사용자가 생겼다.
  const u = db.users.find((x) => x.name === user)
  if (!u) throw new AuthError('E_INPUT', '명부에 없는 이름이다 — serve user add 를 먼저 한다', { user })
  // 기본 만료는 **그 사람의 역할**이 정한다 — admin 30일 · 나머지 90일.
  const days = expiresDays === undefined || expiresDays === null ? (roleOf(u) === 'admin' ? ADMIN_EXPIRES_DAYS : DEFAULT_EXPIRES_DAYS) : expiresDays
  const raw = crypto.randomBytes(32).toString('base64url')
  const hash = sha256(raw)
  const rec = {
    sha256: hash,
    id: hash.slice(0, 8),
    user,
    issued: day(now),
    expires: normExpires(days, now),
    note,
    status: 'active',
  }
  db.tokens.push(rec)
  return { raw, rec }
}

// `never` · `YYYY-MM-DD` · 일수(숫자 또는 숫자 문자열) 셋을 받는다.
function normExpires(v, now = Date.now()) {
  if (v === 'never') return 'never'
  if (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)) return v
  const n = Number(v)
  if (!Number.isFinite(n) || n <= 0) throw new AuthError('E_INPUT', '만료는 일수 · YYYY-MM-DD · never 중 하나다', { expires: v })
  return day(now + n * DAY)
}

export function tokenList(db, now = Date.now()) {
  return db.tokens.map((t) => ({
    id: t.id || t.sha256.slice(0, 8),
    user: t.user,
    issued: t.issued ?? null,
    expires: t.expires ?? null,
    daysLeft: daysLeft(t, now),
    note: t.note ?? null,
    status: t.status === 'revoked' ? 'revoked' : 'active',
    revokedAt: t.revokedAt ?? null,
    revokedBy: t.revokedBy ?? null,
  }))
}

function findToken(db, id, { activeOnly = false } = {}) {
  const key = String(id || '')
  if (!key) return null
  return db.tokens.find((t) => (!activeOnly || t.status !== 'revoked') && t.sha256.startsWith(key)) || null
}

// 폐기 — **줄을 지우지 않는다.** `status` 만 바꾼다. 판정은 활성만 통과시키므로
// 다음 요청부터 막히는 것은 전과 같고, 표에는 회색 행이 남는다.
export function revoke(db, { user = null, id = null, by = null, now = Date.now() }) {
  const hits = db.tokens.filter(
    (t) => t.status !== 'revoked' && (!user || t.user === user) && (!id || t.sha256.startsWith(String(id)))
  )
  if (!hits.length) throw new AuthError('E_NOT_FOUND', '지울 토큰이 없다', { user, id })
  for (const t of hits) {
    t.status = 'revoked'
    t.revokedAt = day(now)
    if (by) t.revokedBy = by
  }
  return hits.length
}

// 재발급 — 폐기 + 발급이 **한 동작**이다. 잃은 토큰을 "복구" 하는 것이 아니라
// 새것을 준다. 권한은 사람에 붙어 있어 잃는 것이 없다(검토 v0.1 §3.4).
export function reissue(db, { id, by = null, note, expiresDays, now = Date.now() }) {
  const old = findToken(db, id, { activeOnly: true })
  if (!old) throw new AuthError('E_NOT_FOUND', '그 id 의 활성 토큰이 없다', { id })
  revoke(db, { id: old.sha256, by, now })
  const { raw, rec } = issue(db, {
    user: old.user,
    note: note !== undefined ? note : `${old.note || ''} 재발급`.trim(),
    expiresDays,
    now,
  })
  return { raw, rec, old }
}

// 메모 · 만료 수정. 폐기된 토큰의 메모는 고칠 수 있지만(이력 정리) 만료는 못 고친다.
export function tokenSet(db, { id, note, expires, now = Date.now() }) {
  const t = findToken(db, id)
  if (!t) throw new AuthError('E_NOT_FOUND', '그 id 의 토큰이 없다', { id })
  if (note !== undefined) t.note = note
  if (expires !== undefined) {
    if (t.status === 'revoked') throw new AuthError('E_INPUT', '폐기된 토큰의 만료는 바꿀 수 없다', { id })
    t.expires = normExpires(expires, now)
  }
  return t
}

// ── 이력 (§4.4.2) ───────────────────────────────────────────────────────────
//
// 발급 · 폐기 · 만료 **그리고 명부 변경**을 남긴다. 퇴사·권한 변경의 근거가
// 여기 있다. **원문 토큰은 적지 않는다** — 해시 앞 8자까지다.

export async function audit(dataDir, line) {
  if (!dataDir) return
  const file = path.join(dataDir, 'logs', 'auth.log')
  await fs.mkdir(path.dirname(file), { recursive: true }).catch(() => {})
  await fs.appendFile(file, new Date().toISOString() + ' · ' + line + '\n', 'utf8').catch(() => {})
}

// ── 부트스트랩 (검토 §4.3 · D3) ─────────────────────────────────────────────
//
// 명부가 비어 있으면 서버가 일회용 코드를 만든다. **코드를 읽으려면 서버의 파일이나
// 로그를 볼 수 있어야 한다** — 그것이 "첫 관리자는 셸을 가진 사람" 이라는 원칙이다.
// 명부가 생기면 파일은 지워지고 어디서도 통하지 않는다.

const BOOT_FILE = 'bootstrap.code'

export async function ensureBootstrap(dataDir, db) {
  if (!dataDir) return null
  const file = path.join(dataDir, BOOT_FILE)
  if ((db.users || []).length) {
    await fs.rm(file, { force: true }).catch(() => {})
    return null
  }
  const cur = (await fs.readFile(file, 'utf8').catch(() => '')).trim()
  if (cur.length >= 16) return cur
  const code = crypto.randomBytes(24).toString('base64url')
  await fs.mkdir(dataDir, { recursive: true }).catch(() => {})
  await fs.writeFile(file, code + '\n', { encoding: 'utf8', mode: 0o600 })
  await fs.chmod(file, 0o600).catch(() => {})
  return code
}

export async function verifyBootstrap(dataDir, code) {
  if (!dataDir || !code) return false
  const cur = (await fs.readFile(path.join(dataDir, BOOT_FILE), 'utf8').catch(() => '')).trim()
  if (!cur) return false
  const a = Buffer.from(cur, 'utf8')
  const b = Buffer.from(String(code).trim(), 'utf8')
  // 길이가 다르면 timingSafeEqual 이 던진다. 먼저 본다.
  return a.length === b.length && crypto.timingSafeEqual(a, b)
}

export async function clearBootstrap(dataDir) {
  if (!dataDir) return
  await fs.rm(path.join(dataDir, BOOT_FILE), { force: true }).catch(() => {})
}

// ── 세션 쿠키 (§6.4) ────────────────────────────────────────────────────────
//
// **서버가 세션을 저장하지 않는다.** 쿠키에 서명만 하고, 권한은 매 요청 명부에서
// 읽는다. 그래서 —
//
//   · 세션 테이블이 없다. `POST /mcp` 의 stateless 와 같은 성질이라(§4.3)
//     서버를 늘려도 로그인이 한쪽에 묶이지 않는다.
//   · 폐기가 즉시 먹는다. 쿠키가 살아 있어도 명부에서 지웠거나 `active:false` 면
//     다음 요청에서 끊긴다 — **권한을 쿠키에 담지 않기 때문이다.**
//
// 순수 JWT 와 다른 점이 둘째 줄이다. 담으면 편하지만 담는 순간 되돌릴 수 없다.
//
// **재인증 쿠키(`cdp_su`)도 같은 함수다.** `kind: 'sudo'` · 15분. 세션 쿠키를
// 재인증 자리에 내밀어도 `kind` 가 달라 통하지 않는다.

const SESSION_HOURS = 12
export const SUDO_MINUTES = 15

export async function loadSecret(dataDir) {
  const file = path.join(dataDir, 'secret')
  const cur = await fs.readFile(file).catch(() => null)
  if (cur && cur.length >= 32) return cur
  const next = crypto.randomBytes(32)
  await fs.mkdir(dataDir, { recursive: true }).catch(() => {})
  await fs.writeFile(file, next)
  await fs.chmod(file, 0o600).catch(() => {})
  return next
}

const b64u = (b) => Buffer.from(b).toString('base64url')

// `tid` — 로그인한 토큰의 id(해시 앞 8자 · 비밀이 아니다). 권한을 담는 것이 아니라 **화면이 그 토큰의 만료를 말하게**
// 하는 표지다(화면 · 권한 검토 v0.1 R3 — 관리 › 정보의 「토큰 만료 D-n」). 판정(decideSession)은 그대로 명부만 본다.
export function signSession(secret, user, { now = Date.now(), hours = SESSION_HOURS, minutes = null, kind = 'session', tid = null } = {}) {
  const ttl = minutes != null ? minutes * 60_000 : hours * 3600_000
  const body = { user, exp: now + ttl }
  if (kind !== 'session') body.kind = kind
  if (tid) body.tid = String(tid).slice(0, 8)
  const payload = b64u(JSON.stringify(body))
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return payload + '.' + mac
}

export function readSession(secret, cookie, now = Date.now(), { kind = 'session' } = {}) {
  if (!cookie || typeof cookie !== 'string') return null
  const i = cookie.lastIndexOf('.')
  if (i < 0) return null
  const payload = cookie.slice(0, i)
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  // 길이가 다르면 timingSafeEqual 이 던진다. 먼저 본다.
  const got = Buffer.from(cookie.slice(i + 1))
  const want = Buffer.from(mac)
  if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
  try {
    const j = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8'))
    if (!j?.user || !j.exp || now > j.exp) return null
    if ((j.kind || 'session') !== kind) return null
    return { user: j.user, exp: j.exp, tid: j.tid || null }
  } catch {
    return null
  }
}

// 쿠키를 들고 온 요청의 권한. **`decide` 의 3~5단계를 그대로 탄다**(§4.4) —
// 토큰 조회와 만료(1·2)는 로그인 때 이미 했고, 명부 조회·`active`·권한은
// 매 요청 다시 본다.
export function decideSession(db, sess, now = Date.now()) {
  if (!sess) return { ok: false, status: 401, code: 'E_AUTH', message: '세션이 없다' }
  const u = (db.users || []).find((x) => x.name === sess.user)
  if (!u) return { ok: false, status: 401, code: 'E_AUTH', message: '명부에 없는 사용자' }
  if (u.active === false) return { ok: false, status: 401, code: 'E_AUTH', message: '사용 중지된 사용자' }
  // 만료는 **말하기만** 한다 — 로그인한 그 토큰의 것. 모르면(옛 쿠키 · 폐기 · 다른 사람의 것) null — 없는 값을 지어내지 않는다
  const rec = sess.tid ? (db.tokens || []).find((t) => t.user === u.name && t.status !== 'revoked' && String(t.sha256 || '').startsWith(sess.tid)) : null
  return { ok: true, ...grantOf(u), expiresInDays: rec ? daysLeft(rec, now) : null, tokenExpires: rec ? rec.expires || 'never' : null, tokenId: rec ? sess.tid : null }
}

export function parseCookies(header) {
  const out = {}
  for (const part of String(header || '').split(';')) {
    const i = part.indexOf('=')
    if (i < 0) continue
    out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
  }
  return out
}
