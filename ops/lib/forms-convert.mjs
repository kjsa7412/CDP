// 패키지(agent/packages/*) → 서식집(agent/forms/<묶음>/) — v1.0 개편안 §8.1 · TODO §1.4 · 갈래 F.
//
//   node ops/lib/forms-convert.mjs            서식집을 다시 쓴다(묶음 폴더의 남는 파일은 지운다)
//   node ops/lib/forms-convert.mjs --check    쓰지 않고 견준다 — 다르면 1 로 끝난다
//
// **결정적이다** — 같은 패키지에서 늘 같은 바이트가 나온다(LF · 끝 개행 하나). 몇 번을 돌려도 된다.
//
// 문서 하나가 서식 하나다. 머리 표는 머리말로, 첫 문단은 head 로, 무엇 · 언제 · 누가 · 「여기 적지 않는 것」 ·
// 작성지침 · 골격은 guide 로, (예시) 섹션 · 표 속 예시 행 · 어휘의 `example:` 줄은 example 로 간다. 그 밖의 글은
// 그대로 옮긴다. 모양이 예상과 다르면 **조용히 넘기지 않고 멈춘다** — 그 자리가 규칙을 더 정할 자리다.
//
// 기계 규칙 밖의 것(제목 뼈대 · 고정 좌표 · `###` 레벨 · 표시 없는 예시 · 종류를 문서마다 정한 것)은 아래 표로
// 둔다 — 검토할 수 있게. 돌 때마다 어느 문서에 어느 규칙이 걸렸는지 찍는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseRegistry, resolveCoord } from '../../core/managed.js'
import { parseVocab } from '../../core/vocab.js'
import { parseForm, lintForm, stampDoc, FORM_KINDS } from '../../core/forms.js'

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const PACKAGES = path.join(ROOT, 'agent', 'packages')
const FORMS = path.join(ROOT, 'agent', 'forms')

// 서식이 없는 묶음 — 빈 지식 레포(서식 0)는 서식집에 오지 않는다
const SKIP = new Set(['blank'])

// ── 종류 — 대상 · 대장 · 정의 · 사건 · 서술 ────────────────────────────────────────────────
//
// 머리 표 `등록부` 칸이 정한다. 행이 있는 문서(등록부 대상)는 대상이 기본이고, 없는 문서는 그 칸의 사유가 정한다.
// 종류는 등록부 대상인지와 다른 축이다(개편안 §8.1) — 그래서 문서마다 따로 정한 것이 있다.
const KIND_REGISTERED = { kind: '대상', why: '등록부 행이 있다 — 섹션 하나가 바뀌는 대상 하나' }
const KIND_BY_REASON = [
  { re: /날짜축|사건이다|판 축|스프린트 축/, kind: '사건', why: '날짜 · 회차 · 판 · 스프린트 축 — 섹션 하나가 사건 하나' },
  { re: /문서 전체가 내용/, kind: '서술', why: '문서 전체가 내용 — 가이드 · 계획서 · 매뉴얼 · 정책' },
  { re: /집계|추적|우선순위|시간축/, kind: '대장', why: '집계 · 추적 — 행 하나가 항목 하나인 대장' },
]
const KIND_OVERRIDE = {
  'public-si/BM_501': { kind: '대장', why: '이슈 · 위험 대장 — 등록부 대상이지만 섹션은 닫힐 때까지 따라가는 아젠다다' },
  'public-si/DE_421': { kind: '정의', why: '도메인 용어 — 논리명 하나에 물리명 하나를 못 박는 정의' },
  'public-si/DE_601': { kind: '대장', why: '등록부 칸에 사유 대신 「테이블정의서: 은 테이블정의서가 갖는다」 — 행 하나가 테이블 하나인 진행 대장' },
  'cloud-native/OP_301': { kind: '사건', why: '장애회고 — 등록부 대상이지만 섹션 하나가 장애(사건) 하나다' },
}
// 묶음 README 의 문서 표 「유형」 — 견주기만 한다(출력은 이 표를 보지 않는다)
const README_KIND = { 좌표: '대상', 대장: '대장', 사건: '사건', 서술: '서술' }

