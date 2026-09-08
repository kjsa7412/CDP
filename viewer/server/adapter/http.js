// HTTP + SSE 어댑터 — 얇게 유지한다.
//
// 설계서 §8: core 는 HTTP 를 모른다. §5.4 의 Tauri 전환이 오면 이 파일만
// IPC 로 갈아끼우고 화면 코드는 손대지 않는다. 그것이 3층으로 나눈 유일한 이유다.

import http from 'node:http'
import fs from 'node:fs/promises'
import fsSync from 'node:fs'
import path from 'node:path'
import { exec } from 'node:child_process'
import { SESSION_TOKEN, makeGuard, checkToken, resolveInside, isExecutable } from './security.js'
import { hereDir } from '../runtime.js'

const CLIENT_DIR = path.resolve(hereDir(import.meta.url), '../../../out/web')

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.woff2': 'font/woff2',
  '.md': 'text/markdown; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

export function createServer({ store, appState, host, port, onIdle, devProxy }) {
  const clients = new Set()
  let lastBeat = Date.now()

  const send = (res, status, body, headers = {}) => {
    const buf = typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body)
    res.writeHead(status, {
      'content-type': 'application/json; charset=utf-8',
      // CORS 를 어떤 값으로도 내리지 않는다(§7.2). 같은 출처만 쓴다.
      'x-content-type-options': 'nosniff',
      'referrer-policy': 'no-referrer',
      'cache-control': 'no-store',
      ...headers,
    })
    res.end(buf)
  }

  const server = http.createServer(async (req, res) => {
    const url = new URL(req.url, `http://${req.headers.host || '127.0.0.1'}`)

    const g = guard(req)
    if (!g.ok) {
      if (g.kill) return req.socket.destroy() // Host 위조: 응답조차 주지 않는다
      return send(res, g.status || 403, { error: g.reason })
    }

    if (url.pathname.startsWith('/api/')) {
      if (!checkToken(req, url)) return send(res, 401, { error: 'token' })
      try {
        return await handleApi({
          req, res, url, send, store, appState, clients,
          beat: () => (lastBeat = Date.now()),
          state: { keepAlive: () => keepAlive },
        })
      } catch (e) {
        return send(res, 500, { error: String(e?.message || e) })
      }
    }

    return serveStatic({ req, res, url, send, devProxy })
  })

  // 가드는 **실제로 바인딩된 포트**를 봐야 한다. 여기 넘어온 port 는 희망값일
  // 뿐이고, 확정은 아래 listen() 이 한다(7373 이 쓰이면 7374 로 폴백).
  // server.address() 를 요청 시점에 읽으면 둘이 어긋날 수 없다.
  const guard = makeGuard({ host, dev: devProxy, port: () => server.address()?.port ?? port })

  // 유휴 종료 — 브라우저 탭이 닫히면 앱도 죽는다(§5.2 ⑥).
  // 로컬 서버형 도구가 미움받는 첫 번째 이유는 꺼지지 않는 것이다.
  //
  // 트레이의 '탭 닫아도 계속 실행' 이 이것을 끈다. 설계서가 "트레이에서
  // 계속 실행을 선택한 사용자만 남는다"고 한 그 스위치다.
  let keepAlive = false
  // 90초. CTXVIEW_IDLE_MS 로 줄일 수 있다 — 이 동작을 시험하려면 필요하다.
  const idleMs = Number(process.env.CTXVIEW_IDLE_MS) || 90_000
  const tick = Math.max(500, Math.min(15_000, Math.floor(idleMs / 4)))
  const idleTimer = setInterval(() => {
    if (keepAlive) return
    if (clients.size > 0) lastBeat = Date.now()
    if (Date.now() - lastBeat > idleMs) {
      clearInterval(idleTimer)
      onIdle?.()
    }
  }, tick)
  idleTimer.unref?.()

  store.onEvent = (ev) => {
    const payload = `data: ${JSON.stringify(ev)}\n\n`
    for (const c of clients) c.write(payload)
  }

  return {
    server,
    clients,
    token: SESSION_TOKEN,
    setKeepAlive(on) {
      keepAlive = !!on
      lastBeat = Date.now()
    },
  }
}

