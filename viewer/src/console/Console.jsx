// 서버 묶음(옛 콘솔) — 관리자의 자리. 제품관리서비스 검토 §4.7 · 좌측 메뉴 셸 설계 v0.1.
//
// 메뉴는 왼쪽 메뉴의 「서버」 묶음이다(`shell/nav.js` — 안쪽 메뉴는 지웠다). 페이지는 주소가 고른다(`shell/routes.js` 의 page ·
// 없는 페이지는 셸이 `/console` 로 바꿔 쓴다). 페이지는 넷이다(제품화 2 ⑥ · 7 → 4) — 현황 · 지식 레포(작업 레포 대장은 펼침 열) ·
// 사람(사용자 + 토큰) · 서버(설정 · 진단 · 감사 · 로그). 옛 주소(workrepos · users · tokens · audit)는 셸이 새 자리로 바꿔 쓴다. 세션은 `SessionProvider` 가 이미 읽었다(R8). admin 이 아니면 문장 하나로 멈춘다
// (D4 — 서버의 403 과 같은 말 · 명부에 관리자가 0명인 서버를 세우는 길을 그 문장이 든다).
//
// **재인증 · 알림은 셸에 있다**(`shell/sudo.jsx` · `shell/toast.jsx`) — 페이지는 `useSudo()` · `say` 를 그대로 쓴다.

import { useEffect } from 'react'
import { repoHref } from '../lib/api.js'
import HelpLink from '../components/HelpLink.jsx'
import { useRoute, Link, navigate } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import { useScreen } from '../lib/slots.js'
import { useToast } from '../shell/toast.jsx'
import Overview from './Overview.jsx'
import People from './People.jsx'
import Repos from './Repos.jsx'
import Server from './Server.jsx'

const PAGES = { overview: Overview, people: People, repos: Repos, server: Server }

export default function Console() {
  const route = useRoute()
  const scr = useScreen()
  const session = useSession()
  const me = session.me
  const say = useToast()

  // 세션이 없으면 로그인으로 — 직접 진입은 서버가 302 로 보냈고, 화면 안(로그아웃 뒤 뒤로 가기 등)에서는 여기서
  useEffect(() => {
    // 주소가 아직 콘솔일 때만 — 로그아웃은 세션을 비우고 곧바로 소개로 간다. 그 사이 한 번 남은 이 렌더가 소개를
    // `/login?next=/console` 로 덮어써, 다음 사람이 로그인하자마자 「관리자 권한이 필요합니다」 를 보았다
    if (!me && /^\/console(\/|$)/.test(location.pathname)) navigate('/login?next=' + encodeURIComponent(route.path + (route.hash || '')), { replace: true })
  }, [me, route.path, route.hash])

  if (!me) return null
  if (!me.admin) return <NoAdmin me={me} />
  const Page = PAGES[scr?.page] || Overview

  return (
    <div className="con">
      <div className="admin">
        <div className="admin__body">
          <div className="admin__wrap">
            <Page me={me} say={say} route={route} />
          </div>
        </div>
      </div>
    </div>
  )
}

// admin 이 아닌 사람 — v1.1 명부를 그대로 올린 서버가 정확히 이 상태다(관리자 0명). 「권한이 필요합니다」 는 여기 하나다(안내 글 규칙 ③).
// 셸 명령 · 경로 · 장 번호를 손으로 쓰지 않는다(규칙 ⑤) — 관리자 0명 서버를 세우는 길은 설명서 절이 든다.
function NoAdmin({ me }) {
  return (
    <div className="con">
      <div className="empty-page">
        <section className="acard">
          <div className="acard__head">
            <span className="acard__title">관리자 권한이 필요합니다</span>
          </div>
          <div className="acard__body">
            <div className="arow">
              <span className="arow__label">계정</span>
              <span className="arow__value">
                <b>{me.user}</b> <span className="who__role">{me.role}</span>
              </span>
            </div>
            <div className="anote">서버 묶음은 admin 의 것이다 — 관리자가 서버 › 사람에서 역할을 올린다.</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6, alignItems: 'center' }}>
              <Link className="btn btn--sm" to={repoHref()}>
                레포
              </Link>
              <HelpLink topic="people" className="btn btn--sm">
                설명서 › 사람
              </HelpLink>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
