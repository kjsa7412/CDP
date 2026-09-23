// 지식 레포를 세운다 — 완성된 폴더를 복사하고 git 을 초기화한다. 검토 §3.5 · R6.
//
// "복사하면 그게 지식 레포다"(install.md ③)가 사람 손이었다 — xcopy · git init ·
// hooksPath 세 줄. 로컬에서는 그것으로 족하지만 서버에는 복사할 사람이 없다.
// 그래서 그 세 줄을 함수로 만들고, CLI(`ctx repo new`)와 관리 서비스
// (`POST /repos`)가 **같은 것을** 부른다.
//
//   0  dest 가 없거나 빈 폴더여야 한다.  남의 폴더에 쓰지 않는다
//   1  from 을 복사한다.  exe · _package.json 은 담지 않는다
//   2  work/.gitkeep · git init · core.hooksPath .githooks
//   3  첫 커밋 — **훅이 돈다.** ctx check 를 통과해야 세워진 것이다
//   4  origin 이 있으면 remote add · push 면 push -u
//
// 판정을 새로 짜지 않는다 — 검사는 훅이 `bin/ctx check` 로 한다. 그것이
// 통과하지 않으면 dest 를 지우고 E_CHECK 다. 반쪽 레포를 남기지 않는다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import { CtxError } from './tools.js'

export const REPO_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

const SKIP = new Set(['_package.json', 'convert'])

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

async function copyTree(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    if (SKIP.has(e.name)) continue
    if (e.isFile() && /[.]exe$/i.test(e.name)) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) await copyTree(s, d)
    else await fs.copyFile(s, d)
  }
}

/**
 * @param from     완성된 지식 레포 폴더 (서버 산출물 packages/<이름>/ 또는 assemble 결과)
 * @param dest     만들 자리
 * @param origin   git 원격 주소 (선택). **이미 있는 빈 프로젝트**여야 한다 — 서버가 만들 수는 없다
 * @param push     origin 에 첫 커밋을 보낼지
 * @param author   첫 커밋의 작성자 이름 (기본 cdp)
 * @param dry      무엇을 할지만 낸다
 */
export async function newRepo({ from, dest, origin = null, push = false, author = 'cdp', dry = false }) {
  const src = path.resolve(from)
  const dst = path.resolve(dest)
  const name = path.basename(dst)

  if (!(await isDir(src))) throw new CtxError('E_INPUT', `복사할 폴더가 없다 — ${src}`, { from: src })
  if (!(await fs.access(path.join(src, '_vocab.md')).then(() => true).catch(() => false))) {
    throw new CtxError('E_INPUT', '완성된 지식 레포 폴더가 아니다 (_vocab.md 없음)', { from: src })
  }
  if (!REPO_NAME_RE.test(name)) throw new CtxError('E_INPUT', '레포 이름 형식이 아니다 (영문·숫자·._-)', { name })
  if (await isDir(dst)) {
    const ents = await fs.readdir(dst)
    if (ents.length) throw new CtxError('E_EXISTS', '그 자리에 이미 무엇이 있다 — 빈 폴더거나 없어야 한다', { dest: dst })
  }
  if (origin && !/^(https?:\/\/|ssh:\/\/|git@|file:\/\/|\/|[A-Za-z]:[\\/])/.test(origin)) {
    throw new CtxError('E_INPUT', 'origin 주소 형식이 아니다', { origin })
  }

  const plan = { name, from: src, dest: dst, origin, push, steps: ['복사', 'work/.gitkeep', 'git init', 'core.hooksPath .githooks', '첫 커밋 (훅이 ctx check 를 돈다)'] }
  if (origin) plan.steps.push('remote add origin')
  if (origin && push) plan.steps.push('push -u origin HEAD')
  if (dry) return { ...plan, dry: true }

  let created = false
  try {
    await copyTree(src, dst)
    created = true
    await fs.mkdir(path.join(dst, 'work'), { recursive: true })
    await fs.writeFile(path.join(dst, 'work', '.gitkeep'), '')
    // sh 스크립트 실행 권한 — POSIX 에서만 뜻이 있다
    for (const f of ['bin/ctx', '.githooks/pre-commit']) await fs.chmod(path.join(dst, f), 0o755).catch(() => {})

    let r = await git(dst, ['init', '-q'])
    if (!r.ok) throw new CtxError('E_GIT', 'git init 실패 — ' + r.err, {})
    r = await git(dst, ['config', 'core.hooksPath', '.githooks'])
    if (!r.ok) throw new CtxError('E_GIT', 'hooksPath 설정 실패 — ' + r.err, {})
    // 훅 · bin/ctx 가 CRLF 로 체크아웃되지 않게 — .gitattributes 가 있지만 이 PC 의
    // autocrlf 가 add 시점에 먹으므로 로컬 설정으로 한 번 더 막는다.
    await git(dst, ['config', 'core.autocrlf', 'false'])
    r = await git(dst, ['add', '-A'])
    if (!r.ok) throw new CtxError('E_GIT', 'git add 실패 — ' + r.err, {})

    // **첫 커밋에서 훅이 돈다.** 여기서 막히면 패키지가 규약을 어긴 것이다.
    const who = `${author} <${author}@cdp>`
    r = await git(dst, ['-c', 'user.name=' + author, '-c', 'user.email=' + author + '@cdp', 'commit', '-q', '--author=' + who, '-m', `지식 레포 세움 — ${path.basename(src)}`])
    if (!r.ok) {
      throw new CtxError('E_CHECK', '첫 커밋이 막혔다 — 훅의 검사가 통과하지 않았다', { message: (r.err || r.out).split('\n').slice(0, 12).join('\n') })
    }
    const head = await git(dst, ['rev-parse', '--short', 'HEAD'])
    const files = Number((await git(dst, ['ls-files'])).out.split('\n').filter(Boolean).length)

    let pushed = false
    if (origin) {
      r = await git(dst, ['remote', 'add', 'origin', origin])
      if (!r.ok) throw new CtxError('E_GIT', 'remote add 실패 — ' + r.err, { origin })
      if (push) {
        r = await git(dst, ['push', '-q', '-u', 'origin', 'HEAD'], { timeout: 120000 })
        if (!r.ok) {
          // push 실패는 레포를 지울 이유가 아니다 — 세워진 것은 세워진 것이고,
          // 미러가 밀린 것은 `sync.mirror = lag` 로 보인다. 다만 사실을 알린다.
          return { ...plan, commit: head.out, files, pushed: false, pushError: (r.err || r.out).split('\n')[0] }
        }
        pushed = true
      }
    }
    return { ...plan, commit: head.out, files, pushed }
  } catch (e) {
    // 반쪽 레포를 남기지 않는다. 우리가 만든 것만 지운다.
    if (created) await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw e
  }
}

