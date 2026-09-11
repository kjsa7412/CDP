// 목록 — 왼쪽이 하는 두 일 중 하나. **시작점을 고른다.**
//
// 탭은 **객체 이름 그대로** 셋이다 — 관리문서 · 작업문서 · 좌표.
// 층이 다른 것을 한 탭에 섞지 않는다: 관리문서는 지금 상태, 작업문서는 사건이다.
//
// 그래프는 여기서 나갔다(상단 `그래프`). 좌표 288개짜리 그림은 패널이 아니라
// 화면이 필요하고, 탭에 두면 나머지 셋과 성격이 달라 폭 경쟁만 일으켰다.
//
// **찾기 입력이 탭 줄에서 내려왔다.** 탭 넷 + 입력을 한 줄에 넣으면 400px 에서
// 탭 글자가 세로로 쪼개진다 — 실측 88px. 입력은 자기 줄에서 목록 폭을 다 쓴다.
//
// 이 영역은 시작점만 만든다 — 관계·이력·현황은 전부 뻗어나가기가 답한다.

import { useMemo, useState } from 'react'
import { dayPart, timePart } from '../lib/format.js'

const TABS = [['managed', '관리문서'], ['work', '작업문서'], ['coord', '좌표']]

export default function Finder({ docs, managed, tree, root, onPick, readMap = {}, myCoords = [], onToggleMine }) {
  const [mode, setMode] = useState('managed')
  const [q, setQ] = useState('')
  // 좌표 카테고리 — 288개를 한 줄로 늘어놓으면 스크롤로만 찾는다.
  // `null` 이면 전부.
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

  const isRoot = (kind, key) => root && root.kind === kind && root.key === key

  const placeholder = { managed: '관리문서 찾기', work: '제목 · 작성자 · 좌표로 찾기', coord: '좌표 찾기' }[mode]

  return (
    <div className="fd">
      <div className="fd__tabs" role="tablist">
        {TABS.map(([k, l]) => (
          <button
            key={k}
            className="fd__tab"
            role="tab"
            aria-selected={mode === k}
            onClick={() => { setMode(k); setCat(null) }}
          >
            {l}
            <span className="fd__tabn">
              {k === 'managed' ? managed.length : k === 'work' ? docs.length : cats.reduce((a, [, n]) => a + n, 0)}
            </span>
          </button>
        ))}
      </div>

      {/* 찾기 — 자기 줄. 목록 폭을 그대로 쓴다 */}
      <div className="fd__qrow">
        <input
          className="fd__q"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder={placeholder}
          aria-label="찾기"
        />
        {q && (
          <button className="fd__qx" onClick={() => setQ('')} aria-label="찾기 지우기">✕</button>
        )}
      </div>

      {/* 좌표 카테고리 — `code:` 159개가 나머지 전부보다 많다.
          카테고리를 고르면 그것만 남는다. */}
      {mode === 'coord' && cats.length > 1 && (
        <div className="fd__chips" role="group" aria-label="좌표 카테고리">
          <button className="fd__chip" aria-pressed={cat === null} onClick={() => setCat(null)}>전체</button>
          {cats.map(([t, n]) => (
            <button key={t} className="fd__chip" aria-pressed={cat === t} onClick={() => setCat(cat === t ? null : t)}>
              {t}<span className="fd__chipn">{n}</span>
            </button>
          ))}
        </div>
      )}

      <div className="fd__body">
        {mode === 'managed' && (
          <>
            {filtered.man.map((m) => (
              <button
                key={m.path}
                className="fd__row"
                aria-current={isRoot('managed', m.path)}
                onClick={() => onPick({ kind: 'managed', key: m.path, label: m.name, open: m.path })}
              >
                <span className="fd__name">{m.name}</span>
                <span className="fd__n" title={`섹션 ${m.sections}개`}>{m.sections}</span>
              </button>
            ))}
            {filtered.man.length === 0 && <Empty q={q} />}
          </>
        )}

        {mode === 'work' && (
          <>
            {filtered.works.map((d) => (
              <button
                key={d.id}
                className="fd__row fd__row--work"
                /* 안 읽은 것은 왼쪽 테두리로 말한다. 점을 찍으면 제목 앞에서
                   자리를 먹는데, 테두리는 폭을 쓰지 않는다 */
                data-unread={readMap[d.id] ? '0' : '1'}
                aria-current={isRoot('work', d.id)}
                onClick={() => onPick({ kind: 'work', key: d.id, label: d.title, open: d.id })}
                title={d.title}
              >
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

        {mode === 'coord' && (
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
        {/* 카테고리를 하나만 보고 있으면 머리가 같은 말을 반복한다 */}
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
            {myCoords.includes(c.coord) && <span className="fd__mine">내</span>}
            <span className="fd__name mono">{c.coord.slice(c.coord.indexOf(':') + 1)}</span>
            {/* 작업 0건 — 어휘에는 있으나 아무 작업도 건드리지 않은 좌표다.
                288개 중 대부분이 여기 해당한다. 조용히 구분만 해 둔다 */}
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
