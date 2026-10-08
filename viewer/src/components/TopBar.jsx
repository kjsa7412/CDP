// 사이트 상단 바 — **소개 · 설명서 · 로그인 · 처음 설정**의 것. 화면 UX 검토 v0.1 §5.1 · 좌측 메뉴 셸 설계 §3 · §5.
//
// 레포 · 콘솔 얼굴의 상단은 이제 왼쪽 메뉴(shell/SideNav) + 위치 줄(shell/AppBar)이다 — 얼굴 스위처 · 레포 메뉴 ·
// 이름 · 로그아웃이 그쪽으로 갔다. 사이트는 로그인 전에도 보는 공개 화면이라 메뉴를 두지 않고(D4) 지금 모양 그대로다.
//
//   [C CDP]  설명서  레포 · alpha  서버   ┃                        ┃  이름  역할  ⏻  (또는 [로그인])
//
// - 표식은 언제나 제품이고 **소개(`/`)** 로 간다 — 「소개」 탭은 없다(표식이 곧 소개 · Q1). 소개에 있을 때 표식에 `aria-current`.
// - 「레포」 는 **마지막에 보던 레포의 마지막 경로**로(`repoHref`), 「서버」(옛 「콘솔」 — 셸 설계 L2)는 관리자에게만.
// - 1080px 아래에서는 스위처가 표식 메뉴로 접힌다 — 라벨은 남는다. 아이콘만 남기지 않는다(P19).
// - 모든 이동은 `Link`(pushState). 로그아웃은 `POST /logout` 뒤 세션을 비우고 소개로 — 문서 교체가 없다.

import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { logout, rememberRepo, repoHref } from '../lib/api.js'
import { Link, navigate } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import { clearAll } from '../lib/cache.js'

const NARROW = '(max-width: 1080px)'

export default function TopBar({
  cur = null, // 사이트 안의 어디 — 'intro' | 'manual' | null
  hideLogin = false, // 로그인 · 마법사 화면에서는 [로그인] 을 내지 않는다
}) {
  const s = useSession()
  const me = s?.me || null
  const info = s?.info || null
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  const [open, setOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const f = () => {
      setNarrow(mq.matches)
      if (!mq.matches) setOpen(false)
    }
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  useEffect(() => setOpen(false), [cur])

  const user = me?.user || info?.user || null
  const role = me?.role || info?.role || null
  const isAdmin = !!(me?.admin ?? info?.admin)
  const hasRepos = me ? (me.repos || []).length > 0 : (info?.repos ?? 1) > 0
  const onIntro = cur === 'intro'
  const toRepo = repoHref()
  const last = toRepo.split('/')[2] ? decodeURIComponent(toRepo.split('/')[2]) : ''

  // 스위처 — 설명서 · 레포 · 서버. 순서는 사람이 만나는 순서다.
  const items = [
    { key: 'manual', label: '설명서', href: '/manual', icon: 'book', current: cur === 'manual' },
    ...(user && hasRepos ? [{ key: 'repo', label: '레포', sub: last || '', href: toRepo, icon: 'managed', current: false }] : []),
    ...(user && isAdmin ? [{ key: 'console', label: '서버', href: '/console', icon: 'shield', current: false }] : []),
  ]

  const doLogout = async () => {
    setOpen(false)
    await logout()
    clearAll()
    rememberRepo(null)
    s?.clear()
    navigate('/')
  }

  const onBrand = (e) => {
    if (!narrow) return
    e.preventDefault()
    setOpen((v) => !v)
  }

  return (
    <header className="topbar">
      <Link to="/" className="topbar__brand" onClick={onBrand} aria-current={onIntro ? 'page' : undefined} aria-haspopup={narrow ? 'menu' : undefined} aria-expanded={narrow ? open : undefined} title="CDP — 소개">
        <span className="topbar__mark" aria-hidden="true">C</span>CDP
        <Icon name="chevronDown" size={12} className="caret" />
      </Link>

      <nav className="faces" aria-label="얼굴">
        {items.map((it) => (
          <Link to={it.href} key={it.key} aria-current={it.current ? 'page' : undefined}>
            {it.label}
            {it.sub ? <span className="faces__sub">{it.sub}</span> : null}
          </Link>
        ))}
      </nav>

      <span className="topbar__spacer" />

      {user ? (
        <span className="who">
          <b className="who__name">{user}</b>
          <span className="who__role">{role}</span>
          <button type="button" className="who__out" onClick={doLogout} aria-label="로그아웃" title="로그아웃">
            <Icon name="power" size={13} />
          </button>
        </span>
      ) : !hideLogin ? (
        <Link className="btn btn--sm" to="/login">
          로그인
        </Link>
      ) : null}

      {/* 좁은 화면 — 스위처가 표식 메뉴로 접힌다. 이름 · 글자가 그대로 살아 있다 */}
      {narrow && open && (
        <>
          <div className="scrim" onMouseDown={() => setOpen(false)} />
          <div className="brandmenu" role="menu" aria-label="CDP">
            <div className="menu__cap">CDP · 어디로</div>
            <Link className="menu__row" role="menuitem" to="/" aria-current={onIntro ? 'page' : undefined} onClick={() => setOpen(false)}>
              <span className="menu__ico">
                <Icon name="home" size={14} />
              </span>
              소개
              <span className="menu__hint">{onIntro ? '지금 여기' : ''}</span>
            </Link>
            {items.map((it) => (
              <Link key={it.key} className="menu__row" role="menuitem" to={it.href} aria-current={it.current ? 'page' : undefined} onClick={() => setOpen(false)}>
                <span className="menu__ico">
                  <Icon name={it.icon} size={14} />
                </span>
                {it.label}
                <span className="menu__hint">{it.current ? '지금 여기' : it.sub || ''}</span>
              </Link>
            ))}
            <div className="menu__hr" />
            {user ? (
              <button type="button" className="menu__row" role="menuitem" onClick={doLogout}>
                <span className="menu__ico">
                  <Icon name="power" size={14} />
                </span>
                로그아웃
                <span className="menu__hint">{user}</span>
              </button>
            ) : (
              !hideLogin && (
                <Link className="menu__row" role="menuitem" to="/login" onClick={() => setOpen(false)}>
                  <span className="menu__ico">
                    <Icon name="key" size={14} />
                  </span>
                  로그인
                </Link>
              )
            )}
          </div>
        </>
      )}
    </header>
  )
}
