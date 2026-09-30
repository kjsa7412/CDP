// 서식 예시를 한 번에 치운다 — 등록부 사본 · 모순 검토 v0.1 ㉢(X10~X13).
//
// 패키지는 어휘에 `example:` 이 붙은 좌표를 달고, 문서에 그 짝 섹션을 달고 나간다 — 부은 직후 파생 고리를 한
// 바퀴 돌려 보라는 것이다. `check` 는 「시작할 때 지운다」 고 시키는데 서버형에는 지울 연산이 writer 에게 없었다
// (`save` 에 삭제가 없고 `retire` 는 admin 의 등록부 연산이다). 어휘만 지우면 `where` 가 빈손이 되고 섹션만 지우면
// 앵커 없음이 되니, **둘을 같이** 지우는 것이 이 함수의 전부다.
//
// **순수하다** — 글을 받아 글을 낸다. 쓰는 것은 `save`(한 커밋) · `ctx examples --purge`(파일만) · `newRepo`(세울 때).

import { resolveCoord, parseManagedSections, normValue, outsideFences } from './managed.js'
import { parseVocab } from './vocab.js'

const NL = '\n'
const bare = (l) => String(l).replace(/\r$/, '')
const lc = (s) => String(s).toLowerCase()
const RE_LEFT = /\(예시\)|예시 행|이 섹션은 예시/
export const LEFT_MAX = 100

// 항목 줄(0부터)과 그 밑 들여쓴 줄 — 지울 범위
function entryRange(lines, at) {
  let end = at + 1
  while (end < lines.length && /^\s+\S/.test(bare(lines[end]))) end++
  return [at, end]
}

// 줄 범위들을 지운다(겹치면 합친다) — 지운 자리에 빈 줄이 셋 이상 몰리면 둘로
function cut(lines, ranges) {
  const rs = ranges.slice().sort((a, b) => a[0] - b[0])
  const merged = []
  for (const r of rs) {
    const last = merged[merged.length - 1]
    if (last && r[0] <= last[1]) last[1] = Math.max(last[1], r[1])
    else merged.push([...r])
  }
  const out = lines.slice()
  for (const [a, b] of merged.reverse()) {
    out.splice(a, b - a)
    // 이음매의 빈 줄을 줄인다
    let i = a
    while (i > 0 && i < out.length && !bare(out[i - 1]).trim() && !bare(out[i]).trim()) {
      out.splice(i, 1)
    }
  }
  return out
}

/**
 * @param vocabText  `_vocab.md` 원문
 * @param registry   parseRegistry 결과
 * @param docs       Map<rel, 원문> — docs/ 의 관리 문서
 * @param touched    Map<coord, [작업 기록 id]> — 작업 기록이 쓰는 좌표
 * @returns { vocabText|null, files: Map<rel, text>, coords, sections: [{ path, heading }], kept: [{ coord, works }], left: [{ file, line, text }] }
 */
export function planPurge({ vocabText, registry, docs, touched = new Map() }) {
  const vtext = String(vocabText ?? '')
  const vocab = parseVocab(vtext.replace(/\r/g, ''))
  const vlines = vtext.split(NL)
  const coords = []
  const kept = []
  const vRanges = []
  for (const e of vocab.coords.values()) {
    if (!e.example) continue
    const [a, b] = entryRange(vlines, e.line - 1)
    if (touched.has(e.coord)) {
      // 작업 기록이 쓰면 그것은 좌표다(패키지 규칙) — 지우면 미등재 오류. `example:` 표시만 뗀다
      for (let i = a + 1; i < b; i++) if (/^\s+example\s*:/i.test(bare(vlines[i]))) vRanges.push([i, i + 1])
      kept.push({ coord: e.coord, works: touched.get(e.coord).slice(0, 5) })
      continue
    }
    vRanges.push([a, b])
    coords.push(e.coord)
  }

  // 지울 섹션 — ① 지운 좌표의 짝 ② 제목에 「(예시)」 가 있는 섹션(남긴 좌표의 섹션은 빼고)
  const keptAt = new Set()
  for (const k of kept) {
    const h = resolveCoord(registry, k.coord)
    if (h && !h.whole) keptAt.add(lc(h.doc) + '|' + h.level + normValue(h.value))
  }
  const want = new Map() // lc(doc) -> Set(레벨+값)
  for (const c of coords) {
    const h = resolveCoord(registry, c)
    if (!h || h.whole) continue
    const k = lc(h.doc)
    if (!want.has(k)) want.set(k, new Set())
    want.get(k).add(h.level + normValue(h.value))
  }

  const files = new Map()
  const sections = []
  for (const [rel, text] of docs) {
    const lines = String(text).split(NL)
    const secs = parseManagedSections(lines.map(bare).join(NL))
    const w = want.get(lc(rel)) || new Set()
    const ranges = []
    for (const s of secs) {
      if (s.level < 2) continue
      const key = s.level + normValue(s.value)
      const paired = w.has(key)
      const marked = /\(예시\)/.test(s.title) && !keptAt.has(lc(rel) + '|' + key)
      if (!paired && !marked) continue
      if (ranges.some(([a, b]) => s.line >= a && s.line < b)) continue // 이미 지우는 섹션 안
      ranges.push([s.line, s.end])
      sections.push({ path: rel, heading: '#'.repeat(s.level) + ' ' + s.title })
    }
    if (ranges.length) files.set(rel, cut(lines, ranges).join(NL))
  }

  const nextVocab = vRanges.length ? cut(vlines, vRanges).join(NL) : null

  // 남은 예시 표시 — 섹션이 아니라 표의 행이라 사람이 고른다(X12)
  const left = []
  const scanLeft = (file, text) => {
    for (const [i, l] of outsideFences(String(text).split(NL).map(bare))) {
      if (left.length >= LEFT_MAX) return
      if (RE_LEFT.test(l)) left.push({ file, line: i + 1, text: l.trim().slice(0, 160) })
    }
  }
  for (const [rel, text] of docs) scanLeft(rel, files.get(rel) ?? text)

  return { vocabText: nextVocab, files, coords, sections, kept, left }
}
