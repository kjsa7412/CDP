// 명부와 토큰. 설계서 §4.4.
//
// **`auth.json` 은 토큰 대장이 아니라 명부다.** 사람이 먼저 있고 토큰이 거기
// 달린다. 권한(`repos` · `write`)은 **사람에게** 붙고 토큰은 신원만 증명한다.
//
// 그래야 한 사람이 기계마다 토큰을 따로 들어도 권한이 한 줄이다. 프로젝트에서
// 빠지면 `repos` 한 줄을 고치고, 퇴사하면 `active: false` -- 토큰을 일일이
// 찾아 지우지 않아도 그 사람 것 전부가 다음 요청부터 막힌다.
//
// 판정(`decide`)은 **순수 함수**다. 파일도 시계도 보지 않는다(`now` 를 받는다)
// -- 그래야 만료·비활성·고아 토큰을 테스트로 고정할 수 있다.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export const DEFAULT_EXPIRES_DAYS = 90
const DAY = 86400_000

export class AuthError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'AuthError'
    this.code = code
    this.detail = detail
  }
}

export const sha256 = (s) => crypto.createHash('sha256').update(String(s), 'utf8').digest('hex')

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

  if (rec.expires && rec.expires !== 'never') {
    const at = Date.parse(rec.expires + 'T23:59:59')
    if (Number.isFinite(at) && now > at) return deny('만료') // ②
  }

  const u = (db.users || []).find((x) => x.name === rec.user)
  if (!u) return deny('명부에 없는 토큰') // ③ 고아 토큰
  if (u.active === false) return deny('사용 중지된 사용자') // ④

  // ⑤ 권한은 users[] 에서. 토큰은 여기에 아무것도 보태지 않는다.
  const repos = Array.isArray(u.repos) ? u.repos : []
  const all = repos.includes('*')
  return {
    ok: true,
    user: u.name,
    label: u.label ?? null,
    write: !!u.write,
    allow: all ? null : (name) => repos.includes(name),
    // 만료가 가까우면 알린다(§4.4.2). 만료된 뒤에 아는 것은 늦다 --
    // 그때는 이미 붙어 있던 세션이 끊긴 뒤다.
    expiresInDays: daysLeft(rec, now),
    tokenId: rec.sha256.slice(0, 8),
  }
}

export function daysLeft(rec, now = Date.now()) {
  if (!rec?.expires || rec.expires === 'never') return null
  const at = Date.parse(rec.expires + 'T23:59:59')
  if (!Number.isFinite(at)) return null
  return Math.ceil((at - now) / DAY)
}

// ── 파일 ────────────────────────────────────────────────────────────────────

export function emptyDb() {
  return { users: [], tokens: [] }
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
  return { users: db.users || [], tokens: db.tokens || [] }
}

export async function store(file, db) {
  await fs.mkdir(path.dirname(path.resolve(file)), { recursive: true }).catch(() => {})
  await fs.writeFile(file, JSON.stringify(db, null, 2) + '\n', 'utf8')
  // POSIX 에서만 의미가 있다. Windows 는 ACL 이라 이 호출이 조용히 지나간다 --
  // 그래서 서버는 시작할 때 권한을 확인하지 않고, 운영 항목에 남긴다(§9.4).
  await fs.chmod(file, 0o600).catch(() => {})
}

// ── 명부 (§4.4.0) ───────────────────────────────────────────────────────────

const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

export function userAdd(db, { name, label = null, repos = [], write = false }) {
  if (!NAME_RE.test(String(name || ''))) throw new AuthError('E_INPUT', '이름 형식이 아니다', { name })
  if (db.users.some((u) => u.name === name)) throw new AuthError('E_EXISTS', '이미 명부에 있다', { name })
  const u = { name, label, active: true, repos: normRepos(repos), write: !!write }
  db.users.push(u)
  return u
}

