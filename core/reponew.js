// 지식 레포를 세운다 — 빈 틀(`core/skeleton.js`)을 쓰고 git 을 초기화한다. v1.0 개편안 §8.2 · I9.
//
// CLI(`ctx repo new`)와 관리 서비스(콘솔의 `POST /admin/repos`)가 **같은 것을** 부른다.
//
//   0  dest 가 없거나 빈 폴더여야 한다.  남의 폴더에 쓰지 않는다
//   1  빈 틀 — README · _vocab.md · _managed.md · .gitattributes · .gitignore · docs/ · work/
//   2  다시 세우기면 옛 레포의 작업 기록 · 첨부 · 그 기록이 건드리는 어휘(§9.1)
//   3  git init · 첫 커밋 — 훅은 없다(레포에는 지식만 · save 의 검사가 보증이다)
//   4  origin 이 있으면 remote add · push 면 push -u
//
// v0.x 의 패키지 붓기(복사 · 서식 예시 · 도구 층 · hooksPath · 첫 커밋의 훅)는 v1.0 에서 끝났다 — 서식은 서식집,
// 스킬은 서버 번들의 kit 이다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CtxError } from './tools.js'
import { status as gitStatus, classifyPushError, maskUrl } from './git.js'
import { isSsh } from './gitauth.js'
import { loadRepo } from './repo.js'
import { pickRecords, carryVocab, mergeVocab } from './rebuild.js'
import { skeletonFiles } from './skeleton.js'

export const REPO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

// 원격 주소의 모양 — http(s) · ssh · scp 꼴(`git@host:…`) · 파일. 세우기 · 받아 오기 · 잇기가 같은 것을 본다.
export const ORIGIN_RE = /^(https?:\/\/|ssh:\/\/|git@|file:\/\/|\/|[A-Za-z]:[\\/])/

function git(cwd, args, { timeout = 60000, env } = {}) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 8 << 20, env }, (e, stdout, stderr) => {
      resolve({ ok: !e, code: e?.code ?? 0, out: String(stdout || '').trim(), err: String(stderr || '').trim() })
    })
  })
}

async function isDir(p) {
  return fs.stat(p).then((s) => s.isDirectory()).catch(() => false)
}

/**
 * @param dest     만들 자리 — 폴더 이름이 레포 이름이다
 * @param title    README 첫 문단(레포의 한 줄 설명). 없으면 「지식 레포」 · 다시 세우기면 옮겨 온 사실
 * @param origin   git 원격 주소 (선택). **이미 있는 빈 프로젝트**여야 한다 — 서버가 만들 수는 없다
 * @param push     origin 에 첫 커밋을 보낼지
 * @param author   첫 커밋의 작성자 이름 (기본 cdp)
 * @param dry      무엇을 할지만 낸다
 * @param sshCommand  origin 이 ssh 면 레포 로컬 설정으로 거는 한 줄(서버의 배포 키 · git 자격 TODO G2). 없으면 ssh 기본값
 * @param records  { root } — **다시 세우기**(v1.0 §9.1). 옛 레포의 작업 기록 · 첨부와 그 기록이 건드리는 어휘만 옮겨 첫 커밋에 넣는다.
 *                 관리 문서 · 등록부 행 · 옛 기계 기록은 옮기지 않는다 — 옮긴 기록은 전부 큐레이션 대기열에 선다
 * @param now      README 의 날짜(시험이 고정한다)
 */
