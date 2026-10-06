// 도구 12종의 **순수 함수**. MCP 설계서 §2.2.
//
// 왜 core/ 인가 — 설계서 §10 은 `tools/call` 의 결과가 `ctx <명령> --json` 과
// **바이트까지 같기**를 요구한다. 두 곳에서 각자 객체를 만들면 그 요구는 약속일
// 뿐이고, 한쪽에 필드를 더하는 순간 조용히 깨진다. 그래서 형태를 **여기 한 곳**
// 에서만 만들고 CLI 와 MCP 가 둘 다 이것을 부른다 -- 같음이 규율이 아니라
// 구조가 된다.
//
// 여기 있는 것은 전부 **읽기**다. 파일을 쓰지 않는다(§8). `save` 는 서버의
// `core/save.js` 이고 여기 없다.
//
// `repos` · `queue` · `forms` 는 여기 없다. `repos` 는 레포 하나가 아니라 **서버가 든 목록**이고,
// 큐레이터 도구 둘은 `core/curation.js` · `core/formslib.js` 를 MCP 서버가 바로 부른다.

import { repoStatus } from './repo.js'
import { runBuiltinCheck } from './check.js'
import { buildIndex, fullText, tokenize } from './search.js'
import { reconcile } from './vocab.js'
import { resolveCoord } from './managed.js'
import { docNo } from './docrefs.js'
import { docUsage } from './docusage.js'
import { CtxError } from './errors.js'
import { splitBaseline } from './baseline.js'
import { formIdOf } from './forms.js'

const NL = String.fromCharCode(10)

// ── 오류 ────────────────────────────────────────────────────────────────────
//
// 정의는 `core/errors.js` — 여기서는 옛 import 자리(`from './tools.js'`)를 위해 다시 내보낸다.

export { CtxError, toError } from './errors.js'

// ── 입력 검증 (§2.7) ────────────────────────────────────────────────────────
//
// **경로가 되는 값은 전부 여기를 지난다.** 좌표와 id 는 파일 이름으로 쓰이므로
// `..` 하나가 레포 밖을 연다. 정규식이 통과시킨 뒤에도 부르는 쪽에서
// `path.resolve` 후 root 접두 검사를 한 번 더 한다 -- 둘 중 하나가 아니라 둘 다.

// **타입 문자 집합은 `core/vocab.js` 의 COORD 와 같아야 한다.** 전에는 ASCII
// 소문자만 받았는데, 어휘는 한글 타입을 받는다(`테이블정의서:ex_plan_mst` —
// dpms 패키지의 전부가 그렇다). 그래서 MCP 도구가 dpms 레포의 좌표를 전부
// E_COORD 로 거절했다 — 제품화 TODO 5.4 하네스에서 잡았다.
// ASCII 타입은 소문자만이다 — `C:/abs/path` 같은 절대경로가 좌표로 통과하면 안 된다
// (하네스 2번). 한글 타입은 첫 글자가 한글이면 나머지에 영문 · 숫자가 와도 된다.
const RE_COORD = /^(?:[a-z][a-z0-9_-]*|[가-힣][A-Za-z0-9가-힣_-]*):[^\s\x00-\x1f]{1,200}$/
const RE_ID = /^\d{4}-\d{4}-[^/\\\x00-\x1f]{1,120}$/

export function checkCoord(coord) {
  const v = String(coord ?? '')
  if (!RE_COORD.test(v) || v.includes('..')) {
    throw new CtxError('E_COORD', '좌표 형식이 아니다 (type:value)', { coord: v.slice(0, 120) })
  }
  return v
}

export function checkId(id) {
  const v = String(id ?? '')
  if (!RE_ID.test(v) || v.includes('..')) {
    throw new CtxError('E_INPUT', '작업 기록 id 형식이 아니다 (YYYY-MMDD-slug)', { id: v.slice(0, 140) })
  }
  return v
}

