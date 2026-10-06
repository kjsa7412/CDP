// 큐레이션 표시 — 문서 · 목록에 붙는 작은 것들(개편안 §7.3 S1 · S2).
//
//   RecordState    작업 기록의 상태 칩 — 대기(보라) · 반영됨 · 기록으로 둠(무채색)
//   CurationLine   작업 기록 머리의 한 줄 — 무엇으로 반영됐나 · 왜 기록으로 뒀나 · 아직 대기인가
//   PendingChip    관리 문서 섹션 제목의 「미반영 n」 — 누르면 아래 목록을 접고 편다
//   PendingBlock   그 섹션 뒤에 아직 반영 안 된 기록들(날짜 · 제목 · 작성자 · 첫 문단 · 열기)
//
// **미반영은 상태다**(개편안 I7) — 섹션만 보고 최신이라 믿는 일이 없게, 섹션을 내보내는 자리마다 그 섹션의 미반영 기록이
// 같이 선다. 값은 서버가 계산했다(`sectionStates[].cstate` · `pending[]` · 기록의 `curation`) — 없으면 그리지 않는다(옛 서버).
// 색은 예산 그대로 — 대기 · 미반영은 보라, 반영됨 · 기록으로 둠은 무채색. 초록 · 주황 없음(V19).

import { STATE_LABEL, stateOf } from '../../lib/curation.js'
import { josa } from '../../lib/format.js'

export function RecordState({ c, title = null }) {
  const s = stateOf(c)
  if (!s) return null
  const tip =
    title ||
    (s === 'queued'
      ? '큐레이션 대기 — 큐레이터가 아직 보지 않았다'
      : s === 'reflected'
        ? '반영됨' + (c.into?.length ? ' → ' + c.into.join(' · ') : '')
        : '기록으로 둠' + (c.reason ? ' — ' + c.reason : ''))
  return (
    <span className={s === 'queued' ? 'cchip cchip--queued' : 'cchip'} title={tip}>
      {STATE_LABEL[s]}
    </span>
  )
}

// 작업 기록 머리 — ValidityBlock 의 한 단. 좌표는 누르면 그 좌표에서 뻗어나간다(섹션이 어디 있는지 그쪽이 답한다)
export function CurationLine({ c, onCoord, onOpen }) {
  const s = stateOf(c)
  if (!s) return null
  const by = c.by ? (
    <button type="button" className="vblock__ref" onClick={() => onOpen?.(c.by)} title={c.by}>
      {String(c.at || '').slice(0, 10) || '큐레이션 기록'}
    </button>
  ) : c.at ? (
    <span className="num">{String(c.at).slice(0, 10)}</span>
  ) : null
  return (
    <div className="vblock__tier vblock__time vblock__cur">
      <RecordState c={c} />
      {s === 'queued' && <span>큐레이터가 아직 이 기록을 보지 않았다 — 걸린 섹션마다 「미반영」 으로 같이 보이고, 에이전트가 그 좌표를 불러올 때도 같이 실린다</span>}
      {s === 'reflected' && (
        <span>
          {(c.into || []).length > 0 ? (
            <>
              →{' '}
              {c.into.map((x, i) => (
                <span key={x}>
                  {i > 0 && <span className="sep"> · </span>}
                  <button type="button" className="vblock__ref mono" onClick={() => onCoord?.(x)} title={`${x} — 뻗어나가기`}>
                    {x}
                  </button>
                </span>
              ))}
            </>
          ) : null}
          {by && <> · {by}</>}
        </span>
      )}
      {s === 'kept' && (
        <span>
          {c.reason ? `「${c.reason}」` : '사유 없음'}
          {by && <> · {by}</>}
        </span>
      )}
    </div>
  )
}

// 엔드포인트가 없는 서버(옛 판 — 404) — 화면 전용 자리(큐레이션 · 서식집)에서만 한 줄로 말한다. 빈 표 · 「읽는 중…」 을 두지 않는다
export function ServerAbsent({ what }) {
  return (
    <div className="anote">
      이 서버는 아직 <b>{josa(what, '을/를')}</b> 내지 않는다 — 큐레이터 판(v0.27) 이상에서 열린다. 관리자가 서버를 올리면 이 자리가 채워진다.
    </div>
  )
}
export const isAbsent = (err) => !!err && err.status === 404

export function PendingChip({ n, open, onToggle }) {
  return (
    <button
      type="button"
      className="pchip"
      aria-expanded={open}
      onClick={(e) => {
        e.preventDefault()
        onToggle?.()
      }}
      title={open ? '미반영 기록 접기' : '미반영 기록 보기'}
    >
      미반영 {n}
    </button>
  )
}

export function PendingBlock({ sec, onOpen }) {
  const items = sec.pending || []
  return (
    <div className="pblock" role="note" aria-label={`미반영 기록 ${items.length}건`}>
      <div className="pblock__head">
        이 섹션 뒤에 반영 안 된 기록 {items.length}건
        <small>
          {sec.appliedDate ? ` · 섹션은 ${String(sec.appliedDate).slice(0, 10)} 까지의 기록을 담았다` : ''} · 큐레이션 대기
        </small>
      </div>
      {items.map((p) => (
        <div className="pblock__rec" key={p.id}>
          <span className="pblock__date num">{String(p.date || '').slice(0, 16)}</span>
          <div className="pblock__body">
            <div className="pblock__title">{p.title || p.id}</div>
            {(p.author || p.excerpt) && (
              <div className="pblock__ex">
                {p.author ? <b>{p.author}</b> : null}
                {p.author && p.excerpt ? ' · ' : ''}
                {p.excerpt || ''}
              </div>
            )}
          </div>
          <button type="button" className="pblock__open" onClick={() => onOpen?.(p.id)}>
            기록 열기 ›
          </button>
        </div>
      ))}
    </div>
  )
}
