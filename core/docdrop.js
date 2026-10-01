// 관리 문서 지우기(`managed: [{ op: "drop" }]`)의 나머지 셋 — 관리문서 정리 검토 v0.1 §4.1 · §4.3.
//
//   거절    실제로 쓴 좌표 섹션 · 작업 기록이 닿은 문서는 「안 쓰는 문서」 가 아니다(merge · retire 가 있다)
//   어휘    그 문서로만 가던 예시 좌표(`example:`)는 짝 섹션과 같이 사라진다(R3)
//   참조    그 문서를 가리키는 링크 · 백틱 이름(R4 · R5)은 같은 save 의 `edits` 로 고치거나 `reviewed` 로 넘긴다
//
// 행 · 파일 · 지운 기록은 `managedops.planManaged` 가 세운다. 여기도 **순수하다** — 쓰는 것은 `save` 와 `ctx docs drop`.

import { CtxError } from './tools.js'
import { resolveCoord } from './managed.js'
import { parseVocab } from './vocab.js'
import { dropBlockers, requiredOf } from './docusage.js'
import { findDocRefs, isRefFile, refLabel } from './docrefs.js'

const NL = '\n'
const lc = (s) => String(s).toLowerCase()
const bare = (l) => String(l).replace(/\r$/, '')

// 거절할 것이 있으면 E_INPUT, 아니면 경고 목록
export function checkDrop(r, docs) {
  const warnings = []
  for (const doc of docs) {
    const b = dropBlockers(r, doc)
    if (b.realSections.length) {
      throw new CtxError('E_INPUT', `${doc} 에 작업 기록이 쓴 좌표 섹션 ${b.realSections.length}개가 있다 — 안 쓰는 문서가 아니다. 내용을 남기려면 merge(다른 문서로 합치기), 좌표 판정만 끄려면 retire`, {
        doc,
        realSections: b.realSections.slice(0, 50),
      })
    }
    if (b.touchedBy.length) {
      throw new CtxError('E_INPUT', `${doc} 의 좌표를 작업 기록 ${b.touchedBy.length}건이 건드렸다 — 안 쓰는 문서가 아니다. 내용을 남기려면 merge, 좌표 판정만 끄려면 retire`, {
        doc,
        touchedBy: b.touchedBy.slice(0, 50),
      })
    }
    if (requiredOf(r.bodies.get(doc)) === true) warnings.push(`${doc} 은 머리 표에 「필수 제출 예」 다 — 계약상 필요 없는지 확인한다`)
  }
  return warnings
}

// 그 문서로만 가던 예시 좌표를 어휘에서 뺀다. 예시가 아닌 좌표는 두고(삭제는 하지 않는다 — `_vocab.md` 운영 원칙) 센다
export function dropVocab(vocabText, registry, docs) {
  const set = new Set(docs.map(lc))
  const text = String(vocabText ?? '')
  const vocab = parseVocab(text.replace(/\r/g, ''))
  const lines = text.split(NL)
  const cut = []
  const removed = []
  const kept = []
  for (const e of vocab.coords.values()) {
    const h = resolveCoord(registry, e.coord)
    if (!h || !set.has(lc(h.doc))) continue
    if (!e.example) {
      kept.push(e.coord)
      continue
    }
    let end = e.line
    while (end < lines.length && /^\s+\S/.test(bare(lines[end]))) end++
    cut.push([e.line - 1, end])
    removed.push(e.coord)
  }
  if (!cut.length) return { vocabText: null, removed, kept }
  const out = lines.slice()
  for (const [a, b] of cut.sort((x, y) => y[0] - x[0])) out.splice(a, b - a)
  return { vocabText: out.join(NL), removed, kept }
}

const refTexts = (bodies) => new Map([...bodies].filter(([rel]) => isRefFile(rel)))

/**
 * 남는 참조. `before` 는 edits 전 글(줄 번호의 기준 — `reviewed` 와 미리보기가 이 번호를 쓴다), `after` 는 edits 뒤 글.
 * edits 가 그 줄을 고쳤으면(뒤 글에 같은 참조 줄이 없다) 풀린 것이다. edits 가 새로 만든 참조 줄도 남는다.
 * @returns { refs: 전부(edits 전 기준), left: 남은 것, seen: reviewed 로 넘긴 것 }
 */
export function dropRefs({ before, after, targets, paths, reviewed = [] }) {
  const pre = findDocRefs({ texts: refTexts(before), targets, paths })
  const post = findDocRefs({ texts: refTexts(after), targets, paths })
  const ok = new Set(reviewed)
  const postKey = new Set(post.map((x) => x.file + '\n' + x.text))
  const preKey = new Set(pre.map((x) => x.file + '\n' + x.text))
  const seen = pre.filter((x) => ok.has(refLabel(x)))
  const left = [
    ...pre.filter((x) => !ok.has(refLabel(x)) && postKey.has(x.file + '\n' + x.text)),
    ...post.filter((x) => !preKey.has(x.file + '\n' + x.text) && !ok.has(refLabel(x))),
  ]
  return { refs: pre, left, seen }
}

export function refsError(left) {
  return new CtxError(
    'E_INPUT',
    `지울 문서를 가리키는 줄 ${left.length}개가 남는다 — 같은 save 의 edits 로 고치거나(제안: detail.refs[].suggest), 알고 두는 줄이면 managed[].reviewed 에 "파일:행" 을 적는다: ${left
      .slice(0, 4)
      .map(refLabel)
      .join(' · ')}${left.length > 4 ? ' …' : ''}`,
    { refs: left.slice(0, 100), total: left.length }
  )
}
