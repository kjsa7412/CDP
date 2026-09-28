// 미러 — 서버 트리의 커밋을 origin 에 보내는 **큐 하나**와 그 **상태 한 값.**
// 동시 기록 검토 v0.1 §5.1 · §5.2 · §5.3 · D1~D5.
//
// 전에는 `save` 가 `git.push` 를 던져 두고 잊었다(fire-and-forget). 겹치면 origin 이
// `cannot lock ref` 로 하나를 거절하고(실측 M11), 실패는 로그 한 줄 — 그것도 첫 줄
// `To <원격>` 뿐이라 non-ff 인지 인증인지 망인지 아무도 몰랐다.
//
// 여기서 하는 것 —
//   enqueuePush   레포마다 한 번에 하나. 도는 중에 또 오면 표시만 하고 끝난 뒤 한 번 더
//                 (커밋은 누적이라 한 번이면 전부 간다). 실패는 `classifyPushError` 로 사유를 갈라
//                 기억한다. non-ff 면 fetch 한 번 해서 ahead/behind 를 채운다 — 트리는 안 만진다
//   stateOf       git 상태 + 마지막 결과 → off · ok · lag · diverged · behind   (순수 함수)
//   summary       한 레포의 미러 · 트리 상태 한 덩어리 — 응답 · 콘솔 · doctor · brief 가 같은 것을 본다
//   describe      그 덩어리를 사람의 한 줄로. 정상이면 null — 정상은 조용하다
//   syncWithOrigin  콘솔 「origin 과 맞추기」 — `core/sync.runSync`(fetch → ff → 재스캔)를 **save 뮤텍스 안에서**
//   restore         콘솔 「트리 되돌리기」 — `git.restoreTree` 를 같은 뮤텍스 안에서
//
// 하지 않는 것 — 주기 push · 시작 시 push(불변조건 11 의 "자동 push 확대") · merge · 상태 파일.
// 프로세스가 재시작되면 마지막 사유를 잊는다. 그때 `ahead` 는 git 이 알고 사유는 doctor 가 다시 낸다.

import path from 'node:path'
import * as git from './git.js'
import { withLock } from './lock.js'
import { runSync } from './sync.js'

// 사유 → 사람의 말. 응답 · 콘솔 · doctor · 로그가 이 표 하나를 쓴다.
export const REASON_TEXT = {
  'non-ff': 'origin 에 서버가 모르는 커밋이 있다 (non-ff)',
  auth: '인증 실패 — PAT 만료 · 자격',
  net: '원격에 닿지 않는다',
  protected: '보호 브랜치가 거절했다',
  locked: 'ref 잠김 — 누군가 같은 순간에 push 했다',
  'no-upstream': '보낼 곳(upstream)이 없다',
  unknown: '원인 미상',
}

const queues = new Map()
const q = (root) => {
  const k = path.resolve(root)
  let e = queues.get(k)
  if (!e) queues.set(k, (e = { running: null, again: false, last: null, waiters: [] }))
  return e
}

export function lastPush(root) {
  return q(root).last
}

// 요청 하나 = "지금 HEAD 까지 보내라". 돌아오는 것은 **그 요청 뒤에 시작한 첫 push** 의 결과다 —
// 요청 전에 커밋됐으니 그 push 에 실려 간다. 도는 중에 왔으면 지금 것이 끝난 뒤 한 번 더 밀고
// 그 결과를 준다. 전부가 줄 끝까지 기다리지는 않는다 — 동시 5건이면 첫 사람은 첫 push 로 답을 받는다.
export function enqueuePush(root, opt = {}) {
  const e = q(root)
  return new Promise((resolve) => {
    e.waiters.push(resolve)
    e.again = true
    if (!e.running) e.running = drain(root, e, opt)
  })
}

async function drain(root, e, opt) {
  try {
    while (e.again) {
      e.again = false
      // 지금 기다리는 사람들은 **이 push** 로 답한다 — 이들의 커밋은 이 push 가 시작하기 전에 있었다
      const batch = e.waiters
      e.waiters = []
      const res = await pushOnce(root, e, opt)
      for (const w of batch) w(res)
    }
  } finally {
    e.running = null
    // 줄이 끊긴 채 남은 사람이 없게
    const rest = e.waiters
    e.waiters = []
    for (const w of rest) w(e.last)
  }
}

async function pushOnce(root, e, { log = null } = {}) {
  const at = new Date().toISOString()
  const p = await git.push(root)
  if (p.ok) return (e.last = { ok: true, state: 'ok', reason: null, message: null, at, ahead: p.status?.ahead ?? 0, behind: p.status?.behind ?? 0 })
  if (p.reason === 'no-upstream' || p.reason === 'not-a-repo') {
    return (e.last = { ok: false, state: 'off', reason: p.reason, message: p.message ?? null, at, ahead: null, behind: null })
  }
  // 사유는 **먼저** 기억한다 — 아래 fetch 가 도는 동안 `summary` 가 "갈라졌는데 사유 없음" 을 내지 않게.
  e.last = { ok: false, state: p.reason === 'non-ff' ? 'diverged' : 'lag', reason: p.reason, message: p.message ?? null, at, ahead: null, behind: null }
  // non-ff 는 origin 에 무엇이 있는지 **알아야** 한다. fetch 는 트리를 안 만지니 안전하다.
  if (p.reason === 'non-ff') await git.fetch(root)
  const st = await git.status(root).catch(() => null)
  const state = p.reason === 'non-ff' || (st?.ahead > 0 && st?.behind > 0) ? 'diverged' : 'lag'
  const r = { ok: false, state, reason: p.reason, message: p.message ?? null, at, ahead: st?.ahead ?? null, behind: st?.behind ?? null }
  e.last = r
  log?.(`미러 실패 ${path.basename(root)}: ${REASON_TEXT[r.reason] || r.reason}${r.message ? ' — ' + r.message : ''}${state === 'diverged' ? ` (서버 ${r.ahead}건 · origin ${r.behind}건)` : ''}`)
  return r
}

