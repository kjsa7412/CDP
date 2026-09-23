// 검증 하네스 — MCP 설계서 §10 을 한 자리에서 돈다.
//
// 단계마다 실측하며 왔지만 **한 번에 돌린 적이 없었다.** 흩어진 확인은
// 나중에 회귀를 못 잡는다 — 4.3 을 고치다 2단계를 깨도 아무도 모른다.
//
// 번호는 설계서 §10 의 줄 번호와 같다. 자동으로 못 도는 것은 이유를 적고
// `skip` 으로 낸다 — **조용히 빠지지 않게.**
//
//   node ops/verify/run.mjs [--slow]
//
// `--slow` 는 60초 갱신처럼 시간이 걸리는 것까지 돈다.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { seedKit } from '../lib/seed-kit.mjs'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const TMP = path.join(ROOT, 'ops', 'out', 'verify')
const SLOW = process.argv.includes('--slow')
// 포트는 인자로 받는다 — CI 러너에서 7377 이 쓰이고 있을 수 있다.
const PORT_ARG = process.argv.indexOf('--port')
const PORT = PORT_ARG >= 0 ? Number(process.argv[PORT_ARG + 1]) || 7377 : 7377
const NL = String.fromCharCode(10)

const results = []
const rec = (n, label, state, note = '') => results.push({ n, label, state, note })

async function check(n, label, fn) {
  try {
    const note = await fn()
    rec(n, label, 'ok', note || '')
  } catch (e) {
    rec(n, label, 'fail', String(e?.message || e).split(NL)[0].slice(0, 120))
  }
}
const skip = (n, label, why) => rec(n, label, 'skip', why)

