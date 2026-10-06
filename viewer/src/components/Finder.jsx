// 찾기 — 왼쪽이 하는 두 일 중 하나. **시작점을 고른다.**
//
// 무엇의 목록인지는 **주소가 정한다**(개편안 §7.2) — `/r/<레포>/` 관리 문서 · `/r/<레포>/w` 작업 기록. 층이 다른 것을
// 한 목록에 섞지 않는다: 관리 문서는 지금 상태, 작업 기록은 사건이다.
//
// 전에는 목록 머리에 범위 칩 셋(관리문서 · 작업문서 · 좌표)이 있었다. 왼쪽 메뉴가 생기며 같은 일을 하는 단추가 두 곳이
// 됐고, 칩을 지웠다. 좌표 목록은 「좌표 · 그래프」 화면의 왼쪽 레일(묶음 → 좌표)이 맡는다 — 「내 좌표」(우클릭)도 거기로 갔다.
//
// 이 영역은 시작점만 만든다 — 관계·이력·현황은 전부 뻗어나가기가 답한다.

import { useMemo, useState } from 'react'
import { dayPart, timePart } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function Finder({
  docs,
  managed,
  root,
  scope = 'managed',
  onPick,
  readMap = {},
  myCoords = [],
}) {
  const [q, setQ] = useState('')

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

  const isRoot = (kind, key) => root && root.kind === kind && root.key === key

  const placeholder = scope === 'work' ? '제목 · 작성자 · 좌표로 찾기' : '관리 문서 찾기'

  return (
    <div className="fd">
      {/* 찾기 줄 */}
      <div className="fd__srow">
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
                {m.hasVisual && <span className="fd__vis" title="HTML 시각 자료가 있다"><Icon name="eye" size={12} /></span>}
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
                {d.hasVisual && <span className="fd__vis" title="HTML 시각 자료가 있다"><Icon name="eye" size={12} /></span>}
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

      </div>
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
