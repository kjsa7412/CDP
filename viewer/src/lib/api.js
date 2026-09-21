// API 클라이언트.
//
// **한 번들이 두 모드에서 돈다**(MCP 설계서 §6.8). 빌드를 둘로 나누면
// 유지비가 두 배고, 같은 화면이 갈라지면 한쪽만 고쳐진다.
//
// 모드는 **주소가 말해 준다.** 관리 서비스는 화면을 `/r/<repo>/…` 로 서빙하므로
// 경로 첫 조각이 `r` 이면 서버 모드이고 둘째가 레포 이름이다 — 판정하려고
// 왕복할 필요가 없다.
//
//   로컬   /            → /api/…              세션 토큰 헤더 · SSE · 하트비트
//   서버   /r/<repo>/   → /api/<repo>/…       세션 쿠키 · SSE 없음 · 하트비트 없음
//
// 세션 토큰은 URL 의 ?t= 로 한 번 받아 sessionStorage 에 넣고 이후 헤더로
// 보낸다. 외부 페이지는 sessionStorage 를 읽을 수 없다(설계서 §7.2).
// 받은 뒤 URL 에서 지운다 — 주소창과 히스토리에 토큰을 남기지 않는다.

const KEY = 'cdp.token'

function readToken() {
  const url = new URL(location.href)
  const t = url.searchParams.get('t')
  if (t) {
    try {
      sessionStorage.setItem(KEY, t)
    } catch {}
    url.searchParams.delete('t')
    history.replaceState(null, '', url.pathname + url.search + url.hash)
    return t
  }
  try {
    return sessionStorage.getItem(KEY) || ''
  } catch {
    return ''
  }
}

export const token = readToken()

// ── 모드 ────────────────────────────────────────────────────────────────────

function readMode() {
  const seg = location.pathname.split('/').filter(Boolean)
  if (seg[0] === 'r' && seg[1]) return { server: true, repo: decodeURIComponent(seg[1]) }
  return { server: false, repo: null }
}

export const mode = readMode()
export const isServer = mode.server
const BASE = mode.server ? `/api/${encodeURIComponent(mode.repo)}` : '/api'

// 레포를 바꾼다 = **주소를 바꾼다.** 화면 상태를 들고 가지 않는다(§6.6.2) —
// 좌표 체계가 레포마다 다르므로 이어받을 수 있는 것이 없다.
export function gotoRepo(name) {
  location.href = '/r/' + encodeURIComponent(name) + '/'
}

// 서버 모드의 화면 상태는 **브라우저에 둔다**(§6.8). 서버 저장 0 —
// 사람마다 다르고 잃어도 그만인 값이라 명부·설치 대장 옆에 둘 것이 아니다.
const LS = 'cdp.state.' + (mode.repo || 'local')
function localState() {
  try {
    return JSON.parse(localStorage.getItem(LS) || '{}')
  } catch {
    return {}
  }
}
function saveLocalState(patch) {
  const next = { ...localState(), ...patch }
  try {
    localStorage.setItem(LS, JSON.stringify(next))
  } catch {}
  return next
}

