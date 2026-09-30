// 껍데기 — 상단 바 · 본문 · 바닥글. 주소는 routes.js 하나가 정한다.
//
// 상단 바 높이는 제품과 같은 48px(`--topbar-h`) · 표식 「CDP」 는 → 홈. **이 사이트에는 로그인 · 다운로드 단추가 없다**
// (제작 검토 v0.1 S1 · Q4) — 들이는 길은 배치 · 설치 페이지의 문장이다.

import { useEffect, useRef, useState } from 'react'
import Icon from '../../viewer/src/components/Icon.jsx'
import { Link, useRoute, useTitle } from './router.jsx'
import { ROUTES, NOT_FOUND } from './routes.js'
import { setTheme, isDark } from './theme.js'
import Home from './pages/Home.jsx'
import Concept from './pages/Concept.jsx'
import Screens from './pages/Screens.jsx'
import Examples from './pages/Examples.jsx'
import Agent from './pages/Agent.jsx'
import Deploy from './pages/Deploy.jsx'
import Releases from './pages/Releases.jsx'

const PAGES = { '/': Home, '/concept': Concept, '/screens': Screens, '/examples': Examples, '/agent': Agent, '/deploy': Deploy, '/releases': Releases }

export default function App() {
  const route = useRoute()
  const meta = ROUTES.find((r) => r.path === route.path)
  const Page = PAGES[route.path] || NotFound
  useTitle(meta ? meta.title : NOT_FOUND.title)
  const main = useRef(null)
  const first = useRef(true)
  // 페이지를 넘기면 제목으로 포커스를 옮긴다 — 화면 읽기 프로그램이 새 페이지를 안다(S11). 첫 적재는 건드리지 않는다
  useEffect(() => {
    if (first.current) return void (first.current = false)
    main.current?.querySelector('h1')?.focus({ preventScroll: true })
  }, [route.path])
  return (
    <div className="st">
      <a className="st-skip" href="#main">본문으로</a>
      <TopBar path={route.path} />
      <main id="main" ref={main} className="st-main">
        <Page />
      </main>
      <footer className="st-foot">
        <div className="wrap st-foot__in">
          <span>
            CDP <span className="amono">v{__CDP_VERSION__}</span> · 이 사이트는 소개만 한다 — 설치 · 로그인은 각 서버에서
          </span>
          <span className="sp" />
          {ROUTES.filter((r) => r.nav).map((r) => (
            <Link key={r.path} to={r.path}>
              {r.nav}
            </Link>
          ))}
        </div>
      </footer>
    </div>
  )
}

function TopBar({ path }) {
  const [open, setOpen] = useState(false)
  const [dark, setDark] = useState(isDark)
  useEffect(() => {
    const on = () => setDark(isDark())
    addEventListener('cdp-theme', on)
    return () => removeEventListener('cdp-theme', on)
  }, [])
  useEffect(() => setOpen(false), [path])
  return (
    <header className={'st-bar' + (open ? ' is-open' : '')}>
      <div className="wrap st-bar__in">
        <Link to="/" className="st-brand" aria-label="CDP 홈">
          <span className="st-brand__mark">C</span>
          <span>CDP</span>
        </Link>
        <nav className="st-nav" aria-label="사이트">
          {ROUTES.filter((r) => r.nav).map((r) => (
            <Link key={r.path} to={r.path} className={'st-nav__a' + (path === r.path ? ' is-on' : '')} aria-current={path === r.path ? 'page' : undefined}>
              {r.nav}
            </Link>
          ))}
        </nav>
        <span className="sp" />
        <span className="st-ver amono" title="이 사이트가 설명하는 판">v{__CDP_VERSION__}</span>
        <button type="button" className="st-icon" onClick={() => setTheme(dark ? 'light' : 'dark')} aria-label={dark ? '밝은 테마로' : '어두운 테마로'} title={dark ? '밝은 테마로' : '어두운 테마로'}>
          {dark ? <SunIcon /> : <MoonIcon />}
        </button>
        <button type="button" className="st-icon st-menu" onClick={() => setOpen((o) => !o)} aria-expanded={open} aria-label="메뉴">
          <Icon name={open ? 'close' : 'list'} size={18} />
        </button>
      </div>
    </header>
  )
}

// 해 · 달 — 제품 아이콘 43종에 없다. 같은 격자(24 · 선 1.75)로 그린다
const SunIcon = () => (
  <svg className="ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
  </svg>
)
const MoonIcon = () => (
  <svg className="ico" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
  </svg>
)

function NotFound() {
  const route = useRoute()
  return (
    <div className="wrap st-page">
      <h1 tabIndex={-1}>없는 주소입니다</h1>
      <p className="st-lead">
        <span className="amono">{route.path}</span> 는 이 사이트에 없다. 이 사이트의 주소는 일곱이다.
      </p>
      <ul className="st-list">
        {ROUTES.map((r) => (
          <li key={r.path}>
            <Link to={r.path}>{r.nav || '홈'}</Link> <span className="amuted">— {r.description}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}
