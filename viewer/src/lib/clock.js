// 서버 시계 — 화면의 「N분 전」 은 **서버가 찍은 시각**을 잰다. 그러니 기준도 서버 시각이어야 한다.
//
// 전에는 브라우저 시계로 쟀다. 실서버는 이 PC 보다 2시간 19분 늦어서, 방금 누른 「다시 검사」 가 「2시간 전」 으로,
// 지금 쓰는 사람이 「마지막 사용 2시간 전」 으로 보였다(실서버 종합 시험 F4). 응답의 `Date` 머리로 차를 재고
// 그만큼 더한다. 머리는 초 단위라 1~2초는 흔들린다 — 분 단위 표시에는 상관없다.

let skew = 0 // 서버 − 브라우저 (ms)
let seen = false

export function noteServerDate(header) {
  if (!header) return
  const t = Date.parse(header)
  if (Number.isNaN(t)) return
  skew = t - Date.now()
  seen = true
}

export const serverNow = () => Date.now() + skew

// 잰 적이 없으면 null — 로컬형(같은 PC)도 재면 0 근처다
export const clockSkew = () => (seen ? skew : null)

// 「이 PC 시계가 서버보다 N분 빠르다」 — 5분 아래는 말하지 않는다(초 단위 머리 · 응답 지연 · 사람이 신경 쓸 일이 아니다)
export function skewText(ms = clockSkew()) {
  if (ms == null || Math.abs(ms) < 5 * 60_000) return null
  const min = Math.round(Math.abs(ms) / 60_000)
  const amount = min >= 120 ? `${Math.floor(min / 60)}시간 ${min % 60}분` : `${min}분`
  // skew = 서버 − PC. 음수면 서버가 늦다 = PC 가 빠르다
  return ms < 0 ? `이 PC 시계가 서버보다 ${amount} 빠르다` : `이 PC 시계가 서버보다 ${amount} 늦다`
}
