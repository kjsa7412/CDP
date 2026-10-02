// 데모 — 공식 사이트의 화면 · 예제를 만드는 한 줄.
//
//   node site/demo/run.mjs [all|stage|record|shots] [--keep] [--port 7390]
//
//   stage   레포 둘 · 명부 셋 · 서버 · 작업 기록 seed(전부 save 로)
//   record  시나리오 다섯을 진짜 MCP 로 돌려 site/src/data/examples/*.json 으로
//   shots   화면 14장 × 라이트 · 다크 → site/public/shots/ (playwright-core + Edge)
//   all     셋을 차례로(기본)
//
// 판이 오르면 `npm run site:demo` 를 다시 돌리고 바뀐 PNG 를 넘겨 본다(제작 검토 v0.1 S14).
// 작업 폴더는 `ops/out/site-demo/` — 토큰도 거기에만 있고 레포에 들어가지 않는다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT, NL, ctx, git, serve, ready, call, stripDoc, stripVocab, renderBlock, walk } from './lib.mjs'
import { PEOPLE, VOCAB, DRAFTS, WORKS, OPS_WORKS } from './content.mjs'

const argv = process.argv.slice(2)
const what = argv.find((a) => !a.startsWith('--')) || 'all'
const PORT = Number(argv[argv.indexOf('--port') + 1]) || 7390
const KEEP = argv.includes('--keep')
const OUT = path.join(ROOT, 'ops', 'out', 'site-demo')
const F = { repos: path.join(OUT, 'repos'), data: path.join(OUT, 'data'), auth: path.join(OUT, 'auth.json'), state: path.join(OUT, 'state.json') }
const BASE = `http://127.0.0.1:${PORT}`
const say = (s) => console.log('[site:demo] ' + s)

// ── 판 세우기 ───────────────────────────────────────────────────────────────

async function stage() {
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(F.repos, { recursive: true })
  for (const name of ['library', 'library-ops']) {
    const dir = path.join(F.repos, name)
    await ctx('repo', 'new', dir, '--package', 'public-si')
    await git(dir, 'config', 'user.name', 'lead')
    await git(dir, 'config', 'user.email', 'lead@example.invalid')
    // 첫날 — 예시를 걷고 초안을 넣는다(사람이 하는 일 · 한 커밋)
    const drafts = name === 'library' ? DRAFTS : {}
    let removed = 0
    for (const rel of await walk(dir, 'docs')) {
      const p = path.join(dir, rel)
      const t = await fs.readFile(p, 'utf8')
      const block = drafts[rel] ? renderBlock(drafts[rel]) : ''
      const r = stripDoc(t, block)
      if (r.between?.length) throw new Error(`${rel} — 예시 사이에 예시 아닌 섹션: ${r.between.join(' | ')}`)
      if (r.removed || block) await fs.writeFile(p, r.text)
      removed += r.removed
      if (block && !r.removed) throw new Error(`${rel} — 초안을 넣을 예시 자리가 없다`)
    }
    const vp = path.join(dir, '_vocab.md')
    await fs.writeFile(vp, stripVocab(await fs.readFile(vp, 'utf8'), name === 'library' ? VOCAB : {}))
    await ctx('index', '--repo', dir)
    const chk = await ctx('check', '--repo', dir).catch((e) => e)
    if (chk.code) throw new Error(`${name} — 첫날 커밋 전 ctx check 실패:${NL}${chk.stdout}`)
    await git(dir, 'add', '-A')
    await git(dir, 'commit', '-qm', name === 'library' ? '첫날 — 패키지 예시를 걷고 대출 업무 초안을 넣는다' : '첫날 — 패키지 예시를 걷는다')
    say(`${name}: 예시 섹션 ${removed} 걷음 · ${chk.stdout.trim().split(NL).pop()}`)
  }
  // 명부 — 이 세션에서 만드는 시험 값이다. 토큰은 ops/out 밑 state.json 에만 둔다.
  const tokens = {}
  for (const u of PEOPLE) {
    await ctx('serve', 'user', 'add', '--auth', F.auth, '--data', F.data, '--name', u.name, '--label', u.label, '--role', u.role, '--repos', u.repos)
    tokens[u.name] = (await ctx('serve', 'token', '--auth', F.auth, '--data', F.data, '--user', u.name, '--note', '데모')).stdout.trim()
  }
  await fs.writeFile(F.state, JSON.stringify({ port: PORT, tokens, changes: {} }, null, 2))
  say(`명부 ${PEOPLE.map((u) => u.name).join(' · ')}`)
}

