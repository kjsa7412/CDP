// ctx ingest — 문서 · 폴더 · git 레포의 작업 문서를 작업 기록으로 들인다. 지식 생성 · 작업실 검토 v0.1 §4 · G5 · G9 · G12 · G16.
//
//   ctx ingest <파일 · 폴더>… --repo <레포> [--server <주소>] [--glob <p>]… [--exclude <p>]… [--max-files N] [--no-llm] [--json]
//                                            계획(기본) — 무엇이 어떤 기록이 되나. 쓰지 않는다
//   ctx ingest <…> --repo <레포> --apply [--yes]   들인다 — 서버의 묶음 save(/api/<레포>/records · 20건씩 · 한 묶음 한 커밋)
//   ctx ingest <…> --repo <레포> --status          이 PC 의 원장 ↔ 서버의 기록(대기 · 반영 · 기록으로 둠) ↔ 원본(바뀐 것 · 새것)
//   ctx ingest list                                이 PC 의 run
//
// **결과는 언제나 작업 기록이다** — 대기열에 서고 관리 문서 반영은 큐레이터가 한다(G5). 좌표는 추측하지 않는다(touchesEmpty ·
// 원문 좌표는 tags 의 touches/…). 판단 단계(claude -p — 성격 · 나눔 · 좌표 후보)는 다음 판이다 — 지금은 늘 `--no-llm` 과 같다.
//
// 상태는 **이 PC 에만** 둔다 — `~/.cdp/ingest/<run>/`(CDP_INGEST_DIR). 원천에도 지식 레포에도 쓰지 않는다(I9). 다시 돌리면
// 같은 run 을 찾고, 이미 들인 것은 서버가 blob 으로 건너뛴다(skipExisting) — 끊겨도 같은 명령을 다시 돌리면 이어진다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import readline from 'node:readline'
import { planIngest, runHash, runIdOf } from '../../core/ingest.js'
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
  'ctx ingest <…> --repo <레포> --apply [--yes]     들인다 — 작업 기록으로(대기열 → 큐레이터)',
  'ctx ingest <…> --repo <레포> --status            원장 ↔ 서버 ↔ 원본',
  'ctx ingest list                                  이 PC 의 run',
  '  서버 · 토큰은 ctx login --server <주소> 로 한 번',
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

export async function runIngest(opt, env = process.env) {
  if (opt.args[0] === 'list') return listRuns(env)
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

  // 서버 — 계획에도 쓴다(이미 들인 것 · 이전 판). 닿지 않으면 이 PC 의 원장만으로
  const { server, token } = await resolveClient(opt, env)
  const api = server && token ? client(server, token) : null
  const base = `/api/${encodeURIComponent(opt.repo)}`
  let known = Object.entries(ledger.files)
    .filter(([, v]) => v.id && v.blob && v.state !== 'failed')
    .map(([k, v]) => ({ name: k.slice(0, k.indexOf('/')), path: k.slice(k.indexOf('/') + 1), blob: v.blob, id: v.id }))
  let serverNote = null
  if (api) {
    const r = await api.get(base + '/sources')
    if (r.ok) known = [...(r.body.sources || []).map((s) => ({ name: s.name, path: s.path, blob: s.blob, id: s.id, state: s.state })), ...known]
    else serverNote = r.status === 0 ? r.body.error.message : `서버가 들인 기록 목록을 주지 않았다 — ${r.body?.error?.message || 'HTTP ' + r.status}`
  } else serverNote = !server ? '붙을 서버를 모른다 — ctx login --server <주소>' : '토큰이 없다 — ctx login'

  let plan
  try {
    plan = await planIngest(inputs, { include, exclude, maxFiles: opt.maxFiles ? Number(opt.maxFiles) : undefined, runId, known })
  } catch (e) {
    err('ctx ingest: ' + toError(e).message)
    return 2
  }
  await writeJson(path.join(dir, 'run.json'), { hash, runId, created: new Date(created).toISOString(), inputs: inputs.map((x) => path.resolve(x)), include, exclude, repo: opt.repo, server })

  if (opt.status) return status(plan, { api, base, runId, ledger, serverNote, dir })

  if (opt.json && !opt.apply) {
    out(JSON.stringify({ ...plan, files: plan.files.map(({ work, ...f }) => ({ ...f, assets: (f.assets || []).map(({ abs, ...a }) => a) })) }, null, 2))
    return 0
  }
  printPlan(plan, { runId, dir, serverNote, llm: !opt.noLlm })
  if (!opt.apply) {
    if (plan.summary.records) out(NL + `다음 — 같은 명령에 --apply 를 붙이면 작업 기록 ${plan.summary.records}건을 들인다(대기열 → 큐레이터)`)
    return 0
  }

  // ── 적용 ──
  if (!api) {
    err('ctx ingest --apply: ' + serverNote)
    return 2
  }
  const todo = plan.files.filter((f) => f.kind === 'record')
  if (!todo.length) {
    out(NL + '들일 것이 없다.')
    return 0
  }
  if (!opt.yes) {
    if (!process.stdin.isTTY) {
      err('ctx ingest --apply: 터미널이 아니다 — 확인 없이 들이려면 --yes')
      return 2
    }
    if (!(await confirm(NL + `작업 기록 ${todo.length}건을 ${opt.repo} 에 들인다. 계속할까? [y/N] `))) {
      out('그만뒀다 — 아무것도 쓰지 않았다')
      return 0
    }
  }
  return apply(todo, { api, base, ledger, dir, runId, repo: opt.repo })
}

