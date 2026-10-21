// 판단 단계(core/judge.js) — 프롬프트 · 초안 검사 · 승인 표(review.md) · 초안 + 승인 → 기록 · 자식 프로세스. 지식 생성 · 작업실 검토 G6 · G7.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { buildPrompt, extractJson, checkDraft, reviewText, parseReview, recordsFrom, runClaude, ALLOWED_TOOLS, DENIED_TOOLS } from '../core/judge.js'
import { parseSource, blobOf } from '../core/provenance.js'
import { formatSource } from '../core/provenance.js'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const FAKE = path.join(HERE, 'fixtures', 'fake-claude.mjs')
const NL = '\n'

test('프롬프트 — 쓰지 않는다 · 줄 범위 · match 대조 · 편입 규칙을 싣는다 · 허용 목록에 save 가 없다', () => {
  const p = buildPrompt({ rules: '## 날짜 — 사건의 날이다', file: 'x.md', rel: '회의/a.md', repo: 'kb', lines: 12, title: '회의' })
  assert.match(p, /아무것도 쓰지 않는다/)
  assert.match(p, /`x\.md` 에 있다\(12줄\)/)
  assert.match(p, /match/)
  assert.match(p, /본문을 다시 쓰지 않는다/)
  assert.ok(p.includes('## 날짜 — 사건의 날이다'))
  assert.ok(!ALLOWED_TOOLS.some((t) => /save|Edit|Write|Bash/.test(t)))
  for (const t of ['mcp__cdp__save', 'Edit', 'Write', 'Bash']) assert.ok(DENIED_TOOLS.includes(t), t)
})

test('초안 — 울타리 · 앞말을 걷고 JSON · 틀린 것은 거절 · 후보 하나만 틀리면 버린다', () => {
  assert.deepEqual(extractJson('판단입니다.\n```json\n{"a":1}\n```\n끝'), { a: 1 })
  assert.deepEqual(extractJson('{"a":2}'), { a: 2 })
  assert.throws(() => extractJson('없음'), (e) => e.code === 'E_JUDGE')
  const ok = checkDraft({ nature: '결정', records: [{ lines: [1, 5], date: '2026-02-30x', touches: [{ coord: 'term:PLC', quote: 'q', registered: true }, { coord: '좌표 아님' }, { coord: 'term:PLC' }] }], vocab: [{ coord: 'term:X', label: 'X', aliases: ['x', 3] }] }, { lines: 5 })
  assert.equal(ok.records[0].date, null, '날짜 모양이 아니면 버린다')
  assert.deepEqual(ok.records[0].touches.map((t) => t.coord), ['term:PLC'], '모양 아님 · 겹침은 버린다')
  assert.deepEqual(ok.vocab[0].aliases, ['x'])
  assert.match(ok.warnings[0], /좌표 모양이 아니라/)
  assert.throws(() => checkDraft({ nature: '모름', records: [] }, { lines: 5 }), /nature/)
  assert.throws(() => checkDraft({ nature: '결정', records: [{ lines: [1, 9] }] }, { lines: 5 }), /lines/)
  assert.throws(() => checkDraft({ nature: '결정', records: [{ lines: [1, 3] }, { lines: [3, 5] }] }, { lines: 5 }), /겹친다/)
  assert.equal(checkDraft({ nature: '제외', why: '빈 서식' }, { lines: 5 }).why, '빈 서식')
})

const row = (over = {}) => {
  const blob = 'a'.repeat(40)
  const bodyText = ['# 회의', '', 'PLC 를 정의한다.', '![g](assets/2026-0814-x-aaaaaaa/g.png)', '## 둘째', '', '나머지'].join(NL)
  return {
    rel: '회의/a.md',
    title: '회의',
    blob,
    bodyText,
    lines: bodyText.split(NL).length,
    assets: [{ name: 'g.png', rel: 'g.png', abs: '/x/g.png' }],
    head: ({ part, of, lines, date }) => `> 들임${part ? ` · 나눔 ${part}/${of} · 원문 줄 ${lines[0]}–${lines[1]}` : ''}${date ? ' · 날짜 근거 판단' : ''}`,
    idOf: (d, part) => `${d.slice(0, 4)}-${d.slice(5, 7)}${d.slice(8, 10)}-x-aaaaaaa${part ? '-' + part : ''}`,
    sourceOf: (part) => formatSource({ name: 's', path: '회의/a.md', blob, part }),
    work: { id: '2026-0814-x-aaaaaaa', title: '회의', date: '2026-08-14', source: formatSource({ name: 's', path: '회의/a.md', blob }), touchesEmpty: '들이기', tags: ['ingest/20261021-x', 'touches/term:옛'], body: '> 들임' + NL + NL + bodyText },
    ...over,
  }
}

