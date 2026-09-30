// 예제 — 시나리오 다섯을 재생한다. `?ex=<slug>` 로 고른 것이 남는다. 끝에 레포에 남은 파일 전문을 편다.

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
  find: '섹션은 지금 상태, 작업 기록은 그렇게 된 까닭이다. 섹션 끝의 **변경** 줄이 기록으로 이어진다.',
  save: '작업 기록의 `author` 는 에이전트가 보내지 않았다 — 서버가 토큰에서 채웠다. 섹션의 `applied` 가 이 기록으로 바뀌었다.',
  blocked: '거절된 첫 save 는 흔적을 남기지 않았다(커밋 0 · 트리 깨끗). 두 번째 save 가 기록과 섹션을 한 커밋으로 넣었다.',
  conflict: '먼저 저장한 회원등급 조건과 나중에 합친 엑셀 버튼이 둘 다 남았다. 변경 줄도 둘이다.',
  supersede: '옛 기록은 그대로 있다. 새 기록의 `supersedes` 가 그것을 가리키고, 정본 섹션은 8권이다.',
}
