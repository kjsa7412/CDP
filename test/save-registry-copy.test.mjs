// 등록부 사본 · 모순 — dpms_wiki `75a3c90` 사례를 dpms 패키지로 그대로 다시 돌린다(수용 기준 1~5).
// 등록부 사본 검토 v0.1 · TODO ⑨. 쓰기 권한만 있고 admin 이 아닌 계정(writer)으로 `save` 를 **직접** 부른다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { toolCheck, toolDocs, toolMatch } from '../core/tools.js'
import { regenerate, proseConflicts } from '../core/regen.js'
import { planPurge } from '../core/examples.js'
import { purgeTree } from '../core/examplestree.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const skip = !hasGit && 'git 이 없다'
const PKG = path.resolve('agent/packages/dpms')
const BM = 'docs/1.관리/BM_411_회의록.md'
const writer = { user: 'hong', write: true }

// 옛 패키지 문구 — dpms_wiki 가 들고 있는 것(이 판 전의 패키지)
const OLD_RULE4 = '| 4 | 애초에 **`회의록:` · `보고서:` · `형상관리:` 라는 타입이 없다.** 위 표의 13개가 전부다 |'
const OLD_HEAD = '## 등록부 대상이 아닌 관리 문서 — 32종'

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (e.name === '_package.json') continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) await copyDir(s, d)
    else await fs.copyFile(s, d)
  }
}

