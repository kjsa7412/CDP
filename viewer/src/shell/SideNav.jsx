// 왼쪽 메뉴 — **메뉴는 한 겹이다**(좌측 메뉴 셸 설계 v0.1 · 개편안 §7.2). 전에는 상단 바의 얼굴 스위처(설명서 · 레포 ▾ · 콘솔) ·
// 레포 세그(문서 · 그래프 · 관리) · 관리와 콘솔 안쪽의 왼쪽 메뉴 둘 — 「어디로 가나」 를 세 군데서 골랐다.
//
//   ┌ C CDP              « ┐  접기 · 펴기(⌘B / Ctrl B) — 사람마다 · 브라우저마다 기억(`cdp.nav`)
//   │ [레포 ▾]             │  레포 고르기(옛 상단 「레포 ▾」 메뉴 그대로)
//   │ [보기|작업실|서버]   │  영역 스위치 — 고를 수 있는 영역이 둘 이상일 때만(viewer 는 없다 · 지식 생성 · 작업실 검토 G1)
//   │ 지금 영역의 묶음      │  보기 = 지식 · 작업실 = 만든다 · 정리한다 · 세운다 · 서버 = 서버 — 항목마다 need(V18)
//   │ 설명서 · 내 계정      │
//   └──────────────────────┘
//
// 셸이 **한 번** 그린다 — 레포 ↔ 콘솔을 오가도 다시 마운트되지 않는다. 접힘은 `<html data-nav>` 하나 — index.html 의 인라인
// 스크립트가 첫 페인트 전에 붙였다(232 → 56 튐 없음). ≤760px 에서는 숨고 상단 ☰ 가 덮개로 연다(app.css).

