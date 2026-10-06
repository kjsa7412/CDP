// 공식 사이트 — 사이트에 박힌 것이 코드 · 녹화 · 그림과 어긋나지 않는가(공식 사이트 제작 검토 v0.1 S13).
//
// 빌드 산출물의 누출은 `npm run build:site` 의 check-leaks 가 막는다. 여기는 브라우저 · 빌드 없이 도는 대조다.

import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import crypto from 'node:crypto'
import { fileURLToPath } from 'node:url'
import { ROUTES } from '../site/src/routes.js'
import { SHOTS, GROUPS } from '../site/src/data/screens.js'
import { TOOLS, SKILLS } from '../site/src/data/facts.js'
import { findLeaks } from '../site/tools/leaks.mjs'
import { releasesOf } from '../site/tools/releases.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const rd = (p) => fs.readFileSync(path.join(ROOT, p), 'utf8')
const pkg = JSON.parse(rd('package.json'))
const EXDIR = path.join(ROOT, 'site/src/data/examples')
const examples = fs
  .readdirSync(EXDIR)
  .filter((f) => f.endsWith('.json'))
  .map((f) => JSON.parse(fs.readFileSync(path.join(EXDIR, f), 'utf8')))

test('주소 일곱 — 라우트 표 · 페이지 · 상단 바가 같다', () => {
  assert.equal(ROUTES.length, 7)
  const app = rd('site/src/App.jsx')
  for (const r of ROUTES) {
    assert.ok(app.includes(`'${r.path}':`), `App.jsx PAGES 에 ${r.path} 가 없다`)
    assert.ok(r.title && r.description, `${r.path} 제목 · 설명`)
  }
  assert.equal(new Set(ROUTES.map((r) => r.path)).size, ROUTES.length, '주소 중복')
})

test('화면 14장 — 라이트 · 다크 PNG 가 둘 다 있다 · 묶음이 있다 · 찍은 판이 적혀 있다', (t) => {
  const shotsMeta = JSON.parse(rd('site/src/data/shots.json'))
  assert.match(shotsMeta.version, /^\d+\.\d+\.\d+$/)
  if (shotsMeta.version !== pkg.version) t.diagnostic(`화면은 v${shotsMeta.version} 에서 찍었다 — 지금 v${pkg.version}. 화면이 바뀌었으면 npm run site:demo`)
  assert.equal(SHOTS.length, 14)
  const keys = new Set(GROUPS.map((g) => g.key))
  for (const s of SHOTS) {
    assert.ok(keys.has(s.group), `${s.id} 묶음 ${s.group}`)
    for (const t of ['light', 'dark']) {
      const f = path.join(ROOT, 'site/public/shots', `${s.id}-${t}.png`)
      assert.ok(fs.existsSync(f), `없는 그림 ${path.basename(f)} — node site/demo/run.mjs shots`)
      assert.ok(fs.statSync(f).size > 20_000, `${path.basename(f)} 가 너무 작다(빈 화면?)`)
    }
  }
})

test('예제 다섯 — 녹화의 끝이 시나리오대로다', (t) => {
  assert.equal(examples.length, 5)
  const by = Object.fromEntries(examples.map((e) => [e.slug, e]))
  const codes = (e) => e.steps.map((s) => s.res?.error?.code || (s.res?.commit ? 'commit' : s.kind === 'cli' ? 'exit' + s.exit : 'ok'))
  assert.ok(codes(by.find).every((c) => c === 'ok'), '① 은 읽기만')
  assert.deepEqual(codes(by.save).filter((c) => c !== 'ok'), ['commit'], '② 는 커밋 하나')
  assert.deepEqual(codes(by.blocked).filter((c) => c !== 'ok'), ['E_CHECK', 'exit1', 'commit'], '③ 거절 → 로컬 exit 1 → 통과')
  assert.deepEqual(codes(by.conflict).filter((c) => c !== 'ok'), ['commit', 'E_CONFLICT', 'commit'], '④ 먼저 · 충돌 · 합쳐서')
  assert.ok(by.supersede.steps.some((s) => s.tool === 'save' && s.req.params.arguments.work.supersedes), '⑤ supersedes 를 보냈다')
  for (const e of examples) {
    for (const s of e.steps) assert.ok(s.note, `${e.slug} 걸음마다 해설`)
    assert.ok(e.files.length, `${e.slug} 레포에 남은 파일`)
    for (const l of findLeaks(JSON.stringify(e))) assert.fail(`${e.slug} 녹화에 누출 패턴 ${l.kind} 「${l.hit}」`)
    // 판을 올리고 다시 녹화하지 않았으면 알린다 — 실패로 두지 않는다(녹화는 사람이 판을 올릴 때 돌린다)
    if (e.version !== pkg.version) t.diagnostic(`예제 ${e.slug} 는 v${e.version} 녹화 — 지금 v${pkg.version}. npm run site:demo 로 다시 녹화한다`)
  }
})

