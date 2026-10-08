// 개념 — 시스템 설계서 v2.0 제0 · 1부를 설치 전 사람의 말로. 작업 기록은 데모 레포에서 녹화한 파일이고(예제 JSON 의 files),
// 섹션 · 큐레이션 기록 · 기준선은 손으로 적은 예시다 — 데모 레포의 다음 걸음(대기 중인 기록을 큐레이터가 반영하면)을 그렸다.
// 데모의 기록 id · 날짜와 맞춘다(site/demo/content.mjs · record.mjs) — 데모를 다시 짜면 같이 고친다.

import { Link } from '../router.jsx'
import Code from '../components/Code.jsx'
import { exampleBySlug } from '../data/examples.js'
import fig1 from '../../../docs/그림/1_세_레포_구조.svg?url'
import fig10 from '../../../docs/그림/10_큐레이션_흐름.svg?url'

const TOC = [
  ['layers', '두 층 — 사건과 상태'],
  ['coord', '좌표 — 바꾼 것에만'],
  ['vocab', '어휘와 등록부'],
  ['curation', '큐레이션 — 쓰는 사람과 고치는 사람'],
  ['pending', '미반영 — 늦은 반영이 정보를 잃지 않는 까닭'],
  ['baseline', '기준선 — 기계가 쓰는 자리'],
  ['supersede', '정정 — 고치지 않고 대신한다'],
  ['nostate', '상태는 계산할 뿐 저장하지 않는다'],
]

const MANAGED = `| 좌표 패턴 | 관리 문서 | 섹션 |
|---|---|---|
| \`화면설계서:*\` | \`docs/화면설계서.md\` | \`## {값}\` |
| \`테이블정의서:*\` | \`docs/테이블정의서.md\` | \`## {값}\` |
| \`도메인용어:*\` | \`docs/DB도메인용어정의서.md\` | \`## {값}\` |
| \`코드정의서:*\` | \`docs/코드정의서.md\` | \`## {값}\` |`

const VOCAB = `## 화면설계서

- \`화면설계서:LN010\` — 대출 등록
  aliases: 대출등록, 대출 화면, 대출 등록 화면
- \`화면설계서:LN030\` — 연체 현황
  aliases: 연체현황, 연체 목록, 연체자 조회`

// 큐레이터가 기록을 반영한 섹션 — 정본 서술(현재형) · 끝의 경과 한 줄씩. applied 는 서버가 쓴다
const SECTION = `## 연체일수
<!-- applied: 2026-1005-연체일수-기준-확정 -->

| | |
|---|---|
| 물리명 | \`OVD_DAYS\` |
| 타입 | \`NUMERIC(4)\` |
| 어절 | 연체 + 일수 |

**계산** — **반납예정일 다음날부터** 센다. 반납예정일 당일
반납은 0일이다. 휴관일도 센다.

**경과**
- 2026-05-12 [\`연체이력-분리\`](../work/2026-0512-연체이력-분리.md) 반납일 − 반납예정일
- 2026-10-05 [\`연체일수-기준-확정\`](../work/2026-1005-연체일수-기준-확정.md) 다음날부터 센다`

// 큐레이션 기록 — 판정이 데이터다(curates). 좌표를 갖지 않는다(touchesEmpty · 태그 curate 는 서버가 붙인다)
const CURATION = `---
id: 2026-1008-큐레이션-연체일수-기준
title: 큐레이션 — 연체일수 기준 · 범위 회의
date: 2026-10-08 10:20
author: doc.c
touches: []
touchesEmpty: 큐레이션
curates:
  - { id: "2026-1005-연체일수-기준-확정", verdict: reflect, into: ["도메인용어:연체일수", "배치:OverdueNoticeJob", "이슈:LIB-ISS-01"] }
  - { id: "2026-1001-2차사업-범위", verdict: keep, reason: "범위 회의 — 이번 사업에서 바꾼 대상이 없다 · 기록이 원천" }
tags: [curate]
---

판정표 — 기록 2건 · 섹션 3

| 기록 | 판정 | 어디로 · 사유 |
|---|---|---|
| 2026-1005-연체일수-기준-확정 | 반영 | 도메인용어:연체일수 · 배치:OverdueNoticeJob · 이슈:LIB-ISS-01 |
| 2026-1001-2차사업-범위 | 기록으로 둠 | 범위 회의 — 이번 사업에서 바꾼 대상이 없다 · 기록이 원천 |

**정본** — 연체일수를 세는 기준은 도메인용어:연체일수 한 곳. 배치는 대상 조건 한 줄, 이슈는 결론 한 줄과 좌표.`

