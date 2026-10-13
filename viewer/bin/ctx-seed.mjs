// ctx seed · follow · update — 기존 문서 레포에서 지식 레포를 세우고, 정본 둘을 잇는다. 문서레포 세우기 검토 v0.1 §4.
//
//   ctx seed init|check [--from <문서 레포>]
//   ctx seed plan|apply --server <주소> --repo <레포> [--from …] [--at <sha>] [--stage baseline|managed|records] [--only <key|id>] [--date <YYYY-MM-DD>]
//   ctx seed verify --clone <지식 레포 클론> [--from …] [--at <sha>]
//   ctx follow --clone <클론> --since <sha> [--from …]
//   ctx update [--from …] <from sha> [<to sha>]   ·   ctx update --save <초안> [--server … --repo …] [--go]
//
// 원천 문서 레포는 **읽기만** 한다(git ls-tree · show). 쓰는 길은 서버의 기존 길 — MCP save · /assets · /baseline(검토 S3). 세우는 흔적은 기록이 아니라 _seed.json 하나다(S13).
// 판정(큐레이션)은 하지 않는다(S8) — apply 는 대기열을 세워 두고 끝난다.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { initMap, checkMap, seedApply, seedVerify, today } from '../../core/seedrun.js'
import { openSource, changedCoords, followReport, updateDraft, WHY_MARK, whyMissing } from '../../core/sourcerepo.js'

const NL = '\n'

// ── 원천 문서 레포 ──────────────────────────────────────────────────────────────

// 읽기는 core/sourcerepo.js 하나 — 서버의 MCP `source` 와 같은 함수(MCP 만으로 검토 M8). 여기는 작업 트리를 찾을 뿐
function source(opt) {
  const start = path.resolve(opt.from || process.cwd())
  let top
  try {
    top = execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
  } catch {
    throw new Error(`${start} 는 git 레포가 아니다 — --from <문서 레포>`)
  }
  return openSource({ top, at: opt.at || null })
}

// ── 서버 ──────────────────────────────────────────────────────────────────────

