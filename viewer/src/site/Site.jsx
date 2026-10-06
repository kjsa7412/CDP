// 사이트 — 소개 · 설명서 · 로그인 · 설치 마법사 · /r 빈 상태. 제품관리서비스 검토 §4.4~4.6.
//
// **읽는 면**이다. 토큰을 받기 전의 사용자가 보는 자리라 기본 공개(D2)이고, 레포 이름 ·
// 사람 이름이 없는 값(`/site/info`)만으로 그린다. 상단 바는 Shell 이 그린다(화면 · 권한 검토 v0.1 R7) —
// `info` 는 세션(`SessionProvider`)이 한 번 읽은 것이고 마법사가 끝나면 `refresh` 로 갱신한다.

import { Link, useRoute, useTitle } from '../lib/router.jsx'
import { repoHref } from '../lib/api.js'
import { useSession } from '../lib/session.jsx'
import Landing from './Landing.jsx'
import Manual from './Manual.jsx'
import Login from './Login.jsx'
import Setup from './Setup.jsx'
import NoRepo from './NoRepo.jsx'

export default function Site() {
  const route = useRoute()
  const s = useSession()
  const info = s.info

  const cur = route.segs[0] || ''
  let page
  if (cur === '') page = <Landing info={info} />
  else if (cur === 'manual') page = <Manual info={info} id={route.segs[1] || null} hash={route.hash} />
  else if (cur === 'login') page = <Login next={route.query.get('next')} />
  else if (cur === 'setup') page = <Setup info={info} onDone={s.refresh} />
  else if (cur === 'r') page = <NoRepo from={route.query.get('from')} />
  else page = <NotFound path={route.path} />

  const me = info?.user ? { user: info.user, role: info.role, admin: !!info.admin } : null
  return (
    <div className="site">
      {s.err && <div className="wrap"><div className="anote anote--bad" style={{ marginTop: 16 }}>서버에 닿지 않습니다 — {s.err}</div></div>}
      {page}
      <footer className="site-foot">
        <span>CDP{info?.version ? ` v${info.version}` : ''}{info?.built ? ` · 빌드 ${info.built}` : ''}</span>
        <span className="sp" />
        <Link to="/manual">설명서</Link>
        {me ? <Link to={repoHref()}>레포</Link> : <Link to="/login">로그인</Link>}
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
          <div className="anote">소개(<Link to="/">/</Link>) · 설명서(<Link to="/manual">/manual</Link>) · 레포(<Link to={repoHref()}>/r</Link>) · 서버(<Link to="/console">/console</Link>) 가운데 하나다.</div>
        </div>
      </section>
    </div>
  )
}
