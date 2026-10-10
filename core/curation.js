// 큐레이션 — 대기열 · 기록의 큐레이션 상태 · 섹션의 미반영. v1.0 개편안 §4.4 · TODO §1.2.
//
// **저장하지 않고 계산한다**(불변조건 I8). 큐레이션 상태는 큐레이션 기록(`curates`)에서 나오고, 대기열은
// 그 나머지다. 둘 다 작업 기록만 보고 정해지므로 언제 다시 계산해도 같은 답이 나온다.
//
// 기록의 종류 넷 —
//   work      사람의 작업 기록. 대기열에 선다
//   curation  큐레이션 기록(`curates` 키). 다른 기록을 다룬다 · 자신은 대기열에 안 선다
//   baseline  기준선 기록(`baseline` 키). 추출 블록을 갈아 끼운 기록 · 대기열 · 미반영을 만들지 않는다
//   system    옛 문서 층의 기계 기록(tags: registry · docs-prune · derive) — 등록부 · 문서 정리 · 파생 정리
//   snapshot  정본 스냅샷 기록(`snapshot` 키 · 리빌딩 검토 §5.2) — 근거 없던 섹션을 원문 그대로 뜬 것. 섹션이 있으면 이미
//             반영된 것이라 대기열에 서지 않고, **그 좌표의 섹션이 없을 때만**(기록만 옮겨 다시 세운 레포) 대기열에 선다
//
// **큐레이션 기록이 하나도 없는 레포는 「암묵 전환」 으로 읽는다.** v1.0 전의 레포는 파생이 필수였으므로
// 섹션이 최신인 좌표만 건드린 기록은 이미 반영된 것이다. 그것까지 대기열에 세우면 판을 올린 순간 기록 전부가
// 대기열로 쏟아지고, 그 대기열은 첫날부터 믿을 수 없다(큐레이터 설계 K6). 그래서 옛 판정(applied 뒤 후속)이
// 남긴 기록만 대기로 본다 — 전환 기록(`ctx migrate`)이 바로 이 계산을 기록으로 남긴다.

import { cmpDateDesc } from './validity.js'

export const SYSTEM_TAGS = ['registry', 'docs-prune', 'derive']
export const QUEUE_STALE_DAYS = 14
const EXCERPT_MAX = 160

export function recordKind(d) {
  if (d.curates) return 'curation'
  if (d.baseline) return 'baseline'
  if (d.snapshot) return 'snapshot'
  if ((d.tags || []).some((t) => SYSTEM_TAGS.includes(t))) return 'system'
  return 'work'
}

// 오래된 순 — 대기열은 먼저 온 것부터 다룬다
const cmpDateAsc = (a, b) => -cmpDateDesc(a, b)

const slim = (d) => ({ id: d.id, title: d.title ?? null, date: d.date ?? null, author: d.author ?? null })

function daysSince(date, today) {
  if (!date) return null
  const at = Date.parse(String(date).slice(0, 10) + 'T00:00:00Z')
  if (!Number.isFinite(at)) return null
  const t = Date.parse(new Date(today).toISOString().slice(0, 10) + 'T00:00:00Z')
  return Math.max(0, Math.round((t - at) / 86400000))
}

