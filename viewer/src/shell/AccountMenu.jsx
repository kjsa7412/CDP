// 내 계정 — 왼쪽 메뉴 맨 아래(좌측 메뉴 셸 설계 §2 · L6). 매일 가는 곳이 아닌 것들을 여기 모은다.
//
//   누구 · 역할 · 이 레포에서 할 수 있는 것 · 토큰 만료   옛 관리 › 정보(Info)
//   판 · 빌드                                         옛 관리 › 정보
//   테마                                             옛 레포 얼굴의 ⋯ 메뉴 — 얼굴 무관한 값이라 얼굴 안에 둘 것이 아니었다
//   단축키                                           옛 관리 › 정보 · 도움말(?)의 같은 표(`lib/keys.js`)
//   로그아웃                                         옛 상단 바의 ⏻
//
// **값만 낸다. 요청이 없다** — 세션(`/me` · `/site/info`)이 이미 든 것만 그린다. 없는 값은 그리지 않는다(불변조건 7).

import { useEffect, useRef, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { applyTheme, getTheme, logout, rememberRepo, setTheme } from '../lib/api.js'
import { navigate } from '../lib/router.jsx'
import { clearAll } from '../lib/cache.js'
import { can } from '../lib/roles.js'
import { KEYS } from '../lib/keys.js'

const THEMES = [
  ['system', '자동'],
  ['light', '밝게'],
  ['dark', '어둡게'],
]

// 이 레포에서 할 수 있는 것 — 판정은 `can` 하나
export function abilities(me, repo) {
  if (!me) return []
  const out = []
  if (repo && can(me, 'read', repo)) out.push('읽기')
  if (repo && can(me, 'write', repo)) out.push('기록 save · 작업 레포 등록')
  if (repo && can(me, 'curate', repo)) out.push('큐레이션')
  if (can(me, 'admin')) out.push('서버 관리')
  return out
}

export default function AccountMenu({ me, info, repo, onLogout }) {
  const [open, setOpen] = useState(false)
  const [theme, setT] = useState(getTheme)
  const boxRef = useRef(null)

  useEffect(() => {
    if (!open) return
    setT(getTheme())
    const off = (e) => !boxRef.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  const pickTheme = (t) => {
    setTheme(t)
    applyTheme(t)
    setT(t)
  }

  const doLogout = async () => {
    setOpen(false)
    await logout()
    clearAll()
    rememberRepo(null)
    onLogout?.()
    navigate('/')
  }

  const days = me?.expiresInDays
  const soon = typeof days === 'number' && days <= 7
  // 소스에서 띄운 서버는 번들 시각이 자리표시(`__CTX_BUILT__`)다 — 없는 값을 그리지 않는다
  const built = info?.built && !/^__/.test(info.built) ? info.built : null
  const can_ = abilities(me, repo)

  return (
    <div className="snav__acct" ref={boxRef}>
      <button
        type="button"
        className="snav__me"
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        title={`내 계정 — ${me.user} · ${me.role || ''}`}
        aria-label={`내 계정 — ${me.user}`}
      >
        <span className="snav__av" aria-hidden="true">
          {String(me.user || '?').slice(0, 1)}
        </span>
        <span className="snav__t snav__who">
          <b>{me.user}</b>
          <span>{me.role}</span>
        </span>
        {soon && <span className="snav__warn" title={`토큰 만료 D-${days}`}><Icon name="warn" size={13} /></span>}
        <Icon name="more" size={15} className="snav__t snav__more" />
      </button>

      {open && (
        <div className="acct" role="dialog" aria-label="내 계정">
          <div className="acct__head">
            <span className="snav__av" aria-hidden="true">
              {String(me.user || '?').slice(0, 1)}
            </span>
            <span className="acct__name">
              <b>{me.user}</b>
              {me.label && <span className="amuted"> · {me.label}</span>}
            </span>
            <span className="who__role">{me.role}</span>
          </div>

          <dl className="acct__rows">
            {repo && can_.length > 0 && (
              <div>
                <dt>{repo} 에서</dt>
                <dd>{can_.join(' · ')}</dd>
              </div>
            )}
            {/* 로그인한 그 토큰의 만료 — 모르면(옛 쿠키) 모른다고 말한다. 무기한과 모름을 섞지 않는다. 임박(≤7)만 소리를 낸다 */}
            <div>
              <dt>토큰 만료</dt>
              <dd className={soon ? 'awarn' : undefined}>
                {typeof days === 'number' ? (
                  <>
                    D-<b className="num">{days}</b> · {me.tokenExpires}
                    {soon ? ' — 관리자에게 재발급을 받는다' : ''}
                  </>
                ) : me.tokenExpires === 'never' ? (
                  '무기한'
                ) : (
                  '이 세션에서는 모른다 — 다시 로그인하면 보인다'
                )}
              </dd>
            </div>
            {(me.version || built) && (
              <div>
                <dt>판</dt>
                <dd>
                  {me.version ? <span className="amono">v{me.version}</span> : null}
                  {built ? <span className="amuted"> · 빌드 {built}</span> : null}
                </dd>
              </div>
            )}
          </dl>

          <div className="menu__cap">테마</div>
          <div className="menu__seg">
            <div className="seg">
              {THEMES.map(([t, l]) => (
                <button key={t} type="button" aria-pressed={theme === t} onClick={() => pickTheme(t)}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          <details className="acct__keys">
            <summary>단축키</summary>
            <dl className="help__keys">
              {KEYS.map(([keys, what]) => (
                <div className="help__row" key={what}>
                  <dt>
                    {keys.map((k) => (
                      <span className="kbd" key={k}>
                        {k}
                      </span>
                    ))}
                  </dt>
                  <dd>{what}</dd>
                </div>
              ))}
            </dl>
          </details>

          <div className="menu__hr" />
          <button type="button" className="menu__row" onClick={doLogout}>
            <span className="menu__ico">
              <Icon name="power" size={14} />
            </span>
            로그아웃
          </button>
          <p className="acct__note">권한은 사람에 붙어 있다 — 역할 · 레포 할당이 바뀌면 토큰을 다시 받지 않아도 다음 요청부터 먹는다.</p>
        </div>
      )}
    </div>
  )
}
