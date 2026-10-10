// ctx up — 개인 서버 한 줄. 제품화 2 검토 §5.1 · TODO ③ · 결정 D2.
//
//   ctx up [<폴더>] [--port <n>] [--install <코드 폴더>]… [--curator <폴더>] [--skills <폴더>]
//                   [--update [--commit]] [--service] [--no-open] [--save-token] [--fix-gitignore] [--title <한 줄>] [--data <d>]
//
// 하는 일 — 처음 온 사람이 명령 하나로 일을 시작하게:
//   ① <폴더> 가 지식 레포가 아니면(없거나 빈 폴더) 빈 틀로 세운다 — `ctx repo new` 와 같은 함수(newRepo)
//   ② 같은 레포의 서버가 이미 떠 있으면 그 주소만 쓰고, 아니면 빈 포트(7400 부터)로 띄운다 — `serve --personal` 과 같은 함수
//   ③ 이 PC 에 토큰이 없으면 개인 서버 토큰을 둔다(~/.config/cdp/token · rc 한 줄 — 설치기와 같은 tokenstore)
//   ④ --install · --curator · --skills — 설치기를 personal 토큰으로 돌린다(토큰 복사 0 · 작업 레포는 대장에 등록까지)
//   ⑤ 브라우저를 연다(자동 로그인 주소는 화면에 찍지 않는다 — data 폴더의 login.url 파일 · 600)
//   ⑥ 끝 출력은 다음 할 일(`core/nextsteps.js` — 화면의 「시작하기」 와 같은 계산)
//   --service — 로그인할 때 뜨게(macOS launchd · Linux systemd --user). 서버를 서비스로 띄우고 이 명령은 끝난다
//
// **바꾸지 않는 것** — 서버 · save · 화면은 `serve --personal` 그대로다. 여기는 그 앞뒤의 손일을 줄일 뿐이다.

import fs from 'node:fs/promises'
import fss from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import net from 'node:net'
import { spawn, spawnSync } from 'node:child_process'
import { newRepo, REPO_NAME_RE } from '../../core/reponew.js'
import { loadToken, saveToken, storeLabel } from '../../core/tokenstore.js'
import { stepsText } from '../../core/nextsteps.js'
import { toError } from '../../core/tools.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)
const exists = (p) => fs.access(p).then(() => true, () => false)

export const UP_FIRST_PORT = 7400
let FIX_IGNORE = false

// 포트가 비었나 — 들어 보고 바로 닫는다
export function portFree(port, host = '127.0.0.1') {
  return new Promise((res) => {
    const s = net.createServer()
    s.once('error', () => res(false))
    s.listen(port, host, () => s.close(() => res(true)))
  })
}

async function health(port) {
  return fetch(`http://127.0.0.1:${port}/healthz`, { signal: AbortSignal.timeout(1500) })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
}

// 이 레포의 서버가 떠 있나 — data 폴더의 up.json(포트)을 보고, 그 포트가 이 레포를 내는지 토큰으로 묻는다
async function running({ data, name, token }) {
  const st = await fs.readFile(path.join(data, 'up.json'), 'utf8').then(JSON.parse).catch(() => null)
  if (!st?.port) return null
  if (!(await health(st.port))) return null
  const me = await fetch(`http://127.0.0.1:${st.port}/me`, { headers: { authorization: 'Bearer ' + token } })
    .then((r) => (r.ok ? r.json() : null))
    .catch(() => null)
  return me?.repos?.some((r) => r.name === name) ? st.port : null
}

async function pickPort(want) {
  const first = Number(want) || UP_FIRST_PORT
  for (let p = first; p < first + 30; p++) if (await portFree(p)) return p
  return null
}

// 지식 레포 자리 — 없거나 빈 폴더면 세운다. 남의 폴더(비어 있지 않고 _vocab.md 없음)는 멈춘다
async function ensureRepo(dir, { title }) {
  if (await exists(path.join(dir, '_vocab.md'))) return { made: false }
  const ents = (await fs.readdir(dir).catch(() => null)) || []
  if (ents.filter((n) => n !== '.DS_Store').length) {
    throw new Error(`${dir} 는 지식 레포가 아니고 비어 있지도 않다 — 빈 폴더나 새 이름을 준다(코드 레포는 --install 로 붙인다)`)
  }
  if (ents.length) await fs.rm(path.join(dir, '.DS_Store'), { force: true })
  const r = await newRepo({ dest: dir, title: title || null })
  return { made: true, commit: r.commit }
}

