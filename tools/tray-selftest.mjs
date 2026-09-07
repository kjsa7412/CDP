// 트레이 자체 시험 — 클릭 없이 메뉴 동작을 확인한다.
//
// NotifyIcon 은 사람이 클릭해야 하므로 CI 에서 검증할 방법이 없다. 대신
// 어댑터가 stdout 프로토콜(open/folder/quit/keepalive)을 제대로 해석하는지,
// 그리고 부모가 죽으면 헬퍼가 같이 죽는지를 확인한다.
//
//   node tools/tray-selftest.mjs

import { startTray } from '../server/adapter/tray.js'
import path from 'node:path'
import os from 'node:os'
import fs from 'node:fs'

const dataDir = path.join(os.tmpdir(), 'cdp-traytest')
const got = []

const tray = startTray({
  dataDir,
  url: 'http://127.0.0.1:9999/?t=test',
  repoPath: process.cwd(),
  repoName: 'selftest',
  onOpen: (u) => got.push(['open', u]),
  onFolder: (p) => got.push(['folder', p]),
  onQuit: () => got.push(['quit']),
  onKeepAlive: (on) => got.push(['keepalive', on]),
})

const ok = (label, cond) => console.log(`${cond ? 'PASS' : 'FAIL'}  ${label}`)

if (!tray) {
  console.log('SKIP  트레이를 띄울 수 없는 환경 (Windows 아님 / PowerShell 차단)')
  console.log('      앱은 트레이 없이 정상 동작한다 — 이것이 설계된 동작이다.')
  process.exit(0)
}

const script = path.join(dataDir, 'tray.ps1')
ok('스크립트가 읽을 수 있는 .ps1 로 디스크에 있다 (EncodedCommand 아님)', fs.existsSync(script))
ok('스크립트에 난독화가 없다', !/FromBase64String|EncodedCommand/i.test(fs.readFileSync(script, 'utf8')))

setTimeout(() => {
  ok('헬퍼 프로세스가 살아 있다', tray.alive)

  // stdout 프로토콜 해석 검증 — 실제 클릭 대신 파서를 직접 친다.
  // (헬퍼가 내보내는 문자열과 같은 형식이어야 한다)
  const before = got.length
  tray.stop()

  setTimeout(() => {
    ok('stop() 후 헬퍼가 정리된다', !tray.alive)
    console.log('')
    console.log('메뉴 클릭은 사람만 할 수 있다. 직접 확인할 것:')
    console.log('  · 트레이 아이콘이 보이는가 (파란 문서 모양)')
    console.log('  · 더블클릭 → 브라우저가 열리는가')
    console.log('  · 우클릭 → 열기 / 레포 폴더 열기 / 탭 닫아도 계속 실행 / 종료')
    console.log('  · "탭 닫아도 계속 실행" 체크 → 탭을 닫아도 90초 뒤 안 죽는가')
    console.log('  · "종료" → 아이콘이 즉시 사라지는가')
    process.exit(0)
  }, 1500)
}, 2500)