async function client(opt, map) {
  const server = String(opt.server || map?.target?.server || '').replace(/\/+$/, '')
  const repo = opt.repo || map?.target?.repo
  if (!server || !repo) throw new Error('--server <주소> --repo <레포> 가 필요하다(지도의 target 에 적어 둘 수 있다)')
  const token = String(process.env.CDP_TOKEN || '').trim() || (await (await import('../../core/tokenstore.js')).loadToken().catch(() => null))?.token
  if (!token) throw new Error('환경변수 CDP_TOKEN 이 없다')
  const auth = { authorization: 'Bearer ' + token }
  const rpc = async (name, args) => {
    const r = await fetch(`${server}/mcp/${encodeURIComponent(repo)}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { repo, ...args } } }),
    })
    const t = await r.text()
    const line = t.split(NL).find((l) => l.startsWith('data: '))
    const j = JSON.parse(line ? line.slice(6) : t)
    const txt = j?.result?.content?.[0]?.text
    let value = j
    if (txt) {
      try {
        value = JSON.parse(txt)
      } catch {
        value = { error: { code: 'RAW', message: txt.slice(0, 1500) } }
      }
    }
    return { error: !!j?.result?.isError || !!j?.error, value }
  }
  const post = async (sub, body, type = 'application/json') => {
    const r = await fetch(`${server}/api/${encodeURIComponent(repo)}/${sub}`, { method: 'POST', headers: { ...auth, 'content-type': type }, body: type === 'application/json' ? JSON.stringify(body) : body })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(`${sub} ${r.status} ${j?.error?.code || ''} ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`)
    return j
  }
  return { server, repo, rpc, post }
}

const errOf = (v) => v?.error || v
const codeOf = (v) => errOf(v)?.code || ''

// ── seed init · check · plan · apply · verify — 계산은 core/seedrun.js(서버의 MCP `source` 와 같은 함수 · M8) ──────

function runInit(opt, io) {
  const s = source(opt)
  if (s.map) throw new Error(`${s.mapPath} 가 이미 있다 — 고치려면 그 파일을 편집한다`)
  const map = initMap(s, { root: opt.root ?? '' })
  fs.writeFileSync(s.mapPath, JSON.stringify(map, null, 1) + NL)
  io.out(`ctx seed init: ${s.mapPath} — 문서 ${map.docs.length} · 기록 ${map.records.length} (뼈대다)`)
  io.out('  다음 — 분류(관리 문서 · 기록 · 들이지 않음) · 좌표 타입 · 서식 · 종류 · 기록 날짜 · touches 를 고친다(cdp-seed 스킬) → ctx seed check')
  return 0
}

function runCheck(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다 — ctx seed init`)
  const res = checkMap(s)
  io.out(`ctx seed check: ${s.top} @${s.at} — 문서 ${res.docs.length} · 섹션 ${res.docs.reduce((a, d) => a + d.sections, 0)} · 기록 ${res.records}`)
  for (const d of res.docs) io.out(`   ${d.key.padEnd(10)} 섹션 ${d.sections}`)
  for (const e of res.errors) io.out('   오류: ' + e)
  for (const w of res.warnings) io.out('   경고: ' + w)
  return res.errors.length ? 1 : 0
}

// 서버의 HTTP 길 — MCP save · section · brief · /assets · /baseline
async function runApply(opt, io, dry) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다 — ctx seed init`)
  const chk = checkMap(s)
  if (chk.errors.length) {
    for (const e of chk.errors) io.err('   오류: ' + e)
    throw new Error('지도 검사에 오류가 있다 — ctx seed check')
  }
  const c = await client(opt, s.map)
  const fail = (v) => Object.assign(new Error(errOf(v)?.message || ''), { code: codeOf(v), detail: errOf(v)?.detail, json: errOf(v) })
  const ops = {
    exists: async (coord) => {
      const r = await c.rpc('section', { coord })
      return !r.error && r.value && r.value.state !== 'missing' && r.value.content != null
    },
    upload: (rel, buf, type) => c.post('assets', buf, type),
    save: async (input) => {
      const r = await c.rpc('save', input)
      if (r.error) throw fail(r.value)
      return r.value
    },
    baseline: (body) => c.post('baseline', body),
    brief: async () => {
      const b = await c.rpc('brief', {})
      return b.error ? null : b.value
    },
  }
  await seedApply(s, ops, { dry, day: opt.date || today(), stage: opt.stage || null, only: opt.only || null, server: c.server, repo: c.repo, out: io.out })
  return 0
}

async function runVerify(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  if (!opt.clone) throw new Error('--clone <지식 레포 클론> 이 필요하다(git pull 해 둔 것)')
  const { loadRepo } = await import('../../core/repo.js')
  const r = await loadRepo(path.resolve(opt.clone))
  const v = seedVerify(s, r, { date: opt.date || today() })
  const dr = v.drift
  io.out(`ctx seed verify: ${s.top} @${s.at} ↔ ${opt.clone}`)
  io.out(`  섹션 — 같음 ${v.same} · 형식 차이 ${v.intent.length} · 확인 필요 ${v.off.length} · 위키에 없음 ${v.missing.length}`)
  for (const k of v.intent) io.out(`    형식 ${k.coord} — ${k.why}`)
  for (const k of v.off) io.out(`    확인 ${k} — 늦음(기록 없음 · ctx follow) 또는 틀림`)
  for (const k of v.missing) io.out(`    없음 ${k}`)
  io.out(`  대기 ${v.queue} · 미반영 섹션 ${v.pendingSections} · 검사 오류 ${v.checkErrors}`)
  io.out(`  drift — 근거 없음 ${dr.unsourced} · 복제 ${dr.duplicated} · 비대 ${dr.oversize} · 큼 ${dr.big} · 일지형 ${dr.diary} · 좌표 없는 기록 ${dr.unreachable}`)
  return v.ok ? 0 : 1
}

// ── follow ─────────────────────────────────────────────────────────────────

async function runFollow(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  if (!opt.since) throw new Error('--since <지난 점검 sha> 가 필요하다(처음은 세운 sha)')
  if (!opt.clone) throw new Error('--clone <지식 레포 클론> 이 필요하다')
  const { loadRepo } = await import('../../core/repo.js')
  const r = await loadRepo(path.resolve(opt.clone))
  const f = followReport(s, { since: opt.since, works: r.works })
  io.out(`ctx follow: ${opt.since}..${s.at} — 커밋 ${f.total}`)
  for (const c of f.commits) {
    if (c.skip) {
      io.out(`− 뺌 ${c.sha} ${c.date} ${c.subject}\n    ${c.skip}`)
      continue
    }
    io.out(`${c.ok ? '○' : '✗ 누락'} ${c.sha} ${c.date} ${c.subject}`)
    for (const y of c.coords) io.out(`    ${y.coord}${y.by.length ? ' ← ' + y.by.join(', ') : ' — 기록 없음'}`)
    if (c.records.length) io.out(`    판단 문서가 바뀜(새 기록 거리): ${c.records.join(', ')}`)
    if (c.outside.length) io.out(`    지도 밖 파일: ${c.outside.join(' · ')}`)
  }
  io.out(`커밋 ${f.total} · 누락 ${f.miss}${f.rate != null ? ` (${f.rate}%)` : ''}${f.skipped ? ` · 뺌 ${f.skipped}(지도의 skip)` : ''} — 누락은 같은 모양의 업데이트 기록으로 메운다(ctx update)`)
  return f.miss ? 1 : 0
}

// ── update ─────────────────────────────────────────────────────────────────

async function runUpdate(opt, io) {
  if (opt.saveDraft) {
    const draft = JSON.parse(fs.readFileSync(opt.saveDraft, 'utf8'))
    const work = draft.work || draft
    const vocab = draft.work ? draft.vocab || [] : []
    if (work.body.includes(WHY_MARK) || !/## 왜\n+\S/.test(work.body) || whyMissing(work)) throw new Error('「## 왜」 를 채우지 않았다 — 초안의 안내 줄을 지우고 이유를 쓴다')
    if (!work.touches?.length && !work.touchesEmpty) throw new Error('touches 가 비었다 — 바뀐 좌표가 없으면 touchesEmpty 에 사유')
    let map = null
    try {
      map = source(opt).map
    } catch {}
    const c = await client(opt, map)
    const input = { work, ...(vocab.length ? { vocab } : {}) }
    const d = await c.rpc('save', { ...input, dryRun: true })
    if (d.error) throw new Error('dryRun 거절 — ' + JSON.stringify(errOf(d.value)).slice(0, 1200))
    io.out(`ctx update --save: dryRun 통과${(d.value.warnings || []).length ? ' · 경고 ' + d.value.warnings.join(' / ').slice(0, 300) : ''}`)
    if (!opt.go) {
      io.out('  저장하려면 --go')
      return 0
    }
    const o = await c.rpc('save', input)
    if (o.error) throw new Error('거절 — ' + JSON.stringify(errOf(o.value)).slice(0, 1200))
    io.out(`  커밋 ${o.value.commit} — 대기열에 섰다. 반영은 큐레이터(cdp-curate)`)
    return 0
  }
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  const [from, to0] = opt.args.slice(1)
  if (!from) throw new Error('ctx update <작업 전 sha> [<작업 뒤 sha>]')
  const u = updateDraft(s, { from, to: to0 || 'HEAD' })
  const x = u
  const dir = path.join(s.top, '.cdp-updates')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${u.to}.json`)
  fs.writeFileSync(out, JSON.stringify({ work: u.work, ...(u.vocab.length ? { vocab: u.vocab } : {}) }, null, 1))
  let ignored = true
  try {
    s.git(['check-ignore', '-q', '.cdp-updates/x.json'])
  } catch {
    ignored = false
  }
  io.out(`ctx update: 초안 ${out}`)
  io.out(`  좌표 ${x.coords.length}${x.coords.length ? ' — ' + x.coords.join(' · ') : ''}${x.records.length ? ` · 바뀐 작업문서 ${x.records.length}` : ''}${x.outside.length ? ` · 지도 밖 ${x.outside.length}` : ''}`)
  if (!ignored) io.out('  알림 — .cdp-updates/ 가 .gitignore 에 없다(문서 레포에 커밋되지 않게 한 줄 더한다)')
  io.out(`  다음 — 「## 왜」 를 채우고  ctx update --save "${out}" --go`)
  return 0
}

// ── 들머리 ─────────────────────────────────────────────────────────────────

export async function runSeed(opt, io = {}) {
  io = { out: io.out || ((t = '') => process.stdout.write(t + NL)), err: io.err || ((t = '') => process.stderr.write(t + NL)) }
  try {
    if (opt.cmd === 'follow') return await runFollow(opt, io)
    if (opt.cmd === 'update') return await runUpdate({ ...opt, args: ['update', ...opt.args] }, io)
    const sub = opt.args[0]
    if (sub === 'init') return runInit(opt, io)
    if (sub === 'check') return runCheck(opt, io)
    if (sub === 'plan') return await runApply(opt, io, true)
    if (sub === 'apply') return await runApply(opt, io, !!opt.dry)
    if (sub === 'verify') return await runVerify(opt, io)
    io.err('ctx seed init|check|plan|apply|verify — ctx help')
    return 2
  } catch (e) {
    io.err(`ctx ${opt.cmd}${opt.args[0] && opt.cmd === 'seed' ? ' ' + opt.args[0] : ''}: ${e.message}`)
    return 1
  }
}

export { changedCoords }
