// 찾기 — 왼쪽이 하는 두 일 중 하나. **시작점을 고른다.**
//
// 대상은 **객체 이름 그대로** 셋이다 — 관리문서 · 작업문서 · 좌표.
// 층이 다른 것을 한 대상에 섞지 않는다: 관리문서는 지금 상태, 작업문서는 사건이다.
//
// ── 밑줄 탭을 버렸다 ──────────────────────────────────────────────────
//
// 전에는 이 셋이 밑줄 탭이었다. 바로 위 `찾기 | 뻗어나가기` 도 밑줄 탭이라,
// **다섯 개가 한 줄짜리 사다리로 읽혔다** — 부모와 자식이 형제로 보였다.
// 지금은 층마다 모양이 하나씩이다: L0 세그먼트 · L1 스텝 · L2 칩.
//
// ── 갈래(L3)가 칩 구름에서 내려왔다 ──────────────────────────────────
//
// `code:` 하나가 실제 레포에서 291개 중 159개다. 그 분포를 보여주려고 칩
// 구름을 뒀는데, 구름은 좌표에서만 두세 줄로 자란다. 그래서 **대상을 바꿀
// 때마다 목록 첫 행이 76.5px 씩 움직였다**(실측 110.7 ↔ 187.2). 지금은
// 찾기 줄 왼쪽의 고른목록이고, 분포는 옵션 레이블이 그대로 들고 간다.
//
// 이 영역은 시작점만 만든다 — 관계·이력·현황은 전부 뻗어나가기가 답한다.

import { useMemo, useState } from 'react'
import { dayPart, timePart } from '../lib/format.js'
import Icon from './Icon.jsx'

const SCOPES = [
  ['managed', '관리문서', 'managed'],
  ['work', '작업문서', 'work'],
  ['coord', '좌표', 'coord'],
]

export default function Finder({
  docs,
  managed,
  tree,
  root,
  scope = 'managed',
  onScope,
  onGraph,
  onPick,
  readMap = {},
  myCoords = [],
  onToggleMine,
}) {
  const [q, setQ] = useState('')
  // 좌표 갈래 — `null` 이면 전부.
  const [cat, setCat] = useState(null)

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return { works: docs, man: managed }
    return {
      // 작성자로도 찾는다 — 화면에 보이는 값은 찾기에도 걸려야 한다
      works: docs.filter((d) =>
        (d.title + ' ' + d.id + ' ' + (d.author || '') + ' ' + d.touches.join(' '))
          .toLowerCase()
          .includes(s)
      ),
      man: managed.filter((m) => m.name.toLowerCase().includes(s)),
    }
  }, [q, docs, managed])

  // 시각은 **같은 날 두 건 이상일 때만** 붙인다.
  //
  // id 에 시각이 있으면 늘 `09-11 11:06` 을 찍었는데, 그 6자가 제목에서
  // 빠져나간다. 시각이 구별에 쓰이는 것은 하루에 여럿일 때뿐이다.
  const busyDays = useMemo(() => {
    const n = new Map()
    for (const d of docs) {
      const k = dayPart(d.date)
      n.set(k, (n.get(k) || 0) + 1)
    }
    return new Set([...n].filter(([, v]) => v > 1).map(([k]) => k))
  }, [docs])

  const cats = useMemo(() => (tree?.types || []).map((t) => [t.type, t.coords.length]), [tree])
  const coordTotal = cats.reduce((a, [, n]) => a + n, 0)
  const count = { managed: managed.length, work: docs.length, coord: coordTotal }

  const isRoot = (kind, key) => root && root.kind === kind && root.key === key

  const placeholder = { managed: '관리문서 찾기', work: '제목 · 작성자 · 좌표로 찾기', coord: '좌표 찾기' }[scope]

  const pickScope = (k) => {
    onScope?.(k)
    setCat(null)
  }

  return (
    <div className="fd">
      {/* L2 대상 — 칩 한 줄 */}
      <div className="fd__scope" role="tablist" aria-label="찾을 대상">
        {SCOPES.map(([k, label, ico]) => (
          <button
            key={k}
            className="fd__chip"
            role="tab"
            aria-pressed={scope === k}
            aria-selected={scope === k}
            onClick={() => pickScope(k)}
          >
            <Icon name={ico} size={13} />
            {label}
            <span className="fd__chipn">{count[k]}</span>
          </button>
        ))}
      </div>

      {/* 찾기 줄 — 갈래(L3) · 검색 · 그래프로 */}
      <div className="fd__srow">
        {scope === 'coord' && cats.length > 1 && (
          <span className="fd__sel" data-on={cat ? '1' : '0'}>
            <select value={cat || ''} onChange={(e) => setCat(e.target.value || null)} aria-label="좌표 갈래">
              <option value="">전체 {coordTotal}</option>
              {cats.map(([t, n]) => (
                <option key={t} value={t}>
                  {t} {n}
                </option>
              ))}
            </select>
            <Icon name="chevronDown" size={12} />
          </span>
        )}

        <span className="fd__q">
          <Icon name="search" size={13} />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder={placeholder}
            aria-label="찾기"
          />
          {q && (
            <button className="fd__qx" onClick={() => setQ('')} aria-label="찾기 지우기">
              <Icon name="close" size={12} />
            </button>
          )}
        </span>

        {/* 좌표를 보고 있을 때만 난다 — L0 의 그래프와 L2 의 좌표가 같은 것을
            본다는 사실을, 둘을 한 줄에서 만나게 해서 말한다 */}
        {scope === 'coord' && onGraph && (
          <button className="fd__go" onClick={onGraph} title="좌표를 그림으로 본다">
            그래프
            <Icon name="external" size={12} />
          </button>
        )}
      </div>

      <div className="fd__body">
        {scope === 'managed' && (
          <>
            {filtered.man.map((m) => (
              <button
                key={m.path}
                className="fd__row"
                aria-current={isRoot('managed', m.path)}
                onClick={() => onPick({ kind: 'managed', key: m.path, label: m.name, open: m.path })}
              >
                <Icon name="managed" size={14} className="fd__ico" />
                <span className="fd__name">{m.name}</span>
                <span className="fd__n" title={`섹션 ${m.sections}개`}>{m.sections}</span>
              </button>
            ))}
            {filtered.man.length === 0 && <Empty q={q} />}
          </>
        )}

        {scope === 'work' && (
          <>
            {filtered.works.map((d) => (
              <button
                key={d.id}
                className="fd__row fd__row--work"
                /* 안 읽은 것은 행 안쪽 막대로 말한다. 점을 찍으면 제목 앞에서
                   자리를 먹는데, 막대는 폭을 쓰지 않는다 */
                data-unread={readMap[d.id] ? '0' : '1'}
                aria-current={isRoot('work', d.id)}
                onClick={() => onPick({ kind: 'work', key: d.id, label: d.title, open: d.id })}
                title={d.title}
              >
                <Icon name="work" size={14} className="fd__ico" />
                {/* 내 좌표를 건드린 작업 — 남의 작업 사이에서 내 것을 찾는 길 */}
                {myCoords.length > 0 && d.touches.some((c) => myCoords.includes(c)) && (
                  <span className="fd__mine" title="내 좌표">내</span>
                )}
                <span className="fd__name">{d.title}</span>
                {d.status && <span className="fd__m fd__m--q">{d.status}</span>}
                {/* 작성자 — 누가 썼나가 이 목록에서 자주 묻는 것이다. 다만
                    좁으면 제목이 먼저다(@container) */}
                {d.author && <span className="fd__by">{d.author}</span>}
                <span className="fd__date">
                  {dayPart(d.date).slice(5)}
                  {busyDays.has(dayPart(d.date)) && timePart(d.date) && (
                    <span className="fd__time"> {timePart(d.date)}</span>
                  )}
                </span>
              </button>
            ))}
            {filtered.works.length === 0 && <Empty q={q} />}
          </>
        )}

        {scope === 'coord' && (
          <CoordList
            tree={tree}
            cat={cat}
            q={q}
            myCoords={myCoords}
            isRoot={isRoot}
            onPick={onPick}
            onToggleMine={onToggleMine}
          />
        )}
      </div>
    </div>
  )
}

