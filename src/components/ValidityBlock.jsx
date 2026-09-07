// 문서 머리 — 본문을 읽기 전에 필요한 것 두 줄.
//
//   1단  최신성 — 확인이 필요한 좌표가 몇 곳인가 · 깨진 참조   (색 있음)
//   2단  시간   — 결정일 · 작성자 · 상태                      (무채색)
//
// **유효성 축이 없어졌다** (정정_판정모델_v2 §3). `supersedes` 는 판정이 아니라
// 참조이고, 작업 기록은 사건이라 무효가 되지 않는다. 지금 맞는 말을 말하는
// 것은 관리 문서 섹션이고, 밀림이 error 라서 섹션은 항상 최신이다.
//
// 여기 남는 색은 **깨진 참조**뿐이다 — 순환과 대상 없음. 그것은 의견이 아니다.
// 좌표별 세부는 왼쪽 아래(뻗어나가기)가 답한다.
//
// 용어는 수행 v1.0 §6.4 — 후속(later) · 밀림(stale) · 미작성 · 섹션 없음 ·
// 문서 없음 · 끊김.

import { relLabel, isBadDate } from '../lib/format.js'

export default function ValidityBlock({ doc, onOpen, onRelation }) {
  const v = doc.validity
  const all = doc.coords || doc.settled || []
  const settled = all.filter((s) => !s.excluded)
  const hot = settled.filter((s) => s.laterCount > 0 || sectionBad(s))
  const excluded = all.filter((s) => s.excluded)

  const allClean = v.state === 'valid' && hot.length === 0 && !v.brokenTargets?.length

  if (allClean) {
    return (
      <div className="vblock">
        <div className="vblock__tier vblock__validity is-valid">
          <span>{settled.length === 0 ? '최신성 계산 대상 좌표 없음' : '✓ 모든 좌표에서 최신 · 관리 문서 반영됨'}</span>
          {excluded.length > 0 && (
            <span title={`${excluded.map((e) => e.coord).join(', ')} — 입도가 굵어 후속이 항상 많다(§17.4)`}>
              <span className="sep"> · </span>
              {excluded.length}개 좌표 제외
            </span>
          )}
        </div>
        <TimeTier doc={doc} />
      </div>
    )
  }

  return (
    <div className="vblock">
      {/* 1단 — 유효성. 여기만 색을 쓴다.
          **좌표를 나열하지 않는다.** 몇 곳인지만 말하고 그 옆으로 보낸다. */}
      <div className={`vblock__tier vblock__validity ${tierClass(v.state)}`}>
        {/* 정정(`supersedes`)은 여기 나오지 않는다 —
            판정이 아니라 참조이고, 참조는 왼쪽 아래가 다룬다
            (정정_판정모델_v2 §3). 남는 것은 **깨진 참조**뿐이다. */}

        {v.state === 'cycle' && <span>⛔ supersedes 순환 참조 — 체인이 자기 자신으로 돌아온다</span>}

        {v.brokenTargets?.length > 0 && (
          <span className="badge badge--danger">⛔ supersedes 대상 없음: {v.brokenTargets.join(', ')}</span>
        )}

        {/* 좌표 요약 — 세부는 관계 패널에 있다. 여기서 그리로 보낸다. */}
        {hot.length > 0 && (
          <>
            {v.state !== 'valid' && <span className="sep">·</span>}
            <button className="vblock__jump" onClick={() => onRelation?.(hot[0].coord)}>
              ⚠ 확인이 필요한 좌표 {hot.length}곳 ▸
            </button>
          </>
        )}
      </div>

      <TimeTier doc={doc} />
    </div>
  )
}

function sectionBad(s) {
  return !!s.section && s.section.state !== 'ok'
}

// 2단 — 시간. 색이 없다. 2년 전 문서라도 정정되지 않았으면 그것이 현재의
// 정답이다(프로토콜 §12.2). 빈 자리를 다른 것으로 채우지 않는다(§17.3).
function TimeTier({ doc }) {
  return (
    <div className="vblock__tier vblock__time">
      {isBadDate(doc.date) ? (
        <span className="badge badge--danger">⛔ date 형식 오류: {String(doc.date || '없음')}</span>
      ) : (
        <span>
          결정 <b className="num">{doc.date || '미지정'}</b> <span className="sep">·</span> {relLabel(doc.date)}
        </span>
      )}
      <span className="topbar__spacer" />
      {doc.status && <StatusBadge status={doc.status} date={doc.date} />}
      {doc.author && <span>{doc.author}</span>}
      {doc.touches.length > 0 && <span className="sep">·</span>}
      {doc.touches.length > 0 && <span>좌표 {doc.touches.length}</span>}
      {doc.attachments.length > 0 && <span>📎 {doc.attachments.length}</span>}
    </div>
  )
}

function tierClass(state) {
  return state === 'valid' ? 'is-valid' : 'is-bad'
}

// **`미결` 은 이관 대상이다** (정정_판정모델_v2 §2) — 상태가 아니다.
// 지식공유문서는 작업의 완료에서 발생하는 문서이고, 결정 대기는 아젠다다.
// 남아 있으면 `ctx check` 가 error 로 잡으므로 여기서는 적색으로 알린다.
export function StatusBadge({ status }) {
  if (status === '미결') {
    return <span className="badge badge--danger">미결 — 이슈 대장으로 옮기세요</span>
  }
  return <span className="badge badge--plain">{status}</span>
}
