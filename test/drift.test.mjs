// 어긋남 진단 — `core/drift.js` · `toolDrift` · `brief` 한 줄. 리빌딩 검토 v0.1 §3 · §5.1.
//
// 미반영이 0 이어도 생기는 어긋남 다섯을 재는가: 근거 없음(D1) · 산문 복제(D2 — 표 행 · 경과 · 레포 규약 줄은 빼고) ·
// 비대(D3) · 일지형(D4 — 경과 줄은 아니다) · 좌표 없는 기록(D5 — 좌표정정이 있으면 아니다). 스냅샷 · 기준선이 있으면 근거가 있다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadRepo } from '../core/repo.js'
import { sliceSection, toolDrift, toolBrief } from '../core/tools.js'
import { buildDrift, dupKey, curatedBody, OVERSIZE_LINES } from '../core/drift.js'

const COPY = '⚠ 코드 접두는 O 인데 카테고리코드는 I 다 — 첫 글자로 카테고리를 가르지 않는다.'
const CONV = '**SoT** `catalog/팩터.xlsx` · `factor` 스키마 DB 가 원천이다 — 값은 여기 옮겨 적지 않는다.'

function work({ id, date, touches = [], body = '본문 첫 문단이다.', extra = [] }) {
  return ['---', `id: ${id}`, `title: ${id}`, `date: ${date}`, 'author: kim', 'touches:' + (touches.length ? '' : ' []'), ...touches.map((c) => `  - ${c}`), ...extra, 'tags: []', '---', '', body, ''].join('\n')
}

async function repo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-drift-'))
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fs.writeFile(path.join(root, rel), text, 'utf8')
  }
  return root
}

// 섹션 넷 + 규약 줄을 가진 섹션 스물 — 규약 줄은 넓게 반복되므로 복제가 아니다
const names = ['a', 'b', 'c', 'd', ...Array.from({ length: 20 }, (_, i) => `z${i}`)]
const VOCAB = ['# 어휘', '', '## table', '', ...names.map((n) => `- \`table:${n}\` — ${n}`), ''].join('\n')
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/테이블.md` | `## {값}` |', ''].join('\n')
const LONG = Array.from({ length: OVERSIZE_LINES + 5 }, (_, i) => `- 서술 ${i} — 회의에서 이렇게 저렇게 정했다`).join('\n')
const DOC = [
  '# 테이블',
  '',
  '## a — 가',
  '',
  'A 의 지금.',
  COPY,
  '| 산출 파라미터 | `{"aggregation": "weighted_sum"}` 값은 같은 인용이다 |',
  '',
  '**경과**',
  '- 2026-09-01 [`b1`](../work/2026-0901-a1.md) 신설',
  '',
  '## b — 나',
  '',
  'B 의 지금.',
  COPY,
  '| 산출 파라미터 | `{"aggregation": "weighted_sum"}` 값은 같은 인용이다 |',
  '- 2026-09-03 에 컬럼을 추가했다',
  '',
  '### 변경',
  '· 2026-09-02 13:20 [`b2`](../work/2026-0902-b2.md) 섹션 신설 · 일지형이 아니다',
  '',
  '## c — 다',
  '',
  LONG,
  '',
  '## d — 라',
  '',
  '<!-- cdp:baseline src="DB" asof="2026-10-01" -->',
  '| 컬럼 | 타입 |',
  '|---|---|',
  '| id | int |',
  '<!-- /cdp:baseline -->',
  '',
  ...names.slice(4).flatMap((n) => [`## ${n} — ${n}`, '', CONV, '', `${n} 의 지금.`, '']),
].join('\n')

const FILES = {
  '_vocab.md': VOCAB,
  '_managed.md': MANAGED,
  'docs/테이블.md': DOC,
  'work/2026-0901-a1.md': work({ id: '2026-0901-a1', date: '2026-09-01 10:00', touches: ['table:a'] }),
  // b 는 근거가 없다(그 좌표를 건드린 기록 0) · c 는 스냅샷이 근거다
  'work/2026-0905-snap-c.md': work({ id: '2026-0905-snap-c', date: '2026-09-05 10:00', touches: ['table:c'], extra: ['snapshot: { source: "docs/테이블.md@abc#c", asof: "2026-09-05" }'] }),
  // 좌표 없는 기록 둘 — n2 는 좌표정정이 있다
  'work/2026-0906-n1.md': work({ id: '2026-0906-n1', date: '2026-09-06 10:00', extra: ['touchesEmpty: 회의'] }),
  'work/2026-0906-n2.md': work({ id: '2026-0906-n2', date: '2026-09-06 11:00', extra: ['touchesEmpty: 회의'] }),
  'work/2026-0906-n2-좌표정정.md': work({ id: '2026-0906-n2-좌표정정', date: '2026-09-06 11:00', touches: ['table:a'], extra: ['supersedes: 2026-0906-n2'] }),
}

