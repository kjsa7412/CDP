// 셸 — **왼쪽은 한 번에 하나, 오른쪽은 문서.**
//
// 전에는 왼쪽을 위아래로 갈라 위에 시작점(탭 4개), 아래에 뻗어나가기를 두었다.
// 둘 다 상시로 떠 있어서 **둘 다 좁았다** — 400px 안에서 탭 넷이 세로로 쪼개지고,
// 226px 짜리 뻗어나가기 열은 한 개 반만 들어갔다. 그래서 상단에 `1:1 2:1 3:1
// 찾기만` 네 개가 필요했다. **비율 버튼이 있다는 것 자체가 레이아웃이 안 맞는다는
// 증거였다.**
//
// 지금은 왼쪽이 한 번에 하나만 한다.
//
//   목록        관리문서 · 작업문서 · 좌표에서 **시작점**을 고른다
//   뻗어나가기   고른 것에서 한 레벨씩 다음 노드로
//
// 둘이 같은 자리를 쓰므로 각각이 **세로 전체**를 받는다. 폭도 따로 기억한다 —
// 목록은 좁아도 되고 뻗어나가기는 열이 여럿이라 넓어야 한다.
//
// 그래프는 왼쪽에서 나갔다. 좌표 288개짜리 그림은 패널이 아니라 **화면**이
// 필요하다. 상단 `그래프` 로 들어가면 창 전체를 쓰고 `Esc` 로 돌아온다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { api, subscribe, startHeartbeat, ApiError, isServer, currentRepo, rememberRepo, stateNow, getTheme, setTheme, applyTheme } from './lib/api.js'
import { useRoute, modeOf, navigate, Link } from './lib/router.jsx'
import { useSession } from './lib/session.jsx'
import { useSlots } from './lib/slots.js'
import { load, peek, put } from './lib/cache.js'
import { buildCoordIndex } from './lib/markdown.js'
import { summaryText } from './lib/format.js'
import DocView from './components/DocView.jsx'
import CheckView from './components/CheckView.jsx'
import Palette from './components/Palette.jsx'
import StatusBar from './components/StatusBar.jsx'
import AdminView, { menuFor } from './components/admin/AdminView.jsx'
import { KEYS, kbd } from './lib/keys.js'
import Finder from './components/Finder.jsx'
import Explore from './components/Explore.jsx'
import CoordGraph from './components/CoordGraph.jsx'
import Icon from './components/Icon.jsx'
import { copyText } from './lib/clip.js'
import DocNav from './components/DocNav.jsx'
import { docHref, docOfRoute, canonDocId, docTitle, tabsOpen, tabsClose, tabsPin, recentPush } from './lib/doclink.js'

// 왼쪽 폭 — 하는 일에 따라 다르다. 목록은 제목 한 줄이면 되고, 뻗어나가기는
// 열이 둘 이상 들어가야 "가로로 뻗는다"가 성립한다.
const W_LIST = 340
const W_XP = 560

// 첫 화면 — 마지막에 읽던 문서를 그대로 연다. 시작점도 거기서 잡는다.
//
// **관리 문서도 찾는다.** 전에는 `d.docs`(작업 기록)에서만 찾아서,
// 어제 마지막으로 본 것이 테이블정의서였으면 복원이 조용히 실패했다 --
// 빈 화면으로 열리고 뻗어나가기도 꺼진 채였다.
//
// **왼쪽은 목록으로 연다.** 어제 뻗던 자리를 복원하면, 오늘 처음 보는
// 화면이 어디서 왔는지 모를 열 몇 개가 된다.
function restoreOf(s, d, m) {
  if (!s?.lastDoc || !d) return null
  const work = d.docs.find((x) => x.id === s.lastDoc)
  if (work) return { docId: s.lastDoc, root: { kind: 'work', key: s.lastDoc, label: work.title, open: s.lastDoc } }
  const man = (m || []).find((x) => x.path === s.lastDoc)
  if (man) return { docId: s.lastDoc, root: { kind: 'managed', key: man.path, label: man.name, open: man.path } }
  return null
}

