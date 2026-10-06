// 서식집 — `core/forms.js` 의 넷(parseForm · stampDoc · formIdOf · lintForm)과 `agent/forms/**` 전부.
// v1.0 개편안 §8.1 · TODO §1.4. 새 관리 문서는 `# <제목>` · 서식 표지 · head 뿐이어야 한다 —
// 예시 · 작성지침 · `applied` · 섹션이 따라가면 「서식에서 만든 문서는 빈 문서」 가 깨진다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseForm, stampDoc, formIdOf, lintForm, FORM_KINDS } from '../core/forms.js'
import { outsideFences } from '../core/managed.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const FORMS = path.join(ROOT, 'agent', 'forms')

const SAMPLE = [
  '---',
  'form: public-si/DE_431',
  'title: 테이블정의서',
  'number: DE_431',
  'due: 설계완료',
  'required: false',
  'kind: 대상',
  'registry:',
  '  - { pattern: "테이블정의서:*", anchor: "## {값}" }',
  'coordValue: 테이블 물리명(소문자)',
  '---',
  '<!-- form:head -->',
  '테이블의 지금 상태. 섹션 하나가 테이블 하나다.',
  '',
  '<!-- form:guide -->',
  '**무엇** — 테이블마다 컬럼 구성을 적는다.',
  '',
  '### 작성지침',
  '',
  '| 항목 | 작성방법 |',
  '|---|---|',
  '| 섹션 제목 | `<물리명> — <논리명>` |',
  '',
  '<!-- form:example -->',
  '### 예시 — ex_plan_mst — 계획서마스터',
  '',
  '| 컬럼 | 타입 |',
  '|---|---|',
  '| `PLAN_ID` | VARCHAR(20) |',
  '',
].join('\n')

// 머리말 한 줄을 바꾼 견본
const withFm = (from, to) => SAMPLE.replace(from, to)

// ── parseForm ──────────────────────────────────────────────────────────────────────────

test('parseForm — 머리말 필드 · 등록부 · 덩어리 셋을 읽는다', () => {
  const f = parseForm(SAMPLE, { group: 'public-si', file: 'DE_431_테이블정의서.md' })
  assert.deepEqual(f.errors, [])
  assert.equal(f.id, 'public-si/DE_431')
  assert.equal(f.group, 'public-si')
  assert.equal(f.number, 'DE_431')
  assert.equal(f.title, '테이블정의서')
  assert.equal(f.due, '설계완료')
  assert.equal(f.required, false)
  assert.equal(f.kind, '대상')
  assert.deepEqual(f.registry, [{ pattern: '테이블정의서:*', anchor: '## {값}' }])
  assert.equal(f.coordValue, '테이블 물리명(소문자)')
  assert.deepEqual(f.fixed, [])
  assert.equal(f.head, '테이블의 지금 상태. 섹션 하나가 테이블 하나다.')
  assert.equal(f.guide, '**무엇** — 테이블마다 컬럼 구성을 적는다.\n\n### 작성지침\n\n| 항목 | 작성방법 |\n|---|---|\n| 섹션 제목 | `<물리명> — <논리명>` |')
  assert.ok(f.example.startsWith('### 예시 — ex_plan_mst'))
  assert.ok(!f.example.endsWith('\n'), '덩어리 끝의 빈 줄은 걷는다')
})

test('parseForm — CRLF · BOM 으로 받아도 같은 값이다(읽는 경계에서 개행을 맞춘다)', () => {
  const a = parseForm(SAMPLE)
  const b = parseForm('\uFEFF' + SAMPLE.replace(/\n/g, '\r\n'))
  assert.deepEqual(b, a)
})

test('parseForm — 묶음을 안 주면 form 에서 따고 · fixed · required true 를 읽는다', () => {
  const t = withFm('required: false', 'required: true').replace('coordValue: 테이블 물리명(소문자)', 'coordValue: 값\nfixed: [hw, db]')
  const f = parseForm(t)
  assert.equal(f.group, 'public-si')
  assert.equal(f.required, true)
  assert.deepEqual(f.fixed, ['hw', 'db'])
})