test('도구 12 · 스킬 5 — 사이트의 이름이 코드와 같다', () => {
  const src = rd('viewer/bin/ctx-mcp.mjs')
  const reg = new Set([...src.matchAll(/(?:[^a-zA-Z]tool\(|registerTool\(\s*)'([a-z]+)'/g)].map((m) => m[1]))
  assert.deepEqual([...TOOLS.map((t) => t[0])].sort(), [...reg].sort())
  assert.equal(TOOLS.length, 12)
  const dirs = fs.readdirSync(path.join(ROOT, 'agent/skills')).filter((d) => fs.existsSync(path.join(ROOT, 'agent/skills', d, 'SKILL.md')))
  assert.deepEqual(SKILLS.map((s) => s[0]).sort(), dirs.sort())
})

test('CSP — vercel.json 의 해시가 index.html 인라인 스크립트와 같다', () => {
  const html = rd('site/index.html')
  const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)].map((m) => m[1])
  assert.equal(scripts.length, 1, '인라인 스크립트는 하나다')
  const h = 'sha256-' + crypto.createHash('sha256').update(scripts[0]).digest('base64')
  const v = JSON.parse(rd('vercel.json'))
  const csp = v.headers.flatMap((x) => x.headers).find((x) => x.key === 'Content-Security-Policy').value
  assert.ok(csp.includes(`'${h}'`), `CSP 에 ${h} 가 없다 — vercel.json 을 고친다`)
  assert.match(csp, /default-src 'self'/)
  assert.equal(v.outputDirectory, 'ops/out/site')
})

test('누출 규칙 — 사내 흔적은 잡고 제품 이름은 놓는다', () => {
  for (const s of ['http://10.10.20.188:7374', 'author: kjsa', 'C:\\Users\\someone\\x', 'soln1/cdp.git', 'rp_pre_rview_mst', 'Bearer abcdefghijklmnopqrstuvwxyz0123456789ABCD']) {
    assert.ok(findLeaks(s).length, `못 잡았다: ${s}`)
  }
  for (const s of ['패키지 public-si · 공공 SI 산출물', '테이블정의서:bk_loan_mst', 'http://<서버>:7374', 'phone', 'lead · dev.a · dev.b']) {
    assert.deepEqual(findLeaks(s), [], `잘못 잡았다: ${s}`)
  }
})

test('사이트 소스 · 데모 내용에 누출 패턴이 없다', () => {
  const files = []
  const walk = (d) => {
    for (const e of fs.readdirSync(path.join(ROOT, d), { withFileTypes: true })) {
      const p = d + '/' + e.name
      if (e.isDirectory()) walk(p)
      else if (/\.(jsx?|mjs|css|html|md|json|svg)$/.test(e.name)) files.push(p)
    }
  }
  walk('site/src')
  walk('site/demo')
  files.push('site/index.html', 'vercel.json')
  for (const f of files) for (const l of findLeaks(rd(f))) assert.fail(`${f}:${l.line} ${l.kind} 「${l.hit}」`)
})

test('판 이력 — 맨 위가 지금 판이고 본문 없이 머리만', () => {
  const r = releasesOf(rd('CHANGELOG.md'))
  assert.equal(r[0].v, pkg.version)
  assert.ok(r.length >= 20)
  for (const x of r) assert.ok(x.items.length >= 1 && x.items.every((s) => s.length < 200), `v${x.v}`)
})

// ── Vercel 빌드 건너뛰기(site/tools/vercel-ignore.mjs) ─────────────────────────────────────────

