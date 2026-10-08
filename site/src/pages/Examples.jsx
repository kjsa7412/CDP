// 예제 — 시나리오 다섯을 재생한다. `?ex=<slug>` 로 고른 것이 남는다. 끝에 레포에 남은 파일 전문을 편다.
// 녹화는 찍은 판(예제 JSON 의 version)의 것이다 — 판을 올리고 뜻이 바뀌면 `npm run site:demo` 로 다시 녹화하고 CAP 을 같이 고친다.

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
      <p className="st-p">
        사람은 넷이다 — <span className="amono">dev.a</span>(writer — 작업 기록만 남긴다) · <span className="amono">doc.c</span>(이 레포의 큐레이터) · <span className="amono">lead</span>(admin — 모든 레포의 큐레이터) ·{' '}
        <span className="amono">dev.b</span>(viewer). writer 는 기록만 쓰고, 섹션은 큐레이터가 대기열에서 판정해 반영한다 — 그 전까지 기록은 섹션 옆에 「미반영」 으로 같이 실린다.
      </p>
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
      </section>
    </div>
  )
}

const CAP = {
  find: '섹션은 큐레이터가 반영한 데까지의 지금이고, 끝의 **경과** 목록이 그 근거 기록으로 이어진다. 그 뒤의 기록 둘은 아직 반영 전이라 섹션 옆에 미반영으로 실렸다 — 에이전트는 섹션과 그 기록을 같이 읽고 답한다.',
  save: '작업 기록의 `author` 는 에이전트가 보내지 않았다 — 서버가 토큰에서 채웠다. 관리 문서는 한 줄도 바뀌지 않았다. 이 기록은 큐레이션 대기열에 서 있고, 걸린 세 좌표의 섹션을 읽는 자리마다 미반영으로 같이 나간다.',
  pending: '거절된 두 save 는 흔적을 남기지 않았다(커밋 0 · 트리 깨끗). 셋째 save 가 기록 하나와 새 좌표 하나를 한 커밋으로 넣었다. 섹션은 그대로다(applied 가 4월 기록) — 반납예정일을 읽는 자리마다 위 기록이 미반영으로 같이 실린다.',
  conflict: '먼저 반영한 회원등급 조건과 다시 만들어 얹은 엑셀 단추가 둘 다 남았다. 경과에도 두 줄이 더해졌다. 큐레이션 기록의 본문은 판정표다 — 판정 자체는 앞머리의 `curates` 에 데이터로 있다.',
  supersede: '옛 기록은 그대로 있다. 새 기록의 `supersedes` 가 그것을 가리키고, 큐레이터가 반영한 정본 섹션은 8권이다. 섹션의 `applied` 는 정정 기록 — 서버가 반영한 기록 중 가장 늦은 것으로 썼다.',
}
