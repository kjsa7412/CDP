// 정본 스냅샷 — `save.snapshot[]`. 리빌딩 검토 v0.1 §5.2 · RB3~RB6.
//
// 근거 없는 섹션을 **서버가** 원문 그대로 기록으로 뜨는가: 섹션 하나에 기록 하나 · 날짜는 섹션 줄의 마지막 커밋 · 출처 ·
// 봉투 기록 · 근거가 있는 섹션은 건너뛴다 · 대기열 · 미반영을 만들지 않는다 · 큐레이터만 · 다른 쓰기와 섞지 않는다 · dryRun.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { recordKind } from '../core/curation.js'
import { toolDrift, toolSection } from '../core/tools.js'
import { runBuiltinCheck } from '../core/check.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', '- `table:b` — 비', '- `table:c` — 시', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', ''].join(NL)
const T = ['# 테이블정의서', '', '## a — A', '', 'a 의 지금 — 기록이 있다.', '', '## b — B', '', 'b 의 지금 — 정본에만 있다.', '| 컬럼 | 뜻 |', '|---|---|', '| id | 키 |', '', '## c — C', '', ''].join(NL)
const A1 = ['---', 'id: 2026-0901-a1', 'title: a1', 'date: 2026-09-01 10:00', 'author: kim', 'touches:', '  - table:a', 'tags: []', '---', '', 'a 를 정했다.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-snap-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, 'work', '2026-0901-a1.md'), A1)
  const env = { ...process.env, GIT_COMMITTER_DATE: '2026-09-15T11:30:00', GIT_AUTHOR_DATE: '2026-09-15T11:30:00' }
  const g = (...a) => run('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a], { env })
  await g('init', '-q')
  await g('add', '-A')
  await g('commit', '-qm', 'seed')
  return { r, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const envelope = (extra = {}) => ({ id: '2026-1010-스냅샷', title: '정본 스냅샷', date: '2026-10-10 10:00', body: '근거 없는 섹션을 뜬다.', ...extra })
const curator = { user: 'cur', write: true, curate: true }

test('snapshot — 근거 없는 섹션만 원문 그대로 · 날짜는 섹션의 마지막 커밋 · 봉투와 한 커밋 · 대기열에 안 선다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { r, rm } = await repo()
  try {
    const before = toolDrift(await loadRepo(r)).totals.unsourced
    assert.equal(before, 1)

    const res = await save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }, { coord: 'table:a' }] }, curator)
    assert.deepEqual(res.snapshots.map((s) => s.coord), ['table:b'])
    assert.equal(res.snapshots[0].date, '2026-09-15 11:30')
    assert.equal(res.snapshots[0].id, '2026-0915-스냅샷-table-b')
    assert.deepEqual(res.snapshotSkipped.map((s) => s.coord), ['table:a'])

    const r1 = await loadRepo(r)
    const s = r1.byId.get('2026-0915-스냅샷-table-b')
    assert.equal(recordKind(s), 'snapshot')
    assert.deepEqual(s.touches, ['table:b'])
    assert.match(s.source, /^docs\/t\.md@[0-9a-f]+#b — B$/)
    const text = await fs.readFile(path.join(r, 'work', '2026-0915-스냅샷-table-b.md'), 'utf8')
    assert.match(text, /b 의 지금 — 정본에만 있다\.\n\| 컬럼 \| 뜻 \|/)
    assert.match(text, /^snapshot: \{ source: ".+", asof: "2026-09-15" \}$/m)
    // 봉투 — 시스템 기록 · 뜬 목록
    const env = r1.byId.get('2026-1010-스냅샷')
    assert.equal(recordKind(env), 'system')
    assert.match(await fs.readFile(path.join(r, 'work', '2026-1010-스냅샷.md'), 'utf8'), /`table:b` → \[`2026-0915-스냅샷-table-b`\]/)
    // 한 커밋 · 대기열 · 미반영 없음 · 근거 없음 0 · 섹션은 그대로
    assert.equal((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim(), '2')
    assert.deepEqual(r1.curation.queue.map((q) => q.id), ['2026-0901-a1'], '스냅샷은 대기열에 서지 않는다 — a1 은 원래 대기다')
    assert.equal(toolSection(r1, { coord: 'table:b' }).pending.length, 0)
    assert.equal(toolDrift(r1).totals.unsourced, 0)
    assert.equal(await fs.readFile(path.join(r, 'docs', 't.md'), 'utf8'), T)

    // 다시 — 뜰 것이 없다
    await assert.rejects(save(r, { work: envelope({ id: '2026-1010-스냅샷-2' }), snapshot: [{ coord: 'table:b' }] }, curator), (e) => e.code === 'E_INPUT' && /뜰 스냅샷이 없다/.test(e.message))
  } finally {
    await rm()
  }
})

