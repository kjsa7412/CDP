// 공통 상단 바 — **세 얼굴이 한 부품을 쓰고, Shell 이 한 번만 그린다.** 화면 UX 검토 v0.1 §5.1 · 화면 · 권한 검토 v0.1 R5 · R7.
//
// 전에는 소개(.site-top) · 레포(App 의 .topbar) · 콘솔(Console 의 .topbar)이 상단을 따로 그렸다 —
// 높이가 34 · 56 · 48 · 30 · 25px 로 흔들리고, 왼쪽 위 표식이 소개 · 콘솔 홈 · 레포 메뉴 세 가지 일을 했고,
// 소개로 돌아가는 길이 레포 · 콘솔에 없었다(로그아웃뿐). v0.11.0 에서 셋을 하나로 접었고, v0.13.0 에서는 얼굴마다
// 다시 그리던 것을 **Shell 이 한 번** 그려 얼굴 사이에 살아남게 했다 — 얼굴을 넘어도 이 DOM 은 그대로다.
//
//   [C CDP]  설명서  레포 · alpha ▾  콘솔   ┃  (얼굴 고유 도구 — 가운데 · App 이 포털로)  ┃  이름  역할  ⏻  (오른쪽 슬롯)
//
// - 표식은 언제나 제품이고 **소개(`/`)** 로 간다 — 「소개」 탭은 없다(표식이 곧 소개 · Q1). 소개에 있을 때 표식에 `aria-current`.
// - 얼굴 스위처 셋은 모든 얼굴에서 같은 자리다. 비로그인은 하나(설명서), 관리자만 「콘솔」. 현재 얼굴에
//   `aria-current` 와 액센트 밑줄 — 세그(.seg)의 "떠 있는 칸" 과 다른 문법이라 얼굴(전역)과 화면 모드(레포 안)가
//   섞이지 않는다.
// - 「레포」 는 **마지막에 보던 레포의 마지막 경로**로 간다(`repoHref`). 레포 얼굴에서는 그 탭이 곧 레포 메뉴다 —
//   볼 수 있는 레포 · 쓰기/읽기 칩 · 관리자에게 이 서버의 레포 전부(권한 밖은 회색 · 검토 v0.1 D6). 세션 · 라우트 ·
//   `/admin/repos` 만 쓰므로 App 이 아니라 여기 산다.
// - 1080px 아래에서는 스위처가 표식 메뉴로 접힌다 — 라벨은 남는다. 아이콘만 남기지 않는다(P19). 거기서는 표식이
//   메뉴 토글이라 「소개」 줄이 남는다(소개로 가는 유일한 길).
// - 로컬 뷰어(face=local)는 얼굴이 하나라 스위처가 없고, 레포 이름표만 「레포 · <이름>」 로 선다.
// - 모든 이동은 `Link`(pushState). 로그아웃은 `POST /logout` 뒤 세션을 비우고 소개로 — 문서 교체가 없다.

import { useCallback, useEffect, useState } from 'react'
import Icon from './Icon.jsx'
import { api, admin, gotoRepo, logout, rememberRepo, repoHref } from '../lib/api.js'
import { Link, navigate } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import { clearAll, useResource } from '../lib/cache.js'

const NARROW = '(max-width: 1080px)'

