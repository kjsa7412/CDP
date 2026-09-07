// 시작점 — 왼쪽 위 영역.
//
// 여기서 고른 것이 아래 영역(뻗어나가기)의 뿌리가 된다. **찾는 방법 세 가지**를
// 준다: 목록에서 고르거나, 좌표로 좁히거나, 그래프에서 짚거나.
//
// 이 영역은 시작점만 만든다 — 관계·이력·현황은 전부 아래가 답한다.
// 필터·정렬·배지를 여기 더 붙이고 싶어지면, 그것이 시작점을 고르는 데
// 필요한지부터 묻는다. 아니면 아래 영역의 일이다.

import { useMemo, useState } from 'react'
import CoordGraph from './CoordGraph.jsx'

const MARK = { stale: ['밀림', 'w'], unwritten: ['미작성', 'q'], empty: ['미작성', 'q'],
  orphan: ['끊김', 'd'], 'anchor-missing': ['섹션 없음', 'd'], 'doc-missing': ['문서 없음', 'd'] }

export default function Finder({ docs, managed, tree, root, onPick, readMap = {}, myCoords = [], onToggleMine }) {
  const [mode, setMode] = useState('docs')
  const [q, setQ] = useState('')

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return { works: docs, man: managed }
    return {
      works: docs.filter((d) => (d.title + ' ' + d.id + ' ' + d.touches.join(' ')).toLowerCase().includes(s)),
      man: managed.filter((m) => m.name.toLowerCase().includes(s)),
    }
  }, [q, docs, managed])

  const isRoot = (kind, key) => root && root.kind === kind && root.key === key

  return (
    <div className="fd">
      <div className="fd__tabs" role="tablist">
        {[['docs', '문서'], ['coord', '좌표'], ['graph', '그래프']].map(([k, l]) => (
          <button key={k} className="fd__tab" role="tab" aria-selected={mode === k} onClick={() => setMode(k)}>
            {l}
          </button>
        ))}
        <span className="fd__spacer" />
        {mode !== 'graph' && (
          <input
            className="fd__q"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={mode === 'docs' ? '문서 찾기' : '좌표 찾기'}
            aria-label="찾기"
          />
        )}
      </div>

      <div className="fd__body">
        {mode === 'docs' && (
          <>
            {/* 정본 문서 두 층을 **한 목록에서** 본다. 관리 문서를 좌표 뒤에
                숨기면 "테이블정의서를 처음부터 훑겠다"는 정당한 요구가 막힌다 */}
            <Head label="지식 · 작업 기록" n={filtered.works.length} />
            {filtered.works.map((d) => (
              <button
                key={d.id}
                className="fd__row"
                aria-current={isRoot('work', d.id)}
                onClick={() => onPick({ kind: 'work', key: d.id, open: d.id })}
              >
                {/* 안 읽은 것에만 점을 찍는다. 읽은 것은 조용하다 */}
                <span className="fd__dot" data-on={readMap[d.id] ? '0' : '1'} aria-hidden="true" />
                <span className="fd__date">{String(d.date || '').slice(5)}</span>
                <span className="fd__name">{d.title}</span>
                {/* 내 좌표를 건드린 작업 — 남의 작업 사이에서 내 것을 찾는 길 */}
                {myCoords.length > 0 && d.touches.some((c) => myCoords.includes(c)) && (
                  <span className="fd__mine" title="내 좌표">내</span>
                )}
                {d.status && d.status !== '확정' && <span className="fd__m fd__m--q">{d.status}</span>}
              </button>
            ))}
            <Head label="정규화 · 관리 문서" n={filtered.man.length} />
            {filtered.man.map((m) => (
              <button
                key={m.path}
                className="fd__row"
                aria-current={isRoot('managed', m.path)}
                onClick={() => onPick({ kind: 'managed', key: m.path, open: m.path })}
              >
                <span className="fd__date">docs</span>
                <span className="fd__name">{m.name}</span>
                <span className="fd__n">{m.written}/{m.sections}</span>
                {m.stale > 0 && <span className="fd__m fd__m--w">밀림 {m.stale}</span>}
              </button>
            ))}
          </>
        )}

        {mode === 'coord' && (tree?.types || []).map((t) => {
          const cs = t.coords.filter((c) => !q.trim() || c.coord.toLowerCase().includes(q.trim().toLowerCase()))
          if (!cs.length) return null
          return (
            <div key={t.type}>
              <Head label={t.type} n={cs.length} />
              {cs.map((c) => {
                const m = MARK[c.sec]
                return (
                  <button
                    key={c.coord}
                    className="fd__row"
                    aria-current={isRoot('coord', c.coord)}
                    onClick={() => onPick({ kind: 'coord', key: c.coord })}
                    /* **내 좌표를 정하는 유일한 길.** 사이드바를 걷어내면서
                       설정 경로가 통째로 사라졌었다 -- 상태는 남아 있고
                       본문 하이라이팅은 그것을 읽는데 정할 데가 없었다. */
                    onContextMenu={(e) => { e.preventDefault(); onToggleMine?.(c.coord) }}
                    title="우클릭 → 내 좌표"
                  >
                    {myCoords.includes(c.coord) && <span className="fd__mine">내</span>}
                    <span className="fd__name mono">{c.coord.slice(c.coord.indexOf(':') + 1)}</span>
                    {m && <span className={`fd__m fd__m--${m[1]}`}>{m[0]}</span>}
                    <span className="fd__n">{c.count}</span>
                  </button>
                )
              })}
            </div>
          )
        })}

        {mode === 'graph' && (
          <CoordGraph tree={tree} docs={docs} onPick={(coord) => onPick({ kind: 'coord', key: coord })} picked={root?.kind === 'coord' ? root.key : null} />
        )}
      </div>
    </div>
  )
}

function Head({ label, n }) {
  return (
    <div className="fd__head">
      {label}
      <span className="fd__hn">{n}</span>
    </div>
  )
}
