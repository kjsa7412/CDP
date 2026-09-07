// 셸 — **찾는 곳 | 문서** 2분할 (정정_판정모델_v2 §6).
//
// 왼쪽은 문서를 고르는 곳이고 오른쪽은 문서다. 왼쪽은 다시 위아래로 나뉜다:
//
//   위    문서 · 좌표 · 그래프    **시작점**을 고른다
//   아래  뻗어나가기             고른 것에서 한 레벨씩 다음 노드로
//
// 뷰 세 개(대상 · 작업 · 현황)와 사이드바·목록·관계 패널을 전부 걷어냈다.
// 뷰는 "찾는 방법"의 다른 이름이었고, 그것은 위 영역의 탭이면 된다.
// 관계는 별도 패널이 아니라 **뻗어나가기 그 자체**다.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { api, subscribe, startHeartbeat, ApiError } from './lib/api.js'
import { buildCoordIndex } from './lib/markdown.js'
import { summaryText } from './lib/format.js'
import DocView from './components/DocView.jsx'
import CheckView from './components/CheckView.jsx'
import Palette from './components/Palette.jsx'
import StatusBar from './components/StatusBar.jsx'
import SetupView from './components/SetupView.jsx'
import Finder from './components/Finder.jsx'
import Explore from './components/Explore.jsx'

