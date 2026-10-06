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
// 큐레이터 호출이 기본이다 — 섹션을 쓰는 시험이 대부분이다. writer(기록만)는 따로 시험한다(v1.0 I6)
const opt = (user = 'hong', more = {}) => ({ user, write: true, curate: true, ...more })

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

test('save — 어휘에 없는 타입은 서버가 만든다(문서 끝) · 같은 save 의 둘째는 그 섹션에 붙는다 · 경고로 알린다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const r = await save(R.r, { work: work('2026-0930-용어', 'term:PLC'), vocab: [{ coord: 'term:PLC', label: '프로그래머블 로직 컨트롤러', aliases: ['피엘씨'] }, { coord: 'term:SCADA', label: '감시제어 시스템' }] }, opt())
    assert.ok(r.commit)
    assert.equal(r.vocab, 2)
    assert.ok(r.warnings.some((w) => /새 어휘 타입 "term"/.test(w)))
    const v = await fs.readFile(path.join(R.r, '_vocab.md'), 'utf8')
    assert.ok(v.endsWith(['', '## term', '', '- `term:PLC` — 프로그래머블 로직 컨트롤러', '  aliases: 피엘씨', '- `term:SCADA` — 감시제어 시스템', ''].join(NL)))
    assert.equal((v.match(/^## term$/gm) || []).length, 1)
    // 만든 뒤에는 보통 타입이다 — 경고 없이 붙는다
    const r2 = await save(R.r, { work: work('2026-0930-용어2', 'term:CIMON'), vocab: [{ coord: 'term:CIMON', label: '시몬' }] }, opt())
    assert.ok(!r2.warnings.some((w) => /새 어휘 타입/.test(w)))
    assert.equal(await porcelain(R.r), '')
    const loaded = await loadRepo(R.r, {})
    assert.ok(loaded.vocab.coords.has('term:CIMON'))
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

test('save — 검사 실패면 Snap 이 되돌리고 커밋 0 (없는 기록을 정정한다는 supersedes)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const before = await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8')
    await assert.rejects(save(R.r, { work: work('2026-0925-파생누락', 'table:a', { supersedes: '2026-0101-없는기록' }), sections: [{ coord: 'table:a', applied: null, body: 'a 를 고쳤다.' }] }, opt()), (e) => e.code === 'E_CHECK' && e.detail.findings.some((f) => f.kind === 'broken-supersedes'))
    assert.equal(await commits(R.r), n0)
    assert.equal(await porcelain(R.r), '')
    assert.equal(await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8'), before)
    assert.equal(await fs.stat(path.join(R.r, 'work', '2026-0925-파생누락.md')).catch(() => null), null)
  } finally {
    await R.rm()
  }
})

test('save — 레포에 원래 있던 오류(중복 섹션)는 막지 않고 경고 · 이 save 가 만든 오류만 막는다(v1.0 I10)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    // 남이 남긴 중복 섹션 — 이것 때문에 모든 save 가 막히던 것이 실서버 F8 이다
    const t0 = await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8')
    await fs.writeFile(path.join(R.r, 'docs', 't.md'), t0 + ['## e — E 둘째', '<!-- applied: null -->', '', '같은 이름의 둘째.', ''].join(NL))
    await g(R.r, 'commit', '-qam', 'dup')
    const n0 = await commits(R.r)
    const out = await save(R.r, { work: work('2026-0925-무관한기록', 'table:b'), sections: [{ coord: 'table:b', applied: null, body: 'b 를 고쳤다.' }] }, opt())
    assert.equal(await commits(R.r), n0 + 1)
    assert.ok(out.warnings.some((w) => /원래 있던 오류 1건/.test(w) && /같은 좌표의 섹션/.test(w)), out.warnings.join(' / '))
    // 이 save 가 새로 만든 오류(없는 기록을 정정한다는 supersedes)는 여전히 막는다
    await assert.rejects(save(R.r, { work: work('2026-0925-새오류', 'table:c', { supersedes: '2026-0101-없는기록' }) }, opt()), (e) => e.code === 'E_CHECK' && e.detail.findings.every((f) => f.kind !== 'dup-anchor'))
    assert.equal(await commits(R.r), n0 + 1)
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

// 좌표 누락 TODO C · D · F2 — dpms_wiki b5a1fc6 에서 도메인 지식 문서가 `touches: []` 로 경고 없이 커밋됐다.
test('save — 빈 touches 는 touchesEmpty 사유 없이 E_INPUT · 사유가 있으면 커밋 + 경고 + 프론트매터에 남는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    await assert.rejects(save(R.r, { work: work('2026-0929-좌표없음', null) }, opt()), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touches' && /좌표로 찾을 수 없다/.test(e.message))
    await assert.rejects(save(R.r, { work: { ...work('2026-0929-좌표없음', null), touches: undefined } }, opt()), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touches')
    await assert.rejects(save(R.r, { work: work('2026-0929-둘다', 'table:a', { touchesEmpty: '사유' }) }, opt()), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touchesEmpty')
    await assert.rejects(save(R.r, { work: work('2026-0929-빈사유', null, { touchesEmpty: '  ' }) }, opt()), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.touchesEmpty')
    assert.equal(await commits(R.r), n0, '거절은 커밋하지 않는다')
    assert.equal(await porcelain(R.r), '')

    const ok = await save(R.r, { work: work('2026-0929-일정', null, { touchesEmpty: '일정만 정했다 — 바꾼 대상 없음' }) }, opt())
    assert.ok(ok.commit)
    assert.ok(ok.warnings.some((w) => w.startsWith('touches 가 비어 있다 — 이 기록은 좌표로 찾을 수 없다 (사유: 일정만 정했다')), ok.warnings.join(' / '))
    const r1 = await loadRepo(R.r)
    const d = r1.byId.get('2026-0929-일정')
    assert.deepEqual(d.touches, [])
    assert.equal(d.hasTouchesKey, true)
    assert.equal(d.touchesEmpty, '일정만 정했다 — 바꾼 대상 없음')
    assert.deepEqual(d.unknownFields, [])
  } finally {
    await R.rm()
  }
})

// 커밋 훅을 레포에 심는다 — 트리가 깨끗해야 save 가 받으므로 훅 자체는 커밋해 둔다
async function hook(r, dir, script) {
  await fs.mkdir(path.join(r, dir), { recursive: true })
  await fs.writeFile(path.join(r, dir, 'pre-commit'), script)
  await fs.chmod(path.join(r, dir, 'pre-commit'), 0o755)
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'hook')
  await g(r, 'config', 'core.hooksPath', dir)
}
const head = async (r) => (await run('git', ['-C', r, 'rev-parse', 'HEAD'])).stdout.trim()

test('save — 훅이 막으면 E_GIT · 되돌리고 색인도 비운다 · 트리 깨끗 · 다음 save 가 된다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    await hook(R.r, '.hooks-test', '#!/bin/sh\necho 막는다 >&2\nexit 1\n')
    const h0 = await head(R.r)
    // 서버 save 는 훅을 안 돌린다(v1.0 V5) — 커밋 실패 경로를 시험하려고 여기서만 켠다
    await assert.rejects(save(R.r, { work: work('2026-0929-훅막힘', null, { touchesEmpty: '시험' }) }, opt('hong', { commitHooks: true })), (e) => e.code === 'E_GIT' && e.detail.reason === 'commit')
    assert.equal(await head(R.r), h0)
    assert.equal(await fs.stat(path.join(R.r, 'work', '2026-0929-훅막힘.md')).catch(() => null), null)
    assert.equal(await porcelain(R.r), '', '색인에 남으면 다음 save 가 더러운 트리로 막힌다')
    await g(R.r, 'config', '--unset', 'core.hooksPath')
    await save(R.r, { work: work('2026-0929-훅막힘', null, { touchesEmpty: '시험' }) }, opt())
  } finally {
    await R.rm()
  }
})

