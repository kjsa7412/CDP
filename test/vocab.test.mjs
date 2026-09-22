// 통제 어휘 — `core/vocab.js`. 프로토콜 §9.4 · §9.5.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { parseVocab, reconcile, normKey } from '../core/vocab.js'

const TEXT = `# 좌표 어휘

산문 절이 앞에 있어도 된다.

## 무슨 일을 하면 무엇을 적나

| 이런 일 | 좌표 |
|---|---|
| 테이블 | \`table:x\` |

## table

- \`table:rp_plnd_mst\` — 계획서마스터
  aliases: 계획서, 연구계획서, RP_PLND_MST
- \`table:rp_rdc_opl_mst\` — 연관위 의견 (구)
  deprecated: 2026-03-26 오타 정정 → table:rp_rdc_opl_list
- \`table:ex_plan_mst\` — (예시) 계획서
  example: 서식 예시
  aliases: 예시계획서

## screen

- \`screen:PLA011\` — 연구계획서 등록
  aliases: 계획서등록

## 테이블정의서

- \`테이블정의서:ex_plan_mst\` — 한글 타입

## domain
excluded: 축이다

- \`domain:심의\` — 심의
`

test('parseVocab — 타입 순서는 선언 순서 · 산문 ## 은 타입이 아니다', () => {
  const v = parseVocab(TEXT)
  assert.deepEqual(v.types, ['table', 'screen', '테이블정의서', 'domain'])
  assert.deepEqual(v.excludedTypes, ['domain'])
  assert.equal(v.errors.length, 0)
  assert.equal(v.coords.size, 6)
  // 표 안의 `table:x` 는 좌표 항목이 아니다 — `- ` 로 시작하지 않는다
  assert.equal(v.coords.has('table:x'), false)
})

test('parseVocab — alias · deprecated 후속 · example 은 세지 않는다', () => {
  const v = parseVocab(TEXT)
  const a = v.coords.get('table:rp_plnd_mst')
  assert.deepEqual(a.aliases, ['계획서', '연구계획서', 'RP_PLND_MST'])
  assert.equal(a.label, '계획서마스터')
  assert.equal(a.type, 'table')

  const d = v.coords.get('table:rp_rdc_opl_mst')
  assert.equal(d.deprecated, '2026-03-26')
  assert.equal(d.supersededBy, 'table:rp_rdc_opl_list')

  const e = v.coords.get('table:ex_plan_mst')
  assert.equal(e.example, true)
  assert.equal(v.counted.has('table:ex_plan_mst'), false, '예시는 좌표 수에 안 든다')
  assert.equal(v.counted.size, 5)
  assert.ok(v.aliasIndex.has(normKey('예시계획서')), '그래도 찾기는 된다')
})

test('parseVocab — 빈 입력 · 형식이 틀린 좌표는 오류로 남긴다', () => {
  const empty = parseVocab('')
  assert.deepEqual(empty.types, [])
  assert.equal(empty.coords.size, 0)
  const bad = parseVocab('## table\n\n- `not a coord` — x\n')
  assert.equal(bad.errors.length, 1)
  assert.match(bad.errors[0].message, /타입:값/)
})

test('normKey — 공백 · _ · - · · 를 지우고 소문자로', () => {
  assert.equal(normKey('RP_PLND_MST'), normKey('rp plnd mst'))
  assert.equal(normKey('연구 계획서'), '연구계획서')
  assert.equal(normKey('  A-b_c · d '), 'abcd')
  assert.equal(normKey(null), '')
})

test('reconcile — 정본 · 값 · alias · 라벨 · 미등재 · 부분 일치', () => {
  const v = parseVocab(TEXT)
  const canon = reconcile(v, 'table:rp_plnd_mst')
  assert.equal(canon.coord, 'table:rp_plnd_mst')
  assert.equal(canon.kind, 'canonical')
  assert.equal(canon.exact, true)

  assert.equal(reconcile(v, 'rp plnd mst').kind, 'value')
  assert.equal(reconcile(v, '연구계획서').kind, 'alias')
  assert.equal(reconcile(v, '계획서마스터').kind, 'label')
  assert.equal(reconcile(v, 'PLA011').coord, 'screen:PLA011')
  assert.equal(reconcile(v, '없는것'), null)
  assert.equal(reconcile(v, ''), null)

  // 질의 안에 alias 가 섞여 있으면 가장 긴 것으로 — exact 가 아니다
  const part = reconcile(v, '연구계획서 테이블 관련 최근 변경')
  assert.equal(part.coord, 'table:rp_plnd_mst')
  assert.equal(part.exact, false)
  assert.equal(part.matched, '연구계획서')
})

test('reconcile — 먼저 등재된 alias 가 조용히 이긴다 (알려진 성질)', () => {
  const v = parseVocab('## a\n\n- `a:one` — 하나\n  aliases: 공용\n- `a:two` — 둘\n  aliases: 공용\n')
  assert.equal(reconcile(v, '공용').coord, 'a:one')
})
