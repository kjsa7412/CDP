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
// 읽기 라우트는 **관리 서비스와 공유한다**(MCP 설계서 §6.2). 두 곳에 각자
// 쓰면 "로컬에서는 되는데 원격에서는 다르다" 가 생기고 화면에서만 드러난다.
import { handleRead } from './read-api.js'
import { hereDir } from '../runtime.js'

const CLIENT_DIR = path.resolve(hereDir(import.meta.url), '../../../ops/out/web')

// 언제 떴나 — 진단이 쓴다. 로그 파일의 기동 줄과 맞춰 볼 수 있어야 한다.
const START_AT = new Date().toISOString()

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

  // SSE 로 한 줄 뿌린다. 파일 변경(store.onEvent)과 같은 통로를 쓴다 —
  // **진행 상태는 그것을 띄운 탭만의 것이 아니다.** 창을 둘 열어 두고
  // 한쪽에서 동기화를 누르면 다른 쪽도 같은 단계를 봐야 한다.
  const broadcast = (ev) => {
    const payload = `data: ${JSON.stringify(ev)}\n\n`
    for (const c of clients) c.write(payload)
  }

  // 동기화는 **한 번에 하나만 돈다.** 겹쳐 돌면 pull 두 개가 같은 작업 트리를
  // 만지고, 그 결과는 사람이 재현할 수 없다.
  const sync = { phase: 'idle', startedAt: null, last: null }

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
          req, res, url, send, store, appState, clients, broadcast, sync,
          beat: () => (lastBeat = Date.now()),
          state: { keepAlive: () => keepAlive, host, port: () => server.address()?.port ?? port },
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