export default function App() {
  // 이 레포의 캐시 키 — `<App key={repo}>` 라 마운트 동안 바뀌지 않는다(화면 · 권한 검토 v0.1 R8).
  // 콘솔 · 설명서에 갔다 돌아오면 마지막 값으로 **즉시** 그리고 뒤에서 다시 읽는다 — 「불러오는 중…」 이 없다.
  const RK = currentRepo() || 'local'
  const ck = useCallback((p) => 'api:' + RK + p, [RK])
  const [boot] = useState(() => {
    const k = (p) => 'api:' + RK + p
    const s = stateNow() || peek(k('/state')) || null
    const d = peek(k('/docs'))
    const m = peek(k('/managed'))
    // 주소에 문서가 있으면(새로고침 · 받은 링크) 그 문서가 첫 화면이다 — 마지막 문서(lastDoc)는 주소가 비었을 때만
    const rd = docOfRoute(modeOf().rest || [], new URLSearchParams(location.search))
    return { r: peek(k('/repo')) || null, d, v: peek(k('/vocab')) || null, m, s, at: restoreOf(s, d, m), rd }
  })
  const [state, setState] = useState(boot.s)
  const [repo, setRepo] = useState(boot.r)
  const [docs, setDocs] = useState(boot.d?.docs || [])
  const [tree, setTree] = useState(boot.v)
  const [managedList, setManagedList] = useState(boot.m || [])
  // 레포 안의 그 밖 문서 — MANUAL.md · README.md · CLAUDE.md 등.
  // **레포마다 있을 수도 없을 수도 있다.** 없는 것을 버튼으로 내밀지 않는다.
  const [others, setOthers] = useState(boot.d?.others || [])
  // 뻗어나가기의 뿌리. 목록에서 고른 것 하나. { kind, key, label }
  const [root, setRoot] = useState(boot.at?.root || null)
  const [docId, setDocId] = useState(boot.rd?.id || boot.at?.docId || null)
  // 첫 읽기(서버의 state)가 끝났나 — 그 전에 탭 · 최근을 고치면 곧이어 오는 서버 state 가 덮는다
  const [ready, setReady] = useState(false)
  // 900px 아래 — 왼쪽은 문서 **위에 뜬다**(app.css). 문서를 고르거나 문서 쪽을 누르면 덮개를 걷는다. 전에는 골라도 그대로
  // 덮고 있어서 ◀ 를 찾아야 읽혔다(실서버 종합 시험 F11). 읽기 모드(reading.mode)와 달리 **기억하지 않는다** — 넓히면 원래대로
  const narrowQ = typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(max-width: 900px)') : null
  const [narrow, setNarrow] = useState(() => !!narrowQ?.matches)
  const [drawerShut, setDrawerShut] = useState(false)
  useEffect(() => {
    if (!narrowQ) return
    const on = () => setNarrow(narrowQ.matches)
    narrowQ.addEventListener?.('change', on)
    return () => narrowQ.removeEventListener?.('change', on)
  }, [])
  // 문서 안에서 갈 자리 — { value, seq }. 섹션(좌표) 줄을 눌러 왔을 때만 있다.
  const [docAt, setDocAt] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // 화면 전체 모드 · 관리 메뉴는 **주소다**(화면 · 권한 검토 v0.1 R9 · P8) — `/r/<레포>/` 문서 · `/graph` · `/manage/<탭>`
  // (로컬은 `/` · `/graph` · `/manage/<탭>`). 뒤로 가기 · 새로고침 · 링크 · 콘솔 → 「레포」 가 그 자리로 온다.
  // 관리 화면에서 보던 메뉴는 **화면을 나갔다 와도 그 자리다** — 동기화를 보다 문서로 갔다가 다시 들어오면 동기화여야 한다.
  const route = useRoute()
  const here = modeOf(route.path)
  const rest = here.rest || []
  const topMode = rest[0] === 'graph' ? 'graph' : rest[0] === 'manage' ? 'admin' : 'doc'
  const baseHref = here.server ? '/r/' + encodeURIComponent(here.repo) + '/' : '/'
  // 문서도 주소다 — `/d/<id>[?at=]`(문서 이동 검토 v0.1 A). 문서 화면에서만 읽는다
  const routeDoc = topMode === 'doc' ? docOfRoute(rest, route.query) : null
  const [lastTab, setLastTab] = useState('overview')
  const adminTab = topMode === 'admin' && rest[1] ? rest[1] : lastTab
  useEffect(() => {
    if (topMode === 'admin' && rest[1]) setLastTab(rest[1])
  }, [topMode, rest[1]])
  // 없는 관리 탭(`/manage/없음` · 서버에서 `/manage/repo`)은 현황으로 — 주소를 고쳐 둬야 메뉴의 현재 표시가 맞는다
  useEffect(() => {
    if (topMode === 'admin' && rest[1] && !menuFor(here.server).some((m) => m.key === rest[1])) navigate(baseHref + 'manage/overview', { replace: true })
  }, [topMode, rest[1], here.server, baseHref])
  // 「문서」 로 오면 보던 문서의 주소로 — 그래프 · 관리에 갔다 와도 그 문서다
  const setTopMode = useCallback(
    (mode) =>
      navigate(
        mode === 'graph' ? baseHref + 'graph' : mode === 'admin' ? baseHref + 'manage/' + lastTab : docId ? docHref(baseHref, docId) : baseHref
      ),
    [baseHref, lastTab, docId]
  )
  const setAdminTab = useCallback((t) => navigate(baseHref + 'manage/' + t), [baseHref])
  // 동기화 진행 — **서버가 갖고 SSE 로 온다.** 이 컴포넌트가 들고 있으면
  // 탭이 둘일 때 한쪽만 알게 된다. { phase, startedAt, last, log }
  const [sync, setSync] = useState(null)
  // 도움말은 설정이 아니다. 단축키와 매뉴얼은 **읽는 것**이고, 레포 경로와
  // 에이전트 설치는 **바꾸는 것**이다. 한 창에 두면 매일 찾는 쪽이 매번
  // 평생 한 번 하는 것을 지나야 한다.
  const [helpOpen, setHelpOpen] = useState(false)
  const [menuOpen, setMenuOpen] = useState(false)
  const [changedPaths, setChangedPaths] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [needSetup, setNeedSetup] = useState(false)
  // 서버 모드의 나 — 누구인가 · 무엇을 볼 수 있는가(§6.6.2). **Shell 의 세션 하나**를 쓴다(R8). 로컬은 null.
  const session = useSession()
  const me = session?.me || null
  const slots = useSlots()
  // 역할 · 레포 할당이 바뀌었을 수 있다 — 레포 화면을 열 때 세션이 오래됐으면 뒤에서 한 번(화면은 그대로 선다)
  useEffect(() => {
    session?.refreshIfStale?.()
  }, [])
  // 검사 결과는 뷰가 아니라 **오버레이**다.
  //
  // 오류는 커밋을 막으므로 **무엇이 막았는지**로 가는 길이 항상 있어야 한다.
  const [checkOpen, setCheckOpen] = useState(false)
  // 왼쪽이 지금 하는 일 — 'list'(고른다) · 'explore'(뻗는다). **둘이 같이 있지 않다.**
  const [leftMode, setLeftMode] = useState('list')
  // L2 대상 — 'managed' · 'work' · 'coord'.
  //
  // **Finder 안에 있던 것을 여기로 올렸다.** 패널 머리의 스텝 1이 "지금
  // 무엇 중에서 찾고 있나"를 부제로 적으려면 머리와 목록이 같은 값을 봐야
  // 한다. 아래에 있으면 머리는 그것을 모른다.
  const [scope, setScope] = useState('managed')
  const atSeqRef = useRef(0)
  // 문서 이동이 콜백 · effect 안에서 「지금」 을 읽는 자리 — 매 렌더 맞춘다
  const leftRef = useRef(null)
  leftRef.current = { root, leftMode, scope }
  const docIdRef = useRef(docId)
  docIdRef.current = docId
  const stateRef = useRef(state)
  stateRef.current = state
  const managedRef = useRef(managedList)
  managedRef.current = managedList
  const routeDocRef = useRef(routeDoc)
  routeDocRef.current = routeDoc
  // 다음 「주소 → 문서」 가 탭을 어떻게 할지 — openDoc 이 정하고 거기서 쓴다. 뒤로 · 앞으로면 비어 있다(= 지금 탭을 바꾼다)
  const tabHowRef = useRef(null)
  const appliedRef = useRef(null)
  // 「← 이전」 — 지금 히스토리 항목이 실은 직전 문서
  const [nav, setNav] = useState({ prev: null, direct: false })

  const reading = state?.reading || { mode: 'browse', fontSize: 15, measure: 760, coordLinks: true }
  const myCoords = state?.myCoords || []
  const readMap = state?.read || {}

  // ── 초기 로드 ──────────────────────────────────────────────────────────
  // 언제나 새로 읽는다(force) — 캐시로 이미 그렸으면 이것이 「뒤에서 갱신」 이다. 받은 것은 캐시에도 둔다.
  const reload = useCallback(async () => {
    const f = { force: true }
    const [r, d, v, s, m] = await Promise.all([
      load(ck('/repo'), api.repo, f),
      load(ck('/docs'), api.docs, f),
      load(ck('/vocab'), api.vocab, f),
      api.state(),
      load(ck('/managed'), () => api.managed().catch(() => []), f),
    ])
    setRepo(r)
    setDocs(d.docs)
    setTree(v)
    setState(s)
    setManagedList(m || [])
    setOthers(d.others || [])
    return { r, d, v, s, m: m || [] }
  }, [ck])

  useEffect(() => {
    reload()
      .then(({ r, d, s, m }) => {
        // **서버 모드에는 첫 실행 분기가 없다**(§6.6.3). 고를 레포 경로가
        // 없고, 로그인 뒤 바로 문서다.
        if (!isServer() && (!s.repoPath || r.docs === 0)) {
          if (!s.repoPath) setNeedSetup(true)
        }
        // 첫 화면 — 마지막에 읽던 문서(restoreOf). 캐시로 이미 열었으면 그대로 둔다
        if (!boot.at && !boot.rd) {
          const at = restoreOf(s, d, m)
          if (at) {
            setDocId(at.docId)
            setRoot(at.root)
          }
        }
        api.saveState({ lastVisit: new Date().toISOString() })
        setReady(true)
      })
      .catch((e) => {
        // 서버 — 401 은 api.js 가 이미 로그인으로 보냈다. 404(없는 레포 · 권한 밖)는 서버 판정 그대로 `/r?from=` 화면으로(D4)
        if (isServer()) {
          if (e instanceof ApiError && e.status === 404) navigate('/r?from=' + encodeURIComponent(RK), { replace: true })
          return
        }
        if (e instanceof ApiError && e.status === 401) setFatal(e.message)
        else setNeedSetup(true)
      })
    const stopBeat = startHeartbeat()
    return stopBeat
  }, [reload])

  // ── SSE — 변경 반영(§23.2) ─────────────────────────────────────────────
  useEffect(() => {
    return subscribe((ev) => {
      if (ev.type === 'watch') {
        setRepo((r) => (r ? { ...r, watchAlive: ev.alive } : r))
        return
      }
      // 동기화 단계 — **어느 탭에서 눌렀든 모든 화면이 같은 것을 본다**
      if (ev.type === 'sync') {
        setSync((s) => ({ ...(s || {}), phase: ev.phase, startedAt: ev.startedAt ?? s?.startedAt ?? null, last: ev.last ?? s?.last ?? null }))
        // 끝났으면 이력까지 다시 읽는다. 그 한 줄이 표에 남아야 한다.
        if (ev.phase === 'idle' && !isServer()) api.sync().then(setSync).catch(() => {})
        return
      }
      if (ev.type !== 'changed') return
      // 목록은 즉시 갱신. 읽고 있는 본문은 바꾸지 않는다(§13-⑥)
      setChangedPaths(new Set([...ev.changed, ...ev.added]))
      reload()
      const n = ev.changed.length + ev.added.length + ev.removed.length
      if (n > 0) {
        setToast(
          `문서 ${ev.changed.length}건 갱신${ev.added.length ? ` · 신규 ${ev.added.length}건` : ''}${
            ev.removed.length ? ` · 삭제 ${ev.removed.length}건` : ''
          }`
        )
        setTimeout(() => setToast(null), 5000)
      }
    }, () => {
      // SSE 가 붙었다. 그 전에 지나간 상태 변화를 여기서 한 번 맞춘다.
      api.repo().then(setRepo).catch(() => {})
      // 모드 B 에는 `/sync` 가 없다 — 부르면 404 만 쌓인다.
      if (!isServer()) api.sync().then(setSync).catch(() => {})
    })
  }, [reload])

  // ── 읽기 설정을 CSS 변수로(§27.7) ──────────────────────────────────────
  useEffect(() => {
    const el = document.documentElement
    el.style.setProperty('--doc-size', `${reading.fontSize}px`)
    el.style.setProperty(
      '--doc-measure',
      reading.measure === 'window' ? '100%' : `${reading.measure}px`
    )
  }, [reading.fontSize, reading.measure])

  // 왼쪽 폭 — **하는 일마다 따로 기억한다.**
  //
  // 하나의 폭으로 두면 뻗어나가기에 맞춰 넓힌 폭이 목록에도 그대로 남아,
  // 제목 한 줄짜리 목록이 화면 절반을 차지한다. 반대로 목록에 맞춰 좁히면
  // 뻗어나가기가 다시 한 열 반이 된다.
  useEffect(() => {
    const w = leftMode === 'explore' ? (state?.panes?.explore ?? W_XP) : (state?.panes?.list ?? W_LIST)
    document.documentElement.style.setProperty('--w-find', `${w}px`)
  }, [leftMode, state?.panes?.list, state?.panes?.explore])

  // 테마 — OS 따라가기 기본(§16.4). **바꿀 때만 쓴다**(화면 · 권한 검토 v0.1 R9) — 첫 페인트 전에 `index.html` 의
  // 인라인 스크립트가 `cdp.theme` 로 이미 붙였고, OS 변화는 `main.jsx` 가 따라간다. 여기서는 설정 세그로 고른 값
  // (로컬은 서버 파일의 값)이 localStorage 와 다를 때 그 키에 쓰고 붙인다. 같은 값이면 DOM 을 건드리지 않는다.
  useEffect(() => {
    if (!state) return
    const t = state.theme || 'system'
    if (t !== getTheme()) setTheme(t)
    applyTheme(t)
  }, [state?.theme])
  // 로컬 상태는 캐시에도 — 같은 모양으로 둔다(서버 모드는 브라우저에 있으니 stateNow 가 바로 준다)
  useEffect(() => {
    if (state && !isServer()) put(ck('/state'), state)
  }, [state, ck])
  // 마지막에 보던 레포 · 경로를 기억한다 — 열렸다 = 볼 수 있다(아니면 404 로 위에서 `/r?from=`). 콘솔 → 「레포」 가 여기로 온다
  useEffect(() => {
    if (repo && here.server && here.repo) rememberRepo(here.repo, route.path)
  }, [repo, here.server, here.repo, route.path])

  // ── 상태 저장 ─────────────────────────────────────────────────────────
  const patch = useCallback((p) => {
    setState((s) => {
      const next = deepMerge(s || {}, p)
      api.saveState(p).catch(() => {})
      return next
    })
  }, [])

  const say = useCallback((msg, ms = 2600) => {
    setToast(msg)
    setTimeout(() => setToast(null), ms)
  }, [])

  // 매뉴얼이 레포에 있나. 파일명으로 찾는다 -- 시드가 그 이름으로 넣는다.
  const manualDoc = useMemo(() => {
    const hit = (others || []).find((d) => MANUAL_MAIN.test(d.path))
    return hit ? hit.path : null
  }, [others])

  // 문서 동기화 — **순서는 서버가 갖는다**(`core/sync.js`).
  //
  // 전에는 여기서 `git?fetch=1` -> `gitPull` -> `reload` 를 엮었다. 그래서
  // 진행이 이 컴포넌트 안에만 있었고, 탭을 바꾸면 도는 중인지도 알 수 없었다.
  // 지금은 한 번 부르고 단계는 SSE 로 받는다. `ctx sync` 도 같은 것을 쓴다.
  const syncNow = useCallback(async () => {
    try {
      const r = await api.runSync(true)
      if (r?.error === 'busy') return say('이미 동기화가 도는 중입니다')
      // ff 가 안 되면 **그대로 알린다.** 앱이 정리하지 않는다.
      say(r.line || (r.ok ? '완료' : '동기화 실패'), r.ok ? 2600 : 8000)
      if (r.ok && r.pulled > 0) await reload()
    } catch (e) {
      say(e?.message || '동기화 실패', 6000)
    } finally {
      api.sync().then(setSync).catch(() => {})
    }
  }, [reload, say])

  // ── 문서 열기 · 돌아가기 — **주소가 문서다**(문서 이동 검토 v0.1 A) ─────────────────────────────
  //
  // `openDoc` 은 주소만 바꾼다. 문서를 실제로 바꾸는 것은 아래 「주소 → 문서」 한 길이다 — 뒤로 · 앞으로도 같은 길을
  // 지나므로 읽음 · 마지막 문서 · 바뀜 표시 · 탭 · 왼쪽이 같이 따라온다. 전에는 메모리 스택을 `Alt+←` 로만 되짚었고
  // 되돌리기가 `setDocId` 하나라 왼쪽이 다른 문서를 가리킨 채 남았으며(H4), 브라우저 뒤로 가기는 앱을 나갔다(H5).
  //
  // 히스토리 항목마다 `cdp` 를 싣는다 — { root, leftMode, scope, prev, direct }.
  //   root · leftMode · scope  그 문서를 볼 때의 왼쪽. 돌아오면 되살린다
  //   prev     직전에 보던 문서 — 「← 이전」 의 이름
  //   direct   바로 앞 항목이 그 문서인가 — 그러면 「← 이전」 이 `history.back()` 이다(사이에 그래프 · 관리가 끼면 아니다)
  // how — 탭을 어떻게 하나('tab' 더한다 · 'replace' 지금 탭을 바꾼다 — `doclink.js`).
  // replace — 히스토리를 쌓지 않는다(j/k 훑기 · H8).
  const openDoc = useCallback(
    (rawId, at = null, { how = 'tab', replace = false, root: r } = {}) => {
      if (!rawId) return
      const id = canonDocId(rawId, managedRef.current)
      const onDoc = routeDocRef.current
      // 같은 문서 · 같은 자리를 다시 누른 것 — 주소는 그대로, 섹션이면 그리로만 다시 간다
      if (onDoc && onDoc.id === id && (onDoc.at || null) === (at || null)) {
        if (at) setDocAt({ value: at, seq: ++atSeqRef.current })
        return
      }
      const was = history.state?.cdp || null
      const cur = docIdRef.current
      const L = leftRef.current
      const snap = {
        root: r !== undefined ? r : L.root,
        leftMode: L.leftMode,
        scope: L.scope,
        ...(replace || (onDoc && onDoc.id === id)
          ? { prev: was?.prev || null, direct: replace ? !!was?.direct : false }
          : { prev: cur || null, direct: !!onDoc && !!cur }),
      }
      tabHowRef.current = how
      navigate(docHref(baseHref, id, at), { replace, state: { cdp: snap } })
    },
    [baseHref]
  )

  // 주소 → 문서. **문서가 바뀌는 길은 이것 하나다.**
  useEffect(() => {
    if (topMode !== 'doc') {
      appliedRef.current = null
      return
    }
    if (!routeDoc) {
      // 문서 없는 주소를 지났다 — 뒤로 가기로 같은 문서 주소에 돌아와도 다시 연다(「모두 닫기」 뒤)
      appliedRef.current = null
      // 주소에 문서가 없다 — 첫 화면에서 마지막 문서를 열었으면(restoreOf) 주소를 그 문서로 바꿔 쓴다. 쌓지 않는다
      if (docId) navigate(docHref(baseHref, docId), { replace: true, state: { cdp: { ...leftRef.current, prev: null, direct: false } } })
      return
    }
    if (!ready) return
    if (appliedRef.current === route.href) return
    appliedRef.current = route.href
    const { id, at } = routeDoc
    const c = history.state?.cdp
    if (c) {
      if ('root' in c) setRoot(c.root || null)
      if (c.scope) setScope(c.scope)
      if (c.leftMode) setLeftMode(c.leftMode === 'explore' && !c.root ? 'list' : c.leftMode)
    } else {
      // 히스토리가 실은 왼쪽이 없다(받은 링크 · 주소창에 친 주소) — 첫 화면 복원과 같이 그 문서를 뿌리로
      const at = restoreOf({ lastDoc: id }, { docs }, managedRef.current)
      if (at) setRoot(at.root)
    }
    setNav({ prev: c?.prev && c.prev !== id ? c.prev : null, direct: !!c?.direct })
    setDocAt(at ? { value: at, seq: ++atSeqRef.current } : null)
    const how = tabHowRef.current || 'replace'
    tabHowRef.current = null
    // 좁은 창 — 문서 주소에 왔으면 목록 덮개를 걷는다(F11). 받은 링크 · 새로고침도 문서가 먼저 보여야 한다
    if (narrowQ?.matches) setDrawerShut(true)
    const s = stateRef.current || {}
    const before = docIdRef.current
    if (id === before && (s.tabs || []).some((t) => t.id === id)) return
    setDocId(id)
    const tabs = tabsOpen(s.tabs || [], id, { mode: how, active: before, seen: s.read || {} })
    patch({
      read: { [id]: new Date().toISOString() },
      lastDoc: id,
      recent: recentPush(s.recent || [], id),
      ...(tabs !== s.tabs ? { tabs } : {}),
    })
    setChangedPaths((cp) => {
      if (!cp.size) return cp
      const n = new Set(cp)
      const d = docs.find((x) => x.id === id)
      if (d) n.delete(d.path)
      return n
    })
  }, [topMode, route.href, docId, ready])

  // 뿌리 · 찾기/뻗어나가기가 바뀌면 지금 히스토리 항목에 적어 둔다 — 떠났다가 돌아오면 「떠날 때의 뻗어나가기」 다.
  // **범위(관리문서 · 작업문서 · 좌표)는 적지 않는다** — 범위를 바꾸는 것은 떠나려는 몸짓이다. 돌아왔을 때 목록은 그 문서를
  // 고른 범위여야 그 줄이 칠해져 보인다(작업문서를 읽다 관리문서 › 용어집으로 갔다 돌아오면 작업문서 목록)
  useEffect(() => {
    // 첫 읽기 전에는 적지 않는다 — 비어 있는 뿌리를 적으면 받은 링크로 연 문서가 「뿌리 없음」 이 된다
    if (!routeDoc || !ready) return
    const st = history.state || {}
    history.replaceState({ ...st, cdp: { ...(st.cdp || {}), root, leftMode } }, '', location.href)
  }, [root, leftMode, routeDoc?.id, ready])

  // ── 탭 ──
  const closeTab = useCallback(
    (id) => {
      const s = stateRef.current || {}
      const { tabs, next } = tabsClose(s.tabs || [], id, docIdRef.current)
      patch({ tabs })
      if (id !== docIdRef.current) return
      // 지금 탭을 닫았다 — 옆 탭으로 **바꿔 쓴다.** 쌓으면 뒤로 가기가 방금 닫은 문서를 다시 연다
      if (next) openDoc(next, null, { replace: true })
      else {
        setDocId(null)
        navigate(baseHref)
      }
    },
    [patch, openDoc, baseHref]
  )
  const closeAllTabs = useCallback(() => {
    patch({ tabs: [] })
    setDocId(null)
    navigate(baseHref)
  }, [patch, baseHref])
  const pinTab = useCallback((id) => patch({ tabs: tabsPin(stateRef.current?.tabs || [], id) }), [patch])
  const goPrev = useCallback(() => {
    if (!nav.prev) return
    if (nav.direct) history.back()
    else openDoc(nav.prev)
  }, [nav, openDoc])

  // 시작점을 고른다 — 뻗어나가기가 여기서부터 뻗는다.
  //
  // **문서를 고르면 목록에 남고, 좌표를 고르면 뻗어나가기로 넘어간다.**
  //
  // 둘을 같게 두면 하나가 망가진다. 목록을 훑으며 여러 건을 차례로 읽는 것은
  // 실제로 자주 하는 일인데, 문서 하나 눌렀다고 목록이 사라지면 다음 것을
  // 보러 매번 되돌아와야 한다. 반대로 좌표는 **오른쪽에 열 것이 없다** —
  // 좌표를 고르는 유일한 이유가 뻗어나가기이므로 거기 두면 한 번 더 누르게 된다.
  const pickRoot = useCallback((node) => {
    setRoot(node)
    if (node?.open) openDoc(node.open, null, { root: node })
    else setLeftMode('explore')
  }, [openDoc])

  // 그래프에서 노드를 누르는 것은 **고르는 것이지 떠나는 것이 아니다.**
  //
  // 누르는 순간 화면을 나가면 그래프를 볼 수가 없다 — 그 클릭은 "이어진 것만
  // 남겨 달라"는 뜻이고, 그것이 이 그림을 읽는 방법이다. 여기서는 시작점만
  // 잡아 두고, 떠나는 것은 아래 바의 `뻗어나가기 →` 가 한다.
  const markFromGraph = useCallback((coord) => {
    setRoot({ kind: 'coord', key: coord, label: coord })
  }, [])

  // 그래프에서 나가 뻗어나가기로 — 그래프는 "무엇이 무엇과 붙어 있나"까지만
  // 답한다. 그 다음은 뻗어나가기다.
  const goFromGraph = useCallback((coord) => {
    setRoot({ kind: 'coord', key: coord, label: coord })
    setLeftMode('explore')
    setTopMode('doc')
  }, [setTopMode])

  const saveScroll = useCallback(
    (id, ratio) => patch({ scroll: { [id]: { ratio, at: Date.now() } } }),
    [patch]
  )

  const onAliasMiss = useCallback(
    (q, openedId) => {
      // 프로토콜 §9.7 의 재료 — 검색 실패 → 전문 검색 → 문서 열람까지
      // 이어진 경우만 후보로 올린다(§20.2)
      const list = [...(state?.aliasMisses || [])]
      list.unshift({ q, at: Date.now(), opened: openedId })
      patch({ aliasMisses: list.slice(0, 60) })
    },
    [patch, state?.aliasMisses]
  )

  // ── 키보드(§25) ────────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey
      const inField = /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)

      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        return setPaletteOpen(true)
      }
      if (mod && e.key === '.') {
        e.preventDefault()
        // 읽기 모드 — 왼쪽을 통째로 접는다. 상태는 기억된다(§27.5). 좁은 창에서 덮개만 걷혀 있었으면 다시 편다(F11)
        if (narrow && drawerShut && reading.mode !== 'focus') return setDrawerShut(false)
        return patch({ reading: { mode: reading.mode === 'focus' ? 'browse' : 'focus' } })
      }
      if (mod && (e.key === '=' || e.key === '+')) {
        e.preventDefault()
        return patch({ reading: { fontSize: nextSize(reading.fontSize, 1) } })
      }
      if (mod && e.key === '-') {
        e.preventDefault()
        return patch({ reading: { fontSize: nextSize(reading.fontSize, -1) } })
      }
      if (mod && e.key === '0') {
        e.preventDefault()
        return patch({ reading: { fontSize: 15 } })
      }
      if (inField || mod) return

      // 이전 · 다음 문서 — 브라우저의 뒤로 · 앞으로 그대로(문서가 주소다). **입력칸 밖에서만** — 검색칸에서
      // ⌥← 는 Mac 의 단어 이동이다(문서 이동 검토 H7). 브라우저도 같은 키를 쓰므로 한 번만 가게 막는다
      if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        e.preventDefault()
        if (e.key === 'ArrowLeft') history.back()
        else history.forward()
        return
      }

      // **Esc 는 위에서부터 하나씩 벗긴다.** 겹쳐 뜬 것을 한 번에 다 닫으면
      // 실수로 누른 사람이 하던 자리를 통째로 잃는다.
      if (e.key === 'Escape') {
        if (checkOpen) return setCheckOpen(false)
        if (helpOpen) return setHelpOpen(false)
        if (menuOpen) return setMenuOpen(false)
        if (topMode !== 'doc') return setTopMode('doc')
        return
      }
      // 왼쪽이 하는 일을 바꾼다 — 탭 키는 브라우저 것이므로 쓰지 않는다
      if (e.key === '\\') {
        e.preventDefault()
        return setLeftMode((m) => (m === 'list' ? (root ? 'explore' : 'list') : 'list'))
      }
      // `?` 는 관례상 도움말이다. 전에는 설정이 열렸다.
      if (e.key === '?') return setHelpOpen((s) => !s)
      if (e.key === 'j' || e.key === 'k') {
        e.preventDefault()
        const list = docs
        const i = list.findIndex((d) => d.id === docId)
        const next = e.key === 'j' ? Math.min(i + 1, list.length - 1) : Math.max(i - 1, 0)
        // 훑기는 이력에 쌓지 않고 지금 탭을 바꾼다(H8)
        if (list[next]) openDoc(list[next].id, null, { how: 'replace', replace: true })
        return
      }
      if (e.key === 'x' && docId) {
        e.preventDefault()
        const cur = !!readMap[docId]
        return patch({ read: { [docId]: cur ? null : new Date().toISOString() } })
      }
      if (e.key === 'C' && e.shiftKey && docId) {
        const d = docs.find((x) => x.id === docId)
        if (d) {
          api.doc(docId).then((full) => copyText(summaryText(full))).then((ok) => ok && say('요약 복사됨', 1500))
        }
        return
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // 탭 제목 — 레포 이름을 붙인다.
  //
  // 지식 레포를 둘 이상 열어두는 경우가 있다(프로젝트 것 · 폐쇄망에서 가져온 것).
  // 탭이 전부 `cdp` 면 어느 창이 어느 레포인지 알 수 없다.
  useEffect(() => {
    const name = repo?.root ? repo.root.replace(/[\\/]+$/, '').split(/[\\/]/).filter(Boolean).pop() : null
    // 규칙은 `<페이지> · CDP` — 세 얼굴이 같다(화면 UX 검토 v0.1 P3)
    document.title = !name || name.toLowerCase() === 'cdp' ? 'CDP' : `${name} · CDP`
  }, [repo?.root])

  const coordIndex = useMemo(() => buildCoordIndex(tree), [tree])
  // 문서 이름을 찾는 목록 — 탭 · 「← 이전」 · 최근
  const lists = useMemo(() => ({ docs, managed: managedList, others }), [docs, managedList, others])

  // 스텝 1의 부제 — 지금 무엇 중에서 찾고 있나
  const scopeCount = useMemo(() => {
    if (scope === 'managed') return managedList.length
    if (scope === 'work') return docs.length
    return (tree?.types || []).reduce((a, t) => a + t.coords.length, 0)
  }, [scope, managedList.length, docs.length, tree])

  // ── 렌더 ──────────────────────────────────────────────────────────────
  if (fatal) {
    return (
      <div className="empty" style={{ paddingTop: '20vh' }}>
        <p style={{ fontSize: 15, color: 'var(--danger)' }}>{fatal}</p>
        <p>주소창의 <code>?t=</code> 토큰이 필요합니다. 터미널에 표시된 URL 로 다시 여세요.</p>
      </div>
    )
  }

  // 첫 실행 — **관리>지식 레포와 같은 화면을 쓴다.**
  //
  // 전에는 `SetupView` 한 장이 따로 있었다. 그런데 경로를 지정하는 일은
  // 나중에 또 하고, 그때는 설정 팝오버의 입력칸 하나로 했다 — 같은 일을
  // 두 군데서 서로 다르게 하고 있었다. 구조 검증 다섯 줄이 첫 실행에만
  // 있었던 이유도 그것이다.
  if (needSetup) {
    return (
      <div className="app app--bare">
        <AdminView
          tab="repo"
          onTab={() => {}}
          state={state || { repoPath: '' }}
          repo={repo}
          patch={() => {}}
          sync={null}
          onSync={() => {}}
          onCheck={() => {}}
          firstRun
          onOpened={() => {
            setNeedSetup(false)
            setScanning(true)
            reload().finally(() => setScanning(false))
          }}
          say={(m) => say(m, 6000)}
        />
      </div>
    )
  }

  if (!state || !repo) {
    return <div className="empty" style={{ paddingTop: '20vh' }}>불러오는 중…</div>
  }

  // 읽기 모드 — 왼쪽이 **띠로 줄어든다.** 사라지지 않는다.
  //
  // 전에는 통째로 `display:none` 이라, 문서를 안 골랐으면 고를 방법 자체가
  // 없어져서 `docId` 가 있을 때만 접히게 막아 두었다. 지금은 30px 띠가 늘
  // 남고 그 띠 전체가 펴는 버튼이므로 그 예외가 필요 없다.
  const effectiveMode = (reading.mode === 'focus' || (narrow && drawerShut && docId)) && topMode === 'doc' ? 'focus' : 'browse'
  const c = repo.checkCounts || { error: 0, warn: 0, info: 0 }
  const repoName = repo.root.split(/[\\/]/).pop()

  // data-force-status: 감시가 끊기면 읽기 모드에서도 상태바를 되살린다 —
  //   화면이 낡았을 수 있는데 조용한 화면으로 읽고 있으면 안 된다(§23.3 · §27.5).
  return (
    <div
      className="app"
      data-mode={effectiveMode}
      data-top={topMode}
      data-density={state.density || 'normal'}
      data-nodoc={docId ? '0' : '1'}
      data-force-status={repo.watchEnabled && !repo.watchAlive ? '1' : '0'}
    >
      {/* 상단 — Shell 이 한 번 그리는 TopBar(화면 · 권한 검토 v0.1 R7) 안의 두 자리에 이 레포의 도구를 포털로 넣는다.
          상태와 핸들러는 여기 남고, 얼굴을 넘어도 상단 바 DOM 은 그대로다. 「레포 ▾」 메뉴는 TopBar 가 든다(세션 · 라우트만 쓴다). */}
      {slots &&
        createPortal(
          <>
            {/* loopback 경고는 **로컬만의 것**이다. 원격에서는 늘 참이라 경고가 아니다(§6.6.3). */}
            {!isServer() && repo.hostWarning && (
              <span className="hostwarn"><Icon name="warn" size={13} /> loopback 아님</span>
            )}

            {/* 화면 전체 모드 둘. **그래프는 패널이 아니라 화면이다** —
                좌표 288개짜리 그림을 400px 안에서 읽을 수 있는 사람은 없다. */}
            <div className="seg seg--mode" role="group" aria-label="화면">
              <button aria-pressed={topMode === 'doc'} onClick={() => setTopMode('doc')}>
                <Icon name="doc" size={14} /> 문서
              </button>
              <button aria-pressed={topMode === 'graph'} onClick={() => setTopMode('graph')}>
                <Icon name="graph" size={14} /> 그래프
              </button>
              {/* 관리도 **화면**이다. 레포 여섯 곳의 설치 상태와 이력 스무 줄은
                  380px 팝오버에 안 들어간다 — 그래프를 화면으로 올린 것과 같다. */}
              <button
                aria-pressed={topMode === 'admin'}
                onClick={() => setTopMode('admin')}
                // 제목이 접근 이름이 된다 — 옛 메뉴(레포 · 동기화 · 에이전트 설치)가 남아 화면 글과 달랐다(실서버 종합 시험 F21)
                aria-label="관리"
                title={isServer() ? '관리 — 현황 · 관리 문서 · 작업 레포 · 정보' : '관리 — 현황 · 지식 레포 · 동기화 · 작업 레포 · 진단 · 정보'}
              >
                <Icon name="gear" size={14} /> 관리
              </button>
            </div>

            <button className="topbar__search" onClick={() => setPaletteOpen(true)} aria-label={`검색 · 이동 (${kbd('⌘K')})`}>
              <Icon name="search" size={14} />
              <span>검색 · 이동</span>
              <span className="topbar__spacer" />
              <span className="kbd">{kbd('⌘K')}</span>
            </button>

            {/* 동기화 — **하루에 제일 먼저 누르는 것이다.** 도는 동안 단계와 경과 초가 이 버튼에 뜬다.
                로컬만 — 서버는 언제나 origin HEAD 이고 받을 것이 없다(§4.8). */}
            {!isServer() && <SyncButton sync={sync} onSync={syncNow} />}

            {/* 검증 — **아침에 제일 먼저 보는 값이다.** 0건이면 조용하다. */}
            {c.error > 0 ? (
              <button
                className="pill pill--error"
                onClick={() => setCheckOpen(true)}
                // 서버형 save 는 **레포 전체** 검사에서 오류가 하나라도 있으면 거절한다 — 건드린 문서가 아니어도(core/save.js 8)
                title={isServer() ? '검사 오류 — 고칠 때까지 이 레포의 save 가 전부 거절된다' : '검사 결과 — 커밋이 거부된다'}
              >
                <Icon name="block" size={13} /> 검증 {c.error}
              </button>
            ) : c.warn > 0 ? (
              <button className="pill pill--warn" onClick={() => setCheckOpen(true)} title="검사 결과">
                <Icon name="warn" size={13} /> 검증 {c.warn}
              </button>
            ) : (
              <button className="pill" onClick={() => setCheckOpen(true)} title="검사 결과 — 통과했을 때도 볼 수 있다">
                <Icon name="check" size={13} /> 검사
              </button>
            )}
          </>,
          slots.center
        )}
      {slots &&
        createPortal(
          <button className="iconbtn" aria-expanded={menuOpen} onClick={() => setMenuOpen((m) => !m)} title="더보기" aria-label="더보기">
            <Icon name="more" size={16} />
          </button>,
          slots.right
        )}

      {/* 더보기 — 하루에 몇 번 안 누르는 것들. 상단바에 늘 펴 둘 이유가 없다.
          전에는 동기화·매뉴얼·읽기모드·비율 4개·설정이 전부 상단바에 있었다.
          **동기화는 다시 상단바로 나갔다** — 매일 누르는 것이고 도는 동안
          보여야 하는 것이라 메뉴 안에 둘 것이 아니었다. 여기서 한 번 더
          누를 수 있게 남기지 않는다: 같은 일을 하는 버튼 둘이 서로 다른
          영역에 살면 도는 중 표시도 둘로 갈린다. */}
      {menuOpen && (
        <>
          <div className="scrim" onMouseDown={() => setMenuOpen(false)} />
          <div className="menu" role="menu">
            <button className="menu__row" onClick={() => { setMenuOpen(false); setHelpOpen(true) }}>
              <span className="menu__ico"><Icon name="book" size={15} /></span>
              도움말 — 단축키 · 설명서
              <span className="menu__hint kbd">?</span>
            </button>
            <button
              className="menu__row"
              onClick={() => { setMenuOpen(false); patch({ reading: { mode: reading.mode === 'focus' ? 'browse' : 'focus' } }) }}
            >
              <span className="menu__ico"><Icon name="panel" size={15} /></span>
              {reading.mode === 'focus' ? '왼쪽 펴기' : '읽기 모드 — 왼쪽 접기'}
              <span className="menu__hint kbd">{kbd('⌘.')}</span>
            </button>
            <div className="menu__hr" />
            <div className="menu__cap">글자 크기</div>
            <div className="menu__seg">
              <div className="seg">
                {[13, 14, 15, 16, 18].map((s) => (
                  <button key={s} aria-pressed={reading.fontSize === s} onClick={() => patch({ reading: { fontSize: s } })}>
                    {s}
                  </button>
                ))}
              </div>
            </div>
            <div className="menu__cap">본문 폭</div>
            <div className="menu__seg">
              <div className="seg">
                {[[620, '좁게'], [760, '보통'], [900, '넓게'], ['window', '창 폭']].map(([v, l]) => (
                  <button key={v} aria-pressed={reading.measure === v} onClick={() => patch({ reading: { measure: v } })}>
                    {l}
                  </button>
                ))}
              </div>
            </div>
            <div className="menu__cap">테마</div>
            <div className="menu__seg">
              <div className="seg">
                {['system', 'light', 'dark'].map((t) => (
                  <button key={t} aria-pressed={(state.theme || 'system') === t} onClick={() => patch({ theme: t })}>
                    {{ system: '자동', light: '밝게', dark: '어둡게' }[t]}
                  </button>
                ))}
              </div>
            </div>
            {/* 「관리 —」 줄은 뺐다 — 세그의 「관리」 와 같은 일을 하는 단추 둘이었다(화면 · 권한 검토 v0.1 R5 · 부록 C) */}
          </div>
        </>
      )}

      {helpOpen && (
        <Help
          docs={others}
          onOpen={(id) => { setHelpOpen(false); openDoc(id) }}
          onClose={() => setHelpOpen(false)}
        />
      )}

      {topMode === 'admin' ? (
        /* 관리 — 창 전체. **세팅과 현황이 구석의 팝오버에 있을 일이 아니다.** */
        <AdminView
          tab={adminTab}
          onTab={setAdminTab}
          state={state}
          repo={repo}
          me={me}
          patch={patch}
          sync={sync}
          onSync={syncNow}
          onCheck={() => setCheckOpen(true)}
          onChanged={() => reload().catch(() => {})}
          repoName={isServer() ? here.repo : repoName}
          built={session?.info?.built || null}
          say={(m) => say(m, 6000)}
        />
      ) : topMode === 'graph' ? (
        /* 그래프 — 창 전체. 왼쪽 패널도 문서도 없다.
           좌표를 고르면 문서 모드로 돌아가며 뻗어나가기가 열린다. */
        <div className="pane pane--graph">
          <CoordGraph
            tree={tree}
            docs={docs}
            onPick={markFromGraph}
            onGo={goFromGraph}
            picked={root?.kind === 'coord' ? root.key : null}
            onExit={() => setTopMode('doc')}
          />
        </div>
      ) : (
        <div className="panes">
          <section className="pane pane--find" aria-label="찾는 곳">
            {/* 접힘 — **띠만 남는다.** 목차(SectionRail)와 같은 규칙이다.
                0 으로 만들면 펴는 버튼이 상단바로 도망가고, 그러면 같은 일을
                하는 버튼 둘이 서로 다른 영역에 산다. 띠 전체가 버튼이다 —
                32px 가 "여기 목록이 있다"는 유일한 신호인데 위쪽 한 칸만
                눌리면 나머지는 눌러 보고 아무 일도 안 나는 자리가 된다. */}
            {effectiveMode === 'focus' && (
              <button
                className="lbar"
                onClick={() => {
                  setDrawerShut(false)
                  patch({ reading: { mode: 'browse' } })
                }}
                aria-expanded="false"
                aria-label="왼쪽 펴기"
                title={`왼쪽 펴기 (${kbd('⌘.')})`}
              >
                <Icon name="panelExpand" size={15} />
                <span className="lbar__cap">{leftMode === 'explore' ? '뻗어나가기' : '찾기'}</span>
              </button>
            )}

            {/* ── L1 단계 — 찾기 → 뻗어나가기 ──────────────────────────
                **탭이 아니라 스텝이다.** 둘은 대등한 선택지가 아니라 순서다 —
                찾기에서 고른 것이 뻗어나가기의 뿌리가 된다.

                그래서 뿌리가 **탭 안에서 나왔다.** 전에는 고정 레이블과 가변
                상태가 한 버튼에 들어 있어 탭 폭이 문서 제목 길이를 따라
                흔들렸다(실측: 찾기 41.6px 對 뻗어나가기 167.8px). 지금은
                단계마다 부제 한 줄이 있고, 거기에 그 단계가 지금 물고 있는
                것을 적는다. */}
            <div className="lhead" role="tablist" aria-label="왼쪽 영역">
              <button
                className="step"
                role="tab"
                aria-selected={leftMode === 'list'}
                onClick={() => setLeftMode('list')}
              >
                <Icon name="search" size={15} />
                <span className="step__txt">
                  <span className="step__t">찾기</span>
                  <span className="step__s">{SCOPE_LABEL[scope]} {scopeCount}{scope === 'coord' ? '개' : '건'}</span>
                </span>
              </button>

              <span className="lhead__arrow" aria-hidden="true">
                <Icon name="chevronRight" size={13} />
              </span>

              <button
                className="step"
                role="tab"
                aria-selected={leftMode === 'explore'}
                disabled={!root}
                onClick={() => root && setLeftMode('explore')}
                title={root ? root.key : '찾기에서 하나를 고르면 여기서 뻗어나갑니다'}
              >
                <Icon name="explore" size={15} />
                <span className="step__txt">
                  <span className="step__t">뻗어나가기</span>
                  <span className="step__s" data-mono={root?.kind === 'coord' ? '1' : '0'}>
                    {root ? shortRoot(root) : '뿌리 없음'}
                  </span>
                </span>
              </button>

              {/* 접기는 **층이 아니다.** 단계의 모양을 쓰지 않는다 */}
              <button
                className="lhead__fold"
                onClick={() => patch({ reading: { mode: 'focus' } })}
                title={`왼쪽 접기 (${kbd('⌘.')})`}
                aria-label="왼쪽 접기"
              >
                <Icon name="panelCollapse" size={15} />
              </button>
            </div>

            {leftMode === 'list' ? (
              <Finder
                docs={docs}
                managed={managedList}
                tree={tree}
                root={root}
                scope={scope}
                onScope={setScope}
                onGraph={() => setTopMode('graph')}
                onPick={pickRoot}
                readMap={readMap}
                myCoords={myCoords}
                onToggleMine={(c) =>
                  patch({ myCoords: myCoords.includes(c) ? myCoords.filter((x) => x !== c) : [...myCoords, c] })
                }
              />
            ) : (
              <Explore root={root} onOpen={(id, at) => openDoc(id, at, { how: 'replace' })} onBack={() => setLeftMode('list')} />
            )}
          </section>

          <Gutter
            varName="--w-find"
            min={280}
            max={980}
            onCommit={(w) => patch({ panes: leftMode === 'explore' ? { explore: w } : { list: w } })}
          />

          <main className="pane pane--doc" onMouseDown={() => narrow && docId && effectiveMode === 'browse' && setDrawerShut(true)}>
            {docId && (
              <DocNav
                prev={nav.prev ? { id: nav.prev, ...docTitle(nav.prev, lists) } : null}
                onPrev={goPrev}
                recent={(state.recent || []).filter((x) => x !== docId).slice(0, 10).map((id) => ({ id, ...docTitle(id, lists) }))}
                onOpen={(id) => openDoc(id)}
                tabs={(state.tabs || []).map((t) => ({ ...t, ...docTitle(t.id, lists) }))}
                active={docId}
                onTab={(id) => openDoc(id)}
                onClose={closeTab}
                onPin={pinTab}
                onCloseAll={closeAllTabs}
              />
            )}
            {docId ? (
              <DocView
                docId={docId}
                at={docAt}
                coordIndex={coordIndex}
                myCoords={myCoords}
                reading={reading}
                changedPaths={changedPaths}
                savedRatio={state.scroll?.[docId]?.ratio}
                onOpen={openDoc}
                onCoord={(c) => pickRoot({ kind: 'coord', key: c, label: c })}
                onScrollSave={saveScroll}
                /* 목차 접힘 — **기억한다.** 문서를 바꿀 때마다 다시 접게
                   만들면 접는 기능이 없는 것과 같다 */
                tocOpen={state.panes?.toc !== false}
                onToggleToc={() => patch({ panes: { toc: state.panes?.toc === false } })}
              />
            ) : (
              <Landing repo={repo} docs={docs} managed={managedList.length} onOpen={openDoc} />
            )}
          </main>
        </div>
      )}

      <StatusBar
        repo={repo}
        scanning={scanning}
        onRescanned={reload}
        onCheck={() => setCheckOpen(true)}
        onSay={(m) => say(m, 6000)}
      />

      {/* 알림 — 화면 아래에 잠깐 뜬다. 전에는 상단바 안이라 폭을 두고 다퉜다 */}
      {toast && <div className="toast" role="status">{toast}</div>}

      {checkOpen && (
        <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && setCheckOpen(false)}>
          <div className="overlay__box" role="dialog" aria-label="검사 결과">
            <div className="overlay__head">
              검사 결과
              <span className="topbar__spacer" />
              <button className="iconbtn" onClick={() => setCheckOpen(false)} aria-label="닫기"><Icon name="close" size={15} /></button>
            </div>
            <div className="overlay__body">
              <CheckView onOpen={(id) => { setCheckOpen(false); openDoc(id) }} />
            </div>
          </div>
        </div>
      )}

      {paletteOpen && (
        <Palette
          onClose={() => setPaletteOpen(false)}
          onOpen={openDoc}
          onCoord={(c) => pickRoot({ kind: 'coord', key: c, label: c })}
          onAliasMiss={onAliasMiss}
        />
      )}
    </div>
  )
}

