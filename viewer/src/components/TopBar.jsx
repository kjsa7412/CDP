// 공통 상단 바 — **세 얼굴이 한 부품을 쓴다.** 화면 UX 검토 v0.1 §5.1(권장 A).
//
// 전에는 소개(.site-top) · 레포(App 의 .topbar) · 콘솔(Console 의 .topbar)이 상단을 따로 그렸다 —
// 높이가 34 · 56 · 48 · 30 · 25px 로 흔들리고, 왼쪽 위 표식이 소개 · 콘솔 홈 · 레포 메뉴 세 가지 일을 했고,
// 소개로 돌아가는 길이 레포 · 콘솔에 없었다(로그아웃뿐). 여기서 셋을 하나로 접는다.
//
//   [C CDP]  소개  설명서  레포 · alpha ▾  콘솔   ┃  (얼굴 고유 도구 — 가운데)  ┃  이름  역할  ⏻  (right)
//
// - 표식은 언제나 제품이고 **소개(`/`)** 로 간다. 마크 글자는 언제나 C — 어느 레포인지는 「레포」 탭과 탭 제목이 든다.
// - 얼굴 스위처 넷은 모든 얼굴에서 같은 자리다. 비로그인은 둘(소개 · 설명서), 관리자만 「콘솔」. 현재 얼굴에
//   `aria-current` 와 액센트 밑줄 — 세그(.seg)의 "떠 있는 칸" 과 다른 문법이라 얼굴(전역)과 화면 모드(레포 안)가
//   섞이지 않는다.
// - 「레포」 는 **마지막에 보던 레포**로 간다(`lastRepo`). 레포 얼굴에서는 그 탭이 곧 레포 메뉴다(`repoMenu`).
// - 1080px 아래에서는 스위처가 표식 메뉴로 접힌다 — 라벨은 남는다. 아이콘만 남기지 않는다(P19).
// - 로컬 뷰어(face=local)는 얼굴이 하나라 스위처가 없고, 레포 이름표만 「레포 · <이름>」 로 선다.

import { useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { lastRepo, repoHref } from '../lib/api.js'

const NARROW = '(max-width: 1080px)'

export default function TopBar({
  face, // 'site' | 'repo' | 'console' | 'local'
  me = null, // { user, role, admin } — 세션. 없으면 비로그인
  cur = null, // 사이트 안의 어디 — 'intro' | 'manual' | null
  repoName = null, // 레포 · 로컬 얼굴의 지금 레포
  repoMenu = null, // 레포 얼굴 — { open, onToggle, content } : 「레포」 탭 아래 메뉴
  hasRepos = true, // 볼 수 있는 레포가 있나 — 없으면 「레포」 를 내밀지 않는다(갈 곳이 없다)
  hideLogin = false, // 로그인 · 마법사 화면에서는 [로그인] 을 내지 않는다
  center = null, // 얼굴 고유 도구
  right = null, // who 뒤에 오는 것(레포의 더보기)
  Link = null, // 같은 얼굴 안의 이동에 쓸 라우터 링크(사이트 · 콘솔). 없으면 <a>
}) {
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

  const user = me?.user || null
  const admin = !!me?.admin
  const last = face === 'repo' || face === 'local' ? repoName : lastRepo()
  const toRepo = face === 'repo' || face === 'local' ? (repoName ? '/r/' + encodeURIComponent(repoName) + '/' : '/r') : repoHref()

  // 스위처 — 얼굴 넷. 순서는 사람이 만나는 순서다: 소개 → 설명서 → 레포 → 콘솔.
  const items =
    face === 'local'
      ? [{ key: 'repo', label: '레포', sub: repoName || '', icon: 'managed', current: true, static: true }]
      : [
          { key: 'intro', label: '소개', href: '/', icon: 'home', current: face === 'site' && cur === 'intro', same: face === 'site' },
          { key: 'manual', label: '설명서', href: '/manual', icon: 'book', current: face === 'site' && cur === 'manual', same: face === 'site' },
          ...(user && hasRepos ? [{ key: 'repo', label: '레포', sub: last || '', href: toRepo, icon: 'managed', current: face === 'repo' }] : []),
          ...(user && admin ? [{ key: 'console', label: '콘솔', href: '/console', icon: 'shield', current: face === 'console', same: face === 'console' }] : []),
        ]

  const A = ({ item, className, children, ...rest }) =>
    item.same && Link ? (
      <Link to={item.href} className={className} {...rest}>
        {children}
      </Link>
    ) : (
      <a href={item.href} className={className} {...rest}>
        {children}
      </a>
    )

  const brandInner = (
    <>
      <span className="topbar__mark" aria-hidden="true">C</span>CDP
      <Icon name="chevronDown" size={12} className="caret" />
    </>
  )
  const onBrand = (e) => {
    if (!narrow) return
    e.preventDefault()
    setOpen((v) => !v)
  }

  return (
    <header className="topbar">
      {face === 'site' && Link ? (
        <Link to="/" className="topbar__brand" onClick={onBrand} aria-haspopup={narrow ? 'menu' : undefined} aria-expanded={narrow ? open : undefined} title="CDP — 소개">
          {brandInner}
        </Link>
      ) : (
        <a href="/" className="topbar__brand" onClick={onBrand} aria-haspopup={narrow ? 'menu' : undefined} aria-expanded={narrow ? open : undefined} title="CDP — 소개">
          {brandInner}
        </a>
      )}

      <nav className="faces" aria-label="얼굴">
        {items.map((it) => {
          if (it.key === 'repo' && repoMenu) {
            // 레포 얼굴 — 「레포」 탭이 곧 레포 메뉴다(볼 수 있는 레포 · 쓰기/읽기 · 관리자 절)
            return (
              <span className="topbar__repo" key={it.key}>
                <button type="button" aria-current="page" aria-haspopup="menu" aria-expanded={repoMenu.open} onClick={repoMenu.onToggle}>
                  {it.label} <span className="faces__sub">{it.sub}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {repoMenu.open && repoMenu.content}
              </span>
            )
          }
          if (it.static) {
            return (
              <span className="faces__static" key={it.key} aria-current="page">
                {it.label} <span className="faces__sub">{it.sub}</span>
              </span>
            )
          }
          return (
            <A item={it} key={it.key} aria-current={it.current ? 'page' : undefined}>
              {it.label}
              {it.sub ? <span className="faces__sub">{it.sub}</span> : null}
            </A>
          )
        })}
      </nav>

      <div className="topbar__center">{center}</div>

      {user ? (
        <span className="who">
          <b className="who__name">{user}</b>
          <span className="who__role">{me.role}</span>
          <a className="who__out" href="/logout" aria-label="로그아웃" title="로그아웃">
            <Icon name="power" size={13} />
          </a>
        </span>
      ) : face === 'site' && !hideLogin ? (
        Link ? (
          <Link className="btn btn--sm" to="/login">
            로그인
          </Link>
        ) : (
          <a className="btn btn--sm" href="/login">
            로그인
          </a>
        )
      ) : null}
      {right}

      {/* 좁은 화면 — 스위처가 표식 메뉴로 접힌다. 이름 · 글자가 그대로 살아 있다 */}
      {narrow && open && (
        <>
          <div className="scrim" onMouseDown={() => setOpen(false)} />
          <div className="brandmenu" role="menu" aria-label="CDP">
            <div className="menu__cap">CDP · 어디로</div>
            {items.map((it) => (
              <a key={it.key} className="menu__row" role="menuitem" href={it.href || toRepo} aria-current={it.current ? 'page' : undefined} onClick={() => setOpen(false)}>
                <span className="menu__ico">
                  <Icon name={it.icon} size={14} />
                </span>
                {it.label}
                <span className="menu__hint">{it.current ? '지금 여기' : it.sub || ''}</span>
              </a>
            ))}
            {face !== 'local' && (
              <>
                <div className="menu__hr" />
                {user ? (
                  <a className="menu__row" role="menuitem" href="/logout">
                    <span className="menu__ico">
                      <Icon name="power" size={14} />
                    </span>
                    로그아웃
                    <span className="menu__hint">{user}</span>
                  </a>
                ) : (
                  !hideLogin && (
                    <a className="menu__row" role="menuitem" href="/login">
                      <span className="menu__ico">
                        <Icon name="key" size={14} />
                      </span>
                      로그인
                    </a>
                  )
                )}
              </>
            )}
          </div>
        </>
      )}
    </header>
  )
}
