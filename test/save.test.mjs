// core/save · core/mirror · core/lock — 동시 기록 검토 v0.1 의 실측을 단위로 옮긴 것.
//
// 작은 지식 레포(어휘 · 등록부 · 관리 문서 둘)를 임시 폴더에 세우고 `save` 를 **직접** 부른다 —
// 서버를 띄우는 것은 하네스(91~97)의 일이다. git 이 없으면 전부 건너뛴다(save 는 커밋한다).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save, withLock } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { toolSection } from '../core/tools.js'
import { enqueuePush, lastPush, stateOf, summary, describe, syncWithOrigin, restore } from '../core/mirror.js'
import { status } from '../core/git.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', '- `table:b` — 비', '- `table:c` — 시', '- `table:d` — 디', '- `table:e` — 이', '', '## note', '', '- `note:회의` — 회의', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', '| `note:*` | `docs/n.md` | `—` |', ''].join(NL)
const T = ['# 테이블정의서', '', ...['a', 'b', 'c', 'd', 'e'].flatMap((v) => [`## ${v} — ${v.toUpperCase()}`, '<!-- applied: null -->', '', `${v} 의 처음 본문.`, '']), ''].join(NL)
const N = ['# 회의록', '', '처음 본문 전체.', ''].join(NL)

async function repo({ origin = false } = {}) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-save-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, 'docs', 'n.md'), N)
  await fs.writeFile(path.join(r, 'README.md'), '# alpha\n\n시험 레포.\n')
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  let bare = null
  if (origin) {
    bare = path.join(d, 'origin.git')
    await run('git', ['init', '-q', '--bare', bare])
    await g(r, 'remote', 'add', 'origin', bare)
    await g(r, 'push', '-q', '-u', 'origin', 'HEAD')
  }
  return { d, r, bare, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, coord, extra = {}) => ({ id, title: id, date: '2026-09-25 10:00', touches: coord ? [coord] : [], body: `${id} 의 본문 — 왜 그렇게 했나.`, ...extra })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const opt = (user = 'hong', more = {}) => ({ user, write: true, ...more })

test('withLock — 앞 것이 거부돼도 다음 것이 순서대로 돈다', async () => {
  const order = []
  const wait = (ms) => new Promise((r) => setTimeout(r, ms))
  const p1 = withLock('k', async () => {
    await wait(20)
    order.push(1)
    throw new Error('x')
  }).catch(() => order.push('1-rej'))
  const p2 = withLock('k', async () => order.push(2))
  const p3 = withLock('k', async () => {
    await wait(5)
    order.push(3)
  })
  await Promise.all([p1, p2, p3])
  assert.deepEqual(order, [1, '1-rej', 2, 3])
})

test('save — 다른 섹션 5건 동시: 전부 커밋 · 트리 깨끗 · applied 다섯 · 작성자 각자', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const users = ['hong', 'lee', 'kjsa', 'hong', 'lee']
    const out = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((v, i) => save(R.r, { work: work(`2026-0925-동시-${v}`, `table:${v}`), sections: [{ coord: `table:${v}`, applied: null, body: `${v} 의 새 본문.` }] }, opt(users[i])))
    )
    assert.equal(out.filter((o) => o.commit).length, 5)
    assert.equal(await commits(R.r), n0 + 5)
    assert.equal(await porcelain(R.r), '')
    const r = await loadRepo(R.r)
    for (const v of ['a', 'b', 'c', 'd', 'e']) assert.equal(toolSection(r, { coord: `table:${v}` }).applied, `2026-0925-동시-${v}`)
    const authors = (await run('git', ['-C', R.r, 'log', '-5', '--format=%an'])).stdout.trim().split(/\r?\n/).sort()
    assert.deepEqual(authors, ['hong', 'hong', 'kjsa', 'lee', 'lee'])
    assert.equal(out[0].mirror, 'off', 'mirror 를 안 켰다')
  } finally {
    await R.rm()
  }
})

