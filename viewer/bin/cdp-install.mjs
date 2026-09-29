// install.mjs — 작업 레포에 CDP 를 붙이는 실행기. 설계서 §6.7.3 · 설치 한 줄 TODO.
//
// **왜 스크립트를 넣나.** 지금까지 꾸러미는 "zip 을 작업 레포 루트에 푼다" 였다.
// 그러면 `CLAUDE.md` 와 `.mcp.json` 이 **푸는 순간 덮인다** — 안내문이 그다음
// 줄에서 "이미 있으면 덮지 말라" 고 하는데 이미 늦었다. 작업 레포에 다른 MCP
// 서버가 등록돼 있었다면 그것도 조용히 사라진다.
//
// **병합 규칙을 다시 쓰지 않는다.** `ctx setup --server` 는 받은 kit 을 임시
// 폴더에 풀고 그것을 지식 레포처럼 써서 `planSetup` 을 태운다(§4.7). 여기도
// 같다. 그래서 `core/setup.js` 를 그대로 부른다. PowerShell 과 sh 로 옮겨 쓰면
// 규칙이 세 벌이 되고, 조금씩 어긋나면 어느 것이 맞는지 아무도 모르게 된다.
//
// **두 모양으로 온다** — 앞에 박힌 설정 한 줄이 가른다.
//
//   꾸러미   zip 안의 install.mjs. 설정에 server · repo · workrepo · kit 이 있고 kit/ 이 옆에 있다
//              node install.mjs <작업 레포 경로> [--dry] [--yes] [--no-save]
//   한 줄    서버의 `GET /install.mjs`(I1). 설정에는 **server 만** 있다 — 레포 이름도 kit 도 없다.
//            kit 은 토큰으로 받는다(`/kit/<레포>?workrepo=<id>&as=json` · I2)
//              node cdp-install.mjs --repo <레포> --workrepo <id> <작업 레포 경로> [--dry] [--yes] [--no-save]
//
// **토큰을 묻는다**(I3). `CDP_TOKEN` 이 있으면 그것을 서버에 확인하고, 없거나 안 통하면
// 보이지 않게 입력받는다. 확인되면 이 PC 에 둘지 묻는다(I4 · `core/tokenstore.js`).
// 설치기 · 꾸러미 · 명령 어디에도 원문은 없다 — 사람이 관리자에게 받아 붙여넣는 것뿐이다.
//
// 꾸러미 모양 —
//   설치.md      안내
//   install.mjs  이 파일 (**이름을 ASCII 로 둔다** -- 명령줄에 치는 것이라
//                한글이면 IME 를 켜야 하고, 낡은 압축 도구에서 이름이 깨지면
//                그 자리에서 막힌다. 읽기만 하는 `설치.md` 는 한글로 둔다)
//   kit/         지식 레포 모양 (.claude/skills/cdp-* · .claude/work-repo/CLAUDE.md)

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { planSetup, applySetup, mergeMcpJson, mcpEntryServer } from '../../core/setup.js'
import { saveToken, storeLabel } from '../../core/tokenstore.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

// 서버가 이 파일 맨 앞에 한 줄로 박아 넣는다.
// 없으면 손으로 꺼내 온 것이라 안내만 하고 멈춘다.
const CFG = globalThis.__CDP_KIT__ || null

function parseArgs(argv) {
  const flags = { dry: false, yes: false, noSave: false, repo: null, workrepo: null }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry') flags.dry = true
    else if (a === '--yes' || a === '-y') flags.yes = true
    else if (a === '--no-save') flags.noSave = true
    else if (a === '--repo') flags.repo = argv[++i] || null
    else if (a === '--workrepo') flags.workrepo = argv[++i] || null
    else if (!a.startsWith('--')) pos.push(a)
  }
  return { flags, pos }
}