function CoordList({ tree, cat, q, myCoords, isRoot, onPick, onToggleMine }) {
  const s = q.trim().toLowerCase()
  const types = (tree?.types || []).filter((t) => !cat || t.type === cat)
  let shown = 0

  const body = types.map((t) => {
    const cs = t.coords.filter((c) => !s || c.coord.toLowerCase().includes(s))
    if (!cs.length) return null
    shown += cs.length
    return (
      <div key={t.type}>
        {/* 갈래를 하나만 보고 있으면 머리가 같은 말을 반복한다 */}
        {!cat && <Head label={t.type} n={cs.length} />}
        {cs.map((c) => (
          <button
            key={c.coord}
            className="fd__row"
            aria-current={isRoot('coord', c.coord)}
            onClick={() => onPick({ kind: 'coord', key: c.coord, label: c.coord })}
            /* **내 좌표를 정하는 유일한 길.** 상태는 본문 하이라이팅이 읽는다 */
            onContextMenu={(e) => { e.preventDefault(); onToggleMine?.(c.coord) }}
            title={`${c.coord}${c.label ? ' — ' + c.label : ''}\n우클릭 → 내 좌표`}
          >
            <Icon name="coord" size={14} className="fd__ico" />
            {myCoords.includes(c.coord) && <span className="fd__mine">내</span>}
            <span className="fd__name mono">{c.coord.slice(c.coord.indexOf(':') + 1)}</span>
            {/* 작업 0건 — 어휘에는 있으나 아무 작업도 건드리지 않은 좌표다.
                291개 중 대부분이 여기 해당한다. 조용히 구분만 해 둔다 */}
            <span className="fd__n" data-zero={c.count ? '0' : '1'}>{c.count || '·'}</span>
          </button>
        ))}
      </div>
    )
  })

  return (
    <>
      {body}
      {shown === 0 && <Empty q={q} />}
    </>
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

function Empty({ q }) {
  return (
    <div className="fd__empty">
      {q ? <>“{q}” 에 걸리는 것이 없습니다</> : '없습니다'}
    </div>
  )
}