async function handleApi({ req, res, url, send, store, appState, clients, beat, state }) {
  const p = url.pathname.replace(/^\/api/, '')
  const method = req.method || 'GET'

  // ── SSE ────────────────────────────────────────────────────────────────
  if (p === '/events') {
    res.writeHead(200, {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-store',
      connection: 'keep-alive',
    })
    res.write(': ok\n\n')
    clients.add(res)
    const ka = setInterval(() => res.write(': ka\n\n'), 25_000)
    req.on('close', () => {
      clearInterval(ka)
      clients.delete(res)
    })
    return
  }

  if (p === '/heartbeat') {
    beat()
    return send(res, 200, { ok: true })
  }

  // 메서드를 명시한다. 안 그러면 아래 POST /repo 가 여기 먼저 잡힌다.
  if (p === '/repo' && method === 'GET') {
    return send(res, 200, { ...store.repoInfo(), keepAlive: state.keepAlive() })
  }

  // 레포 경로 지정 — 화면(§26.1)에서 들어온다.
  // appState 만 바꾸면 스캔 대상이 안 바뀐다. 둘을 같이 옮긴다.
  if (p === '/repo' && method === 'POST') {
    const body = await readJson(req)
    const next = String(body?.path || '').trim()
    if (!next) return send(res, 400, { error: 'path required' })
    const { probe } = await import('../core/scan.js')
    const pr = await probe(next)
    if (!pr.ok) return send(res, 400, { error: 'not-found', path: next })
    appState.merge({ repoPath: next })
    const info = await store.setRoot(next)
    return send(res, 200, { ...info, keepAlive: state.keepAlive() })
  }

  if (p === '/repo/probe') {
    const target = url.searchParams.get('path')
    const { probe } = await import('../core/scan.js')
    return send(res, 200, await probe(target || store.root))
  }

  if (p === '/docs') {
    const list = store.listUnits()
    const others = store.docs
      .filter((d) => !d.isUnit)
      .map((d) => ({ id: d.id, path: d.path, title: d.title, isUnit: false }))
    return send(res, 200, { total: list.length, docs: list, others })
  }

  if (p.startsWith('/docs/')) {
    const key = decodeURIComponent(p.slice('/docs/'.length))
    const d = store.detail(key)
    if (!d) return send(res, 404, { error: 'not-found', key })
    return send(res, 200, d)
  }

  // 뻗어나가기 — 한 노드의 다음 레벨 하나. 화면 왼쪽 아래가 이것만 쓴다.
  if (p === '/next') {
    const kind = url.searchParams.get('kind')
    const key = url.searchParams.get('key')
    const r = store.nextNodes(kind, key)
    if (!r) return send(res, 404, { error: 'not-found', kind, key })
    return send(res, 200, r)
  }

  if (p === '/vocab') return send(res, 200, store.tree())

  if (p === '/timeline') {
    const coord = url.searchParams.get('coord')
    if (!coord) return send(res, 400, { error: 'coord required' })
    return send(res, 200, store.timeline(coord))
  }

  if (p === '/search') {
    return send(res, 200, store.search(url.searchParams.get('q'), { force: url.searchParams.get('force') === '1' }))
  }

  if (p === '/check') return send(res, 200, store.check())

  // 현황 — 화면과 `ctx brief` 가 **같은 계산**을 쓴다(core/repo.js repoStatus).
  if (p === '/status') return send(res, 200, store.status())

  if (p === '/managed') return send(res, 200, store.managedList())

  // 좌표 하나의 전모 — 지금 상태(섹션 본문) + 그것을 바꾼 작업 목록.
  // v0.3 의 중심 화면이 이것을 쓴다.
  if (p === '/coord') {
    const c = url.searchParams.get('coord')
    if (!c) return send(res, 400, { error: 'coord 가 필요합니다' })
    return send(res, 200, store.coordDetail(c))
  }

  // git — 작업환경 v1.1 §10~11.
  //
  // GET 은 읽기만 한다. `?fetch=1` 은 fetch 까지 하는데, fetch 는 작업 트리를
  // 건드리지 않으므로 안전하다. **pull 과 push 는 POST 다** -- 작업 트리를
  // 바꾸거나 남의 눈에 들어가는 연산이라 사람이 누른 것이어야 한다.
  if (p === '/git' && method === 'GET') {
    return send(res, 200, await store.gitStatus({ fetch: url.searchParams.get('fetch') === '1' }))
  }

  if (p === '/git/pull' && method === 'POST') {
    const r = await store.gitPull()
    return send(res, r.ok ? 200 : 409, r)
  }

  if (p === '/git/push' && method === 'POST') {
    const r = await store.gitPush()
    return send(res, r.ok ? 200 : 409, r)
  }

  if (p === '/state' && method === 'GET') return send(res, 200, appState.all())

  if (p === '/state' && method === 'POST') {
    const body = await readJson(req)
    appState.merge(body || {})
    return send(res, 200, appState.all())
  }

  if (p === '/rescan' && method === 'POST') {
    await store.load()
    return send(res, 200, store.repoInfo())
  }

  // 첨부·이미지 서빙 — 경로 봉인 통과분만(§7.2 위협 4)
  if (p === '/file') {
    const rel = url.searchParams.get('path')
    const r = await resolveInside(store.root, rel || '')
    if (!r.ok) return send(res, r.reason === 'outside' ? 403 : 404, { error: r.reason, resolved: r.resolved || null })
    const ext = path.extname(r.abs).toLowerCase()
    const buf = await fs.readFile(r.abs)
    return send(res, 200, buf, { 'content-type': MIME[ext] || 'application/octet-stream' })
  }

  // 외부 원본 존재 확인 — 프로토콜 §8.5 예외 조항
  if (p === '/probe-external') {
    const target = url.searchParams.get('path') || ''
    let exists = false
    let stat = null
    try {
      const s = await fs.stat(target)
      exists = true
      stat = { size: s.size, mtime: s.mtimeMs, dir: s.isDirectory() }
    } catch {}
    return send(res, 200, { path: target, exists, stat, executable: isExecutable(target) })
  }

  // OS 기본앱으로 열기 — 명시적 클릭 + 절대경로 표시 + 실행 확장자 거부(§7.2)
  if (p === '/open' && method === 'POST') {
    const body = await readJson(req)
    const target = String(body?.path || '')
    if (!target) return send(res, 400, { error: 'path required' })
    if (isExecutable(target)) return send(res, 403, { error: 'executable-refused', path: target })
    if (!fsSync.existsSync(target)) return send(res, 404, { error: 'missing', path: target })
    exec(`start "" "${target.replace(/"/g, '')}"`, { shell: 'cmd.exe' }, () => {})
    return send(res, 200, { ok: true, path: target })
  }

  if (p === '/quit' && method === 'POST') {
    send(res, 200, { ok: true })
    setTimeout(() => process.exit(0), 50)
    return
  }

  return send(res, 404, { error: 'no-route', path: p })
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const c of req) {
    size += c.length
    if (size > 1_000_000) throw new Error('body too large')
    chunks.push(c)
  }
  if (!chunks.length) return null
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'))
  } catch {
    return null
  }
}

