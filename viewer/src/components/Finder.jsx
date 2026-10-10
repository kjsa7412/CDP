// 찾기 — 왼쪽이 하는 두 일 중 하나. **시작점을 고른다.**
//
// 무엇의 목록인지는 **주소가 정한다**(개편안 §7.2) — `/r/<레포>/` 관리 문서 · `/r/<레포>/w` 작업 기록. 층이 다른 것을
// 한 목록에 섞지 않는다: 관리 문서는 지금 상태, 작업 기록은 사건이다. 둘을 고르는 것은 목록 위 세그(문서 · 기록)다 —
// 메뉴의 「읽기」 하나가 둘을 든다(화면 22 → 16 · 옛 메뉴 「작업 기록」). 기록 쪽 세그에 대기 수(보라).
//
// 전에는 목록 머리에 범위 칩 셋(관리문서 · 작업문서 · 좌표)이 있었다. 왼쪽 메뉴가 생기며 같은 일을 하는 단추가 두 곳이
// 됐고, 칩을 지웠다. 좌표 목록은 「좌표 · 그래프」 화면의 왼쪽 레일(묶음 → 좌표)이 맡는다 — 「내 좌표」(우클릭)도 거기로 갔다.
//
// 작업 기록 목록은 거름이 있다 — 전체 · 대기(큐레이션이 아직 안 본 것) · 내 기록. 거름도 주소다(`/w?only=pending|mine`).
// 줄마다 큐레이션 상태 칩 — 대기(보라) · 반영됨 · 기록으로 둠(무채색). 서버가 상태를 안 내면(옛 서버) 칩도 「대기」 거름도 없다.
//
// 이 영역은 시작점만 만든다 — 관계·이력·현황은 전부 뻗어나가기가 답한다.

import { useMemo, useState } from 'react'
import { dayPart, timePart } from '../lib/format.js'
import { Link } from '../lib/router.jsx'
import { filterRecords, hasCuration } from '../lib/curation.js'
import { RecordState } from '../features/curation/marks.jsx'
import Icon from './Icon.jsx'

export default function Finder({
  docs,
  managed,
  root,
  scope = 'managed',
  onPick,
  readMap = {},
  myCoords = [],
  only = null,
  me = null,
  listBase = '/',
}) {
  const [q, setQ] = useState('')
  const cur = scope === 'work' && hasCuration(docs)
  const records = useMemo(() => (scope === 'work' ? filterRecords(docs, only, me) : docs), [scope, docs, only, me])

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase()
    if (!s) return { works: records, man: managed }
    return {
      // 작성자로도 찾는다 — 화면에 보이는 값은 찾기에도 걸려야 한다
      works: records.filter((d) =>
        (d.title + ' ' + d.id + ' ' + (d.author || '') + ' ' + d.touches.join(' '))
          .toLowerCase()
          .includes(s)
      ),
      man: managed.filter((m) => m.name.toLowerCase().includes(s)),
    }
  }, [q, records, managed])

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

  // 거름 칩 — 링크다(주소가 상태 · 새 탭에서도 같은 목록). 대기는 서버가 상태를 낼 때만 · 내 기록은 로그인했을 때만
  const pending = hasCuration(docs) ? docs.filter((d) => d.curation?.state === 'queued').length : 0
  const mine = me?.user ? docs.filter((d) => d.author === me.user).length : 0
  const chips =
    scope === 'work' && (cur || me?.user)
      ? [
          { k: null, label: '전체', n: docs.length, to: listBase + 'w' },
          ...(cur ? [{ k: 'pending', label: '대기', n: pending, to: listBase + 'w?only=pending' }] : []),
          ...(me?.user ? [{ k: 'mine', label: '내 기록', n: mine, to: listBase + 'w?only=mine' }] : []),
        ]
      : null

  return (
    <div className="fd">
      <div className="fd__seg" role="tablist" aria-label="목록">
        <Link to={listBase} role="tab" aria-selected={scope === 'managed'}>
          문서 <span className="fd__segn">{managed.length}</span>
        </Link>
        <Link to={listBase + 'w'} role="tab" aria-selected={scope === 'work'} title={pending ? `대기 ${pending}` : undefined}>
          기록 <span className="fd__segn">{docs.length}</span>
          {pending > 0 && <span className="fd__segq" aria-label={`대기 ${pending}`}>{pending}</span>}
        </Link>
      </div>

      {chips && (
        <div className="fd__scope" role="group" aria-label="거름">
          {chips.map((c) => (
            <Link key={c.k || 'all'} to={c.to} className="fd__chip" aria-current={(only || null) === c.k ? 'true' : undefined}>
              {c.label}
              <span className="fd__chipn">{c.n}</span>
            </Link>
          ))}
        </div>
      )}

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
                <RecordState c={d.curation} />
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
            {filtered.works.length === 0 && <Empty q={q} only={only} />}
          </>
        )}

      </div>
    </div>
  )
}

function Empty({ q, only = null }) {
  return (
    <div className="fd__empty">
      {q ? <>“{q}” 에 걸리는 것이 없습니다</> : only === 'pending' ? '대기 중인 기록이 없습니다 — 큐레이션이 다 봤다' : only === 'mine' ? '내가 쓴 기록이 없습니다' : '없습니다'}
    </div>
  )
}