export async function main(argv) {
  const { flags, pos } = parseArgs(argv)
  const { dry, yes } = flags

  if (!CFG?.server) {
    return bail(
      '이 파일 안에 서버 정보가 없습니다.' +
        NL +
        '관리 화면의 [설치 방법] 에 있는 명령, 또는 거기서 받은 꾸러미 안의 install.mjs 를 그대로 쓰세요.'
    )
  }
  const server = String(CFG.server).replace(/\/+$/, '')
  // 한 줄 모양 — 설정에 레포가 없다. kit 은 서버에서 토큰으로 받는다
  const net = !CFG.repo
  const repo = CFG.repo || flags.repo
  const workrepo = CFG.workrepo || flags.workrepo

  const work = pos[0]
  if (!work || (net && (!repo || !workrepo))) {
    out('사용법 —')
    if (net) out('  node cdp-install.mjs --repo <레포> --workrepo <등록 id> <작업 레포 경로> [--dry] [--yes] [--no-save]')
    else out('  node install.mjs <작업 레포 경로> [--dry] [--yes] [--no-save]')
    out('')
    out('  --dry      무엇이 바뀔지만 보고 쓰지 않는다')
    out('  --yes      묻지 않는다 (스크립트에서 부를 때 — 토큰은 CDP_TOKEN 에서)')
    out('  --no-save  입력한 토큰을 이 PC 에 두지 않는다')
    out('')
    out(`서버   ${server}`)
    if (repo) out(`레포   ${repo}`)
    if (net) out('명령은 관리 화면의 작업 레포 › [설치 방법] 에 채워져 있습니다.')
    return 2
  }

  // kit 이 옆에 있는지 — **작업 레포가 아니라 꾸러미 쪽에서 읽는다.**
  // 한 단 내려 둔 이유가 이것이다(푸는 것만으로는 아무것도 안 덮인다).
  const here = path.dirname(fileURLToPath(import.meta.url))
  if (!net && !(await isDir(path.join(here, 'kit')))) {
    return bail(`kit 폴더가 없습니다 — ${path.join(here, 'kit')}${NL}꾸러미를 통째로 푼 뒤 그 안에서 여세요.`)
  }

  out(`서버     ${server}`)
  out(`레포     ${repo}`)
  out(`작업 레포 ${path.resolve(work)}`)

  // ── 토큰(I3) — 한 줄 모양은 kit 을 받아야 하니 **없으면 못 간다.** 꾸러미는 보고에만 쓴다
  const tk = await resolveToken(server, { required: net, yes })
  if (tk?.error) return bail(tk.error)
  out('')

  // 입력한 토큰이면 이 PC 에 둘지 묻는다(I4) — 설치를 그만둬도 토큰은 확인된 것이라 먼저 한다
  if (tk?.entered && !flags.noSave && !dry) await offerSave(tk.token, { yes })

  let kitDir = path.join(here, 'kit')
  let kit = CFG.kit || null
  let cleanup = async () => {}
  if (net) {
    const got = await fetchKit(server, repo, workrepo, tk.token)
    if (got.error) return bail(got.error)
    kitDir = got.dir
    kit = got.kit
    cleanup = got.cleanup
  }
  try {
    return await install({ server, repo, workrepo, kit, kitDir, work, dry, yes, token: tk?.token || null })
  } finally {
    await cleanup()
  }
}