test('save — 훅이 시간을 넘겨도 「빈 커밋 + 옛 파일」 은 남지 않는다(된 것이면 된 것 · 안 된 것이면 그대로)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    await hook(R.r, '.hooks-slow', '#!/bin/sh\nsleep 3\nexit 0\n')
    const h0 = await head(R.r)
    const id = '2026-0929-느린훅'
    const res = await save(R.r, { work: work(id, null, { touchesEmpty: '시험' }) }, opt('hong', { commitTimeout: 800, commitHooks: true })).then(
      (v) => ({ ok: true, v }),
      (e) => ({ ok: false, e })
    )
    // save 가 index.lock 이 풀릴 때까지 기다리고 판정한다 — 여기서 더 기다릴 것이 없다
    const h1 = await head(R.r)
    const rec = path.join(R.r, 'work', id + '.md')
    if (h1 !== h0) {
      // Windows — 실행기만 죽고 진짜 git 이 커밋을 마쳤다
      const stat = (await run('git', ['-C', R.r, 'show', '--stat', '--format=', 'HEAD'])).stdout.trim()
      assert.ok(stat.length > 0, '빈 커밋이 남았다')
      assert.match(stat, /느린훅\.md/, '커밋에 작업 기록이 없다')
      assert.ok(res.ok, '커밋이 됐으면 된 것으로 답한다: ' + res.e?.message)
      assert.ok(res.v.commit && h1.startsWith(res.v.commit), '응답의 commit 이 HEAD 다')
      assert.ok(res.v.warnings.some((w) => w.includes('늦게 끝났다')), res.v.warnings.join(' / '))
      assert.ok(await fs.stat(rec).catch(() => null), '커밋은 됐는데 파일이 되돌려졌다')
    } else {
      // git 이 정말 멈췄다 — 전부 안 된 것
      assert.equal(res.ok, false)
      assert.equal(res.e.code, 'E_GIT')
      assert.equal(res.e.detail.reason, 'timeout')
      assert.equal(await fs.stat(rec).catch(() => null), null)
    }
    assert.equal(await porcelain(R.r), '')
    // **훅이 끝날 때까지 더 본다.** index.lock 은 훅 동안 풀려 있어 그것만 기다리면, save 가 답한 뒤에 살아남은
    // git 이 커밋을 마쳤다(Windows 의 git 실행기 · 2026-09-29 실측). 답한 뒤에는 아무것도 움직이지 않아야 한다.
    await new Promise((res) => setTimeout(res, 3500))
    assert.equal(await head(R.r), h1, 'save 가 답한 뒤에 커밋이 생겼다')
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

// 미러 큐 · doctor · 개요 · `/repos` 는 뮤텍스 밖에서 `git.status` 를 부른다 — 그것이 index.lock 을 쥐면
// 다음 save 의 add · commit 이 `Unable to create '…/index.lock'` 로 죽었다(2026-09-29 하네스 91 · 가끔).
test('git.status — 색인을 새로 써 두지 않는다(--no-optional-locks) · 값은 같다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const idx = path.join(R.r, '.git', 'index')
    // stat 정보를 낡게 한다 — 보통의 `git status` 는 여기서 색인을 고쳐 쓴다(index.lock 을 쥐고)
    const later = new Date(Date.now() + 5000)
    await fs.utimes(path.join(R.r, 'README.md'), later, later)
    const before = await fs.readFile(idx)
    const st = await status(R.r)
    assert.equal(st.dirty, 0)
    assert.ok((await fs.readFile(idx)).equals(before), 'status 가 색인을 고쳐 썼다 — index.lock 을 쥐었다')
    // 대조 — 옵션 없는 git status 는 고쳐 쓴다(이 시험이 무엇을 보는지)
    await run('git', ['-C', R.r, 'status', '--porcelain'])
    assert.ok(!(await fs.readFile(idx)).equals(before), '보통의 git status 도 색인을 안 썼다 — 시험이 아무것도 안 본다')
  } finally {
    await R.rm()
  }
})