// origin 에서 받아 온다 — 등록의 **다른 길**(제품관리서비스 검토 D9). `git clone` 뒤 지식 레포인지
// (`_vocab.md`) 본다. 아니면 지운다 — 남의 레포를 <root> 에 두지 않는다. 훅 경로도 건다(로컬형 clone
// 과 같은 세 줄). 콘솔 `POST /admin/repos { clone }` 가 부른다.
export async function cloneRepo({ url, dest, timeout = 120000 }) {
  const dst = path.resolve(dest)
  if (!url || !/^(https?:\/\/|ssh:\/\/|git@|file:\/\/|[A-Za-z]:[\\/]|\/)/.test(String(url))) {
    throw new CtxError('E_INPUT', 'origin 주소 형식이 아니다', { url })
  }
  const st = await fs.stat(dst).catch(() => null)
  if (st && (!st.isDirectory() || (await fs.readdir(dst)).length)) throw new CtxError('E_EXISTS', '그 자리에 이미 무엇이 있다', { dest: dst })
  await fs.mkdir(path.dirname(dst), { recursive: true })
  const r = await git(path.dirname(dst), ['clone', '-q', String(url), dst], { timeout })
  if (!r.ok) {
    await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw new CtxError('E_GIT', 'clone 실패 — ' + ((r.err || r.out).split('\n').find((l) => l.trim()) || '거부'), { url })
  }
  if (!(await fs.access(path.join(dst, '_vocab.md')).then(() => true).catch(() => false))) {
    await fs.rm(dst, { recursive: true, force: true }).catch(() => {})
    throw new CtxError('E_CHECK', 'clone 은 됐지만 지식 레포가 아니다(_vocab.md 없음) — 지웠다', { url })
  }
  await git(dst, ['config', 'core.hooksPath', '.githooks'])
  const head = await git(dst, ['rev-parse', '--short', 'HEAD'])
  return { dest: dst, commit: head.out || null, origin: String(url) }
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
    let upstream = null
    let ahead = 0
    let hooksPath = null
    if (isGit) {
      head = (await git(dir, ['rev-parse', '--short', 'HEAD'])).out || null
      upstream = (await git(dir, ['rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{u}'])).out || null
      hooksPath = (await git(dir, ['config', '--get', 'core.hooksPath'])).out || null
      if (upstream) {
        const c = await git(dir, ['rev-list', '--left-right', '--count', `${upstream}...HEAD`])
        if (c.ok) ahead = Number(c.out.split(/\s+/)[1]) || 0
      }
    }
    out.push({ name: e.name, path: dir, vocab, git: isGit, head, upstream, ahead, hooksPath })
  }
  return out
}