// 본문의 첫 문단 — 헤딩 · 표 · 주석 · 인용을 건너뛴 첫 글 줄들
export function excerptOf(body, max = EXCERPT_MAX) {
  const lines = String(body || '').split('\n')
  const out = []
  let fence = false
  for (const raw of lines) {
    const l = raw.trim()
    if (/^(`{3,}|~{3,})/.test(l)) {
      fence = !fence
      continue
    }
    if (fence) continue
    if (!l) {
      if (out.length) break
      continue
    }
    if (/^(#{1,6}\s|\||<!--|>|---$|!\[)/.test(l)) {
      if (out.length) break
      continue
    }
    out.push(plainInline(l.replace(/^[-*]\s+/, '')))
    if (out.join(' ').length >= max) break
  }
  const t = out.join(' ').replace(/\s+/g, ' ').trim()
  return t.length > max ? t.slice(0, max - 1) + '…' : t
}

// 글 줄의 마크다운 표시를 벗긴다 — 발췌는 화면 · 도구가 글자 그대로 그린다(「**정의**」 가 별표째 보였다 · 사이트 데모 실측).
// 굵게(`**` · 낱말 밖의 `__`) · 코드 백틱 · 링크 · 그림만. 홑 `*` · `_` 는 둔다 — 식별자(`bk_book_mst`)와 곱셈을 깨지 않게
function plainInline(s) {
  return s
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/(^|[^\w])__(.+?)__(?!\w)/g, '$1$2')
    .replace(/`([^`]+)`/g, '$1')
}

// 좌표 하나가 등록부에서 어디로 가나 — 대기열이 기록마다 좌표를 이 셋으로 나눠 보인다
//   section       섹션이 있다(반영 후보)
//   anchor        등록부 행은 있는데 문서나 섹션이 없다
//   unregistered  등록부 행이 없다(새 문서 후보 · 또는 기록으로 둠)
export function coordClass(managedIndex, coord) {
  const hit = managedIndex?.find(coord)
  if (!hit) return 'unregistered'
  if (hit.docMissing || !hit.section) return 'anchor'
  return 'section'
}

// ── 판정 재료 — 대기 기록 하나(v1.0 TODO §1.3 `/queue/<id>` · MCP `queue({ id })`) ─────────────────────────
//
// 큐레이터가 「반영 · 새 문서 · 기록으로 둠」 을 정하는 데 필요한 것을 한 번에 — 기록의 좌표마다 등록부 자리와 섹션 상태,
// 등록부가 없는 타입(새 문서 후보 · 서식 제안은 부르는 쪽이 `forms` 로 채운다), 본문에만 있는 좌표, 그리고 **정본 후보**
// (같은 대기열 안에서 같은 좌표를 건드린 다른 기록 — 묶어서 한 번에 다루라는 신호).
const RE_BODY_COORD = /`([a-z가-힣][a-z0-9가-힣_-]*:[^`\s]+)`/gi

export function materialsOf(r, id) {
  const d = r.byId.get(id)
  if (!d) return null
  const st = r.curation.statusOf(id)
  const coords = (d.touches || []).map((c) => {
    const cls = coordClass(r.managedIndex, c)
    const hit = r.managedIndex?.find(c) || null
    const row = r.sections.find((x) => x.coord === c) || null
    return {
      coord: c,
      cls,
      doc: hit?.doc ?? null,
      state: r.curation.stateOf(c, row),
      applied: row?.applied ?? null,
      pending: r.curation.pendingOf(c).length,
    }
  })
  const types = [...new Set(coords.filter((x) => x.cls === 'unregistered').map((x) => x.coord.slice(0, x.coord.indexOf(':'))))]
  const body = (r.bodies.get(d.path) || '').slice(d.bodyOffset || 0)
  const inTouches = new Set(d.touches || [])
  const bodyOnly = []
  for (const m of body.matchAll(RE_BODY_COORD)) {
    const c = m[1]
    if (inTouches.has(c) || bodyOnly.includes(c) || !r.vocab.coords.has(c)) continue
    bodyOnly.push(c)
  }
  const queued = new Set(r.curation.queue.map((q) => q.id))
  const together = []
  for (const c of d.touches || []) {
    const also = (r.coords.byCoord.get(c) || []).filter((o) => o.id !== id && queued.has(o.id)).map((o) => o.id)
    if (also.length) together.push({ coord: c, also })
  }
  return {
    record: { id: d.id, title: d.title ?? null, date: d.date ?? null, author: d.author ?? null, touches: d.touches || [], excerpt: excerptOf(body) || null },
    status: st,
    coords,
    unregisteredTypes: types.map((type) => ({ type })),
    bodyOnly,
    together,
  }
}

// r 의 일부만 받는다 — loadRepo 와 화면 store 가 같은 함수를 부른다(불변조건 I1)
//   works          작업 기록(layer work · 프론트매터 있음)
//   sections       buildSectionStatus 의 행(옛 판정 — applied 뒤 후속 items)
//   managedIndex   좌표 → 섹션
//   coords         buildCoordIndex(byCoord)
//   bodies         경로 → 원문(발췌용 · 없으면 발췌 없음)
export function buildCuration({ works, sections = [], managedIndex = null, coords = null, bodies = null, today = Date.now() }) {
  const kindOf = new Map(works.map((d) => [d.id, recordKind(d)]))
  const curations = works.filter((d) => kindOf.get(d.id) === 'curation').sort(cmpDateAsc)
  // 암묵 전환은 **옛 파생 이력이 있는 레포**만 — 큐레이션 기록이 없고, 작업 기록을 반영한 섹션(applied)이 하나라도 있을 때.
  // 다시 세운 레포 · 새 레포는 섹션이 없으니 기록 전부가 대기다(그것이 「큐레이션부터 다시」 의 뜻이다)
  const implicit = curations.length === 0 && sections.some((s) => s.applied)

  // 스냅샷은 그 좌표의 섹션이 없을 때만 사람의 기록처럼 대기열에 선다 — 섹션이 있으면 이미 반영된 원문이다(리빌딩 검토 §5.4)
  const live = new Set(sections.filter((s) => s.state !== 'anchor-missing' && s.state !== 'doc-missing').map((s) => s.coord))
  for (const d of works) {
    if (kindOf.get(d.id) === 'snapshot' && (d.touches || []).some((c) => !live.has(c))) kindOf.set(d.id, 'work')
  }

  // ── 기록마다 상태 ──
  const byId = new Map()
  for (const d of works) {
    const k = kindOf.get(d.id)
    if (k !== 'work') byId.set(d.id, { state: 'system', kind: k })
  }
  // 오래된 큐레이션부터 덮어쓴다 — 가장 늦은 판정이 이긴다(재큐레이션)
  for (const c of curations) {
    for (const j of c.curates || []) {
      if (!j.id || !['work', 'snapshot'].includes(kindOf.get(j.id))) continue
      const state = j.verdict === 'keep' ? 'kept' : 'reflected'
      byId.set(j.id, { state, verdict: j.verdict ?? null, into: j.into || [], reason: j.reason ?? null, by: c.id, at: c.date ?? null, ...(j.bad ? { bad: j.bad } : {}) })
    }
  }

  // 암묵 전환 — 옛 판정(applied 뒤 후속 · applied 없음)이 남긴 기록만 대기. 그리고 **등록부는 있는데 섹션이 없는 좌표**를
  // 건드린 기록 — 옛 규칙에서는 그것이 오류(앵커 없음)라 커밋될 수 없었으니, 있다면 v1.0 뒤에 들어온 기록이다.
  // (등록부 없는 좌표만 건드린 기록은 옛 규칙에서도 할 일이 없었다 — 전환 기록(`ctx migrate`)을 남기면 이 어림이 끝난다)
  const legacyPending = new Set()
  if (implicit) {
    for (const s of sections) {
      if (s.state === 'stale' || s.state === 'unwritten' || s.state === 'orphan') for (const it of s.items || []) legacyPending.add(it.id)
    }
    for (const d of works) {
      if (kindOf.get(d.id) !== 'work') continue
      if ((d.touches || []).some((c) => coordClass(managedIndex, c) === 'anchor')) legacyPending.add(d.id)
    }
  }

  const queue = []
  for (const d of works) {
    if (kindOf.get(d.id) !== 'work' || byId.has(d.id)) continue
    if (implicit && !legacyPending.has(d.id)) {
      byId.set(d.id, { state: 'reflected', implicit: true, verdict: null, into: [], reason: null, by: null, at: null })
      continue
    }
    byId.set(d.id, { state: 'queued' })
    queue.push(d)
  }
  queue.sort(cmpDateAsc)

  const excerpt = (d) => {
    if (!bodies) return null
    const text = bodies.get(d.path)
    if (text == null) return null
    return excerptOf(text.slice(d.bodyOffset || 0)) || null
  }

  const queueRows = queue.map((d) => ({
    ...slim(d),
    ageDays: daysSince(d.date, today),
    zero: !(d.touches || []).length,
    coords: (d.touches || []).map((c) => ({ coord: c, cls: coordClass(managedIndex, c) })),
  }))

  // ── 섹션의 미반영 ── 개편안 §4.4 — `later(applied, C) ∪ (대기열 ∩ C 를 건드린 기록)`
  //   later    applied 뒤에 그 좌표를 건드린 기록(옛 판정과 같은 `later()`). 다른 좌표로만 반영된 기록이 여기서 잡힌다 —
  //            판정의 `into` 에서 빠진 좌표의 섹션은 그 기록을 아직 싣지 않았다. **기록으로 둠(keep)은 뺀다** — 큐레이터가
  //            관리 문서로 보내지 않기로 정한 기록이 섹션마다 미반영으로 남으면 소음이다
  //   대기열   날짜가 applied 보다 앞서도(원문 날짜를 단 편입) 판정 전이면 미반영이다(H5)
  //   암묵 전환: 옛 판정 그대로(applied 뒤 후속)
  const queued = new Set(queue.map((d) => d.id))
  const workById = new Map(works.map((d) => [d.id, d]))
  const pendingOf = (coord, row) => {
    let list
    if (implicit) {
      list = (row?.items || []).map((it) => workById.get(it.id)).filter(Boolean)
    } else {
      const later = (row?.items || []).map((it) => workById.get(it.id)).filter((d) => d && byId.get(d.id)?.state !== 'kept')
      const fromQueue = (coords?.byCoord?.get(coord) || []).filter((d) => queued.has(d.id))
      const seen = new Set()
      list = [...later, ...fromQueue].filter((d) => !seen.has(d.id) && seen.add(d.id))
    }
    return list
      .filter((d) => kindOf.get(d.id) === 'work')
      .slice()
      .sort(cmpDateAsc)
      .map((d) => ({ ...slim(d), excerpt: excerpt(d) }))
  }

  const pendingByCoord = new Map()
  for (const s of sections) {
    if (s.state === 'doc-missing' || s.state === 'anchor-missing') continue
    const p = pendingOf(s.coord, s)
    if (p.length) pendingByCoord.set(s.coord, p)
  }

  const last = curations.length ? slim(curations[curations.length - 1]) : null
  const oldestDays = queueRows.length ? queueRows[0].ageDays : null

  return {
    implicit,
    queue: queueRows,
    statusOf: (id) => byId.get(id) || null,
    pendingOf: (coord) => pendingByCoord.get(coord) || [],
    // 섹션 상태 셋(도구 · 화면) — missing · pending · ok
    stateOf(coord, row) {
      if (!row) return 'missing'
      if (row.state === 'doc-missing' || row.state === 'anchor-missing') return 'missing'
      return pendingByCoord.has(coord) ? 'pending' : 'ok'
    },
    stats: {
      queue: queueRows.length,
      oldestDays,
      stale: oldestDays != null && oldestDays > QUEUE_STALE_DAYS,
      pendingSections: pendingByCoord.size,
      last,
    },
  }
}
