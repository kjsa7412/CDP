// 예제 — 시나리오 다섯을 재생한다. `?ex=<slug>` 로 고른 것이 남는다. 끝에 레포에 남은 파일 전문을 편다.
// 녹화는 찍은 판(예제 JSON 의 version)의 것이다 — v1.0 에서 달라진 점은 예제마다 아래 상자에 적는다(다시 녹화할 때 지운다).

import { useRoute, useNavigate } from '../router.jsx'
import Player, { Inline } from '../components/Player.jsx'
import Code from '../components/Code.jsx'
import { EXAMPLES, exampleBySlug } from '../data/examples.js'

export default function Examples() {
  const route = useRoute()
  const navigate = useNavigate()
  const ex = exampleBySlug[route.query.get('ex')] || EXAMPLES[0]
  if (!ex) return null
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>예제</h1>
        <p className="st-lead">
          데모 레포에 <b>진짜 MCP 요청</b>을 보내 받은 응답을 그대로 적었다(판 <span className="amono">v{ex.version}</span> · {ex.recorded} 녹화). 이 페이지는 아무것도 실행하지 않는다 — 걸음을 넘기며 본다. 「해설」 딱지가 붙은 문장만 사람이 쓴 설명이다.
        </p>
      </header>
      <div className="st-callout">
        <b>v1.0 에서 달라진 것</b> — 이 녹화의 판에서는 기록을 남기는 사람이 관리 문서 섹션까지 같이 고쳤다. v1.0 에서는 <b>작업 기록만</b> 남기고, 섹션은 레포마다 맡은 <b>큐레이터</b>가
        대기열에서 판정해 반영한다 — 그 전까지 섹션 옆에 「미반영」 으로 같이 실린다. 예제마다 아래 상자에 무엇이 달라지는지 적었다.
      </div>
      <div className="ex-tabs" role="tablist" aria-label="시나리오">
        {EXAMPLES.map((e) => (
          <button
            key={e.slug}
            type="button"
            role="tab"
            aria-selected={e.slug === ex.slug}
            className={'ex-tab' + (e.slug === ex.slug ? ' is-on' : '')}
            onClick={() => navigate('/examples?ex=' + e.slug, { keepScroll: true })}
          >
            <span className="ex-tab__n">{'①②③④⑤'[e.n - 1]}</span> {e.title}
          </button>
        ))}
      </div>
      <section className="ex" role="tabpanel" aria-label={ex.title}>
        <h2>{ex.title}</h2>
        <p className="st-p">{ex.summary}</p>
        <blockquote className="ex-ask">
          <span className="tag">사람</span> {ex.ask}
        </blockquote>
        <Player ex={ex} />
        <h3 className="ex-files__h">레포에 남은 것</h3>
        <div className={'st-two st-two--code' + (ex.files.length === 1 ? ' st-one' : '')}>
          {ex.files.map((f) => (
            <Code key={f.path} title={f.path} tag="데모 레포" value={f.text} lang="text" max={520} />
          ))}
        </div>
        <p className="st-cap">
          <Inline text={CAP[ex.slug]} />
        </p>
        {V1[ex.slug] && (
          <div className="st-callout">
            <b>v1.0</b> — <Inline text={V1[ex.slug]} />
          </div>
        )}
      </section>
    </div>
  )
}

const CAP = {
  find: '섹션은 지금 상태, 작업 기록은 그렇게 된 까닭이다. 섹션 끝의 **변경** 줄이 기록으로 이어진다(v1.0 은 `**경과**` 목록).',
  save: '작업 기록의 `author` 는 에이전트가 보내지 않았다 — 서버가 토큰에서 채웠다. 섹션의 `applied` 가 이 기록으로 바뀌었다.',
  blocked: '거절된 첫 save 는 흔적을 남기지 않았다(커밋 0 · 트리 깨끗). 두 번째 save 가 기록과 섹션을 한 커밋으로 넣었다.',
  conflict: '먼저 저장한 회원등급 조건과 나중에 합친 엑셀 버튼이 둘 다 남았다. 변경 줄도 둘이다.',
  supersede: '옛 기록은 그대로 있다. 새 기록의 `supersedes` 가 그것을 가리키고, 정본 섹션은 8권이다.',
}

// v1.0 에서 달라진 것 — 다시 녹화하면 지운다
const V1 = {
  find: '같은 네 걸음이다. `section` 이 섹션과 함께 아직 반영 안 된 기록(미반영)의 본문 · 본문이 건 정본 · 기준선 블록을 같이 싣는다 — 미반영이 있으면 에이전트가 답에 적는다.',
  save: 'writer 의 `save` 는 **작업 기록만** 싣는다 — `sections` 를 보내면 `E_FORBIDDEN`(need: curate). 섹션은 그 레포의 큐레이터가 대기열에서 판정해 반영하고, 그때 `applied` 가 이 기록으로 바뀐다. 그 전까지 이 좌표를 읽는 사람 · 에이전트에게 기록이 「미반영」 으로 같이 보인다.',
  blocked: '이 거절은 없다. 섹션을 안 채운 기록은 오류가 아니라 **미반영 상태**다 — 대기열에 서고 섹션 옆에 실린다. 로컬형(git 훅 · `bin/ctx check`)도 없다. `save` 가 막는 것은 그 save 가 새로 만든 오류(미등재 좌표 · 필수 필드 등)뿐이다.',
  conflict: '섹션을 쓰는 사람은 큐레이터다 — 이 충돌은 큐레이터 둘이 같은 섹션을 반영할 때 난다. 대처는 같다 — 거절에 실려 온 지금 본문 위에 다시 만들고 `applied` 에 `current` 를 넣어 보낸다.',
  supersede: '정정 기록은 writer 가 낸다(`supersedes`). 정본 섹션은 큐레이터가 반영한다 — 그 전까지 섹션 옆에 정정 기록이 미반영으로 실린다.',
}