test('빌드 건너뛰기 — 사이트가 site/ 밖에서 읽는 파일이 전부 WATCH 에 있다', async () => {
  const { WATCH } = await import('../site/tools/vercel-ignore.mjs')
  const watched = (rel) => WATCH.some((w) => (w.endsWith('/') ? rel.startsWith(w) : rel === w))
  const seen = new Set()
  const outside = new Set(['package.json', 'CHANGELOG.md']) // vite.config.js 가 fs 로 읽는다
  const visit = (abs) => {
    if (seen.has(abs) || !fs.existsSync(abs)) return
    seen.add(abs)
    if (!/\.(jsx?|mjs|css)$/.test(abs)) return
    const src = fs.readFileSync(abs, 'utf8')
    for (const m of src.matchAll(/(?:from|import)\s+'(\.{1,2}\/[^']+)'|@import\s+['"](\.{1,2}\/[^'"]+)['"]/g)) {
      const spec = (m[1] || m[2]).replace(/\?.*$/, '')
      const to = path.resolve(path.dirname(abs), spec)
      const rel = path.relative(ROOT, to).split(path.sep).join('/')
      if (!rel.startsWith('site/')) outside.add(rel)
      visit(to)
    }
  }
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else visit(p)
    }
  }
  walk(path.join(ROOT, 'site/src'))
  visit(path.join(ROOT, 'site/vite.config.js'))
  assert.ok(outside.size >= 8, `밖에서 읽는 것이 너무 적다 — 훑기가 깨졌나: ${[...outside].join(', ')}`)
  for (const rel of outside) assert.ok(watched(rel), `${rel} 을 사이트가 읽는데 WATCH 에 없다 — 바뀌어도 Vercel 이 빌드하지 않는다`)
  assert.equal(JSON.parse(rd('vercel.json')).ignoreCommand, 'node site/tools/vercel-ignore.mjs')
})

test('빌드 건너뛰기 — 사이트 밖만 바뀌면 건너뛰고 · 닿으면 빌드 · 모르면 빌드', async () => {
  const { decide } = await import('../site/tools/vercel-ignore.mjs')
  const { execFileSync } = await import('node:child_process')
  const os = await import('node:os')
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-vignore-'))
  const g = (...a) => execFileSync('git', ['-C', dir, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a], { encoding: 'utf8' }).trim()
  const put = (rel, text) => {
    fs.mkdirSync(path.dirname(path.join(dir, rel)), { recursive: true })
    fs.writeFileSync(path.join(dir, rel), text)
  }
  const commit = (rel, text) => {
    put(rel, text)
    g('add', '-A')
    g('commit', '-qm', rel)
    return g('rev-parse', 'HEAD')
  }
  try {
    g('init', '-q')
    const c1 = commit('core/save.js', '1')
    commit('core/save.js', '2')
    commit('docs/dev/메모.md', '3')
    assert.equal(decide({ prev: c1, cwd: dir }).code, 0, '제품 코드 · 개발 메모만 — 건너뛴다')
    const c3 = g('rev-parse', 'HEAD')
    commit('docs/그림/1.svg', '<svg/>')
    assert.equal(decide({ prev: c3, cwd: dir }).code, 1, '그림(한글 경로) — 빌드')
    const c4 = g('rev-parse', 'HEAD')
    commit('viewer/src/styles/tokens.css', 'a')
    assert.equal(decide({ prev: c4, cwd: dir }).code, 1, '제품 토큰 — 빌드')
    const c5 = g('rev-parse', 'HEAD')
    commit('viewer/src/App.jsx', 'x')
    assert.equal(decide({ prev: c5, cwd: dir }).code, 0, '사이트가 안 읽는 화면 코드 — 건너뛴다')
    commit('site/src/pages/Home.jsx', 'x')
    assert.equal(decide({ prev: c5, cwd: dir }).code, 1, '여러 커밋 사이 어디든 사이트 변경이 있으면 — 빌드')
    assert.equal(decide({ prev: undefined, cwd: dir }).code, 1, '첫 배포 — 빌드')
    assert.equal(decide({ prev: 'deadbeef'.repeat(5), cwd: dir }).code, 1, '얕은 clone 에 없는 커밋 — 빌드')
    assert.equal(decide({ prev: c5, force: true, cwd: dir }).code, 1, 'CDP_SITE_FORCE — 빌드')
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