// ── 상단 동기화 — **하나뿐인 받기 버튼** ────────────────────────────────
//
// 단계 이름은 관리>동기화와 **같은 말**을 쓴다. 두 자리가 같은 순간을 다른
// 말로 부르면 사용자는 둘이 다른 일인 줄 안다.
//
// **경과 초를 뺄 수 없다.** 사내망 fetch 실측이 19.5초다. 그 20초 동안 숫자가
// 안 움직이면 멎은 것으로 읽고 한 번 더 누른다 — 두 번째 클릭은 `busy` 로
// 튕기므로 아무 일도 안 일어나고, 그러면 앱이 고장난 것으로 읽는다.
const SYNC_PHASE = { fetching: '원격 확인 중', pulling: '받는 중', rescanning: '다시 읽는 중' }

function SyncButton({ sync, onSync }) {
  const running = !!sync?.phase && sync.phase !== 'idle'
  const [elapsed, setElapsed] = useState(0)

  useEffect(() => {
    if (!running || !sync?.startedAt) return setElapsed(0)
    const tick = () => setElapsed(Math.floor((Date.now() - sync.startedAt) / 1000))
    tick()
    const t = setInterval(tick, 250)
    return () => clearInterval(t)
  }, [running, sync?.startedAt])

  const last = sync?.last
  // 직전 결과는 **툴팁으로만** 말한다. 성공을 상단바에 띄우면 정상이 소리를
  // 내게 되고(색 예산), 실패는 어차피 토스트와 관리>동기화가 문장으로 낸다.
  const title = running
    ? '원격에서 받아오는 중입니다 (fetch → ff pull)'
    : last
      ? `직전 — ${last.line || (last.ok ? '완료' : '실패')}`
      : '원격에서 받아온다 (ff 만) · push 는 아래 상태바에 따로 있다'

  return (
    <button className="pill pill--sync" onClick={onSync} disabled={running} title={title} aria-live="polite">
      <Icon name="sync" size={13} className={running ? 'spin' : undefined} />
      {running ? (
        <>
          {SYNC_PHASE[sync.phase] || sync.phase}
          <span className="num">{elapsed}초</span>
        </>
      ) : (
        '동기화'
      )}
    </button>
  )
}

