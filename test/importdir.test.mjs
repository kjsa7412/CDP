// md 폴더 들이기 — `core/importdir.js`. 검토 §3.6 · 제품화 TODO 6.3.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { planImport, applyImport } from '../core/importdir.js'
import { parseDoc } from '../core/frontmatter.js'

async function fixture() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-imp-'))
  const src = path.join(d, 'src')
  const repo = path.join(d, 'repo')
  // 원본 — 3단 폴더 · 프론트매터 있는/없는 md · status · 같은 basename 둘 · png 하나 · 링크
  await fs.mkdir(path.join(src, 'projects', '비교 개편', 'sub'), { recursive: true })
  await fs.mkdir(path.join(src, 'wiki'), { recursive: true })
  await fs.writeFile(
    path.join(src, 'wiki', '2026-09-05_ops로그-주간검토.md'),
    '---\ntitle: 주간 검토\ndate: 2026-09-05\nstatus: Done\ndomain: ops\ncategory: 작업기록\nrepos: [data, web]\nicon: 📝\ntouches: [factor:E010, 아무말]\n---\n\n본문. 그림은 ![x](../projects/비교 개편/layout.png) 이고 [설계](../projects/비교 개편/README.md) 를 본다.\n'
  )
  await fs.writeFile(path.join(src, 'projects', '비교 개편', 'README.md'), '# 비교 개편 설계\n\n프론트매터가 없다.\n')
  await fs.writeFile(path.join(src, 'projects', '비교 개편', 'sub', 'README.md'), '# 하위 README\n\n같은 이름이다.\n')
  await fs.writeFile(path.join(src, 'projects', '비교 개편', 'layout.png'), Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  await fs.writeFile(path.join(src, '2026-0901-이미-규약.md'), '---\nid: 2026-0901-이미-규약\ntitle: 규약대로\ndate: 2026-09-01 10:00\nauthor: kjsa\ntouches: []\n---\n\n그대로 들어간다.\n')
  // 지식 레포 — 최소
  await fs.mkdir(path.join(repo, 'docs'), { recursive: true })
  await fs.writeFile(path.join(repo, '_vocab.md'), '# 어휘\n\n## factor\n\n- `factor:E010` — 생활편의\n')
  await fs.writeFile(path.join(repo, '_managed.md'), '| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n| `factor:*` | `docs/팩터정의서.md` | `## {값}` |\n')
  await fs.writeFile(path.join(repo, 'docs', '팩터정의서.md'), '# 팩터정의서\n\n## E010 — 생활편의\n<!-- applied: null -->\n\n상태\n')
  return { d, src, repo }
}

