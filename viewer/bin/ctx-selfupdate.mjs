// ctx self-update — 개인 서버의 판 올림. 제품화 2 검토 §5.1 · TODO ③(F3).
//
//   ctx self-update <cdp-server-v*.tar.gz | https://…/cdp-server-v*.tar.gz> [--dry]
//
// 전에는 운영자가 손으로 했다 — tar 풀기 → ~/.cdp/server/v<판> 으로 복사 → current 링크 바꾸기 → 서버 다시 띄우기 →
// 작업 레포마다 설치기 --update. 앞의 넷을 이 명령이 한다. 마지막(작업 레포 커밋)은 사람 몫이라 한 줄로 알린다.
//
//   ~/.cdp/server/v<판>/          산출물 그대로(bin · web · forms · kit · manual · deploy)
//   ~/.cdp/server/current  →  v<판>   서비스(ctx up --service)는 이 자리의 bin/ctx.mjs 를 부른다
//
// 옆에 SHA256SUMS 가 있으면 대조한다(Release 에 같이 붙는다) — 다르면 멈춘다.

import fs from 'node:fs/promises'
import fss from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import crypto from 'node:crypto'
import { unpackTar, extractTar } from '../../core/tar.js'
import { restartService } from './ctx-up.mjs'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

export const serverHome = (home = os.homedir()) => path.join(home, '.cdp', 'server')

async function readSource(src) {
  if (/^https?:\/\//.test(src)) {
    const r = await fetch(src)
    if (!r.ok) throw new Error(`받지 못했다 — ${src} (HTTP ${r.status})`)
    const buf = Buffer.from(await r.arrayBuffer())
    const sums = await fetch(new URL('SHA256SUMS', src)).then((x) => (x.ok ? x.text() : null)).catch(() => null)
    return { buf, sums, file: path.basename(new URL(src).pathname) }
  }
  const abs = path.resolve(src)
  const buf = await fs.readFile(abs)
  const sums = await fs.readFile(path.join(path.dirname(abs), 'SHA256SUMS'), 'utf8').catch(() => null)
  return { buf, sums, file: path.basename(abs) }
}

