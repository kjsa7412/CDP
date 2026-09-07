// 로컬 서버의 위험면 봉인 — 설계서 §7.2.
//
// v0.1 은 서버가 0줄이라 이 파일이 필요 없었다. 로컬로 옮긴 대가가 여기 있다.
// 가장 현실적인 사고는 이것이다:
//   사용자가 브라우저에서 방문한 임의의 외부 페이지가
//   fetch('http://127.0.0.1:7373/api/docs') 를 실행해 사내 문서를 전량 가져간다.
//
// 토큰과 Host 검증을 겹쳐 쓴다. Host 검증이 더 중요하다 — 토큰은 유출·로깅으로
// 새어나갈 수 있지만 Host 헤더는 브라우저가 위조할 수 없다.

import crypto from 'node:crypto'
import path from 'node:path'
import fs from 'node:fs/promises'

export const SESSION_TOKEN = crypto.randomBytes(32).toString('base64url')

// '루프백만 허용한다'는 성질을 여기 한 곳에서만 정의한다. 이 판단이 두 군데로
// 갈라지면 한쪽이 열어준 것을 다른 쪽이 끊는 사고가 난다.
const LOOPBACK = /^(localhost|127(\.\d{1,3}){3}|\[?::1\]?)$/i

export function isLoopbackHost(h) {
  return LOOPBACK.test(String(h || '').trim())
}

// Host 헤더와 Origin 을 같은 모양(hostname:port)으로 맞춘다.
// 브라우저는 기본 포트를 생략하므로('Host: localhost') 생략분을 채워 넣는다.
function normalizeAuthority(value, defaultPort = '80') {
  const s = String(value || '').trim().toLowerCase()
  const m = /^(\[[^\]]+\]|[^:]+)(?::(\d+))?$/.exec(s)
  if (!m) return ''
  return `${m[1]}:${m[2] || defaultPort}`
}

// --dev 로 받은 개발 화면(vite) 주소를 화이트리스트에 넣을 모양으로 정규화한다.
// **루프백이 아니면 null** — 개발 편의가 §7.1 위협 2 의 방어를 깨면 안 된다.
// `--dev http://evil.example` 은 여기서 걸러진다.
export function devOriginHost(dev) {
  if (!dev) return null
  try {
    const u = new URL(dev)
    if (!isLoopbackHost(u.hostname)) return null
    return normalizeAuthority(u.host, u.protocol === 'https:' ? '443' : '80')
  } catch {
    return null
  }
}

// port 는 숫자 대신 함수로도 받는다 — **바인딩 전에는 실제 포트를 모르기 때문이다.**
// 7373 이 이미 쓰이면 listen() 이 7374 로 폴백하는데, 만들 때의 희망 포트로
// 화이트리스트를 굳혀 두면 폴백한 순간 브라우저의 `Host: 127.0.0.1:7374` 가
// 목록에 없어 모든 요청이 끊긴다. 콘솔에는 정상 URL 이 찍히고 화면만 빈 채 남는다.
export function makeGuard({ port, host, dev }) {
  const portOf = typeof port === 'function' ? port : () => port
  const loopbackOnly = isLoopbackHost(host)
  const devHost = devOriginHost(dev)

  // 포트는 한 번 정해지면 안 바뀐다. 매 요청 Set 을 다시 만들지 않게 기억해 둔다.
  let cache = { port: null, hosts: null }
  const allowedHosts = () => {
    const p = portOf()
    if (p !== cache.port) {
      cache = {
        port: p,
        hosts: new Set([
          `127.0.0.1:${p}`,
          `localhost:${p}`,
          `[::1]:${p}`,
          // 개발 화면은 별도 오리진(localhost:5173)이라 프록시를 거쳐도
          // Origin 헤더가 그대로 온다. 루프백으로 확인된 것만 들어온다.
          ...(devHost ? [devHost] : []),
        ]),
      }
    }
    return cache.hosts
  }

  return function guard(req) {
    const hosts = allowedHosts()

    // 1) Host 화이트리스트 — DNS 리바인딩의 표준 대응.
    //    응답을 주지 않고 연결을 끊는다.
    const h = normalizeAuthority(req.headers.host)
    if (loopbackOnly && !hosts.has(h)) return { ok: false, kill: true, reason: 'host' }

    // 2) Sec-Fetch-Site — 지원 브라우저에서의 추가 방어.
    const site = req.headers['sec-fetch-site']
    if (site && site !== 'same-origin' && site !== 'none') return { ok: false, status: 403, reason: 'cross-site' }

    // 3) Origin 이 있으면 같은 출처여야 한다.
    const origin = req.headers.origin
    if (origin) {
      let ok = false
      try {
        const u = new URL(origin)
        ok = hosts.has(normalizeAuthority(u.host, u.protocol === 'https:' ? '443' : '80'))
      } catch {}
      if (!ok) return { ok: false, status: 403, reason: 'origin' }
    }

    return { ok: true }
  }
}

// API 요청에만 토큰을 요구한다. 정적 파일(초기 HTML)은 토큰 없이 나가야
// 브라우저가 첫 로드를 할 수 있다 — 그 HTML 에는 문서가 하나도 없다.
export function checkToken(req, url) {
  const bearer = String(req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const qp = url.searchParams.get('t')
  return safeEqual(bearer || qp || '', SESSION_TOKEN)
}

function safeEqual(a, b) {
  const ba = Buffer.from(String(a))
  const bb = Buffer.from(String(b))
  if (ba.length !== bb.length) return false
  return crypto.timingSafeEqual(ba, bb)
}

// 경로 봉인 — realpath 로 해석해 레포 루트 하위인지 확인한다.
// 밖을 가리키는 심볼릭 링크는 따라가지 않고, 화면에 그 사실을 표시한다(§13-③).
export async function resolveInside(root, rel) {
  if (!rel || typeof rel !== 'string') return { ok: false, reason: 'empty' }
  if (rel.includes('\0')) return { ok: false, reason: 'nul' }

  const abs = path.resolve(root, rel)
  let realRoot
  let realAbs
  try {
    realRoot = await fs.realpath(root)
  } catch {
    return { ok: false, reason: 'no-root' }
  }
  try {
    realAbs = await fs.realpath(abs)
  } catch {
    // 없는 파일: 순회만 검사하고 없음으로 답한다
    const inside = isInside(realRoot, abs)
    return { ok: false, reason: inside ? 'missing' : 'outside' }
  }
  if (!isInside(realRoot, realAbs)) return { ok: false, reason: 'outside', resolved: realAbs }
  return { ok: true, abs: realAbs }
}

function isInside(root, target) {
  const r = path.resolve(root)
  const t = path.resolve(target)
  return t === r || t.startsWith(r + path.sep)
}

// 원본 열기 제한 — 실행 확장자는 거부한다(§7.2 위협 6).
const EXECUTABLE = new Set([
  '.exe', '.bat', '.cmd', '.com', '.ps1', '.psm1', '.scr', '.lnk', '.js', '.jse',
  '.vbs', '.vbe', '.wsf', '.wsh', '.msi', '.msp', '.hta', '.cpl', '.reg', '.jar', '.pif',
])

export function isExecutable(p) {
  return EXECUTABLE.has(path.extname(p).toLowerCase())
}