function checkWords(list, field, max, maxLen = 100) {
  const a = Array.isArray(list) ? list : []
  if (!a.length || a.length > max) {
    throw new CtxError('E_INPUT', `${field} 는 1~${max}개다`, { field })
  }
  for (const w of a) {
    if (typeof w !== 'string' || !w.trim() || w.length > maxLen) {
      throw new CtxError('E_INPUT', `${field} 의 원소는 1~${maxLen}자 문자열이다`, { field })
    }
  }
  return a
}

// ── 섹션 잘라내기 — core 승격 ───────────────────────────────────────────────
//
// 뷰어와 `ctx where` 가 각자 하던 일이다. `section` 도구가 셋째 소비자가 되는
// 자리라 여기로 올린다. **문서 전체를 읽지 않는다**가 이 함수의 전부다.

export function sliceSection(r, coord) {
  const hit = r.managedIndex?.find(coord)
  if (!hit) return null // 등록부에 없다 — 관리 문서가 없는 타입. 정상이다
  if (hit.docMissing) return { coord, doc: hit.doc, missing: 'doc' }
  if (!hit.section) {
    return { coord, doc: hit.doc, anchor: '#'.repeat(hit.level) + ' ' + hit.value, missing: 'anchor' }
  }
  const s = hit.section
  const lines = (r.bodies.get(hit.doc) || '').split(NL)
  const seg = s.whole ? lines : lines.slice(s.line, s.end)
  // **`content` — 헤딩 줄과 applied 주석을 뺀 본문.** `save` 의 `sections[].body` 에
  // 넣을 것이 이것이다. `body` 는 헤딩부터 실은 원문이라, 그것을 그대로 고쳐 보내면
  // 서버가 헤딩을 또 붙여 파서가 둘째 헤딩을 새 섹션으로 읽는다 — 그 좌표의 섹션이
  // 두 줄만 남고 비는데 save · check · where 어디서도 소리가 안 났다(2026-09-23 실측).
  // 읽은 모양과 쓸 모양이 다르면 부르는 쪽이 그 차이를 외워야 한다. 여기서 맞춘다.
  let inner = s.whole ? lines.slice() : lines.slice(s.line + 1, s.end)
  inner = inner.filter((l, i) => !(i < 3 && /<!--\s*applied\s*:/i.test(l)))
  while (inner.length && !inner[0].trim()) inner.shift()
  while (inner.length && !inner[inner.length - 1].trim()) inner.pop()
  return {
    coord,
    doc: hit.doc,
    anchor: hit.whole ? '(문서 전체)' : '#'.repeat(s.level ?? hit.level) + ' ' + (s.value ?? hit.value),
    heading: s.whole ? null : (lines[s.line] ?? null),
    line: s.whole ? 1 : s.line + 1,
    end: s.whole ? lines.length : s.end,
    applied: s.applied ?? null,
    lines: seg.length,
    chars: seg.reduce((a, l) => a + l.trim().length, 0),
    body: seg.join(NL),
    content: inner.join(NL),
  }
}

// 섹션 상태를 **셋으로 접는다**(v1.0 개편안 §4.4).
//
//   ok        그 섹션이 지금 상태다
//   pending   그 좌표를 건드린 **미반영 기록**이 있다 — 섹션과 함께 그 기록을 읽고, 답에 그 사실을 적는다
//   missing   문서나 앵커가 없다 — 주입해도 빈손이다
//
// 미반영은 큐레이션 계산(`core/curation.js`)이 정한다 — 큐레이션된 레포는 「그 좌표를 건드린 대기 기록」,
// 옛 레포는 옛 판정(applied 뒤 후속). `r` 이 없으면(옛 호출) 옛 판정으로 접는다.
export function sectionState(sec, r = null) {
  if (!sec) return 'missing'
  if (sec.state === 'doc-missing' || sec.state === 'anchor-missing') return 'missing'
  if (r?.curation) return r.curation.stateOf(sec.coord, sec)
  if (sec.state === 'stale' || sec.state === 'unwritten' || sec.state === 'orphan') return 'pending'
  return 'ok'
}

