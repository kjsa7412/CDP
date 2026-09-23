#!/usr/bin/env node
// cdp — CDP 작업 환경 진입점.
//
// 설계서 §5.2 실행 흐름:
//   ① exe 더블클릭 / npx cdp
//   ② 127.0.0.1 에서 빈 포트 확보 (7373 → +1 … → 임의)
//   ③ 기본 브라우저를 http://127.0.0.1:PORT/?t=<1회용 토큰> 으로 열기
//   ④ 경로가 설정돼 있으면 즉시 로드, 없으면 경로 지정 화면
//   ⑤ 탭이 닫히면 (하트비트 90초 소실) 자동 종료
//
// git 을 한 줄도 실행하지 않는다 (§11).

import path from 'node:path'
import fs from 'node:fs'
import { exec } from 'node:child_process'
import { Store } from '../../core/store.js'
import { AppState, dataDir } from '../../core/appstate.js'
import { createServer } from './adapter/http.js'
import { isLoopbackHost, devOriginHost } from './adapter/security.js'
import { appRoot, hereDir, isSea } from './runtime.js'
import { startTray } from './adapter/tray.js'
import { initLogger } from '../../core/logger.js'
import { main as ctxMain } from '../bin/ctx-cli.mjs'

function parseArgs(argv) {
  // 트레이 기본값은 실행 형태를 따른다 — exe 는 '트레이 아이콘 하나만 생긴다'(§5.2 ②),
  // node 로 직접 돌리는 개발 중에는 거슬리기만 한다.
  const out = { port: 7373, host: '127.0.0.1', open: true, watch: null, repo: null, dev: null, tray: null }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--repo') out.repo = argv[++i]
    else if (a === '--port') out.port = Number(argv[++i]) || out.port
    else if (a === '--host') out.host = argv[++i]
    else if (a === '--no-open') out.open = false
    else if (a === '--no-watch') out.watch = false
    else if (a === '--tray') out.tray = true
    else if (a === '--no-tray') out.tray = false
    else if (a === '--dev') out.dev = argv[++i] || 'http://localhost:5173'
    else if (a === '--help' || a === '-h') {
      console.log(`cdp — CDP 작업 환경

  cdp [--repo <경로>] [--port 7373] [--no-open] [--no-watch] [--host 127.0.0.1]

  --repo <경로>   지식 레포 경로. 지정하면 경로 지정 화면을 건너뛴다
  --no-open       브라우저 자동 열기 끔
  --no-watch      파일 감시 끔 (감시가 문제를 일으키는 환경의 비상 스위치)
  --tray/--no-tray  트레이 아이콘. 기본값은 exe 실행이면 켜짐, node 실행이면 꺼짐
  --host <addr>   기본 127.0.0.1. 다른 값은 화면에 상시 경고가 뜬다`)
      process.exit(0)
    }
  }
  return out
}

async function listen(server, host, startPort) {
  for (let p = startPort; p < startPort + 20; p++) {
    const ok = await new Promise((resolve) => {
      const onErr = () => {
        server.removeListener('error', onErr)
        resolve(false)
      }
      server.once('error', onErr)
      server.listen(p, host, () => {
        server.removeListener('error', onErr)
        resolve(true)
      })
    })
    if (ok) return p
  }
  // 그래도 없으면 임의 포트
  await new Promise((r) => server.listen(0, host, r))
  return server.address().port
}

// 같은 실행 파일이 CLI 로도 동작한다 — 작업환경 v1.1 §3.1.
//
// Node 가 없는 PC 에서 `bin/ctx` 껍데기가 `cdp.exe ctx check` 로 넘긴다.
// exe 는 이미 Node SEA 로 런타임을 품고 있으므로 런타임을 따로 넣을 필요가
// 없고, **구현이 한 벌**이라 앱과 CLI 가 갈라지지 않는다.
async function runCtx(argv) {
  const code = await ctxMain(argv)
  process.exit(code || 0)
}