async function serveStatic({ req, res, url, send, devProxy }) {
  // 개발 중에는 Vite 가 화면을 서빙한다. 그때는 안내만 낸다.
  if (devProxy) {
    return send(res, 200, `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem">
      <p>API 서버는 떠 있습니다. 화면은 <a href="${devProxy}">${devProxy}</a> 에서 엽니다.</p></body>`, {
      'content-type': 'text/html; charset=utf-8',
    })
  }

  let rel = decodeURIComponent(url.pathname)
  if (rel === '/' || !path.extname(rel)) rel = '/index.html'

  // 단일 실행 파일(SEA)로 빌드하면 out/web 이 파일로 존재하지 않는다.
  // tools/build-exe.mjs 가 화면을 전역에 인라인해 둔다(§5.1 A안).
  const inlined = globalThis.__CTXVIEW_ASSETS__
  if (inlined) {
    const key = rel.replace(/^\//, '')
    const b64 = inlined[key]
    if (!b64) return send(res, 404, { error: 'not-found', path: key })
    return send(res, 200, Buffer.from(b64, 'base64'), {
      'content-type': MIME[path.extname(key).toLowerCase()] || 'application/octet-stream',
      'cache-control': key === 'index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    })
  }

  const abs = path.join(CLIENT_DIR, rel)
  if (!abs.startsWith(CLIENT_DIR)) return send(res, 403, { error: 'outside' })

  try {
    const buf = await fs.readFile(abs)
    return send(res, 200, buf, {
      'content-type': MIME[path.extname(abs).toLowerCase()] || 'application/octet-stream',
      'cache-control': rel === '/index.html' ? 'no-store' : 'public, max-age=31536000, immutable',
    })
  } catch {
    return send(res, 404, `<!doctype html><meta charset="utf-8"><body style="font:14px system-ui;padding:2rem">
      <p>화면이 빌드되지 않았습니다. <code>npm run build</code> 를 먼저 실행하세요.</p></body>`, {
      'content-type': 'text/html; charset=utf-8',
    })
  }
}