// `allowStatus` — **실패가 결과인 호출이 있다.**
//
// ff 불가·원격 안 닿음은 HTTP 오류가 아니라 **읽어야 하는 답**이다. 전에는
// 그것도 예외로 던져서, 서버가 보낸 "원격이 3건 앞서 있고 로컬에도 2건이
// 있습니다 — 터미널에서 git pull --rebase" 가 화면에서는 `HTTP 409` 로만
// 보였다. 본문을 그대로 돌려준다.
async function req(path, opts = {}) {
  const { allowStatus = [], absolute = false, ...init } = opts
  const res = await fetch((absolute ? '' : BASE) + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      // 서버 모드는 쿠키다 — 브라우저는 `Authorization` 을 스스로 달 수 없다(§6.4).
      ...(token && !mode.server ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (res.status === 401) {
    // 세션이 끊겼다. **보던 곳을 들고 로그인으로 간다**(§6.6.1).
    if (mode.server) {
      location.href = '/login?next=' + encodeURIComponent(location.pathname + location.search)
      return new Promise(() => {}) // 이동 중 — 화면이 오류를 그리지 않게
    }
    throw new ApiError('토큰이 없거나 만료되었습니다. 앱을 다시 실행하세요.', 401)
  }
  if (!res.ok && allowStatus.includes(res.status)) return res.json()
  if (!res.ok) {
    let detail = ''
    try {
      const j = await res.json()
      detail = j?.error || j?.message || ''
    } catch {}
    throw new ApiError(detail || `HTTP ${res.status}`, res.status)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('json') ? res.json() : res.text()
}

export class ApiError extends Error {
  constructor(msg, status) {
    super(msg)
    this.status = status
  }
}

export const api = {
  repo: () => req('/repo'),
  probe: (p) => req(`/repo/probe?path=${encodeURIComponent(p)}`),
  // 작업 레포 세팅. `apply` 없이 부르면 **무엇을 쓸지만** 돌려준다.
  setup: (p, apply = false) =>
    req('/setup', { method: 'POST', body: JSON.stringify({ path: p, apply }) }),
  // 경로 지정 — 설정 저장과 스캔 대상 변경을 한 번에 한다
  setRepo: (p) => req('/repo', { method: 'POST', body: JSON.stringify({ path: p }) }),
  docs: () => req('/docs'),
  doc: (id) => req(`/docs/${encodeURIComponent(id)}`),
  vocab: () => req('/vocab'),
  // 뻗어나가기 — 한 노드의 다음 레벨 하나
  next: (kind, key) => req(`/next?kind=${encodeURIComponent(kind)}&key=${encodeURIComponent(key)}`),
  timeline: (coord) => req(`/timeline?coord=${encodeURIComponent(coord)}`),
  search: (q, force) => req(`/search?q=${encodeURIComponent(q)}${force ? '&force=1' : ''}`),
  check: () => req('/check'),
  status: () => req('/status'),
  managed: () => req('/managed'),
  coord: (c) => req(`/coord?coord=${encodeURIComponent(c)}`),
  state: () => (mode.server ? Promise.resolve(localState()) : req('/state')),
  saveState: (patch) =>
    mode.server ? Promise.resolve(saveLocalState(patch)) : req('/state', { method: 'POST', body: JSON.stringify(patch) }),
  // 누구인가 · 무엇을 볼 수 있는가. 서버 모드에만 있다.
  me: () => (mode.server ? req('/me', { absolute: true }) : Promise.resolve(null)),
  // git — GET 은 읽기만. pull/push 는 사람이 누른 것이어야 하므로 POST.
  git: (doFetch) => req('/git' + (doFetch ? '?fetch=1' : '')),
  gitPull: () => req('/git/pull', { method: 'POST', body: '{}', allowStatus: [409] }),
  gitPush: () => req('/git/push', { method: 'POST', body: '{}', allowStatus: [409] }),
  // git 설정 — 읽기. 쓰는 것은 훅 한 줄뿐이다
  gitConfig: () => req('/git/config'),
  gitHooks: () => req('/git/hooks', { method: 'POST', body: '{}', allowStatus: [409] }),
  // 동기화 — 순서는 서버가 갖는다. 진행은 SSE 로 온다
  sync: () => req('/sync'),
  runSync: (pull = true) =>
    req('/sync', { method: 'POST', body: JSON.stringify({ pull }), allowStatus: [409] }),
  // 작업 레포 — 설치 상태를 한 번에
  workRepos: () => req('/workrepos'),
  diag: () => req('/diag'),
  rescan: () => req('/rescan', { method: 'POST' }),
  fileUrl: (p) =>
    `${BASE}/file?path=${encodeURIComponent(p)}` + (mode.server ? '' : `&t=${encodeURIComponent(token)}`),
  probeExternal: (p) => req(`/probe-external?path=${encodeURIComponent(p)}`),
  open: (p) => req('/open', { method: 'POST', body: JSON.stringify({ path: p }) }),
  heartbeat: () => req('/heartbeat', { method: 'POST' }).catch(() => {}),
}

// SSE — 파일 변경·스캔 진행. 감시가 살아 있으면 새로고침 버튼이 필요 없다(§23.1).
export function subscribe(onEvent, onOpen) {
  // 서버 모드에는 SSE 가 없다. 감시를 켜지 않으므로(§6.1) 보낼 이벤트도 없고,
  // 상주 서버에 탭마다 연결을 물릴 이유도 없다.
  if (mode.server) return () => {}
  const es = new EventSource(`/api/events?t=${encodeURIComponent(token)}`)
  es.onmessage = (e) => {
    try {
      onEvent(JSON.parse(e.data))
    } catch {}
  }
  // 연결이 붙기 전에 지나간 이벤트는 못 받는다. 붙는 순간 상태를 한 번
  // 다시 읽어 맞춘다 — 특히 감시 ready 는 기동 직후에 오므로 놓치기 쉽다.
  es.onopen = () => onOpen?.()
  return () => es.close()
}

// 하트비트 — 탭이 닫히면 서버도 종료된다(§5.2 ⑥)
export function startHeartbeat() {
  // 하트비트는 **탭이 닫히면 서버를 끄는** 장치다(§5.2 ⑥). 상주 서버에서
  // 그것을 보내면 남의 화면까지 끄는 셈이 된다.
  if (mode.server) return () => {}
  const id = setInterval(() => api.heartbeat(), 30_000)
  api.heartbeat()
  return () => clearInterval(id)
}