// git 상태 + 마지막 push 결과 → 상태 한 값. **순수 함수** — 테스트가 직접 부른다.
//
//   off        원격이 없다
//   ok         origin 과 같다
//   lag        서버 커밋이 origin 에 못 갔다 — 사유는 마지막 결과에
//   diverged   서버에도 origin 에도 서로 모르는 커밋이 있다 — 기계는 합치지 않는다
//   behind     origin 만 앞서 있다 — 누군가 서버 밖에서 썼다. ff 로 맞출 수 있다
export function stateOf(st, last = null) {
  if (!st?.repo || !st.upstream) return 'off'
  if (st.ahead > 0 && st.behind > 0) return 'diverged'
  if (st.ahead > 0) return last && !last.ok && last.state === 'diverged' ? 'diverged' : 'lag'
  if (st.behind > 0) return 'behind'
  return 'ok'
}

// 한 레포의 상태 한 덩어리. `st` 는 `git.status(root)` — 부르는 쪽이 이미 들고 있으면 넘긴다.
export async function summary(root, st = null) {
  const s = st || (await git.status(root).catch(() => ({ repo: false })))
  const last = lastPush(root)
  const state = stateOf(s, last)
  const failed = last && !last.ok && (state === 'lag' || state === 'diverged') ? last : null
  return {
    state,
    reason: failed?.reason ?? null,
    message: failed?.message ?? null,
    at: last?.at ?? null,
    ahead: s?.ahead ?? 0,
    behind: s?.behind ?? 0,
    dirty: s?.dirty ?? 0,
    dirtyPaths: s?.dirtyPaths ?? [],
    head: s?.head ?? null,
    branch: s?.branch ?? null,
    upstream: s?.upstream ?? null,
  }
}

// 사람의 한 줄. **정상이면 null.** 이상이 둘이면 둘 다(` · ` 로).
//
// `admin: false` — 콘솔에 못 들어가는 사람(writer · viewer)에게는 콘솔의 단추 이름 대신 「관리자에게」 를 말한다.
// 못 들어가는 곳을 안내하지 않는다(화면 · 권한 검토 v0.1 P6 · R4). 사실(무엇이 이상한가)은 같다.
export function describe(m, { admin = true } = {}) {
  if (!m) return null
  const fix = (what) => (admin ? `콘솔 > 지식 레포 > 「${what}」` : `관리자에게(콘솔 「${what}」)`)
  const parts = []
  if (m.state === 'lag') parts.push(`미러 밀림 ${m.ahead}건${m.reason ? ' · ' + (REASON_TEXT[m.reason] || m.reason) : ' · 사유는 진단(doctor)에서'}`)
  else if (m.state === 'diverged') parts.push(`origin 과 갈라짐 — 서버 ${m.ahead}건 · origin ${m.behind ?? '?'}건. 기계는 합치지 않는다 — 관리자가 셸에서 rebase 한 뒤 「다시 보내기」`)
  else if (m.state === 'behind') parts.push(`origin 이 ${m.behind}건 앞서 있다 — 누군가 서버 밖에서 썼다 · ${fix('origin 과 맞추기')}`)
  if (m.dirty > 0) parts.push(`트리에 커밋 안 된 변경 ${m.dirty}건 — save 가 거절된다 · ${fix('트리 되돌리기')}`)
  return parts.length ? parts.join(' · ') : null
}

// 「origin 과 맞추기」 — fetch → (뒤처졌으면) ff → 재스캔. **save 와 같은 줄에 선다.**
// 갈라졌으면 거절하고 서버용 문장을 낸다 — `pullFfOnly` 의 문장은 로컬형 사용자에게 하는 말이다.
export function syncWithOrigin(root, { rescan = null, onPhase = () => {} } = {}) {
  return withLock(path.resolve(root), async () => {
    const st0 = await git.status(root).catch(() => ({ repo: false }))
    if (st0.repo && st0.dirty > 0) {
      return { ok: false, reason: 'dirty', pulled: 0, ahead: st0.ahead, behind: st0.behind, message: `트리에 커밋 안 된 변경 ${st0.dirty}건 — 먼저 「트리 되돌리기」`, status: st0 }
    }
    const r = await runSync(root, { pull: true, rescan, onPhase })
    if (!r.ok && r.reason === 'diverged') {
      r.message = `서버 트리와 origin 이 갈라졌다 — 서버 ${r.ahead}건 · origin ${r.behind}건. 기계는 합치지 않는다. 셸에서: sudo -u cdp -H git -C ${root} pull --rebase  (그 뒤 「다시 보내기」)`
    }
    return r
  })
}

// 「트리 되돌리기」 — 같은 줄에서. 버린 경로가 결과에 실린다(감사 로그용).
export function restore(root) {
  return withLock(path.resolve(root), () => git.restoreTree(root))
}
