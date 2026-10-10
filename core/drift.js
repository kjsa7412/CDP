// 어긋남 진단 — 반영된 뒤에 시간이 지나며 정본이 원천 · 규칙과 어긋난 자리. 리빌딩 검토 v0.1 §3 · §5.1.
//
// **미반영과 다르다.** 미반영은 「기록이 섹션보다 늦다」 하나이고 큐레이션 대기열이 다룬다. 여기 신호는 미반영이 0 이어도
// 생긴다 — 근거 없는 섹션(D1) · 문단 복제(D2) · 비대(D3) · 일지형(D4) · 좌표로 오지 않는 기록(D5).
//
// **계산만 한다(I8).** 저장하지 않고, `check` 에 넣지 않는다 — 다 경고 감이고 실레포에서 수백 건이다(RB1). `brief` 한 줄 ·
// 큐레이터 도구 `drift` · 화면 「진단」 이 이 함수 하나를 부른다(I1). 매 save 의 `loadRepo` 에는 싣지 않는다 — 부르는 자리만 낸다.

import { recordKind } from './curation.js'
import { splitBaseline } from './baseline.js'

const NL = '\n'

// 문턱 — cdp-curate 의 「대장 섹션이 40줄 · 정의 섹션이 25줄을 넘으면 서술이 들어간 것」. 문서 종류는 등록부의 「종류」 칸에서 온다.
// 대상 · 서술 · 사건은 줄 수로 비대를 재지 않는다(사양 · 절차는 길 수 있다) — 대신 BIG_LINES 를 넘으면 「큼」(쪼갤 후보 · 주입 비용).
// 종류를 모르면(칸이 없는 레포) 예전처럼 40줄
export const OVERSIZE_LINES = 40
export const OVERSIZE_BY_KIND = { 대장: 40, 정의: 25 }
export const BIG_LINES = 150
// 복제로 세는 가장 짧은 줄 — 짧은 줄은 우연히 같다
export const DUP_MIN_CHARS = 40
// 이만큼 넓게 반복되는 줄은 복제가 아니라 레포의 규약이다(`**SoT**` 가리킴 · 자리표시 같은 것 — 검토 Q3 의 385 → ≈130)
export const CONVENTION_MIN = 20
export const CONVENTION_SHARE = 0.05

