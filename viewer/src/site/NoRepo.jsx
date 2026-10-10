// `/r` — 볼 수 있는 레포가 없을 때 · 열 수 없는 레포 주소로 왔을 때. MCP 설계서 §6.6.1 · 제품관리서비스 검토 §4.2 ·
// 화면 UX 검토 v0.1 §5.3.
//
// 토큰은 맞으므로 401 로 돌려보내지 않는다. 직접 진입이면 서버가 이미 첫 레포로 보냈다(302) — 여기 왔다는 것은
// 없다는 뜻이거나, `?from=<이름>` 을 들고 왔다는 뜻이거나, 화면 안에서 `/r` 로 온 것이다(그때는 여기서 고른다 —
// 마지막에 보던 레포, 없으면 첫 레포 · 화면 · 권한 검토 v0.1 R7). `?from=` 은 서버가 **없는 레포와 권한 밖 레포를
// 같은 길**로 보낸 것이다(D4 · §4.6 — 존재를 알리지 않는다). 그래서 문장도 하나다: "없거나 이 계정에 할당되지 않았다".
// 전에는 말없이 첫 레포로 갔다 — 동료가 준 링크가 왜 다른 곳에서 열렸는지 알 길이 없었다(P5).
// 볼 레포가 없는 빈 상태는 「시작하기」 다(제품화 2 ⑥) — admin 이면 서버가 「지식 레포가 없다 → 새 레포」 를 내고, 아니면 한 문장.

import { useEffect } from 'react'
import { lastRepo, rememberRepo } from '../lib/api.js'
import { Link, navigate, useTitle } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import Icon from '../components/Icon.jsx'
import Start from '../components/Start.jsx'

export default function NoRepo({ from = null }) {
  const s = useSession()
  const me = s.me
  useTitle('레포 · CDP')
  const repos = me?.repos || []
  useEffect(() => {
    // 기억해 둔 레포가 이제 볼 수 없는 것이면 잊는다 — 「레포」 탭이 또 여기로 오지 않게
    if (from && lastRepo() === from) rememberRepo(repos[0]?.name || null)
    if (!from && repos.length) {
      const last = lastRepo()
      const go = repos.find((r) => r.name === last) || repos[0]
      navigate('/r/' + encodeURIComponent(go.name) + '/', { replace: true })
    }
    // 세션이 없으면 로그인으로(보던 곳을 들고) — 직접 진입은 서버가 이미 보냈고, 화면 안에서는 여기서
    // 주소가 아직 `/r` 일 때만 — 로그아웃 직후 남은 렌더가 소개를 로그인으로 덮어쓰지 않게(Console.jsx 와 같은 이유)
    if (!me && location.pathname === '/r') navigate('/login?next=' + encodeURIComponent('/r' + (from ? '?from=' + encodeURIComponent(from) : '')), { replace: true })
  }, [from, me, repos])
  if (!me) return null
  if (!from && repos.length) return null

  if (from) {
    return (
      <div className="empty-page">
        <section className="acard">
          <div className="acard__head">
            <span className="acard__title">그 주소의 레포는 열 수 없습니다</span>
            <span className="acard__hint amono">/r/{from}/</span>
          </div>
          <div className="acard__body">
            <div className="arow">
              <span className="arow__label">계정</span>
              <span className="arow__value">
                <b>{me.user}</b> {me.role && <span className="who__role">{me.role}</span>}
              </span>
            </div>
            <div className="anote">
              없거나 이 계정에 할당되지 않은 레포다.{repos.length ? '' : ' 볼 수 있는 레포가 아직 없다 — 관리자에게 할당을 요청한다.'}
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {repos.map((r, i) => (
                <Link key={r.name} className={i === 0 ? 'btn btn--accent btn--sm' : 'btn btn--sm'} to={'/r/' + encodeURIComponent(r.name) + '/'}>
                  {r.name} 열기 {i === 0 && <Icon name="arrowRight" size={13} />}
                </Link>
              ))}
              {me.admin && (
                <Link className="btn btn--sm" to="/console/repos">서버 › 지식 레포</Link>
              )}
            </div>
          </div>
        </section>
      </div>
    )
  }

  return (
    <div className="empty-page">
      <section className="acard">
        <div className="acard__head">
          <span className="acard__title">볼 수 있는 지식 레포가 없습니다</span>
        </div>
        <div className="acard__body">
          <div className="arow">
            <span className="arow__label">계정</span>
            <span className="arow__value">
              <b>{me.user}</b> {me.role && <span className="who__role">{me.role}</span>}
            </span>
          </div>
          {me.admin ? (
            <Start empty={<div className="anote">이 계정에 할당된 레포가 없다 — 서버 › 사람에서 자기에게 연다.</div>} />
          ) : (
            <div className="anote">계정에 아직 레포 권한이 없다 — 관리자에게 할당을 요청한다.</div>
          )}
        </div>
      </section>
    </div>
  )
}