// 미반영 기록의 본문 — `section` 이 섹션과 함께 싣는다(I7 · 보증은 도구가 한다). 응답이 불어나지 않게 상한을 둔다:
// 기록 8건 · 한 건 6,000자 · 합 30,000자. 넘으면 자르고 `truncated` · 남은 건수는 `pendingOmitted` 로 알린다.
export const PENDING_MAX = 8
export const PENDING_BODY_MAX = 6000
export const PENDING_TOTAL_MAX = 30000
// 본문이 가리키는 좌표의 정본 섹션 — **한 단계** · 5개 · 한 섹션 3,000자(개편안 V10 · K10)
export const REFS_MAX = 5
export const REF_BODY_MAX = 3000

const RE_BODY_COORD = /`([a-z가-힣][a-z0-9가-힣_-]*:[^`\s]+)`/gi

function pendingRecords(r, list) {
  let total = 0
  const out = []
  for (const p of list.slice(0, PENDING_MAX)) {
    const d = r.byId.get(p.id)
    if (!d) continue
    const text = (r.bodies.get(d.path) || '').slice(d.bodyOffset || 0).replace(/^\s+/, '')
    const room = Math.max(0, Math.min(PENDING_BODY_MAX, PENDING_TOTAL_MAX - total))
    const body = text.slice(0, room)
    total += body.length
    out.push({ id: d.id, title: d.title ?? null, date: d.date ?? null, author: d.author ?? null, touches: d.touches || [], body, truncated: body.length < text.length })
  }
  return out
}

function bodyRefs(r, coord, content) {
  const seen = new Set([coord])
  const out = []
  for (const m of String(content || '').matchAll(RE_BODY_COORD)) {
    const c = m[1]
    if (seen.has(c)) continue
    seen.add(c)
    if (!r.vocab.coords.has(c)) continue
    const cut = sliceSection(r, c)
    if (!cut || cut.missing) continue
    const text = cut.content || ''
    out.push({ coord: c, doc: cut.doc, anchor: cut.anchor, state: sectionState(r.sections.find((x) => x.coord === c) || null, r), content: text.slice(0, REF_BODY_MAX), truncated: text.length > REF_BODY_MAX })
    if (out.length >= REFS_MAX) break
  }
  return out
}

// 관리 문서의 서식 표지 — H1 바로 아래 `<!-- cdp:form <묶음>/<번호> -->`(개편안 §4.3 · V6)
export const formIdOfText = (text) => formIdOf(text)

// ── match ───────────────────────────────────────────────────────────────────
//
// **레포를 가로지르는 유일한 도구다**(§2.9). 다만 가로지르는 것은 부르는 쪽의
// 일이고 -- 여기서는 레포 하나를 본다. `repo` 를 붙이는 것도 부르는 쪽이다.

const KIND = { canonical: '이름', label: '이름', value: '값', alias: 'alias' }

export function toolMatch(r, { names } = {}) {
  const list = checkWords(names, 'names', 20)
  return list.map((q) => {
    const hit = reconcile(r.vocab, q)
    if (!hit) {
      const docs = docHits(r, q)
      return { name: q, coord: null, kind: '미등재', vocabLine: null, ...(docs.length ? { docs } : {}) }
    }
    const e = r.vocab.coords.get(hit.coord)
    const row = {
      name: q,
      coord: hit.coord,
      kind: KIND[hit.kind] || hit.kind,
      // 넷으로 접은 kind 는 canonical 과 label 을 둘 다 '이름' 으로 만든다.
      // CLI 의 사람용 출력은 그 둘을 구분해 왔으므로 원래 값도 같이 낸다.
      matchedBy: hit.kind,
      exact: !!hit.exact,
      vocabLine: e ? e.line : null,
    }
    // 폐기 좌표는 **후속을 같이 준다.** 명함이 "다른 좌표로 바꾸지 말라"고
    // 말하는 자리라, 바꿔도 되는 유일한 경우를 값으로 알려야 한다.
    if (e?.deprecated) {
      row.deprecated = e.deprecated
      row.successor = e.supersededBy ?? null
    }
    return row
  })
}

// ── where ───────────────────────────────────────────────────────────────────

export function toolWhere(r, { coord, limit = 5 } = {}) {
  const raw = checkCoord(coord)
  const n = Math.min(Math.max(parseInt(limit ?? 5, 10) || 5, 1), 50)

  // alias 를 받으면 정본으로 바꾸고 **바꿨다는 사실을 남긴다.** 조용히 바꾸면
  // 부른 쪽은 자기가 준 좌표의 답을 받았다고 읽는다.
  let c = raw
  let normalized
  if (!r.vocab.coords.has(raw)) {
    const hit = reconcile(r.vocab, raw)
    if (hit && hit.coord !== raw) {
      normalized = { from: raw, to: hit.coord }
      c = hit.coord
    }
  }

  const registry = resolveCoord(r.registry, c)
  const sec = r.sections.find((x) => x.coord === c) || null
  const cut = sliceSection(r, c)
  const works = r.coords.byCoord.get(c) || []

  const out = {
    coord: c,
    registry,
    section: registry
      ? {
          doc: sec?.doc ?? registry.doc,
          anchor: sec?.anchor ?? cut?.anchor ?? null,
          line: cut?.line ?? null,
          end: cut?.end ?? null,
          applied: sec?.applied ?? null,
          state: sectionState(sec, r),
          pending: r.curation ? r.curation.pendingOf(c).length : (sec?.count ?? 0),
        }
      : null,
    works: works.slice(0, n).map((d) => ({ id: d.id, date: d.date ?? null, title: d.title ?? null })),
    total: works.length,
  }
  if (normalized) out.normalized = normalized
  return out
}

// ── section ─────────────────────────────────────────────────────────────────
//
// 없으면 **`body: null` 로 알린다.** 오류로 던지지 않는다 -- 등록부에 없는
// 타입은 관리 문서가 없는 것이 정상이고(명함), 그것은 실패가 아니다.

//
// **미반영 기록을 같이 싣는다**(v1.0 개편안 I7 · V10). 섹션은 큐레이터가 반영한 데까지만 지금이다 — 그 뒤에 그 좌표를
// 건드린 기록(`pending`)이 있으면 그 본문(`pendingRecords`)을 함께 읽어야 지금을 안다. 이것을 스킬에 맡기면 보증이
// LLM 의 선의에 걸린다(H6). 섹션이 없어도(새 좌표 · 등록부 없는 타입) 미반영 기록은 낸다 — 그때는 그 기록이
// 유일한 근거다. 본문이 가리키는 좌표의 정본 섹션도 한 단계 따라가 싣는다(`refs`) — 큐레이터가 같은 사실을
// 섹션마다 복제하지 않고 정본 좌표를 걸 수 있는 짝이다.

// `toolSection` 의 결과를 **글 하나로** — MCP 리소스 · 프롬프트처럼 JSON 을 못 싣는 자리도 섹션과 미반영 기록을 같이 낸다(I7).
// 섹션만 내면 그 자리는 「섹션 = 지금」 이라고 말하는 셈이다
export function sectionMarkdown(s) {
  const parts = [s.body ?? '(섹션 없음)']
  const recs = s.pendingRecords || []
  if (recs.length) {
    parts.push('', `## 미반영 기록 ${s.pending?.length ?? recs.length}건 — 이 섹션 뒤에 이 좌표를 건드렸고 큐레이터가 아직 반영하지 않았다. 섹션과 함께 읽어야 지금이다`)
    for (const p of recs) parts.push('', `### ${p.id}${p.date ? ' · ' + p.date : ''}${p.title ? ' · ' + p.title : ''}`, '', p.body + (p.truncated ? '\n\n(…잘림 — work 로 전문)' : ''))
    if (s.pendingOmitted) parts.push('', `(더 있다 — ${s.pendingOmitted}건 · section 도구의 pending 목록)`)
  }
  return parts.join('\n')
}

