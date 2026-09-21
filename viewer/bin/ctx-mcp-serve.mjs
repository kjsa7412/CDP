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
import { buildServer, makeRepoCache, BUILT } from './ctx-mcp.mjs'

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

// ── 인증 자리 (4.2 에서 채운다) ─────────────────────────────────────────────
//
// 지금은 통과시킨다. **그래서 `--auth` 없이 루프백 밖에 바인드하는 것을
// 막는다** — 자물쇠가 없는데 문을 밖으로 내면 그것은 실수가 아니라 사고다.

const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|::1|\[::1\])$/i

function makeAuth({ authFile, log }) {
  if (!authFile) {
    log.line('경고: --auth 가 없다. 인증 없이 돈다 (개발용). 루프백에서만 허용한다')
    return () => ({ ok: true, user: '(dev)', allow: null, write: false })
  }
  // 4.2 — auth.json 의 명부와 5단계 판정이 여기 들어온다(§4.4).
  return () => ({ ok: false, status: 401, code: 'E_AUTH', message: '인증이 아직 구현되지 않았다 (4.2단계)' })
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
    log.line(`경고: --bind ${bind} — 밖에서 닿는다. TLS·레이트리밋은 프록시가 한다(§4.9)`)
  }

  const store = makeStore(root, log)
  await store.refresh()
  const auth = makeAuth({ authFile: opt.auth, log })

  // 요청마다 서버를 새로 만든다(stateless). 레포 캐시는 store 가 들고 있으므로
  // 여기서 만드는 것은 **등록표뿐**이다 -- 레포를 다시 읽지 않는다.
  const handler = createMcpHandler(
    (ctx) => {
      const url = new URL(ctx.requestInfo?.url || 'http://x/mcp')
      const m = /^\/mcp(?:\/([^/]+))?\/?$/.exec(url.pathname)
      const fixed = m?.[1] ? decodeURIComponent(m[1]) : null
      const { auth: a, repos } = CTX.getStore() || { auth: { allow: null }, repos: [] }
      return buildServer({
        repos,
        // `/mcp/<name>` 이면 그 레포가 기본이다. `/mcp` 면 권한 안의 레포가
        // 하나일 때만 정해진다 — 임의로 고르지 않는다(§2.9).
        fallback: fixed || (repos.length === 1 ? repos[0].name : null),
        mode: 'server',
        prompts: opt.prompts || 'auto',
        allow: a.allow,
      })
    },
    { legacy: 'stateless', onerror: (e) => log.line('handler: ' + (e?.message || e)) }
  )

  const onRequest = async (req, res) => {
    const t0 = Date.now()
    const url = new URL(req.url, 'http://' + (req.headers.host || 'localhost'))
    const ip = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim() || req.socket.remoteAddress || '-'

    // **Origin 이 있으면 브라우저가 부른 것이다.** MCP 호스트는 Origin 을 보내지
    // 않는다. 외부 페이지의 fetch 가 루프백 서버를 찌르는 길을 여기서 끊는다.
    const origin = req.headers.origin
    if (origin) {
      let host = ''
      try {
        host = new URL(origin).hostname
      } catch {}
      if (!LOOPBACK.test(host)) {
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
          const st = await git.status(r.root).catch(() => null)
          mirror[st?.repo ? (st.upstream ? 'ok' : 'off') : 'off']++
        }
        return json(res, 200, { ok: true, built: BUILT, repos: list.length, mirror })
      }

      const a = auth(req.headers)
      if (!a.ok) {
        log.req({ ip, method: req.method, key: url.pathname, ms: Date.now() - t0, status: a.status, code: a.code })
        return json(res, a.status, { error: { code: a.code, message: a.message } })
      }

      if (url.pathname === '/repos' && req.method === 'GET') {
        const list = (await store.list()).filter((r) => !a.allow || a.allow(r.name))
        const rows = []
        for (const r of list) {
          const st = await git.status(r.root).catch(() => null)
          rows.push({
            name: r.name,
            title: await titleOf(r.root),
            head: st?.branch ?? null,
            mirror: st?.upstream ? 'ok' : 'off',
          })
        }
        log.req({ ip, user: a.user, method: 'GET', tool: '/repos', ms: Date.now() - t0, status: 200 })
        return json(res, 200, rows)
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