async function install({ server, repo, workrepo, kit, kitDir, work, dry, yes, token }) {
  const plan = await planSetup(kitDir, work, { server, repo, kit })
  if (!plan.ok) return bail(plan.reason)

  // `.mcp.json` 은 `planSetup` 이 모른다 — 모드 A 시절 산출물만 안다.
  // **여기서도 기존 파일을 읽어 병합한다.** 덮지 않는다.
  const mcpPath = path.join(path.resolve(work), '.mcp.json')
  const had = await fs.readFile(mcpPath, 'utf8').catch(() => null)
  let next
  try {
    next = mergeMcpJson(had, mcpEntryServer(server, repo))
  } catch (e) {
    return bail(e.message)
  }
  plan.actions.push({
    kind: 'mcp',
    to: mcpPath,
    op: had == null ? 'create' : had === next ? 'same' : 'update',
    content: next,
  })

  for (const a of plan.actions) {
    out(`  ${a.op === 'same' ? ' ' : '*'} ${a.op.padEnd(7)} ${a.kind.padEnd(8)} ${short(a.to, work)}`)
  }
  for (const w of plan.warnings) {
    out('')
    out('[주의] ' + String(w).split(NL).join(NL + '       '))
  }

  // 설치 결과 보고(§6.7.4). **관문이 아니다** — 실패해도 설치는 끝났고
  // 대장이 "미설치" 로 남을 뿐이다. 토큰이 없으면 조용히 건너뛴다.
  //
  // **바뀐 것이 없어도 보고한다.** pull 로 세팅을 받은 사람은 설치할 것이 없는데,
  // 그 사람의 행이 대장에서 "미설치" 로 남았다(설명서 걷기 2026-09-23). 토큰을 두고
  // 이 명령을 한 번 돌리면 행이 최신이 되게 — 그것이 대장의 용도다.
  const report = async () => {
    if (!workrepo) return
    if (!token) {
      out('토큰이 없어 대장 보고는 건너뜁니다 — 설치는 끝났습니다. 토큰을 두고 한 번 더 돌리면 보고합니다.')
      return
    }
    const r = await fetch(`${server}/workrepos/${encodeURIComponent(workrepo)}/applied`, {
      method: 'POST',
      headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
      body: JSON.stringify({ kit: kit || null }),
    }).catch(() => null)
    out(r?.ok ? '대장에 보고했습니다.' : '대장 보고는 실패했습니다 — 설치는 끝났습니다 (보고는 추적용입니다)')
  }

  const changes = plan.actions.filter((a) => a.op !== 'same')
  if (!changes.length) {
    out('')
    out('이미 최신입니다.')
    if (!dry) await report()
    return 0
  }
  if (dry) {
    out('')
    out(`--dry 이므로 쓰지 않았습니다. 바뀔 것 ${changes.length}건.`)
    return 0
  }

  // **묻는다.** 경로를 잘못 주면 남의 레포에 파일이 생기고, `update` 와
  // `append` 는 사람이 쓴 파일을 건드린다. `--yes` 로 건너뛸 수 있다.
  if (!yes) {
    out('')
    const ok = await confirm(`위 ${changes.length}건을 적용할까요? [y/N] `)
    if (!ok) {
      out('그만둡니다. 아무것도 쓰지 않았습니다.')
      return 1
    }
  }

  await applySetup(plan)
  out('')
  out(`${changes.length}건 적용했습니다.${kit ? ` (kit ${kit})` : ''}`)
  await report()

  out('')
  out('다음 —')
  if (!token) {
    out('  0. 토큰을 이 PC 에 둔다 (관리자에게 받는다) — 이 명령을 한 번 더 돌리면 묻고 둔다')
  }
  out('  1. Claude Code 를 완전히 끄고 다시 켠다 — 환경변수는 프로세스가 시작할 때 읽힌다')
  out('     VS Code · 데스크톱 앱 안의 Claude Code 면 그 앱을 다시 켠다 (열려 있던 터미널에는 새 값이 없다)')
  out('  2. /mcp 에 cdp 가 connected 인지 본다')
  out('  3. git add .mcp.json .claude CLAUDE.md && git commit')
  out('     팀원은 pull 과 토큰만으로 끝난다 — 이 명령을 돌리면 토큰을 묻고 대장에 보고까지 한다')
  return 0
}

// ── 토큰 ──────────────────────────────────────────────────────────────────

// 서버에 누구인지 묻는다. **실패는 하나로 말한다** — 만료 · 폐기 · 명부에 없음을 가르면 토큰을 떠보는 길이 된다(로그인과 같다).
async function whoami(server, token) {
  const r = await fetch(`${server}/me`, { headers: { authorization: 'Bearer ' + token } }).catch(() => null)
  if (!r) return { reach: false }
  if (!r.ok) return { ok: false, status: r.status }
  const j = await r.json().catch(() => ({}))
  return { ok: true, user: j.user, role: j.role, days: j.expiresInDays ?? null }
}

const whoLine = (w) => `${w.user} (${w.role})${w.days != null && w.days <= 14 ? ` · 만료 ${w.days}일 남음 — 관리자에게 재발급을` : ''}`

async function resolveToken(server, { required, yes }) {
  const env = String(process.env.CDP_TOKEN || '').trim()
  if (env) {
    const w = await whoami(server, env)
    if (w.reach === false) return { error: `서버에 닿지 않습니다 — ${server}` }
    if (w.ok) {
      out(`토큰     ${whoLine(w)} — CDP_TOKEN`)
      return { token: env, who: w, entered: false }
    }
    out('')
    out('CDP_TOKEN 이 이 서버에서 통하지 않습니다 — 만료 · 폐기됐거나 다른 서버의 것일 수 있습니다.')
  }
  // 대답할 사람이 없으면 묻지 않는다 — 넘어가면 그것은 묻지 않은 것과 같다
  if (yes || !process.stdin.isTTY) {
    if (!required) return null
    return { error: 'CDP_TOKEN 이 없거나 통하지 않습니다 — 터미널에서 --yes 없이 돌리면 토큰을 묻습니다.' }
  }
  out('')
  out(`토큰을 붙여넣고 Enter — 관리자에게 받은 것입니다. 화면에는 보이지 않습니다.${required ? '' : ' (건너뛰려면 그냥 Enter)'}`)
  for (let i = 0; i < 3; i++) {
    const t = (await askHidden('토큰     ')).trim()
    if (!t) {
      if (!required) {
        out('건너뜁니다 — 설치는 되고 대장 보고만 빠집니다.')
        return null
      }
      continue
    }
    const w = await whoami(server, t)
    if (w.reach === false) return { error: `서버에 닿지 않습니다 — ${server}` }
    if (w.ok) {
      out(`확인했습니다 — ${whoLine(w)}`)
      return { token: t, who: w, entered: true }
    }
    out('토큰을 확인하세요.')
  }
  return { error: '토큰이 세 번 통하지 않았습니다. 관리자에게 확인하세요 — 잃었으면 재발급입니다.' }
}

