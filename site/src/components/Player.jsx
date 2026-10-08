// 예제 재생기 — 녹화한 걸음을 넘긴다. 실행하지 않는다(제작 검토 v0.1 S8).
//
// 두 가지를 섞지 않는다: 「해설」(왜 이 도구인가 — 사람이 쓴 말)과 「녹화」(서버가 실제로 받고 낸 것). 딱지로 가른다.

import { useEffect, useState } from 'react'
import Icon from '../../../viewer/src/components/Icon.jsx'
import Code from './Code.jsx'

// 데모 레포(library)에서의 역할 — 명부는 site/demo/content.mjs. admin 은 모든 레포의 큐레이터다
export const WHO = {
  lead: { label: 'lead', role: 'admin', desc: '설계 리드 · 큐레이터' },
  'doc.c': { label: 'doc.c', role: '큐레이터', desc: '문서 담당' },
  'dev.a': { label: 'dev.a', role: 'writer', desc: '개발 담당' },
  'dev.b': { label: 'dev.b', role: 'viewer', desc: '품질 담당' },
}

const md = (s) =>
  String(s || '')
    .split(/(\*\*[^*]+\*\*|`[^`]+`)/g)
    .map((p, i) => (p.startsWith('**') ? <b key={i}>{p.slice(2, -2)}</b> : p.startsWith('`') ? <code key={i}>{p.slice(1, -1)}</code> : p))

export function Inline({ text }) {
  return <>{md(text)}</>
}

function resultOf(s) {
  if (s.kind === 'cli') return { ok: s.exit === 0, label: `exit ${s.exit}` }
  const e = s.res?.error?.code
  if (e) return { ok: false, label: e }
  if (s.res?.commit) return { ok: true, label: `커밋 ${s.res.commit}` }
  return { ok: true, label: '200' }
}

export default function Player({ ex, compact = false, limit }) {
  const steps = limit ? ex.steps.slice(0, limit) : ex.steps
  const [i, setI] = useState(0)
  useEffect(() => setI(0), [ex.slug])
  const s = steps[i]
  const r = resultOf(s)
  const who = WHO[s.who] || { label: s.who, role: '' }
  return (
    <div
      className={'pl' + (compact ? ' pl--compact' : '')}
      onKeyDown={(e) => {
        if (e.target.closest('pre')) return
        if (e.key === 'ArrowRight') setI((k) => Math.min(steps.length - 1, k + 1))
        else if (e.key === 'ArrowLeft') setI((k) => Math.max(0, k - 1))
      }}
    >
      <ol className="pl__dots" aria-label="걸음">
        {steps.map((x, k) => {
          const rr = resultOf(x)
          return (
            <li key={k}>
              <button
                type="button"
                className={'pl__dot' + (k === i ? ' is-on' : '') + (rr.ok ? '' : ' is-bad')}
                onClick={() => setI(k)}
                aria-current={k === i ? 'step' : undefined}
                aria-label={`${k + 1}번째 걸음 — ${x.tool || 'CLI'}`}
              >
                <span className="amono">{k + 1}</span> {x.tool || 'ctx'}
              </button>
            </li>
          )
        })}
      </ol>
      <div className="pl__grid">
        <div className="pl__side">
          <div className="pl__who">
            <span className="pl__av">{who.label}</span>
            {who.role && <span className="pl__role">{who.role}</span>}
            <span className="amuted">{who.desc}</span>
          </div>
          <div className="pl__tool">
            {s.kind === 'cli' ? (
              <>
                <Icon name="list" size={15} /> 명령줄
              </>
            ) : (
              <>
                <Icon name="plug" size={15} /> <span className="amono">tools/call</span> · <b className="amono">{s.tool}</b>
              </>
            )}
          </div>
          <p className="pl__note">
            <span className="tag tag--note">해설</span> <Inline text={s.note} />
          </p>
          <div className={'pl__res' + (r.ok ? '' : ' is-bad')}>
            <Icon name={r.ok ? 'check' : 'block'} size={15} /> <span className="amono">{r.label}</span>
          </div>
          <div className="pl__nav">
            <button type="button" className="btn btn--sm" onClick={() => setI((k) => Math.max(0, k - 1))} disabled={i === 0}>
              <Icon name="chevronLeft" size={14} /> 이전
            </button>
            <span className="amuted amono">
              {i + 1} / {steps.length}
            </span>
            <button type="button" className="btn btn--sm" onClick={() => setI((k) => Math.min(steps.length - 1, k + 1))} disabled={i === steps.length - 1}>
              다음 <Icon name="chevronRight" size={14} />
            </button>
          </div>
        </div>
        <div className="pl__main">
          {s.kind === 'cli' ? (
            <Code title="명령" tag="녹화" value={'$ ' + s.cmd + '\n\n' + s.out + '\n\n(exit ' + s.exit + ')'} lang="text" max={compact ? 300 : 460} />
          ) : (
            <>
              <Code title={`요청 — POST /mcp/${ex.repo}`} tag="녹화" value={s.req} max={compact ? 180 : 260} />
              <Code title="응답" tag="녹화" value={s.res} max={compact ? 220 : 380} />
            </>
          )}
        </div>
      </div>
    </div>
  )
}
