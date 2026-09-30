// git 자격 — 서버가 origin 에 닿는 두 길. git 자격 TODO G1~G8.
//
//   SSH 배포 키   서버가 키 쌍을 만들고(`<data>/ssh/id_ed25519`) 공개 키만 내보인다. 사람은 그것을 GitLab 의
//                Deploy keys 에 붙인다. 호스트 키는 사람이 지문을 보고 믿는다 — 모르는 호스트에는 묻지도 붙지도 않는다
//   PAT(http)    `ctx serve git-auth` 가 숨김 입력으로 받아 `.git-credentials`(600)에 쓴다. **브라우저로는 받지 않는다**
//                (제품관리서비스 검토 D8 — 서버는 평문 HTTP 다). 콘솔은 어느 호스트에 누구로 있나만 본다
//
// **전역을 건드리지 않는다**(G2) — 키는 레포마다 `core.sshCommand`(로컬 설정)로 건다. `~/.ssh/config` ·
// `~/.gitconfig` 의 ssh 설정은 그대로다. PAT 만은 git 의 방식대로 전역 `credential.helper` 한 줄을 쓴다(G7 · G8).

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { CtxError } from './tools.js'
import { classifyPushError, maskUrl } from './git.js'

const NL = String.fromCharCode(10)

function run(cmd, args, { cwd, timeout = 20000, env = process.env, input } = {}) {
  return new Promise((resolve) => {
    const p = execFile(cmd, args, { cwd, timeout, env, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 }, (e, stdout, stderr) => {
      resolve({ ok: !e, code: e?.code ?? 0, missing: e?.code === 'ENOENT', out: String(stdout || '').trim(), err: String(stderr || '').trim() })
    })
    if (input != null) p.stdin.end(input)
  })
}

// ── 원격 주소 ─────────────────────────────────────────────────────────────────

// `ssh://git@h:443/g/p.git` · `git@h:g/p.git` · `http(s)://…` · 경로 → 종류 · 호스트 · 포트 · 계정
export function parseRemote(url) {
  const u = String(url || '').trim()
  let m = /^ssh:\/\/(?:([^@/]+)@)?(\[[^\]]+\]|[^:/]+)(?::(\d+))?\//i.exec(u)
  if (m) {
    const host = m[2].replace(/^\[|\]$/g, '')
    const port = m[3] ? Number(m[3]) : 22
    return { kind: 'ssh', user: m[1] || null, host, port, hostKey: port === 22 ? host : `[${host}]:${port}` }
  }
  m = /^([^@/\s]+)@([^:/\s]+):(?!\/\/)/.exec(u)
  if (m) return { kind: 'ssh', user: m[1], host: m[2], port: 22, hostKey: m[2] }
  m = /^(https?):\/\/(?:[^@/]+@)?([^:/]+)(?::(\d+))?/i.exec(u)
  if (m) return { kind: m[1].toLowerCase(), user: null, host: m[2], port: m[3] ? Number(m[3]) : null, hostKey: null }
  return { kind: 'file', user: null, host: null, port: null, hostKey: null }
}
export const isSsh = (url) => parseRemote(url).kind === 'ssh'

// ── SSH 배포 키 ───────────────────────────────────────────────────────────────

export function sshPaths(dataDir) {
  const dir = path.join(path.resolve(dataDir), 'ssh')
  return { dir, key: path.join(dir, 'id_ed25519'), pub: path.join(dir, 'id_ed25519.pub'), knownHosts: path.join(dir, 'known_hosts') }
}

