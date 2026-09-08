// API 클라이언트.
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

async function req(path, opts = {}) {
  const res = await fetch(`/api${path}`, {
    ...opts,
    headers: {
      ...(opts.body ? { 'content-type': 'application/json' } : {}),
      ...(token ? { authorization: `Bearer ${token}` } : {}),
      ...opts.headers,
    },
  })
  if (res.status === 401) throw new ApiError('토큰이 없거나 만료되었습니다. 앱을 다시 실행하세요.', 401)
  if (!res.ok) {
    let detail = ''
    try {
      detail = (await res.json())?.error || ''
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
  state: () => req('/state'),
  saveState: (patch) => req('/state', { method: 'POST', body: JSON.stringify(patch) }),
  // git — GET 은 읽기만. pull/push 는 사람이 누른 것이어야 하므로 POST.
  git: (doFetch) => req('/git' + (doFetch ? '?fetch=1' : '')),
  gitPull: () => req('/git/pull', { method: 'POST', body: '{}' }),
  gitPush: () => req('/git/push', { method: 'POST', body: '{}' }),
  rescan: () => req('/rescan', { method: 'POST' }),
  fileUrl: (p) => `/api/file?path=${encodeURIComponent(p)}&t=${encodeURIComponent(token)}`,
  probeExternal: (p) => req(`/probe-external?path=${encodeURIComponent(p)}`),
  open: (p) => req('/open', { method: 'POST', body: JSON.stringify({ path: p }) }),
  heartbeat: () => req('/heartbeat', { method: 'POST' }).catch(() => {}),
}

// SSE — 파일 변경·스캔 진행. 감시가 살아 있으면 새로고침 버튼이 필요 없다(§23.1).
export function subscribe(onEvent, onOpen) {
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
  const id = setInterval(() => api.heartbeat(), 30_000)
  api.heartbeat()
  return () => clearInterval(id)
}
