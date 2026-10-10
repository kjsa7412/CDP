// 제자리 이행 — `core/migrate.js` · `ctx migrate`. v1.0 개편안 §9.2 · TODO W7.
//
// 옛 레포(큐레이션 기록 0 · applied 가 있는 섹션)의 암묵 전환을 **기록 하나로 굳히는가**: 지금 섹션이 최신인 기록은
// 반영됨 · 실을 섹션이 없던 기록은 기록으로 둠 · 옛 판정이 남긴 기록은 대기열에 그대로. 그리고 도구 층을 걷는가.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { loadRepo } from '../core/repo.js'
import { planTransition } from '../core/migrate.js'
import { runMigrate } from '../viewer/bin/ctx-migrate.mjs'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 가', '- `table:b` — 나', '', '## term', '', '- `term:x` — 엑스', ''].join('\n')
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/테이블.md` | `## {값}` |', ''].join('\n')
const DOC = ['# 테이블', '', '## a — 가', '<!-- applied: 2026-0902-a2 -->', '', 'A 의 지금', '', '## b — 나', '<!-- applied: 2026-0901-b1 -->', '', 'B 의 지금', ''].join('\n')

function work({ id, date, touches = [], body = '본문 첫 문단이다.', extra = [] }) {
  return ['---', `id: ${id}`, `title: ${id}`, `date: ${date}`, 'author: kim', 'touches:' + (touches.length ? '' : ' []'), ...touches.map((c) => `  - ${c}`), ...extra, 'tags: []', '---', '', body, ''].join('\n')
}

// 옛 레포 — b2 는 b1(applied) 뒤의 후속이라 옛 판정이 남긴 대기 · x 는 등록부 없는 좌표 · n 은 좌표 없음
const LEGACY = {
  '_vocab.md': VOCAB,
  '_managed.md': MANAGED,
  'docs/테이블.md': DOC,
  'work/2026-0901-b1.md': work({ id: '2026-0901-b1', date: '2026-09-01 10:00', touches: ['table:b'] }),
  'work/2026-0902-a2.md': work({ id: '2026-0902-a2', date: '2026-09-02 10:00', touches: ['table:a', 'term:x'] }),
  'work/2026-0903-b2.md': work({ id: '2026-0903-b2', date: '2026-09-03 10:00', touches: ['table:b'], body: 'B 를 또 바꿨다.' }),
  'work/2026-0904-x.md': work({ id: '2026-0904-x', date: '2026-09-04 10:00', touches: ['term:x'] }),
  'work/2026-0905-n.md': work({ id: '2026-0905-n', date: '2026-09-05 10:00', extra: ['touchesEmpty: 회의 기록'] }),
}

async function repo(files) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-mig-'))
  for (const [rel, text] of Object.entries(files)) {
    await fs.mkdir(path.dirname(path.join(root, rel)), { recursive: true })
    await fs.writeFile(path.join(root, rel), text, 'utf8')
  }
  return root
}

test('planTransition — 섹션이 최신인 기록은 reflect(into = 섹션 좌표) · 실을 섹션이 없던 기록은 keep · 대기 기록은 판정하지 않는다', async () => {
  const r = await loadRepo(await repo(LEGACY))
  assert.equal(r.curation.implicit, true)
  const p = planTransition(r, { now: new Date(2026, 9, 6, 9, 5) })
  assert.equal(p.error, undefined)
  assert.deepEqual(p.stats, { reflect: 2, keep: 2, queued: 1 })
  const w = p.input.work
  assert.equal(w.id, '2026-1006-전환-v1')
  assert.equal(w.date, '2026-10-06 09:05')
  assert.deepEqual(w.tags, ['transition'])
  assert.deepEqual(w.touches, [])
  const by = Object.fromEntries(w.curates.map((c) => [c.id, c]))
  assert.deepEqual(by['2026-0901-b1'], { id: '2026-0901-b1', verdict: 'reflect', into: ['table:b'] })
  // 등록부 없는 좌표(term:x)는 into 에 넣지 않는다 — 실린 자리가 없다
  assert.deepEqual(by['2026-0902-a2'].into, ['table:a'])
  assert.equal(by['2026-0904-x'].verdict, 'keep')
  assert.match(by['2026-0904-x'].reason, /등록부 없는 좌표/)
  assert.match(by['2026-0905-n'].reason, /좌표 없는/)
  assert.equal(by['2026-0903-b2'], undefined)
  // 오래된 것부터
  assert.deepEqual(w.curates.map((c) => c.id), ['2026-0901-b1', '2026-0902-a2', '2026-0904-x', '2026-0905-n'])
})

test('planTransition — 전환은 한 번 · 옛 파생 이력이 없는 레포(새 · 다시 세운)는 전환할 것이 없다', async () => {
  const fresh = await loadRepo(await repo({ ...LEGACY, 'docs/테이블.md': '# 테이블\n' }))
  assert.match(planTransition(fresh).error, /전환할 것이 없다/)
  const done = await loadRepo(
    await repo({
      ...LEGACY,
      'work/2026-0906-cur.md': work({ id: '2026-0906-cur', date: '2026-09-06 10:00', extra: ['touchesEmpty: 큐레이션', 'curates:', '  - { id: 2026-0903-b2, verdict: keep, reason: 보류 }'] }),
    })
  )
  assert.match(planTransition(done).error, /이미 큐레이션 기록이 있다/)
})