test('parseForm — 등록부가 없으면 빈 목록 · 좌표 값이 없으면 null', () => {
  const t = SAMPLE.replace(/registry:\n.*\n/, 'registry: []\n').replace('coordValue: 테이블 물리명(소문자)\n', '')
  const f = parseForm(t)
  assert.deepEqual(f.registry, [])
  assert.equal(f.coordValue, null)
  assert.deepEqual(f.errors, [])
})

test('parseForm — 구조 문제를 errors 로 낸다', () => {
  const has = (t, re, opt) => {
    const e = parseForm(t, opt).errors
    assert.ok(e.some((x) => re.test(x)), `${re} 가 없다: ${JSON.stringify(e)}`)
  }
  has('<!-- form:head -->\n머리', /머리말/)
  has(withFm('kind: 대상', 'kind: [대상'), /YAML/)
  has(SAMPLE.replace('<!-- form:guide -->\n', ''), /덩어리가 없다: <!-- form:guide -->/)
  has(SAMPLE.replace('<!-- form:example -->', '<!-- form:head -->'), /둘이다/)
  has(SAMPLE.replace('<!-- form:guide -->', '<!-- form:tmp -->'), /모르는 덩어리/)
  has(SAMPLE.replace('---\n<!-- form:head -->', '---\n앞글\n<!-- form:head -->'), /앞에 글/)
  // 순서 — example 이 guide 앞
  const swapped = SAMPLE.replace('<!-- form:guide -->', '<!-- form:x1 -->').replace('<!-- form:example -->', '<!-- form:guide -->').replace('<!-- form:x1 -->', '<!-- form:example -->')
  has(swapped, /순서/)
  has(SAMPLE, /폴더\(agile-product\)/, { group: 'agile-product' })
  has(SAMPLE, /파일 이름/, { file: 'DE_432_테이블정의서.md' })
  has(SAMPLE.replace(/registry:\n.*\n/, 'registry: 테이블정의서:*\n'), /registry 는 목록/)
})

test('parseForm — 코드펜스 안의 표지는 표지가 아니다', () => {
  const t = SAMPLE.replace('| `PLAN_ID` | VARCHAR(20) |', '| `PLAN_ID` | VARCHAR(20) |\n\n```\n<!-- form:head -->\n```')
  const f = parseForm(t)
  assert.deepEqual(f.errors, [])
  assert.ok(f.example.includes('```\n<!-- form:head -->\n```'))
})

// ── stampDoc ───────────────────────────────────────────────────────────────────────────

