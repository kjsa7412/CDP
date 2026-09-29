// 토큰을 이 PC 에 둔다 — 설치기(`viewer/bin/cdp-install.mjs`)가 부른다. 설치 한 줄 TODO I4.
//
// **왜 환경변수인가.** `.mcp.json` 의 `Authorization: Bearer ${CDP_TOKEN}` 을 Claude Code 가 시작할 때
// **프로세스 환경변수로만** 채운다 — `.claude/settings.local.json` 의 `env` 로는 안 채워졌다
// (실측 · Claude Code 2.1.92 · I5). 그래서 파일 한 곳이 아니라 이 사람의 환경에 둔다.
//
// **원문이 명령줄에 뜨지 않게 한다.** Windows 는 PowerShell 에 표준 입력으로 넘긴다 — 인자로 넘기면
// 프로세스 목록 · 감사 도구에 그대로 남는다. macOS · Linux 는 600 파일에 두고 rc 에는 그것을 읽는
// 한 줄만 적는다 — rc 는 남이 읽을 수 있는 배치가 있다(홈이 755 인 리눅스).

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { spawnSync } from 'node:child_process'

const NL = String.fromCharCode(10)

// rc 에 붙는 줄. 끝의 표지로 **두 번 붙지 않게** 한다 — 값은 파일에 있으므로 줄은 한 번이면 된다.
export const RC_MARK = '# cdp:token'
export const RC_LINE = 'export CDP_TOKEN="$(cat "$HOME/.config/cdp/token" 2>/dev/null)"  ' + RC_MARK

// 어디에 두는지 — 묻는 문장과 끝 안내가 같은 말을 쓴다
export function storeLabel({ platform = process.platform, shell = process.env.SHELL || '', home = os.homedir() } = {}) {
  if (platform === 'win32') return '사용자 환경변수 CDP_TOKEN'
  return `~/.config/cdp/token (+ ${path.basename(rcFile({ shell, home }))} 에 한 줄)`
}

export function rcFile({ shell = process.env.SHELL || '', home = os.homedir() } = {}) {
  return path.join(home, /zsh$/.test(shell) ? '.zshrc' : '.bashrc')
}

export async function saveTokenPosix(token, { home = os.homedir(), shell = process.env.SHELL || '' } = {}) {
  const dir = path.join(home, '.config', 'cdp')
  await fs.mkdir(dir, { recursive: true, mode: 0o700 })
  const file = path.join(dir, 'token')
  await fs.writeFile(file, String(token).trim() + NL, { mode: 0o600 })
  // 이미 있던 파일이면 writeFile 의 mode 가 안 먹는다
  await fs.chmod(file, 0o600).catch(() => {})
  const rc = rcFile({ shell, home })
  const had = await fs.readFile(rc, 'utf8').catch(() => '')
  const added = !had.includes(RC_MARK)
  if (added) await fs.appendFile(rc, (had && !had.endsWith(NL) ? NL : '') + RC_LINE + NL)
  return { file, rc, added }
}

// 사용자 범위(HKCU\Environment) — 관리자 권한이 필요 없다. SetEnvironmentVariable 은 WM_SETTINGCHANGE 를
// 알려서 **새로 뜨는** 프로세스부터 보인다. 지금 열린 터미널 · IDE 에는 안 보인다 — 그래서 끝에 「다시 켠다」.
export function saveTokenWindows(token, { name = 'CDP_TOKEN' } = {}) {
  if (!/^[A-Z_][A-Z0-9_]*$/.test(name)) throw new Error('변수 이름이 이상하다 — ' + name)
  const r = spawnSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', `$t = [Console]::In.ReadLine(); [Environment]::SetEnvironmentVariable('${name}', $t.Trim(), 'User')`],
    { input: String(token).trim() + NL, encoding: 'utf8', windowsHide: true }
  )
  if (r.error || r.status !== 0) throw new Error('사용자 환경변수에 쓰지 못했다 — ' + (r.error?.message || String(r.stderr || '').trim() || 'exit ' + r.status))
  return { where: 'HKCU\\Environment\\' + name }
}

export async function saveToken(token, opts = {}) {
  const platform = opts.platform || process.platform
  if (platform === 'win32') return saveTokenWindows(token, opts)
  return saveTokenPosix(token, opts)
}
