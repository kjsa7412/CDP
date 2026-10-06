// 서식집의 서식 하나 — v1.0 개편안 §8.1 · TODO §1.4.
//
// 서식 파일(`agent/forms/<묶음>/<번호>_<제목>.md`)은 머리말(YAML) 하나와 덩어리 셋이다.
//
//   ---
//   form: public-si/DE_431          <묶음>/<번호> — 서식 id
//   title: 테이블정의서              관리번호 접두를 뗀 이름
//   number: DE_431                  관리번호 — 내보내기 틀이 쓴다
//   due: 설계완료                    제출시기(없는 묶음은 「언제」)
//   required: false                 필수 제출
//   kind: 대상                       대상 · 대장 · 정의 · 사건 · 서술
//   registry:                       이 문서에 걸리는 등록부 행 — 패턴이 여럿인 문서가 있다(DE_501)
//     - { pattern: "테이블정의서:*", anchor: "## {값}" }
//   coordValue: 테이블 물리명(소문자) 좌표 값이 무엇인가
//   fixed: [hw, db, sw, link]        (있으면) 팀이 미리 등록하는 고정 좌표 값
//   ---
//   <!-- form:head -->      새 문서로 가는 것 — 첫 문단(대장이면 빈 표 머리)
//   <!-- form:guide -->     큐레이터가 읽는 것 — 무엇 · 언제 · 누가 · 여기 적지 않는 것 · 골격 · 작성지침
//   <!-- form:example -->   큐레이터가 읽는 것 — 예시(### 아래)
//
// **순수하다** — 글을 받아 값을 낸다. 파일을 찾고 읽는 것은 부르는 쪽(서버 · CLI · 변환기)이다.
// 새 관리 문서는 `stampDoc` 하나가 찍는다 — `managed.add { form }` 과 화면의 미리보기가 같은 함수를 부른다(I1).
// 문서 종류는 문서에 적지 않는다 — 서식 머리의 `kind` 에서 온다(개편안 §4.3). 문서가 갖는 것은 표지 한 줄뿐이다.

import yaml from 'js-yaml'
import { outsideFences, patternProblem } from './managed.js'

// 문서 종류 다섯 — 등록부 대상인지와 **다른 축**이다(개편안 §8.1)
export const FORM_KINDS = Object.freeze(['대상', '대장', '정의', '사건', '서술'])

const BLOCKS = ['head', 'guide', 'example']
// 새 행은 `##` 하나 또는 문서 전체(`—`)다 — `###` 는 읽기만 남기고 서식에서 뺐다(개편안 V8)
const ANCHORS = ['## {값}', '—']
const FM = /^---\n(?:([\s\S]*?)\n)?---(?:\n|$)/
const RE_MARK = /^<!--\s*form:([A-Za-z]+)\s*-->$/
const RE_STAMP = /^<!--\s*cdp:form\s+(\S+?)\s*-->$/
const RE_HEADING = /^#{1,6}\s/
// `<묶음>/<번호>` — 주석 안에 들어가므로 공백 · `>` · `--` 를 받지 않는다
const RE_SEG = /^[A-Za-z0-9가-힣][A-Za-z0-9가-힣._-]*$/