// 섹션을 읽는 자리(화면 · section 도구)가 미반영 기록을 같이 낸다 — 화면 그림 01 과 같은 자리
const PENDING = `## bk_loan_mst — 대출마스터                           [미반영 1]
<!-- applied: 2026-0901-반납-연장 -->

┄ 이 섹션 뒤에 반영 안 된 기록 1건 · 섹션은 2026-09-01 까지의 기록을 담았다 · 큐레이션 대기 ┄
2026-09-28 15:20  대출 이력 조회 화면 — 회원별 · 기간별
                  dev.a · 창구에서 「지난달에 뭘 빌렸지」 를 묻는 회원이 많다 …   기록 열기 ›

| 컬럼 | 타입 | NULL | 키 | 기본값 | 설명 |
| LOAN_ID | VARCHAR(20) | N | PK | | 대출ID | …`

const BASELINE = `## bk_loan_mst — 대출마스터
<!-- applied: 2026-0901-반납-연장 -->

대출 한 권이 한 행이다. 반납하면 반납일이 채워지고, 연체는 이력(테이블정의서:bk_ovd_hist)으로 남는다 …

<!-- cdp:baseline src="개발 DB pg_catalog" asof="2026-10-04" -->
| 컬럼 | 타입 | NULL | 키 | 설명 |
|---|---|---|---|---|
| loan_id | varchar(20) | N | PK | 대출ID |
| rtn_due_dt | date | N | | 반납예정일 |
| extn_cnt | numeric(1) | N | | 연장횟수 |
<!-- /cdp:baseline -->

**경과**
- 2026-04-06 [\`대출-도서-테이블-설계\`](../work/2026-0406-대출-도서-테이블-설계.md) 대출마스터 신설 — 한 권 한 행
- 2026-09-01 [\`반납-연장\`](../work/2026-0901-반납-연장.md) 연장 1회`