function must(cond, msg) {
  if (!cond) throw new Error(msg)
}
const eq = (a, b, msg) => must(JSON.stringify(a) === JSON.stringify(b), `${msg} — ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)

// ── 판 ──────────────────────────────────────────────────────────────────────

async function stage() {
  await fs.rm(TMP, { recursive: true, force: true })
  await fs.mkdir(TMP, { recursive: true })
  const src = path.join(ROOT, 'viewer', 'fixture')
  for (const n of ['alpha', 'beta']) {
    await fs.cp(src, path.join(TMP, 'repos', n), { recursive: true })
    // **`.claude/` 는 추적하지 않는다** — fresh clone(CI)에는 없다. `GET /kit` 이
    // 그것을 싸므로 여기서 `agent/` 에서 만든다. Python 을 타지 않는다.
    await seedKit(path.join(TMP, 'repos', n), { root: ROOT })
  }
  // git 레포로 만든다 — save 가 커밋한다
  for (const n of ['alpha', 'beta']) {
    const d = path.join(TMP, 'repos', n)
    await run('git', ['-C', d, 'init', '-q'])
    await run('git', ['-C', d, 'add', '-A'])
    await run('git', ['-C', d, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'commit', '-qm', 'seed'])
  }
  // 빈 폴더 — 레포가 아니다(무시돼야 한다)
  await fs.mkdir(path.join(TMP, 'repos', '빈폴더'), { recursive: true })
  return { repos: path.join(TMP, 'repos'), data: path.join(TMP, 'data'), auth: path.join(TMP, 'auth.json') }
}

const ctx = (...args) =>
  run(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), ...args], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64e6,
  })

// ── stdio 클라이언트 ────────────────────────────────────────────────────────

function stdioClient(args) {
  const p = spawn(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), 'mcp', ...args], {
    cwd: ROOT,
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  let buf = ''
  const waits = new Map()
  const stray = []
  let err = ''
  p.stdout.on('data', (d) => {
    buf += d.toString('utf8')
    let i
    while ((i = buf.indexOf(NL)) >= 0) {
      const line = buf.slice(0, i).trim()
      buf = buf.slice(i + 1)
      if (!line) continue
      let m
      try {
        m = JSON.parse(line)
      } catch {
        stray.push(line)
        continue
      }
      if (m.id != null && waits.has(m.id)) {
        waits.get(m.id)(m)
        waits.delete(m.id)
      }
    }
  })
  p.stderr.on('data', (d) => (err += d.toString('utf8')))
  let id = 0
  const rpc = (method, params) =>
    new Promise((res) => {
      const i = ++id
      waits.set(i, res)
      p.stdin.write(JSON.stringify({ jsonrpc: '2.0', id: i, method, params }) + NL)
    })
  return { p, rpc, stray, err: () => err, kill: () => p.kill() }
}

const INIT = (name = 'probe') => ({
  protocolVersion: '2025-06-18',
  clientInfo: { name, version: '1' },
  capabilities: {},
})

const payload = (r) => {
  const t = r?.result?.content?.[0]?.text
  if (!t) return r
  try {
    return JSON.parse(t)
  } catch {
    return { error: { code: 'E_INPUT', message: t } }
  }
}

// ── HTTP 클라이언트 ─────────────────────────────────────────────────────────

function http(base) {
  let cookie = null
  const call = async (p, opt = {}) => {
    const h = { ...(opt.headers || {}) }
    if (cookie) h.cookie = cookie
    const r = await fetch(base + p, { ...opt, headers: h, redirect: 'manual' })
    const sc = r.headers.get('set-cookie')
    if (sc) cookie = /cdp_s=[^;]*/.exec(sc)?.[0] || cookie
    return r
  }
  let id = 0
  const rpc = async (p, method, params, token) => {
    const r = await call(p, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        accept: 'application/json, text/event-stream',
        ...(token ? { authorization: 'Bearer ' + token } : {}),
      },
      body: JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params }),
    })
    const t = await r.text()
    const d = t.split(NL).find((l) => l.startsWith('data: '))
    let j = null
    try {
      j = JSON.parse(d ? d.slice(6) : t)
    } catch {}
    return { status: r.status, j, raw: t }
  }
  return { call, rpc, setCookie: (c) => (cookie = c), cookie: () => cookie }
}

function serve(args) {
  const p = spawn(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), 'serve', ...args], {
    cwd: ROOT,
    stdio: ['ignore', 'ignore', 'pipe'],
  })
  let err = ''
  p.stderr.on('data', (d) => (err += d.toString('utf8')))
  return { p, err: () => err, kill: () => p.kill() }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))

// ── 본체 ────────────────────────────────────────────────────────────────────

const F = await stage()

// ══ 공통 ═══════════════════════════════════════════════════════════════════

const c1 = stdioClient(['--repo', path.join(F.repos, 'alpha'), '--repo', path.join(F.repos, 'beta')])
await c1.rpc('initialize', INIT())
await wait(200)

await check(1, 'tools/call 결과가 ctx --json 과 바이트까지 같다', async () => {
  const R = path.join(F.repos, 'alpha')
  const cases = [
    ['where', ['where', 'api:/adapter/a10/expense-slip'], { coord: 'api:/adapter/a10/expense-slip', limit: 50 }],
    ['match', ['match', 'api:/adapter/a10/expense-slip'], { names: ['api:/adapter/a10/expense-slip'] }],
    ['derive', ['derive'], {}],
    ['check', ['check'], {}],
    ['brief', ['brief'], {}],
  ]
  const strip = (v) => (Array.isArray(v) ? v.map(({ repo, ...x }) => x) : (({ repo, ...x }) => x)(v))
  for (const [name, argv, targs] of cases) {
    const cli = await ctx('--repo', R, ...argv, '--json').catch((e) => e)
    const A = JSON.stringify(JSON.parse(cli.stdout))
    const B = JSON.stringify(strip(payload(await c1.rpc('tools/call', { name, arguments: { repo: 'alpha', ...targs } }))))
    must(A === B, `${name} 불일치`)
  }
  return '5종 일치'
})

await check(2, '좌표 `..` · 제어문자가 E_COORD / E_INPUT', async () => {
  const bad = [
    ['where', { coord: '../etc/passwd' }, 'E_COORD'],
    ['where', { coord: 'table:a/../../b' }, 'E_COORD'],
    ['section', { coord: 'C:/abs/path' }, 'E_COORD'],
    ['work', { id: 'nope' }, 'E_INPUT'],
  ]
  for (const [tool, args, code] of bad) {
    const d = payload(await c1.rpc('tools/call', { name: tool, arguments: { repo: 'alpha', ...args } }))
    eq(d.error?.code, code, `${tool} ${JSON.stringify(args)}`)
  }
  return '4가지'
})

await check(3, '세션 중 work/ 에 파일이 생기면 다음 호출이 본다', async () => {
  const before = payload(await c1.rpc('tools/call', { name: 'brief', arguments: { repo: 'alpha' } })).works
  await fs.writeFile(
    path.join(F.repos, 'alpha', 'work', '2026-0921-스탬프-재스캔.md'),
    '---\nid: 2026-0921-스탬프-재스캔\ntitle: 재스캔\ndate: 2026-09-21 10:00\nauthor: t\ntouches: []\n---\n\n# 재스캔\n\n본문\n'
  )
  await wait(50)
  const after = payload(await c1.rpc('tools/call', { name: 'brief', arguments: { repo: 'alpha' } })).works
  must(after === before + 1, `${before} → ${after}`)
  // **치우고 나간다.** 안 치우면 뒤의 save 검사가 "트리가 더럽다" 로 죽는다 —
  // 검사가 검사를 깨뜨리면 무엇이 진짜 실패인지 알 수 없다.
  await run('git', ['-C', path.join(F.repos, 'alpha'), 'add', '-A'])
  await run('git', ['-C', path.join(F.repos, 'alpha'), '-c', 'user.name=h', '-c', 'user.email=h@x', 'commit', '-qm', '재스캔 확인'])
  await wait(50)
  return `${before} → ${after}`
})

await check(4, '명함 12개 토큰 비용 실측', async () => {
  const l = await c1.rpc('tools/list', {})
  const cards = l.result.tools.reduce((a, t) => a + t.description.length, 0)
  const i2 = (await c1.rpc('initialize', INIT())).result?.instructions?.length ?? 0
  const c3 = stdioClient([
    '--repo',
    path.join(F.repos, 'alpha'),
    '--repo',
    path.join(F.repos, 'beta'),
    '--repo',
    path.join(ROOT, 'viewer', 'fixture'),
  ])
  const i3 = (await c3.rpc('initialize', INIT())).result?.instructions?.length ?? 0
  c3.kill()
  // 한글은 대략 1자 ≈ 1토큰, 영문·기호는 더 싸다. 보수적으로 자 수로 적는다.
  return `명함 ${cards}자 · instructions 레포2 ${i2}자 → 레포3 ${i3}자 (+${i3 - i2})`
})

await check(6, 'tools: 제한 에이전트가 Bash 없이 where 를 부른다', async () => {
  // 하네스가 에이전트를 띄울 수는 없다. **도구가 셸 없이 성립하는가**를 본다 —
  // 서버는 stdio 자식이고 도구 호출에 셸이 끼지 않는다.
  const d = payload(
    await c1.rpc('tools/call', { name: 'where', arguments: { repo: 'alpha', coord: 'api:/adapter/a10/expense-slip' } })
  )
  must(d.section?.doc, 'where 가 섹션을 못 냈다')
  return 'stdio 자식 프로세스 · 셸 없음'
})

await check(7, 'repo 를 생략하면 기본 레포로 답한다', async () => {
  const d = payload(await c1.rpc('tools/call', { name: 'brief', arguments: {} }))
  eq(d.repo, 'alpha', '기본 레포')
  return 'repo=alpha (첫 --repo)'
})

await check(9, '두 레포에 같은 좌표 → match 가 둘 다 낸다', async () => {
  const rows = payload(await c1.rpc('tools/call', { name: 'match', arguments: { names: ['api:/adapter/a10/expense-slip'] } }))
  must(Array.isArray(rows) && rows.length === 2, `${rows.length}건`)
  eq(
    rows.map((r) => r.repo).sort(),
    ['alpha', 'beta'],
    'repo 둘'
  )
  return '둘 다 보고'
})

await check(10, '`..` 이 든 repo 값 → 거절', async () => {
  const d = payload(await c1.rpc('tools/call', { name: 'brief', arguments: { repo: '../밖' } }))
  eq(d.error?.code, 'E_REPO', 'repo 탈출')
  return 'E_REPO'
})

// ══ 모드 A ═════════════════════════════════════════════════════════════════

await check(11, 'tools/list 가 12건이다 (모드 A)', async () => {
  const l = await c1.rpc('tools/list', {})
  eq(l.result.tools.length, 12, '도구 수')
  must(!l.result.tools.some((t) => t.name === 'save'), '모드 A 에 save 가 있다')
  return '12건 · save 없음'
})

await check(12, 'stdout 규약 밖 바이트 0', async () => {
  must(c1.stray.length === 0, `stray ${c1.stray.length}줄`)
  must(c1.err().includes('[cdp-mcp]'), '로그가 stderr 로 안 갔다')
  return `stray 0 · stderr ${c1.err().split(NL).filter(Boolean).length}줄`
})

await check(17, '--repo 두 번 → 레포 둘 · 첫 번째가 default', async () => {
  const rows = payload(await c1.rpc('tools/call', { name: 'repos', arguments: {} }))
  eq(rows.map((r) => r.name), ['alpha', 'beta'], '레포 목록')
  eq(rows.find((r) => r.default)?.name, 'alpha', 'default')
  return 'alpha · beta'
})

await check(19, 'git 원격 없는 레포에서 sync 가 죽지 않는다', async () => {
  const d = payload(await c1.rpc('tools/call', { name: 'sync', arguments: { repo: 'alpha' } }))
  eq(d.mode, 'local', 'mode')
  must('remote' in d, 'remote 필드 없음')
  return `remote=${d.remote}`
})

await check(20, 'version.built 90일 경과 → brief 가 경고 줄을 낸다', async () => {
  // 번들 시각을 주입한다 — 실제 번들이 낡을 때까지 기다릴 수 없다
  const old = stdioClient(['--repo', path.join(F.repos, 'alpha'), '--built-at', '2026-01-01 00:00'])
  await old.rpc('initialize', INIT())
  const b = payload(await old.rpc('tools/call', { name: 'brief', arguments: {} }))
  old.kill()
  must(b.lines.some((l) => /번들이 \d+일 됐다/.test(l)), b.lines.join(' | '))
  const cli = await ctx('--repo', path.join(F.repos, 'alpha'), 'brief', '--built-at', '2026-01-01 00:00')
  must(/번들이 \d+일 됐다/.test(cli.stdout), 'CLI brief 에 줄이 없다')
  return b.lines.at(-1).slice(0, 40) + '…'
})

await check(5, '--prompts auto 가 Claude Code 에만 숨긴다', async () => {
  const cc = stdioClient(['--repo', path.join(F.repos, 'alpha')])
  await cc.rpc('initialize', INIT('claude-code'))
  cc.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + NL)
  await wait(200)
  const hidden = (await cc.rpc('prompts/list', {})).result.prompts.length
  const log = cc.err()
  cc.kill()

  const dk = stdioClient(['--repo', path.join(F.repos, 'alpha')])
  await dk.rpc('initialize', INIT('Claude Desktop'))
  dk.p.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + NL)
  await wait(200)
  const shown = (await dk.rpc('prompts/list', {})).result.prompts.length
  dk.kill()

  eq([hidden, shown], [0, 2], 'auto 분기')
  must(/클라이언트 claude-code/.test(log), 'clientInfo 를 stderr 에 안 남겼다')
  return 'claude-code 0 · Desktop 2 · clientInfo 기록됨'
})

c1.kill()

// ══ 모드 B ═════════════════════════════════════════════════════════════════

await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'kjsa', '--label', '사경진', '--repos', '*', '--write', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'qa', '--repos', 'alpha', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'ghost', '--repos', 'alpha', '--data', F.data)
const TK = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--data', F.data)).stdout.trim()
const TK2 = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--note', '둘째', '--data', F.data)).stdout.trim()
const TQ = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--data', F.data)).stdout.trim()
const TG = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'ghost', '--data', F.data)).stdout.trim()

const S = serve(['--root', F.repos, '--port', String(PORT), '--auth', F.auth, '--data', F.data, '--web', path.join(ROOT, 'ops/out/web')])
await wait(2500)
const H = http(`http://127.0.0.1:${PORT}`)

await check(22, '명부에 없는 --user 로 발급 → 거절', async () => {
  const r = await ctx('serve', 'token', '--auth', F.auth, '--user', '유령', '--data', F.data).catch((e) => e)
  must(/명부에 없는 이름/.test(r.stderr || ''), '거절 안 함')
  return 'E_INPUT'
})

await check(36, '--expires 기본 90일', async () => {
  const rows = JSON.parse((await ctx('serve', 'token', 'list', '--auth', F.auth, '--json')).stdout)
  const d = rows[0].daysLeft
  must(d >= 89 && d <= 91, `${d}일`)
  must(!rows.some((r) => r.expires === 'never'), '무기한이 기본이 됐다')
  return `${d}일 · never 없음`
})

await check(21, '토큰 없음/무효 401 · 권한 밖 · write:false save 거부', async () => {
  eq((await H.rpc('/mcp/alpha', 'tools/list', {})).status, 401, '토큰 없음')
  eq((await H.rpc('/mcp/alpha', 'tools/list', {}, 'nonsense')).status, 401, '무효')
  const outside = payload((await H.rpc('/mcp', 'tools/call', { name: 'brief', arguments: { repo: 'beta' } }, TQ)).j)
  eq(outside.error?.code, 'E_REPO', '권한 밖 레포는 없는 것')
  const w = payload(
    (
      await H.rpc(
        '/mcp',
        'tools/call',
        { name: 'save', arguments: { repo: 'alpha', work: { id: '2026-0921-권한', title: 'x', date: '2026-09-21 10:00', body: '본문' } } },
        TQ
      )
    ).j
  )
  eq(w.error?.code, 'E_FORBIDDEN', 'write:false save')
  return '401 · 401 · E_REPO · E_FORBIDDEN'
})

await check(25, '한 사람의 토큰 둘이 같은 권한 · user set 이 둘 다에 먹는다', async () => {
  for (const t of [TK, TK2]) eq((await H.rpc('/mcp/alpha', 'tools/list', {}, t)).status, 200, '둘 다 통과')
  await ctx('serve', 'user', 'set', '--auth', F.auth, '--name', 'kjsa', '--inactive', '--data', F.data)
  await wait(80)
  for (const t of [TK, TK2]) {
    const d = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'brief', arguments: {} }, t)).j)
    eq(d.error?.code, 'E_AUTH', 'inactive 가 둘 다에')
  }
  await ctx('serve', 'user', 'set', '--auth', F.auth, '--name', 'kjsa', '--active', '--data', F.data)
  await wait(80)
  return '둘 다 막히고 둘 다 살아났다'
})

