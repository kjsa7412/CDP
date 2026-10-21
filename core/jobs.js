// 들이기 잡 — `ctx ingest` 가 보고하는 진행. 지식 생성 · 작업실 검토 v0.1 §5.3 · §6.4 · G9.
//
// **보고일 뿐 정본이 아니다.** 실행의 정본은 사람 PC 의 상태 폴더(`~/.cdp/ingest/<run>/`)이고, 무엇이 들어갔나의 정본은 git(기록의
// 정형 출처 · 태그 `ingest/<run>`)이다. 잡 파일이 없어져도 잃는 것은 화면의 진행표뿐이다. 그래서 git 밖 —
// `<data>/jobs/<레포>/<id>.json` — 에 두고, 지식 레포에는 흔적을 남기지 않는다(I9 · S13).
//
//   상태   waiting(만들었다 · 명령을 아직 안 돌렸다) · running · review(판단 끝 · 승인 대기) · saved · partial · failed · cancelled
//          · stopped — running 인데 보고가 STALL_MS 넘게 끊겼다(**계산이다** — 저장하지 않는다 · 불변조건 7: 짐작한 진행률을 그리지 않는다)
//   파일   rel 마다 하나 — planned · drafted · saved · exists · have · skipped · asset · failed(+ 까닭 · 기록 id · 판단의 성격 · 좌표 후보)
//          판단했으면 그 초안(`draft` — 후보 · 인용 · 어휘 제안)도 싣는다 — 화면이 승인 표를 그린다
//   승인   `approvals[rel]` — 화면에서 체크한 좌표 · 어휘(G17). review.md 와 같은 모양 { coords: { "<조각>|<좌표>": bool }, vocab, force }.
//          **승인은 화면, 적용은 CLI** — 서버는 원문이 없어 기록을 지을 수 없다. 다음 `ctx ingest --apply` 가 이것을 읽는다
//
// 쓰는 사람은 잡의 주인(그 CLI) 하나라 파일 하나에 잠금 없이 쓴다 — 같은 프로세스의 겹친 요청만 줄 세운다.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CtxError } from './errors.js'

export const STALL_MS = 15 * 60 * 1000
export const KINDS = ['file', 'folder', 'git']
export const STATES = ['waiting', 'running', 'review', 'saved', 'partial', 'failed', 'cancelled']
const DONE = ['review', 'saved', 'partial', 'failed', 'cancelled']
const FILE_STATES = ['planned', 'drafted', 'saved', 'exists', 'have', 'skipped', 'asset', 'failed']
const MAX_FILES = 2000
const DRAFT_MAX = 64 * 1024
const ID = /^\d{8}-[0-9a-f]{6}$/

const dirOf = (root, repo) => path.join(root, 'jobs', encodeURIComponent(repo))
const fileOf = (root, repo, id) => {
  if (!ID.test(String(id))) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
  return path.join(dirOf(root, repo), id + '.json')
}
const read = (f) => fs.readFile(f, 'utf8').then(JSON.parse).catch(() => null)
async function write(f, v) {
  await fs.mkdir(path.dirname(f), { recursive: true })
  const tmp = f + '.' + process.pid + '.' + crypto.randomBytes(3).toString('hex')
  await fs.writeFile(tmp, JSON.stringify(v, null, 1))
  await fs.rename(tmp, f)
}
const chains = new Map()
const serial = (key, fn) => {
  const next = (chains.get(key) || Promise.resolve()).then(fn, fn)
  chains.set(key, next.catch(() => {}))
  return next
}
const str = (v, max = 300) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

export function counts(job) {
  const c = { files: 0, records: 0, drafted: 0, saved: 0, exists: 0, have: 0, skipped: 0, failed: 0 }
  for (const f of Object.values(job.files || {})) {
    c.files++
    if (f.status === 'asset') continue
    if (['planned', 'drafted', 'saved', 'exists', 'failed'].includes(f.status)) c.records++
    if (f.status in c) c[f.status]++
  }
  return c
}

// 화면 · API 가 보는 모양 — 멈춤은 여기서 셈한다
export function viewJob(job, now = Date.now()) {
  const stopped = job.state === 'running' && now - Date.parse(job.updated) > STALL_MS
  return { ...job, state: stopped ? 'stopped' : job.state, counts: counts(job) }
}

export async function createJob(root, repo, { by, kind, path: p, runId = null, options = {} }, { now = Date.now() } = {}) {
  if (!KINDS.includes(kind)) throw new CtxError('E_INPUT', `kind 는 ${KINDS.join(' · ')} 중 하나다`, { field: 'kind' })
  const shown = str(p, 1000)
  if (!shown) throw new CtxError('E_INPUT', 'path 가 없다 — 들일 파일 · 폴더(사람 PC 의 경로 · 보이기만 한다)', { field: 'path' })
  const d = new Date(now)
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
  const id = `${ymd}-${crypto.randomBytes(3).toString('hex')}`
  const at = new Date(now).toISOString()
  const job = { id, repo, by, kind, path: shown, runId: str(runId, 40), options: { llm: !!options.llm }, state: 'waiting', created: at, updated: at, phase: null, files: {} }
  await write(fileOf(root, repo, id), job)
  return job
}

