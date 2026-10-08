// 옛 등록부 사본의 자리 찾기(머리 표 칸 · 생성 블록) · edits 의 순수 함수 — 등록부 사본 검토 v0.1 X15~X18.
// v1.0 은 사본을 만들지 않는다 — 옛 레포에 남은 줄을 본문 · 산문으로 잘못 읽지 않는지만 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { headRow, preambleEnd, blockRange, BLOCK_OPEN, BLOCK_CLOSE } from '../core/regen.js'
import { planEdits, checkEditsShape } from '../core/edits.js'
import { parseRegistry } from '../core/managed.js'
import { parseVocab } from '../core/vocab.js'

const REG = parseRegistry(['| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `t:*` | `docs/t.md` | `## {값}` |'].join('\n'))
const doc = (cell, nl = '\n') => ['# 문서', '', '| | |', '|---|---|', '| 관리번호 | `X` |', `| 등록부 | ${cell} |`, '', '## a — 에이', '본문'].join(nl)

test('옛 머리 표 칸 — 머리말 안에서만 · CRLF 도 · 첫 ## 뒤의 표는 머리 표가 아니다', () => {
  assert.deepEqual(headRow(doc('**비대상**').split('\n')), { line: 5, cell: '**비대상**' })
  assert.deepEqual(headRow(doc('`t:*` → `## {값}`', '\r\n').split('\n')), { line: 5, cell: '`t:*` → `## {값}`' })
  assert.equal(headRow('# d\n\n## a\n\n| 등록부 | **비대상** |\n'.split('\n')), null)
  assert.equal(preambleEnd(doc('x').split('\n')), 7)
  assert.equal(preambleEnd(['# 제목', '```', '## 펜스 안', '```', '본문']), 5, '펜스 안의 ## 는 세지 않는다')
})

test('옛 생성 블록 — 자리를 찾고 · 블록 안은 어휘 항목이 아니다', () => {
  const text = `# 어휘\n\n## t\n\n- \`t:a\` — 에이\n\n${BLOCK_OPEN}\n| 타입 | 좌표 패턴 |\n|---|---|\n| \`t\` | \`t:*\` |\n${BLOCK_CLOSE}\n`
  assert.deepEqual(blockRange(text.split('\n')), { open: 6, close: 10 })
  assert.equal(blockRange('# 어휘\n'.split('\n')), null)
  assert.deepEqual([...parseVocab(text).coords.keys()], ['t:a'])
})

test('edits — CRLF 파일에 LF 로 보낸 old · new 가 맞고 줄끝은 그대로 · 모양 검사', async () => {
  const text = ['# 회의록', '', '날짜축이다.', '', '## 2026-01-05 — 착수', '<!-- applied: null -->', '', '본문'].join('\r\n')
  const e = await planEdits({ edits: checkEditsShape([{ file: 'docs/r.md', old: '날짜축이다.\n', new: '날짜마다 섹션.\n둘째 줄.\n' }]), read: async () => text, registry: REG })
  const out = e.files.get('docs/r.md')
  assert.ok(out.includes('날짜마다 섹션.\r\n둘째 줄.\r\n'))
  assert.ok(!/[^\r]\n/.test(out))
  assert.deepEqual(e.done, [{ file: 'docs/r.md', line: 3 }])
  assert.throws(() => checkEditsShape([{ file: 'docs/r.md', old: 'a', new: 'b', extra: 1 }]), /받지 않는다/)
  assert.throws(() => checkEditsShape([{ file: '../x.md', old: 'a', new: 'b' }]), /docs\//)
  assert.throws(() => checkEditsShape([{ file: 'docs/r.md', old: '  ', new: 'b' }]), /old/)
  // 같은 파일 두 건은 앞 건의 결과 위에서
  const two = await planEdits({ edits: checkEditsShape([{ file: 'docs/r.md', old: '날짜축이다.', new: 'A' }, { file: 'docs/r.md', old: 'A', new: 'B' }]), read: async () => text, registry: REG })
  assert.ok(two.files.get('docs/r.md').includes('B\r\n'))
})
