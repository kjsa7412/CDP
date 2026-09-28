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
  // 서버가 상한을 넘는 순간 소켓을 끊으면 클라이언트는 413 을 읽기 전에 "fetch failed" 를
  // 볼 수 있다 — 경쟁이다(2026-09-23 실측 한 번, 다음 실행은 통과). 한 번은 다시 보낸다.
  let r
  for (let i = 0; ; i++) {
    try {
      r = await fetch(`http://127.0.0.1:${PORT}/mcp/alpha`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK },
        body: 'x'.repeat(2 * 1024 * 1024 + 64),
      })
      break
    } catch (e) {
      if (i >= 1 || !/fetch failed/.test(String(e?.message))) throw e
    }
  }
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
  // 커밋한다 — 실제로 kit 은 커밋으로 바뀌고, 더러운 트리는 이제 save 가 거절한다(동시 기록 검토 v0.1 D5 · 76번이 걸렸다)
  await run('git', ['-C', path.join(F.repos, 'alpha'), 'add', '-A'])
  await run('git', ['-C', path.join(F.repos, 'alpha'), '-c', 'user.name=h', '-c', 'user.email=h@x', 'commit', '-qm', 'kit 변경'])
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

await check(62, 'repos 가 빈 사용자 — 로그인은 되고 /r 은 첫 레포로 보내지 않고 빈 상태 화면을 낸다', async () => {
  await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'nobody', '--data', F.data)
  const tn = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'nobody', '--data', F.data)).stdout.trim()
  const r = await fetch(`http://127.0.0.1:${PORT}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=' + encodeURIComponent(tn),
    redirect: 'manual',
  })
  eq(r.status, 302, '로그인은 된다')
  eq(r.headers.get('location'), '/r', '기본 next 는 /r')
  const c = /cdp_s=[^;]*/.exec(r.headers.get('set-cookie'))[0]
  // `/r` — 갈 레포가 없으니 302 가 아니라 화면(빈 상태)이다. 화면이 /me 로 그린다(제품관리서비스 검토 §4.2)
  const page = await fetch(`http://127.0.0.1:${PORT}/r`, { headers: { cookie: c }, redirect: 'manual' })
  eq(page.status, 200, '/r 이 200')
  must((await page.text()).includes('window.__CDP_SERVER__'), 'SPA 를 낸다')
  const me = await (await fetch(`http://127.0.0.1:${PORT}/me`, { headers: { cookie: c } })).json()
  eq(me.repos.length, 0, '볼 수 있는 레포 0')
  eq(me.role, 'viewer', 'role')
  return '로그인 O · /r 200 · repos 0'
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

// 레포 화면의 `POST /repos`(writer)는 없앴다 — 세우는 길은 콘솔 `POST /admin/repos`(admin · 재인증 · 98~99) 와
// CLI `ctx repo new` 다. 둘 다 `core/reponew.js` 하나를 부른다(화면 · 권한 검토 v0.1 R1). 판정은 CLI 로 잰다.
const PKGS = path.join(ROOT, 'agent', 'packages')
await check(71, 'ctx repo new — 이름 형식 · 중복 · 없는 패키지를 거절한다 (콘솔 POST /admin/repos 와 같은 core/reponew)', async () => {
  const fail = async (args) => (await ctx('repo', 'new', ...args).catch((e) => e)).stderr || ''
  must(/이름 형식/.test(await fail([path.join(F.repos, '한글 이름'), '--package', 'dpms', '--packages', PKGS])), '이름 형식')
  must(/있다|exists|E_EXISTS/.test(await fail([path.join(F.repos, 'alpha'), '--package', 'dpms', '--packages', PKGS])), '이미 있는 레포')
  must(/패키지/.test(await fail([path.join(F.repos, 'zeta'), '--package', '없는패키지', '--packages', PKGS])), '없는 패키지')
  must((await fs.stat(path.join(F.repos, 'zeta')).catch(() => null)) === null, '거절한 것은 남기지 않는다')
  return '이름 형식 · 중복 · 없는 패키지'
})

await check(72, 'ctx repo new 로 세운 레포가 다음 요청부터 MCP · 목록에 든다 (서버 재시작 없음)', async () => {
  const o = await ctx('repo', 'new', path.join(F.repos, 'delta'), '--package', 'dpms', '--packages', PKGS)
  const j = { commit: /[0-9a-f]{7,40}/.exec(o.stdout)?.[0] || '', files: Number(/파일\s*(\d+)/.exec(o.stdout)?.[1] || 0) }
  must(/^[0-9a-f]{7,}$/.test(j.commit || ''), '첫 커밋이 없다 — 훅이 막았나 · ' + o.stdout.slice(0, 160))
  // 서버는 새 폴더를 그 이름으로 가는 첫 요청에서 알아본다(관리자 설명서 3.4)
  const tl0 = (await H.rpc('/mcp/delta', 'tools/list', {}, TK3)).j?.result?.tools?.length
  eq(tl0, 13, '첫 요청에서 알아본다')
  const list = await (await H.call('/repos', { headers: { authorization: 'Bearer ' + TK3 } })).json()
  must(list.some((x) => x.name === 'delta'), '목록에 없다')
  const tl = (await H.rpc('/mcp/delta', 'tools/list', {}, TK3)).j.result.tools.length
  eq(tl, 13, '새 레포의 도구 수')
  const b = payload((await H.rpc('/mcp/delta', 'tools/call', { name: 'brief', arguments: {} }, TK3)).j)
  eq(b.works, 0, '작업 기록 0건')
  must(b.managedDocs >= 40, `관리 문서 ${b.managedDocs}`)
  const hp = (await run('git', ['-C', path.join(F.repos, 'delta'), 'config', '--get', 'core.hooksPath'])).stdout.trim()
  eq(hp, '.githooks', '훅 경로')
  return `commit ${j.commit} · 도구 13 · 관리 문서 ${b.managedDocs}`
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

// 헤딩이 든 body — 2026-09-23 실측. `section` 의 `body` 를 그대로 고쳐 save 에 보내니 헤딩이
// 두 번 들어가 섹션이 비었는데 save · check · where 어디서도 소리가 안 났다. 지금은 셋 —
// `section` 이 `content` 를 주고, save 가 헤딩 든 body 를 E_INPUT 으로 막고, check 가 같은 좌표
// 섹션 둘을 오류로 낸다.
await check(76, 'save — sections[].body 에 헤딩 줄이 있으면 E_INPUT · section 은 content(헤딩 · applied 없는 본문)를 준다', async () => {
  // TK 는 앞 검사들이 만료 · 폐기를 시험하며 건드렸을 수 있다 — 70번대가 쓰는 TK3(write) 로 간다
  const sec = payload((await H.rpc('/mcp/alpha', 'tools/call', { name: 'section', arguments: { coord: 'api:/adapter/a10/expense-slip' } }, TK3)).j)
  must(typeof sec.content === 'string' && sec.content.length > 0, 'content 가 없다 — ' + JSON.stringify(sec).slice(0, 140))
  must(!/^#/.test(sec.content) && !/applied\s*:/.test(sec.content), 'content 에 헤딩이나 applied 가 있다')
  must(/^#/.test(sec.body), 'body 는 헤딩부터여야 한다')
  const d = payload(
    (
      await H.rpc(
        '/mcp/alpha',
        'tools/call',
        {
          name: 'save',
          arguments: {
            repo: 'alpha',
            work: { id: '2026-0923-검증-헤딩', title: '헤딩 든 body', date: '2026-09-23 10:00', touches: ['api:/adapter/a10/expense-slip'], body: '본문' },
            // 실사용 때의 모양 — applied 주석은 뺐는데 헤딩은 남긴 body. applied 가 남아 있으면
            // 2단계의 applied 거절이 먼저 나서 헤딩 거절을 못 본다.
            sections: [
              { coord: 'api:/adapter/a10/expense-slip', applied: sec.applied, body: sec.body.split(NL).filter((l) => !/<!--\s*applied\s*:/i.test(l)).join(NL) },
            ],
          },
        },
        TK3
      )
    ).j
  )
  eq(d.error?.code, 'E_INPUT', '헤딩 거절 — ' + JSON.stringify(d).slice(0, 140))
  must(/헤딩/.test(d.error.message), d.error.message)
  // 거절된 save 가 아무것도 쓰지 않았나 — save 가 만지는 자리(docs · work · 어휘)만 본다.
  // 앞 검사들이 .claude/ 를 건드려 둘 수 있어 트리 전체를 보면 남의 흔적에 걸린다.
  const st = (await run('git', ['-C', path.join(F.repos, 'alpha'), 'status', '--porcelain', '--', 'docs', 'work', '_vocab.md'])).stdout.trim()
  eq(st, '', 'save 가 쓴 것이 남았다')
  return `content ${sec.content.length}자 · E_INPUT · docs/work 깨끗`
})

await check(77, 'check — 같은 좌표 섹션이 한 문서에 둘이면 dup-anchor 오류 (조용히 지나가지 않는다)', async () => {
  const R = path.join(F.repos, 'beta')
  const w = JSON.parse((await ctx('--repo', R, 'where', 'api:/adapter/a10/expense-slip', '--json')).stdout)
  const doc = path.join(R, w.section.doc)
  const orig = await fs.readFile(doc, 'utf8')
  try {
    await fs.writeFile(doc, orig.replace(/\s*$/, '') + NL + NL + w.section.anchor + NL + '<!-- applied: null -->' + NL + '중복 시험' + NL, 'utf8')
    const r = await ctx('--repo', R, 'check', '--json').catch((e) => e)
    const j = JSON.parse(r.stdout)
    const f = (j.findings || []).find((x) => x.kind === 'dup-anchor')
    must(f && f.sev === 'error', 'dup-anchor 가 없다 — ' + JSON.stringify((j.findings || []).map((x) => x.kind)))
    return `${f.items.length}건 · ${String(f.items[0].detail).slice(0, 70)}`
  } finally {
    await fs.writeFile(doc, orig, 'utf8')
  }
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

// ══ 제품 관리 서비스 — 사이트 · 마법사 (TODO ②) ═══════════════════════════════

await check(78, '/site/info — 공개 · 레포 이름 없음 · setupNeeded false · 설명서 목록', async () => {
  const H0 = http(`http://127.0.0.1:${PORT}`) // 쿠키 없는 새 클라이언트
  const r = await H0.call('/site/info')
  eq(r.status, 200, 'status')
  const t = await r.text()
  for (const n of ['alpha', 'beta']) must(!t.includes(n), `${n} 이 노출됐다`)
  const j = JSON.parse(t)
  must(typeof j.repos === 'number', 'repos 가 숫자가 아니다')
  eq(j.setupNeeded, false, 'setupNeeded')
  must(Array.isArray(j.manuals) && j.manuals.length >= 3, `설명서 ${j.manuals?.length}`)
  must(j.version, 'version 없음')
  eq(j.user, null, '세션 없이 user 가 있다')
  // 세션이 있으면 user · role 만 더 온다
  const me = JSON.parse(await (await H.call('/site/info')).text())
  must(me.user, '세션이 있는데 user 가 없다')
  return `repos ${j.repos} · 설명서 ${j.manuals.length} · v${j.version} · 세션 user ${me.user}`
})

await check(79, '/site/manual — 세 권 200 · 설치절차 200 · 경로 밖 404 · 목록 밖 404 · 소개 그림', async () => {
  const H0 = http(`http://127.0.0.1:${PORT}`)
  const a = await H0.call('/site/manual/사용자_설명서.md')
  eq(a.status, 200, '사용자 설명서')
  must((await a.text()).startsWith('# CDP 사용자 설명서'), '본문')
  eq((await H0.call('/site/manual/설치절차.md')).status, 200, '설치절차')
  eq((await H0.call('/site/manual/..%2Fauth.json')).status, 404, '경로 밖')
  eq((await H0.call('/site/manual/README.md')).status, 404, '목록 밖')
  const g = await H0.call('/site/manual/그림/1_세_레포_구조.svg')
  eq(g.status, 200, '그림')
  must((g.headers.get('content-type') || '').includes('svg'), 'svg MIME')
  // `/` · `/manual` · `/setup` · `/login` 은 세션 없이 화면(index.html) 을 낸다 — 표식이 심겨 있다
  const page = await H0.call('/manual/사용자_설명서')
  eq(page.status, 200, '/manual 페이지')
  must((await page.text()).includes('window.__CDP_SERVER__=true'), '서버 표식')
  // `/console` 은 세션이 없으면 로그인으로
  const con = await H0.call('/console')
  eq(con.status, 302, '/console 302')
  must((con.headers.get('location') || '').startsWith('/login?next='), 'next 를 든다')
  return '200 · 200 · 404 · 404 · svg · 표식 · /console→login'
})

await check(80, '명부가 비면 bootstrap.code · /setup 이 첫 관리자를 만든다 · 코드는 한 번 · 둘째는 409', async () => {
  const D2 = path.join(TMP, 'data2')
  const A2 = path.join(TMP, 'auth2.json')
  await fs.mkdir(D2, { recursive: true })
  const S2 = serve(['--root', F.repos, '--port', String(PORT + 1), '--auth', A2, '--data', D2, '--web', path.join(ROOT, 'ops/out/web')])
  try {
    await wait(2500)
    const code = (await fs.readFile(path.join(D2, 'bootstrap.code'), 'utf8')).trim()
    must(code.length >= 24, '코드 파일')
    must(/첫 관리자가 없다/.test(S2.err()), 'stderr 한 줄')
    const H2 = http(`http://127.0.0.1:${PORT + 1}`)
    eq((await (await H2.call('/site/info')).json()).setupNeeded, true, 'setupNeeded')
    const post = (b) => H2.call('/setup', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(b) })
    eq((await post({ code: 'wrong', name: 'root' })).status, 401, '틀린 코드')
    eq((await post({ code, name: '한글' })).status, 400, '이름 형식')
    const ok = await post({ code, name: 'root', label: '첫 관리자' })
    eq(ok.status, 200, '맞는 코드')
    const j = await ok.json()
    must(j.raw && j.raw.length > 30, '원문')
    must((ok.headers.get('set-cookie') || '').includes('cdp_s='), '세션 쿠키')
    // 마법사 직후 첫 쓰기에서 방금 본 토큰을 다시 묻지 않는다 — 재인증 쿠키도 같이(화면 UX 검토 v0.1 P18 · D5 안)
    must((ok.headers.get('set-cookie') || '').includes('cdp_su='), '재인증 쿠키(15분)')
    must((await fs.stat(path.join(D2, 'bootstrap.code')).catch(() => null)) === null, '코드 파일이 남았다')
    eq((await post({ code, name: 'again' })).status, 409, '둘째 setup')
    const me = await (await http(`http://127.0.0.1:${PORT + 1}`).call('/me', { headers: { authorization: 'Bearer ' + j.raw } })).json()
    eq(me.role, 'admin', 'role')
    eq(me.admin, true, 'admin')
    eq((await (await http(`http://127.0.0.1:${PORT + 1}`).call('/site/info')).json()).setupNeeded, false, 'setupNeeded 뒤')
    const log = await fs.readFile(path.join(D2, 'logs', 'auth.log'), 'utf8')
    must(/setup · user add · root · repos=\* · role=admin/.test(log), 'auth.log')
    must(!log.includes(j.raw), '원문이 샜다')
    return `코드 ${code.length}자 · 401 · 400 · 200 · 409 · admin · 30일 ${j.expires}`
  } finally {
    S2.kill()
  }
})

// ══ 제품 관리 서비스 — 콘솔 API (TODO ③) ═══════════════════════════════════

// 관리자 — 지금까지 kjsa 는 writer(--write) 였다. 콘솔은 admin 만 들어간다(D4).
await ctx('serve', 'user', 'set', '--auth', F.auth, '--name', 'kjsa', '--role', 'admin', '--data', F.data)
// 앞 검사들이 TK 를 폐기했다(37) — 살아 있는 토큰을 새로 받는다
const TKA = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--note', '콘솔 검증', '--data', F.data)).stdout.trim()
const TQA = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '콘솔 검증', '--data', F.data)).stdout.trim()
await wait(80)
const ADM = (token, extra = {}) => ({ headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(extra.cookie ? { cookie: extra.cookie } : {}) } })
const A = (p, opt = {}) => fetch(`http://127.0.0.1:${PORT}${p}`, { redirect: 'manual', ...opt })
const jbody = (b) => ({ body: JSON.stringify(b) })
let SU = null // 재인증 쿠키

await check(81, '/admin/users — 세션 없음 401 · viewer 403 · admin 200 · 해시 없음', async () => {
  eq((await A('/admin/users')).status, 401, '세션 없음')
  eq((await A('/admin/users', ADM(TQA))).status, 403, 'viewer')
  const r = await A('/admin/users', ADM(TKA))
  eq(r.status, 200, 'admin')
  const j = await r.json()
  must(Array.isArray(j.users) && j.users.some((u) => u.name === 'kjsa' && u.role === 'admin'), '목록')
  must(!JSON.stringify(j).includes('sha256'), '해시가 새지 않는다')
  return `401 · 403 · 200 · 사용자 ${j.users.length}`
})

await check(82, '/admin 쓰기 — 재인증 없음 E_REAUTH · sudo(틀린 · 남의 토큰 401) · 추가 · 중복 409 · 자기 해제 E_SELF · auth.log', async () => {
  const r0 = await A('/admin/users', { method: 'POST', ...ADM(TKA), ...jbody({ name: 'con1', role: 'writer', repos: ['alpha'] }) })
  eq(r0.status, 401, '재인증 없음')
  eq((await r0.json()).error.code, 'E_REAUTH', 'E_REAUTH')
  eq((await A('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: 'wrong' }) })).status, 401, '틀린 토큰')
  eq((await A('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: TQA }) })).status, 401, '남의 토큰')
  const su = await A('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: TKA }) })
  eq(su.status, 200, 'sudo')
  SU = /cdp_su=[^;]*/.exec(su.headers.get('set-cookie') || '')?.[0]
  must(SU, 'cdp_su 쿠키')
  const r1 = await A('/admin/users', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'con1', label: '콘솔 추가', role: 'writer', repos: ['alpha'] }) })
  eq(r1.status, 200, '추가')
  eq((await r1.json()).role, 'writer', 'role')
  eq((await A('/admin/users', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'con1' }) })).status, 409, '중복')
  const self = await A('/admin/users/kjsa', { method: 'PATCH', ...ADM(TKA, { cookie: SU }), ...jbody({ role: 'writer' }) })
  eq(self.status, 400, '자기 해제')
  eq((await self.json()).error.code, 'E_SELF', 'E_SELF')
  const p = await A('/admin/users/con1', { method: 'PATCH', ...ADM(TKA, { cookie: SU }), ...jbody({ repos: ['alpha', 'beta'], label: '콘솔 · 고침' }) })
  eq(p.status, 200, 'PATCH')
  eq((await p.json()).repos, ['alpha', 'beta'], 'repos')
  const log = await fs.readFile(path.join(F.data, 'logs', 'auth.log'), 'utf8')
  const lines = log.trim().split(NL)
  must(/admin user set · kjsa · con1 · /.test(lines[lines.length - 1]), '마지막 줄이 직전 행위: ' + lines[lines.length - 1])
  must(/admin sudo · kjsa/.test(log), 'sudo 기록')
  // 세션 쿠키를 재인증 자리에 내밀어도 통하지 않는다 — kind 가 다르다
  const c = H.cookie()
  if (c) {
    const bad = await A('/admin/users', { method: 'POST', ...ADM(TKA, { cookie: c.replace('cdp_s=', 'cdp_su=') }), ...jbody({ name: 'con2' }) })
    eq(bad.status, 401, '세션 쿠키로 재인증 흉내')
  }
  return 'E_REAUTH · 401 · 401 · sudo · 추가 · 409 · E_SELF · PATCH · auth.log'
})

await check(83, '/admin/tokens — 원문 1회 · 목록에 원문 없음 · reissue 뒤 옛 401 새 200 · 폐기 행이 남는다 · PATCH · revoke', async () => {
  const iss = await A('/admin/tokens', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ user: 'con1', note: '콘솔' }) })
  eq(iss.status, 200, '발급')
  const t1 = await iss.json()
  must(t1.raw && t1.id, '원문 · id')
  eq((await A('/me', { headers: { authorization: 'Bearer ' + t1.raw } })).status, 200, '새 토큰이 산다')
  const list = await (await A('/admin/tokens', ADM(TKA))).json()
  must(!JSON.stringify(list).includes(t1.raw), '목록에 원문')
  must(list.tokens.some((t) => t.id === t1.id && t.status === 'active'), '행')
  const re = await A(`/admin/tokens/${t1.id}/reissue`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })
  eq(re.status, 200, '재발급')
  const t2 = await re.json()
  eq(t2.old, t1.id, 'old')
  eq((await A('/me', { headers: { authorization: 'Bearer ' + t1.raw } })).status, 401, '옛 토큰 401')
  eq((await A('/me', { headers: { authorization: 'Bearer ' + t2.raw } })).status, 200, '새 토큰 200')
  const list2 = await (await A('/admin/tokens', ADM(TKA))).json()
  const oldRow = list2.tokens.find((t) => t.id === t1.id)
  eq(oldRow.status, 'revoked', '폐기 행이 남는다')
  eq(oldRow.revokedBy, 'kjsa', 'revokedBy')
  const pt = await A(`/admin/tokens/${t2.id}`, { method: 'PATCH', ...ADM(TKA, { cookie: SU }), ...jbody({ note: '콘솔 · 메모', expires: 10 }) })
  eq(pt.status, 200, 'PATCH')
  eq((await pt.json()).note, '콘솔 · 메모', 'note')
  const rv = await A(`/admin/tokens/${t2.id}/revoke`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })
  eq(rv.status, 200, '폐기')
  eq((await A('/me', { headers: { authorization: 'Bearer ' + t2.raw } })).status, 401, '폐기 뒤 401')
  eq((await A(`/admin/tokens/${t2.id}/reissue`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })).status, 404, '폐기된 것은 재발급 못 한다')
  return `발급 ${t1.id} → 재발급 ${t2.id} · 원문 0 · 폐기 행 · 404`
})