// old: 이 판 전의 문구로 되돌린다(생성 블록 없음 · 규칙 4 · 32종)
async function repo({ old = false } = {}) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-regcopy-'))
  const r = path.join(d, 'dpms_wiki')
  await copyDir(PKG, r)
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  if (old) {
    let v = await fs.readFile(path.join(r, '_vocab.md'), 'utf8')
    v = v.replace(/\| 4 \| \*\*등록부에 행이 없는 타입은[^\n]*\n/, OLD_RULE4 + '\n')
    v = v.replace(/### 지금 등록부[\s\S]*?<!-- \/cdp:registry -->\n/, '')
    await fs.writeFile(path.join(r, '_vocab.md'), v)
    let m = await fs.readFile(path.join(r, '_managed.md'), 'utf8')
    m = m.replace('## 등록부 대상이 아닌 관리 문서\n', OLD_HEAD + '\n')
    await fs.writeFile(path.join(r, '_managed.md'), m)
  }
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { d, r, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, extra = {}) => ({ id, title: id, date: '2026-09-30 10:00', touches: [], touchesEmpty: '등록부 · 문구 정리 — 바꾼 좌표가 없다', body: `${id} — 왜 그렇게 했나.`, ...extra })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const read = (r, rel) => fs.readFile(path.join(r, rel), 'utf8')
const changed = async (r) => (await run('git', ['-C', r, '-c', 'core.quotepath=off', 'show', '--name-only', '--format=', 'HEAD'])).stdout.trim().split('\n')

async function refused(R, fn, code, re) {
  const c0 = await commits(R.r)
  let err
  await assert.rejects(fn, (e) => {
    assert.equal(e.code, code, e.message)
    if (re) assert.match(e.message + JSON.stringify(e.detail), re)
    err = e
    return true
  })
  assert.equal(await commits(R.r), c0, '커밋이 늘었다')
  assert.equal(await porcelain(R.r), '', '트리가 더럽다')
  return err
}

test('R2 — 옛 문구가 남은 레포에 managed add 회의록:* → E_INPUT · 고칠 파일 · 행 셋(BM_411:3 · _vocab.md 규칙 4 · _managed.md 32종) · 트리 그대로', { skip }, async () => {
  const R = await repo({ old: true })
  try {
    const e = await refused(R, () => save(R.r, { work: work('2026-0930-회의록-등록부'), managed: [{ pattern: '회의록:*', doc: BM }] }, writer), 'E_INPUT', /어긋나는 문구 3줄/)
    const lines = e.detail.lines.map((x) => x.file + ':' + x.line)
    assert.ok(lines.includes(BM + ':3'), lines.join(' '))
    assert.ok(lines.some((l) => l.startsWith('_vocab.md:')), lines.join(' '))
    assert.ok(lines.some((l) => l.startsWith('_managed.md:')), lines.join(' '))
  } finally {
    await R.rm()
  }
})

test('R1 · R4 — 같은 save 의 edits 로 문구를 고치고 생성 블록 표식을 넣으면 한 커밋 — BM_411 머리 표 · _vocab 블록이 등록부를 따른다', { skip }, async () => {
  const R = await repo({ old: true })
  try {
    const c0 = await commits(R.r)
    const bm = await read(R.r, BM)
    const line3 = bm.split('\n')[2]
    const out = await save(
      R.r,
      {
        work: work('2026-0930-회의록-등록부'),
        managed: [{ pattern: '회의록:*', doc: BM }],
        edits: [
          { file: BM, old: line3, new: '날짜축. 회의 하나가 섹션 하나다 — `회의록:<날짜>` 로 등록부에 있다.' },
          { file: '_vocab.md', old: OLD_RULE4, new: '| 4 | **등록부에 행이 없는 타입은 파생되지 않는다.** 파생되는 타입은 아래 「지금 등록부」 가 전부다 |\n\n<!-- cdp:registry -->\n<!-- /cdp:registry -->' },
          { file: '_managed.md', old: OLD_HEAD, new: '## 등록부 대상이 아닌 관리 문서' },
        ],
      },
      writer
    )
    assert.equal(await commits(R.r), c0 + 1)
    assert.equal(await porcelain(R.r), '')
    assert.equal(out.edits.length, 3)
    const head = (await read(R.r, BM)).split('\n').find((l) => l.startsWith('| 등록부 |'))
    assert.equal(head, '| 등록부 | `회의록:*` → `## {값}` |')
    const v = await read(R.r, '_vocab.md')
    assert.match(v, /\| `회의록` \| `회의록:\*` \| `docs\/1\.관리\/BM_411_회의록\.md` \| `## \{값\}` \|/)
    const files = await changed(R.r)
    for (const f of [BM, '_vocab.md', '_managed.md']) assert.ok(files.includes(f), `${f} 가 그 커밋에 없다: ${files.join(' ')}`)
    assert.ok(out.warnings.some((w) => /등록부 사본을 등록부에 맞췄다/.test(w)), out.warnings.join('\n'))
    const c = toolCheck(await loadRepo(R.r))
    assert.ok(!c.findings.some((f) => f.kind === 'registry-head' || f.kind === 'registry-prose'), JSON.stringify(c.findings.map((f) => f.kind)))
  } finally {
    await R.rm()
  }
})

test('R1 — 새 패키지(생성 블록 있음)는 add 한 번에 머리 표 · 블록이 같이 바뀐다 · 남는 산문은 BM_411:3 하나 → reviewed 로 통과(경고에 남는다)', { skip }, async () => {
  const R = await repo()
  try {
    const e = await refused(R, () => save(R.r, { work: work('2026-0930-회의록-등록부'), managed: [{ pattern: '회의록:*', doc: BM }] }, writer), 'E_INPUT')
    assert.deepEqual(e.detail.lines.map((x) => x.file + ':' + x.line), [BM + ':3'])
    const out = await save(R.r, { work: work('2026-0930-회의록-등록부'), managed: [{ pattern: '회의록:*', doc: BM, reviewed: [BM + ':3'] }] }, writer)
    assert.ok(out.warnings.some((w) => /reviewed/.test(w) && w.includes(BM + ':3')))
    assert.match(await read(R.r, BM), /\| 등록부 \| `회의록:\*` → `## \{값\}` \|/)
    assert.match(await read(R.r, '_vocab.md'), /`회의록:\*`/)
  } finally {
    await R.rm()
  }
})

test('R3 — writer 가 examples: "purge" 한 번에 예시 18건 · 짝 섹션을 지운다 · 한 커밋 · 그 뒤 example-coord 0', { skip }, async () => {
  const R = await repo()
  try {
    const c0 = await commits(R.r)
    const before = toolCheck(await loadRepo(R.r)).findings.find((f) => f.kind === 'example-coord')
    assert.equal(before.items.length, 18)
    assert.match(before.fix, /examples: "purge"/)
    const out = await save(R.r, { work: work('2026-0930-서식예시-정리', { touchesEmpty: '서식 예시 정리' }), examples: 'purge' }, writer)
    assert.equal(await commits(R.r), c0 + 1)
    assert.equal(await porcelain(R.r), '')
    assert.equal(out.examples.coords.length, 18)
    assert.ok(out.examples.sections.some((s) => s.path === BM && /\(예시\) 착수 미팅/.test(s.heading)))
    assert.ok(out.examples.left.some((l) => /DE_101/.test(l.file)), '표시 없는 예시 행(시스템아키텍처 hw)이 목록에 없다')
    const r = await loadRepo(R.r)
    const after = toolCheck(r)
    assert.ok(!after.findings.some((f) => f.kind === 'example-coord'))
    assert.equal(after.ok, true, JSON.stringify(after.findings.filter((f) => f.sev === 'error')))
    assert.ok(!(await read(R.r, 'docs/2.개발/DE_431_테이블정의서.md')).includes('ex_plan_mst'))
  } finally {
    await R.rm()
  }
})

test('R3 — 작업 기록이 쓰는 예시 좌표는 지우지 않고 example 표시만 뗀다(kept)', { skip }, async () => {
  const R = await repo()
  try {
    await save(R.r, { work: { ...work('2026-0930-계획서'), touches: ['테이블정의서:ex_plan_mst'], touchesEmpty: undefined }, sections: [{ coord: '테이블정의서:ex_plan_mst', applied: null, body: '계획서 마스터 — 실제로 쓴다.' }] }, writer)
    const out = await save(R.r, { work: work('2026-0930-서식예시-정리'), examples: 'purge' }, writer)
    assert.deepEqual(out.examples.kept.map((k) => k.coord), ['테이블정의서:ex_plan_mst'])
    const r = await loadRepo(R.r)
    assert.ok(r.vocab.coords.has('테이블정의서:ex_plan_mst'))
    assert.equal(r.vocab.coords.get('테이블정의서:ex_plan_mst').example, false)
    assert.equal(toolCheck(r).ok, true)
  } finally {
    await R.rm()
  }
})

test('R4 — edits 로 BM_411 머리말을 고친다 · 작업 기록이 남는다 / 못 쓰는 자리 · 없는 old · 두 번 나오는 old 는 거절 · 트리 그대로', { skip }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: work('2026-0930-회의록-머리말'), edits: [{ file: BM, old: '**누가** — 주관자 또는 지명된 기록자.', new: '**누가** — 주관자. 기록자는 회의 시작에 정한다.' }] }, writer)
    assert.match(await read(R.r, BM), /기록자는 회의 시작에 정한다/)
    assert.ok(await read(R.r, 'work/2026-0930-회의록-머리말.md'))
    assert.deepEqual(out.edits, [{ file: BM, line: 15 }])

    const T = 'docs/2.개발/DE_431_테이블정의서.md'
    const t = await read(R.r, T)
    const inSection = t.split('\n').find((l) => l.startsWith('## ex_plan_mst'))
    await refused(R, () => save(R.r, { work: work('2026-0930-a'), edits: [{ file: T, old: inSection, new: 'x' }] }, writer), 'E_INPUT', /좌표 섹션\(테이블정의서:ex_plan_mst\)/)
    await refused(R, () => save(R.r, { work: work('2026-0930-b'), edits: [{ file: '_vocab.md', old: '- `이슈:EX-RIS-01` — (예시) 외부 연계 계정 발급 지연', new: 'x' }] }, writer), 'E_INPUT', /어휘 줄/)
    await refused(R, () => save(R.r, { work: work('2026-0930-c'), edits: [{ file: '_managed.md', old: '| `이슈:*` | `docs/1.관리/BM_501_위험및이슈관리대장.md` | `## {값}` |', new: '' }] }, writer), 'E_INPUT', /등록부 규칙 행/)
    await refused(R, () => save(R.r, { work: work('2026-0930-d'), edits: [{ file: BM, old: '없는 글', new: 'x' }] }, writer), 'E_CONFLICT', /docs\(\{ doc/)
    await refused(R, () => save(R.r, { work: work('2026-0930-e'), edits: [{ file: BM, old: '| 필수', new: 'x' }] }, writer), 'E_INPUT', /번 나온다/)
    await refused(R, () => save(R.r, { work: work('2026-0930-f'), edits: [{ file: 'work/2026-0930-회의록-머리말.md', old: '왜', new: 'x' }] }, writer), 'E_INPUT', /작업 기록은 고치지 않는다/)
    await refused(R, () => save(R.r, { work: work('2026-0930-g'), edits: [{ file: BM, old: '**누가** — 주관자.', new: '<!-- applied: x -->' }] }, writer), 'E_INPUT', /applied/)
    await refused(R, () => save(R.r, { work: work('2026-0930-h'), edits: [{ file: T, old: '테이블의 지금 상태. 섹션 하나가 테이블 하나다.', new: '## 새것' }] }, writer), 'E_INPUT', /앵커 레벨/)
    // 비대상 문서는 섹션을 지울 수 있다
    const sec = (await read(R.r, BM)).match(/## 2026-01-05 — \(예시\) 착수 미팅[\s\S]*?(?=\n## 작성지침)/)[0]
    await save(R.r, { work: work('2026-0930-회의록-예시'), edits: [{ file: BM, old: sec, new: '' }] }, writer)
    assert.ok(!(await read(R.r, BM)).includes('착수 미팅'))
  } finally {
    await R.rm()
  }
})