test('save — 동시 5건 동안 뮤텍스 밖에서 status 를 두드려도 전부 커밋 · 트리 깨끗', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    let stop = false
    let polls = 0
    const hammer = (async () => {
      while (!stop) {
        await status(R.r)
        polls++
      }
    })()
    const out = await Promise.all(
      ['a', 'b', 'c', 'd', 'e'].map((v) => save(R.r, { work: work(`2026-0930-두드림-${v}`, `table:${v}`), sections: [{ coord: `table:${v}`, applied: null, body: `${v} 의 새 본문.` }] }, opt()))
    )
    stop = true
    await hammer
    assert.ok(polls > 0)
    assert.equal(out.filter((o) => o.commit).length, 5)
    assert.equal(await commits(R.r), n0 + 5)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('save — 남이 index.lock 을 잠깐 쥐면 풀린 뒤 다시 커밋한다 · 트리 깨끗', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const h0 = await head(R.r)
    const lock = path.join(R.r, '.git', 'index.lock')
    await fs.writeFile(lock, '')
    const t0 = Date.now()
    const release = new Promise((res) => setTimeout(() => fs.rm(lock, { force: true }).then(res), 1200))
    const v = await save(R.r, { work: work('2026-0930-잠금', 'table:a'), sections: [{ coord: 'table:a', applied: null, body: 'a 의 새 본문.' }] }, opt())
    await release
    assert.ok(Date.now() - t0 >= 1000, '잠금이 풀리기 전에 커밋했다 — 시험이 잠금을 못 만났다')
    assert.ok(v.commit)
    assert.notEqual(await head(R.r), h0)
    assert.match((await run('git', ['-C', R.r, '-c', 'core.quotepath=false', 'show', '--stat', '--format=', 'HEAD'])).stdout, /잠금\.md/)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await fs.rm(path.join(R.r, '.git', 'index.lock'), { force: true })
    await R.rm()
  }
})