await check(84, '기본 만료 — admin 30일 · 나머지 90일 · 명시하면 그대로', async () => {
  const day = 86400_000
  const near = (exp, days) => Math.abs(Date.parse(exp) - (Date.now() + days * day)) < 2 * day
  const issue = async (b) => (await A('/admin/tokens', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody(b) })).json()
  const a1 = await issue({ user: 'kjsa', note: '검증 30' })
  must(near(a1.expires, 30), 'admin 30 — ' + a1.expires)
  const v1 = await issue({ user: 'qa', note: '검증 90' })
  must(near(v1.expires, 90), 'viewer 90 — ' + v1.expires)
  const e1 = await issue({ user: 'qa', expiresDays: 7 })
  must(near(e1.expires, 7), '명시 7 — ' + e1.expires)
  for (const t of [a1, v1, e1]) await A(`/admin/tokens/${t.id}/revoke`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })
  return `${a1.expires} · ${v1.expires} · ${e1.expires}`
})

await check(86, '/admin/doctor(캐시) · /admin/server · /admin/repos · /admin/workrepos · /admin/audit · /admin/log · /admin/overview — 모양', async () => {
  const d = await (await A('/admin/doctor', ADM(TKA))).json()
  must(Array.isArray(d.rows) && d.rows.every((r) => ['ok', 'warn', 'fail'].includes(r.state) && r.what), 'doctor 줄')
  must(d.rows.some((r) => r.what === '명부'), '명부 줄')
  const d2 = await (await A('/admin/doctor', ADM(TKA))).json()
  eq(d2.at, d.at, '60초 캐시')
  const sv = await (await A('/admin/server', ADM(TKA))).json()
  must(sv.version && sv.bind && sv.port === PORT && sv.root, 'server 값')
  const rp = await (await A('/admin/repos', ADM(TKA))).json()
  must(rp.repos.some((r) => r.name === 'alpha' && Array.isArray(r.users) && r.users.includes('qa')), '레포 전부 · 볼 수 있는 사람')
  const wrr = await (await A('/admin/workrepos', ADM(TKA))).json()
  must(Array.isArray(wrr.repos) && wrr.repos.every((w) => w.state), '대장 전부')
  const au = await (await A('/admin/audit?limit=5', ADM(TKA))).json()
  eq(au.lines.length, 5, '감사 5줄')
  must(au.total > 5, 'total')
  const lg = await (await A('/admin/log?limit=3', ADM(TKA))).json()
  eq(lg.lines.length, 3, '로그 3줄')
  const ov = await (await A('/admin/overview', ADM(TKA))).json()
  must(ov.users.admins >= 1 && typeof ov.repos.count === 'number' && Array.isArray(ov.alerts), 'overview')
  return `doctor ${d.rows.length}줄(fail ${d.fails}) · server v${sv.version} · repos ${rp.repos.length} · alerts ${ov.alerts.length}`
})