await check(23, '명부에서 사람을 지우면 그 토큰은 401 (고아 토큰)', async () => {
  const db = JSON.parse(await fs.readFile(F.auth, 'utf8'))
  db.users = db.users.filter((u) => u.name !== 'ghost')
  await fs.writeFile(F.auth, JSON.stringify(db, null, 2))
  await wait(80)
  const d = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'brief', arguments: {} }, TG)).j)
  eq(d.error?.code, 'E_AUTH', '고아 토큰')
  must(/명부에 없는/.test(d.error.message), d.error.message)
  return d.error.message
})

await check(26, 'serve user list --of-repo 가 그 레포를 볼 사람을 낸다', async () => {
  const rows = JSON.parse((await ctx('serve', 'user', 'list', '--auth', F.auth, '--of-repo', 'beta', '--json')).stdout)
  eq(rows.map((r) => r.name), ['kjsa'], 'beta 를 볼 사람')
  return 'beta → kjsa 만'
})

await check(27, 'auth.log 에 남고 원문 토큰은 없다', async () => {
  const log = await fs.readFile(path.join(F.data, 'logs', 'auth.log'), 'utf8')
  must(/user add · kjsa/.test(log), 'user add 기록 없음')
  must(/token issue · kjsa/.test(log), 'token issue 기록 없음')
  for (const t of [TK, TK2, TQ, TG]) must(!log.includes(t), '원문 토큰이 샜다')
  return `${log.split(NL).filter(Boolean).length}줄 · 원문 0`
})