// 경과 — v1.0 의 `**경과**` 와 v0.x 레포의 `### 변경` · `### 경과` 소제목(그 아래 `· YYYY-MM-DD [기록](…) …` 줄)
const RE_PROGRESS_HEAD = /^(\*\*경과\*\*|#{3,6}\s*(변경|경과)\s*$)/
// 경과 한 줄 — 날짜로 시작하고 그 줄이 작업 기록을 링크한다. 일지형도 복제도 아니다(출처 표시다).
// 날짜와 링크 사이에 글이 와도 된다(「· 2026-10-10 리빌딩 — … [기록](../work/…)」 — ezipez_cdp 리빌딩 실측)
const RE_PROGRESS_LINE = /^[-*·]\s*\(?20\d\d-\d\d-\d\d(?:[^\[]{0,20}\[|.*\]\((?:\.\.\/)*(?:\.\/)?work\/)/
const RE_DIARY = [/^[-*·]?\s*\(?20\d\d-\d\d-\d\d\)?\s/, /20\d\d-\d\d-\d\d.{0,24}(추가|변경|수정|신설|삭제|폐기|바꿨|고쳤)(했|하였|었)?다/]
const isDiary = (t) => !RE_PROGRESS_LINE.test(t) && RE_DIARY.some((re) => re.test(t))

// 섹션 본문에서 큐레이터의 글만 — 기준선 블록 · `**경과**` 아래를 뺀다
export function curatedBody(content) {
  const { curated, block } = splitBaseline(content)
  const lines = curated.split(NL)
  const cut = lines.findIndex((l) => RE_PROGRESS_HEAD.test(l.trim()))
  return { lines: cut >= 0 ? lines.slice(0, cut) : lines, hasBaseline: !!block }
}

// 복제 대조에 쓰는 한 줄 — 표 행 · 경과 줄 · 인용 · 헤딩 · 코드펜스는 복제가 아니다(값 표는 같은 값의 인용일 수 있다)
export function dupKey(line) {
  const t = String(line).trim()
  if (t.length < DUP_MIN_CHARS) return null
  if (t.startsWith('|') || t.startsWith('>') || t.startsWith('#') || t.startsWith('```') || t.startsWith('<!--')) return null
  if (RE_PROGRESS_LINE.test(t)) return null
  // `**SoT**` 줄은 값이 사는 곳을 가리키는 줄이다(검토 Q3 — 복제에서 뺀다). 규약 문턱(5%)만으로는 같은 원천 묶음 두셋이
  // 나눠 가진 SoT 줄이 복제로 남았다(ezipez_cdp 수집원정의서 juso 3종)
  if (/^[-*·]?\s*\*\*SoT\*\*/.test(t)) return null
  const k = t.replace(/^[-*·]\s+/, '').replace(/\s+/g, ' ')
  // 길이는 링크를 뺀 글로 잰다 — 「실측은 [기록](…)」 같은 근거 가리킴은 같은 줄이 여러 섹션에 있어도 복제가 아니다(출처 표시다)
  // 코드 칸(백틱)도 뺀다 — 「… 정본 한 곳 — `table:…`」 처럼 좌표를 거는 한 줄은 cdp-rebuild 가 남기라는 모양이다(복제가 아니다)
  const prose = k.replace(/!?\[[^\]]*\]\([^)]*\)/g, '').replace(/`[^`]*`/g, '').replace(/\s+/g, ' ').trim()
  return prose.length >= DUP_MIN_CHARS ? k : null
}

// 본문이 링크로 가리키는 작업 기록 id — `work/<id>.md` · `../work/<id>.md`. 근거 없는 섹션이 기록을 인용하고 있으면
// 스냅샷보다 **그 기록의 좌표정정**이 낫다(진짜 출처가 남는다 — 리빌딩 검토 §5.2(나))
const RE_WORK_LINK = /\]\((?:\.\.\/)*(?:\.\/)?work\/([^)#/]+)\.md(?:#[^)]*)?\)/g
export function linkedWorkIds(lines, byId) {
  const out = new Set()
  for (const l of lines) for (const m of l.matchAll(RE_WORK_LINK)) if (byId?.has(m[1])) out.add(m[1])
  return [...out]
}

/**
 * @param r      loadRepo 의 결과
 * @param opts.sliceSection  core/tools.js 의 것(순환 import 를 피해 받는다 — baseline.js 와 같다)
 * @param opts.limit         섹션 목록 상한(도구 응답) — 합계는 늘 전부
 * @returns {{ totals, sections: [{ coord, doc, unsourced, duplicated, oversize, diary }], unreachable: [id], conventionLines }}
 */
export function buildDrift(r, { sliceSection, oversizeLines = OVERSIZE_LINES } = {}) {
  if (typeof sliceSection !== 'function') throw new Error('buildDrift 에는 sliceSection 을 넘긴다')

  // 원천 — 그 좌표를 건드린 사람의 기록 · 정본 스냅샷. 전환 · 큐레이션 · 기준선 기록은 원천이 아니다(기준선은 블록으로 본다)
  const sourced = new Set()
  for (const d of r.works) {
    const k = recordKind(d)
    if (k !== 'work' && k !== 'snapshot') continue
    for (const c of d.touches || []) sourced.add(c)
  }

  const rows = []
  const keyOwners = new Map() // 줄 → 그 줄을 가진 좌표들
  for (const s of r.sections) {
    if (s.state === 'anchor-missing' || s.state === 'doc-missing') continue
    const x = sliceSection(r, s.coord)
    if (!x || x.missing) continue
    const { lines, hasBaseline } = curatedBody(x.content || '')
    const text = lines.filter((l) => l.trim())
    // 비대는 글로 잰다 — 표 행(컬럼 정의 · 값 표)은 서술이 아니라 데이터다
    const prose = text.filter((l) => !l.trim().startsWith('|'))
    if (!text.length && !hasBaseline) continue // 빈 섹션 — 어긋날 글이 없다
    const row = { coord: s.coord, doc: x.doc, lines: text.length, big: null, unsourced: !!text.length && !hasBaseline && !sourced.has(s.coord), duplicated: [], oversize: null, diary: 0 }
    if (row.unsourced) {
      const linked = linkedWorkIds(text, r.byId)
      if (linked.length) row.linked = linked
    }
    const kind = r.managedIndex?.find?.(s.coord)?.kind ?? null
    const limit = kind ? OVERSIZE_BY_KIND[kind] ?? null : oversizeLines
    if (limit != null && prose.length > limit) row.oversize = { lines: prose.length, limit, ...(kind ? { kind } : {}) }
    else if (limit == null && prose.length > BIG_LINES) row.big = { lines: prose.length, limit: BIG_LINES, kind }
    // 일지형은 문단 · 목록의 **시작**만 본다 — 앞 줄에 이어 쓴 줄(줄바꿈된 문장)이 날짜로 시작한 것은 일지가 아니다
    // (ezipez_cdp 리빌딩 — 일지형 신호의 다수가 이것이었다)
    for (let k = 0; k < lines.length; k++) {
      const t = lines[k].trim()
      if (!t) continue
      const prev = k > 0 ? lines[k - 1].trim() : ''
      const starts = !prev || /^([-*·]|\d+[.)])\s/.test(t) || /^[-*·]\s*\(?20\d\d-/.test(t)
      if (starts && isDiary(t)) row.diary++
    }
    for (const l of text) {
      const k = dupKey(l)
      if (!k) continue
      if (!keyOwners.has(k)) keyOwners.set(k, new Set())
      keyOwners.get(k).add(s.coord)
    }
    rows.push(row)
  }

  // 규약 줄 — 레포 섹션의 5%(최소 20) 넘게 반복되면 복제로 세지 않는다
  const convention = Math.max(CONVENTION_MIN, Math.ceil(rows.length * CONVENTION_SHARE))
  let conventionLines = 0
  const byCoord = new Map(rows.map((x) => [x.coord, x]))
  const pairs = new Map()
  for (const owners of keyOwners.values()) {
    if (owners.size < 2) continue
    if (owners.size >= convention) {
      conventionLines++
      continue
    }
    for (const c of owners) {
      if (!pairs.has(c)) pairs.set(c, new Set())
      for (const o of owners) if (o !== c) pairs.get(c).add(o)
    }
  }
  for (const [c, set] of pairs) byCoord.get(c).duplicated = [...set].sort()

  // D5 — 좌표 0 · 사람의 기록 · 좌표정정(supersedes 하며 touches 를 단 기록)이 아직 없다
  const corrected = new Set()
  for (const d of r.works) if ((d.touches || []).length) for (const s of d.supersedes || []) corrected.add(s.id)
  const unreachable = r.works.filter((d) => recordKind(d) === 'work' && !(d.touches || []).length && !corrected.has(d.id)).map((d) => d.id)

  const flagged = rows.filter((x) => x.unsourced || x.duplicated.length || x.oversize || x.big || x.diary)
  const totals = {
    sections: rows.length,
    unsourced: rows.filter((x) => x.unsourced).length,
    duplicated: rows.filter((x) => x.duplicated.length).length,
    oversize: rows.filter((x) => x.oversize).length,
    big: rows.filter((x) => x.big).length,
    diary: rows.filter((x) => x.diary).length,
    unreachable: unreachable.length,
    unsourcedLinked: rows.filter((x) => x.linked).length,
  }
  return { totals, sections: flagged.map(({ lines, ...x }) => x), unreachable, conventionLines, convention }
}

// `brief` 의 한 줄 — 신호가 없으면 null(줄을 싣지 않는다)
export function driftLine(t) {
  if (!t) return null
  const parts = []
  if (t.unsourced) parts.push(`근거 없음 ${t.unsourced}`)
  if (t.duplicated) parts.push(`복제 ${t.duplicated}`)
  if (t.oversize) parts.push(`비대 ${t.oversize}`)
  if (t.big) parts.push(`큼 ${t.big}`)
  if (t.diary) parts.push(`일지형 ${t.diary}`)
  if (t.unreachable) parts.push(`좌표 없는 기록 ${t.unreachable}`)
  return parts.length ? `[CDP] 어긋남: ${parts.join(' · ')} — 큐레이터가 drift 로 보고 cdp-rebuild 로 다시 세운다` : null
}
