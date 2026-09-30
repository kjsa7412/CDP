// 등록부 사본(머리 표 칸 · 생성 블록) · edits 의 순수 함수 — 등록부 사본 검토 v0.1 X1~X3 · X15~X18.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fixHead, readCell, renderCell, fixBlock, BLOCK_OPEN, BLOCK_CLOSE } from '../core/regen.js'
import { planEdits, checkEditsShape } from '../core/edits.js'
import { parseRegistry } from '../core/managed.js'
import { parseVocab } from '../core/vocab.js'

const REG = parseRegistry(['| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `t:*` | `docs/t.md` | `## {값}` |', '| `u:*` | `docs/t.md` | `## {값}` |', '| `n:*` | `docs/n.md` | `—` |'].join('\n'))
const rules = (doc) => REG.rules.filter((r) => r.doc === doc)
const doc = (cell, nl = '\n') => ['# 문서', '', '| | |', '|---|---|', '| 관리번호 | `X` |', `| 등록부 | ${cell} |`, '', '## a — 에이', '본문'].join(nl)

test('머리 표 — 뜻이 같으면 안 고친다 · 비대상 사유는 남는다 · 글씨만 다른 옛 칸도 뜻으로', () => {
  assert.equal(fixHead(doc('`t:*` → `## {값}` · `u:*` → `## {값}`'), rules('docs/t.md')), null)
  assert.equal(fixHead(doc('`u:*` → `## {값}` · `t:*` → `## {값}`'), rules('docs/t.md')), null, '순서는 뜻이 아니다')
  assert.equal(fixHead(doc('**비대상** — 날짜축이다'), []), null)
  assert.equal(fixHead(doc('`t:*` · `u:*`'), rules('docs/t.md')), null, '앵커 없는 옛 칸')
  assert.equal(fixHead(doc('`n:*` → —'), rules('docs/n.md')), null)
  const f = fixHead(doc('**비대상** — 날짜축이다'), rules('docs/t.md'))
  assert.equal(f.line, 6)
  assert.match(f.text, /\| 등록부 \| `t:\*` → `## \{값\}` · `u:\*` → `## \{값\}` \|/)
  assert.match(fixHead(doc('`t:*` → `## {값}`'), []).text, /\| 등록부 \| \*\*비대상\*\* \|/)
  assert.equal(fixHead('# 머리 표 없음\n\n## a\n', rules('docs/t.md')), null)
  assert.equal(readCell('**비대상** — `테이블정의서:` 은 `테이블정의서` 가 갖는다').off, true)
  assert.equal(renderCell([]), '**비대상**')
})

test('머리 표 — CRLF 문서는 CRLF 로 · 첫 ## 뒤의 표는 머리 표가 아니다', () => {
  const f = fixHead(doc('**비대상**', '\r\n'), rules('docs/t.md'))
  assert.ok(f.text.includes('`u:*` → `## {값}` |\r\n'))
  assert.equal(f.text.split('\r\n').length, doc('**비대상**', '\r\n').split('\r\n').length)
  assert.equal(fixHead('# d\n\n## a\n\n| 등록부 | **비대상** |\n', rules('docs/t.md')), null)
})

test('생성 블록 — 표식이 있을 때만 · 같으면 null · 등록부에 없는 타입 줄', () => {
  const vocab = parseVocab('## t\n\n- `t:a` — 에이\n\n## 업무영역\n\n- `업무영역:x` — 엑스\n')
  assert.equal(fixBlock('# 어휘\n', REG, vocab), null)
  const f = fixBlock(`# 어휘\n\n${BLOCK_OPEN}\n낡은 줄\n${BLOCK_CLOSE}\n`, REG, vocab)
  assert.match(f.text, /\| `t` \| `t:\*` \| `docs\/t\.md` \| `## \{값\}` \|/)
  assert.match(f.text, /\| `n` \| `n:\*` \| `docs\/n\.md` \| — \|/)
  assert.match(f.text, /등록부에 없는 타입\*\* — `업무영역`/)
  assert.equal(fixBlock(f.text, REG, vocab), null)
  assert.equal(parseVocab(f.text).coords.size, 0, '블록은 어휘 항목이 아니다')
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
