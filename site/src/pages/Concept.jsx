// 개념 — 시스템 설계서 제0 · 1부를 설치 전 사람의 말로. 예시는 전부 데모 레포에서 녹화한 파일이다(예제 JSON 의 files).

import { Link } from '../router.jsx'
import Code from '../components/Code.jsx'
import { exampleBySlug } from '../data/examples.js'
import fig1 from '../../../docs/그림/1_세_레포_구조.svg?url'

const TOC = [
  ['layers', '두 층 — 사건과 상태'],
  ['coord', '좌표 — 바꾼 것에만'],
  ['vocab', '어휘와 등록부'],
  ['derive', '파생 — 밀린 문서가 없는 이유'],
  ['supersede', '정정 — 고치지 않고 대신한다'],
  ['nostate', '상태는 없다'],
]

const MANAGED = `| 좌표 패턴 | 관리 문서 | 섹션 |
|---|---|---|
| \`화면설계서:*\` | \`docs/2.개발/DE_331_화면설계서.md\` | \`## {값}\` |
| \`테이블정의서:*\` | \`docs/2.개발/DE_431_테이블정의서.md\` | \`## {값}\` |
| \`도메인용어:*\` | \`docs/2.개발/DE_421_DB도메인용어정의서.md\` | \`### {값}\` |
| \`코드정의서:*\` | \`docs/2.개발/DE_441_코드정의서.md\` | \`## {값}\` |`

const VOCAB = `## 화면설계서

- \`화면설계서:LN010\` — 대출 등록
  aliases: 대출등록, 대출 화면, 대출 등록 화면
- \`화면설계서:LN030\` — 연체 현황
  aliases: 연체현황, 연체 목록, 연체자 조회`

