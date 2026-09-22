// 패키지 — `core/packages.js`. 검토 §3.4 · 제품화 TODO 4단계.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as P from '../core/packages.js'

async function tmpdir() {
  return fs.mkdtemp(path.join(os.tmpdir(), 'cdp-pkgtest-'))
}

// 작은 패키지 하나 — 문서 둘 · 등록부 둘 · 어휘에 예시 하나
async function makePackage(dir, name, { brokenDoc = false, orphanExample = false } = {}) {
  const p = path.join(dir, name)
  await fs.mkdir(path.join(p, 'docs'), { recursive: true })
  await fs.writeFile(path.join(p, '_package.json'), JSON.stringify({ name, title: '시험', version: '0.1.0' }))
  await fs.writeFile(
    path.join(p, '_managed.md'),
    `# 등록부\n\n| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n| \`table:*\` | \`docs/테이블정의서.md\` | \`## {값}\` |\n| \`screen:*\` | \`docs/${brokenDoc ? '없는문서' : '화면설계서'}.md\` | \`## {값}\` |\n`
  )
  await fs.writeFile(
    path.join(p, '_vocab.md'),
    `# 어휘\n\n## table\n\n- \`table:ex_mst\` — (예시) 마스터\n  example: 서식\n\n## screen\n\n- \`screen:EX010\` — (예시) 화면\n  example: 서식\n`
  )
  await fs.writeFile(path.join(p, 'docs', '테이블정의서.md'), `# 테이블정의서\n\n## ex_mst — (예시) 마스터\n<!-- applied: null -->\n\n표\n`)
  await fs.writeFile(
    path.join(p, 'docs', '화면설계서.md'),
    orphanExample ? `# 화면설계서\n\n(예시 섹션을 지웠다)\n` : `# 화면설계서\n\n## EX010 — (예시) 화면\n<!-- applied: null -->\n\n레이아웃\n`
  )
  return p
}

test('findPackagesDir — 순서: explicit → CDP_PACKAGES → 번들 옆 → 소스', async () => {
  const d = await tmpdir()
  try {
    await fs.mkdir(path.join(d, 'a'))
    await fs.mkdir(path.join(d, 'b'))
    await fs.mkdir(path.join(d, 'bin'))
    await fs.mkdir(path.join(d, 'packages'))
    await fs.mkdir(path.join(d, 'src', 'agent', 'packages'), { recursive: true })
    assert.equal((await P.findPackagesDir({ explicit: path.join(d, 'a'), env: { CDP_PACKAGES: path.join(d, 'b') } })).how, '--packages')
    assert.equal((await P.findPackagesDir({ env: { CDP_PACKAGES: path.join(d, 'b') } })).how, 'CDP_PACKAGES')
    assert.equal((await P.findPackagesDir({ env: {}, binDir: path.join(d, 'bin') })).dir, path.resolve(d, 'packages'))
    assert.equal((await P.findPackagesDir({ env: {}, sourceRoot: path.join(d, 'src') })).how, '소스')
    assert.equal(await P.findPackagesDir({ env: {} }), null)
    assert.equal((await P.findPackagesDir({ explicit: path.join(d, '없음'), env: {} })), null, '없는 폴더는 건너뛴다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('listPackages · readManifest — 매니페스트 없는 폴더도 이름과 함께 · name 불일치는 거절', async () => {
  const d = await tmpdir()
  try {
    await makePackage(d, 'one')
    await makePackage(d, 'two')
    await fs.rm(path.join(d, 'two', '_package.json'))
    await fs.mkdir(path.join(d, 'not-a-package'))
    const list = await P.listPackages(d)
    assert.deepEqual(
      list.map((p) => [p.name, p.manifest.present, p.docs, p.types, p.patterns, p.examples]),
      [
        ['one', true, 2, 2, 2, 2],
        ['two', false, 2, 2, 2, 2],
      ]
    )
    assert.equal(list[0].coords, 0, '예시는 세지 않는다')
    await fs.writeFile(path.join(d, 'one', '_package.json'), JSON.stringify({ name: 'other' }))
    await assert.rejects(P.readManifest(path.join(d, 'one')), /폴더명.*다르다/)
    await fs.writeFile(path.join(d, 'one', '_package.json'), '{ broken')
    await assert.rejects(P.readManifest(path.join(d, 'one')), /JSON 이 아니다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('checkPackage — 정상은 ok · 등록부가 없는 문서를 가리키면 fail · 예시 어휘만 남으면 fail', async () => {
  const d = await tmpdir()
  try {
    const ok = await P.checkPackage(await makePackage(d, 'ok'))
    assert.equal(ok.ok, true, JSON.stringify(ok.problems))
    assert.equal(ok.docs, 2)
    assert.equal(ok.works, 0)

    const bad = await P.checkPackage(await makePackage(d, 'bad', { brokenDoc: true }))
    assert.equal(bad.ok, false)
    assert.ok(bad.problems.some((p) => p.kind === 'doc-missing'), JSON.stringify(bad.problems))

    const gap = await P.checkPackage(await makePackage(d, 'gap', { orphanExample: true }))
    assert.equal(gap.ok, false)
    assert.ok(gap.problems.some((p) => p.kind === 'example-gap' && /screen:EX010/.test(p.detail)), JSON.stringify(gap.problems))

    // assemble 을 주면 그 결과 폴더로 검사한다
    let assembled = null
    const viaAssemble = await P.checkPackage(await makePackage(d, 'asm'), {
      assemble: async (dest) => {
        assembled = dest
        await fs.cp(path.join(d, 'asm'), dest, { recursive: true })
      },
    })
    assert.equal(viaAssemble.ok, true)
    assert.ok(assembled && !(await fs.stat(assembled).catch(() => null)), '임시 폴더는 치운다')

    await assert.rejects(P.checkPackage(path.join(d, '없음')), /패키지가 아니다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('newPackage — 복사하고 매니페스트를 고친다 · 이름 형식 · 중복 · 원본 없음', async () => {
  const d = await tmpdir()
  try {
    await makePackage(d, 'base')
    const r = await P.newPackage(d, { name: 'copy', from: 'base', title: '복사본' })
    assert.equal(r.manifest.name, 'copy')
    assert.equal(r.manifest.title, '복사본')
    assert.equal(r.manifest.version, '0.1.0')
    assert.match(r.manifest.source, /base/)
    const m = await P.readManifest(path.join(d, 'copy'))
    assert.equal(m.name, 'copy')
    assert.equal((await P.checkPackage(path.join(d, 'copy'))).ok, true)

    await assert.rejects(P.newPackage(d, { name: '한글', from: 'base' }), /이름 형식/)
    await assert.rejects(P.newPackage(d, { name: 'copy', from: 'base' }), /이미 있다/)
    await assert.rejects(P.newPackage(d, { name: 'x', from: '없음' }), /원본 패키지가 없다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