export async function state() {
  return JSON.parse(await fs.readFile(F.state, 'utf8'))
}

export function up() {
  const S = serve([
    '--root', F.repos,
    '--port', String(PORT),
    '--auth', F.auth,
    '--data', F.data,
    '--web', path.join(ROOT, 'ops/out/web'),
    '--manual', path.join(ROOT, 'site/demo/manual'),
  ])
  return S
}

// ── save 한 번 — 사람(에이전트)이 하는 순서 그대로: 섹션을 읽고, 고쳐서, 보낸다 ─────────

const changeLine = (w, what) => `**변경** · ${w.date.slice(0, 10)} [\`${w.id.slice(10)}\`](../../work/${w.id}.md) ${what}`

export async function saveWork(st, repo, w, { withSections = true, applied = {}, bodyOf = null } = {}) {
  const tk = st.tokens[w.by]
  const sections = []
  if (withSections) {
    for (const [coord, [body, what]] of Object.entries(w.secs || {})) {
      const cur = (await call(BASE, repo, tk, 'section', { coord })).res
      const hist = [...(st.changes[repo + ' ' + coord] || []), changeLine(w, what)]
      // 섹션 끝의 `---`(작성지침 앞 구분선)는 섹션에 실려 온다 — 읽은 것을 고쳐 보내는 에이전트처럼 남긴다
      const rule = /(^|\n)---\s*$/.test(String(cur.content || '')) ? NL + NL + '---' : ''
      const ap = coord in applied ? applied[coord] : cur.applied ?? null
      sections.push({ coord, applied: ap, body: (bodyOf ? bodyOf(coord, body) : body) + NL + NL + hist.join('  ' + NL) + rule })
    }
  }
  const work = { id: w.id, title: w.title, date: w.date, touches: w.touches, tags: w.tags, body: w.body }
  if (w.supersedes) work.supersedes = w.supersedes
  const r = await call(BASE, repo, tk, 'save', { repo, work, sections })
  if (r.res.commit) for (const [coord, [, what]] of Object.entries(w.secs || {})) (st.changes[repo + ' ' + coord] ||= []).push(changeLine(w, what))
  return { ...r, work, sections }
}

async function seed(st) {
  for (const [repo, list] of [['library', WORKS], ['library-ops', OPS_WORKS]]) {
    for (const w of list) {
      const r = await saveWork(st, repo, w)
      if (!r.res.commit) throw new Error(`${repo} ${w.id} — save 실패: ${JSON.stringify(r.res.error || r.res).slice(0, 400)}`)
    }
    say(`${repo}: 작업 기록 ${list.length} 건 save`)
  }
  await fs.writeFile(F.state, JSON.stringify(st, null, 2))
}

// ── 본체 ────────────────────────────────────────────────────────────────────

// 번들을 먼저 — 서버 화면의 「빌드」 칸이 찍힌다. CDP_REPO 가 있으면 build-ctx 가 그 레포까지 고치므로 뺀다
{
  const { execFileSync } = await import('node:child_process')
  const env = { ...process.env }
  delete env.CDP_REPO
  execFileSync(process.execPath, [path.join(ROOT, 'ops/lib/build-ctx.mjs')], { cwd: ROOT, env, stdio: 'ignore' })
}
if (what === 'all' || what === 'stage') await stage()
const S = up()
try {
  await ready(PORT)
  const st = await state()
  if (what === 'all' || what === 'stage') await seed(st)
  if (what === 'all' || what === 'record') await (await import('./record.mjs')).record({ base: BASE, st, saveWork, out: F })
  if (what === 'all' || what === 'shots') await (await import('./capture.mjs')).capture({ base: BASE, st, out: F })
  if (KEEP) {
    say(`서버를 둔다 — ${BASE}  (Ctrl+C 로 끝)`)
    await new Promise(() => {})
  }
} catch (e) {
  console.error(S.err().slice(-2000))
  throw e
} finally {
  if (!KEEP) S.kill()
}