export default function Concept() {
  const save = exampleBySlug.save
  const sup = exampleBySlug.supersede
  const blocked = exampleBySlug.blocked
  const cli = blocked?.steps.find((s) => s.kind === 'cli')
  return (
    <div className="wrap st-page st-doc">
      <header className="st-head">
        <h1 tabIndex={-1}>개념</h1>
        <p className="st-lead">
          CDP 는 프로젝트의 지식을 git 레포 하나 — <b>지식 레포</b> — 에 둔다. 규칙은 몇 개 되지 않는다. 그 규칙들이 「문서가 코드를 못 따라간다」 는 흔한 사정을 구조로 막는다.
        </p>
        <nav className="st-toc" aria-label="이 페이지">
          {TOC.map(([id, t]) => (
            <a key={id} href={'#' + id}>
              {t}
            </a>
          ))}
        </nav>
      </header>

      <section id="layers" className="st-sec">
        <h2>두 층 — 사건과 상태</h2>
        <div className="st-two">
          <div>
            <p>
              <b>
                <code>work/</code> 작업 기록
              </b>{' '}
              — 사건이다. 무엇을 왜 그렇게 정했나. 한 번 쓰면 고치지 않는다. 파일 하나가 작업 하나다.
            </p>
            <p>
              <b>
                <code>docs/</code> 관리 문서
              </b>{' '}
              — 상태다. 테이블 · 화면 · 코드 · 용어가 <b>지금</b> 어떻게 생겼나. 팀이 하나로 관리하는 산출물이고, 섹션 하나가 대상 하나다.
            </p>
            <p>
              둘을 따로 두는 까닭은 묻는 말이 다르기 때문이다. 「지금 이 테이블에 무슨 컬럼이 있나」 는 상태를 읽고, 「왜 연체일수를 저장하지 않나」 는 사건을 읽는다. 한 문서에 섞으면 둘 다 찾기 어렵다.
            </p>
          </div>
          <figure className="fig">
            <img src={fig1} alt="세 레포 — CDP 소스 · 지식 레포 · 작업 레포" loading="lazy" />
            <figcaption>세 레포 — 소스 · 지식 · 작업. 지식 레포가 두 층을 든다</figcaption>
          </figure>
        </div>
        {save && (
          <div className="st-two st-two--code">
            <Code title={save.files[0].path} tag="데모 레포" value={save.files[0].text} lang="text" max={420} />
            <Code title={save.files[1].path} tag="데모 레포" value={save.files[1].text} lang="text" max={420} />
          </div>
        )}
        <p className="st-cap">
          왼쪽이 작업 기록, 오른쪽이 그 기록이 고친 관리 문서 섹션이다. 섹션 머리의 <code>applied</code> 가 「이 섹션은 어느 기록까지 실었나」 이고, 맨 아래 <b>변경</b> 줄이 기록으로 이어진다.
        </p>
      </section>

      <section id="coord" className="st-sec">
        <h2>좌표 — 바꾼 것에만</h2>
        <p>
          좌표는 <code>&lt;타입&gt;:&lt;값&gt;</code> 이다 — <code>테이블정의서:bk_loan_mst</code> · <code>화면설계서:LN030</code> · <code>코드정의서:LN02</code>. 작업 기록의 앞머리 <code>touches:</code> 에 그 작업이{' '}
          <b>바꾼 것</b>만 적는다. 이야기에 나온 것 · 참고한 것에는 붙이지 않는다.
        </p>
        <p>
          검색은 「비슷한 것」 을 낸다. 좌표는 <b>그것</b>을 낸다. 에이전트는 말로 가리킨 대상을 짐작하지 않고 먼저 좌표로 확정한 뒤, 그 좌표의 섹션만 읽는다 — 문서 전체를 문맥에 붓지 않는다.
        </p>
      </section>

      <section id="vocab" className="st-sec">
        <h2>어휘와 등록부</h2>
        <div className="st-two st-two--code">
          <Code title="_vocab.md — 통제 어휘" tag="데모 레포" value={VOCAB} lang="text" />
          <Code title="_managed.md — 등록부" tag="데모 레포" value={MANAGED} lang="text" />
        </div>
        <p>
          <b>어휘</b>는 좌표의 정본 목록이다. 같은 대상을 부르는 다른 이름을 <code>aliases</code> 로 건다 — 누가 「연체 목록」 이라고 물어도 <code>화면설계서:LN030</code> 으로 풀린다.
          <b> 등록부</b>는 좌표 패턴이 어느 문서의 어느 섹션인지를 <b>여기에만</b> 적는다. 매핑이 두 곳에 있으면 반드시 어긋난다.
        </p>
      </section>

      <section id="derive" className="st-sec">
        <h2>파생 — 밀린 문서가 없는 이유</h2>
        <p>
          작업 기록이 좌표를 건드렸는데 그 섹션의 <code>applied</code> 가 그 기록보다 옛것이면 — 문서를 안 고친 것이다. CDP 는 이것을 「나중에 할 일」 로 두지 않는다. <b>파생 누락은 오류</b>이고, 오류가 있으면 커밋되지 않는다.
        </p>
        {cli && <Code title="로컬형 — 커밋 전 검사" tag="녹화" value={'$ ' + cli.cmd + '\n\n' + cli.out + '\n\n(exit ' + cli.exit + ')'} lang="text" />}
        <p className="st-cap">
          서버형에서는 같은 계산을 <code>save</code> 가 하고 <code>E_CHECK</code> 로 거절한다. 트리는 그대로이고 커밋은 0 이다. <Link to="/examples?ex=blocked">예제 ③</Link>
        </p>
      </section>

      <section id="supersede" className="st-sec">
        <h2>정정 — 고치지 않고 대신한다</h2>
        <p>
          작업 기록이 틀렸으면 그 파일을 고치지 않는다. 「그때 그렇게 적었다」 도 사실이기 때문이다. 바로잡는 새 기록에 <code>supersedes:</code> 를 달고, 정본 섹션은 평소처럼 고친다.
        </p>
        {sup && <Code title={sup.files[0].path} tag="데모 레포" value={sup.files[0].text} lang="text" max={320} />}
      </section>

      <section id="nostate" className="st-sec">
        <h2>상태는 없다</h2>
        <p>
          작업 기록에 「제안 · 확정 · 진행중 · 미결」 같은 값을 두지 않는다. 기록은 일어난 일이고, 일어나지 않은 결정은 기록이 아니라 <b>이슈 대장</b>으로 간다(좌표 <code>이슈:LIB-ISS-01</code>). 섹션도 「최신 · 밀림」 이 아니다 — 맞거나(<code>applied</code> 가 최신), 오류다.
        </p>
        <p className="st-cap">
          화면이 초록을 쓰지 않는 까닭이 이것이다. 정상은 조용하고, 이상만 소리를 낸다.
        </p>
      </section>
    </div>
  )
}