await check(33, '/healthz 본문에 레포 이름이 하나도 없다', async () => {
  const r = await H.call('/healthz')
  const t = await r.text()
  eq(r.status, 200, 'status')
  for (const n of ['alpha', 'beta']) must(!t.includes(n), `${n} 이 노출됐다`)
  return t
})

await check(34, '/repos 가 mirror · head 를 낸다', async () => {
  const rows = await (await H.call('/repos', { headers: { authorization: 'Bearer ' + TK } })).json()
  must(rows.every((r) => 'mirror' in r && 'head' in r), '필드 없음')
  return rows.map((r) => `${r.name}:${r.mirror}`).join(' ')
})

await check(42, 'repos 가 권한 밖 레포를 안 낸다', async () => {
  const mine = payload((await H.rpc('/mcp', 'tools/call', { name: 'repos', arguments: {} }, TQ)).j)
  eq(mine.map((r) => r.name), ['alpha'], 'qa 의 목록')
  return 'qa → alpha 만'
})

await check(41, 'POST /mcp 와 /mcp/<name> 이 같은 도구 목록', async () => {
  const a = (await H.rpc('/mcp', 'tools/list', {}, TK)).j.result.tools.map((t) => t.name).sort()
  const b = (await H.rpc('/mcp/alpha', 'tools/list', {}, TK)).j.result.tools.map((t) => t.name).sort()
  eq(a, b, '도구 목록')
  eq(a.length, 13, '모드 B 는 13건')
  return '13건 동일'
})

await check(8, '기본 레포가 없으면 repo 생략 → E_REPO', async () => {
  const d = payload((await H.rpc('/mcp', 'tools/call', { name: 'brief', arguments: {} }, TK)).j)
  eq(d.error?.code, 'E_REPO', '기본 없음')
  return 'E_REPO'
})

await check(43, 'save 에 repo 누락 → 거절', async () => {
  const d = payload(
    (await H.rpc('/mcp', 'tools/call', { name: 'save', arguments: { work: { id: '2026-0921-노레포', title: 'x', date: '2026-09-21 10:00', body: 'b' } } }, TK)).j
  )
  must(d.error, 'repo 없이 통과했다')
  return d.error.code + ' ' + d.error.message.slice(0, 40)
})

// save 본선
let SEC = null
await check(28, 'save 정상 — 커밋 1 · work · applied · INDEX', async () => {
  const R = path.join(F.repos, 'alpha')
  const n0 = Number((await run('git', ['-C', R, 'rev-list', '--count', 'HEAD'])).stdout.trim())
  SEC = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'section', arguments: { coord: 'api:/adapter/a10/expense-slip' } }, TK)).j)
  const ok = payload(
    (
      await H.rpc(
        '/mcp/alpha',
        'tools/call',
        {
          name: 'save',
          arguments: {
            repo: 'alpha',
            work: { id: '2026-0921-검증-정상', title: '검증 정상', date: '2026-09-21 11:00', touches: ['api:/adapter/a10/expense-slip'], body: '검증 하네스가 만든 기록이다.' },
            sections: [{ coord: 'api:/adapter/a10/expense-slip', applied: SEC.applied, body: '**정의** 검증용 본문.' }],
          },
        },
        TK
      )
    ).j
  )
  must(ok.commit, JSON.stringify(ok.error))
  const n1 = Number((await run('git', ['-C', R, 'rev-list', '--count', 'HEAD'])).stdout.trim())
  eq(n1, n0 + 1, '커밋 수')
  // **`core.quotepath=false` 가 없으면 한글 경로가 `ì\...` 로 나온다** —
  // 그래서 `work/` 를 못 찾고 엉뚱하게 실패한다. 실측으로 잡았다.
  const files = (await run('git', ['-C', R, '-c', 'core.quotepath=false', 'show', '--name-only', '--format=', 'HEAD'])).stdout
  for (const f of ['INDEX.md', 'INDEX-by-coord.md', 'work/']) must(files.includes(f), `${f} 가 커밋에 없다 — ${files.replace(/\s+/g, ' ').slice(0, 120)}`)
  const after = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'section', arguments: { coord: 'api:/adapter/a10/expense-slip' } }, TK)).j)
  eq(after.applied, '2026-0921-검증-정상', 'applied 갱신')
  return `커밋 ${n0}→${n1} · applied 갱신`
})

await check(29, 'save 충돌 — 옛 applied 로 보내면 E_CONFLICT', async () => {
  const d = payload(
    (
      await H.rpc(
        '/mcp/alpha',
        'tools/call',
        {
          name: 'save',
          arguments: {
            repo: 'alpha',
            work: { id: '2026-0921-검증-충돌', title: '충돌', date: '2026-09-21 12:00', touches: ['api:/adapter/a10/expense-slip'], body: '본문' },
            sections: [{ coord: 'api:/adapter/a10/expense-slip', applied: SEC.applied, body: '덮어쓰기 시도' }],
          },
        },
        TK
      )
    ).j
  )
  eq(d.error?.code, 'E_CONFLICT', '충돌')
  must(d.error.detail.expected && d.error.detail.current, 'expected·current 없음')
  const st = (await run('git', ['-C', path.join(F.repos, 'alpha'), 'status', '--porcelain'])).stdout.trim()
  eq(st, '', '트리가 더럽다')
  return `expected ${d.error.detail.expected} ≠ current ${d.error.detail.current} · 트리 깨끗`
})

await check(30, 'save 검사 실패 — 파생 누락이면 복원 · 커밋 0', async () => {
  const R = path.join(F.repos, 'alpha')
  const n0 = Number((await run('git', ['-C', R, 'rev-list', '--count', 'HEAD'])).stdout.trim())
  const d = payload(
    (
      await H.rpc(
        '/mcp/alpha',
        'tools/call',
        {
          name: 'save',
          arguments: {
            repo: 'alpha',
            work: { id: '2026-0921-검증-파생누락', title: '파생 누락', date: '2026-09-21 13:00', touches: ['api:/adapter/a10/expense-slip'], body: '섹션을 안 고친다' },
          },
        },
        TK
      )
    ).j
  )
  eq(d.error?.code, 'E_CHECK', '검사 실패')
  const n1 = Number((await run('git', ['-C', R, 'rev-list', '--count', 'HEAD'])).stdout.trim())
  eq(n1, n0, '커밋이 늘었다')
  eq((await run('git', ['-C', R, 'status', '--porcelain'])).stdout.trim(), '', '트리가 더럽다')
  const left = await fs.access(path.join(R, 'work', '2026-0921-검증-파생누락.md')).then(() => true).catch(() => false)
  must(!left, 'work 파일이 남았다')
  return '커밋 0 · 트리 깨끗 · work 파일 지워짐'
})

