// 등록부 · 관리 문서를 서버가 더하고 정리한다 — 관리문서 동적 생성 검토 v0.1 §5.
//
// `save` 입력 `managed[]` 의 계획을 세운다. **순수하다 — 파일을 쓰지 않는다.** 새 `_managed.md` 글 · 만들고 옮기고
// 지울 문서의 (경로 → 새 글) 지도 · 사건 목록 · 경고를 돌려주고, 쓰는 것은 부르는 쪽(`save` 의 `Snap`)이다 —
// 그래서 검사에서 걸리면 한 번에 되돌린다.
//
// 다섯 동작 — `add`(writer) · `rename` · `merge` · `retire` · `drop`(admin). `drop` 은 관리문서 정리 검토 v0.1 §4.2 —
// 파일 · 그 문서를 가리키는 행을 지우고 「지운 관리 문서」 표에 한 줄을 남긴다. 거절 조건 · 예시 좌표 · 참조는 `docdrop.js`.
// 앞 동작이 만든 상태 위에서 뒤 동작이 돈다.
// 기존 행은 `add` 로 바뀌지 않는다 — 새 행은 **언제나 마지막 규칙 행 바로 뒤**(먼저 걸리는 행이 이긴다).

import { CtxError } from './tools.js'
import { stampDoc } from './forms.js'
import { DROPPED_HEAD } from './docrefs.js'
import { parseRegistry, globContains, globIntersects, patternProblem, docPathProblem, registryRow, outsideFences, ADDED_NOTE } from './managed.js'

export const MAX_OPS = 10
export const OPS = ['add', 'rename', 'merge', 'retire', 'drop']
// op 마다 받는 키 — 이 밖의 키는 거절한다(오타가 조용히 버려지지 않게)
const KEYS = {
  // form — 서식집의 서식 id(`public-si/DE_431`). 새 문서를 그 서식의 빈 문서(제목 · 표지 · 첫 문단)로 찍는다(v1.0 §8.1)
  add: { need: ['pattern', 'doc'], may: ['level', 'title', 'reviewed', 'form'] },
  rename: { need: ['doc', 'to'], may: [] },
  merge: { need: ['doc', 'into'], may: [] },
  retire: { need: ['pattern'], may: [] },
  drop: { need: ['doc'], may: ['reason', 'reviewed'] },
}

const NL = '\n'
const lc = (s) => String(s).toLowerCase()
// 머리는 넷째 칸(비고)까지 — 서버가 더한 행은 넷째 칸에 「서버 추가 · <기록 id>」 를 적고, GFM 은 머리 칸 수만큼만 그린다
const EMPTY_REGISTRY = ['# 관리 문서 등록부', '', '좌표가 어느 관리 문서의 어느 섹션에 대응하는지 **여기에만** 적는다.', '매핑이 두 곳에 있으면 반드시 어긋난다.', '', '| 좌표 패턴 | 관리 문서 | 섹션 | 비고 |', '|---|---|---|---|']
// 등록부 표의 머리행 · 구분행 — 규칙이 아직 없는 빈 틀의 표를 찾고, 넷째 칸이 없는 옛 머리를 넓힐 때 본다
const RE_REG_HEAD = /^\s*\|\s*좌표 패턴\s*\|/
const RE_REG_SEP = /^\s*\|[\s:|-]+\|\s*$/