await check(87, 'POST /admin/repos — clone 으로 붙인다 · grant 로 접근을 준다 · 중복 409 · 지식 레포가 아니면 지운다', async () => {
  // 원격 = 서버 안의 alpha 폴더(파일 경로). 실제 clone 이 돈다
  const r = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'gamma', clone: path.join(F.repos, 'alpha'), grant: ['qa'] }) })
  eq(r.status, 200, 'clone')
  const j = await r.json()
  must(j.cloned && j.commit, 'commit')
  eq(j.granted, ['qa'], 'granted')
  const rp = await (await A('/admin/repos', ADM(TKA))).json()
  must(rp.repos.some((x) => x.name === 'gamma' && x.users.includes('qa')), 'qa 가 gamma 를 본다')
  const mine = await (await A('/repos', { headers: { authorization: 'Bearer ' + TQA } })).json()
  must(mine.some((x) => x.name === 'gamma'), 'qa 의 /repos 에 gamma')
  eq((await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'gamma', clone: path.join(F.repos, 'alpha') }) })).status, 409, '중복')
  const bad = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'notrepo', clone: path.join(ROOT, 'ops') }) })
  must(bad.status >= 400, '지식 레포가 아니면 실패')
  must((await fs.stat(path.join(F.repos, 'notrepo')).catch(() => null)) === null, '지웠다')
  return `gamma ${j.commit} · grant qa · 409 · 지움`
})