await check(31, '같은 id 두 번 → E_EXISTS', async () => {
  const d = payload(
    (
      await H.rpc(
        '/mcp/alpha',
        'tools/call',
        { name: 'save', arguments: { repo: 'alpha', work: { id: '2026-0921-검증-정상', title: 'x', date: '2026-09-21 14:00', body: '본문' } } },
        TK
      )
    ).j
  )
  eq(d.error?.code, 'E_EXISTS', 'id 중복')
  return 'E_EXISTS'
})

await check(32, '요청 2MB 초과 → 413', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/mcp/alpha`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK },
    body: 'x'.repeat(2 * 1024 * 1024 + 64),
  })
  eq(r.status, 413, 'status')
  return '413'
})

await check(35, '만료된 토큰 → 401 · token list 가 남은 일수를 낸다', async () => {
  const db = JSON.parse(await fs.readFile(F.auth, 'utf8'))
  const t = db.tokens.find((x) => x.user === 'qa')
  t.expires = new Date(Date.now() - 86400000).toISOString().slice(0, 10)
  await fs.writeFile(F.auth, JSON.stringify(db, null, 2))
  await wait(80)
  const d = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'brief', arguments: {} }, TQ)).j)
  eq(d.error?.message, '만료', '만료 판정')
  const rows = JSON.parse((await ctx('serve', 'token', 'list', '--auth', F.auth, '--json')).stdout)
  must(rows.some((r) => r.daysLeft !== null), '남은 일수 없음')
  return '만료 401 · 남은 일수 표시'
})

await check(37, 'revoke 직후 다음 요청이 401', async () => {
  await ctx('serve', 'token', 'revoke', '--auth', F.auth, '--name', 'kjsa', '--data', F.data)
  await wait(80)
  eq((await H.rpc('/mcp/alpha', 'tools/list', {}, TK)).status, 401, 'revoke 후')
  // 되살린다 — 뒤 검사가 쓴다
  return '401'
})

const TK3 = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--data', F.data)).stdout.trim()

await check(38, 'ctx setup --server 가 kit 을 받아 넣고 ${CDP_TOKEN} 을 쓴다', async () => {
  const W = path.join(TMP, 'work')
  await fs.mkdir(W, { recursive: true })
  await run('git', ['-C', W, 'init', '-q'])
  await fs.writeFile(path.join(W, 'README.md'), '# 작업 레포\n')
  await fs.writeFile(path.join(W, 'CLAUDE.md'), '# 우리 프로젝트\n\n원래 있던 내용이다.\n')
  await run('git', ['-C', W, 'add', '-A'])
  await run('git', ['-C', W, '-c', 'user.name=s', '-c', 'user.email=s@x', 'commit', '-qm', 'i'])

  await run(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), 'setup', '--server', `http://127.0.0.1:${PORT}`, '--repo', 'alpha', W], {
    cwd: ROOT,
    env: { ...process.env, CDP_TOKEN: TK3 },
    encoding: 'utf8',
  })
  const mcp = JSON.parse(await fs.readFile(path.join(W, '.mcp.json'), 'utf8'))
  must(mcp.mcpServers.cdp.headers.Authorization.includes('${CDP_TOKEN}'), '원문 토큰이 박혔다')
  const skills = await fs.readdir(path.join(W, '.claude', 'skills'))
  must(skills.length >= 7, `스킬 ${skills.length}`)
  return `스킬 ${skills.length}종 · \${CDP_TOKEN}`
})

await check(54, 'CLAUDE.md 가 이미 있어도 기존 내용이 남는다', async () => {
  const body = await fs.readFile(path.join(TMP, 'work', 'CLAUDE.md'), 'utf8')
  must(body.includes('원래 있던 내용이다.'), '기존 내용이 사라졌다')
  must(/<!-- cdp:kit [0-9a-f]+ -->/.test(body), 'cdp:kit 이 없다')
  return '보존 + cdp:kit'
})

await check(57, 'sync.kit.hash 와 CLAUDE.md 의 cdp:kit 이 맞는다', async () => {
  const { kitOf } = await import('../../core/setup.js')
  const mine = kitOf(await fs.readFile(path.join(TMP, 'work', 'CLAUDE.md'), 'utf8'))
  const s = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'sync', arguments: {} }, TK3)).j)
  eq(mine, s.kit.hash, 'kit 해시')
  return `${mine} 일치`
})

// 설치 대장
let WRID = null
await check(51, '작업 레포 등록 — 명부에 없는 owner 는 거절', async () => {
  const bad = await H.call('/workrepos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'x', knowledge: 'alpha', owner: '없는사람' }),
  })
  eq(bad.status, 400, 'owner 거절')
  const ok = await H.call('/workrepos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'my-app', knowledge: 'alpha', owner: 'kjsa' }),
  })
  WRID = (await ok.json()).id
  return `거절 · 등록 ${WRID}`
})

await check(55, '/applied 가 by 를 토큰에서 채운다 · 보내면 거절', async () => {
  const bad = await H.call(`/workrepos/${WRID}/applied`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ kit: 'x', by: '남의이름' }),
  })
  eq(bad.status, 400, 'by 위조')
  const { kitOf } = await import('../../core/setup.js')
  const mine = kitOf(await fs.readFile(path.join(TMP, 'work', 'CLAUDE.md'), 'utf8'))
  const ok = await H.call(`/workrepos/${WRID}/applied`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ kit: mine }),
  })
  const row = await ok.json()
  eq(row.applied.by, 'kjsa', 'by')
  return `by=${row.applied.by} (토큰에서)`
})

await check(52, '꾸러미를 빈 레포에 풀면 bin/ctx 없이 연결된다', async () => {
  const { unzip } = await import('../../core/zip.js')
  const r = await H.call(`/kit/alpha?workrepo=${WRID}`, { headers: { authorization: 'Bearer ' + TK3 } })
  const files = await unzip(Buffer.from(await r.arrayBuffer()))
  const W2 = path.join(TMP, 'work2')
  // 꾸러미는 `kit/` 한 단 아래다(§6.7.3 · 08f5436) — 푸는 것만으로는 아무것도
  // 안 덮이고, 옮기는 것은 `install.mjs` 가 한다. 여기서는 그 옮기기를 손으로
  // 흉내낸다: `kit/` 아래만 작업 레포로. 안내문 · 실행기는 작업 레포에 안 간다.
  const inKit = files.filter((f) => f.name.startsWith('kit/'))
  must(inKit.length > 0, '꾸러미에 kit/ 이 없다 — 한 단 내리기(08f5436)가 풀렸다')
  must(files.some((f) => f.name === '설치.md'), '꾸러미에 설치.md 가 없다')
  for (const f of inKit) {
    const rel = f.name.slice('kit/'.length)
    if (rel === '.claude/work-repo/CLAUDE.md') continue
    const dst = path.join(W2, rel)
    await fs.mkdir(path.dirname(dst), { recursive: true })
    await fs.writeFile(dst, f.data)
  }
  const cfg = JSON.parse(await fs.readFile(path.join(W2, '.mcp.json'), 'utf8')).mcpServers.cdp
  const res = await fetch(cfg.url, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/list', params: {} }),
  })
  const t = await res.text()
  must(t.includes('"save"'), '연결 안 됨')
  return `${files.length}개 풀고 연결 ok`
})

