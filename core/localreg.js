// 이 PC 의 설치 목록 — 어느 작업 레포에 어느 서버 · 레포로 CDP 를 붙였나. 에이전트 세팅 갱신 TODO T9.
//
// **경로를 아는 것은 그 PC 뿐이다.** 브라우저는 PC 에 못 쓰고(§6.7.1) 서버의 대장은 작업 레포 id 와 담당자만
// 든다. 그래서 설치기가 설치할 때마다 여기 한 줄을 적고, 에이전트 세팅이 바뀌면 `--update` 가 이 목록을
// 한 번에 돈다 — 다섯 곳이면 행 다섯 개를 따로 누르던 것이 한 줄이 된다.
//
// **권한을 들지 않는다.** 토큰도 없다 — 잃어도 행의 한 줄로 한 번 설치하면 다시 들어간다. 그래서 깨진
// 파일은 옆으로 치우고 새로 쓴다(서버의 대장 · 명부처럼 막지 않는다).
//
//   Windows   %APPDATA%\cdp\workrepos.json
//   그 밖     ~/.config/cdp/workrepos.json      (토큰 파일과 같은 폴더 · tokenstore.js)
//   CDP_CONFIG_DIR 이 있으면 그 폴더 — 시험 · 여러 계정

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

export function regFile({ env = process.env, platform = process.platform, home = os.homedir() } = {}) {
  if (env.CDP_CONFIG_DIR) return path.join(env.CDP_CONFIG_DIR, 'workrepos.json')
  if (platform === 'win32') return path.join(env.APPDATA || path.join(home, 'AppData', 'Roaming'), 'cdp', 'workrepos.json')
  return path.join(home, '.config', 'cdp', 'workrepos.json')
}

// 같은 폴더인지 — Windows 는 대소문자를 가리지 않는다
export function samePath(a, b, platform = process.platform) {
  const n = (p) => {
    const r = path.resolve(p).replace(/[\\/]+$/, '')
    return platform === 'win32' ? r.toLowerCase() : r
  }
  return n(a) === n(b)
}

const normServer = (s) => String(s || '').replace(/\/+$/, '')

export async function loadReg(file = regFile()) {
  const raw = await fs.readFile(file, 'utf8').catch(() => null)
  if (raw == null) return { entries: [] }
  try {
    const j = JSON.parse(raw)
    return { entries: Array.isArray(j?.entries) ? j.entries.filter((e) => e && e.path && e.server && e.repo) : [] }
  } catch {
    // 깨졌으면 옆으로 치우고 빈 목록 — 설치를 막을 일이 아니다
    await fs.rename(file, file + '.broken-' + Date.now()).catch(() => {})
    return { entries: [], broken: true }
  }
}

export async function saveReg(db, file = regFile()) {
  await fs.mkdir(path.dirname(file), { recursive: true })
  const tmp = file + '.tmp-' + process.pid
  await fs.writeFile(tmp, JSON.stringify({ version: 1, entries: db.entries }, null, 2) + '\n', 'utf8')
  await fs.rename(tmp, file)
}

// 한 줄 적는다 — **경로가 열쇠다.** 작업 레포 하나의 `.mcp.json` 에는 `cdp` 항목이 하나뿐이라
// 같은 경로를 다른 서버 · 레포로 다시 설치하면 옛 줄을 바꿔 쓴다.
export function record(db, { server, repo, workrepo = null, path: p, kit = null, at = new Date() }, platform = process.platform) {
  const row = {
    path: path.resolve(p),
    server: normServer(server),
    repo,
    workrepo: workrepo || null,
    kit: kit || null,
    at: (at instanceof Date ? at : new Date(at)).toISOString().slice(0, 16).replace('T', ' '),
  }
  const i = db.entries.findIndex((e) => samePath(e.path, row.path, platform))
  if (i >= 0) db.entries[i] = row
  else db.entries.push(row)
  return row
}

export function forServer(db, server) {
  const s = normServer(server)
  return db.entries.filter((e) => normServer(e.server) === s).sort((a, b) => a.path.localeCompare(b.path))
}

export function forget(db, p, platform = process.platform) {
  const before = db.entries.length
  db.entries = db.entries.filter((e) => !samePath(e.path, p, platform))
  return before !== db.entries.length
}