await check(88, 'v1.1 명부(write:true) 를 서버가 읽으면 writer · admin 으로 올려도 --admin-from 밖이면 403', async () => {
  const A3 = path.join(TMP, 'auth3.json')
  const D3 = path.join(TMP, 'data3')
  const rawOld = 'oldtoken-' + Date.now()
  const { sha256 } = await import(pathToFileURL(path.join(ROOT, 'core/auth.js')).href)
  await fs.writeFile(
    A3,
    JSON.stringify({ users: [{ name: 'old', active: true, repos: ['*'], write: true }], tokens: [{ sha256: sha256(rawOld), user: 'old', issued: '2026-09-01', expires: 'never' }] })
  )
  const S3 = serve(['--root', F.repos, '--port', String(PORT + 2), '--auth', A3, '--data', D3, '--admin-from', '10.0.0.0/8'])
  try {
    await wait(2500)
    const base = `http://127.0.0.1:${PORT + 2}`
    const me = await (await fetch(`${base}/me`, { headers: { authorization: 'Bearer ' + rawOld } })).json()
    eq(me.role, 'writer', 'write:true → writer')
    eq(me.admin, false, 'admin 아님')
    eq((await fetch(`${base}/admin/users`, { headers: { authorization: 'Bearer ' + rawOld } })).status, 403, 'writer 403')
    await ctx('serve', 'user', 'set', '--auth', A3, '--name', 'old', '--role', 'admin')
    await wait(80)
    eq((await fetch(`${base}/admin/users`, { headers: { authorization: 'Bearer ' + rawOld } })).status, 403, 'CIDR 밖')
    eq((await fetch(`${base}/site/info`)).status, 200, '/site/info 는 공개')
    eq((await fetch(`${base}/me`, { headers: { authorization: 'Bearer ' + rawOld } })).status, 200, '/me 는 대역과 무관')
    return 'writer · 403 · admin 뒤 CIDR 403 · info 200'
  } finally {
    S3.kill()
  }
})

// ── 화면 UX 검토 v0.1 (2026-09-24) — 없는 주소 · 권한 밖 레포 ────────────────────────────────
await check(89, '없는 주소 — 브라우저(text/html)면 화면 404+index · JSON 은 지금처럼 401 · 세션이 있어도 화면 · /api 접두는 그대로', async () => {
  const base = `http://127.0.0.1:${PORT}`
  const H0 = http(base)
  const a = await H0.call('/nowhere', { headers: { accept: 'text/html,application/xhtml+xml,*/*;q=0.8' } })
  eq(a.status, 404, 'html 404')
  must((await a.text()).includes('window.__CDP_SERVER__=true'), '화면(index.html)')
  const b = await H0.call('/nowhere')
  eq(b.status, 401, 'json 401 — 에이전트 · API 는 그대로')
  const c = await H.call('/nowhere', { headers: { accept: 'text/html' } })
  eq(c.status, 404, '세션이 있어도 화면')
  must((await c.text()).includes('window.__CDP_SERVER__=true'), '세션 화면')
  eq((await H0.call('/api/alpha/nothing', { headers: { accept: 'text/html' } })).status, 401, '/api 접두는 JSON 401')
  eq((await H0.call('/assets/nothing.js', { headers: { accept: 'text/html' } })).status, 404, '자산은 404 파일 없음')
  return 'html 404+화면 · json 401 · 세션 화면 · /api 401'
})