test('save — work.source: 프론트매터에 남고 · 시각 없는 date 경고를 끈다 · 깨지는 제목은 인용한다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const src = '공유드라이브/2026/PLC: 구조.md'
    const a = await save(R.r, { work: work('2026-0917-편입', null, { title: '[편입] PLC · SCADA: 구조', date: '2026-09-17', source: src, touchesEmpty: '시험' }) }, opt())
    assert.ok(!a.warnings.some((w) => w.startsWith('date 에 시각이 없다')), a.warnings.join(' / '))
    const b = await save(R.r, { work: work('2026-0917-세션', null, { date: '2026-09-17', touchesEmpty: '시험' }) }, opt())
    assert.ok(b.warnings.some((w) => w.startsWith('date 에 시각이 없다')), 'source 가 없으면 그대로 경고한다')
    await assert.rejects(save(R.r, { work: work('2026-0917-빈출처', null, { source: ' ', touchesEmpty: '시험' }) }, opt()), (e) => e.code === 'E_INPUT' && e.detail.field === 'work.source')

    const r1 = await loadRepo(R.r)
    const d = r1.byId.get('2026-0917-편입')
    assert.equal(d.source, src)
    assert.equal(d.title, '[편입] PLC · SCADA: 구조', '제목이 배열로 읽히지 않는다')
    assert.deepEqual(d.errors, [])
    assert.deepEqual(d.unknownFields, [])
    const text = await fs.readFile(path.join(R.r, 'work', '2026-0917-편입.md'), 'utf8')
    assert.match(text, /^author: hong\r?\nsource: "공유드라이브\/2026\/PLC: 구조\.md"$/m)
  } finally {
    await R.rm()
  }
})

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

