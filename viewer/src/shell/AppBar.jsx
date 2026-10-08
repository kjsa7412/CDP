// 상단 바 — 레포 · 콘솔 얼굴의 것(좌측 메뉴 셸 설계 §2.3). 남는 것은 **위치와 도구**뿐이다.
//
//   [☰] dpms_wiki › 큐레이션 › 대기열            [검색 · 이동 Ctrl K]  ⚠ 검증 4  ⋯
//
// - 얼굴 스위처 · 레포 세그 · 이름 · 로그아웃은 왼쪽 메뉴로 갔다(같은 일을 하는 단추를 두 곳에 두지 않는다).
// - ☰ 는 760px 아래에서만 — 메뉴가 숨고 덮개로 뜬다(개편안 §7.2). 그 위에서는 메뉴 맨 위 「«」 · ⌘B 가 접는다.
// - 가운데 · 오른쪽은 포털 자리다 — App 이 검색 · 검증 · ⋯ 를 그린다(상태와 핸들러는 App 에 · DOM 은 여기).
//   클래스(`.topbar` · `.topbar__center`)는 그대로 둔다 — 사이트 캡처(site/demo/capture.mjs)가 그 이름으로 찾는다.

import { Fragment, useCallback } from 'react'
import Icon from '../components/Icon.jsx'
import { Link } from '../lib/router.jsx'

export default function AppBar({ crumb = [], slots = null, navOpen = false, onMenu }) {
  // 포털 자리 — 미리 만든 노드를 내 안에 붙인다(한 번). display:contents 인 host 라 flex 줄에 그대로 선다
  const hostCenter = useCallback((el) => el && slots?.center && slots.center.parentNode !== el && el.appendChild(slots.center), [slots])
  const hostRight = useCallback((el) => el && slots?.right && slots.right.parentNode !== el && el.appendChild(slots.right), [slots])
  const last = crumb.length - 1
  return (
    <header className="topbar appbar">
      <button type="button" className="iconbtn appbar__menu" onClick={onMenu} aria-label="메뉴" aria-expanded={navOpen} title="메뉴">
        <Icon name="menu" size={18} />
      </button>
      <nav className="crumb" aria-label="위치">
        {crumb.map((c, i) => (
          <Fragment key={i}>
            {i > 0 && (
              <span className="crumb__sep" aria-hidden="true">
                ›
              </span>
            )}
            {i === last ? (
              <b className="crumb__here" aria-current="page">
                {c.label}
              </b>
            ) : c.to ? (
              <Link to={c.to} className="crumb__link">
                {c.label}
              </Link>
            ) : (
              <span>{c.label}</span>
            )}
          </Fragment>
        ))}
      </nav>
      <div className="topbar__centerhost" ref={hostCenter} />
      <div className="topbar__righthost" ref={hostRight} />
    </header>
  )
}
