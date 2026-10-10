// 화면 — 실사용 화면 17장을 묶음별로(v1.2 — 화면 16 · 메뉴 admin 11 · 큐레이터 7 · writer · viewer 5). 확대는 `?shot=<id>` 로 남아 공유된다(제작 검토 v0.1 §5.2).
// 그림은 찍은 판(shots.json)의 것이다 — 판을 올리고 화면이 바뀌면 `npm run site:demo` 로 다시 찍는다.

import { Link, useRoute, useNavigate } from '../router.jsx'
import Shot from '../components/Shot.jsx'
import Lightbox from '../components/Lightbox.jsx'
import { GROUPS, SHOTS, shotById } from '../data/screens.js'
import shots from '../data/shots.json'

const ROLE = { admin: 'admin', writer: 'writer', viewer: 'viewer', curator: '큐레이터' }

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
          판 <span className="amono">v{shots.version}</span> 의 서버를 그대로 띄우고 <b>가상 프로젝트</b>(도서관 대출 관리 시스템 개편)로 채운 지식 레포를 붙여 찍었다. 목업이 아니다 — 화면은 진짜이고, 내용만 가상이다. {shots.captured} 에 찍었다.
          레포는 빈 틀로 세웠고, 관리 문서는 큐레이터가 서식집에서 세웠고, 작업 기록 · 큐레이션은 전부 <code>save</code> 로 넣었다. 대기 몇 건은 일부러 남겼고, 작업 레포 셋을 대장에 올려 최신 · 낡음 · 미설치가 보이게 했다.
        </p>
        <p className="st-lead">
          사람은 넷이다 — <span className="amono">lead</span>(admin · 모든 레포의 큐레이터) · <span className="amono">doc.c</span>(writer · library 의 큐레이터) ·{' '}
          <span className="amono">dev.a</span>(writer · library-ops 의 큐레이터) · <span className="amono">dev.b</span>(viewer). 그림마다 누가 보는 화면인지 딱지를 달았다. 무엇을 보는지는{' '}
          <Link to="/concept#pending">개념 › 미반영</Link> 과 <Link to="/concept#curation">큐레이션</Link>.
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