export function toolSection(r, { coord } = {}) {
  const c = checkCoord(coord)
  const cut = sliceSection(r, c)
  const sec = r.sections.find((x) => x.coord === c) || null
  const pending = r.curation ? r.curation.pendingOf(c) : []
  // 섹션이 없는 좌표 — 대기열 기록 중 이 좌표를 건드린 것이 근거다
  const loose = r.curation && (!cut || cut.missing) ? (r.coords.byCoord.get(c) || []).filter((d) => r.curation.statusOf(d.id)?.state === 'queued') : []
  const pendingList = pending.length ? pending : loose.map((d) => ({ id: d.id, title: d.title ?? null, date: d.date ?? null, author: d.author ?? null }))
  const records = pendingRecords(r, pendingList)
  const extra = {
    pending: pendingList,
    ...(records.length ? { pendingRecords: records } : {}),
    ...(pendingList.length > PENDING_MAX ? { pendingOmitted: pendingList.length - PENDING_MAX } : {}),
  }
  if (!cut || cut.missing) {
    return {
      coord: c,
      doc: cut?.doc ?? null,
      anchor: cut?.anchor ?? null,
      line: null,
      end: null,
      applied: null,
      heading: null,
      body: null,
      state: 'missing',
      reason: !cut ? 'unregistered' : cut.missing === 'doc' ? 'doc-missing' : 'anchor-missing',
      ...extra,
    }
  }
  const refs = bodyRefs(r, c, cut.content)
  // 기준선 블록은 따로 — `content` 는 큐레이터가 고칠 글(블록을 뺀 것)이고 save 가 블록을 다시 붙인다
  const sb = splitBaseline(cut.content)
  return {
    coord: c,
    doc: cut.doc,
    anchor: cut.anchor,
    line: cut.line,
    end: cut.end,
    applied: cut.applied,
    heading: cut.heading,
    body: cut.body,
    content: sb.curated,
    ...(sb.block ? { baseline: { src: sb.block.src, asof: sb.block.asof, body: sb.block.body } } : {}),
    state: sectionState(sec, r),
    form: formIdOfText(r.bodies.get(cut.doc)),
    ...extra,
    ...(refs.length ? { refs } : {}),
  }
}