test('dupKey — 표 행 · 경과 줄 · 인용 · 짧은 줄은 복제 후보가 아니다', () => {
  assert.equal(dupKey('| 산출 파라미터 | `{"aggregation": "weighted_sum"}` 값은 같은 인용이다 |'), null)
  assert.equal(dupKey('· 2026-09-02 13:20 [`b2`](../work/2026-0902-b2.md) 섹션 신설 · 일지형이 아니다'), null)
  assert.equal(dupKey('> 이 좌표에 결착된 판단이나 함정은 아직 기록된 것이 없다 — 자리표시다'), null)
  assert.equal(dupKey('짧다'), null)
  assert.equal(dupKey('- ' + COPY), COPY)
})

test('curatedBody — 기준선 블록과 경과(**경과** · ### 변경) 아래를 뺀다', () => {
  assert.deepEqual(curatedBody('글\n\n**경과**\n- 2026-09-01 [x](y)').lines, ['글', ''])
  assert.deepEqual(curatedBody('글\n### 변경\n· 2026-09-01 [x](y)').lines, ['글'])
  assert.equal(curatedBody('<!-- cdp:baseline src="x" -->\n| a |\n<!-- /cdp:baseline -->').hasBaseline, true)
})

test('buildDrift — 근거 없음 · 복제 · 비대 · 일지형 · 좌표 없는 기록', async () => {
  const r = await loadRepo(await repo(FILES))
  const d = buildDrift(r, { sliceSection })
  const row = (c) => d.sections.find((x) => x.coord === c)

  // D1 — b 는 기록이 없다 · a 는 기록 · c 는 스냅샷 · d 는 기준선 블록이 근거다 · 규약 섹션들은 기록이 없으니 근거 없음
  assert.equal(row('table:b').unsourced, true)
  assert.equal(row('table:a').unsourced, false)
  assert.ok(!row('table:c')?.unsourced)
  assert.ok(!row('table:d'), '기준선 블록만 있는 섹션은 신호가 없다')

  // D2 — a · b 가 같은 산문 줄을 나눠 갖는다. 표 행은 같아도 세지 않는다. 규약 줄(20 섹션)은 복제가 아니다
  assert.deepEqual(row('table:a').duplicated, ['table:b'])
  assert.deepEqual(row('table:b').duplicated, ['table:a'])
  assert.equal(d.conventionLines, 1)
  assert.deepEqual(row('table:z0').duplicated, [])

  // D3 · D4 — c 는 비대 · b 의 「2026-09-03 에 … 추가했다」 는 일지형 · `### 변경` 아래 경과 줄은 아니다
  assert.deepEqual(row('table:c').oversize, { lines: OVERSIZE_LINES + 5, limit: OVERSIZE_LINES })
  assert.equal(row('table:b').diary, 1)
  assert.equal(row('table:a').diary, 0)

  // D5 — n1 만. n2 는 좌표정정이 있다 · 스냅샷 · 좌표정정 자신은 아니다
  assert.deepEqual(d.unreachable, ['2026-0906-n1'])
  assert.equal(d.totals.unreachable, 1)
  assert.equal(d.totals.unsourced, 1 + 20)
  assert.equal(d.totals.duplicated, 2)
})

test('toolDrift — doc · coord 로 좁히고 coord 는 복제 짝도 낸다 · brief 에 한 줄', async () => {
  const r = await loadRepo(await repo(FILES))
  const all = toolDrift(r)
  assert.equal(all.totals.duplicated, 2)
  assert.equal(all.unreachableTotal, 1)
  assert.equal(all.unreachable[0].title, '2026-0906-n1')
  assert.deepEqual(toolDrift(r, { coord: 'table:a' }).sections.map((x) => x.coord).sort(), ['table:a', 'table:b'])
  assert.equal(toolDrift(r, { doc: 'docs/없다.md' }).total, 0)

  const b = toolBrief(r)
  assert.ok(b.lines.some((l) => /^\[CDP\] 어긋남: 근거 없음 21 · 복제 2 · 비대 1 · 일지형 1 · 좌표 없는 기록 1/.test(l)), b.lines.join('\n'))
  assert.equal(b.drift.unsourced, 21)
})