export function userSet(db, name, patch) {
  const u = db.users.find((x) => x.name === name)
  if (!u) throw new AuthError('E_NOT_FOUND', '명부에 없다', { name })
  if (patch.label !== undefined) u.label = patch.label
  if (patch.repos !== undefined) u.repos = normRepos(patch.repos)
  if (patch.write !== undefined) u.write = !!patch.write
  if (patch.active !== undefined) {
    u.active = !!patch.active
    // **토큰을 지우지 않는다.** 되돌릴 수 있어야 하고 이력이 남아야 한다.
    if (!u.active) u.left = new Date().toISOString().slice(0, 10)
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
        const d = daysLeft(t, now)
        return d === null || d > 0
      })
      return {
        name: u.name,
        label: u.label ?? null,
        active: u.active !== false,
        repos: u.repos || [],
        write: !!u.write,
        tokens: mine.length,
        liveTokens: live.length,
        left: u.left ?? null,
      }
    })
}

// ── 토큰 (§4.4.1 · §4.4.2) ──────────────────────────────────────────────────
//
// **발급 엔드포인트는 없다.** 이 함수는 서버 기계의 CLI 만 부른다. 누구에게
// 줄지는 사람이 정하고, 서버는 그것을 판단할 방법이 없다(§4.4.1).

export function issue(db, { user, expiresDays = DEFAULT_EXPIRES_DAYS, note = null, now = Date.now() }) {
  // **명부에 없는 이름을 거부한다.** v1.0 은 `--user` 가 자유 문자열이라
  // 오타 하나로 유령 사용자가 생겼다.
  if (!db.users.some((u) => u.name === user)) {
    throw new AuthError('E_INPUT', '명부에 없는 이름이다 — serve user add 를 먼저 한다', { user })
  }
  const raw = crypto.randomBytes(32).toString('base64url')
  const expires =
    expiresDays === 'never' ? 'never' : new Date(now + Number(expiresDays) * DAY).toISOString().slice(0, 10)
  const rec = {
    sha256: sha256(raw),
    user,
    issued: new Date(now).toISOString().slice(0, 10),
    expires,
    note,
  }
  db.tokens.push(rec)
  // 원문은 **돌려주기만 한다.** 파일에는 해시만 남는다.
  return { raw, rec }
}

export function tokenList(db, now = Date.now()) {
  return db.tokens.map((t) => ({
    id: t.sha256.slice(0, 8),
    user: t.user,
    issued: t.issued ?? null,
    expires: t.expires ?? null,
    daysLeft: daysLeft(t, now),
    note: t.note ?? null,
  }))
}

export function revoke(db, { user, id = null }) {
  const before = db.tokens.length
  db.tokens = db.tokens.filter((t) => !(t.user === user && (!id || t.sha256.startsWith(id))))
  const n = before - db.tokens.length
  if (!n) throw new AuthError('E_NOT_FOUND', '지울 토큰이 없다', { user, id })
  return n
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

const SESSION_HOURS = 12

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

export function signSession(secret, user, { now = Date.now(), hours = SESSION_HOURS } = {}) {
  const payload = b64u(JSON.stringify({ user, exp: now + hours * 3600_000 }))
  const mac = crypto.createHmac('sha256', secret).update(payload).digest('base64url')
  return payload + '.' + mac
}

export function readSession(secret, cookie, now = Date.now()) {
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
    return { user: j.user, exp: j.exp }
  } catch {
    return null
  }
}

// 쿠키를 들고 온 요청의 권한. **`decide` 의 3~5단계를 그대로 탄다**(§4.4) —
// 토큰 조회와 만료(1·2)는 로그인 때 이미 했고, 명부 조회·`active`·권한은
// 매 요청 다시 본다.
export function decideSession(db, sess) {
  if (!sess) return { ok: false, status: 401, code: 'E_AUTH', message: '세션이 없다' }
  const u = (db.users || []).find((x) => x.name === sess.user)
  if (!u) return { ok: false, status: 401, code: 'E_AUTH', message: '명부에 없는 사용자' }
  if (u.active === false) return { ok: false, status: 401, code: 'E_AUTH', message: '사용 중지된 사용자' }
  const repos = Array.isArray(u.repos) ? u.repos : []
  const all = repos.includes('*')
  return {
    ok: true,
    user: u.name,
    label: u.label ?? null,
    write: !!u.write,
    allow: all ? null : (name) => repos.includes(name),
    expiresInDays: null,
  }
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