export default function TopBar({
  face, // 'site' | 'repo' | 'console' | 'local'
  cur = null, // 사이트 안의 어디 — 'intro' | 'manual' | null
  repoName = null, // 레포 · 로컬 얼굴의 지금 레포
  hideLogin = false, // 로그인 · 마법사 화면에서는 [로그인] 을 내지 않는다
  slots = null, // Shell 이 만든 포털 자리 — { center, right }. App 이 거기에 그린다
}) {
  const s = useSession()
  const me = s?.me || null
  const info = s?.info || null
  const [narrow, setNarrow] = useState(() => typeof window !== 'undefined' && window.matchMedia(NARROW).matches)
  const [open, setOpen] = useState(false)
  const [repoOpen, setRepoOpen] = useState(false)
  useEffect(() => {
    const mq = window.matchMedia(NARROW)
    const f = () => {
      setNarrow(mq.matches)
      if (!mq.matches) setOpen(false)
    }
    mq.addEventListener('change', f)
    return () => mq.removeEventListener('change', f)
  }, [])
  // 얼굴이 바뀌면 열린 메뉴는 닫는다 — 이 부품은 살아남으므로 스스로 닫아야 한다
  useEffect(() => {
    setOpen(false)
    setRepoOpen(false)
  }, [face, repoName, cur])

  // 포털 자리 — 미리 만든 노드를 내 안에 붙인다(한 번). display:contents 인 host 라 flex 줄에 그대로 선다
  const hostCenter = useCallback((el) => el && slots?.center && slots.center.parentNode !== el && el.appendChild(slots.center), [slots])
  const hostRight = useCallback((el) => el && slots?.right && slots.right.parentNode !== el && el.appendChild(slots.right), [slots])

  // 로컬 — 레포 이름은 App 이 읽는 `/repo` 와 같은 캐시 키(요청을 나눠 받는다)
  const { data: localRepo } = useResource(face === 'local' ? 'api:local/repo' : null, api.repo, { enabled: face === 'local', ttl: 60_000 })
  const localName = localRepo?.root ? localRepo.root.split(/[\\/]/).filter(Boolean).pop() : ''
  const user = me?.user || info?.user || null
  const role = me?.role || info?.role || null
  const isAdmin = !!(me?.admin ?? info?.admin)
  const hasRepos = me ? (me.repos || []).length > 0 : (info?.repos ?? 1) > 0
  const onIntro = face === 'site' && cur === 'intro'
  const inRepo = face === 'repo' || face === 'local'
  const toRepo = inRepo ? (repoName ? '/r/' + encodeURIComponent(repoName) + '/' : '/r') : repoHref()
  const last = inRepo ? repoName : (repoHref().split('/')[2] ? decodeURIComponent(repoHref().split('/')[2]) : '')

  // 스위처 — 설명서 · 레포 · 콘솔. 순서는 사람이 만나는 순서다.
  const items =
    face === 'local'
      ? [{ key: 'repo', label: '레포', sub: localName, icon: 'managed', current: true, static: true }]
      : [
          { key: 'manual', label: '설명서', href: '/manual', icon: 'book', current: face === 'site' && cur === 'manual' },
          ...(user && hasRepos ? [{ key: 'repo', label: '레포', sub: last || '', href: toRepo, icon: 'managed', current: face === 'repo' }] : []),
          ...(user && isAdmin ? [{ key: 'console', label: '콘솔', href: '/console', icon: 'shield', current: face === 'console' }] : []),
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
        {items.map((it) => {
          if (it.key === 'repo' && face === 'repo' && me) {
            // 레포 얼굴 — 「레포」 탭이 곧 레포 메뉴다(볼 수 있는 레포 · 쓰기/읽기 · 관리자 절)
            return (
              <span className="topbar__repo" key={it.key}>
                <button type="button" aria-current="page" aria-haspopup="menu" aria-expanded={repoOpen} onClick={() => setRepoOpen((v) => !v)}>
                  {it.label} <span className="faces__sub">{it.sub}</span>
                  <Icon name="chevronDown" size={12} />
                </button>
                {repoOpen && <RepoMenu me={me} repoName={repoName} onClose={() => setRepoOpen(false)} />}
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
            <Link to={it.href} key={it.key} aria-current={it.current ? 'page' : undefined}>
              {it.label}
              {it.sub ? <span className="faces__sub">{it.sub}</span> : null}
            </Link>
          )
        })}
      </nav>

      <div className="topbar__centerhost" ref={hostCenter} />

      {user ? (
        <span className="who">
          <b className="who__name">{user}</b>
          <span className="who__role">{role}</span>
          <button type="button" className="who__out" onClick={doLogout} aria-label="로그아웃" title="로그아웃">
            <Icon name="power" size={13} />
          </button>
        </span>
      ) : face === 'site' && !hideLogin ? (
        <Link className="btn btn--sm" to="/login">
          로그인
        </Link>
      ) : null}
      <div className="topbar__righthost" ref={hostRight} />

      {/* 좁은 화면 — 스위처가 표식 메뉴로 접힌다. 이름 · 글자가 그대로 살아 있다 */}
      {narrow && open && (
        <>
          <div className="scrim" onMouseDown={() => setOpen(false)} />
          <div className="brandmenu" role="menu" aria-label="CDP">
            <div className="menu__cap">CDP · 어디로</div>
            {face !== 'local' && (
              <Link className="menu__row" role="menuitem" to="/" aria-current={onIntro ? 'page' : undefined} onClick={() => setOpen(false)}>
                <span className="menu__ico">
                  <Icon name="home" size={14} />
                </span>
                소개
                <span className="menu__hint">{onIntro ? '지금 여기' : ''}</span>
              </Link>
            )}
            {items.map((it) => (
              <Link key={it.key} className="menu__row" role="menuitem" to={it.href || toRepo} aria-current={it.current ? 'page' : undefined} onClick={() => setOpen(false)}>
                <span className="menu__ico">
                  <Icon name={it.icon} size={14} />
                </span>
                {it.label}
                <span className="menu__hint">{it.current ? '지금 여기' : it.sub || ''}</span>
              </Link>
            ))}
            {face !== 'local' && (
              <>
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
              </>
            )}
          </div>
        </>
      )}
    </header>
  )
}

// 레포 메뉴 — **항상 메뉴다**(하나여도 · 제품관리서비스 검토 §4.8). 행마다 이름 · 제목 · 권한 칩.
// 관리자에게는 「이 서버의 레포」 절이 더 붙어 권한 밖 레포가 회색으로 보인다(검토 v0.1 D6) — 열 때 한 번 읽고 캐시.
function RepoMenu({ me, repoName, onClose }) {
  const { data } = useResource('/admin/repos', admin.repos, { enabled: !!me.admin, ttl: 60_000 })
  const allRepos = data?.repos || []
  const others = me.admin ? allRepos.filter((r) => !me.repos.some((m) => m.name === r.name)) : []
  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div className="repomenu" role="menu">
        <div className="repomenu__cap">볼 수 있는 레포 {me.repos.length}</div>
        {me.repos.map((r) => (
          <button
            key={r.name}
            className="repomenu__row"
            role="menuitem"
            aria-current={r.name === repoName}
            onClick={() => {
              onClose()
              if (r.name !== repoName) gotoRepo(r.name)
            }}
          >
            <b>{r.name}</b>
            <span>{r.title || ''}</span>
            <span className={me.write ? 'chip' : 'chip chip--off'}>{me.write ? '쓰기' : '읽기'}</span>
          </button>
        ))}
        {others.length > 0 && (
          <>
            <div className="repomenu__hr" />
            <div className="repomenu__cap">관리자만 — 이 서버의 레포 {allRepos.length}</div>
            {others.map((r) => (
              <Link key={r.name} className="repomenu__row" to="/console/repos" style={{ opacity: 0.7 }} onClick={onClose}>
                <b>{r.name}</b>
                <span>{r.title || ''} · 볼 수 있는 사람 {r.users?.length ?? 0}</span>
                <span className="chip chip--off">콘솔에서 할당 →</span>
              </Link>
            ))}
          </>
        )}
        {me.admin && (
          <>
            <div className="repomenu__hr" />
            <Link className="repomenu__row" to="/console/repos" onClick={onClose}>
              <b>콘솔 › 지식 레포</b>
              <span>세우기 · clone · 접근</span>
            </Link>
          </>
        )}
      </div>
    </>
  )
}