test('승인 표 — 기본 체크는 등재 + 인용 · 고친 체크는 다시 지어도 남는다 · 읽기', () => {
  const draft = checkDraft({ nature: '결정', records: [{ lines: [1, 7], touches: [{ coord: 'term:PLC', quote: 'PLC 를', registered: true }, { coord: 'term:새것', quote: 'q', registered: false }, { coord: 'term:인용없음', registered: true }] }], vocab: [{ coord: 'term:새것', label: '새것' }] }, { lines: 7 })
  const items = [{ key: 's/회의/a.md', rel: '회의/a.md', title: '회의', draft }]
  const t = reviewText(items)
  assert.match(t, /^- \[x\] `term:PLC`/m)
  assert.match(t, /^- \[ \] `term:새것` \(미등재\)/m)
  assert.match(t, /^- \[ \] `term:인용없음`/m, '인용이 없으면 체크하지 않는다')
  assert.match(t, /^- \[ \] `term:새것` 새것 <!-- v -->/m)
  const edited = t.replace('- [ ] `term:새것` (미등재)', '- [x] `term:새것` (미등재)').replace('- [x] `term:PLC`', '- [ ] `term:PLC`').replace('- [ ] `term:새것` 새것 <!-- v -->', '- [x] `term:새것` 새것 <!-- v -->')
  const st = parseReview(edited)
  assert.deepEqual(st.get('s/회의/a.md'), { coords: { '0|term:PLC': false, '0|term:새것': true, '0|term:인용없음': false }, vocab: { 'term:새것': true }, force: false })
  const again = reviewText([{ ...items[0], state: st.get('s/회의/a.md') }])
  assert.deepEqual(parseReview(again).get('s/회의/a.md'), st.get('s/회의/a.md'), '다시 지어도 사람의 체크가 남는다')
})

