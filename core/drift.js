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

// 문턱 — cdp-curate 의 「대장 섹션이 40줄 · 정의 섹션이 25줄을 넘으면 서술이 들어간 것」. 서식 guide 가 값을 주면 그것이 이긴다(열린 질문 2)
export const OVERSIZE_LINES = 40
// 복제로 세는 가장 짧은 줄 — 짧은 줄은 우연히 같다
export const DUP_MIN_CHARS = 40
// 이만큼 넓게 반복되는 줄은 복제가 아니라 레포의 규약이다(`**SoT**` 가리킴 · 자리표시 같은 것 — 검토 Q3 의 385 → ≈130)
export const CONVENTION_MIN = 20
export const CONVENTION_SHARE = 0.05

// 경과 — v1.0 의 `**경과**` 와 v0.x 레포의 `### 변경` · `### 경과` 소제목(그 아래 `· YYYY-MM-DD [기록](…) …` 줄)
const RE_PROGRESS_HEAD = /^(\*\*경과\*\*|#{3,6}\s*(변경|경과)\s*$)/
// 경과 한 줄 — 날짜 뒤에 기록 링크가 온다. 일지형이 아니다(출처 표시다)
const RE_PROGRESS_LINE = /^[-*·]\s*\(?20\d\d-\d\d-\d\d[^\[]{0,20}\[/
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
  const k = t.replace(/^[-*·]\s+/, '').replace(/\s+/g, ' ')
  return k.length >= DUP_MIN_CHARS ? k : null
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
    if (!text.length && !hasBaseline) continue // 빈 섹션 — 어긋날 글이 없다
    const row = { coord: s.coord, doc: x.doc, lines: text.length, unsourced: !!text.length && !hasBaseline && !sourced.has(s.coord), duplicated: [], oversize: null, diary: 0 }
    if (text.length > oversizeLines) row.oversize = { lines: text.length, limit: oversizeLines }
    for (const l of text) {
      if (isDiary(l.trim())) row.diary++
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

  const flagged = rows.filter((x) => x.unsourced || x.duplicated.length || x.oversize || x.diary)
  const totals = {
    sections: rows.length,
    unsourced: rows.filter((x) => x.unsourced).length,
    duplicated: rows.filter((x) => x.duplicated.length).length,
    oversize: rows.filter((x) => x.oversize).length,
    diary: rows.filter((x) => x.diary).length,
    unreachable: unreachable.length,
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
  if (t.diary) parts.push(`일지형 ${t.diary}`)
  if (t.unreachable) parts.push(`좌표 없는 기록 ${t.unreachable}`)
  return parts.length ? `[CDP] 어긋남: ${parts.join(' · ')} — 큐레이터가 drift 로 보고 cdp-rebuild 로 다시 세운다` : null
}
