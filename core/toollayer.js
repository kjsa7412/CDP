// 지식 레포의 도구 층(에이전트 세팅)을 배포본의 판으로 맞춘다. 에이전트 세팅 갱신 TODO T1~T6.
//
// **작업 레포에 가는 스킬은 지식 레포 안에서 나온다**(`collectKit` · `kitHash` 가 `<레포>/.claude/skills` 를 읽는다).
// 그래서 서버를 올려도 레포의 스킬이 옛 판이면 kit 해시가 그대로고, 대장에도 `sync` 에도 「낡음」 이 안 뜬다 —
// v0.18.0 에서 스킬을 고친 뒤 실제로 그랬다. upgrade 가 이 함수를 불러 도구 층을 새 판으로 간다.
//
// 도구 층 = 배포본이 **모든 패키지에 똑같이** 붓는 것(`ops/lib/assemble.mjs` 의 첫 묶음). 지식(`_vocab.md` ·
// `_managed.md` · `docs/` · `work/`)과 팀이 고치는 파일(`README.md` · `.gitignore`)은 건드리지 않는다.
//
// **한 커밋이다.** 쓰고 커밋하고, 커밋이 막히면(훅) 쓴 것을 원래대로 돌린다 — 반쯤 갈린 도구 층은
// 스킬과 도구가 서로 다른 판을 말하게 만든다. 잠그지 않는다 — 부르는 쪽이 save 와 같은 뮤텍스 안에서 부른다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as git from './git.js'

// 파일 하나씩. 배포본에 없는 것은 비교에서 빠진다(옛 배포본 · 시험 레포).
export const TOOL_FILES = [
  '.claude/work-repo/CLAUDE.md',
  'CLAUDE.md',
  'TEMPLATE-work.md',
  'MANUAL.md',
  'MANUAL-관리자.md',
  'MANUAL-시스템.md',
  '.githooks/pre-commit',
  'bin/ctx',
  'bin/ctx.mjs',
  'bin/ctx.cmd',
  '.gitattributes',
]
// 폴더째 맞추는 것 — `cdp-` 로 시작하는 스킬만(작업 레포의 `ctx setup` 과 같은 규칙 · setup.js)
export const SKILLS_DIR = '.claude/skills'
const PREFIX = 'cdp-'
const EXEC = new Set(['bin/ctx', '.githooks/pre-commit'])

const noCR = (b) => (b == null ? null : Buffer.from(b).toString('utf8').replace(/\r\n/g, '\n'))

async function readBuf(p) {
  return fs.readFile(p).catch(() => null)
}
async function isDir(p) {
  return fs.stat(p).then((s) => s.isDirectory()).catch(() => false)
}

async function listFiles(dir, rel = '') {
  const out = []
  for (const e of (await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    const r = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) out.push(...(await listFiles(dir, r)))
    else if (e.isFile()) out.push(r)
  }
  return out
}

// 배포본(from) 쪽 도구 층의 파일 목록 — 상대 경로 · 레포 안 경로와 같다
async function sourceFiles(from) {
  const files = []
  for (const f of TOOL_FILES) if (await readBuf(path.join(from, f))) files.push(f)
  const sk = path.join(from, SKILLS_DIR)
  for (const e of (await fs.readdir(sk, { withFileTypes: true }).catch(() => [])).filter((x) => x.isDirectory() && x.name.startsWith(PREFIX))) {
    for (const f of await listFiles(path.join(sk, e.name))) files.push(`${SKILLS_DIR}/${e.name}/${f}`)
  }
  return files.sort()
}

// 레포 쪽 `cdp-*` 스킬 파일 — 배포본에 없으면 지운다(판에서 빠진 스킬)
async function repoSkillFiles(root) {
  const out = []
  const sk = path.join(root, SKILLS_DIR)
  for (const e of (await fs.readdir(sk, { withFileTypes: true }).catch(() => [])).filter((x) => x.isDirectory() && x.name.startsWith(PREFIX))) {
    for (const f of await listFiles(path.join(sk, e.name))) out.push(`${SKILLS_DIR}/${e.name}/${f}`)
  }
  return out
}

