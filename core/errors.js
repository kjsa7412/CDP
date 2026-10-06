// 오류 — 설계서 §2.3 의 코드. 읽기 도구 · save · 서버 · CLI 가 같은 모양을 던진다.
//
// 전에는 `tools.js`(읽기 도구) 안에 있어서 쓰기 모듈 아홉(save · assets · edits · managedops · docdrop ·
// gitauth · reponew · packages · importdir)이 오류 하나 때문에 읽기 도구 전부를 끌어왔다(v1.0 개편안 §5.1).
// `isError: true` 로 싸는 것은 부르는 쪽(MCP 서버 · CLI)의 일이다 — 여기서는 모양만 정한다.

export class CtxError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'CtxError'
    this.code = code
    this.detail = detail
  }
}

export function toError(e) {
  if (e instanceof CtxError) return { code: e.code, message: e.message, detail: e.detail }
  return { code: 'E_REPO', message: String(e?.message || e) }
}