test('save v1.0 — writer 는 기록만: 파생 없이 커밋 · 섹션 · 예약 태그 · curates 는 E_FORBIDDEN(need curate)', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const writer = { user: 'lee', write: true }
    // 섹션 없이 기록만 — 전에는 파생 누락 E_CHECK 였다
    const out = await save(R.r, { work: work('2026-0925-기록만', 'table:a') }, writer)
    assert.equal(await commits(R.r), n0 + 1)
    assert.equal(out.sections, 0)
    for (const bad of [
      { sections: [{ coord: 'table:b', applied: null, body: 'x' }] },
      { work: work('2026-0925-태그', 'table:b', { tags: ['curate'] }) },
      { work: work('2026-0925-판정', null, { curates: [{ id: '2026-0925-기록만', verdict: 'keep' }] }) },
      { edits: [{ file: 'README.md', old: '시험 레포.', new: '시험.' }] },
    ]) {
      await assert.rejects(save(R.r, { work: work('2026-0925-거절', 'table:b'), ...bad }, writer), (e) => e.code === 'E_FORBIDDEN' && e.detail.need === 'curate')
    }
    assert.equal(await commits(R.r), n0 + 1)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('save v1.0 — 큐레이션 기록: 판정이 프론트매터에 남고 · applied 는 반영한 기록 중 가장 늦은 것 · into 가 sections 에 없으면 E_INPUT', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo()
  try {
    const writer = { user: 'lee', write: true }
    await save(R.r, { work: { ...work('2026-0925-a1', 'table:a'), date: '2026-09-25 09:00' } }, writer)
    await save(R.r, { work: { ...work('2026-0925-a2', 'table:a'), date: '2026-09-25 11:00' } }, writer)
    await save(R.r, { work: { ...work('2026-0925-n1', 'note:회의'), date: '2026-09-25 12:00' } }, writer)
    const cur = (id, curates, sections) => ({ work: { id, title: id, date: '2026-09-26 10:00', touches: [], body: '큐레이션 — 판정표.', curates }, sections })
    // into 가 sections 에 없다
    await assert.rejects(save(R.r, cur('2026-0926-c0', [{ id: '2026-0925-a1', verdict: 'reflect', into: ['table:a'] }], []), opt()), (e) => e.code === 'E_INPUT' && /sections 에 없다/.test(e.message))
    // 없는 기록
    await assert.rejects(save(R.r, cur('2026-0926-c0', [{ id: '2026-0101-없음', verdict: 'keep' }], []), opt()), (e) => e.code === 'E_INPUT' && /작업 기록이 없다/.test(e.message))
    const out = await save(
      R.r,
      cur('2026-0926-c1', [
        { id: '2026-0925-a1', verdict: 'reflect', into: ['table:a'] },
        { id: '2026-0925-a2', verdict: 'reflect', into: ['table:a'] },
        { id: '2026-0925-n1', verdict: 'keep', reason: '회의는 기록이 원천' },
      ], [{ coord: 'table:a', applied: null, body: 'a 의 지금 — 두 기록을 합쳤다.' }]),
      opt()
    )
    assert.equal(out.sections, 1)
    const r = await loadRepo(R.r)
    const sec = r.sections.find((x) => x.coord === 'table:a')
    assert.equal(sec.applied, '2026-0925-a2', 'applied 는 반영한 기록 중 가장 늦은 것')
    const c = r.byId.get('2026-0926-c1')
    assert.deepEqual(c.curates.map((j) => [j.id, j.verdict]), [['2026-0925-a1', 'reflect'], ['2026-0925-a2', 'reflect'], ['2026-0925-n1', 'keep']])
    assert.ok(c.tags.includes('curate'))
    assert.equal(c.touchesEmpty, '큐레이션')
    assert.equal(r.curation.queue.length, 0)
    assert.equal(r.curation.statusOf('2026-0925-n1').state, 'kept')
    assert.equal(r.curation.statusOf('2026-0925-n1').reason, '회의는 기록이 원천')
  } finally {
    await R.rm()
  }
})