// 입력의 모양만 본다(필드 조합 · 길이 · 키). 내용(경로 · 패턴)은 계획에서 — 앞 동작의 결과를 봐야 알 수 있다.
export function checkManagedShape(list) {
  if (list == null) return []
  if (!Array.isArray(list)) throw new CtxError('E_INPUT', 'managed 는 배열이다', { field: 'managed' })
  if (list.length > MAX_OPS) throw new CtxError('E_INPUT', `managed 는 한 번에 ${MAX_OPS}건까지다`, { field: 'managed' })
  return list.map((m, i) => {
    const at = `managed[${i}]`
    if (!m || typeof m !== 'object' || Array.isArray(m)) throw new CtxError('E_INPUT', `${at} 는 객체다`, { field: at })
    const op = m.op == null ? 'add' : m.op
    if (!OPS.includes(op)) throw new CtxError('E_INPUT', `${at}.op 는 add · rename · merge · retire · drop 중 하나다`, { field: at + '.op' })
    const k = KEYS[op]
    for (const key of Object.keys(m)) {
      if (key === 'op') continue
      if (!k.need.includes(key) && !k.may.includes(key)) throw new CtxError('E_INPUT', `${at}.${key} 는 ${op} 에서 받지 않는다`, { field: at + '.' + key })
    }
    for (const key of k.need) {
      if (typeof m[key] !== 'string' || !m[key]) throw new CtxError('E_INPUT', `${at}.${key} 가 없다`, { field: at + '.' + key })
    }
    if (m.level != null && !(Number.isInteger(m.level) && m.level >= 0 && m.level <= 6)) {
      throw new CtxError('E_INPUT', `${at}.level 은 0~6 정수다 (0 = 문서 전체)`, { field: at + '.level' })
    }
    if (m.title != null && (typeof m.title !== 'string' || !m.title.trim() || m.title.length > 200 || /[\r\n]/.test(m.title))) {
      throw new CtxError('E_INPUT', `${at}.title 은 한 줄 1~200자다`, { field: at + '.title' })
    }
    if (m.reason != null && (typeof m.reason !== 'string' || m.reason.length > 200 || /[\r\n]/.test(m.reason))) {
      throw new CtxError('E_INPUT', `${at}.reason 은 한 줄 200자까지다`, { field: at + '.reason' })
    }
    // 등록부 사본 검토 X8 — 어긋난다고 걸린 산문 중 **맞는 줄**이라고 확인한 것(`파일:행`). 확인했다는 선언이 커밋에 남는다
    if (m.reviewed != null && (!Array.isArray(m.reviewed) || m.reviewed.length > 50 || m.reviewed.some((x) => typeof x !== 'string' || !/^[^:\s][^\n]{0,240}:\d{1,6}$/.test(x)))) {
      throw new CtxError('E_INPUT', `${at}.reviewed 는 "파일:행" 문자열 50개까지다 (예: "_vocab.md:53")`, { field: at + '.reviewed' })
    }
    return { ...m, op }
  })
}

// 정리(rename · merge · retire · drop)가 하나라도 있는가 — admin 만
export const needsAdmin = (ops) => (ops || []).some((o) => (o.op ?? 'add') !== 'add')

function bad(at, field, msg, detail = {}) {
  return new CtxError('E_INPUT', msg, { field: `managed[${at}].${field}`, ...detail })
}
function badPattern(at, field, p) {
  const why = patternProblem(p)
  if (why) throw bad(at, field, `${why}`, { pattern: String(p).slice(0, 120) })
}
function badPath(at, field, p) {
  const why = docPathProblem(p)
  if (why) throw bad(at, field, why, { doc: String(p).slice(0, 120) })
}

// ── `_managed.md` 줄 고치기 — 줄 번호는 `parseRegistry` 의 `line`(1부터) 그대로다 ────────────────────────

// 마지막 규칙 행 바로 뒤에 넣는다 — 같은 표 안이고 우선순위가 가장 낮다. 규칙이 없으면 **이미 있는 빈 표**(빈 틀의
// 「| 좌표 패턴 | 관리 문서 | 섹션 |」)의 구분행 바로 뒤에, 그 표도 없을 때만 표째 끝에 만든다 — 전에는 빈 틀에 첫 행을
// 더하면 파일 끝(「등록부에 없는 좌표는 정상이다」 절 아래)에 표가 하나 더 생겼다(사이트 데모 실측).
function insertRow(text, row) {
  if (!text || !text.trim()) return [...EMPTY_REGISTRY, row, ''].join(NL)
  const reg = parseRegistry(text)
  const lines = text.split(NL)
  let at = null // 넣을 인덱스(0부터)
  if (reg.rules.length) at = Math.max(...reg.rules.map((r) => r.line)) // 1부터 → 그 줄 다음의 인덱스가 같은 수
  else {
    for (const [i, l] of outsideFences(lines)) {
      if (RE_REG_HEAD.test(l) && RE_REG_SEP.test(lines[i + 1] || '')) {
        at = i + 2
        break
      }
    }
  }
  if (at == null) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return [...lines, '', ...EMPTY_REGISTRY.slice(5), row, ''].join(NL)
  }
  const cr = lines[at - 1].endsWith('\r') ? '\r' : ''
  lines.splice(at, 0, row + cr)
  widenHead(lines, at)
  return lines.join(NL)
}