await check(90, '권한 밖 · 없는 레포 — /r/<x>/ 가 말없이 첫 레포로 가지 않는다 · 둘 다 /r?from=<x> · 그 화면은 200 · /r 는 첫 레포', async () => {
  const base = `http://127.0.0.1:${PORT}`
  const T = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '검증 90', '--data', F.data)).stdout.trim()
  const HQ = http(base)
  const l = await HQ.call('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: T }) })
  eq(l.status, 200, 'qa 로그인')
  const a = await HQ.call('/r/beta/') // qa 는 alpha(+gamma) — beta 는 권한 밖
  eq(a.status, 302, '권한 밖 302')
  eq(a.headers.get('location'), '/r?from=beta', '권한 밖 → /r?from=beta')
  const b = await HQ.call('/r/zeta/') // 없는 레포 — 같은 길(D4)
  eq(b.status, 302, '없는 레포 302')
  eq(b.headers.get('location'), '/r?from=zeta', '없는 레포도 /r?from=')
  const c = await HQ.call('/r?from=beta')
  eq(c.status, 200, '문장 페이지 200')
  must((await c.text()).includes('window.__CDP_SERVER__=true'), '화면')
  const d = await HQ.call('/r')
  eq(d.status, 302, '/r 는 첫 레포로')
  eq(d.headers.get('location'), '/r/alpha/', '첫 레포 alpha')
  return '302 /r?from=beta · 302 /r?from=zeta · 200 · /r → alpha'
})

// ── 화면 · 권한 검토 v0.1 (2026-09-28) — 98~103. 역할 경계 · 첫 페인트 전 테마 · 로그아웃 JSON ────────────────────
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'wr', '--repos', 'alpha', '--role', 'writer', '--data', F.data)
const TW = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'wr', '--note', '검증 98', '--data', F.data)).stdout.trim()
const TV = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '검증 100', '--data', F.data)).stdout.trim()
await wait(80)
const BR = (t) => ({ authorization: 'Bearer ' + t, 'content-type': 'application/json' })

await check(98, 'writer 의 POST /repos → 404 — 레포 화면의 세우기는 「막은 것이 아니라 없는 것」', async () => {
  const r = await A('/repos', { method: 'POST', headers: BR(TW), body: JSON.stringify({ name: 'zz-writer', package: 'dpms' }) })
  eq(r.status, 404, 'writer')
  eq((await A('/repos', { method: 'POST', headers: BR(TKA), body: JSON.stringify({ name: 'zz-admin', package: 'dpms' }) })).status, 404, 'admin 도 — 길은 콘솔 하나')
  must((await fs.stat(path.join(F.repos, 'zz-writer')).catch(() => null)) === null, '아무것도 만들지 않았다')
  return 'writer 404 · admin 404'
})

await check(99, 'writer 의 POST /admin/repos → 403 — 지식 레포를 세우는 것은 admin(콘솔 · 재인증)', async () => {
  eq((await A('/admin/repos', { method: 'POST', headers: BR(TW), body: JSON.stringify({ name: 'zz', package: 'dpms' }) })).status, 403, 'writer')
  eq((await A('/admin/repos', { method: 'POST', headers: BR(TKA), body: JSON.stringify({ name: 'zz', package: 'dpms' }) })).status, 401, 'admin 도 재인증 없이는 401 E_REAUTH')
  return 'writer 403 · admin 재인증 401'
})

await check(100, 'viewer 의 GET /workrepos — users(명부 이름) 없음 · writer 에게만', async () => {
  const v = await (await A('/workrepos', { headers: BR(TV) })).json()
  eq(v.users, [], 'viewer 의 users')
  eq(v.write, false, 'viewer write')
  const w = await (await A('/workrepos', { headers: BR(TW) })).json()
  must(Array.isArray(w.users) && w.users.includes('wr'), 'writer 는 담당자 select 재료를 받는다')
  return `viewer [] · writer ${w.users.length}명`
})

await check(101, 'viewer 의 GET /api/<레포>/git · /git/config → 404 — 서버 모드에 없는 로컬형 문법', async () => {
  eq((await A('/api/alpha/git', { headers: BR(TV) })).status, 404, '/git')
  eq((await A('/api/alpha/git/config', { headers: BR(TV) })).status, 404, '/git/config')
  eq((await A('/api/alpha/git', { headers: BR(TKA) })).status, 404, 'admin 도')
  eq((await A('/api/alpha/repo', { headers: BR(TV) })).status, 200, '읽기 API 는 그대로')
  return '404 · 404 · 404 · /repo 200'
})

