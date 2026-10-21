// ctx login · whoami · logout — 이 PC 의 CLI 가 붙을 CDP 서버와 토큰. 지식 생성 · 작업실 검토 v0.1 §4.6 · G15.
//
//   ctx login --server <주소> [--token-stdin]    토큰을 받아 /me 로 확인하고 둔다(역할 · 볼 수 있는 레포를 낸다)
//   ctx whoami [--json]                          누구 · 어느 서버 · 레포마다 쓰기 · 큐레이션
//   ctx logout                                   이 PC 의 「붙을 서버」 만 잊는다 — 토큰은 남긴다
//
// **토큰은 지금 자리를 그대로 쓴다**(core/tokenstore.js — Windows 사용자 환경변수 · ~/.config/cdp/token). 작업 레포의
// MCP(`.mcp.json` 의 `${CDP_TOKEN}`)가 같은 값을 읽는다 — 그래서 logout 은 토큰을 지우지 않는다(지우면 작업 레포가 끊긴다).
// 서버 주소만 `login.json` 에 둔다. **LLM CLI(claude) 의 로그인은 여기서 만지지 않는다** — 그 사람이 `claude` 를 한 번 켜서 한다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadToken, saveToken, ensureConfigDir } from '../../core/tokenstore.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

export const configDir = (env = process.env) => env.CDP_CONFIG_DIR || path.join(os.homedir(), '.config', 'cdp')
const loginFile = (env = process.env) => path.join(configDir(env), 'login.json')

export async function readLogin(env = process.env) {
  return fs.readFile(loginFile(env), 'utf8').then(JSON.parse).catch(() => null)
}

const normServer = (s) => {
  const v = String(s || '').trim().replace(/\/+$/, '')
  if (!v) return null
  return /^https?:\/\//i.test(v) ? v : 'http://' + v
}

// 붙을 서버 · 토큰 — 명령의 --server 가 먼저 · 없으면 login.json. 토큰은 CDP_TOKEN → 저장된 것
export async function resolveClient(opt = {}, env = process.env) {
  const login = await readLogin(env)
  const server = normServer(opt.server) || normServer(login?.server)
  const token = String(env.CDP_TOKEN || '').trim() || (await loadToken({ env }).catch(() => null))?.token || null
  return { server, token, login }
}

// HTTP — JSON 이면 { status, ok, body } · 닿지 않으면 status 0
export function client(server, token) {
  const h = { authorization: 'Bearer ' + token }
  const call = async (method, sub, { json, bin } = {}) => {
    try {
      const r = await fetch(server + sub, {
        method,
        headers: { ...h, ...(json !== undefined ? { 'content-type': 'application/json' } : bin ? { 'content-type': 'application/octet-stream' } : {}) },
        body: json !== undefined ? JSON.stringify(json) : bin,
      })
      const body = await r.json().catch(() => null)
      return { status: r.status, ok: r.ok, body }
    } catch (e) {
      return { status: 0, ok: false, body: { error: { code: 'E_NET', message: `서버에 닿지 않는다 — ${server} (${e?.cause?.code || e?.message || e})` } } }
    }
  }
  return {
    server,
    get: (sub) => call('GET', sub),
    post: (sub, json) => call('POST', sub, { json }),
    postBin: (sub, bin) => call('POST', sub, { bin }),
  }
}

const errMsg = (r) => r.body?.error?.message || `HTTP ${r.status}`

async function readStdin() {
  const chunks = []
  for await (const c of process.stdin) chunks.push(c)
  return Buffer.concat(chunks).toString('utf8').trim()
}

