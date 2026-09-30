// 판 이력 — CHANGELOG 의 절 제목만(빌드 때 뽑는다 · site/tools/releases.mjs). 본문은 레포의 CHANGELOG 에 있다.

import releases from 'virtual:cdp-releases'
import shots from '../data/shots.json'
import { EXAMPLES } from '../data/examples.js'

export default function Releases() {
  return (
    <div className="wrap st-page">
      <header className="st-head">
        <h1 tabIndex={-1}>판 이력</h1>
        <p className="st-lead">
          판마다 무엇이 바뀌었나. 지금 판은 <span className="amono">v{__CDP_VERSION__}</span> 이고, 이 사이트의 화면은 <span className="amono">v{shots.version}</span> · 예제는 <span className="amono">v{EXAMPLES[0]?.version}</span> 에서 찍고 녹화했다.
        </p>
      </header>
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
