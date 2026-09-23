// `/r` — 볼 수 있는 레포가 없을 때. MCP 설계서 §6.6.1 · 제품관리서비스 검토 §4.2.
//
// 토큰은 맞으므로 401 로 돌려보내지 않는다. 레포가 있으면 서버가 이미 첫 레포로 보냈다 —
// 여기 왔다는 것은 없다는 뜻이다. 다만 방금 세운 레포가 있을 수 있어 `/me` 를 한 번 더 본다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { Link } from '../lib/router.jsx'

export default function NoRepo() {
  const [me, setMe] = useState(null)
  useEffect(() => {
    api
      .me()
      .then((m) => {
        if (m?.repos?.length) location.href = '/r/' + encodeURIComponent(m.repos[0].name) + '/'
        else setMe(m)
      })
      .catch(() => setMe({}))
  }, [])
  if (!me) return <div className="empty-page"><span className="amuted">확인 중…</span></div>
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
                <Link className="btn btn--sm" to="/manual/관리자_설명서">설명서 · 관리자 3.4</Link>
              </div>
            </>
          ) : (
            <>
              <div className="anote">
                계정에 아직 레포 권한이 없습니다. <b>관리자</b>에게 레포 할당을 요청합니다 — 권한은 사람에 붙어 있어 토큰을 다시 받을 필요는 없습니다.
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 10 }}>
                <Link className="btn btn--sm" to="/manual/사용자_설명서">설명서 · 사용자</Link>
                <a className="btn btn--sm" href="/logout">로그아웃</a>
              </div>
            </>
          )}
        </div>
      </section>
    </div>
  )
}