// ── work ────────────────────────────────────────────────────────────────────

export function toolWork(r, { id } = {}) {
  const key = checkId(id)
  const doc = r.byId.get(key)
  if (!doc) throw new CtxError('E_NOT_FOUND', '그 id 의 작업 기록이 없다', { id: key })
  const text = r.bodies.get(doc.path) || ''
  return {
    id: doc.id,
    path: doc.path,
    frontmatter: {
      title: doc.title ?? null,
      date: doc.date ?? null,
      author: doc.author ?? null,
      source: doc.source ?? null,
      status: doc.status ?? null,
      touches: doc.touches ?? [],
      touchesEmpty: doc.touchesEmpty ?? null,
      supersedes: doc.supersedes ?? null,
      tags: doc.tags ?? [],
      ...(doc.curates ? { curates: doc.curates } : {}),
      ...(doc.baseline ? { baseline: doc.baseline } : {}),
    },
    // 이 기록의 큐레이션 상태 — 대기 · 반영됨(into) · 기록으로 둠(reason) · system(큐레이션 · 기준선 · 옛 기계 기록)
    curation: r.curation ? r.curation.statusOf(doc.id) : null,
    body: text.slice(doc.bodyOffset || 0),
  }
}

// ── search ──────────────────────────────────────────────────────────────────
//
// `match` 가 미등재를 낼 때의 폴백이다. **본문은 싣지 않는다** -- 후보를 고른
// 뒤 `section` 으로 읽는 것이 순서다(명함).