// git 이 sh 로 돌리는 한 줄 — 경로는 앞으로 빗금(Windows 의 git 도 sh 다). 모르는 호스트 · 비밀번호 프롬프트에서 멈추지 않는다(G3)
export function sshCommand(dataDir) {
  const p = sshPaths(dataDir)
  const q = (s) => '"' + s.replace(/\\/g, '/').replace(/"/g, '\\"') + '"'
  return `ssh -i ${q(p.key)} -o IdentitiesOnly=yes -o UserKnownHostsFile=${q(p.knownHosts)} -o StrictHostKeyChecking=yes -o BatchMode=yes`
}

const exists = (p) => fs.access(p).then(() => true).catch(() => false)

// 지문 — `ssh-keygen -lf` 한 줄: `256 SHA256:… 주석 (ED25519)`
async function fingerprintsOf(file) {
  const r = await run('ssh-keygen', ['-lf', file])
  if (r.missing) throw new CtxError('E_INPUT', 'ssh-keygen 이 없다 — OpenSSH 클라이언트를 깐다', {})
  if (!r.ok) return []
  return r.out
    .split(NL)
    .map((l) => /^(\d+)\s+(SHA256:\S+)\s+(.*?)\s+\((\S+)\)$/.exec(l.trim()))
    .filter(Boolean)
    .map((m) => ({ bits: Number(m[1]), fingerprint: m[2], comment: m[3], type: m[4] }))
}

export async function keyInfo(dataDir) {
  const p = sshPaths(dataDir)
  if (!(await exists(p.key)) || !(await exists(p.pub))) return { exists: false, path: p.key }
  const publicKey = (await fs.readFile(p.pub, 'utf8')).trim()
  const fp = (await fingerprintsOf(p.pub))[0] || null
  const st = await fs.stat(p.key)
  return { exists: true, path: p.key, publicKey, fingerprint: fp?.fingerprint ?? null, type: fp?.type ?? null, comment: fp?.comment ?? null, createdAt: st.mtime.toISOString() }
}

const stamp = (d = new Date()) => {
  const p2 = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}${p2(d.getSeconds())}`
}

// 만든다. 이미 있으면 E_EXISTS — `rotate` 면 옛 것을 `.old-<시각>` 으로 옮기고 새로(G6). 개인 키는 이 함수 밖으로 나가지 않는다.
export async function createKey(dataDir, { comment = null, rotate = false, now = new Date() } = {}) {
  const p = sshPaths(dataDir)
  await fs.mkdir(p.dir, { recursive: true, mode: 0o700 })
  let rotated = null
  if (await exists(p.key)) {
    if (!rotate) throw new CtxError('E_EXISTS', '배포 키가 이미 있다 — 바꾸려면 「새로 만들기」(rotate)', { path: p.key })
    rotated = `${p.key}.old-${stamp(now)}`
    await fs.rename(p.key, rotated)
    await fs.rename(p.pub, rotated + '.pub').catch(() => {})
  }
  const c = comment || `cdp-server@${os.hostname()}`
  const r = await run('ssh-keygen', ['-q', '-t', 'ed25519', '-N', '', '-C', c, '-f', p.key])
  if (r.missing) throw new CtxError('E_INPUT', 'ssh-keygen 이 없다 — OpenSSH 클라이언트를 깐다', {})
  if (!r.ok) throw new CtxError('E_REPO', 'ssh-keygen 실패 — ' + (r.err || r.out), {})
  await fs.chmod(p.key, 0o600).catch(() => {})
  return { ...(await keyInfo(dataDir)), rotated }
}

// 레포 하나에 키를 건다 — origin 이 ssh 일 때만(G2). 키가 없으면 아무것도 안 한다.
export async function applyToRepo(root, dataDir) {
  if (!dataDir || !(await exists(sshPaths(dataDir).key))) return false
  const url = await run('git', ['-C', root, 'remote', 'get-url', 'origin'])
  if (!url.ok || !isSsh(url.out)) return false
  const r = await run('git', ['-C', root, 'config', 'core.sshCommand', sshCommand(dataDir)])
  return r.ok
}

// 레포 하나의 상태 — origin(가림) · ssh 인가 · 서버 키가 걸렸나. 콘솔의 「git 자격」 카드가 레포마다 한 줄로 본다
export async function repoSshState(root, dataDir) {
  const url = await run('git', ['-C', root, 'remote', 'get-url', 'origin'])
  const remote = url.ok && url.out ? url.out : null
  const cmd = await run('git', ['-C', root, 'config', '--local', '--get', 'core.sshCommand'])
  const want = dataDir ? sshCommand(dataDir) : null
  return { remote: remote ? maskUrl(remote) : null, ssh: !!remote && isSsh(remote), applied: !!(cmd.ok && want && cmd.out === want) }
}

// ── 호스트 키 ─────────────────────────────────────────────────────────────────

// 받아 온다 — ssh-keyscan. 아직 믿지 않는다. `scan` 은 테스트가 갈아 끼운다.
export async function defaultScan({ host, port }) {
  const r = await run('ssh-keyscan', ['-T', '8', '-p', String(port), '-t', 'ed25519,ecdsa,rsa', host], { timeout: 20000 })
  if (r.missing) throw new CtxError('E_INPUT', 'ssh-keyscan 이 없다 — OpenSSH 클라이언트를 깐다', {})
  return r.out.split(NL).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
}

async function withLinesFile(lines, fn) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-kh-'))
  const f = path.join(d, 'k')
  try {
    await fs.writeFile(f, lines.join(NL) + NL)
    return await fn(f)
  } finally {
    await fs.rm(d, { recursive: true, force: true }).catch(() => {})
  }
}

// 줄마다 지문 — 한 줄씩(ssh-keygen -lf 는 파일의 줄 순서대로 낸다)
async function describeLines(lines) {
  const out = []
  for (const line of lines) {
    const [fp] = await withLinesFile([line], fingerprintsOf)
    if (fp) out.push({ line, type: fp.type, bits: fp.bits, fingerprint: fp.fingerprint })
  }
  return out
}

export async function scanHost(url, { scan = defaultScan } = {}) {
  const r = parseRemote(url)
  if (r.kind !== 'ssh') throw new CtxError('E_INPUT', 'ssh 주소가 아니다 — ssh://git@<호스트>:<포트>/… 또는 git@<호스트>:…', { url: maskUrl(url) })
  const lines = await scan(r)
  if (!lines.length) throw new CtxError('E_GIT', `호스트 키를 받지 못했다 — ${r.host}:${r.port} 에 닿지 않거나 ssh 가 아니다`, { host: r.host, port: r.port })
  return { host: r.host, port: r.port, hostKey: r.hostKey, keys: (await describeLines(lines)).map(({ line, ...k }) => k) }
}

// 믿는다 — **다시 받아서** 사람이 본 지문과 같은 줄만 쓴다(G4). 다르면 E_CHANGED — 그사이 키가 바뀌었다.
export async function trustHost(dataDir, url, fingerprint, { scan = defaultScan } = {}) {
  const r = parseRemote(url)
  if (r.kind !== 'ssh') throw new CtxError('E_INPUT', 'ssh 주소가 아니다', { url: maskUrl(url) })
  if (!/^SHA256:\S+$/.test(String(fingerprint || ''))) throw new CtxError('E_INPUT', '지문 형식이 아니다 (SHA256:…)', {})
  const got = await describeLines(await scan(r))
  const hit = got.find((k) => k.fingerprint === fingerprint)
  if (!hit) throw new CtxError('E_CHANGED', '지금 받은 호스트 키에 그 지문이 없다 — 다시 받아서 확인한다', { host: r.host, port: r.port, now: got.map((k) => k.fingerprint) })
  const p = sshPaths(dataDir)
  await fs.mkdir(p.dir, { recursive: true, mode: 0o700 })
  const body = (await fs.readFile(p.knownHosts, 'utf8').catch(() => '')).split(NL).filter(Boolean)
  // keyscan 의 줄은 `<호스트> <형식> <키>` — 같은 호스트 · 같은 형식의 옛 줄은 바꾼다
  const [h, t] = hit.line.split(/\s+/)
  const kept = body.filter((l) => {
    const [h2, t2] = l.split(/\s+/)
    return !(h2 === h && t2 === t)
  })
  kept.push(hit.line)
  await fs.writeFile(p.knownHosts, kept.join(NL) + NL, { mode: 0o600 })
  return { host: r.host, port: r.port, hostKey: r.hostKey, type: hit.type, fingerprint: hit.fingerprint, replaced: body.length - (kept.length - 1) }
}

// 믿는 호스트 — known_hosts 의 줄마다 호스트 · 형식 · 지문
export async function knownHosts(dataDir) {
  const p = sshPaths(dataDir)
  const lines = (await fs.readFile(p.knownHosts, 'utf8').catch(() => '')).split(NL).map((l) => l.trim()).filter((l) => l && !l.startsWith('#'))
  const out = []
  for (const k of await describeLines(lines)) out.push({ host: k.line.split(/\s+/)[0], type: k.type, fingerprint: k.fingerprint })
  return out
}

// ── 접속 확인 ─────────────────────────────────────────────────────────────────

// `git ls-remote <url> HEAD` — 아무것도 보내지 않는다(G5). ssh 면 키 · known_hosts 로, 프롬프트는 없다.
export async function testRemote(url, { dataDir = null, timeout = 30000, env = process.env } = {}) {
  const u = String(url || '').trim()
  const e = { ...env, GIT_TERMINAL_PROMPT: '0' }
  if (isSsh(u) && dataDir && (await exists(sshPaths(dataDir).key))) e.GIT_SSH_COMMAND = sshCommand(dataDir)
  const r = await run('git', ['ls-remote', u, 'HEAD'], { timeout, env: e })
  if (r.ok) return { ok: true, empty: !r.out, head: r.out.split(/\s+/)[0]?.slice(0, 7) || null, url: maskUrl(u) }
  const text = r.err || r.out
  let { reason, line } = classifyPushError(text)
  if (/Host key verification failed|No .* host key is known|REMOTE HOST IDENTIFICATION HAS CHANGED/i.test(text)) reason = 'hostkey'
  return { ok: false, reason, message: line ? maskUrl(line) : null, url: maskUrl(u) }
}

// ── PAT(http) — `ctx serve git-auth` 가 쓴다 ─────────────────────────────────

function gitEnv(env) {
  return { ...env, GIT_TERMINAL_PROMPT: '0' }
}

// 지금 `credential.helper` 와 그것이 쓰는 파일. `store --file=<f>` 가 아니면 파일은 기본(~/.git-credentials) — helper 가 store 일 때만 뜻이 있다
export async function credentialState({ env = process.env } = {}) {
  const r = await run('git', ['config', '--global', '--get', 'credential.helper'], { env: gitEnv(env) })
  const helper = r.ok && r.out ? r.out : null
  const m = helper && /^store(?:\s+--file[= ](\S+|"[^"]+"))?\s*$/.exec(helper)
  const home = env.HOME || env.USERPROFILE || os.homedir()
  const file = m ? (m[1] ? m[1].replace(/^"|"$/g, '').replace(/^~(?=\/|\\|$)/, home) : path.join(home, '.git-credentials')) : null
  return { helper, store: !!m, file }
}

// 저장된 줄 — 호스트 · 계정만. **비밀은 읽어서 버린다**
export async function listCredentials(file) {
  if (!file) return []
  const body = await fs.readFile(file, 'utf8').catch(() => '')
  const out = []
  for (const l of body.split(NL)) {
    const m = /^(https?):\/\/([^:@/]*)(?::[^@/]*)?@([^/\s]+)/.exec(l.trim())
    if (m) out.push({ scheme: m[1], user: decodeURIComponent(m[2]), host: m[3] })
  }
  return out
}

// 쓴다 — 같은 scheme · 호스트의 옛 줄은 바꾼다 · 600 · helper 가 없으면 `store --file=<f>` 로 건다.
// 다른 helper 가 있으면 멈춘다 — `force` 로만 바꾼다(G8).
export async function storeCredential({ scheme = 'http', host, user, secret, file = null, force = false, env = process.env }) {
  if (!/^https?$/.test(scheme)) throw new CtxError('E_INPUT', 'scheme 은 http · https 다', { scheme })
  if (!host || !/^[A-Za-z0-9.-]+(:\d+)?$/.test(host)) throw new CtxError('E_INPUT', '호스트 형식이 아니다 — gitlab.example:2900 처럼', { host })
  if (!user) throw new CtxError('E_INPUT', '계정(--user)이 필요하다', {})
  if (!secret || /\s/.test(secret)) throw new CtxError('E_INPUT', 'PAT 가 비었거나 공백이 있다', {})
  const st = await credentialState({ env })
  if (st.helper && !st.store && !force) {
    throw new CtxError('E_EXISTS', `credential.helper 가 이미 「${st.helper}」 다 — 바꾸려면 --yes`, { helper: st.helper })
  }
  const home = env.HOME || env.USERPROFILE || os.homedir()
  const target = path.resolve(file || st.file || path.join(home, '.git-credentials'))
  const body = (await fs.readFile(target, 'utf8').catch(() => '')).split(NL).filter(Boolean)
  const same = (l) => {
    const m = /^(https?):\/\/[^@/]*@([^/\s]+)/.exec(l.trim())
    return m && m[1] === scheme && m[2] === host
  }
  const kept = body.filter((l) => !same(l))
  kept.push(`${scheme}://${encodeURIComponent(user)}:${encodeURIComponent(secret)}@${host}`)
  await fs.mkdir(path.dirname(target), { recursive: true })
  await fs.writeFile(target, kept.join(NL) + NL, { mode: 0o600 })
  await fs.chmod(target, 0o600).catch(() => {})
  const want = `store --file=${target.replace(/\\/g, '/')}`
  let helperSet = false
  if (st.helper !== want) {
    const r = await run('git', ['config', '--global', 'credential.helper', want], { env: gitEnv(env) })
    if (!r.ok) throw new CtxError('E_GIT', 'credential.helper 설정 실패 — ' + r.err, {})
    helperSet = true
  }
  return { file: target, scheme, host, user, replaced: body.length - (kept.length - 1), helper: want, helperSet }
}