test('snapshot — 본문의 좌표는 정본 원문의 가리키는 줄이다 · 「본문에만 있는 좌표」 경고를 내지 않는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { r, rm } = await repo()
  try {
    await fs.writeFile(path.join(r, 'docs', 't.md'), T.replace('b 의 지금 — 정본에만 있다.', 'b 의 지금 — 정본에만 있다. 이웃은 `table:c`. 근거 [a1](../work/2026-0901-a1.md) · 웹 [x](http://x/y.md)'))
    await run('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qam', 'ptr'])
    await save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }] }, curator)
    const r1 = await loadRepo(r)
    const snap = r1.works.find((d) => recordKind(d) === 'snapshot')
    const text = await fs.readFile(path.join(r, snap.path), 'utf8')
    assert.match(text, /`table:c`/, '스냅샷 본문에 가리키는 좌표가 있다')
    // 상대 링크는 기록 자리(work/) 기준으로 다시 잇는다 — 문서 기준 그대로면 work/ 에서 깨진다 · 웹 링크는 그대로
    assert.match(text, /\[a1\]\(2026-0901-a1\.md\)/)
    assert.match(text, /\[x\]\(http:\/\/x\/y\.md\)/)
    const f = runBuiltinCheck({ ...r1 }).findings.find((x) => x.kind === 'body-only-coord')
    // 스냅샷도 봉투(뜬 좌표 목록을 백틱으로 적는다)도 이 경고를 내지 않는다
    assert.ok(!f || !f.items.some((i) => i.id === snap.id || i.id === '2026-1010-스냅샷'), JSON.stringify(f))
  } finally {
    await rm()
  }
})

test('snapshot — 큐레이터만 · 본문은 받지 않는다 · 다른 쓰기와 섞지 않는다 · 빈 섹션 · dryRun 은 쓰지 않는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { r, rm } = await repo()
  try {
    await assert.rejects(save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }] }, { user: 'w', write: true, curate: false }), (e) => e.code === 'E_FORBIDDEN' && e.detail.fields.includes('snapshot'))
    await assert.rejects(save(r, { work: envelope(), snapshot: [{ coord: 'table:b', body: '지어낸 글' }] }, curator), (e) => e.code === 'E_INPUT' && /coord } 하나만/.test(e.message))
    await assert.rejects(
      save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }], sections: [{ coord: 'table:a', body: 'x' }] }, curator),
      (e) => e.code === 'E_INPUT' && /섞지 않는다/.test(e.message)
    )
    await assert.rejects(save(r, { work: envelope(), snapshot: [{ coord: 'table:c' }] }, curator), (e) => e.code === 'E_INPUT' && /글이 없다/.test(e.message))
    await assert.rejects(save(r, { work: envelope({ touches: ['table:b'] }), snapshot: [{ coord: 'table:b' }] }, curator), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touches')

    const res = await save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }], dryRun: true }, curator)
    assert.equal(res.dryRun, true)
    assert.equal(res.snapshots.length, 1)
    assert.deepEqual((await fs.readdir(path.join(r, 'work'))).sort(), ['2026-0901-a1.md'])
  } finally {
    await rm()
  }
})

test('snapshot — 섹션이 없는 레포(기록만 옮겨 다시 세움)에서는 대기열에 서고 · 큐레이션이 반영으로 다룬다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { r, rm } = await repo()
  try {
    await save(r, { work: envelope(), snapshot: [{ coord: 'table:b' }] }, curator)
    // 다시 세운 레포 — 문서는 빈 틀 · 기록은 그대로
    await fs.writeFile(path.join(r, 'docs', 't.md'), '# 테이블정의서\n')
    await run('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qam', '빈 틀'])
    const r1 = await loadRepo(r)
    assert.ok(r1.curation.queue.some((q) => q.id === '2026-0915-스냅샷-table-b'))

    await save(
      r,
      {
        work: { id: '2026-1010-큐레이션', title: '다시 세움', date: '2026-10-10 11:00', body: '스냅샷을 반영한다.', curates: [{ id: '2026-0915-스냅샷-table-b', verdict: 'reflect', into: ['table:b'] }] },
        sections: [{ coord: 'table:b', body: 'b 의 지금 — 정본에만 있다.' }],
      },
      curator
    )
    const r2 = await loadRepo(r)
    assert.equal(r2.curation.queue.length, 1, 'a1 만 남는다')
    assert.equal(r2.curation.statusOf('2026-0915-스냅샷-table-b').state, 'reflected')
  } finally {
    await rm()
  }
})

test('pickRecords — 다시 세우기는 사람의 기록과 정본 스냅샷을 옮기고 · 큐레이션 · 기준선 · 봉투는 옮기지 않는다', async () => {
  const { pickRecords } = await import('../core/rebuild.js')
  const ws = [
    { id: 'w', touches: ['table:a'], tags: [] },
    { id: 's', touches: ['table:b'], tags: ['snapshot'], snapshot: { source: 'x', asof: '2026-09-15' } },
    { id: 'env', touches: [], tags: ['snapshot'] },
    { id: 'c', touches: [], tags: ['curate'], curates: [{ id: 'w', verdict: 'reflect', into: ['table:a'] }] },
    { id: 'b', touches: [], tags: ['baseline'], baseline: { source: 'db', asof: null } },
  ]
  const p = pickRecords(ws)
  assert.deepEqual(p.keep.map((d) => d.id), ['w', 's'])
  assert.deepEqual(p.skip.map((d) => [d.id, d.kind]), [['env', 'system'], ['c', 'curation'], ['b', 'baseline']])
})