export function toolSearch(r, { words, limit = 12 } = {}) {
  const list = checkWords(words, 'words', 10)
  const n = Math.min(Math.max(parseInt(limit ?? 12, 10) || 12, 1), 50)

  const cand = new Map()
  const get = (coord) => {
    let c = cand.get(coord)
    if (!c) cand.set(coord, (c = { coord, hits: new Set(), works: new Set(), section: false }))
    return c
  }

  // ① 작업 기록 전문검색 — **말마다 따로 돌린다.** 질의 전체를 AND 로 넣으면
  // 요청문에만 있는 말 하나가 나머지 전부를 죽인다(ctx-cli.mjs 의 같은 주석).
  const mini = buildIndex(r.docs, r.bodies)
  for (const w of list) {
    for (const hit of fullText(mini, w, 20)) {
      const d = r.byPath.get(hit.path)
      if (!d || d.layer !== 'work') continue
      for (const coord of d.touches) {
        const c = get(coord)
        c.hits.add(w)
        if (c.works.size < 3) c.works.add(d.id)
      }
    }
  }

  // ② 관리 문서 섹션 — 작업 기록이 없는 좌표는 ①로는 안 나온다. 섹션에
  // 내용이 있는데도.
  for (const coord of r.allCoords) {
    const cut = sliceSection(r, coord)
    if (!cut || cut.missing) continue
    const toks = new Set(tokenize(cut.body))
    for (const w of list) {
      if (wordHit(w, toks)) {
        const c = get(coord)
        c.hits.add(w)
        c.section = true
      }
    }
  }

  return [...cand.values()]
    .sort((a, b) => b.hits.size - a.hits.size || b.section - a.section || a.coord.localeCompare(b.coord))
    .slice(0, n)
    .map((c) => ({
      coord: c.coord,
      hits: [...c.hits],
      docs: sliceSection(r, c.coord)?.doc ? [sliceSection(r, c.coord).doc] : [],
      works: [...c.works],
      section: c.section,
    }))
}

// 말 하나가 이 토큰 집합에 있나. 한글은 2-gram 이라 띄어쓰기가 바이그램을
// 끊는다 -- "거래처코드" 대 "거래처 코드". 전부 일치를 요구하지 않는다.
function wordHit(w, toks) {
  const t = tokenize(w)
  if (!t.length) return false
  const need = t.length <= 2 ? t.length : Math.ceil(t.length * 0.7)
  return t.filter((x) => toks.has(x)).length >= need
}

// ── check · brief ──────────────────────────────────────────

export function toolCheck(r) {
  const res = runBuiltinCheck({
    docs: r.docs,
    vocabText: r.vocabText,
    managedText: r.managedText,
    vocab: r.vocab,
    validity: r.validity,
    indexInfo: r.indexInfo,
    managedIndex: r.managedIndex,
    sections: r.sections,
    bodies: r.bodies,
    curation: r.curation,
  })
  const errors = res.findings.filter((f) => f.sev === 'error').reduce((a, f) => a + f.items.length, 0)
  const warnings = res.findings.filter((f) => f.sev === 'warn').reduce((a, f) => a + f.items.length, 0)
  return { ok: errors === 0, errors, warnings, findings: res.findings }
}

// 두 줄. 첫 줄은 절차, 둘째 줄은 **살아 있는 레포 상태**다.
// `repoStatus` 도 같이 낸다 -- CLI 의 `--json` 이 지금 그것을 내고 있고,
// 필드를 빼면 그쪽이 깨진다.
export function toolBrief(r, { built = null, now = Date.now() } = {}) {
  const st = repoStatus(r)
  const parts = [`작업 기록 ${st.works}`, `관리 문서 ${st.managedDocs}`]
  const cs = r.curation?.stats
  if (cs?.queue) parts.push(`큐레이션 대기 ${cs.queue}${cs.oldestDays != null ? ` (가장 오래된 ${cs.oldestDays}일)` : ''}`)
  if (cs?.pendingSections) parts.push(`미반영 섹션 ${cs.pendingSections} — section 이 미반영 기록을 같이 준다`)
  if (st.unregistered.length) parts.push(`미등재 좌표 ${st.unregistered.length}`)
  if (st.legacyPending.length) {
    parts.push(`미결 ${st.legacyPending.length} — 이슈 대장으로 이관 (최장 ${st.legacyPending[0].days}일)`)
  }
  if (st.indexStale) parts.push('INDEX 불일치')
  const lines = [
    '[CDP] 절차: (1) 검토(대상 추출) -> (2) 맥락 주입(필요시) -> (3) 요청수행 / 작업 끝에 cdp-save',
    '[CDP] 레포: ' + parts.join(' · '),
  ]
  const age = bundleAgeNotice(built, now)
  if (age) lines.push(age)
  return { lines, ...st, ...(cs ? { curation: cs } : {}) }
}

