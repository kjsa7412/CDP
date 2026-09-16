// 동기화 — fetch -> (뒤처졌으면) ff pull -> 다시 읽기. **한 곳에만 둔다.**
//
// 전에는 이 순서를 두 곳이 각자 들고 있었다 — 화면의 `syncNow()` 가 API 세 개를
// 순서대로 부르고, `ctx sync` 가 같은 일을 자기 방식으로 했다. 둘이 갈라지면
// "앱에서는 됐는데 CLI 에서는 안 된다" 가 되고, 그때 어느 쪽이 맞는지 아무도
// 모른다. 판정을 한 곳에 두는 것과 같은 이유다(불변식 12).
//
// **진행을 밖으로 흘린다.** 사내망 실측에서 fetch 한 번에 19.5초가 걸렸다.
// 그 20초 동안 아무 말도 없으면 사용자는 멎은 것으로 읽는다. 그래서 단계가
// 바뀔 때마다 `onPhase` 를 부른다 — 서버는 그것을 SSE 로 뿌리고, CLI 는 줄을 찍는다.
//
// 이 파일도 **merge·rebase 를 하지 않는다.** ff 가 아니면 git 이 낸 문장을
// 그대로 들고 돌아온다.

import * as git from './git.js'

/**
 * @param {string} root 지식 레포
 * @param {object} opt
 *   pull     ff pull 까지 할지. false 면 fetch 만 (기본 true)
 *   onPhase  ({phase, ...}) => void
 *   rescan   pull 이 실제로 받아왔을 때 부를 것. 서버는 store.load 를 넘긴다
 */
export async function runSync(root, { pull = true, onPhase = () => {}, rescan = null } = {}) {
  const t0 = Date.now()
  const at = new Date().toISOString()
  const done = (r) => ({ at, ms: Date.now() - t0, ...r })

  if (!(await git.isRepo(root))) {
    onPhase({ phase: 'failed', reason: 'not-a-repo' })
    return done({ ok: false, phase: 'failed', reason: 'not-a-repo', message: 'git 레포가 아닙니다. 동기화할 것이 없습니다.' })
  }

  onPhase({ phase: 'fetching' })
  const f = await git.fetch(root)
  let st = await git.status(root)

  // fetch 실패는 **그 자체로 실패다.** 폐쇄망에서 원격이 안 닿는 것은 흔하지만,
  // 그때 "이미 최신입니다" 라고 말하면 거짓말이 된다 -- 최신인지 모르는 것이다.
  if (!f.ok) {
    onPhase({ phase: 'failed', reason: 'fetch' })
    return done({
      ok: false,
      phase: 'failed',
      reason: 'fetch',
      message: f.message || '원격에 닿지 못했습니다.',
      behind: st.behind,
      ahead: st.ahead,
      status: st,
    })
  }

  let pulled = 0
  if (pull && st.behind > 0) {
    const want = st.behind
    onPhase({ phase: 'pulling', behind: want })
    const p = await git.pullFfOnly(root)
    if (!p.ok) {
      onPhase({ phase: 'failed', reason: p.reason })
      return done({
        ok: false,
        phase: 'failed',
        reason: p.reason,
        message: p.message || 'pull 하지 못했습니다.',
        behind: want,
        ahead: st.ahead,
        status: p.status || st,
      })
    }
    st = p.status || (await git.status(root))
    pulled = p.skipped ? 0 : want

    if (pulled > 0 && rescan) {
      onPhase({ phase: 'rescanning', pulled })
      await rescan()
    }
  }

  onPhase({ phase: 'done', pulled, ahead: st.ahead })
  return done({
    ok: true,
    phase: 'done',
    pulled,
    behind: st.behind,
    ahead: st.ahead,
    status: st,
    // 훅 미설정은 실패가 아니지만 **조용한 실패의 씨앗**이라 결과에 같이 싣는다
    hooksPath: st.hooksPath,
  })
}

// 결과 한 줄 — 화면 토스트와 이력 표와 CLI 가 **같은 문장**을 쓴다.
export function syncLine(r) {
  if (!r) return ''
  if (!r.ok) return r.message ? String(r.message).split('\n')[0] : '동기화 실패'
  if (r.pulled > 0) return `원격 ${r.pulled}건 받았습니다`
  return r.ahead > 0 ? `이미 최신 · 미전송 ${r.ahead}건` : '이미 최신입니다'
}