test('스냅샷 — 섹션이 있으면 대기열에 서지 않고 · 섹션이 없는 좌표면 선다', async () => {
  const r = await loadRepo(await repo(FILES))
  assert.ok(!r.curation.queue.some((q) => q.id === '2026-0905-snap-c'))
  const bare = await loadRepo(await repo({ ...FILES, 'docs/테이블.md': '# 테이블\n' }))
  assert.ok(bare.curation.queue.some((q) => q.id === '2026-0905-snap-c'))
})

test('dupKey · linked — 근거 가리킴 줄은 복제가 아니다 · 근거 없는 섹션이 인용한 기록은 linked 로', async () => {
  assert.equal(dupKey('실측은 [`work/2026-0908-R5-10-나머지8종-현행분석`](../work/2026-0908-R5-10-나머지8종-현행분석.md).'), null)
  assert.ok(dupKey('실측은 [기록](../work/x.md) — 그리고 이 줄에는 링크 밖에도 충분히 긴 사실 설명이 붙어 있다.'))

  const DOC2 = ['# 테이블', '', '## a — 가', '', '근거는 [`2026-0901-a1`](../work/2026-0901-a1.md) 에 있다 — 좌표만 빠졌다.', ''].join('\n')
  const VOCAB2 = ['# 어휘', '', '## table', '', '- `table:a` — 가', '- `table:q` — 큐', ''].join('\n')
  const MANAGED2 = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/테이블.md` | `## {값}` |', ''].join('\n')
  // a1 은 table:q 를 건드렸다 — table:a 는 근거 없음이지만 본문이 a1 을 인용한다
  const r = await loadRepo(await repo({ '_vocab.md': VOCAB2, '_managed.md': MANAGED2, 'docs/테이블.md': DOC2, 'work/2026-0901-a1.md': work({ id: '2026-0901-a1', date: '2026-09-01 10:00', touches: ['table:q'] }) }))
  const d = buildDrift(r, { sliceSection })
  const a = d.sections.find((x) => x.coord === 'table:a')
  assert.equal(a.unsourced, true)
  assert.deepEqual(a.linked, ['2026-0901-a1'])
  assert.equal(d.totals.unsourcedLinked, 1)
})

test('리빌딩 실측에서 다듬은 셋 — 날짜 뒤 글이 있는 경과 줄 · 좌표를 거는 한 줄 · 표 행은 비대가 아니다', async () => {
  // 경과 줄 — 날짜와 기록 링크 사이에 글이 와도 경과다(복제 · 일지형이 아니다)
  assert.equal(dupKey('· 2026-10-10 리빌딩 — 공통 규칙 · 근거 · 함정을 한 곳으로 모음(재큐레이션 [`2026-1010-큐레이션`](../work/2026-1010-큐레이션.md))'), null)
  // 좌표를 거는 한 줄 — 백틱을 빼면 짧다
  assert.equal(dupKey('  규칙 · 근거 · 교체 SQL · 함정은 정본 한 곳 — `table:factor.팩터_카테고리`(`설명` 칸).'), null)
  // 백틱이 있어도 글이 길면 복제 후보다
  assert.ok(dupKey('- ⚠ 코드 접두는 `O` 인데 **카테고리코드는 `I`(재건축)** 다. 첫 글자로 카테고리를 유추하는 코드가 있으면 틀린다.'))

  // 표 행 50 + 글 3 — 비대가 아니다
  const rowsT = Array.from({ length: 50 }, (_, i) => `| c${i} | int |`).join('\n')
  const VOCAB3 = ['# 어휘', '', '## table', '', '- `table:t` — 티', ''].join('\n')
  const MANAGED3 = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/테이블.md` | `## {값}` |', ''].join('\n')
  const DOC3 = ['# 테이블', '', '## t — 티', '', '**정의** 티 테이블.', '| 컬럼 | 타입 |', '|---|---|', rowsT, '', '**함정**', '- 없다', ''].join('\n')
  const r = await loadRepo(await repo({ '_vocab.md': VOCAB3, '_managed.md': MANAGED3, 'docs/테이블.md': DOC3, 'work/2026-0901-t.md': work({ id: '2026-0901-t', date: '2026-09-01 10:00', touches: ['table:t'] }) }))
  assert.equal(buildDrift(r, { sliceSection }).totals.oversize, 0)
})
