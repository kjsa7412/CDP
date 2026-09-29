// API 클라이언트.
//
// **한 번들이 세 얼굴에서 돈다**(MCP 설계서 §6.8 · 제품관리서비스 검토 §4.1). 빌드를
// 나누면 유지비가 배고, 같은 화면이 갈라지면 한쪽만 고쳐진다.
//
// 얼굴은 **주소가 말해 준다**(`router.jsx` 의 `modeOf`).
//
//   로컬   /                → /api/…             세션 토큰 헤더 · SSE · 하트비트        face: local
//   레포   /r/<repo>/       → /api/<repo>/…      세션 쿠키 · SSE 없음 · 하트비트 없음  face: repo
//   사이트 / · /manual · /login · /setup · /r      face: site    ┐ 서버가 index.html 에 심은
//   콘솔   /console/…                              face: console ┘ window.__CDP_SERVER__ 로 안다
//
// **모드 · 레포는 함수다** — `getMode()` · `isServer()` · `currentRepo()`. 전에는 모듈 상수(`mode · BASE · LS`)라
// 다른 레포 · 다른 얼굴로 가려면 모듈을 다시 실행하는 수밖에 없었고, 그래서 얼굴을 넘거나 레포를 바꾸는 전환
// 31곳이 전부 문서 교체였다(화면 · 권한 검토 v0.1 P7 · R7). 지금은 `req()` 가 **부르는 시점**의 레포로 주소를 만든다.
//
// 세션 토큰은 URL 의 ?t= 로 한 번 받아 sessionStorage 에 넣고 이후 헤더로
// 보낸다. 외부 페이지는 sessionStorage 를 읽을 수 없다(설계서 §7.2).
// 받은 뒤 URL 에서 지운다 — 주소창과 히스토리에 토큰을 남기지 않는다. 라우터가 주소를 읽기 전(모듈 로드)이다.

import { navigate, modeOf } from './router.jsx'

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

// ── 모드 · 얼굴 — 매번 주소를 본다 ────────────────────────────────────────────

export const getMode = () => modeOf(location.pathname)
export const isServer = () => getMode().server
export const currentRepo = () => getMode().repo
const base = () => {
  const r = currentRepo()
  return r ? `/api/${encodeURIComponent(r)}` : '/api'
}