// 그 행이 든 표의 머리가 행보다 칸이 적으면 넓힌다 — 옛 레포의 머리는 셋째 칸(섹션)까지라 서버가 더한 행의
// 넷째 칸(「서버 추가 · <id>」)이 그려지지 않았다. 머리 · 구분행만 고친다(규칙 행은 그대로)
function widenHead(lines, at) {
  let top = at
  while (top > 0 && /^\s*\|/.test(lines[top - 1])) top--
  const head = lines[top] || ''
  const sep = lines[top + 1] || ''
  if (!RE_REG_HEAD.test(head) || !RE_REG_SEP.test(sep)) return
  const cells = (l) => l.replace(/\r$/, '').trim().split('|').length - 2
  if (cells(head) !== 3 || cells(lines[at]) < 4) return
  const cr = (l) => (l.endsWith('\r') ? '\r' : '')
  lines[top] = head.replace(/\r$/, '').replace(/\s*$/, '') + ' 비고 |' + cr(head)
  lines[top + 1] = sep.replace(/\r$/, '').replace(/\s*$/, '') + '---|' + cr(sep)
}

function removeRow(text, line) {
  const lines = text.split(NL)
  lines.splice(line - 1, 1)
  return lines.join(NL)
}

// 그 행의 관리 문서 칸만 바꾼다(셋째 조각 — 첫 `|` 앞이 0번째다)
function setRowDoc(text, line, from, to) {
  const lines = text.split(NL)
  const parts = lines[line - 1].split('|')
  parts[2] = parts[2].replace(from, () => to) // 문자열 치환의 $ 패턴을 피한다
  lines[line - 1] = parts.join('|')
  return lines.join(NL)
}

/**
 * 계획을 세운다.
 *
 * @param ops           `checkManagedShape` 를 지난 배열
 * @param registryText  지금 `_managed.md` 의 글(없으면 null)
 * @param docPaths      지금 있는 관리 문서 경로(`docs/…md`) 전부
 * @param read          (rel) => 그 문서의 글 | null — 디스크
 * @param workId        행 note 에 남길 작업 기록 id
 * @returns { registryText, changed, files: Map<rel, string|null>, events, warnings, added }
 *   files   쓸 것(글) · 지울 것(null). `_managed.md` 는 들어 있지 않다 — `registryText` 를 본다
 *   added   이번에 **실제로** 더한 패턴(멱등으로 넘어간 것은 빼고)
 */
