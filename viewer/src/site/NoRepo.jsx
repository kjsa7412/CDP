// `/r` — 볼 수 있는 레포가 없을 때 · 열 수 없는 레포 주소로 왔을 때. MCP 설계서 §6.6.1 · 제품관리서비스 검토 §4.2 ·
// 화면 UX 검토 v0.1 §5.3.
//
// 토큰은 맞으므로 401 로 돌려보내지 않는다. 레포가 있으면 서버가 이미 첫 레포로 보냈다 — 여기 왔다는 것은
// 없다는 뜻이거나, `?from=<이름>` 을 들고 왔다는 뜻이다. 후자는 서버가 **없는 레포와 권한 밖 레포를 같은 길**로
// 보낸 것이다(D4 · §4.6 — 존재를 알리지 않는다). 그래서 문장도 하나다: "없거나 이 계정에 할당되지 않았다".
// 전에는 말없이 첫 레포로 갔다 — 동료가 준 링크가 왜 다른 곳에서 열렸는지 알 길이 없었다(P5).

import { useEffect, useState } from 'react'
import { api, lastRepo, rememberRepo } from '../lib/api.js'
import { Link, useTitle } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'

export default function NoRepo({ from = null }) {
  const [me, setMe] = useState(null)
  useTitle('레포 · CDP')
  useEffect(() => {
    api
      .me()
      .then((m) => {
        const repos = m?.repos || []
        // 기억해 둔 레포가 이제 볼 수 없는 것이면 잊는다 — 「레포」 탭이 또 여기로 오지 않게
        if (from && lastRepo() === from) rememberRepo(repos[0]?.name || null)
        if (!from && repos.length) {
          const last = lastRepo()
          const go = repos.find((r) => r.name === last) || repos[0]
          location.href = '/r/' + encodeURIComponent(go.name) + '/'
          return
        }
        setMe(m || {})
      })
      .catch(() => setMe({}))
  }, [from])
  if (!me) return <div className="empty-page"><span className="amuted">확인 중…</span></div>
  const repos = me.repos || []

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
              없거나 이 계정에 할당되지 않은 레포입니다 — 둘을 가르지 않습니다.
              {repos.length ? ' 볼 수 있는 레포는 아래와 같습니다.' : ' 이 계정이 볼 수 있는 레포가 아직 없습니다.'}{' '}
              필요하면 <b>관리자</b>에게 할당을 요청합니다 — 권한은 사람에 붙어 있어 토큰을 다시 받을 필요는 없습니다.
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
              {repos.map((r, i) => (
                <a key={r.name} className={i === 0 ? 'btn btn--accent btn--sm' : 'btn btn--sm'} href={'/r/' + encodeURIComponent(r.name) + '/'}>
                  {r.name} 열기 {i === 0 && <Icon name="arrowRight" size={13} />}
                </a>
              ))}
              {me.admin && (
                <a className="btn btn--sm" href="/console/repos">콘솔 › 지식 레포</a>
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
            <>
              <div className="anote">
                이 서버에 아직 지식 레포가 없거나 이 계정에 할당되지 않았습니다. <b>콘솔 &gt; 지식 레포</b>에서 패키지로 세우거나 origin 에서 받아 옵니다.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <a className="btn btn--accent btn--sm" href="/console/repos">콘솔 › 지식 레포 →</a>
                <Link className="btn btn--sm" to="/manual/관리자_설명서">설명서 › 관리자 3.4</Link>
              </div>
            </>
          ) : (
            <>
              <div className="anote">
                계정에 아직 레포 권한이 없습니다. <b>관리자</b>에게 레포 할당을 요청합니다 — 권한은 사람에 붙어 있어 토큰을 다시 받을 필요는 없습니다.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Link className="btn btn--sm" to="/manual/사용자_설명서">설명서 › 사용자</Link>
                <a className="btn btn--sm" href="/logout">로그아웃</a>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