// L2 대상의 이름 — 스텝 부제와 칩이 같은 말을 쓴다
const SCOPE_LABEL = { managed: '관리문서', work: '작업문서', coord: '좌표' }

// 레일에 뿌리를 적는다.
//
// 좌표는 `table:` 접두어를 뗀다 — 알아야 하는 것은 뒤의 이름이다. 문서 제목은
// **앞을 남긴다.** 작업 기록 제목은 `계획서 이력 3종 모델 — 스냅샷·…` 처럼
// 앞머리가 주제이고 뒤는 부연이다.
function shortRoot(root) {
  const s = root.kind === 'coord' ? root.key.slice(root.key.indexOf(':') + 1) : String(root.label || root.key)
  return s.length > 24 ? s.slice(0, 23) + '…' : s
}

// 문서를 안 골랐을 때 — 레포가 지금 무엇을 담고 있는지(§26.2)
function Landing({ repo, docs, managed = 0, onOpen }) {
  const settled = docs.filter((d) => d.settledCoords > 0)
  return (
    <div className="docpane">
      <div className="docwrap">
        <h1 style={{ fontSize: 20, margin: '32px 0 4px' }}>{repo.root.split(/[\\/]/).pop()}</h1>
        <p style={{ color: 'var(--text-2)' }}>
          {/* 무엇을 세는지 이름을 붙인다 — 「문서 8」 이 작업문서인지 관리문서인지 몰랐다(F18) */}
          작업문서 {docs.length}건 · 관리문서 {managed}종 · 좌표 {repo.coords}개
          {settled.length > 0 && ` · 후속이 있는 작업문서 ${settled.length}건`}
        </p>
        <p style={{ color: 'var(--text-3)', marginTop: 24 }}>
          왼쪽 <b>목록</b>에서 하나를 고르면 <b>뻗어나가기</b>가 켜집니다.{' '}
          <span className="kbd">{kbd('⌘K')}</span> 로 자연어 검색, <span className="kbd">\</span> 로 왼쪽 전환.
        </p>
        {docs.slice(0, 5).map((d) => (
          <div className="nextread nextread--home" key={d.id}>
            <span className="num nowrap" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{d.date}</span>
            <a href="#" onClick={(e) => { e.preventDefault(); onOpen(d.id) }}>{d.title}</a>
          </div>
        ))}
      </div>
    </div>
  )
}

