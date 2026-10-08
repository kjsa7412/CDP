// 데모 — 공식 사이트의 화면 · 예제를 만드는 한 줄.
//
//   node site/demo/run.mjs [all|stage|record|shots] [--keep] [--port 7390] [--only=<장 id 앞>]
//
//   stage   빈 틀 레포 둘 · 명부 넷(레포별 큐레이터) · 서버 · 줄거리(첫날 · 작업 기록 · 큐레이션 — 전부 save)
//   record  시나리오 다섯을 진짜 MCP 로 돌려 site/src/data/examples/*.json 으로
//   shots   화면 17장 × 라이트 · 다크 → site/public/shots/ (playwright-core + Edge)
//   all     셋을 차례로(기본)
//
// 판이 오르면 `npm run site:demo` 를 다시 돌리고 바뀐 PNG 를 넘겨 본다(제작 검토 v0.1 S14). 녹화 · 그림은 package.json 의
// 판을 적는다 — 판을 올린 뒤에 돌린다. 작업 폴더는 `ops/out/site-demo/` — 토큰도 거기에만 있고 레포에 들어가지 않는다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT, FORMS, KIT, ctx, serve, ready, call, progressLine, withProgress, judgmentTable } from './lib.mjs'
import { PEOPLE, REPOS, TIMELINES, DRAFT, headingOf } from './content.mjs'

const argv = process.argv.slice(2)
const what = argv.find((a) => !a.startsWith('--')) || 'all'
const PORT = Number(argv[argv.indexOf('--port') + 1]) || 7390
const KEEP = argv.includes('--keep')
const OUT = path.join(ROOT, 'ops', 'out', 'site-demo')
const F = { repos: path.join(OUT, 'repos'), data: path.join(OUT, 'data'), auth: path.join(OUT, 'auth.json'), state: path.join(OUT, 'state.json') }
const BASE = `http://127.0.0.1:${PORT}`
const say = (s) => console.log('[site:demo] ' + s)

// 줄거리의 기록 · 어휘 — id 로 찾는다(녹화가 더한 기록은 `extra` 로 넘긴다)
const RECORDS = new Map(Object.values(TIMELINES).flatMap((list) => list.filter((e) => e.kind !== 'curate').map((e) => [e.id, e])))
const LABELS = new Map(Object.values(TIMELINES).flatMap((list) => list.flatMap((e) => e.vocab || [])).map((v) => [v.coord, v.label]))

// ── 판 세우기 ───────────────────────────────────────────────────────────────

async function stage() {
  await fs.rm(OUT, { recursive: true, force: true })
  await fs.mkdir(F.repos, { recursive: true })
  // 레포는 빈 틀로 선다(v1.0 §8.2) — 콘솔 「새 지식 레포」 와 같은 함수
  for (const r of REPOS) await ctx('repo', 'new', path.join(F.repos, r.name), '--title', r.title, '--author', 'lead')
  // 명부 — 이 세션에서 만드는 시험 값이다. 토큰은 ops/out 밑 state.json 에만 둔다
  const tokens = {}
  for (const u of PEOPLE) {
    await ctx('serve', 'user', 'add', '--auth', F.auth, '--data', F.data, '--name', u.name, '--label', u.label, '--role', u.role, '--repos', u.repos, ...(u.curate ? ['--curate', u.curate] : []))
    tokens[u.name] = (await ctx('serve', 'token', '--auth', F.auth, '--data', F.data, '--user', u.name, '--note', '데모')).stdout.trim()
  }
  await fs.writeFile(F.state, JSON.stringify({ port: PORT, tokens, changes: {} }, null, 2))
  say(`레포 ${REPOS.map((r) => r.name).join(' · ')} (빈 틀) · 명부 ${PEOPLE.map((u) => u.name + (u.curate ? `(큐레이터 ${u.curate})` : '')).join(' · ')}`)
}

export async function state() {
  return JSON.parse(await fs.readFile(F.state, 'utf8'))
}
const saveState = (st) => fs.writeFile(F.state, JSON.stringify(st, null, 2))

export function up() {
  return serve([
    '--root', F.repos,
    '--port', String(PORT),
    '--auth', F.auth,
    '--data', F.data,
    '--web', path.join(ROOT, 'ops/out/web'),
    '--manual', path.join(ROOT, 'site/demo/manual'),
    '--forms', FORMS,
    '--kit', KIT,
  ])
}

// ── save 세 가지 — 사람(에이전트)이 하는 순서 그대로 ───────────────────────────

// 첫날 — 큐레이터의 save 한 번. 등록부 행과 서식에서 찍은 빈 문서 · 어휘 · 대상 초안 · 등록부 기록(대기열에 서지 않는다)
export async function firstSave(st, repo, f) {
  const sections = f.drafts.map((coord) => ({ coord, applied: null, heading: headingOf(coord, LABELS.get(coord)), body: DRAFT }))
  const work = { id: f.id, title: f.title, date: f.date, touchesEmpty: f.touchesEmpty, tags: f.tags, body: f.body }
  const r = await call(BASE, repo, st.tokens[f.by], 'save', { repo, work, managed: f.managed, vocab: f.vocab, sections })
  return { ...r, work, sections }
}