export async function planManaged({ ops, registryText, docPaths, read, workId, forms = null }) {
  let text = registryText ?? ''
  const files = new Map()
  const events = []
  const warnings = []
  const added = []
  const known = new Map([...docPaths].map((p) => [lc(p), p])) // 소문자 → 실제 경로 (대소문자만 다른 것도 같은 파일)
  const created = new Set()

  const pathOf = (rel) => {
    if (files.has(rel) && files.get(rel) === null) return null // 이번에 지웠다
    if (files.has(rel)) return rel
    const k = known.get(lc(rel))
    if (!k) return null
    if (files.has(k) && files.get(k) === null) return null
    return k
  }
  const textOf = async (rel) => {
    const p = pathOf(rel) ?? rel
    return files.has(p) && files.get(p) !== null ? files.get(p) : (await read(p)) ?? ''
  }
  const setFile = (rel, body) => {
    files.set(rel, body)
    if (body !== null) known.set(lc(rel), rel)
    else known.delete(lc(rel))
  }

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i]
    const reg = parseRegistry(text)
    const rulesOf = (doc) => reg.rules.filter((r) => lc(r.doc) === lc(doc))

    if (op.op === 'add') {
      badPattern(i, 'pattern', op.pattern)
      badPath(i, 'doc', op.doc)
      const level = op.level ?? 2
      const same = reg.rules.find((r) => r.pattern === op.pattern)
      if (same) {
        if (lc(same.doc) === lc(op.doc) && same.level === level) {
          // 멱등 — 동시 save 둘이 같은 행을 더해도 한 줄이다
          warnings.push(`등록부에 ${op.pattern} → ${same.doc} 행이 이미 있다 — 다시 더하지 않았다`)
          continue
        }
        throw new CtxError('E_CONFLICT', `등록부에 ${op.pattern} 행이 이미 다른 자리에 있다 — detail.current 를 보고 그 문서에 붙이거나 다른 패턴을 고른다`, {
          kind: 'managed',
          pattern: op.pattern,
          current: { doc: same.doc, level: same.level, whole: same.whole, note: same.note || null },
        })
      }
      // 앞 행에 **완전히 덮이면** 이 행은 죽은 행이다 — 좌표가 못 닿는다
      const by = reg.rules.find((r) => globContains(r.pattern, op.pattern))
      if (by) {
        throw bad(i, 'pattern', `앞 행 ${by.pattern} 이 ${op.pattern} 의 좌표를 전부 가져간다 — 이 행은 닿지 않는다. 앞 행이 가리키는 ${by.doc} 에 붙이거나 더 좁지 않은 패턴을 고른다`, {
          pattern: op.pattern,
          shadowedBy: { pattern: by.pattern, doc: by.doc, level: by.level },
        })
      }
      for (const r of reg.rules) {
        if (globIntersects(r.pattern, op.pattern)) warnings.push(`새 행 ${op.pattern} 이 앞 행 ${r.pattern} 과 일부 겹친다 — 겹친 좌표는 앞 행(${r.doc})을 따른다`)
      }
      // 한 문서는 한 레벨 — `##` 섹션은 `###` 를 품고 `—` 는 파일 전체라, 섞으면 섹션이 겹친다
      const docRules = rulesOf(op.doc)
      if (level === 0) {
        if (docRules.length) throw bad(i, 'level', `${op.doc} 은 이미 등록부에 행이 있다 — 문서 전체(level 0)는 다른 행이 없는 새 문서에만 쓴다`, { doc: op.doc })
        if (pathOf(op.doc)) throw bad(i, 'level', `${op.doc} 은 이미 있는 문서다 — 문서 전체(level 0)로 붙이면 첫 섹션 쓰기가 파일을 통째로 갈아 버린다. 새 문서에만 쓴다`, { doc: op.doc })
      } else {
        const other = docRules.find((r) => r.level !== level)
        if (other) {
          throw bad(i, 'level', `${op.doc} 의 기존 행(${other.pattern})은 ${other.whole ? '문서 전체' : '#'.repeat(other.level)} 이다 — 한 문서에는 한 레벨만 둔다(섹션이 겹친다)`, {
            doc: op.doc,
            existing: { pattern: other.pattern, level: other.level },
          })
        }
      }
      let doc = pathOf(op.doc)
      const form = op.form ? forms?.get(op.form) : null
      if (op.form && !form) throw bad(i, 'form', `서식 ${op.form} 이 서식집에 없다 — forms 로 찾아 id 를 그대로 쓴다`, { form: op.form })
      if (form?.problems?.length) throw bad(i, 'form', `서식 ${op.form} 에 문제가 있다 — ${form.problems[0]}${form.problems.length > 1 ? ` 외 ${form.problems.length - 1}건` : ''} · 서버 관리자가 ctx forms check 로 본다`, { form: op.form, problems: form.problems })
      if (!doc) {
        doc = op.doc
        const stem = doc.split('/').pop().replace(/\.md$/i, '')
        // 서식이 있으면 **깨끗한 빈 문서** — 제목 · 서식 표지 · 첫 문단뿐(예시 · 작성지침 · applied 없음 · forms.stampDoc)
        setFile(doc, form ? stampDoc(form, { title: op.title?.trim() || undefined }) : `# ${op.title?.trim() || stem}${NL}`)
        created.add(doc)
      } else if (form) {
        warnings.push(`${doc} 은 이미 있는 문서다 — 서식(${op.form})은 새 문서에만 찍는다. 행만 더했다`)
      }
      text = insertRow(text, registryRow({ pattern: op.pattern, doc, level, note: ADDED_NOTE + workId }))
      added.push(op.pattern)
      events.push({ op: 'add', pattern: op.pattern, doc, level, created: created.has(doc), ...(form ? { form: form.id } : {}) })
      continue
    }

    if (op.op === 'retire') {
      // 패턴 문법은 따지지 않는다 — 손으로 쓴 옛 행도 지울 수 있어야 한다
      const rule = reg.rules.find((r) => r.pattern === op.pattern)
      if (!rule) throw new CtxError('E_NOT_FOUND', `등록부에 ${op.pattern} 행이 없다`, { pattern: op.pattern })
      text = removeRow(text, rule.line)
      const rest = parseRegistry(text).rules.filter((r) => lc(r.doc) === lc(rule.doc))
      if (!rest.length && pathOf(rule.doc)) warnings.push(`${rule.doc} 은 이제 등록부에 안 걸린 관리 문서다 — 파일은 그대로 두었다(지우려면 merge 로 합치거나 사람이)`)
      events.push({ op: 'retire', pattern: rule.pattern, doc: rule.doc })
      continue
    }

    if (op.op === 'drop') {
      // 경로 문법은 읽기만 — 손으로 둔 옛 문서도 지울 수 있어야 한다. 레포 밖은 `Snap` 이 한 번 더 막는다
      const doc = pathOf(op.doc)
      if (!doc) throw new CtxError('E_NOT_FOUND', `${op.doc} 문서가 없다`, { doc: op.doc })
      if (!/^docs\//.test(doc)) throw bad(i, 'doc', 'drop 은 docs/ 아래 관리 문서만 지운다', { doc })
      const rows = rulesOf(doc)
      for (const r of [...rows].sort((a, b) => b.line - a.line)) text = removeRow(text, r.line)
      setFile(doc, null)
      text = addDropped(text, { doc, workId, reason: op.reason })
      events.push({ op: 'drop', doc, rules: rows.map((r) => r.pattern) })
      continue
    }

    // rename · merge — 둘 다 문서 하나를 다룬다
    badPath(i, 'doc', op.doc)
    const from = pathOf(op.doc)
    if (!from) throw new CtxError('E_NOT_FOUND', `${op.doc} 문서가 없다`, { doc: op.doc })

    if (op.op === 'rename') {
      badPath(i, 'to', op.to)
      if (lc(op.to) === lc(from)) throw bad(i, 'to', '같은 경로다', { doc: from })
      if (pathOf(op.to)) throw new CtxError('E_EXISTS', `${op.to} 가 이미 있다`, { doc: op.to })
      setFile(op.to, await textOf(from))
      setFile(from, null)
      for (const r of [...rulesOf(from)].reverse()) text = setRowDoc(text, r.line, r.doc, op.to)
      events.push({ op: 'rename', doc: from, to: op.to, rows: rulesOf(from).length })
      warnings.push(`다른 문서 안의 ${from} 링크는 고치지 않았다 — 사람이 찾아 고친다`)
      continue
    }

    // merge
    badPath(i, 'into', op.into)
    const into = pathOf(op.into)
    if (!into) throw new CtxError('E_NOT_FOUND', `${op.into} 문서가 없다 — 합칠 곳이 있어야 한다`, { doc: op.into })
    if (lc(into) === lc(from)) throw bad(i, 'into', '같은 문서다', { doc: from })
    const rows = rulesOf(from)
    const levels = new Set([...rows, ...rulesOf(into)].map((r) => r.level))
    if (levels.has(0)) throw bad(i, 'doc', '문서 전체(—) 행이 있는 문서는 합치지 않는다 — 섹션이 없다', { doc: from })
    if (levels.size > 1) throw bad(i, 'doc', `두 문서의 앵커 레벨이 다르다(${[...levels].map((l) => '#'.repeat(l)).join(' · ')}) — 합치면 섹션이 겹친다`, { doc: from, into })
    if (!levels.size) throw bad(i, 'doc', '두 문서 모두 등록부에 행이 없다 — 어느 레벨로 합칠지 알 수 없다', { doc: from, into })
    const level = [...levels][0]
    const body = mergeBody(await textOf(from), level, i, from)
    const head = (await textOf(into)).replace(/\s+$/, '')
    setFile(into, head + NL + NL + body + NL)
    setFile(from, null)
    for (const r of [...rows].reverse()) text = setRowDoc(text, r.line, r.doc, into)
    events.push({ op: 'merge', doc: from, into, rows: rows.length })
    warnings.push(`${from} 의 섹션을 ${into} 끝에 이어 붙이고 ${from} 을 지웠다 — 이름이 같은 섹션이 있으면 검사(dup-anchor)가 막는다`)
    warnings.push(`다른 문서 안의 ${from} 링크는 고치지 않았다 — 사람이 찾아 고친다`)
  }

  return { registryText: text, changed: text !== (registryText ?? ''), files, events, warnings, added }
}

