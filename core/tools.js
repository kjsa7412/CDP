// 도구 12종의 **순수 함수**. MCP 설계서 §2.2.
//
// 왜 core/ 인가 — 설계서 §10 은 `tools/call` 의 결과가 `ctx <명령> --json` 과
// **바이트까지 같기**를 요구한다. 두 곳에서 각자 객체를 만들면 그 요구는 약속일
// 뿐이고, 한쪽에 필드를 더하는 순간 조용히 깨진다. 그래서 형태를 **여기 한 곳**
// 에서만 만들고 CLI 와 MCP 가 둘 다 이것을 부른다 -- 같음이 규율이 아니라
// 구조가 된다.
//
// 여기 있는 것은 전부 **읽기**다. 파일을 쓰지 않는다(§8). `save` 는 모드 B 의
// 서버만 갖고 여기 없다.
//
// `sync` · `version` · `repos` 는 여기 없다. 앞의 둘은 git 과 프로세스를 봐야
// 하고(비동기), `repos` 는 레포 하나가 아니라 **서버가 든 목록**이라 층이 다르다.

import { repoStatus } from './repo.js'
import { runBuiltinCheck } from './check.js'
import { buildIndex, fullText, tokenize } from './search.js'
import { outline } from './frontmatter.js'
import { reconcile } from './vocab.js'
import { resolveCoord } from './managed.js'
import { cmpDateDesc } from './validity.js'

const NL = String.fromCharCode(10)

// ── 오류 ────────────────────────────────────────────────────────────────────
//
// 설계서 §2.3 의 코드 9종. `isError: true` 로 싸는 것은 부르는 쪽(MCP 서버 ·
// CLI)의 일이다 -- 여기서는 던지기만 한다.

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

// 섹션 상태를 **셋으로 접는다.** `validity.js` 의 다섯(ok·stale·unwritten·
// empty·orphan)은 `ctx check` 만 읽는 내부 값이고 그 파일이 "화면에 나가지
// 않는다"고 못박아 두었다. 도구는 그 규칙을 그대로 따른다 (§2.2).
//
//   ok              그 섹션이 지금 상태다
//   derive-pending  뒤에 반영 안 된 작업이 있다 — 답에 그 사실을 적어야 한다
//   missing         문서나 앵커가 없다 — 주입해도 빈손이다
export function sectionState(sec) {
  if (!sec) return 'missing'
  if (sec.state === 'doc-missing' || sec.state === 'anchor-missing') return 'missing'
  if (sec.state === 'stale' || sec.state === 'unwritten' || sec.state === 'orphan') return 'derive-pending'
  return 'ok'
}

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
          state: sectionState(sec),
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

export function toolSection(r, { coord } = {}) {
  const c = checkCoord(coord)
  const cut = sliceSection(r, c)
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
      reason: !cut ? 'unregistered' : cut.missing === 'doc' ? 'doc-missing' : 'anchor-missing',
    }
  }
  return {
    coord: c,
    doc: cut.doc,
    anchor: cut.anchor,
    line: cut.line,
    end: cut.end,
    applied: cut.applied,
    heading: cut.heading,
    body: cut.body,
    content: cut.content,
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
    },
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

// ── derive · apply · check · brief ──────────────────────────────────────────

export function toolDerive(r) {
  const st = repoStatus(r)
  return { pendingDerive: [...st.pendingDerive], brokenSections: st.brokenSections }
}

// 붙일 **변경 줄**만 낸다. CLI 는 사람을 향한 안내문을 같이 내지만 도구는
// 값만 낸다 -- 절차 문장은 스킬의 것이다(근거 문서 §3).
export function toolApply(r, { coord } = {}) {
  const c = checkCoord(coord)
  const sec = r.sections.find((x) => x.coord === c)
  if (!sec) return { coord: c, doc: null, anchor: null, lines: [], reason: 'unregistered' }
  if (sec.state === 'ok') {
    return { coord: c, doc: sec.doc, anchor: sec.anchor ?? null, lines: [], reason: 'already-applied', applied: sec.applied }
  }
  const items = sec.items.length ? sec.items : (r.coords.byCoord.get(c) || []).slice().sort(cmpDateDesc)
  if (!items.length) return { coord: c, doc: sec.doc, anchor: sec.anchor ?? null, lines: [], reason: 'no-work' }

  const newest = items[0]
  const lines = [`<!-- applied: ${sec.applied || 'null'} -> ${newest.id} -->`]
  for (const i of items.slice().reverse()) {
    lines.push(`**변경** · ${i.date || ''} [\`${String(i.id).replace(/^\d{4}-\d{4}-/, '')}\`](../work/${i.id}.md)`)
  }
  return {
    coord: c,
    doc: sec.doc,
    anchor: sec.anchor ?? null,
    applied: sec.applied ?? null,
    lines,
    // 목차를 같이 준다 — "무엇을 옮겨야 하는지" 없이 "직접 고치세요" 는
    // 지시가 아니라 소원이다(ctx-cli.mjs 의 같은 주석).
    sources: items.map((i) => {
      const doc = r.byId.get(i.id) || i
      const body = r.bodies.get(doc.path) || ''
      return {
        id: i.id,
        date: i.date ?? null,
        path: `work/${i.id}.md`,
        outline: outline(body.slice(doc.bodyOffset || 0)).slice(0, 12).map((h) => h.title),
      }
    }),
  }
}

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
  if (st.pendingDerive.length) parts.push(`파생 남음 ${st.pendingDerive.length}`)
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
  return { lines, ...st }
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
    throw new CtxError('E_INPUT', `${what} 이 ${Math.round(n / 1024)}KB 로 상한(512KB)을 넘는다 — cdp://<repo>/doc 리소스로 읽어라`, {
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
export function docNo(p) {
  const m = String(p).split('/').pop().match(/^([A-Za-z]{1,6}[_-]\d{1,5})(?=[_ -])/)
  return m ? m[1] : null
}

function docTitle(r, p) {
  const t = r.bodies.get(p) || ''
  const h = t.split(NL).find((l) => /^#\s/.test(l))
  return h ? h.replace(/^#\s+/, '').trim() : p.split('/').pop().replace(/\.md$/i, '')
}

const anchorText = (rule) => (rule.whole ? '—' : '#'.repeat(rule.level) + ' {값}')

function rulesOf(r, p) {
  return (r.registry?.rules || []).filter((x) => x.doc.toLowerCase() === p.toLowerCase())
}

export function toolDocs(r, { doc } = {}) {
  if (doc == null || doc === '') {
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
