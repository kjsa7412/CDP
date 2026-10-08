// git — 작업환경 v1.1 §9~11.
//
// 뷰어 v0.2 는 "git 을 한 줄도 실행하지 않는다"(§11)였다. 읽기 전용이라
// 낡은 clone 이어도 낡은 것을 보여줄 뿐이었기 때문이다. **쓰기가 들어오면서
// 그 전제가 무너졌다** — 낡은 섹션 위에서 만든 갱신 diff 는 남의 갱신을
// 조용히 덮어 없앤다.
//
// 이 모듈이 하는 것과 안 하는 것을 분명히 한다.
//
//   한다      fetch · status · rev-list(ahead/behind) · pull --ff-only · push · 서버 트리 되돌리기(checkout -- . · clean)
//   안 한다   merge · rebase · 충돌 해결 · reset · 자동 push
//
// **되돌리기는 서버형에만 있다**(동시 기록 검토 v0.1 D5). 서버 트리의 유일한
// 작성자는 서버라 거기 남은 미커밋 변경은 언제나 사고(중단된 save · 사람의 손)이고,
// HEAD 로 돌리는 것은 누구의 것도 버리지 않는다 — 사람의 것은 origin 에 올라간다.
// 로컬형의 작업 트리에는 절대 쓰지 않는다: 그것은 사람이 편집 중인 파일이다.
//
// 안 하는 쪽이 중요하다. 되돌리기 어려운 연산은 사람이 터미널에서 한다
// (뷰어 v0.2 §31 의 경계선). 앱이 rebase 를 시도하다 반쯤 실패하면
// 사용자는 자기 레포가 어떤 상태인지 알 수 없게 된다.

import { execFile, spawn } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'

