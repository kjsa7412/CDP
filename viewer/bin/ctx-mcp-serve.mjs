// ctx serve — 모드 B. 설계서 §4.
//
// **`ctx-mcp.mjs` 를 고치지 않는다.** 도구·리소스·명함·판정은 두 모드가 같고
// (§1), 여기는 그것을 HTTP 로 내는 껍데기다. 이 파일이 갖는 것은 넷뿐이다 —
// 레포 저장소 · 라우트 · 인증 자리 · 로그.
//
// 상태를 들지 않는다(stateless · §4.3). 세션 id 가 없으므로 서버를 여러 대로
// 늘려도 요청이 한쪽에 묶이지 않는다. 대신 요청마다 서버 객체를 새로 만드는데,
// 무거운 것(레포)은 캐시가 들고 있으므로 만드는 것은 등록표뿐이다.

import http from 'node:http'
import { AsyncLocalStorage } from 'node:async_hooks'
import path from 'node:path'
import fs from 'node:fs/promises'
import { createMcpHandler } from '@modelcontextprotocol/server'
import * as git from '../../core/git.js'
import * as auth from '../../core/auth.js'
import { save as doSave } from '../../core/save.js'
import { zip } from '../../core/zip.js'
import * as wr from '../../core/workrepos.js'
import { kitHash, mergeClaude, mcpEntryServer, mergeMcpJson } from '../../core/setup.js'
import { Store } from '../../core/store.js'
import { handleRead, MIME } from '../server/adapter/read-api.js'
import { hereDir } from '../server/runtime.js'
import { buildServer, makeRepoCache, BUILT } from './ctx-mcp.mjs'
import * as mirror from '../../core/mirror.js'
import { newRepo, cloneRepo, connectOrigin, trashRepo, REPO_NAME_RE } from '../../core/reponew.js'
import { withLock } from '../../core/lock.js'
import * as gitauth from '../../core/gitauth.js'
import { listPackages as listPackageDirs } from '../../core/packages.js'
import { resolvePackages, materializePackage } from './ctx-package.mjs'
import { parseCidrs, ipInCidrs, makeLimiter } from '../../core/net.js'
import { appVersion } from '../../core/appinfo.js'
import { doctorRows, resolveManualDir } from './ctx-serve-doctor.mjs'
import { refreshToolLayer, describe as kitLine, REASON_TEXT as KIT_REASON } from '../../core/toollayer.js'
import { sharedKitSource, kitMessage } from './ctx-serve-kit.mjs'

const NL = String.fromCharCode(10)

// 요청별 맥락을 팩토리로 잇는다.
//
// `createMcpHandler` 의 팩토리는 SDK 가 부르고 `{ era, requestInfo }` 만 받는다.
// 인증 결과와 그 요청이 볼 수 있는 레포 목록은 우리가 앞에서 정한 것이라
// 그 인자에 실을 자리가 없다 -- 전역에 두면 동시 요청이 서로 덮는다.
// AsyncLocalStorage 가 요청 하나의 실행 흐름에만 붙는다.
const CTX = new AsyncLocalStorage()

// ── 로그 (§2.8) ─────────────────────────────────────────────────────────────
//
// **본문도 검색어도 남기지 않는다.** 남기는 것은 누가 · 무엇을 · 얼마나 걸려 ·
// 어떻게 끝났나다. `search` 는 말이 아니라 **건수만** 적는다 — 검색어는 사람이
// 무엇을 모르는지를 드러내고, 그것은 로그가 알 일이 아니다.

function makeLog(dataDir) {
  const file = dataDir ? path.join(dataDir, 'logs', 'serve.log') : null
  let size = 0
  let ready = file
    ? fs
        .mkdir(path.dirname(file), { recursive: true })
        .then(() => fs.stat(file).catch(() => null))
        .then((st) => {
          size = st?.size || 0
        })
    : Promise.resolve()

  const write = async (line) => {
    process.stderr.write(line + NL)
    if (!file) return
    await ready
    // 회전 3×1MB. 오래된 것부터 밀어낸다 — 서버는 몇 달을 돌고, 로그가 디스크를
    // 채우면 그때 죽는 것은 로그가 아니라 서버다.
    if (size > 1024 * 1024) {
      for (let i = 2; i >= 1; i--) {
        await fs.rename(file + '.' + i, file + '.' + (i + 1)).catch(() => {})
      }
      await fs.rename(file, file + '.1').catch(() => {})
      size = 0
    }
    const buf = line + NL
    size += Buffer.byteLength(buf, 'utf8')
    await fs.appendFile(file, buf, 'utf8').catch(() => {})
  }

  return {
    line: (s) => write('[cdp-serve] ' + s),
    req: (o) =>
      write(
        [
          new Date().toISOString(),
          o.user || '-',
          o.repo || '-',
          o.method || '-',
          o.tool || '-',
          o.key || '-',
          (o.ms ?? '-') + 'ms',
          o.code || String(o.status || '-'),
          o.ip || '-',
          // 토큰 id(앞 8자) — **끝 열**이다(2026-09-23). 토큰별 마지막 사용을 세는 유일한 근거.
          // 앞 열은 그대로라 옛 로그도 사용자별은 읽힌다(`lastUsed`).
          o.tid || '-',
        ].join(' · ')
      ),
  }
}

// ── 레포 저장소 (§4.2) ──────────────────────────────────────────────────────
//
// **등록은 폴더를 두는 것이다.** 등록 명령도 설정 파일도 없다 — `git clone` 한
// 뒤 다음 요청부터 인식된다. 목록은 60초마다 갱신하므로 재시작이 필요 없다.
//
// 캐시는 레포마다 하나이고 MCP 와 관리 서비스(§6.3)가 **같은 것을 쓴다.**
// 두 벌을 들면 같은 레포를 두 번 읽고 두 답이 갈린다.

export function makeStore(root, log) {
  let repos = []
  let at = 0
  const caches = new Map()
  // 화면용 `Store` — 관리 서비스의 읽기 API 가 쓴다(§6.3).
  //
  // **감시를 켜지 않는다.** 로컬 뷰어는 chokidar 로 파일을 지켜보지만 서버는
  // 레포가 N 개고 유일한 작성자가 자기 자신이다 — `save` 가 끝나면 그때
  // 재스캔하면 된다. 감시자 N 개를 살려 둘 이유가 없다.
  const views = new Map()
  const loading = new Map()

  const refresh = async () => {
    const ents = await fs.readdir(root, { withFileTypes: true }).catch(() => [])
    const found = []
    for (const e of ents) {
      if (!e.isDirectory()) continue
      const dir = path.join(root, e.name)
      const ok = await fs
        .access(path.join(dir, '_vocab.md'))
        .then(() => true)
        .catch(() => false)
      if (!ok) continue
      found.push({ name: e.name, root: dir })
      if (!caches.has(e.name)) caches.set(e.name, makeRepoCache(dir))
      if (!views.has(e.name)) {
        views.set(e.name, new Store({ root: dir, settings: { watch: false, settledness: { excludeTypes: ['domain'] } } }))
      }
    }
    const before = repos.map((r) => r.name).join(',')
    repos = found.sort((a, b) => a.name.localeCompare(b.name))
    const after = repos.map((r) => r.name).join(',')
    if (before !== after) log.line(`레포 목록: ${after || '(없음)'}`)
    at = Date.now()
  }

  // 모르는 이름이 오면 다시 훑는다 — `repo new` · clone 직후의 첫 요청(꾸러미 · 등록 · MCP ·
  // 화면)이 1분을 기다리지 않게. 설명서 걷기(2026-09-23)에서 `repo new` 바로 뒤에 작업 레포를
  // 등록하니 "그런 지식 레포가 없다" 였다. 없는 이름으로 두들기는 요청이 readdir 을 매번
  // 부르지 않게 2초에 한 번만.
  let missAt = 0
  const ensure = async (name) => {
    if (repos.some((r) => r.name === name)) return true
    if (Date.now() - missAt > 2_000) {
      missAt = Date.now()
      await refresh()
    }
    return repos.some((r) => r.name === name)
  }
  return {
    async list() {
      // 비어 있으면 1분을 기다리지 않는다 — 첫 레포를 세운 직후 화면과 /me 가 빈 목록을 보였다
      if (Date.now() - at > 60_000 || (!repos.length && Date.now() - at > 2_000)) await refresh()
      return repos
    },
    ensure,
    cache: (name) => caches.get(name),
    async view(name) {
      const v = views.get(name)
      if (!v) return null
      // 첫 요청에 한 번 읽는다. 감시를 안 켜므로 갱신은 `save` 가 알린다.
      if (!v.stats?.scannedAt) {
        if (!loading.has(name)) loading.set(name, v.load().finally(() => loading.delete(name)))
        await loading.get(name)
      }
      return v
    },
    // `save` 가 끝나면 화면도 새 것을 봐야 한다. MCP 쪽 캐시는 스탬프로
    // 스스로 알아채지만(§2.6) `Store` 는 감시가 꺼져 있어 말해 줘야 한다.
    reload: (name) => {
      const v = views.get(name)
      if (!v) return null
      const pr = v.load().catch((e) => log.line(`재스캔 실패 ${name}: ${e?.message || e}`))
      loading.set(name, pr.finally(() => loading.delete(name)))
      return pr
    },
    refresh,
    // 레포를 치운 뒤 — 같은 이름으로 다시 세우면 옛 스캔 · 캐시가 살아나지 않게 전부 잊는다
    forget(name) {
      Promise.resolve(views.get(name)?.stop?.()).catch(() => {})
      views.delete(name)
      caches.delete(name)
      loading.delete(name)
      repos = repos.filter((r) => r.name !== name)
    },
  }
}