// 「지운 관리 문서」 표에 한 줄 — 없으면 파일 끝에 표째 만든다. 첫 칸에 콜론이 없어 규칙으로 읽히지 않는다
const DROPPED_INTRO = ['', DROPPED_HEAD, '', '`drop` 이 지운 문서다. 되살리려면 그 작업 기록의 커밋 바로 앞에서 꺼낸다. **손으로 고치지 않는다.**', '', '| 문서 | 지운 기록 | 사유 |', '|---|---|---|']
export function addDropped(text, { doc, workId, reason }) {
  const why = String(reason || '').replace(/[|\r\n]/g, ' ').trim() || '—'
  const row = '| `' + doc + '` | `' + workId + '` | ' + why + ' |'
  const lines = String(text || '').split(NL)
  const at = lines.findIndex((l) => l.replace(/\r$/, '').trim() === DROPPED_HEAD)
  if (at < 0) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return [...lines, ...DROPPED_INTRO, row, ''].join(NL)
  }
  // 그 절의 마지막 표 행 뒤
  let last = -1
  for (let i = at + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) break
    if (/^\s*\|/.test(lines[i])) last = i
  }
  if (last < 0) {
    lines.splice(at + 1, 0, '', '| 문서 | 지운 기록 | 사유 |', '|---|---|---|', row)
    return lines.join(NL)
  }
  const cr = lines[last].endsWith('\r') ? '\r' : ''
  lines.splice(last + 1, 0, row + cr)
  return lines.join(NL)
}