// ── 얼굴 사이에서 같이 읽는 것 둘 — 마지막 레포 · 테마 (화면 UX 검토 v0.1 §5.2 · §5.6) ─────
//
// 같은 origin 의 세 얼굴이 같은 localStorage 를 본다. 서버에 두지 않는다(§6.8) — 사람마다 다르고
// 잃어도 그만인 값이다. 이름뿐이라 비밀도 아니다.
const LAST = 'cdp.lastRepo'
// 마지막 **경로**도 — 콘솔에서 「레포」 로 돌아오면 보던 관리 탭이 열린다(화면 · 권한 검토 v0.1 P8 · R9)
const LAST_PATH = 'cdp.lastPath'
const THEME = 'cdp.theme'
export function lastRepo() {
  try {
    return localStorage.getItem(LAST) || null
  } catch {
    return null
  }
}
export function rememberRepo(name, path = null) {
  try {
    if (name) {
      localStorage.setItem(LAST, name)
      if (path) localStorage.setItem(LAST_PATH, path)
      else localStorage.removeItem(LAST_PATH)
    } else {
      localStorage.removeItem(LAST)
      localStorage.removeItem(LAST_PATH)
    }
  } catch {}
}
// 「레포」 로 가는 주소 — 마지막에 보던 레포의 마지막 경로. 없으면 서버가 첫 레포를 고른다(/r)
export function repoHref() {
  const n = lastRepo()
  if (!n) return '/r'
  const root = '/r/' + encodeURIComponent(n) + '/'
  let p = null
  try {
    p = localStorage.getItem(LAST_PATH)
  } catch {}
  return p && p.startsWith(root) ? p : root
}
// 로그인 뒤 갈 곳 — **역할이 정한다.** admin 은 콘솔, writer · viewer 는 레포(마지막에 보던 곳 · 없으면 첫 레포).
// `next` 는 그 역할이 갈 수 있을 때만 따른다 — 관리자가 콘솔에서 로그아웃한 자리에 다른 사람이 로그인해
// 「관리자 권한이 필요합니다」 를 첫 화면으로 보던 것 · `/login?next=/login?next=…` 가 겹쳐 로그인 화면에 머물던 것.
export function landingFor(me, next = null) {
  const admin = !!(me?.admin || me?.role === 'admin')
  const home = admin ? '/console' : repoHref()
  const t = String(next || '')
  if (!/^\/(?!\/)/.test(t)) return home
  const p = t.split(/[?#]/)[0]
  if (p === '/' || p === '/r' || p === '/r/') return home
  if (/^\/(login|logout|setup)(\/|$)/.test(p)) return home
  if (/^\/console(\/|$)/.test(p) && !admin) return home
  return t
}
export function getTheme() {
  try {
    const t = localStorage.getItem(THEME)
    return t === 'light' || t === 'dark' ? t : 'system'
  } catch {
    return 'system'
  }
}
export function setTheme(t) {
  try {
    if (t === 'light' || t === 'dark') localStorage.setItem(THEME, t)
    else localStorage.removeItem(THEME)
  } catch {}
}
// 테마를 붙인다 — `index.html` 의 인라인 스크립트가 첫 페인트 전에 같은 계산으로 한 번 붙였다(화면 · 권한 검토 v0.1 R9).
// 여기서는 OS 변화 · 다른 탭의 변경 · 설정 변경을 따라간다. 값은 'dark' | 'light' 둘뿐이다.
export function applyTheme(t = getTheme()) {
  const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
  const v = dark ? 'dark' : 'light'
  if (document.documentElement.dataset.theme !== v) document.documentElement.dataset.theme = v
  // 스크롤바 · 폼 컨트롤 · 문서 사이의 캔버스도 같은 테마로(index.html 의 meta 와 같은 값)
  const m = document.querySelector('meta[name="color-scheme"]')
  if (m && m.content !== v) m.content = v
}

// 레포를 바꾼다 = **주소를 바꾼다.** 화면 상태를 들고 가지 않는다(§6.6.2) —
// 좌표 체계가 레포마다 다르므로 이어받을 수 있는 것이 없다. `<App key={repo}>` 가 상태를 새로 만든다.
export function gotoRepo(name) {
  navigate('/r/' + encodeURIComponent(name) + '/')
}

// 로그아웃 — 서버 왕복이 필요한 유일한 전환. JSON 으로 받고 화면이 소개로 간다(pushState) — 문서 교체 없음(Q6).
export async function logout() {
  try {
    await fetch('/logout', { method: 'POST' })
  } catch {}
}

// 서버 모드의 화면 상태는 **브라우저에 둔다**(§6.8). 서버 저장 0 —
// 사람마다 다르고 잃어도 그만인 값이라 명부·설치 대장 옆에 둘 것이 아니다.
const lsKey = () => 'cdp.state.' + (currentRepo() || 'local')
// 테마만은 레포별이 아니다 — alpha 에서 밝게 고정했는데 gamma · 콘솔 · 소개가 어둡던 것(검토 P12).
function localState() {
  let st = {}
  try {
    st = JSON.parse(localStorage.getItem(lsKey()) || '{}')
  } catch {}
  return { ...st, theme: getTheme() }
}
// 지금 상태를 동기로 — 서버 모드는 브라우저에 있으니 첫 렌더부터 있다(App 의 「불러오는 중…」 을 줄인다 · R8). 로컬은 null
export const stateNow = () => (isServer() ? localState() : null)
function saveLocalState(patch) {
  if ('theme' in patch) setTheme(patch.theme)
  const { theme, ...rest } = patch
  const next = { ...localState(), ...rest }
  try {
    localStorage.setItem(lsKey(), JSON.stringify(next))
  } catch {}
  return { ...next, theme: getTheme() }
}

// `allowStatus` — **실패가 결과인 호출이 있다.**
//
// ff 불가·원격 안 닿음·로그인 실패는 HTTP 오류가 아니라 **읽어야 하는 답**이다. 전에는
// 그것도 예외로 던져서, 서버가 보낸 "원격이 3건 앞서 있고 로컬에도 2건이
// 있습니다 — 터미널에서 git pull --rebase" 가 화면에서는 `HTTP 409` 로만
// 보였다. 본문을 그대로 돌려준다.
//
// 401 은 둘로 갈린다 — `E_REAUTH`(콘솔 쓰기에 관리자 확인이 필요하다)는 **던진다**
// 부르는 쪽이 확인 모달을 띄우고 다시 시도한다. 나머지 401 은 세션이 끊긴 것이라
// 보던 곳을 들고 로그인으로 간다(§6.6.1) — pushState 로. 그 뒤 던지는 오류는 화면이 그리지 않는다(`cache.js`).
async function req(path, opts = {}) {
  const { allowStatus = [], absolute = false, ...init } = opts
  const server = isServer()
  const at = location.pathname
  const res = await fetch((absolute ? '' : base()) + path, {
    ...init,
    headers: {
      ...(init.body ? { 'content-type': 'application/json' } : {}),
      // 서버 모드는 쿠키다 — 브라우저는 `Authorization` 을 스스로 달 수 없다(§6.4).
      ...(token && !server ? { authorization: `Bearer ${token}` } : {}),
      ...init.headers,
    },
  })
  if (!res.ok && allowStatus.includes(res.status)) return res.json()
  if (res.status === 401) {
    let j = null
    try {
      j = await res.json()
    } catch {}
    if (j?.error?.code === 'E_REAUTH') throw new ApiError(j.error.message, 401, 'E_REAUTH')
    // 보내던 자리를 떠났거나(로그아웃 뒤 늦게 온 답) 이미 로그인 화면이면 옮기지 않는다 — `next` 가 겹치지 않게
    if (server) {
      if (location.pathname === at && !/^\/login(\/|$)/.test(at)) navigate('/login?next=' + encodeURIComponent(location.pathname + location.search))
      throw new ApiError('로그인이 필요합니다', 401, 'E_AUTH')
    }
    throw new ApiError('토큰이 없거나 만료되었습니다. 앱을 다시 실행하세요.', 401)
  }
  if (!res.ok) {
    let detail = ''
    let code = null
    try {
      const j = await res.json()
      detail = j?.error?.message || j?.error || j?.message || ''
      code = j?.error?.code || null
    } catch {}
    throw new ApiError(detail || `HTTP ${res.status}`, res.status, code)
  }
  const ct = res.headers.get('content-type') || ''
  return ct.includes('json') ? res.json() : res.text()
}

export class ApiError extends Error {
  constructor(msg, status, code = null) {
    super(msg)
    this.status = status
    this.code = code
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
  state: () => (isServer() ? Promise.resolve(localState()) : req('/state')),
  saveState: (patch) =>
    isServer() ? Promise.resolve(saveLocalState(patch)) : req('/state', { method: 'POST', body: JSON.stringify(patch) }),
  // 누구인가 · 무엇을 볼 수 있는가 · 역할. 서버 모드에만 있다. `probe` 면 비로그인(401)을 null 로 — 로그인으로 보내지 않는다
  me: ({ probe = false } = {}) =>
    isServer()
      ? req('/me', { absolute: true, allowStatus: probe ? [401] : [] }).then((j) => (j && !j.error ? j : null))
      : Promise.resolve(null),

  // ── 설치 대장 (§6.7.2) — 서버 모드 전용. 로컬의 `/workrepos` 와 **다른
  // 것**이다: 로컬은 이 PC 에 깐 곳을, 서버는 등록과 추적을 든다(§6.2).
  registry: () => req('/workrepos', { absolute: true }),
  // ── 지식 레포 (서버판 · 검토 §3.5) — 목록 · 패키지. 세우기(`POST /repos`)는 없앴다 — 콘솔 `admin.repoNew` 만(화면 · 권한 검토 v0.1 R1)
  repos: () => req('/repos', { absolute: true }),
  packages: () => req('/packages', { absolute: true }),
  registryAdd: (body) => req('/workrepos', { absolute: true, method: 'POST', body: JSON.stringify(body) }),
  registryDel: (id) => req('/workrepos/' + encodeURIComponent(id), { absolute: true, method: 'DELETE' }),
  // 설치 꾸러미. **토큰은 들어 있지 않다**(§6.7.3) — 브라우저가 그냥 받는다.
  kitUrl: (id) => `/kit/${encodeURIComponent(currentRepo())}?workrepo=${encodeURIComponent(id)}`,
  // git — GET 은 읽기만. pull/push 는 사람이 누른 것이어야 하므로 POST. **로컬만** — 서버에는 `/git` 이 없다(R4)
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
    `${base()}/file?path=${encodeURIComponent(p)}` + (isServer() ? '' : `&t=${encodeURIComponent(token)}`),
  // 내려받기 — 문서 하나(`download=1` → 새 탭 대신 파일) · 묶음(zip · `managed` 관리 문서 · `work` 작업 문서). 읽기 권한이면 된다
  downloadUrl: (p) => api.fileUrl(p) + '&download=1',
  archiveUrl: (layer) =>
    `${base()}/archive?layer=${encodeURIComponent(layer)}` + (isServer() ? '' : `&t=${encodeURIComponent(token)}`),
  probeExternal: (p) => req(`/probe-external?path=${encodeURIComponent(p)}`),
  open: (p) => req('/open', { method: 'POST', body: JSON.stringify({ path: p }) }),
  heartbeat: () => req('/heartbeat', { method: 'POST' }).catch(() => {}),
}

// ── 사이트 (검토 §4.2) — 공개 자리. 레포 이름 · 사람 이름이 없는 값만 온다 ──────
export const site = {
  info: () => req('/site/info', { absolute: true }),
  // 설명서 원문 — 렌더는 화면이 한다(D10). 응답이 text/markdown 이라 문자열로 온다
  manual: (id) => req('/site/manual/' + encodeURIComponent(id) + '.md', { absolute: true }),
  figure: (name) => '/site/manual/' + encodeURIComponent('그림') + '/' + encodeURIComponent(name),
  // 로그인 · 마법사 — 실패(401 · 409 · 429)가 **읽어야 하는 답**이다
  login: (tok, next) => req('/login', { absolute: true, method: 'POST', body: JSON.stringify({ token: tok, next }), allowStatus: [401, 429] }),
  setup: (body) => req('/setup', { absolute: true, method: 'POST', body: JSON.stringify(body), allowStatus: [400, 401, 409, 429] }),
}

// ── 콘솔 (검토 §4.2 · §4.7) — admin · 쓰기는 재인증(`E_REAUTH` 를 던진다) ─────────
const A = (p, init = {}) => req('/admin' + p, { absolute: true, ...init })
const J = (method, body) => ({ method, body: JSON.stringify(body ?? {}) })
export const admin = {
  overview: () => A('/overview'),
  users: () => A('/users'),
  userAdd: (b) => A('/users', J('POST', b)),
  userSet: (name, b) => A('/users/' + encodeURIComponent(name), J('PATCH', b)),
  tokens: () => A('/tokens'),
  tokenIssue: (b) => A('/tokens', J('POST', b)),
  tokenReissue: (id, b = {}) => A(`/tokens/${encodeURIComponent(id)}/reissue`, J('POST', b)),
  tokenRevoke: (id) => A(`/tokens/${encodeURIComponent(id)}/revoke`, J('POST', {})),
  tokenSet: (id, b) => A('/tokens/' + encodeURIComponent(id), J('PATCH', b)),
  repos: () => A('/repos'),
  repoNew: (b) => A('/repos', J('POST', b)),
  // 레포 하나의 복구 셋(동시 기록 검토 v0.1 D4 · D5) — 재인증 뒤. 거절(409)도 읽어야 하는 답이다(갈라짐 · 더러움의 문장)
  repoSync: (name) => A(`/repos/${encodeURIComponent(name)}/sync`, { ...J('POST', {}), allowStatus: [409] }),
  repoPush: (name) => A(`/repos/${encodeURIComponent(name)}/push`, { ...J('POST', {}), allowStatus: [409] }),
  repoRestore: (name) => A(`/repos/${encodeURIComponent(name)}/restore`, { ...J('POST', {}), allowStatus: [409] }),
  // 원격에 잇는다 — 세울 때 빠뜨린 origin. push 거절(409)도 답이다(사유 · 문장). 강제 push 는 없다
  repoOrigin: (name, url) => A(`/repos/${encodeURIComponent(name)}/origin`, { ...J('POST', { url }), allowStatus: [409] }),
  // 치운다 — 휴지통(<data>/trash)으로 옮긴다. 확인 이름이 레포 이름과 같아야 한다
  repoDelete: (name, confirm) => A(`/repos/${encodeURIComponent(name)}`, J('DELETE', { confirm })),
  // git 자격 — 공개 키 · 지문 · 결과만 오간다(비밀 없음). PAT 는 여기 없다 — 셸의 `ctx serve git-auth`(D8)
  gitauth: () => A('/gitauth'),
  gitKey: (rotate = false) => A('/gitauth/key', J('POST', { rotate })),
  gitScan: (url) => A('/gitauth/scan', J('POST', { url })),
  gitTrust: (url, fingerprint) => A('/gitauth/trust', J('POST', { url, fingerprint })),
  gitTest: (url) => A('/gitauth/test', J('POST', { url })),
  workrepos: () => A('/workrepos'),
  doctor: (fresh = false) => A('/doctor' + (fresh ? '?fresh=1' : '')),
  server: () => A('/server'),
  audit: (limit = 200) => A('/audit?limit=' + limit),
  log: (limit = 200) => A('/log?limit=' + limit),
  // 재인증 — 틀린 토큰(401) · 너무 잦음(429)은 답이다
  sudo: (tok) => A('/sudo', { ...J('POST', { token: tok }), allowStatus: [401, 429] }),
}

// SSE — 파일 변경·스캔 진행. 감시가 살아 있으면 새로고침 버튼이 필요 없다(§23.1).
export function subscribe(onEvent, onOpen) {
  // 서버 모드에는 SSE 가 없다. 감시를 켜지 않으므로(§6.1) 보낼 이벤트도 없고,
  // 상주 서버에 탭마다 연결을 물릴 이유도 없다.
  if (isServer()) return () => {}
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
  if (isServer()) return () => {}
  const id = setInterval(() => api.heartbeat(), 30_000)
  api.heartbeat()
  return () => clearInterval(id)
}