/**
 * 무엇이 다른가. 파일은 건드리지 않는다.
 * @returns {{ changes: { path, op: 'create'|'update'|'delete' }[], same: number }}
 */
export async function planToolLayer(root, from) {
  const R = path.resolve(root)
  const F = path.resolve(from)
  if (!(await isDir(path.join(F, SKILLS_DIR)))) {
    throw Object.assign(new Error(`배포본에 ${SKILLS_DIR} 가 없다 — ${F}`), { code: 'E_INPUT' })
  }
  const src = await sourceFiles(F)
  const changes = []
  let same = 0
  for (const rel of src) {
    const a = await readBuf(path.join(F, rel))
    const b = await readBuf(path.join(R, rel))
    if (b == null) changes.push({ path: rel, op: 'create' })
    else if (noCR(a) !== noCR(b)) changes.push({ path: rel, op: 'update' })
    else same++
  }
  const keep = new Set(src)
  for (const rel of await repoSkillFiles(R)) if (!keep.has(rel)) changes.push({ path: rel, op: 'delete' })
  return { changes, same }
}

/**
 * 도구 층을 배포본의 판으로 맞추고 한 커밋으로 남긴다.
 *
 *   same      이미 같다 — 아무것도 안 한다
 *   dry       바꿀 것이 있다(dry 라 안 썼다)
 *   updated   커밋했다
 *   skipped   못 했다 — reason: not-git · dirty · behind · hook · commit
 */
export async function refreshToolLayer(root, from, { dry = false, author = 'cdp', message = null, commitTimeout = 180000 } = {}) {
  const R = path.resolve(root)
  const { changes } = await planToolLayer(R, from)
  if (!changes.length) return { state: 'same', reason: null, changes, commit: null }

  const st = await git.status(R).catch(() => ({ repo: false }))
  if (!st.repo) return { state: 'skipped', reason: 'not-git', changes, commit: null }
  // 더러운 트리 위에 커밋하면 남의 줄이 이 커밋에 딸려 간다(동시 기록 검토 v0.1 M8)
  if (st.dirty > 0) return { state: 'skipped', reason: 'dirty', changes, commit: null, dirtyPaths: st.dirtyPaths }
  // origin 이 앞서 있는데 커밋하면 갈라진다 — 「origin 과 맞추기」 가 먼저다
  if (st.upstream && st.behind > 0) return { state: 'skipped', reason: 'behind', changes, commit: null, behind: st.behind }
  if (dry) return { state: 'dry', reason: null, changes, commit: null }

  // 쓰기 전의 것을 든다 — 커밋이 막히면 그대로 돌린다
  const before = new Map()
  for (const c of changes) before.set(c.path, await readBuf(path.join(R, c.path)))
  const restore = async () => {
    for (const [rel, buf] of before) {
      const abs = path.join(R, rel)
      if (buf == null) await fs.rm(abs, { force: true }).catch(() => {})
      else {
        await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => {})
        await fs.writeFile(abs, buf).catch(() => {})
      }
    }
    await pruneEmpty(R, changes)
  }

  const F = path.resolve(from)
  try {
    for (const c of changes) {
      const abs = path.join(R, c.path)
      if (c.op === 'delete') {
        await fs.rm(abs, { force: true })
        continue
      }
      await fs.mkdir(path.dirname(abs), { recursive: true })
      await fs.writeFile(abs, await fs.readFile(path.join(F, c.path)))
      if (EXEC.has(c.path)) await fs.chmod(abs, 0o755).catch(() => {})
    }
    await pruneEmpty(R, changes)
  } catch (e) {
    await restore()
    throw e
  }

  const head0 = await headOf(R)
  const c = await git.commitPaths(R, changes.map((x) => x.path), {
    message: (typeof message === 'function' ? message(changes) : message) || `에이전트 세팅 갱신 — 도구 층 ${changes.length}건`,
    author,
    // 훅이 새 번들로 check · index 를 돈다 — save 의 20초로는 모자랄 수 있다
    timeout: commitTimeout,
  })
  if (!c.ok) {
    // **git 이 아직 돌고 있을 수 있다.** 시간이 다 되면 호출은 끝나지만 Windows 에서는 `git` 실행기만 죽고 진짜 git 은
    // 살아서 커밋을 마친다. 그 사이 여기서 색인을 비우고 파일을 돌리면 git 이 빈 색인을 커밋한다 — 빈 커밋 + 옛 파일이
    // 남았다(2026-09-29 콘솔 실측). 그래서 git 이 쥔 `index.lock` 이 풀릴 때까지 기다린 뒤에 판정한다.
    const lock = path.join(R, '.git', 'index.lock')
    for (let i = 0; i < 600 && (await fs.access(lock).then(() => true).catch(() => false)); i++) await new Promise((res) => setTimeout(res, 500))
    if (await fs.access(lock).then(() => true).catch(() => false)) {
      // 5분이 지나도 잠겨 있다 — 무엇이 쥐었는지 모르니 손대지 않는다
      return { state: 'skipped', reason: 'commit', message: '.git/index.lock 이 풀리지 않았다 — 파일은 쓴 채로 두었다. 셸에서 확인한다', changes, commit: null }
    }
    // HEAD 가 움직였으면 커밋은 된 것이다 — 호출만 늦게 실패로 돌아왔다
    const head1 = await headOf(R)
    if (head1 && head1 !== head0) return { state: 'updated', reason: null, changes, commit: head1.slice(0, 7), late: true }
    // 색인에 올라간 것을 먼저 내리고(그 경로만 · reset --hard 가 아니다) 파일을 돌린다 — 다음 save 가 「더러운 트리」 로 막히지 않게
    await unstage(R, changes.map((x) => x.path))
    await restore()
    return { state: 'skipped', reason: c.reason === 'commit' ? 'hook' : 'commit', message: c.message ?? null, changes, commit: null }
  }
  return { state: 'updated', reason: null, changes, commit: c.commit }
}