export default function App() {
  const [state, setState] = useState(null)
  const [repo, setRepo] = useState(null)
  const [docs, setDocs] = useState([])
  const [tree, setTree] = useState(null)
  const [managedList, setManagedList] = useState([])
  // 뻗어나가기의 뿌리. 위 영역에서 고른 것 하나. { kind, key }
  const [root, setRoot] = useState(null)
  const [docId, setDocId] = useState(null)
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [changedPaths, setChangedPaths] = useState(new Set())
  const [toast, setToast] = useState(null)
  const [scanning, setScanning] = useState(false)
  const [fatal, setFatal] = useState(null)
  const [needSetup, setNeedSetup] = useState(false)
  // 검사 결과는 뷰가 아니라 **오버레이**다.
  //
  // 현황 뷰를 걷어내면서 이 길이 끊겼다 -- 판정을 error 로 올려놓고 정작
  // 목록을 볼 데가 없었다. 오류는 커밋을 막으므로 **무엇이 막았는지**로
  // 가는 길이 항상 있어야 한다.
  const [checkOpen, setCheckOpen] = useState(false)
  // 좌우 비율 — 문서 : 찾는 곳. 창 폭에서 역산해 왼쪽 폭을 정한다.
  const [ratio, setRatio] = useState(null)
  const historyRef = useRef({ stack: [], pos: -1 })

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
    return { r, d, v, s }
  }, [])

  useEffect(() => {
    reload()
      .then(({ r, d, s }) => {
        if (!s.repoPath || r.docs === 0) {
          if (!s.repoPath) setNeedSetup(true)
        }
        // 첫 화면 — 마지막에 읽던 문서를 그대로 연다. 시작점도 거기서 잡는다.
        if (s.lastDoc && d.docs.some((x) => x.id === s.lastDoc)) {
          setDocId(s.lastDoc)
          setRoot({ kind: 'work', key: s.lastDoc, open: s.lastDoc })
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
    el.style.setProperty('--w-find', `${state?.panes?.find ?? 400}px`)
    el.style.setProperty('--h-find-top', `${state?.panes?.findTop ?? 46}%`)
  }, [reading.fontSize, reading.measure, state?.panes?.find, state?.panes?.findTop])

  // 비율 버튼 — 창 폭에서 역산한다. 창이 바뀌면 비율을 유지한다.
  useEffect(() => {
    if (!ratio) return
    const apply = () => {
      const w = clamp(Math.round(document.documentElement.clientWidth / (ratio + 1)), 280, 900)
      document.documentElement.style.setProperty('--w-find', w + 'px')
    }
    apply()
    const ro = new ResizeObserver(apply)
    ro.observe(document.documentElement)
    return () => ro.disconnect()
  }, [ratio])

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

  const openDoc = useCallback(
    (id) => {
      if (!id) return
      setDocId(id)
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

  // 시작점을 고른다 — 왼쪽 아래가 여기서부터 뻗어나간다.
  //
  // 열 수 있는 노드(작업 기록 · 관리 문서)면 오른쪽도 같이 바꾼다. 좌표는
  // 문서가 아니므로 오른쪽을 건드리지 않는다 -- 아래에서 섹션을 한 번 더
  // 고르면 그 관리 문서가 열린다.
  const pickRoot = useCallback((node) => {
    setRoot(node)
    if (node?.open) openDoc(node.open)
  }, [openDoc])

  // 위/아래 비율 — 끌어서 조절한다
  const startVDrag = useCallback((e) => {
    e.preventDefault()
    const pane = e.currentTarget.parentElement
    const box = pane.getBoundingClientRect()
    const mv = (ev) => {
      const pct = clamp(((ev.clientY - box.top) / box.height) * 100, 20, 80)
      document.documentElement.style.setProperty('--h-find-top', pct + '%')
      pane._pct = pct
    }
    const up = () => {
      window.removeEventListener('mousemove', mv)
      window.removeEventListener('mouseup', up)
      if (pane._pct) patch({ panes: { findTop: Math.round(pane._pct) } })
    }
    window.addEventListener('mousemove', mv)
    window.addEventListener('mouseup', up)
  }, [patch])

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
        // 읽기 모드 — 하나로 전환, 상태는 기억된다(§27.5)
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
      // 뷰 전환 단축키가 없어졌다 — 뷰가 없다. 왼쪽 위 탭이 그 자리다.
      if (mod && e.altKey === false && e.key === 'ArrowLeft') return
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

      if (e.key === 'Escape' && checkOpen) return setCheckOpen(false)
      if (e.key === '?') return setSettingsOpen((s) => !s)
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
          setToast('요약 복사됨')
          setTimeout(() => setToast(null), 1500)
        }
        return
      }
      if (/^[1-4]$/.test(e.key)) {
        const keys = ['what', 'why', 'who', 'next']
        document.getElementById(`sec-${keys[Number(e.key) - 1]}`)?.scrollIntoView({ block: 'start', behavior: 'smooth' })
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

  // ── 렌더 ──────────────────────────────────────────────────────────────
  if (fatal) {
    return (
      <div className="empty" style={{ paddingTop: '20vh' }}>
        <p style={{ fontSize: 15, color: 'var(--danger)' }}>{fatal}</p>
        <p>주소창의 <code>?t=</code> 토큰이 필요합니다. 터미널에 표시된 URL 로 다시 여세요.</p>
      </div>
    )
  }

  if (needSetup) {
    return (
      <SetupView
        initialPath={state?.repoPath || ''}
        onDone={() => {
          setNeedSetup(false)
          setScanning(true)
          reload().finally(() => setScanning(false))
        }}
      />
    )
  }

  if (!state || !repo) {
    return <div className="empty" style={{ paddingTop: '20vh' }}>불러오는 중…</div>
  }

  // 읽기 모드는 "읽을 것이 있을 때"만 적용한다. 문서를 안 골랐는데 패널을
  // 접으면 고를 방법이 사라진다 — 설정은 기억하되 화면에는 반영하지 않는다.
  // 검증 뷰도 마찬가지로 읽기 모드를 쓰지 않는다(목록이 아니라 결과가 본문이다).
  const effectiveMode = reading.mode === 'focus' && docId ? 'focus' : 'browse'

  // data-hide-list: 검증 뷰는 목록이 필요 없다 — 본문 폭을 내주는 것이 낫다.
  // data-force-status: 감시가 끊기면 읽기 모드에서도 상태바를 되살린다 —
  //   화면이 낡았을 수 있는데 조용한 화면으로 읽고 있으면 안 된다(§23.3 · §27.5).
  return (
    <div
      className="app"
      data-mode={effectiveMode}
      data-density={state.density || 'normal'}
      data-nodoc={docId ? '0' : '1'}
      data-force-status={repo.watchEnabled && !repo.watchAlive ? '1' : '0'}
    >
      <header className="topbar">
        <span className="topbar__name">{repo.root.split(/[\\/]/).pop()}</span>
        {repo.hostWarning && <span className="hostwarn">⚠ loopback 아님</span>}
        <span className="topbar__spacer" />
        {toast && <span style={{ color: 'var(--text-2)', fontSize: 11.5 }}>{toast}</span>}
        <button className="topbar__search" onClick={() => setPaletteOpen(true)}>
          <span>검색 · 이동</span>
          <span className="topbar__spacer" />
          <span className="kbd">⌘K</span>
        </button>
        {/* 좌우 비율 — 문서 : 찾는 곳. 끌지 않고 한 번에 맞춘다 */}
        <div className="seg seg--ratio" role="group" aria-label="문서 : 찾는 곳 비율">
          {[1, 2, 3].map((n) => (
            <button
              key={n}
              aria-pressed={ratio === n}
              title={`문서 : 찾는 곳 = ${n}:1`}
              onClick={() => setRatio(n)}
            >
              {n}:1
            </button>
          ))}
        </div>
        <button
          className="iconbtn"
          aria-pressed={reading.mode === 'focus'}
          onClick={() => patch({ reading: { mode: reading.mode === 'focus' ? 'browse' : 'focus' } })}
          title="읽기 모드 (⌘.)"
        >
          ▭
        </button>
        <button className="iconbtn" onClick={() => setSettingsOpen((s) => !s)} title="설정 (?)">
          ⚙
        </button>
      </header>

      {settingsOpen && (
        <Settings state={state} patch={patch} reading={reading} onClose={() => setSettingsOpen(false)} />
      )}

      {/* **찾는 곳 | 문서** 2분할 (정정_판정모델_v2 §6).
          왼쪽 위에서 시작점을 고르고, 왼쪽 아래에서 뻗어나간다.
          오른쪽은 문서로서의 정보만 낸다. */}
      <div className="panes">
        <section className="pane pane--find" aria-label="찾는 곳">
          <div className="find__top">
            <Finder
              docs={docs}
              managed={managedList}
              tree={tree}
              root={root}
              onPick={pickRoot}
              readMap={readMap}
              myCoords={myCoords}
              onToggleMine={(c) =>
                patch({ myCoords: myCoords.includes(c) ? myCoords.filter((x) => x !== c) : [...myCoords, c] })
              }
            />
          </div>
          <div className="find__gut" role="separator" aria-label="위아래 비율" onMouseDown={startVDrag} />
          <div className="find__bot">
            <div className="find__label">뻗어나가기</div>
            <div className="find__scroll">
              <Explore root={root} onOpen={openDoc} />
            </div>
          </div>
        </section>

        {/* 손으로 끌면 비율을 놓는다 — 안 그러면 창 크기가 바뀔 때
            비율 계산이 되살아나 끌어 놓은 폭을 덮는다 */}
        <Gutter
          varName="--w-find"
          min={280}
          max={900}
          onCommit={(w) => { setRatio(null); patch({ panes: { find: w } }) }}
        />

        <main className="pane pane--doc">
          {docId ? (
            <DocView
              docId={docId}
              coordIndex={coordIndex}
              myCoords={myCoords}
              reading={reading}
              changedPaths={changedPaths}
              savedRatio={state.scroll?.[docId]?.ratio}
              onOpen={openDoc}
              onCoord={(c) => pickRoot({ kind: 'coord', key: c })}
              onScrollSave={saveScroll}
            />
          ) : (
            <Landing repo={repo} docs={docs} onOpen={openDoc} />
          )}
        </main>
      </div>

      <StatusBar repo={repo} scanning={scanning} onRescanned={reload} onCheck={() => setCheckOpen(true)} />

      {checkOpen && (
        <div className="overlay" role="dialog" aria-label="검사 결과">
          <div className="overlay__box">
            <div className="overlay__head">
              검사 결과
              <span className="topbar__spacer" />
              <button className="iconbtn" onClick={() => setCheckOpen(false)} aria-label="닫기">✕</button>
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
          onCoord={(c) => pickRoot({ kind: 'coord', key: c })}
          onAliasMiss={onAliasMiss}
        />
      )}
    </div>
  )
}


// 문서를 안 골랐을 때 — 좌표 요약 카드(§26.2)
function Landing({ repo, docs, onOpen }) {
  const settled = docs.filter((d) => d.settledCoords > 0)
  return (
    <div className="docpane">
      <div className="docwrap">
        <h1 style={{ fontSize: 20, margin: '32px 0 4px' }}>{repo.root.split(/[\\/]/).pop()}</h1>
        <p style={{ color: 'var(--text-2)' }}>
          문서 {docs.length}건
          {settled.length > 0 && ` · 후속이 있는 문서 ${settled.length}건`}
        </p>
        <p style={{ color: 'var(--text-3)', marginTop: 24 }}>
          왼쪽 위에서 <b>시작점</b>을 고르면 아래에서 뻗어나갑니다.{' '}
          <span className="kbd">⌘K</span> 로 자연어 검색, <span className="kbd">⌘.</span> 로 읽기 모드.
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

// 설정 — 읽는 사람이 정한다(§27.7)
function Settings({ state, patch, reading, onClose }) {
  return (
    <div className="popover" onMouseLeave={onClose}>
      <div className="field">
        <span>테마</span>
        <div className="seg">
          {['system', 'light', 'dark'].map((t) => (
            <button key={t} aria-pressed={(state.theme || 'system') === t} onClick={() => patch({ theme: t })}>
              {{ system: '자동', light: '밝게', dark: '어둡게' }[t]}
            </button>
          ))}
        </div>
      </div>

      <div className="hr" />
      <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-3)', letterSpacing: '.04em' }}>읽기</div>

      <div className="field">
        <span>글자 크기</span>
        <div className="seg">
          {[13, 14, 15, 16, 18].map((s) => (
            <button key={s} aria-pressed={reading.fontSize === s} onClick={() => patch({ reading: { fontSize: s } })}>
              {s}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>본문 폭</span>
        <div className="seg">
          {[
            [620, '좁게'],
            [760, '보통'],
            [900, '넓게'],
            ['window', '창 폭'],
          ].map(([v, l]) => (
            <button key={v} aria-pressed={reading.measure === v} onClick={() => patch({ reading: { measure: v } })}>
              {l}
            </button>
          ))}
        </div>
      </div>

      <div className="field">
        <span>본문 좌표 링크</span>
        <div className="seg">
          <button aria-pressed={reading.coordLinks !== false} onClick={() => patch({ reading: { coordLinks: true } })}>
            켜기
          </button>
          <button aria-pressed={reading.coordLinks === false} onClick={() => patch({ reading: { coordLinks: false } })}>
            끄기
          </button>
        </div>
      </div>

      <div className="hr" />
      <div style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.7 }}>
        <div>
          <span className="kbd">⌘K</span> 검색 · <span className="kbd">⌘.</span> 읽기 모드 ·{' '}
          <span className="kbd">⌘1-5</span> 뷰
        </div>
        <div>
          <span className="kbd">j/k</span> 목록 · <span className="kbd">1-4</span> 섹션 ·{' '}
          <span className="kbd">⇧C</span> 요약 복사
        </div>
        <div style={{ marginTop: 6, fontFamily: 'var(--font-mono)', fontSize: 10.5, wordBreak: 'break-all' }}>
          {state.repoPath}
        </div>
      </div>
    </div>
  )
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

// eslint-disable-next-line no-unused-vars
function countInbox(repo, state) {
  return 0 // 문서 목록을 받은 뒤에 계산한다. 초기 판정은 보수적으로.
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