await check(53, '꾸러미에 토큰 원문이 없다', async () => {
  const { unzip } = await import('../../core/zip.js')
  const r = await H.call(`/kit/alpha?workrepo=${WRID}`, { headers: { authorization: 'Bearer ' + TK3 } })
  const files = await unzip(Buffer.from(await r.arrayBuffer()))
  const all = files.map((f) => f.data.toString('utf8')).join('')
  for (const t of [TK3, TQ, TK, TK2]) must(!all.includes(t), '토큰이 샜다')
  return `${files.length}개 · 원문 0`
})

await check(56, '서버 kit 을 바꾸면 대장이 낡음으로', async () => {
  await fs.appendFile(path.join(F.repos, 'alpha', '.claude', 'skills', 'cdp-load', 'SKILL.md'), '\n<!-- 바꾼다 -->\n')
  await wait(50)
  const rows = (await (await H.call('/workrepos', { headers: { authorization: 'Bearer ' + TK3 } })).json()).repos
  const me = rows.find((r) => r.id === WRID)
  eq(me.state, '낡음', '상태')
  return `${me.applied.kit} → ${me.kitNow}`
})

await check(58, '보고 없이 설치해도 동작한다 (대장만 미설치)', async () => {
  const ok = await H.call('/workrepos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'no-report', knowledge: 'alpha', owner: 'kjsa' }),
  })
  const id = (await ok.json()).id
  const rows = (await (await H.call('/workrepos', { headers: { authorization: 'Bearer ' + TK3 } })).json()).repos
  eq(rows.find((r) => r.id === id).state, '미설치', '상태')
  return '미설치로 남는다'
})

// 관리 서비스
await check(60, '쿠키 없이 화면 경로 → /login · next 를 들고 간다', async () => {
  const r = await H.call('/r/alpha/doc/x')
  eq(r.status, 302, 'status')
  must(r.headers.get('location').startsWith('/login?next='), r.headers.get('location'))
  return r.headers.get('location')
})

await check(61, '만료 · 명부 삭제 · inactive 가 화면에서 같은 문구', async () => {
  const seen = new Set()
  for (const t of [TQ, TG, 'nonsense']) {
    const r = await fetch(`http://127.0.0.1:${PORT}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=' + encodeURIComponent(t),
      redirect: 'manual',
    })
    const body = await r.text()
    seen.add((/<p class="err">([^<]*)</.exec(body) || [])[1] || '(없음)')
  }
  eq([...seen], ['토큰을 확인하세요.'], '문구가 갈린다')
  return '문구 하나'
})

await check(49, '쿠키가 HttpOnly · SameSite=Lax 로 내려간다', async () => {
  const r = await fetch(`http://127.0.0.1:${PORT}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=' + encodeURIComponent(TK3),
    redirect: 'manual',
  })
  const sc = r.headers.get('set-cookie')
  for (const k of ['HttpOnly', 'SameSite=Lax', 'Max-Age=43200']) must(sc.includes(k), `${k} 없음`)
  must(!sc.includes('Secure'), '평문 배치인데 Secure 가 붙었다')
  H.setCookie(/cdp_s=[^;]*/.exec(sc)[0])
  return 'HttpOnly · SameSite=Lax · 12h · Secure 없음(평문)'
})

await check(45, '/api/<repo>/… 가 쿠키로 열린다', async () => {
  const r = await H.call('/api/alpha/status')
  eq(r.status, 200, 'status')
  const j = await r.json()
  must(typeof j.works === 'number', '본문이 이상하다')
  return `works ${j.works}`
})

await check(47, '로컬 전용 라우트가 서버 모드에서 404', async () => {
  for (const p of ['/setup', '/open', '/quit', '/rescan', '/git/pull', '/git/push', '/git/hooks']) {
    const r = await H.call('/api/alpha' + p, { method: 'POST' })
    eq(r.status, 404, p)
  }
  return '7개 404'
})

await check(46, '권한 밖 레포의 /api/<repo>/* 는 없는 것', async () => {
  const q = http(`http://127.0.0.1:${PORT}`)
  const lr = await fetch(`http://127.0.0.1:${PORT}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=' + encodeURIComponent(TQ),
    redirect: 'manual',
  })
  // qa 는 만료시켰다 — 로그인 자체가 막히는 것이 맞다
  eq(lr.status, 401, '만료된 토큰으로 로그인')
  const r = await H.call('/api/beta/status')
  eq(r.status, 200, 'kjsa 는 beta 도 본다')
  return '만료 401 · kjsa 는 통과'
})

await check(48, '다른 오리진에서 온 요청은 Origin 검사로 끊긴다', async () => {
  const r = await H.call('/api/alpha/status', { headers: { origin: 'https://evil.example' } })
  eq(r.status, 403, 'status')
  const ok = await H.call('/api/alpha/status', { headers: { origin: 'http://localhost:5173' } })
  eq(ok.status, 200, '루프백 origin')
  return '403 · 루프백 200'
})

await check(62, 'repos 가 빈 사용자는 "볼 수 있는 레포가 없다"', async () => {
  await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'nobody', '--data', F.data)
  const tn = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'nobody', '--data', F.data)).stdout.trim()
  const r = await fetch(`http://127.0.0.1:${PORT}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=' + encodeURIComponent(tn),
    redirect: 'manual',
  })
  eq(r.status, 302, '로그인은 된다')
  const c = /cdp_s=[^;]*/.exec(r.headers.get('set-cookie'))[0]
  const page = await (await fetch(`http://127.0.0.1:${PORT}/`, { headers: { cookie: c }, redirect: 'manual' })).text()
  must(page.includes('볼 수 있는 지식 레포가 없습니다'), '멈추지 않았다')
  return '로그인 O · 멈춤 화면'
})

await check(59, 'MCP 와 관리 서비스가 같은 레포를 두 번 읽지 않는다', async () => {
  // `/api` 는 Store, `/mcp` 는 makeRepoCache 를 쓴다. **둘 다 레포마다 하나**이고
  // 요청마다 새로 만들지 않는다 — 두 번 불러 같은 수치가 나오는지로 본다.
  const a1 = (await (await H.call('/api/alpha/status')).json()).works
  const a2 = (await (await H.call('/api/alpha/status')).json()).works
  const m1 = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'brief', arguments: {} }, TK3)).j).works
  eq([a1, a2, m1], [a1, a1, a1], '수치가 갈린다')
  return `works ${a1} 일치`
})