// 레포마다 한 줄 설명. README 첫 문단이다(모드 A 와 같다).
async function titleOf(root) {
  const body = await fs.readFile(path.join(root, 'README.md'), 'utf8').catch(() => '')
  const lines = body.split(NL)
  const h = lines.findIndex((l) => l.startsWith('# '))
  if (h < 0) return null
  for (const l of lines.slice(h + 1)) {
    const t = l.trim()
    if (t && !t.startsWith('#')) return t.replace(/[*`]/g, '').slice(0, 80)
  }
  return lines[h].slice(2).trim() || null
}

// ── 인증 (§4.4) ─────────────────────────────────────────────────────────────
//
// `--auth` 가 없으면 통과시킨다(개발용). **그래서 루프백 밖에 바인드하는 것을
// 막는다** — 자물쇠가 없는데 문을 밖으로 내면 그것은 실수가 아니라 사고다.
//
// 명부는 요청마다 다시 읽지 않는다. mtime 이 바뀌었을 때만 다시 읽는다 --
// `serve user set --inactive` 가 **다음 요청부터** 먹어야 하므로 캐시를 오래
// 들고 있을 수 없고, 그렇다고 매 요청 파일을 열 이유도 없다.

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|::1|\[::1\])$/i

function makeAuth({ authFile, log }) {
  // 개발용 — 명부가 없으면 전부 통과시킨다(루프백만). 관리자는 아니다 — 콘솔은 명부가 있어야 뜬다.
  if (!authFile) {
    log.line('경고: --auth 가 없다. 인증 없이 돈다 (개발용). 루프백에서만 허용한다')
    const dev = () => ({ ok: true, user: '(dev)', label: null, role: 'viewer', admin: false, write: false, allow: null, expiresInDays: null })
    const empty = auth.emptyDb()
    return { bearer: async () => dev(), browser: async () => dev(), login: async () => dev(), db: () => empty, reload: async () => {}, file: null }
  }

  let db = auth.emptyDb()
  let sig = null
  const reload = async () => {
    const st = await fs.stat(authFile).catch(() => null)
    const now = st ? st.mtimeMs + ':' + st.size : 'none'
    if (now === sig) return
    try {
      db = await auth.load(authFile)
      sig = now
      log.line(`명부: 사용자 ${db.users.length}명 · 관리자 ${auth.admins(db).length}명 · 토큰 ${db.tokens.length}개`)
    } catch (e) {
      log.line('명부를 읽을 수 없다: ' + (e?.message || e))
    }
  }

  return {
    // MCP — **Bearer 만.** 호스트는 쿠키를 들지 않는다.
    async bearer(headers) {
      await reload()
      const h = String(headers.authorization || headers.Authorization || '')
      const token = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim() || null
      return auth.decide(db, token)
    },
    // 관리 서비스 — 쿠키. 브라우저는 `Authorization` 을 스스로 달 수 없다(§6.4).
    // Bearer 도 받아 준다: curl 로 확인하는 길을 막을 이유가 없다.
    async browser(headers, secret) {
      await reload()
      const h = String(headers.authorization || headers.Authorization || '')
      const token = /^Bearer\s+(.+)$/i.exec(h)?.[1]?.trim() || null
      if (token) return auth.decide(db, token)
      const c = auth.parseCookies(headers.cookie)['cdp_s']
      return auth.decideSession(db, auth.readSession(secret, c))
    },
    // 로그인 — 토큰 원문을 받아 **한 번** 판정하고 쿠키로 바꾼다.
    async login(token) {
      await reload()
      return auth.decide(db, token)
    },
    // 콘솔(`/admin/*` · `/setup`)이 명부를 **고친다.** 같은 객체를 고치고 저장하면 mtime 이
    // 바뀌어 다음 `reload()` 가 다시 읽는다 — 두 벌이 생기지 않는다.
    db: () => db,
    reload,
    file: authFile,
  }
}

// 로그인 화면 (§6.6.1).
//
// **입력이 하나다.** 아이디 칸이 없다 — 토큰이 아이디를 들고 있다(§4.4).
// 사람이 외워 치는 값이 아니라 붙여넣는 값이라 한 칸 · 자동 trim · 마스킹.
//
// **실패 메시지는 하나다.** 만료 · 명부에 없음 · 사용 중지를 화면에서 구분해
// 주면 명부의 내용을 흘리는 것이 된다. 구분은 serve.log 에만 남긴다.
function loginPage({ next = '/', failed = false } = {}) {
  const esc = (x) => String(x).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>CDP</title>
<style>
  :root { color-scheme: light dark; --bg:#fff; --fg:#2C2C2A; --mut:#5F5E5A; --line:#B4B2A9; --acc:#534AB7 }
  @media (prefers-color-scheme: dark) { :root { --bg:#1b1b1a; --fg:#eceae4; --mut:#a8a69f; --line:#484743 } }
  body { margin:0; min-height:100vh; display:grid; place-items:center; background:var(--bg); color:var(--fg);
         font:14px/1.6 'Pretendard','Malgun Gothic',system-ui,sans-serif }
  form { width:min(92vw,360px) }
  h1 { font-size:20px; margin:0 0 4px }
  p.sub { color:var(--mut); margin:0 0 24px }
  label { display:block; font-size:13px; color:var(--mut); margin-bottom:6px }
  .row { display:flex; gap:6px }
  input { flex:1; min-width:0; padding:9px 11px; border:1px solid var(--line); border-radius:7px;
          background:transparent; color:inherit; font:inherit; font-family:ui-monospace,monospace }
  input:focus { outline:2px solid var(--acc); outline-offset:1px; border-color:transparent }
  button { padding:9px 14px; border:1px solid var(--line); border-radius:7px; background:transparent;
           color:inherit; font:inherit; cursor:pointer }
  button.go { width:100%; margin-top:12px; background:var(--acc); border-color:var(--acc); color:#fff }
  .err { color:#b3261e; margin:12px 0 0 }
  .note { color:var(--mut); font-size:12.5px; margin-top:22px; border-top:1px solid var(--line); padding-top:14px }
</style>
<form method="post" action="/login">
  <h1>CDP</h1>
  <p class="sub">지식 레포 관리 서비스</p>
  <input type="hidden" name="next" value="${esc(next)}">
  <label for="t">토큰</label>
  <div class="row">
    <input id="t" name="token" type="password" autocomplete="off" autofocus spellcheck="false">
    <button type="button" onclick="t.type = t.type === 'password' ? 'text' : 'password'">보기</button>
  </div>
  ${failed ? '<p class="err">토큰을 확인하세요.</p>' : ''}
  <button class="go" type="submit">들어가기</button>
  <p class="note">토큰은 관리자에게 받는다. 분실하면 재발급 — 재사용할 수 없다.</p>
</form>`
}

// 서버가 아는 첫 조각 — 이 밖의 GET 이 브라우저에서 오면 화면의 「없는 주소입니다」 다(아래 onRequest).
const KNOWN_PREFIX = /^\/(api|admin|site|mcp|kit|workrepos|repos|packages|me|healthz|r|console|login|logout|setup|manual|assets)(\/|$)/

function cookieStr(name, value, { maxAge = 12 * 3600, secure = false } = {}) {
  const parts = [`${name}=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  // 평문 HTTP 배치에서는 Secure 를 붙이면 쿠키가 아예 안 간다(§9.4).
  if (secure) parts.push('Secure')
  return parts.join('; ')
}
function setCookie(res, value, opts = {}) {
  res.setHeader('set-cookie', cookieStr('cdp_s', value, opts))
}
// 재인증 쿠키 — 15분 · `kind: sudo`(검토 §4.3 · D5). 세션 쿠키와 이름도 서명도 다르다.
function setSudoCookie(res, value, opts = {}) {
  res.setHeader('set-cookie', cookieStr('cdp_su', value, { ...opts, maxAge: auth.SUDO_MINUTES * 60 }))
}
// 마법사 직후 — 세션과 재인증 쿠키를 **한 응답에** 둘 다(화면 UX 검토 v0.1 §5.7 · D5 의 15분 안). 방금 원문을
// 눈으로 본 사람이 첫 쓰기에서 같은 원문을 또 넣지 않게. setHeader 는 덮어쓰므로 배열 하나로 낸다.
function setSessionAndSudo(res, { session, sudo }, { secure = false } = {}) {
  res.setHeader('set-cookie', [cookieStr('cdp_s', session, { secure }), cookieStr('cdp_su', sudo, { secure, maxAge: auth.SUDO_MINUTES * 60 })])
}
function clearCookies(res, { secure = false } = {}) {
  res.setHeader('set-cookie', [cookieStr('cdp_s', '', { maxAge: 0, secure }), cookieStr('cdp_su', '', { maxAge: 0, secure })])
}

// ── HTTP ────────────────────────────────────────────────────────────────────

const MAX_BODY = 2 * 1024 * 1024

// **413 을 돌려주는 것이 생각보다 까다롭다.**
//
// ① 상한을 넘는 순간 `req.destroy()` 를 하면 소켓이 먼저 닫혀 클라이언트에는
//    413 이 아니라 "other side closed" 가 보인다 — 거절한 것인지 죽은 것인지
//    부르는 쪽이 구별할 수 없다.
// ② 큰 몸통을 보내는 클라이언트는 `Expect: 100-continue` 를 먼저 보낸다.
//    그러면 Node 는 `request` 가 아니라 `checkContinue` 를 낸다 — 아래에서
//    따로 받는다. 안 받으면 100 을 보낸 뒤 2MB 를 다 받고 나서야 거절한다.
//
// 둘 다 실측으로 잡았다. 답은 같다 — **content-length 로 한 바이트도 받기 전에
// 끊는다.** 헤더가 없을 때만 흘려보내며 센다.
function overLimit(req, limit) {
  return Number(req.headers['content-length'] || 0) > limit
}

function readBody(req, limit) {
  return new Promise((resolve, reject) => {
    const chunks = []
    let n = 0
    let over = false
    req.on('data', (c) => {
      n += c.length
      if (n > limit) {
        over = true
        chunks.length = 0
        return
      }
      chunks.push(c)
    })
    req.on('end', () => resolve(over ? { tooLarge: true } : Buffer.concat(chunks)))
    req.on('error', reject)
  })
}

// JSON-RPC 몸통에서 **로그에 적을 것만** 꺼낸다. 인자는 보지 않는다 --
// `search` 의 말과 `section` 의 본문이 로그로 새는 자리가 여기다(§2.8).
function peek(buf) {
  try {
    const m = JSON.parse(buf.toString('utf8'))
    const one = Array.isArray(m) ? m[0] : m
    const tool = one?.method === 'tools/call' ? one?.params?.name : null
    const a = one?.params?.arguments || {}
    // `save` 의 열쇠는 `work.id` 다 — 전에는 `-` 로 남아 누가 무엇을 기록했는지 로그가 몰랐다(동시 기록 검토 v0.1 B9)
    const key = tool === 'search' ? `words:${(a.words || []).length}` : a.coord || a.id || a.work?.id || null
    return { method: one?.method || null, tool, key }
  } catch {
    return { method: null, tool: null, key: null }
  }
}

// 미러 집계 — `/healthz` · `/site/info` · `/admin/overview` 가 같은 통을 쓴다. 옛 세 칸(ok · lag · off)은
// 그대로이고 `diverged` · `behind` 가 더해졌다(동시 기록 검토 v0.1 D4). 갈라진 것은 밀린 것이기도 하다(`lag` 에도 센다).
async function mirrorCounts(list) {
  const c = { ok: 0, lag: 0, off: 0, diverged: 0, behind: 0 }
  for (const r of list) {
    const m = await mirror.summary(r.root)
    if (m.state === 'off') c.off++
    else if (m.state === 'lag') c.lag++
    else if (m.state === 'diverged') {
      c.lag++
      c.diverged++
    } else if (m.state === 'behind') {
      c.ok++
      c.behind++
    } else c.ok++
  }
  return c
}

// `save` 의 흐름 — `serve.log` 의 `save` 줄만 읽는다(누가 · 언제 · 어느 레포 · 어느 id · 결과 · 걸린 시간).
// 본문 · 검색어는 원래 로그에 없다(§2.8). 새 로그 파일을 만들지 않는다(동시 기록 검토 v0.1 D10).
async function saveStats(dataDir, { now = Date.now(), recent = 10 } = {}) {
  const out = { recent: [], rejected24h: {}, total24h: 0 }
  if (!dataDir) return out
  const rows = []
  for (const name of ['serve.log.1', 'serve.log']) {
    const body = await fs.readFile(path.join(dataDir, 'logs', name), 'utf8').catch(() => null)
    if (!body) continue
    for (const line of body.split(NL)) {
      const f = line.split(' · ')
      if (f.length < 8 || !f[0].startsWith('20') || f[4].trim() !== 'save') continue
      const code = f[7].trim()
      rows.push({ at: f[0].trim(), user: f[1].trim(), repo: f[2].trim(), id: f[5].trim() === '-' ? null : f[5].trim(), result: code === '200' ? 'ok' : code, ms: Number(String(f[6]).replace('ms', '')) || null })
    }
  }
  out.recent = rows.slice(-recent).reverse()
  const since = now - 24 * 3600 * 1000
  for (const r of rows) {
    const t = new Date(r.at).getTime()
    if (!(t >= since)) continue
    out.total24h++
    if (r.result !== 'ok') out.rejected24h[r.result] = (out.rejected24h[r.result] || 0) + 1
  }
  return out
}

const json = (res, status, obj) => {
  const b = Buffer.from(JSON.stringify(obj), 'utf8')
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': b.length })
  res.end(b)
}

export async function runServe(opt = {}) {
  const root = path.resolve(opt.root || '.')
  const bind = opt.bind || '127.0.0.1'
  const port = Number(opt.port) || 7374
  const dataDir = opt.data ? path.resolve(opt.data) : null
  const log = makeLog(dataDir)

  if (!LOOPBACK.test(bind) && !opt.auth) {
    log.line(`거부: --bind ${bind} 는 루프백이 아닌데 --auth 가 없다. 인증 없이 밖으로 열 수 없다`)
    return 2
  }
  if (!LOOPBACK.test(bind)) {
    log.line(`경고: --bind ${bind} — 밖에서 닿는다. 프록시가 없으면 TLS·레이트리밋도 없다(§9.4)`)
    // `0.0.0.0` 은 **모든 인터페이스**다. 프록시가 없는 배치에서 바인드는 유일한
    // 경계이므로, 인터페이스 하나로 좁히라고 따로 말한다.
    if (bind === '0.0.0.0' || bind === '::') {
      log.line('경고: 모든 인터페이스에 열렸다 — 프록시가 없다면 --bind 를 그 IP 하나로 좁힌다')
    }
  }

  // 화면 파일. 없으면 안내만 낸다 — 서버는 화면 없이도 돈다(MCP 는 별개다).
  const webDir = opt.web ? path.resolve(opt.web) : path.resolve(hereDir(import.meta.url), '../../ops/out/web')

  const store = makeStore(root, log)
  await store.refresh()
  // 패키지 — 콘솔의 `POST /admin/repos` 가 여기서 복사한다(검토 §3.5 · 화면 · 권한 검토 v0.1 R1). 없어도 서버는 돈다.
  const pk = await resolvePackages({ explicit: opt.packages, binDir: hereDir(import.meta.url) })
  log.line(pk ? `패키지: ${pk.dir} (${pk.how})` : '패키지: 없음 — 화면에서 레포를 세우려면 --packages')
  // 에이전트 세팅의 원본(도구 층) — 처음 쓸 때 한 번 만든다. 완성 폴더면 그 자리이고, 소스로 돌 때만 조립한다(에이전트 세팅 갱신 TODO T3 · T8)
  const kitFrom = async () => (pk ? (await sharedKitSource(pk)).from : null)
  // 레포 하나의 에이전트 세팅 — 쓰지 않고 본다(dry). 콘솔의 한 줄 · 진단이 쓴다
  const kitState = async (root) => {
    try {
      const from = await kitFrom()
      if (!from) return { state: 'unknown', reason: 'no-packages', changes: [], line: '패키지 폴더가 없어 견줄 수 없다' }
      const r = await refreshToolLayer(root, from, { dry: true })
      return { state: r.state, reason: r.reason, changes: r.changes.map((c) => ({ path: c.path, op: c.op })), line: kitLine(r) }
    } catch (e) {
      return { state: 'unknown', reason: 'error', changes: [], line: e.message }
    }
  }
  const authenticate = makeAuth({ authFile: opt.auth, log })
  // 서명 비밀. 갈면 전원 재로그인이다(§6.4).
  const secret = dataDir ? await auth.loadSecret(dataDir) : Buffer.from('dev-only-secret-not-persisted!!')
  if (!dataDir) log.line('경고: --data 가 없어 세션 비밀이 프로세스마다 바뀐다 (개발용)')
  const secureCookie = String(opt.server || '').startsWith('https://')

  // ── 제품 관리 서비스(검토 §4.1) — 사이트 · 콘솔이 같은 프로세스에 얹힌다 ──────────
  const VERSION = appVersion(hereDir(import.meta.url)) || null
  const startedAt = Date.now()
  // 소개 · 설명서 — 기본 공개(D2). `--private-pages` 면 세션을 요구한다.
  const privatePages = !!opt.privatePages
  // 관리 API 대역 — 소켓 주소로 판정한다. X-Forwarded-For 는 보지 않는다(core/net.js).
  let adminFrom = []
  try {
    adminFrom = parseCidrs(opt.adminFrom)
  } catch (e) {
    log.line('거부: --admin-from — ' + e.message)
    return 2
  }
  if (adminFrom.length) log.line(`관리 API 대역: ${adminFrom.map((c) => c.text).join(' · ')} (소켓 주소 기준)`)
  // 자격을 받는 POST 셋(/login · /setup · /admin/sudo) — IP 당 분당 20.
  const limiter = makeLimiter({ limit: 20, windowMs: 60_000 })
  // 설명서 — 산출물의 manual/. 없어도 서버는 돈다(설명서 페이지만 빈다).
  const man = await resolveManualDir({ explicit: opt.manual, binDir: hereDir(import.meta.url) })
  const manualDir = man?.dir || null
  log.line(man ? `설명서: ${man.dir} · ${man.books.length}권` : '설명서: 없음 — 산출물의 manual/ 을 두거나 --manual')
  const manuals = await manualIndex(manualDir)
  const webOk = await fs.access(path.join(webDir, 'index.html')).then(() => true).catch(() => false)
  // 첫 관리자 — 명부가 비어 있으면 일회용 코드를 만들고 한 줄 남긴다(D3). 코드를 읽으려면
  // 서버의 파일이나 로그를 볼 수 있어야 한다 — 그것이 "부트스트랩은 셸을 가진 사람" 이다.
  if (opt.auth && dataDir) {
    await authenticate.reload()
    const code = await auth.ensureBootstrap(dataDir, authenticate.db())
    if (code) log.line(`첫 관리자가 없다 — 브라우저 http://${bind}:${port}/setup 에 이 코드를 넣는다: ${code}  (${path.join(dataDir, 'bootstrap.code')})`)
  }
  // `/admin/doctor` 캐시 — 레포마다 ls-remote · push --dry-run 을 치는 검사라 60초는 같은 답을 낸다.
  let doctorCache = { at: 0, res: null, pending: null }
  const runDoctorCached = async (fresh = false) => {
    if (!fresh && doctorCache.res && Date.now() - doctorCache.at < 60_000) return { at: doctorCache.at, ...doctorCache.res }
    if (!doctorCache.pending) {
      doctorCache.pending = doctorRows({ root, auth: opt.auth, data: dataDir, web: opt.web ? webDir : null, manual: manualDir, packages: pk?.dir || null, bind, port, inProcess: true })
        .then((r) => {
          doctorCache = { at: Date.now(), res: r, pending: null }
          return r
        })
        .catch((e) => {
          doctorCache.pending = null
          throw e
        })
    }
    const r = await doctorCache.pending
    return { at: doctorCache.at, ...r }
  }

  // 지식 레포를 둔다 — 콘솔 `POST /admin/repos`(admin · 재인증 · grant) 와 CLI `ctx repo new` 가 **같은 것**을 부른다.
  // 레포 화면의 `POST /repos`(writer) 는 없앴다 — 세우는 것은 admin 한 곳(화면 · 권한 검토 v0.1 R1 · Q3).
  // 등록 = 폴더를 두는 것(§4.2). 길이 둘 — 패키지에서 세우기 · origin 에서 clone(검토 D9).
  // 판정은 `core/reponew.js` 하나 — CLI `ctx repo new` 와 같은 함수다.
  // 서버의 SSH 배포 키가 있으면 그 한 줄 — ssh 원격을 쓰는 연결 · clone · 세우기가 레포 로컬 설정으로 건다(git 자격 TODO G2)
  const sshCmd = async () => (dataDir && (await gitauth.keyInfo(dataDir).catch(() => null))?.exists ? gitauth.sshCommand(dataDir) : null)
  const buildRepo = async ({ name, pkgName = '', origin = null, clone = null, actor }) => {
    if (!REPO_NAME_RE.test(name)) return { status: 400, body: { error: { code: 'E_INPUT', message: '레포 이름 형식이 아니다 (영문·숫자·._-)' } } }
    if ((await store.list()).some((r) => r.name === name) || (await fs.stat(path.join(root, name)).catch(() => null))) {
      return { status: 409, body: { error: { code: 'E_EXISTS', message: '그 이름의 레포가 이미 있다', detail: { name } } } }
    }
    if (clone) {
      try {
        const r = await cloneRepo({ url: clone, dest: path.join(root, name), sshCommand: await sshCmd() })
        await store.refresh()
        await auth.audit(dataDir, `admin repo clone · ${actor} · ${name} · origin=${clone}`)
        return { status: 200, body: { name, commit: r.commit, origin: clone, cloned: true } }
      } catch (e) {
        const code = e?.code || 'E_GIT'
        return { status: code === 'E_EXISTS' ? 409 : 400, body: { error: { code, message: e.message, detail: e.detail } } }
      }
    }
    if (!pk) return { status: 400, body: { error: { code: 'E_INPUT', message: '서버에 패키지 폴더가 없다 — --packages' } } }
    if (!pkgName) return { status: 400, body: { error: { code: 'E_INPUT', message: 'package 가 필요하다' } } }
    let mat
    try {
      mat = await materializePackage(pk, pkgName)
    } catch (e) {
      // 패키지가 여럿이면 이름을 알아야 고른다 — 없는 이름을 줬을 때 있는 것을 같이 낸다
      const names = e.code === 'E_NOT_FOUND' ? (await listPackageDirs(pk.dir).catch(() => [])).map((p) => p.name) : []
      return {
        status: e.code === 'E_NOT_FOUND' ? 404 : 400,
        body: { error: { code: e.code || 'E_INPUT', message: e.message + (names.length ? ' — 있는 패키지: ' + names.join(' · ') : ''), detail: names.length ? { packages: names } : undefined } },
      }
    }
    try {
      const r = await newRepo({ from: mat.from, dest: path.join(root, name), origin, push: !!origin, author: actor, sshCommand: await sshCmd() })
      await store.refresh()
      await auth.audit(dataDir, `admin repo new · ${actor} · ${name} · package=${pkgName}${origin ? ' · origin=' + origin : ''}${r.pushed ? ' · pushed' : ''}`)
      return { status: 200, body: { name, package: pkgName, commit: r.commit, files: r.files, origin: r.origin, pushed: !!r.pushed, pushError: r.pushError || null } }
    } catch (e) {
      const code = e?.code || 'E_REPO'
      return { status: code === 'E_EXISTS' ? 409 : 400, body: { error: { code, message: e.message, detail: e.detail } } }
    } finally {
      await mat.cleanup()
    }
  }

  // 요청마다 서버를 새로 만든다(stateless). 레포 캐시는 store 가 들고 있으므로
  // 여기서 만드는 것은 **등록표뿐**이다 -- 레포를 다시 읽지 않는다.
  const handler = createMcpHandler(
    (ctx) => {
      const url = new URL(ctx.requestInfo?.url || 'http://x/mcp')
      const m = /^\/mcp(?:\/([^/]+))?\/?$/.exec(url.pathname)
      const fixed = m?.[1] ? decodeURIComponent(m[1]) : null
      const { auth: a, repos } = CTX.getStore() || { auth: { allow: null }, repos: [] }
      // 만료 7일 전부터 `brief` 가 한 줄을 더 낸다(§4.4.2). 만료된 뒤에 아는
      // 것은 늦다 — 그때는 이미 붙어 있던 것이 끊긴 뒤다.
      const notice =
        a.expiresInDays != null && a.expiresInDays <= 7
          ? `[CDP] 토큰이 ${a.expiresInDays}일 뒤 만료된다 — 관리자에게 재발급을 요청한다`
          : null
      return buildServer({
        repos,
        // `/mcp/<name>` 이면 그 레포가 기본이다. `/mcp` 면 권한 안의 레포가
        // 하나일 때만 정해진다 — 임의로 고르지 않는다(§2.9).
        fallback: fixed || (repos.length === 1 ? repos[0].name : null),
        mode: 'server',
        prompts: opt.prompts || 'auto',
        allow: a.allow,
        notice,
        // `save` 는 토큰의 사용자로 author 를 채운다. 클라이언트가 보내면
        // 거절한다 — 보낼 수 있으면 남의 이름으로 기록이 남는다(§4.5).
        saver: async (name, input) => {
          const r = repos.find((x) => x.name === name)
          // 결과를 요청 맥락에 남긴다 — MCP 의 도구 오류는 HTTP 200 이라 로그 줄이 결과를 몰랐고,
          // `ms` 는 핸들러가 스트림을 연 시각이라 도구 시간이 아니었다(동시 기록 검토 v0.1 B9).
          const t0 = Date.now()
          const ctxStore = CTX.getStore()
          try {
            const out = await doSave(r.root, input, {
              user: a.user,
              write: a.write,
              mirror: !!opt.mirror,
              log: (m) => log.line(m),
            })
            store.reload(name) // 화면이 방금 커밋한 것을 봐야 한다
            if (ctxStore) ctxStore.outcome = { code: null, ms: Date.now() - t0, key: input?.work?.id ?? null }
            return out
          } catch (e) {
            if (ctxStore) ctxStore.outcome = { code: e?.code || 'E_REPO', ms: Date.now() - t0, key: input?.work?.id ?? null }
            throw e
          }
        },
      })
    },
    { legacy: 'stateless', onerror: (e) => log.line('handler: ' + (e?.message || e)) }
  )

  const onRequest = async (req, res) => {
    const t0 = Date.now()
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '-'

    // **Origin 이 있으면 브라우저가 부른 것이다.** MCP 호스트는 Origin 을 보내지
    // 않는다. 외부 페이지의 fetch 가 이 서버를 찌르는 길을 여기서 끊는다.
    //
    // 통과 조건은 **같은 출처**다 -- 처음에는 루프백만 봤는데, 그것은 모드 A 만
    // 생각한 규칙이었다. 모드 B 는 `10.10.20.188:7374` 로 뜨므로 자기 화면이
    // 자기 서버를 부르는 것까지 403 이 났다(실측). 루프백은 모드 A 를 위해
    // 남기고, 프록시 뒤라면 `--public-url` 의 출처도 자기 것이다.
    //
    // 공격 페이지는 Origin 을 못 고친다. evil.com 에서 부르면 Origin 은
    // evil.com 이고 Host 는 이 서버라 둘이 어긋난다 -- 그래서 이 비교로 족하다.
    const origin = req.headers.origin
    if (origin) {
      let host = ''
      let hostPort = ''
      try {
        const u = new URL(origin)
        host = u.hostname
        hostPort = u.host
      } catch {}
      const self = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
      let allowed = hostPort !== '' && hostPort === self
      if (!allowed && LOOPBACK.test(host)) allowed = true
      if (!allowed && opt.publicUrl) {
        try {
          allowed = new URL(String(opt.publicUrl)).host === hostPort
        } catch {}
      }
      if (!allowed) {
        log.req({ ip, method: req.method, key: url.pathname, ms: Date.now() - t0, status: 403, code: 'E_ORIGIN' })
        return json(res, 403, { error: { code: 'E_FORBIDDEN', message: 'Origin 이 허용되지 않는다' } })
      }
    }

    try {
      // /healthz — **인증 없는 유일한 자리다. 그래서 집계까지만 싣는다.**
      // 레포 이름도 노출이다(§4.3) — 권한 밖 레포의 존재를 알리지 않는다는
      // §4.6 을 앞문으로 깨지 않게.
      if (url.pathname === '/healthz' && req.method === 'GET') {
        const list = await store.list()
        return json(res, 200, { ok: true, built: BUILT, repos: list.length, mirror: await mirrorCounts(list) })
      }

      // /install.mjs — 한 줄 설치의 설치기(설치 한 줄 TODO I1). **인증 앞이다** — 담긴 것은 코드(병합 규칙)와
      // 이 서버의 주소 한 줄뿐이다. 레포 이름 · 사람 · kit 은 없다(`/healthz` 와 같은 규칙). kit 은 설치기가
      // 사람이 붙여넣은 **토큰으로** `/kit/<레포>?…&as=json` 에서 받는다(I2) — 판정은 zip 과 같은 자리다.
      if (url.pathname === '/install.mjs' && (req.method === 'GET' || req.method === 'HEAD')) {
        const head = 'globalThis.__CDP_KIT__ = ' + JSON.stringify({ server: publicOrigin(req, opt) }) + NL
        // 번들이 아니면(소스로 도는 개발 · 하네스) 이 PC 의 설치기를 부르는 두 줄(I8) — 같은 PC 에서만 돈다
        const body = HAS_INSTALLER ? head + INSTALLER_SRC : head + `await import(${JSON.stringify(new URL('./cdp-install.mjs', import.meta.url).href)})` + NL
        log.req({ ip, method: req.method, tool: '/install.mjs', ms: Date.now() - t0, status: 200 })
        res.writeHead(200, { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' })
        return res.end(req.method === 'HEAD' ? undefined : body)
      }

      // 화면 자산 — **인증 앞에서 낸다.**
      //
      // 로그인 화면을 그리려면 그 전에 받아야 하고, 담긴 것은 빌드 산출물뿐이라
      // 숨길 것이 없다. 인증 뒤에 두면 401 이 나서 화면이 아예 안 뜬다 —
      // 실측으로 잡았다(두 번 — 2026-09-22 · 사이트 라우트를 넣으며 한 번 더).
      if (/^\/(assets\/|favicon|[^/]+\.(?:js|css|svg|png|ico|woff2?)$)/.test(url.pathname)) {
        return serveWeb({ req, res, url, webDir, log })
      }
      // HEAD 는 GET 과 같이 본다 — 브라우저 · 감시가 페이지를 HEAD 로 찔러 본다
      const isGet = req.method === 'GET' || req.method === 'HEAD'

      // ── 사이트(검토 §4.2) — 소개 · 설명서 · 로그인 · 마법사는 인증 **앞**에 온다.
      //
      // 토큰을 받기 전의 사용자가 읽는 페이지다(D2). `--private-pages` 면 세션을 요구한다.
      // 어느 경우에도 레포 **이름**과 사람 이름은 여기서 나가지 않는다 — `/healthz` 와 같은 규칙.
      const pageAuth = () => authenticate.browser(req.headers, secret)
      const toLogin = () => {
        res.writeHead(302, { location: '/login?next=' + encodeURIComponent(url.pathname + url.search) })
        return res.end()
      }

      if (url.pathname === '/site/info' && req.method === 'GET') {
        const list = await store.list()
        const who = await pageAuth()
        const db = authenticate.db()
        return json(res, 200, {
          version: VERSION,
          built: BUILT,
          repos: list.length,
          mirror: await mirrorCounts(list),
          setupNeeded: !!opt.auth && !!dataDir && db.users.length === 0,
          privatePages,
          manuals: manuals.list(),
          user: who.ok ? who.user : null,
          role: who.ok ? who.role : null,
          admin: who.ok ? !!who.admin : false,
        })
      }
      // 설명서 원문 — `manual/` 의 책 · 설치절차 · 그림만. 목록 밖은 **없는 것**이다(경로 순회가 여기서 끝난다).
      if (url.pathname.startsWith('/site/manual/') && req.method === 'GET') {
        if (privatePages) {
          const who = await pageAuth()
          if (!who.ok) return json(res, 401, { error: { code: 'E_AUTH', message: '로그인이 필요하다' } })
        }
        let rel = ''
        try {
          rel = decodeURIComponent(url.pathname.slice('/site/manual/'.length))
        } catch {}
        const file = manuals.resolve(rel)
        const buf = file ? await fs.readFile(file).catch(() => null) : null
        if (!buf) {
          log.req({ ip, method: 'GET', tool: '/site/manual', key: rel.slice(0, 60), ms: Date.now() - t0, status: 404 })
          return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '그런 설명서가 없다' } })
        }
        res.writeHead(200, {
          'content-type': MIME[path.extname(file).toLowerCase()] || 'text/plain; charset=utf-8',
          'x-content-type-options': 'nosniff',
          'cache-control': 'no-store',
        })
        return res.end(buf)
      }

      // 페이지 — 전부 같은 `index.html` 이다. 라우팅은 화면이 한다(D12).
      const isPublicPage = url.pathname === '/' || url.pathname === '/manual' || url.pathname.startsWith('/manual/') || url.pathname === '/setup'
      if (isPublicPage && isGet) {
        if (privatePages && url.pathname !== '/setup') {
          const who = await pageAuth()
          if (!who.ok) return toLogin()
        }
        return serveWeb({ req, res, url, webDir, log })
      }
      // 콘솔 — 세션이 있어야 화면을 낸다. admin 인지는 화면과 API 가 본다(D4 — 403).
      if ((url.pathname === '/console' || url.pathname.startsWith('/console/')) && isGet) {
        const who = await pageAuth()
        if (!who.ok) return toLogin()
        return serveWeb({ req, res, url, webDir, log })
      }

      // ── 설치 마법사 — 첫 관리자(검토 §4.6 · D3). 명부가 비어 있을 때만, 부트스트랩 코드로.
      if (url.pathname === '/setup' && req.method === 'POST') {
        if (!opt.auth || !dataDir) return json(res, 400, { error: { code: 'E_INPUT', message: '--auth 와 --data 가 있어야 첫 관리자를 만들 수 있다' } })
        const lim = limiter.hit(req.socket.remoteAddress)
        if (!lim.ok) {
          log.req({ ip, method: 'POST', tool: '/setup', ms: Date.now() - t0, status: 429, code: 'E_RATE' })
          return json(res, 429, { error: { code: 'E_RATE', message: '시도가 너무 잦다 — 잠시 뒤에 다시' } })
        }
        let body
        try {
          body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
        } catch {
          return json(res, 400, { error: { code: 'E_INPUT', message: '본문이 JSON 이 아니다' } })
        }
        await authenticate.reload()
        const db = authenticate.db()
        if (db.users.length) return json(res, 409, { error: { code: 'E_EXISTS', message: '이미 설정된 서버다 — 로그인한다' } })
        if (!(await auth.verifyBootstrap(dataDir, body.code))) {
          log.req({ ip, method: 'POST', tool: '/setup', ms: Date.now() - t0, status: 401, code: 'E_AUTH' })
          return json(res, 401, { error: { code: 'E_AUTH', message: '코드를 확인하세요' } })
        }
        const name = String(body.name || '').trim()
        const label = body.label ? String(body.label).trim().slice(0, 80) : null
        try {
          const u = auth.userAdd(db, { name, label, repos: ['*'], role: 'admin' })
          const { raw, rec } = auth.issue(db, { user: u.name, note: '첫 토큰 (setup)' })
          await auth.store(authenticate.file, db)
          await auth.clearBootstrap(dataDir)
          await auth.audit(dataDir, `setup · user add · ${u.name} · repos=* · role=admin · ip=${ip}`)
          await auth.audit(dataDir, `setup · token issue · ${u.name} · ${rec.id} · expires=${rec.expires}`)
          log.req({ ip, user: u.name, method: 'POST', tool: '/setup', ms: Date.now() - t0, status: 200 })
          // 브라우저는 이 자리에서 로그인된다 — 원문을 한 번 더 넣게 하지 않는다. 재인증(15분)도 같이 —
          // 첫 레포를 세우는 첫 쓰기에서 방금 본 토큰을 다시 묻지 않는다(화면 UX 검토 v0.1 P18).
          setSessionAndSudo(res, { session: auth.signSession(secret, u.name, { tid: rec.sha256.slice(0, 8) }), sudo: auth.signSession(secret, u.name, { minutes: auth.SUDO_MINUTES, kind: 'sudo' }) }, { secure: secureCookie })
          return json(res, 200, { user: u.name, raw, id: rec.id, expires: rec.expires })
        } catch (e) {
          return json(res, 400, { error: { code: e?.code || 'E_INPUT', message: e.message, detail: e.detail } })
        }
      }

      // ── 로그인 (§6.6.1) — form 과 JSON 둘. 화면(SPA)이 JSON 으로 부르고 옛 HTML 은 form 으로.
      if (url.pathname === '/login') {
        if (req.method === 'GET') {
          if (webOk) return serveWeb({ req, res, url, webDir, log })
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          return res.end(loginPage({ next: safeNext(url.searchParams.get('next'), '/r') }))
        }
        if (req.method === 'POST') {
          const isJson = String(req.headers['content-type'] || '').includes('application/json')
          const raw = (await readBody(req, 64 * 1024)) || Buffer.alloc(0)
          let token = ''
          let next = '/r'
          if (isJson) {
            try {
              const j = JSON.parse(raw.toString('utf8') || '{}')
              token = String(j.token || '').trim()
              next = safeNext(j.next, '/r')
            } catch {
              return json(res, 400, { error: { code: 'E_INPUT', message: '본문이 JSON 이 아니다' } })
            }
          } else {
            const form = new URLSearchParams(raw.toString('utf8'))
            token = (form.get('token') || '').trim()
            next = safeNext(form.get('next'), '/r')
          }
          // 속도 — 실패를 판정하기 전에 막는다. 사람에게는 넉넉하고 사전 대입에는 모자란다.
          const lim = limiter.hit(req.socket.remoteAddress)
          if (!lim.ok) {
            log.req({ ip, method: 'POST', tool: '/login', ms: Date.now() - t0, status: 429, code: 'E_RATE' })
            if (isJson) return json(res, 429, { error: { code: 'E_RATE', message: '시도가 너무 잦다 — 잠시 뒤에 다시' } })
            res.writeHead(429, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            return res.end(loginPage({ next, failed: true }))
          }
          const d = await authenticate.login(token)
          log.req({ ip, method: 'POST', tool: '/login', key: d.ok ? d.user : '-', ms: Date.now() - t0, status: d.ok ? (isJson ? 200 : 302) : 401, code: d.ok ? null : d.message, tid: d.tokenId })
          if (!d.ok) {
            // **실패 메시지는 하나다** — 만료 · 명부에 없음 · 폐기를 가르면 명부를 흘린다. 구분은 로그에만.
            if (isJson) return json(res, 401, { error: { code: 'E_AUTH', message: '토큰을 확인하세요' } })
            res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            return res.end(loginPage({ next, failed: true }))
          }
          setCookie(res, auth.signSession(secret, d.user, { tid: d.tokenId }), { secure: secureCookie })
          next = landingOf(next, d.role)
          if (isJson) return json(res, 200, { ok: true, user: d.user, role: d.role, next })
          res.writeHead(302, { location: next })
          return res.end()
        }
      }
      if (url.pathname === '/logout') {
        clearCookies(res, { secure: secureCookie })
        // 화면(SPA)은 POST 로 부르고 JSON 을 받아 pushState 안에서 소개로 간다 — 서버 왕복이 필요한 유일한 전환이
        // 문서 교체를 만들지 않게(화면 · 권한 검토 v0.1 R7 · Q6). GET 302 는 옛 링크 · 주소창의 것으로 남긴다.
        if (req.method === 'POST') return json(res, 200, { ok: true })
        res.writeHead(302, { location: '/' })
        return res.end()
      }

      // ── 없는 주소 — 사람이 주소창에 친 것이면 화면의 「없는 주소입니다」 를 낸다(화면 UX 검토 v0.1 P6).
      //
      // 전에는 여기까지 온 미지 경로가 Bearer 인증으로 흘러 `401 토큰이 없다` JSON 이 됐다 — 로그인한 사람에게도.
      // `Accept: text/html` 을 보내는 것은 브라우저의 주소창뿐이라 API · MCP · 에이전트는 그대로 JSON 을 받는다.
      // 아는 접두(라우트가 뒤에 있는 것 포함)는 건드리지 않는다.
      if (isGet && !KNOWN_PREFIX.test(url.pathname) && String(req.headers.accept || '').includes('text/html')) {
        log.req({ ip, method: req.method, key: url.pathname, ms: Date.now() - t0, status: 404, code: 'E_NOT_FOUND' })
        return serveWeb({ req, res, url, webDir, log, status: 404 })
      }

      // 브라우저 경로(`/api` · `/r` · `/admin` …)는 쿠키를, 나머지는 Bearer 를 본다(§6.4).
      //
      // **`/kit` 도 여기 있다.** 화면의 내려받기는 `<a href download>` 라
      // `Authorization` 을 달 수 없고 쿠키만 간다 -- Bearer 전용으로 두면
      // 401 JSON 이 내려와 브라우저가 그것을 `<이름>.json` 으로 저장한다(실측).
      // `browser()` 는 Bearer 도 받아 주므로 `ctx setup` 쪽은 그대로다.
      const isBrowserPath =
        url.pathname.startsWith('/api/') ||
        url.pathname === '/r' ||
        url.pathname.startsWith('/r/') ||
        url.pathname.startsWith('/kit/') ||
        url.pathname.startsWith('/admin/') ||
        url.pathname === '/me' ||
        url.pathname === '/repos' ||
        url.pathname === '/packages' ||
        url.pathname.startsWith('/workrepos')

      const a = isBrowserPath
        ? await authenticate.browser(req.headers, secret)
        : await authenticate.bearer(req.headers)
      if (!a.ok) {
        log.req({ ip, method: req.method, key: url.pathname, ms: Date.now() - t0, status: a.status, code: a.code, tool: a.message })
        // 화면 경로면 로그인으로 보낸다. **보던 곳을 들고 간다**(§6.6.1) —
        // 돌아왔을 때 처음부터 다시 찾게 하지 않는다.
        if (req.method === 'GET' && (url.pathname === '/r' || url.pathname.startsWith('/r/'))) return toLogin()
        return json(res, a.status, { error: { code: a.code, message: a.message } })
      }

      // GET /me — 화면 껍데기가 한 번에 필요한 것. 누구인가 · 무엇을 볼 수
      // 있는가 · 역할 · 재인증이 살아 있나. **모드는 묻지 않는다** — 화면이 `/r/` 로 서빙됐으면 서버 모드다.
      if (url.pathname === '/me' && req.method === 'GET') {
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const rows = []
        for (const r of mine) rows.push({ name: r.name, title: await titleOf(r.root) })
        const su = auth.readSession(secret, auth.parseCookies(req.headers.cookie)['cdp_su'], Date.now(), { kind: 'sudo' })
        log.req({ ip, user: a.user, method: 'GET', tool: '/me', ms: Date.now() - t0, status: 200, tid: a.tokenId })
        return json(res, 200, {
          mode: 'server',
          user: a.user,
          label: a.label ?? null,
          role: a.role,
          admin: !!a.admin,
          write: !!a.write,
          sudo: !!(su && su.user === a.user),
          expiresInDays: a.expiresInDays ?? null,
          // 'never' · 'YYYY-MM-DD' · null(모름) — 화면이 「무기한」 과 「모름」 을 가른다(관리 › 정보 · R3)
          tokenExpires: a.tokenExpires ?? null,
          version: VERSION,
          repos: rows,
        })
      }

      // ── 콘솔 API `/admin/*` (검토 §4.2 · §4.3) ──────────────────────────────────
      //
      // 판정 순서 — 세션(위에서 401) → admin(403 · D4) → 대역(403) → 쓰기면 재인증(401 E_REAUTH · D5).
      // 모든 쓰기가 `auth.log` 에 `admin <행위> · <행위자> · <대상> · <바뀐 값>` 으로 남는다 —
      // CLI 와 같은 파일, 같은 모양. 토큰은 앞 8자만.
      if (url.pathname === '/admin' || url.pathname.startsWith('/admin/')) {
        const sub = url.pathname.slice('/admin'.length) || '/'
        const denied = (status, code, message) => {
          log.req({ ip, user: a.user, method: req.method, tool: '/admin', key: sub, ms: Date.now() - t0, status, code, tid: a.tokenId })
          return json(res, status, { error: { code, message } })
        }
        if (!a.admin) return denied(403, 'E_FORBIDDEN', '관리자만 들어갈 수 있다 — 콘솔은 admin 의 것이다')
        if (adminFrom.length && !ipInCidrs(req.socket.remoteAddress, adminFrom)) return denied(403, 'E_FORBIDDEN', '관리 API 는 허용된 대역에서만 열린다')
        if (!authenticate.file || !dataDir) return denied(501, 'E_REPO', '--auth 와 --data 가 있어야 콘솔이 돈다')
        const readJson = async () => {
          try {
            return JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
          } catch {
            return null
          }
        }
        const okLog = (tool, key, status = 200) => log.req({ ip, user: a.user, method: req.method, tool: '/admin' + tool, key, ms: Date.now() - t0, status, tid: a.tokenId })

        // 재인증 — 자기 토큰 원문을 한 번 더. 15분 쿠키(sudo 와 같은 모양). 세션이 탈취돼도 이 15분 밖에서는 명부가 바뀌지 않는다.
        if (sub === '/sudo' && req.method === 'POST') {
          const lim = limiter.hit(req.socket.remoteAddress)
          if (!lim.ok) return denied(429, 'E_RATE', '시도가 너무 잦다 — 잠시 뒤에 다시')
          const body = await readJson()
          if (!body) return denied(400, 'E_INPUT', '본문이 JSON 이 아니다')
          const d = await authenticate.login(String(body.token || '').trim())
          if (!d.ok || d.user !== a.user) {
            await auth.audit(dataDir, `admin sudo fail · ${a.user} · ip=${ip}`)
            return denied(401, 'E_AUTH', '토큰을 확인하세요')
          }
          setSudoCookie(res, auth.signSession(secret, a.user, { minutes: auth.SUDO_MINUTES, kind: 'sudo' }), { secure: secureCookie })
          await auth.audit(dataDir, `admin sudo · ${a.user} · ${auth.SUDO_MINUTES}분 · ip=${ip}`)
          okLog('/sudo', a.user)
          return json(res, 200, { ok: true, minutes: auth.SUDO_MINUTES })
        }
        if (req.method !== 'GET') {
          const su = auth.readSession(secret, auth.parseCookies(req.headers.cookie)['cdp_su'], Date.now(), { kind: 'sudo' })
          if (!su || su.user !== a.user) return denied(401, 'E_REAUTH', '관리자 확인이 필요하다 — 내 토큰을 한 번 더 넣는다')
        }

        await authenticate.reload()
        const db = authenticate.db()
        const commit = async (line) => {
          await auth.store(authenticate.file, db)
          await auth.audit(dataDir, 'admin ' + line)
        }
        const fail = (e) => {
          const code = e?.code || 'E_INPUT'
          const status = code === 'E_NOT_FOUND' ? 404 : code === 'E_EXISTS' || code === 'E_LAST_ADMIN' ? 409 : 400
          log.req({ ip, user: a.user, method: req.method, tool: '/admin', key: sub, ms: Date.now() - t0, status, code, tid: a.tokenId })
          return json(res, status, { error: { code, message: e.message, detail: e.detail } })
        }
        const visibleTo = (name) => db.users.filter((u) => u.active !== false && (u.repos || []).some((r) => r === '*' || r === name)).map((u) => u.name)

        try {
          // 현황 — 카드 넷의 숫자와 경고 목록. 한 번의 왕복이다.
          if (sub === '/overview' && req.method === 'GET') {
            const list = await store.list()
            const counts = { ok: 0, lag: 0, off: 0, diverged: 0, behind: 0 }
            const lag = []
            const diverged = []
            const behind = []
            const dirty = []
            const kits = {}
            for (const r of list) {
              const m = await mirror.summary(r.root)
              if (m.state === 'off') counts.off++
              else if (m.state === 'ok') counts.ok++
              else if (m.state === 'behind') {
                counts.ok++
                counts.behind++
                behind.push({ name: r.name, behind: m.behind })
              } else {
                counts.lag++
                if (m.state === 'diverged') {
                  counts.diverged++
                  diverged.push({ name: r.name, ahead: m.ahead, behind: m.behind })
                } else lag.push({ name: r.name, ahead: m.ahead, reason: m.reason })
              }
              if (m.dirty > 0) dirty.push({ name: r.name, dirty: m.dirty })
              kits[r.name] = (await kitHash(r.root).catch(() => ({ hash: null }))).hash
            }
            const users = auth.userList(db)
            const admins = auth.admins(db)
            const tokens = auth.tokenList(db)
            const active = tokens.filter((t) => t.status === 'active')
            const soon = active.filter((t) => t.daysLeft !== null && t.daysLeft <= 7)
            const wrows = wr.list(await wr.load(dataDir), { kits })
            const byState = { 최신: 0, 낡음: 0, 미설치: 0 }
            for (const w of wrows) byState[w.state] = (byState[w.state] || 0) + 1
            const alerts = []
            if (!admins.length) alerts.push({ level: 'bad', text: '관리자가 없다 — 셸에서 ctx serve user set --name <이름> --role admin', to: 'users' })
            if (soon.length) alerts.push({ level: 'warn', text: `7일 안에 만료되는 토큰 ${soon.length} — ${soon.map((t) => `${t.user}(${t.id} · ${t.daysLeft}일)`).join(' · ')}`, to: 'tokens' })
            // 미러 · 트리 경고 — 사실만 · 갈라짐과 더러움은 bad(save 가 막히거나 origin 이 못 받는다) · 밀림은 사유와 함께
            if (dirty.length) alerts.push({ level: 'bad', text: `트리에 커밋 안 된 변경이 있는 레포 ${dirty.length} — ${dirty.map((d) => `${d.name} ${d.dirty}건`).join(' · ')} · save 가 거절된다 → 「트리 되돌리기」`, to: 'repos' })
            if (diverged.length) alerts.push({ level: 'bad', text: `origin 과 갈라진 레포 ${diverged.length} — ${diverged.map((d) => `${d.name}(서버 ${d.ahead} · origin ${d.behind ?? '?'})`).join(' · ')} · 기계는 합치지 않는다 → 셸에서 rebase 뒤 「다시 보내기」`, to: 'repos' })
            if (lag.length) alerts.push({ level: 'warn', text: `미러가 밀린 레포 ${lag.length} — ${lag.map((l) => `${l.name} ${l.ahead ?? '?'}건${l.reason ? ' · ' + (mirror.REASON_TEXT[l.reason] || l.reason) : ''}`).join(' · ')}`, to: 'repos' })
            if (behind.length) alerts.push({ level: 'warn', text: `origin 이 앞선 레포 ${behind.length} — ${behind.map((b) => `${b.name} ${b.behind}건`).join(' · ')} · 누군가 서버 밖에서 썼다 → 「origin 과 맞추기」`, to: 'repos' })
            // 에이전트 세팅 — 레포의 도구 층이 서버 판과 다르면 작업 레포가 옛 스킬을 받는다(upgrade 때 건너뛴 레포 · Docker)
            const kitStale = []
            for (const r of list) {
              const k = await kitState(r.root)
              if (k.state === 'dry' || k.state === 'skipped') kitStale.push({ name: r.name, n: k.changes.length, reason: k.reason })
            }
            if (kitStale.length) alerts.push({ level: 'warn', text: `에이전트 세팅이 서버 판과 다른 레포 ${kitStale.length} — ${kitStale.map((k) => `${k.name} ${k.n}건${k.reason ? ' · ' + (KIT_REASON[k.reason] || k.reason) : ''}`).join(' · ')} → 지식 레포 › 「에이전트 세팅 갱신」`, to: 'repos' })
            if (byState.낡음) alerts.push({ level: 'warn', text: `에이전트 세팅이 낡은 작업 레포 ${byState.낡음} — 담당자가 자기 PC 에서 「일괄 갱신」 한 줄(관리 › 작업 레포)`, to: 'repos' })
            if (doctorCache.res?.fails) alerts.push({ level: 'bad', text: `진단 fail ${doctorCache.res.fails} — ${doctorCache.res.rows.filter((r) => r.state === 'fail').map((r) => r.what).join(' · ')}`, to: 'server' })
            if (!list.length) alerts.push({ level: 'warn', text: '지식 레포가 없다 — 지식 레포에서 세우거나 origin 에서 받아 온다', to: 'repos' })
            const audit = await tailLog(dataDir, 'auth.log', 5)
            const saves = await saveStats(dataDir)
            okLog('/overview', '-')
            return json(res, 200, {
              version: VERSION,
              built: BUILT,
              startedAt,
              node: process.version,
              repos: { count: list.length, mirror: counts, lag, diverged, behind, dirty, kitStale },
              saves,
              users: { count: users.length, active: users.filter((u) => u.active).length, admins: admins.length },
              tokens: { active: active.length, soon: soon.length, revoked: tokens.length - active.length },
              workrepos: { count: wrows.length, ...byState },
              packages: pk ? (await listPackageDirs(pk.dir).catch(() => [])).length : 0,
              doctor: doctorCache.res ? { at: doctorCache.at, ok: doctorCache.res.ok, fails: doctorCache.res.fails, warns: doctorCache.res.warns, oks: doctorCache.res.rows.length - doctorCache.res.fails - doctorCache.res.warns } : null,
              alerts,
              audit: audit.lines.reverse(),
            })
          }

          // ── 사용자
          if (sub === '/users' && req.method === 'GET') {
            const used = await lastUsed(dataDir)
            const rows = auth.userList(db).map((u) => ({ ...u, lastUsed: used.byUser.get(u.name) ?? null }))
            okLog('/users', '-')
            return json(res, 200, { users: rows, repos: (await store.list()).map((r) => r.name), me: a.user })
          }
          if (sub === '/users' && req.method === 'POST') {
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            const u = auth.userAdd(db, { name: String(body.name || '').trim(), label: body.label ? String(body.label).trim().slice(0, 80) : null, repos: body.repos ?? [], role: body.role ?? 'viewer' })
            await commit(`user add · ${a.user} · ${u.name} · repos=${u.repos.join(',')} · role=${u.role}${u.label ? ' · label=' + u.label : ''}`)
            okLog('/users', u.name)
            return json(res, 200, auth.userList(db).find((x) => x.name === u.name))
          }
          const um = /^\/users\/([^/]+)$/.exec(sub)
          if (um && req.method === 'PATCH') {
            const name = decodeURIComponent(um[1])
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            const patch = {}
            for (const k of ['label', 'role', 'repos', 'active']) if (body[k] !== undefined) patch[k] = body[k]
            if (patch.label !== undefined) patch.label = patch.label ? String(patch.label).trim().slice(0, 80) : null
            const u = auth.userSet(db, name, patch, { actor: a.user })
            await commit(`user set · ${a.user} · ${name} · ${JSON.stringify(patch)}`)
            okLog('/users', name)
            return json(res, 200, auth.userList(db).find((x) => x.name === u.name))
          }

          // ── 토큰 — 원문은 발급 · 재발급 응답에 **한 번**. 목록에는 앞 8자만.
          if (sub === '/tokens' && req.method === 'GET') {
            const used = await lastUsed(dataDir)
            const rows = auth.tokenList(db).map((t) => ({ ...t, lastUsed: used.byToken.get(t.id) ?? used.byUser.get(t.user) ?? null }))
            okLog('/tokens', '-')
            return json(res, 200, { tokens: rows, users: db.users.filter((u) => u.active !== false).map((u) => ({ name: u.name, label: u.label ?? null, role: auth.roleOf(u) })) })
          }
          if (sub === '/tokens' && req.method === 'POST') {
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            const days = body.expiresDays === undefined || body.expiresDays === null || body.expiresDays === '' ? undefined : body.expiresDays
            const { raw, rec } = auth.issue(db, { user: String(body.user || '').trim(), note: body.note ? String(body.note).trim().slice(0, 80) : null, expiresDays: days })
            await commit(`token issue · ${a.user} · ${rec.user} · ${rec.id} · expires=${rec.expires}${rec.note ? ' · note=' + rec.note : ''}`)
            okLog('/tokens', rec.id)
            return json(res, 200, { raw, id: rec.id, user: rec.user, expires: rec.expires, note: rec.note })
          }
          const tm = /^\/tokens\/([0-9a-f]{8})(?:\/(reissue|revoke))?$/.exec(sub)
          if (tm && tm[2] === 'reissue' && req.method === 'POST') {
            const body = (await readJson()) || {}
            const days = body.expiresDays === undefined || body.expiresDays === null || body.expiresDays === '' ? undefined : body.expiresDays
            const { raw, rec, old } = auth.reissue(db, { id: tm[1], by: a.user, expiresDays: days })
            await commit(`token reissue · ${a.user} · ${old.user} · ${old.id} → ${rec.id} · expires=${rec.expires}`)
            okLog('/tokens/reissue', rec.id)
            return json(res, 200, { raw, id: rec.id, user: rec.user, expires: rec.expires, note: rec.note, old: old.id })
          }
          if (tm && tm[2] === 'revoke' && req.method === 'POST') {
            const t = db.tokens.find((x) => x.sha256.startsWith(tm[1]))
            if (!t) return fail(new auth.AuthError('E_NOT_FOUND', '그 id 의 토큰이 없다', { id: tm[1] }))
            auth.revoke(db, { id: tm[1], by: a.user })
            await commit(`token revoke · ${a.user} · ${t.user} · ${tm[1]}`)
            okLog('/tokens/revoke', tm[1])
            return json(res, 200, { ok: true, id: tm[1], user: t.user })
          }
          if (tm && !tm[2] && req.method === 'PATCH') {
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            const t = auth.tokenSet(db, { id: tm[1], note: body.note !== undefined ? String(body.note).trim().slice(0, 80) : undefined, expires: body.expires })
            await commit(`token set · ${a.user} · ${t.user} · ${t.id} · ${JSON.stringify({ note: body.note, expires: body.expires })}`)
            okLog('/tokens', tm[1])
            return json(res, 200, auth.tokenList(db).find((x) => x.id === t.id))
          }

          // ── 지식 레포 — 서버의 레포 **전부**(관리자에게만 · 검토 v0.1 D6) · 볼 수 있는 사람
          if (sub === '/repos' && req.method === 'GET') {
            const rows = []
            for (const r of await store.list()) {
              const m = await mirror.summary(r.root)
              let info = {}
              try {
                info = (await store.view(r.name))?.repoInfo?.() || {}
              } catch {}
              rows.push({
                name: r.name,
                title: await titleOf(r.root),
                head: m.head,
                branch: m.branch,
                upstream: m.upstream,
                ahead: m.ahead,
                behind: m.behind,
                dirty: m.dirty,
                dirtyPaths: m.dirtyPaths,
                // 원격 주소(가림) — 「원격 없음」 과 「이었는데 아직 못 보냄(upstream 없음)」 을 가른다
                remote: await git.originUrl(r.root).catch(() => null),
                mirror: m.state,
                mirrorReason: m.reason,
                mirrorMessage: m.message,
                mirrorAt: m.at,
                note: mirror.describe(m),
                docs: info.docs ?? null,
                coords: info.coords ?? null,
                users: visibleTo(r.name),
                // 에이전트 세팅(도구 층)이 이 서버 판과 같은가 — 다르면 작업 레포가 옛 스킬을 받는다
                kit: await kitState(r.root),
              })
            }
            okLog('/repos', '-')
            return json(res, 200, { repos: rows, packages: pk ? (await listPackageDirs(pk.dir).catch(() => [])).map((p) => ({ name: p.name, title: p.manifest?.title ?? null, version: p.manifest?.version ?? null, description: p.manifest?.description ?? null, docs: p.docs })) : [], users: db.users.filter((u) => u.active !== false).map((u) => ({ name: u.name, label: u.label ?? null, all: (u.repos || []).includes('*') })) })
          }
          if (sub === '/repos' && req.method === 'POST') {
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            const name = String(body.name || '').trim()
            const out = await buildRepo({ name, pkgName: String(body.package || '').trim(), origin: body.origin ? String(body.origin).trim() : null, clone: body.clone ? String(body.clone).trim() : null, actor: a.user })
            if (out.status === 200 && Array.isArray(body.grant) && body.grant.length) {
              // 세우면서 접근을 준다 — 전에는 세운 뒤 CLI 로 한 명씩 열어야 했다(검토 v0.1 §3.2).
              const granted = []
              for (const n of body.grant) {
                const u = db.users.find((x) => x.name === n)
                if (!u || (u.repos || []).includes('*') || (u.repos || []).includes(name)) continue
                auth.userSet(db, n, { repos: [...(u.repos || []), name] })
                granted.push(n)
              }
              if (granted.length) await commit(`repo grant · ${a.user} · ${name} · users=${granted.join(',')}`)
              out.body.granted = granted
            }
            okLog('/repos', name, out.status)
            return json(res, out.status, out.body)
          }
          // ── git 자격 — 서버가 origin 에 닿는 길(git 자격 TODO G1~G8). **비밀은 브라우저를 건너지 않는다** —
          // 오가는 것은 공개 키 · 지문 · 결과뿐이다. 개인 키는 `<data>/ssh/` 밖으로 안 나가고, PAT 는 여기서 받지 않는다(D8 · 셸의 `ctx serve git-auth`).
          if (sub === '/gitauth' && req.method === 'GET') {
            const cred = await gitauth.credentialState().catch(() => ({ helper: null, store: false, file: null }))
            const rows = []
            for (const r of await store.list()) rows.push({ name: r.name, ...(await gitauth.repoSshState(r.root, dataDir).catch(() => ({ remote: null, ssh: false, applied: false }))) })
            okLog('/gitauth', '-')
            return json(res, 200, {
              ssh: await gitauth.keyInfo(dataDir),
              knownHosts: await gitauth.knownHosts(dataDir).catch(() => []),
              // 호스트 · 계정만 — 비밀은 읽어서 버린다
              https: { helper: cred.helper, store: cred.store, file: cred.file, entries: await gitauth.listCredentials(cred.file).catch(() => []) },
              repos: rows,
            })
          }
          const gm = /^\/gitauth\/(key|scan|trust|test)$/.exec(sub)
          if (gm && req.method === 'POST') {
            const body = (await readJson()) || {}
            const url = String(body.url || '').trim()
            const bad = (e, status = null) => {
              okLog('/gitauth/' + gm[1], '-', status || (e?.code === 'E_EXISTS' || e?.code === 'E_CHANGED' ? 409 : 400))
              return json(res, status || (e?.code === 'E_EXISTS' || e?.code === 'E_CHANGED' ? 409 : 400), { error: { code: e?.code || 'E_INPUT', message: e.message, detail: e.detail } })
            }
            try {
              if (gm[1] === 'key') {
                const k = await gitauth.createKey(dataDir, { rotate: !!body.rotate })
                // 이미 ssh 원격인 레포에 건다 — 키를 만든 뒤 레포마다 따로 누를 일이 없게
                const applied = []
                for (const r of await store.list()) if (await withLock(path.resolve(r.root), () => gitauth.applyToRepo(r.root, dataDir)).catch(() => false)) applied.push(r.name)
                await auth.audit(dataDir, `admin gitauth key · ${a.user} · ${k.fingerprint}${k.rotated ? ' · rotated' : ''}${applied.length ? ' · applied=' + applied.join(',') : ''}`)
                okLog('/gitauth/key', k.fingerprint || '-')
                const { path: _p, ...pub } = k
                return json(res, 200, { ...pub, rotated: !!k.rotated, applied })
              }
              if (gm[1] === 'scan') {
                const r = await gitauth.scanHost(url)
                okLog('/gitauth/scan', r.hostKey)
                return json(res, 200, r)
              }
              if (gm[1] === 'trust') {
                const r = await gitauth.trustHost(dataDir, url, String(body.fingerprint || ''))
                await auth.audit(dataDir, `admin gitauth trust · ${a.user} · ${r.hostKey} · ${r.type} ${r.fingerprint}`)
                okLog('/gitauth/trust', r.hostKey)
                return json(res, 200, r)
              }
              const r = await gitauth.testRemote(url, { dataDir })
              okLog('/gitauth/test', r.ok ? 'ok' : r.reason)
              return json(res, 200, { ...r, reasonText: r.reason ? (r.reason === 'hostkey' ? '호스트 키를 믿지 않았다 — 「호스트 키 받기」' : mirror.REASON_TEXT[r.reason] || r.reason) : null })
            } catch (e) {
              return bad(e)
            }
          }
          // ── 레포 하나를 원격에 잇는다 — 세울 때 origin 을 빠뜨렸거나 GitLab 프로젝트를 나중에 만든 경우(연결 · 삭제 · 내려받기 TODO K1~K4).
          // 재인증 뒤 · save 와 같은 뮤텍스 · `auth.log`. 강제 push 없음 — 원격이 비어 있지 않으면 non-ff 로 거절되고 사유가 간다.
          const om = /^\/repos\/([^/]+)\/origin$/.exec(sub)
          if (om && req.method === 'POST') {
            const name = decodeURIComponent(om[1])
            await store.ensure(name)
            const found = (await store.list()).find((x) => x.name === name)
            if (!found) return fail(new auth.AuthError('E_NOT_FOUND', '그런 레포가 없다', { name }))
            const body = await readJson()
            if (!body) return fail(new auth.AuthError('E_INPUT', '본문이 JSON 이 아니다'))
            let r
            try {
              const sshCommand = await sshCmd()
              r = await withLock(path.resolve(found.root), () => connectOrigin({ root: found.root, url: String(body.url || ''), push: body.push !== false, sshCommand }))
            } catch (e) {
              okLog('/repos/origin', name, 400)
              return json(res, 400, { error: { code: e?.code || 'E_INPUT', message: e.message, detail: e.detail } })
            }
            await auth.audit(dataDir, `admin repo origin · ${a.user} · ${name} · ${r.url}${r.before && r.changed ? ' (전 ' + r.before + ')' : ''} · ${r.pushed ? 'pushed' : body.push === false ? 'no-push' : 'fail=' + (r.reason || '?')}`)
            if (!r.pushed && r.reason) log.line(`origin 연결 ${name}: push 실패 — ${mirror.REASON_TEXT[r.reason] || r.reason}${r.message ? ' — ' + r.message : ''}`)
            okLog('/repos/origin', name, r.pushed || body.push === false ? 200 : 409)
            return json(res, r.pushed || body.push === false ? 200 : 409, { ok: r.pushed || body.push === false, ...r, reasonText: r.reason ? mirror.REASON_TEXT[r.reason] || r.reason : null, mirror: await mirror.summary(found.root) })
          }
          // ── 레포 하나를 치운다 — **휴지통으로 옮긴다**(`<data>/trash/<이름>-<시각>/` · K5~K7). 영구 삭제는 없다.
          // 본문 `{ confirm: <이름> }` 이 맞아야 한다. 명부의 할당에서 그 이름을 뺀다(`*` 는 그대로) · 작업 레포 대장 행은 기록이라 남긴다.
          const dm = /^\/repos\/([^/]+)$/.exec(sub)
          if (dm && req.method === 'DELETE') {
            const name = decodeURIComponent(dm[1])
            await store.ensure(name)
            const found = (await store.list()).find((x) => x.name === name)
            if (!found) return fail(new auth.AuthError('E_NOT_FOUND', '그런 레포가 없다', { name }))
            const body = await readJson()
            if (!body || String(body.confirm || '') !== name) {
              okLog('/repos/delete', name, 400)
              return json(res, 400, { error: { code: 'E_INPUT', message: '확인 이름이 레포 이름과 같아야 한다' } })
            }
            const m0 = await mirror.summary(found.root)
            let r
            try {
              r = await withLock(path.resolve(found.root), () => trashRepo({ root: found.root, trashDir: path.join(dataDir, 'trash') }))
            } catch (e) {
              okLog('/repos/delete', name, 400)
              return json(res, 400, { error: { code: e?.code || 'E_REPO', message: e.message, detail: e.detail } })
            }
            store.forget(name)
            const revoked = []
            for (const u of db.users) {
              if ((u.repos || []).includes(name)) {
                auth.userSet(db, u.name, { repos: u.repos.filter((x) => x !== name) })
                revoked.push(u.name)
              }
            }
            if (revoked.length) await auth.store(authenticate.file, db)
            const left = (await wr.load(dataDir)).repos.filter((w) => w.knowledge === name).length
            await auth.audit(dataDir, `admin repo delete · ${a.user} · ${name} · trash=${r.to}${revoked.length ? ' · revoked=' + revoked.join(',') : ''}${m0.state !== 'ok' ? ' · mirror=' + m0.state + (m0.ahead ? ' ahead=' + m0.ahead : '') : ''}`)
            log.line(`레포 치움 ${name} → ${r.to}`)
            okLog('/repos/delete', name)
            return json(res, 200, { ok: true, name, trash: r.to, revoked, workrepos: left, mirror: m0.state, ahead: m0.ahead })
          }
          // ── 레포 하나의 에이전트 세팅 갱신 — 도구 층(스킬 · 도구 · 훅)을 이 서버 판으로 한 커밋(에이전트 세팅 갱신 TODO T8).
          // upgrade.sh 가 멈춘 사이에 하는 일을 도는 서버에서 — save 와 같은 뮤텍스 · 재인증 뒤 · `auth.log` · --mirror 면 보낸다.
          const km = /^\/repos\/([^/]+)\/kit$/.exec(sub)
          if (km && req.method === 'POST') {
            const name = decodeURIComponent(km[1])
            await store.ensure(name)
            const found = (await store.list()).find((x) => x.name === name)
            if (!found) return fail(new auth.AuthError('E_NOT_FOUND', '그런 레포가 없다', { name }))
            let r
            try {
              const from = await kitFrom()
              if (!from) throw Object.assign(new Error('서버에 패키지 폴더가 없다 — --packages'), { code: 'E_INPUT' })
              r = await withLock(path.resolve(found.root), () => refreshToolLayer(found.root, from, { message: (c) => kitMessage(BUILT, c.length) }))
            } catch (e) {
              okLog('/repos/kit', name, 400)
              return json(res, 400, { error: { code: e?.code || 'E_INPUT', message: e.message } })
            }
            let pushed = null
            if (r.state === 'updated' && opt.mirror) pushed = await mirror.enqueuePush(found.root, { log: (m) => log.line(m) }).catch(() => null)
            await auth.audit(dataDir, `admin repo kit · ${a.user} · ${name} · ${r.state}${r.reason ? '=' + r.reason : ''} · ${r.changes.length}건${r.commit ? ' · ' + r.commit : ''}`)
            if (r.state === 'updated') log.line(`에이전트 세팅 갱신 ${name}: ${r.changes.length}건 → ${r.commit}`)
            const ok = r.state === 'updated' || r.state === 'same'
            okLog('/repos/kit', name, ok ? 200 : 409)
            return json(res, ok ? 200 : 409, {
              ok,
              state: r.state,
              reason: r.reason,
              reasonText: r.reason ? KIT_REASON[r.reason] || r.reason : null,
              message: r.message ?? null,
              commit: r.commit,
              changes: r.changes.map((c) => ({ path: c.path, op: c.op })),
              line: kitLine(r),
              mirror: await mirror.summary(found.root),
              pushed: pushed ? { ok: !!pushed.ok, state: pushed.state, reason: pushed.reason ?? null } : null,
            })
          }
          // ── 레포 하나의 복구 셋 — 「origin 과 맞추기」 · 「다시 보내기」 · 「트리 되돌리기」(동시 기록 검토 v0.1 D4 · D5).
          // 전부 재인증 뒤(위의 GET 아님 → cdp_su) · `save` 와 같은 뮤텍스 · `auth.log`. 판정은 `core/mirror.js` 하나다.
          const rm = /^\/repos\/([^/]+)\/(sync|push|restore)$/.exec(sub)
          if (rm && req.method === 'POST') {
            const name = decodeURIComponent(rm[1])
            await store.ensure(name)
            const found = (await store.list()).find((x) => x.name === name)
            if (!found) return fail(new auth.AuthError('E_NOT_FOUND', '그런 레포가 없다', { name }))
            if (rm[2] === 'sync') {
              const r = await mirror.syncWithOrigin(found.root, { rescan: () => store.reload(name) })
              await auth.audit(dataDir, `admin repo sync · ${a.user} · ${name} · ${r.ok ? 'pulled=' + (r.pulled ?? 0) : 'fail=' + r.reason}`)
              okLog('/repos/sync', name, r.ok ? 200 : 409)
              // 결과의 `reason`(diverged · dirty) 과 미러 요약의 `reason`(push 실패 사유)은 다른 것이다 — 요약은 `mirror` 아래에
              return json(res, r.ok ? 200 : 409, { ok: r.ok, pulled: r.pulled ?? 0, reason: r.reason ?? null, message: r.message ?? null, mirror: await mirror.summary(found.root) })
            }
            if (rm[2] === 'push') {
              const r = await mirror.enqueuePush(found.root, { log: (m) => log.line(m) })
              await auth.audit(dataDir, `admin repo push · ${a.user} · ${name} · ${r?.ok ? 'ok' : 'fail=' + (r?.reason || '?')}`)
              okLog('/repos/push', name, r?.ok ? 200 : 409)
              return json(res, r?.ok ? 200 : 409, { ok: !!r?.ok, reason: r?.reason ?? null, message: r?.message ?? null, mirror: await mirror.summary(found.root) })
            }
            const r = await mirror.restore(found.root)
            if (r.ok && r.discarded.length) await store.reload(name)
            await auth.audit(dataDir, `admin repo restore · ${a.user} · ${name} · discarded=${r.discarded?.length ?? 0}${r.discarded?.length ? ' · ' + r.discarded.slice(0, 10).join(',') : ''}`)
            okLog('/repos/restore', name, r.ok ? 200 : 409)
            return json(res, r.ok ? 200 : 409, { ok: r.ok, discarded: r.discarded || [], reason: r.reason ?? null, message: r.message ?? null, mirror: await mirror.summary(found.root) })
          }

          // ── 작업 레포 — 대장 전부(레포 무관). 등록 · 꾸러미는 그 레포의 관리 화면에서(§4.7).
          if (sub === '/workrepos' && req.method === 'GET') {
            const kits = {}
            for (const r of await store.list()) kits[r.name] = (await kitHash(r.root).catch(() => ({ hash: null }))).hash
            okLog('/workrepos', '-')
            return json(res, 200, { repos: wr.list(await wr.load(dataDir), { kits }) })
          }

          // ── 서버 — 진단 · 설정값 · 로그. 전부 읽기다(D7 · D8).
          if (sub === '/doctor' && req.method === 'GET') {
            const r = await runDoctorCached(url.searchParams.get('fresh') === '1')
            okLog('/doctor', r.fails ? 'fail ' + r.fails : 'ok')
            return json(res, 200, r)
          }
          if (sub === '/server' && req.method === 'GET') {
            okLog('/server', '-')
            return json(res, 200, {
              version: VERSION,
              built: BUILT,
              node: process.version,
              pid: process.pid,
              startedAt,
              bind,
              port,
              root,
              auth: authenticate.file,
              data: dataDir,
              web: webDir,
              webOk,
              packages: pk?.dir || null,
              manual: manualDir,
              mirror: !!opt.mirror,
              publicUrl: opt.publicUrl || null,
              adminFrom: adminFrom.map((c) => c.text),
              privatePages,
              packagesList: pk ? (await listPackageDirs(pk.dir).catch(() => [])).map((p) => ({ name: p.name, title: p.manifest?.title ?? null, version: p.manifest?.version ?? null, docs: p.docs, types: p.types, patterns: p.patterns })) : [],
              manuals: manuals.list(),
            })
          }
          if ((sub === '/audit' || sub === '/log') && req.method === 'GET') {
            const n = Math.min(2000, Math.max(1, Number(url.searchParams.get('limit')) || 200))
            const r = await tailLog(dataDir, sub === '/audit' ? 'auth.log' : 'serve.log', n)
            okLog(sub, String(n))
            return json(res, 200, { lines: r.lines.reverse(), total: r.total })
          }
        } catch (e) {
          return fail(e)
        }
        return denied(404, 'E_NOT_FOUND', '없는 관리 경로')
      }

      // GET /packages — 고를 수 있는 패키지. 권한과 무관하다 — 패키지는 서식이라
      // 숨길 것이 없다(검토 §3.4). 목록 · 판 · 문서 수만 낸다.
      if (url.pathname === '/packages' && req.method === 'GET') {
        if (!pk) return json(res, 200, { dir: null, packages: [] })
        const list = await listPackageDirs(pk.dir).catch(() => [])
        log.req({ ip, user: a.user, method: 'GET', tool: '/packages', ms: Date.now() - t0, status: 200 })
        return json(res, 200, {
          dir: pk.dir,
          packages: list.map((p) => ({
            name: p.name,
            title: p.manifest.title,
            version: p.manifest.version,
            description: p.manifest.description,
            docs: p.docs,
            types: p.types,
            patterns: p.patterns,
          })),
        })
      }

      if (url.pathname === '/repos' && req.method === 'GET') {
        const list = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const rows = []
        for (const r of list) {
          // 상태 한 값 + 사유 — 레포 화면의 상태바와 스킬이 "밀렸는데 왜" 를 볼 수 있어야 한다(동시 기록 검토 v0.1 D3 · D12)
          const m = await mirror.summary(r.root)
          rows.push({
            name: r.name,
            title: await titleOf(r.root),
            head: m.head,
            branch: m.branch,
            mirror: m.state,
            mirrorReason: m.reason,
            ahead: m.ahead,
            behind: m.behind,
            dirty: m.dirty,
            // 콘솔 단추 이름은 admin 에게만(R4)
            note: mirror.describe(m, { admin: !!a.admin }),
          })
        }
        log.req({ ip, user: a.user, method: 'GET', tool: '/repos', ms: Date.now() - t0, status: 200 })
        return json(res, 200, rows)
      }

      // ── 설치 대장 (§6.7.2) ─────────────────────────────────────────────
      if (url.pathname === '/workrepos' || url.pathname.startsWith('/workrepos/')) {
        if (!dataDir) return json(res, 501, { error: { code: 'E_REPO', message: '--data 가 없어 대장을 둘 곳이 없다' } })
        const db = await wr.load(dataDir)
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))

        try {
          if (url.pathname === '/workrepos' && req.method === 'GET') {
            const kits = {}
            for (const r of mine) kits[r.name] = (await kitHash(r.root)).hash
            const rows = wr.list(db, { kits }).filter((r) => mine.some((m) => m.name === r.knowledge))
            // `write` 를 같이 낸다 -- 화면이 등록 칸을 낼지 말지 정해야 하는데,
            // 못 할 일을 띄워 놓고 누른 뒤에 403 을 내는 것은 화면이 아니다.
            // 명부 이름(`users`)은 등록 칸(담당자 select)의 재료라 **write 에게만** 낸다 — viewer 화면은 안 쓰는데 API 만 열려
            // 있던 모양(화면 · 권한 검토 v0.1 P4 · R4).
            return json(res, 200, { repos: rows, users: a.write ? await usersOf(opt.auth) : [], write: !!a.write })
          }
          // **등록·삭제는 `write` 가 있어야 한다.**
          //
          // 목록과 보고는 전원에게 연다 -- 보고를 막으면 대장이 사실과 어긋나고,
          // 그러면 대장을 둔 이유가 없어진다. 대장은 권한을 들지 않으므로
          // 지워도 되돌릴 수 있지만, **누가 지웠는지는 남아야 한다.**
          const mutating =
            (url.pathname === '/workrepos' && req.method === 'POST') ||
            (req.method === 'DELETE' && /^\/workrepos\/[^/]+$/.test(url.pathname))
          if (mutating && !a.write) {
            log.req({ ip, user: a.user, method: req.method, tool: '/workrepos', key: url.pathname, ms: Date.now() - t0, status: 403, code: 'E_FORBIDDEN' })
            return json(res, 403, { error: { code: 'E_FORBIDDEN', message: '쓰기 권한이 없다 — 등록·삭제는 write 인 사람만' } })
          }
          if (url.pathname === '/workrepos' && req.method === 'POST') {
            const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
            // 방금 세운 레포를 바로 등록할 수 있게 — 모르는 이름이면 폴더를 다시 훑는다
            if (body.knowledge) await store.ensure(String(body.knowledge))
            const known = (await store.list()).filter((r) => !a.allow || a.allow(r.name)).map((r) => r.name)
            const row = wr.add(db, body, { users: await usersOf(opt.auth), repos: known })
            await wr.save(dataDir, db)
            await auth.audit(dataDir, `workrepo add · ${a.user} · ${row.id} · ${row.name} · ${row.knowledge}`)
            log.req({ ip, user: a.user, method: 'POST', tool: '/workrepos', key: row.id, ms: Date.now() - t0, status: 200 })
            return json(res, 200, row)
          }
          const am = /^\/workrepos\/([^/]+)\/applied$/.exec(url.pathname)
          if (am && req.method === 'POST') {
            const body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
            if (body.by || body.at) {
              return json(res, 400, { error: { code: 'E_INPUT', message: 'by · at 은 서버가 채운다 — 보내지 않는다' } })
            }
            const row = wr.applied(db, am[1], { kit: body.kit, by: a.user })
            await wr.save(dataDir, db)
            log.req({ ip, user: a.user, method: 'POST', tool: '/applied', key: am[1], ms: Date.now() - t0, status: 200 })
            return json(res, 200, row)
          }
          const dm = /^\/workrepos\/([^/]+)$/.exec(url.pathname)
          if (dm && req.method === 'DELETE') {
            const gone = db.repos.find((r) => r.id === dm[1])
            wr.remove(db, dm[1])
            await wr.save(dataDir, db)
            await auth.audit(dataDir, `workrepo del · ${a.user} · ${dm[1]} · ${gone?.name ?? '-'}`)
            log.req({ ip, user: a.user, method: 'DELETE', tool: '/workrepos', key: dm[1], ms: Date.now() - t0, status: 200 })
            return json(res, 200, { ok: true })
          }
        } catch (e) {
          const code = e?.code || 'E_INPUT'
          return json(res, code === 'E_NOT_FOUND' ? 404 : 400, { error: { code, message: e.message, detail: e.detail } })
        }
        return json(res, 405, { error: { code: 'E_INPUT', message: '그 메서드는 없다' } })
      }

      // GET /api/<repo>/… — 관리 서비스의 읽기 API (§6.2 · §6.3).
      //
      // **로컬 뷰어와 같은 함수를 쓴다**(`handleRead`). 이 PC 를 만지는
      // 라우트(`/setup` · `/open` · `/quit` · `/git/pull` …)는 여기 없다 —
      // 없는 것이지 막은 것이 아니다.
      const apiM = /^\/api\/([^/]+)(\/.*)?$/.exec(url.pathname)
      if (apiM) {
        const name = decodeURIComponent(apiM[1])
        await store.ensure(name)
        const found = (await store.list()).find((x) => x.name === name)
        if (!found || (a.allow && !a.allow(name))) {
          log.req({ ip, user: a.user, method: req.method, tool: '/api', key: name, ms: Date.now() - t0, status: 404 })
          return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '그런 레포가 없다' } })
        }
        const view = await store.view(name)
        const sub = apiM[2] || '/'
        const sendV = (r, status, body, headers = {}) => {
          const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
          r.writeHead(status, {
            'content-type': 'application/json; charset=utf-8',
            'x-content-type-options': 'nosniff',
            'referrer-policy': 'no-referrer',
            'cache-control': 'no-store',
            ...headers,
          })
          r.end(buf)
        }
        const done = await handleRead({ p: sub, method: req.method, url, res, send: sendV, store: view })
        log.req({ ip, user: a.user, repo: name, method: req.method, tool: sub, ms: Date.now() - t0, status: done ? 200 : 404 })
        if (done) return
        // 로컬 전용 라우트다. **막은 것이 아니라 없는 것**이다(§6.2).
        return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '관리 서비스에 없는 경로다 — 로컬 뷰어의 것' } })
      }

      // GET /kit/<name> — 그 레포의 kit(스킬 · CLAUDE 블록) zip (§4.3).
      //
      // **지식 레포 안의 `.claude/` 가 정본이다.** 서버가 따로 들고 있지 않고
      // 레포에서 그때그때 싼다 — 레포를 갱신하면 다음 요청부터 새 kit 이다.
      const kitM = /^\/kit\/([^/]+)\/?$/.exec(url.pathname)
      if (kitM && req.method === 'GET') {
        const name = decodeURIComponent(kitM[1])
        await store.ensure(name)
        const found = (await store.list()).find((x) => x.name === name)
        // 권한 밖 레포는 **없는 것**이다(§4.6). 403 은 존재를 알려 준다.
        if (!found || (a.allow && !a.allow(name))) {
          log.req({ ip, user: a.user, method: 'GET', tool: '/kit', key: name, ms: Date.now() - t0, status: 404 })
          return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '그런 레포가 없다' } })
        }
        const files = await collectKit(found.root)
        if (!files.length) {
          return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '이 레포에 .claude/ kit 이 없다' } })
        }

        // `?workrepo=<id>` — 사람이 내려받아 **그대로 푸는** 설치 꾸러미(§6.7.3).
        // 서버가 그 자리에서 조립한다. 미리 만들어 두지 않는다 — kit 이 바뀌면
        // 다음 요청부터 새것이어야 한다.
        //
        // **토큰은 넣지 않는다.** 꾸러미는 파일로 남고 사람 손을 거친다 —
        // 여기에 원문을 넣으면 §4.4.1 의 "발급 엔드포인트는 없다" 를 뒷문으로
        // 깨는 셈이 된다.
        const wid = url.searchParams.get('workrepo')
        let entries = files
        if (wid && dataDir) {
          const db = await wr.load(dataDir)
          const row = db.repos.find((r) => r.id === wid)
          if (!row) return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '그런 등록이 없다' } })
          const origin = publicOrigin(req, opt)
          const claudeTpl = files.find((f) => f.name === '.claude/work-repo/CLAUDE.md')
          const kit = (await kitHash(found.root)).hash

          // **kit 을 한 단 내린다.** 전에는 이 전부가 zip 루트에 있어서,
          // 작업 레포에 푸는 순간 `CLAUDE.md` 와 `.mcp.json` 이 덮였다 --
          // 안내문이 그다음 줄에서 "이미 있으면 덮지 말라" 고 하는데 이미
          // 늦은 것이었다. 한 단 내려 두면 푸는 것만으로는 아무것도 안 덮이고,
          // 옮기는 일은 `설치.mjs` 가 병합해서 한다.
          entries = files.map((f) => ({ name: 'kit/' + f.name, data: f.data }))
          entries.push({ name: 'kit/.mcp.json', data: mergeMcpJson(null, mcpEntryServer(origin, name)) })
          entries.push({
            name: 'kit/.claude/cdp.json',
            data: JSON.stringify({ server: origin, repo: name }, null, 2) + NL,
          })
          if (claudeTpl) {
            entries.push({ name: 'kit/CLAUDE.md', data: mergeClaude(null, claudeTpl.data.toString('utf8'), kit) })
          }
          entries.push({ name: '설치.md', data: installNote({ origin, repo: name, row, kit }) })

          // `&as=json` — 한 줄 설치기가 **토큰으로** 받는 같은 kit(설치 한 줄 TODO I2). 판정 · 조립은 zip 과 같고
          // 담는 모양만 다르다 — `kit/` 아래 것만, 한 단 올려서.
          if (url.searchParams.get('as') === 'json') {
            const kitFiles = entries
              .filter((f) => f.name.startsWith('kit/'))
              .map((f) => ({ name: f.name.slice('kit/'.length), data: Buffer.from(f.data).toString('base64') }))
            log.req({ ip, user: a.user, method: 'GET', tool: '/kit', key: name, ms: Date.now() - t0, status: 200 })
            return json(res, 200, { server: origin, repo: name, workrepo: row.id, kit, files: kitFiles })
          }

          // 실행기. **설정 한 줄을 앞에 박아서** 사람이 URL 이나 id 를 옮겨
          // 적지 않게 한다. 토큰은 넣지 않는다(§6.7.3) -- 꾸러미는 파일로
          // 남고 사람 손을 거친다.
          if (HAS_INSTALLER) {
            const cfg =
              'globalThis.__CDP_KIT__ = ' +
              JSON.stringify({ server: origin, repo: name, workrepo: row.id, kit }) +
              NL
            entries.push({ name: 'install.mjs', data: cfg + INSTALLER_SRC })
          }
        }

        const buf = await zip(entries)
        log.req({ ip, user: a.user, method: 'GET', tool: '/kit', key: name, ms: Date.now() - t0, status: 200 })
        res.writeHead(200, {
          'content-type': 'application/zip',
          'content-length': buf.length,
          'content-disposition': `attachment; filename="cdp-kit-${name}.zip"`,
        })
        return res.end(buf)
      }

      if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
        // 방금 둔 레포로 오는 첫 MCP 요청 — 모르는 이름이면 폴더를 다시 훑는다
        const mcpName = decodeURIComponent(url.pathname.split('/')[2] || '')
        if (mcpName) await store.ensure(mcpName)
        let body = Buffer.alloc(0)
        if (req.method === 'POST') {
          const got = overLimit(req, MAX_BODY) ? { tooLarge: true } : await readBody(req, MAX_BODY)
          if (got.tooLarge) {
            log.req({ ip, user: a.user, method: 'POST', key: url.pathname, ms: Date.now() - t0, status: 413, code: 'E_INPUT' })
            res.setHeader('connection', 'close')
            return json(res, 413, { error: { code: 'E_INPUT', message: '요청이 2MB 상한을 넘는다' } })
          }
          body = got
        }

        const seen = req.method === 'POST' ? peek(body) : { method: null, tool: null, key: null }
        const headers = new Headers()
        for (const [k, v] of Object.entries(req.headers)) if (typeof v === 'string') headers.set(k, v)

        const request = new Request(url.href, {
          method: req.method,
          headers,
          body: req.method === 'POST' ? body : undefined,
        })
        // 레포 목록은 60초 캐시라 요청마다 붙여도 싸다. 권한 밖은 여기서
        // 걷어낸다 -- 팩토리가 못 보면 `repos` 도구도 못 낸다(§4.6).
        const all = await store.list()
        const repos = []
        for (const r of all) {
          if (a.allow && !a.allow(r.name)) continue
          repos.push({ name: r.name, root: r.root, title: await titleOf(r.root) })
        }
        const ctxStore = { auth: a, repos, outcome: null }
        const out = await CTX.run(ctxStore, () => handler.fetch(request)).catch((e) => {
          log.line('fetch: ' + (e?.message || e))
          return new Response(JSON.stringify({ error: { code: 'E_REPO', message: String(e?.message || e) } }), { status: 500 })
        })

        // 로그는 **몸통을 다 흘려보낸 뒤** 쓴다 — 도구는 스트림을 열어 둔 채 돈다. 앞에서 쓰면
        // `save` 가 1초 걸려도 6ms 로 남고 결과도 모른다(동시 기록 검토 v0.1 B9).
        res.writeHead(out.status, Object.fromEntries(out.headers))
        if (out.body) {
          const reader = out.body.getReader()
          for (;;) {
            const { done, value } = await reader.read()
            if (done) break
            res.write(Buffer.from(value))
          }
        }
        res.end()
        const oc = ctxStore.outcome
        log.req({
          ip,
          user: a.user,
          repo: /^\/mcp\/([^/]+)/.exec(url.pathname)?.[1] || '-',
          method: seen.method,
          tool: seen.tool,
          key: seen.key || oc?.key || null,
          ms: oc?.ms ?? Date.now() - t0,
          status: out.status,
          code: oc?.code || null,
          tid: a.tokenId,
        })
        return
      }

      // `/r` → 볼 수 있는 첫 레포로. 없으면 화면이 빈 상태를 그린다(관리자면 콘솔로 가는 길) —
      // 토큰은 맞으므로 401 로 돌려보내지 않는다(§6.6.1).
      if (url.pathname === '/r' || url.pathname === '/r/') {
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        // `?from=<이름>` — 열 수 없는 레포 주소로 왔다. 화면이 문장과 볼 수 있는 레포를 낸다(화면 UX 검토 v0.1 P5)
        if (url.searchParams.has('from')) return serveWeb({ req, res, url, webDir, log })
        if (mine.length) {
          res.writeHead(302, { location: '/r/' + encodeURIComponent(mine[0].name) + '/' })
          return res.end()
        }
        return serveWeb({ req, res, url, webDir, log })
      }
      if (url.pathname.startsWith('/r/')) {
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const m = /^\/r\/([^/]+)/.exec(url.pathname)
        let name = ''
        try {
          name = decodeURIComponent(m[1])
        } catch {}
        if (!mine.some((r) => r.name === name)) {
          // 방금 세운 레포일 수 있다 — 모르는 이름이면 폴더를 다시 훑는다
          await store.ensure(name)
          const again = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
          if (!again.some((r) => r.name === name)) {
            // **없는 레포와 권한 밖 레포를 같은 길로 보낸다**(D4 · §4.6 — 존재를 알리지 않는다). 전에는 말없이 첫
            // 레포로 보내 동료가 준 링크가 왜 다른 곳에서 열렸는지 알 길이 없었다(화면 UX 검토 v0.1 P5). 화면(`/r?from=`)이
            // "없거나 할당되지 않았다" 한 문장과 볼 수 있는 레포를 낸다.
            log.req({ ip, user: a.user, method: 'GET', tool: '/r', key: name.slice(0, 60), ms: Date.now() - t0, status: 302, code: 'E_NOT_FOUND' })
            res.writeHead(302, { location: '/r?from=' + encodeURIComponent(name) })
            return res.end()
          }
        }
        // 화면 — 빌드된 SPA 를 낸다. **같은 번들이 로컬에서도 돈다**(§6.8) —
        // 경로가 `/r/` 로 시작하면 서버 모드라고 화면이 스스로 안다.
        return serveWeb({ req, res, url, webDir, log })
      }

      return json(res, 404, { error: { code: 'E_NOT_FOUND', message: '없는 경로' } })
    } catch (e) {
      log.line('요청 처리 중 오류: ' + (e?.message || e))
      if (!res.headersSent) json(res, 500, { error: { code: 'E_REPO', message: String(e?.message || e) } })
    }
  }

  const server = http.createServer(onRequest)

  // `Expect: 100-continue` — 큰 몸통을 보내기 전에 물어보는 것이다.
  // 여기서 거절하면 클라이언트는 **2MB 를 보내지도 않는다.**
  server.on('checkContinue', (req, res) => {
    if (overLimit(req, MAX_BODY)) {
      log.req({ ip: req.socket.remoteAddress, method: req.method, key: new URL(req.url, 'http://x').pathname, ms: 0, status: 413, code: 'E_INPUT' })
      res.setHeader('connection', 'close')
      return json(res, 413, { error: { code: 'E_INPUT', message: '요청이 2MB 상한을 넘는다' } })
    }
    res.writeContinue()
    onRequest(req, res)
  })

  await new Promise((resolve) => server.listen(port, bind, resolve))
  const list = await store.list()
  log.line(`시작 · ${bind}:${port} · root ${root} · 레포 ${list.length}개 (${list.map((r) => r.name).join(' · ') || '없음'}) · 번들 ${BUILT}`)
  // 더러운 트리는 시작 뒤 한 줄 — `save` 가 거절될 레포를 관리자가 로그에서 먼저 본다(동시 기록 검토 v0.1 D5).
  // 듣기 시작한 **뒤**에 돈다 — 레포마다 git 을 띄우는 일이라 기동을 늦추지 않는다.
  for (const r of list) {
    const st = await git.status(r.root).catch(() => null)
    if (st?.dirty > 0) log.line(`경고: 레포 ${r.name} 트리에 커밋 안 된 변경 ${st.dirty}건 (${st.dirtyPaths.slice(0, 3).join(' · ')}) — save 가 거절된다. 콘솔 > 지식 레포 > 「트리 되돌리기」`)
  }

  await new Promise((resolve) => {
    server.on('close', resolve)
    process.on('SIGINT', () => server.close(resolve))
    process.on('SIGTERM', () => server.close(resolve))
  })
  return 0
}

// ── serve user · serve token (§4.4.0 · §4.4.1) ──────────────────────────────
//
// **발급은 HTTP 요청이 아니다.** 여기는 서버 기계에서 도는 CLI 이고, 발급의
// 인증은 OS 가 한다 — 서버에 셸이 있고 `auth.json` 에 쓸 수 있는 사람만
// 돌릴 수 있다. 그 이상을 서버가 확인할 방법이 없다(§4.4.1).

const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

function need(opt, key, what) {
  const v = opt[key]
  if (!v) {
    err(`ctx serve: ${what} 가 필요하다 (--${key})`)
    return null
  }
  return v
}

const pad = (s, n) => {
  const w = [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s ?? '') + ' '.repeat(Math.max(0, n - w))
}

export async function runAuthCmd(opt) {
  const [group, sub] = opt.args
  const file = need(opt, 'auth', 'auth.json 경로')
  if (!file) return 2
  const dataDir = opt.data ? path.resolve(opt.data) : null

  let db
  try {
    db = await auth.load(file)
  } catch (e) {
    err('ctx serve: ' + e.message)
    return 2
  }

  // `--repos a,b` (쉼표 하나) 와 `--repo a --repo b` (반복) 를 둘 다 받는다.
  // **안 준 경우는 undefined 여야 한다** -- `user set` 에서 "안 건드림" 과
  // "비움" 이 갈리는 자리다. `opt.repos` 는 파서가 `[]` 로 초기화하므로
  // 그대로 쓰면 둘을 구별할 수 없고, 레포 목록이 조용히 지워진다.
  const reposOpt = () => {
    if (opt.repos2 !== undefined) return opt.repos2
    if (Array.isArray(opt.repos) && opt.repos.length) return opt.repos
    return undefined
  }
  // 만료도 같다 — 안 주면 undefined 로 넘긴다. 그래야 `issue()` 가 **역할로** 기본을
  // 정한다(admin 30일 · 나머지 90일). 여기서 90 을 채우면 관리자도 90 이 된다.
  const expiresOpt = () => (opt.expires === undefined ? undefined : opt.expires === 'never' ? 'never' : Number(opt.expires))

  const done = async (line) => {
    await auth.store(file, db)
    await auth.audit(dataDir, line)
    return 0
  }

  try {
    if (group === 'user') {
      if (sub === 'add') {
        const name = need(opt, 'name', '이름')
        if (!name) return 2
        const u = auth.userAdd(db, { name, label: opt.label ?? null, repos: reposOpt() ?? [], role: opt.role ?? null, write: !!opt.write })
        out(`명부에 넣었다: ${u.name} · repos ${u.repos.join(',') || '(없음)'} · role ${u.role}`)
        return done(`user add · ${u.name} · repos=${u.repos.join(',')} · role=${u.role}`)
      }
      if (sub === 'set') {
        const name = need(opt, 'name', '이름')
        if (!name) return 2
        const patch = {}
        if (opt.label !== undefined) patch.label = opt.label
        const r = reposOpt()
        if (r !== undefined) patch.repos = r
        if (opt.role !== undefined) patch.role = opt.role
        else if (opt.write !== undefined) patch.write = opt.write
        if (opt.active !== undefined) patch.active = opt.active
        // 셸에는 actor 가 없다 — 자기 해제 가드는 화면의 것이고, 마지막 admin 가드만 여기서도 선다.
        const u = auth.userSet(db, name, patch)
        out(`고쳤다: ${u.name} · active ${u.active} · repos ${(u.repos || []).join(',')} · role ${u.role}`)
        return done(`user set · ${u.name} · ${JSON.stringify(patch)}`)
      }
      if (sub === 'list' || sub === undefined) {
        const rows = auth.userList(db, { repo: opt.repoFilter || null })
        const used = await lastUsed(dataDir)
        for (const r of rows) r.lastUsed = used.byUser.get(r.name) ?? null
        if (opt.json) {
          out(JSON.stringify(rows, null, 2))
          return 0
        }
        if (opt.repoFilter) out(`${opt.repoFilter} 를 볼 수 있는 사람 ${rows.length}명`)
        out(`${pad('이름', 14)}${pad('상태', 8)}${pad('레포', 20)}${pad('역할', 8)}${pad('토큰', 8)}${pad('마지막 사용', 14)}설명`)
        for (const r of rows) {
          out(
            pad(r.name, 14) +
              pad(r.active ? '활성' : '중지', 8) +
              pad((r.repos || []).join(',') || '-', 20) +
              pad(r.role, 8) +
              pad(`${r.liveTokens}/${r.tokens}`, 8) +
              pad(r.lastUsed ? r.lastUsed.slice(0, 10) : '-', 14) +
              (r.label || '')
          )
        }
        return 0
      }
      err('ctx serve user: add · set · list')
      return 2
    }

    if (group === 'token') {
      if (sub === 'list') {
        const rows = auth.tokenList(db)
        const used = await lastUsed(dataDir)
        for (const t of rows) t.lastUsed = used.byToken.get(t.id) ?? null
        if (opt.json) {
          out(JSON.stringify(rows, null, 2))
          return 0
        }
        out(`${pad('id', 10)}${pad('user', 14)}${pad('발급', 12)}${pad('만료', 12)}${pad('남음', 8)}${pad('상태', 18)}메모`)
        for (const t of rows) {
          out(
            pad(t.id, 10) +
              pad(t.user, 14) +
              pad(t.issued || '-', 12) +
              pad(t.expires || '-', 12) +
              pad(t.daysLeft === null ? '무기한' : `${t.daysLeft}일`, 8) +
              pad(t.status === 'revoked' ? `폐기 ${t.revokedAt || ''}${t.revokedBy ? ' ' + t.revokedBy : ''}`.trim() : '활성', 18) +
              (t.note || '')
          )
        }
        return 0
      }
      if (sub === 'revoke') {
        const name = need(opt, 'name', '이름 (--name)')
        if (!name) return 2
        const n = auth.revoke(db, { user: name, id: opt.id || null })
        out(`폐기했다: ${n}개. 줄은 남는다(status: revoked) — **다음 요청부터** 막힌다. 서버에 세션이 없으므로 지울 다른 곳이 없다`)
        return done(`token revoke · ${name} · ${n}개${opt.id ? ' · ' + String(opt.id).slice(0, 8) : ''}`)
      }
      // 재발급 — 폐기 + 발급이 한 동작이다(검토 v0.1 §3.4). 잃은 토큰은 복구가 아니라 새것이다.
      if (sub === 'reissue') {
        const id = need(opt, 'id', '토큰 id (--id 앞 8자)')
        if (!id) return 2
        const { raw, rec, old } = auth.reissue(db, { id, note: opt.note, expiresDays: expiresOpt() })
        await auth.store(file, db)
        await auth.audit(dataDir, `token revoke · ${old.user} · 1개 · ${old.id} · reissue`)
        await auth.audit(dataDir, `token issue · ${old.user} · ${rec.id} · expires=${rec.expires} · reissue of ${old.id}`)
        out(raw)
        err('')
        err(`위 한 줄이 새 토큰 원문이다. 다시 볼 수 없다 — 본인에게 직접 전한다. 옛 토큰 ${old.id} 는 폐기됐다.`)
        err(`id ${rec.id} · 사용자 ${old.user} · 만료 ${rec.expires}`)
        return 0
      }
      if (sub === 'set') {
        const id = need(opt, 'id', '토큰 id (--id 앞 8자)')
        if (!id) return 2
        if (opt.note === undefined && opt.expires === undefined) {
          err('ctx serve token set: --note 또는 --expires 를 준다')
          return 2
        }
        const t = auth.tokenSet(db, { id, note: opt.note, expires: opt.expires })
        out(`고쳤다: ${t.id} · ${t.user} · 만료 ${t.expires} · 메모 ${t.note || '-'}`)
        return done(`token set · ${t.user} · ${t.id} · ${JSON.stringify({ note: opt.note, expires: opt.expires })}`)
      }
      // 발급
      const user = need(opt, 'user', '사용자 (--user)')
      if (!user) return 2
      const { raw, rec } = auth.issue(db, { user, expiresDays: expiresOpt(), note: opt.note ?? null })
      await auth.store(file, db)
      await auth.audit(dataDir, `token issue · ${user} · ${rec.id} · expires=${rec.expires}`)
      // **원문은 여기서 한 번만 나온다.** 파일에는 해시만 남는다.
      out(raw)
      err('')
      err(`위 한 줄이 토큰 원문이다. 다시 볼 수 없다 — 본인에게 직접 전한다(§4.4.2).`)
      err(`메신저·메일·이슈·위키에 평문으로 남기지 않는다. 남겼으면 유출로 보고 revoke 후 재발급한다.`)
      err(`id ${rec.id} · 사용자 ${user} · 만료 ${rec.expires}`)
      return 0
    }
  } catch (e) {
    err('ctx serve: ' + (e?.message || e))
    return 2
  }

  err('ctx serve: user · token 중 하나를 준다')
  return 2
}

// 로그 꼬리 — 회전분(.3 .2 .1)까지 이어 붙여 마지막 n 줄. 콘솔의 감사 · 로그 페이지가 쓴다.
// `auth.log` 는 회전하지 않는다(이력) — 그래도 같은 함수로 읽는다.
async function tailLog(dataDir, base, n = 200) {
  if (!dataDir) return { lines: [], total: 0 }
  let all = []
  for (const suf of ['.3', '.2', '.1', '']) {
    const body = await fs.readFile(path.join(dataDir, 'logs', base + suf), 'utf8').catch(() => null)
    if (body) all = all.concat(body.split(NL).filter(Boolean))
  }
  return { lines: all.slice(-n), total: all.length }
}

// **마지막 사용은 `serve.log` 에서 집계한다.** `auth.json` 에 적지 않는다 --
// 매 요청 명부 파일을 쓰면 레포 뮤텍스와 같은 경합이 생기고(§2.6), 그것도
// 읽기 요청 하나마다다. 안 쓰는 토큰을 걷어내는 용도라 하루 단위면 충분하다.
//
// 사용자별 · 토큰별 둘을 낸다. 토큰 id 는 줄 **끝** 열이다(2026-09-23 부터) —
// 앞 열은 그대로라 옛 로그도 사용자별은 읽힌다.
async function lastUsed(dataDir) {
  const byUser = new Map()
  const byToken = new Map()
  if (!dataDir) return { byUser, byToken }
  for (const name of ['serve.log.3', 'serve.log.2', 'serve.log.1', 'serve.log']) {
    const body = await fs.readFile(path.join(dataDir, 'logs', name), 'utf8').catch(() => null)
    if (!body) continue
    for (const line of body.split(NL)) {
      const f = line.split(' · ')
      if (f.length < 3 || !f[0].startsWith('20')) continue
      const user = f[1].trim()
      if (!user || user === '-') continue
      byUser.set(user, f[0])
      const last = f[f.length - 1].trim()
      if (/^[0-9a-f]{8}$/.test(last)) byToken.set(last, f[0])
    }
  }
  return { byUser, byToken }
}

// kit 에 담는 것 — `.claude/skills/cdp-*` 와 `.claude/work-repo/CLAUDE.md`.
//
// **`.claude/` 를 통째로 싸지 않는다.** 지식 레포의 `.claude` 에는 그 레포만의
// 설정이 들어갈 수 있고, 그것은 작업 레포에 갈 것이 아니다 — `agent/README` 의
// 판정 기준이 그대로다: **받는 사람에게 가는가.**
// 꾸러미에 넣을 설치기 원문. **빌드가 채운다**(`ops/lib/build-ctx.mjs`) --
// `viewer/bin/cdp-install.mjs` 를 `core/setup.js` 와 함께 번들한 텍스트다.
// 번들하지 않고 소스로 돌릴 때는 자리표시자 그대로라, 그때는 넣지 않는다.
const INSTALLER_SRC = '__CDP_INSTALLER_SRC__'
// 자리표시자 그대로면 번들이 아니다 -- 그때는 `install.mjs` 를 넣지 않는다.
// 넣으면 받는 사람이 돌지 않는 파일을 손에 쥔다.
const HAS_INSTALLER = !INSTALLER_SRC.startsWith('__CDP_INSTALLER')

async function collectKit(root) {
  const out = []
  const base = path.join(root, '.claude')

  const skills = path.join(base, 'skills')
  for (const e of await fs.readdir(skills, { withFileTypes: true }).catch(() => [])) {
    if (!e.isDirectory() || !e.name.startsWith('cdp-')) continue
    await walk(path.join(skills, e.name), '.claude/skills/' + e.name, out)
  }

  const claude = path.join(base, 'work-repo', 'CLAUDE.md')
  const body = await fs.readFile(claude).catch(() => null)
  if (body) out.push({ name: '.claude/work-repo/CLAUDE.md', data: body })

  return out.sort((a, b) => a.name.localeCompare(b.name))
}

async function walk(dir, rel, out) {
  for (const e of await fs.readdir(dir, { withFileTypes: true }).catch(() => [])) {
    const abs = path.join(dir, e.name)
    const r = rel + '/' + e.name
    if (e.isDirectory()) await walk(abs, r, out)
    else out.push({ name: r, data: await fs.readFile(abs) })
  }
}

// 로그인 뒤 돌아갈 곳. **밖으로 보내지 않는다** — `//evil.example` 같은 값이
// 오면 열린 리다이렉트가 된다.
function safeNext(v, dflt = '/') {
  const t = String(v || dflt)
  return /^\/(?!\/)/.test(t) ? t : dflt
}

// 로그인 뒤 갈 곳 — **역할이 정한다**(화면의 `landingFor` 와 같은 규칙). admin 은 콘솔 · 나머지는 레포(`/r` 이 첫 레포를 고른다).
// `next` 는 그 역할이 갈 수 있을 때만 — 로그인 · 로그아웃 · 마법사로 되돌아가지 않고(`next` 가 겹쳐 로그인 화면에 머물던 것),
// 콘솔은 admin 에게만(다른 사람이 콘솔 자리에서 로그인해 권한 안내를 첫 화면으로 보던 것).
function landingOf(next, role) {
  const admin = role === 'admin'
  const home = admin ? '/console' : '/r'
  const p = String(next || '').split(/[?#]/)[0]
  if (!p || p === '/' || p === '/r' || p === '/r/') return home
  if (/^[/](login|logout|setup)([/]|$)/.test(p)) return home
  if (/^[/]console([/]|$)/.test(p) && !admin) return home
  return next
}

function page(title, body) {
  return `<!doctype html><html lang="ko"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title>
<style>:root{color-scheme:light dark;--bg:#fff;--fg:#2C2C2A;--mut:#5F5E5A;--line:#B4B2A9}
@media(prefers-color-scheme:dark){:root{--bg:#1b1b1a;--fg:#eceae4;--mut:#a8a69f;--line:#484743}}
body{margin:0;padding:40px 24px;background:var(--bg);color:var(--fg);
font:14px/1.7 'Pretendard','Malgun Gothic',system-ui,sans-serif}
main{max-width:620px;margin:0 auto}h1{font-size:19px;margin:0 0 6px}
.mut{color:var(--mut)}a{color:inherit}code{font-family:ui-monospace,monospace}
hr{border:0;border-top:1px solid var(--line);margin:22px 0}</style><main>${body}</main>`
}

// 설명서 색인 — 산출물의 `manual/`(검토 §4.5). 책은 `*_설명서.md`, 넷째는 `deploy/설치절차.md`,
// 그림은 `manual/그림/*.svg`(소스에서는 `docs/그림`). **목록 밖은 없는 것이다** — `/site/manual/<이름>`
// 이 여기서만 파일을 찾으므로 경로 순회가 성립하지 않는다.
async function manualIndex(manualDir) {
  const items = []
  let figDir = null
  let figures = []
  // 읽는 순서 — 사용자 · 관리자 · 개발자(설명서 표 그대로). 파일명 정렬은 '개발자' 가 먼저다.
  const ORDER = ['사용자_설명서.md', '관리자_설명서.md', '개발자_설명서.md']
  const rank = (n) => (ORDER.includes(n) ? ORDER.indexOf(n) : ORDER.length)
  if (manualDir) {
    for (const n of (await fs.readdir(manualDir).catch(() => [])).sort((a, b) => rank(a) - rank(b) || a.localeCompare(b))) {
      if (!/_설명서\.md$/.test(n)) continue
      items.push({ id: n.replace(/\.md$/, ''), title: await titleOfMd(path.join(manualDir, n)), file: path.join(manualDir, n) })
    }
    for (const cand of [path.resolve(manualDir, '..', 'deploy', '설치절차.md'), path.resolve(manualDir, '..', 'ops', 'deploy', '설치절차.md')]) {
      if (await fs.access(cand).then(() => true).catch(() => false)) {
        items.push({ id: '설치절차', title: await titleOfMd(cand), file: cand })
        break
      }
    }
    for (const cand of [path.join(manualDir, '그림'), path.resolve(manualDir, '..', 'docs', '그림')]) {
      const names = await fs.readdir(cand).catch(() => null)
      if (names) {
        figDir = cand
        figures = names.filter((n) => /\.svg$/i.test(n))
        break
      }
    }
  }
  return {
    list: () => items.map(({ id, title }) => ({ id, title })),
    resolve: (rel) => {
      const id = String(rel || '').replace(/\.md$/, '')
      const hit = items.find((x) => x.id === id)
      if (hit) return hit.file
      const g = /^그림\/([^/]+\.svg)$/i.exec(String(rel || ''))
      if (g && figDir && figures.includes(g[1])) return path.join(figDir, g[1])
      return null
    },
  }
}

async function titleOfMd(file) {
  const body = await fs.readFile(file, 'utf8').catch(() => '')
  const h = body.split(NL).find((l) => l.startsWith('# '))
  return h ? h.slice(2).trim().replace(/[*`]/g, '') : path.basename(file, '.md')
}

// SPA 정적 서빙.
//
// `/r/<repo>/무엇이든` 은 전부 `index.html` 이다 — 라우팅은 화면이 한다.
// 자산(`/assets/…`)만 실제 파일로 낸다.
async function serveWeb({ req, res, url, webDir, log, status = 200 }) {
  let rel = decodeURIComponent(url.pathname)
  const asset = /^\/(assets\/.+|[^/]+\.(?:js|css|svg|png|ico|woff2?))$/.exec(rel)
  rel = asset ? rel : '/index.html'

  const abs = path.resolve(webDir, '.' + rel)
  if (!abs.startsWith(path.resolve(webDir))) {
    res.writeHead(403).end()
    return
  }
  let buf = await fs.readFile(abs).catch(() => null)
  if (!buf) {
    if (asset) {
      res.writeHead(404).end()
      return
    }
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
    return res.end(page('CDP', `<h1>화면이 빌드되지 않았습니다</h1>
<p class="mut"><code>npm run build</code> 를 돌려 <code>ops/out/web</code> 을 만든 뒤
서버의 <code>--web</code> 로 가리키거나 그 자리에 두세요.</p>
<hr><p class="mut">읽기 API 와 MCP 는 화면 없이도 돕니다.</p>`))
  }
  // **같은 번들이 로컬 뷰어에서도 돈다**(§6.8). `/r/` 밖의 경로(`/` · `/manual` · `/console`)에서
  // 화면이 자기가 서버에서 왔는지 알 길이 없어 한 줄을 심는다 — 왕복 없이 첫 렌더에서 갈린다.
  // `<head>` 의 **첫 줄**에 심는다 — 그 뒤에 오는 인라인 테마 스크립트(index.html · CSS 앞)와 모듈 스크립트가 먼저 본다.
  if (rel === '/index.html') buf = Buffer.from(buf.toString('utf8').replace('<head>', '<head><script>window.__CDP_SERVER__=true</script>'), 'utf8')
  res.writeHead(rel === '/index.html' ? status : 200, {
    'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
    'cache-control': rel === '/index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
  })
  res.end(buf)
}

// 명부의 이름들. 대장의 `owner` 가 여기 있어야 한다(§6.7.2).
async function usersOf(authFile) {
  if (!authFile) return []
  const db = await auth.load(authFile).catch(() => auth.emptyDb())
  return db.users.filter((u) => u.active !== false).map((u) => u.name)
}

// 클라이언트가 서버를 부를 주소.
//
// **요청이 들어온 주소를 쓴다.** 서버가 자기 주소를 따로 알 방법이 없고,
// 프록시 뒤에 있으면 바인드 주소와 바깥 주소가 다르다. 프록시가 `Forwarded`
// 계열을 넣어 주면 그것을 본다.
function publicOrigin(req, opt) {
  if (opt.publicUrl) return String(opt.publicUrl).replace(/\/+$/, '')
  const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim() || 'http'
  const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim()
  return `${proto}://${host}`
}

// 꾸러미 안의 안내. **`bin/ctx` 없이 설치되는 길**이 여기 적힌다(§6.7.1) —
// 그래서 설치 부트스트랩이 사라진다.
function installNote({ origin, repo, row, kit }) {
  return `# ${row.name} 에 CDP 붙이기

이 꾸러미는 \`${repo}\` 지식 레포의 것이다. kit ${kit}

## 1. 이 zip 을 **아무 데나** 푼다

작업 레포가 아니어도 된다. 안에 든 것은 —

    설치.md      이 파일
    install.mjs  실행기
    kit/         작업 레포에 들어갈 것들

**\`kit/\` 안의 것은 아직 아무 데도 안 갔다.** 옮기는 일은 아래가 한다.

## 2. 설치한다 — 토큰은 설치기가 묻는다

    node install.mjs <작업 레포 경로>

1. **토큰** — \`CDP_TOKEN\` 이 있으면 서버에 확인한다. 없거나 안 통하면 **붙여넣으라고 묻는다**(화면에 안 보인다).
   관리자에게 받은 것이다 — **이 꾸러미에 토큰은 없다.** 메신저·메일에 남기지 않는다.
   통하면 이 PC 에 둘지 묻는다 — Windows 는 사용자 환경변수, macOS · Linux 는 \`~/.config/cdp/token\` + 셸 rc 한 줄.
   건너뛰어도(그냥 Enter) 설치는 되고, 관리 화면의 이 작업 레포 행이 \`미설치\` 로 남을 뿐이다.
2. **바뀔 것** — 먼저 보여 주고 묻는다. 미리만 보려면 \`--dry\`, 묻지 않으려면 \`--yes\`(그때 토큰은 \`CDP_TOKEN\` 에서만).

- \`CLAUDE.md\` 가 이미 있으면 \`<!-- cdp:begin -->\` ~ \`<!-- cdp:end -->\` **블록만** 갈아 끼운다
- \`.mcp.json\` 이 이미 있으면 \`cdp\` 항목만 더한다 — **다른 MCP 서버는 그대로 둔다**
- 작업 레포의 \`cdp-\` 아닌 skill 은 건드리지 않는다
- 토큰이 있으면 설치 대장에 보고까지 한다 — 바뀐 것이 없어도 보고한다(pull 로 받은 사람도 한 번 돌린다)

**zip 없이도 된다.** 관리 화면의 작업 레포 › [설치 방법] 에 작업 레포 폴더에서 붙여넣는 **명령 한 줄**이 있다 — 하는 일은 이것과 같다.

### Node 가 없으면

\`kit/\` 안의 것을 손으로 옮긴다. **덮어쓰기 전에 두 파일을 본다** —

    kit/.claude/skills/cdp-*   →  <작업레포>/.claude/skills/     그대로 복사
    kit/.claude/cdp.json       →  <작업레포>/.claude/cdp.json    그대로 복사
    kit/.mcp.json              →  이미 있으면 mcpServers.cdp 항목만 더한다
    kit/CLAUDE.md              →  이미 있으면 cdp:begin ~ cdp:end 블록만 갈아 끼운다

\`bin/ctx\` 를 가진 사람은 이것도 된다 —
\`ctx setup --server ${origin} --repo ${repo} --workrepo ${row.id} <작업레포>\`

## 3. Claude Code 를 다시 켠다

**완전히** 끄고 켠다 — 환경변수는 프로세스 시작 때 읽힌다. VS Code · 데스크톱 앱 안이면 그 앱을 다시 켠다.
\`/mcp\` 에 \`cdp\` 가 connected 면 된 것이다.

## 4. 커밋한다

    git add .mcp.json .claude CLAUDE.md
    git commit -m "CDP 붙인다 — ${repo}"

**팀원은 여기서부터 \`git pull\` 과 토큰만으로 끝난다.** 이 꾸러미를
다시 받을 필요가 없다 — 토큰을 이 PC 에 두는 것도 설치 명령을 한 번 돌리면 묻는다.
`
}