test('save — 같은 섹션 둘 동시: 하나는 E_CONFLICT 이고 detail 에 currentWork · content · 문장에 누가 언제', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const r0 = await loadRepo(R.r)
    const applied = toolSection(r0, { coord: 'table:a' }).applied
    const res = await Promise.allSettled(
      ['hong', 'lee'].map((u) => save(R.r, { work: work(`2026-0925-같은-${u}`, 'table:a', { date: '2026-09-25 11:00' }), sections: [{ coord: 'table:a', applied, body: `${u} 가 쓴 본문.` }] }, opt(u)))
    )
    const ok = res.filter((x) => x.status === 'fulfilled')
    const bad = res.filter((x) => x.status === 'rejected')
    assert.equal(ok.length, 1)
    assert.equal(bad.length, 1)
    const e = bad[0].reason
    assert.equal(e.code, 'E_CONFLICT')
    assert.equal(e.detail.expected, applied)
    assert.equal(e.detail.current, ok[0].value.id)
    assert.equal(e.detail.currentWork.id, ok[0].value.id)
    assert.ok(['hong', 'lee'].includes(e.detail.currentWork.author))
    assert.equal(e.detail.currentWork.date, '2026-09-25 11:00')
    assert.match(e.detail.content, /가 쓴 본문\./, '지금 본문이 실린다')
    assert.equal(e.detail.truncated, false)
    assert.match(e.message, /가 2026-09-25 11:00 에 2026-0925-같은-(hong|lee) 로 갱신했다/)
    assert.equal(await porcelain(R.r), '')
    // 재료로 다시 만들어 보낸다 — section 을 다시 부르지 않고
    const again = await save(R.r, { work: work('2026-0925-다시', 'table:a', { date: '2026-09-25 11:05' }), sections: [{ coord: 'table:a', applied: e.detail.current, body: e.detail.content + NL + NL + '그 위에 덧붙인 줄.' }] }, opt('lee'))
    assert.ok(again.commit)
    assert.match(await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8'), /가 쓴 본문\.\n\n그 위에 덧붙인 줄\./)
  } finally {
    await R.rm()
  }
})