// ── 문서마다 고친 글 — 기계 규칙으로 안 되는 것 ──────────────────────────────────────────
//
// v1.0 은 새 행 · 서식의 섹션 레벨을 `##` 하나로 한다(개편안 §4.3 · V8). 좌표가 `###` 이던 유일한 문서의 머리 문단 ·
// 안내를 `##` 에 맞춘다. 분류는 `<!-- 분류 -->` 주석이다. 고칠 글은 정확히 한 번 나와야 한다 — 원문이 바뀌면 멈춘다.
const PATCHES = {
  'public-si/DE_421': {
    head: '표준 용어의 지금 상태. **섹션 하나가 용어 하나**다.',
    guide: [
      [
        '> **`##` 은 분류, `###` 이 좌표다.** 좌표 레벨이 `###` 이므로 **하위 제목을\n> 쓰면 안 된다** — `#### ` 도 쓰지 말고 볼드로 적는다.',
        '> **분류는 `<!-- 분류 -->` 주석이고 `##` 이 좌표다.** 분류를 제목으로 쓰면 좌표로 잡힌다.\n> **하위 제목을 쓰지 않는다** — 볼드로 적는다.',
      ],
      ['| 분류 | `## <분류>`. 접미어 계열이나 업무로 묶는다 | 필수 |', '| 분류 | `<!-- <분류> -->` 주석. 접미어 계열이나 업무로 묶는다 | 필수 |'],
      [
        '| 섹션 제목 | `### <논리명>`. **한글 붙여쓰기** — 공백이 있으면 좌표가 안 된다 | 필수 |',
        '| 섹션 제목 | `## <논리명>`. **한글 붙여쓰기** — 공백이 있으면 좌표가 안 된다 | 필수 |',
      ],
      ['| 하위 제목 | **쓰지 않는다.** `###` 이 좌표 레벨이다 | — |', '| 하위 제목 | **쓰지 않는다.** 볼드로 적는다 | — |'],
    ],
    why: '머리 문단 · 안내 넷을 `##` 레벨에 맞춰 고침(PATCHES)',
  },
  'agile-product/DS_501': {
    guide: [
      [
        '| 제목 | 자유롭다 — 등록부 비대상이라 좌표와 충돌하지 않는다. `## 작성지침` 은 남긴다 | 필수 |',
        '| 제목 | 자유롭다 — 등록부 비대상이라 좌표와 충돌하지 않는다 | 필수 |',
      ],
    ],
    why: '작성지침 행의 「`## 작성지침` 은 남긴다」 를 뗌 — 작성지침은 서식집에만 있다',
  },
}

// ── 기계 규칙 — 모든 문서에 같게 ─────────────────────────────────────────────────────────
//
// v1.0 의 문서에는 머리 표 · `applied: null` · 작성지침이 없다(개편안 §4.1 · §8.1). 그것을 시키는 안내 줄을 guide 에서 뗀다.
const RE_APPLIED_LINE = /^\s*<!--\s*applied\s*:.*-->\s*$/ //              섹션의 applied 주석 — 서버가 계산한다(§4.4)
const RE_ROW_APPLIED = /^\|\s*`applied`\s*\|/ //                         작성지침의 `applied` 행
const RE_ROW_HEADTABLE = /^\|\s*머리 표\s*\|\s*관리번호[^|]*고치지 않는다\s*\|/ // 작성지침의 「머리 표 — 관리번호는 고치지 않는다」 행
const LINE_KEEP_GUIDE = '> 다만 `## 작성지침` 은 남겨 둔다.' //          제목 뼈대의 꼬리 줄

const norm = (s) => String(s ?? '').replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n')
const unq = (s) => String(s ?? '').replace(/^`|`$/g, '').trim()
const fail = (where, msg) => {
  throw new Error(`${where}: ${msg}`)
}

