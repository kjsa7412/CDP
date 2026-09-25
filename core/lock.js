// 뮤텍스 — 열쇠 하나에 줄 하나. MCP 설계서 §2.6.
//
// `save` 가 쓰던 것을 파일로 뺐다(동시 기록 검토 v0.1 D1 · D4 · D5). 미러 push 큐 ·
// 「origin 과 맞추기」 · 「트리 되돌리기」 가 **같은 줄**에 서야 한다 — 작업 트리를
// 만지는 것은 레포당 한 번에 하나다. `save.js` 안에 두면 `mirror.js` 가 `save.js` 를
// 들여오고 `save.js` 가 `mirror.js` 를 들여오는 고리가 생긴다.
//
// 앞 것이 거부돼도 다음 것은 돈다 — 거부는 그 요청의 결과이지 줄의 사고가 아니다.

const locks = new Map()

export function withLock(key, fn) {
  const prev = locks.get(key) || Promise.resolve()
  const next = prev.then(fn, fn)
  locks.set(
    key,
    next.then(
      () => {},
      () => {}
    )
  )
  return next
}
