// 사이트 — 소개 · 설명서 · 로그인 · 설치 마법사 · /r 빈 상태. 제품관리서비스 검토 §4.4~4.6.
//
// **읽는 면**이다. 토큰을 받기 전의 사용자가 보는 자리라 기본 공개(D2)이고, 레포 이름 ·
// 사람 이름이 없는 값(`/site/info`)만으로 그린다. 세션이 있으면 상단에 이름과 갈 곳이 붙는다.

import { useCallback, useEffect, useState } from 'react'
import { site } from '../lib/api.js'
import { useRoute, Link } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import Landing from './Landing.jsx'
import Manual from './Manual.jsx'
import Login from './Login.jsx'
import Setup from './Setup.jsx'
import NoRepo from './NoRepo.jsx'

export default function Site() {
  const route = useRoute()
  const [info, setInfo] = useState(null)
  const [err, setErr] = useState(null)
  const refresh = useCallback(() => site.info().then(setInfo).catch((e) => setErr(e.message)), [])
  useEffect(() => {
    refresh()
  }, [refresh])

  const cur = route.segs[0] || ''
  let page
  if (cur === '') page = <Landing info={info} />
  else if (cur === 'manual') page = <Manual info={info} id={route.segs[1] || null} hash={route.hash} />
  else if (cur === 'login') page = <Login next={route.query.get('next') || '/r'} />
  else if (cur === 'setup') page = <Setup info={info} onDone={refresh} />
  else if (cur === 'r') page = <NoRepo info={info} />
  else page = <NotFound path={route.path} />

  return (
    <div className="site">
      <SiteTop info={info} cur={cur} />
      {err && <div className="wrap"><div className="anote anote--bad" style={{ marginTop: 16 }}>서버에 닿지 않습니다 — {err}</div></div>}
      {page}
      <footer className="site-foot">
        <span>CDP{info?.version ? ` v${info.version}` : ''}{info?.built ? ` · 빌드 ${info.built}` : ''}</span>
        <span className="sp" />
        <Link to="/manual">설명서</Link>
        {info?.user ? <a href="/r">내 레포로</a> : <Link to="/login">로그인</Link>}
      </footer>
    </div>
  )
}

// 상단 — 표식 · 소개 · 설명서 · (로그인 | 이름 · 역할 · 콘솔 · 내 레포로)
function SiteTop({ info, cur }) {
  const me = info?.user || null
  return (
    <header className="site-top">
      <Link to="/" className="site-top__brand">
        <span className="topbar__mark" aria-hidden="true">C</span>CDP
      </Link>
      <nav className="site-top__nav">
        <Link to="/" aria-current={cur === '' ? 'page' : undefined}>소개</Link>
        <Link to="/manual" aria-current={cur === 'manual' ? 'page' : undefined}>설명서</Link>
      </nav>
      <span className="site-top__sp" />
      {me ? (
        <span className="site-top__me">
          <b style={{ color: 'var(--text)' }}>{me}</b>
          <span className="who__role">{info.role}</span>
          {info.admin && (
            <a className="btn btn--sm" href="/console">
              <Icon name="shield" size={13} /> 콘솔
            </a>
          )}
          {/* 볼 수 있는 레포가 없는 사람에게 [내 레포로] 를 내밀지 않는다 — 갈 곳이 없다 */}
          {cur !== 'r' && (
            <a className="btn btn--accent btn--sm" href="/r">
              내 레포로 <Icon name="arrowRight" size={13} />
            </a>
          )}
          <a className="who__out" href="/logout" title="로그아웃">
            <Icon name="power" size={13} />
          </a>
        </span>
      ) : (
        <span className="site-top__me">
          {cur !== 'login' && cur !== 'setup' && (
            <Link className="btn btn--sm" to="/login">
              로그인
            </Link>
          )}
        </span>
      )}
    </header>
  )
}

function NotFound({ path }) {
  return (
    <div className="empty-page">
      <section className="acard">
        <div className="acard__head"><span className="acard__title">없는 주소입니다</span></div>
        <div className="acard__body">
          <div className="arow"><span className="arow__label">주소</span><span className="arow__value"><span className="amono">{path}</span></span></div>
          <div className="anote">소개(<Link to="/">/</Link>) · 설명서(<Link to="/manual">/manual</Link>) · 내 레포(<a href="/r">/r</a>) · 콘솔(<a href="/console">/console</a>) 가운데 하나다.</div>
        </div>
      </section>
    </div>
  )
}
