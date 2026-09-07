// 로그 파일 — 설계서 §6.1 `logs\app.log`, 회전 3개 · 각 1MB.
//
// exe 는 WINDOWS 서브시스템으로 빌드되므로(§5.2 ② 콘솔 창 없음) stdout 이
// 아무 데도 가지 않는다. **그러면 문제가 났을 때 볼 데가 없다.**
// 그래서 console 출력을 파일로도 흘린다.
//
// **동기 append 로 쓴다.** createWriteStream 은 버퍼링하므로 프로세스가 살아
// 있는 동안 파일이 비어 있다 — 콘솔 없는 앱을 진단하라고 만든 로그인데 정작
// 진단이 필요한 순간에 못 읽는다. 실제로 그것 때문에 원인 추적이 한 번 막혔다.
// 로그량이 적으므로(기동 몇 줄 + 오류) 동기 쓰기 비용은 무시할 만하다.
//
// 로그에 무엇을 넣지 않는지가 더 중요하다 — 문서 내용, 검색어, 토큰은 안 쓴다.
// §2.1 이 "사용 기록·검색어도 PC 를 떠나지 않는다"고 했고, PC 를 안 떠나는 것과
// 디스크에 남기는 것은 다른 문제다.

import fs from 'node:fs'
import path from 'node:path'

const MAX_BYTES = 1024 * 1024
const KEEP = 3

let fd = null
let file = null
let written = 0

function openFd() {
  try {
    fd = fs.openSync(file, 'a')
  } catch {
    fd = null
  }
}

function closeFd() {
  try {
    if (fd !== null) fs.closeSync(fd)
  } catch {}
  fd = null
}

function rotate() {
  try {
    closeFd()
    for (let i = KEEP - 1; i >= 1; i--) {
      const from = i === 1 ? file : `${file}.${i}`
      const to = `${file}.${i + 1}`
      if (fs.existsSync(from)) fs.renameSync(from, to)
    }
    written = 0
    openFd()
  } catch {
    fd = null
  }
}

function stamp() {
  // 로컬 시각. UTC 로 적으면 사용자가 자기 로그를 읽을 때 매번 환산해야 한다.
  const d = new Date()
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(
    d.getMinutes()
  )}:${p2(d.getSeconds())}`
}

export function initLogger(dataDir) {
  try {
    const dir = path.join(dataDir, 'logs')
    fs.mkdirSync(dir, { recursive: true })
    file = path.join(dir, 'app.log')
    written = fs.existsSync(file) ? fs.statSync(file).size : 0
    if (written >= MAX_BYTES) rotate()
    else openFd()
  } catch {
    return null // 로그를 못 쓰면 그냥 없이 간다. 앱은 정상 동작한다
  }
  if (fd === null) return null

  const write = (level, args) => {
    if (fd === null) return
    const body = args.map((a) => (typeof a === 'string' ? a : safeStr(a))).join(' ')
    const line = `${stamp()} ${level} ${body}\n`
    try {
      fs.writeSync(fd, line)
      written += Buffer.byteLength(line)
      if (written >= MAX_BYTES) rotate()
    } catch {}
  }

  // console 을 감싼다. 원래 동작(터미널 출력)은 그대로 두고 파일에 덧붙인다 —
  // npx 로 실행하면 콘솔이 살아 있고, exe 면 콘솔 쪽이 무해하게 사라진다.
  for (const [level, fn] of [
    ['INFO ', 'log'],
    ['WARN ', 'warn'],
    ['ERROR', 'error'],
  ]) {
    const orig = console[fn].bind(console)
    console[fn] = (...args) => {
      try {
        orig(...args)
      } catch {} // WINDOWS 서브시스템에서 stdout 쓰기가 실패해도 죽지 않는다
      write(level, args)
    }
  }

  // 잡히지 않은 예외 — 콘솔이 없으면 이것이 유일한 흔적이다
  process.on('uncaughtException', (e) => {
    write('FATAL', [e?.stack || String(e)])
    closeFd()
    process.exit(1)
  })
  process.on('unhandledRejection', (e) => write('ERROR', ['unhandledRejection', e?.stack || String(e)]))

  return {
    path: file,
    close() {
      closeFd()
    },
  }
}

function safeStr(v) {
  try {
    if (v instanceof Error) return v.stack || v.message
    return typeof v === 'object' ? JSON.stringify(v) : String(v)
  } catch {
    return '[unserializable]'
  }
}