export async function newRepo({ dest, title = null, origin = null, push = false, author = 'cdp', dry = false, sshCommand = null, records = null, now = new Date() }) {
  const dst = path.resolve(dest)
  const name = path.basename(dst)

  if (!REPO_NAME_RE.test(name)) throw new CtxError('E_INPUT', '레포 이름 형식이 아니다 (영문·숫자·._-)', { name })
  if (await isDir(dst)) {
    const ents = await fs.readdir(dst)
    if (ents.length) throw new CtxError('E_EXISTS', '그 자리에 이미 무엇이 있다 — 빈 폴더거나 없어야 한다', { dest: dst })
  }
  if (origin && !ORIGIN_RE.test(origin)) {
    throw new CtxError('E_INPUT', 'origin 주소 형식이 아니다', { origin })
  }

  let old = null
  if (records) {
    const oldRoot = path.resolve(records.root)
    if (!(await fs.access(path.join(oldRoot, '_vocab.md')).then(() => true).catch(() => false))) {
      throw new CtxError('E_INPUT', '옮겨 올 옛 레포가 지식 레포가 아니다(_vocab.md 없음)', { from: oldRoot })
    }
    if (oldRoot === dst) throw new CtxError('E_INPUT', '옛 레포와 새 자리가 같다', { dest: dst })
    old = await loadRepo(oldRoot)
  }
  const picked = old ? pickRecords(old.works) : null
  const plan = {
    name,
    dest: dst,
    origin,
    push,
    steps: ['빈 틀(README · _vocab.md · _managed.md · .gitattributes · .gitignore · docs/ · work/)', ...(picked ? [`작업 기록 ${picked.keep.length}건 · 첨부 · 어휘 옮기기 (옛 기계 기록 ${picked.skip.length}건은 옮기지 않는다)`] : []), 'git init', '첫 커밋'],
  }
  if (origin) plan.steps.push('remote add origin')
  if (origin && push) plan.steps.push('push -u origin HEAD')
  if (dry) return { ...plan, dry: true }

  let created = false
  try {
    const p2 = (n) => String(n).padStart(2, '0')
    const date = `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())}`
    const files = skeletonFiles({ name, title, rebuiltFrom: old ? path.basename(old.root) : null, date })
    await fs.mkdir(dst, { recursive: true })
    created = true
    for (const [rel, text] of Object.entries(files)) {
      await fs.mkdir(path.dirname(path.join(dst, rel)), { recursive: true })
      await fs.writeFile(path.join(dst, rel), text, 'utf8')
    }
    // 다시 세우기 — 기록은 글자 하나 바꾸지 않고 옮긴다(사건이다). 첨부는 그 기록의 자리(`work/assets/<id>/`) 그대로
    let moved = null
    if (picked) {
      for (const d of picked.keep) await fs.copyFile(path.join(old.root, d.path), path.join(dst, 'work', path.basename(d.path)))
      let assets = 0
      for (const d of picked.keep) {
        const a = path.join(old.root, 'work', 'assets', d.id)
        if (await isDir(a)) {
          await fs.cp(a, path.join(dst, 'work', 'assets', d.id), { recursive: true })
          assets++
        }
      }
      const touched = new Set(picked.keep.flatMap((d) => d.touches || []))
      const v = carryVocab(old.vocabText || '', touched)
      await fs.writeFile(path.join(dst, '_vocab.md'), mergeVocab(files['_vocab.md'], v.text))
      moved = { from: path.basename(old.root), records: picked.keep.length, assets, skipped: picked.skip, vocab: v.carried.length, missing: v.missing }
    }

    let r = await git(dst, ['init', '-q'])
    if (!r.ok) throw new CtxError('E_GIT', 'git init 실패 — ' + r.err, {})
    // .gitattributes 가 LF 를 정하지만 이 PC 의 autocrlf 가 add 시점에 먹으므로 로컬 설정으로 한 번 더 막는다
    await git(dst, ['config', 'core.autocrlf', 'false'])
    r = await git(dst, ['add', '-A'])
    if (!r.ok) throw new CtxError('E_GIT', 'git add 실패 — ' + r.err, {})

    // 훅은 없다 — 이 PC 에 전역 훅이 걸려 있어도 돌리지 않는다(save 커밋과 같다 · V5)
    const who = `${author} <${author}@cdp>`
    const msg = moved ? `지식 레포 다시 세움 — ${moved.from} 의 작업 기록 ${moved.records}건을 옮겼다(관리 문서는 큐레이션으로 다시)` : '지식 레포 세움 — 빈 틀'
    r = await git(dst, ['-c', 'user.name=' + author, '-c', 'user.email=' + author + '@cdp', 'commit', '-q', '--no-verify', '--author=' + who, '-m', msg])
    if (!r.ok) throw new CtxError('E_GIT', '첫 커밋 실패 — ' + (r.err || r.out).split('\n').slice(0, 6).join(' / '), {})
    const head = await git(dst, ['rev-parse', '--short', 'HEAD'])
    const count = Number((await git(dst, ['ls-files'])).out.split('\n').filter(Boolean).length)

    let pushed = false
    if (origin) {
      r = await git(dst, ['remote', 'add', 'origin', origin])
      if (!r.ok) throw new CtxError('E_GIT', 'remote add 실패 — ' + r.err, { origin })
      if (sshCommand && isSsh(origin)) await git(dst, ['config', 'core.sshCommand', sshCommand])
      if (push) {
        r = await git(dst, ['push', '-q', '-u', 'origin', 'HEAD'], { timeout: 120000, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
        if (!r.ok) {
          // push 실패는 레포를 지울 이유가 아니다 — 세워진 것은 세워진 것이고,
          // 미러가 밀린 것은 `sync.mirror = lag` 로 보인다. 다만 사실을 알린다.
          return { ...plan, commit: head.out, files: count, pushed: false, pushError: (r.err || r.out).split('\n')[0], ...(moved ? { records: moved } : {}) }
        }
        pushed = true
      }
    }
    return { ...plan, commit: head.out, files: count, pushed, ...(moved ? { records: moved } : {}) }
  } catch (e) {
    // 반쪽 레포를 남기지 않는다. 우리가 만든 것만 지운다.
    if (created) await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

// origin 에서 받아 온다 — 등록의 **다른 길**(제품관리서비스 검토 D9). `git clone` 뒤 지식 레포인지
// (`_vocab.md`) 본다. 아니면 지운다 — 남의 레포를 <root> 에 두지 않는다. 훅은 걸지 않는다(v1.0 — save 커밋은
// `--no-verify` · 옛 레포의 도구 층은 `ctx migrate` 가 걷는다). 콘솔 `POST /admin/repos { clone }` 가 부른다.
export async function cloneRepo({ url, dest, timeout = 120000, sshCommand = null }) {
  const dst = path.resolve(dest)
  if (!url || !ORIGIN_RE.test(String(url))) {
    throw new CtxError('E_INPUT', 'origin 주소 형식이 아니다', { url })
  }
  const st = await fs.stat(dst).catch(() => null)
  if (st && (!st.isDirectory() || (await fs.readdir(dst)).length)) throw new CtxError('E_EXISTS', '그 자리에 이미 무엇이 있다', { dest: dst })
  await fs.mkdir(path.dirname(dst), { recursive: true })
  const ssh = sshCommand && isSsh(url) ? ['-c', 'core.sshCommand=' + sshCommand] : []
  const r = await git(path.dirname(dst), [...ssh, 'clone', '-q', String(url), dst], { timeout, env: { ...process.env, GIT_TERMINAL_PROMPT: '0' } })
  if (!r.ok) {
    await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw new CtxError('E_GIT', 'clone 실패 — ' + ((r.err || r.out).split('\n').find((l) => l.trim()) || '거부'), { url })
  }
  if (!(await fs.access(path.join(dst, '_vocab.md')).then(() => true).catch(() => false))) {
    await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw new CtxError('E_CHECK', 'clone 은 됐지만 지식 레포가 아니다(_vocab.md 없음) — 지웠다', { url })
  }
  if (ssh.length) await git(dst, ['config', 'core.sshCommand', sshCommand])
  const head = await git(dst, ['rev-parse', '--short', 'HEAD'])
  return { dest: dst, commit: head.out || null, origin: String(url) }
}

// 이미 선 레포를 원격에 잇는다 — 세울 때 origin 을 빠뜨렸거나 GitLab 프로젝트를 나중에 만든 경우.
// 전에는 셸의 두 줄(`remote add` · `push -u`)이었다. 콘솔 `POST /admin/repos/<이름>/origin` 이 부른다.
//
//   0  주소 모양 — 세우기 · 받아 오기와 같은 `ORIGIN_RE`
//   1  origin 이 없으면 add · 다르면 set-url · 같으면 그대로 (다시 누르면 다시 민다)
//   2  push -u origin HEAD — **강제하지 않는다.** 원격이 비어 있지 않으면 non-ff 로 거절되고 사유를 낸다
//
// push 가 실패해도 원격은 남긴다 — 흔한 실패는 자격(PAT · 키)이고, 고친 뒤 주소를 다시 칠 일이 없게.
// **잠그지 않는다** — 부르는 쪽(서버)이 save 와 같은 뮤텍스 안에서 부른다.
export async function connectOrigin({ root, url, push = true, timeout = 120000, sshCommand = null }) {
  const dir = path.resolve(root)
  const u = String(url || '').trim()
  if (!u || !ORIGIN_RE.test(u) || /\s/.test(u)) throw new CtxError('E_INPUT', 'origin 주소 형식이 아니다 — http(s):// · ssh:// · git@… · 경로', { url: maskUrl(u) })
  if (!(await isDir(path.join(dir, '.git')))) throw new CtxError('E_GIT', 'git 레포가 아니다', { root: dir })
  const cur = await git(dir, ['remote', 'get-url', 'origin'])
  const before = cur.ok ? cur.out : null
  if (before === null) {
    const r = await git(dir, ['remote', 'add', 'origin', u])
    if (!r.ok) throw new CtxError('E_GIT', 'remote add 실패 — ' + r.err, { url: maskUrl(u) })
  } else if (before !== u) {
    const r = await git(dir, ['remote', 'set-url', 'origin', u])
    if (!r.ok) throw new CtxError('E_GIT', 'remote set-url 실패 — ' + r.err, { url: maskUrl(u) })
  }
  // ssh 면 서버의 배포 키를 이 레포에 건다(로컬 설정 · G2). http 로 바꿨으면 옛 줄을 뗀다
  if (isSsh(u) && sshCommand) await git(dir, ['config', 'core.sshCommand', sshCommand])
  else if (!isSsh(u)) await git(dir, ['config', '--unset', 'core.sshCommand'])
  const res = { url: maskUrl(u), before: before === null ? null : maskUrl(before), changed: before !== u, pushed: false, reason: null, message: null }
  if (!push) return res
  const branch = (await git(dir, ['rev-parse', '--abbrev-ref', 'HEAD'])).out || 'HEAD'
  const p = await git(dir, ['-c', 'core.quotepath=false', 'push', '-u', 'origin', 'HEAD'], {
    timeout,
    // 자격을 묻는 프롬프트에서 멈추지 않는다 — 서버에는 답할 사람이 없다. 없으면 바로 auth 로 떨어진다
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0' },
  })
  if (p.ok) return { ...res, pushed: true, branch }
  const c = classifyPushError(p.err || p.out)
  return { ...res, branch, reason: c.reason, message: c.line ? maskUrl(c.line) : null }
}

// 레포를 **휴지통으로 옮긴다** — 영구 삭제는 없다. 원격에 없는 커밋이 있으면 그것이 유일한 사본이라서다.
// `<trashDir>/<이름>-<YYYYMMDD-HHMMSS>/` 로 옮기고 그 자리를 돌려준다. 되살리기는 셸에서 폴더를 되돌려 놓는 것.
// 지식 레포(`_vocab.md`)가 아니면 거절한다 — 남의 폴더를 치우지 않는다. **잠그지 않는다** — 부르는 쪽이 잠근다.
export async function trashRepo({ root, trashDir, now = new Date() }) {
  const src = path.resolve(root)
  if (!(await isDir(src))) throw new CtxError('E_NOT_FOUND', '그런 레포가 없다', { root: src })
  if (!(await fs.access(path.join(src, '_vocab.md')).then(() => true).catch(() => false))) {
    throw new CtxError('E_INPUT', '지식 레포가 아니다(_vocab.md 없음) — 치우지 않는다', { root: src })
  }
  const p2 = (n) => String(n).padStart(2, '0')
  const stamp = `${now.getFullYear()}${p2(now.getMonth() + 1)}${p2(now.getDate())}-${p2(now.getHours())}${p2(now.getMinutes())}${p2(now.getSeconds())}`
  await fs.mkdir(trashDir, { recursive: true })
  let dst = path.join(path.resolve(trashDir), `${path.basename(src)}-${stamp}`)
  for (let i = 2; await isDir(dst); i++) dst = path.join(path.resolve(trashDir), `${path.basename(src)}-${stamp}-${i}`)
  try {
    await fs.rename(src, dst)
  } catch (e) {
    // 휴지통이 다른 장치에 있으면 rename 이 안 된다 — 복사하고 원래 것을 지운다
    if (e?.code !== 'EXDEV') throw new CtxError('E_REPO', '옮기지 못했다 — ' + (e?.message || e), { root: src })
    await fs.cp(src, dst, { recursive: true })
    await fs.rm(src, { recursive: true, force: true })
  }
  return { from: src, to: dst }
}

// 서버 `<root>` 의 레포 목록 — 이름 · 판정 파일 · head. `doctor` 와 `ctx repo list` 가 쓴다.
export async function listRepos(root) {
  const out = []
  for (const e of (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue
    const dir = path.join(root, e.name)
    const vocab = await fs.access(path.join(dir, '_vocab.md')).then(() => true).catch(() => false)
    const isGit = await isDir(path.join(dir, '.git'))
    let head = null
    let branch = null
    let upstream = null
    let ahead = 0
    let behind = 0
    let dirty = 0
    let hooksPath = null
    if (isGit) {
      // `core/git.status` 하나 — 프로세스 넷이 둘로 줄고, `behind` · `dirty` 가 같이 온다
      // (doctor 의 「트리」 · 「origin」 줄 · 동시 기록 검토 v0.1 D5 · D9).
      const st = await gitStatus(dir).catch(() => ({ repo: false }))
      head = st.head ?? null
      branch = st.branch ?? null
      upstream = st.upstream ?? null
      ahead = st.ahead ?? 0
      behind = st.behind ?? 0
      dirty = st.dirty ?? 0
      hooksPath = st.hooksPath ?? null
    }
    out.push({ name: e.name, path: dir, vocab, git: isGit, head, branch, upstream, ahead, behind, dirty, hooksPath })
  }
  return out
}