test('save — 같은 좌표 새 섹션 둘 동시: 헤딩 하나 · 둘째는 E_CONFLICT { expected: null }', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const res = await Promise.allSettled(
      ['hong', 'lee'].map((u) =>
        save(R.r, { work: work(`2026-0925-새-${u}`, 'table:new'), sections: [{ coord: 'table:new', applied: null, heading: 'new — 새 테이블', body: `${u} 의 새 섹션.` }], vocab: [{ coord: 'table:new', label: '새 테이블' }] }, opt(u))
      )
    )
    assert.equal(res.filter((x) => x.status === 'fulfilled').length, 1)
    const e = res.find((x) => x.status === 'rejected').reason
    assert.equal(e.code, 'E_CONFLICT')
    assert.equal(e.detail.expected, null)
    const doc = await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8')
    assert.equal((doc.match(/^## new/gm) || []).length, 1)
    assert.equal(((await fs.readFile(path.join(R.r, '_vocab.md'), 'utf8')).match(/table:new/g) || []).length, 1)
  } finally {
    await R.rm()
  }
})

test('save — 더러운 트리는 E_GIT dirty 로 거절 · 트리는 그대로 · restore 뒤에 된다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    await fs.appendFile(path.join(R.r, 'docs', 't.md'), '사람이 서버 셸에서 고친 줄' + NL)
    await fs.writeFile(path.join(R.r, 'stray.txt'), 'x')
    const n0 = await commits(R.r)
    await assert.rejects(save(R.r, { work: work('2026-0925-더러움', 'table:a'), sections: [{ coord: 'table:a', applied: null, body: '새 본문' }] }, opt()), (e) => {
      assert.equal(e.code, 'E_GIT')
      assert.equal(e.detail.reason, 'dirty')
      assert.equal(e.detail.dirty, 2)
      assert.ok(e.detail.paths.includes('docs/t.md'))
      assert.match(e.message, /트리 되돌리기/)
      return true
    })
    assert.equal(await commits(R.r), n0, '커밋이 늘지 않았다')
    assert.match(await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8'), /사람이 서버 셸에서 고친 줄/, '사람의 줄을 지우지 않았다')
    const r = await restore(R.r)
    assert.equal(r.ok, true)
    assert.deepEqual(r.discarded.sort(), ['docs/t.md', 'stray.txt'])
    const ok = await save(R.r, { work: work('2026-0925-되돌린뒤', 'table:a'), sections: [{ coord: 'table:a', applied: null, body: '새 본문' }] }, opt())
    assert.ok(ok.commit)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('save — 검사 실패면 Snap 이 되돌리고 커밋 0 (파생 누락)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const before = await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8')
    await assert.rejects(save(R.r, { work: work('2026-0925-파생누락', 'table:a') }, opt()), (e) => e.code === 'E_CHECK')
    assert.equal(await commits(R.r), n0)
    assert.equal(await porcelain(R.r), '')
    assert.equal(await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8'), before)
    assert.equal(await fs.stat(path.join(R.r, 'work', '2026-0925-파생누락.md')).catch(() => null), null)
  } finally {
    await R.rm()
  }
})

test('save — `—`(문서 전체) 규칙: 머리 주석 · 전체 치환 · 둘째 save 의 current · 헤딩이 있어도 된다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const r0 = await loadRepo(R.r)
    const s0 = toolSection(r0, { coord: 'note:회의' })
    assert.equal(s0.applied, null)
    assert.equal(s0.anchor, '(문서 전체)')
    const one = await save(R.r, { work: work('2026-0925-회의-1', 'note:회의'), sections: [{ coord: 'note:회의', applied: null, body: '# 회의록' + NL + NL + '## 9월' + NL + NL + '새 본문 전체.' }] }, opt())
    assert.ok(one.commit)
    const doc = await fs.readFile(path.join(R.r, 'docs', 'n.md'), 'utf8')
    assert.ok(doc.startsWith('<!-- applied: 2026-0925-회의-1 -->' + NL + NL + '# 회의록'), doc.slice(0, 80))
    const r1 = await loadRepo(R.r)
    const s1 = toolSection(r1, { coord: 'note:회의' })
    assert.equal(s1.applied, '2026-0925-회의-1')
    assert.ok(!s1.content.includes('applied:'), 'content 에는 주석이 없다')
    assert.equal(r1.sections.find((x) => x.coord === 'note:회의').state, 'ok', '파생 판정이 다른 섹션과 같다')
    // 옛 applied 로 보내면 E_CONFLICT · current 가 머리 주석
    await assert.rejects(save(R.r, { work: work('2026-0925-회의-2', 'note:회의'), sections: [{ coord: 'note:회의', applied: null, body: '덮어쓰기' }] }, opt()), (e) => e.code === 'E_CONFLICT' && e.detail.current === '2026-0925-회의-1')
    const two = await save(R.r, { work: work('2026-0925-회의-2', 'note:회의'), sections: [{ coord: 'note:회의', applied: '2026-0925-회의-1', body: s1.content + NL + '덧붙임.' }] }, opt())
    assert.ok(two.commit)
    assert.equal(topLine(await fs.readFile(path.join(R.r, 'docs', 'n.md'), 'utf8')), '<!-- applied: 2026-0925-회의-2 -->')
  } finally {
    await R.rm()
  }
})
const topLine = (s) => s.split(NL)[0]

test('mirror — bare origin: 동시 save 3 → 큐가 합쳐 origin = local · 응답 mirror ok · 겹침 0', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo({ origin: true })
  try {
    const out = await Promise.all(['a', 'b', 'c'].map((v) => save(R.r, { work: work(`2026-0925-미러-${v}`, `table:${v}`), sections: [{ coord: `table:${v}`, applied: null, body: `${v} 미러.` }] }, opt('hong', { mirror: true }))))
    assert.equal(out.filter((o) => o.commit).length, 3)
    for (const o of out) assert.ok(['ok', 'queued'].includes(o.mirror), o.mirror)
    // 큐가 다 빠질 때까지
    await enqueuePush(R.r)
    const local = (await run('git', ['-C', R.r, 'rev-parse', 'HEAD'])).stdout.trim()
    const remote = (await run('git', ['-C', R.bare, 'rev-parse', 'HEAD'])).stdout.trim()
    assert.equal(remote, local)
    assert.equal(lastPush(R.r).ok, true)
    const st = await status(R.r)
    assert.equal(stateOf(st, lastPush(R.r)), 'ok')
    assert.equal(describe(await summary(R.r, st)), null, '정상은 조용하다')
  } finally {
    await R.rm()
  }
})

