// 섹션 밖 쓰기 — `save` 입력 `edits: [{ file, old, new }]`. 등록부 사본 · 모순 검토 v0.1 ㉣(X15~X19).
//
// 서버형의 `save` 는 좌표 섹션 · 어휘 추가 · 등록부 행만 쓸 수 있었다. 문서 머리말 · `_vocab.md` 의 규칙 산문 ·
// 등록부 비대상 문서(회의록 같은 날짜축)는 고칠 길이 없어, 등록부를 바꾸면 그 문구가 거짓인 채 남았다.
//
// 모양은 하나 — `old` 가 **정확히 한 번** 나오는 자리를 `new` 로. 머리말 교체 · 산문 한 줄 · 비대상 문서 섹션
// 쓰기(앞 섹션 끝에 붙이기) · 지우기(`new: ""`)가 다 된다. `old` 가 곧 **낙관 잠금**이다 — applied 가 없는
// 자리의 잠금. 읽은 뒤 누가 바꿨으면 `old` 가 없어 E_CONFLICT 다.
//
// **못 쓰는 자리**가 이 파일의 절반이다(X16). 파생 고리(applied)와 통제 어휘 · 등록부를 우회하는 길이 되면
// 안 된다 — 그 셋은 각자의 입력(`sections` · `vocab` · `managed`)이 있다. **순수하다** — 쓰는 것은 `save`.

import { CtxError } from './tools.js'
import { docEscapes, parseManagedSections, resolveCoord, parseRegistry, outsideFences } from './managed.js'
import { vocabStructLines, registryRowLines, blockRange, BLOCK_OPEN, BLOCK_CLOSE } from './regen.js'
import { isRefFile } from './docrefs.js'

export const EDITS_MAX = 20
export const OLD_MAX = 20000
export const NEW_MAX = 50000
const NL = '\n'
const lc = (s) => String(s).toLowerCase()
const bare = (l) => String(l).replace(/\r$/, '')
const APPLIED = /<!--\s*applied\s*:/i

const bad = (i, msg, detail = {}) => new CtxError('E_INPUT', msg, { field: `edits[${i}]`, ...detail })

// 받는 파일 — 이미 있는 `docs/**.md` · `_vocab.md` · `_managed.md` · 뿌리의 md(`README.md` · `관리번호.md` — 패키지가 붓는다).
// 뿌리의 도구 층(`CLAUDE.md` · `MANUAL*.md` · `TEMPLATE-work.md`)과 생성물(`INDEX*.md`)은 뺀다 — kit-refresh · save 가 덮는다.
// 작업 기록은 고치지 않는다(정정은 새 기록). 관리문서 정리 검토 N9 — 문서를 지우면 README 목록의 링크를 고칠 길이 있어야 한다
export function editableFile(rel) {
  const v = String(rel ?? '')
  if (docEscapes(v)) return false
  return isRefFile(v)
}

export function checkEditsShape(list) {
  if (list == null) return []
  if (!Array.isArray(list)) throw new CtxError('E_INPUT', 'edits 는 배열이다', { field: 'edits' })
  if (list.length > EDITS_MAX) throw new CtxError('E_INPUT', `edits 는 한 번에 ${EDITS_MAX}건까지다`, { field: 'edits' })
  return list.map((e, i) => {
    if (!e || typeof e !== 'object' || Array.isArray(e)) throw bad(i, `edits[${i}] 는 객체다`)
    for (const k of Object.keys(e)) if (!['file', 'old', 'new'].includes(k)) throw bad(i, `edits[${i}].${k} 는 받지 않는다 (file · old · new)`)
    if (!editableFile(e.file)) throw bad(i, 'edits[].file 은 docs/ 아래 관리 문서 · _vocab.md · _managed.md · 뿌리의 README.md 같은 md 다(도구 층 · INDEX 제외) — 작업 기록은 고치지 않는다(정정은 supersedes 를 단 새 기록)', { file: String(e.file ?? '').slice(0, 120) })
    if (typeof e.old !== 'string' || !e.old.trim() || e.old.length > OLD_MAX) throw bad(i, `edits[].old 는 1~${OLD_MAX}자다 — 바꿀 자리의 지금 글을 그대로(docs({ doc }) 의 text 에서)`)
    if (typeof e.new !== 'string' || e.new.length > NEW_MAX) throw bad(i, `edits[].new 는 0~${NEW_MAX}자 문자열이다 (지우려면 "")`)
    return { file: e.file, old: e.old, new: e.new }
  })
}

