// 사이트 — 소개 · 설명서 · 로그인 · 설치 마법사 · /r 빈 상태. 제품관리서비스 검토 §4.4~4.6.
//
// **읽는 면**이다. 토큰을 받기 전의 사용자가 보는 자리라 기본 공개(D2)이고, 레포 이름 ·
// 사람 이름이 없는 값(`/site/info`)만으로 그린다. 상단은 세 얼굴이 같이 쓰는 `TopBar` 다
// (화면 UX 검토 v0.1 §5.1) — 세션이 있으면 거기에 「레포」 · 「콘솔」 이 붙는다.

import { useCallback, useEffect, useState } from 'react'
import { site, repoHref } from '../lib/api.js'
import { useRoute, Link, useTitle } from '../lib/router.jsx'
import TopBar from '../components/TopBar.jsx'
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
  else if (cur === 'r') page = <NoRepo info={info} from={route.query.get('from')} />
  else page = <NotFound path={route.path} />

  const me = info?.user ? { user: info.user, role: info.role, admin: !!info.admin } : null
  return (
    <div className="site">
      <TopBar
        face="site"
        me={me}
        cur={cur === '' ? 'intro' : cur === 'manual' ? 'manual' : null}
        // 이 서버에 레포가 하나도 없으면(마법사 직후) 「레포」 는 갈 곳이 없다 — 내밀지 않는다
        hasRepos={(info?.repos ?? 1) > 0}
        hideLogin={cur === 'login' || cur === 'setup'}
        Link={Link}
      />
      {err && <div className="wrap"><div className="anote anote--bad" style={{ marginTop: 16 }}>서버에 닿지 않습니다 — {err}</div></div>}
      {page}
      <footer className="site-foot">
        <span>CDP{info?.version ? ` v${info.version}` : ''}{info?.built ? ` · 빌드 ${info.built}` : ''}</span>
        <span className="sp" />
        <Link to="/manual">설명서</Link>
        {me ? <a href={repoHref()}>레포</a> : <Link to="/login">로그인</Link>}
      </footer>
    </div>
  )
}

// 없는 주소 — 서버가 브라우저의 미지 경로에 이 화면을 낸다(화면 UX 검토 v0.1 P6). 갈 수 있는 곳 넷.
function NotFound({ path }) {
  useTitle('없는 주소 · CDP')
  return (
    <div className="empty-page">
      <section className="acard">
        <div className="acard__head"><span className="acard__title">없는 주소입니다</span></div>
        <div className="acard__body">
          <div className="arow"><span className="arow__label">주소</span><span className="arow__value"><span className="amono">{path}</span></span></div>
          <div className="anote">소개(<Link to="/">/</Link>) · 설명서(<Link to="/manual">/manual</Link>) · 레포(<a href={repoHref()}>/r</a>) · 콘솔(<a href="/console">/console</a>) 가운데 하나다.</div>
        </div>
      </section>
    </div>
  )
}