// ── 응답 상한 (§8) ──────────────────────────────────────────────────────────
//
// `section` · `work` 는 본문을 싣는다. 팩터정의서 245KB 같은 것이 그대로 오면
// 컨텍스트가 한 번에 날아간다. 넘으면 **자르지 않고 거절한다** -- 잘린 정본은
// 정본이 아니고, 부르는 쪽은 잘렸다는 것을 모른 채 답한다.

export const BODY_LIMIT = 512 * 1024

// ── 번들 나이 (§3.0 · 하네스 20번) ──────────────────────────────────────────
//
// 번들이 낡으면 옛 판정을 낸다 — 그리고 조용하다. `brief` 가 그 사실을 한 줄로
// 말한다. 90일은 토큰 만료와 같은 주기다. `built` 가 번들이 아니면(`__…`) 말이 없다.
export const BUNDLE_MAX_DAYS = 90

export function bundleAgeNotice(built, now = Date.now(), maxDays = BUNDLE_MAX_DAYS) {
  if (!built || String(built).startsWith('__')) return null
  const at = Date.parse(String(built).replace(' ', 'T') + (String(built).length <= 10 ? 'T00:00:00' : ':00'))
  if (!Number.isFinite(at)) return null
  const days = Math.floor((now - at) / 86400_000)
  if (days < maxDays) return null
  return `[CDP] 번들이 ${days}일 됐다 (${built}) — 새 판을 받는다. 낡은 번들은 옛 판정을 낸다 (ctx version)`
}

export function guardSize(obj, what) {
  const n = Buffer.byteLength(JSON.stringify(obj), 'utf8')
  if (n > BODY_LIMIT) {
    throw new CtxError('E_INPUT', `${what} 이 ${Math.round(n / 1024)}KB 로 상한(512KB)을 넘는다 — 더 좁혀 부른다(좌표 하나 · 문서 하나 · 기록 하나)`, {
      bytes: n,
      limit: BODY_LIMIT,
    })
  }
  return obj
}

// ── docs (등록부 사본 검토 X20~X22) ────────────────────────────────────────
//
// 관리 문서 목록 · 등록부 행 · 한 문서의 원문. 전에는 이것을 볼 도구가 없어 에이전트가 문서화되지 않은 뷰어
// HTTP API(`/api/<repo>/docs` · `/file`)를 토큰으로 직접 불렀다(서버형 편입 세션 한 번에 문서 찾는 데만 10회 이상).
// 비대상 문서(회의록 같은 날짜축)는 `section` 으로 읽을 길도 없다 — `save` 의 `edits` 는 `old` 를 원문에서 떼야 한다.

// 파일 이름 앞의 관리번호 — `BM_411_회의록.md` → `BM_411`. 사람이 부르는 이름이 그것이다
// 정의는 `docrefs.js` — 참조 찾기가 같은 열쇠를 쓴다
export { docNo }