export async function runSelfUpdate(opt) {
  const src = opt.args?.[0]
  if (!src) {
    err('ctx self-update <cdp-server-v*.tar.gz | url> [--dry]')
    return 2
  }
  try {
    const { buf, sums, file } = await readSource(src)
    if (sums) {
      const want = sums.split(NL).map((l) => l.trim().split(/\s+\*?/)).find((x) => x[1] === file)?.[0]
      const got = crypto.createHash('sha256').update(buf).digest('hex')
      if (want && want !== got) throw new Error(`SHA256 이 다르다 — ${file} (받은 것이 깨졌거나 바뀌었다)`)
      if (want) out(`대조     SHA256 ✓`)
    }
    const ents = unpackTar(buf)
    const top = ents.find((e) => /^cdp-server-v[^/]+$/.test(e.name.replace(/\/$/, '')))?.name || ents[0]?.name.split('/')[0]
    const m = /^cdp-server-v(.+)$/.exec(top || '')
    if (!m) throw new Error('서버 산출물(cdp-server-v<판>/)이 아니다')
    const ver = m[1]
    for (const need of ['bin/ctx.mjs', 'web/index.html']) {
      if (!ents.some((e) => e.name === `${top}/${need}`)) throw new Error(`산출물에 ${need} 가 없다`)
    }
    const home = serverHome()
    const dest = path.join(home, 'v' + ver)
    const cur = path.join(home, 'current')
    const before = await fs.readlink(cur).catch(() => null)
    out(`판       v${ver}${before ? `  (지금 ${path.basename(before)})` : ''}`)
    out(`자리     ${dest}`)
    if (opt.dry) {
      out('--dry 이므로 쓰지 않았다.')
      return 0
    }
    // 임시 자리에 풀고 옮긴다 — 반쯤 풀린 판이 current 가 되지 않게
    await fs.mkdir(home, { recursive: true })
    const tmp = await fs.mkdtemp(path.join(home, '.incoming-'))
    try {
      extractTar(buf, tmp)
      if (fss.existsSync(dest)) await fs.rename(dest, dest + '.old-' + Date.now())
      await fs.rename(path.join(tmp, top), dest)
    } finally {
      await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
    }
    // current 를 옮긴다 — 상대 링크(폴더째 옮겨도 산다). Windows 는 junction(관리자 권한이 필요 없다)
    const next = cur + '.next'
    // 링크만 지운다 — 재귀 삭제는 junction 을 따라가 그 판 폴더를 비운다(worktree 에서 실측한 함정)
    const dropLink = async (p) => {
      const st = await fs.lstat(p).catch(() => null)
      if (!st) return
      if (!st.isSymbolicLink()) throw new Error(`${p} 가 링크가 아니다 — 손으로 본다`)
      await fs.unlink(p).catch(() => fs.rmdir(p))
    }
    await dropLink(next)
    if (process.platform === 'win32') await fs.symlink(dest, next, 'junction')
    else await fs.symlink('v' + ver, next)
    // Windows 는 있는 junction 위로 rename 하지 못한다(EPERM) — 옛 current 링크를 먼저 걷는다(그 사이 잠깐 비지만 shim 은 다음 실행에 읽는다)
    if (process.platform === 'win32') await dropLink(cur)
    await fs.rename(next, cur)
    out(`current  → v${ver}`)
    // 명령 자리 — ~/.cdp/bin/ctx 가 늘 current 를 부른다. 처음 한 번 PATH 에 넣으면 판이 바뀌어도 그대로다
    const shim = await writeShim()
    if (shim.added) out(`명령     ${shim.file}`)
    if (!shim.onPath) out(`         PATH 에 한 줄 — ${shim.pathLine}`)

    // 서비스로 뜬 개인 서버를 다시 띄운다(ctx up --service 로 건 것)
    const personal = path.join(os.homedir(), '.cdp', 'personal')
    const names = (await fs.readdir(personal).catch(() => [])).filter((n) => fss.existsSync(path.join(personal, n, 'up.json')))
    const restarted = names.filter((n) => restartService(n))
    if (restarted.length) out(`다시 띄움 ${restarted.join(' · ')}`)
    const fg = names.filter((n) => !restarted.includes(n))
    out('')
    out('다음 —')
    if (fg.length) out(`  · 터미널에서 띄운 개인 서버(${fg.join(' · ')})는 Ctrl+C 뒤 ctx up 을 다시 — 새 판으로 뜬다`)
    out(`  · 작업 레포 · 큐레이터 폴더 — ctx up <레포> --update [--commit]   (팀원은 커밋을 pull)`)
    out('  · Claude Code 를 다시 켜면 새 스킬을 읽는다')
    return 0
  } catch (e) {
    err('ctx self-update: ' + (e?.message || e))
    return 2
  }
}

export async function writeShim({ home = os.homedir(), platform = process.platform, env = process.env } = {}) {
  const dir = path.join(home, '.cdp', 'bin')
  await fs.mkdir(dir, { recursive: true })
  const target = path.join(home, '.cdp', 'server', 'current', 'bin', 'ctx.mjs')
  const file = path.join(dir, platform === 'win32' ? 'ctx.cmd' : 'ctx')
  const text = platform === 'win32' ? `@node "${target}" %*\r\n` : `#!/bin/sh\nexec node "${target}" "$@"\n`
  const had = await fs.readFile(file, 'utf8').catch(() => null)
  if (had !== text) await fs.writeFile(file, text, { mode: 0o755 })
  const onPath = String(env.PATH || '').split(path.delimiter).some((p) => path.resolve(p || '.') === dir)
  const pathLine = platform === 'win32' ? `setx PATH "%PATH%;${dir}"` : `echo 'export PATH="$HOME/.cdp/bin:$PATH"' >> ~/${/zsh$/.test(env.SHELL || '') ? '.zshrc' : '.bashrc'}`
  return { file, added: had !== text, onPath, pathLine }
}
