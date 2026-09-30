// 화면 — 실사용 화면 14장을 얼굴별로. 확대는 `?shot=<id>` 로 남아 공유된다(제작 검토 v0.1 §5.2).

import { useRoute, useNavigate } from '../router.jsx'
import Shot from '../components/Shot.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { GROUPS, SHOTS, shotById } from '../data/screens.js'

const ROLE = { admin: 'admin', writer: 'writer', viewer: 'viewer' }

export default function Screens() {
  const route = useRoute()
  const navigate = useNavigate()
  const open = route.query.get('shot')
  const go = (id) => navigate('/screens' + (id ? '?shot=' + id : ''), { replace: !!open, keepScroll: true })
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>화면</h1>
        <p className="st-lead">
          판 <span className="amono">v{__CDP_VERSION__}</span> 의 서버를 그대로 띄우고 <b>가상 프로젝트</b>(도서관 대출 관리 시스템 개편)로 채운 지식 레포를 붙여 찍었다. 목업이 아니다 — 화면은 진짜이고, 내용만 가상이다. 사람은{' '}
          <span className="amono">lead</span>(admin) · <span className="amono">dev.a</span>(writer) · <span className="amono">dev.b</span>(viewer) 셋이다.
        </p>
      </header>
      {GROUPS.map((g) => (
        <section key={g.key} className="st-sec">
          <h2>{g.title}</h2>
          <p className="st-p">{g.lead}</p>
          <div className="shots">
            {SHOTS.filter((s) => s.group === g.key).map((s) => (
              <article key={s.id} className="shots__item">
                <Shot id={s.id} onOpen={go} caption={false} />
                <div className="shots__txt">
                  <h3>
                    {s.title} {s.role && <span className="pl__role">{ROLE[s.role]}</span>}
                  </h3>
                  <p>{s.desc}</p>
                  <ul>
                    {s.points.map((p) => (
                      <li key={p}>{p}</li>
                    ))}
                  </ul>
                </div>
              </article>
            ))}
          </div>
        </section>
      ))}
      {open && shotById[open] && <Lightbox id={open} onGo={go} onClose={() => go(null)} />}
    </div>
  )
}