test('stampDoc — 제목 · 서식 표지 · 빈 줄 · head · 끝 개행. 예시 · 작성지침 · applied 는 가지 않는다', () => {
  const f = parseForm(SAMPLE)
  const s = stampDoc(f)
  assert.equal(s, '# 테이블정의서\n<!-- cdp:form public-si/DE_431 -->\n\n테이블의 지금 상태. 섹션 하나가 테이블 하나다.\n')
  assert.ok(!s.includes('\r'))
  assert.ok(!/예시|작성지침|applied|^## /m.test(s))
})

test('stampDoc — 제목을 주면 그것을 쓰고 줄바꿈은 한 줄로 · 비면 서식 제목', () => {
  const f = parseForm(SAMPLE)
  assert.ok(stampDoc(f, { title: 'GDI 테이블정의서' }).startsWith('# GDI 테이블정의서\n<!-- cdp:form public-si/DE_431 -->\n'))
  assert.ok(stampDoc(f, { title: '두\n줄' }).startsWith('# 두 줄\n'))
  assert.ok(stampDoc(f, { title: '  ' }).startsWith('# 테이블정의서\n'))
})

test('stampDoc — head 가 CRLF 여도 LF 로 · head 가 비면 제목과 표지뿐', () => {
  assert.equal(stampDoc({ id: 'g/N_1', title: 'T', head: '가\r\n나\r\n\r\n' }), '# T\n<!-- cdp:form g/N_1 -->\n\n가\n나\n')
  assert.equal(stampDoc({ id: 'g/N_1', title: 'T', head: '' }), '# T\n<!-- cdp:form g/N_1 -->\n')
})

test('stampDoc — 대장의 빈 표 머리가 그대로 간다', () => {
  const head = '일정의 지금 상태.\n\n| WBS | 작업 |\n|---|---|'
  assert.equal(stampDoc({ id: 'public-si/BM_201', title: 'WBS', head }), `# WBS\n<!-- cdp:form public-si/BM_201 -->\n\n${head}\n`)
})

// ── formIdOf ───────────────────────────────────────────────────────────────────────────

test('formIdOf — H1 바로 아래의 표지 · 찍은 문서를 되읽는다', () => {
  const f = parseForm(SAMPLE)
  assert.equal(formIdOf(stampDoc(f)), 'public-si/DE_431')
  assert.equal(formIdOf('# 제목\n\n\n<!-- cdp:form a/B_1 -->\n'), 'a/B_1', '3줄 안')
  assert.equal(formIdOf('\uFEFF# 제목\r\n<!-- cdp:form a/B_1 -->\r\n'), 'a/B_1', 'BOM · CRLF')
  assert.equal(formIdOf('<!-- applied: x -->\n# 제목\n<!-- cdp:form a/B_1 -->\n'), 'a/B_1', 'H1 앞 주석')
  assert.equal(formIdOf('---\nk: v\n---\n# 제목\n<!-- cdp:form a/B_1 -->\n'), 'a/B_1', '머리말 뒤')
})

test('formIdOf — 3줄 밖 · 다음 제목 뒤 · 본문 · H1 없음 · 표지 없음은 null', () => {
  assert.equal(formIdOf('# 제목\n\n\n\n<!-- cdp:form a/B_1 -->\n'), null, '4줄째')
  assert.equal(formIdOf('# 제목\n## 섹션\n<!-- cdp:form a/B_1 -->\n'), null, '섹션 아래')
  assert.equal(formIdOf('# 제목\n\n본문\n\n## x\n\n<!-- cdp:form a/B_1 -->'), null, '본문 속')
  assert.equal(formIdOf('본문\n<!-- cdp:form a/B_1 -->\n'), null, 'H1 없음')
  assert.equal(formIdOf('# 제목\n\n첫 문단\n'), null)
  assert.equal(formIdOf('# 제목\n<!-- cdp:form -->\n'), null, '빈 표지')
  assert.equal(formIdOf(''), null)
  assert.equal(formIdOf(null), null)
})

// ── lintForm ───────────────────────────────────────────────────────────────────────────

test('lintForm — 견본은 깨끗하다 · 종류는 다섯', () => {
  assert.deepEqual(lintForm(parseForm(SAMPLE)), [])
  assert.deepEqual([...FORM_KINDS], ['대상', '대장', '정의', '사건', '서술'])
  assert.ok(Object.isFrozen(FORM_KINDS))
})

test('lintForm — 머리 필드 · 종류 · required', () => {
  const has = (t, re) => {
    const p = lintForm(parseForm(t))
    assert.ok(p.some((x) => re.test(x)), `${re} 가 없다: ${JSON.stringify(p)}`)
  }
  has(withFm('form: public-si/DE_431\n', ''), /form 이 없다/)
  has(withFm('form: public-si/DE_431', 'form: DE_431'), /<묶음>\/<번호> 모양/)
  has(withFm('form: public-si/DE_431', 'form: public-si/DE_432'), /번호\(DE_432\)/)
  has(withFm('number: DE_431\n', ''), /number 가 없다/)
  has(withFm('title: 테이블정의서\n', ''), /title 이 없다/)
  has(withFm('due: 설계완료\n', ''), /due 가 없다/)
  has(withFm('required: false', 'required: 아니오'), /required/)
  has(withFm('required: false\n', ''), /required/)
  has(withFm('kind: 대상\n', ''), /kind 가 없다/)
  has(withFm('kind: 대상', 'kind: 기타'), /kind 가 .* 아니다: 기타/)
  assert.deepEqual(lintForm(null), ['서식이 아니다'])
})

test('lintForm — 등록부 모양 · 좌표 값 · fixed', () => {
  const has = (t, re) => {
    const p = lintForm(parseForm(t))
    assert.ok(p.some((x) => re.test(x)), `${re} 가 없다: ${JSON.stringify(p)}`)
  }
  const reg = (rows) => SAMPLE.replace(/registry:\n.*\n/, 'registry:\n' + rows.map((r) => `  - ${r}\n`).join(''))
  has(reg(['{ pattern: "테이블정의서", anchor: "## {값}" }']), /registry\[0\] 패턴/)
  has(reg(['{ pattern: "*:*", anchor: "## {값}" }']), /registry\[0\] 패턴/)
  has(reg(['{ pattern: "테이블정의서:*", anchor: "### {값}" }']), /anchor/)
  has(reg(['{ anchor: "## {값}" }']), /패턴이 없다/)
  has(reg(['{ pattern: "a:*", anchor: "## {값}" }', '{ pattern: "a:*", anchor: "—" }']), /겹친다/)
  assert.deepEqual(lintForm(parseForm(reg(['{ pattern: "a:*", anchor: "—" }', '{ pattern: "b:UT-*", anchor: "## {값}" }']))), [], '문서 전체 `—` 와 하이픈 글롭은 된다')
  has(SAMPLE.replace('coordValue: 테이블 물리명(소문자)\n', ''), /coordValue/)
  has(SAMPLE.replace(/registry:\n.*\n/, 'registry: []\n').replace('coordValue: 테이블 물리명(소문자)', 'fixed: [hw]'), /fixed 가 있는데 registry/)
})

test('lintForm — head 는 새 문서로 간다: 제목 · applied · 표지 · (예시) · 작성지침이 없어야 한다', () => {
  const head = (h) => lintForm(parseForm(SAMPLE.replace('테이블의 지금 상태. 섹션 하나가 테이블 하나다.', h)))
  const has = (h, re) => assert.ok(head(h).some((x) => re.test(x)), `${re} — ${JSON.stringify(head(h))}`)
  has('첫 문단\n\n## ex_plan_mst', /head 에 제목/)
  has('첫 문단\n# 또 제목', /head 에 제목/)
  has('첫 문단\n<!-- applied: null -->', /applied/)
  has('첫 문단\n<!-- cdp:form x/Y -->', /표지/)
  has('(예시) 첫 문단', /\(예시\)/)
  has('첫 문단 — 작성지침을 본다', /작성지침/)
  has('', /head 가 비었다/)
  assert.deepEqual(head('첫 문단\n\n```\n## 펜스 안은 제목이 아니다\n```'), [])
})

// ── agent/forms 전부 ─────────────────────────────────────────────────────────────────────

const groups = fs.existsSync(FORMS) ? fs.readdirSync(FORMS).filter((g) => fs.statSync(path.join(FORMS, g)).isDirectory()).sort() : []
const files = groups.flatMap((g) =>
  fs
    .readdirSync(path.join(FORMS, g))
    .filter((f) => f.endsWith('.md'))
    .sort()
    .map((f) => ({ group: g, file: f, text: fs.readFileSync(path.join(FORMS, g, f), 'utf8') }))
)

test('서식집 — 묶음 넷 · 서식 79 (공공 SI 40 · 애자일 14 · AI 12 · 클라우드 13)', () => {
  assert.deepEqual(groups, ['agile-product', 'ai-service', 'cloud-native', 'public-si'])
  const n = Object.fromEntries(groups.map((g) => [g, files.filter((f) => f.group === g).length]))
  assert.deepEqual(n, { 'agile-product': 14, 'ai-service': 12, 'cloud-native': 13, 'public-si': 40 })
})

test('서식집 — 묶음마다 _묶음.json { name, title, version, description } · name 은 폴더', () => {
  for (const g of groups) {
    const m = JSON.parse(fs.readFileSync(path.join(FORMS, g, '_묶음.json'), 'utf8'))
    assert.deepEqual(Object.keys(m), ['name', 'title', 'version', 'description'], g)
    assert.equal(m.name, g)
    assert.ok(m.title && m.description, g)
    assert.match(m.version, /^\d+\.\d+\.\d+$/, g)
    for (const f of fs.readdirSync(path.join(FORMS, g))) assert.ok(f === '_묶음.json' || f.endsWith('.md'), `${g}/${f} — 서식집에 다른 파일`)
  }
})

for (const { group, file, text: raw } of files) {
  test(`서식 ${group}/${file} — lint 가 비고 · 찍은 문서가 깨끗하다`, () => {
    // 체크아웃이 CRLF 일 수 있다(core.autocrlf) — 레포 안의 글은 LF 다. LF 는 변환기 시험이 본다
    const text = raw.replace(/\r\n/g, '\n')
    assert.ok(text.endsWith('\n') && !text.endsWith('\n\n'), '끝 개행 하나')
    const f = parseForm(text, { group, file })
    assert.deepEqual(lintForm(f), [])
    assert.equal(file, `${f.number}_${f.title}.md`, '파일 이름은 <번호>_<제목>.md')
    assert.equal(f.id, `${group}/${f.number}`)

    const s = stampDoc(f)
    assert.ok(s.startsWith(`# ${f.title}\n<!-- cdp:form ${f.id} -->\n\n`), s)
    assert.ok(!/^##\s/m.test(s), '찍은 문서에 섹션이 없다')
    assert.ok(!s.includes('(예시)'), '(예시) 없음')
    assert.ok(!s.includes('작성지침'), '작성지침 없음')
    assert.ok(!s.includes('applied'), 'applied 없음')
    assert.equal(formIdOf(s), f.id)

    // head 의 표는 머리뿐이다(대장의 빈 표) — 행이 따라가면 예시가 새 문서로 샌다
    const tables = f.head.split('\n').filter((l) => l.startsWith('|'))
    assert.ok(tables.length === 0 || tables.length === 2, `head 의 표에 행이 있다: ${tables.length}`)
    if (tables.length) assert.equal(f.kind, '대장')

    // 어디에도 applied 주석 · 펜스 밖 `##` 이 없다 — guide · example 은 `###` 아래
    assert.ok(!/<!--\s*applied/.test(text))
    for (const b of ['guide', 'example']) {
      for (const [, l] of outsideFences(f[b].split('\n'))) assert.ok(!/^#{1,2}\s/.test(l), `${b} 에 ${l}`)
    }
    assert.ok(f.guide.includes('### 작성지침'), '작성지침은 guide 에')
    if (f.example) assert.match(f.example, /^### 예시 — /m)
    if (f.registry.length) assert.ok(f.example, '등록부 대상이면 예시가 있다')
  })
}

test('서식집 — 종류 다섯이 다 쓰인다 · 서식 id 는 겹치지 않는다 · 묶음 안 등록부 패턴도', () => {
  const forms = files.map((x) => parseForm(x.text, x))
  for (const k of FORM_KINDS) assert.ok(forms.some((f) => f.kind === k), k)
  assert.equal(new Set(forms.map((f) => f.id)).size, forms.length)
  for (const g of groups) {
    const pats = forms.filter((f) => f.group === g).flatMap((f) => f.registry.map((r) => r.pattern))
    assert.equal(new Set(pats).size, pats.length, g)
  }
})

test('서식집 — 사내 흔적이 없다', () => {
  const LEAK = /DPMS|dpms|C:\\project|10\.10\.\d+\.\d+|soln1/
  for (const { group, file, text } of files) assert.ok(!LEAK.test(text), `${group}/${file}`)
})
