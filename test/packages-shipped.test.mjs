// 나가는 패키지 — `agent/packages/*` 를 그대로 잰다. 패키지 재편 검토 v0.1 · TODO ⑤.
//
// `test/packages.test.mjs` 는 함수(목록 · 검사 · 복제 · 이름 바꿈)를 작은 가짜 패키지로 잰다. 여기는
// **실제로 받는 사람에게 가는 것**을 본다 — 검사가 통과하는가만이 아니라, README 의 문서 표가 폴더와
// 같은가 · 타입이 MCP · save 가 받는 모양인가 · 고정 좌표에 섹션이 있는가 · 사내 흔적이 없는가.
// 문서 수는 적지 않는다 — 폴더에서 센다(패키지 README 「매니페스트」).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import * as P from '../core/packages.js'
import { loadRepo } from '../core/repo.js'
import { purgeTree } from '../core/examplestree.js'
import { parseVocab } from '../core/vocab.js'
import { parseRegistry } from '../core/managed.js'
import { readText } from '../core/scan.js'

const DIR = path.resolve('agent/packages')
const NAMES = ['agile-product', 'ai-service', 'blank', 'cloud-native', 'public-si']

// MCP(`core/tools.js` RE_COORD) · save 의 managed(`core/managed.js` RE_PATTERN_TYPE)가 받는 타입 — 영문이면 소문자만
const TYPE_OK = /^(?:[a-z][a-z0-9_-]*|[가-힣][A-Za-z0-9가-힣_-]*)$/
// 사내 흔적 — 원천 사업 이름 · 개인 PC 경로 · 사내 레포 · 사내 주소
const LEAK = /DPMS|dpms|C:\\project|10\.10\.\d+\.\d+|soln1/

const rd = async (p) => readText(await fs.readFile(p, 'utf8'))

async function walk(dir, rel = '') {
  const out = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const r = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) out.push(...(await walk(path.join(dir, e.name), r)))
    else out.push(r)
  }
  return out
}

test('패키지는 다섯이다 — 매니페스트 이름이 폴더와 같고 제목 · 판 · 설명이 있다', async () => {
  const list = await P.listPackages(DIR)
  assert.deepEqual(list.map((p) => p.name), NAMES)
  for (const p of list) {
    assert.equal(p.manifest.present, true, p.name)
    assert.ok(p.manifest.title && p.manifest.description, p.name + ' 제목 · 설명')
    assert.match(p.manifest.version || '', /^\d+\.\d+\.\d+$/, p.name + ' 판')
  }
})

for (const name of NAMES) {
  test(`${name} — 부어서 검사가 ok · 경고는 서식 예시뿐`, async () => {
    const r = await P.checkPackage(path.join(DIR, name))
    assert.equal(r.ok, true, JSON.stringify(r.problems))
    for (const w of r.warnings) assert.match(w, /서식 예시/, `${name} 의 다른 경고 — ${w}`)
  })

  test(`${name} — README 의 문서 표가 docs/ 와 같다 · 첫 제목이 이름이다`, async () => {
    const root = path.join(DIR, name)
    const readme = await rd(path.join(root, 'README.md'))
    assert.match(readme.split('\n')[0], new RegExp(`^# ${name} — \\S`), '첫 제목')
    const files = (await walk(path.join(root, 'docs')).catch(() => [])).filter((f) => f.endsWith('.md')).map((f) => 'docs/' + f)
    const linked = [...readme.matchAll(/\]\((docs\/[^)#]+\.md)\)/g)].map((m) => decodeURI(m[1]))
    assert.deepEqual([...new Set(linked)].sort(), files.sort(), 'README 표의 링크와 문서 파일')
  })

  test(`${name} — 타입이 MCP · save 가 받는 모양이고 고정 좌표마다 섹션이 있다`, async () => {
    const root = path.join(DIR, name)
    const vocab = parseVocab(await rd(path.join(root, '_vocab.md')))
    const registry = parseRegistry(await rd(path.join(root, '_managed.md')))
    for (const t of vocab.types) assert.match(t, TYPE_OK, `타입 ${t}`)
    for (const rule of registry.rules) assert.match(rule.pattern.slice(0, rule.pattern.indexOf(':')), TYPE_OK, `패턴 ${rule.pattern}`)
    // 예시가 아닌 좌표(시스템아키텍처 넷 같은 고정 값)는 등록부 타입이면 섹션이 있어야 한다 — 지우고 시작하지 않는 값이다
    const r = await loadRepo(root)
    for (const [coord, e] of vocab.coords) {
      if (e.example) continue
      const hit = r.managedIndex.find(coord)
      if (!hit) continue
      assert.ok(hit.section && !hit.docMissing, `${coord} 의 섹션이 ${hit.doc} 에 없다`)
    }
  })

  test(`${name} — 받는 사람에게 가는 파일에 사내 흔적이 없다`, async () => {
    const root = path.join(DIR, name)
    for (const f of await walk(root)) {
      if (f === '_package.json') continue // 매니페스트는 나가지 않는다(assemble 이 뺀다)
      const text = await fs.readFile(path.join(root, f), 'utf8')
      const m = LEAK.exec(text)
      assert.equal(m, null, `${name}/${f} — ${m && m[0]}`)
    }
  })

  test(`${name} — 서식 예시를 뺀 뒤에도 검사가 ok 이고 예시가 남지 않는다`, async () => {
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-shipped-'))
    try {
      const dst = path.join(tmp, name)
      await fs.cp(path.join(DIR, name), dst, { recursive: true })
      await purgeTree(dst)
      const r = await P.checkPackage(dst)
      assert.equal(r.ok, true, JSON.stringify(r.problems))
      assert.equal(r.examples, 0, '예시 좌표가 남았다')
      assert.deepEqual(r.warnings, [], '예시를 뺐는데 경고가 남았다')
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
  })
}