test('planImport — 평면화 · id · date 근거 · 필드 접기 · 자산 · 링크 재작성 · 결정론', async () => {
  const { d, src, repo } = await fixture()
  try {
    const p1 = await planImport(src, repo, { author: 'importer' })
    const p2 = await planImport(src, repo, { author: 'importer' })
    assert.deepEqual(
      p1.files.map((f) => f.to),
      p2.files.map((f) => f.to),
      '결정론 — 두 번 돌려 같다'
    )
    const works = p1.files.filter((f) => f.kind === 'work')
    const assets = p1.files.filter((f) => f.kind === 'asset')
    assert.equal(works.length, 4)
    assert.equal(assets.length, 1)
    assert.equal(assets[0].to, 'work/assets/projects-비교-개편/layout.png', '공백은 - 로')

    const wiki = works.find((f) => f.from.startsWith('wiki/'))
    assert.equal(wiki.id, '2026-0905-wiki-ops로그-주간검토', '파일명 날짜를 떼고 출처 조각을 붙인다')
    assert.equal(wiki.date, '2026-09-05')
    assert.equal(wiki.dateSource, 'frontmatter')
    assert.equal(wiki.title, '주간 검토')
    assert.equal(wiki.author, 'importer')
    assert.deepEqual(wiki.touches, [], '기본은 비운다 — 파생을 기계가 채울 수 없다')
    assert.ok(wiki.tags.includes('touches/factor:E010'), '좌표는 tags 로 보존된다')
    assert.ok(wiki.tags.includes('domain/ops') && wiki.tags.includes('repos/data') && wiki.tags.includes('category/작업기록'))
    assert.ok(wiki.dropped.includes('status=Done'), JSON.stringify(wiki.dropped))
    assert.ok(wiki.warnings.some((w) => /아무말/.test(w)))
    // 링크 — 자산과 md 둘 다 새 자리로
    assert.ok(wiki.body.includes('](assets/projects-비교-개편/layout.png)'), wiki.body)
    assert.ok(/\]\(2026-\d{4}-projects-비교-개편-README\.md\)/.test(wiki.body), wiki.body)

    const keep = works.find((f) => f.from === '2026-0901-이미-규약.md')
    assert.equal(keep.id, '2026-0901-이미-규약', '규약 모양이면 그대로')
    assert.equal(keep.date, '2026-09-01 10:00')
    assert.equal(keep.author, 'kjsa', '프론트매터가 --author 보다 우선')

    const readmes = works.filter((f) => /README/.test(f.from))
    assert.equal(readmes.length, 2)
    assert.notEqual(readmes[0].id, readmes[1].id, '같은 basename 은 출처 조각으로 갈린다')
    for (const r of readmes) {
      assert.equal(r.dateSource, 'mtime', 'git 도 프론트매터도 없으면 mtime 이고 근거에 적힌다')
      assert.ok(r.warnings.some((w) => /mtime/.test(w)))
    }
    assert.equal(readmes.find((r) => r.from.includes('sub/')).title, '하위 README', 'H1 이 제목')
    assert.equal(p1.summary.withTouches, 0)
    assert.equal(p1.summary.touchCandidates, 1)

    // --keep-touches 면 그대로 둔다
    const kept = await planImport(src, repo, { author: 'importer', keepTouches: true })
    assert.deepEqual(kept.files.find((f) => f.from.startsWith('wiki/')).touches, ['factor:E010'])
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('planImport — 입력 검사', async () => {
  const { d, src, repo } = await fixture()
  try {
    await assert.rejects(planImport(path.join(d, '없음'), repo), /원본 폴더가 없다/)
    await assert.rejects(planImport(src, d), /지식 레포가 아니다/)
    await assert.rejects(planImport(repo, repo), /겹친다/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

test('applyImport — 쓰고 검사에 통과한다 · 다시 돌리면 건너뛴다 · 검사 오류면 지운다', async () => {
  const { d, src, repo } = await fixture()
  try {
    const plan = await planImport(src, repo, { author: 'importer' })
    const r = await applyImport(plan)
    assert.equal(r.works, 4)
    assert.equal(r.assets, 1)
    const files = (await fs.readdir(path.join(repo, 'work'))).filter((f) => f.endsWith('.md')).sort()
    assert.equal(files.length, 4)
    const doc = parseDoc('work/' + files[0], await fs.readFile(path.join(repo, 'work', files[0]), 'utf8'))
    assert.equal(doc.errors.length, 0, '만든 프론트매터가 읽힌다')
    assert.equal(doc.id, doc.fileId)
    assert.equal(doc.status, null)
    assert.ok(doc.hasTouchesKey)

    // 두 번째 — 전부 건너뛴다
    const again = await planImport(src, repo, { author: 'importer' })
    assert.equal(again.files.filter((f) => f.skip).length, again.files.length)
    const r2 = await applyImport(again)
    assert.equal(r2.works, 0)

    // 검사 오류 — 등록부에 걸리는 좌표를 건드렸는데 섹션이 없으면 파생 누락 → 되돌린다
    const src2 = path.join(d, 'src2')
    await fs.mkdir(src2)
    await fs.writeFile(path.join(src2, 'x.md'), '---\ntitle: 파생\ndate: 2026-09-10\ntouches: [factor:E999]\n---\n본문\n')
    const bad = await planImport(src2, repo, { author: 'i', keepTouches: true })
    await assert.rejects(applyImport(bad), (e) => e.code === 'E_CHECK')
    assert.equal(await fs.stat(path.join(repo, 'work', bad.files[0].to.slice(5))).catch(() => null), null, '지웠다')
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
