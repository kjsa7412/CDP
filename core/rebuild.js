// 다시 세우기 — 옛 레포의 **작업 기록만** 새 빈 레포로 옮긴다. v1.0 개편안 §9.1 · V20.
//
// 관리 문서가 엉망인 레포는 고치는 것보다 빈 레포에서 큐레이션부터 다시 하는 쪽이 낫다(운영자 지시 · dpms_wiki).
// 기록은 사건이라 바꾸지 않고 그대로 옮긴다 — 날짜 · 작성자 · 본문 · 첨부. 옮기지 않는 것은 옛 문서 층의 것이다:
// 관리 문서 · 등록부 행 · 옛 기계 기록(파생 정리 · 등록부 정리 · 문서 정리). 새 레포에서는 가리킬 것이 없다.
//
// 어휘는 **옮긴 기록이 건드리는 좌표와 그 타입만** 옮긴다 — 아무 기록도 안 건드린 좌표 · 서식 예시(`example:`)는
// 옛 서식이 남긴 것이다. 줄은 옛 파일의 글 그대로(라벨 · aliases · deprecated) 옮기고 `example:` 줄만 뗀다.
//
// 여기 있는 것은 **순수 함수**다 — 글을 받아 글을 낸다. 파일을 옮기는 것은 `reponew.newRepo` 다.

import { recordKind } from './curation.js'

const NL = '\n'
const bare = (l) => String(l).replace(/\r$/, '')

// 옮길 기록 — 사람의 작업 기록과 **정본 스냅샷**(큐레이션 · 기준선 · 옛 기계 기록은 빼고).
// 스냅샷은 옛 정본에만 있던 지식을 원문 그대로 뜬 것이다 — 옮기지 않으면 그 지식이 다시 세우기에서 사라진다(리빌딩 검토 Q2 · K1).
// 새 레포에는 섹션이 없으므로 대기열에 선다(curation.js — 섹션이 없는 좌표의 스냅샷)
export function pickRecords(works) {
  const keep = []
  const skip = []
  for (const d of works) {
    const k = recordKind(d)
    if (k === 'work' || k === 'snapshot') keep.push(d)
    else skip.push({ id: d.id, kind: k })
  }
  return { keep, skip }
}

// 옛 `_vocab.md` 에서 `coords` 의 줄만 — 타입 절(`## 타입`, 공백 없는 머리글)마다 그 아래 항목과 들여 쓴 줄을 모은다.
// 돌려주는 것은 새 어휘 파일에 붙일 타입 절들의 글과, 옮긴 · 못 찾은 좌표.
export function carryVocab(oldText, coords) {
  const want = new Set(coords)
  const lines = String(oldText || '').split(NL).map(bare)
  const sections = [] // { type, head: [줄], entries: [[줄…]] }
  let cur = null
  let entry = null
  let fence = false
  for (const raw of lines) {
    if (/^\s{0,3}(`{3,}|~{3,})/.test(raw)) fence = !fence
    if (fence) {
      entry = null
      continue
    }
    const h = /^##\s+(\S+)\s*$/.exec(raw)
    if (h) {
      cur = { type: h[1], head: [], entries: [] }
      sections.push(cur)
      entry = null
      continue
    }
    if (/^#{1,6}\s/.test(raw)) {
      cur = null // 공백 있는 머리글 — 설명 절
      entry = null
      continue
    }
    if (!cur) continue
    const m = /^-\s+`([^`]+)`/.exec(raw)
    if (m) {
      entry = { coord: m[1], lines: [raw] }
      cur.entries.push(entry)
      continue
    }
    if (entry && /^\s+\S/.test(raw)) {
      if (/^\s+example\s*:/i.test(raw)) continue // 서식 예시 표시는 옮기지 않는다
      entry.lines.push(raw)
      continue
    }
    entry = null
    // 타입 절 바로 아래의 `excluded:` 같은 설정 줄은 절과 함께 간다
    if (!cur.entries.length && /^\S+\s*:/.test(raw) && !/^\|/.test(raw)) cur.head.push(raw)
  }

  const found = new Set()
  const out = []
  for (const s of sections) {
    const picked = s.entries.filter((e) => want.has(e.coord) && !found.has(e.coord))
    if (!picked.length) continue
    for (const e of picked) found.add(e.coord)
    out.push(['## ' + s.type, ...(s.head.length ? ['', ...s.head] : []), '', ...picked.flatMap((e) => e.lines), ''].join(NL))
  }
  return { text: out.join(NL), carried: [...found], missing: [...want].filter((c) => !found.has(c)) }
}

// 새 어휘 파일 — 빈 레포 틀의 어휘(머리말 · 운영 원칙 · 생성 블록)에 옮긴 타입 절을 붙인다.
// 「아직 비어 있다」 절은 옮긴 것이 있으면 뺀다 — 거짓이 된다.
export function mergeVocab(baseText, carriedText) {
  if (!carriedText.trim()) return baseText
  const lines = String(baseText || '').split(NL).map(bare)
  const at = lines.findIndex((l) => /^##\s+아직 비어 있다/.test(l))
  let head = lines
  if (at >= 0) {
    let end = lines.length
    for (let i = at + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) {
        end = i
        break
      }
    }
    head = [...lines.slice(0, at), ...lines.slice(end)]
  }
  while (head.length && !head[head.length - 1].trim()) head.pop()
  return head.join(NL) + NL + NL + carriedText.replace(/\s+$/, '') + NL
}