async function handleApi({ req, res, url, send, store, appState, clients, broadcast, sync, beat, state }) {
  const p = url.pathname.replace(/^\/api/, '')
  const method = req.method || 'GET'

  // `keepAlive` 는 **로컬만의 것**이다 — 탭을 닫으면 서버가 죽는 성질이고
  // 상주 서버에는 없다. 공유 라우트에 넣지 않고 여기서 덧붙인다.
  if (p === '/repo' && method === 'GET') {
    return send(res, 200, { ...store.repoInfo(), keepAlive: state.keepAlive() })
  }

  // **읽기가 먼저다.** 관리 서비스와 같은 답을 내야 하는 것들이고, 아래
  // 로컬 전용 라우트는 이 PC 를 만지는 것들이다(§6.2).
  if (await handleRead({ p, method, url, res, send, store })) return

  // git — GET 은 읽기만 한다. `?fetch=1` 은 fetch 까지 하는데 작업 트리를 건드리지 않으므로 안전하다.
  // **로컬 뷰어만의 것**이다 — 관리 서비스의 `/api/<레포>/git` 은 404 다(화면 · 권한 검토 v0.1 R4). 전에는
  // `read-api.js` 의 공유 라우트였는데 서버 화면이 어디서도 안 쓰면서 origin 호스트 · 커밋 신원만 나갔다.
  if (p === '/git' && method === 'GET') {
    return send(res, 200, await store.gitStatus({ fetch: url.searchParams.get('fetch') === '1' }))
  }
  if (p === '/git/config' && method === 'GET') {
    const { readConfig } = await import('../../../core/git.js')
    return send(res, 200, await readConfig(store.root))
  }

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


  // 레포 경로 지정 — 화면(§26.1)에서 들어온다.
  // appState 만 바꾸면 스캔 대상이 안 바뀐다. 둘을 같이 옮긴다.
  if (p === '/repo' && method === 'POST') {
    const body = await readJson(req)
    const next = String(body?.path || '').trim()
    if (!next) return send(res, 400, { error: 'path required' })
    const { probe } = await import('../../../core/scan.js')
    const pr = await probe(next)
    if (!pr.ok) return send(res, 400, { error: 'not-found', path: next })
    appState.merge({ repoPath: next })
    const info = await store.setRoot(next)
    return send(res, 200, { ...info, keepAlive: state.keepAlive() })
  }

  // 작업 레포에 에이전트 세팅을 넣는다.
  //
  // **여기가 앱이 레포 밖에 파일을 쓰는 유일한 자리다.** 그래서 좁게 연다 —
  //   · 대상이 git 레포일 때만 (core/setup.js 가 확인한다)
  //   · 쓰는 파일은 정해진 셋뿐 (CLAUDE.md 블록 · .claude/skills/cdp-* · .claude/cdp.json)
  //   · dry 가 먼저다. 화면이 무엇을 쓸지 보여 주고 사람이 누른다
  //
  // 경로는 **사람이 입력한 것만** 온다. 문서나 검색 결과에서 온 경로를 그대로
  // 넘기지 않는다 -- 화면이 지키는 규칙이다.
  if (p === '/setup' && method === 'POST') {
    const body = await readJson(req)
    const target = String(body?.path || '').trim()
    if (!target) return send(res, 400, { error: 'path required' })
    const { planSetup, applySetup, kitHash } = await import('../../../core/setup.js')
    const plan = await planSetup(store.root, target)
    if (!plan.ok) return send(res, 400, { error: 'plan', reason: plan.reason })

    const kit = await kitHash(store.root)
    if (body?.apply) {
      const done = await applySetup(plan)
      // **한 일이 남는다.** 전에는 설치하고 나면 아무 흔적도 없었다 --
      // skill 을 고친 뒤 여섯 곳 중 어디가 옛 판인지 확인할 길이 없었다.
      const ops = {}
      for (const a of done) ops[a.op] = (ops[a.op] || 0) + 1
      const at = new Date().toISOString()
      appState.markWorkRepo(plan.work, { at, kit: kit.hash, ops })
      appState.push('setupLog', {
        at,
        path: plan.work,
        kit: kit.hash,
        ops,
        changes: done.map((a) => ({ kind: a.kind, name: a.name || null, op: a.op })),
      })
    }
    return send(res, 200, {
      applied: !!body?.apply,
      work: plan.work,
      knowledge: plan.knowledge,
      kit: kit.hash,
      actions: plan.actions.map(({ kind, name, to, op }) => ({ kind, name, to, op })),
      warnings: plan.warnings,
    })
  }

  // 등록된 작업 레포 전부의 설치 상태 — **열어 보지 않고 안다.**
  //
  // 각각 계획을 dry 로 돌린다. 파일은 건드리지 않는다. 레포가 여럿이면
  // 디스크를 그만큼 읽지만, 이 화면을 열었을 때 한 번뿐이다.
  if (p === '/workrepos' && method === 'GET') {
    const { inspect, kitHash } = await import('../../../core/setup.js')
    const list = (appState.all().workRepos || []).map((w) => (typeof w === 'string' ? { path: w } : w))
    const kit = await kitHash(store.root)
    const repos = []
    for (const w of list) {
      const r = await inspect(store.root, w.path).catch((e) => ({
        path: w.path,
        state: 'error',
        reason: String(e?.message || e),
        changes: [],
        warnings: [],
      }))
      repos.push({ ...r, addedAt: w.addedAt || null, lastApplied: w.lastApplied || null })
    }
    return send(res, 200, { kit: kit.hash, kitSkills: kit.skills, repos, log: appState.all().setupLog || [] })
  }

  // 진단 — **값만 낸다. 행동은 없다.**
  //
  // 콘솔 없는 exe 에서 문제가 나면 볼 데가 로그 파일뿐인데, 그 파일이 어디
  // 있는지 화면이 말한 적이 없었다(§6.1).
  if (p === '/diag' && method === 'GET') {
    const { appVersion, repoBundleStamp } = await import('../../../core/appinfo.js')
    const { BUILT } = await import('../../bin/ctx-cli.mjs')
    const { isSea } = await import('../runtime.js')
    const { gitAvailable } = await import('../../../core/git.js')
    const repoBundle = repoBundleStamp(store.root)
    return send(res, 200, {
      version: appVersion(hereDir(import.meta.url)),
      sea: isSea,
      node: process.version,
      git: await gitAvailable(),
      pid: process.pid,
      startedAt: START_AT,
      host: state.host,
      port: state.port(),
      keepAlive: state.keepAlive(),
      hostWarning: store.hostWarning,
      dataDir: appState.dir,
      stateFile: appState.file,
      logFile: path.join(appState.dir, 'logs', 'app.log'),
      repoRoot: store.root,
      // 번들 시각 둘 — 앱이 든 것과 레포가 든 것. **다르면 레포가 옛 답을 낸다**
      appBundle: BUILT.startsWith('__') ? null : BUILT,
      repoBundle: repoBundle?.stamp || null,
      repoBundlePath: repoBundle?.path || null,
      watchEnabled: store.settings?.watch !== false,
      watchAlive: !!store.watchAlive,
      scannedAt: store.stats?.scannedAt || null,
      scanMs: store.stats?.ms ?? null,
    })
  }

  if (p === '/repo/probe') {
    const target = url.searchParams.get('path')
    const { probe } = await import('../../../core/scan.js')
    return send(res, 200, await probe(target || store.root))
  }

  // ── 동기화 — **진행이 서버에 있다** ─────────────────────────────────────
  //
  // 전에는 화면이 `git?fetch=1` -> `git/pull` -> `docs` 를 순서대로 불렀다.
  // 그래서 진행 상태가 그 컴포넌트 안에만 있었고, 탭을 바꾸거나 다른 창에서
  // 보면 **동기화 중인지조차 알 수 없었다.** 순서를 서버로 올리면 상태가
  // 한 곳에 생기고, 그것을 SSE 로 뿌리면 모든 화면이 같은 것을 본다.
  if (p === '/sync' && method === 'GET') {
    return send(res, 200, {
      phase: sync.phase,
      startedAt: sync.startedAt,
      last: sync.last,
      log: appState.all().syncLog || [],
    })
  }

  if (p === '/sync' && method === 'POST') {
    if (sync.phase !== 'idle') {
      return send(res, 409, { error: 'busy', phase: sync.phase, startedAt: sync.startedAt })
    }
    const body = await readJson(req)
    const pull = body?.pull !== false
    const { runSync, syncLine } = await import('../../../core/sync.js')

    sync.phase = 'fetching'
    sync.startedAt = Date.now()
    broadcast({ type: 'sync', phase: 'fetching', startedAt: sync.startedAt })

    try {
      const r = await runSync(store.root, {
        pull,
        onPhase: (ev) => {
          sync.phase = ev.phase
          broadcast({ type: 'sync', startedAt: sync.startedAt, ...ev })
        },
        // 받아온 것이 있을 때만 다시 읽는다. 스캔은 싸지 않다.
        rescan: () => store.load(),
      })
      // 이력은 **서버가 적는다.** 화면이 적으면 탭이 둘일 때 두 줄이 남는다.
      sync.last = {
        at: r.at,
        ok: r.ok,
        phase: r.phase,
        reason: r.reason || null,
        pulled: r.pulled || 0,
        behind: r.behind || 0,
        ahead: r.ahead || 0,
        ms: r.ms,
        message: r.message || null,
        // 결과 문장은 **한 곳에서 만든다** — 토스트·이력 표·CLI 가 같은 말을 한다
        line: syncLine(r),
      }
      appState.push('syncLog', sync.last)
      return send(res, r.ok ? 200 : 409, { ...sync.last, status: r.status || null })
    } finally {
      sync.phase = 'idle'
      sync.startedAt = null
      broadcast({ type: 'sync', phase: 'idle', last: sync.last })
    }
  }

  // git 설정 — 읽기만. 어떻게 돼 있는지 화면이 말할 수 있어야 한다.

  // **앱이 git 설정을 쓰는 유일한 자리다.** 키 하나 · 값 하나 · 로컬만.
  // 훅이 없으면 커밋이 검사 없이 통과한다 — 조용한 실패라 손해가 가장 크다.
  if (p === '/git/hooks' && method === 'POST') {
    const { setHooksPath } = await import('../../../core/git.js')
    const r = await setHooksPath(store.root)
    if (r.ok) store._git = await store.gitStatus({ fetch: false })
    return send(res, r.ok ? 200 : 409, r)
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

  // 단일 실행 파일(SEA)로 빌드하면 ops/out/web 이 파일로 존재하지 않는다.
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