test('save v1.0 — 기준선 블록: 기준선 save 는 블록만 갈아 끼우고 · 큐레이터의 글은 블록을 지키고 · section 은 블록을 따로 낸다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const { splitBaseline, joinBaseline } = await import('../core/baseline.js')
  // 순수 — 가르고 붙이기
  const s = splitBaseline('글.\n\n<!-- cdp:baseline src="db" asof="2026-10-02" -->\n| a |\n<!-- /cdp:baseline -->\n\n**경과**\n- x')
  assert.equal(s.block.src, 'db')
  assert.equal(s.block.body, '| a |')
  assert.equal(s.curated, '글.\n\n**경과**\n- x')
  assert.equal(joinBaseline('새 글.\n\n**경과**\n- x', s.block.text), '새 글.\n\n' + s.block.text + '\n\n**경과**\n- x')
  const R = await repo()
  try {
    const gen = (id, body, extra = {}) => ({ work: { id, title: id, date: '2026-09-27 10:00', touches: [], body: '기준선 — 개발 DB 에서 뽑았다.', baseline: { source: '개발 DB pg_catalog', asof: '2026-09-27' } }, baseline: [{ coord: 'table:a', body }, ...(extra.more || [])] })
    // writer 는 못 한다
    await assert.rejects(save(R.r, gen('2026-0927-기준선0', '| x |'), { user: 'lee', write: true }), (e) => e.code === 'E_FORBIDDEN')
    await save(R.r, gen('2026-0927-기준선1', '| 컬럼 | 타입 |\n| id | int |', { more: [{ coord: 'table:e', body: '| e |' }] }), opt())
    let r = await loadRepo(R.r)
    let sec = toolSection(r, { coord: 'table:a' })
    assert.equal(sec.baseline.src, '개발 DB pg_catalog')
    assert.match(sec.baseline.body, /\| id \| int \|/)
    assert.match(sec.content, /a 의 처음 본문/)
    assert.doesNotMatch(sec.content, /cdp:baseline/)
    assert.equal(sec.applied, null, '기준선은 applied 를 바꾸지 않는다')
    // 기준선 기록은 대기열에 서지 않는다
    assert.equal(r.curation.statusOf('2026-0927-기준선1').state, 'system')
    // 큐레이터가 글을 고쳐도 블록은 그대로
    await save(R.r, { work: work('2026-0927-글', 'table:a'), sections: [{ coord: 'table:a', applied: null, body: 'a 를 큐레이터가 다시 썼다.' }] }, opt())
    r = await loadRepo(R.r)
    sec = toolSection(r, { coord: 'table:a' })
    assert.equal(sec.content, 'a 를 큐레이터가 다시 썼다.')
    assert.match(sec.baseline.body, /\| id \| int \|/)
    // 블록 표지를 글에 넣으면 거절
    await assert.rejects(save(R.r, { work: work('2026-0927-표지', 'table:a'), sections: [{ coord: 'table:a', applied: sec.applied, body: '<!-- cdp:baseline -->\nx\n<!-- /cdp:baseline -->' }] }, opt()), (e) => e.code === 'E_INPUT' && /블록/.test(e.message))
    // 다시 뽑으면 블록만 바뀐다 — 글 · applied 그대로
    await save(R.r, gen('2026-0928-기준선2', '| 컬럼 | 타입 |\n| id | bigint |'), opt())
    r = await loadRepo(R.r)
    const sec2 = toolSection(r, { coord: 'table:a' })
    assert.equal(sec2.content, 'a 를 큐레이터가 다시 썼다.')
    assert.equal(sec2.applied, sec.applied)
    assert.match(sec2.baseline.body, /bigint/)
    assert.equal((await fs.readFile(path.join(R.r, 'docs', 't.md'), 'utf8')).match(/cdp:baseline/g).length, 4, '블록은 섹션마다 하나(a · e — 열고 닫는 표지 둘씩)')
  } finally {
    await R.rm()
  }
})