test('초안 + 승인 → 기록 — 체크한 것만 touches · 나머지는 touches?/ · 미등재는 어휘를 같이 골라야 · 나누면 조각마다 id · 출처 · 첨부', () => {
  const r = row()
  const draft = checkDraft(
    {
      nature: '결정',
      records: [
        { lines: [1, 4], title: '첫째', date: '2026-03-01', dateEvidence: '3월 1일', touches: [{ coord: 'term:PLC', quote: 'PLC', registered: true }, { coord: 'term:새것', quote: 'q' }], open: [] },
        { lines: [5, 7], touches: [], open: ['회신 대기'] },
      ],
      vocab: [{ coord: 'term:새것', label: '새것' }],
    },
    { lines: r.lines }
  )
  // 승인 없이 · --approve 없이 — 좌표 0 · 후보는 touches?/
  const a = recordsFrom(r, draft, null, {})
  assert.equal(a.works.length, 2)
  assert.equal(a.works[0].work.touches, undefined)
  assert.ok(a.works[0].work.touchesEmpty)
  assert.ok(a.works[0].work.tags.includes('touches?/term:PLC'))
  assert.ok(a.works[0].work.tags.includes('touches/term:옛'), '원문의 좌표 태그는 남긴다')
  assert.ok(a.works[0].work.tags.includes('ingest-llm'))
  // --approve registered — 등재 + 인용만
  const b = recordsFrom(r, draft, null, { approve: 'registered' })
  assert.deepEqual(b.works[0].work.touches, ['term:PLC'])
  assert.equal(b.works[0].work.touchesEmpty, undefined)
  assert.ok(b.works[0].work.tags.includes('touches?/term:새것'))
  // 사람이 미등재를 체크했지만 어휘는 안 골랐다 — touches 에 못 올린다
  const c = recordsFrom(r, draft, { coords: { '0|term:새것': true, '0|term:PLC': true }, vocab: {}, force: false })
  assert.deepEqual(c.works[0].work.touches, ['term:PLC'])
  assert.match(c.warnings.join(NL), /term:새것 는 어휘에 없어/)
  // 어휘도 골랐다
  const d = recordsFrom(r, draft, { coords: { '0|term:새것': true }, vocab: { 'term:새것': true }, force: false })
  assert.deepEqual(d.works[0].work.touches, ['term:새것'])
  assert.deepEqual(d.vocab.map((v) => v.coord), ['term:새것'])
  // 나눔 — id · 출처 조각 · 날짜 · 머리줄 · 첨부는 그 조각이 가리키는 것만 · 열린 물음
  const [w1, w2] = a.works
  assert.equal(w1.work.id, '2026-0301-x-aaaaaaa-1')
  assert.equal(w2.work.id, '2026-0814-x-aaaaaaa-2')
  assert.equal(parseSource(w1.work.source).part, 1)
  assert.notEqual(blobOf(w1.work.source), blobOf(w2.work.source), '조각마다 다른 열쇠')
  assert.equal(w1.work.date, '2026-03-01')
  assert.equal(w1.work.title, '첫째')
  assert.match(w1.work.body.split(NL)[0], /나눔 1\/2 · 원문 줄 1–4 · 날짜 근거 판단/)
  assert.ok(w1.work.body.includes('assets/2026-0301-x-aaaaaaa-1/g.png'), '첨부 링크를 조각 id 로')
  assert.deepEqual(w1.assets.map((x) => x.name), ['g.png'])
  assert.deepEqual(w2.assets, [])
  assert.ok(w2.work.body.includes('- 열린 물음 — 회신 대기'))
  assert.ok(!w2.work.body.includes('PLC'), '조각 둘째에는 첫째의 글이 없다')
  // 판단 없음 — 계획 그대로
  assert.deepEqual(recordsFrom(r, null).works[0].work, r.work)
  // 제외 — 들이지 않는다 · 그래도 들인다 체크면 들인다
  const ex = checkDraft({ nature: '제외', why: '빈 서식' }, { lines: 3 })
  assert.match(recordsFrom(r, ex).skip, /빈 서식/)
  assert.equal(recordsFrom(r, ex, { coords: {}, vocab: {}, force: true }).works.length, 1)
})

test('runClaude — 가짜 claude 로: 표준 입력 프롬프트 · 금지 목록 · MCP 설정 · 로그인 안 됨 · 없는 명령', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-judge-'))
  try {
    await fs.writeFile(path.join(d, 'x.md'), '# A\n\nPLC 를 정의한다.\n')
    const mcp = path.join(d, 'mcp.json')
    await fs.writeFile(mcp, JSON.stringify({ mcpServers: { cdp: { type: 'http', url: 'http://x/mcp/kb', headers: { Authorization: 'Bearer t' } } } }))
    const env = { ...process.env, CDP_CLAUDE: FAKE }
    const prompt = buildPrompt({ rules: '규칙', file: 'x.md', rel: 'x.md', repo: 'kb', lines: 3 })
    const r = await runClaude({ prompt, cwd: d, mcpConfig: mcp, env })
    assert.equal(r.ok, true, r.error)
    assert.equal(r.usage, 150)
    const draft = checkDraft(extractJson(r.text), { lines: 3 })
    assert.equal(draft.records[0].touches[0].coord, 'term:PLC')
    const out = await runClaude({ prompt, cwd: d, mcpConfig: mcp, env: { ...env, FAKE_CLAUDE_LOGGED_OUT: '1' } })
    assert.equal(out.ok, false)
    assert.match(out.error, /로그인/)
    const none = await runClaude({ prompt, cwd: d, mcpConfig: mcp, env: { ...process.env, CDP_CLAUDE: path.join(d, '없는-claude-명령') } })
    assert.equal(none.ok, false)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
