// 껍데기 하나 — **라우트가 얼굴을 고르고, 메뉴는 한 겹이다.** 화면 · 권한 검토 v0.1 R7 · R8 · 좌측 메뉴 셸 설계 v0.1 · 개편안 §7.2.
//
//   사이트(소개 · 설명서 · 로그인 · 처음 설정)   상단 바(TopBar) 그대로 · 메뉴 없음 — 로그인 전에도 보는 공개 화면이다(셸 설계 §5)
//   레포 · 콘솔                                 왼쪽 메뉴(SideNav) + 본문(AppBar + 얼굴). 메뉴는 얼굴 사이에 살아남는다
//
//   화면    `shell/routes.js` 의 screenOf — 주소 하나를 메뉴 · 빵부스러기 · 탭 제목 · 없는/권한 밖 주소 · App · 관리 · 콘솔이
//           **같이** 읽는다(ScreenCtx). 없는 주소 · 권한 밖 주소는 그리지 않고 바꿔 쓴다(replace · D4)
//   세션    `SessionProvider` 가 `/site/info` · `/me` 를 한 번 읽어 내린다. `ready` 전에는 아무것도 그리지 않는다
//   알림 · 재인증  셸에 하나씩(ToastProvider · SudoProvider) — 얼굴을 넘어도 떠 있던 것이 살아남는다
//   레포    `<App key={repo}>` — 레포마다 상태를 새로(§6.6.2)
//
// 로컬 얼굴(PC 의 뷰어 — `/` 가 레포였다)은 v1.0 에 없앴다(개편안 §5.6) — 얼굴은 레포 · 콘솔 · 사이트 셋이다.

import { useCallback, useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useRoute, modeOf, navigate } from './lib/router.jsx'
import { SessionProvider, useSession } from './lib/session.jsx'
import { SlotCtx, ScreenCtx } from './lib/slots.js'
import { lastRepo } from './lib/api.js'
import { screenOf, crumbOf, titleOf, redirectOf, navRepoOf } from './shell/routes.js'
import { ToastProvider } from './shell/toast.jsx'
import { SudoProvider } from './shell/sudo.jsx'
import SideNav, { readRail, setRail } from './shell/SideNav.jsx'
import AppBar from './shell/AppBar.jsx'
import TopBar from './components/TopBar.jsx'
import App from './App.jsx'
import Site from './site/Site.jsx'
import Console from './console/Console.jsx'

export default function Shell() {
  const route = useRoute()
  const m = modeOf(route.path)
  // 인라인 스크립트(index.html)가 첫 페인트 전에 같은 값을 붙였다 — 여기서는 얼굴이 바뀔 때 따라간다(페인트 전 · 한 프레임도 어긋나지 않게)
  useLayoutEffect(() => {
    document.documentElement.dataset.face = m.face
  }, [m.face])
  return (
    <SessionProvider>
      <ToastProvider>
        <SudoProvider>
          <Frame m={m} route={route} />
        </SudoProvider>
      </ToastProvider>
    </SessionProvider>
  )
}

function mk(cls) {
  const el = document.createElement('div')
  el.className = cls
  return el
}

const OVERLAY = '(max-width: 760px)'
const inField = (t) => !!t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable)

function Frame({ m, route }) {
  const s = useSession()
  // 포털 자리 둘 — App 이 렌더될 때 이미 있어야 하므로 여기서 만든다. AppBar 가 마운트되며 자기 안에 붙인다
  const slots = useMemo(() => ({ center: mk('topbar__center'), right: mk('topbar__right') }), [])

  // 지금 주소의 화면 — 히스토리 항목의 `cdp`(왼쪽 목록)까지 본다. 주소가 바뀔 때마다 route 가 새것이다
  const scr = useMemo(() => screenOf({ path: route.path, query: route.query, hist: history.state?.cdp || null }), [route])
  const app = m.face === 'repo' || m.face === 'console'

  // 왼쪽 메뉴 — 접힘은 <html data-nav>(첫 페인트 전 인라인 스크립트) · 덮개(≤760px)는 이 화면의 일시 상태(기억하지 않는다)
  const [rail, setRailState] = useState(readRail)
  const [navOpen, setNavOpen] = useState(false)
  const toggleRail = useCallback(() => {
    setRailState((v) => {
      setRail(!v)
      return !v
    })
  }, [])
  const toggleNav = useCallback(() => {
    if (window.matchMedia(OVERLAY).matches) setNavOpen((v) => !v)
    else toggleRail()
  }, [toggleRail])
  // 주소가 바뀌면 덮개는 걷는다
  useEffect(() => setNavOpen(false), [route.href])
  // ⌘B / Ctrl B — 편집기 · 탐색기 관례(L5). 입력칸 안에서는 그 칸의 것(굵게)이다
  useEffect(() => {
    if (!app) return
    const onKey = (e) => {
      if (!(e.metaKey || e.ctrlKey) || e.altKey || e.shiftKey || e.key.toLowerCase() !== 'b' || inField(e.target)) return
      e.preventDefault()
      toggleNav()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [app, toggleNav])

  // 없는 주소 · 권한 밖 주소 — 그리지 않고 바꿔 쓴다. 이 렌더에서는 얼굴을 그리지 않는다(권한 밖 화면이 한 프레임도 서지 않게 ·
  // 그 화면이 권한 밖 API 를 부르지 않게)
  const to = s.ready && app ? redirectOf(scr, s.me) : null
  useLayoutEffect(() => {
    if (to) navigate(to, { replace: true })
  }, [to])
  // 탭 제목 — 메뉴 표에서(`<화면> · <레포> · CDP`). 사이트는 그 화면이 스스로 정한다
  const title = app ? titleOf(scr) : null
  useEffect(() => {
    if (title) document.title = title
  }, [title])

  if (!s.ready) return null

  if (!app) {
    const seg = route.segs[0] || ''
    return (
      <div className="shell" data-face={m.face}>
        <TopBar cur={seg === '' ? 'intro' : seg === 'manual' ? 'manual' : null} hideLogin={seg === 'login' || seg === 'setup'} />
        <ScreenCtx.Provider value={scr}>
          <Site />
        </ScreenCtx.Provider>
      </div>
    )
  }

  const navRepo = navRepoOf(m.face, m.repo, s.me, lastRepo())
  let body = null
  if (!to) {
    if (m.face === 'console') body = <Console />
    else body = <App key={m.repo} />
  }

  return (
    <div className="shell shell--nav" data-face={m.face} data-navopen={navOpen ? '1' : '0'}>
      <SideNav
        face={m.face}
        me={s.me}
        info={s.info}
        repo={navRepo}
        item={scr.item}
        rail={rail}
        onRail={toggleRail}
        onNavigate={() => setNavOpen(false)}
        onLogout={s.clear}
      />
      {navOpen && <div className="snav__scrim" onMouseDown={() => setNavOpen(false)} />}
      <div className="shell__main">
        <AppBar crumb={crumbOf(scr)} slots={slots} navOpen={navOpen} onMenu={toggleNav} />
        <SlotCtx.Provider value={slots}>
          <ScreenCtx.Provider value={scr}>{body}</ScreenCtx.Provider>
        </SlotCtx.Provider>
      </div>
    </div>
  )
}
