// 표시 서식.
//
// 설계서 §17.3 — 상대 시간 + 절대 날짜를 같이 쓴다. "3주 전"만 있으면 정확한
// 날짜를 알 수 없고, "2026-08-19"만 있으면 감각이 없다.
// 그리고 나이는 절대 색을 갖지 않는다 — 그것은 CSS 쪽 규칙이다(§13-①).

// `date` 는 `2026-08-19` 이거나 `2026-08-19 14:30` 이다. 앞 10자가 날짜다.
export function dayPart(dateStr) {
  return String(dateStr || '').slice(0, 10)
}

// 시각 부분. 없으면 빈 문자열.
export function timePart(dateStr) {
  const m = String(dateStr || '').match(/\d{2}:\d{2}(:\d{2})?/)
  return m ? m[0].slice(0, 5) : ''
}

export function relDays(dateStr, now = new Date()) {
  if (!dateStr) return null
  const d = new Date(`${dayPart(dateStr)}T00:00:00`)
  if (Number.isNaN(+d)) return null
  const days = Math.floor((startOfDay(now) - startOfDay(d)) / 86400000)
  return days
}

function startOfDay(d) {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
}

export function relLabel(dateStr, now = new Date()) {
  const days = relDays(dateStr, now)
  if (days == null) return ''
  if (days < 0) return `${-days}일 후` // 미래 날짜는 오류로 취급한다(§17.3)
  if (days === 0) return '오늘'
  if (days === 1) return '어제'
  if (days < 7) return `${days}일 전`
  if (days < 28) return `${Math.floor(days / 7)}주 전`
  if (days < 365) return `${Math.floor(days / 30)}개월 전`
  const y = Math.floor(days / 365)
  const m = Math.floor((days % 365) / 30)
  return m ? `${y}년 ${m}개월 전` : `${y}년 전`
}

export function shortDate(dateStr) {
  if (!dateStr) return ''
  const m = dayPart(dateStr).match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return String(dateStr)
  const t = timePart(dateStr)
  return t ? `${m[2]}-${m[3]} ${t}` : `${m[2]}-${m[3]}`
}

// `2026-08-19` · `2026-08-19 14:30` · `2026-08-19 14:30:05` 를 받는다.
export function isBadDate(dateStr) {
  if (!dateStr) return false
  if (!/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2}(:\d{2})?)?$/.test(String(dateStr))) return true
  const days = relDays(dateStr)
  return days != null && days < 0
}

export function clockTime(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(+d)) return ''
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 아젠다 대기 일수 — 프로토콜 §17 성공지표 "미결 대기 시간"
export function pendingDays(dateStr) {
  const d = relDays(dateStr)
  return d == null || d < 0 ? null : d
}

export function coordType(coord) {
  const i = String(coord).indexOf(':')
  return i < 0 ? '' : coord.slice(0, i)
}

export function coordValue(coord) {
  const i = String(coord).indexOf(':')
  return i < 0 ? String(coord) : coord.slice(i + 1)
}

// 요약 복사 — 프로토콜 §12.3 이 AI 세션에 주입하는 형식과 같다(§28.1).
// 사람이 메신저에 붙여넣어도 되고 다른 AI 세션에 붙여넣어도 프로토콜이
// 기대하는 신호가 그대로 실린다. 형식을 새로 만들지 않는다.
//
// **신호 이름은 화면 문구와 같아야 한다** (11단계 · 검토결과 §A-1).
// 화면에서 "후속 2건"을 본 사람이 붙여넣은 프롬프트에서 다른 말을 읽으면
// 둘이 같은 것인지 알 수 없다. `[결착]` 은 `[최신]` 으로 통일했다.
export function summaryText(doc) {
  const lines = []
  lines.push(`${doc.id} · ${doc.title}`)

  // **정정은 상태가 아니라 참조다** (정정_판정모델_v2 §3). `validity.state` 는
  // valid · cycle 둘뿐이라 전에 여기 있던 'superseded' · 'partial' 분기는 한 번도
  // 타지 않았고, 정정당한 기록도 「정정한 문서 없음」 으로 복사됐다. 상태가
  // 아니라 **참조 목록**을 보고 쓴다 — 화면 머리 3단과 같은 말이다.
  const v = doc.validity
  const full = v.correctedBy || []
  const part = v.partialBy || []
  if (v.state === 'cycle') lines.push('[유효] ⛔ supersedes 순환 참조')
  if (full.length) lines.push(`[유효] 정정됨 — ${full.join(', ')} 가 이 기록을 정정했습니다`)
  if (part.length) lines.push(`[유효] 부분 정정 — ${part.map((p) => `${p.by} (${(p.scope || []).join(', ')})`).join(' / ')} 가 이 기록의 일부를 정정했습니다`)
  if (v.state !== 'cycle' && !full.length && !part.length) lines.push('[유효] 현재 유효함 (이 기록을 정정한 문서 없음)')
  const olds = (doc.supersedes || []).map((s) => s.id)
  if (olds.length) lines.push(`[정정] 이 기록이 ${olds.join(', ')} 를 정정했습니다`)

  lines.push(`[나이] 작성 ${doc.date || '미지정'} · ${relLabel(doc.date)}`)

  const settled = (doc.settled || []).filter((s) => !s.excluded && s.laterCount > 0)
  if (settled.length) {
    for (const s of settled) {
      lines.push(`[최신] ${s.coord} 에 후속 ${s.laterCount}건 (${s.later.map((l) => l.id).join(', ')})`)
    }
  } else {
    lines.push('[최신] 모든 좌표에서 최신 문서')
  }

  lines.push(`좌표: ${doc.touches.join(', ')}`)
  return lines.join('\n')
}

// 검사 문장(화면용) — 앞의 id 를 떼고(바로 앞 단추가 그 id 다) 인라인 코드 백틱을 벗긴다. CLI 는 그 줄만 보니 문장에 id 를 둔다
// (실서버 종합 시험 W4 · L7)
export function plainDetail(detail, id = null) {
  let s = String(detail)
  if (id && s.startsWith(id + ' ')) s = s.slice(id.length + 1)
  return s.replace(/`([^`]+)`/g, '$1')
}
