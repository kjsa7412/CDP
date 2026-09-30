// 첨부 — 올리기(`core/assets.js`)와 save 의 `assets[]`. 그림 · 첨부 검토 v0.1 A1~A7 · TODO ② ③.
// 임시 git 레포를 세우고 `save` 를 **직접** 부른다(서버 라우트는 하네스 112). 경로 풀이(`core/repopath.js`)도 여기서.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { sniff, stage, take, sweep, checkAssetName, STAGING_TTL_MS, ASSET_MAX } from '../core/assets.js'
import { repoPath, mdRefs } from '../core/repopath.js'
import { parseDoc } from '../core/frontmatter.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const skip = !hasGit && 'git 이 없다'

// 가장 작은 진짜 PNG(1×1) · PDF 머리 · SVG
const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
const PNG2 = Buffer.concat([PNG, Buffer.from('00', 'hex')]) // 다른 내용 · 같은 종류
const PDF = Buffer.from('%PDF-1.4\n%\xe2\xe3\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n', 'latin1')
const SVG = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>')

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', ''].join(NL)
const T = ['# 테이블정의서', '', '## a — A', '<!-- applied: null -->', '', 'a 의 처음 본문.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-saveas-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n*.png binary\n*.pdf binary\n')
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  const staging = path.join(d, 'staging')
  return { d, r, staging, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, extra = {}) => ({ id, title: id, date: '2026-09-30 10:00', touches: ['table:a'], body: `${id} 의 본문.`, ...extra })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const exists = (p) => fs.access(p).then(() => true).catch(() => false)

// ── 경로 풀이 ────────────────────────────────────────────────────────────────

test('repoPath — 문서 폴더 기준 · 루트 · docs/ work/ · 퍼센트 인코딩 · 꺾쇠 · 레포 밖 · 레포와 무관한 것', () => {
  const D = 'docs/시스템아키텍처정의서.md'
  assert.deepEqual(repoPath(D, '../work/assets/x/%EC%8B%9C%EC%8A%A4%ED%85%9C%20%EA%B0%9C%EC%9A%94.png'), { path: 'work/assets/x/시스템 개요.png', outside: false })
  assert.deepEqual(repoPath(D, '<../work/assets/x/시스템 개요.png>'), { path: 'work/assets/x/시스템 개요.png', outside: false })
  assert.deepEqual(repoPath(D, '/work/a.png'), { path: 'work/a.png', outside: false })
  assert.deepEqual(repoPath(D, 'work/a.png'), { path: 'work/a.png', outside: false })
  assert.deepEqual(repoPath(D, './docs/img/a.png'), { path: 'docs/img/a.png', outside: false })
  assert.deepEqual(repoPath(D, 'img/a.png'), { path: 'docs/img/a.png', outside: false })
  assert.deepEqual(repoPath('docs/sub/a.md', '../img/a.png#x'), { path: 'docs/img/a.png', outside: false })
  assert.deepEqual(repoPath('work/2026-0930-x.md', 'assets/2026-0930-x/a.png'), { path: 'work/assets/2026-0930-x/a.png', outside: false })
  assert.equal(repoPath(D, '../../a.png').outside, true)
  assert.equal(repoPath(D, 'C:/Users/me/a.png').outside, true)
  for (const x of ['https://x/a.png', 'data:image/png;base64,AA', '#절', 'mailto:a@b', '//cdn/x.png', '']) assert.equal(repoPath(D, x), null, x)
})

test('mdRefs — 그림 · 링크 · 제목 달린 것 · 꺾쇠 — 코드 블록 · 인라인 코드 안은 뺀다', () => {
  const t = ['![가](a.png) [나](b.pdf "제목") ![다](<c d.png>)', '', '`![예](x.png)`', '', '```', '![예](y.png)', '```', ''].join(NL)
  assert.deepEqual(mdRefs(t), [
    { href: 'a.png', image: true },
    { href: 'b.pdf', image: false },
    { href: '<c d.png>', image: true },
  ])
})

// ── 올리기 ──────────────────────────────────────────────────────────────────