// 읽는 경계에서 개행을 맞춘다(I13) — CRLF 로 받은 서식도 같은 값을 낸다
const norm = (s) => String(s ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')

function str(v) {
  if (v == null) return null
  if (v instanceof Date) return v.toISOString().slice(0, 10)
  const s = String(v).trim()
  return s || null
}

function trimBlank(lines) {
  let a = 0
  let b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  return lines.slice(a, b)
}

// 덩어리 셋을 표지로 가른다. 코드펜스 안의 표지는 표지가 아니다(예시가 서식을 보일 수 있다).
function splitBlocks(body, errors) {
  const lines = body.split('\n')
  const marks = []
  for (const [i, line] of outsideFences(lines)) {
    const m = RE_MARK.exec(line.trim())
    if (m) marks.push({ name: m[1], at: i })
  }
  const out = { head: '', guide: '', example: '' }
  const first = marks.length ? marks[0].at : lines.length
  if (lines.slice(0, first).some((l) => l.trim())) errors.push('덩어리 표지(<!-- form:head -->) 앞에 글이 있다')

  const seen = new Set()
  let order = -1
  marks.forEach((mk, k) => {
    const idx = BLOCKS.indexOf(mk.name)
    if (idx < 0) return errors.push(`모르는 덩어리 표지: <!-- form:${mk.name} -->`)
    if (seen.has(mk.name)) return errors.push(`덩어리 표지가 둘이다: <!-- form:${mk.name} -->`)
    if (idx < order) errors.push('덩어리 순서가 틀렸다 — head · guide · example 순이다')
    order = Math.max(order, idx)
    seen.add(mk.name)
    const end = k + 1 < marks.length ? marks[k + 1].at : lines.length
    out[mk.name] = trimBlank(lines.slice(mk.at + 1, end)).join('\n')
  })
  for (const b of BLOCKS) if (!seen.has(b)) errors.push(`덩어리가 없다: <!-- form:${b} -->`)
  return out
}

function normRegistry(v, errors) {
  if (v == null) return []
  if (!Array.isArray(v)) {
    errors.push('registry 는 목록이다 — `- { pattern: "…", anchor: "## {값}" }`')
    return []
  }
  return v.map((e) => ({
    pattern: e && typeof e === 'object' ? str(e.pattern) : null,
    anchor: e && typeof e === 'object' ? str(e.anchor) : null,
  }))
}

function normFixed(v, errors) {
  if (v == null) return []
  if (!Array.isArray(v)) {
    errors.push('fixed 는 목록이다 — `fixed: [값, …]`')
    return []
  }
  return v.map(str)
}

/**
 * 서식 파일 하나를 읽는다.
 * @param text   서식 파일 원문
 * @param group  폴더(묶음) 이름 — 주면 `form` 의 묶음과 맞는지 본다
 * @param file   파일 이름 — 주면 `<번호>_` 로 시작하는지 본다
 * @returns { id, group, number, title, due, required, kind, registry, coordValue, fixed, head, guide, example, errors }
 *          errors 는 읽으며 본 구조 문제(머리말 · 덩어리 · 폴더 · 파일 이름). 값의 검사는 `lintForm` 이 더한다
 */
export function parseForm(text, { group = null, file = null } = {}) {
  const errors = []
  const src = norm(text)
  const m = FM.exec(src)
  let fm = {}
  let body = src
  if (!m) errors.push('머리말(--- … ---)이 없다')
  else {
    body = src.slice(m[0].length)
    try {
      const v = yaml.load(m[1] ?? '')
      if (v != null && (typeof v !== 'object' || Array.isArray(v))) errors.push('머리말이 객체가 아니다')
      else fm = v || {}
    } catch (e) {
      errors.push(`머리말 YAML 오류: ${e.reason || e.message}`)
    }
  }

  const id = str(fm.form)
  const number = str(fm.number)
  const blocks = splitBlocks(body, errors)

  const idGroup = id && id.includes('/') ? id.slice(0, id.indexOf('/')) : null
  if (group && idGroup && idGroup !== group) errors.push(`form 의 묶음(${idGroup})이 폴더(${group})와 다르다`)
  if (file && number) {
    const base = String(file).replace(/^.*[\\/]/, '').replace(/\.md$/i, '')
    if (!base.startsWith(number + '_')) errors.push(`파일 이름이 <번호>_<제목>.md 가 아니다: ${base}.md (번호 ${number})`)
  }

  return {
    id,
    group: group || idGroup,
    number,
    title: str(fm.title),
    due: str(fm.due),
    required: typeof fm.required === 'boolean' ? fm.required : null,
    kind: str(fm.kind),
    registry: normRegistry(fm.registry, errors),
    coordValue: str(fm.coordValue),
    fixed: normFixed(fm.fixed, errors),
    head: blocks.head,
    guide: blocks.guide,
    example: blocks.example,
    errors,
  }
}

const oneLine = (s) => String(s ?? '').replace(/[\r\n]+/g, ' ').trim()

/**
 * 서식에서 새 관리 문서를 찍는다 — 제목 · 서식 표지 · head 뿐이다.
 * 예시 · 작성지침 · 관리번호 표 · `applied` 는 가지 않는다(개편안 §8.1). 부르는 쪽이 `lintForm` 을 먼저 본다.
 * @param title  문서 제목 — 없으면 서식의 title
 */
export function stampDoc(form, { title } = {}) {
  const t = oneLine(title) || oneLine(form?.title)
  const id = oneLine(form?.id)
  const head = trimBlank(norm(form?.head).split('\n')).join('\n')
  const top = `# ${t}\n<!-- cdp:form ${id} -->\n`
  return head ? `${top}\n${head}\n` : top
}

/**
 * 관리 문서의 서식 표지 `<!-- cdp:form <id> -->` 를 읽는다 — H1 바로 아래 3줄 안만 본다.
 * 본문 중간의 같은 글(예시 · 설명)을 표지로 읽지 않는다. 없으면 null.
 */
export function formIdOf(docText) {
  const lines = norm(docText).split('\n')
  let i = 0
  // 머리말이 있는 옛 문서도 읽는다 — 표지는 머리말 뒤의 H1 아래다
  if (lines[0] === '---') {
    const end = lines.indexOf('---', 1)
    if (end > 0) i = end + 1
  }
  // H1 앞의 빈 줄 · 주석(문서 전체 좌표의 applied)은 건너뛴다
  while (i < lines.length && (!lines[i].trim() || /^<!--.*-->$/.test(lines[i].trim()))) i++
  if (i >= lines.length || !/^#\s+\S/.test(lines[i])) return null
  for (let k = i + 1; k <= i + 3 && k < lines.length; k++) {
    if (RE_HEADING.test(lines[k])) break
    const m = RE_STAMP.exec(lines[k].trim())
    if (m) return m[1]
  }
  return null
}

/**
 * 서식의 문제 목록 — 비면 쓸 수 있다.
 * 머리 필드 · 종류 · 등록부 모양 · 덩어리 셋 · head 가 새 문서로 가도 되는가(제목 · applied · 예시 · 작성지침이 없나).
 */
export function lintForm(form) {
  if (!form || typeof form !== 'object') return ['서식이 아니다']
  const out = [...(form.errors || [])]

  const id = form.id
  if (!id) out.push('form 이 없다 — `form: <묶음>/<번호>`')
  else {
    const at = id.indexOf('/')
    const g = at > 0 ? id.slice(0, at) : ''
    const n = at > 0 ? id.slice(at + 1) : ''
    if (!RE_SEG.test(g) || !RE_SEG.test(n) || id.includes('--')) out.push(`form 이 <묶음>/<번호> 모양이 아니다: ${id}`)
    else if (form.number && n !== form.number) out.push(`form 의 번호(${n})가 number(${form.number})와 다르다`)
  }
  if (!form.number) out.push('number 가 없다 — 관리번호')
  if (!form.title) out.push('title 이 없다')
  if (!form.due) out.push('due 가 없다 — 제출시기')
  if (typeof form.required !== 'boolean') out.push('required 는 true · false 다')
  if (!form.kind) out.push(`kind 가 없다 — ${FORM_KINDS.join(' · ')}`)
  else if (!FORM_KINDS.includes(form.kind)) out.push(`kind 가 ${FORM_KINDS.join(' · ')} 가 아니다: ${form.kind}`)

  const reg = Array.isArray(form.registry) ? form.registry : []
  const pats = new Set()
  reg.forEach((r, k) => {
    const where = `registry[${k}]`
    const why = patternProblem(r?.pattern)
    if (why) out.push(`${where} 패턴: ${why}${r?.pattern ? ` (${r.pattern})` : ''}`)
    else if (pats.has(r.pattern)) out.push(`${where} 패턴이 겹친다: ${r.pattern}`)
    else pats.add(r.pattern)
    if (!ANCHORS.includes(r?.anchor)) out.push(`${where} anchor 는 \`## {값}\` 또는 \`—\` 다: ${r?.anchor ?? '(없음)'}`)
  })
  if (reg.length && !form.coordValue) out.push('registry 가 있는데 coordValue(좌표 값)가 없다')
  const fixed = Array.isArray(form.fixed) ? form.fixed : []
  if (fixed.length && !reg.length) out.push('fixed 가 있는데 registry 가 없다')
  if (fixed.some((v) => !v)) out.push('fixed 에 빈 값이 있다')

  // head — 새 문서로 그대로 간다. 섹션 · applied · 표지 · 예시 · 작성지침이 섞이면 빈 문서가 아니다
  const head = String(form.head ?? '')
  if (!head.trim()) out.push('head 가 비었다 — 새 문서의 첫 문단')
  else {
    const hl = head.split('\n')
    for (const [, l] of outsideFences(hl)) {
      if (RE_HEADING.test(l)) {
        out.push(`head 에 제목이 있다: ${l.trim()} — 섹션은 큐레이션이 세운다`)
        break
      }
    }
    if (/<!--\s*applied/i.test(head)) out.push('head 에 applied 주석이 있다')
    if (/<!--\s*(cdp:|form:)/i.test(head)) out.push('head 에 cdp · form 표지가 있다')
    if (head.includes('(예시)')) out.push('head 에 (예시)가 있다 — 예시는 example 로')
    if (head.includes('작성지침')) out.push('head 에 작성지침이 있다 — guide 로')
  }
  return out
}