function headOf(root) {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, 'rev-parse', 'HEAD'], { windowsHide: true, timeout: 30000, encoding: 'utf8' }, (e, out) => resolve(e ? null : String(out).trim()))
  })
}

function unstage(root, paths) {
  return new Promise((resolve) => {
    execFile('git', ['-C', root, 'reset', '-q', '--', ...paths], { windowsHide: true, timeout: 30000 }, () => resolve())
  })
}

// 지운 스킬의 빈 폴더를 치운다 — git 은 빈 폴더를 모르지만 kit 을 만드는 쪽(collectKit)은 폴더를 센다
async function pruneEmpty(root, changes) {
  const dirs = new Set()
  for (const c of changes) {
    if (!c.path.startsWith(SKILLS_DIR + '/')) continue
    let d = path.posix.dirname(c.path)
    while (d.length > SKILLS_DIR.length) {
      dirs.add(d)
      d = path.posix.dirname(d)
    }
  }
  for (const d of [...dirs].sort((a, b) => b.length - a.length)) {
    const abs = path.join(root, d)
    const ents = await fs.readdir(abs).catch(() => null)
    if (ents && !ents.length) await fs.rmdir(abs).catch(() => {})
  }
}

// 사람에게 보일 한 줄
export const REASON_TEXT = {
  'not-git': 'git 레포가 아니다',
  dirty: '서버 트리에 커밋 안 된 변경이 있다 — 「트리 되돌리기」 뒤에',
  behind: 'origin 이 앞서 있다 — 「origin 과 맞추기」 뒤에',
  hook: '커밋 훅(ctx check)이 막았다 — 되돌렸다',
  commit: '커밋하지 못했다 — 되돌렸다',
}

export function describe(r) {
  if (!r) return '—'
  if (r.state === 'same') return '최신'
  if (r.state === 'dry') return `다름 ${r.changes.length}건`
  if (r.state === 'updated') return `갱신 ${r.changes.length}건 → ${r.commit}`
  return `건너뜀 — ${REASON_TEXT[r.reason] || r.reason}${r.changes?.length ? ` (다름 ${r.changes.length}건)` : ''}`
}
