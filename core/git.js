// git — 작업환경 v1.1 §9~11.
//
// 뷰어 v0.2 는 "git 을 한 줄도 실행하지 않는다"(§11)였다. 읽기 전용이라
// 낡은 clone 이어도 낡은 것을 보여줄 뿐이었기 때문이다. **쓰기가 들어오면서
// 그 전제가 무너졌다** — 낡은 섹션 위에서 만든 갱신 diff 는 남의 갱신을
// 조용히 덮어 없앤다.
//
// 이 모듈이 하는 것과 안 하는 것을 분명히 한다.
//
//   한다      fetch · status · rev-list(ahead/behind) · pull --ff-only · push
//   안 한다   merge · rebase · 충돌 해결 · reset · checkout · 자동 push
//
// 안 하는 쪽이 중요하다. 되돌리기 어려운 연산은 사람이 터미널에서 한다
// (뷰어 v0.2 §31 의 경계선). 앱이 rebase 를 시도하다 반쯤 실패하면
// 사용자는 자기 레포가 어떤 상태인지 알 수 없게 된다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'

// git 을 호출한다. 실패를 예외로 만들지 않는다 — remote 가 없거나 git 이
// 없는 것은 **정상 상태**이고, 그때마다 예외가 나면 호출부가 전부 try 로 덮인다.
function run(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      'git',
      ['-C', cwd, ...args],
      { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 },
      (e, stdout, stderr) => {
        resolve({
          ok: !e,
          code: e?.code ?? 0,
          out: String(stdout || '').trim(),
          err: String(stderr || '').trim(),
        })
      }
    )
  })
}

export async function isRepo(root) {
  return (await fs.access(path.join(root, '.git')).then(() => true).catch(() => false))
}

export async function gitAvailable() {
  const r = await run(process.cwd(), ['--version'], { timeout: 5000 })
  return r.ok ? r.out : null
}

