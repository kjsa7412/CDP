// 등록부 — `core/managed.js`. 수행 v1.0 §4 · §6.2.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseRegistry, resolveCoord, parseManagedSections, buildManagedIndex, normValue } from '../core/managed.js'
import { parseDoc } from '../core/frontmatter.js'

const REG = `# 등록부

| 좌표 패턴 | 관리 문서 | 섹션 |
|---|---|---|
| \`screen:SE*\` | \`docs/화면정의서_연구.md\` | \`## {값}\` |
| \`screen:*\` | \`docs/화면설계서.md\` | \`## {값}\` |
| \`term:*\` | \`docs/용어사전.md\` | \`### {값}\` |
| \`arch:*\` | \`docs/아키텍처.md\` | — |
| \`시험시나리오:UT-*\` | \`docs/단위.md\` | \`## {값}\` |
| \`bad:*\` | \`docs/없음.txt\` | \`## {값}\` |
| \`bad2:*\` | \`docs/있음.md\` | \`## 값\` |

## 16종에서 바뀐 것 — 설명 표. 규칙이 아니다

| | 16종판 | 여기 | 왜 |
|---|---|---|---|
| \`배치:\` | 프로그램사양서 | **인터페이스정의서** | 배치는 인터페이스의 Object 다 |
| \`module:\` | 프로그램사양서 | **없다** | 대응 개념이 없다 |

\`\`\`
| \`fence:*\` | \`docs/예시.md\` | \`## {값}\` |
\`\`\`
`

test('parseRegistry — 표를 읽고 펜스 안은 무시하고 틀린 줄은 오류로 · 설명 표는 규칙도 오류도 아니다', () => {
  const r = parseRegistry(REG)
  assert.equal(r.present, true)
  assert.deepEqual(
    r.rules.map((x) => x.pattern),
    ['screen:SE*', 'screen:*', 'term:*', 'arch:*', '시험시나리오:UT-*']
  )
  assert.equal(r.rules[2].level, 3)
  assert.equal(r.rules[3].whole, true)
  assert.equal(r.rules[3].level, 0)
  assert.equal(r.errors.length, 2)
  assert.match(r.errors[0].message, /\.md 가 아님/)
  assert.match(r.errors[1].message, /섹션 형식/)
  assert.equal(parseRegistry('').present, false)
})

test('resolveCoord — 위에서부터 먼저 걸리는 것 · 대소문자 구분', () => {
  const r = parseRegistry(REG)
  assert.equal(resolveCoord(r, 'screen:SEB010').doc, 'docs/화면정의서_연구.md')
  assert.equal(resolveCoord(r, 'screen:PLA011').doc, 'docs/화면설계서.md')
  assert.equal(resolveCoord(r, 'screen:PLA011').value, 'PLA011')
  assert.equal(resolveCoord(r, '시험시나리오:UT-001').doc, 'docs/단위.md')
  assert.equal(resolveCoord(r, '시험시나리오:ut-001'), null, '대소문자를 구분한다')
  assert.equal(resolveCoord(r, 'table:x'), null, '등록부에 없다 — 정상')
  assert.equal(resolveCoord(null, 'x:y'), null)
  const whole = resolveCoord(r, 'arch:hw')
  assert.equal(whole.whole, true)
})

test('parseManagedSections — 값은 구분선 앞 · applied · 빈 섹션 판정', () => {
  const doc = `# 화면설계서

## PLA011 — 연구계획서 등록
<!-- applied: 2026-0821-계획서-상태값추가 -->

내용이 있다.

## PLA012 — 빈 것
<!-- applied: null -->

> ⚠ 아직 정리되지 않았습니다

## PLA013

\`\`\`
## 펜스안 — 예시
\`\`\`
`
  const s = parseManagedSections(doc)
  assert.deepEqual(s.map((x) => x.value), ['화면설계서', 'PLA011', 'PLA012', 'PLA013'])
  const a = s.find((x) => x.value === 'PLA011')
  assert.equal(a.applied, '2026-0821-계획서-상태값추가')
  assert.equal(a.hasAppliedComment, true)
  assert.equal(a.empty, false)
  const b = s.find((x) => x.value === 'PLA012')
  assert.equal(b.applied, null)
  assert.equal(b.hasAppliedComment, true)
  assert.equal(b.empty, true, '인용과 주석은 내용이 아니다')
  const c = s.find((x) => x.value === 'PLA013')
  assert.equal(c.hasAppliedComment, false)
  assert.equal(c.end, doc.split('\n').length)
})

test('normValue', () => {
  assert.equal(normValue('RP_PLND MST'), 'rpplndmst')
  assert.equal(normValue('ex-plan·mst'), 'explanmst')
})

test('buildManagedIndex — 찾음 · 앵커 없음 · 문서 없음 · 값이 같으면 앞의 것', () => {
  const r = parseRegistry(REG)
  const d1 = parseDoc('docs/화면설계서.md', '# 화면설계서\n\n## PLA011 — 하나\n<!-- applied: x -->\n\n본문\n\n## PLA011 — 둘째(도달 불가)\n\n## pla_011 — 정규화로 같다\n')
  const d2 = parseDoc('docs/아키텍처.md', '# 아키텍처\n\n전체가 상태다\n')
  const idx = buildManagedIndex(r, [d1, d2])

  const hit = idx.find('screen:PLA011')
  assert.equal(hit.docMissing, false)
  assert.equal(hit.section.applied, 'x')
  assert.equal(hit.section.title, 'PLA011 — 하나', '값이 같은 섹션은 앞의 것')

  assert.equal(idx.find('screen:NOPE').section, null, '문서는 있는데 앵커가 없다')
  assert.equal(idx.find('screen:SEB010').docMissing, true, '등록부가 없는 문서를 가리킨다')
  assert.equal(idx.find('arch:hw').section.whole, true, '문서 전체가 그 좌표')
  assert.equal(idx.find('table:x'), null, '등록부에 없다')

  const dangling = idx.danglingFor(['screen:PLA011', 'screen:NOPE', 'screen:SEB010', 'table:x'])
  assert.deepEqual(
    dangling.map((x) => [x.coord, x.reason]),
    [
      ['screen:NOPE', 'anchor'],
      ['screen:SEB010', 'doc'],
    ]
  )
})