function docTitle(r, p) {
  const t = r.bodies.get(p) || ''
  const h = t.split(NL).find((l) => /^#\s/.test(l))
  return h ? h.replace(/^#\s+/, '').trim() : p.split('/').pop().replace(/\.md$/i, '')
}

const anchorText = (rule) => (rule.whole ? '—' : '#'.repeat(rule.level) + ' {값}')

function rulesOf(r, p) {
  return (r.registry?.rules || []).filter((x) => x.doc.toLowerCase() === p.toLowerCase())
}

// 목록의 각 문서에 `usage`(관리문서 정리 검토 §4.6) — 실제로 쓴 섹션 · 작업 기록 · 들어오는 참조 · 필수 제출 · 마지막 변경.
// `state` 는 제안이다. 지우는 것은 admin 이 save 의 managed: [{ op: "drop" }] 로
export function toolDocs(r, { doc, lastChange } = {}) {
  if (doc == null || doc === '') {
    const usage = docUsage(r, { lastChange: lastChange || new Map() })
    const docs = r.managedDocs
      .map((d) => {
        const rules = rulesOf(r, d.path)
        const levels = new Set(rules.filter((x) => !x.whole).map((x) => x.level))
        return {
          path: d.path,
          no: docNo(d.path),
          title: docTitle(r, d.path),
          registered: rules.length > 0,
          rules: rules.map((x) => ({ pattern: x.pattern, anchor: anchorText(x) })),
          sections: (d.managedSections || []).filter((s) => (levels.size ? levels.has(s.level) : s.level === 2)).length,
          usage: usage.get(d.path),
        }
      })
      .sort((a, b) => a.path.localeCompare(b.path))
    return {
      docs,
      total: docs.length,
      registered: docs.filter((d) => d.registered).length,
      registry: (r.registry?.rules || []).map((x) => ({ pattern: x.pattern, doc: x.doc, anchor: anchorText(x), line: x.line, missing: !r.byPath.has(x.doc) })),
      files: ['_vocab.md', '_managed.md'],
    }
  }
  const want = String(doc)
  if (want === '_vocab.md' || want === '_managed.md') {
    const text = want === '_vocab.md' ? r.vocabText : r.managedText
    if (text == null) throw new CtxError('E_NOT_FOUND', `${want} 가 없다`, { doc: want })
    return { path: want, text }
  }
  const d =
    r.managedDocs.find((x) => x.path === want) ||
    r.managedDocs.find((x) => x.path.toLowerCase() === want.toLowerCase()) ||
    r.managedDocs.find((x) => docNo(x.path)?.toLowerCase() === want.toLowerCase())
  if (!d) throw new CtxError('E_NOT_FOUND', '그 관리 문서가 없다 — docs() 로 목록을 본다', { doc: want.slice(0, 120) })
  const rules = rulesOf(r, d.path)
  const types = [...new Set(rules.map((x) => x.pattern.slice(0, x.pattern.indexOf(':'))))]
  return {
    path: d.path,
    no: docNo(d.path),
    title: docTitle(r, d.path),
    registered: rules.length > 0,
    rules: rules.map((x) => ({ pattern: x.pattern, anchor: anchorText(x) })),
    headings: (d.managedSections || []).map((s) => {
      const coord = types.map((t) => t + ':' + s.value).find((c) => {
        const h = resolveCoord(r.registry, c)
        return h && h.doc.toLowerCase() === d.path.toLowerCase() && h.level === s.level && r.vocab.coords.has(c)
      })
      return { level: s.level, value: s.value, title: s.title, line: s.line + 1, applied: s.applied ?? null, coord: coord ?? null }
    }),
    text: r.bodies.get(d.path) || '',
  }
}

// 좌표가 안 잡힌 말 → 문서 이름 · 관리번호 · 제목(X22). 좌표가 아니라는 사실은 그대로 두고 문서가 있다는 것만 더한다
export function docHits(r, name) {
  const q = normKey(name)
  if (q.length < 2) return []
  const out = []
  for (const d of r.managedDocs) {
    const no = docNo(d.path)
    const stem = d.path.split('/').pop().replace(/\.md$/i, '')
    const bare = no ? stem.slice(no.length).replace(/^[_ -]+/, '') : stem
    const title = docTitle(r, d.path)
    const keys = [no, stem, bare, title].filter(Boolean).map(normKey)
    if (keys.some((k) => k === q) || normKey(bare).includes(q)) {
      out.push({ path: d.path, no, title, registered: rulesOf(r, d.path).length > 0 })
    }
  }
  return out.slice(0, 5)
}

function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_\-·]/g, '')
}