// 읽기 전용 상태. 화면 상단과 `ctx sync` 가 같은 것을 쓴다.
export async function status(root) {
  if (!(await isRepo(root))) return { repo: false }

  const [branch, upstream, dirty, hooks] = await Promise.all([
    run(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    run(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    run(root, ['status', '--porcelain']),
    run(root, ['config', '--get', 'core.hooksPath']),
  ])

  const st = {
    repo: true,
    branch: branch.ok ? branch.out : null,
    upstream: upstream.ok ? upstream.out : null,
    // 훅은 clone 을 따라오지 않는다. 미설정이면 `cdp-save` 가 커밋해도
    // 검사가 **조용히 통과한다** -- 그래서 상태로 노출한다(§17).
    hooksPath: hooks.ok && hooks.out ? hooks.out : null,
    dirty: dirty.ok ? dirty.out.split('\n').filter(Boolean).length : 0,
    ahead: 0,
    behind: 0,
    oldestUnpushed: null,
  }

  // 커밋이 하나도 없는 새 레포에서는 rev-list 가 실패한다. 오류가 아니다.
  const head = await run(root, ['rev-parse', '--verify', 'HEAD'])
  st.hasCommits = head.ok

  if (st.upstream && st.hasCommits) {
    const counts = await run(root, ['rev-list', '--left-right', '--count', `${st.upstream}...HEAD`])
    if (counts.ok) {
      const [behind, ahead] = counts.out.split(/\s+/).map((n) => Number(n) || 0)
      st.behind = behind
      st.ahead = ahead
    }
    if (st.ahead > 0) {
      const oldest = await run(root, ['log', '--reverse', '--format=%cI', `${st.upstream}..HEAD`])
      if (oldest.ok && oldest.out) st.oldestUnpushed = oldest.out.split('\n')[0]
    }
  }
  return st
}

// 설정 읽기 — **화면이 "어떻게 돼 있나" 를 말할 수 있어야 한다.**
//
// 지금까지 화면은 훅 미설정 하나만 배지로 냈다. 그런데 사용자가 막히는 자리는
// upstream 없음 · 자격 증명 미설정 · user.name 없음 쪽이 더 많고, 그 셋은
// **눌러 보기 전에는 알 수 없었다.** 전부 읽기다 -- 여기서 고치지 않는다.
export async function readConfig(root) {
  if (!(await isRepo(root))) return { repo: false }

  const [remotes, branch, upstream, hooks, helper, name, email] = await Promise.all([
    run(root, ['remote']),
    run(root, ['rev-parse', '--abbrev-ref', 'HEAD']),
    run(root, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}']),
    run(root, ['config', '--get', 'core.hooksPath']),
    // --get 은 local -> global -> system 순으로 **실효값**을 낸다.
    // 어느 층에 있는지는 안 묻는다 -- 사용자가 알아야 하는 것은 "되나" 뿐이다.
    run(root, ['config', '--get', 'credential.helper']),
    run(root, ['config', '--get', 'user.name']),
    run(root, ['config', '--get', 'user.email']),
  ])

  const first = remotes.ok && remotes.out ? remotes.out.split('\n')[0].trim() : null
  const url = first ? await run(root, ['remote', 'get-url', first]) : null

  return {
    repo: true,
    branch: branch.ok ? branch.out : null,
    remote: first,
    // 원격 주소에 토큰이 박혀 있을 수 있다(https://user:token@host/...). 가린다.
    remoteUrl: url?.ok ? maskUrl(url.out) : null,
    upstream: upstream.ok ? upstream.out : null,
    hooksPath: hooks.ok && hooks.out ? hooks.out : null,
    credentialHelper: helper.ok && helper.out ? helper.out : null,
    userName: name.ok && name.out ? name.out : null,
    userEmail: email.ok && email.out ? email.out : null,
    lastFetch: await lastFetchAt(root),
    hooksDir: await fs
      .access(path.join(root, '.githooks'))
      .then(() => true)
      .catch(() => false),
  }
}

// 마지막 fetch 시각 — git 이 따로 안 알려준다. `.git/FETCH_HEAD` 의 mtime 이
// 유일한 근거다. **추정하지 않는다** — 파일이 없으면 "한 번도 안 함" 이다.
export async function lastFetchAt(root) {
  const s = await fs.stat(path.join(root, '.git', 'FETCH_HEAD')).catch(() => null)
  return s ? new Date(s.mtimeMs).toISOString() : null
}

// **앱이 git 설정을 쓰는 유일한 자리다.**
//
// 훅 미설정은 조용한 실패다 — 커밋은 통과하고 검사는 안 돈다. 그 하나만
// 고친다. 여는 폭은 최소로 둔다 —
//   · 키는 `core.hooksPath` 하나뿐 (인자로 키를 받지 않는다)
//   · 값은 레포 안의 `.githooks` 하나뿐 (임의 경로를 못 넣는다)
//   · **`--global` 을 쓰지 않는다.** 이 레포의 로컬 설정만 바뀐다
export const HOOKS_DIR = '.githooks'

export async function setHooksPath(root) {
  if (!(await isRepo(root))) return { ok: false, reason: 'not-a-repo' }
  const has = await fs
    .access(path.join(root, HOOKS_DIR))
    .then(() => true)
    .catch(() => false)
  if (!has) {
    return {
      ok: false,
      reason: 'no-hooks-dir',
      message: `${HOOKS_DIR}/ 가 레포에 없습니다. 배포본을 부으면 들어옵니다.`,
    }
  }
  const r = await run(root, ['config', 'core.hooksPath', HOOKS_DIR])
  return r.ok ? { ok: true, hooksPath: HOOKS_DIR } : { ok: false, reason: 'failed', message: firstLine(r.err) }
}

// 자격 증명이 새어 나갈 수 있는 유일한 문자열이 원격 주소다.
function maskUrl(u) {
  return String(u || '').replace(/\/\/[^/@]+@/, '//***@')
}

// fetch 는 작업 트리를 건드리지 않으므로 자동으로 해도 안전하다.
// 실패는 조용히 삼킨다 -- 폐쇄망에서 remote 가 닿지 않는 것이 기본 상태다.
export async function fetch(root) {
  if (!(await isRepo(root))) return { ok: false, reason: 'not-a-repo' }
  const r = await run(root, ['fetch', '--quiet', '--prune'], { timeout: 30000 })
  return { ok: r.ok, message: r.ok ? null : firstLine(r.err) }
}

// pull 은 작업 트리를 바꾼다. **ff 만 한다.**
//
// ff 가 안 되는 것은 "원격이 앞서 있고 로컬에도 커밋이 있다"는 뜻이고,
// 그것은 사람이 정리할 일이다. merge 를 대신 하면 -- 특히 관리 문서 섹션에서 --
// 두 갱신을 기계가 섞은 결과가 정본 자리에 앉는다.
export async function pullFfOnly(root) {
  if (!(await isRepo(root))) return { ok: false, reason: 'not-a-repo' }
  const st = await status(root)
  if (!st.upstream) return { ok: true, skipped: 'no-upstream', status: st }
  if (st.behind === 0) return { ok: true, skipped: 'up-to-date', status: st }

  if (st.ahead > 0) {
    return {
      ok: false,
      reason: 'diverged',
      status: st,
      message:
        `원격이 ${st.behind}건 앞서 있고 로컬에도 커밋 ${st.ahead}건이 있습니다.\n` +
        '앱과 skill 은 merge·rebase 를 하지 않습니다. 터미널에서 정리하세요:\n' +
        '  git pull --rebase',
    }
  }
  if (st.dirty > 0) {
    return {
      ok: false,
      reason: 'dirty',
      status: st,
      message: `커밋되지 않은 변경 ${st.dirty}건이 있어 pull 하지 않았습니다. 먼저 커밋하거나 되돌리세요.`,
    }
  }

  const r = await run(root, ['pull', '--ff-only', '--quiet'], { timeout: 60000 })
  return r.ok ? { ok: true, status: await status(root) } : { ok: false, reason: 'failed', message: firstLine(r.err) }
}

// push 는 **사람이 누른다.** 자동으로 하지 않는다 -- 커밋은 되돌릴 수 있지만
// push 는 남의 눈에 들어간다(§11).
export async function push(root) {
  if (!(await isRepo(root))) return { ok: false, reason: 'not-a-repo' }
  const st = await status(root)
  if (!st.upstream) return { ok: false, reason: 'no-upstream', message: 'upstream 이 설정되지 않았습니다.' }
  if (st.ahead === 0) return { ok: true, skipped: 'nothing-to-push', status: st }

  const r = await run(root, ['push', '--quiet'], { timeout: 60000 })
  return r.ok ? { ok: true, status: await status(root) } : { ok: false, reason: 'failed', message: firstLine(r.err) }
}

// 안 보낸 커밋은 남에게 존재하지 않는 것과 같다(§1의 5번). 오래되면 알린다.
export function unpushedWarning(st, { days = 1, now = Date.now() } = {}) {
  if (!st?.ahead || !st.oldestUnpushed) return null
  const age = (now - new Date(st.oldestUnpushed).getTime()) / 86400000
  if (age < days) return null
  return {
    ahead: st.ahead,
    days: Math.floor(age),
    message:
      `보내지 않은 커밋 ${st.ahead}건 · 가장 오래된 것 ${Math.floor(age)}일 전\n` +
      '보내지 않으면 다른 사람에게는 이 작업이 없는 것과 같습니다',
  }
}

function firstLine(s) {
  return String(s || '').split('\n').find((l) => l.trim()) || null
}