test('R2 — 손으로 넣은 어긋난 머리 표는 check 오류(registry-head · fix) · regenerate 가 맞춘다', { skip }, async () => {
  const R = await repo()
  try {
    const T = path.join(R.r, 'docs/2.개발/DE_431_테이블정의서.md')
    await fs.writeFile(T, (await fs.readFile(T, 'utf8')).replace('| 등록부 | `테이블정의서:*` → `## {값}` |', '| 등록부 | **비대상** — 손으로 |'))
    const r = await loadRepo(R.r)
    const c = toolCheck(r)
    const f = c.findings.find((x) => x.kind === 'registry-head')
    assert.equal(c.ok, false)
    assert.equal(f.sev, 'error')
    assert.match(f.items[0].detail, /DE_431/)
    assert.match(f.fix, /ctx index/)
    const docs = new Map(r.managedDocs.map((d) => [d.path, r.bodies.get(d.path)]))
    const gen = regenerate({ registry: r.registry, vocab: r.vocab, docs, vocabText: r.vocabText })
    assert.equal(gen.heads.length, 1)
    assert.match(gen.files.get('docs/2.개발/DE_431_테이블정의서.md'), /\| 등록부 \| `테이블정의서:\*` → `## \{값\}` \|/)
  } finally {
    await R.rm()
  }
})