// git 을 호출한다. 실패를 예외로 만들지 않는다 — remote 가 없거나 git 이
// 없는 것은 **정상 상태**이고, 그때마다 예외가 나면 호출부가 전부 try 로 덮인다.
function run(cwd, args, { timeout = 20000 } = {}) {
  return new Promise((resolve) => {
    execFile(
      'git',
      // **한글 경로를 그대로 낸다.** `core.quotepath` 기본값은 비 ASCII 를 `\354\240\225…` 로 적는다 —
      // 더러운 경로 · 버린 경로 · 거절 문장에 그것이 그대로 실렸다(2026-09-25 콘솔 실측).
      ['-C', cwd, '-c', 'core.quotepath=false', ...args],
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

// **읽기는 index.lock 을 잡지 않는다.** `git status` 는 읽다가 색인의 stat 정보를 새로 고쳐 **써 두고**(선택 잠금),
// 그동안 `.git/index.lock` 을 쥔다. 미러 큐 · doctor · 개요 · `/repos` 는 save 뮤텍스 밖에서 status 를 부르고,
// 그것이 다음 save 의 `git add` · `git commit` 과 겹치면 커밋이 `Unable to create '…/index.lock': File exists` 로
// 죽었다(2026-09-29 하네스 91 — 동시 save 5건 · --mirror, 가끔). `--no-optional-locks` 는 그 쓰기만 끈다 —
// 읽는 값은 같다. 쓰기(add · commit · checkout · clean · reset · pull)는 그대로 잠근다.
const READ_ONLY = ['--no-optional-locks']

export async function isRepo(root) {
  return (await fs.access(path.join(root, '.git')).then(() => true).catch(() => false))
}

export async function gitAvailable() {
  const r = await run(process.cwd(), ['--version'], { timeout: 5000 })
  return r.ok ? r.out : null
}

// 읽기 전용 상태. 화면 상단과 `ctx sync` 가 같은 것을 쓴다.
//
// **git 을 한 번만 띄운다.** `status --porcelain=v2 --branch` 한 줄이 브랜치 ·
// upstream · 앞섬/뒤처짐 · HEAD · 변경 수를 다 낸다.
//
// 전에는 같은 것을 프로세스 대여섯 개로 물었다(rev-parse 셋 · status · config ·
// rev-list). Windows 에서 프로세스를 띄우는 일은 **node 의 이벤트 루프를 붙잡고
// 한다** — 실측 한 개에 80ms 남짓, 대여섯 개면 0.5초 동안 서버가 아무 요청도 못
// 받았다. 그리고 이 함수는 파일이 바뀔 때마다(재스캔) · 창에 포커스가 올 때마다
// 불린다. 화면이 "눌렀는데 한참 있다가 열린다" 로 느끼던 자리다.
export async function status(root) {
  if (!(await isRepo(root))) return { repo: false }

  // `-uall` — 미추적 폴더를 `work/` 로 접지 않고 파일로 낸다. 중단된 save 가 남긴 `work/<id>.md` 가 그대로 보여야
  // 사람이 무엇을 버리는지 안다. 깨끗한 레포에서는 비용이 없다.
  const [s, hooksPath] = await Promise.all([run(root, [...READ_ONLY, 'status', '--porcelain=v2', '--branch', '--untracked-files=all']), readHooksPath(root)])
  const head = {}
  let dirty = 0
  // 더러운 경로 — 앞 10개. `save` 의 거절 문장과 콘솔이 "무엇이" 를 말할 수 있어야 한다
  // (동시 기록 검토 v0.1 D5). porcelain v2 의 마지막 칸이 경로다(`?` 줄은 둘째 칸).
  const dirtyPaths = []
  if (s.ok) {
    for (const line of s.out.split('\n')) {
      if (!line) continue
      const m = /^# branch\.(\S+) (.*)$/.exec(line)
      if (m) head[m[1]] = m[2]
      else if (!line.startsWith('#')) {
        dirty++
        if (dirtyPaths.length < 10) dirtyPaths.push(porcelainPath(line))
      }
    }
  }
  // 커밋이 하나도 없는 새 레포는 oid 가 `(initial)` 이다. 오류가 아니다
  const hasCommits = s.ok && !!head.oid && head.oid !== '(initial)'

  const st = {
    repo: true,
    // 떨어진 HEAD 는 `HEAD` 라고 부른다(`rev-parse --abbrev-ref` 가 그렇게 불렀다)
    branch: !hasCommits ? null : head.head === '(detached)' ? 'HEAD' : head.head || null,
    upstream: head.upstream || null,
    // 훅은 clone 을 따라오지 않는다. 미설정이면 `cdp-save` 가 커밋해도
    // 검사가 **조용히 통과한다** -- 그래서 상태로 노출한다(§17).
    hooksPath,
    dirty,
    dirtyPaths,
    ahead: 0,
    behind: 0,
    oldestUnpushed: null,
    hasCommits,
    // `head` 는 **커밋 sha** 다. 브랜치 이름이 아니다 — `sync` 도구(§2.2)와
    // `GET /repos`(§4.3)가 "지금 어디까지 실려 있나" 를 이것으로 답한다.
    head: hasCommits ? head.oid.slice(0, 7) : null,
  }

  // `branch.ab` 는 upstream 이 살아 있을 때만 나온다
  const ab = /^\+(\d+) -(\d+)$/.exec(head.ab || '')
  if (st.upstream && hasCommits && ab) {
    st.ahead = Number(ab[1])
    st.behind = Number(ab[2])
    if (st.ahead > 0) {
      const oldest = await run(root, ['log', '--reverse', '--format=%cI', `${st.upstream}..HEAD`])
      if (oldest.ok && oldest.out) st.oldestUnpushed = oldest.out.split('\n')[0]
    }
  }
  return st
}

// porcelain v2 한 줄의 경로 — `? <path>` · `1 … <path>` · `2 … <path>\t<orig>` · `u … <path>`.
function porcelainPath(line) {
  if (line.startsWith('?') || line.startsWith('!')) return line.slice(2)
  return line.split('\t')[0].split(' ').pop()
}

// `core.hooksPath` — **설정 파일이 바뀌었을 때만** git 에 묻는다.
//
// 실효값(local → global)을 알려면 git 을 띄워야 하는데, 값은 거의 안 바뀐다.
// 두 설정 파일의 수정 시각을 열쇠로 기억한다 — 터미널에서 `git config` 를 해도
// 파일 시각이 바뀌므로 다음 호출이 새로 읽는다. `.git` 이 파일인 레포
// (worktree · submodule)는 시각을 못 읽으므로 기억하지 않고 매번 묻는다.
const hooksMemo = new Map()
async function readHooksPath(root) {
  const mt = async (p) => (await fs.stat(p).catch(() => null))?.mtimeMs ?? null
  const local = await mt(path.join(root, '.git', 'config'))
  const key = local == null ? null : `${local}|${await mt(path.join(os.homedir(), '.gitconfig'))}`
  const hit = key && hooksMemo.get(root)
  if (hit && hit.key === key) return hit.value
  const r = await run(root, ['config', '--get', 'core.hooksPath'])
  const value = r.ok && r.out ? r.out : null
  if (key) hooksMemo.set(root, { key, value })
  return value
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

// origin 의 주소 하나 — 가려서. 없으면 null. 콘솔의 지식 레포 표가 「원격 없음」 과 「이었는데 아직 못 보냄」 을 가른다.
export async function originUrl(root) {
  const r = await run(root, ['remote', 'get-url', 'origin'])
  return r.ok && r.out ? maskUrl(r.out) : null
}

// 마지막 fetch 시각 — git 이 따로 안 알려준다. `.git/FETCH_HEAD` 의 mtime 이
// 유일한 근거다. **추정하지 않는다** — 파일이 없으면 "한 번도 안 함" 이다.
export async function lastFetchAt(root) {
  const s = await fs.stat(path.join(root, '.git', 'FETCH_HEAD')).catch(() => null)
  return s ? new Date(s.mtimeMs).toISOString() : null
}

// 자격 증명이 새어 나갈 수 있는 유일한 문자열이 원격 주소다.
// ssh 의 계정(`ssh://git@…`)은 비밀이 아니라 남긴다 — 가리면 화면에 `ssh://***@` 가 떠서 주소를 못 알아본다.
// http 는 계정 자리에 PAT 를 넣기도 해서 통째로 가린다. 문장 속 주소(오류 줄)도 전부.
export function maskUrl(u) {
  return String(u || '').replace(/([a-z][a-z0-9+.-]*:)?\/\/([^/@\s]+)@/gi, (m, scheme, info) =>
    /^ssh:$/i.test(scheme || '') && !info.includes(':') ? m : `${scheme || ''}//***@`
  )
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
  if (r.ok) return { ok: true, status: await status(root) }
  // **첫 줄을 남기지 않는다.** git 의 첫 줄은 `To <원격>` 이고 사유는 그 다음 줄이다 —
  // 실측(2026-09-25)에서 로그 · doctor · 콘솔이 전부 `To C:\…` 만 들고 있었다.
  const c = classifyPushError(r.err || r.out)
  return { ok: false, reason: c.reason, message: c.line, stderr: r.err }
}

// push 가 왜 실패했나 — **순수 함수 하나.** 로그 · save 응답 · 콘솔 · doctor 가
// 같은 것을 부른다(동시 기록 검토 v0.1 D2). 자리마다 정규식을 두면 반드시 갈라진다.
//
//   non-ff       origin 에 서버가 모르는 커밋이 있다 — 사람이 맞춘다(콘솔 「origin 과 맞추기」 · 갈라졌으면 rebase)
//   auth         자격 — PAT 만료가 가장 흔하다(관리자 설명서 10.1)
//   net          망 — 기다리거나 원격 주소를 본다
//   protected    보호 브랜치 · pre-receive 훅이 거절
//   locked       같은 ref 를 동시에 밀었다 — 큐가 막지만 남이 밀었을 수도 있다
//   no-upstream  보낼 곳이 없다
//   unknown      위 어느 것도 아니다 — `line` 을 그대로 보인다
//
// 문장은 2026-09-25 실측에서 받은 것 그대로다(테스트 `test/git.test.mjs`).
export function classifyPushError(text) {
  const t = String(text || '')
  const lines = t.split('\n').map((l) => l.trim()).filter(Boolean)
  // 사유가 실린 줄 — `!` 로 시작하는 거절 줄 · error/fatal/remote 줄 · 그도 없으면 첫 줄
  const line = lines.find((l) => l.startsWith('!')) || lines.find((l) => /^(fatal|error|remote: error):/i.test(l)) || lines[0] || null
  let reason = 'unknown'
  if (!lines.length) reason = 'unknown'
  else if (/\[rejected\][^\n]*\((fetch first|non-fast-forward)\)/i.test(t) || /Updates were rejected because the remote contains work/i.test(t) || /non-fast-forward/i.test(t)) reason = 'non-ff'
  else if (/cannot lock ref|failed to update ref|index\.lock|Unable to create .*\.lock/i.test(t)) reason = 'locked'
  else if (/pre-receive hook declined|protected branch|GH006|You are not allowed to push/i.test(t)) reason = 'protected'
  else if (/Authentication failed|could not read Username|Permission denied \(publickey\)|invalid credentials|HTTP 403|returned error: 403|Invalid username or password|access denied|HTTP 401|returned error: 401/i.test(t)) reason = 'auth'
  else if (/Could not resolve host|Connection refused|Connection timed out|timed out|unable to access|Network is unreachable|Could not connect|no route to host|Connection reset/i.test(t)) reason = 'net'
  else if (/no upstream|has no upstream branch|The current branch .* has no upstream/i.test(t)) reason = 'no-upstream'
  return { reason, line }
}

// 서버 트리를 HEAD 로 되돌린다 — **서버형 콘솔의 「트리 되돌리기」 만 부른다.**
//
// 서버가 유일한 작성자라 미커밋 변경은 언제나 사고다(중단된 save · 사람의 손).
// 무엇을 버렸는지 돌려준다 — 감사 로그에 남는다. 버릴 것이 없으면 아무것도 안 한다.
export async function restoreTree(root) {
  if (!(await isRepo(root))) return { ok: false, reason: 'not-a-repo' }
  const st = await status(root)
  if (!st.dirty) return { ok: true, discarded: [], status: st }
  // v2 로 읽는다 — v1 은 첫 줄의 앞 공백이 `run` 의 trim 에 잘려 `docs/t.md` 가 `ocs/t.md` 가 됐다(테스트가 잡았다)
  const porcelain = await run(root, [...READ_ONLY, 'status', '--porcelain=v2', '--untracked-files=all'])
  const discarded = porcelain.ok ? porcelain.out.split('\n').filter((l) => l && !l.startsWith('#')).map(porcelainPath) : st.dirtyPaths
  const co = await run(root, ['checkout', '--', '.'])
  if (!co.ok) return { ok: false, reason: 'failed', message: firstLine(co.err), discarded: [] }
  const cl = await run(root, ['clean', '-fd'])
  if (!cl.ok) return { ok: false, reason: 'failed', message: firstLine(cl.err), discarded: [] }
  return { ok: true, discarded, status: await status(root) }
}

// 모드 B 의 서버가 커밋한다. MCP 설계서 §4.5 의 10단계.
//
// **이 모듈에서 유일하게 작업 트리를 바꾸는 함수다.** 위의 "안 한다" 목록을
// 늘리는 것이 아니다 — merge·rebase·reset 은 여전히 안 한다. 서버 모드에서는
// 사람이 그 트리에서 커밋하지 않으므로(§4.2) 충돌이 날 자리가 없다.
//
// **경로를 받아서 그것만 add 한다.** `git add -A` 로 하지 않는다 — 서버 트리에
// 다른 것이 있으면 그것까지 딸려 들어가고, 그러면 커밋이 작업 단위가 아니게 된다.
// `timeout` — 커밋은 훅(`bin/ctx check` · `ctx index`)을 돈다. 도구 층을 가는 커밋은 새 번들로 훅이 돌아 20초를 넘길 수 있다
// (에이전트 세팅 갱신 — 2026-09-29 실측: 시간이 다 돼 호출이 실패로 끝났는데 git 은 살아서 커밋했다). 부르는 쪽이 늘린다.
// `hooks: false` — 커밋 훅을 돌리지 않는다(`--no-verify`). 서버 save 는 커밋할 트리를 **같은 검사 함수로 이미 봤다**(v1.0 V5) —
// 훅은 레포 안의 옛 번들(`bin/ctx`)로 같은 검사를 한 번 더 돌았고, 판이 어긋나면 옛 규칙으로 막았다(개편안 H9 · 40초 사례)
export async function commitPaths(root, paths, { message, author, email, timeout = 20000, hooks = true }) {
  if (!paths.length) return { ok: false, reason: 'nothing' }
  const add = await run(root, ['add', '--', ...paths])
  if (!add.ok) return { ok: false, reason: 'add', message: firstLine(add.err) }

  const who = `${author} <${email || author + '@cdp'}>`
  const c = await runCommit(root, ['-c', 'user.name=' + author, '-c', 'user.email=' + (email || author + '@cdp'), 'commit', ...(hooks ? [] : ['--no-verify']), '--author=' + who, '-m', message], { timeout })
  if (c.timedOut) return { ok: false, reason: 'timeout', message: `커밋이 ${Math.round(timeout / 1000)}초를 넘겨 git 을 멈췄다 — 커밋 훅(check · index)이 느리다` }
  if (!c.ok) return { ok: false, reason: 'commit', message: firstLine(c.err) || firstLine(c.out) }

  const head = await run(root, ['rev-parse', '--short', 'HEAD'])
  return { ok: true, commit: head.ok ? head.out : null }
}

// 커밋만의 실행 — 시간이 다 되면 **프로세스 나무째** 죽이고, 다 죽은 뒤에 돌아온다.
//
// execFile 의 timeout 은 자식 하나만 죽인다. Windows 에서 그 자식은 `git` 실행기(Git\cmd\git.exe)라 진짜 git
// (mingw64\bin\git.exe)과 훅은 살아서 커밋을 마친다 — 호출은 실패로 끝났는데 몇 초 뒤 HEAD 가 움직였다
// (2026-09-29 실측: 0.8초에 죽였는데 3초 훅 뒤에 커밋). 그 사이 부르는 쪽이 색인을 비우고 파일을 돌리면
// 빈 커밋 + 옛 파일이 남는다(도구 층 · 콘솔 실측). **index.lock 으로는 못 기다린다** — `git commit` 은 색인을
// 시작할 때 잠깐 잠그고 풀어 둔 채 pre-commit 훅을 돈다(같은 날 실측: 첫 0.3초만 잠겼다).
// 그래서 나무(Windows `taskkill /T` · 그 밖은 프로세스 그룹)를 죽인다. 돌아온 뒤에는 git 이 더 움직이지 않는다.
function runCommit(cwd, args, { timeout }) {
  const win = process.platform === 'win32'
  return new Promise((resolve) => {
    const child = spawn('git', ['-C', cwd, '-c', 'core.quotepath=false', ...args], { windowsHide: true, detached: !win })
    const out = []
    const err = []
    child.stdout.on('data', (d) => out.push(d))
    child.stderr.on('data', (d) => err.push(d))
    let timedOut = false
    let killed = Promise.resolve()
    const timer =
      timeout > 0
        ? setTimeout(() => {
            timedOut = true
            killed = new Promise((res) => {
              if (win) execFile('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true }, () => res())
              else {
                try {
                  process.kill(-child.pid, 'SIGKILL')
                } catch {}
                res()
              }
            })
          }, timeout)
        : null
    const done = async (code, e) => {
      clearTimeout(timer)
      await killed
      resolve({
        ok: !e && code === 0 && !timedOut,
        code,
        timedOut,
        out: Buffer.concat(out).toString('utf8').trim(),
        err: (Buffer.concat(err).toString('utf8') || e?.message || '').trim(),
      })
    }
    child.on('error', (e) => done(-1, e))
    child.on('close', (code) => done(code))
  })
}

// `commitPaths` 가 실패로 돌아온 뒤 **커밋이 됐는지** 판정하는 재료 셋. 돌아온 때 git 은 멈춰 있다(`runCommit`) —
// 그래도 판정은 HEAD 로 한다: 죽이기 직전에 커밋을 마쳤을 수 있다. 남은 `index.lock` 은 누가 쥐었는지 모르는 것이다.
export async function headSha(root, { short = false } = {}) {
  const r = await run(root, ['rev-parse', ...(short ? ['--short'] : []), 'HEAD'])
  return r.ok && r.out ? r.out : null
}

// 풀렸으면 true · `ms` 가 지나도 잠겨 있으면 false
export async function waitIndexUnlocked(root, { ms = 300000, step = 500 } = {}) {
  const lock = path.join(root, '.git', 'index.lock')
  const locked = () => fs.access(lock).then(() => true).catch(() => false)
  for (const end = Date.now() + ms; await locked(); ) {
    if (Date.now() >= end) return false
    await new Promise((res) => setTimeout(res, step))
  }
  return true
}

// 색인에 올린 그 경로만 내린다(reset --hard 가 아니다) — 파일을 돌린 뒤 색인에 남으면 트리가 더럽다
export async function unstage(root, paths) {
  if (!paths.length) return { ok: true }
  const r = await run(root, ['reset', '-q', '--', ...paths])
  return { ok: r.ok }
}

// 커밋을 되돌린다. `save` 가 커밋 뒤에 실패했을 때만 쓴다 — 미러 전이라
// 아무에게도 안 간 커밋이다.
export async function undoLastCommit(root) {
  const r = await run(root, ['reset', '--hard', 'HEAD~1'])
  return { ok: r.ok }
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

// 경로마다 마지막으로 바꾼 커밋 — 관리문서 정리 검토 §4.6 의 `lastChange`. 문서 40개에 git 40번이 아니라 **한 번**이다.
// 읽기라 잠그지 않는다. git 이 없거나 레포가 아니면 빈 지도(사용 현황은 그 칸만 비운다).
export async function lastChanges(root, prefix = 'docs') {
  const r = await run(root, [...READ_ONLY, 'log', '--format=%x01%h%x09%ad%x09%an%x09%s', '--date=short', '--name-only', '--no-renames', '--', prefix], { timeout: 30000 })
  const out = new Map()
  if (!r.ok) return out
  let cur = null
  for (const line of r.out.split('\n')) {
    if (line.startsWith('\x01')) {
      const [commit, date, author, ...s] = line.slice(1).split('\t')
      cur = { commit, date, author, subject: s.join('\t') }
    } else if (line.trim() && cur && !out.has(line.trim())) out.set(line.trim(), cur)
  }
  return out
}