function printPlan(plan, { runId, dir, serverNote, llm }) {
  const s = plan.summary
  for (const r of plan.roots) out(`원천  ${r.root}${r.git ? `  (git ${r.git.head || ''} · 날짜 · 작성자를 이력에서)` : ''}`)
  out(`run   ${runId}  (상태 ${dir})`)
  out(`기록 ${s.records} · 이미 들임 ${s.have} · 첨부 ${s.assets} · 건너뜀 ${s.skipped}${s.prev ? ` · 이전 판이 있는 것 ${s.prev}` : ''}`)
  if (s.records) out(`날짜 근거  ${Object.entries(s.dateSources).map(([k, v]) => `${k} ${v}`).join(' · ')}`)
  if (llm) out('판단(claude -p — 성격 · 나눔 · 좌표 후보)은 다음 판이다 — 지금은 좌표 없이 들이고 큐레이터가 판정한다(--no-llm 과 같다)')
  if (serverNote) out('[주의] ' + serverNote + ' — 이 PC 의 원장만 보고 「이미 들임」 을 셌다')
  const rec = plan.files.filter((f) => f.kind === 'record')
  if (rec.length) {
    out('')
    out(`${pad('날짜', 12)}${pad('근거', 12)}${pad('첨부', 6)}${pad('→ 작업 기록 id', 64)}원문`)
    for (const f of rec.slice(0, 40)) out(`${pad(f.date.slice(0, 10), 12)}${pad(f.dateSource, 12)}${pad(f.assets.length || '', 6)}${pad(f.id, 64)}${f.rel}${f.prev ? '  (이전 판 ' + f.prev + ')' : ''}`)
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

// 묶음 — 20건 이하 · 몸통 1.5 MB 이하
function batchesOf(list) {
  const out = []
  let cur = []
  let bytes = 0
  for (const f of list) {
    const b = Buffer.byteLength(JSON.stringify(f.work), 'utf8')
    if (cur.length && (cur.length >= RECORDS_MAX || bytes + b > BATCH_BYTES)) {
      out.push(cur)
      cur = []
      bytes = 0
    }
    cur.push(f)
    bytes += b
  }
  if (cur.length) out.push(cur)
  return out
}

async function apply(todo, { api, base, ledger, dir, runId, repo }) {
  let saved = 0
  let skipped = 0
  const failed = []
  const mark = async (f, v) => {
    ledger.files[keyOf(f)] = { blob: f.blob, id: v.id ?? f.id, state: v.state, ...(v.existing ? { existing: v.existing } : {}), ...(v.error ? { error: v.error } : {}), at: new Date().toISOString() }
    await writeJson(path.join(dir, 'ledger.json'), ledger)
  }
  for (const batch of batchesOf(todo)) {
    // 첨부 — 먼저 올리고 ref 를 싣는다(같은 내용은 서버가 한 번만 든다)
    const records = []
    const sent = []
    for (const f of batch) {
      const assets = []
      let bad = null
      for (const a of f.assets) {
        const up = await api.postBin(base + '/assets', await fs.readFile(a.abs))
        if (!up.ok) {
          bad = `첨부 ${a.rel} 를 올리지 못했다 — ${up.body?.error?.message || 'HTTP ' + up.status}`
          break
        }
        assets.push({ ref: up.body.ref, name: a.name })
      }
      if (bad) {
        failed.push({ f, why: bad })
        await mark(f, { state: 'failed', error: bad })
        continue
      }
      records.push({ work: f.work, ...(assets.length ? { assets } : {}) })
      sent.push(f)
    }
    let left = sent
    let body = records
    for (let tries = 0; body.length && tries < 2; tries++) {
      const r = await api.post(base + '/records', { records: body, skipExisting: true })
      if (r.ok) {
        const ids = new Set(r.body.ids || [])
        const skip = new Map((r.body.skipped || []).map((x) => [x.id, x]))
        for (const f of left) {
          if (ids.has(f.id)) {
            saved++
            await mark(f, { state: 'saved' })
          } else if (skip.has(f.id)) {
            skipped++
            await mark(f, { state: 'skipped', existing: skip.get(f.id).existing })
          }
        }
        out(`묶음 ${left.length}건 — 들임 ${ids.size} · 건너뜀 ${skip.size}${r.body.commit ? ' · ' + r.body.commit : ''}`)
        for (const w of r.body.warnings || []) if (!/^touches 가 비어/.test(w)) out(`  [주의] ${w}`)
        break
      }
      const e = r.body?.error || {}
      // 검사 오류 — 그 기록만 빼고 다시 한 번(전부 또는 전무라 나머지는 아직 안 들어갔다)
      const blame = e.code === 'E_CHECK' ? new Set(e.detail?.ids || []) : e.detail?.id ? new Set([e.detail.id]) : new Set()
      if (!blame.size || tries > 0) {
        for (const f of left) {
          failed.push({ f, why: `${e.code || 'HTTP ' + r.status} ${e.message || ''}`.trim() })
          await mark(f, { state: 'failed', error: e.message || String(r.status) })
        }
        break
      }
      for (const f of left.filter((x) => blame.has(x.id))) {
        failed.push({ f, why: `${e.code} ${e.message}` })
        await mark(f, { state: 'failed', error: e.message })
      }
      left = left.filter((x) => !blame.has(x.id))
      body = body.filter((x) => !blame.has(x.work.id))
    }
  }
  out('')
  out(`들임 ${saved} · 건너뜀(이미 있음) ${skipped} · 실패 ${failed.length}  — run ${runId}`)
  for (const x of failed.slice(0, 20)) out(`  ✗ ${x.f.rel} — ${x.why}`)
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
  out(`원본 — 새로 들일 것 ${fresh.length}${changed.length ? ` (그중 바뀐 원본 ${changed.length} — 새 기록 · 이전 판 id 를 머리에)` : ''}`)
  for (const f of [...changed, ...fresh.filter((x) => !changed.includes(x))].slice(0, 20)) out(`  ${f.rel}${f.prev ? '  (이전 판 ' + f.prev + ')' : ''}`)
  if (fresh.length) out('다음 — --apply 로 들인다')
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
    out(`${run.runId}  ${run.repo}  ${run.inputs.join(' · ')}  — 들임 ${saved}`)
  }
  return 0
}