function askHidden(q) {
  return new Promise((res) => {
    const s = process.stdin
    process.stdout.write(q)
    s.setRawMode(true)
    s.resume()
    s.setEncoding('utf8')
    let v = ''
    const done = (x) => {
      s.removeListener('data', on)
      s.setRawMode(false)
      s.pause()
      process.stdout.write(NL)
      res(x)
    }
    const on = (chunk) => {
      for (const c of String(chunk).replace(/\u001b\[20[01]~/g, '')) {
        if (c === '\r' || c === '\n') return done(v)
        if (c === '\u0003') {
          s.setRawMode(false)
          process.stdout.write(NL)
          process.exit(130)
        }
        if (c === '\u007f' || c === '\b') v = v.slice(0, -1)
        else if (c >= ' ') v += c
      }
    }
    s.on('data', on)
  })
}

function printMe(me, server) {
  const repos = me.repos || []
  const cur = me.curate || []
  out(`${me.user}${me.label ? ' (' + me.label + ')' : ''} · ${me.role}${me.admin ? ' · 관리자' : ''} · ${server}`)
  if (me.tokenExpires && me.tokenExpires !== 'never') out(`토큰 만료 ${me.tokenExpires}${me.expiresInDays != null ? ` (${me.expiresInDays}일 남음)` : ''}`)
  out(`볼 수 있는 레포 ${repos.length}`)
  for (const r of repos) {
    const can = [me.write ? '쓰기' : '읽기', cur.includes('*') || cur.includes(r.name) ? '큐레이션' : null].filter(Boolean).join(' · ')
    out(`  ${r.name}${r.title ? '  ' + r.title : ''}  — ${can}`)
  }
}

export async function runLogin(opt, env = process.env) {
  const server = normServer(opt.server) || normServer((await readLogin(env))?.server)
  if (!server) {
    err('ctx login --server <주소> [--token-stdin]   토큰은 숨김 입력으로 묻는다(관리자가 발급한 것)')
    return 2
  }
  let token = null
  let fromEnv = false
  if (opt.tokenStdin) token = await readStdin()
  else if (process.stdin.isTTY) token = (await askHidden('토큰  ')).trim()
  else if (env.CDP_TOKEN) [token, fromEnv] = [String(env.CDP_TOKEN).trim(), true]
  if (!token) {
    err('ctx login: 토큰이 없다 — 터미널에서 숨김 입력으로 · 또는 --token-stdin 으로 넘긴다')
    return 2
  }
  const r = await client(server, token).get('/me')
  if (!r.ok) {
    err(`ctx login: ${r.status === 401 || r.status === 403 ? '토큰을 확인하세요 — 서버가 받지 않았다' : errMsg(r)}`)
    return 1
  }
  const me = r.body
  // 토큰 — 이미 같은 값이 있으면 그대로(작업 레포가 쓰는 자리를 괜히 다시 쓰지 않는다)
  const had = (await loadToken({ env }).catch(() => null))?.token || null
  let where = null
  if (!fromEnv && had !== token) {
    if (env.CDP_CONFIG_DIR) {
      await fs.mkdir(env.CDP_CONFIG_DIR, { recursive: true })
      await fs.writeFile(path.join(env.CDP_CONFIG_DIR, 'token'), token + NL, { mode: 0o600 })
      where = path.join(env.CDP_CONFIG_DIR, 'token')
    } else {
      const s = await saveToken(token)
      where = s?.file || '사용자 환경변수 CDP_TOKEN'
    }
  }
  if (!env.CDP_CONFIG_DIR) await ensureConfigDir()
  else await fs.mkdir(env.CDP_CONFIG_DIR, { recursive: true })
  await fs.writeFile(loginFile(env), JSON.stringify({ server, user: me.user, role: me.role, at: new Date().toISOString() }, null, 1) + NL)
  printMe(me, server)
  if (where) out(`토큰을 ${where} 에 두었다 — 새로 여는 터미널 · Claude Code 부터 보인다`)
  out('다음 — ctx ingest <파일 · 폴더> --repo <레포>  (계획만 · 쓰지 않는다)')
  return 0
}

export async function runWhoami(opt, env = process.env) {
  const { server, token } = await resolveClient(opt, env)
  if (!server || !token) {
    err(`ctx whoami: ${!server ? '붙을 서버를 모른다' : '토큰이 없다'} — ctx login --server <주소>`)
    return 2
  }
  const r = await client(server, token).get('/me')
  if (!r.ok) {
    err(`ctx whoami: ${errMsg(r)}`)
    return 1
  }
  if (opt.json) out(JSON.stringify({ server, ...r.body }, null, 2))
  else printMe(r.body, server)
  return 0
}

export async function runLogout(opt, env = process.env) {
  const had = await readLogin(env)
  await fs.rm(loginFile(env), { force: true })
  out(had ? `${had.server} 를 잊었다 — 토큰은 남겼다(작업 레포의 MCP 가 쓴다). 토큰까지 없애려면 관리자에게 폐기를 요청한다` : '붙은 서버가 없다')
  return 0
}