import { useEffect, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { Link } from '../lib/router.jsx'
import { admin, gotoRepo, repoApi } from '../lib/api.js'
import { load, useResource } from '../lib/cache.js'
import { kbd } from '../lib/keys.js'
import { can } from '../lib/roles.js'
import { navGroups, navAreas, areaNow, areaHome } from './nav.js'
import AccountMenu from './AccountMenu.jsx'

const NAV_KEY = 'cdp.nav'

// 접힘 — 펼침(232) · 접힘(56). 기억에 실패해도(사생활 창) 화면은 그린다
export function readRail() {
  return typeof document !== 'undefined' && document.documentElement.dataset.nav === 'rail'
}
export function setRail(rail) {
  document.documentElement.dataset.nav = rail ? 'rail' : 'open'
  try {
    localStorage.setItem(NAV_KEY, rail ? 'rail' : 'open')
  } catch {}
}

// 배지 — 큐레이션 대기 수. 레포 얼굴은 `/api/<레포>/repo` 의 curation(App 이 이미 읽는 캐시 · 같은 키), 콘솔은 `/admin/repos` 의
// 그 레포 행. **없으면 그리지 않는다**(옛 서버). 창 초점이 돌아오고 60초가 지났으면 다시 읽는다(개편안 §7.2)
function useQueue(face, repo, me) {
  const repoKey = face === 'repo' && repo ? 'api:' + repo + '/repo' : null
  const fetchRepo = () => repoApi(repo).repo()
  const { data: info } = useResource(repoKey, fetchRepo, { ttl: 60_000, enabled: !!repoKey })
  const adminOn = face === 'console' && !!me?.admin
  const { data: rows } = useResource(adminOn ? '/admin/repos' : null, admin.repos, { ttl: 60_000, enabled: adminOn })
  useEffect(() => {
    const f = () => {
      if (repoKey) load(repoKey, fetchRepo, { ttl: 60_000 }).catch(() => {})
      if (adminOn) load('/admin/repos', admin.repos, { ttl: 60_000 }).catch(() => {})
    }
    window.addEventListener('focus', f)
    return () => window.removeEventListener('focus', f)
  }, [repoKey, adminOn])
  const cur = face === 'console' ? (rows?.repos || []).find((r) => r.name === repo)?.curation : info?.curation
  return typeof cur?.queue === 'number' ? cur.queue : null
}

// 영역마다 마지막으로 본 주소 — 스위치를 누르면 그 자리로 돌아간다(처음이면 `areaHome`). 레포 영역은 레포마다.
// 탭 하나의 기억이다 — 새로고침하면 영역의 첫 주소부터(주소가 상태다 · 기억은 편의일 뿐)
const lastAt = new Map()
const lastKey = (area, repo) => (area === 'server' ? 'server' : area + ':' + (repo || ''))

export default function SideNav({ face, me, info, repo, item, rail, onRail, onNavigate, onLogout }) {
  const area = areaNow(face, item)
  const groups = navGroups({ face, me, repo, area })
  const areas = navAreas({ face, me, repo })
  // 지금 주소를 그 영역의 마지막 주소로 — 없는 주소(item 없음)는 기억하지 않는다
  useEffect(() => {
    if (item && typeof window !== 'undefined') lastAt.set(lastKey(area, repo), window.location.pathname + window.location.search)
  }, [item, area, repo])
  const areaTo = (a) => lastAt.get(lastKey(a, repo)) || areaHome(a, { me, repo })
  const queue = useQueue(face, repo, me)
  const badgeOf = (it) => (it.badge === 'queue' && queue > 0 ? queue : null)

  return (
    <aside className="snav" aria-label="메뉴">
      <div className="snav__top">
        <Link to="/" className="snav__brand" title="CDP — 소개" onClick={onNavigate}>
          <span className="topbar__mark" aria-hidden="true">
            C
          </span>
          <span className="snav__t">CDP</span>
        </Link>
        <button
          type="button"
          className="iconbtn snav__fold"
          onClick={onRail}
          aria-label={rail ? '메뉴 펴기' : '메뉴 접기'}
          title={`${rail ? '메뉴 펴기' : '메뉴 접기'} (${kbd('⌘B')})`}
        >
          <Icon name={rail ? 'panelExpand' : 'panelCollapse'} size={16} />
        </button>
      </div>

      <RepoPicker face={face} me={me} repo={repo} onNavigate={onNavigate} />

      {areas.length > 1 && (
        <nav className="snav__areas" aria-label="영역">
          {areas.map((a) => (
            <Link
              key={a.key}
              to={areaTo(a.key)}
              className="snav__area"
              aria-current={a.key === area ? 'true' : undefined}
              title={rail ? a.label : undefined}
              onClick={onNavigate}
              data-area={a.key}
            >
              {rail ? a.label.slice(0, 1) : a.label}
            </Link>
          ))}
        </nav>
      )}

      <nav className="snav__nav" aria-label="화면">
        {groups.map((g) => {
          // 「이 묶음은 아무나 보는 것이 아니다」 — 서버(admin) · 큐레이션(큐레이터)에만 작은 표시
          const mark = g.items.every((it) => it.need === 'admin') ? 'admin' : g.items.every((it) => it.need === 'curate') ? '큐레이터' : null
          return (
            <div className="snav__grp" key={g.key}>
              <div className="snav__g">
                {g.label}
                {mark && <em>{mark}</em>}
              </div>
              {g.items.map((it) => {
                const n = badgeOf(it)
                const to = it.scope === 'server' ? it.to() : it.to(repo)
                return (
                  <Link
                    key={it.key}
                    to={to}
                    className="snav__i"
                    aria-current={item?.key === it.key ? 'page' : undefined}
                    aria-label={n ? `${it.label} — 대기 ${n}` : it.label}
                    title={rail ? (n ? `${it.label} — 대기 ${n}` : it.label) : undefined}
                    onClick={onNavigate}
                  >
                    <Icon name={it.icon} size={17} />
                    <span className="snav__t">{it.label}</span>
                    {n ? (
                      <span className="snav__b" aria-hidden="true">
                        {n}
                      </span>
                    ) : null}
                  </Link>
                )
              })}
            </div>
          )
        })}
      </nav>

      <div className="snav__foot">
        <Link to="/manual" className="snav__i" aria-label="설명서" title={rail ? '설명서' : undefined} onClick={onNavigate}>
          <Icon name="book" size={17} />
          <span className="snav__t">설명서</span>
        </Link>
        {me && <AccountMenu me={me} info={info} repo={repo} onLogout={onLogout} />}
      </div>
    </aside>
  )
}

// 레포 고르기 — 옛 상단 「레포 ▾」 메뉴를 그대로 옮겼다. **항상 메뉴다**(하나여도 · 제품관리서비스 검토 §4.8).
function RepoPicker({ face, me, repo, onNavigate }) {
  const [open, setOpen] = useState(false)
  // 얼굴 · 레포가 바뀌면 닫는다 — 이 부품은 살아남으므로 스스로 닫아야 한다
  useEffect(() => setOpen(false), [face, repo])

  if (!me) return null
  const label = repo || '레포 고르기'
  return (
    <div className="snav__repo">
      <button
        type="button"
        className="snav__repobtn"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={repo ? `레포 — ${repo} · 바꾸기` : '레포 고르기'}
        aria-label={repo ? `레포 ${repo} — 바꾸기` : '레포 고르기'}
      >
        <span className="snav__rk" aria-hidden="true">
          {(repo || '·').slice(0, 2)}
        </span>
        <span className="snav__rn">{label}</span>
        <Icon name="chevronDown" size={13} className="snav__t" />
      </button>
      {open && <RepoMenu me={me} repo={face === 'repo' ? repo : null} onClose={() => setOpen(false)} onNavigate={onNavigate} />}
    </div>
  )
}

// 레포 메뉴 — 행마다 이름 · 제목 · 권한 칩. 관리자에게는 「이 서버의 레포」 절이 더 붙어 권한 밖 레포가 회색으로 보인다(검토 v0.1 D6)
function RepoMenu({ me, repo, onClose, onNavigate }) {
  const { data } = useResource('/admin/repos', admin.repos, { enabled: !!me.admin, ttl: 60_000 })
  const allRepos = data?.repos || []
  const mine = me.repos || []
  const others = me.admin ? allRepos.filter((r) => !mine.some((m) => m.name === r.name)) : []
  const go = (name) => {
    onClose()
    onNavigate?.()
    if (name !== repo) gotoRepo(name)
  }
  return (
    <>
      <div className="scrim" onMouseDown={onClose} />
      <div className="repomenu" role="menu">
        <div className="repomenu__cap">볼 수 있는 레포 {mine.length}</div>
        {mine.map((r) => {
          const w = can(me, 'write', r.name)
          return (
            <button key={r.name} className="repomenu__row" role="menuitem" aria-current={r.name === repo} onClick={() => go(r.name)}>
              <b>{r.name}</b>
              <span>{r.title || ''}</span>
              <span className={w ? 'chip' : 'chip chip--off'}>{w ? '쓰기' : '읽기'}</span>
            </button>
          )
        })}
        {others.length > 0 && (
          <>
            <div className="repomenu__hr" />
            <div className="repomenu__cap">관리자만 — 이 서버의 레포 {allRepos.length}</div>
            {others.map((r) => (
              <Link key={r.name} className="repomenu__row" to="/console/repos" style={{ opacity: 0.7 }} onClick={() => (onClose(), onNavigate?.())}>
                <b>{r.name}</b>
                <span>
                  {r.title || ''} · 볼 수 있는 사람 {r.users?.length ?? 0}
                </span>
                <span className="chip chip--off">서버에서 할당 →</span>
              </Link>
            ))}
          </>
        )}
        {me.admin && (
          <>
            <div className="repomenu__hr" />
            <Link className="repomenu__row" to="/console/repos" onClick={() => (onClose(), onNavigate?.())}>
              <b>서버 › 지식 레포</b>
              <span>세우기 · clone · 접근</span>
            </Link>
          </>
        )}
      </div>
    </>
  )
}