// 도움말 — **읽는 것**만 있다. 단축키와 매뉴얼.
//
// 전에는 설정 팝오버 맨 아래 380px 폭에 단축키가 눌려 있었고, 매뉴얼은 그
// 위 `문서` 절에 있었다. 둘 다 레포 경로·에이전트 설치와 같은 스크롤을
// 지나야 닿는 자리였다.
function Help({ docs = [], onOpen, onClose }) {
  const manuals = (docs || [])
    .filter((d) => MANUAL_RE.test(d.path))
    .sort((a, b) => (MANUAL_MAIN.test(b.path) ? 1 : 0) - (MANUAL_MAIN.test(a.path) ? 1 : 0))

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="overlay__box overlay__box--help" role="dialog" aria-label="도움말">
        <div className="overlay__head">
          도움말
          <span className="topbar__spacer" />
          <button className="iconbtn" onClick={onClose} aria-label="닫기"><Icon name="close" size={15} /></button>
        </div>
        <div className="overlay__body help">
          <div className="help__cap">화면</div>
          <p className="help__note">
            <b>왼쪽은 한 번에 하나만 한다</b> — 고르는 중이면 <b>목록</b>,
            따라가는 중이면 <b>뻗어나가기</b>. 둘이 같은 자리를 쓰므로 각각이
            세로 전체를 받는다. 좌표를 고르면 자동으로 뻗어나가기로 넘어간다 —
            좌표는 오른쪽에 열 것이 없다.
          </p>

          <div className="help__cap">단축키</div>
          <dl className="help__keys">
            {KEYS.map(([keys, what]) => (
              <div className="help__row" key={what}>
                <dt>{keys.map((k) => <span className="kbd" key={k}>{k}</span>)}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>

          {isServer() && (
            <>
              <div className="help__cap">설명서</div>
              <Link className="help__doc" to="/manual" style={{ textDecoration: 'none' }}>
                <Icon name="book" size={14} /> 제품 설명서 — 사용자 · 관리자 · 개발자
              </Link>
            </>
          )}
          {manuals.length > 0 && (
            <>
              <div className="help__cap">레포 문서</div>
              {manuals.map((d) => (
                <button key={d.path} className="help__doc" onClick={() => onOpen?.(d.path)}>
                  <Icon name="book" size={14} /> {manualLabel(d.path)}
                </button>
              ))}
              <p className="help__note">
                설계서는 레포의 <code>design/</code> 에 있다 — <b>왜 이렇게 만들었는지</b>가
                거기 있다.
              </p>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

// 매뉴얼 이름 — **파일명이 이미 갖고 있는 구분을 버리지 않는다.**
//
// 전에는 `MANUAL.md` 가 아니면 전부 "관리자용"이었다. 레포에 관리자용과
// 시스템용이 같이 있으면 **같은 이름 두 줄**이 뜬다 — 어느 것이 어느 것인지
// 파일을 열어봐야 알았다.
//
// MANUAL.md · MANUAL-관리자.md · MANUAL-시스템.md — 시드가 넣는 이름.
const MANUAL_RE = new RegExp('^MANUAL(-.+)?[.]md$', 'i')
const MANUAL_MAIN = new RegExp('^MANUAL[.]md$', 'i')

function manualLabel(path) {
  const m = String(path).match(/^MANUAL(?:-(.+))?\.md$/i)
  if (!m) return path
  return m[1] ? `사용 매뉴얼 — ${m[1]}용` : '사용 매뉴얼 — 일반 사용자용'
}


// 폭 조절 — **드래그 중에는 CSS 변수만 만진다.**
//
// 전에는 mousemove 마다 `patch()` 를 불렀고, patch 는 React 상태를 갱신하고
// **서버로 POST 까지 보냈다.** 초당 수십 번 리렌더 + 수십 번 HTTP 라 잡고
// 끌면 눈에 띄게 밀렸다. 화면은 CSS 변수 하나면 바뀌고, 저장은 놓을 때
// 한 번이면 된다.
function Gutter({ varName, min, max, onCommit }) {
  const st = useRef(null)
  const set = (px) => document.documentElement.style.setProperty(varName, px + 'px')
  const cur = () =>
    parseFloat(getComputedStyle(document.documentElement).getPropertyValue(varName)) || min

  return (
    <div
      className="gutter"
      role="separator"
      aria-label="폭 조절"
      tabIndex={0}
      onMouseDown={(e) => {
        e.preventDefault()
        st.current = { x: e.clientX, w: cur() }
        const move = (ev) => {
          const w = clamp(st.current.w + (ev.clientX - st.current.x), min, max)
          st.current.last = w
          set(w) // 리렌더도 네트워크도 없다
        }
        const up = () => {
          window.removeEventListener('mousemove', move)
          window.removeEventListener('mouseup', up)
          if (st.current?.last) onCommit(Math.round(st.current.last))
        }
        window.addEventListener('mousemove', move)
        window.addEventListener('mouseup', up)
      }}
      onKeyDown={(e) => {
        const d = e.key === 'ArrowLeft' ? -16 : e.key === 'ArrowRight' ? 16 : 0
        if (!d) return
        e.preventDefault()
        const w = clamp(cur() + d, min, max)
        set(w)
        onCommit(Math.round(w))
      }}
    />
  )
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v))
const nextSize = (cur, dir) => {
  const sizes = [13, 14, 15, 16, 18]
  const i = sizes.indexOf(cur)
  return sizes[clamp((i < 0 ? 2 : i) + dir, 0, sizes.length - 1)]
}

function deepMerge(a, b) {
  const out = { ...a }
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
      out[k] = deepMerge(a[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}
