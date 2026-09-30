// 홈 — 무엇인가 · 세 가지 · 한 번 보기 · 두 배치 · 더 보기(제작 검토 v0.1 §3.1).
// **광고 문구를 쓰지 않는다** — 제품의 말(좌표 · 두 층 · 검사) 그대로, 처음 나올 때 한 줄로 풀어 준다.

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
            <div className="hero__eyebrow">CDP · 맥락 배포 프로토콜 — 지식 레포 뷰어 · 도구 · MCP 서버</div>
            <h1 tabIndex={-1}>
              좌표로 찾고
              <br />
              사람이 본문을 읽는다
            </h1>
            <p className="hero__lead">
              프로젝트 지식을 <b>작업 기록(사건)</b>과 <b>관리 문서(상태)</b> 두 층으로 git 레포 하나에 두고, <b>좌표</b>로 잇고, 커밋할 때 <b>검사</b>한다.
              문서 갱신을 빠뜨린 기록은 커밋되지 않는다 — 그래서 「나중에 정리할 문서」 가 쌓이지 않는다.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--accent" to="/screens">
                화면 보기 <Icon name="arrowRight" size={14} />
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
                <b>work/</b> 는 사건 — 왜 그렇게 정했나, 고치지 않는다. <b>docs/</b> 는 상태 — 지금 어떻게 생겼나, 고친다. 좌표가 둘을 잇는다.
              </p>
            </div>
            <div className="fcard">
              <Icon name="check" size={20} />
              <h3>검사</h3>
              <p>
                좌표를 건드린 기록은 그 정본 섹션을 채워야 커밋된다. 서버형은 <code>save</code> 가, 로컬형은 git 훅이 <b>같은 계산</b>으로 막는다.
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
          <h2 className="sec__cap">두 배치</h2>
          <div className="cards2">
            <div className="fcard">
              <Icon name="server" size={20} />
              <h3>서버형 — 팀이 한 서버에</h3>
              <p>지식 레포는 서버에 있다. 서버가 유일한 작성자다. 사람은 토큰 하나로 브라우저와 에이전트에서 같이 붙는다.</p>
              <ul>
                <li>HTTP MCP + 토큰 · 작업 레포에는 설정 한 줄</li>
                <li><code>save</code> 가 검사 · 커밋 · origin 미러</li>
                <li>콘솔에서 사람 · 토큰 · 레포 · 서버를 관리</li>
              </ul>
            </div>
            <div className="fcard">
              <Icon name="folder" size={20} />
              <h3>로컬형 — 폐쇄망 PC</h3>
              <p>
                사람마다 clone 한다. 원격이 정본이다. <code>cdp.exe</code> 하나로 화면과 도구가 돈다 — Node 가 없어도 된다.
              </p>
              <ul>
                <li>stdio MCP · git 훅이 검사</li>
                <li>배포본 zip 한 개를 반입</li>
                <li>서버가 그 레포를 미러해 브라우저로 보일 수도 있다</li>
              </ul>
            </div>
          </div>
        </section>

        <section className="sec">
          <h2 className="sec__cap">더 보기</h2>
          <div className="cards3 st-more-cards">
            <More to="/concept" icon="section" title="개념" text="두 층 · 좌표 · 어휘와 등록부 · 파생 누락 · 정정. 「밀림」 이 없는 이유." />
            <More to="/screens" icon="image" title="화면 14장" text="레포 · 콘솔 · 사이트 · 설명서. 판 v0.19 를 데모 레포로 찍었다." />
            <More to="/examples" icon="work" title="예제 다섯" text="찾기 · 기록 · 거절 · 충돌 · 정정 — 녹화한 요청과 응답." />
            <More to="/agent" icon="plug" title="에이전트" text="도구 13 · 스킬 7 · MCP 가 도는 길 열두 걸음." />
            <More to="/deploy" icon="server" title="배치 · 설치" text="서버형 · 로컬형 · 설치 5단계 · 무엇이 PC 를 떠나나." />
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
