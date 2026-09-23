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
import { api, admin, subscribe, startHeartbeat, ApiError } from './lib/api.js'
import { buildCoordIndex } from './lib/markdown.js'
import { summaryText } from './lib/format.js'
import DocView from './components/DocView.jsx'
import CheckView from './components/CheckView.jsx'
import Palette from './components/Palette.jsx'
import StatusBar from './components/StatusBar.jsx'
import AdminView from './components/admin/AdminView.jsx'
import { isServer, mode as appMode, gotoRepo } from './lib/api.js'
import Finder from './components/Finder.jsx'
import Explore from './components/Explore.jsx'
import CoordGraph from './components/CoordGraph.jsx'
import Icon from './components/Icon.jsx'

// 왼쪽 폭 — 하는 일에 따라 다르다. 목록은 제목 한 줄이면 되고, 뻗어나가기는
// 열이 둘 이상 들어가야 "가로로 뻗는다"가 성립한다.
const W_LIST = 340
const W_XP = 560

export default function App() {
  const [state, setState] = useState(null)
  const [repo, setRepo] = useState(null)
  const [docs, setDocs] = useState([])
  const [tree, setTree] = useState(null)
  const [managedList, setManagedList] = useState([])
  // 레포 안의 그 밖 문서 — MANUAL.md · README.md · CLAUDE.md 등.
  // **레포마다 있을 수도 없을 수도 있다.** 없는 것을 버튼으로 내밀지 않는다.
  const [others, setOthers] = useState([])
  // 뻗어나가기의 뿌리. 목록에서 고른 것 하나. { kind, key, label }
  const [root, setRoot] = useState(null)
  const [docId, setDocId] = useState(null)
  // 문서 안에서 갈 자리 — { value, seq }. 섹션(좌표) 줄을 눌러 왔을 때만 있다.
  const [docAt, setDocAt] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  // 관리 화면에서 지금 보고 있는 메뉴. **화면을 나갔다 와도 그 자리다** —
  // 동기화를 보다 문서로 갔다가 다시 들어오면 동기화여야 한다.
  const [adminTab, setAdminTab] = useState('overview')
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
  // 서버 모드의 나 — 누구인가 · 무엇을 볼 수 있는가(§6.6.2). 로컬은 null.
  const [me, setMe] = useState(null)
  const [repoMenu, setRepoMenu] = useState(false)
  // 관리자에게만 — 이 서버의 레포 전부. 권한 밖 레포를 회색으로 보인다(검토 v0.1 D6). 메뉴를 열 때 한 번 읽는다.
  const [allRepos, setAllRepos] = useState(null)
  useEffect(() => {
    if (repoMenu && me?.admin && allRepos === null) admin.repos().then((r) => setAllRepos(r.repos || [])).catch(() => setAllRepos([]))
  }, [repoMenu, me?.admin, allRepos])
  // 검사 결과는 뷰가 아니라 **오버레이**다.
  //
  // 오류는 커밋을 막으므로 **무엇이 막았는지**로 가는 길이 항상 있어야 한다.
  const [checkOpen, setCheckOpen] = useState(false)
  // 화면 전체 모드 — 'doc'(왼쪽|문서) · 'graph'(창 전체)
  const [topMode, setTopMode] = useState('doc')
  // 왼쪽이 지금 하는 일 — 'list'(고른다) · 'explore'(뻗는다). **둘이 같이 있지 않다.**
  const [leftMode, setLeftMode] = useState('list')
  // L2 대상 — 'managed' · 'work' · 'coord'.
  //
  // **Finder 안에 있던 것을 여기로 올렸다.** 패널 머리의 스텝 1이 "지금
  // 무엇 중에서 찾고 있나"를 부제로 적으려면 머리와 목록이 같은 값을 봐야
  // 한다. 아래에 있으면 머리는 그것을 모른다.
  const [scope, setScope] = useState('managed')
  const historyRef = useRef({ stack: [], pos: -1 })
  const atSeqRef = useRef(0)

  const reading = state?.reading || { mode: 'browse', fontSize: 15, measure: 760, coordLinks: true }
  const myCoords = state?.myCoords || []
  const readMap = state?.read || {}

  // ── 초기 로드 ──────────────────────────────────────────────────────────
  const reload = useCallback(async () => {
    const [r, d, v, s, m] = await Promise.all([
      api.repo(), api.docs(), api.vocab(), api.state(), api.managed().catch(() => []),
    ])
    setRepo(r)
    setDocs(d.docs)
    setTree(v)
    setState(s)
    setManagedList(m || [])
    setOthers(d.others || [])
    if (isServer) api.me().then(setMe).catch(() => {})
    return { r, d, v, s, m: m || [] }
  }, [])

  useEffect(() => {
    reload()
      .then(({ r, d, s, m }) => {
        // **서버 모드에는 첫 실행 분기가 없다**(§6.6.3). 고를 레포 경로가
        // 없고, 로그인 뒤 바로 문서다.
        if (!isServer && (!s.repoPath || r.docs === 0)) {
          if (!s.repoPath) setNeedSetup(true)
        }
        // 첫 화면 — 마지막에 읽던 문서를 그대로 연다. 시작점도 거기서 잡는다.
        //
        // **관리 문서도 찾는다.** 전에는 `d.docs`(작업 기록)에서만 찾아서,
        // 어제 마지막으로 본 것이 테이블정의서였으면 복원이 조용히 실패했다 --
        // 빈 화면으로 열리고 뻗어나가기도 꺼진 채였다.
        //
        // **왼쪽은 목록으로 연다.** 어제 뻗던 자리를 복원하면, 오늘 처음 보는
        // 화면이 어디서 왔는지 모를 열 몇 개가 된다.
        const work = s.lastDoc && d.docs.find((x) => x.id === s.lastDoc)
        const man = s.lastDoc && (m || []).find((x) => x.path === s.lastDoc)
        if (work) {
          setDocId(s.lastDoc)
          setRoot({ kind: 'work', key: s.lastDoc, label: work.title, open: s.lastDoc })
        } else if (man) {
          setDocId(s.lastDoc)
          setRoot({ kind: 'managed', key: man.path, label: man.name, open: man.path })
        }
        api.saveState({ lastVisit: new Date().toISOString() })
      })
      .catch((e) => {
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
        if (ev.phase === 'idle' && !isServer) api.sync().then(setSync).catch(() => {})
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
      if (!isServer) api.sync().then(setSync).catch(() => {})
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

  // 테마 — OS 따라가기 기본(§16.4)
  useEffect(() => {
    const theme = state?.theme || 'system'
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && mq.matches)
      document.documentElement.dataset.theme = dark ? 'dark' : 'light'
    }
    apply()
    mq.addEventListener('change', apply)
    return () => mq.removeEventListener('change', apply)
  }, [state?.theme])

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

  const openDoc = useCallback(
    (id, at = null) => {
      if (!id) return
      setDocId(id)
      // 문서 안에서 갈 자리 — 뻗어나가기에서 섹션(좌표)을 눌러 온 경우.
      // 같은 줄을 다시 눌러도 다시 가야 하므로 seq 를 붙인다.
      setDocAt(at ? { value: at, seq: ++atSeqRef.current } : null)
      const h = historyRef.current
      h.stack = h.stack.slice(0, h.pos + 1)
      h.stack.push(id)
      h.pos = h.stack.length - 1
      patch({ read: { [id]: new Date().toISOString() }, lastDoc: id })
      setChangedPaths((s) => {
        if (!s.size) return s
        const n = new Set(s)
        const d = docs.find((x) => x.id === id)
        if (d) n.delete(d.path)
        return n
      })
    },
    [patch, docs]
  )

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
    if (node?.open) openDoc(node.open)
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
  }, [])

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
        // 읽기 모드 — 왼쪽을 통째로 접는다. 상태는 기억된다(§27.5)
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
      if (e.altKey && e.key === 'ArrowLeft') {
        e.preventDefault()
        const h = historyRef.current
        if (h.pos > 0) {
          h.pos--
          setDocId(h.stack[h.pos])
        }
        return
      }
      if (e.altKey && e.key === 'ArrowRight') {
        e.preventDefault()
        const h = historyRef.current
        if (h.pos < h.stack.length - 1) {
          h.pos++
          setDocId(h.stack[h.pos])
        }
        return
      }

      if (inField || mod) return

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
        if (list[next]) openDoc(list[next].id)
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
          api.doc(docId).then((full) => navigator.clipboard?.writeText(summaryText(full)))
          say('요약 복사됨', 1500)
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
    document.title = !name || name.toLowerCase() === 'cdp' ? 'cdp' : `${name} — cdp`
  }, [repo?.root])

  const coordIndex = useMemo(() => buildCoordIndex(tree), [tree])

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
          onClose={() => {}}
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
  const effectiveMode = reading.mode === 'focus' && topMode === 'doc' ? 'focus' : 'browse'
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
      <header className="topbar">
        {/* 로컬은 이름표, 서버는 **고르는 자리**다(§6.6.2). 레포가 하나면
            전환 UI 를 내지 않는다 — 고를 것이 없는데 메뉴를 내밀지 않는다. */}
        {/* 로컬은 이름표, 서버는 **고르는 자리**다(§6.6.2). 하나여도 메뉴다(제품관리서비스 검토 §4.8) —
            메뉴를 열면 볼 수 있는 레포와 내 권한이 보이고, 관리자에게는 이 서버의 레포 전부가 더 붙는다. */}
        {isServer && me ? (
          <span className="topbar__repo">
            <button className="topbar__name" onClick={() => setRepoMenu((v) => !v)} aria-expanded={repoMenu}>
              <span className="topbar__mark" aria-hidden="true">{appMode.repo.slice(0, 1)}</span>
              {appMode.repo}
              <Icon name="chevronDown" size={12} />
            </button>
            {repoMenu && (
              <>
                <div className="scrim" onMouseDown={() => setRepoMenu(false)} />
                <div className="repomenu" role="menu">
                  <div className="repomenu__cap">볼 수 있는 레포 {me.repos.length}</div>
                  {me.repos.map((r) => (
                    <button
                      key={r.name}
                      className="repomenu__row"
                      role="menuitem"
                      aria-current={r.name === appMode.repo}
                      onClick={() => r.name !== appMode.repo && gotoRepo(r.name)}
                    >
                      <b>{r.name}</b>
                      <span>{r.title || ''}</span>
                      <span className={me.write ? 'chip' : 'chip chip--off'}>{me.write ? '쓰기' : '읽기'}</span>
                    </button>
                  ))}
                  {me.admin && (allRepos || []).some((r) => !me.repos.some((m) => m.name === r.name)) && (
                    <>
                      <div className="repomenu__hr" />
                      <div className="repomenu__cap">관리자만 — 이 서버의 레포 {allRepos.length}</div>
                      {allRepos
                        .filter((r) => !me.repos.some((m) => m.name === r.name))
                        .map((r) => (
                          <a key={r.name} className="repomenu__row" href="/console/repos" style={{ opacity: 0.7 }}>
                            <b>{r.name}</b>
                            <span>{r.title || ''} · 볼 수 있는 사람 {r.users?.length ?? 0}</span>
                            <span className="chip chip--off">콘솔에서 할당 →</span>
                          </a>
                        ))}
                    </>
                  )}
                  {me.admin && (
                    <>
                      <div className="repomenu__hr" />
                      <a className="repomenu__row" href="/console/repos">
                        <b>콘솔 › 지식 레포</b>
                        <span>세우기 · clone · 접근</span>
                      </a>
                    </>
                  )}
                </div>
              </>
            )}
          </span>
        ) : (
          <span className="topbar__name">
            <span className="topbar__mark" aria-hidden="true">{repoName.slice(0, 1)}</span>
            {repoName}
          </span>
        )}
        {/* loopback 경고는 **로컬만의 것**이다. 원격에서는 늘 참이라 경고가
            아니다 — 그 자리에 user 와 로그아웃이 온다(§6.6.3). */}
        {!isServer && repo.hostWarning && (
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
          <button aria-pressed={topMode === 'admin'} onClick={() => setTopMode('admin')} title="레포 · 동기화 · 에이전트 설치">
            <Icon name="gear" size={14} /> 관리
          </button>
        </div>

        {/* 접었을 때 펴는 버튼이 여기 나지 않는다 — **버튼이 영역을 옮기면
            안 된다.** 접는 것도 펴는 것도 왼쪽 자리에서 한다(§27.5). */}

        <span className="topbar__spacer" />
        <button className="topbar__search" onClick={() => setPaletteOpen(true)}>
          <Icon name="search" size={14} />
          <span>검색 · 이동</span>
          <span className="topbar__spacer" />
          <span className="kbd">⌘K</span>
        </button>
        <span className="topbar__spacer" />

        {/* 동기화 — **하루에 제일 먼저 누르는 것이다.**
            ⋯ 안에 있으면 매일 메뉴를 열고 찾아 눌러야 하고, 무엇보다
            **도는 중인지가 안 보였다** — 사내망 fetch 실측 19.5초 동안 화면이
            조용하면 멎은 줄로 읽는다. 지금은 단계와 경과 초가 이 버튼에 뜬다.
            받는 것만 여기 있다 — push 는 상태바와 관리>동기화에 따로 있다. */}
        {/* 동기화 버튼은 **로컬만** — 서버는 언제나 origin HEAD 이고 받을
            것이 없다(§4.8). 상태는 관리 > 동기화에서 읽기로 본다. */}
        {!isServer && <SyncButton sync={sync} onSync={syncNow} />}

        {/* 검증 — **아침에 제일 먼저 보는 값이다.** 상태바 11.5px 글씨에
            두면 매일 찾아 읽어야 한다. 0건이면 조용하다. */}
        {c.error > 0 ? (
          <button className="pill pill--error" onClick={() => setCheckOpen(true)} title="검사 결과 — 커밋이 거부된다">
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

        {/* 서버 모드에서 loopback 경고가 있던 자리(§6.6.3). */}
        {isServer && me && (
          <span className="who">
            <a className="who__lnk" href="/manual" title="제품 설명서">
              <Icon name="book" size={13} /> 설명서
            </a>
            {me.admin && (
              <a className="who__lnk" href="/console" title="콘솔 — 사람 · 토큰 · 레포 전부 · 서버">
                <Icon name="shield" size={13} /> 콘솔
              </a>
            )}
            <b style={{ color: 'var(--text)' }}>{me.user}</b>
            <span className="who__role">{me.role}</span>
            <a className="who__out" href="/logout" title="로그아웃">
              <Icon name="power" size={13} />
            </a>
          </span>
        )}

        <button
          className="iconbtn"
          aria-expanded={menuOpen}
          onClick={() => setMenuOpen((m) => !m)}
          title="더보기"
        >
          <Icon name="more" size={16} />
        </button>
      </header>

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
              도움말 — 단축키 · 매뉴얼
              <span className="menu__hint kbd">?</span>
            </button>
            <button
              className="menu__row"
              onClick={() => { setMenuOpen(false); patch({ reading: { mode: reading.mode === 'focus' ? 'browse' : 'focus' } }) }}
            >
              <span className="menu__ico"><Icon name="panel" size={15} /></span>
              {reading.mode === 'focus' ? '왼쪽 펴기' : '읽기 모드 — 왼쪽 접기'}
              <span className="menu__hint kbd">⌘.</span>
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
            <div className="menu__hr" />
            {/* 설정은 팝오버가 아니라 **화면**이다. 줄은 남긴다 — 여기서 찾던
                사람이 계속 여기서 찾는다. */}
            <button className="menu__row" onClick={() => { setMenuOpen(false); setTopMode('admin') }}>
              <span className="menu__ico"><Icon name="gear" size={15} /></span>
              관리 — 레포 · 동기화 · 에이전트 설치
            </button>
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
          onClose={() => setTopMode('doc')}
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
                onClick={() => patch({ reading: { mode: 'browse' } })}
                aria-expanded="false"
                aria-label="왼쪽 펴기"
                title="왼쪽 펴기 (⌘.)"
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
                title="왼쪽 접기 (⌘.)"
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
              <Explore root={root} onOpen={openDoc} onBack={() => setLeftMode('list')} />
            )}
          </section>

          <Gutter
            varName="--w-find"
            min={280}
            max={980}
            onCommit={(w) => patch({ panes: leftMode === 'explore' ? { explore: w } : { list: w } })}
          />

          <main className="pane pane--doc">
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
              <Landing repo={repo} docs={docs} onOpen={openDoc} />
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
function Landing({ repo, docs, onOpen }) {
  const settled = docs.filter((d) => d.settledCoords > 0)
  return (
    <div className="docpane">
      <div className="docwrap">
        <h1 style={{ fontSize: 20, margin: '32px 0 4px' }}>{repo.root.split(/[\\/]/).pop()}</h1>
        <p style={{ color: 'var(--text-2)' }}>
          문서 {docs.length}건 · 좌표 {repo.coords}개
          {settled.length > 0 && ` · 후속이 있는 문서 ${settled.length}건`}
        </p>
        <p style={{ color: 'var(--text-3)', marginTop: 24 }}>
          왼쪽 <b>목록</b>에서 하나를 고르면 <b>뻗어나가기</b>가 켜집니다.{' '}
          <span className="kbd">⌘K</span> 로 자연어 검색, <span className="kbd">\</span> 로 왼쪽 전환.
        </p>
        {docs.slice(0, 5).map((d) => (
          <div className="nextread" key={d.id}>
            <span className="num" style={{ color: 'var(--text-3)', fontSize: 11.5 }}>{d.date}</span>
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
            {[
              [['⌘K'], '검색 · 이동 — 자연어를 정본 좌표로 대조한다'],
              [['\\'], '왼쪽 전환 — 목록 ↔ 뻗어나가기'],
              [['⌘.'], '읽기 모드 — 왼쪽을 접는다'],
              [['⌘+', '⌘-', '⌘0'], '본문 글자 크기'],
              [['j', 'k'], '작업문서 목록 위아래'],
              [['x'], '읽음 표시 토글'],
              [['⇧C'], '요약 복사 — AI 세션에 붙여넣는 형식 그대로'],
              [['⌥←', '⌥→'], '방문 이력'],
              [['?'], '이 창'],
              [['esc'], '닫기 — 겹쳐 있으면 위에서부터 하나씩'],
            ].map(([keys, what]) => (
              <div className="help__row" key={what}>
                <dt>{keys.map((k) => <span className="kbd" key={k}>{k}</span>)}</dt>
                <dd>{what}</dd>
              </div>
            ))}
          </dl>

          {isServer && (
            <>
              <div className="help__cap">설명서</div>
              <a className="help__doc" href="/manual" style={{ textDecoration: 'none' }}>
                <Icon name="book" size={14} /> 제품 설명서 — 사용자 · 관리자 · 개발자
              </a>
            </>
          )}
          {manuals.length > 0 && (
            <>
              <div className="help__cap">매뉴얼</div>
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
