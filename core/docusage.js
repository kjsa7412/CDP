// 관리 문서 사용 현황 — 관리문서 정리 검토 v0.1 §4.6.
//
// 패키지는 40종을 붓고 한 프로젝트가 다 쓰지 않는다. 「안 쓰는 문서」 를 고를 재료(실제로 쓴 섹션 · 작업 기록 ·
// 들어오는 참조 · 필수 제출)가 흩어져 있어 사람이 파일을 하나씩 열어 봤다. 여기서 한 번에 잰다.
//
// **`state` 는 제안이지 판정이 아니다.** 「서식 그대로」 는 「아직 안 썼다」 일 수도 「안 쓸 것이다」 일 수도 있다 —
// 지우는 결정은 사람이 한다(drop 은 admin). 순수하다 — `lastChange` 지도는 부르는 쪽이 git 에서 들고 온다.

import { resolveCoord, parseManagedSections } from './managed.js'
import { preambleEnd } from './regen.js'
import { countRefs, docKeys, isRefFile } from './docrefs.js'

const lc = (s) => String(s).toLowerCase()

// 머리 표의 `| 필수 제출 | 예 |` — 예/아니오/없음
export function requiredOf(text) {
  const lines = String(text || '').split('\n')
  const end = preambleEnd(lines)
  for (let i = 0; i < end; i++) {
    const m = lines[i].match(/^\s*\|\s*(?:\*\*)?필수(?:\s*제출)?(?:\*\*)?\s*\|\s*([^|]*)\|/)
    if (m) {
      const v = m[1].trim()
      if (/^(예|o|y|yes|필수|✓)$/i.test(v)) return true
      if (/^(아니오|아니요|x|n|no|-|—)?$/i.test(v)) return false
      return null
    }
  }
  return null
}

/**
 * @param r            loadRepo 결과
 * @param lastChange   Map<path, { commit, date, author, subject }> — git.lastChanges (없으면 빈 지도)
 * @returns Map<path, usage>
 *   usage = { kind, required, sections: { total, written }, touchedBy, mentionedBy, refsIn, refFiles, lastChange, state }
 */
export function docUsage(r, { lastChange = new Map() } = {}) {
  const paths = r.managedDocs.map((d) => d.path)
  const rules = r.registry?.rules || []

  // 작업 기록 → 그 좌표가 걸리는 문서
  const touched = new Map(paths.map((p) => [lc(p), new Set()]))
  for (const w of r.works) {
    for (const c of w.touches || []) {
      const h = resolveCoord(r.registry, c)
      if (h && touched.has(lc(h.doc))) touched.get(lc(h.doc)).add(w.id)
    }
  }

  const refTexts = new Map()
  const workTexts = new Map()
  for (const [rel, text] of r.bodies) {
    if (/^work\/.+\.md$/i.test(rel)) workTexts.set(rel, text)
    else if (isRefFile(rel)) refTexts.set(rel, text)
  }
  const refsIn = countRefs(refTexts, paths)
  const mentioned = countRefs(workTexts, paths)

  const out = new Map()
  for (const d of r.managedDocs) {
    const mine = rules.filter((x) => lc(x.doc) === lc(d.path))
    const levels = new Set(mine.filter((x) => !x.whole).map((x) => x.level))
    const body = r.bodies.get(d.path) || ''
    const secs = (d.managedSections || parseManagedSections(body)).filter((s) => (levels.size ? levels.has(s.level) : s.level === 2))
    const written = mine.some((x) => x.whole) ? (/<!--\s*applied:\s*(?!null)\S/.test(body.split('\n')[0] || '') ? 1 : 0) : secs.filter((s) => s.applied != null).length
    const touchedBy = touched.get(lc(d.path)).size
    const mentionedBy = mentioned.get(d.path).files.size
    const u = {
      kind: mine.length ? '좌표' : '비대상',
      required: requiredOf(body),
      sections: { total: secs.length, written },
      touchedBy,
      mentionedBy,
      refsIn: refsIn.get(d.path).count,
      refFiles: [...refsIn.get(d.path).files].sort(),
      lastChange: lastChange.get(d.path) || null,
      state: written > 0 || touchedBy > 0 || mentionedBy > 0 ? '쓰는 중' : '서식 그대로',
    }
    out.set(d.path, u)
  }
  return out
}

// drop 이 거절하는 까닭 — 내용이 있으면 「안 쓰는 문서」 가 아니다(검토 §4.3). 화면 · save · CLI 가 같이 쓴다
export function dropBlockers(r, doc) {
  const rules = (r.registry?.rules || []).filter((x) => lc(x.doc) === lc(doc))
  const d = r.managedDocs.find((x) => lc(x.path) === lc(doc))
  const out = { realSections: [], touchedBy: [] }
  if (!d || !rules.length) return out
  const types = [...new Set(rules.map((x) => x.pattern.slice(0, x.pattern.indexOf(':'))))]
  const levels = new Set(rules.filter((x) => !x.whole).map((x) => x.level))
  for (const s of d.managedSections || []) {
    if (!levels.has(s.level) || s.applied == null) continue
    const coord = types.map((t) => t + ':' + s.value).find((c) => {
      const h = resolveCoord(r.registry, c)
      return h && lc(h.doc) === lc(doc)
    })
    out.realSections.push(coord || `${'#'.repeat(s.level)} ${s.value}`)
  }
  if (rules.some((x) => x.whole) && /<!--\s*applied:\s*(?!null)\S/.test((r.bodies.get(d.path) || '').split('\n')[0] || '')) out.realSections.push(rules[0].pattern)
  for (const w of r.works) {
    if ((w.touches || []).some((c) => lc(resolveCoord(r.registry, c)?.doc || '') === lc(doc))) out.touchedBy.push(w.id)
  }
  return out
}

export { docKeys }