async function offerSave(token, { yes }) {
  const where = storeLabel()
  const ok = yes || (await confirm(`이 PC 의 ${where} 에 둘까요? Claude Code 가 이 값으로 서버에 붙습니다. [Y/n] `, true))
  if (!ok) {
    out('두지 않았습니다 — 직접 둘 때는')
    out(process.platform === 'win32' ? '  setx CDP_TOKEN <토큰>' : '  export CDP_TOKEN=<토큰>   (셸 프로파일에)')
    return
  }
  try {
    await saveToken(token)
    out(`두었습니다 — ${where}. 새로 켜는 프로그램부터 보입니다.`)
  } catch (e) {
    out(`두지 못했습니다 — ${e.message}`)
    out(process.platform === 'win32' ? '  setx CDP_TOKEN <토큰>   으로 직접 둡니다' : '  export CDP_TOKEN=<토큰>   을 셸 프로파일에 직접 둡니다')
  }
}

// 보이지 않게 한 줄 받는다. 붙여넣기는 글자로 들어온다 — 괄호 붙여넣기 표지(ESC[200~ · ESC[201~)는 걷어 낸다.
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
      const text = String(chunk).replace(/\u001b\[20[01]~/g, '')
      for (const c of text) {
        if (c === '\r' || c === '\n') return done(v)
        if (c === '\u0003') {
          // Ctrl+C — 그만둔다. 아무것도 안 썼다
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

// ── kit 받기(I2) ─────────────────────────────────────────────────────────

async function fetchKit(server, repo, workrepo, token) {
  const u = `${server}/kit/${encodeURIComponent(repo)}?workrepo=${encodeURIComponent(workrepo)}&as=json`
  const r = await fetch(u, { headers: { authorization: 'Bearer ' + token } }).catch(() => null)
  if (!r) return { error: `서버에 닿지 않습니다 — ${server}` }
  if (r.status === 404) {
    const j = await r.json().catch(() => ({}))
    return { error: `kit 을 받지 못했습니다 — ${j?.error?.message || '404'}${NL}레포 이름 · 등록 id 가 맞는지, 그 레포에 권한이 있는지 봅니다(권한 밖 레포는 없는 것으로 보입니다).` }
  }
  if (!r.ok) return { error: `kit 을 받지 못했습니다 — HTTP ${r.status}` }
  const j = await r.json().catch(() => null)
  if (!j || !Array.isArray(j.files)) return { error: 'kit 응답이 이상합니다 — 서버 판을 확인하세요.' }

  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-kit-'))
  for (const f of j.files) {
    const rel = String(f.name || '')
    const dst = path.resolve(dir, rel)
    // 서버를 믿지만 경로는 본다 — 임시 폴더 밖으로 쓰지 않는다
    if (!rel || !dst.startsWith(path.resolve(dir) + path.sep)) continue
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.writeFile(dst, Buffer.from(String(f.data || ''), 'base64'))
  }
  return { dir, kit: j.kit || null, cleanup: () => fs.rm(dir, { recursive: true, force: true }).catch(() => {}) }
}

// ── 잔일 ──────────────────────────────────────────────────────────────────

function confirm(q, dflt = false) {
  // TTY 가 아니면(파이프 · CI) 묻지 않고 **거절한다.** 대답할 사람이 없는데
  // 넘어가면 그것은 묻지 않은 것과 같다.
  if (!process.stdin.isTTY) {
    err('입력을 받을 수 없습니다 — 확인이 필요하면 --yes 를, 미리 보려면 --dry 를 주세요.')
    return Promise.resolve(false)
  }
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  return new Promise((res) => {
    rl.question(q, (a) => {
      rl.close()
      const t = a.trim()
      res(t ? /^y(es)?$/i.test(t) : dflt)
    })
  })
}

async function isDir(p) {
  return fs
    .stat(p)
    .then((s) => s.isDirectory())
    .catch(() => false)
}

function bail(msg) {
  err('설치: ' + msg)
  return 2
}

function short(p, work) {
  const w = path.resolve(work)
  const r = path.resolve(p)
  return r.startsWith(w) ? r.slice(w.length + 1).split(path.sep).join('/') : r
}

process.exitCode = await main(process.argv.slice(2))