test('sniff · stage · take · sweep — 바이트로 가린다 · 같은 파일은 한 벌 · 만료 · svg 거절', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-stage-'))
  try {
    assert.equal(sniff(PNG).type, 'image/png')
    assert.equal(sniff(PDF).type, 'application/pdf')
    assert.equal(sniff(SVG), null)
    assert.equal(sniff(Buffer.from('GIF89a......')).type, 'image/gif')
    assert.equal(sniff(Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0])).type, 'image/jpeg')

    const a = await stage(d, PNG, { now: 1000 })
    assert.match(a.ref, /^sha256:[0-9a-f]{64}$/)
    assert.equal(a.size, PNG.length)
    const b = await stage(d, PNG, { now: 2000 })
    assert.equal(b.ref, a.ref)
    assert.equal((await fs.readdir(d)).length, 2, '한 벌 + 메타')

    assert.deepEqual((await take(d, a.ref, { now: 3000 })).buf, PNG)
    await assert.rejects(stage(d, SVG), (e) => e.code === 'E_INPUT' && /종류/.test(e.message))
    await assert.rejects(stage(d, Buffer.alloc(0)), (e) => e.code === 'E_INPUT')
    await assert.rejects(stage(d, Buffer.alloc(ASSET_MAX + 1, 0x89)), (e) => e.code === 'E_INPUT' && /MB/.test(e.message))
    await assert.rejects(take(d, 'sha256:' + '0'.repeat(64)), (e) => e.code === 'E_INPUT' && /없다/.test(e.message))
    await assert.rejects(take(d, '../../etc/passwd'), (e) => e.code === 'E_INPUT')
    // 만료 — take 는 거절하고 sweep 이 지운다
    await assert.rejects(take(d, a.ref, { now: 2000 + STAGING_TTL_MS + 1 }), (e) => /시간이 지났/.test(e.message))
    assert.equal(await sweep(d, { now: 2000 + STAGING_TTL_MS + 1 }), 1)
    assert.deepEqual(await fs.readdir(d), [])
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('checkAssetName — 한글 · 공백은 되고 경로 구분자 · .. · 모르는 확장자는 안 된다', () => {
  assert.equal(checkAssetName('시스템 개요.png'), '.png')
  assert.equal(checkAssetName('사양.PDF'), '.pdf')
  for (const n of ['a/b.png', '..\\a.png', '../a.png', '.png', 'a.svg', 'a.exe', ' a.png', 'a:b.png', '', 'x'.repeat(130) + '.png']) {
    assert.throws(() => checkAssetName(n), (e) => e.code === 'E_INPUT', n)
  }
})

// ── save ─────────────────────────────────────────────────────────────────────

test('save assets — 그림 · 작업 기록 · 섹션이 한 커밋 · work/assets/<id>/<이름> · attachments · 응답 assets · 경고 없음', { skip }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const up = await stage(R.staging, PNG)
    const id = '2026-0930-사업개요'
    const out = await save(
      R.r,
      {
        work: work(id, { body: `시스템 개요 그림을 넣었다.${NL}${NL}![시스템 개요](<assets/${id}/시스템 개요.png>)` }),
        sections: [{ coord: 'table:a', applied: null, body: `a 의 본문.${NL}${NL}![시스템 개요](../work/assets/${id}/%EC%8B%9C%EC%8A%A4%ED%85%9C%20%EA%B0%9C%EC%9A%94.png)` }],
        assets: [{ ref: up.ref, name: '시스템 개요.png' }],
      },
      { user: 'hong', write: true, staging: R.staging }
    )
    assert.ok(out.commit)
    assert.deepEqual(out.assets, [{ path: `work/assets/${id}/시스템 개요.png`, size: PNG.length }])
    assert.deepEqual(out.warnings.filter((w) => /그림|첨부/.test(w)), [])
    assert.equal(await commits(R.r), n0 + 1, '커밋 하나')
    assert.equal(await porcelain(R.r), '')
    assert.deepEqual(await fs.readFile(path.join(R.r, 'work', 'assets', id, '시스템 개요.png')), PNG)
    const files = (await run('git', ['-C', R.r, '-c', 'core.quotepath=false', 'show', '--name-only', '--format=', 'HEAD'])).stdout.trim().split(NL)
    assert.ok(files.includes(`work/assets/${id}/시스템 개요.png`), files.join(' · '))
    assert.ok(files.includes(`work/${id}.md`) && files.includes('docs/t.md'))
    const fm = parseDoc(`work/${id}.md`, await fs.readFile(path.join(R.r, 'work', id + '.md'), 'utf8'))
    assert.deepEqual(fm.attachments, [`assets/${id}/시스템 개요.png`])
  } finally {
    await R.rm()
  }
})