// 합칠 문서에서 **앵커 레벨의 첫 헤딩부터 끝까지**를 뗀다. 그 앞(머리)에 제목과 빈 줄 · 주석 말고 글이 있으면 거절한다 —
// 머리말은 어느 섹션의 것도 아니라 이어 붙이면 `into` 의 마지막 섹션 꼬리가 된다.
function mergeBody(src, level, at, doc) {
  const lines = src.replace(/\r\n?/g, NL).split(NL)
  const anchor = new RegExp('^#{' + level + '}\\s')
  let first = -1
  for (const [i, line] of outsideFences(lines)) {
    if (anchor.test(line)) {
      first = i
      break
    }
  }
  if (first < 0) throw bad(at, 'doc', `${doc} 에 ${'#'.repeat(level)} 섹션이 없다 — 합칠 것이 없다`, { doc })
  const head = lines.slice(0, first).filter((l) => l.trim() && !/^<!--.*-->\s*$/.test(l.trim()))
  const titleOnly = head.length === 0 || (head.length === 1 && /^#{1,6}\s/.test(head[0]) && head[0].match(/^#+/)[0].length < level)
  if (!titleOnly) throw bad(at, 'doc', `${doc} 의 첫 섹션 앞에 머리말이 있다 — 어느 섹션의 글도 아니라 합치지 못한다. 사람이 먼저 정리한다`, { doc })
  return lines.slice(first).join(NL).replace(/\s+$/, '')
}