async function main() {
  // `ctx` 가 첫 인자면 서버를 띄우지 않는다
  if (process.argv[2] === 'ctx') return runCtx(process.argv.slice(3))

  const args = parseArgs(process.argv.slice(2))
  // 포터블 모드 기준 — SEA 면 exe 폴더, node 실행이면 프로젝트 루트(§6.1)
  const dir = dataDir(appRoot(path.resolve(hereDir(import.meta.url), '..')))

  // exe 는 콘솔이 없다(§5.2 ②). 로그 파일이 유일한 진단 수단이다(§6.1)
  const logger = initLogger(dir)
  if (isSea && logger) console.log(`[cdp] 로그: ${logger.path}`)

  const appState = new AppState(dir)

  if (args.watch === false) appState.merge({ watch: false })

  // 경로 결정: --repo > exe 가 든 지식 레포(<repo>/tools/cdp.exe) > 저장된 설정 > 없음(경로 지정 화면)
  //
  // **exe 는 레포 안 tools/ 에 산다**(설치.md ③). 더블클릭하면 그 레포가 열려야 하는데 전에는
  // 저장된 설정만 봐서 첫 실행이 경로 지정 화면이었고, 레포가 둘이면 어느 exe 를 눌러도 마지막에
  // 고른 레포가 열렸다(설명서 걷기 2026-09-23). `ctx` 의 규칙 ④(자기 위치의 부모)와 같다.
  const homeOfExe = () => {
    try {
      const up = path.resolve(path.dirname(process.execPath), '..')
      return fs.existsSync(path.join(up, '_vocab.md')) ? up : null
    } catch {
      return null
    }
  }
  let root = args.repo ? path.resolve(args.repo) : homeOfExe() || appState.all().repoPath
  if (root && !fs.existsSync(root)) {
    console.error(`[cdp] 경로를 찾을 수 없습니다: ${root}`)
    root = null
  }
  if (root) appState.merge({ repoPath: root })

  const settings = appState.all()
  // 루프백 판정은 가드(adapter/security.js)와 **같은 함수**로 한다.
  // 여기서 따로 판정하면 경고와 실제 봉인이 어긋난다.
  const loopback = isLoopbackHost(args.host)
  const store = new Store({ root: root || process.cwd(), settings, hostWarning: !loopback })

  // --dev 는 개발 화면 주소다. 루프백이 아니면 화이트리스트에 넣지 않는다(§7.1
  // 위협 2). 조용히 무시하면 원인을 못 찾으니 알리고 간다.
  if (args.dev && !devOriginHost(args.dev)) {
    console.warn(`[cdp] ⚠ --dev ${args.dev} 는 루프백이 아니라 허용 목록에 넣지 않습니다. 그 화면의 API 요청은 차단됩니다.`)
  }

  // 포트 확보를 먼저 하고, 스캔은 화면을 막지 않게 뒤에서 돌린다(§10.1)
  const { server, token, setKeepAlive } = createServer({
    store,
    appState,
    host: args.host,
    port: args.port,
    devProxy: args.dev,
    onIdle: () => {
      console.log('[cdp] 브라우저 탭이 닫혀 종료합니다.')
      shutdown(0)
    },
  })

  const port = await listen(server, args.host, args.port)
  const url = `http://${args.host === '0.0.0.0' ? '127.0.0.1' : args.host}:${port}/?t=${token}`

  if (!loopback) {
    console.warn(`
[cdp] ⚠ 경고 — loopback 이 아닌 주소(${args.host})에 리스너를 열었습니다.
           같은 네트워크의 다른 PC 가 이 레포의 문서를 읽을 수 있습니다.
           설계서 §7.1 위협 3. 의도한 것이 아니면 즉시 종료하세요.
`)
  }

  console.log(`[cdp] ${url}`)
  console.log(`[cdp] 레포: ${root || '(지정 안 됨 — 화면에서 지정하세요)'}`)

  if (root) {
    const stats = await store.load({
      // 진행률 표시는 콘솔이 있을 때만 의미가 있다 (CR 로 덮어쓴다).
      // exe(WINDOWS 서브시스템)에서는 stdout 이 없으므로 건너뛴다.
      onProgress: isSea
        ? undefined
        : ({ done, total }) => {
            try {
              process.stdout.write(`\r[cdp] 스캔 ${done}/${total}   `)
            } catch {}
          },
    })
    if (!isSea) {
      try {
        process.stdout.write('\r')
      } catch {}
    }
    const info = store.repoInfo()
    console.log(
      `[cdp] 문서 ${info.docs}건 · 좌표 ${info.coords}개 · ${stats.read}건 읽고 ${stats.reused}건 캐시 · ${stats.ms}ms`
    )
    if (info.checkCounts.error) console.log(`[cdp] ⚠ 검증 오류 ${info.checkCounts.error}건 — 검증 뷰에서 확인하세요`)
    store.startWatch()
  }

  if (args.open) openBrowser(url)

  // 트레이 — Windows 전용. 못 뜨면 조용히 없는 채로 간다(§5.2 ②)
  let tray = null
  const wantTray = args.tray === null ? isSea : args.tray
  if (wantTray) {
    tray = startTray({
      dataDir: dir,
      url,
      repoPath: root,
      repoName: root ? path.basename(root) : null,
      onOpen: (u) => openBrowser(u),
      onFolder: (p) => p && openFolder(p),
      onKeepAlive: (on) => {
        setKeepAlive(on)
        console.log(`[cdp] 탭 닫아도 계속 실행: ${on ? '켜짐' : '꺼짐'}`)
      },
      onQuit: () => {
        console.log('[cdp] 트레이에서 종료를 선택했습니다.')
        shutdown(0)
      },
    })
    if (tray) console.log('[cdp] 트레이 아이콘 표시 중')
  }

  const shutdown = (code) => {
    tray?.stop()
    store.stop().finally(() => {
      appState.close()
      logger?.close()
      server.close(() => process.exit(code))
      setTimeout(() => process.exit(code), 500)
    })
  }
  process.on('SIGINT', () => shutdown(0))
  process.on('SIGTERM', () => shutdown(0))
  process.on('exit', () => tray?.stop())
}

// 레포 폴더 열기 — 탐색기. 경로는 우리가 아는 레포 루트뿐이라
// §7.2 의 원본 열기 제한(임의 경로·실행 확장자)과 성질이 다르다.
function openFolder(p) {
  if (process.platform === 'win32') exec(`explorer "${p.replace(/"/g, '')}"`, { shell: 'cmd.exe' }, () => {})
  else if (process.platform === 'darwin') exec(`open "${p}"`, () => {})
  else exec(`xdg-open "${p}"`, () => {})
}

function openBrowser(url) {
  const cmd =
    process.platform === 'win32'
      ? `start "" "${url}"`
      : process.platform === 'darwin'
      ? `open "${url}"`
      : `xdg-open "${url}"`
  exec(cmd, { shell: process.platform === 'win32' ? 'cmd.exe' : undefined }, () => {})
}

main().catch((e) => {
  console.error('[cdp] 시작 실패:', e)
  process.exit(1)
})
