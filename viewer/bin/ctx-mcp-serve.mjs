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
import { buildServer, makeRepoCache, mirrorOf, BUILT } from './ctx-mcp.mjs'
import { newRepo, REPO_NAME_RE } from '../../core/reponew.js'
import { listPackages as listPackageDirs } from '../../core/packages.js'
import { resolvePackages, materializePackage } from './ctx-package.mjs'

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

  return {
    async list() {
      if (Date.now() - at > 60_000) await refresh()
      return repos
    },
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
  if (!authFile) {
    log.line('경고: --auth 가 없다. 인증 없이 돈다 (개발용). 루프백에서만 허용한다')
    return async () => ({ ok: true, user: '(dev)', allow: null, write: false, expiresInDays: null })
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
      log.line(`명부: 사용자 ${db.users.length}명 · 토큰 ${db.tokens.length}개`)
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

function setCookie(res, value, { maxAge = 12 * 3600, secure = false } = {}) {
  const parts = [`cdp_s=${value}`, 'Path=/', 'HttpOnly', 'SameSite=Lax', `Max-Age=${maxAge}`]
  // 평문 HTTP 배치에서는 Secure 를 붙이면 쿠키가 아예 안 간다(§9.4).
  if (secure) parts.push('Secure')
  res.setHeader('set-cookie', parts.join('; '))
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
    const key = tool === 'search' ? `words:${(a.words || []).length}` : a.coord || a.id || null
    return { method: one?.method || null, tool, key }
  } catch {
    return { method: null, tool: null, key: null }
  }
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
  // 패키지 — `POST /repos` 가 여기서 복사한다(검토 §3.5). 없어도 서버는 돈다.
  const pk = await resolvePackages({ explicit: opt.packages, binDir: hereDir(import.meta.url) })
  log.line(pk ? `패키지: ${pk.dir} (${pk.how})` : '패키지: 없음 — 화면에서 레포를 세우려면 --packages')
  const authenticate = makeAuth({ authFile: opt.auth, log })
  // 서명 비밀. 갈면 전원 재로그인이다(§6.4).
  const secret = dataDir ? await auth.loadSecret(dataDir) : Buffer.from('dev-only-secret-not-persisted!!')
  if (!dataDir) log.line('경고: --data 가 없어 세션 비밀이 프로세스마다 바뀐다 (개발용)')
  const secureCookie = String(opt.server || '').startsWith('https://')

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
        saver: (name, input) => {
          const r = repos.find((x) => x.name === name)
          return doSave(r.root, input, {
            user: a.user,
            write: a.write,
            mirror: !!opt.mirror,
            log: (m) => log.line(m),
          }).then((out) => {
            store.reload(name) // 화면이 방금 커밋한 것을 봐야 한다
            return out
          })
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
        const mirror = { ok: 0, lag: 0, off: 0 }
        for (const r of list) {
          mirror[mirrorOf(await git.status(r.root).catch(() => null))]++
        }
        return json(res, 200, { ok: true, built: BUILT, repos: list.length, mirror })
      }

      // 브라우저 경로(`/api` · `/r`)는 쿠키를, 나머지는 Bearer 를 본다(§6.4).
      //
      // **`/kit` 도 여기 있다.** 화면의 내려받기는 `<a href download>` 라
      // `Authorization` 을 달 수 없고 쿠키만 간다 -- Bearer 전용으로 두면
      // 401 JSON 이 내려와 브라우저가 그것을 `<이름>.json` 으로 저장한다(실측).
      // `browser()` 는 Bearer 도 받아 주므로 `ctx setup` 쪽은 그대로다.
      const isBrowserPath =
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/r/') ||
        url.pathname.startsWith('/kit/') ||
        url.pathname === '/' ||
        url.pathname === '/me' ||
        url.pathname === '/repos' ||
        url.pathname === '/packages' ||
        url.pathname.startsWith('/workrepos')
      // 화면 자산 — **인증 앞에서 낸다.**
      //
      // 로그인 화면을 그리려면 그 전에 받아야 하고, 담긴 것은 빌드 산출물뿐이라
      // 숨길 것이 없다. 인증 뒤에 두면 401 이 나서 화면이 아예 안 뜬다 —
      // 실측으로 잡았다.
      if (/^\/(assets\/|favicon|[^/]+\.(?:js|css|svg|png|ico|woff2?)$)/.test(url.pathname)) {
        return serveWeb({ req, res, url, webDir, log })
      }

      // ── 로그인 (§6.6.1) — 인증 앞에 온다
      if (url.pathname === '/login') {
        if (req.method === 'GET') {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          return res.end(loginPage({ next: url.searchParams.get('next') || '/' }))
        }
        if (req.method === 'POST') {
          const body = (await readBody(req, 64 * 1024)) || Buffer.alloc(0)
          const form = new URLSearchParams(body.toString('utf8'))
          const token = (form.get('token') || '').trim()
          const next = safeNext(form.get('next'))
          const d = await authenticate.login(token)
          log.req({ ip, method: 'POST', tool: '/login', key: d.ok ? d.user : '-', ms: Date.now() - t0, status: d.ok ? 302 : 401, code: d.ok ? null : d.message })
          if (!d.ok) {
            res.writeHead(401, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
            return res.end(loginPage({ next, failed: true }))
          }
          setCookie(res, auth.signSession(secret, d.user), { secure: secureCookie })
          res.writeHead(302, { location: next })
          return res.end()
        }
      }
      if (url.pathname === '/logout') {
        setCookie(res, '', { maxAge: 0, secure: secureCookie })
        res.writeHead(302, { location: '/login' })
        return res.end()
      }

      const a = isBrowserPath
        ? await authenticate.browser(req.headers, secret)
        : await authenticate.bearer(req.headers)
      if (!a.ok) {
        log.req({ ip, method: req.method, key: url.pathname, ms: Date.now() - t0, status: a.status, code: a.code, tool: a.message })
        // 화면 경로면 로그인으로 보낸다. **보던 곳을 들고 간다**(§6.6.1) —
        // 돌아왔을 때 처음부터 다시 찾게 하지 않는다.
        if (url.pathname.startsWith('/r/') || url.pathname === '/') {
          res.writeHead(302, { location: '/login?next=' + encodeURIComponent(url.pathname + url.search) })
          return res.end()
        }
        return json(res, a.status, { error: { code: a.code, message: a.message } })
      }

      // GET /me — 화면 껍데기가 한 번에 필요한 것. 누구인가 · 무엇을 볼 수
      // 있는가. **모드는 묻지 않는다** — 화면이 `/r/` 로 서빙됐으면 서버 모드다.
      if (url.pathname === '/me' && req.method === 'GET') {
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const rows = []
        for (const r of mine) rows.push({ name: r.name, title: await titleOf(r.root) })
        log.req({ ip, user: a.user, method: 'GET', tool: '/me', ms: Date.now() - t0, status: 200 })
        return json(res, 200, { mode: 'server', user: a.user, label: a.label ?? null, write: !!a.write, repos: rows })
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

      // POST /repos { name, package, origin? } — 지식 레포를 **세운다**(검토 §3.5 · R6).
      //
      // 등록 = 폴더를 두는 것(설계서 §4.2)은 그대로다. clone 이 한 길이고 이것이
      // 다른 길이다. `write` 가 있어야 한다 — origin 에 커밋을 만드는 일이다.
      // 판정은 `core/reponew.js` 하나 — CLI `ctx repo new` 와 같은 함수다.
      if (url.pathname === '/repos' && req.method === 'POST') {
        if (!a.write) {
          log.req({ ip, user: a.user, method: 'POST', tool: '/repos', ms: Date.now() - t0, status: 403, code: 'E_FORBIDDEN' })
          return json(res, 403, { error: { code: 'E_FORBIDDEN', message: '쓰기 권한이 없다 — 레포를 세우는 것은 write 인 사람만' } })
        }
        let body
        try {
          body = JSON.parse((await readBody(req, 64 * 1024)).toString('utf8') || '{}')
        } catch {
          return json(res, 400, { error: { code: 'E_INPUT', message: '본문이 JSON 이 아니다' } })
        }
        const name = String(body.name || '').trim()
        const pkgName = String(body.package || '').trim()
        const origin = body.origin ? String(body.origin).trim() : null
        if (!REPO_NAME_RE.test(name)) return json(res, 400, { error: { code: 'E_INPUT', message: '레포 이름 형식이 아니다 (영문·숫자·._-)' } })
        if (!pk) return json(res, 400, { error: { code: 'E_INPUT', message: '서버에 패키지 폴더가 없다 — --packages' } })
        if (!pkgName) return json(res, 400, { error: { code: 'E_INPUT', message: 'package 가 필요하다' } })
        if ((await store.list()).some((r) => r.name === name) || (await fs.stat(path.join(root, name)).catch(() => null))) {
          return json(res, 409, { error: { code: 'E_EXISTS', message: '그 이름의 레포가 이미 있다', detail: { name } } })
        }
        let mat
        try {
          mat = await materializePackage(pk, pkgName)
        } catch (e) {
          // 패키지가 여럿이면 이름을 알아야 고른다 — 없는 이름을 줬을 때 있는 것을 같이 낸다
          const names = e.code === 'E_NOT_FOUND' ? (await listPackageDirs(pk.dir).catch(() => [])).map((p) => p.name) : []
          return json(res, e.code === 'E_NOT_FOUND' ? 404 : 400, {
            error: {
              code: e.code || 'E_INPUT',
              message: e.message + (names.length ? ' — 있는 패키지: ' + names.join(' · ') : ''),
              detail: names.length ? { packages: names } : undefined,
            },
          })
        }
        try {
          const r = await newRepo({ from: mat.from, dest: path.join(root, name), origin, push: !!origin, author: a.user })
          await store.refresh()
          await auth.audit(dataDir, `repo new · ${a.user} · ${name} · package=${pkgName}${origin ? ' · origin=' + origin : ''}${r.pushed ? ' · pushed' : ''}`)
          log.req({ ip, user: a.user, method: 'POST', tool: '/repos', key: name, ms: Date.now() - t0, status: 200 })
          return json(res, 200, { name, package: pkgName, commit: r.commit, files: r.files, origin: r.origin, pushed: !!r.pushed, pushError: r.pushError || null })
        } catch (e) {
          const code = e?.code || 'E_REPO'
          log.req({ ip, user: a.user, method: 'POST', tool: '/repos', key: name, ms: Date.now() - t0, status: 400, code })
          return json(res, code === 'E_EXISTS' ? 409 : 400, { error: { code, message: e.message, detail: e.detail } })
        } finally {
          await mat.cleanup()
        }
      }

      if (url.pathname === '/repos' && req.method === 'GET') {
        const list = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const rows = []
        for (const r of list) {
          const st = await git.status(r.root).catch(() => null)
          rows.push({
            name: r.name,
            title: await titleOf(r.root),
            head: st?.head ?? null,
            branch: st?.branch ?? null,
            mirror: mirrorOf(st),
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
            return json(res, 200, { repos: rows, users: await usersOf(opt.auth), write: !!a.write })
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
            const row = wr.add(db, body, { users: await usersOf(opt.auth), repos: mine.map((r) => r.name) })
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
        const out = await CTX.run({ auth: a, repos }, () => handler.fetch(request)).catch((e) => {
          log.line('fetch: ' + (e?.message || e))
          return new Response(JSON.stringify({ error: { code: 'E_REPO', message: String(e?.message || e) } }), { status: 500 })
        })

        log.req({
          ip,
          user: a.user,
          repo: /^\/mcp\/([^/]+)/.exec(url.pathname)?.[1] || '-',
          method: seen.method,
          tool: seen.tool,
          key: seen.key,
          ms: Date.now() - t0,
          status: out.status,
        })
        res.writeHead(out.status, Object.fromEntries(out.headers))
        if (!out.body) return res.end()
        const reader = out.body.getReader()
        for (;;) {
          const { done, value } = await reader.read()
          if (done) break
          res.write(Buffer.from(value))
        }
        return res.end()
      }

      // `GET /` → 기본 레포로. 볼 수 있는 레포가 없으면 그렇게 말하고 멈춘다
      // (§6.6.1) — 토큰은 맞으므로 401 로 돌려보내지 않는다.
      if (url.pathname === '/' || /^\/r(\/.*)?$/.test(url.pathname)) {
        const mine = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        if (!mine.length) {
          res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' })
          return res.end(emptyPage(a.user))
        }
        const m = /^\/r\/([^/]+)/.exec(url.pathname)
        if (!m) {
          res.writeHead(302, { location: '/r/' + encodeURIComponent(mine[0].name) + '/' })
          return res.end()
        }
        if (!mine.some((r) => r.name === decodeURIComponent(m[1]))) {
          res.writeHead(302, { location: '/r/' + encodeURIComponent(mine[0].name) + '/' })
          return res.end()
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
        const u = auth.userAdd(db, { name, label: opt.label ?? null, repos: reposOpt() ?? [], write: !!opt.write })
        out(`명부에 넣었다: ${u.name} · repos ${u.repos.join(',') || '(없음)'} · write ${u.write}`)
        return done(`user add · ${u.name} · repos=${u.repos.join(',')} · write=${u.write}`)
      }
      if (sub === 'set') {
        const name = need(opt, 'name', '이름')
        if (!name) return 2
        const patch = {}
        if (opt.label !== undefined) patch.label = opt.label
        const r = reposOpt()
        if (r !== undefined) patch.repos = r
        if (opt.write !== undefined) patch.write = opt.write
        if (opt.active !== undefined) patch.active = opt.active
        const u = auth.userSet(db, name, patch)
        out(`고쳤다: ${u.name} · active ${u.active} · repos ${(u.repos || []).join(',')} · write ${u.write}`)
        return done(`user set · ${u.name} · ${JSON.stringify(patch)}`)
      }
      if (sub === 'list' || sub === undefined) {
        const rows = auth.userList(db, { repo: opt.repoFilter || null })
        const used = await lastUsed(dataDir)
        for (const r of rows) r.lastUsed = used.get(r.name) ?? null
        if (opt.json) {
          out(JSON.stringify(rows, null, 2))
          return 0
        }
        if (opt.repoFilter) out(`${opt.repoFilter} 를 볼 수 있는 사람 ${rows.length}명`)
        out(`${pad('이름', 14)}${pad('상태', 8)}${pad('레포', 20)}${pad('쓰기', 6)}${pad('토큰', 8)}${pad('마지막 사용', 14)}설명`)
        for (const r of rows) {
          out(
            pad(r.name, 14) +
              pad(r.active ? '활성' : '중지', 8) +
              pad((r.repos || []).join(',') || '-', 20) +
              pad(r.write ? 'write' : '-', 6) +
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
        if (opt.json) {
          out(JSON.stringify(rows, null, 2))
          return 0
        }
        out(`${pad('id', 10)}${pad('user', 14)}${pad('발급', 12)}${pad('만료', 12)}${pad('남음', 8)}메모`)
        for (const t of rows) {
          out(
            pad(t.id, 10) +
              pad(t.user, 14) +
              pad(t.issued || '-', 12) +
              pad(t.expires || '-', 12) +
              pad(t.daysLeft === null ? '무기한' : `${t.daysLeft}일`, 8) +
              (t.note || '')
          )
        }
        return 0
      }
      if (sub === 'revoke') {
        const name = need(opt, 'name', '이름 (--name)')
        if (!name) return 2
        const n = auth.revoke(db, { user: name, id: opt.id || null })
        out(`지웠다: ${n}개. **다음 요청부터** 막힌다 — 서버에 세션이 없으므로 지울 다른 곳이 없다`)
        return done(`token revoke · ${name} · ${n}개`)
      }
      // 발급
      const user = need(opt, 'user', '사용자 (--user)')
      if (!user) return 2
      const { raw, rec } = auth.issue(db, {
        user,
        expiresDays: opt.expires === 'never' ? 'never' : Number(opt.expires || auth.DEFAULT_EXPIRES_DAYS),
        note: opt.note ?? null,
      })
      await auth.store(file, db)
      await auth.audit(dataDir, `token issue · ${user} · ${rec.sha256.slice(0, 8)} · expires=${rec.expires}`)
      // **원문은 여기서 한 번만 나온다.** 파일에는 해시만 남는다.
      out(raw)
      err('')
      err(`위 한 줄이 토큰 원문이다. 다시 볼 수 없다 — 본인에게 직접 전한다(§4.4.2).`)
      err(`메신저·메일·이슈·위키에 평문으로 남기지 않는다. 남겼으면 유출로 보고 revoke 후 재발급한다.`)
      err(`id ${rec.sha256.slice(0, 8)} · 사용자 ${user} · 만료 ${rec.expires}`)
      return 0
    }
  } catch (e) {
    err('ctx serve: ' + (e?.message || e))
    return 2
  }

  err('ctx serve: user · token 중 하나를 준다')
  return 2
}

// **마지막 사용은 `serve.log` 에서 집계한다.** `auth.json` 에 적지 않는다 --
// 매 요청 명부 파일을 쓰면 레포 뮤텍스와 같은 경합이 생기고(§2.6), 그것도
// 읽기 요청 하나마다다. 안 쓰는 토큰을 걷어내는 용도라 하루 단위면 충분하다.
async function lastUsed(dataDir) {
  const out = new Map()
  if (!dataDir) return out
  for (const name of ['serve.log.3', 'serve.log.2', 'serve.log.1', 'serve.log']) {
    const body = await fs.readFile(path.join(dataDir, 'logs', name), 'utf8').catch(() => null)
    if (!body) continue
    for (const line of body.split(NL)) {
      const f = line.split(' · ')
      if (f.length < 3 || !f[0].startsWith('20')) continue
      const user = f[1].trim()
      if (!user || user === '-') continue
      out.set(user, f[0])
    }
  }
  return out
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
function safeNext(v) {
  const t = String(v || '/')
  return /^\/(?!\/)/.test(t) ? t : '/'
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

function emptyPage(user) {
  return page('CDP', `<h1>볼 수 있는 지식 레포가 없습니다</h1>
<p class="mut">계정 <code>${user}</code> 에 아직 레포 권한이 없습니다. 관리자에게 문의하세요.</p>
<hr><p class="mut"><a href="/logout">로그아웃</a></p>`)
}

// 6.2 에서 React 화면이 이 자리를 가져간다. 지금은 **서버가 붙었다는 것**과
// 레포 전환이 도는 것을 보이는 최소 껍데기다.
function shellPage({ user, repo, repos }) {
  const list = repos
    .map((r) => (r === repo ? `<strong>${r}</strong>` : `<a href="/r/${encodeURIComponent(r)}/">${r}</a>`))
    .join(' · ')
  return page(
    `${repo} · CDP`,
    `<h1>${repo}</h1>
<p class="mut">레포 ${list}</p>
<hr>
<p class="mut">화면은 6.2 에서 붙습니다. 읽기 API 는 이미 돕니다 —</p>
<p><code>/api/${repo}/status</code> · <code>/api/${repo}/docs</code> · <code>/api/${repo}/managed</code></p>
<hr><p class="mut">${user} · <a href="/logout">로그아웃</a></p>`
  )
}

// SPA 정적 서빙.
//
// `/r/<repo>/무엇이든` 은 전부 `index.html` 이다 — 라우팅은 화면이 한다.
// 자산(`/assets/…`)만 실제 파일로 낸다.
async function serveWeb({ req, res, url, webDir, log }) {
  let rel = decodeURIComponent(url.pathname)
  const asset = /^\/(assets\/.+|[^/]+\.(?:js|css|svg|png|ico|woff2?))$/.exec(rel)
  rel = asset ? rel : '/index.html'

  const abs = path.resolve(webDir, '.' + rel)
  if (!abs.startsWith(path.resolve(webDir))) {
    res.writeHead(403).end()
    return
  }
  const buf = await fs.readFile(abs).catch(() => null)
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
  res.writeHead(200, {
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

## 2. 설치한다

    node install.mjs <작업 레포 경로>

무엇이 바뀔지 먼저 보여 주고 묻는다. 미리만 보려면 \`--dry\`, 묻지 않으려면 \`--yes\`.

- \`CLAUDE.md\` 가 이미 있으면 \`<!-- cdp:begin -->\` ~ \`<!-- cdp:end -->\` **블록만** 갈아 끼운다
- \`.mcp.json\` 이 이미 있으면 \`cdp\` 항목만 더한다 — **다른 MCP 서버는 그대로 둔다**
- 작업 레포의 \`cdp-\` 아닌 skill 은 건드리지 않는다
- \`CDP_TOKEN\` 이 있으면 설치 대장에 보고까지 한다

### Node 가 없으면

\`kit/\` 안의 것을 손으로 옮긴다. **덮어쓰기 전에 두 파일을 본다** —

    kit/.claude/skills/cdp-*   →  <작업레포>/.claude/skills/     그대로 복사
    kit/.claude/cdp.json       →  <작업레포>/.claude/cdp.json    그대로 복사
    kit/.mcp.json              →  이미 있으면 mcpServers.cdp 항목만 더한다
    kit/CLAUDE.md              →  이미 있으면 cdp:begin ~ cdp:end 블록만 갈아 끼운다

\`bin/ctx\` 를 가진 사람은 이것도 된다 —
\`ctx setup --server ${origin} --repo ${repo} --workrepo ${row.id} <작업레포>\`

## 3. 토큰을 환경변수에 둔다

    # macOS · Linux
    export CDP_TOKEN=<관리자에게 받은 토큰>
    # Windows
    setx CDP_TOKEN <관리자에게 받은 토큰>

**이 꾸러미에 토큰은 없다.** 관리자에게 직접 받는다 — 메신저·메일에 남기지 않는다.

## 4. Claude Code 를 다시 켠다

환경변수는 프로세스 시작 때 읽힌다. \`/mcp\` 에 \`cdp\` 가 connected 면 된 것이다.

## 5. 커밋한다

    git add .mcp.json .claude CLAUDE.md
    git commit -m "CDP 붙인다 — ${repo}"

**팀원은 여기서부터 \`git pull\` 과 \`CDP_TOKEN\` 만으로 끝난다.** 이 꾸러미를
다시 받을 필요가 없다.
`
}
