// 클립보드 복사 — **http 에서도 된다.**
//
// `navigator.clipboard` 는 보안 컨텍스트(https · localhost)에만 있다. 사내 서버는 `http://10.10.20.188:7374` 라
// 거기서는 `undefined` 였고, 화면 곳곳의 `navigator.clipboard?.writeText(…)` 가 아무 일도 안 하면서 「복사됨」 을
// 띄웠다. 그래서 —
//
//   1) 있으면 `navigator.clipboard.writeText`
//   2) 없거나 거절되면 숨긴 textarea 를 골라 `execCommand('copy')` — 옛 API 지만 http 에서도 도는 유일한 길
//   3) 그것도 안 되면 `prompt` 로 값을 보여 준다 — 사람이 Ctrl+C 로 가져간다. 조용히 실패하지 않는다
//
// 돌려주는 값은 복사됐는지(boolean). 3) 은 false 다 — 부르는 쪽은 「복사됨」 을 띄우지 않는다.

function legacy(text) {
  // 누른 단추 옆에 붙인다 — 모달의 포커스 가두기 밖(body)에 두면 고르기가 풀린다
  const host = document.activeElement?.parentElement || document.body
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.cssText = 'position:fixed;top:0;left:0;width:1px;height:1px;opacity:0;pointer-events:none'
  const prev = document.activeElement
  host.appendChild(ta)
  ta.select()
  ta.setSelectionRange(0, text.length)
  let ok = false
  try {
    ok = document.execCommand('copy')
  } catch {}
  ta.remove()
  try {
    prev?.focus?.({ preventScroll: true })
  } catch {}
  return ok
}

export async function copyText(text) {
  const t = String(text ?? '')
  if (window.isSecureContext && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(t)
      return true
    } catch {}
  }
  if (legacy(t)) return true
  try {
    window.prompt('복사하지 못했습니다 — Ctrl+C 로 가져가세요', t)
  } catch {}
  return false
}
