// 한글 id 의 유니코드 정규화 — 읽는 경계에서 NFC 로 맞춘다(I13).
//
// macOS 에서 git clone 한 지식 레포는 한글 파일명이 NFC 로 나오는데 프론트매터 `id:` 는 NFD 로 적혀 있었다 — 눈에는
// 같은 id 가 바이트로 달라 `ctx check` 가 「id 와 파일명 불일치」 4건을 냈다(원래 작업 트리에서는 0건).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { parseDoc } from '../core/frontmatter.js'
import { loadRepo } from '../core/repo.js'
import { runBuiltinCheck } from '../core/check.js'
import { save } from '../core/save.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])

const ID = '2026-0524-프로덕트-지-프롬프트'
const NFC = ID.normalize('NFC')
const NFD = ID.normalize('NFD')
const OTHER = '2026-0525-지역확장-정정'

const record = (id, extra = '') => `---\nid: ${id}\ntitle: 시험\ndate: 2026-05-24\nauthor: kjsa\ntouches: []\ntouchesEmpty: 시험\n${extra}---\n\n# 시험\n\n본문.\n`

test('전제 — NFC 와 NFD 는 바이트로 다르다', () => {
  assert.notEqual(NFC, NFD)
  assert.ok(Buffer.byteLength(NFD) > Buffer.byteLength(NFC))
})

test('parseDoc — 파일명 · id 가 어느 모양이든 NFC 로 읽는다', () => {
  for (const [file, id] of [[NFD, NFC], [NFC, NFD], [NFD, NFD]]) {
    const d = parseDoc(`work/${file}.md`, record(id, `supersedes: ${OTHER.normalize('NFD')}\n`))
    assert.equal(d.id, NFC)
    assert.equal(d.fileId, NFC)
    assert.equal(d.path, `work/${file}.md`, 'path 는 디스크를 여는 열쇠라 그대로 둔다')
    assert.equal(d.supersedes[0].id, OTHER.normalize('NFC'))
  }
})

async function repo(files) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-nfc-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), '# 어휘\n')
  await fs.writeFile(path.join(r, 'README.md'), '# alpha\n')
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  for (const [rel, text] of Object.entries(files)) await fs.writeFile(path.join(r, rel), text)
  return { r, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

for (const [label, file, id] of [
  ['파일명 NFD · id NFC', NFD, NFC],
  ['파일명 NFC · id NFD', NFC, NFD],
]) {
  test(`check — ${label} 는 「id 와 파일명 불일치」 가 아니다`, async () => {
    const R = await repo({ [`work/${file}.md`]: record(id) })
    try {
      const r = await loadRepo(R.r)
      assert.equal(r.works.length, 1)
      const res = runBuiltinCheck({ ...r })
      const mismatch = res.findings.find((f) => f.kind === 'id-mismatch')
      assert.ok(!mismatch || !mismatch.items.length, JSON.stringify(mismatch))
      assert.ok(r.byId.has(NFC), 'byId 는 NFC 로 찾는다')
    } finally {
      await R.rm()
    }
  })
}

test('check — 정규화로 같아지지 않는 진짜 불일치는 그대로 오류다', async () => {
  const R = await repo({ [`work/${NFD}.md`]: record('2026-0524-다른-이름') })
  try {
    const r = await loadRepo(R.r)
    const mismatch = runBuiltinCheck({ ...r }).findings.find((f) => f.kind === 'id-mismatch')
    assert.equal(mismatch?.items.length, 1)
  } finally {
    await R.rm()
  }
})

test('save — NFD 파일명으로 이미 있는 기록을 NFC id 로 또 쓰면 E_EXISTS', { skip: !hasGit && 'git 이 없다' }, async () => {
  const R = await repo({ [`work/${NFD}.md`]: record(NFD) })
  try {
    await g(R.r, 'init', '-q')
    await g(R.r, 'add', '-A')
    await g(R.r, 'commit', '-qm', 'seed')
    await assert.rejects(
      save(R.r, { work: { id: NFC, title: '다시', date: '2026-05-24 10:00', touches: [], touchesEmpty: '시험', body: '같은 id 를 또 쓴다.' } }, { user: 'kjsa', write: true }),
      (e) => e.code === 'E_EXISTS'
    )
  } finally {
    await R.rm()
  }
})