test('R5 — docs 한 번에 관리 문서 40 · 등록부 여부 / match(["회의록"]) 이 BM_411 을 준다(좌표는 여전히 미등재)', { skip }, async () => {
  const R = await repo()
  try {
    const r = await loadRepo(R.r)
    const d = toolDocs(r)
    assert.equal(d.total, 40)
    assert.equal(d.registered, 14)
    const bm = d.docs.find((x) => x.no === 'BM_411')
    assert.equal(bm.registered, false)
    const [m] = toolMatch(r, { names: ['회의록'] })
    assert.equal(m.kind, '미등재')
    assert.equal(m.docs[0].no, 'BM_411')
    assert.equal(toolMatch(r, { names: ['BM_411'] })[0].docs[0].path, BM)
    const one = toolDocs(r, { doc: 'BM_411' })
    assert.equal(one.path, BM)
    assert.match(one.text, /회의록/)
    assert.ok(one.headings.some((h) => h.value === '작성지침' && h.coord === null))
    const t = toolDocs(r, { doc: 'docs/2.개발/DE_431_테이블정의서.md' })
    assert.equal(t.headings.find((h) => h.value === 'ex_plan_mst').coord, '테이블정의서:ex_plan_mst')
    assert.match(toolDocs(r, { doc: '_vocab.md' }).text, /cdp:registry/)
  } finally {
    await R.rm()
  }
})

test('산문 어림 — 새 패키지 그대로면 check 의 registry-prose · registry-head 는 0 · 「`시스템아키텍처:` 넷만 예시가 아니다」 는 안 걸린다', async () => {
  const r = await loadRepo(PKG)
  const c = toolCheck(r)
  assert.ok(!c.findings.some((f) => f.kind === 'registry-prose' || f.kind === 'registry-head'), JSON.stringify(c.findings.filter((f) => /registry/.test(f.kind))))
  const hits = proseConflicts({ adds: [{ type: '시스템아키텍처', doc: 'docs/2.개발/DE_101_시스템아키텍처정의서.md' }], texts: (rel) => (rel === '_vocab.md' ? r.vocabText : rel === '_managed.md' ? r.managedText : r.bodies.get(rel) ?? null), counts: false })
  assert.deepEqual(hits, [])
})

test('세울 때 예시 빼기 — purgeTree 가 planPurge 와 같은 것을 지운다', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-purgetree-'))
  try {
    await copyDir(PKG, d)
    const r0 = await loadRepo(d)
    const plan = planPurge({ vocabText: r0.vocabText, registry: r0.registry, docs: new Map(r0.managedDocs.map((x) => [x.path, r0.bodies.get(x.path)])) })
    const got = await purgeTree(d)
    assert.equal(got.coords, plan.coords.length)
    assert.equal(got.sections, plan.sections.length)
    const r1 = await loadRepo(d)
    assert.equal([...r1.vocab.coords.values()].filter((e) => e.example).length, 0)
    assert.equal(toolCheck(r1).ok, true)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