// writer 의 기록 — work · vocab 만(sections 를 보내면 E_FORBIDDEN — ③ 이 일부러 보낸다)
export async function writerSave(st, repo, w, { sections = null, vocab = true } = {}) {
  const work = { id: w.id, title: w.title, date: w.date, ...(w.touches?.length ? { touches: w.touches } : { touchesEmpty: w.touchesEmpty }), tags: w.tags, body: w.body }
  if (w.supersedes) work.supersedes = w.supersedes
  const args = { repo, work, ...(vocab && w.vocab ? { vocab: w.vocab } : {}), ...(sections ? { sections } : {}) }
  const r = await call(BASE, repo, st.tokens[w.by], 'save', args)
  return { ...r, work }
}

// 큐레이션 — 판정마다 into 의 섹션을 읽고(applied 는 잠금 값 그대로) 반영한 본문 + 경과 한 줄로 보낸다. 큐레이션 기록 하나와 한 커밋
//   bodyOf(coord, cur)  본문을 대신 정한다(④ — 거절에 실려 온 지금 본문 위에 다시 만든다)
//   applied             좌표 → 보낼 applied(④ — 처음 읽은 낡은 값)
//   base                좌표 → 그 전의 경과 줄(④ — 처음 읽은 때의 경과 위에 만든 낡은 본문)
//   extra               녹화가 더한 기록(줄거리에 없는 것)
export async function curatorSave(st, repo, c, { bodyOf = null, applied = {}, base = {}, extra = [] } = {}) {
  const tk = st.tokens[c.by]
  const find = (id) => extra.find((x) => x.id === id) || RECORDS.get(id)
  const coords = []
  for (const j of c.judgments) for (const x of j.verdict === 'keep' ? [] : j.into) if (!coords.includes(x)) coords.push(x)
  const sections = []
  const added = {}
  for (const coord of coords) {
    const cur = (await call(BASE, repo, tk, 'section', { coord })).res
    const recs = c.judgments.filter((j) => j.verdict !== 'keep' && j.into.includes(coord)).map((j) => find(j.id)).sort((a, b) => (a.date < b.date ? -1 : 1))
    const last = recs[recs.length - 1]
    const body = bodyOf?.(coord, cur) ?? last?.secs?.[coord]?.[0]
    if (body == null) throw new Error(`${c.id} — ${last?.id} 에 ${coord} 의 본문이 없다(content.mjs 의 secs)`)
    added[coord] = recs.map((w) => progressLine(w, w.secs?.[coord]?.[1] || w.title))
    const missing = cur.body == null
    sections.push({
      coord,
      applied: coord in applied ? applied[coord] : missing ? null : cur.applied ?? null,
      ...(missing ? { heading: headingOf(coord, LABELS.get(coord)) } : {}),
      body: withProgress(body, [...(base[coord] || st.changes[repo + ' ' + coord] || []), ...added[coord]]),
    })
  }
  const newDocs = (c.managed || []).filter((m) => m.form).map((m) => `${m.doc}(서식 ${m.form})`)
  const work = { id: c.id, title: c.title, date: c.date, curates: c.judgments, body: judgmentTable(c, { sections: sections.length, newDocs }) }
  const r = await call(BASE, repo, tk, 'save', { repo, work, sections, ...(c.managed ? { managed: c.managed } : {}) })
  if (r.res.commit) for (const coord of coords) (st.changes[repo + ' ' + coord] ||= []).push(...added[coord])
  return { ...r, work, sections }
}

async function seed(st) {
  for (const [repo, list] of Object.entries(TIMELINES)) {
    const n = { first: 0, work: 0, curate: 0 }
    for (const e of list) {
      const r = e.kind === 'first' ? await firstSave(st, repo, e) : e.kind === 'work' ? await writerSave(st, repo, e) : await curatorSave(st, repo, e)
      if (!r.res.commit) throw new Error(`${repo} ${e.id} — ${e.kind} save 실패: ${JSON.stringify(r.res.error || r.res).slice(0, 600)}`)
      n[e.kind]++
    }
    const q = (await call(BASE, repo, st.tokens.lead, 'queue', { repo })).res
    say(`${repo}: 첫날 ${n.first} · 작업 기록 ${n.work} · 큐레이션 ${n.curate} — 대기 ${q.total} (가장 오래된 ${q.oldestDays}일)`)
  }
  await saveState(st)
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
  if (what === 'all' || what === 'record') await (await import('./record.mjs')).record({ base: BASE, st, out: F, saves: { writerSave, curatorSave }, saveState })
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