if (SLOW) {
  await check(39, '재시작 없이 <root> 에 레포를 추가하면 60초 안에 보인다', async () => {
    await fs.cp(path.join(ROOT, 'viewer', 'fixture'), path.join(F.repos, 'gamma'), { recursive: true })
    await wait(62000)
    const rows = await (await H.call('/repos', { headers: { authorization: 'Bearer ' + TK3 } })).json()
    must(rows.some((r) => r.name === 'gamma'), '안 보인다')
    return 'gamma 인식'
  })
} else {
  skip(39, '재시작 없이 레포 추가 → 60초 안에 /repos', '--slow 로 돈다 (60초)')
}

// ══ 제품화 (검토 §3.4 · §3.5 · TODO 4 · 5) ═══════════════════════════════════
//
// 번호 70 이상은 설계서 §10 밖이다 — 제품화 TODO 의 "끝났다고 보는 기준"이다.

await check(70, 'GET /packages 가 패키지를 낸다 (권한과 무관)', async () => {
  const r = await H.call('/packages', { headers: { authorization: 'Bearer ' + TK3 } })
  eq(r.status, 200, 'status')
  const j = await r.json()
  must(j.packages.some((p) => p.name === 'dpms'), 'dpms 가 없다 — ' + JSON.stringify(j).slice(0, 120))
  const d = j.packages.find((p) => p.name === 'dpms')
  must(d.docs >= 40 && d.patterns >= 10, `문서 ${d.docs} · 패턴 ${d.patterns}`)
  return `${j.packages.length}개 · dpms v${d.version} · 문서 ${d.docs}`
})

// 읽기 전용 사용자 — write 없는 사람이 레포를 세울 수 없어야 한다
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'ro', '--repos', 'alpha', '--data', F.data)
const TR = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'ro', '--data', F.data)).stdout.trim()

