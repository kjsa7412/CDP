// ctx ingest — 문서 · 폴더 · git 레포의 작업 문서를 작업 기록으로 들인다. 지식 생성 · 작업실 검토 v0.1 §4 · G5~G9 · G12 · G16 · G17.
//
//   ctx ingest <파일 · 폴더>… --repo <레포> [--server <주소>] [--glob <p>]… [--exclude <p>]… [--max-files N] [--json]
//                                            계획(기본) — 무엇이 어떤 기록이 되나. 쓰지 않는다 · LLM 을 부르지 않는다
//   ctx ingest <…> --repo <레포> --analyze [--budget <토큰>] [--concurrency 2] [--redo <경로>] [--model <m>]
//                                            판단 — 파일마다 사용자의 `claude -p` 가 성격 · 나눔 · 날짜 · 좌표 후보를 낸다(쓰지 않는다)
//   ctx ingest <…> --repo <레포> --review    승인 표(review.md)를 짓고 보인다 — 체크한 좌표 · 어휘만 들어간다
//   ctx ingest <…> --repo <레포> --apply [--approve registered] [--no-llm] [--yes]
//                                            들인다 — 서버의 묶음 save(/api/<레포>/records · 20건씩 · 한 묶음 한 커밋)
//   ctx ingest <…> --repo <레포> --status    이 PC 의 원장 ↔ 서버의 기록(대기 · 반영 · 기록으로 둠) ↔ 원본(바뀐 것 · 새것)
//   ctx ingest doctor [--live]               node · git · claude · 서버 · 토큰 · 변환기
//   ctx ingest list                          이 PC 의 run
//
// **결과는 언제나 작업 기록이다** — 대기열에 서고 관리 문서 반영은 큐레이터가 한다(G5). 좌표는 추측하지 않는다 — 판단 단계는
// 후보와 인용만 내고, 사람이 review.md 에서 체크한 것만 touches 로 올린다(G7). 고르지 않은 후보는 태그 `touches?/…`.
// 판단 없이(`--no-llm` · 판단을 안 돌린 파일) 들이면 좌표 없이 들어가고 원문의 좌표는 태그 `touches/…`.
//
// 상태는 **이 PC 에만** 둔다 — `~/.cdp/ingest/<run>/`(CDP_INGEST_DIR): run.json · ledger.json · draft/<blob>.json · review.md.
// 원천에도 지식 레포에도 쓰지 않는다(I9). 진행은 서버의 잡(`/api/<레포>/jobs`)에 보고한다 — 화면 작업실 › 지식 생성이 그것을 그린다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { execFile, spawn } from 'node:child_process'
import { planIngest, runHash, runIdOf } from '../../core/ingest.js'
import { tools as convTools } from '../../core/convert.js'
import { buildPrompt, extractJson, checkDraft, reviewText, parseReview, recordsFrom, runClaude, claudeCommand } from '../../core/judge.js'
import { findKitDir } from '../../core/kit.js'
import { RECORDS_MAX } from '../../core/save.js'
import { toError } from '../../core/errors.js'
import { resolveClient, client } from './ctx-login.mjs'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)
const width = (s) => [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
const pad = (s, n) => String(s ?? '') + ' '.repeat(Math.max(0, n - width(s)))
const BATCH_BYTES = 1_500_000

export const stateRoot = (env = process.env) => env.CDP_INGEST_DIR || path.join(os.homedir(), '.cdp', 'ingest')

const USAGE = [
  'ctx ingest <파일 · 폴더>… --repo <레포> [--server <주소>] [--glob <p>]… [--exclude <p>]… [--max-files N]   계획(쓰지 않는다)',
  'ctx ingest <…> --repo <레포> --analyze [--budget <토큰>]   판단 — claude -p 가 좌표 후보를 낸다(쓰지 않는다)',
  'ctx ingest <…> --repo <레포> --review                       승인 표(review.md) — 체크한 것만 들어간다',
  'ctx ingest <…> --repo <레포> --apply [--approve registered] [--yes]   들인다 — 작업 기록으로(대기열 → 큐레이터)',
  'ctx ingest <…> --repo <레포> --status   ·   ctx ingest doctor [--live]   ·   ctx ingest list',
  '  서버 · 토큰은 ctx login --server <주소> 로 한 번 · LLM 은 이 PC 의 claude(로그인은 claude 를 한 번 켜서)',
].join(NL)

const readJson = (f) => fs.readFile(f, 'utf8').then(JSON.parse).catch(() => null)
const writeJson = async (f, v) => {
  await fs.mkdir(path.dirname(f), { recursive: true })
  const tmp = f + '.' + process.pid
  await fs.writeFile(tmp, JSON.stringify(v, null, 1) + NL)
  await fs.rename(tmp, f)
}
const keyOf = (f) => f.name + '/' + f.rel

async function isKnowledgeRepo(dir) {
  const has = (n) => fs.access(path.join(dir, n)).then(() => true).catch(() => false)
  return (await has('_vocab.md')) && (await has('_managed.md'))
}

async function confirm(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const a = await new Promise((res) => rl.question(q, res))
  rl.close()
  return /^(y|yes|예|네|ㅇ)$/i.test(String(a).trim())
}

// 서버의 잡 — 진행 보고(화면이 그린다). 서버가 잡을 모르면(옛 판) 조용히 건너뛴다 — 실행의 정본은 이 PC 의 상태 폴더다(G9)
function jobReporter(api, base, job) {
  let on = !!(api && job)
  const send = async (sub, body) => {
    if (!on) return
    const r = await api.post(`${base}/jobs/${encodeURIComponent(job)}/${sub}`, body)
    if (r.status === 404 || r.status === 405) on = false
  }
  return { id: job, report: (files, phase) => send('report', { phase, files }), done: (state) => send('done', { state }) }
}

export async function runIngest(opt, env = process.env) {
  if (opt.args[0] === 'list') return listRuns(env)
  if (opt.args[0] === 'doctor') return doctor(opt, env)
  const inputs = opt.args
  if (!inputs.length || !opt.repo) {
    err(USAGE)
    return 2
  }
  // 지식 레포를 들이지 않는다 — 그건 다시 세우기(ctx repo new --records-from)다
  for (const i of inputs) {
    const abs = path.resolve(i)
    if ((await fs.stat(abs).then((s) => s.isDirectory()).catch(() => false)) && (await isKnowledgeRepo(abs))) {
      err(`ctx ingest: ${abs} 는 지식 레포다 — 들일 원천이 아니다(옮겨 세우기는 ctx repo new --records-from)`)
      return 2
    }
  }
  const include = opt.globs || []
  const exclude = opt.excludes || []
  const hash = runHash({ inputs, include, exclude, repo: opt.repo })
  const dir = path.join(stateRoot(env), hash)
  const prior = await readJson(path.join(dir, 'run.json'))
  const created = prior?.created ? Date.parse(prior.created) : Date.now()
  const runId = prior?.runId || runIdOf(hash, created)
  const ledger = (await readJson(path.join(dir, 'ledger.json'))) || { files: {} }

  // 서버 — 계획에도 쓴다(이미 들인 것 · 이전 판 · 이 레포의 LLM 허용). 닿지 않으면 이 PC 의 원장만으로
  const { server, token } = await resolveClient(opt, env)
  const api = server && token ? client(server, token) : null
  const base = `/api/${encodeURIComponent(opt.repo)}`
  let known = Object.entries(ledger.files)
    .filter(([, v]) => v.id && v.blob && v.state !== 'failed')
    .map(([k, v]) => ({ name: k.slice(0, k.indexOf('/')), path: k.slice(k.indexOf('/') + 1), blob: v.blob, id: v.id }))
  let serverNote = null
  let policy = { llm: true }
  if (api) {
    const r = await api.get(base + '/sources')
    if (r.ok) {
      known = [...(r.body.sources || []).map((s) => ({ name: s.name, path: s.path, blob: s.blob, id: s.id, state: s.state })), ...known]
      if (r.body.policy) policy = { ...policy, ...r.body.policy }
    } else serverNote = r.status === 0 ? r.body.error.message : `서버가 들인 기록 목록을 주지 않았다 — ${r.body?.error?.message || 'HTTP ' + r.status}`
  } else serverNote = !server ? '붙을 서버를 모른다 — ctx login --server <주소>' : '토큰이 없다 — ctx login'

  let plan
  try {
    // 변환기 — docx · xlsx · pptx · hwpx 는 Node 로 늘 · pdf(pdftotext) · doc · hwp(soffice) 는 이 PC 에 있을 때
    const have = await convTools(env)
    plan = await planIngest(inputs, { include, exclude, maxFiles: opt.maxFiles ? Number(opt.maxFiles) : undefined, runId, known, have })
  } catch (e) {
    err('ctx ingest: ' + toError(e).message)
    return 2
  }
  const run = { hash, runId, created: new Date(created).toISOString(), inputs: inputs.map((x) => path.resolve(x)), include, exclude, repo: opt.repo, server, job: opt.job || prior?.job || null }
  await writeJson(path.join(dir, 'run.json'), run)

  // 판단 초안 — 원본(blob)마다 한 벌. 있으면 계획의 행에 붙인다
  const records = plan.files.filter((f) => f.kind === 'record')
  for (const f of records) {
    const d = await readJson(path.join(dir, 'draft', f.blob + '.json'))
    if (!d?.draft) continue
    try {
      f.draft = checkDraft(d.draft, { lines: f.lines })
    } catch (e) {
      f.draftError = e.message
    }
  }

  if (opt.status) return status(plan, { api, base, runId, ledger, serverNote, dir })

  if (opt.json && !opt.apply && !opt.analyze) {
    out(JSON.stringify({ ...plan, files: plan.files.map(({ work, bodyText, assets, ...f }) => ({ ...f, assets: (assets || []).map(({ abs, buf, ...a }) => a) })) }, null, 2))
    return 0
  }
  printPlan(plan, { runId, dir, serverNote })

  // 잡 — 판단 · 적용을 하면 서버에 보고한다(없으면 만든다)
  let job = null
  if ((opt.analyze || opt.apply) && api) {
    if (!run.job) {
      const single = inputs.length === 1 && (await fs.stat(path.resolve(inputs[0])).then((s) => s.isFile()).catch(() => false))
      const kind = single ? 'file' : plan.roots.some((r) => r.git) ? 'git' : 'folder'
      const r = await api.post(base + '/jobs', { kind, path: inputs.map((x) => path.resolve(x)).join(' · '), runId, options: { llm: !!opt.analyze } })
      if (r.ok && r.body?.id) {
        run.job = r.body.id
        await writeJson(path.join(dir, 'run.json'), run)
      }
    }
    job = jobReporter(api, base, run.job)
    await job.report(
      plan.files.map((f) => ({ rel: f.rel, status: f.kind === 'record' ? (f.draft ? 'drafted' : 'planned') : f.kind === 'have' ? 'have' : f.kind === 'asset' ? 'asset' : 'skipped', ...(f.reason ? { reason: f.reason } : {}), ...(f.id ? { id: f.id } : {}), ...(f.draft ? draftReport(f.draft) : {}) })),
      'plan'
    )
  }

  if (opt.analyze) {
    if (policy.llm === false) {
      err('ctx ingest --analyze: 이 레포는 LLM 판단을 쓰지 않는다(서버 설정) — --no-llm 으로 좌표 없이 들이고 큐레이터가 판정한다')
      await job?.done('failed')
      return 2
    }
    const code = await analyze(records, { opt, env, dir, server, token, repo: opt.repo, job })
    await writeReview(records, dir)
    if (records.some((f) => f.draft)) out(NL + `다음 — ${path.join(dir, 'review.md')} 에서 체크를 고친 뒤 --apply(그대로 두면 등재된 좌표 + 인용 있는 것만 들어간다)`)
    else out(NL + '다음 — 판단한 것이 없다. 위 까닭(claude 로그인 · 설치)을 고치고 같은 명령을 다시 돌린다 · 판단 없이 들이려면 --apply --no-llm')
    await job?.done(code ? 'partial' : 'review')
    return code
  }
  if (opt.review) {
    const f = await writeReview(records, dir)
    out(NL + (await fs.readFile(f, 'utf8')))
    out(`승인 표 — ${f}`)
    return 0
  }
  if (!opt.apply) {
    if (records.length) {
      const n = records.filter((f) => f.draft).length
      out(NL + `다음 — ${n ? `판단 ${n}건 · ` : ''}--analyze 로 좌표 후보를 받거나(claude -p) · --apply 로 들인다(대기열 → 큐레이터)`)
    }
    return 0
  }

  // ── 적용 ──
  if (!api) {
    err('ctx ingest --apply: ' + serverNote)
    return 2
  }
  const approvals = parseReview(await fs.readFile(path.join(dir, 'review.md'), 'utf8').catch(() => ''))
  // 화면의 승인(작업실 › 지식 생성 › 잡) — 있으면 그 파일은 review.md 보다 먼저다(G17 · 승인은 화면 · 적용은 CLI)
  let fromScreen = 0
  if (run.job) {
    const r = await api.get(`${base}/jobs/${encodeURIComponent(run.job)}`)
    for (const [rel, a] of Object.entries(r.ok ? r.body.approvals || {} : {})) {
      const f = records.find((x) => x.rel === rel)
      if (!f) continue
      approvals.set(keyOf(f), { coords: a.coords || {}, vocab: a.vocab || {}, force: !!a.force })
      fromScreen++
    }
    if (fromScreen) out(`화면의 승인 ${fromScreen}건을 쓴다(작업실 › 지식 생성)`)
  }
  const items = []
  const vocab = new Map()
  const notes = []
  const skips = []
  for (const f of records) {
    let useDraft = f.draft && !opt.noLlm
    if (useDraft && policy.llm === false) {
      notes.push(`${f.rel}: 이 레포는 LLM 판단을 쓰지 않아 판단 없이 들인다`)
      useDraft = false
    }
    const r = recordsFrom(f, useDraft ? f.draft : null, approvals.get(keyOf(f)) || null, { approve: opt.approve || null })
    notes.push(...r.warnings)
    if (r.skip) {
      f.kind = 'skip'
      f.reason = r.skip
      skips.push({ rel: f.rel, status: 'skipped', reason: r.skip })
      continue
    }
    for (const v of r.vocab) vocab.set(v.coord, { coord: v.coord, ...(v.label ? { label: v.label } : {}), ...(v.aliases.length ? { aliases: v.aliases } : {}) })
    for (const w of r.works) items.push({ f, work: w.work, assets: w.assets })
  }
  for (const n of notes.slice(0, 20)) out('[주의] ' + n)
  if (skips.length) await job?.report(skips, 'apply')
  if (!items.length) {
    out(NL + '들일 것이 없다.')
    await job?.done('saved')
    return 0
  }
  if (!opt.yes) {
    if (!process.stdin.isTTY) {
      err('ctx ingest --apply: 터미널이 아니다 — 확인 없이 들이려면 --yes')
      return 2
    }
    const coords = items.reduce((a, x) => a + (x.work.touches || []).length, 0)
    if (!(await confirm(NL + `작업 기록 ${items.length}건(좌표 ${coords}${vocab.size ? ` · 어휘 더하기 ${vocab.size}` : ''})을 ${opt.repo} 에 들인다. 계속할까? [y/N] `))) {
      out('그만뒀다 — 아무것도 쓰지 않았다')
      return 0
    }
  }
  const code = await apply(items, { api, base, ledger, dir, runId, repo: opt.repo, vocab: [...vocab.values()], job })
  await job?.done(code ? 'partial' : 'saved')
  return code
}

function printPlan(plan, { runId, dir, serverNote }) {
  const s = plan.summary
  for (const r of plan.roots) out(`원천  ${r.root}${r.git ? `  (git ${r.git.head || ''} · 날짜 · 작성자를 이력에서)` : ''}`)
  out(`run   ${runId}  (상태 ${dir})`)
  const rec = plan.files.filter((f) => f.kind === 'record')
  const drafted = rec.filter((f) => f.draft).length
  out(`기록 ${s.records} · 이미 들임 ${s.have} · 첨부 ${s.assets} · 건너뜀 ${s.skipped}${s.prev ? ` · 이전 판이 있는 것 ${s.prev}` : ''}${drafted ? ` · 판단 ${drafted}` : ''}`)
  if (s.records) out(`날짜 근거  ${Object.entries(s.dateSources).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  if (serverNote) out('[주의] ' + serverNote + ' — 이 PC 의 원장만 보고 「이미 들임」 을 셌다')
  if (rec.length) {
    out('')
    out(`${pad('날짜', 12)}${pad('근거', 12)}${pad('첨부', 6)}${pad('판단', 10)}${pad('→ 작업 기록 id', 64)}원문`)
    for (const f of rec.slice(0, 40)) {
      const j = f.draft ? `${f.draft.nature}${f.draft.records.length > 1 ? '·' + f.draft.records.length : ''}` : f.draftError ? '깨짐' : ''
      out(`${pad(f.date.slice(0, 10), 12)}${pad(f.dateSource, 12)}${pad(f.assets.length || '', 6)}${pad(j, 10)}${pad(f.id, 64)}${f.rel}${f.prev ? '  (이전 판 ' + f.prev + ')' : ''}`)
    }
    if (rec.length > 40) out(`… ${rec.length - 40}건 더 (--json 으로 전체)`)
  }
  const skipped = plan.files.filter((f) => f.kind === 'skip' || f.kind === 'have')
  if (skipped.length) {
    out('')
    const by = new Map()
    for (const f of skipped) by.set(f.reason, [...(by.get(f.reason) || []), f.rel])
    for (const [why, rels] of by) out(`건너뜀 ${rels.length} — ${why}: ${rels.slice(0, 3).join(' · ')}${rels.length > 3 ? ' …' : ''}`)
  }
  const warned = rec.filter((f) => f.warnings.length)
  if (warned.length) {
    out('')
    for (const f of warned.slice(0, 20)) for (const w of f.warnings) out(`[주의] ${f.rel}: ${w}`)
    if (warned.length > 20) out(`[주의] … ${warned.length - 20}건 더`)
  }
}

// ── 판단 ────────────────────────────────────────────────────────────────────

// 잡에 싣는 초안 — 화면의 승인 표 재료(후보 · 인용 · 어휘 제안). 원문은 싣지 않는다
const draftReport = (d) => ({
  nature: d.nature,
  coords: d.records.flatMap((x) => x.touches.map((t) => t.coord)).slice(0, 20),
  draft: {
    nature: d.nature,
    why: d.why || null,
    records: d.records.map((r) => ({ lines: r.lines, title: r.title, date: r.date, touches: r.touches, excluded: r.excluded, open: r.open })),
    vocab: d.vocab,
  },
})

async function analyze(records, { opt, env, dir, server, token, repo, job }) {
  if (!server || !token) {
    err('ctx ingest --analyze: 서버 · 토큰이 있어야 한다(claude 가 MCP 로 어휘를 대조한다) — ctx login')
    return 2
  }
  const kit = await findKitDir({ env })
  const rules = kit ? await fs.readFile(path.join(kit.dir, 'skills', 'cdp-save', '편입.md'), 'utf8').catch(() => null) : null
  if (!rules) {
    err('ctx ingest --analyze: 편입 규칙(kit 의 skills/cdp-save/편입.md)을 찾지 못했다 — 서버 산출물의 kit/ 이 번들 옆에 있어야 한다(CDP_KIT)')
    return 2
  }
  const redo = new Set((opt.redo ? [opt.redo] : []).map((x) => x.replace(/\\/g, '/')))
  const todo = records.filter((f) => !f.draft || redo.has(f.rel))
  if (!todo.length) {
    out(NL + '판단할 것이 없다 — 이미 다 했다(다시 하려면 --redo <경로>)')
    return 0
  }
  const budget = opt.budget ? Number(opt.budget) : Infinity
  const conc = Math.max(1, Math.min(4, Number(opt.concurrency) || 2))
  // MCP 설정 — 이 run 의 상태 폴더에만 · 끝나면 지운다(토큰이 든다)
  const mcp = path.join(dir, 'mcp.json')
  await fs.mkdir(path.join(dir, 'conv'), { recursive: true })
  await fs.writeFile(mcp, JSON.stringify({ mcpServers: { cdp: { type: 'http', url: `${server}/mcp/${encodeURIComponent(repo)}`, headers: { Authorization: 'Bearer ' + token } } } }), { mode: 0o600 })
  let used = 0
  let failed = 0
  let stopped = false
  const cc = claudeCommand(env)
  out(NL + `판단 ${todo.length}건 — ${cc.pre[0] || cc.cmd} -p · 동시 ${conc}${Number.isFinite(budget) ? ` · 상한 ${budget.toLocaleString()} 토큰` : ''}`)
  const one = async (f) => {
    const file = f.blob + '.md'
    await fs.writeFile(path.join(dir, 'conv', file), f.bodyText + NL)
    const prompt = buildPrompt({ rules, file, rel: f.rel, repo, lines: f.lines, title: f.title })
    let last = null
    for (let tries = 0; tries < 2; tries++) {
      const r = await runClaude({ prompt: tries ? prompt + NL + NL + `앞 답이 틀렸다 — ${last}. JSON 하나만 다시.` : prompt, cwd: path.join(dir, 'conv'), mcpConfig: mcp, env, model: opt.model || null })
      if (!r.ok) {
        last = r.error
        if (/로그인|찾지 못했다/.test(r.error)) break
        continue
      }
      used += r.usage || 0
      try {
        const raw = extractJson(r.text)
        f.draft = checkDraft(raw, { lines: f.lines })
        await writeJson(path.join(dir, 'draft', f.blob + '.json'), { draft: raw, rel: f.rel, at: new Date().toISOString(), usage: r.usage, cost: r.cost })
        out(`  ✓ ${f.rel} — ${f.draft.nature}${f.draft.records.length > 1 ? ` · ${f.draft.records.length}개로` : ''} · 좌표 후보 ${f.draft.records.reduce((a, x) => a + x.touches.length, 0)}`)
        await job?.report([{ rel: f.rel, status: 'drafted', ...draftReport(f.draft) }], 'analyze')
        return
      } catch (e) {
        last = e.message
      }
    }
    failed++
    f.draftError = last
    out(`  ✗ ${f.rel} — ${last}`)
    await job?.report([{ rel: f.rel, status: 'failed', error: last }], 'analyze')
  }
  try {
    const queue = [...todo]
    await Promise.all(
      Array.from({ length: conc }, async () => {
        while (queue.length && !stopped) {
          if (used >= budget) {
            stopped = true
            break
          }
          await one(queue.shift())
        }
      })
    )
  } finally {
    await fs.rm(mcp, { force: true })
  }
  if (stopped) out(`상한(${budget.toLocaleString()} 토큰)에 닿아 멈췄다 — 남은 것은 같은 명령으로 이어 한다`)
  out(`판단 끝 — 토큰 ${used.toLocaleString()} · 실패 ${failed}`)
  return failed ? 1 : 0
}

async function writeReview(records, dir) {
  const f = path.join(dir, 'review.md')
  const prev = parseReview(await fs.readFile(f, 'utf8').catch(() => ''))
  const items = records.map((r) => ({ key: keyOf(r), rel: r.rel, title: r.title, draft: r.draft || null, why: r.draftError ? `판단이 깨졌다 — ${r.draftError}` : null, state: prev.get(keyOf(r)) || null }))
  await fs.mkdir(dir, { recursive: true })
  await fs.writeFile(f, reviewText(items))
  return f
}

// ── 적용 ────────────────────────────────────────────────────────────────────

// 묶음 — 20건 이하 · 몸통 1.5 MB 이하
function batchesOf(list) {
  const out = []
  let cur = []
  let bytes = 0
  for (const x of list) {
    const b = Buffer.byteLength(JSON.stringify(x.work), 'utf8')
    if (cur.length && (cur.length >= RECORDS_MAX || bytes + b > BATCH_BYTES)) {
      out.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(x)
    bytes += b
  }
  if (cur.length) out.push(cur)
  return out
}

async function apply(items, { api, base, ledger, dir, runId, repo, vocab = [], job }) {
  let saved = 0
  let skipped = 0
  const failed = []
  const reports = []
  const mark = async (x, v) => {
    const k = keyOf(x.f)
    const cur = ledger.files[k]?.blob === x.f.blob ? ledger.files[k] : null
    const ids = [...new Set([...(cur?.ids || (cur?.id ? [cur.id] : [])), ...(v.state === 'failed' ? [] : [x.work.id])])]
    const state = v.state === 'failed' && cur?.state === 'saved' ? 'saved' : v.state
    ledger.files[k] = { blob: x.f.blob, id: ids[0] ?? x.work.id, ids, state, ...(v.existing ? { existing: v.existing } : {}), ...(v.error ? { error: v.error } : {}), at: new Date().toISOString() }
    await writeJson(path.join(dir, 'ledger.json'), ledger)
    reports.push({ rel: x.f.rel, status: v.state === 'skipped' ? 'exists' : v.state, id: x.work.id, ...(v.error ? { error: v.error } : {}) })
  }
  let vocabLeft = vocab
  let first = true
  for (const batch of batchesOf(items)) {
    // 첨부 — 먼저 올리고 ref 를 싣는다(같은 내용은 서버가 한 번만 든다)
    const body = []
    const sent = []
    for (const x of batch) {
      const assets = []
      let bad = null
      for (const a of x.assets) {
        const up = await api.postBin(base + '/assets', a.buf || (await fs.readFile(a.abs)))
        if (!up.ok) {
          bad = `첨부 ${a.rel} 를 올리지 못했다 — ${up.body?.error?.message || 'HTTP ' + up.status}`
          break
        }
        assets.push({ ref: up.body.ref, name: a.name })
      }
      if (bad) {
        failed.push({ x, why: bad })
        await mark(x, { state: 'failed', error: bad })
        continue
      }
      body.push({ work: x.work, ...(assets.length ? { assets } : {}) })
      sent.push(x)
    }
    // 어휘 더하기 — 이 묶음의 좌표가 쓰는 것 · 어느 기록도 안 쓰는 것은 첫 묶음에
    const uses = new Set(sent.flatMap((x) => x.work.touches || []))
    const anyUse = new Set(items.flatMap((x) => x.work.touches || []))
    const vb = vocabLeft.filter((v) => uses.has(v.coord) || (first && !anyUse.has(v.coord)))
    first = false
    let left = sent
    let rec = body
    for (let tries = 0; rec.length && tries < 2; tries++) {
      const r = await api.post(base + '/records', { records: rec, skipExisting: true, ...(vb.length ? { vocab: vb } : {}) })
      if (r.ok) {
        vocabLeft = vocabLeft.filter((v) => !vb.includes(v))
        const ids = new Set(r.body.ids || [])
        const skip = new Map((r.body.skipped || []).map((y) => [y.id, y]))
        for (const x of left) {
          if (ids.has(x.work.id)) {
            saved++
            await mark(x, { state: 'saved' })
          } else if (skip.has(x.work.id)) {
            skipped++
            await mark(x, { state: 'skipped', existing: skip.get(x.work.id).existing })
          }
        }
        out(`묶음 ${left.length}건 — 들임 ${ids.size} · 건너뜀 ${skip.size}${r.body.vocab ? ` · 어휘 ${r.body.vocab}` : ''}${r.body.commit ? ' · ' + r.body.commit : ''}`)
        for (const w of r.body.warnings || []) if (!/^touches 가 비어/.test(w)) out(`  [주의] ${w}`)
        break
      }
      const e = r.body?.error || {}
      // 검사 오류 — 그 기록만 빼고 다시 한 번(전부 또는 전무라 나머지는 아직 안 들어갔다)
      const blame = e.code === 'E_CHECK' ? new Set(e.detail?.ids || []) : e.detail?.id ? new Set([e.detail.id]) : new Set()
      if (!blame.size || tries > 0) {
        for (const x of left) {
          failed.push({ x, why: `${e.code || 'HTTP ' + r.status} ${e.message || ''}`.trim() })
          await mark(x, { state: 'failed', error: e.message || String(r.status) })
        }
        break
      }
      for (const x of left.filter((y) => blame.has(y.work.id))) {
        failed.push({ x, why: `${e.code} ${e.message}` })
        await mark(x, { state: 'failed', error: e.message })
      }
      left = left.filter((y) => !blame.has(y.work.id))
      rec = rec.filter((y) => !blame.has(y.work.id))
    }
    if (reports.length) await job?.report(reports.splice(0), 'apply')
  }
  out('')
  out(`들임 ${saved} · 건너뜀(이미 있음) ${skipped} · 실패 ${failed.length}  — run ${runId}`)
  for (const y of failed.slice(0, 20)) out(`  ✗ ${y.x.f.rel} — ${y.why}`)
  if (saved) out(`다음 — 들인 기록은 ${repo} 의 대기열에 섰다. 큐레이터가 작업실 › 대기열에서 좌표를 정하고 반영한다 · 상태는 --status`)
  if (failed.length) out('실패한 것은 고친 뒤 같은 명령을 다시 돌린다 — 들어간 것은 건너뛴다')
  return failed.length ? 1 : 0
}

async function status(plan, { api, base, runId, ledger, serverNote, dir }) {
  out(`run ${runId}  (상태 ${dir})`)
  const entries = Object.entries(ledger.files)
  const count = (st) => entries.filter(([, v]) => v.state === st).length
  out(`이 PC 의 원장 — 들임 ${count('saved')} · 건너뜀 ${count('skipped')} · 실패 ${count('failed')}`)
  if (api) {
    const r = await api.get(`${base}/sources?run=${encodeURIComponent(runId)}`)
    if (r.ok) {
      const by = {}
      for (const s of r.body.sources || []) by[s.state || '?'] = (by[s.state || '?'] || 0) + 1
      const L = { queued: '대기', reflected: '반영', kept: '기록으로 둠', new: '새 문서' }
      out(`서버 — 이 run 의 기록 ${r.body.sources.length}건: ${Object.entries(by).map(([k, v]) => `${L[k] || k} ${v}`).join(' · ') || '없음'}`)
    } else out('[주의] 서버 — ' + (r.body?.error?.message || 'HTTP ' + r.status))
  } else out('[주의] ' + serverNote)
  const changed = plan.files.filter((f) => f.kind === 'record' && ledger.files[keyOf(f)] && ledger.files[keyOf(f)].blob !== f.blob)
  const fresh = plan.files.filter((f) => f.kind === 'record' && !ledger.files[keyOf(f)])
  out(`원본 — 새로 들일 것 ${fresh.length + changed.length}${changed.length ? ` (그중 바뀐 원본 ${changed.length} — 새 기록 · 이전 판 id 를 머리에)` : ''}`)
  for (const f of [...changed, ...fresh].slice(0, 20)) out(`  ${f.rel}${f.prev ? '  (이전 판 ' + f.prev + ')' : ''}`)
  if (fresh.length + changed.length) out('다음 — --apply 로 들인다')
  return 0
}

async function listRuns(env) {
  const root = stateRoot(env)
  const names = await fs.readdir(root).catch(() => [])
  if (!names.length) {
    out('이 PC 에 run 이 없다')
    return 0
  }
  for (const n of names.sort()) {
    const run = await readJson(path.join(root, n, 'run.json'))
    if (!run) continue
    const led = (await readJson(path.join(root, n, 'ledger.json'))) || { files: {} }
    const saved = Object.values(led.files).filter((v) => v.state === 'saved').length
    out(`${run.runId}  ${run.repo}  ${run.inputs.join(' · ')}  — 들임 ${saved}${run.job ? ' · 잡 ' + run.job : ''}`)
  }
  return 0
}

// ── 준비물 ──────────────────────────────────────────────────────────────────

const exec = (cmd, args, opt = {}) =>
  new Promise((res) => execFile(cmd, args, { timeout: 20000, windowsHide: true, encoding: 'utf8', ...opt }, (e, stdout, stderr) => res({ ok: !e, text: String(stdout || stderr || '').trim(), code: e?.code })))

async function doctor(opt, env) {
  const rows = []
  const row = (ok, what, note) => rows.push([ok, what, note])
  const major = Number(process.versions.node.split('.')[0])
  row(major >= 20 ? 'ok' : 'fail', 'node', `${process.versions.node}${major >= 20 ? '' : ' — 20 이상이 필요하다'}`)
  const g = await exec('git', ['--version'])
  row(g.ok ? 'ok' : 'warn', 'git', g.ok ? g.text : '없다 — git 레포에서 날짜 · 작성자를 읽지 못한다(파일 시각을 쓴다)')
  const c = claudeCommand(env)
  const cv = await exec(c.cmd, [...c.pre, '--version'], { shell: c.shell })
  row(cv.ok ? 'ok' : 'warn', 'claude', cv.ok ? cv.text.split(NL)[0] : '없다 — --analyze(판단)를 못 한다 · Claude Code 를 깔고 claude 를 한 번 켜서 로그인한다(CDP_CLAUDE 로 경로)')
  const { server, token } = await resolveClient(opt, env)
  if (!server || !token) row('fail', '서버', !server ? '붙을 서버를 모른다 — ctx login --server <주소>' : '토큰이 없다 — ctx login')
  else {
    const me = await client(server, token).get('/me')
    if (!me.ok) row('fail', '서버', `${server} — ${me.body?.error?.message || 'HTTP ' + me.status}`)
    else {
      row('ok', '서버', `${server} · ${me.body.user} · ${me.body.role}`)
      row(me.body.write ? 'ok' : 'fail', '쓰기 권한', me.body.write ? 'writer 이상' : `${me.body.role} — 들이기는 writer 이상이다`)
      if (opt.repo && !(me.body.repos || []).some((r) => r.name === opt.repo)) row('fail', '레포', `${opt.repo} 를 볼 수 없다`)
    }
  }
  const have = await convTools(env)
  row('ok', '변환 docx · xlsx · pptx · hwpx', '늘 된다(Node)')
  row(have.pdftotext ? 'ok' : 'warn', '변환 pdf', have.pdftotext ? have.pdftotext : '없다 — poppler 의 pdftotext(CDP_PDFTOTEXT) · 없으면 pdf 는 md 가 가리킬 때 첨부로만')
  row(have.soffice ? 'ok' : 'warn', '변환 doc · xls · ppt · hwp', have.soffice ? have.soffice : '없다 — LibreOffice 의 soffice(CDP_SOFFICE)')
  const kit = await findKitDir({ env })
  row(kit ? 'ok' : 'warn', '편입 규칙(kit)', kit ? kit.dir : '없다 — --analyze 를 못 한다(서버 산출물의 kit/ · CDP_KIT)')
  // 로그인 — 실제로 한 번 묻는다(토큰 · 비용이 든다 · --live 일 때만)
  if (opt.live && cv.ok) {
    const text = await new Promise((res) => {
      const ch = spawn(c.cmd, [...c.pre, '-p', '--output-format', 'json', '--max-turns', '1'], { shell: c.shell, env, windowsHide: true })
      let t = ''
      ch.stdout.on('data', (x) => (t += x))
      ch.on('close', () => res(t))
      ch.on('error', () => res(''))
      ch.stdin.end('「ok」 한 단어로만 답한다.')
    })
    let j = null
    try {
      j = JSON.parse(String(text).trim().split(/\r?\n/).at(-1))
    } catch {}
    row(j && !j.is_error ? 'ok' : 'fail', 'claude 로그인', j && !j.is_error ? '답한다' : `답이 없다 — 터미널에서 claude 를 한 번 켜서 로그인한다${j?.result ? ' (' + String(j.result).slice(0, 120) + ')' : ''}`)
  }
  const mark = { ok: '✓', warn: '!', fail: '✗' }
  for (const [ok, what, note] of rows) out(`${mark[ok]} ${pad(what, 30)} ${note}`)
  return rows.some((r) => r[0] === 'fail') ? 1 : 0
}