await check(102, 'GET /r/<레포>/ 의 index.html — 서버 표식이 <head> 첫 줄 · 인라인 테마 <script> 가 <link rel=stylesheet> 앞', async () => {
  const HV = http(`http://127.0.0.1:${PORT}`)
  eq((await HV.call('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TV }) })).status, 200, '로그인')
  const r = await HV.call('/r/alpha/', { headers: { accept: 'text/html' } })
  eq(r.status, 200, 'status')
  const html = await r.text()
  const head = html.indexOf('<head>')
  const marker = html.indexOf('<script>window.__CDP_SERVER__=true</script>')
  const theme = html.indexOf("localStorage.getItem('cdp.theme')")
  const css = html.indexOf('rel="stylesheet"')
  must(marker === head + '<head>'.length, '표식이 <head> 첫 줄이 아니다')
  must(theme > marker && css > 0 && theme < css, `테마 ${theme} · css ${css}`)
  must(/<meta name="color-scheme" content="light dark"/.test(html), 'color-scheme meta')
  return `표식 @${marker} · 테마 @${theme} · css @${css}`
})

await check(103, 'POST /logout → 200 JSON · 쿠키를 지운다 · GET /logout 302 는 남는다', async () => {
  const HL = http(`http://127.0.0.1:${PORT}`)
  eq((await HL.call('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TV }) })).status, 200, '로그인')
  eq((await HL.call('/me')).status, 200, '세션')
  const r = await fetch(`http://127.0.0.1:${PORT}/logout`, { method: 'POST', headers: { cookie: HL.cookie() }, redirect: 'manual' })
  eq(r.status, 200, 'POST')
  eq((await r.json()).ok, true, 'JSON')
  must(/cdp_s=;|cdp_s=[^;]*;[^,]*Max-Age=0/i.test(r.headers.get('set-cookie') || ''), '쿠키 지움')
  const g = await fetch(`http://127.0.0.1:${PORT}/logout`, { redirect: 'manual' })
  eq(g.status, 302, 'GET 302')
  return 'POST 200 {ok} · 쿠키 지움 · GET 302'
})

// ── 동시 기록 검토 v0.1 (2026-09-25) — 91~97. `--mirror` 서버를 하나 더(PORT + 3) · bare origin · `—` 규칙 ────────────
//
// 판은 fixture 를 `mu` 로 다시 복사해 세운다 — `note:*` → `docs/회의록.md` `—`(문서 전체) 규칙과 `## note` 타입을
// 더한 것만 alpha 와 다르다. 명부는 같은 auth.json(kjsa admin · 새 writer mw).
const MPORT = PORT + 9 // 7386 — PORT+3 은 개발용 서버(7380)와 겹친다
const MROOT = path.join(TMP, 'mirror', 'repos')
const MDATA = path.join(TMP, 'mirror', 'data')
const MU = path.join(MROOT, 'mu')
const MBARE = path.join(TMP, 'mirror', 'origin.git')
await fs.mkdir(MROOT, { recursive: true })
await fs.cp(path.join(ROOT, 'viewer', 'fixture'), MU, { recursive: true })
await fs.appendFile(path.join(MU, '_vocab.md'), NL + '## note' + NL + NL + '- `note:회의` — 회의' + NL)
{
  const m = await fs.readFile(path.join(MU, '_managed.md'), 'utf8')
  await fs.writeFile(path.join(MU, '_managed.md'), m.replace('| `scenario:*` | `docs/테스트시나리오.md` | `## {값}` |', '| `scenario:*` | `docs/테스트시나리오.md` | `## {값}` |' + NL + '| `note:*` | `docs/회의록.md` | `—` |'))
}
await run('git', ['-C', MU, 'init', '-q'])
await run('git', ['-C', MU, 'add', '-A'])
await run('git', ['-C', MU, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'commit', '-qm', 'seed'])
await run('git', ['init', '-q', '--bare', MBARE])
await run('git', ['-C', MU, 'remote', 'add', 'origin', MBARE])
await run('git', ['-C', MU, 'push', '-q', '-u', 'origin', 'HEAD'])
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'mw', '--repos', '*', '--role', 'writer', '--data', F.data)
const TMW = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'mw', '--data', F.data)).stdout.trim()
const SM = serve(['--root', MROOT, '--port', String(MPORT), '--auth', F.auth, '--data', MDATA, '--mirror', '--web', path.join(ROOT, 'ops/out/web')])
await wait(2500)
const HM = http(`http://127.0.0.1:${MPORT}`)
const AM = (p, opt = {}) => fetch(`http://127.0.0.1:${MPORT}${p}`, { redirect: 'manual', ...opt })
const mtool = async (name, args, tk) => payload((await HM.rpc('/mcp/mu', 'tools/call', { name, arguments: { repo: 'mu', ...args } }, tk)).j)
const gitq = (...a) => run('git', ['-C', MU, '-c', 'core.quotepath=false', ...a]).then((r) => r.stdout.trim())
const mrepo = async (tk = TKA) => (await (await AM('/repos', { headers: { authorization: 'Bearer ' + tk } })).json()).find((r) => r.name === 'mu')
// 미러 큐가 끝날 때까지 — `/repos` 의 행이 조건을 만족할 때까지 기다린다(최대 ms). 문자열이면 그 상태(사유까지 실린 뒤)
const untilMirror = async (want, ms = 10000) => {
  const t0 = Date.now()
  const ok = typeof want === 'function' ? want : (r) => r.mirror === want && (want === 'ok' || want === 'off' || !!r.mirrorReason)
  for (;;) {
    const r = await mrepo()
    if (ok(r)) return r
    if (Date.now() - t0 > ms) return r
    await wait(300)
  }
}
let SUM = null

try {
  await check(91, '동시 save 5건(다른 섹션 · Promise.all · --mirror) — 전부 커밋 · 트리 깨끗 · applied 5 · origin = local · 겹친 push 0', async () => {
    const coords = ['api:/adapter/a10/expense-slip', 'api:/adapter/a10/budget-sync', 'api:/rp/project/search', 'table:rp_rsch_prj_mst', 'table:rp_prj_rcpt_mst']
    const secs = await Promise.all(coords.map((c) => mtool('section', { coord: c }, TKA)))
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const out = await Promise.all(
      coords.map((c, i) => mtool('save', { work: { id: `2026-0925-동시-${i + 1}`, title: `동시 ${i + 1}`, date: `2026-09-25 10:0${i}`, touches: [c], body: `동시 기록 ${i + 1}` }, sections: [{ coord: c, applied: secs[i].applied, body: `**정의** 동시 ${i + 1}.` }] }, i % 2 ? TMW : TKA))
    )
    for (const o of out) must(o.commit, JSON.stringify(o.error))
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0 + 5, '커밋 수')
    eq(await gitq('status', '--porcelain'), '', '트리가 더럽다')
    const after = await Promise.all(coords.map((c) => mtool('section', { coord: c }, TKA)))
    for (let i = 0; i < 5; i++) eq(after[i].applied, `2026-0925-동시-${i + 1}`, 'applied ' + coords[i])
    const r = await untilMirror('ok')
    eq(r.mirror, 'ok', 'mirror')
    eq((await run('git', ['-C', MBARE, 'rev-parse', 'HEAD'])).stdout.trim(), await gitq('rev-parse', 'HEAD'), 'origin = local')
    must(!SM.err().includes('cannot lock ref'), 'push 가 겹쳤다')
    const authors = (await gitq('log', '-5', '--format=%an')).split(/\r?\n/).sort().join(',')
    eq(authors, 'kjsa,kjsa,kjsa,mw,mw', '작성자')
    return `커밋 ${n0}→${n0 + 5} · applied 5 · origin = local · mirror ${out.map((o) => o.mirror).join('/')}`
  })

  await check(92, '같은 섹션 둘 동시 — 하나는 E_CONFLICT · detail 에 currentWork(author · date) · content · 문장에 누가 언제', async () => {
    const c = 'api:/adapter/a10/expense-slip'
    const s = await mtool('section', { coord: c }, TKA)
    const [a, b] = await Promise.all(
      [
        [TKA, 'kjsa'],
        [TMW, 'mw'],
      ].map(([tk, u], i) => mtool('save', { work: { id: `2026-0925-같은-${u}`, title: `같은 ${u}`, date: `2026-09-25 11:0${i}`, touches: [c], body: `같은 섹션 ${u}` }, sections: [{ coord: c, applied: s.applied, body: `**정의** ${u} 가 쓴 본문.` }] }, tk))
    )
    const ok = a.commit ? a : b
    const bad = a.commit ? b : a
    must(ok.commit && bad.error, '하나만 성공해야 한다')
    eq(bad.error.code, 'E_CONFLICT', '충돌')
    const d = bad.error.detail
    eq(d.current, ok.id, 'current = 성공한 id')
    must(d.currentWork && ['kjsa', 'mw'].includes(d.currentWork.author) && d.currentWork.date, 'currentWork')
    must(typeof d.content === 'string' && /가 쓴 본문/.test(d.content), 'content')
    must(/로 갱신했다/.test(bad.error.message), '문장')
    eq(await gitq('status', '--porcelain'), '', '트리')
    return `${d.currentWork.author} · ${d.currentWork.date} · content ${d.content.length}자`
  })

  await check(93, '미러 non-ff — 로컬형이 origin 에 먼저 push → save 는 되고 mirror diverged · 사유 non-ff · /repos · overview · doctor · brief · sync 는 rebase 문장으로 거절 · 사람이 rebase 뒤 「다시 보내기」 ok', async () => {
    const C = path.join(TMP, 'mirror', 'clone')
    await run('git', ['clone', '-q', MBARE, C])
    await fs.appendFile(path.join(C, 'README.md'), NL + '로컬형이 origin 에 먼저.' + NL)
    await run('git', ['-C', C, 'add', '-A'])
    await run('git', ['-C', C, '-c', 'user.name=local', '-c', 'user.email=l@x', 'commit', '-qm', '로컬형'])
    await run('git', ['-C', C, 'push', '-q'])
    const s = await mtool('section', { coord: 'table:rp_plnd_mst' }, TMW)
    const o = await mtool('save', { work: { id: '2026-0925-nonff', title: 'non-ff', date: '2026-09-25 12:00', touches: ['table:rp_plnd_mst'], body: 'non-ff 실측' }, sections: [{ coord: 'table:rp_plnd_mst', applied: s.applied, body: '**정의** non-ff.' }] }, TMW)
    must(o.commit, JSON.stringify(o.error))
    must(['diverged', 'queued'].includes(o.mirror), 'mirror ' + o.mirror)
    const r = await untilMirror((x) => x.mirror === 'diverged' && x.mirrorReason === 'non-ff' && x.behind >= 1)
    eq(r.mirror, 'diverged', 'mirror')
    eq(r.mirrorReason, 'non-ff', '사유')
    must(r.ahead >= 1 && r.behind >= 1, `ahead ${r.ahead} behind ${r.behind}`)
    must(/갈라짐/.test(r.note || ''), 'note')
    const brief = await mtool('brief', {}, TMW)
    must(brief.lines.some((l) => /\[CDP\] 미러: .*갈라짐/.test(l)), 'brief 줄: ' + JSON.stringify(brief.lines))
    const sy = await mtool('sync', {}, TMW)
    eq(sy.mirror, 'diverged', 'sync.mirror')
    eq(sy.mirrorReason, 'non-ff', 'sync.mirrorReason')
    must(SM.err().includes('미러 실패 mu: origin 에 서버가 모르는 커밋이 있다'), '로그 사유: ' + SM.err().split(NL).filter((l) => l.includes('미러')).join(' | '))
    const ov = await (await AM('/admin/overview', ADM(TKA))).json()
    must(ov.alerts.some((x) => x.level === 'bad' && /origin 과 갈라진 레포 1/.test(x.text)), 'overview 경고: ' + JSON.stringify(ov.alerts))
    eq(ov.repos.mirror.diverged, 1, 'overview 집계')
    const doc = await (await AM('/admin/doctor?fresh=1', ADM(TKA))).json()
    must(doc.rows.some((x) => x.what === '레포 mu origin' && x.state === 'fail' && /갈라졌다/.test(x.note)), 'doctor origin 줄: ' + JSON.stringify(doc.rows.filter((x) => /mu/.test(x.what))))
    must(doc.rows.some((x) => x.what === '레포 mu push' && /non-ff/.test(x.note)), 'doctor push 줄 사유')
    // 재인증 → 「origin 과 맞추기」 는 갈라져서 거절 · 서버용 문장
    const su = await AM('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: TKA }) })
    eq(su.status, 200, 'sudo')
    SUM = /cdp_su=[^;]*/.exec(su.headers.get('set-cookie') || '')?.[0]
    const sync = await AM('/admin/repos/mu/sync', { method: 'POST', ...ADM(TKA, { cookie: SUM }), ...jbody({}) })
    eq(sync.status, 409, 'sync 거절')
    const sj = await sync.json()
    eq(sj.reason, 'diverged', 'sync.reason')
    must(/pull --rebase/.test(sj.message), 'rebase 문장')
    eq(await gitq('status', '--porcelain'), '', '거절이 트리를 안 만졌다')
    // 사람이 셸에서 rebase → 「다시 보내기」
    await run('git', ['-C', MU, '-c', 'user.name=cdp', '-c', 'user.email=c@x', 'pull', '--rebase', '-q'])
    const push = await AM('/admin/repos/mu/push', { method: 'POST', ...ADM(TKA, { cookie: SUM }), ...jbody({}) })
    eq(push.status, 200, 'push')
    eq((await push.json()).mirror.state, 'ok', 'state')
    eq((await mrepo()).mirror, 'ok', '/repos ok')
    const log = await fs.readFile(path.join(MDATA, 'logs', 'auth.log'), 'utf8')
    must(/admin repo sync · kjsa · mu · fail=diverged/.test(log) && /admin repo push · kjsa · mu · ok/.test(log), 'auth.log')
    return `diverged · non-ff · ahead ${r.ahead} behind ${r.behind} · overview bad · doctor fail · sync 409 → rebase → push ok`
  })

  await check(94, 'origin 만 앞서 있을 때 — doctor warn 「origin 이 앞서 있다」 · 「origin 과 맞추기」 200 pulled 1 · 그 뒤 save · push ok', async () => {
    const C = path.join(TMP, 'mirror', 'clone')
    await run('git', ['-C', C, 'pull', '--rebase', '-q'])
    await fs.appendFile(path.join(C, 'README.md'), '등록부를 밖에서 고쳤다.' + NL)
    await run('git', ['-C', C, 'add', '-A'])
    await run('git', ['-C', C, '-c', 'user.name=local', '-c', 'user.email=l@x', 'commit', '-qm', '밖에서'])
    await run('git', ['-C', C, 'push', '-q'])
    const doc = await (await AM('/admin/doctor?fresh=1', ADM(TKA))).json()
    must(doc.rows.some((x) => x.what === '레포 mu origin' && x.state === 'warn' && /origin 이 앞서 있다/.test(x.note)), 'doctor: ' + JSON.stringify(doc.rows.filter((x) => /mu/.test(x.what))))
    const sync = await AM('/admin/repos/mu/sync', { method: 'POST', ...ADM(TKA, { cookie: SUM }), ...jbody({}) })
    eq(sync.status, 200, 'sync')
    const sj = await sync.json()
    eq(sj.pulled, 1, 'pulled')
    eq(sj.mirror.state, 'ok', 'state')
    must((await fs.readFile(path.join(MU, 'README.md'), 'utf8')).includes('등록부를 밖에서 고쳤다'), '서버 트리에 들어왔다')
    const s = await mtool('section', { coord: 'table:rp_plnd_chg_mst' }, TMW)
    const o = await mtool('save', { work: { id: '2026-0925-맞춘뒤', title: '맞춘 뒤', date: '2026-09-25 13:00', touches: ['table:rp_plnd_chg_mst'], body: '맞춘 뒤' }, sections: [{ coord: 'table:rp_plnd_chg_mst', applied: s.applied, body: '**정의** 맞춘 뒤.' }] }, TMW)
    must(o.commit, JSON.stringify(o.error))
    const r = await untilMirror('ok')
    eq(r.mirror, 'ok', 'mirror 뒤')
    eq((await run('git', ['-C', MBARE, 'rev-parse', 'HEAD'])).stdout.trim(), await gitq('rev-parse', 'HEAD'), 'origin = local')
    return `warn → sync pulled 1 → save ${o.commit} → origin = local`
  })

  await check(95, '더러운 트리 — save 가 E_GIT dirty 로 거절 · /repos dirty · overview bad · doctor fail · 「트리 되돌리기」 → save ok · auth.log', async () => {
    await fs.appendFile(path.join(MU, 'docs', '테이블정의서.md'), NL + '사람이 서버 셸에서 고친 줄' + NL)
    await fs.writeFile(path.join(MU, 'stray.txt'), 'x')
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const bad = await mtool('save', { work: { id: '2026-0925-더러움', title: '더러움', date: '2026-09-25 14:00', body: '더러운 트리' } }, TMW)
    eq(bad.error?.code, 'E_GIT', '거절')
    eq(bad.error.detail.reason, 'dirty', 'reason')
    eq(bad.error.detail.dirty, 2, 'dirty 수')
    must(/트리 되돌리기/.test(bad.error.message), '문장')
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0, '커밋 0')
    eq((await mrepo(TMW)).dirty, 2, '/repos dirty')
    const ov = await (await AM('/admin/overview', ADM(TKA))).json()
    must(ov.alerts.some((x) => x.level === 'bad' && /트리에 커밋 안 된 변경/.test(x.text)), 'overview')
    const doc = await (await AM('/admin/doctor?fresh=1', ADM(TKA))).json()
    must(doc.rows.some((x) => x.what === '레포 mu 트리' && x.state === 'fail'), 'doctor 트리 줄')
    const rs = await AM('/admin/repos/mu/restore', { method: 'POST', ...ADM(TKA, { cookie: SUM }), ...jbody({}) })
    eq(rs.status, 200, 'restore')
    const rj = await rs.json()
    eq(rj.discarded.length, 2, '버린 경로')
    eq(await gitq('status', '--porcelain'), '', '깨끗')
    const ok = await mtool('save', { work: { id: '2026-0925-되돌린뒤', title: '되돌린 뒤', date: '2026-09-25 14:10', body: '되돌린 뒤' } }, TMW)
    must(ok.commit, JSON.stringify(ok.error))
    const log = await fs.readFile(path.join(MDATA, 'logs', 'auth.log'), 'utf8')
    must(/admin repo restore · kjsa · mu · discarded=2/.test(log), 'auth.log')
    return `E_GIT dirty 2 · 커밋 0 · restore 2 · save ${ok.commit}`
  })

  await check(96, '`—`(문서 전체) 규칙 — save 가 문서 머리에 applied 를 쓰고 · section 이 그것을 읽고 · check 통과', async () => {
    const s0 = await mtool('section', { coord: 'note:회의' }, TMW)
    eq(s0.applied, null, '처음은 null')
    eq(s0.anchor, '(문서 전체)', 'anchor')
    const o = await mtool('save', { work: { id: '2026-0925-회의-전체', title: '회의 전체', date: '2026-09-25 15:00', touches: ['note:회의'], body: '회의 기록' }, sections: [{ coord: 'note:회의', applied: null, body: '# 회의록' + NL + NL + '## 9월' + NL + NL + '새 본문 전체.' }] }, TMW)
    must(o.commit, JSON.stringify(o.error))
    const doc = await fs.readFile(path.join(MU, 'docs', '회의록.md'), 'utf8')
    must(doc.startsWith('<!-- applied: 2026-0925-회의-전체 -->'), '머리 주석: ' + doc.slice(0, 60))
    const s1 = await mtool('section', { coord: 'note:회의' }, TMW)
    eq(s1.applied, '2026-0925-회의-전체', 'applied')
    must(!s1.content.includes('applied:'), 'content 에 주석 없음')
    const ck = await mtool('check', {}, TMW)
    eq(ck.errors, 0, 'check')
    return `머리 주석 · applied ${s1.applied} · check 0`
  })

  await check(97, '기록의 흐름 — /admin/overview.saves 에 최근 id · 결과 · 거부 집계(E_CONFLICT · E_GIT) · serve.log 의 save 줄에 id 와 결과', async () => {
    await wait(300)
    const ov = await (await AM('/admin/overview', ADM(TKA))).json()
    must(ov.saves && Array.isArray(ov.saves.recent) && ov.saves.recent.length >= 5, 'recent')
    eq(ov.saves.recent[0].id, '2026-0925-회의-전체', '마지막 id')
    eq(ov.saves.recent[0].result, 'ok', '결과')
    eq(ov.saves.recent[0].user, 'mw', '사람')
    must(ov.saves.rejected24h.E_CONFLICT >= 1 && ov.saves.rejected24h.E_GIT >= 1, '거부 집계: ' + JSON.stringify(ov.saves.rejected24h))
    must(ov.saves.recent.some((s) => s.result === 'E_CONFLICT'), 'recent 에 거부')
    const log = await fs.readFile(path.join(MDATA, 'logs', 'serve.log'), 'utf8')
    must(/· mw · mu · tools\/call · save · 2026-0925-회의-전체 · \d+ms · 200 ·/.test(log), 'serve.log 줄')
    must(/· save · 2026-0925-더러움 · \d+ms · E_GIT ·/.test(log), 'serve.log 거부 줄')
    return `recent ${ov.saves.recent.length} · 거부 ${JSON.stringify(ov.saves.rejected24h)}`
  })
} finally {
  SM.kill()
  await fs.writeFile(path.join(TMP, 'mirror', 'server.stderr.log'), SM.err()).catch(() => {})
}

await check(85, '/login 속도 제한 — 21번째 안에 429 (마지막에 돈다 — 이 뒤로 로그인 없음)', async () => {
  let got = null
  for (let i = 1; i <= 21; i++) {
    const r = await fetch(`http://127.0.0.1:${PORT}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'nope' }), redirect: 'manual' })
    if (r.status === 429) {
      got = i
      break
    }
    must(r.status === 401, `${i}번째 ${r.status}`)
  }
  must(got !== null, '429 가 오지 않았다')
  return `${got}번째에서 429`
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
skip(67, '서버 모드 관리 메뉴 — 현황 · 작업 레포 · 정보 셋(「콘솔」 · 「문서로 돌아가기」 없음)', '브라우저 실측 — 2026-09-28 화면 · 권한 검토 v0.1 R2(TODO 「나온 것」 · kjsa · hong 둘 다 3)')
skip(68, '공통 상단 바 — 표식(→ 소개) · 설명서 · 레포 · 콘솔(관리자) · 이름 · 역할 칩 · 로그아웃 · 얼굴을 넘어도 같은 문서', '브라우저 실측 — 2026-09-28 화면 · 권한 검토 v0.1 R5 · R7(얼굴 순회 navigation 1 · timeOrigin 불변)')
skip(69, '레포 메뉴는 서버 모드에서 항상 — 쓰기/읽기 칩 · 관리자에게 콘솔 › 지식 레포 줄', '6.2 브라우저 실측 — 2026-09-23 확인 (레포 하나여도 메뉴)')

// ── 보고 ────────────────────────────────────────────────────────────────────

results.sort((a, b) => a.n - b.n)
const mark = { ok: '✓', fail: '✗', skip: '–' }
const w = Math.max(...results.map((r) => [...r.label].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)))
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - [...s].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)))

console.log('')
for (const r of results) console.log(` ${mark[r.state]} ${String(r.n).padStart(2)}  ${pad(r.label, w)}  ${r.note}`)

const n = (s) => results.filter((r) => r.state === s).length
console.log('')
console.log(`✓ ${n('ok')}  ✗ ${n('fail')}  – ${n('skip')}   (§10 전체 69줄 + 제품화 70~77 + 제품관리서비스 78~ + 동시 기록 91~97 + 화면 · 권한 98~103)`)
await fs.writeFile(path.join(TMP, 'result.json'), JSON.stringify(results, null, 2))
process.exit(n('fail') ? 1 : 0)