test('save assets — 검사에서 걸리면 첨부도 되돌린다(파생 누락)', { skip }, async () => {
  const R = await repo()
  try {
    const n0 = await commits(R.r)
    const up = await stage(R.staging, PNG)
    await assert.rejects(
      save(R.r, { work: work('2026-0930-누락'), assets: [{ ref: up.ref, name: 'a.png' }] }, { user: 'hong', write: true, staging: R.staging }),
      (e) => e.code === 'E_CHECK'
    )
    assert.equal(await commits(R.r), n0)
    assert.equal(await porcelain(R.r), '')
    assert.equal(await exists(path.join(R.r, 'work', 'assets')), false, '빈 폴더까지 치운다')
  } finally {
    await R.rm()
  }
})

test('save assets — 확장자 ↔ 종류 · 모르는 ref · 이름 겹침 · staging 없는 서버는 파일을 만지기 전에 거절', { skip }, async () => {
  const R = await repo()
  try {
    const png = await stage(R.staging, PNG)
    const pdf = await stage(R.staging, PDF)
    const n0 = await commits(R.r)
    const sec = [{ coord: 'table:a', applied: null, body: 'a.' }]
    const cases = [
      [{ assets: [{ ref: pdf.ref, name: '사양.png' }] }, /종류/],
      [{ assets: [{ ref: 'sha256:' + 'a'.repeat(64), name: 'a.png' }] }, /없다/],
      [{ assets: [{ ref: png.ref, name: 'A.png' }, { ref: png.ref, name: 'a.PNG' }] }, /겹친다/],
      [{ assets: [{ ref: png.ref, name: '../a.png' }] }, /구분자/],
    ]
    for (const [extra, re] of cases) {
      await assert.rejects(save(R.r, { work: work('2026-0930-거절'), sections: sec, ...extra }, { user: 'hong', write: true, staging: R.staging }), (e) => e.code === 'E_INPUT' && re.test(e.message))
    }
    await assert.rejects(save(R.r, { work: work('2026-0930-거절'), sections: sec, assets: [{ ref: png.ref, name: 'a.png' }] }, { user: 'hong', write: true }), (e) => /첨부를 받지 않는다/.test(e.message))
    assert.equal(await commits(R.r), n0)
    assert.equal(await porcelain(R.r), '')
    // 같은 파일을 이름 둘로는 된다 — 내용이 같아도 자리가 다르다
    const ok = await save(R.r, { work: work('2026-0930-두이름', { body: '![a](assets/2026-0930-두이름/a.png) ![b](assets/2026-0930-두이름/b.png)' }), sections: sec, assets: [{ ref: png.ref, name: 'a.png' }, { ref: png.ref, name: 'b.png' }] }, { user: 'hong', write: true, staging: R.staging })
    assert.equal(ok.assets.length, 2)
  } finally {
    await R.rm()
  }
})

test('save 경고 — 본문이 가리키는 그림이 없다 · 올린 첨부를 아무도 안 가리킨다 · 기존 그림은 조용하다', { skip }, async () => {
  const R = await repo()
  try {
    await fs.mkdir(path.join(R.r, 'docs', 'img'), { recursive: true })
    await fs.writeFile(path.join(R.r, 'docs', 'img', '있음.png'), PNG2)
    await g(R.r, 'add', '-A')
    await g(R.r, 'commit', '-qm', 'img')
    const up = await stage(R.staging, PNG)
    const out = await save(
      R.r,
      {
        work: work('2026-0930-경고', { body: '![없음](assets/2026-0930-경고/없음.png)' }),
        sections: [{ coord: 'table:a', applied: null, body: '![있음](img/있음.png) ![밖](../../밖.png) [링크는 그림이 아니다](nope.pdf)' }],
        assets: [{ ref: up.ref, name: '외톨이.png' }],
      },
      { user: 'hong', write: true, staging: R.staging }
    )
    assert.ok(out.commit)
    const miss = out.warnings.find((w) => /가리키는 그림 2개가 레포에 없다/.test(w))
    assert.ok(miss, out.warnings.join(' / '))
    assert.match(miss, /work\/assets\/2026-0930-경고\/없음\.png \(work\/2026-0930-경고\.md\)/)
    assert.match(miss, /레포 밖 · docs\/t\.md/)
    assert.ok(!/있음\.png/.test(miss))
    const lone = out.warnings.find((w) => /올린 첨부 1개를 어느 본문도 가리키지 않는다/.test(w))
    assert.ok(lone && /외톨이\.png/.test(lone) && /\.\.\/work\/assets\//.test(lone), out.warnings.join(' / '))
  } finally {
    await R.rm()
  }
})