export default function Concept() {
  const save = exampleBySlug.save
  const sup = exampleBySlug.supersede
  return (
    <div className="wrap st-page st-doc">
      <header className="st-head">
        <h1 tabIndex={-1}>개념</h1>
        <p className="st-lead">
          CDP 는 프로젝트의 지식을 git 레포 하나 — <b>지식 레포</b> — 에 둔다. 규칙은 몇 개 되지 않는다. 그 규칙들이 「문서가 코드를 못 따라간다」 는 흔한
          사정을 구조로 다룬다 — 기록은 빠짐없이 쌓고, 정리는 맡은 사람이 하고, 정리가 늦은 동안에도 읽는 쪽이 기록을 놓치지 않게.
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
              — 상태다. 테이블 · 화면 · 코드 · 용어가 <b>지금</b> 어떻게 생겼나. 섹션 하나가 대상 하나이고, 한 사실은 정본 섹션 한 곳에만 적힌다.
            </p>
            <p>
              둘을 따로 두는 까닭은 묻는 말이 다르기 때문이다. 「지금 이 테이블에 무슨 컬럼이 있나」 는 상태를 읽고, 「왜 연체일수를 저장하지 않나」 는 사건을 읽는다.
              한 문서에 섞으면 둘 다 찾기 어렵다. 레포에는 이 지식만 있다 — 도구 · 스킬은 서버가 낸다.
            </p>
          </div>
          <figure className="fig">
            <img src={fig1} alt="세 레포 — CDP 소스 · 서버의 지식 레포 · 작업 레포와 큐레이터 폴더" loading="lazy" />
            <figcaption>세 레포 — 소스 · 지식 · 작업. 지식 레포는 서버에 있고 두 층만 든다</figcaption>
          </figure>
        </div>
        <div className="st-two st-two--code">
          {save && <Code title={save.files[0].path} tag="데모 레포" value={save.files[0].text} lang="text" max={420} />}
          <Code title="docs/DB도메인용어정의서.md § 도메인용어:연체일수" tag="v1.0 예시" value={SECTION} lang="text" max={420} />
        </div>
        <p className="st-cap">
          왼쪽은 데모 레포에 녹화한 작업 기록(<Link to="/examples?ex=save">예제 ②</Link> — 아직 큐레이션 대기), 오른쪽은 큐레이터가 그것을 반영한 뒤의 관리 문서 섹션이다(예시). 섹션 머리의{' '}
          <code>applied</code> 가 「이 섹션은 어느 기록까지 실었나」 이고(서버가 쓴다), 끝의 <b>경과</b> 목록이 한 줄씩 기록으로 이어진다.
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
          큐레이터도 기록의 좌표로 반영할 자리를 찾는다 — 빠진 좌표는 아무도 찾아오지 못한다.
        </p>
      </section>

      <section id="vocab" className="st-sec">
        <h2>어휘와 등록부</h2>
        <div className="st-two st-two--code">
          <Code title="_vocab.md — 통제 어휘" tag="데모 레포" value={VOCAB} lang="text" />
          <Code title="_managed.md — 등록부" tag="v1.0 예시" value={MANAGED} lang="text" />
        </div>
        <p>
          <b>어휘</b>는 좌표의 정본 목록이다. 같은 대상을 부르는 다른 이름을 <code>aliases</code> 로 건다 — 누가 「연체 목록」 이라고 물어도 <code>화면설계서:LN030</code> 으로 풀린다.
          <b> 등록부</b>는 좌표 패턴이 어느 문서의 어느 섹션인지를 <b>여기에만</b> 적는다. 매핑이 두 곳에 있으면 반드시 어긋난다. 새 레포는 빈 틀로 서고, 등록부 행과 관리 문서는
          큐레이터가 <b>서식집</b>에서 서식을 골라 세울 때 생긴다.
        </p>
      </section>

      <section id="curation" className="st-sec">
        <h2>큐레이션 — 쓰는 사람과 고치는 사람</h2>
        <div className="st-two">
          <div>
            <p>
              일하는 사람(<b>writer</b>)은 <b>작업 기록만</b> 남긴다 — 값 · 표 · 결정 · 제약을 본문에 담아 그 기록만 읽어도 알 수 있게. 기록은 <b>대기열</b>에 선다.
            </p>
            <p>
              레포마다 맡은 <b>큐레이터</b>가 대기열의 기록을 판정한다 — <b>반영</b>(있는 섹션에) · <b>새 문서</b>(서식에서 깨끗한 빈 문서를 세워) · <b>기록으로 둠</b>(옮길 사실이 없다).
              섹션은 현재형으로 다시 쓰고, 경과에 한 줄을 더한다. 판정표와 섹션 diff 를 보고 승인한 뒤에만 커밋된다.
            </p>
            <p>
              쓰는 길은 언제나 서버의 <code>save</code> 하나다 — 기록이든 큐레이션이든 서버가 검사하고 한 커밋으로 남긴다. 서버는 글을 쓰지 않는다. 판단과 글은 큐레이터의 에이전트 세션이 하고, 서버는
              권한 · 검사 · 커밋 · <code>applied</code> 계산만 한다.
            </p>
          </div>
          <figure className="fig">
            <img src={fig10} alt="관리 문서의 원천 셋 — writer · 큐레이터 · 생성기가 save 하나로 쓴다" loading="lazy" />
            <figcaption>원천 셋 — 작업 기록 · 큐레이터의 판단 · 기준선. 쓰는 길은 save 하나</figcaption>
          </figure>
        </div>
        <Code title="work/2026-1008-큐레이션-연체일수-기준.md — 큐레이션 기록" tag="v1.0 예시" value={CURATION} lang="text" max={420} />
        <p className="st-cap">
          판정은 데이터다(<code>curates</code>) — 화면의 큐레이션 이력과 기록마다의 「반영됨 → 좌표」 · 「기록으로 둠(사유)」 이 이것을 읽는다. 큐레이션 기록 자신은 좌표를 갖지 않는다.
        </p>
      </section>

      <section id="pending" className="st-sec">
        <h2>미반영 — 늦은 반영이 정보를 잃지 않는 까닭</h2>
        <p>
          기록을 남긴 뒤 큐레이터가 판정하기까지 시간이 걸린다. 그 사이 섹션만 읽으면 옛것이다. 그래서 <b>섹션을 내보내는 모든 자리가 그 섹션의 미반영 기록을 같이 낸다</b> — 화면은
          섹션 제목에 「미반영 n」 을 붙이고, 에이전트의 <code>section</code> 도구는 섹션과 함께 그 기록의 본문을 싣는다. 섹션은 반영한 데까지만 지금이고, 그 뒤의 기록까지가 지금이다.
        </p>
        <Code title="화면 — 관리 문서의 섹션" tag="v1.0 예시" value={PENDING} lang="text" />
        <p className="st-cap">
          v0.x 는 반대로 막았다 — 섹션을 안 고친 기록은 오류였고 커밋되지 않았다. 그 강제가 기록과 섹션을 한 세션에 쓰게 했고, 섹션이 근거보다 커지고 같은 결정이 여러 섹션에
          복제됐다. v1.0 은 막지 않고 <b>상태로 둔다</b> — 대신 그 상태를 읽는 쪽에서 감추지 않는다. 대기가 14일을 넘으면 큐레이터에게 경고가 간다.
        </p>
      </section>

      <section id="baseline" className="st-sec">
        <h2>기준선 — 기계가 쓰는 자리</h2>
        <p>
          컬럼 표 · 프로그램 목록처럼 코드 · DB 에서 <b>기계로 뽑을 수 있는 사실</b>은 사람이 손으로 옮기지 않는다. 섹션 안의 <b>기준선 블록</b>은 프로젝트의 생성기가 통째로 갈아 끼우고,
          큐레이터의 서술은 블록 밖에만 쓴다 — 각자 자기 자리만 쓸 수 있다(서버가 막는다). 블록의 <code>asof</code> 가 그 신선도다. 기준선은 대기열에 서지 않고 미반영을 만들지 않는다.
        </p>
        <Code title="docs/테이블정의서.md § 테이블정의서:bk_loan_mst" tag="v1.0 예시" value={BASELINE} lang="text" max={420} />
      </section>

      <section id="supersede" className="st-sec">
        <h2>정정 — 고치지 않고 대신한다</h2>
        <p>
          작업 기록이 틀렸으면 그 파일을 고치지 않는다. 「그때 그렇게 적었다」 도 사실이기 때문이다. 바로잡는 새 기록에 <code>supersedes:</code> 를 달아 남기면, 큐레이터가 정본 섹션을 고친다 —
          그 전까지 섹션 옆에 정정 기록이 미반영으로 실린다.
        </p>
        {sup && <Code title={sup.files[0].path} tag="데모 레포" value={sup.files[0].text} lang="text" max={320} />}
        <p className="st-cap">
          데모 레포에 녹화한 정정 기록이다 — 작성자(lead)가 기록만 내고, 큐레이터(doc.c)가 대기열에서 판정해 정본 섹션을 고쳤다. <Link to="/examples?ex=supersede">예제 ⑤</Link>
        </p>
      </section>

      <section id="nostate" className="st-sec">
        <h2>상태는 계산할 뿐 저장하지 않는다</h2>
        <p>
          작업 기록에 「제안 · 확정 · 진행중 · 미결」 같은 값을 두지 않는다. 기록은 일어난 일이고, 일어나지 않은 결정은 기록이 아니라 <b>이슈</b>로 제기한다(좌표 <code>이슈:LIB-ISS-01</code>).
          대기열 · 미반영 · 기록의 큐레이션 상태(대기 · 반영됨 · 기록으로 둠)도 어디에도 저장하지 않는다 — 읽을 때마다 기록과 판정에서 계산한다. 저장한 상태는 반드시 낡는다.
        </p>
        <p className="st-cap">
          화면이 초록을 쓰지 않는 까닭이 이것이다. 정상은 조용하고, 행동을 기다리는 것(대기 · 미반영)만 보라로 보인다.
        </p>
      </section>
    </div>
  )
}