test('ctx migrate — 전환 기록 커밋 · 대기열은 옛 판정이 남긴 것만 · 도구 층을 걷고 hooksPath 를 푼다 · 두 번째는 건너뛴다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const root = await repo({
    ...LEGACY,
    'README.md': ['# 레포', '', '- [설명서](MANUAL.md)', '- [표](docs/테이블.md)', ''].join('\n'),
    'MANUAL.md': '# 설명서\n',
    'CLAUDE.md': '# 지시\n',
    'INDEX.md': '# 색인\n',
    'bin/ctx.mjs': '// 옛 도구\n',
    '.githooks/pre-commit': '#!/bin/sh\nexit 1\n',
    // 로컬형의 뷰어 바이너리 — 무시된 채 디스크에만 있다. git rm 에 넣으면 걷기 전체가 실패했다(ezipez_cdp 이행)
    '.gitignore': 'tools/\n',
    'tools/cdp': '옛 뷰어\n',
  })
  const g = (...a) => run('git', ['-C', root, ...a])
  await g('init', '-q')
  await g('add', '-A')
  await g('-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qm', 'seed')
  await g('config', 'core.hooksPath', '.githooks')

  const lines = []
  const io = { out: (s = '') => lines.push(s), err: (s = '') => lines.push('ERR ' + s) }
  assert.equal(await runMigrate({ args: [root], by: 'kjsa' }, io), 0)
  const text = lines.join('\n')
  assert.match(text, /반영됨 2 · 기록으로 둠 2 · 대기열에 남김 1/)
  assert.match(text, /README\.md:3 → MANUAL\.md/)
  assert.doesNotMatch(text, /README\.md:4/)

  const r = await loadRepo(root)
  assert.equal(r.curation.implicit, false)
  assert.deepEqual(r.curation.queue.map((q) => q.id), ['2026-0903-b2'])
  assert.equal(r.curation.statusOf('2026-0901-b1').state, 'reflected')
  assert.equal(r.curation.statusOf('2026-0904-x').state, 'kept')
  assert.deepEqual(r.curation.pendingOf('table:b').map((p) => p.id), ['2026-0903-b2'])
  assert.deepEqual(r.curation.pendingOf('table:a'), [])

  for (const rel of ['MANUAL.md', 'CLAUDE.md', 'INDEX.md', 'bin', '.githooks']) assert.equal(await fs.stat(path.join(root, rel)).catch(() => null), null, rel)
  assert.ok(await fs.stat(path.join(root, 'README.md')))
  assert.ok(await fs.stat(path.join(root, 'tools/cdp')), '무시된 파일은 git 의 것이 아니다 — 두고 간다')
  assert.doesNotMatch(text, /도구 층 — .*tools/)
  assert.equal((await g('config', '--get', 'core.hooksPath').catch((e) => e)).stdout?.trim() || '', '')
  const log = (await g('log', '--format=%an|%s')).stdout.trim().split('\n')
  assert.equal(log.length, 3)
  assert.match(log[0], /^kjsa\|전환 — 레포에는 지식만/)
  assert.match(log[1], /^kjsa\|전환 — 옛 기록 4건/)
  assert.equal((await g('status', '--porcelain')).stdout.trim(), '')

  // 두 번째 — 전환은 건너뛰고 걷을 것도 없다
  lines.length = 0
  assert.equal(await runMigrate({ args: [root], by: 'kjsa' }, io), 0)
  assert.match(lines.join('\n'), /건너뜀: 이미 큐레이션 기록이 있다/)
  assert.match(lines.join('\n'), /도구 층 — 없다/)
  assert.equal((await g('log', '--format=%s')).stdout.trim().split('\n').length, 3)

  // 전환 기록으로 into 검사를 다시 면할 수는 없다 — 한 번뿐이다
  const { save } = await import('../core/save.js')
  await assert.rejects(
    save(root, { work: { id: '2026-1007-전환-v2', title: '또', date: '2026-10-07 09:00', touches: [], tags: ['transition'], curates: [{ id: '2026-0903-b2', verdict: 'reflect', into: ['table:b'] }], body: '또.' } }, { user: 'kjsa', write: true, curate: true }),
    (e) => e.code === 'E_INPUT' && /한 번/.test(e.message)
  )
})

test('ctx migrate --dry — 아무것도 쓰지 않는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const root = await repo({ ...LEGACY, 'CLAUDE.md': '# 지시\n' })
  const g = (...a) => run('git', ['-C', root, ...a])
  await g('init', '-q')
  await g('add', '-A')
  await g('-c', 'user.name=t', '-c', 'user.email=t@x', 'commit', '-qm', 'seed')
  const lines = []
  assert.equal(await runMigrate({ args: [root], dry: true }, { out: (s = '') => lines.push(s), err: (s = '') => lines.push(s) }), 0)
  assert.match(lines.join('\n'), /도구 층 — CLAUDE\.md/)
  assert.match(lines.join('\n'), /--dry/)
  assert.equal((await g('log', '--format=%s')).stdout.trim().split('\n').length, 1)
  assert.ok(await fs.stat(path.join(root, 'CLAUDE.md')))
})