test('mirror — 남이 origin 에 먼저 밀면 non-ff → diverged · 사유 · ahead/behind · 응답 warnings · syncWithOrigin 은 서버용 문장으로 거절', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo({ origin: true })
  try {
    const C = path.join(R.d, 'clone')
    await run('git', ['clone', '-q', R.bare, C])
    await fs.appendFile(path.join(C, 'README.md'), '로컬형이 먼저.\n')
    await g(C, 'add', '-A')
    await g(C, 'commit', '-qm', '로컬형')
    await g(C, 'push', '-q')

    const logs = []
    const o = await save(R.r, { work: work('2026-0925-nonff', 'table:a'), sections: [{ coord: 'table:a', applied: null, body: '서버 쪽.' }] }, opt('hong', { mirror: true, log: (m) => logs.push(m), mirrorWaitMs: 20000 }))
    assert.ok(o.commit)
    assert.equal(o.mirror, 'diverged')
    assert.equal(o.mirrorReason, 'non-ff')
    assert.equal(o.mirrorLast.ahead, 1)
    assert.equal(o.mirrorLast.behind, 1)
    assert.ok(o.warnings.some((w) => /origin 과 갈라짐/.test(w)), JSON.stringify(o.warnings))
    assert.ok(logs.some((l) => /미러 실패 alpha: origin 에 서버가 모르는 커밋이 있다/.test(l)), JSON.stringify(logs))
    const st = await status(R.r)
    assert.equal(stateOf(st, lastPush(R.r)), 'diverged')
    const m = await summary(R.r, st)
    assert.equal(m.reason, 'non-ff')
    assert.match(describe(m), /origin 과 갈라짐 — 서버 1건 · origin 1건/)

    const s = await syncWithOrigin(R.r)
    assert.equal(s.ok, false)
    assert.equal(s.reason, 'diverged')
    assert.match(s.message, /sudo -u cdp -H git -C .* pull --rebase/)
    assert.equal(await porcelain(R.r), '', '거절이 트리를 안 만졌다')
  } finally {
    await R.rm()
  }
})

test('mirror — origin 만 앞서 있으면 stateOf 는 behind · syncWithOrigin 이 ff 로 맞추고 rescan 을 부른다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo({ origin: true })
  try {
    const C = path.join(R.d, 'clone')
    await run('git', ['clone', '-q', R.bare, C])
    await fs.appendFile(path.join(C, 'README.md'), '등록부를 밖에서 고쳤다.\n')
    await g(C, 'add', '-A')
    await g(C, 'commit', '-qm', '밖에서')
    await g(C, 'push', '-q')
    await g(R.r, 'fetch', '-q')
    assert.equal(stateOf(await status(R.r)), 'behind')
    assert.match(describe(await summary(R.r)), /origin 이 1건 앞서 있다/)
    // 콘솔에 못 들어가는 사람에게는 단추 이름 대신 「관리자에게」(화면 · 권한 검토 v0.1 R4)
    assert.match(describe(await summary(R.r)), /콘솔 > 지식 레포 > 「origin 과 맞추기」/)
    assert.match(describe(await summary(R.r), { admin: false }), /관리자에게\(콘솔 「origin 과 맞추기」\)/)
    assert.doesNotMatch(describe(await summary(R.r), { admin: false }), /콘솔 > /)
    let rescanned = 0
    const s = await syncWithOrigin(R.r, { rescan: async () => rescanned++ })
    assert.equal(s.ok, true)
    assert.equal(s.pulled, 1)
    assert.equal(rescanned, 1)
    assert.equal(stateOf(await status(R.r)), 'ok')
    assert.match(await fs.readFile(path.join(R.r, 'README.md'), 'utf8'), /등록부를 밖에서 고쳤다/)
    // 더러우면 맞추기도 거절
    await fs.writeFile(path.join(R.r, 'stray.txt'), 'x')
    const d = await syncWithOrigin(R.r)
    assert.equal(d.reason, 'dirty')
  } finally {
    await R.rm()
  }
})