// 그 파일에서 못 쓰는 줄(0부터) — 사유와 함께
function guarded(file, text, { registry, vocabCoords }) {
  const lines = text.split(NL)
  const out = new Map()
  const mark = (i, why) => {
    if (!out.has(i)) out.set(i, why)
  }
  const b = file === '_vocab.md' ? blockRange(lines) : null
  if (b) for (let i = b.open; i <= b.close; i++) mark(i, '생성 블록(cdp:registry) 속이다 — 등록부에서 찍는다')

  if (file === '_vocab.md') {
    for (const i of vocabStructLines(lines)) mark(i, '어휘 줄이다 — 더하는 것은 vocab[] · 예시 정리는 examples: "purge" · 폐기 표시는 admin 이')
    return out
  }
  if (file === '_managed.md') {
    for (const i of registryRowLines(text)) mark(i, '등록부 규칙 행이다 — managed[] 로 바꾼다')
    return out
  }

  // 관리 문서 — applied 주석 · 좌표 섹션. 등록부 비대상 문서는 좌표 섹션이 없고 그 applied(서식의 `null`)는 아무것도
  // 가리키지 않는다 — 예시 섹션을 통째로 지울 수 있어야 한다(새로 넣는 것은 `newProblem` 이 막는다)
  const rules = (registry?.rules || []).filter((r) => lc(r.doc) === lc(file))
  if (!rules.length) return out
  for (let i = 0; i < lines.length; i++) if (APPLIED.test(lines[i])) mark(i, 'applied 주석이다 — 서버가 쓴다')
  if (rules.some((r) => r.whole)) {
    for (let i = 0; i < lines.length; i++) mark(i, '문서 전체(—)가 좌표의 상태다 — sections[] 로 쓴다')
    return out
  }
  const types = [...new Set(rules.map((r) => r.pattern.slice(0, r.pattern.indexOf(':'))))]
  for (const s of parseManagedSections(lines.map(bare).join(NL))) {
    const coord = types.map((t) => t + ':' + s.value).find((c) => {
      const h = resolveCoord(registry, c)
      return h && lc(h.doc) === lc(file) && h.level === s.level && vocabCoords.has(c)
    })
    if (!coord) continue
    for (let i = s.line; i < s.end; i++) mark(i, `좌표 섹션(${coord})이다 — sections[] 로 쓴다(applied 대조)`)
  }
  return out
}

// `new` 에 넣지 못하는 것
function newProblem(file, text, { registry, hasBlock }) {
  if (APPLIED.test(text)) return 'applied 주석은 서버가 쓴다'
  if (file === '_vocab.md') {
    const lines = text.split(NL)
    if (vocabStructLines(lines).size) return '어휘 줄(- `타입:값` · 들여쓴 줄 · ## 타입 · excluded:)은 vocab[] 로 더한다'
    if (hasBlock && (text.includes(BLOCK_OPEN) || text.includes(BLOCK_CLOSE))) return '생성 블록 표식이 이미 있다'
    return null
  }
  if (file === '_managed.md') {
    if (parseRegistry(text).rules.length) return '등록부 규칙 행은 managed[] 로 더한다'
    return null
  }
  const levels = new Set((registry?.rules || []).filter((r) => lc(r.doc) === lc(file) && !r.whole).map((r) => r.level))
  for (const [, l] of outsideFences(text.split(NL).map(bare))) {
    const h = l.match(/^(#{1,6})\s/)
    if (h && levels.has(h[1].length)) return `이 문서의 앵커 레벨(${h[1]}) 헤딩은 좌표 섹션이 된다 — 섹션은 sections[] 로 만든다`
  }
  return null
}

function count(hay, needle) {
  let n = 0
  for (let at = hay.indexOf(needle); at >= 0; at = hay.indexOf(needle, at + 1)) n++
  return n
}

/**
 * @param edits       checkEditsShape 결과
 * @param read        (rel) => 지금 원문 | null
 * @param registry    parseRegistry 결과(지금 등록부)
 * @param vocabCoords Set — 어휘에 있는 좌표
 * @returns { files: Map<rel, text>, done: [{ file, line }] }
 */
export async function planEdits({ edits, read, registry, vocabCoords = new Set() }) {
  const files = new Map()
  const done = []
  for (let i = 0; i < edits.length; i++) {
    const e = edits[i]
    const cur = files.has(e.file) ? files.get(e.file) : await read(e.file)
    if (cur == null) throw new CtxError('E_NOT_FOUND', `${e.file} 가 없다 — 새 관리 문서는 managed: [{ pattern, doc }] 로 만든다`, { field: `edits[${i}]`, file: e.file })
    const crlf = cur.includes('\r\n')
    const fit = (s) => (crlf ? s.replace(/\r?\n/g, '\r\n') : s.replace(/\r\n/g, '\n'))
    const old = fit(e.old)
    const nu = fit(e.new)
    const n = count(cur, old)
    if (n === 0) {
      throw new CtxError('E_CONFLICT', `edits[${i}].old 가 ${e.file} 에 없다 — 읽은 뒤 바뀌었거나 옮겨 적다 틀렸다. docs({ doc: "${e.file}" }) 로 다시 읽어 지금 글에서 만든다`, {
        kind: 'edit',
        field: `edits[${i}]`,
        file: e.file,
      })
    }
    if (n > 1) throw bad(i, `edits[${i}].old 가 ${e.file} 에 ${n}번 나온다 — 앞뒤 줄을 더 붙여 한 자리만 가리킨다`, { file: e.file, count: n })

    const at = cur.indexOf(old)
    const first = cur.slice(0, at).split('\n').length - 1
    const last = first + old.split('\n').length - 1
    const g = guarded(e.file, cur, { registry, vocabCoords })
    for (let l = first; l <= last; l++) {
      if (g.has(l)) throw bad(i, `edits[${i}] 가 ${e.file}:${l + 1} 을 건드린다 — ${g.get(l)}`, { file: e.file, line: l + 1 })
    }
    const why = newProblem(e.file, nu, { registry, hasBlock: !!blockRange(cur.split(NL)) })
    if (why) throw bad(i, `edits[${i}].new — ${why}`, { file: e.file })

    files.set(e.file, cur.slice(0, at) + nu + cur.slice(at + old.length))
    done.push({ file: e.file, line: first + 1 })
  }
  return { files, done }
}