await check(71, 'POST /repos — write 없음 403 · 이름 형식 400 · 중복 409', async () => {
  const post = (body, t) =>
    H.call('/repos', { method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer ' + t }, body: JSON.stringify(body) })
  eq((await post({ name: 'x', package: 'dpms' }, TR)).status, 403, 'write 없음')
  eq((await post({ name: '한글 이름', package: 'dpms' }, TK3)).status, 400, '이름 형식')
  eq((await post({ name: 'alpha', package: 'dpms' }, TK3)).status, 409, '이미 있는 레포')
  eq((await post({ name: 'zeta', package: '없는패키지' }, TK3)).status, 404, '없는 패키지')
  return '403 · 400 · 409 · 404'
})

await check(72, 'POST /repos 가 패키지로 레포를 세우고 다음 요청부터 목록에 든다', async () => {
  const r = await H.call('/repos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'delta', package: 'dpms' }),
  })
  const j = await r.json()
  eq(r.status, 200, JSON.stringify(j).slice(0, 200))
  must(/^[0-9a-f]{7,}$/.test(j.commit || ''), '첫 커밋이 없다 — 훅이 막았나')
  must(j.files > 40, `파일 ${j.files}`)
  const list = await (await H.call('/repos', { headers: { authorization: 'Bearer ' + TK3 } })).json()
  must(list.some((x) => x.name === 'delta'), '목록에 없다')
  const tl = (await H.rpc('/mcp/delta', 'tools/list', {}, TK3)).j.result.tools.length
  eq(tl, 13, '새 레포의 도구 수')
  const b = payload((await H.rpc('/mcp/delta', 'tools/call', { name: 'brief', arguments: {} }, TK3)).j)
  eq(b.works, 0, '작업 기록 0건')
  must(b.managedDocs >= 40, `관리 문서 ${b.managedDocs}`)
  const hp = (await run('git', ['-C', path.join(F.repos, 'delta'), 'config', '--get', 'core.hooksPath'])).stdout.trim()
  eq(hp, '.githooks', '훅 경로')
  return `commit ${j.commit} · 파일 ${j.files} · 도구 13 · 관리 문서 ${b.managedDocs}`
})

await check(73, '세운 레포에 save 가 한 번 성공한다 (등록부 · 어휘 · 훅이 살아 있다)', async () => {
  const sec = payload((await H.rpc('/mcp/delta', 'tools/call', { name: 'section', arguments: { coord: '테이블정의서:ex_plan_mst' } }, TK3)).j)
  must(sec.body != null, '예시 섹션을 못 읽었다 — ' + JSON.stringify(sec).slice(0, 160))
  const ok = payload(
    (
      await H.rpc(
        '/mcp/delta',
        'tools/call',
        {
          name: 'save',
          arguments: {
            repo: 'delta',
            work: { id: '2026-0922-제품화-검증', title: '제품화 검증', date: '2026-09-22 15:00', touches: ['테이블정의서:ex_plan_mst'], body: '세운 레포에 첫 기록.' },
            sections: [{ coord: '테이블정의서:ex_plan_mst', applied: sec.applied, body: '**정의** 검증용.' }],
          },
        },
        TK3
      )
    ).j
  )
  must(ok.commit, JSON.stringify(ok.error || ok).slice(0, 200))
  return `commit ${ok.commit} · 섹션 ${ok.sections}`
})

// 패키지가 여럿이다 — dpms 하나만 보면 복제한 패키지가 깨져도 초록이다. 전부 본다.
await check(74, '패키지 검사 — ctx package check --all 이 모든 패키지를 ok 로 낸다', async () => {
  const r = await ctx('package', 'check', '--all', '--json')
  const j = JSON.parse(r.stdout)
  must(j.length >= 1, '패키지가 없다')
  must(j.some((p) => p.name === 'dpms'), 'dpms 가 없다')
  const bad = j.filter((p) => !p.ok)
  must(!bad.length, bad.map((p) => `${p.name}: ${JSON.stringify(p.problems).slice(0, 120)}`).join(' / '))
  return `${j.length}개 ok — ` + j.map((p) => `${p.name}(문서 ${p.docs} · 패턴 ${p.patterns})`).join(' · ')
})

await check(14, '모드 A `.mcp.json` — Windows 는 cmd /c ctx.cmd mcp', async () => {
  const { mcpEntryLocal } = await import(pathToFileURL(path.join(ROOT, 'core/setup.js')).href)
  const w = mcpEntryLocal('C:/cdp', 'win32')
  eq(w.type, 'stdio', 'type')
  eq(w.command, 'cmd', 'command')
  must(w.args[0] === '/c' && /ctx\.cmd$/.test(w.args[1]) && w.args[2] === 'mcp', JSON.stringify(w.args))
  const u = mcpEntryLocal('/home/kjsa/cdp', 'linux')
  must(/\/bin\/ctx$/.test(u.command.split(path.sep).join('/')), u.command)
  eq(u.args, ['mcp'], 'args')
  return 'win: cmd /c … ctx.cmd mcp · posix: bin/ctx mcp'
})

await check(15, 'ctx setup 이 .mcp.json 을 쓰고 그것으로 도구 12건이 열린다', async () => {
  // **모드 A 가 MCP 로 붙는 유일한 길이다.** 이것이 없으면 에이전트가 bash 로
  // `ctx` 를 직접 부른다 — 서버가 있어도 아무도 안 붙으면 없는 것과 같다.
  const K = path.join(TMP, 'repos', 'alpha')
  const W2 = path.join(TMP, 'work-local')
  await fs.mkdir(path.join(W2, '.git'), { recursive: true })
  await fs.writeFile(path.join(W2, '.git', 'HEAD'), 'ref: refs/heads/main' + NL)

  const dry = await ctx('setup', '--repo', K, W2, '--dry')
  must(/\.mcp\.json/.test(dry.stdout), '--dry 에 .mcp.json 이 없다')

  await ctx('setup', '--repo', K, W2)
  const j = JSON.parse(await fs.readFile(path.join(W2, '.mcp.json'), 'utf8'))
  const e = j.mcpServers.cdp
  eq(e.type, 'stdio', 'type')
  must(!('url' in e), '모드 A 인데 url 이 있다')

  // 껍데기 대신 번들을 직접 띄운다 — 픽스처에는 bin/ 셔임이 없다.
  const c = stdioClient(['--repo', K])
  try {
    await c.rpc('initialize', INIT())
    const tools = (await c.rpc('tools/list')).result.tools
    must(tools.length === 12, `도구 ${tools.length}건`)
    must(!tools.some((t) => t.name === 'save'), '모드 A 에 save 가 있다')
    return `.mcp.json stdio · 도구 ${tools.length}건 · save 없음`
  } finally {
    c.kill()
  }
})

await check(75, '스킬 본문이 부르는 이름이 전부 실제 도구다', async () => {
  // 스킬은 에이전트 행동을 직접 바꾼다. **없는 이름을 적어도 아무도 모른다** —
  // 실제로 `ctx term` 이 `match` 에 흡수된 뒤에도 예시에 남아 있었다.
  const { buildServer } = await import(pathToFileURL(path.join(ROOT, 'viewer/bin/ctx-mcp.mjs')).href)
  const srv = buildServer({
    repos: [{ name: 'alpha', root: path.join(TMP, 'repos', 'alpha') }],
    fallback: 'alpha',
    mode: 'server',
    prompts: 'never',
    saver: () => ({}),
  })
  const known = new Set(Object.keys(srv._registeredTools || {}))
  must(known.size >= 13, `도구 목록을 못 읽었다 (${known.size})`)

  const dir = path.join(ROOT, 'agent', 'skills')
  const bad = []
  for (const n of await fs.readdir(dir)) {
    if (n === 'cdp-push') continue // 코드 레포용 — 지식 도구를 부르지 않는다
    const text = await fs.readFile(path.join(dir, n, 'SKILL.md'), 'utf8')
    const cut = text.indexOf('## 도구가 없을 때')
    must(cut > 0, `${n}: 「도구가 없을 때」 절이 없다`)
    const body = text.slice(0, cut)
    for (const m of body.matchAll(/^\s*([a-z][a-z_]{2,15})\(/gm)) {
      if (!known.has(m[1])) bad.push(`${n}:${m[1]}`)
    }
    for (const m of body.matchAll(/(bin\/ctx|C:\/cdp\/bin)/g)) bad.push(`${n}:${m[1]}`)
  }
  must(bad.length === 0, bad.slice(0, 6).join(' · '))
  return `6종 · 도구 ${known.size}종과 대조 · 잔재 0`
})

S.kill()

// ── 못 도는 것 ──────────────────────────────────────────────────────────────

skip(13, 'Node 없는 PC: cdp.exe 로 stdio', '⏸ 0단계 — 일반망이라 exe 경로를 안 쓴다')
skip(15.1, 'inspect() 가 .mcp.json 상태를 낸다', '⏸ 0단계 — 화면 쪽. 14·15 가 파일 자체는 덮는다')
skip(16, 'ctx setup --desktop 이 다른 키를 보존', '⏸ 0단계 — 모드 A 배포물')
skip(18, '반입 묶음만으로 설치', '⏸ 0단계 — 일반망')
skip(24, 'active:false 가 열린 화면도 끊는다', '6.1 에서 브라우저 실측 — 여기서는 25번이 같은 경로를 덮는다')
skip(40, 'Desktop 의 load prompt · Claude Code 에선 안 보임', '5번이 노출 분기를 덮는다. 실제 Desktop 은 손으로')
skip(44, 'claude.ai 커넥터에 정적 Bearer', '해당 없음 — 공개 HTTPS 가 아니다(0단계 결정)')
skip(50, '두 사람의 /state 가 섞이지 않는다', 'localStorage 라 서버에 상태가 없다(§6.8) — 섞일 자리가 없음')
skip(63, '전환 메뉴에 권한 밖 레포가 없다', '6.2 브라우저 실측 — /me 가 거른다(42번이 같은 경로)')
skip(64, '레포를 바꾸면 화면 상태 초기화', '6.2 브라우저 실측 — 전환이 주소 이동이라 구조적으로 성립')
skip(65, '/r/<repo>/doc/<id> 를 새 창에 붙여넣으면 열린다', '6.2 브라우저 실측')
skip(66, '⌘K 가 다른 레포의 좌표를 안 낸다', '6.2 — 모든 호출이 /api/<repo> 기준(45번이 경로를 덮는다)')
skip(67, '서버 모드에 지식 레포·작업 레포 탭 없음', '6.2 브라우저 실측 — 관리 메뉴 5→3')
skip(68, 'loopback 경고 자리에 user · 로그아웃', '6.2 브라우저 실측')
skip(69, '레포 하나면 전환 UI 없음', '6.2 브라우저 실측 — qa 로 확인')

// ── 보고 ────────────────────────────────────────────────────────────────────

results.sort((a, b) => a.n - b.n)
const mark = { ok: '✓', fail: '✗', skip: '–' }
const w = Math.max(...results.map((r) => [...r.label].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)))
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)))

console.log('')
for (const r of results) console.log(` ${mark[r.state]} ${String(r.n).padStart(2)}  ${pad(r.label, w)}  ${r.note}`)

const n = (s) => results.filter((r) => r.state === s).length
console.log('')
console.log(`✓ ${n('ok')}  ✗ ${n('fail')}  – ${n('skip')}   (§10 전체 69줄 + 제품화 70~75)`)
await fs.writeFile(path.join(TMP, 'result.json'), JSON.stringify(results, null, 2))
process.exit(n('fail') ? 1 : 0)