export async function getJob(root, repo, id) {
  const j = await read(fileOf(root, repo, id))
  if (!j) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
  return j
}

export async function listJobs(root, repo, { by = null, limit = 100 } = {}) {
  const dir = dirOf(root, repo)
  const names = (await fs.readdir(dir).catch(() => [])).filter((n) => /^\d{8}-[0-9a-f]{6}\.json$/.test(n))
  const out = []
  for (const n of names) {
    const j = await read(path.join(dir, n))
    if (j && (!by || j.by === by)) out.push(j)
  }
  return out.sort((a, b) => (a.created < b.created ? 1 : -1)).slice(0, limit)
}

// 보고 — 파일마다 덮어쓴다(같은 rel 의 나중 보고가 이긴다). 기록 id 는 모은다(한 파일이 여럿으로 나뉜다)
export async function reportJob(root, repo, id, by, { phase = null, files = [] } = {}, { now = Date.now() } = {}) {
  if (!Array.isArray(files) || files.length > MAX_FILES) throw new CtxError('E_INPUT', `files 는 배열 · ${MAX_FILES}개까지다`, { field: 'files' })
  const f = fileOf(root, repo, id)
  return serial(f, async () => {
    const j = await read(f)
    if (!j) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
    if (j.by !== by) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
    if (j.state === 'cancelled') throw new CtxError('E_INPUT', '취소된 잡이다 — 새로 돌리면 새 잡이 생긴다', { id })
    for (const x of files) {
      const rel = str(x?.rel, 500)
      if (!rel || !FILE_STATES.includes(x.status)) continue
      const cur = j.files[rel] || {}
      const ids = [...new Set([...(cur.ids || []), ...(x.id && ['saved', 'exists', 'have'].includes(x.status) ? [String(x.id)] : [])])].slice(0, 20)
      j.files[rel] = {
        status: x.status,
        ...(str(x.reason) ? { reason: str(x.reason) } : {}),
        ...(str(x.error) ? { error: str(x.error) } : {}),
        ...(str(x.nature, 20) ? { nature: str(x.nature, 20) } : cur.nature ? { nature: cur.nature } : {}),
        ...(Array.isArray(x.coords) ? { coords: x.coords.map((c) => str(c, 200)).filter(Boolean).slice(0, 20) } : cur.coords ? { coords: cur.coords } : {}),
        ...(ids.length ? { ids } : {}),
        ...(x.draft && typeof x.draft === 'object' && JSON.stringify(x.draft).length <= DRAFT_MAX ? { draft: x.draft } : cur.draft && x.status !== 'failed' ? { draft: cur.draft } : {}),
        at: new Date(now).toISOString(),
      }
    }
    if (Object.keys(j.files).length > MAX_FILES) throw new CtxError('E_INPUT', `파일이 ${MAX_FILES}개를 넘는다`, { id })
    j.state = 'running'
    j.phase = ['plan', 'analyze', 'apply'].includes(phase) ? phase : j.phase
    j.updated = new Date(now).toISOString()
    await write(f, j)
    return j
  })
}

// 승인 — 잡의 주인만(그 사람의 save 가 될 판단이다). 파일마다 덮어쓴다 · 체크 값만 받는다
export async function approveJob(root, repo, id, by, { files = {} } = {}, { now = Date.now() } = {}) {
  if (!files || typeof files !== 'object' || Array.isArray(files)) throw new CtxError('E_INPUT', 'files 는 { 경로: { coords, vocab, force } } 다', { field: 'files' })
  const f = fileOf(root, repo, id)
  return serial(f, async () => {
    const j = await read(f)
    if (!j || j.by !== by) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
    if (j.state === 'cancelled') throw new CtxError('E_INPUT', '취소된 잡이다', { id })
    const bools = (o, re) => Object.fromEntries(Object.entries(o && typeof o === 'object' ? o : {}).filter(([k, v]) => re.test(k) && typeof v === 'boolean').slice(0, 500))
    j.approvals = j.approvals || {}
    for (const [rel, a] of Object.entries(files)) {
      if (!j.files[rel]?.draft) continue
      j.approvals[rel] = { coords: bools(a?.coords, /^\d{1,3}\|\S{1,200}$/), vocab: bools(a?.vocab, /^\S{1,200}$/), force: a?.force === true, by, at: new Date(now).toISOString() }
    }
    j.updated = new Date(now).toISOString()
    await write(f, j)
    return j
  })
}

export async function finishJob(root, repo, id, who, { state, curator = false } = {}, { now = Date.now() } = {}) {
  if (!DONE.includes(state)) throw new CtxError('E_INPUT', `state 는 ${DONE.join(' · ')} 중 하나다`, { field: 'state' })
  const f = fileOf(root, repo, id)
  return serial(f, async () => {
    const j = await read(f)
    // 남의 잡 — 큐레이터만 취소한다. 나머지는 없는 것과 같다(존재를 알리지 않는다)
    if (!j || (j.by !== who && !(curator && state === 'cancelled'))) throw new CtxError('E_NOT_FOUND', '그런 잡이 없다', { id })
    j.state = state
    j.updated = new Date(now).toISOString()
    await write(f, j)
    return j
  })
}
