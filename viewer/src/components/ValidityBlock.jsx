// 문서 머리 — 본문을 읽기 전에 필요한 것 두 줄.
//
//   1단  최신성 — 확인이 필요한 좌표가 몇 곳인가 · 깨진 참조   (색 있음)
//   2단  시간   — 작성일 · 작성자 · 좌표 수                    (무채색)
//
// **유효성 축이 없어졌다** (정정_판정모델_v2 §3). `supersedes` 는 판정이 아니라
// 참조이고, 작업 기록은 사건이라 무효가 되지 않는다.
//
// 여기 남는 색은 **깨진 참조**뿐이다 — 순환과 대상 없음. 그것은 의견이 아니다.
// 좌표별 세부는 왼쪽 아래(뻗어나가기)가 답한다.
//
// **`결정` 이라고 쓰지 않는다.** 지식공유문서는 결정을 담는 문서가 아니라
// 작업의 완료에서 발생하는 문서다. 날짜는 그 작업을 적은 날 — 작성일이다.

import { relLabel, isBadDate } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function ValidityBlock({ doc, onOpen, onRelation }) {
  const v = doc.validity
  const all = doc.coords || doc.settled || []
  const settled = all.filter((s) => !s.excluded)
  // **섹션 상태를 보지 않는다.** 파생 누락은 상태가 아니라 오류이므로
  // (`ctx check` 가 커밋을 막는다) 여기 올 것이 없다. 남는 것은 **후속** —
  // 이 작업 뒤에 같은 좌표를 건드린 작업이 있다는 사실이다.
  const hot = settled.filter((s) => s.laterCount > 0)
  const excluded = all.filter((s) => s.excluded)

  const allClean = v.state === 'valid' && hot.length === 0 && !v.brokenTargets?.length

  if (allClean) {
    return (
      <div className="vblock">
        <div className="vblock__tier vblock__validity is-valid">
          <span>{settled.length === 0 ? '최신성 계산 대상 좌표 없음' : <><Icon name="check" size={13} /> 모든 좌표에서 최신</>}</span>
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

        {v.state === 'cycle' && <span><Icon name="block" size={13} /> supersedes 순환 참조 — 체인이 자기 자신으로 돌아온다</span>}

        {v.brokenTargets?.length > 0 && (
          <span className="badge badge--danger"><Icon name="block" size={12} /> supersedes 대상 없음: {v.brokenTargets.join(', ')}</span>
        )}

        {/* 좌표 요약 — 세부는 관계 패널에 있다. 여기서 그리로 보낸다. */}
        {hot.length > 0 && (
          <>
            {v.state !== 'valid' && <span className="sep">·</span>}
            <button className="vblock__jump" onClick={() => onRelation?.(hot[0].coord)}>
              후속 작업이 있는 좌표 {hot.length}곳 <Icon name="chevronRight" size={12} />
            </button>
          </>
        )}
      </div>

      <TimeTier doc={doc} />
    </div>
  )
}

// 2단 — 시간. 색이 없다. 2년 전 문서라도 정정되지 않았으면 그것이 현재의
// 정답이다(프로토콜 §12.2). 빈 자리를 다른 것으로 채우지 않는다(§17.3).
function TimeTier({ doc }) {
  return (
    <div className="vblock__tier vblock__time">
      {isBadDate(doc.date) ? (
        <span className="badge badge--danger"><Icon name="block" size={12} /> date 형식 오류: {String(doc.date || '없음')}</span>
      ) : (
        <span>
          작성 <b className="num">{doc.date || '미지정'}</b> <span className="sep">·</span> {relLabel(doc.date)}
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

// **`미결` · `제안` 은 이관 대상이다** (정정_판정모델_v2 §2) — 상태가 아니다.
// 지식공유문서는 작업의 완료에서 발생하는 문서이고, 결정 대기는 아젠다다.
// 둘은 같은 것이라 같이 잡는다 — 한쪽만 막으면 다른 쪽으로 흘러 들어간다.
// `ctx check` 가 error 로 잡으므로 여기서는 적색으로 알린다.
//
// `확정` 은 여기 오지 않는다 — 읽는 경계에서 지운다(frontmatter.js).
// 30건 중 28건이 같은 값이면 그 값은 아무것도 구별하지 않는다.
//
// **남는 값이 하나도 없다.** `진행중` 도 없앴다 — 지식공유문서는 작업의
// 완료에서 발생하고, 항상 그 시점에 완료된 것이 넘어온다. 그러므로 여기
// 도달하는 값은 전부 잘못된 것이고, 화면도 그렇게 말한다.
export function StatusBadge({ status }) {
  if (status === '미결' || status === '제안') {
    return <span className="badge badge--danger">{status} — 이슈 대장으로 옮기세요</span>
  }
  return <span className="badge badge--danger">{status} — 쓸 수 없는 값입니다</span>
}