// 코드펜스 안의 줄 — 제목 · 표 · 주석을 세지 않는다(`core/managed.js` outsideFences 와 같은 규칙)
function fenceMask(lines) {
  const mask = new Array(lines.length).fill(false)
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const f = lines[i].match(/^\s{0,3}(`{3,}|~{3,})/)
    if (f) {
      mask[i] = true
      if (!fence) fence = f[1][0].repeat(3)
      else if (lines[i].trim().startsWith(fence)) fence = null
      continue
    }
    mask[i] = !!fence
  }
  return mask
}

function trimBlank(lines) {
  let a = 0
  let b = lines.length
  while (a < b && !lines[a].trim()) a++
  while (b > a && !lines[b - 1].trim()) b--
  return lines.slice(a, b)
}

// 빈 줄 둘 이상을 하나로 — 줄을 뗀 자리가 벌어지지 않게(펜스 안은 그대로)
function collapse(lines) {
  const mask = fenceMask(lines)
  return lines.filter((l, i) => mask[i] || l.trim() || i === 0 || lines[i - 1].trim() || mask[i - 1])
}

// 빈 줄로 나뉜 덩어리 — 표 · 인용 · 주석 · 문단
function blocksOf(lines) {
  const mask = fenceMask(lines)
  const out = []
  let cur = []
  lines.forEach((l, i) => {
    if (!mask[i] && !l.trim()) {
      if (cur.length) out.push(cur)
      cur = []
    } else cur.push(l)
  })
  if (cur.length) out.push(cur)
  return out.map((ls) => ({
    lines: ls,
    type: ls.every((l) => l.startsWith('|'))
      ? 'table'
      : ls.every((l) => l.startsWith('>'))
        ? 'quote'
        : ls.every((l) => /^<!--.*-->$/.test(l.trim()))
          ? 'comment'
          : 'para',
  }))
}

// `## ex_plan_mst — (예시) 계획서마스터` → `ex_plan_mst — 계획서마스터`
function cleanTitle(t) {
  return t
    .replace(/\(예시\)\s*/g, '')
    .replace(/\s+[—–-]\s*$/, '')
    .trim()
}

// 어휘 항목 줄과 그 밑 들여쓴 줄(`core/examples.js` entryRange 와 같다)
function vocabEntryLines(vlines, e) {
  const at = e.line - 1
  let end = at + 1
  while (end < vlines.length && /^\s+\S/.test(vlines[end])) end++
  return vlines.slice(at, end)
}

// 어휘 줄을 타입 머리와 함께 펜스로 — 타입 순서는 어휘 파일의 순서
function vocabFence(entries, vlines) {
  const byType = new Map()
  for (const e of entries) {
    if (!byType.has(e.type)) byType.set(e.type, [])
    byType.get(e.type).push(...vocabEntryLines(vlines, e))
  }
  const parts = [...byType].map(([t, ls]) => `## ${t}\n\n${ls.join('\n')}`)
  return '```\n' + parts.join('\n\n') + '\n```'
}

// ── YAML 머리말 — 손으로 찍는다(모양을 TODO §1.4 와 같게). 읽어 되돌려 보는 것은 parseForm 이 한다 ──
const YAML_SPECIAL = /^(?:true|false|null|yes|no|on|off|~|[-+]?(?:\d[\d_]*)?(?:\.\d*)?(?:e[-+]?\d+)?|\d{4}-\d{2}-\d{2}.*)$/i
function yq(s, { flow = false } = {}) {
  const v = String(s)
  const plain =
    /^[A-Za-z0-9가-힣(]/.test(v) &&
    !/[\n\r\t]/.test(v) &&
    !/:\s|:$|\s#/.test(v) &&
    v === v.trim() &&
    !YAML_SPECIAL.test(v) &&
    !(flow && /[,[\]{}]/.test(v))
  return plain ? v : JSON.stringify(v)
}

function frontMatter(f) {
  const out = ['---', `form: ${yq(f.id)}`, `title: ${yq(f.title)}`, `number: ${yq(f.number)}`, `due: ${yq(f.due)}`]
  out.push(`required: ${f.required ? 'true' : 'false'}`, `kind: ${yq(f.kind)}`)
  if (!f.registry.length) out.push('registry: []')
  else {
    out.push('registry:')
    for (const r of f.registry) out.push(`  - { pattern: ${JSON.stringify(r.pattern)}, anchor: ${JSON.stringify(r.anchor)} }`)
  }
  if (f.coordValue) out.push(`coordValue: ${yq(f.coordValue)}`)
  if (f.fixed.length) out.push(`fixed: [${f.fixed.map((v) => yq(v, { flow: true })).join(', ')}]`)
  out.push('---')
  return out.join('\n')
}

function replaceOnce(text, from, to, where) {
  const at = text.indexOf(from)
  if (at < 0) fail(where, `고칠 글이 없다 — 원문이 바뀌었으면 PATCHES 를 고친다: ${from.split('\n')[0]}`)
  if (text.indexOf(from, at + 1) >= 0) fail(where, `고칠 글이 둘이다: ${from.split('\n')[0]}`)
  return text.slice(0, at) + to + text.slice(at + from.length)
}

/**
 * 관리 문서 하나 → 서식 하나.
 * @param group      묶음 이름(패키지 폴더)
 * @param rel        `docs/` 아래 경로(POSIX) — `2.개발/DE_431_테이블정의서.md`
 * @param text       문서 원문
 * @param rules      parseRegistry(_managed.md).rules
 * @param vocab      parseVocab(_vocab.md)
 * @param vocabLines _vocab.md 의 줄
 * @returns { id, rel, file, text, form, notes: [기계 규칙 밖에서 걸린 것], counts: { 기계 규칙이 뗀 줄 수 } }
 */
export function convertDoc({ group, rel, text, rules, vocab, vocabLines }) {
  const where = `${group}/docs/${rel}`
  const notes = []
  const counts = { appliedComment: 0, appliedRow: 0, headTableRow: 0, keepGuide: 0 }
  const lines = norm(text).replace(/\n+$/, '').split('\n')
  const stem = path.posix.basename(rel, '.md')

  // ① 제목 — `# <번호> <제목>` · 파일 이름은 `<번호>_<제목>.md`
  const h1 = /^# ([A-Z]{2}_\d{3}) (\S.*)$/.exec(lines[0])
  if (!h1) fail(where, `첫 줄이 \`# <번호> <제목>\` 이 아니다: ${lines[0]}`)
  const [, number, title] = h1
  if (stem !== `${number}_${title}`) fail(where, `파일 이름(${stem})이 제목(${number} ${title})과 다르다`)
  const id = `${group}/${number}`

  // ② 첫 문단 — H1 과 머리 표 사이
  let i = 1
  while (i < lines.length && !lines[i].trim()) i++
  const headFrom = i
  while (i < lines.length && lines[i].trim()) i++
  const headLines = lines.slice(headFrom, i)
  if (!headLines.length || headLines.some((l) => /^[|#>]|^<!--/.test(l))) fail(where, '제목 아래 첫 문단이 없다')
  while (i < lines.length && !lines[i].trim()) i++

  // ③ 머리 표 → 머리말
  if (lines[i] !== '| | |' || lines[i + 1] !== '|---|---|') fail(where, `머리 표가 첫 문단 바로 뒤에 없다: ${lines[i]}`)
  i += 2
  const hdr = new Map()
  while (i < lines.length && lines[i].startsWith('|')) {
    const cells = lines[i].split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length !== 2) fail(where, `머리 표 행이 두 칸이 아니다: ${lines[i]}`)
    if (hdr.has(cells[0])) fail(where, `머리 표 행이 둘이다: ${cells[0]}`)
    hdr.set(cells[0], cells[1])
    i++
  }
  for (const k of hdr.keys()) {
    if (!['관리번호', '제출시기', '필수 제출', '언제', '등록부', '좌표 값'].includes(k)) fail(where, `모르는 머리 표 행: ${k}`)
  }
  if (unq(hdr.get('관리번호')) !== number) fail(where, `머리 표 관리번호(${hdr.get('관리번호')})가 제목의 번호와 다르다`)
  // 제출시기 — 없는 묶음(agile-product · ai-service · cloud-native)은 「언제」 가 그 자리다
  const due = hdr.get('제출시기') ?? hdr.get('언제')
  if (!due) fail(where, '제출시기 · 언제가 없다')
  let required = false
  if (hdr.has('필수 제출')) {
    const v = hdr.get('필수 제출').replace(/\*\*/g, '').trim()
    if (v !== '예' && v !== '아니오') fail(where, `필수 제출이 예 · 아니오가 아니다: ${v}`)
    required = v === '예'
  }

  // 등록부 — 이 문서를 가리키는 `_managed.md` 행 전부(순서대로). 머리 표 칸과 같아야 한다
  const docPath = `docs/${rel}`
  const mine = rules.filter((r) => r.doc === docPath)
  const regCell = hdr.get('등록부')
  if (!regCell) fail(where, '머리 표에 등록부 칸이 없다')
  let reason = null
  if (mine.length) {
    const want = mine.map((r) => `\`${r.pattern}\` → \`${r.whole ? '—' : '#'.repeat(r.level) + ' {값}'}\``).join(' · ')
    if (regCell !== want) fail(where, `머리 표 등록부 칸(${regCell})이 _managed.md(${want})와 다르다`)
  } else {
    const m = /^\*\*비대상\*\* — (.+)$/.exec(regCell)
    if (!m) fail(where, `등록부 칸을 읽을 수 없다: ${regCell}`)
    reason = m[1]
  }
  const levels = [...new Set(mine.map((r) => (r.whole ? 0 : r.level)))]
  if (levels.length > 1) fail(where, `등록부 레벨이 둘이다: ${levels.join(' · ')}`)
  const level = levels[0] ?? 0
  const registry = mine.map((r) => ({ pattern: r.pattern, anchor: r.whole ? '—' : '## {값}' }))
  if (level > 2) notes.push(`좌표 레벨 \`${'#'.repeat(level)} {값}\` → 서식은 \`## {값}\` (V8)`)
  const coordValue = hdr.get('좌표 값') ?? null
  if (mine.length && !coordValue) fail(where, '등록부 대상인데 좌표 값 칸이 없다')
  if (!mine.length && coordValue) fail(where, '등록부 대상이 아닌데 좌표 값 칸이 있다')

  // 종류
  let kindOf = KIND_OVERRIDE[id]
  if (kindOf) notes.push(`종류 ${kindOf.kind} — ${kindOf.why}`)
  else if (mine.length) kindOf = KIND_REGISTERED
  else kindOf = KIND_BY_REASON.find((k) => k.re.test(reason))
  if (!kindOf) fail(where, `종류를 정할 수 없다 — 등록부 칸 「${regCell}」`)
  const kind = kindOf.kind

  // 어휘 — 이 문서에 걸리는 좌표. `example:` 은 예시, 나머지는 팀이 미리 등록하는 고정 좌표
  const registryObj = { rules }
  const exVocab = []
  const fixedVocab = []
  for (const e of vocab.coords.values()) {
    const hit = resolveCoord(registryObj, e.coord)
    if (!hit || hit.doc !== docPath) continue
    ;(e.example ? exVocab : fixedVocab).push(e)
  }
  const valueOf = (c) => c.slice(c.indexOf(':') + 1)
  const exValues = new Set(exVocab.map((e) => valueOf(e.coord)))
  const fixed = fixedVocab.map((e) => valueOf(e.coord))
  if (fixed.length) notes.push(`고정 좌표 ${fixed.join(' · ')} → 머리말 fixed · guide 「고정 좌표」(어휘 줄) · 섹션은 example`)

  // ④ 나머지 — `##` 로 가른다. 마지막 `##` 은 작성지침이다
  const restLines = lines.slice(i)
  const rmask = fenceMask(restLines)
  const tops = []
  restLines.forEach((l, k) => {
    if (rmask[k]) return
    const h = /^(#{1,6})\s+(.+?)\s*$/.exec(l)
    if (!h) return
    if (h[1].length === 1) fail(where, `H1 이 둘이다: ${l}`)
    if (h[1].length === 2) tops.push({ at: k, title: h[2] })
  })
  const pre = restLines.slice(0, tops.length ? tops[0].at : restLines.length)
  const secs = tops.map((t, k) => ({ title: t.title, lines: restLines.slice(t.at, k + 1 < tops.length ? tops[k + 1].at : restLines.length) }))
  const guideSec = secs.pop()
  if (!guideSec || guideSec.title !== '작성지침') fail(where, '마지막 `##` 이 작성지침이 아니다')
  if (secs.some((s) => s.title === '작성지침')) fail(where, '작성지침이 둘이다')

  // 작성지침 앞의 가름줄 `---` — 문서 안의 구분이라 서식에는 가지 않는다
  const tail = secs.length ? secs[secs.length - 1].lines : pre
  const tt = trimBlank(tail)
  if (tt[tt.length - 1] !== '---') fail(where, '작성지침 앞에 `---` 가 없다')
  tail.splice(0, tail.length, ...trimBlank(tt.slice(0, -1)))

  // ⑤ 머리 표 아래 — 안내는 guide, 예시 행 표 · ⚠ 표지 · (예시) 문단 · 섹션에 붙은 주석은 example
  const guideParts = []
  const exParts = []
  let ledger = null
  let afterLedger = false
  let sawComment = false
  for (const b of blocksOf(pre)) {
    const txt = b.lines.join('\n')
    if (b.type === 'table' && b.lines.slice(2).some((l) => l.includes('(예시)'))) {
      if (kind !== '대장') fail(where, `머리 아래 예시 행 표는 대장에만 있다 (종류 ${kind})`)
      if (ledger) fail(where, '예시 행 표가 둘이다')
      ledger = b.lines
      exParts.push('### 예시 — 행\n\n' + txt)
    } else if (b.type === 'quote' && /^>\s*(⚠|아래는)/.test(b.lines[0])) exParts.push(txt)
    else if (b.type === 'para' && txt.includes('(예시)')) {
      exParts.push(txt)
      notes.push(`(예시) 문단 「${b.lines[0].slice(0, 24)}…」 → example`)
    } else if (b.type === 'comment') {
      sawComment = true
      exParts.push(txt)
    } else {
      if (sawComment) fail(where, `섹션 주석 뒤에 안내 글이 있다: ${b.lines[0]}`)
      if (ledger && !afterLedger) notes.push(`대장 표 뒤의 안내 「${b.lines[0].slice(0, 24)}…」 → guide`)
      if (ledger) afterLedger = true
      guideParts.push(txt)
    }
  }
  if (kind === '대장' && ledger) notes.push('대장 표 머리 → head (빈 표) · 예시 행 → example')

  // ⑥ 섹션 — 제목 뼈대는 guide, 나머지는 전부 example(`### 예시 — …`)
  const L = level || 2 // 좌표 섹션의 레벨 — 등록부가 없는 문서는 `##` 가 섹션이다
  let skeleton = null
  const exSecs = []
  for (const s of secs) {
    if (s.title === '제목 뼈대') {
      if (skeleton) fail(where, '제목 뼈대가 둘이다')
      skeleton = s
    } else exSecs.push(s)
  }
  if (skeleton) {
    const body = skeleton.lines.slice(1).filter((l) => {
      if (l !== LINE_KEEP_GUIDE) return true
      counts.keepGuide++
      return false
    })
    guideParts.push('### 제목 뼈대\n\n' + trimBlank(body).join('\n'))
    notes.push('「## 제목 뼈대」 → guide')
  }

  // 서술형인데 제목 뼈대가 없으면 `##` 절 제목이 뼈대다 — 뼈대는 guide 에 표로, 절 본문은 example 로
  if (kind === '서술' && !skeleton) {
    if (!exSecs.length) fail(where, '서술형인데 제목 뼈대도 절도 없다')
    const rows = exSecs.map((s, k) => `| ${k + 1} | ${cleanTitle(s.title)} |`)
    guideParts.push('### 골격\n\n| # | 절 |\n|--:|---|\n' + rows.join('\n'))
    notes.push(`절 ${exSecs.length}개(\`##\`)가 뼈대 — guide 「골격」 표 · 절 본문은 example`)
  }
  if (kind === '서술' && skeleton && exSecs.length) fail(where, '제목 뼈대와 절이 같이 있다')

  // 좌표 섹션이 예시인지 — 제목의 (예시) · 어휘의 example: · 고정 좌표 · 본문의 ⚠ 표지
  const unmarked = []
  const exText = []
  for (const s of exSecs) {
    const m = fenceMask(s.lines)
    const out = []
    s.lines.forEach((l, k) => {
      if (m[k]) return out.push(l)
      if (RE_APPLIED_LINE.test(l)) {
        counts.appliedComment++
        return
      }
      const h = /^(#{1,6})\s+(.+?)\s*$/.exec(l)
      if (!h) return out.push(l)
      const lv = h[1].length
      if (L === 3 && lv === 2) return out.push(`<!-- ${h[2]} -->`) // 분류 제목 → 주석(§4.3)
      if (lv < L) fail(where, `섹션 레벨보다 얕은 제목: ${l}`)
      if (lv > L) return out.push('#'.repeat(3 + lv - L) + ' ' + h[2])
      // 좌표 섹션 제목
      if (kind !== '서술') {
        const value = h[2].split(/\s+[—–-]\s+/)[0].trim()
        const marked = /\(예시\)/.test(h[2]) || exValues.has(value) || fixed.includes(value)
        if (!marked) {
          // 표시가 없으면 그 섹션 본문의 ⚠ 예시 표지로 가린다
          const rest = s.lines.slice(k + 1)
          const next = rest.findIndex((x) => new RegExp(`^#{1,${L}}\\s`).test(x))
          const body = next < 0 ? rest : rest.slice(0, next)
          if (!body.some((x) => /^>\s*⚠.*예시/.test(x))) fail(where, `예시인지 가릴 수 없는 섹션: ${h[2]}`)
          unmarked.push(h[2])
        }
      }
      out.push(`### 예시 — ${cleanTitle(h[2])}`)
    })
    exText.push(trimBlank(collapse(out)).join('\n'))
  }
  if (unmarked.length) notes.push(`표시 없는 예시 섹션 ${unmarked.map((t) => `「${t}」`).join(' · ')} — 본문의 ⚠ 표지로 example`)
  if (level === 3) notes.push('분류 `##` → `<!-- 분류 -->` 주석 · 용어 `###` → `### 예시 — …`')

  // ⑦ 고정 좌표 — 어휘 줄 그대로(guide). 작성지침은 guide 의 끝
  if (fixedVocab.length) guideParts.push('### 고정 좌표\n\n' + vocabFence(fixedVocab, vocabLines))
  const gl = guideSec.lines.slice(1).filter((l) => {
    if (RE_ROW_APPLIED.test(l)) return counts.appliedRow++, false
    if (RE_ROW_HEADTABLE.test(l)) return counts.headTableRow++, false
    return true
  })
  const gmask = fenceMask(gl)
  if (gl.some((l, k) => !gmask[k] && /^#{1,6}\s/.test(l))) fail(where, '작성지침 안에 제목이 있다')
  guideParts.push('### 작성지침\n\n' + trimBlank(gl).join('\n'))

  // ⑧ 예시 어휘 — `example:` 줄 그대로(example 의 끝)
  if (exVocab.length) exText.push('### 예시 — 어휘\n\n' + vocabFence(exVocab, vocabLines))

  // ⑨ 덩어리 셋
  const patch = PATCHES[id] || {}
  if (patch.why) notes.push(patch.why)
  let head = patch.head ?? headLines.join('\n')
  if (ledger) head += '\n\n' + ledger.slice(0, 2).join('\n')
  let guide = guideParts.join('\n\n')
  let example = [...exParts, ...exText].join('\n\n')
  for (const [from, to] of patch.guide || []) guide = replaceOnce(guide, from, to, where)
  for (const [from, to] of patch.example || []) example = replaceOnce(example, from, to, where)
  // 표 행 끝의 공백(원문 둘에 있다)은 뜻이 없다 — 걷는다
  const tidy = (s) =>
    s
      .split('\n')
      .map((l) => (l.startsWith('|') ? l.replace(/\s+$/, '') : l))
      .join('\n')
  head = tidy(head)
  guide = tidy(guide)
  example = tidy(example)
  // 예시가 없는 서식이 있다(공공 SI 의 서술형 — 제목 뼈대뿐). 덩어리 표지는 남기고 비워 둔다
  if (!example.trim() && !(kind === '서술' && skeleton)) fail(where, '예시가 하나도 없다')

  const form = { id, group, number, title, due, required, kind, registry, coordValue, fixed, head, guide, example }
  // 표지 · 글 · 빈 줄 — 빈 덩어리는 표지만 남는다. 끝 개행은 하나
  const blockText = (name, body) => `<!-- form:${name} -->` + (body ? `\n${body}` : '')
  const out = [frontMatter(form), blockText('head', head), '', blockText('guide', guide), '', blockText('example', example)].join('\n') + '\n'

  // ⑩ 되읽어 본다 — 서버가 읽을 함수(parseForm)로 읽어 같은 값이 나오고 lint 가 비고 찍은 문서가 깨끗해야 한다
  const file = `${stem}.md`
  const back = parseForm(out, { group, file })
  const problems = lintForm(back)
  if (problems.length) fail(where, `lint — ${problems.join(' / ')}`)
  for (const k of ['id', 'number', 'title', 'due', 'required', 'kind', 'coordValue', 'head', 'guide', 'example']) {
    if ((back[k] ?? null) !== (form[k] ?? null)) fail(where, `되읽은 ${k} 가 다르다: ${JSON.stringify(back[k])}`)
  }
  if (JSON.stringify(back.registry) !== JSON.stringify(registry) || JSON.stringify(back.fixed) !== JSON.stringify(fixed)) {
    fail(where, '되읽은 registry · fixed 가 다르다')
  }
  const stamped = stampDoc(back)
  if (/^##\s/m.test(stamped) || /\(예시\)|작성지침|applied/.test(stamped)) fail(where, `찍은 문서가 깨끗하지 않다:\n${stamped}`)

  return { id, rel, file, text: out, form, notes, counts }
}

// 묶음 README 의 문서 표 — `| \`번호\` | [이름](docs/…) | … | 유형 | 좌표 |`
function readmeKinds(text) {
  const m = new Map()
  for (const l of norm(text).split('\n')) {
    const r = /^\| `([A-Z]{2}_\d{3})` \| \[[^\]]+\]\(docs\/[^)]+\) \|.*\| (좌표|대장|사건|서술) \| [^|]* \|$/.exec(l)
    if (r) m.set(r[1], README_KIND[r[2]])
  }
  return m
}

function walkMd(dir, rel = '') {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true }).sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    const r = rel ? `${rel}/${e.name}` : e.name
    if (e.isDirectory()) out.push(...walkMd(path.join(dir, e.name), r))
    else if (e.name.endsWith('.md')) out.push(r)
  }
  return out
}

/**
 * 패키지 하나 → 묶음 하나. 쓰지 않는다 — 파일 이름과 글을 낸다.
 * @returns { name, files: Map<파일 이름, 글>, forms: [convertDoc 결과], readme: Map<번호, 종류>, orphans: [좌표] }
 */
export function convertPackage(dir) {
  const read = (f) => norm(fs.readFileSync(path.join(dir, f), 'utf8'))
  const manifest = JSON.parse(read('_package.json'))
  const name = path.basename(dir)
  if (manifest.name !== name) fail(name, `_package.json 의 name(${manifest.name})이 폴더와 다르다`)
  const { rules, errors } = parseRegistry(read('_managed.md'))
  if (errors.length) fail(name, `_managed.md — ${errors.map((e) => e.message).join(' / ')}`)
  const vtext = read('_vocab.md')
  const vocab = parseVocab(vtext)
  const vocabLines = vtext.split('\n')

  const files = new Map()
  const group = { name: manifest.name, title: manifest.title, version: manifest.version, description: manifest.description }
  for (const k of Object.keys(group)) if (!group[k]) fail(name, `_package.json 에 ${k} 가 없다`)
  files.set('_묶음.json', JSON.stringify(group, null, 2) + '\n')

  const forms = []
  const docsDir = path.join(dir, 'docs')
  for (const rel of walkMd(docsDir)) {
    const r = convertDoc({ group: name, rel, text: fs.readFileSync(path.join(docsDir, rel), 'utf8'), rules, vocab, vocabLines })
    if (files.has(r.file)) fail(name, `서식 파일 이름이 겹친다: ${r.file}`)
    files.set(r.file, r.text)
    forms.push(r)
  }
  // 등록부 행이 가리키는데 문서가 없는 것 — 서식에서 빠지면 안 된다
  for (const rule of rules) {
    if (!forms.some((f) => `docs/${f.rel}` === rule.doc)) fail(name, `등록부 행의 문서가 없다: ${rule.doc}`)
  }
  // 어휘 예시 중 어느 문서에도 안 걸리는 것(분류축 타입) — 서식에 싣지 않는다
  const orphans = [...vocab.coords.values()].filter((e) => e.example && !resolveCoord({ rules }, e.coord)).map((e) => e.coord)
  return { name, group, files, forms, readme: readmeKinds(read('README.md')), orphans }
}

/**
 * 전부 돈다. write 면 `agent/forms/<묶음>/` 을 다시 쓰고(남는 파일은 지운다), 아니면 견주기만 한다.
 * @returns { packs, diffs: [string] }
 */
export function convertAll({ packagesDir = PACKAGES, formsDir = FORMS, write = false } = {}) {
  const names = fs
    .readdirSync(packagesDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !SKIP.has(e.name) && fs.existsSync(path.join(packagesDir, e.name, '_package.json')))
    .map((e) => e.name)
    .sort()
  const packs = names.map((n) => convertPackage(path.join(packagesDir, n)))
  const diffs = []
  for (const p of packs) {
    const out = path.join(formsDir, p.name)
    const have = fs.existsSync(out) ? fs.readdirSync(out).filter((f) => fs.statSync(path.join(out, f)).isFile()) : []
    for (const [f, text] of p.files) {
      const at = path.join(out, f)
      // CRLF 로 꺼낸 체크아웃(core.autocrlf)도 같은 글이다 — 개행을 맞춰 견준다
      const old = fs.existsSync(at) ? norm(fs.readFileSync(at, 'utf8')) : null
      if (old === text) continue
      diffs.push(`${old == null ? '새' : '바뀜'} ${p.name}/${f}`)
      if (write) {
        fs.mkdirSync(out, { recursive: true })
        fs.writeFileSync(at, text)
      }
    }
    for (const f of have) {
      if (p.files.has(f)) continue
      diffs.push(`남음 ${p.name}/${f}`)
      if (write) fs.rmSync(path.join(out, f))
    }
  }
  return { packs, diffs }
}

function summary({ packs, diffs }, { write }) {
  const lines = []
  const tally = (forms) => FORM_KINDS.map((k) => `${k} ${forms.filter((f) => f.form.kind === k).length}`).join(' · ')
  const all = packs.flatMap((p) => p.forms)
  lines.push(`서식집 — agent/forms (${write ? '썼다' : '견줌'} · 바뀐 파일 ${diffs.length})`)
  for (const p of packs) lines.push(`  ${p.name.padEnd(14)} ${String(p.forms.length).padStart(3)}  ${tally(p.forms)}`)
  lines.push(`  ${'합계'.padEnd(13)} ${String(all.length).padStart(3)}  ${tally(all)}`)

  const c = all.reduce((a, f) => {
    for (const k of Object.keys(f.counts)) a[k] = (a[k] || 0) + f.counts[k]
    return a
  }, {})
  lines.push(
    `기계 규칙 — 섹션 applied 주석 ${c.appliedComment} · 작성지침 \`applied\` 행 ${c.appliedRow} · 「머리 표 — 관리번호는 고치지 않는다」 행 ${c.headTableRow} · 「다만 \`## 작성지침\` 은 남겨 둔다」 ${c.keepGuide}`
  )

  const special = all.filter((f) => f.notes.length)
  lines.push(`규칙이 더 필요했던 서식 ${special.length}`)
  for (const f of special) lines.push(`  ${f.id} ${f.form.title} [${f.form.kind}]\n    - ${f.notes.join('\n    - ')}`)

  const mism = []
  for (const p of packs) {
    for (const f of p.forms) {
      const want = p.readme.get(f.form.number)
      if (!want) mism.push(`  ${f.id} — README 문서 표에 없다`)
      else if (want !== f.form.kind) mism.push(`  ${f.id} README ${want} → ${f.form.kind}${KIND_OVERRIDE[f.id] ? ' (문서마다 정함)' : ' (확인 필요)'}`)
    }
  }
  if (mism.length) lines.push(`README 유형과 다른 종류 ${mism.length}`, ...mism)
  const orphans = packs.flatMap((p) => p.orphans.map((o) => `${p.name} ${o}`))
  if (orphans.length) lines.push(`어휘 예시 중 문서에 안 걸리는 것(분류축) — 싣지 않음: ${orphans.join(' · ')}`)
  if (diffs.length && diffs.length <= 120) lines.push(...diffs.map((d) => '  ' + d))
  return lines.join('\n')
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const check = process.argv.includes('--check')
  const r = convertAll({ write: !check })
  console.log(summary(r, { write: !check }))
  if (check && r.diffs.length) process.exit(1)
}
