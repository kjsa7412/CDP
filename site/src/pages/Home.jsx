// 홈 — 무엇인가 · 세 가지 · 한 번 보기 · 서버 하나 · 더 보기(제작 검토 v0.1 §3.1 · v1.0 개편안).
// **광고 문구를 쓰지 않는다** — 제품의 말(좌표 · 두 층 · 큐레이션) 그대로, 처음 나올 때 한 줄로 풀어 준다.

import Icon from '../../../viewer/src/components/Icon.jsx'
import { Link, useNavigate } from '../router.jsx'
import Shot from '../components/Shot.jsx'
import Player from '../components/Player.jsx'
import { exampleBySlug } from '../data/examples.js'

export default function Home() {
  const navigate = useNavigate()
  const ex = exampleBySlug.find
  return (
    <>
      <div className="wrap">
        <section className="hero st-hero">
          <div>
            <div className="hero__eyebrow">CDP · 맥락 배포 프로토콜 — 지식 레포 서버 · MCP · 화면</div>
            <h1 tabIndex={-1}>
              좌표로 찾고
              <br />
              사람이 본문을 읽는다
            </h1>
            <p className="hero__lead">
              프로젝트 지식을 <b>작업 기록(사건)</b>과 <b>관리 문서(상태)</b> 두 층으로 git 레포 하나에 두고, <b>좌표</b>로 잇는다. 일하는 사람은
              작업 기록만 남기고, 레포마다 맡은 <b>큐레이터</b>가 기록을 보고 관리 문서에 반영한다. 아직 반영 안 된 기록은 섹션과 같이 실린다 — 그래서
              늦은 반영이 정보를 잃지 않는다.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--accent" to="/concept">
                개념 보기 <Icon name="arrowRight" size={14} />
              </Link>
              <Link className="btn" to="/examples">
                예제 보기
              </Link>
            </div>
          </div>
          <div className="st-hero__shot">
            <Shot id="01-repo-doc" eager caption={false} onOpen={(id) => navigate('/screens?shot=' + id)} />
          </div>
        </section>

        <section className="sec">
          <h2 className="sec__cap">세 가지</h2>
          <div className="cards3">
            <div className="fcard">
              <Icon name="coord" size={20} />
              <h3>좌표</h3>
              <p>
                <code>테이블정의서:bk_loan_mst</code> 같은 이름표 하나가 사건과 상태를 잇는다. 검색이 「비슷한 것」 을 내는 자리에서 좌표는 <b>그것</b>을 낸다.
              </p>
            </div>
            <div className="fcard">
              <Icon name="managed" size={20} />
              <h3>두 층</h3>
              <p>
                <b>work/</b> 는 사건 — 왜 그렇게 정했나, 고치지 않는다. <b>docs/</b> 는 상태 — 지금 어떻게 생겼나, 큐레이터가 현재형으로 고쳐 쓴다. 좌표가 둘을 잇는다.
              </p>
            </div>
            <div className="fcard">
              <Icon name="check" size={20} />
              <h3>큐레이션</h3>
              <p>
                기록은 대기열에 서고 큐레이터가 판정한다 — <b>반영 · 새 문서 · 기록으로 둠</b>. 판정 전의 기록은 섹션 옆에 <b>「미반영」</b> 으로 같이 보이고, 에이전트가 그 좌표를 불러올 때도 같이 실린다.
              </p>
            </div>
          </div>
        </section>

        <section className="sec">
          <h2 className="sec__cap">한 번 보기 — 이름으로 좌표를 찾는다</h2>
          <p className="st-p">
            에이전트(Claude Code)에게 <q>{ex?.ask}</q> 라고 물었을 때 실제로 오가는 것. 데모 레포에서 녹화했다.
          </p>
          {ex && <Player ex={ex} compact limit={3} />}
          <p className="st-more">
            <Link to="/examples">끝까지 보기 · 예제 다섯 →</Link>
          </p>
        </section>

        <section className="sec">
          <h2 className="sec__cap">서버 하나 — 쓰는 길도 하나</h2>
          <div className="cards2">
            <div className="fcard">
              <Icon name="server" size={20} />
              <h3>팀 서버</h3>
              <p>지식 레포는 서버에 있다. 서버가 유일한 작성자다. 사람은 토큰 하나로 브라우저와 에이전트에서 같이 붙는다.</p>
              <ul>
                <li>세우기 한 줄 — <code>install.sh --admin … --repo …</code></li>
                <li><code>save</code> 가 검사 · 한 커밋 · origin 미러</li>
                <li>작업 레포는 <code>--connect</code> 한 줄 · 할 일은 화면 「시작하기」</li>
              </ul>
            </div>
            <div className="fcard">
              <Icon name="folder" size={20} />
              <h3>개인 서버 — 서버가 없을 때</h3>
              <p>
                같은 서버를 자기 PC 에 띄운다 — <code>ctx up &lt;폴더&gt; --install &lt;코드 폴더&gt;</code> 한 줄. 빈 틀 · 빈 포트 · 토큰 · 연결까지 하고 브라우저를 연다.
              </p>
              <ul>
                <li>같은 코드 · 같은 <code>save</code> · 같은 화면</li>
                <li>혼자 기록하고 혼자 큐레이션한다(<code>--curator</code>)</li>
                <li>새 판은 <code>ctx self-update</code> 한 줄</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="sec">
          <h2 className="sec__cap">더 보기</h2>
          <div className="cards3 st-more-cards">
            <More to="/concept" icon="section" title="개념" text="두 층 · 좌표 · 어휘와 등록부 · 큐레이션과 미반영 · 기준선 · 정정. 쓰는 길은 save 하나." />
            <More to="/screens" icon="image" title="화면 17장" text="읽기 · 큐레이션 · 서버 넷 · 시작하기 · 설명서. 가상 데모 레포를 붙인 진짜 서버를 찍었다." />
            <More to="/examples" icon="work" title="예제 다섯" text="찾기 · 기록 · 미반영 · 큐레이터 둘의 충돌 · 정정 — 녹화한 MCP 요청과 응답." />
            <More to="/agent" icon="plug" title="에이전트" text="역할이 가르는 도구 13 · 스킬 7 · MCP 가 도는 길 열두 걸음." />
            <More to="/deploy" icon="server" title="배치 · 설치" text="한 줄 셋 — 개인 서버 · 팀 서버 · 연결과 갱신. 무엇이 PC 를 떠나나." />
            <More to="/releases" icon="list" title="판 이력" text="v0.2 부터 판마다 무엇이 바뀌었나." />
          </div>
        </section>
      </div>
    </>
  )
}

function More({ to, icon, title, text }) {
  return (
    <Link to={to} className="fcard fcard--link st-card-link">
      <Icon name={icon} size={20} />
      <h3>{title}</h3>
      <p>{text}</p>
      <div className="fcard__foot">보기 →</div>
    </Link>
  )
}