// 서비스로 굳힐 ctx 경로 — 판이 바뀌어도 그대로인 자리(`~/.cdp/server/current/bin/ctx.mjs`)가 있으면 그것을 쓴다
export function stableBin(argv1 = process.argv[1], home = os.homedir()) {
  const cur = path.join(home, '.cdp', 'server', 'current', 'bin', 'ctx.mjs')
  try {
    if (fss.realpathSync(cur) === fss.realpathSync(argv1)) return cur
  } catch {}
  return path.resolve(argv1)
}

const TCC = /^(Documents|Desktop|Downloads)$/

function serviceFiles({ name, bin, repo, port, data, platform = process.platform, home = os.homedir() }) {
  const args = [process.execPath, bin, 'serve', '--personal', repo, '--port', String(port), '--data', data]
  if (platform === 'darwin') {
    const label = `com.cdp.personal.${name}`
    const file = path.join(home, 'Library', 'LaunchAgents', label + '.plist')
    const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    const text = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>Label</key><string>${label}</string>
  <key>ProgramArguments</key><array>${args.map((a) => `<string>${esc(a)}</string>`).join('')}</array>
  <key>RunAtLoad</key><true/>
  <key>KeepAlive</key><true/>
  <key>StandardOutPath</key><string>${esc(path.join(data, 'serve.log'))}</string>
  <key>StandardErrorPath</key><string>${esc(path.join(data, 'serve.log'))}</string>
</dict></plist>
`
    return { kind: 'launchd', label, file, text }
  }
  if (platform === 'linux') {
    const unit = `cdp-personal-${name}.service`
    const file = path.join(home, '.config', 'systemd', 'user', unit)
    const q = (a) => (/[\s"]/.test(a) ? JSON.stringify(a) : a)
    const text = `[Unit]
Description=CDP 개인 서버 — ${name}
After=network.target

[Service]
ExecStart=${args.map(q).join(' ')}
Restart=on-failure

[Install]
WantedBy=default.target
`
    return { kind: 'systemd', unit, file, text }
  }
  return null
}

async function installService(svc) {
  await fs.mkdir(path.dirname(svc.file), { recursive: true })
  await fs.writeFile(svc.file, svc.text, 'utf8')
  if (svc.kind === 'launchd') {
    const uid = process.getuid?.() ?? 0
    spawnSync('launchctl', ['bootout', `gui/${uid}/${svc.label}`], { stdio: 'ignore' })
    const r = spawnSync('launchctl', ['bootstrap', `gui/${uid}`, svc.file], { encoding: 'utf8' })
    return r.status === 0 ? null : (r.stderr || '').trim() || 'launchctl bootstrap 실패'
  }
  const r1 = spawnSync('systemctl', ['--user', 'daemon-reload'], { encoding: 'utf8' })
  if (r1.status !== 0) return (r1.stderr || '').trim() || 'systemctl --user 을 쓸 수 없다'
  const r2 = spawnSync('systemctl', ['--user', 'enable', '--now', svc.unit], { encoding: 'utf8' })
  return r2.status === 0 ? null : (r2.stderr || '').trim()
}

// 서비스를 다시 띄운다 — self-update 가 부른다. 없으면 false
export function restartService(name, { platform = process.platform, home = os.homedir() } = {}) {
  if (platform === 'darwin') {
    const label = `com.cdp.personal.${name}`
    if (!fss.existsSync(path.join(home, 'Library', 'LaunchAgents', label + '.plist'))) return false
    return spawnSync('launchctl', ['kickstart', '-k', `gui/${process.getuid?.() ?? 0}/${label}`]).status === 0
  }
  if (platform === 'linux') {
    const unit = `cdp-personal-${name}.service`
    if (!fss.existsSync(path.join(home, '.config', 'systemd', 'user', unit))) return false
    return spawnSync('systemctl', ['--user', 'restart', unit]).status === 0
  }
  return false
}

function openBrowser(url) {
  const [cmd, args] =
    process.platform === 'darwin' ? ['open', [url]] : process.platform === 'win32' ? ['cmd', ['/c', 'start', '', url]] : ['xdg-open', [url]]
  try {
    spawn(cmd, args, { stdio: 'ignore', detached: true }).unref()
    return true
  } catch {
    return false
  }
}

// 설치기 — 서버의 /install.mjs 를 임시 파일로 받아 personal 토큰으로 돌린다. 출력은 그대로 흘린다
async function runInstaller(base, token, args) {
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-up-'))
  const file = path.join(tmp, 'cdp-install.mjs')
  try {
    await fs.writeFile(file, await (await fetch(base + '/install.mjs')).text())
    // 비동기로 — 서버가 이 프로세스 안에 떠 있을 수 있다(spawnSync 면 설치기의 요청에 답할 수 없어 멈춘다)
    return await new Promise((res) => {
      const c = spawn(process.execPath, [file, ...args, '--yes', '--brief', ...(FIX_IGNORE ? ['--fix-gitignore'] : [])], { stdio: 'inherit', env: { ...process.env, CDP_TOKEN: token } })
      c.on('exit', (code) => res(code ?? 1))
      c.on('error', () => res(1))
    })
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

async function api(base, token, p, init = {}) {
  const r = await fetch(base + p, { ...init, headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(init.headers || {}) } })
  const j = await r.json().catch(() => null)
  return { ok: r.ok, status: r.status, j }
}

// 작업 레포 하나 — 대장에 없으면 등록(이름 = 폴더 이름) → 설치기
async function connectWork(base, token, { name, me, dir }) {
  const abs = path.resolve(dir)
  if (!(await exists(path.join(abs, '.git')))) err(`  ⚠ ${abs} 는 git 레포가 아니다 — 세팅 파일은 이 PC 에만 남는다`)
  const list = await api(base, token, '/workrepos')
  const wname = path.basename(abs)
  let row = list.j?.repos?.find((r) => r.knowledge === name && r.name === wname)
  if (!row) {
    const add = await api(base, token, '/workrepos', { method: 'POST', body: JSON.stringify({ name: wname, knowledge: name, owner: me }) })
    if (!add.ok) {
      err(`  ${abs} — 대장 등록 실패: ${add.j?.error?.message || add.status}`)
      return 1
    }
    row = add.j
  }
  return runInstaller(base, token, ['--repo', name, '--workrepo', row.id, abs])
}

export async function runUp(opt) {
  FIX_IGNORE = !!opt.fixIgnore
  const dir = path.resolve(opt.args?.[0] || '.')
  const name = path.basename(dir)
  if (!REPO_NAME_RE.test(name)) {
    err(`ctx up: 폴더 이름이 레포 이름 형식이 아니다(영문 · 숫자 · ._-) — ${name}`)
    return 2
  }
  if (process.platform === 'darwin' && opt.service) {
    const rel = path.relative(os.homedir(), dir).split(path.sep)[0]
    if (TCC.test(rel)) err(`ctx up: ⚠ ~/${rel} 아래는 macOS 가 백그라운드 서비스의 읽기를 막는다(TCC) — ~/cdp/${name} 같은 자리를 권한다`)
  }
  try {
    // ① 레포
    const made = await ensureRepo(dir, { title: opt.title })
    out(made.made ? `레포     ${dir}  (빈 틀로 세웠다 · ${made.commit})` : `레포     ${dir}`)

    // ② 서버 — 같은 함수(preparePersonal)를 쓰려고 runServe 를 이 프로세스에서 띄운다
    const data = path.resolve(opt.data || path.join(os.homedir(), '.cdp', 'personal', name))
    await fs.mkdir(data, { recursive: true })
    const prevTok = (await fs.readFile(path.join(data, 'personal.token'), 'utf8').catch(() => '')).trim()
    let port = prevTok ? await running({ data, name, token: prevTok }) : null
    let serving = null
    if (port) out(`서버     http://127.0.0.1:${port}  (이미 떠 있다)`)
    else {
      port = await pickPort(opt.port)
      if (!port) {
        err('ctx up: 7400~7429 에 빈 포트가 없다 — --port 로 준다')
        return 2
      }
      const hasOrigin = spawnSync('git', ['-C', dir, 'remote', 'get-url', 'origin'], { stdio: 'ignore' }).status === 0
      if (opt.service) {
        // 서비스가 띄운다 — 먼저 토큰 · 명부를 만들려고 같은 준비를 한 번 돌린다(서버를 띄우지 않고)
        const { preparePersonalOnly } = await import('./ctx-mcp-serve.mjs')
        const p = await preparePersonalOnly({ personal: dir, data })
        if (p.error) throw new Error(p.error)
        const svc = serviceFiles({ name, bin: stableBin(), repo: dir, port, data })
        if (!svc) {
          err('ctx up --service: 이 OS 에서는 아직 못 한다 — 작업 스케줄러에 `ctx up` 을 건다')
          return 2
        }
        if (hasOrigin) svc.text = svc.text.replace(/(<string>--data<\/string><string>[^<]*<\/string>|--data \S+)/, (m) => m + (svc.kind === 'launchd' ? '<string>--mirror</string>' : ' --mirror'))
        const bad = await installService(svc)
        if (bad) {
          err(`ctx up --service: ${bad}`)
          return 2
        }
        out(`서비스   ${svc.file}  (로그인하면 뜬다 · 로그 ${path.join(data, 'serve.log')})`)
      } else {
        const { runServe } = await import('./ctx-mcp-serve.mjs')
        serving = runServe({ personal: dir, port, data, web: opt.web || null, mirror: hasOrigin, quietPersonal: true })
      }
      // 뜰 때까지
      let ok = false
      for (let i = 0; i < 60 && !ok; i++) {
        ok = !!(await health(port))
        if (!ok) await new Promise((r) => setTimeout(r, 250))
      }
      if (!ok) {
        err(`ctx up: 서버가 ${port} 에서 뜨지 않았다 — ${opt.service ? path.join(data, 'serve.log') : '위 로그'}를 본다`)
        return 2
      }
      await fs.writeFile(path.join(data, 'up.json'), JSON.stringify({ port, repo: dir, at: new Date().toISOString() }, null, 2) + NL)
      out(`서버     http://127.0.0.1:${port}`)
    }
    const base = `http://127.0.0.1:${port}`
    const token = (await fs.readFile(path.join(data, 'personal.token'), 'utf8')).trim()
    const me = (await api(base, token, '/me')).j?.user || 'me'
    // 자동 로그인 주소는 파일로만(600) — 터미널 기록 · 화면 공유에 토큰이 남지 않게(F14)
    const loginUrl = `${base}/login?auto=${token}`
    await fs.writeFile(path.join(data, 'login.url'), loginUrl + NL, { mode: 0o600 })

    // ③ 토큰 — 이 PC 에 없을 때만 둔다. 다른 서버 토큰이 있으면 덮지 않는다(--save-token 이면 덮는다)
    const saved = await loadToken().catch(() => null)
    let tokenSaved = false
    if (!saved || opt.saveToken) {
      if (saved?.token !== token) {
        await saveToken(token)
        tokenSaved = true
        out(`토큰     ${storeLabel()} 에 두었다 — Claude Code 를 다시 켜면 MCP 가 이 서버로 붙는다`)
      }
    } else if (saved.token !== token) {
      out(`토큰     이 PC 에는 다른 서버의 토큰이 있다 — 그대로 둔다(이 서버로 바꾸려면 --save-token)`)
    }

    // ④ 붙이기
    let bad = 0
    const installed = []
    for (const w of [].concat(opt.install || [])) {
      out('')
      out(`── 작업 레포 ${path.resolve(w)}`)
      const code = await connectWork(base, token, { name, me, dir: w })
      if (code) bad++
      else installed.push(path.resolve(w))
    }
    if (opt.curatorDir) {
      out('')
      out(`── 큐레이터 폴더 ${path.resolve(opt.curatorDir)}`)
      await fs.mkdir(path.resolve(opt.curatorDir), { recursive: true })
      const code = await runInstaller(base, token, ['--curator', '--repo', name, path.resolve(opt.curatorDir)])
      if (code) bad++
      else installed.push(path.resolve(opt.curatorDir))
    }
    if (opt.skillsDir) {
      out('')
      out(`── 스킬 폴더 ${path.resolve(opt.skillsDir)}`)
      const code = await runInstaller(base, token, ['--folder', '--repo', name, path.resolve(opt.skillsDir)])
      if (code) bad++
      else installed.push(path.resolve(opt.skillsDir))
    }

    if (opt.update) {
      out('')
      out('── 이 PC 의 작업 레포 · 큐레이터 폴더 · 스킬 폴더 갱신')
      bad += (await runInstaller(base, token, ['--update', ...(opt.commit ? ['--commit'] : [])])) ? 1 : 0
    }

    // ⑤ 브라우저
    if (!opt.noOpen) out(openBrowser(loginUrl) ? '\n화면을 열었다.' : `\n화면 — ${base} (자동 로그인 주소는 ${path.join(data, 'login.url')})`)
    else out(`\n화면 — ${base} (자동 로그인 주소는 ${path.join(data, 'login.url')})`)

    // ⑥ 다음 할 일
    const nx = await api(base, token, `/next?repo=${encodeURIComponent(name)}`)
    const steps = nx.j?.steps || []
    const line = (args) =>
      process.platform === 'win32'
        ? `curl.exe -fsSLo "$env:TEMP\\cdp-install.mjs" ${base}/install.mjs; node "$env:TEMP\\cdp-install.mjs" ${args}`
        : `curl -fsSLo /tmp/cdp-install.mjs ${base}/install.mjs && node /tmp/cdp-install.mjs ${args}`
    // 붙인 곳이 있으면 그 뒤의 손일 둘(다시 켜기 · 커밋)을 **한 번만** 말한다 — 설치기는 --brief 로 그 줄을 뺐다
    const rows = []
    if (installed.length || tokenSaved) rows.push(`Claude Code 를 다시 켠다 — 새 스킬 · MCP 는 시작할 때 읽힌다`)
    const gitOnes = [].concat(opt.install || []).map((w) => path.resolve(w)).filter((w) => installed.includes(w) && fss.existsSync(path.join(w, '.git')))
    if (gitOnes.length) rows.push(`작업 레포 커밋(팀원은 pull 로 받는다) —${gitOnes.map((w) => `${NL}     git -C "${w}" add .mcp.json .claude CLAUDE.md && git -C "${w}" commit -m "CDP 연결"`).join('')}`)
    out('')
    const more = stepsText(steps, { origin: base, installLine: (a) => upHint(a, dir, line) })
    if (rows.length || more.length) {
      out('다음 —')
      rows.forEach((r, i) => out(`  ${i + 1}. ${r}`))
      more.forEach((l) => out(l.replace(/^  (\d+)\./, (m, n) => `  ${Number(n) + rows.length}.`)))
    } else out('다음 할 일이 없다 — 작업 레포의 Claude Code 에서 일하고 「기록해 줘」.')
    if (bad) out(`\n⚠ 붙이기 ${bad}곳이 실패했다 — 위 줄을 본다`)

    if (serving) {
      out('')
      out('끄려면 Ctrl+C. 로그인할 때 저절로 뜨게 하려면 ctx up --service')
      return await serving
    }
    return bad ? 1 : 0
  } catch (e) {
    err('ctx up: ' + (toError(e).message || e))
    return 2
  }
}

// 다음 할 일의 설치 줄 — `ctx up` 이 할 수 있는 것은 `ctx up` 한 줄로 말한다
function upHint(args, dir, fallback) {
  if (/^--curator /.test(args)) return `ctx up "${dir}" --curator <큐레이터 폴더>`
  if (args === '--update') return `ctx up "${dir}" --update [--commit]`
  return fallback(args)
}
