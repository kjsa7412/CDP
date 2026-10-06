// 문서 주소 · 열린 문서 탭 — 순수 함수만(시험이 부른다).
//
// **문서가 주소에 있다**(문서 이동 검토 v0.1 A). 전에는 어떤 문서를 열어도 주소가 `/`(서버형 `/r/<레포>/`)라
// 브라우저 뒤로 가기가 이전 문서가 아니라 앱 밖으로 나갔고, 앱이 메모리 스택으로 같은 것을 흉내 냈다가 반만 했다
// (돌아가도 왼쪽이 따라오지 않았다 — H4).
//
//   로컬    /d/<id>[?at=<섹션>]
//   서버형  /r/<레포>/d/<id>[?at=<섹션>]
//
// `<id>` 는 작업문서 id 또는 관리 · 기타 문서의 경로(`docs/테이블정의서.md`) — 조각마다 인코딩해 `/` 로 잇는다.
// 섹션은 해시가 아니라 `?at=` 다 — 해시는 본문 안 `#앵커` 링크가 쓴다.

export function docHref(base, id, at = null) {
  const p = String(id).split('/').map(encodeURIComponent).join('/')
  return base + 'd/' + p + (at ? '?at=' + encodeURIComponent(at) : '')
}

// 라우터의 `rest`(조각마다 디코드됨) · `query` → { id, at } | null
export function docOfRoute(rest, query) {
  if (!rest || rest[0] !== 'd' || rest.length < 2) return null
  const id = rest.slice(1).join('/')
  if (!id) return null
  return { id, at: (query && query.get && query.get('at')) || null }
}

const base = (p) => String(p).split('/').pop()

// 본문 링크는 `./테이블정의서.md` 를 basename(`테이블정의서`)으로 넘긴다 — 찾기에서 연 같은 문서는 경로다.
// 둘이 다르면 같은 문서가 주소 둘 · 탭 둘이 된다. 관리 문서의 경로로 맞춘다.
export function canonDocId(id, managed = []) {
  if (!id) return id
  // 인코딩된 채 온 것(본문 href)은 푼다 — 주소에서 두 번 인코딩되고 서버가 못 찾는다
  if (/%[0-9a-f]{2}/i.test(id)) {
    try {
      id = decodeURIComponent(id)
    } catch {}
  }
  if (managed.some((m) => m.path === id)) return id
  const s = String(id)
  const hit = managed.find((m) => {
    const b = base(m.path)
    return b === s || b.replace(/\.md$/i, '') === s
  })
  return hit ? hit.path : id
}

// 화면에 적을 이름. 목록 어디에도 없으면 `missing` — 지워졌거나 권한 밖이다(이름은 경로 끝으로)
export function docTitle(id, { docs = [], managed = [], others = [] } = {}) {
  const w = docs.find((d) => d.id === id)
  if (w) return { title: w.title || id, missing: false }
  const m = managed.find((x) => x.path === id)
  if (m) return { title: m.name || base(id), missing: false }
  const o = others.find((x) => x.path === id)
  if (o) return { title: base(o.path), missing: false }
  return { title: base(id).replace(/\.md$/i, ''), missing: true }
}

// ── 열린 문서 탭 ────────────────────────────────────────────────────────
//
// 탭은 **이력이 아니다** — 탭은 「펴 둔 것」, 이력(뒤로 · 앞으로)은 「지나온 길」 이다(검토 §4.1).
//   'tab'      찾기 · 검색 · 첫 화면 · 검사 · 도움말 · 본문 링크 — 탭을 더한다(있으면 그 탭으로). 지금 탭 오른쪽에
//   'replace'  뻗어나가기 열 · j/k · 뒤로 · 앞으로 — 지금 탭을 바꾼다. 지금 탭이 고정이면 더한다
// 넘치면 가장 오래 안 본(`seen` — 읽음 시각) 고정 아닌 탭부터 닫는다. 방금 연 탭은 닫지 않는다.

export const TAB_MAX = 8

export function tabsOpen(tabs = [], id, { mode = 'tab', active = null, seen = {}, max = TAB_MAX } = {}) {
  if (!id) return tabs
  if (tabs.some((t) => t.id === id)) return tabs
  const i = tabs.findIndex((t) => t.id === active)
  let next
  if (mode === 'replace' && i >= 0 && !tabs[i].pin) {
    next = tabs.slice()
    next[i] = { id }
  } else {
    next = tabs.slice()
    next.splice(i >= 0 ? i + 1 : next.length, 0, { id })
  }
  while (next.length > max) {
    const cand = next
      .filter((t) => !t.pin && t.id !== id)
      .sort((a, b) => String(seen[a.id] || '').localeCompare(String(seen[b.id] || '')))
    if (!cand.length) break
    next = next.filter((t) => t !== cand[0])
  }
  return next
}

// 닫는다 — 지금 탭이면 오른쪽(없으면 왼쪽) 탭이 다음이다. 남은 탭이 없으면 next 는 null
export function tabsClose(tabs = [], id, active = null) {
  const i = tabs.findIndex((t) => t.id === id)
  if (i < 0) return { tabs, next: active }
  const rest = tabs.filter((t) => t.id !== id)
  if (id !== active) return { tabs: rest, next: active }
  const n = rest[i] || rest[i - 1] || null
  return { tabs: rest, next: n ? n.id : null }
}

export function tabsPin(tabs = [], id) {
  return tabs.map((t) => (t.id === id ? (t.pin ? { id: t.id } : { id: t.id, pin: true }) : t))
}

// 최근 — 지금 문서를 맨 앞에. 화면에는 지금 것을 빼고 10건
export function recentPush(recent = [], id, max = 11) {
  return [id, ...recent.filter((x) => x !== id)].slice(0, max)
}
