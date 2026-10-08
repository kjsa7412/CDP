// 판 이력 — CHANGELOG 의 절 제목만(빌드 때 뽑는다 · site/tools/releases.mjs). 본문은 레포의 CHANGELOG 에 있다.

import releases from 'virtual:cdp-releases'
import shots from '../data/shots.json'
import { EXAMPLES } from '../data/examples.js'
import { Link } from '../router.jsx'

export default function Releases() {
  return (
    <div className="wrap st-page">
      <header className="st-head">
        <h1 tabIndex={-1}>판 이력</h1>
        <p className="st-lead">
          판마다 무엇이 바뀌었나. 지금 판은 <span className="amono">v{__CDP_VERSION__}</span> 이고, 이 사이트의 화면은 <span className="amono">v{shots.version}</span> · 예제는 <span className="amono">v{EXAMPLES[0]?.version}</span> 에서 찍고 녹화했다.
        </p>
      </header>
      <div className="st-callout">
        <b>v1.0 은 메이저다</b> — 세 가지를 한 번에 바꾼다. ① 쓰는 길은 서버 <code>save</code> 하나(PC 의 지식 레포 + git 훅 + 로컬 앱 · exe 는 끝났다 — 서버가 없으면 개인 서버) ②
        관리 문서는 레포마다 맡은 큐레이터가 반영한다(늦은 반영은 「미반영」 으로 섹션과 같이 실린다) ③ 레포에는 지식만 둔다(도구 · 스킬 사본 · 패키지가 레포를 떠나고 서식은 서식집으로).
        v0.x 에서 올리는 길은 <Link to="/deploy">배치 · 설치</Link>.
      </div>
      <ol className="rel">
        {releases.map((r, i) => (
          <li key={r.v} className={'rel__item' + (i === 0 ? ' is-top' : '')}>
            <div className="rel__v">
              <span className="amono">v{r.v}{r.to ? ` ~ v${r.to}` : ''}</span>
              {r.date && <span className="amuted"> · {r.date}</span>}
              {r.untagged && <span className="amuted"> · 태그 없음</span>}
            </div>
            <ul className="rel__items">
              {r.items.map((t) => (
                <li key={t}>{t.split(/(`[^`]+`)/g).map((p, k) => (p.startsWith('`') ? <code key={k}>{p.slice(1, -1)}</code> : p))}</li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
