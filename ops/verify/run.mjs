// 검증 하네스 — v1.0 모델을 한 자리에서 돈다(개편안 docs/design/CDP_v1.0_개편안.md).
//
// 단계마다 실측하며 왔지만 **한 번에 돌린 적이 없었다.** 흩어진 확인은
// 나중에 회귀를 못 잡는다 — 4.3 을 고치다 2단계를 깨도 아무도 모른다.
//
// v1.0 — 쓰기 길은 서버 `save` 하나(I2) · 관리 문서는 큐레이션으로만(I6) · 레포에는 지식만(I9). 작업 레포는 늘
// HTTP MCP(`/mcp/<레포>`)이고 stdio(`ctx mcp`) · 모드 A · 레포 안 훅 · 도구 층 · INDEX · 패키지는 없다.
//
// 번호는 설계서 §10 의 줄 번호에서 시작했고(1~69), 70 이상은 판마다 더한 것이다. **남은 항목의 번호는 바꾸지
// 않는다** — 옛 결과(result.json)와 견줄 수 있게. 자동으로 못 도는 것은 이유를 적고 `skip` 으로 낸다 —
// **조용히 빠지지 않게.**
//
//   node ops/verify/run.mjs [--slow] [--port <n>]
//
// `--slow` 는 60초 갱신처럼 시간이 걸리는 것까지 돈다. 화면 항목(62 · 79 · 89 · 90 · 102)은 `ops/out/web` 이
// 있어야 돈다(`npm run build`) — 없으면 skip 으로 낸다.
//
// ── v1.0 에서 걷은 항목 ─────────────────────────────────────────────────────────────────────────────
//
//   번호   이름                                               무엇이 대신하나
//   11     tools/list 13건 (모드 A · stdio)                    118 역할별 도구 목록(HTTP)
//   12     stdout 규약 밖 바이트 0 (stdio)                     — stdio MCP 가 없다. 133 `ctx mcp` 는 exit 2
//   13     Node 없는 PC: cdp.exe 로 stdio (skip)               — exe · stdio 가 없다(산출물은 서버 tar + 사이트)
//   14     모드 A .mcp.json — cmd /c ctx.cmd mcp              — 작업 레포는 늘 HTTP MCP(104~108 설치 한 줄)
//   15     ctx setup 이 .mcp.json 을 쓰고 도구 13건            106 설치 한 줄 · 126 --curator · 133 `ctx setup` 은 exit 2
//   15.1   inspect() 가 .mcp.json 상태를 낸다 (skip)           — 로컬 뷰어가 없다(개인 서버 131)
//   16     ctx setup --desktop 이 다른 키를 보존 (skip)        — 모드 A 배포물이 없다
//   18     반입 묶음만으로 설치 (skip)                         — win zip · knowledge-repo-* 이 없다
//   38     ctx setup --server 가 kit 을 받아 넣는다            106(설치 한 줄) · 54(CLAUDE.md 보존) · 126(--curator)
//   40     Desktop 의 load prompt · Claude Code 에선 안 보임   5 — HTTP 는 prompt 를 늘 낸다(clientInfo 분기는 stdio 의 것)
//   109    ctx serve kit-refresh — 레포의 도구 층을 이 판으로   56 · 57 · 108(kit 은 서버 번들에서) · 133 kit-refresh 는 exit 2
//
// ── v1.0 으로 바꾼 항목(번호는 그대로) ───────────────────────────────────────────────────────────────
//
//   1~10 · 17 · 19 · 20 · 5   stdio 클라이언트 → HTTP MCP. 19 · 20 은 옛 sync · version 도구 대신 brief 의 sync · built
//   21                        viewer 의 save 는 E_FORBIDDEN 이 아니라 도구 자체가 없다(역할에 없는 도구는 보이지 않는다)
//   28                        save(writer) — 기록만 · INDEX · 등록부 사본 없음 · 대기열 · section 의 미반영 본문
//   29 · 76                   섹션은 큐레이터가 쓴다(cur) · 30 은 「이 save 가 만든 오류」(V21)로
//   41 · 72                   도구 14 → writer 10 · 큐레이터 12
//   54 · 57 · 55              설치 한 줄로 · brief.sync.kit 이 서버 kit 을 따른다
//   56 · 108                  kit 은 서버 번들(--kit)에서 — 바꾸면 대장 「낡음」 → --update
//   70 · 74                   패키지 → 서식집(/api/<r>/forms · lintForm)
//   71~73                     패키지 붓기 → 빈 틀(ctx repo new) · 첫 기록은 writer 가
//   91~97 · 110 · 114 · 115   섹션 · 등록부 · edits · drop 은 큐레이터(mw) · writer(mx)는 E_FORBIDDEN · 93 의 sync → brief.sync
//   112 · 116                 첨부는 writer 가 기록과 함께(섹션 없이)
//
// ── v1.0 에서 더한 항목 ─────────────────────────────────────────────────────────────────────────────
//
//   118 역할별 도구 · 119 writer 의 큐레이터 입력 E_FORBIDDEN · 120 큐레이션 save · 121 queue · forms 도구
//   122 원래 있던 오류는 막지 않는다(V21) · 123 POST /curate · 124 기준선 push · 125 /kit 역할별 · 126 --curator
//   127 POST /admin/repos 빈 틀 · 128 다시 세우기 · 129 · 130 ctx migrate · 131 개인 서버 · 132 doctor kit · forms
//   133 없앤 CLI 명령 exit 2 · 134 /admin/users curate · 135 작업 레포 kit 은 누가 깔든 writer · 136 save 는 훅을 안 돈다
//   137 기준선 extract → push(다시 세운 레포의 출발점) · 138 팀 서식(<data>/forms) · lint · ctx forms check

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { fileURLToPath, pathToFileURL } from 'node:url'

const run = promisify(execFile)
const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '../..')
const TMP = path.join(ROOT, 'ops', 'out', 'verify')
const WEB = path.join(ROOT, 'ops', 'out', 'web')
const FORMS = path.join(ROOT, 'agent', 'forms')
const SLOW = process.argv.includes('--slow')
// 포트는 인자로 받는다 — CI 러너에서 7377 이 쓰이고 있을 수 있다.
const PORT_ARG = process.argv.indexOf('--port')
const PORT = PORT_ARG >= 0 ? Number(process.argv[PORT_ARG + 1]) || 7377 : 7377
const NL = String.fromCharCode(10)

// 자식 프로세스의 환경 — **이 PC 의 CDP 설정을 물려주지 않는다.** 설치 한 줄을 쓴 PC 에는 사용자 환경변수
// CDP_TOKEN 이 있고(진짜 서버의 것), CDP_KIT · CDP_FORMS 가 있으면 서버가 kit · 서식집을 엉뚱한 데서 읽는다.
// 필요한 값은 항목마다 명시한다.
const BASE_ENV = (() => {
  const e = { ...process.env }
  for (const k of ['CDP_TOKEN', 'CDP_KIT', 'CDP_FORMS', 'CDP_REPO', 'CDP_CONFIG_DIR']) delete e[k]
  // 설치기의 --commit 은 그 PC 의 git 신원으로 커밋한다 — CI 러너에는 user.name 이 없어 108 이 거절됐다. 시험용 신원을 준다
  for (const [k, v] of [['GIT_AUTHOR_NAME', 'harness'], ['GIT_AUTHOR_EMAIL', 'h@x'], ['GIT_COMMITTER_NAME', 'harness'], ['GIT_COMMITTER_EMAIL', 'h@x']]) e[k] = e[k] || v
  return e
})()

const results = []
const T0 = Date.now()
// 끝난 항목은 바로 stderr 에 한 줄 — 부하 걸린 기계에서는 한 바퀴가 수십 분이다. 중간에 끊겨도 어디까지 왔는지 남는다
const rec = (n, label, state, note = '') => {
  results.push({ n, label, state, note })
  process.stderr.write(`[${Math.round((Date.now() - T0) / 1000)}s] ${{ ok: '✓', fail: '✗', skip: '–' }[state]} ${n} ${label.slice(0, 40)} · ${String(note).slice(0, 200)}${NL}`)
}

// 항목 하나의 상한 — 걸린 항목 하나가 하네스 전체를 붙잡지 않게. 부하 걸린 기계에서 save 하나가 30초를 넘긴 적이 있어 넉넉히
const CHECK_MAX_MS = 15 * 60 * 1000

async function check(n, label, fn) {
  try {
    let timer
    const note = await Promise.race([fn(), new Promise((_, no) => (timer = setTimeout(() => no(new Error(`${CHECK_MAX_MS / 60000}분 안에 끝나지 않았다`)), CHECK_MAX_MS)))]).finally(() => clearTimeout(timer))
    rec(n, label, 'ok', note || '')
  } catch (e) {
    // execFile 의 실패는 첫 줄이 `Command failed: <명령>` 뿐이다 — 사유는 stderr 에 있다(2026-09-30 93 이 그것만 남겼다).
    // fetch 의 실패는 `fetch failed` 뿐이다 — 사유는 cause 에 있다(2026-10-07 115)
    const why = String(e?.stderr || '').split(NL).map((l) => l.trim()).find(Boolean) || (e?.cause ? `${e.cause.code || ''} ${e.cause.message || ''}`.trim() : '')
    rec(n, label, 'fail', String(e?.message || e).split(NL)[0].slice(0, 160) + (why ? ' — ' + why.slice(0, 160) : ''))
  }
}
const skip = (n, label, why) => rec(n, label, 'skip', why)

function must(cond, msg) {
  if (!cond) throw new Error(msg)
}
const eq = (a, b, msg) => must(JSON.stringify(a) === JSON.stringify(b), `${msg} — ${JSON.stringify(a)} ≠ ${JSON.stringify(b)}`)
const exists = (p) => fs.access(p).then(() => true, () => false)

// v1.1 스킬 여섯(개편안 §6.1 + cdp-rebuild)과 SKILL.md 줄 수 상한 — 111 · 117 이 보고, 설치 항목(106 · 125 · 126)은 깔린 것이 이 안에 있는지 본다.
// writer 몫은 work · save · push — 역할별 kit(W5)이라 작업 레포에는 그 셋만 간다
const SKILL_LINES = { 'cdp-curate': 350, 'cdp-push': 180, 'cdp-rebuild': 200, 'cdp-registry': 200, 'cdp-save': 300, 'cdp-work': 250 }
const SKILL_SET = Object.keys(SKILL_LINES)
const WRITER_SKILLS = ['cdp-push', 'cdp-save', 'cdp-work']
const kitSkillsOk = (names) => WRITER_SKILLS.every((n) => names.includes(n)) && names.every((n) => SKILL_SET.includes(n))
// 레포 안의 옛 도구 층(core/migrate.js TOOL_LAYER) — v1.0 레포에는 없어야 한다(I9)
const TOOL_LAYER = ['bin', '.githooks', '.claude', 'tools', 'MANUAL.md', 'MANUAL-관리자.md', 'MANUAL-시스템.md', 'CLAUDE.md', 'TEMPLATE-work.md', 'INDEX.md', 'INDEX-by-coord.md']
// 새 지식 레포의 빈 틀(core/skeleton.js) — git 이 추적하는 것 전부
const SKELETON = ['.gitattributes', '.gitignore', 'README.md', '_managed.md', '_vocab.md', 'docs/.gitkeep', 'work/.gitkeep']

// ── 판 ──────────────────────────────────────────────────────────────────────

const gitc = (cwd, ...a) => run('git', ['-C', cwd, '-c', 'user.name=h', '-c', 'user.email=h@x', '-c', 'core.quotepath=false', ...a], { encoding: 'utf8' })
const commits = async (cwd) => Number((await run('git', ['-C', cwd, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (cwd) => (await run('git', ['-C', cwd, 'status', '--porcelain'])).stdout.trim()
const headFiles = async (cwd) => (await gitc(cwd, 'show', '--name-only', '--format=', 'HEAD')).stdout.split(/\r?\n/).filter(Boolean)
const hooksPath = (cwd) => run('git', ['-C', cwd, 'config', '--get', 'core.hooksPath']).then((r) => r.stdout.trim(), () => '')

// 지식 레포 하나를 git 으로 — save 가 커밋한다
async function gitRepo(dir) {
  await run('git', ['-C', dir, 'init', '-q'])
  await run('git', ['-C', dir, 'config', 'core.autocrlf', 'false'])
  await run('git', ['-C', dir, 'add', '-A'])
  await run('git', ['-C', dir, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'commit', '-qm', 'seed'])
}

async function stage() {
  await fs.rm(TMP, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  await fs.mkdir(TMP, { recursive: true })
  // 표본 레포는 지식만 있다(v1.0 I9 · e4a0383) — 도구 층 · 스킬 사본을 심지 않는다. kit 은 서버 번들(--kit)에서 나간다
  const src = path.join(ROOT, 'viewer', 'fixture')
  for (const n of ['alpha', 'beta']) {
    await fs.cp(src, path.join(TMP, 'repos', n), { recursive: true })
    await gitRepo(path.join(TMP, 'repos', n))
  }
  // 빈 폴더 — 레포가 아니다(무시돼야 한다)
  await fs.mkdir(path.join(TMP, 'repos', '빈폴더'), { recursive: true })
  // 서버 번들의 kit/ — 산출물을 만드는 그 함수로(ops/lib/bundle-files.mjs). 하네스가 판을 올려 볼 수 있게 사본을 서버의
  // --kit 으로 준다(56 · 108). 원본(agent/)은 건드리지 않는다
  const kit = path.join(TMP, 'kit')
  const { copyKit } = await import(pathToFileURL(path.join(ROOT, 'ops/lib/bundle-files.mjs')).href)
  const k = copyKit(ROOT, kit)
  if (k.missing.length) throw new Error('kit 원본이 없다 — ' + k.missing.join(' · '))
  // 팀 서식 — 서버의 데이터 폴더 `<data>/forms/<묶음>/`(upgrade 가 덮지 않는 자리). 좋은 것 하나 · 깨진 것 하나(138).
  // 서버는 서식집을 한 번 읽고 들고 있다 — 서버가 뜨기 **전에** 둔다
  const team = path.join(TMP, 'data', 'forms', 'team-x')
  await fs.mkdir(team, { recursive: true })
  await fs.writeFile(path.join(team, '_묶음.json'), JSON.stringify({ name: 'team-x', title: '팀 서식(하네스)', version: '0.1.0', description: '하네스가 심은 팀 서식 — 좋은 것 하나 · 깨진 것 하나' }, null, 2) + NL)
  await fs.writeFile(
    path.join(team, 'T_001_시험대장.md'),
    ['---', 'form: team-x/T_001', 'title: 시험대장', 'number: T_001', 'due: 착수', 'required: false', 'kind: 대장', 'registry:', '  - { pattern: "시험대장:*", anchor: "## {값}" }', 'coordValue: 시험 id', '---', '<!-- form:head -->', '팀이 직접 만든 서식 — 시험 하나가 섹션 하나다.', '', '<!-- form:guide -->', '**무엇** — 시험마다 목적과 결과를 적는다.', '', '<!-- form:example -->', '로그인 시험 — 목적 · 결과 · 확인한 날.', ''].join(NL)
  )
  // 깨진 것 — 제출시기 · 종류가 없고 머리(head)에 섹션 제목이 들어갔다
  await fs.writeFile(
    path.join(team, 'T_002_깨진서식.md'),
    ['---', 'form: team-x/T_002', 'title: 깨진서식', 'number: T_002', 'required: false', '---', '<!-- form:head -->', '## 섹션이 머리에 들어갔다', '', '<!-- form:guide -->', '지침.', '', '<!-- form:example -->', '예시.', ''].join(NL)
  )
  return { repos: path.join(TMP, 'repos'), data: path.join(TMP, 'data'), auth: path.join(TMP, 'auth.json'), kit }
}

const ctx = (...args) =>
  run(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), ...args], {
    cwd: ROOT,
    env: BASE_ENV,
    encoding: 'utf8',
    maxBuffer: 64e6,
  })

// 종료 코드를 보는 CLI 호출 — 던지지 않는다. `timeout` 을 넘기면 죽이고 `killed`
function cli(args, { env = {}, timeout = 120000, cwd = ROOT } = {}) {
  return new Promise((resolve) => {
    execFile(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), ...args], { cwd, env: { ...BASE_ENV, ...env }, encoding: 'utf8', maxBuffer: 64e6, timeout, windowsHide: true }, (e, stdout, stderr) =>
      resolve({ code: e ? (typeof e.code === 'number' ? e.code : null) : 0, killed: !!e?.killed, stdout: String(stdout || ''), stderr: String(stderr || '') })
    )
  })
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

// fetch 한 번 — 소켓이 응답 전에 닫히면(유휴 keep-alive 소켓을 서버가 닫는 순간 다시 썼다 · 부하 걸린 기계에서 잦다) 한 번 더
// 보낸다. 요청이 서버에 닿기 전에 끊긴 것이라 다시 보내도 같은 일을 두 번 하지 않는다(2026-10-07 — 115 가 서버 로그 없이
// `fetch failed`). 상한 초과로 서버가 끊는 것(32 · 112)은 그 항목이 따로 다시 보낸다
async function fetchR(url, opt) {
  for (let i = 0; ; i++) {
    try {
      return await fetch(url, opt)
    } catch (e) {
      if (i >= 1 || !/fetch failed/.test(String(e?.message)) || !/UND_ERR_SOCKET|ECONNRESET|EPIPE/.test(String(e?.cause?.code || ''))) throw e
      await new Promise((r) => setTimeout(r, 300))
    }
  }
}

function http(base) {
  let cookie = null
  const call = async (p, opt = {}) => {
    const h = { ...(opt.headers || {}) }
    if (cookie && !h.cookie) h.cookie = cookie
    const r = await fetchR(base + p, { ...opt, headers: h, redirect: 'manual' })
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

function serve(args, { env = {} } = {}) {
  const p = spawn(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), 'serve', ...args], {
    cwd: ROOT,
    env: { ...BASE_ENV, ...env },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  let err = ''
  let out = ''
  p.stderr.on('data', (d) => (err += d.toString('utf8')))
  p.stdout.on('data', (d) => (out += d.toString('utf8')))
  return { p, err: () => err, out: () => out, kill: () => p.kill() }
}

const wait = (ms) => new Promise((r) => setTimeout(r, ms))
// 화면 API(`/api/<r>/…`)는 Store 를 읽는다 — MCP save 뒤 서버가 Store 를 다시 읽는 것을 기다리지 않고 답한다(saver 의
// `store.reload` 는 기다리지 않는다). save 직후 읽는 자리는 조건이 맞을 때까지 잠깐 다시 묻는다
async function until(fn, ok, ms = 30000) {
  for (const t0 = Date.now(); ; await wait(200)) {
    const v = await fn()
    if (ok(v) || Date.now() - t0 > ms) return v
  }
}
// 서버가 떴나 — 2.5초를 기다리고, 그래도 안 받으면 받을 때까지(최대 120초). 부하 걸린 기계에서 `--mirror` 서버가
// 2.5초 안에 못 떠 91~97 이 전부 `fetch failed` 로 넘어졌다(2026-09-30 하네스). 응답이면 무엇이든 떴다는 뜻이다.
async function ready(port, ms = 120000) {
  await wait(2500)
  for (const t0 = Date.now(); Date.now() - t0 < ms; await wait(300)) {
    if (await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' }).then(() => true, () => false)) return
  }
}

// ── 본체 ────────────────────────────────────────────────────────────────────

const F = await stage()
const KIT = F.kit
const WEB_OK = await exists(path.join(WEB, 'index.html'))
const NO_WEB = 'ops/out/web 없음 — npm run build 먼저(화면 index.html 이 있어야 표식 · 테마를 본다)'
const { kitOf } = await import(pathToFileURL(path.join(ROOT, 'core/setup.js')).href)
const { loadRepo } = await import(pathToFileURL(path.join(ROOT, 'core/repo.js')).href)
const { recordKind } = await import(pathToFileURL(path.join(ROOT, 'core/curation.js')).href)

// 명부 — v0.x 의 셋(kjsa writer · qa · ghost viewer)에 v1.0 의 둘을 더한다:
//   cur  writer · alpha · beta · delta 를 보고 **alpha · delta 의 큐레이터**(beta 는 아니다 — 레포별 권한 V2)
//   wr   writer · alpha — 기록만 쓴다
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'kjsa', '--label', '사경진', '--repos', '*', '--write', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'qa', '--repos', 'alpha', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'ghost', '--repos', 'alpha', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'cur', '--repos', 'alpha,beta,delta', '--role', 'writer', '--curate', 'alpha,delta', '--data', F.data)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'wr', '--repos', 'alpha', '--role', 'writer', '--data', F.data)
const TK = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--data', F.data)).stdout.trim()
const TK2 = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--note', '둘째', '--data', F.data)).stdout.trim()
const TQ = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--data', F.data)).stdout.trim()
const TG = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'ghost', '--data', F.data)).stdout.trim()
const TC = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'cur', '--data', F.data)).stdout.trim()
const TW = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'wr', '--data', F.data)).stdout.trim()

const S = serve(['--root', F.repos, '--port', String(PORT), '--auth', F.auth, '--data', F.data, '--web', WEB, '--kit', KIT])
await ready(PORT)
const BASE = `http://127.0.0.1:${PORT}`
const H = http(BASE)
// MCP 도구 한 번 — 결과(또는 { error })
const M = async (p, name, args, tk) => payload((await H.rpc(p, 'tools/call', { name, arguments: args }, tk)).j)
const toolNames = async (tk, p = '/mcp/alpha') => (await H.rpc(p, 'tools/list', {}, tk)).j?.result?.tools?.map((t) => t.name).sort() || []
const bearer = (t) => ({ headers: { authorization: 'Bearer ' + t } })
const apiJson = async (p, t) => (await H.call(p, bearer(t))).json()

// ══ 공통 — HTTP MCP(옛 stdio 항목을 서버 MCP 로) ══════════════════════════════

await check(1, 'HTTP MCP tools/call 결과가 ctx --json 과 바이트까지 같다 (where · match · check · search · docs)', async () => {
  const R = path.join(F.repos, 'alpha')
  const cases = [
    ['where', ['where', 'api:/adapter/a10/expense-slip'], { coord: 'api:/adapter/a10/expense-slip', limit: 50 }],
    ['match', ['match', 'api:/adapter/a10/expense-slip', '결의서'], { names: ['api:/adapter/a10/expense-slip', '결의서'] }],
    ['check', ['check'], {}],
    ['search', ['search', '결의서', '계획서'], { words: ['결의서', '계획서'], limit: 50 }],
    ['docs', ['docs'], {}],
  ]
  const strip = (v) => (Array.isArray(v) ? v.map(({ repo, ...x }) => x) : (({ repo, ...x }) => x)(v))
  for (const [name, argv, targs] of cases) {
    const c = await cli(['--repo', R, ...argv, '--json'])
    const A = JSON.stringify(JSON.parse(c.stdout))
    const B = JSON.stringify(strip(await M('/mcp/alpha', name, { repo: 'alpha', ...targs }, TK)))
    must(A === B, `${name} 불일치 — CLI ${A.length}자 · MCP ${B.length}자`)
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
    const d = await M('/mcp/alpha', tool, { repo: 'alpha', ...args }, TK)
    eq(d.error?.code, code, `${tool} ${JSON.stringify(args)}`)
  }
  return '4가지'
})

await check(3, '서버가 도는 중 work/ 에 파일이 생기면 다음 호출이 본다(캐시 스탬프)', async () => {
  const before = (await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK)).works
  await fs.writeFile(
    path.join(F.repos, 'alpha', 'work', '2026-0921-스탬프-재스캔.md'),
    '---\nid: 2026-0921-스탬프-재스캔\ntitle: 재스캔\ndate: 2026-09-21 10:00\nauthor: t\ntouches: []\n---\n\n# 재스캔\n\n본문\n'
  )
  await wait(50)
  const after = (await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK)).works
  must(after === before + 1, `${before} → ${after}`)
  // **치우고 나간다.** 안 치우면 뒤의 save 검사가 "트리가 더럽다" 로 죽는다 —
  // 검사가 검사를 깨뜨리면 무엇이 진짜 실패인지 알 수 없다.
  await gitc(path.join(F.repos, 'alpha'), 'add', '-A')
  await gitc(path.join(F.repos, 'alpha'), 'commit', '-qm', '재스캔 확인')
  await wait(50)
  return `${before} → ${after}`
})

await check(4, '명함 · instructions 토큰 비용 실측 (writer 10장 · 큐레이터 12장 · 레포 1 → 2)', async () => {
  const cards = async (tk) => (await H.rpc('/mcp/alpha', 'tools/list', {}, tk)).j.result.tools.reduce((a, t) => a + t.description.length, 0)
  const ins = async (tk) => (await H.rpc('/mcp/alpha', 'initialize', INIT(), tk)).j?.result?.instructions?.length ?? 0
  const w = await cards(TK)
  const c = await cards(TC)
  const i1 = await ins(TQ) // qa 는 alpha 하나만 본다
  const i2 = await ins(TK) // kjsa 는 alpha · beta
  must(w > 0 && c > w && i1 > 0 && i2 > i1, `명함 ${w} · ${c} · instructions ${i1} · ${i2}`)
  // 한글은 대략 1자 ≈ 1토큰, 영문·기호는 더 싸다. 보수적으로 자 수로 적는다.
  return `명함 writer ${w}자 · 큐레이터 ${c}자 (+${c - w}) · instructions 레포1 ${i1}자 → 레포2 ${i2}자 (+${i2 - i1})`
})

await check(6, 'tools: 제한 에이전트가 Bash 없이 where 를 부른다 (HTTP MCP 하나)', async () => {
  // 하네스가 에이전트를 띄울 수는 없다. **도구가 셸 없이 성립하는가**를 본다 — 작업 레포의 .mcp.json 은 서버 주소
  // 하나(HTTP)이고 도구 호출에 셸이 끼지 않는다.
  const d = await M('/mcp/alpha', 'where', { repo: 'alpha', coord: 'api:/adapter/a10/expense-slip' }, TK)
  must(d.section?.doc, 'where 가 섹션을 못 냈다')
  must(['ok', 'pending', 'missing'].includes(d.section.state), 'state ' + d.section.state)
  return `HTTP · 셸 없음 · state ${d.section.state}`
})

await check(7, 'repo 를 생략하면 이 연결(/mcp/<레포>)의 기본 레포로 답한다', async () => {
  const d = await M('/mcp/alpha', 'brief', {}, TK)
  eq(d.repo, 'alpha', '기본 레포')
  return 'repo=alpha (/mcp/alpha)'
})

await check(9, '두 레포에 같은 좌표 → match 가 둘 다 낸다 (/mcp · repo 없이)', async () => {
  const rows = await M('/mcp', 'match', { names: ['api:/adapter/a10/expense-slip'] }, TK)
  must(Array.isArray(rows) && rows.length === 2, `${rows.length}건`)
  eq(rows.map((r) => r.repo).sort(), ['alpha', 'beta'], 'repo 둘')
  return '둘 다 보고'
})

await check(10, '`..` 이 든 repo 값 → 거절', async () => {
  const d = await M('/mcp/alpha', 'brief', { repo: '../밖' }, TK)
  eq(d.error?.code, 'E_REPO', 'repo 탈출')
  return 'E_REPO'
})

await check(17, '/mcp/<레포> 의 repos — 볼 수 있는 레포 전부 · 그 레포가 default', async () => {
  const rows = await M('/mcp/alpha', 'repos', {}, TK)
  eq(rows.map((r) => r.name), ['alpha', 'beta'], '레포 목록')
  eq(rows.find((r) => r.default)?.name, 'alpha', 'default')
  return 'alpha · beta · default alpha'
})

await check(19, 'git 원격 없는 레포 — brief 의 sync 가 mirror off 로 답한다 (옛 sync 도구를 흡수)', async () => {
  const b = await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK)
  must(b.sync && typeof b.sync === 'object', 'brief 에 sync 가 없다')
  eq(b.sync.mode, 'server', 'mode')
  eq(b.sync.mirror, 'off', 'mirror')
  must(/^[0-9a-f]{7,}$/.test(b.sync.head || ''), 'head ' + b.sync.head)
  must(b.sync.kit?.hash && Array.isArray(b.sync.kit.skills), 'sync.kit')
  return `mirror off · head ${b.sync.head} · kit ${b.sync.kit.hash}`
})

await check(20, '번들 나이 — CLI brief --built-at 90일 경과 줄 · MCP brief 가 built 를 낸다 (옛 version 도구를 흡수)', async () => {
  const c = await ctx('--repo', path.join(F.repos, 'alpha'), 'brief', '--built-at', '2026-01-01 00:00')
  must(/번들이 \d+일 됐다/.test(c.stdout), 'CLI brief 에 줄이 없다 — ' + c.stdout.slice(0, 120))
  const b = await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK)
  must('built' in b && b.built, 'built 없음')
  // 소스로 도는 서버는 번들 시각이 자리표시자다 — 나이 줄이 없어야 한다(번들이 아닌 것을 낡았다고 하지 않는다)
  must(!b.lines.some((l) => /번들이 \d+일/.test(l)), '소스 실행에 나이 줄')
  return `CLI ${c.stdout.split(NL).find((l) => /번들이/.test(l)).slice(0, 30)}… · MCP built ${b.built}`
})

await check(5, 'HTTP prompts — load · brief 둘 · load 가 스킬(cdp-work)과 where · section 을 싣는다', async () => {
  const l = await H.rpc('/mcp/alpha', 'prompts/list', {}, TK)
  const names = (l.j?.result?.prompts || []).map((p) => p.name).sort()
  eq(names, ['brief', 'load'], 'prompts')
  const g = await H.rpc('/mcp/alpha', 'prompts/get', { name: 'load', arguments: { coord: 'api:/adapter/a10/expense-slip' } }, TK)
  const text = g.j?.result?.messages?.[0]?.content?.text || ''
  must(text.includes('## alpha · api:/adapter/a10/expense-slip') && text.includes('### section'), text.slice(0, 120))
  must(!text.includes('스킬 파일을 찾지 못했다'), '스킬을 못 찾았다')
  return `load ${text.length}자 · brief`
})

// ══ 서버 — 명부 · 토큰 · 권한 ═══════════════════════════════════════════════

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

await check(21, '토큰 없음/무효 401 · 권한 밖 · viewer 에게는 save 가 없다(목록에 없고 부르면 도구 없음)', async () => {
  eq((await H.rpc('/mcp/alpha', 'tools/list', {})).status, 401, '토큰 없음')
  eq((await H.rpc('/mcp/alpha', 'tools/list', {}, 'nonsense')).status, 401, '무효')
  const outside = await M('/mcp', 'brief', { repo: 'beta' }, TQ)
  eq(outside.error?.code, 'E_REPO', '권한 밖 레포는 없는 것')
  // v1.0 §5.3 — 역할에 없는 도구는 보이지도 않는다. 등록되지 않은 도구를 부르면 SDK 가 도구 없음으로 답한다
  must(!(await toolNames(TQ)).includes('save'), 'viewer 의 목록에 save 가 있다')
  const w = await H.rpc('/mcp', 'tools/call', { name: 'save', arguments: { repo: 'alpha', work: { id: '2026-0921-권한', title: 'x', date: '2026-09-21 10:00', body: '본문' } } }, TQ)
  must(w.j?.error || w.j?.result?.isError, 'viewer 가 save 를 불렀다 — ' + String(w.raw).slice(0, 120))
  must(!(await exists(path.join(F.repos, 'alpha', 'work', '2026-0921-권한.md'))), '기록이 생겼다')
  return '401 · 401 · E_REPO · viewer 목록에 save 없음 · 부르면 도구 없음'
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
  eq(rows.map((r) => r.name).sort(), ['cur', 'kjsa'], 'beta 를 볼 사람')
  must(rows.find((r) => r.name === 'cur')?.curate?.includes('alpha'), 'curate 가 목록에 없다')
  return 'beta → cur · kjsa (cur 의 curate alpha · delta)'
})

await check(27, 'auth.log 에 남고 원문 토큰은 없다', async () => {
  const log = await fs.readFile(path.join(F.data, 'logs', 'auth.log'), 'utf8')
  must(/user add · kjsa/.test(log), 'user add 기록 없음')
  must(/token issue · kjsa/.test(log), 'token issue 기록 없음')
  for (const t of [TK, TK2, TQ, TG, TC, TW]) must(!log.includes(t), '원문 토큰이 샜다')
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
  const rows = await (await H.call('/repos', bearer(TK))).json()
  must(rows.every((r) => 'mirror' in r && 'head' in r), '필드 없음')
  return rows.map((r) => `${r.name}:${r.mirror}`).join(' ')
})

await check(42, 'repos 가 권한 밖 레포를 안 낸다', async () => {
  const mine = await M('/mcp', 'repos', {}, TQ)
  eq(mine.map((r) => r.name), ['alpha'], 'qa 의 목록')
  return 'qa → alpha 만'
})

await check(41, 'POST /mcp 와 /mcp/<name> 이 같은 도구 목록 (writer 10)', async () => {
  const a = await toolNames(TK, '/mcp')
  const b = await toolNames(TK, '/mcp/alpha')
  eq(a, b, '도구 목록')
  eq(a.length, 10, 'writer 는 10건')
  return '10건 동일'
})

await check(118, '역할별 도구 목록 — viewer 9(save 없음) · writer 10(queue · forms 없음) · 큐레이터 14 · derive · apply · sync · version 은 없다', async () => {
  const BASE10 = ['brief', 'check', 'docs', 'match', 'repos', 'save', 'search', 'section', 'where', 'work']
  eq(await toolNames(TQ), BASE10.filter((t) => t !== 'save'), 'viewer')
  eq(await toolNames(TW), BASE10, 'writer')
  eq(await toolNames(TC), [...BASE10, 'drift', 'forms', 'queue', 'source'].sort(), '큐레이터')
  for (const gone of ['derive', 'apply', 'sync', 'version']) {
    const r = await H.rpc('/mcp/alpha', 'tools/call', { name: gone, arguments: {} }, TC)
    must(r.j?.error || r.j?.result?.isError, `${gone} 가 아직 불린다`)
  }
  // 명함도 역할별 — writer 의 save 는 기록만, 큐레이터의 save 는 판정 · 섹션을 말한다
  const card = async (tk) => (await H.rpc('/mcp/alpha', 'tools/list', {}, tk)).j.result.tools.find((t) => t.name === 'save').description
  must(/E_FORBIDDEN/.test(await card(TW)) && /큐레이터의 save/.test(await card(TC)), 'save 명함이 역할과 맞지 않는다')
  return 'viewer 9 · writer 10 · 큐레이터 14 · 옛 넷 없음 · save 명함 둘'
})

await check(113, 'docs 도구 — 관리 문서 목록 · 등록부 여부 / match 의 문서 이름 대조 / brief({ repo }) 가 이 연결의 기본 레포와 다르면 경고', async () => {
  const d = await M('/mcp/alpha', 'docs', { repo: 'alpha' }, TK)
  must(d.total > 0 && d.docs.every((x) => typeof x.registered === 'boolean'), JSON.stringify(d).slice(0, 200))
  const m = await M('/mcp/alpha', 'match', { repo: 'alpha', names: ['회의록'] }, TK)
  must(m[0].docs?.some((x) => x.path === 'docs/회의록.md' && x.registered === false), JSON.stringify(m))
  const one = await M('/mcp/alpha', 'docs', { repo: 'alpha', doc: 'docs/회의록.md' }, TK)
  must(one.text?.startsWith('# 회의록'), JSON.stringify(one).slice(0, 200))
  // .mcp.json 이 /mcp/alpha 인데 cdp.json 은 beta — 스킬이 넘긴 repo 와 연결의 기본이 다르다
  const b = await M('/mcp/alpha', 'brief', { repo: 'beta' }, TK)
  must(b.lines.some((l) => /기본 레포는 alpha 인데 beta/.test(l)), b.lines.join(' / '))
  const same = await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK)
  must(!same.lines.some((l) => /기본 레포는/.test(l)), '같으면 조용해야 한다')
  return `문서 ${d.total} · 등록부 대상 ${d.registered} · match 회의록 → docs/회의록.md · brief 경고`
})

await check(8, '기본 레포가 없으면 repo 생략 → E_REPO', async () => {
  const d = await M('/mcp', 'brief', {}, TK)
  eq(d.error?.code, 'E_REPO', '기본 없음')
  return 'E_REPO'
})

await check(43, 'save 에 repo 누락 → 거절', async () => {
  const d = await M('/mcp', 'save', { work: { id: '2026-0921-노레포', title: 'x', date: '2026-09-21 10:00', body: 'b' } }, TK)
  must(d.error, 'repo 없이 통과했다')
  return d.error.code + ' ' + String(d.error.message).slice(0, 40)
})

// ══ save · 큐레이션 ═══════════════════════════════════════════════════════════
//
// v1.0 — writer 는 기록만 쓴다(I6). 섹션 · 등록부 · 판정은 그 레포의 큐레이터(cur · admin)만. alpha 는 옛 레포(표본 사본 —
// 큐레이션 기록 0 · applied 있는 섹션)라 「암묵 전환」 으로 읽힌다 — 옛 판정(applied 뒤 후속)이 남긴 기록만 대기다.

const EXP = 'api:/adapter/a10/expense-slip'
const R1 = '2026-0921-검증-정상'
let SEC = null
await check(28, 'save(writer) — 기록 하나 · 커밋 1 · work 파일만(INDEX · 등록부 사본 · 관리 문서 없음) · 대기열에 선다 · section 이 미반영 본문을 같이 낸다', async () => {
  const R = path.join(F.repos, 'alpha')
  const n0 = await commits(R)
  SEC = await M('/mcp/alpha', 'section', { coord: EXP }, TK)
  must(SEC.applied, 'applied 가 없는 섹션')
  const ok = await M('/mcp/alpha', 'save', { repo: 'alpha', work: { id: R1, title: '검증 정상', date: '2026-09-21 11:00', touches: [EXP], body: '검증 하네스가 만든 기록이다. 결의서 기본값을 바꿨다.' } }, TK)
  must(ok.commit, JSON.stringify(ok.error))
  eq(ok.sections, 0, 'sections')
  eq(await commits(R), n0 + 1, '커밋 수')
  // **`core.quotepath=false` 가 없으면 한글 경로가 `ì\...` 로 나온다** — 실측으로 잡았다.
  eq(await headFiles(R), [`work/${R1}.md`], '커밋에 든 파일')
  for (const f of ['INDEX.md', 'INDEX-by-coord.md']) must(!(await exists(path.join(R, f))), `${f} 가 생겼다(I9)`)
  const after = await M('/mcp/alpha', 'section', { coord: EXP }, TK)
  eq(after.applied, SEC.applied, 'applied 는 그대로 — 섹션은 큐레이터가 반영한다')
  eq(after.state, 'pending', 'state')
  must(after.pendingRecords?.some((p) => p.id === R1 && /검증 하네스/.test(p.body)), 'pendingRecords 에 본문이 없다 — ' + JSON.stringify(after.pending))
  const w = await M('/mcp/alpha', 'where', { repo: 'alpha', coord: EXP }, TK)
  must(w.section.state === 'pending' && w.section.pending >= 1, 'where ' + JSON.stringify(w.section))
  eq((await M('/mcp/alpha', 'work', { id: R1 }, TK)).curation?.state, 'queued', '기록의 큐레이션 상태')
  return `커밋 ${n0}→${n0 + 1} · work 하나 · applied 그대로 · pending ${w.section.pending}`
})

await check(119, 'save(writer) — sections · managed · edits · examples · baseline · work.curates · 예약 태그는 E_FORBIDDEN { need: curate } · 파일을 안 만진다', async () => {
  const R = path.join(F.repos, 'alpha')
  const n0 = await commits(R)
  const base = (id, extra = {}) => ({ id, title: '거절', date: '2026-09-21 12:30', touches: [EXP], body: '거절돼야 할 기록', ...extra })
  const cases = [
    ['sections', { sections: [{ coord: EXP, applied: SEC.applied, body: '섹션을 writer 가' }] }],
    ['managed', { managed: [{ pattern: 'gloss:*', doc: 'docs/용어집.md' }] }],
    ['edits', { edits: [{ file: 'README.md', old: '# 지식 레포', new: '# 고친 레포' }] }],
    ['examples', { examples: 'purge' }],
    ['baseline', { baseline: [{ coord: 'table:rp_plnd_mst', body: '| a |', src: 'db' }] }],
    ['work.curates', { work: base('2026-0921-거절-curates', { touches: [], curates: [{ id: R1, verdict: 'keep', reason: '기록으로 둔다' }] }) }],
    ['work.tags', { work: base('2026-0921-거절-tags', { tags: ['curate'] }) }],
  ]
  for (const [field, extra] of cases) {
    const d = await M('/mcp/alpha', 'save', { repo: 'alpha', work: base('2026-0921-거절-' + field.replace('.', '-')), ...extra }, TK)
    eq(d.error?.code, 'E_FORBIDDEN', field)
    eq(d.error.detail?.need, 'curate', field + ' need')
  }
  eq(await commits(R), n0, '커밋이 늘었다')
  eq(await porcelain(R), '', '트리가 더럽다')
  return `${cases.length}가지 E_FORBIDDEN(need curate) · 커밋 0 · 트리 깨끗`
})

await check(121, 'queue · forms 도구(큐레이터) — 대기열(옛 레포는 암묵 전환 · 28 의 기록) · 좌표 분류 · queue({ id }) 판정 재료 · forms(q) · forms(form) 의 stamp · 화면 API 도 같다 · writer 는 못 부른다 · 레포별(beta 는 E_FORBIDDEN)', async () => {
  const q = await M('/mcp/alpha', 'queue', { repo: 'alpha' }, TC)
  eq(q.implicit, true, '옛 레포 — 큐레이션 기록이 없다')
  const it = q.items?.find((x) => x.id === R1)
  must(it, '28 의 기록이 대기열에 없다 — ' + JSON.stringify(q.items?.map((x) => x.id)))
  eq(it.coords, [{ coord: EXP, cls: 'section' }], '좌표 분류')
  const m = await M('/mcp/alpha', 'queue', { repo: 'alpha', id: R1 }, TC)
  eq(m.record?.id, R1, '판정 재료')
  eq(m.status?.state, 'queued', 'status')
  must(m.coords?.[0]?.state === 'pending' && m.coords[0].pending >= 1 && m.coords[0].applied === SEC.applied, JSON.stringify(m.coords))
  const f = await M('/mcp/alpha', 'forms', { repo: 'alpha', q: '테이블' }, TC)
  must(f.forms?.some((x) => x.id === 'public-si/DE_431'), 'forms(q) — ' + JSON.stringify(f).slice(0, 160))
  const d = await M('/mcp/alpha', 'forms', { repo: 'alpha', form: 'public-si/DE_431' }, TC)
  must(String(d.stamp).startsWith('# 테이블정의서\n<!-- cdp:form public-si/DE_431 -->'), 'stamp ' + String(d.stamp).slice(0, 80))
  must(!/\(예시\)|작성지침|applied/.test(d.stamp) && d.guide?.length > 100, '빈 문서가 아니다')
  // 화면 API — 같은 계산(TODO §1.3). 판정 재료는 큐레이터만
  const aq = await until(() => apiJson('/api/alpha/queue', TC), (j) => j.items?.some((x) => x.id === R1))
  must(aq.items?.some((x) => x.id === R1) && aq.implicit === true, '/api/alpha/queue — ' + JSON.stringify(aq).slice(0, 160))
  eq((await H.call('/api/alpha/queue/' + encodeURIComponent(R1), bearer(TW))).status, 403, 'writer 의 /queue/<id>')
  eq((await H.call('/api/alpha/queue/' + encodeURIComponent(R1), bearer(TC))).status, 200, '큐레이터의 /queue/<id>')
  // writer — 등록되지 않은 도구
  const w = await H.rpc('/mcp/alpha', 'tools/call', { name: 'queue', arguments: { repo: 'alpha' } }, TW)
  must(w.j?.error || w.j?.result?.isError, 'writer 가 queue 를 불렀다')
  // 레포별 — cur 는 beta 를 보지만 그 레포의 큐레이터가 아니다
  const nb = await M('/mcp/beta', 'queue', { repo: 'beta' }, TC)
  eq(nb.error?.code, 'E_FORBIDDEN', 'beta 의 queue')
  eq(nb.error.detail?.need, 'curate', 'need')
  return `대기 ${q.total} (가장 오래된 ${q.oldestDays}일) · 재료 · forms ${f.total} · /api 같음 · writer 403 · beta E_FORBIDDEN`
})

await check(29, 'save 충돌 — 큐레이터가 섹션을 쓴 뒤 옛 applied 로 보내면 E_CONFLICT · detail 에 current · content', async () => {
  const R = path.join(F.repos, 'alpha')
  // 큐레이터는 기록과 섹션을 한 커밋에 쓸 수 있다(판정 없이 — applied = 이 기록)
  const a = await M('/mcp/alpha', 'save', { repo: 'alpha', work: { id: '2026-0921-검증-섹션', title: '큐레이터 섹션', date: '2026-09-21 12:00', touches: [EXP], body: '큐레이터가 섹션까지 쓴다.' }, sections: [{ coord: EXP, applied: SEC.applied, body: '**정의** 큐레이터가 쓴 본문.' }] }, TC)
  must(a.commit, JSON.stringify(a.error))
  const d = await M('/mcp/alpha', 'save', { repo: 'alpha', work: { id: '2026-0921-검증-충돌', title: '충돌', date: '2026-09-21 12:10', touches: [EXP], body: '본문' }, sections: [{ coord: EXP, applied: SEC.applied, body: '덮어쓰기 시도' }] }, TC)
  eq(d.error?.code, 'E_CONFLICT', '충돌')
  eq(d.error.detail.expected, SEC.applied, 'expected')
  eq(d.error.detail.current, '2026-0921-검증-섹션', 'current')
  must(/큐레이터가 쓴 본문/.test(d.error.detail.content || ''), 'content')
  eq(await porcelain(R), '', '트리가 더럽다')
  return `expected ${d.error.detail.expected} ≠ current ${d.error.detail.current} · 트리 깨끗`
})

await check(30, 'save 검사 실패 — 이 save 가 만든 오류(없는 기록을 정정)면 복원 · 커밋 0 · work 파일 지워짐', async () => {
  const R = path.join(F.repos, 'alpha')
  const n0 = await commits(R)
  const d = await M('/mcp/alpha', 'save', { repo: 'alpha', work: { id: '2026-0921-검증-새오류', title: '새 오류', date: '2026-09-21 13:00', touches: [EXP], supersedes: '2099-0101-없는기록', body: '없는 기록을 정정한다' } }, TK)
  eq(d.error?.code, 'E_CHECK', '검사 실패')
  eq(d.error.detail.findings.map((f) => f.kind), ['broken-supersedes'], '이 save 가 만든 오류만')
  eq(await commits(R), n0, '커밋이 늘었다')
  eq(await porcelain(R), '', '트리가 더럽다')
  must(!(await exists(path.join(R, 'work', '2026-0921-검증-새오류.md'))), 'work 파일이 남았다')
  return '커밋 0 · 트리 깨끗 · work 파일 지워짐'
})

await check(31, '같은 id 두 번 → E_EXISTS', async () => {
  const d = await M('/mcp/alpha', 'save', { repo: 'alpha', work: { id: R1, title: 'x', date: '2026-09-21 14:00', touches: [EXP], body: '본문' } }, TK)
  eq(d.error?.code, 'E_EXISTS', 'id 중복')
  return 'E_EXISTS'
})

await check(32, '요청 2MB 초과 → 413', async () => {
  // 서버가 상한을 넘는 순간 소켓을 끊으면 클라이언트는 413 을 읽기 전에 "fetch failed" 를
  // 볼 수 있다 — 경쟁이다(2026-09-23 실측 한 번, 다음 실행은 통과). 한 번은 다시 보낸다.
  let r
  for (let i = 0; ; i++) {
    try {
      r = await fetch(`${BASE}/mcp/alpha`, {
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
  return '401'
})

// 되살린다 — 뒤 검사가 쓴다
const TK3 = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--data', F.data)).stdout.trim()

// ══ 작업 레포 설치 — 대장 · 꾸러미 · 설치 한 줄 · kit 은 서버 번들에서 ═════════════════

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

await check(52, '꾸러미를 빈 레포에 풀면 bin/ctx 없이 연결된다', async () => {
  const { unzip } = await import(pathToFileURL(path.join(ROOT, 'core/zip.js')).href)
  const r = await H.call(`/kit/alpha?workrepo=${WRID}`, bearer(TK3))
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
  const { unzip } = await import(pathToFileURL(path.join(ROOT, 'core/zip.js')).href)
  const r = await H.call(`/kit/alpha?workrepo=${WRID}`, bearer(TK3))
  const files = await unzip(Buffer.from(await r.arrayBuffer()))
  const all = files.map((f) => f.data.toString('utf8')).join('')
  for (const t of [TK3, TQ, TK, TK2, TC, TW]) must(!all.includes(t), '토큰이 샜다')
  return `${files.length}개 · 원문 0`
})

// 설치 한 줄(설치 한 줄 TODO I1 · I2 · I3) — 공개 설치기 · 토큰으로 받는 kit · 받은 설치기로 끝까지
await check(104, '/install.mjs 는 인증 없이 나오고 서버 주소 말고는 아무것도 없다', async () => {
  const r = await fetch(`${BASE}/install.mjs`)
  eq(r.status, 200, 'status')
  must(/javascript/.test(r.headers.get('content-type') || ''), 'content-type ' + r.headers.get('content-type'))
  const t = await r.text()
  must(t.startsWith('globalThis.__CDP_KIT__ = {"server":"http://127.0.0.1:' + PORT), '설정 한 줄이 없다')
  const cfg = JSON.parse(t.split(NL)[0].slice('globalThis.__CDP_KIT__ = '.length))
  eq(Object.keys(cfg), ['server'], '설정에 server 말고 것')
  for (const w of ['alpha', 'beta', 'kjsa', TK3, TK, TQ]) must(!t.includes(w), `설치기에 ${w.slice(0, 8)} 가 있다`)
  return `${(t.length / 1024).toFixed(1)} KB · server 만`
})

let WR1 = null
await check(105, 'kit 을 JSON 으로 — 토큰 없으면 401 · 권한 밖 레포는 404 · 원문 0', async () => {
  const ok = await H.call('/workrepos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'one-line', knowledge: 'alpha', owner: 'kjsa' }),
  })
  WR1 = (await ok.json()).id
  eq((await fetch(`${BASE}/kit/alpha?workrepo=${WR1}&as=json`)).status, 401, '토큰 없이')
  // qa 는 alpha 만 — beta 는 없는 것이다
  const TQ2 = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '설치 한 줄', '--data', F.data)).stdout.trim()
  eq((await H.call(`/kit/beta?workrepo=${WR1}&as=json`, bearer(TQ2))).status, 404, '권한 밖')
  const r = await H.call(`/kit/alpha?workrepo=${WR1}&as=json`, bearer(TK3))
  eq(r.status, 200, 'status')
  const j = await r.json()
  eq([j.repo, j.workrepo], ['alpha', WR1], '머리')
  must(/^[0-9a-f]+$/.test(j.kit || ''), 'kit 해시 없음')
  const names = j.files.map((f) => f.name)
  must(names.includes('.mcp.json') && names.some((n) => n.startsWith('.claude/skills/cdp-')), '파일 ' + names.slice(0, 4).join(','))
  must(!names.some((n) => n.startsWith('kit/') || n === '설치.md' || n === 'install.mjs'), 'kit/ 밖의 것이 섞였다')
  const all = j.files.map((f) => Buffer.from(f.data, 'base64').toString('utf8')).join('')
  for (const t of [TK3, TQ2, TK, TK2]) must(!all.includes(t), '토큰이 샜다')
  return `${names.length}개 · 401 · 404 · 원문 0`
})

await check(125, '/kit 역할별 — writer 는 cdp-work · cdp-save · cdp-push + 작업 레포 블록 · 큐레이터는 여섯 + 큐레이터 블록 · 큐레이터도 role=writer 면 writer · 큐레이터가 아닌 레포에서는 writer', async () => {
  const kit = async (tk, repo = 'alpha', q = '') => (await H.call(`/kit/${repo}?as=json${q}`, bearer(tk))).json()
  const skillsOf = (j) => [...new Set(j.files.map((f) => /^\.claude\/skills\/([^/]+)\//.exec(f.name)?.[1]).filter(Boolean))].sort()
  const text = (j, n) => Buffer.from(j.files.find((f) => f.name === n)?.data || '', 'base64').toString('utf8')
  const w = await kit(TW)
  eq(w.role, 'writer', 'writer 역할')
  eq(skillsOf(w), WRITER_SKILLS, 'writer 스킬')
  // kit 안쪽 원본(.claude/work-repo/)은 오지 않는다 — CLAUDE.md 로 병합돼 온다(제품화 2 F12)
  must(!w.files.some((f) => f.name.startsWith('.claude/work-repo/')), 'kit 안쪽 원본이 왔다')
  must(/업무 맥락 — CDP/.test(text(w, 'CLAUDE.md')), 'writer 블록')
  must(text(w, 'CLAUDE.md').includes(`<!-- cdp:kit ${w.kit} -->`), 'CLAUDE.md 의 cdp:kit')
  const c = await kit(TC)
  eq(c.role, 'curator', '큐레이터 역할')
  eq(skillsOf(c), SKILL_SET, '큐레이터 스킬')
  must(/CDP 큐레이터/.test(text(c, 'CLAUDE.md')), '큐레이터 블록')
  must(c.kit !== w.kit, '해시가 같다')
  const cw = await kit(TC, 'alpha', '&role=writer')
  eq([cw.role, cw.kit], ['writer', w.kit], 'role=writer')
  eq((await kit(TC, 'beta')).role, 'writer', 'beta 의 큐레이터가 아니다')
  // 등록된 작업 레포(`?workrepo=`)는 누가 받든 writer kit — 팀이 같이 커밋하는 자리다. 큐레이터 kit 은 큐레이터 폴더에만
  const ww = await (await H.call(`/kit/alpha?workrepo=${WR1}&as=json`, bearer(TC))).json()
  eq([skillsOf(ww), ww.kit], [WRITER_SKILLS, w.kit], '큐레이터가 받은 작업 레포 kit')
  return `writer ${w.kit} (스킬 3) · 큐레이터 ${c.kit} (스킬 ${skillsOf(c).length}) · 작업 레포는 누가 받든 writer`
})

// 설치기가 이 PC 의 설치 목록을 쓴다(에이전트 세팅 갱신 T9) — 하네스는 진짜 %APPDATA% · ~/.config 를 건드리지 않는다
const CFGDIR = path.join(TMP, 'cdp-config')
const INST = path.join(TMP, 'cdp-install.mjs')
const installer = (cwd, args, env = {}) => run(process.execPath, [INST, ...args], { cwd, env: { ...BASE_ENV, ...env }, encoding: 'utf8' })
let K106 = null

await check(106, '받은 설치기 한 줄로 빈 레포에 설치 → 대장 최신 · 두 번째는 이미 최신', async () => {
  await fs.writeFile(INST, await (await fetch(`${BASE}/install.mjs`)).text())
  const W3 = path.join(TMP, 'work3')
  await fs.mkdir(W3, { recursive: true })
  await run('git', ['-C', W3, 'init', '-q'])
  await fs.writeFile(path.join(W3, '.mcp.json'), JSON.stringify({ mcpServers: { other: { command: 'x' } } }, null, 2))
  const go = () => installer(W3, ['--repo', 'alpha', '--workrepo', WR1, '.', '--yes', '--no-save'], { CDP_TOKEN: TK3, CDP_CONFIG_DIR: CFGDIR })
  const a = await go()
  must(/대장에 보고했습니다/.test(a.stdout), '보고 없음 — ' + a.stdout.slice(-120))
  const mcp = JSON.parse(await fs.readFile(path.join(W3, '.mcp.json'), 'utf8')).mcpServers
  must(mcp.other && mcp.cdp, '다른 MCP 서버가 사라졌거나 cdp 가 없다')
  must(mcp.cdp.headers.Authorization === 'Bearer ${CDP_TOKEN}', '원문이 박혔다')
  const skills = await fs.readdir(path.join(W3, '.claude', 'skills'))
  must(kitSkillsOk(skills), `스킬 ${skills.join(' · ')}`)
  const rows = (await (await H.call('/workrepos', bearer(TK3))).json()).repos
  eq(rows.find((r) => r.id === WR1)?.state, '최신', '대장')
  const b = await go()
  must(/이미 최신입니다/.test(b.stdout), '두 번째 — ' + b.stdout.slice(-80))
  // 57 이 본다 — 설치 직후 brief 의 kit 해시와 설치본의 cdp:kit
  K106 = { installed: kitOf(await fs.readFile(path.join(W3, 'CLAUDE.md'), 'utf8')), brief: (await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK3)).sync?.kit?.hash }
  const left = (await fs.readdir(os.tmpdir())).filter((n) => n.startsWith('cdp-kit-'))
  return `스킬 ${skills.length} · other 보존 · 최신 · 임시 kit 남은 것 ${left.length}`
})

await check(54, '설치 한 줄 — 작업 레포의 CLAUDE.md 가 이미 있어도 기존 내용이 남는다 · cdp 블록 · cdp:kit', async () => {
  const W = path.join(TMP, 'work54')
  await fs.mkdir(W, { recursive: true })
  await run('git', ['-C', W, 'init', '-q'])
  await fs.writeFile(path.join(W, 'CLAUDE.md'), '# 우리 프로젝트\n\n원래 있던 내용이다.\n')
  await installer(W, ['--repo', 'alpha', '--workrepo', WR1, '.', '--yes', '--no-save'], { CDP_TOKEN: TK3, CDP_CONFIG_DIR: path.join(TMP, 'cdp-config-54') })
  const body = await fs.readFile(path.join(W, 'CLAUDE.md'), 'utf8')
  must(body.includes('원래 있던 내용이다.'), '기존 내용이 사라졌다')
  must(/<!-- cdp:kit [0-9a-f]+ -->/.test(body) && body.includes('<!-- cdp:begin'), 'cdp 블록 · cdp:kit 이 없다')
  return '보존 + cdp 블록 + cdp:kit'
})

await check(55, '/applied 가 by 를 토큰에서 채운다 · 보내면 거절', async () => {
  const bad = await H.call(`/workrepos/${WRID}/applied`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ kit: 'x', by: '남의이름' }),
  })
  eq(bad.status, 400, 'by 위조')
  const mine = kitOf(await fs.readFile(path.join(TMP, 'work3', 'CLAUDE.md'), 'utf8'))
  const ok = await H.call(`/workrepos/${WRID}/applied`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ kit: mine }),
  })
  const row = await ok.json()
  eq(row.applied.by, 'kjsa', 'by')
  return `by=${row.applied.by} (토큰에서)`
})

await check(107, '한 줄 설치기는 토큰이 없고 물을 수 없으면 아무것도 안 쓰고 멈춘다', async () => {
  const W4 = path.join(TMP, 'work4')
  await fs.mkdir(W4, { recursive: true })
  let code = 0
  let stderr = ''
  try {
    await installer(W4, ['--repo', 'alpha', '--workrepo', WR1, '.', '--yes'], { CDP_CONFIG_DIR: CFGDIR })
  } catch (e) {
    code = e.code
    stderr = e.stderr
  }
  eq(code, 2, 'exit')
  must(/CDP_TOKEN/.test(stderr), 'stderr — ' + stderr.slice(0, 80))
  eq(await fs.readdir(W4), [], '뭔가 썼다')
  // 틀린 토큰도 같은 자리에서 — 재시작 뒤 /mcp failed 가 아니라
  try {
    await installer(W4, ['--repo', 'alpha', '--workrepo', WR1, '.', '--yes'], { CDP_CONFIG_DIR: CFGDIR, CDP_TOKEN: 'nope' })
    code = 0
  } catch (e) {
    code = e.code
  }
  eq(code, 2, '틀린 토큰 exit')
  return 'exit 2 · 쓴 것 0 · 틀린 토큰도 멈춤'
})

await check(126, '설치 한 줄 --curator — 큐레이터 폴더(git · 대장 등록 없이): 스킬 여섯 · 큐레이터 블록 · cdp:kit = 큐레이터 kit · 두 번째는 이미 최신 · writer 토큰은 아무것도 안 쓰고 멈춘다', async () => {
  const D = path.join(TMP, 'curator-dir')
  await fs.mkdir(D, { recursive: true })
  const wr0 = (await (await H.call('/workrepos', bearer(TK3))).json()).repos.length
  const env = { CDP_TOKEN: TC, CDP_CONFIG_DIR: path.join(TMP, 'cdp-config-curator') }
  const a = await installer(D, ['--curator', '--repo', 'alpha', '.', '--yes', '--no-save'], env)
  must(/적용했습니다/.test(a.stdout), a.stdout.slice(-160))
  const skills = (await fs.readdir(path.join(D, '.claude', 'skills'))).sort()
  eq(skills, SKILL_SET, '스킬')
  const body = await fs.readFile(path.join(D, 'CLAUDE.md'), 'utf8')
  const ck = (await (await H.call('/kit/alpha?as=json', bearer(TC))).json()).kit
  must(/CDP 큐레이터/.test(body) && kitOf(body) === ck, `큐레이터 블록 · cdp:kit ${kitOf(body)} ≠ ${ck}`)
  eq(JSON.parse(await fs.readFile(path.join(D, '.claude', 'cdp.json'), 'utf8')).repo, 'alpha', 'cdp.json')
  must(JSON.parse(await fs.readFile(path.join(D, '.mcp.json'), 'utf8')).mcpServers.cdp.url.endsWith('/mcp/alpha'), '.mcp.json')
  must(!(await exists(path.join(D, '.git'))), 'git 을 만들었다')
  eq((await (await H.call('/workrepos', bearer(TK3))).json()).repos.length, wr0, '대장에 올랐다')
  const b = await installer(D, ['--curator', '--repo', 'alpha', '.', '--yes', '--no-save'], env)
  must(/이미 최신입니다/.test(b.stdout), '두 번째 — ' + b.stdout.slice(-80))
  // writer — 큐레이터가 아니다
  const E = path.join(TMP, 'curator-dir-writer')
  await fs.mkdir(E, { recursive: true })
  let code = 0
  let stderr = ''
  try {
    await installer(E, ['--curator', '--repo', 'alpha', '.', '--yes', '--no-save'], { ...env, CDP_TOKEN: TW })
  } catch (e) {
    code = e.code
    stderr = e.stderr
  }
  eq(code, 2, 'writer exit')
  must(/큐레이터가 아닙니다/.test(stderr), 'stderr — ' + stderr.slice(0, 120))
  eq(await fs.readdir(E), [], 'writer 가 썼다')
  return `스킬 5 · 큐레이터 블록 · kit ${ck} · 대장 그대로 · 이미 최신 · writer exit 2`
})

await check(56, '서버 kit(번들 kit/)을 바꾸면 대장이 낡음으로', async () => {
  // v1.0 — kit 은 레포가 아니라 서버 번들에서 나간다(W5). 판을 올린 것을 흉내낸다: 서버의 --kit 자리를 고친다
  await fs.appendFile(path.join(KIT, 'skills', 'cdp-work', 'SKILL.md'), '\n<!-- 새 판 56 -->\n')
  const rows = (await (await H.call('/workrepos', bearer(TK3))).json()).repos
  const me = rows.find((r) => r.id === WRID)
  eq(me.state, '낡음', '상태')
  must(rows.find((r) => r.id === WR1)?.state === '낡음', '설치 한 줄로 깐 것도 낡음')
  return `${me.applied.kit} → ${me.kitNow}`
})

await check(57, 'brief 의 sync.kit — 설치 직후 작업 레포의 cdp:kit 과 같다 · 서버 kit 이 바뀌면 brief 도 새 해시(/kit 이 내는 것)', async () => {
  must(K106, '106 이 돌지 않았다')
  eq(K106.brief, K106.installed, '설치 직후 brief 의 kit 과 CLAUDE.md 의 cdp:kit')
  const now = (await (await H.call('/kit/alpha?as=json', bearer(TK3))).json()).kit
  const b = (await M('/mcp/alpha', 'brief', { repo: 'alpha' }, TK3)).sync?.kit?.hash
  must(now !== K106.installed, '56 이 kit 을 바꿨는데 /kit 의 해시가 그대로다')
  eq(b, now, 'kit 이 바뀐 뒤 brief 의 sync.kit.hash 가 서버가 내는 kit(/kit · --kit)과 다르다')
  return `설치 ${K106.installed} = brief · 판 갱신 뒤 brief ${b} = /kit ${now}`
})

await check(108, '에이전트 세팅이 바뀌면 --update 한 줄이 이 PC 의 작업 레포 전부를 — --commit 은 바꾼 파일만 · 고치던 파일이 있는 레포는 커밋 안 함 · 대장 최신 · 두 번째는 이미 최신', async () => {
  const W3 = path.join(TMP, 'work3')
  const W5 = path.join(TMP, 'work5')
  const env = { CDP_TOKEN: TK3, CDP_CONFIG_DIR: CFGDIR }
  const node = (cwd, ...a) => installer(cwd, a, env)
  // 두 번째 작업 레포 — 같은 등록으로 설치한다(설치 목록은 경로가 열쇠다). 둘 다 설치한 것을 커밋해 둔다
  await fs.mkdir(W5, { recursive: true })
  await run('git', ['-C', W5, 'init', '-q'])
  await fs.writeFile(path.join(W5, 'CLAUDE.md'), '# 우리 규약\n\n빌드는 make.\n')
  await node(W5, '--repo', 'alpha', '--workrepo', WR1, '.', '--yes', '--no-save')
  for (const w of [W3, W5]) {
    await gitc(w, 'add', '-A')
    await gitc(w, 'commit', '-qm', 'cdp 설치')
  }
  const reg = JSON.parse(await fs.readFile(path.join(CFGDIR, 'workrepos.json'), 'utf8'))
  eq(reg.entries.length, 2, '설치 목록')
  // 에이전트 세팅이 바뀐다 — 서버 번들의 스킬이 새 판으로(upgrade 가 kit/ 을 갈아 끼운 것)
  await fs.appendFile(path.join(KIT, 'skills', 'cdp-save', 'SKILL.md'), '\n<!-- 새 판 108 -->\n')
  // W5 는 사람이 CLAUDE.md 를 고치던 중이다 — 그 레포는 커밋하지 않아야 한다
  await fs.appendFile(path.join(W5, 'CLAUDE.md'), '\n고치던 줄\n')
  const h5 = (await gitc(W5, 'rev-parse', 'HEAD')).stdout.trim()

  const dry = await node(W3, '--update', '--dry', '--yes')
  must(/바뀔 곳 2 · 이미 최신 0 · 못 함 0/.test(dry.stdout), 'dry — ' + dry.stdout.slice(-200))
  must(!(await fs.readFile(path.join(W3, '.claude', 'skills', 'cdp-save', 'SKILL.md'), 'utf8')).includes('새 판 108'), 'dry 가 썼다')

  const a = await node(W3, '--update', '--yes', '--commit')
  must(/바뀔 곳 2/.test(a.stdout), a.stdout.slice(-300))
  for (const w of [W3, W5]) must((await fs.readFile(path.join(w, '.claude', 'skills', 'cdp-save', 'SKILL.md'), 'utf8')).includes('새 판 108'), `${w} 스킬이 안 바뀌었다`)
  eq((await gitc(W3, 'log', '-1', '--format=%s')).stdout.trim().startsWith('CDP 에이전트 세팅 갱신'), true, 'W3 커밋')
  eq((await gitc(W3, 'status', '--porcelain')).stdout.trim(), '', 'W3 트리')
  eq((await gitc(W5, 'rev-parse', 'HEAD')).stdout.trim(), h5, 'W5 는 커밋하지 않는다')
  must(/커밋 안 함 — 원래 커밋 안 된 변경이 있던 파일이 있다: CLAUDE\.md/.test(a.stdout), 'W5 문장 — ' + a.stdout.slice(-300))
  must((await fs.readFile(path.join(W5, 'CLAUDE.md'), 'utf8')).includes('고치던 줄'), '사람의 줄이 사라졌다')
  const rows = (await (await H.call('/workrepos', bearer(TK3))).json()).repos
  eq(rows.find((r) => r.id === WR1)?.state, '최신', '대장')

  const b = await node(W5, '--update', '--yes')
  must(/바뀔 곳 0 · 이미 최신 2/.test(b.stdout), '두 번째 — ' + b.stdout.slice(-200))
  // 목록에 없는 경로는 멈춘다 — 무엇을 하면 되는지 말한다
  let code = 0
  let stderr = ''
  try {
    await node(TMP, '--update', path.join(TMP, 'work4'), '--yes')
  } catch (e) {
    code = e.code
    stderr = e.stderr
  }
  eq(code, 2, '목록 밖 exit')
  must(/설치 목록에 없는 경로/.test(stderr), stderr.slice(0, 120))
  return '2곳 적용 · W3 커밋 · W5 커밋 안 함(고치던 CLAUDE.md) · 대장 최신 · 두 번째 이미 최신 · 목록 밖 exit 2'
})

await check(58, '보고 없이 설치해도 동작한다 (대장만 미설치)', async () => {
  const ok = await H.call('/workrepos', {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: 'Bearer ' + TK3 },
    body: JSON.stringify({ name: 'no-report', knowledge: 'alpha', owner: 'kjsa' }),
  })
  const id = (await ok.json()).id
  const rows = (await (await H.call('/workrepos', bearer(TK3))).json()).repos
  eq(rows.find((r) => r.id === id).state, '미설치', '상태')
  return '미설치로 남는다'
})

// ══ 관리 서비스 — 화면 경로 · 쿠키 ═══════════════════════════════════════════

await check(60, '쿠키 없이 화면 경로 → /login · next 를 들고 간다', async () => {
  const r = await fetch(`${BASE}/r/alpha/doc/x`, { redirect: 'manual' })
  eq(r.status, 302, 'status')
  must(r.headers.get('location').startsWith('/login?next='), r.headers.get('location'))
  return r.headers.get('location')
})

await check(61, '만료 · 명부 삭제 · inactive 가 화면에서 같은 문구', async () => {
  const seen = new Set()
  for (const t of [TQ, TG, 'nonsense']) {
    const r = await fetch(`${BASE}/login`, {
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
  const r = await fetch(`${BASE}/login`, {
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

await check(47, '옛 로컬 뷰어 라우트가 서버에서 404 — 막은 것이 아니라 없는 것', async () => {
  for (const p of ['/setup', '/open', '/quit', '/rescan', '/git/pull', '/git/push', '/git/hooks']) {
    const r = await H.call('/api/alpha' + p, { method: 'POST' })
    eq(r.status, 404, p)
  }
  return '7개 404'
})

await check(46, '권한 밖 레포의 /api/<repo>/* 는 없는 것', async () => {
  const lr = await fetch(`${BASE}/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: 'token=' + encodeURIComponent(TQ),
    redirect: 'manual',
  })
  // qa 는 만료시켰다 — 로그인 자체가 막히는 것이 맞다
  eq(lr.status, 401, '만료된 토큰으로 로그인')
  const r = await H.call('/api/beta/status')
  eq(r.status, 200, 'kjsa 는 beta 도 본다')
  eq((await H.call('/api/beta/status', bearer(TW))).status, 404, 'wr 은 beta 를 못 본다(없는 것)')
  return '만료 401 · kjsa 통과 · wr 404'
})

await check(48, '다른 오리진에서 온 요청은 Origin 검사로 끊긴다', async () => {
  const r = await H.call('/api/alpha/status', { headers: { origin: 'https://evil.example' } })
  eq(r.status, 403, 'status')
  const ok = await H.call('/api/alpha/status', { headers: { origin: 'http://localhost:5173' } })
  eq(ok.status, 200, '루프백 origin')
  return '403 · 루프백 200'
})

if (WEB_OK) {
  await check(62, 'repos 가 빈 사용자 — 로그인은 되고 /r 은 첫 레포로 보내지 않고 빈 상태 화면을 낸다', async () => {
    await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'nobody', '--data', F.data)
    const tn = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'nobody', '--data', F.data)).stdout.trim()
    const r = await fetch(`${BASE}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: 'token=' + encodeURIComponent(tn),
      redirect: 'manual',
    })
    eq(r.status, 302, '로그인은 된다')
    eq(r.headers.get('location'), '/r', '기본 next 는 /r')
    const c = /cdp_s=[^;]*/.exec(r.headers.get('set-cookie'))[0]
    // `/r` — 갈 레포가 없으니 302 가 아니라 화면(빈 상태)이다. 화면이 /me 로 그린다(제품관리서비스 검토 §4.2)
    const page = await fetch(`${BASE}/r`, { headers: { cookie: c }, redirect: 'manual' })
    eq(page.status, 200, '/r 이 200')
    must((await page.text()).includes('window.__CDP_SERVER__'), 'SPA 를 낸다')
    const me = await (await fetch(`${BASE}/me`, { headers: { cookie: c } })).json()
    eq(me.repos.length, 0, '볼 수 있는 레포 0')
    eq(me.role, 'viewer', 'role')
    eq(me.curate, [], 'curate')
    return '로그인 O · /r 200 · repos 0 · curate []'
  })
} else skip(62, 'repos 가 빈 사용자 — /r 은 빈 상태 화면', NO_WEB)

await check(59, 'MCP 와 관리 서비스가 같은 레포를 두 번 읽지 않는다', async () => {
  // `/api` 는 Store, `/mcp` 는 makeRepoCache 를 쓴다. **둘 다 레포마다 하나**이고
  // 요청마다 새로 만들지 않는다 — 두 번 불러 같은 수치가 나오는지로 본다.
  const a1 = (await (await H.call('/api/alpha/status')).json()).works
  const a2 = (await (await H.call('/api/alpha/status')).json()).works
  const m1 = (await M('/mcp/alpha', 'brief', {}, TK3)).works
  eq([a1, a2, m1], [a1, a1, a1], '수치가 갈린다')
  return `works ${a1} 일치`
})

if (SLOW) {
  await check(39, '재시작 없이 <root> 에 레포를 추가하면 60초 안에 보인다', async () => {
    await fs.cp(path.join(ROOT, 'viewer', 'fixture'), path.join(F.repos, 'slowpoke'), { recursive: true })
    await wait(62000)
    const rows = await (await H.call('/repos', bearer(TK3))).json()
    must(rows.some((r) => r.name === 'slowpoke'), '안 보인다')
    return 'slowpoke 인식'
  })
} else {
  skip(39, '재시작 없이 레포 추가 → 60초 안에 /repos', '--slow 로 돈다 (60초)')
}

// ══ 제품화 — 서식집 · 빈 틀 · 첫 기록 · 첫 큐레이션 ═══════════════════════════════
//
// 번호 70 이상은 설계서 §10 밖이다 — 판마다 더한 「끝났다고 보는 기준」 이다.

await check(70, '서식집 — GET /packages 는 없다 · /api/<레포>/forms 가 번들 묶음 넷 · 서식 79(문제 0) + 팀 서식 · /forms/<id> 가 서버가 찍을 빈 문서', async () => {
  eq((await H.call('/packages', bearer(TK3))).status, 404, '/packages')
  const j = await apiJson('/api/alpha/forms', TK3)
  const bundle = j.forms.filter((f) => f.origin === 'bundle')
  eq([j.groups.filter((g) => g.origin === 'bundle').length, bundle.length], [4, 79], '번들 묶음 · 서식')
  must(bundle.every((f) => f.id && f.title && Array.isArray(f.registry) && f.problems === 0), '행 모양 · 문제 0')
  must(j.forms.some((f) => f.origin === 'team'), '팀 서식(<data>/forms)이 안 든다')
  const d = await apiJson('/api/alpha/forms/public-si/DE_431', TK3)
  must(String(d.stamp).startsWith('# 테이블정의서\n<!-- cdp:form public-si/DE_431 -->'), 'stamp')
  return `번들 ${j.groups.filter((g) => g.origin === 'bundle').map((g) => g.name).join(' · ')} · 서식 ${bundle.length} · 팀 ${j.forms.length - bundle.length}`
})

await check(71, 'ctx repo new — 이름 형식 · 빈 폴더가 아닌 자리 · origin 형식을 거절한다 · 거절한 것은 남기지 않는다 · --dry 는 쓰지 않는다 (콘솔 POST /admin/repos 와 같은 core/reponew)', async () => {
  const fail = async (args) => {
    const r = await cli(['repo', 'new', ...args])
    must(r.code !== 0, `${args[0]} 가 통과했다`)
    return r.stderr
  }
  must(/이름 형식/.test(await fail([path.join(F.repos, '한글 이름')])), '이름 형식')
  must(/이미 무엇이 있다/.test(await fail([path.join(F.repos, 'alpha')])), '이미 있는 레포')
  must(/origin 주소 형식/.test(await fail([path.join(F.repos, 'zeta'), '--origin', 'not a url'])), 'origin 형식')
  must(!(await exists(path.join(F.repos, 'zeta'))), '거절한 것은 남기지 않는다')
  const dry = await cli(['repo', 'new', path.join(F.repos, 'zeta'), '--dry'])
  must(dry.code === 0 && /빈 틀/.test(dry.stdout), 'dry — ' + dry.stdout.slice(0, 120))
  must(!(await exists(path.join(F.repos, 'zeta'))), 'dry 가 썼다')
  return '이름 형식 · 자리 · origin · dry'
})

await check(72, 'ctx repo new 로 세운 레포(빈 틀)가 다음 요청부터 MCP · 목록에 든다 (서버 재시작 없음) · 훅 · 도구 층 없음', async () => {
  const D = path.join(F.repos, 'delta')
  const o = await cli(['repo', 'new', D, '--title', '빈 틀 시험'])
  eq(o.code, 0, 'exit — ' + o.stderr.slice(0, 120))
  const commit = /첫 커밋 ([0-9a-f]{7,40})/.exec(o.stdout)?.[1]
  must(commit, '첫 커밋이 없다 — ' + o.stdout.slice(0, 160))
  // 서버는 새 폴더를 그 이름으로 가는 첫 요청에서 알아본다(관리자 설명서 3.4)
  eq((await toolNames(TK3, '/mcp/delta')).length, 10, '첫 요청에서 알아본다(writer 10)')
  const list = await (await H.call('/repos', bearer(TK3))).json()
  must(list.some((x) => x.name === 'delta'), '목록에 없다')
  const b = await M('/mcp/delta', 'brief', {}, TK3)
  eq([b.works, b.managedDocs], [0, 0], '빈 틀 — 작업 기록 · 관리 문서 0')
  eq((await gitc(D, 'ls-files')).stdout.split(/\r?\n/).filter(Boolean).sort(), SKELETON, '빈 틀의 파일')
  eq(await hooksPath(D), '', '훅 경로')
  return `commit ${commit} · 파일 ${SKELETON.length} · 도구 10 · 훅 없음`
})

const ENEW = 'table:ex_plan_mst'
const D1 = '2026-0922-계획마스터-신설'
const D2 = '2026-0922-계획마스터-상태값'
await check(73, '세운 레포(빈 틀)에 writer 의 첫 기록 둘 — 새 좌표는 vocab 과 함께 · 커밋 · 훅 없이 · 대기열 2(등록부 없는 좌표)', async () => {
  const D = path.join(F.repos, 'delta')
  const n0 = await commits(D)
  const a = await M('/mcp/delta', 'save', { repo: 'delta', work: { id: D1, title: '계획 마스터 신설', date: '2026-09-22 09:00', touches: [ENEW], body: '계획 마스터 테이블을 새로 만들었다. 기본키는 plan_id.' }, vocab: [{ coord: ENEW, label: '계획 마스터', aliases: ['EX_PLAN_MST'] }] }, TK3)
  must(a.commit, JSON.stringify(a.error || a).slice(0, 200))
  must(a.warnings.some((w) => /새 어휘 타입 "table"/.test(w)), '새 타입 경고 — ' + a.warnings.join(' / '))
  const b = await M('/mcp/delta', 'save', { repo: 'delta', work: { id: D2, title: '계획 마스터 상태값', date: '2026-09-22 10:00', touches: [ENEW], body: '상태값 컬럼 plan_stat 을 더했다(작성 · 확정 · 폐기).' } }, TK3)
  must(b.commit, JSON.stringify(b.error || b).slice(0, 200))
  eq(await commits(D), n0 + 2, '커밋 둘')
  const q = await M('/mcp/delta', 'queue', { repo: 'delta' }, TC)
  eq([q.total, q.implicit], [2, false], '대기열 — 새 레포는 암묵 전환이 아니다')
  eq(q.items.map((x) => x.coords[0].cls), ['unregistered', 'unregistered'], '등록부 없는 좌표')
  const s = await M('/mcp/delta', 'section', { coord: ENEW }, TK3)
  must(s.state === 'missing' && s.reason === 'unregistered' && s.pendingRecords?.length === 2, '섹션 없는 좌표도 대기 기록이 근거 — ' + JSON.stringify(s).slice(0, 200))
  return `커밋 ${a.commit} · ${b.commit} · 대기 2 · section 이 대기 기록 둘을 낸다`
})

const CUR1 = '2026-0922-큐레이션-계획마스터'
await check(120, '큐레이션 save(큐레이터) — 판정 new 로 서식(public-si/DE_431)에서 문서를 세우며 · into 는 같은 save 의 sections · applied = 반영한 기록 중 가장 늦은 것 · 대기열 0 · 이력(/curations) · 레포별(beta 는 E_FORBIDDEN)', async () => {
  const D = path.join(F.repos, 'delta')
  const work = (id, curates) => ({ id, title: '큐레이션 — 계획 마스터', date: '2026-09-22 16:00', touches: [], body: '판정표 — 계획 마스터 두 기록을 새 테이블정의서에 반영한다.', curates })
  const both = [
    { id: D1, verdict: 'new', into: [ENEW] },
    { id: D2, verdict: 'new', into: [ENEW] },
  ]
  const managed = [{ pattern: 'table:*', doc: 'docs/테이블정의서.md', form: 'public-si/DE_431' }]
  // into 가 이 save 의 sections 에 없다 → E_INPUT(파일을 안 만진다)
  const bad = await M('/mcp/delta', 'save', { repo: 'delta', work: work('2026-0922-큐레이션-빈', both), managed }, TC)
  eq(bad.error?.code, 'E_INPUT', 'into 없는 sections')
  must(/sections 에 없다/.test(bad.error.message), bad.error.message)
  eq(await porcelain(D), '', '거절 뒤 트리')
  // 레포별 — cur 는 beta 를 보지만 그 레포의 큐레이터가 아니다
  const nb = await M('/mcp/beta', 'save', { repo: 'beta', work: { id: '2026-0922-베타-섹션', title: 'x', date: '2026-09-22 16:05', touches: [EXP], body: 'x' }, sections: [{ coord: EXP, applied: null, body: 'x' }] }, TC)
  eq(nb.error?.code, 'E_FORBIDDEN', 'beta 의 sections')
  eq(nb.error.detail?.need, 'curate', 'need')
  const n0 = await commits(D)
  const ok = await M('/mcp/delta', 'save', { repo: 'delta', work: work(CUR1, both), managed, sections: [{ coord: ENEW, applied: null, heading: 'ex_plan_mst — 계획 마스터', body: '계획 마스터. 기본키 plan_id · 상태값 plan_stat(작성 · 확정 · 폐기).\n\n**경과**\n- 2026-09-22 신설 · 상태값' }] }, TC)
  must(ok.commit, JSON.stringify(ok.error || ok).slice(0, 240))
  eq([ok.managed, ok.sections], [1, 1], 'managed · sections')
  eq(await commits(D), n0 + 1, '커밋 하나')
  const doc = await fs.readFile(path.join(D, 'docs', '테이블정의서.md'), 'utf8')
  must(doc.startsWith('# 테이블정의서\n<!-- cdp:form public-si/DE_431 -->'), '서식 표지 — ' + doc.slice(0, 80))
  must(!/\(예시\)|작성지침/.test(doc) && /^## ex_plan_mst — 계획 마스터$/m.test(doc), '깨끗한 빈 문서 + 섹션')
  const s = await M('/mcp/delta', 'section', { coord: ENEW }, TC)
  eq([s.applied, s.state, s.form], [D2, 'ok', 'public-si/DE_431'], 'applied · state · form')
  const w1 = await M('/mcp/delta', 'work', { id: D1 }, TC)
  eq([w1.curation?.state, w1.curation?.verdict, w1.curation?.by], ['reflected', 'new', CUR1], '기록의 큐레이션 상태')
  const cw = await M('/mcp/delta', 'work', { id: CUR1 }, TC)
  must(cw.curation?.state === 'system' && cw.frontmatter.tags.includes('curate') && cw.frontmatter.touchesEmpty === '큐레이션', '큐레이션 기록 — ' + JSON.stringify(cw.frontmatter).slice(0, 160))
  eq((await M('/mcp/delta', 'queue', { repo: 'delta' }, TC)).total, 0, '대기열')
  const h = await until(() => apiJson('/api/delta/curations', TC), (j) => j.items?.[0]?.id === CUR1)
  must(h.items?.[0]?.id === CUR1 && h.items[0].judgments.length === 2 && h.items[0].newDocs.includes('docs/테이블정의서.md'), '이력 — ' + JSON.stringify(h).slice(0, 200))
  eq((await M('/mcp/delta', 'check', {}, TC)).errors, 0, 'check')
  return `커밋 ${ok.commit} · 서식 문서 · applied ${s.applied} · 대기 0 · 이력 · beta E_FORBIDDEN`
})

await check(124, '기준선 — ctx baseline push(큐레이터 토큰 · POST /api/<r>/baseline): 블록만 갈아 끼우고 · 큐레이터의 글 · applied 그대로 · 기준선 기록은 대기열에 안 선다 · writer 는 403 · 어휘에 없는 좌표는 거절', async () => {
  const D = path.join(F.repos, 'delta')
  const json = path.join(TMP, 'baseline.json')
  await fs.writeFile(json, JSON.stringify({ source: '개발 DB pg_catalog', asof: '2026-09-22', items: [{ coord: ENEW, body: '| 컬럼 | 타입 |\n|---|---|\n| plan_id | int |\n| plan_stat | varchar(10) |' }] }, null, 2))
  const before = await M('/mcp/delta', 'section', { coord: ENEW }, TC)
  const r = await cli(['baseline', 'push', json, '--server', BASE, '--repo', 'delta'], { env: { CDP_TOKEN: TC } })
  eq(r.code, 0, 'push — ' + (r.stderr || r.stdout).slice(0, 160))
  must(/커밋 [0-9a-f]+ · 블록 1/.test(r.stdout), r.stdout.slice(0, 120))
  const after = await M('/mcp/delta', 'section', { coord: ENEW }, TC)
  eq([after.baseline?.src, after.baseline?.asof], ['개발 DB pg_catalog', '2026-09-22'], '블록 머리')
  must(/plan_stat \| varchar/.test(after.baseline.body), '블록 본문')
  eq([after.content, after.applied], [before.content, before.applied], '글 · applied 그대로')
  const rec = (await headFiles(D)).find((f) => f.startsWith('work/'))
  const id = path.basename(rec, '.md')
  const wk = await M('/mcp/delta', 'work', { id }, TC)
  eq([wk.curation?.state, wk.frontmatter.baseline?.source], ['system', '개발 DB pg_catalog'], '기준선 기록')
  eq((await M('/mcp/delta', 'queue', { repo: 'delta' }, TC)).total, 0, '대기열')
  // writer(kjsa — 아직 writer)는 기준선을 못 올린다
  const w = await cli(['baseline', 'push', json, '--server', BASE, '--repo', 'delta'], { env: { CDP_TOKEN: TK3 } })
  must(w.code === 1 && /403/.test(w.stderr), 'writer — ' + (w.stderr || w.stdout).slice(0, 120))
  const bad = await fetch(`${BASE}/api/delta/baseline`, { method: 'POST', headers: { authorization: 'Bearer ' + TC, 'content-type': 'application/json' }, body: JSON.stringify({ source: 'x', items: [{ coord: 'gloss:없음', body: '| x |' }] }) })
  eq(bad.status, 400, '어휘에 없는 좌표')
  eq(await porcelain(D), '', '트리')
  return `블록 1 · ${id} · 글 · applied 그대로 · writer 403 · 미등재 400`
})

await check(74, '서식집 검사 — 서버가 쓰는 자리(agent/forms)의 묶음 넷 · 서식 79 전부 lintForm 문제 0 · 서버가 찍는 빈 문서에 예시 · 작성지침 · applied 가 없다', async () => {
  const { loadForms } = await import(pathToFileURL(path.join(ROOT, 'core/formslib.js')).href)
  const { lintForm, stampDoc } = await import(pathToFileURL(path.join(ROOT, 'core/forms.js')).href)
  const lib = await loadForms({ explicit: FORMS })
  eq([lib.groups.length, lib.forms.length], [4, 79], '묶음 · 서식')
  const bad = []
  for (const f of lib.forms) {
    const p = lintForm(f)
    if (p.length) bad.push(`${f.id}: ${p[0]}`)
    const s = stampDoc(f)
    if (/\(예시\)|작성지침|<!--\s*applied/.test(s)) bad.push(`${f.id}: 빈 문서에 예시 · 작성지침 · applied`)
  }
  must(!bad.length, bad.slice(0, 4).join(' / '))
  // 서버 관리자의 길 — ctx forms check(같은 lint 를 읽을 때 단다)
  const c = await cli(['forms', 'check', '--forms', FORMS])
  must(c.code === 0 && /✓ 서식 79 · 문제 있는 서식 0/.test(c.stdout), 'ctx forms check — exit ' + c.code + ' · ' + c.stdout.slice(-120))
  return `${lib.forms.length}종 ok — ` + lib.groups.map((g) => `${g.name} ${lib.forms.filter((f) => f.group === g.name).length}`).join(' · ') + ' · ctx forms check 0'
})

await check(138, '팀 서식(<data>/forms) — 서식집에 「팀」 으로 든다 · 읽을 때 lint(problems) · 문제 있는 서식으로는 save 가 문서를 세우지 않는다 · 좋은 팀 서식은 찍힌다 · ctx forms check --data 가 깨진 것을 낸다(exit 1)', async () => {
  const D = path.join(F.repos, 'delta')
  const j = await apiJson('/api/delta/forms', TC)
  must(j.groups?.find((x) => x.name === 'team-x')?.origin === 'team', '팀 묶음 — ' + JSON.stringify(j.groups?.map((x) => [x.name, x.origin])))
  const good = j.forms.find((f) => f.id === 'team-x/T_001')
  const broken = j.forms.find((f) => f.id === 'team-x/T_002')
  must(good?.origin === 'team' && good.problems === 0, 'T_001 — ' + JSON.stringify(good))
  must(broken?.problems > 0, 'T_002 — ' + JSON.stringify(broken))
  const d = await M('/mcp/delta', 'forms', { repo: 'delta', form: 'team-x/T_002' }, TC)
  eq(d.problemList?.length, broken.problems, 'forms(form) 의 problemList')
  const n0 = await commits(D)
  const work = (id) => ({ id, title: '팀 서식으로 문서 세우기', date: '2026-09-22 17:00', touches: [], touchesEmpty: '등록부 행 · 빈 문서만', body: '팀 서식으로 시험대장을 세운다.' })
  const bad = await M('/mcp/delta', 'save', { repo: 'delta', work: work('2026-0922-팀서식-깨짐'), managed: [{ pattern: '깨진:*', doc: 'docs/깨진.md', form: 'team-x/T_002' }] }, TC)
  eq(bad.error?.code, 'E_INPUT', '깨진 서식 — ' + JSON.stringify(bad).slice(0, 160))
  must(/문제가 있다/.test(bad.error.message), bad.error.message)
  eq([await commits(D), await porcelain(D)], [n0, ''], '거절 뒤 커밋 · 트리')
  const ok = await M('/mcp/delta', 'save', { repo: 'delta', work: work('2026-0922-팀서식'), managed: [{ pattern: '시험대장:*', doc: 'docs/시험대장.md', form: 'team-x/T_001' }] }, TC)
  must(ok.commit, JSON.stringify(ok.error || ok).slice(0, 160))
  const doc = await fs.readFile(path.join(D, 'docs', '시험대장.md'), 'utf8')
  must(doc.startsWith('# 시험대장\n<!-- cdp:form team-x/T_001 -->') && !/예시|지침/.test(doc), '찍힌 문서 — ' + doc.slice(0, 80))
  const c = await cli(['forms', 'check', '--forms', FORMS, '--data', F.data])
  must(c.code === 1 && /✗ team-x\/T_002 \[팀\]/.test(c.stdout) && /문제 있는 서식 1/.test(c.stdout), 'ctx forms check --data — exit ' + c.code + ' · ' + c.stdout.slice(-200))
  return `팀 묶음 · T_001 문제 0 → 문서 찍힘(${ok.commit}) · T_002 문제 ${broken.problems} → save E_INPUT · ctx forms check --data exit 1`
})

// 헤딩이 든 body — 2026-09-23 실측. `section` 의 `body` 를 그대로 고쳐 save 에 보내니 헤딩이
// 두 번 들어가 섹션이 비었는데 save · check · where 어디서도 소리가 안 났다. 지금은 셋 —
// `section` 이 `content` 를 주고, save 가 헤딩 든 body 를 E_INPUT 으로 막고, check 가 같은 좌표
// 섹션 둘을 오류로 낸다.
await check(76, 'save(큐레이터) — sections[].body 에 헤딩 줄이 있으면 E_INPUT · section 은 content(헤딩 · applied 없는 본문)를 준다', async () => {
  const sec = await M('/mcp/alpha', 'section', { coord: EXP }, TC)
  must(typeof sec.content === 'string' && sec.content.length > 0, 'content 가 없다 — ' + JSON.stringify(sec).slice(0, 140))
  must(!/^#/.test(sec.content) && !/applied\s*:/.test(sec.content), 'content 에 헤딩이나 applied 가 있다')
  must(/^#/.test(sec.body), 'body 는 헤딩부터여야 한다')
  const d = await M(
    '/mcp/alpha',
    'save',
    {
      repo: 'alpha',
      work: { id: '2026-0923-검증-헤딩', title: '헤딩 든 body', date: '2026-09-23 10:00', touches: [EXP], body: '본문' },
      // 실사용 때의 모양 — applied 주석은 뺐는데 헤딩은 남긴 body. applied 가 남아 있으면
      // 2단계의 applied 거절이 먼저 나서 헤딩 거절을 못 본다.
      sections: [{ coord: EXP, applied: sec.applied, body: sec.body.split(NL).filter((l) => !/<!--\s*applied\s*:/i.test(l)).join(NL) }],
    },
    TC
  )
  eq(d.error?.code, 'E_INPUT', '헤딩 거절 — ' + JSON.stringify(d).slice(0, 140))
  must(/헤딩/.test(d.error.message), d.error.message)
  eq(await porcelain(path.join(F.repos, 'alpha')), '', 'save 가 쓴 것이 남았다')
  return `content ${sec.content.length}자 · E_INPUT · 트리 깨끗`
})

await check(77, 'check — 같은 좌표 섹션이 한 문서에 둘이면 dup-anchor 오류 (조용히 지나가지 않는다)', async () => {
  const R = path.join(F.repos, 'beta')
  const w = JSON.parse((await ctx('--repo', R, 'where', EXP, '--json')).stdout)
  const doc = path.join(R, w.section.doc)
  const orig = await fs.readFile(doc, 'utf8')
  try {
    await fs.writeFile(doc, orig.replace(/\s*$/, '') + NL + NL + w.section.anchor + NL + '<!-- applied: null -->' + NL + '중복 시험' + NL, 'utf8')
    const r = await cli(['--repo', R, 'check', '--json'])
    const j = JSON.parse(r.stdout)
    const f = (j.findings || []).find((x) => x.kind === 'dup-anchor')
    must(f && f.sev === 'error', 'dup-anchor 가 없다 — ' + JSON.stringify((j.findings || []).map((x) => x.kind)))
    eq(r.code, 1, 'check exit')
    return `${f.items.length}건 · ${String(f.items[0].detail).slice(0, 70)}`
  } finally {
    await fs.writeFile(doc, orig, 'utf8')
  }
})

await check(122, 'save 는 그 save 가 새로 만든 오류로만 막힌다(V21) — 레포에 원래 있던 오류(중복 섹션)는 경고로 · 새 오류(없는 기록을 정정)만 E_CHECK 이고 detail 에 그것만', async () => {
  const R = path.join(F.repos, 'beta')
  const w = JSON.parse((await ctx('--repo', R, 'where', EXP, '--json')).stdout)
  const doc = path.join(R, w.section.doc)
  const orig = await fs.readFile(doc, 'utf8')
  await fs.writeFile(doc, orig.replace(/\s*$/, '') + NL + NL + w.section.anchor + NL + '<!-- applied: null -->' + NL + '중복 — 남이 남긴 오류' + NL, 'utf8')
  await gitc(R, 'add', '-A')
  await gitc(R, 'commit', '-qm', '중복 섹션(남이 남긴 오류)')
  try {
    const ok = await M('/mcp/beta', 'save', { repo: 'beta', work: { id: '2026-0923-원래오류', title: '원래 오류', date: '2026-09-23 11:00', touches: ['table:rp_plnd_mst'], body: '레포에 오류가 있어도 이 기록은 남는다.' } }, TK3)
    must(ok.commit, '원래 있던 오류가 막았다 — ' + JSON.stringify(ok.error || ok).slice(0, 200))
    must(ok.warnings.some((x) => /레포에 원래 있던 오류/.test(x)), '경고 — ' + ok.warnings.join(' / '))
    const bad = await M('/mcp/beta', 'save', { repo: 'beta', work: { id: '2026-0923-새오류', title: '새 오류', date: '2026-09-23 11:10', touches: ['table:rp_plnd_mst'], supersedes: '2099-0101-없는기록', body: '없는 기록을 정정한다.' } }, TK3)
    eq(bad.error?.code, 'E_CHECK', '새 오류')
    eq(bad.error.detail.findings.map((f) => f.kind), ['broken-supersedes'], '이 save 가 만든 오류만')
    return `원래 오류 경고 · 커밋 ${ok.commit} · 새 오류만 E_CHECK`
  } finally {
    await fs.writeFile(doc, orig, 'utf8')
    await gitc(R, 'add', '-A')
    await gitc(R, 'commit', '-qm', '중복 섹션 되돌림')
  }
})

await check(136, 'save 커밋은 훅을 돌지 않는다(V5 · --no-verify) · 바꾼 것은 작업 기록 하나 — 도구 층 · INDEX · 등록부 사본을 만들지 않는다(I9)', async () => {
  const R = path.join(F.repos, 'beta')
  const hooks = path.join(TMP, 'hooks-fail')
  await fs.mkdir(hooks, { recursive: true })
  await fs.writeFile(path.join(hooks, 'pre-commit'), '#!/bin/sh\necho "[hook] 막는다" >&2\nexit 1\n')
  await fs.chmod(path.join(hooks, 'pre-commit'), 0o755)
  await run('git', ['-C', R, 'config', 'core.hooksPath', hooks])
  try {
    // 훅이 살아 있다 — 손 커밋은 막힌다(그래야 이 시험이 성립한다)
    const probe = await gitc(R, 'commit', '--allow-empty', '-qm', 'probe').then(() => true, () => false)
    must(!probe, '이 PC 에서 훅이 안 돈다 — 시험이 성립하지 않는다')
    const n0 = await commits(R)
    const o = await M('/mcp/beta', 'save', { repo: 'beta', work: { id: '2026-0923-훅없이', title: '훅 없이', date: '2026-09-23 12:00', touches: ['table:rp_plnd_mst'], body: '서버 save 는 훅을 돌지 않는다.' } }, TK3)
    must(o.commit, '훅이 save 를 막았다 — ' + JSON.stringify(o.error || o).slice(0, 200))
    eq(await commits(R), n0 + 1, '커밋 수')
    eq(await headFiles(R), ['work/2026-0923-훅없이.md'], '커밋에 든 파일')
    const left = []
    for (const f of TOOL_LAYER) if (await exists(path.join(R, f))) left.push(f)
    eq(left, [], '레포의 도구 층')
    return `훅 exit 1 인데 커밋 ${o.commit} · 파일 하나 · 도구 층 0`
  } finally {
    await run('git', ['-C', R, 'config', '--unset', 'core.hooksPath']).catch(() => {})
  }
})

await check(75, '스킬이 부르는 이름이 전부 v1.0 도구다 — derive · apply · sync · version 을 부르지 않는다 · 모드 갈래 잔재 0', async () => {
  // 스킬은 에이전트 행동을 직접 바꾼다. **없는 이름을 적어도 아무도 모른다** —
  // 실제로 `ctx term` 이 `match` 에 흡수된 뒤에도 예시에 남아 있었다. v1.0 은 모드 A 를 끝냈고(개편안 §5.6 · A1)
  // derive · apply · sync · version 이 빠진다(§5.3) — SKILL.md 와 같은 폴더의 참고 파일 어디에도 그 호출 · 모드 갈래가 없어야 한다.
  const { buildServer } = await import(pathToFileURL(path.join(ROOT, 'viewer/bin/ctx-mcp.mjs')).href)
  const srv = buildServer({
    repos: [{ name: 'alpha', root: path.join(TMP, 'repos', 'alpha') }],
    fallback: 'alpha',
    mode: 'server',
    prompts: 'never',
    saver: () => ({}),
    curateAny: true, // 큐레이터 도구(queue · forms)까지 — cdp-curate 가 부른다
    sourcer: () => ({}), // source — cdp-seed 가 부른다(MCP 만으로 검토 ②)
  })
  const GONE = ['derive', 'apply', 'sync', 'version']
  const all = Object.keys(srv._registeredTools || {})
  must(all.length >= 12, `도구 목록을 못 읽었다 (${all.length})`)
  must(!all.some((t) => GONE.includes(t)), '없앤 도구가 등록돼 있다')
  const known = new Set(all)

  const dir = path.join(ROOT, 'agent', 'skills')
  const bad = []
  let files = 0
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    if (!e.isDirectory()) continue
    const n = e.name
    for (const f of (await fs.readdir(path.join(dir, n))).filter((x) => x.endsWith('.md'))) {
      const text = await fs.readFile(path.join(dir, n, f), 'utf8')
      files++
      for (const s of ['도구가 없을 때', '모드 A', '모드 B', 'bin/ctx', 'ctx apply', 'C:/cdp/bin', 'ctx seed', 'ctx follow', 'ctx update', 'ctx repo', 'ctx rebuild']) if (text.includes(s)) bad.push(`${n}/${f}: 「${s}」`)
      for (const m of text.matchAll(/(?<![\w.])(derive|apply|sync|version)\(/g)) bad.push(`${n}/${f}: ${m[1]}(`)
      if (n === 'cdp-push') continue // 코드 레포용 — 지식 도구를 부르지 않는다
      for (const m of text.matchAll(/^\s*([a-z][a-z_]{2,15})\(/gm)) if (!known.has(m[1])) bad.push(`${n}/${f}: ${m[1]}(`)
    }
  }
  must(bad.length === 0, bad.slice(0, 6).join(' · '))
  return `${files}개 파일 · 도구 ${known.size}종과 대조 · 잔재 0`
})

// ══ 제품 관리 서비스 — 사이트 · 마법사 ═══════════════════════════════════════

await check(78, '/site/info — 공개 · 레포 이름 없음 · setupNeeded false · 설명서 목록', async () => {
  const H0 = http(BASE) // 쿠키 없는 새 클라이언트
  const r = await H0.call('/site/info')
  eq(r.status, 200, 'status')
  const t = await r.text()
  for (const n of ['alpha', 'beta']) must(!t.includes(n), `${n} 이 노출됐다`)
  const j = JSON.parse(t)
  must(typeof j.repos === 'number', 'repos 가 숫자가 아니다')
  eq(j.setupNeeded, false, 'setupNeeded')
  must(Array.isArray(j.manuals) && j.manuals.length >= 3, `설명서 ${j.manuals?.length}`)
  must(j.version, 'version 없음')
  eq([j.user, j.curate], [null, []], '세션 없이 user · curate')
  // 세션이 있으면 user · role · curate(큐레이션할 수 있는 레포 — 화면이 메뉴를 가른다)만 더 온다
  const me = JSON.parse(await (await H.call('/site/info')).text())
  must(me.user && Array.isArray(me.curate), '세션이 있는데 user · curate 가 없다 — ' + JSON.stringify(me).slice(0, 120))
  return `repos ${j.repos} · 설명서 ${j.manuals.length} · v${j.version} · 세션 user ${me.user} · curate [${me.curate}]`
})

if (WEB_OK) {
  await check(79, '/site/manual — 책 200 · 설치절차 200 · 경로 밖 404 · 목록 밖 404 · 소개 그림 · /manual 화면 · /console 은 로그인으로', async () => {
    const H0 = http(BASE)
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
} else skip(79, '/site/manual — 책 · 설치절차 · 경로 밖 · 화면', NO_WEB)

await check(80, '명부가 비면 bootstrap.code · /setup 이 첫 관리자를 만든다 · 코드는 한 번 · 둘째는 409', async () => {
  const D2 = path.join(TMP, 'data2')
  const A2 = path.join(TMP, 'auth2.json')
  await fs.mkdir(D2, { recursive: true })
  const S2 = serve(['--root', F.repos, '--port', String(PORT + 1), '--auth', A2, '--data', D2, '--web', WEB, '--kit', KIT])
  try {
    await ready(PORT + 1)
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
    const me = await (await http(`http://127.0.0.1:${PORT + 1}`).call('/me', bearer(j.raw))).json()
    eq(me.role, 'admin', 'role')
    eq(me.admin, true, 'admin')
    eq(me.curate, ['*'], 'admin 은 모든 레포의 큐레이터')
    eq((await (await http(`http://127.0.0.1:${PORT + 1}`).call('/site/info')).json()).setupNeeded, false, 'setupNeeded 뒤')
    const log = await fs.readFile(path.join(D2, 'logs', 'auth.log'), 'utf8')
    must(/setup · user add · root · repos=\* · role=admin/.test(log), 'auth.log')
    must(!log.includes(j.raw), '원문이 샜다')
    return `코드 ${code.length}자 · 401 · 400 · 200 · 409 · admin(curate *) · 30일 ${j.expires}`
  } finally {
    S2.kill()
  }
})

// ══ 제품 관리 서비스 — 콘솔 API ═════════════════════════════════════════════

// 관리자 — 지금까지 kjsa 는 writer(--write) 였다. 콘솔은 admin 만 들어간다(D4). admin 은 모든 레포의 큐레이터다(V2).
await ctx('serve', 'user', 'set', '--auth', F.auth, '--name', 'kjsa', '--role', 'admin', '--data', F.data)
// 앞 검사들이 TK 를 폐기했다(37) — 살아 있는 토큰을 새로 받는다
const TKA = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'kjsa', '--note', '콘솔 검증', '--data', F.data)).stdout.trim()
const TQA = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '콘솔 검증', '--data', F.data)).stdout.trim()
await wait(80)
const ADM = (token, extra = {}) => ({ headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json', ...(extra.cookie ? { cookie: extra.cookie } : {}) } })
const A = (p, opt = {}) => fetchR(`${BASE}${p}`, { redirect: 'manual', ...opt })
const jbody = (b) => ({ body: JSON.stringify(b) })
let SU = null // 재인증 쿠키 — 82 가 받는다. 15분짜리라 뒤 항목(87 · 127 · 128 …)은 쓰기 전에 다시 받는다(부하 걸린 기계에서 넘긴다)
const resudo = async () => {
  const su = await A('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: TKA }) })
  SU = /cdp_su=[^;]*/.exec(su.headers.get('set-cookie') || '')?.[0] || SU
  return SU
}

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

await check(134, '/admin/users 가 curate 를 받는다 — writer 는 레포별 큐레이터 · viewer 는 될 수 없다(빈다) · /me 의 curate(admin 은 *) · auth.log', async () => {
  const r = await A('/admin/users', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'cur2', role: 'writer', repos: ['alpha'], curate: ['alpha'] }) })
  eq(r.status, 200, '추가')
  eq((await r.json()).curate, ['alpha'], 'writer 의 curate')
  const v = await A('/admin/users/qa', { method: 'PATCH', ...ADM(TKA, { cookie: SU }), ...jbody({ curate: ['alpha'] }) })
  eq(v.status, 200, 'viewer PATCH')
  eq((await v.json()).curate, [], 'viewer 는 큐레이터가 될 수 없다')
  const me = async (t) => (await (await A('/me', bearer(t))).json()).curate
  eq(await me(TC), ['alpha', 'delta'], 'cur')
  eq(await me(TKA), ['*'], 'admin')
  eq(await me(TW), [], 'writer')
  const log = await fs.readFile(path.join(F.data, 'logs', 'auth.log'), 'utf8')
  must(/admin user add · kjsa · cur2 · .*curate=alpha/.test(log), 'auth.log')
  return 'cur2 curate alpha · viewer [] · /me cur [alpha, delta] · admin [*] · writer []'
})

await check(83, '/admin/tokens — 원문 1회 · 목록에 원문 없음 · reissue 뒤 옛 401 새 200 · 폐기 행이 남는다 · PATCH · revoke', async () => {
  const iss = await A('/admin/tokens', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ user: 'con1', note: '콘솔' }) })
  eq(iss.status, 200, '발급')
  const t1 = await iss.json()
  must(t1.raw && t1.id, '원문 · id')
  eq((await A('/me', bearer(t1.raw))).status, 200, '새 토큰이 산다')
  const list = await (await A('/admin/tokens', ADM(TKA))).json()
  must(!JSON.stringify(list).includes(t1.raw), '목록에 원문')
  must(list.tokens.some((t) => t.id === t1.id && t.status === 'active'), '행')
  const re = await A(`/admin/tokens/${t1.id}/reissue`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })
  eq(re.status, 200, '재발급')
  const t2 = await re.json()
  eq(t2.old, t1.id, 'old')
  eq((await A('/me', bearer(t1.raw))).status, 401, '옛 토큰 401')
  eq((await A('/me', bearer(t2.raw))).status, 200, '새 토큰 200')
  const list2 = await (await A('/admin/tokens', ADM(TKA))).json()
  const oldRow = list2.tokens.find((t) => t.id === t1.id)
  eq(oldRow.status, 'revoked', '폐기 행이 남는다')
  eq(oldRow.revokedBy, 'kjsa', 'revokedBy')
  const pt = await A(`/admin/tokens/${t2.id}`, { method: 'PATCH', ...ADM(TKA, { cookie: SU }), ...jbody({ note: '콘솔 · 메모', expires: 10 }) })
  eq(pt.status, 200, 'PATCH')
  eq((await pt.json()).note, '콘솔 · 메모', 'note')
  const rv = await A(`/admin/tokens/${t2.id}/revoke`, { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })
  eq(rv.status, 200, '폐기')
  eq((await A('/me', bearer(t2.raw))).status, 401, '폐기 뒤 401')
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

await check(86, '/admin/doctor(캐시 · kit · forms 줄) · /admin/server(forms · kit 자리) · /admin/repos(curation 열) · /admin/workrepos · /admin/audit · /admin/log · /admin/overview — 모양', async () => {
  const d = await (await A('/admin/doctor', ADM(TKA))).json()
  must(Array.isArray(d.rows) && d.rows.every((r) => ['ok', 'warn', 'fail'].includes(r.state) && r.what), 'doctor 줄')
  must(d.rows.some((r) => r.what === '명부'), '명부 줄')
  for (const w of ['kit', 'forms']) must(d.rows.find((r) => r.what === w)?.state === 'ok', `doctor ${w} 줄 — ` + JSON.stringify(d.rows.find((r) => r.what === w)))
  const d2 = await (await A('/admin/doctor', ADM(TKA))).json()
  eq(d2.at, d.at, '60초 캐시')
  const sv = await (await A('/admin/server', ADM(TKA))).json()
  must(sv.version && sv.bind && sv.port === PORT && sv.root, 'server 값')
  must(sv.kit === KIT && typeof sv.forms === 'string' && sv.forms.length > 0, `server 의 kit · forms 자리 — ${sv.kit} · ${sv.forms}`)
  const rp = await (await A('/admin/repos', ADM(TKA))).json()
  must(rp.repos.some((r) => r.name === 'alpha' && Array.isArray(r.users) && r.users.includes('qa')), '레포 전부 · 볼 수 있는 사람')
  const al = rp.repos.find((r) => r.name === 'alpha')
  must(al.curation && typeof al.curation.queue === 'number' && 'oldestDays' in al.curation && typeof al.curation.stale === 'boolean', 'curation 열 — ' + JSON.stringify(al.curation))
  const wrr = await (await A('/admin/workrepos', ADM(TKA))).json()
  must(Array.isArray(wrr.repos) && wrr.repos.every((w) => w.state), '대장 전부')
  const au = await (await A('/admin/audit?limit=5', ADM(TKA))).json()
  eq(au.lines.length, 5, '감사 5줄')
  must(au.total > 5, 'total')
  const lg = await (await A('/admin/log?limit=3', ADM(TKA))).json()
  eq(lg.lines.length, 3, '로그 3줄')
  const ov = await (await A('/admin/overview', ADM(TKA))).json()
  must(ov.users.admins >= 1 && typeof ov.repos.count === 'number' && Array.isArray(ov.alerts), 'overview')
  return `doctor ${d.rows.length}줄(fail ${d.fails}) · server v${sv.version} · repos ${rp.repos.length} · alpha 대기 ${al.curation.queue} · alerts ${ov.alerts.length}`
})

await check(87, 'POST /admin/repos — clone 으로 붙인다 · grant 로 접근을 준다 · 중복 409 · 지식 레포가 아니면 지운다', async () => {
  await resudo()
  // 원격 = 서버 안의 alpha 폴더(파일 경로). 실제 clone 이 돈다
  const r = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'gamma', clone: path.join(F.repos, 'alpha'), grant: ['qa'] }) })
  eq(r.status, 200, 'clone')
  const j = await r.json()
  must(j.cloned && j.commit, 'commit')
  eq(j.granted, ['qa'], 'granted')
  const rp = await (await A('/admin/repos', ADM(TKA))).json()
  must(rp.repos.some((x) => x.name === 'gamma' && x.users.includes('qa')), 'qa 가 gamma 를 본다')
  const mine = await (await A('/repos', bearer(TQA))).json()
  must(mine.some((x) => x.name === 'gamma'), 'qa 의 /repos 에 gamma')
  eq((await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'gamma', clone: path.join(F.repos, 'alpha') }) })).status, 409, '중복')
  const bad = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'notrepo', clone: path.join(ROOT, 'ops') }) })
  must(bad.status >= 400, '지식 레포가 아니면 실패')
  must((await fs.stat(path.join(F.repos, 'notrepo')).catch(() => null)) === null, '지웠다')
  eq(await hooksPath(path.join(F.repos, 'gamma')), '', 'clone 에 훅을 걸지 않는다')
  return `gamma ${j.commit} · grant qa · 409 · 지움 · 훅 없음`
})

await check(127, 'POST /admin/repos 빈 틀 — README · _vocab · _managed · docs/ · work/ · .gitattributes · .gitignore 만 · 훅 · 도구 층 없음 · records 없음 · grant · 대기 0 · 이름 형식 400 · 중복 409', async () => {
  await resudo()
  const r = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'blank1', title: '콘솔 빈 틀 시험', grant: ['wr'] }) })
  eq(r.status, 200, '세우기')
  const j = await r.json()
  must(/^[0-9a-f]{7,}$/.test(j.commit || ''), 'commit')
  eq([j.records, j.moved, j.granted], [null, 0, ['wr']], 'records · moved · granted')
  const B1 = path.join(F.repos, 'blank1')
  eq((await gitc(B1, 'ls-files')).stdout.split(/\r?\n/).filter(Boolean).sort(), SKELETON, '빈 틀의 파일')
  eq(await hooksPath(B1), '', '훅 경로')
  const readme = await fs.readFile(path.join(B1, 'README.md'), 'utf8')
  must(readme.startsWith('# blank1\n\n콘솔 빈 틀 시험'), 'README 머리 — ' + readme.slice(0, 40))
  const rp = await (await A('/admin/repos', ADM(TKA))).json()
  const row = rp.repos.find((x) => x.name === 'blank1')
  must(row && row.users.includes('wr') && row.curation?.queue === 0, 'admin/repos 행 — ' + JSON.stringify(row).slice(0, 160))
  eq((await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: '한글 이름' }) })).status, 400, '이름 형식')
  eq((await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'blank1' }) })).status, 409, '중복')
  // 레포마다 도구 층을 갈던 길(kit-refresh)은 없다 — kit 은 서버 번들에서 나간다(v1.0 W5)
  eq((await A('/admin/repos/blank1/kit', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({}) })).status, 404, 'POST /admin/repos/<r>/kit')
  const b = await M('/mcp/blank1', 'brief', {}, TKA)
  eq([b.works, b.managedDocs], [0, 0], 'brief')
  return `blank1 ${j.commit} · 파일 ${SKELETON.length} · grant wr · 대기 0 · /kit 갈기 404`
})

await check(128, '다시 세우기 — 콘솔 POST /admin/repos { recordsFrom } · CLI ctx repo new --records-from: 사람의 작업 기록 · 첨부 · 그 기록의 어휘만 옮긴다 · 관리 문서 · 등록부 행 없음 · 옮긴 기록은 전부 대기열 · 없는 레포는 404', async () => {
  const old = await loadRepo(path.join(F.repos, 'alpha'))
  const human = old.works.filter((d) => recordKind(d) === 'work')
  await resudo()
  const r = await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'rebuilt', recordsFrom: 'alpha', grant: ['wr'] }) })
  eq(r.status, 200, '다시 세우기')
  const j = await r.json()
  eq([j.moved, j.records?.from], [human.length, 'alpha'], 'moved · from')
  const RB = path.join(F.repos, 'rebuilt')
  const files = (await gitc(RB, 'ls-files')).stdout.split(/\r?\n/).filter(Boolean)
  eq(files.filter((f) => /^work\/[^/]+\.md$/.test(f)).length, human.length, '옮긴 기록 파일')
  eq(files.filter((f) => f.startsWith('docs/')), ['docs/.gitkeep'], '관리 문서는 옮기지 않는다')
  must(files.some((f) => f.startsWith('work/assets/')), '첨부를 안 옮겼다')
  const nr = await loadRepo(RB)
  eq(nr.registry?.rules?.length ?? 0, 0, '등록부 행')
  const touched = new Set(human.flatMap((d) => d.touches || []))
  must([...nr.vocab.coords.keys()].every((c) => touched.has(c)), '옮긴 기록이 안 건드린 좌표가 왔다')
  const q = await apiJson('/api/rebuilt/queue', TKA)
  eq([q.total, q.implicit], [human.length, false], '대기열 — 전부 대기')
  const row = (await (await A('/admin/repos', ADM(TKA))).json()).repos.find((x) => x.name === 'rebuilt')
  eq(row?.curation?.queue, human.length, 'admin/repos 의 대기')
  eq((await A('/admin/repos', { method: 'POST', ...ADM(TKA, { cookie: SU }), ...jbody({ name: 'rebuilt2', recordsFrom: '없는레포' }) })).status, 404, '없는 옛 레포')
  // CLI — 같은 core/reponew
  const c = await cli(['repo', 'new', path.join(TMP, 'rebuilt-cli'), '--records-from', path.join(F.repos, 'alpha')])
  eq(c.code, 0, 'CLI — ' + c.stderr.slice(0, 120))
  eq(Number(/작업 기록 (\d+)건/.exec(c.stdout)?.[1]), human.length, 'CLI 가 옮긴 기록')
  return `기록 ${human.length} · 첨부 · 어휘 ${nr.vocab.coords.size} · 대기 ${q.total} · CLI 같음 · 404`
})

await check(123, 'POST /api/<r>/curate — 기록으로 둠(keep) · 큐레이터만(writer 403 need curate) · 화면은 keep 만(reflect 400) · 대기열에서 빠진다 · 이력 · 기록의 상태 kept', async () => {
  const q = await apiJson('/api/rebuilt/queue', TKA)
  must(q.total >= 2, '대기가 모자란다')
  const ids = q.items.slice(0, 2).map((x) => x.id)
  const post = (t, b) => fetch(`${BASE}/api/rebuilt/curate`, { method: 'POST', headers: { authorization: 'Bearer ' + t, 'content-type': 'application/json' }, body: JSON.stringify(b) })
  const w = await post(TW, { verdict: 'keep', ids, reason: 'x' })
  eq(w.status, 403, 'writer')
  eq((await w.json()).error.detail?.need, 'curate', 'need')
  eq((await H.call('/api/rebuilt/queue/' + encodeURIComponent(ids[0]), bearer(TW))).status, 403, 'writer 의 판정 재료')
  eq((await post(TKA, { verdict: 'reflect', ids, reason: 'x' })).status, 400, 'reflect 는 에이전트 세션의 일')
  const ok = await post(TKA, { verdict: 'keep', ids, reason: '회의 · 사업분석 기록 — 기록이 원천' })
  eq(ok.status, 200, 'keep')
  const o = await ok.json()
  must(o.commit, JSON.stringify(o).slice(0, 160))
  const q2 = await apiJson('/api/rebuilt/queue', TKA)
  eq(q2.total, q.total - 2, '대기열')
  must(!q2.items.some((x) => ids.includes(x.id)), '판정한 기록이 대기에 남았다')
  const h = await apiJson('/api/rebuilt/curations', TKA)
  must(h.items?.[0]?.judgments?.length === 2 && h.items[0].judgments.every((x) => x.verdict === 'keep'), '이력 — ' + JSON.stringify(h.items?.[0]).slice(0, 160))
  const st = (await M('/mcp/rebuilt', 'work', { id: ids[0] }, TKA)).curation
  eq([st?.state, st?.reason], ['kept', '회의 · 사업분석 기록 — 기록이 원천'], '기록의 상태')
  return `keep 2 · 커밋 ${o.commit} · 대기 ${q.total} → ${q2.total} · writer 403`
})

await check(137, '기준선 extract → push — 옛 레포(alpha)의 테이블정의서 섹션을 다시 세운 레포(rebuilt)의 기준선 블록으로: 등록부 행 · 어휘 · 블록 n · applied 는 null · 대기열은 그대로(기준선은 미반영을 만들지 않는다)', async () => {
  const RB = path.join(F.repos, 'rebuilt')
  const x = await cli(['baseline', 'extract', path.join(F.repos, 'alpha'), '--doc', 'docs/테이블정의서.md', '--src', '옛 레포 alpha 테이블정의서', '--asof', '2026-09-22'])
  eq(x.code, 0, 'extract — ' + x.stderr.slice(0, 120))
  const j = JSON.parse(x.stdout)
  must(j.items?.length > 0 && j.managed?.some((m) => m.pattern === 'table:*') && j.vocab?.length === j.items.length, 'extract JSON — ' + x.stdout.slice(0, 200))
  must(j.items.every((it) => !/\*\*(변경|경과)\*\*/.test(it.body)), '옛 반영 이력이 블록에 들어갔다')
  const json = path.join(TMP, 'baseline-rebuilt.json')
  await fs.writeFile(json, x.stdout)
  const q0 = (await apiJson('/api/rebuilt/queue', TKA)).total
  const r = await cli(['baseline', 'push', json, '--server', BASE, '--repo', 'rebuilt'], { env: { CDP_TOKEN: TKA } })
  eq(r.code, 0, 'push — ' + (r.stderr || r.stdout).slice(0, 160))
  must(new RegExp(`블록 ${j.items.length} · 등록부 1`).test(r.stdout), r.stdout.slice(0, 160))
  const one = j.items[0]
  const s = await M('/mcp/rebuilt', 'section', { coord: one.coord }, TKA)
  must(s.baseline?.src === '옛 레포 alpha 테이블정의서' && s.baseline.asof === '2026-09-22' && s.applied === null, '섹션 — ' + JSON.stringify({ b: s.baseline?.src, a: s.applied }))
  eq((await until(() => apiJson('/api/rebuilt/queue', TKA), (q) => q.total === q0)).total, q0, '대기열')
  eq(await porcelain(RB), '', '트리')
  eq((await M('/mcp/rebuilt', 'check', {}, TKA)).errors, 0, 'check')
  return `섹션 ${j.items.length} → 블록 ${j.items.length} · 등록부 table:* · 대기 ${q0} 그대로`
})

await check(135, '작업 레포 설치 한 줄은 역할과 무관하게 writer kit — 큐레이터(admin) 토큰으로 깔아도 스킬 셋 · 작업 레포 블록 · 대장 「최신」(설치한 kit 과 대장이 대는 kit 이 같다)', async () => {
  const ok = await A('/workrepos', { method: 'POST', ...ADM(TKA), ...jbody({ name: 'admin-app', knowledge: 'alpha', owner: 'kjsa' }) })
  const id = (await ok.json()).id
  const W6 = path.join(TMP, 'work6')
  await fs.mkdir(W6, { recursive: true })
  await run('git', ['-C', W6, 'init', '-q'])
  const a = await installer(W6, ['--repo', 'alpha', '--workrepo', id, '.', '--yes', '--no-save'], { CDP_TOKEN: TKA, CDP_CONFIG_DIR: path.join(TMP, 'cdp-config-135') })
  must(/대장에 보고했습니다/.test(a.stdout), '보고 없음 — ' + a.stdout.slice(-120))
  const skills = (await fs.readdir(path.join(W6, '.claude', 'skills'))).sort()
  const row = (await (await A('/workrepos', ADM(TKA))).json()).repos.find((r) => r.id === id)
  eq(row?.state, '최신', `대장 — 설치한 kit ${row?.applied?.kit}(스킬 ${skills.length}) · 대장이 대는 kit ${row?.kitNow}`)
  eq(skills, WRITER_SKILLS, '작업 레포에 깔린 스킬')
  must(/업무 맥락 — CDP/.test(await fs.readFile(path.join(W6, 'CLAUDE.md'), 'utf8')), '작업 레포 블록이 아니다')
  return `대장 최신 · 스킬 ${skills.length} · 작업 레포 블록`
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
  const S3 = serve(['--root', F.repos, '--port', String(PORT + 2), '--auth', A3, '--data', D3, '--admin-from', '10.0.0.0/8', '--kit', KIT])
  try {
    await ready(PORT + 2)
    const base = `http://127.0.0.1:${PORT + 2}`
    const me = await (await fetch(`${base}/me`, bearer(rawOld))).json()
    eq(me.role, 'writer', 'write:true → writer')
    eq(me.admin, false, 'admin 아님')
    eq(me.curate, [], '옛 명부에는 큐레이터가 없다')
    eq((await fetch(`${base}/admin/users`, bearer(rawOld))).status, 403, 'writer 403')
    await ctx('serve', 'user', 'set', '--auth', A3, '--name', 'old', '--role', 'admin')
    await wait(80)
    eq((await fetch(`${base}/admin/users`, bearer(rawOld))).status, 403, 'CIDR 밖')
    eq((await fetch(`${base}/site/info`)).status, 200, '/site/info 는 공개')
    eq((await fetch(`${base}/me`, bearer(rawOld))).status, 200, '/me 는 대역과 무관')
    return 'writer · curate [] · 403 · admin 뒤 CIDR 403 · info 200'
  } finally {
    S3.kill()
  }
})

// ── 화면 UX 검토 v0.1 (2026-09-24) — 없는 주소 · 권한 밖 레포 ────────────────────────────────
if (WEB_OK) {
  await check(89, '없는 주소 — 브라우저(text/html)면 화면 404+index · JSON 은 지금처럼 401 · 세션이 있어도 화면 · /api 접두는 그대로', async () => {
    const H0 = http(BASE)
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
    const T = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '검증 90', '--data', F.data)).stdout.trim()
    const HQ = http(BASE)
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
} else {
  skip(89, '없는 주소 — 브라우저면 화면 404+index', NO_WEB)
  skip(90, '권한 밖 · 없는 레포 — /r?from=<x>', NO_WEB)
}

// ── 화면 · 권한 검토 v0.1 (2026-09-28) — 98~103. 역할 경계 · 첫 페인트 전 테마 · 로그아웃 JSON ────────────────────
const TV = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'qa', '--note', '검증 100', '--data', F.data)).stdout.trim()
await wait(80)
const BR = (t) => ({ authorization: 'Bearer ' + t, 'content-type': 'application/json' })

await check(98, 'writer 의 POST /repos → 404 — 레포 화면의 세우기는 「막은 것이 아니라 없는 것」', async () => {
  const r = await A('/repos', { method: 'POST', headers: BR(TW), body: JSON.stringify({ name: 'zz-writer' }) })
  eq(r.status, 404, 'writer')
  eq((await A('/repos', { method: 'POST', headers: BR(TKA), body: JSON.stringify({ name: 'zz-admin' }) })).status, 404, 'admin 도 — 길은 콘솔 하나')
  must((await fs.stat(path.join(F.repos, 'zz-writer')).catch(() => null)) === null, '아무것도 만들지 않았다')
  return 'writer 404 · admin 404'
})

await check(99, 'writer 의 POST /admin/repos → 403 — 지식 레포를 세우는 것은 admin(콘솔 · 재인증)', async () => {
  eq((await A('/admin/repos', { method: 'POST', headers: BR(TW), body: JSON.stringify({ name: 'zz' }) })).status, 403, 'writer')
  eq((await A('/admin/repos', { method: 'POST', headers: BR(TKA), body: JSON.stringify({ name: 'zz' }) })).status, 401, 'admin 도 재인증 없이는 401 E_REAUTH')
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

await check(101, 'viewer 의 GET /api/<레포>/git · /git/config → 404 — 서버에 없는 로컬형 문법', async () => {
  eq((await A('/api/alpha/git', { headers: BR(TV) })).status, 404, '/git')
  eq((await A('/api/alpha/git/config', { headers: BR(TV) })).status, 404, '/git/config')
  eq((await A('/api/alpha/git', { headers: BR(TKA) })).status, 404, 'admin 도')
  eq((await A('/api/alpha/repo', { headers: BR(TV) })).status, 200, '읽기 API 는 그대로')
  return '404 · 404 · 404 · /repo 200'
})

if (WEB_OK) {
  await check(102, 'GET /r/<레포>/ 의 index.html — 서버 표식이 <head> 첫 줄 · 인라인 테마 <script> 가 <link rel=stylesheet> 앞', async () => {
    const HV = http(BASE)
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
} else skip(102, 'GET /r/<레포>/ 의 index.html — 표식 · 테마 순서', NO_WEB)

await check(103, 'POST /logout → 200 JSON · 쿠키를 지운다 · GET /logout 302 는 남는다', async () => {
  const HL = http(BASE)
  eq((await HL.call('/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: TV }) })).status, 200, '로그인')
  eq((await HL.call('/me')).status, 200, '세션')
  const r = await fetch(`${BASE}/logout`, { method: 'POST', headers: { cookie: HL.cookie() }, redirect: 'manual' })
  eq(r.status, 200, 'POST')
  eq((await r.json()).ok, true, 'JSON')
  must(/cdp_s=;|cdp_s=[^;]*;[^,]*Max-Age=0/i.test(r.headers.get('set-cookie') || ''), '쿠키 지움')
  const g = await fetch(`${BASE}/logout`, { redirect: 'manual' })
  eq(g.status, 302, 'GET 302')
  return 'POST 200 {ok} · 쿠키 지움 · GET 302'
})

// ── 동시 기록 검토 v0.1 (2026-09-25) — 91~97. `--mirror` 서버를 하나 더(PORT + 9) · bare origin · `—` 규칙 ────────────
//
// 판은 fixture 를 `mu` 로 다시 복사해 세운다 — `note:*` → `docs/회의록.md` `—`(문서 전체) 규칙과 `## note` 타입을
// 더한 것만 alpha 와 다르다. 명부는 같은 auth.json — kjsa admin(모든 레포의 큐레이터) · mw writer + 큐레이터(*) ·
// mv viewer · mx writer(기록만 — v1.0 의 writer 경계를 본다).
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
await gitRepo(MU)
await run('git', ['init', '-q', '--bare', MBARE])
await run('git', ['-C', MU, 'remote', 'add', 'origin', MBARE])
await run('git', ['-C', MU, 'push', '-q', '-u', 'origin', 'HEAD'])
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'mw', '--repos', '*', '--role', 'writer', '--curate', '*', '--data', F.data)
const TMW = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'mw', '--data', F.data)).stdout.trim()
// 읽기만 하는 사람 — 첨부 올리기가 403 인지(112)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'mv', '--repos', '*', '--data', F.data)
const TMV = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'mv', '--data', F.data)).stdout.trim()
// 기록만 쓰는 사람 — 섹션 · 등록부 · edits · drop 이 E_FORBIDDEN 이고 첨부 · 기록은 되는지(110 · 112 · 114 · 115 · 116)
await ctx('serve', 'user', 'add', '--auth', F.auth, '--name', 'mx', '--repos', '*', '--role', 'writer', '--data', F.data)
const TMX = (await ctx('serve', 'token', '--auth', F.auth, '--user', 'mx', '--data', F.data)).stdout.trim()
const SM = serve(['--root', MROOT, '--port', String(MPORT), '--auth', F.auth, '--data', MDATA, '--mirror', '--web', WEB, '--kit', KIT])
await ready(MPORT)
const HM = http(`http://127.0.0.1:${MPORT}`)
const AM = (p, opt = {}) => fetchR(`http://127.0.0.1:${MPORT}${p}`, { redirect: 'manual', ...opt })
const mtool = async (name, args, tk) => payload((await HM.rpc('/mcp/mu', 'tools/call', { name, arguments: { repo: 'mu', ...args } }, tk)).j)
const gitq = (...a) => run('git', ['-C', MU, '-c', 'core.quotepath=false', ...a]).then((r) => r.stdout.trim())
const mrepo = async (tk = TKA) => (await (await AM('/repos', bearer(tk))).json()).find((r) => r.name === 'mu')
// 미러 큐가 끝날 때까지 — `/repos` 의 행이 조건을 만족할 때까지 기다린다(최대 ms). 문자열이면 그 상태(사유까지 실린 뒤)
// 60초 — 부하 걸린 기계(다른 프로젝트의 시험이 돌던 2026-09-30)에서 로컬 bare 로의 push 가 10초를 넘겼다. 맞으면 바로 돌아온다
const untilMirror = async (want, ms = 60000) => {
  const t0 = Date.now()
  const ok = typeof want === 'function' ? want : (r) => r.mirror === want && (want === 'ok' || want === 'off' || !!r.mirrorReason)
  for (;;) {
    const r = await mrepo()
    if (ok(r)) return r
    if (Date.now() - t0 > ms) return r
    await wait(300)
  }
}
// 재인증 쿠키 — 복구 단추(sync · push · restore)를 누르기 **바로 전에** 받는다. 한 항목 안에서 한 번 받아 두면 그 항목이
// 앞에서 넘어질 때 뒤 항목이 401 로 줄줄이 넘어지고(2026-10-07 — 93 이 진단에서 넘어져 95 의 restore 가 401 · 트리가 더러운 채로
// 110~116 까지), 부하 걸린 기계에서는 15분이 지나 만료된다
const sudoM = async () => {
  const su = await AM('/admin/sudo', { method: 'POST', ...ADM(TKA), ...jbody({ token: TKA }) })
  return /cdp_su=[^;]*/.exec(su.headers.get('set-cookie') || '')?.[0] || null
}
// 진단 · 「origin 과 맞추기」 는 원격을 친다 — core 의 상한(ls-remote 10초 · fetch 30초)을 부하 걸린 기계가 넘기면 사유가
// 「10초 안에 닿지 않았다」 · fetch 로 나온다(2026-10-07 — 로컬 bare 인데도). **그 사유일 때만** 두 번까지 다시 묻는다 —
// 진짜 실패(갈라짐 · non-ff)는 다시 물어도 그대로다
const doctorM = async () => {
  let d = null
  for (let i = 0; i < 3; i++) {
    d = await (await AM('/admin/doctor?fresh=1', ADM(TKA))).json()
    if (!d.rows?.some((x) => /^레포 mu/.test(x.what) && /10초 안에 닿지 않았다/.test(x.note))) break
  }
  return d
}
const syncM = async () => {
  let r = null
  let j = null
  for (let i = 0; i < 3; i++) {
    r = await AM('/admin/repos/mu/sync', { method: 'POST', ...ADM(TKA, { cookie: await sudoM() }), ...jbody({}) })
    j = await r.json()
    if (!(r.status === 409 && j.reason === 'fetch')) break
  }
  return { status: r.status, j }
}

try {
  await check(91, '동시 save 5건(다른 섹션 · Promise.all · --mirror · 큐레이터 둘) — 전부 커밋 · 트리 깨끗 · applied 5 · origin = local · 겹친 push 0', async () => {
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

  await check(93, '미러 non-ff — 로컬형이 origin 에 먼저 push → save 는 되고 mirror diverged · 사유 non-ff · /repos · overview · doctor · brief(줄 · sync) · 「origin 과 맞추기」 는 rebase 문장으로 거절 · 사람이 rebase 뒤 「다시 보내기」 ok', async () => {
    // 92 의 save 는 미러를 1.5초만 기다리고 `queued` 로 답한다 — 그 push 가 끝나기 전에 clone 하면 clone 의 push 가
    // non-ff 로 거절되고 94~97 이 줄줄이 넘어졌다(2026-09-30 하네스). origin 이 서버와 같아진 뒤에 clone 한다.
    eq((await untilMirror('ok')).mirror, 'ok', '앞 save 의 미러')
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
    // 갈라진 동안의 모습은 **모아 두고 복구한 뒤에** 본다 — 여기서 넘어지면 갈라진 채로 남아 94~ 가 줄줄이 넘어진다
    const seen = []
    const expect = (cond, msg) => cond || seen.push(msg)
    expect(r.mirror === 'diverged' && r.mirrorReason === 'non-ff', `mirror ${r.mirror} · 사유 ${r.mirrorReason}`)
    expect(r.ahead >= 1 && r.behind >= 1, `ahead ${r.ahead} behind ${r.behind}`)
    expect(/갈라짐/.test(r.note || ''), 'note')
    const brief = await mtool('brief', {}, TMW)
    expect(brief.lines?.some((l) => /\[CDP\] 미러: .*갈라짐/.test(l)), 'brief 줄: ' + JSON.stringify(brief.lines))
    // 옛 sync 도구를 brief 가 흡수했다(v1.0 W1)
    expect(brief.sync?.mirror === 'diverged' && brief.sync?.mirrorReason === 'non-ff', 'brief.sync: ' + JSON.stringify(brief.sync).slice(0, 120))
    // 로그 줄은 큐가 fetch · status 를 마친 **뒤에** 나온다 — /repos 가 diverged 를 먼저 보일 수 있다(2026-09-30 부하에서 1초 늦었다)
    for (const t0 = Date.now(); !SM.err().includes('미러 실패 mu:') && Date.now() - t0 < 10000; ) await wait(200)
    expect(SM.err().includes('미러 실패 mu: origin 에 서버가 모르는 커밋이 있다'), '로그 사유: ' + SM.err().split(NL).filter((l) => l.includes('미러')).join(' | '))
    const ov = await (await AM('/admin/overview', ADM(TKA))).json()
    expect(ov.alerts?.some((x) => x.level === 'bad' && /origin 과 갈라진 레포 1/.test(x.text)) && ov.repos?.mirror?.diverged === 1, 'overview: ' + JSON.stringify(ov.alerts))
    const doc = await doctorM()
    expect(doc.rows?.some((x) => x.what === '레포 mu origin' && x.state === 'fail' && /갈라졌다/.test(x.note)), 'doctor origin 줄: ' + JSON.stringify(doc.rows?.filter((x) => /mu/.test(x.what))))
    expect(doc.rows?.some((x) => x.what === '레포 mu push' && /non-ff/.test(x.note)), 'doctor push 줄 사유')
    // 재인증 → 「origin 과 맞추기」 는 갈라져서 거절 · 서버용 문장
    const { status: ss, j: sj } = await syncM()
    expect(ss === 409 && sj.reason === 'diverged' && /pull --rebase/.test(sj.message), `sync ${ss} · ${sj.reason}`)
    expect((await gitq('status', '--porcelain')) === '', '거절이 트리를 만졌다')
    // 사람이 셸에서 rebase → 「다시 보내기」 — 여기는 넘어지면 바로 멈춘다(복구가 안 됐다)
    await run('git', ['-C', MU, '-c', 'user.name=cdp', '-c', 'user.email=c@x', 'pull', '--rebase', '-q'])
    const push = await AM('/admin/repos/mu/push', { method: 'POST', ...ADM(TKA, { cookie: await sudoM() }), ...jbody({}) })
    eq(push.status, 200, 'push')
    eq((await push.json()).mirror.state, 'ok', 'state')
    eq((await mrepo()).mirror, 'ok', '/repos ok')
    const log = await fs.readFile(path.join(MDATA, 'logs', 'auth.log'), 'utf8')
    expect(/admin repo sync · kjsa · mu · fail=diverged/.test(log) && /admin repo push · kjsa · mu · ok/.test(log), 'auth.log')
    must(!seen.length, seen.join(' / '))
    return `diverged · non-ff · ahead ${r.ahead} behind ${r.behind} · overview bad · doctor fail · brief.sync · sync 409 → rebase → push ok`
  })

  await check(94, 'origin 만 앞서 있을 때 — doctor warn 「origin 이 앞서 있다」 · 「origin 과 맞추기」 200 pulled 1 · 그 뒤 save · push ok', async () => {
    const C = path.join(TMP, 'mirror', 'clone')
    await run('git', ['-C', C, 'pull', '--rebase', '-q'])
    await fs.appendFile(path.join(C, 'README.md'), '등록부를 밖에서 고쳤다.' + NL)
    await run('git', ['-C', C, 'add', '-A'])
    await run('git', ['-C', C, '-c', 'user.name=local', '-c', 'user.email=l@x', 'commit', '-qm', '밖에서'])
    await run('git', ['-C', C, 'push', '-q'])
    // 진단은 모아 두고 맞춘 뒤에 본다 — 여기서 넘어지면 origin 이 앞선 채로 남아 뒤의 save 미러가 non-ff 로 넘어진다
    const doc = await doctorM()
    const docOk = doc.rows?.some((x) => x.what === '레포 mu origin' && x.state === 'warn' && /origin 이 앞서 있다/.test(x.note))
    const { status: ss, j: sj } = await syncM()
    eq(ss, 200, 'sync — ' + (sj?.reason || '') + ' ' + String(sj?.message || '').slice(0, 80))
    eq(sj.pulled, 1, 'pulled')
    eq(sj.mirror.state, 'ok', 'state')
    must((await fs.readFile(path.join(MU, 'README.md'), 'utf8')).includes('등록부를 밖에서 고쳤다'), '서버 트리에 들어왔다')
    const s = await mtool('section', { coord: 'table:rp_plnd_chg_mst' }, TMW)
    const o = await mtool('save', { work: { id: '2026-0925-맞춘뒤', title: '맞춘 뒤', date: '2026-09-25 13:00', touches: ['table:rp_plnd_chg_mst'], body: '맞춘 뒤' }, sections: [{ coord: 'table:rp_plnd_chg_mst', applied: s.applied, body: '**정의** 맞춘 뒤.' }] }, TMW)
    must(o.commit, JSON.stringify(o.error))
    const r = await untilMirror('ok')
    eq(r.mirror, 'ok', 'mirror 뒤 ' + (r.mirrorReason || ''))
    eq((await run('git', ['-C', MBARE, 'rev-parse', 'HEAD'])).stdout.trim(), await gitq('rev-parse', 'HEAD'), 'origin = local')
    must(docOk, 'doctor(맞추기 전): ' + JSON.stringify(doc.rows?.filter((x) => /mu/.test(x.what))))
    return `warn → sync pulled 1 → save ${o.commit} → origin = local`
  })

  await check(95, '더러운 트리 — save 가 E_GIT dirty 로 거절 · /repos dirty · overview bad · doctor fail · 「트리 되돌리기」 → save ok · auth.log', async () => {
    await fs.appendFile(path.join(MU, 'docs', '테이블정의서.md'), NL + '사람이 서버 셸에서 고친 줄' + NL)
    await fs.writeFile(path.join(MU, 'stray.txt'), 'x')
    try {
      const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
      const bad = await mtool('save', { work: { id: '2026-0925-더러움', title: '더러움', date: '2026-09-25 14:00', body: '더러운 트리', touchesEmpty: '검증 — 좌표 없음' } }, TMW)
      eq(bad.error?.code, 'E_GIT', '거절')
      eq(bad.error.detail.reason, 'dirty', 'reason')
      eq(bad.error.detail.dirty, 2, 'dirty 수')
      must(/트리 되돌리기/.test(bad.error.message), '문장')
      eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0, '커밋 0')
      eq((await mrepo(TMW)).dirty, 2, '/repos dirty')
      const ov = await (await AM('/admin/overview', ADM(TKA))).json()
      must(ov.alerts.some((x) => x.level === 'bad' && /트리에 커밋 안 된 변경/.test(x.text)), 'overview')
      const doc = await doctorM()
      must(doc.rows.some((x) => x.what === '레포 mu 트리' && x.state === 'fail'), 'doctor 트리 줄')
      const rs = await AM('/admin/repos/mu/restore', { method: 'POST', ...ADM(TKA, { cookie: await sudoM() }), ...jbody({}) })
      eq(rs.status, 200, 'restore')
      const rj = await rs.json()
      eq(rj.discarded.length, 2, '버린 경로')
      eq(await gitq('status', '--porcelain'), '', '깨끗')
      const ok = await mtool('save', { work: { id: '2026-0925-되돌린뒤', title: '되돌린 뒤', date: '2026-09-25 14:10', body: '되돌린 뒤', touchesEmpty: '검증 — 좌표 없음' } }, TMW)
      must(ok.commit, JSON.stringify(ok.error))
      const log = await fs.readFile(path.join(MDATA, 'logs', 'auth.log'), 'utf8')
      must(/admin repo restore · kjsa · mu · discarded=2/.test(log), 'auth.log')
      return `E_GIT dirty 2 · 커밋 0 · restore 2 · save ${ok.commit}`
    } finally {
      // 이 항목이 어디서 넘어져도 트리를 더러운 채로 두지 않는다 — 뒤 항목(96~)이 E_GIT dirty 로 줄줄이 넘어진다
      if (await gitq('status', '--porcelain')) {
        await run('git', ['-C', MU, 'checkout', '--', '.']).catch(() => {})
        await run('git', ['-C', MU, 'clean', '-fdq']).catch(() => {})
      }
    }
  })

  await check(96, '`—`(문서 전체) 규칙 — 큐레이터의 save 가 문서 머리에 applied 를 쓰고 · section 이 그것을 읽고 · check 통과', async () => {
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

  // 타입은 fixture 에 **없는 것**(`gloss`)이어야 한다 — fixture 는 09-14 부터 `## term` 어휘와 `term:*` 행을 가져서
  // dpms_wiki 의 `term:*` 그대로 두면 `managed` add 가 설계대로 E_CONFLICT(다른 자리의 같은 패턴)로 끝난다
  await check(110, '관리 문서 동적 생성 — 큐레이터의 save 한 번으로 새 타입 · 새 관리 문서 · 등록부 행 · 섹션 · where 가 그 섹션을 가리킨다 · writer 의 managed 는 E_FORBIDDEN · 정리(retire)도 큐레이터', async () => {
    const add = { managed: [{ pattern: 'gloss:*', doc: 'docs/용어집.md', title: '용어집' }] }
    // writer 는 못 한다 — 파일을 만지기 전에
    const w0 = await mtool('save', { work: { id: '2026-0930-용어집-writer', title: '용어집 writer', date: '2026-09-30 10:50', touches: ['gloss:PLC'], body: 'x' }, vocab: [{ coord: 'gloss:PLC', label: 'PLC' }], ...add }, TMX)
    eq(w0.error?.code, 'E_FORBIDDEN', 'writer 의 managed — ' + JSON.stringify(w0).slice(0, 120))
    eq(w0.error.detail?.need, 'curate', 'need')
    eq(await gitq('status', '--porcelain'), '', 'writer 거절 뒤 트리')
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const o = await mtool('save', {
      work: { id: '2026-0930-용어집-신설', title: '용어집 신설', date: '2026-09-30 11:00', touches: ['gloss:PLC'], body: 'PLC 용어를 정의하며 용어집을 만들었다.' },
      vocab: [{ coord: 'gloss:PLC', label: '프로그래머블 로직 컨트롤러', aliases: ['피엘씨'] }],
      ...add,
      sections: [{ coord: 'gloss:PLC', applied: null, heading: 'PLC — 프로그래머블 로직 컨트롤러', body: '공장 설비를 제어하는 산업용 컴퓨터.' }],
    }, TMW)
    must(o.commit, JSON.stringify(o.error))
    eq(o.managed, 1, 'managed')
    must(o.warnings.some((w) => /새 어휘 타입 "gloss"/.test(w)), 'warnings: ' + o.warnings.join())
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0 + 1, '커밋 하나')
    eq(await gitq('status', '--porcelain'), '', '트리')
    const w = await mtool('where', { coord: 'gloss:PLC' }, TMW)
    eq(w.registry.doc, 'docs/용어집.md', 'where.registry')
    const s = await mtool('section', { coord: 'gloss:PLC' }, TMW)
    eq(s.applied, '2026-0930-용어집-신설', 'applied')
    must(/산업용 컴퓨터/.test(s.content), 'content')
    const reg = await fs.readFile(path.join(MU, '_managed.md'), 'utf8')
    must(/`gloss:\*` \| `docs\/용어집\.md` \| `## \{값\}` \| 서버 추가 · 2026-0930-용어집-신설 \|/.test(reg), '행: ' + reg.split(NL).slice(-3).join(' / '))
    eq((await mtool('check', {}, TMW)).errors, 0, 'check')
    // 정리도 큐레이터의 일 — writer 는 E_FORBIDDEN, 큐레이터는 행만 지우고 문서는 남는다
    const bad = await mtool('save', { work: { id: '2026-0930-폐기-시도', title: '폐기 시도', date: '2026-09-30 11:10', touches: ['gloss:PLC'], body: 'x' }, managed: [{ op: 'retire', pattern: 'gloss:*' }] }, TMX)
    eq(bad.error?.code, 'E_FORBIDDEN', JSON.stringify(bad))
    eq(await gitq('status', '--porcelain'), '', '거절 뒤 트리')
    const ok = await mtool('save', { work: { id: '2026-0930-용어집-정리', title: '용어집 정리', date: '2026-09-30 11:20', touches: [], touchesEmpty: '등록부 정리만 했다', body: '용어집을 등록부에서 뺐다.' }, managed: [{ op: 'retire', pattern: 'gloss:*' }] }, TMW)
    must(ok.commit, JSON.stringify(ok.error))
    must(await exists(path.join(MU, 'docs', '용어집.md')), '문서는 남는다')
    must(!/`gloss:\*`/.test(await fs.readFile(path.join(MU, '_managed.md'), 'utf8')), '행이 남았다')
    return `writer E_FORBIDDEN · 커밋 +1 · where ${w.registry.doc} · 행 note · writer retire E_FORBIDDEN · 큐레이터 retire ${ok.commit}`
  })

  await check(112, '첨부 올리기 — curl 과 같은 요청(Bearer · 바이트) → ref → writer 의 save assets(섹션 없이) → 커밋 하나 · 트리 깨끗 · /api/<repo>/file 이 그 그림 · viewer 403 · svg 415 · 10MB 초과 413', async () => {
    // 1×1 PNG — curl -H "Authorization: Bearer $CDP_TOKEN" --data-binary @구성도.png <서버>/api/mu/assets 와 같은 요청
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
    const up = (tk, body) => AM('/api/mu/assets', { method: 'POST', headers: { authorization: 'Bearer ' + tk, 'content-type': 'application/octet-stream' }, body })
    const r = await up(TMX, png)
    eq(r.status, 200, 'writer 올리기')
    const u = await r.json()
    must(/^sha256:[0-9a-f]{64}$/.test(u.ref) && u.type === 'image/png' && u.size === png.length, JSON.stringify(u))
    eq((await up(TMV, png)).status, 403, 'viewer')
    eq((await up(TMX, Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'))).status, 415, 'svg')
    // 서버가 상한을 넘는 순간 소켓을 끊으면 413 을 읽기 전에 "fetch failed" 를 볼 수 있다(32 와 같은 경쟁) — 세 번까지
    let big
    for (let i = 0; ; i++) {
      try {
        big = await up(TMX, Buffer.alloc(10 * 1024 * 1024 + 1, 0x89))
        break
      } catch (e) {
        if (i >= 2 || !/fetch failed/.test(String(e?.message))) throw e
        await wait(500)
      }
    }
    eq(big.status, 413, '10MB 초과')
    eq(await gitq('status', '--porcelain'), '', '올리기만으로 트리가 바뀌었다')

    const id = '2026-0930-그림첨부'
    const coord = 'table:rp_plnd_mst'
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const o = await mtool('save', {
      work: { id, title: '그림 첨부', date: '2026-09-30 18:00', touches: [coord], body: `구성도를 넣었다.${NL}${NL}![구성도](<assets/${id}/구성 도.png>)` },
      assets: [{ ref: u.ref, name: '구성 도.png' }],
    }, TMX)
    must(o.commit, JSON.stringify(o.error))
    eq(o.assets, [{ path: `work/assets/${id}/구성 도.png`, size: png.length }], 'assets')
    must(!o.warnings.some((w) => /그림|첨부/.test(w)), 'warnings: ' + o.warnings.join(' / '))
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0 + 1, '커밋 하나')
    eq(await gitq('status', '--porcelain'), '', '트리')
    must((await gitq('show', '--name-only', '--format=', 'HEAD')).split(NL).includes(`work/assets/${id}/구성 도.png`), '커밋에 그림')
    const f = await AM('/api/mu/file?path=' + encodeURIComponent(o.assets[0].path), bearer(TMX))
    eq(f.status, 200, 'file')
    eq(f.headers.get('content-type'), 'image/png', 'content-type')
    must(Buffer.from(await f.arrayBuffer()).equals(png), '바이트')
    return `ref ${u.ref.slice(7, 15)} · viewer 403 · svg 415 · 413 · 커밋 ${o.commit} · file 200`
  })

  await check(116, 'HTML 시각 자료 — 올리기(text/html) → writer 의 save → /file 이 sandbox CSP · theme 이 루트 data-theme · 문서 응답 visuals · html 아닌 것을 .html 이라 올리면 415', async () => {
    const page = Buffer.from('<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>연계 구성도</title></head><body><svg></svg></body></html>')
    const up = (body) => AM('/api/mu/assets', { method: 'POST', headers: { authorization: 'Bearer ' + TMX, 'content-type': 'application/octet-stream' }, body })
    const r = await up(page)
    eq(r.status, 200, '올리기')
    const u = await r.json()
    eq(u.type, 'text/html', 'type')
    eq((await up(Buffer.from('<p>html 이 아니다</p>'))).status, 415, 'html 아닌 것')
    const id = '2026-1006-시각자료'
    const coord = 'table:rp_plnd_mst'
    const o = await mtool('save', {
      // 링크 대상에 빈칸이 있으면 `<…>` 로 싼다 — 안 싸면 링크가 아니라 글이고, save 는 「첨부를 아무 본문도 가리키지 않는다」 고 경고한다
      work: { id, title: '시각 자료', date: '2026-10-06 15:00', touches: [coord], body: `연계 구성을 정했다. 게이트웨이 방식이고 책임 구간은 셋으로 나눈다. 프레임 규격 초안 v0.1 의 요점은 길이 · 순번 · 체크섬이며 확인 목록은 다섯 건이다. 제어 시퀀스는 기동 명령 한 건을 기준으로 정리했고, 장애 판정은 통신 두절 · 응답 지연 · 값 이상 세 가지로 나눈다. 보안성 검토 요구 두 건에 대한 대응과 선례(익산 · 평창)도 자료에 있다.${NL}${NL}[연계 구성도](<assets/${id}/연계 구성도.html>)` },
      assets: [{ ref: u.ref, name: '연계 구성도.html' }],
    }, TMX)
    must(o.commit, JSON.stringify(o.error))
    must(!o.warnings.some((w) => /첨부|HTML|외부|CDN/.test(w)), 'warnings: ' + o.warnings.join(' / '))
    const rel = `work/assets/${id}/연계 구성도.html`
    const f = await AM('/api/mu/file?path=' + encodeURIComponent(rel) + '&theme=dark', bearer(TMX))
    eq(f.status, 200, 'file')
    must(/^sandbox allow-scripts /.test(f.headers.get('content-security-policy') || '') && !/allow-same-origin/.test(f.headers.get('content-security-policy')), 'csp: ' + f.headers.get('content-security-policy'))
    must((await f.text()).startsWith('<!doctype html><html data-theme="dark"><html lang="ko">'), 'theme')
    // 문서 응답은 다시 읽은 뒤에 실린다 — save 뒤 감시가 다시 읽을 때까지 잠깐
    let d = null
    for (let i = 0; i < 20 && !d?.visuals?.length; i++) {
      if (i) await wait(250)
      d = await (await AM('/api/mu/docs/' + encodeURIComponent(id), bearer(TMX))).json()
    }
    eq(d.visuals, [{ path: rel, title: '연계 구성도' }], 'visuals')
    return `커밋 ${o.commit} · csp sandbox · data-theme · visuals 1 · 415`
  })

  await check(114, 'save edits(큐레이터) — 등록부 밖 문서(프로그램목록) 머리말을 고친다 · 작업 기록과 한 커밋 · 트리 깨끗 · 낡은 old 는 E_CONFLICT · 좌표 섹션 · 문서 전체(—) 문서는 E_INPUT · writer 의 edits 는 E_FORBIDDEN', async () => {
    const DOC = 'docs/프로그램목록.md'
    const doc = await mtool('docs', { doc: DOC }, TMW)
    eq(doc.registered, false, '프로그램목록은 비대상')
    const line = doc.text.split(NL).find((l, i) => i > 0 && l.trim() && !/^[#|<>]/.test(l))
    must(line, '머리말 줄이 없다')
    const wx = await mtool('save', { work: { id: '2026-0930-머리말-writer', title: 'x', date: '2026-09-30 18:50', touches: [], touchesEmpty: 'x', body: 'x' }, edits: [{ file: DOC, old: line, new: line + ' (writer)' }] }, TMX)
    eq(wx.error?.code, 'E_FORBIDDEN', 'writer 의 edits')
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const o = await mtool('save', { work: { id: '2026-0930-회의록-머리말', title: '회의록 머리말', date: '2026-09-30 19:00', touches: [], touchesEmpty: '회의록 머리말 정리 — 바꾼 좌표 없음', body: '머리말을 고쳤다.' }, edits: [{ file: DOC, old: line, new: line + ' (편집 시험)' }] }, TMW)
    must(o.commit, JSON.stringify(o.error))
    eq(o.edits, [{ file: DOC, line: doc.text.split(NL).indexOf(line) + 1 }], 'edits')
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0 + 1, '커밋 하나')
    eq(await gitq('status', '--porcelain'), '', '트리')
    must((await fs.readFile(path.join(MU, DOC), 'utf8')).includes(line + ' (편집 시험)'), '안 바뀌었다')
    const stale = await mtool('save', { work: { id: '2026-0930-회의록-머리말2', title: 'x', date: '2026-09-30 19:10', touches: [], touchesEmpty: 'x', body: 'x' }, edits: [{ file: DOC, old: line + NL, new: 'y' + NL }] }, TMW)
    eq(stale.error?.code, 'E_CONFLICT', JSON.stringify(stale))
    const s = await mtool('section', { coord: 'table:rp_plnd_mst' }, TMW)
    const guard = await mtool('save', { work: { id: '2026-0930-섹션-우회', title: 'x', date: '2026-09-30 19:20', touches: [], touchesEmpty: 'x', body: 'x' }, edits: [{ file: s.doc, old: s.heading, new: s.heading + ' 우회' }] }, TMW)
    eq(guard.error?.code, 'E_INPUT', JSON.stringify(guard))
    // note:* → docs/회의록.md 는 문서 전체(—)가 좌표의 상태다 — 어느 줄도 edits 로 못 쓴다
    const whole = await mtool('save', { work: { id: '2026-0930-전체-우회', title: 'x', date: '2026-09-30 19:30', touches: [], touchesEmpty: 'x', body: 'x' }, edits: [{ file: 'docs/회의록.md', old: (await mtool('docs', { doc: 'docs/회의록.md' }, TMW)).text.split(NL).find((l) => l.trim()), new: '# 회의' }] }, TMW)
    eq(whole.error?.code, 'E_INPUT', JSON.stringify(whole))
    eq(await gitq('status', '--porcelain'), '', '거절 뒤 트리')
    return `writer E_FORBIDDEN · 커밋 ${o.commit} · 낡은 old E_CONFLICT · 좌표 섹션 · 문서 전체 E_INPUT`
  })

  await check(115, '관리 문서 지우기 — docs 의 usage · writer drop 은 E_FORBIDDEN · 큐레이터 dryRun 은 커밋 없이 refs · 초안 edits 로 지우면 커밋 하나 · 파일 · 지운 기록 · /managed-docs 의 blocked', async () => {
    const DOC = 'docs/프로그램목록.md'
    const list = await mtool('docs', {}, TMW)
    const u = list.docs.find((d) => d.path === DOC)?.usage
    must(u && u.kind === '비대상' && typeof u.refsIn === 'number' && u.lastChange?.commit, 'usage: ' + JSON.stringify(u))
    const md = await AM('/api/mu/managed-docs', bearer(TMW))
    eq(md.status, 200, '/managed-docs')
    const mj = await md.json()
    must(mj.docs.some((d) => d.blocked), '작업 기록이 쓴 문서의 blocked')
    const work = (id) => ({ id, title: '관리 문서 정리', date: '2026-10-01 10:00', touches: [], touchesEmpty: '관리 문서 정리', body: '이 사업은 프로그램목록을 쓰지 않는다.' })
    const bad = await mtool('save', { work: work('2026-1001-정리-writer'), managed: [{ op: 'drop', doc: DOC }] }, TMX)
    eq(bad.error?.code, 'E_FORBIDDEN', JSON.stringify(bad))
    // 화면 길(POST /docs-drop)도 큐레이터만
    const hd = await AM('/api/mu/docs-drop', { method: 'POST', headers: { authorization: 'Bearer ' + TMX, 'content-type': 'application/json' }, body: JSON.stringify({ docs: [DOC], reason: 'x' }) })
    eq(hd.status, 403, 'writer 의 /docs-drop')
    const n0 = Number(await gitq('rev-list', '--count', 'HEAD'))
    const pre = await mtool('save', { work: work('2026-1001-정리'), managed: [{ op: 'drop', doc: DOC }], dryRun: true }, TMW)
    must(pre.dryRun && !pre.commit, JSON.stringify(pre.error || pre))
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0, 'dryRun 커밋')
    eq(await gitq('status', '--porcelain'), '', 'dryRun 트리')
    const refs = pre.dropped.refs
    const edits = refs.filter((x) => x.edit).map((x) => x.edit)
    const reviewed = refs.filter((x) => !x.edit).map((x) => x.file + ':' + x.line)
    const o = await mtool('save', { work: work('2026-1001-정리'), managed: [{ op: 'drop', doc: DOC, reason: '쓰지 않는다', ...(reviewed.length ? { reviewed } : {}) }], ...(edits.length ? { edits } : {}) }, TMW)
    must(o.commit, JSON.stringify(o.error))
    eq(Number(await gitq('rev-list', '--count', 'HEAD')), n0 + 1, '커밋 하나')
    eq(await gitq('status', '--porcelain'), '', '트리')
    must(!(await exists(path.join(MU, DOC))), '파일이 남았다')
    must(/## 지운 관리 문서[\s\S]*`docs\/프로그램목록\.md` \| `2026-1001-정리` \| 쓰지 않는다/.test(await fs.readFile(path.join(MU, '_managed.md'), 'utf8')), '지운 기록')
    eq((await mtool('check', {}, TMW)).errors, 0, 'check')
    return `usage · writer E_FORBIDDEN · /docs-drop 403 · dryRun refs ${refs.length} · 고침 ${edits.length} · 알고 둠 ${reviewed.length} · 커밋 ${o.commit}`
  })
} finally {
  SM.kill()
  await fs.writeFile(path.join(TMP, 'mirror', 'server.stderr.log'), SM.err()).catch(() => {})
}

// ══ v1.0 — 이행 · 개인 서버 · 진단 · 없앤 명령 ════════════════════════════════

await check(129, 'ctx migrate — 옛 레포 표본(test/fixtures/legacy-public-si 사본 + 옛 도구 층 · hooksPath): --dry 는 안 쓴다 · 서식 예시를 지운다 · 도구 층을 걷고 hooksPath 를 푼다 · 두 번째는 할 것이 없다 · check 오류 0', async () => {
  const L = path.join(TMP, 'migrate', 'legacy')
  await fs.cp(path.join(ROOT, 'test', 'fixtures', 'legacy-public-si'), L, { recursive: true })
  // v0.x 레포가 들고 있던 도구 층 — 내용은 자리표시다(걷히는지만 본다). 훅은 막는 훅이다: 이행이 훅에 걸리면 안 된다
  const tool = {
    'bin/ctx': '#!/bin/sh\nexec node "$(dirname "$0")/ctx.mjs" "$@"\n',
    'bin/ctx.mjs': '// 옛 번들\n',
    '.githooks/pre-commit': '#!/bin/sh\nexit 1\n',
    '.claude/skills/cdp-load/SKILL.md': '---\nname: cdp-load\ndescription: 옛 스킬\n---\n',
    'CLAUDE.md': '# 옛 지식 레포 규약\n',
    'TEMPLATE-work.md': '# 작업 기록 서식\n',
    'MANUAL.md': '# 설명서\n',
    'INDEX.md': '# INDEX\n',
    'INDEX-by-coord.md': '# INDEX by coord\n',
  }
  for (const [rel, text] of Object.entries(tool)) {
    await fs.mkdir(path.dirname(path.join(L, rel)), { recursive: true })
    await fs.writeFile(path.join(L, rel), text)
  }
  await fs.chmod(path.join(L, '.githooks', 'pre-commit'), 0o755)
  await run('git', ['-C', L, 'init', '-q'])
  await run('git', ['-C', L, 'config', 'core.autocrlf', 'false'])
  await run('git', ['-C', L, 'add', '-A'])
  await run('git', ['-C', L, '-c', 'user.name=seed', '-c', 'user.email=s@x', 'commit', '-qm', '옛 레포(v0.x)', '--no-verify'])
  await run('git', ['-C', L, 'config', 'core.hooksPath', '.githooks'])
  const ex0 = [...(await loadRepo(L)).vocab.coords.values()].filter((e) => e.example).length
  must(ex0 > 0, '표본에 서식 예시가 없다')
  const h0 = await commits(L)
  const dry = await cli(['migrate', L, '--dry'])
  eq(dry.code, 0, 'dry — ' + dry.stderr.slice(0, 120))
  must(/서식 예시 — 좌표 \d+개/.test(dry.stdout) && /도구 층 — bin/.test(dry.stdout), 'dry 출력 — ' + dry.stdout.slice(0, 200))
  eq(await commits(L), h0, 'dry 가 커밋했다')
  must(await exists(path.join(L, 'INDEX.md')), 'dry 가 지웠다')
  const r = await cli(['migrate', L, '--by', 'harness'])
  eq(r.code, 0, 'migrate — ' + (r.stderr || r.stdout).slice(0, 160))
  must(/전환 기록 — 건너뜀/.test(r.stdout), '전환 기록 — 옛 파생 이력이 없는 표본이다: ' + r.stdout.slice(0, 160))
  eq(await commits(L), h0 + 2, '커밋 둘(서식 예시 · 도구 층)')
  const left = []
  for (const f of Object.keys(tool)) if (await exists(path.join(L, f))) left.push(f)
  eq(left, [], '남은 도구 층')
  eq(await hooksPath(L), '', 'hooksPath')
  eq(await porcelain(L), '', '트리')
  eq([...(await loadRepo(L)).vocab.coords.values()].filter((e) => e.example).length, 0, '서식 예시 좌표')
  const ck = JSON.parse((await cli(['--repo', L, 'check', '--json'])).stdout)
  eq(ck.errors, 0, 'check 오류 — ' + JSON.stringify(ck.findings.filter((f) => f.sev === 'error').map((f) => f.kind)))
  const again = await cli(['migrate', L, '--by', 'harness'])
  must(again.code === 0 && /서식 예시 — 없다/.test(again.stdout) && /도구 층 — 없다/.test(again.stdout), '두 번째 — ' + again.stdout.slice(0, 200))
  eq(await commits(L), h0 + 2, '두 번째가 커밋했다')
  return `예시 좌표 ${ex0} → 0 · 도구 층 ${Object.keys(tool).length}개 걷음 · hooksPath 풀림 · 커밋 +2 · 두 번째 할 것 없음`
})

await check(130, 'ctx migrate — 파생 이력이 있는 레포(viewer/fixture 사본): 전환 기록 하나(태그 transition · reflect · keep) · 대기열은 그대로 · 반영됨의 근거가 전환 기록 · 두 번째는 「이미 큐레이션 기록이 있다」', async () => {
  const P = path.join(TMP, 'migrate', 'derived')
  await fs.cp(path.join(ROOT, 'viewer', 'fixture'), P, { recursive: true })
  // 옛 판정이 남긴 기록 하나 — applied 뒤에 같은 좌표를 건드렸다(대기열에 남아야 한다)
  await fs.writeFile(path.join(P, 'work', '2026-0921-전환-대기.md'), `---\nid: 2026-0921-전환-대기\ntitle: 전환 대기 시험\ndate: 2026-09-21 09:00\nauthor: harness\ntouches:\n  - ${EXP}\ntags: []\n---\n\n결의서 섹션이 아직 이 기록을 싣지 않았다.\n`)
  await gitRepo(P)
  const r0 = await loadRepo(P)
  must(r0.curation.implicit, '암묵 전환이 아니다')
  const q0 = r0.curation.queue.map((x) => x.id)
  must(q0.includes('2026-0921-전환-대기'), '대기 기록이 대기열에 없다')
  const r = await cli(['migrate', P, '--by', 'harness'])
  eq(r.code, 0, 'migrate — ' + (r.stderr || r.stdout).slice(0, 160))
  const m = /반영됨 (\d+) · 기록으로 둠 (\d+) · 대기열에 남김 (\d+)/.exec(r.stdout)
  must(m, r.stdout.slice(0, 200))
  const [reflect, keep, queued] = m.slice(1).map(Number)
  eq(queued, q0.length, '대기열에 남김')
  const r1 = await loadRepo(P)
  eq(r1.curation.implicit, false, '전환 뒤')
  eq(r1.curation.queue.map((x) => x.id), q0, '대기열은 그대로')
  const t = r1.works.find((d) => (d.tags || []).includes('transition'))
  must(t && t.curates.length === reflect + keep, '전환 기록 — ' + JSON.stringify(t?.curates?.length))
  const one = t.curates.find((j) => j.verdict === 'reflect')
  const st = r1.curation.statusOf(one.id)
  eq([st.state, st.by], ['reflected', t.id], '반영됨의 근거')
  eq(await porcelain(P), '', '트리')
  const again = await cli(['migrate', P, '--by', 'harness'])
  must(/이미 큐레이션 기록이 있다/.test(again.stdout), '두 번째 — ' + again.stdout.slice(0, 160))
  return `전환 ${t.id} · 반영됨 ${reflect} · 기록으로 둠 ${keep} · 대기 ${queued} 그대로 · 두 번째 건너뜀`
})

await check(131, '개인 서버 — ctx serve --personal <레포>: 명부(나 하나 · admin)를 스스로 · 첫 접속 /login?auto=<토큰>(login.url 파일 · stdout 에 원문 없음) 이 쿠키를 주고 그 레포로 · 틀린 토큰은 로그인 화면 · MCP 큐레이터 12 · 다른 서버에는 auto 가 없다', async () => {
  const P = PORT + 11
  const PR = path.join(TMP, 'personal', 'pfx')
  const PD = path.join(TMP, 'personal', 'data')
  await fs.cp(path.join(ROOT, 'viewer', 'fixture'), PR, { recursive: true })
  await gitRepo(PR)
  const SP = serve(['--personal', PR, '--port', String(P), '--data', PD, '--web', WEB, '--kit', KIT])
  try {
    await ready(P)
    const tok = (await fs.readFile(path.join(PD, 'personal.token'), 'utf8')).trim()
    // 첫 접속 주소(토큰 원문)는 stdout 이 아니라 600 파일로(제품화 2 F14) — 화면에는 그 파일 자리만
    must(!SP.out().includes(tok), 'stdout 에 토큰 원문이 찍혔다')
    must(SP.out().includes(path.join(PD, 'login.url')), '자동 로그인 주소 파일을 안 알렸다 — ' + SP.out().slice(0, 160))
    must((await fs.readFile(path.join(PD, 'login.url'), 'utf8')).includes(`/login?auto=${tok}`), 'login.url 내용')
    const db = JSON.parse(await fs.readFile(path.join(PD, 'auth.json'), 'utf8'))
    eq([db.users.length, db.users[0]?.role], [1, 'admin'], '명부')
    const base = `http://127.0.0.1:${P}`
    const a = await fetch(`${base}/login?auto=${encodeURIComponent(tok)}`, { redirect: 'manual' })
    eq(a.status, 302, 'auto')
    eq(a.headers.get('location'), '/r/pfx/', '그 레포로')
    const c = /cdp_s=[^;]*/.exec(a.headers.get('set-cookie') || '')?.[0]
    must(c, '쿠키')
    const me = await (await fetch(`${base}/me`, { headers: { cookie: c } })).json()
    eq([me.role, me.curate, me.repos.map((x) => x.name)], ['admin', ['*'], ['pfx']], '/me')
    const bad = await fetch(`${base}/login?auto=nope`, { redirect: 'manual' })
    must(bad.status === 200 && !/cdp_s=/.test(bad.headers.get('set-cookie') || ''), '틀린 토큰 — ' + bad.status)
    eq((await http(base).rpc('/mcp/pfx', 'tools/list', {}, tok)).j?.result?.tools?.length, 13, 'MCP 도구')
    // 다른 서버에는 이 길이 없다 — 맞는 토큰이어도 화면만 낸다
    const o = await fetch(`${BASE}/login?auto=${encodeURIComponent(TKA)}`, { redirect: 'manual' })
    must(o.status === 200 && !/cdp_s=/.test(o.headers.get('set-cookie') || ''), '공용 서버가 auto 로 로그인시켰다')
    return `명부 1(admin) · auto 302 → /r/pfx/ · /me admin · 틀린 토큰 화면 · MCP 13 · 공용 서버 auto 없음`
  } finally {
    SP.kill()
  }
})

await check(132, 'ctx serve doctor — kit · forms 줄(자리 · 어디서) · 옛 도구 층이 남은 레포는 warn(migrate 안내) · 깨끗한 레포는 그 줄이 없다', async () => {
  const DR = path.join(TMP, 'doctor', 'repos')
  await fs.cp(path.join(ROOT, 'viewer', 'fixture'), path.join(DR, 'clean'), { recursive: true })
  await gitRepo(path.join(DR, 'clean'))
  await fs.cp(path.join(ROOT, 'viewer', 'fixture'), path.join(DR, 'legacy'), { recursive: true })
  await fs.mkdir(path.join(DR, 'legacy', '.githooks'), { recursive: true })
  await fs.writeFile(path.join(DR, 'legacy', '.githooks', 'pre-commit'), '#!/bin/sh\n')
  await fs.writeFile(path.join(DR, 'legacy', 'INDEX.md'), '# INDEX\n')
  await gitRepo(path.join(DR, 'legacy'))
  const r = await cli(['serve', 'doctor', '--root', DR, '--auth', F.auth, '--data', path.join(TMP, 'doctor', 'data'), '--kit', KIT, '--forms', FORMS, '--port', String(PORT + 14), '--json'])
  const j = JSON.parse(r.stdout)
  const row = (w) => j.rows.find((x) => x.what === w)
  must(row('kit')?.state === 'ok' && row('kit').note.includes('(--kit)'), 'kit 줄 — ' + JSON.stringify(row('kit')))
  must(row('forms')?.state === 'ok' && row('forms').note.includes('(--forms)'), 'forms 줄 — ' + JSON.stringify(row('forms')))
  const lg = row('레포 legacy 도구 층')
  must(lg?.state === 'warn' && /migrate/.test(lg.note) && /\.githooks/.test(lg.note) && /INDEX\.md/.test(lg.note), '옛 도구 층 줄 — ' + JSON.stringify(lg))
  must(!row('레포 clean 도구 층'), '깨끗한 레포에 도구 층 줄')
  eq(r.code, j.fails ? 1 : 0, 'exit')
  return `kit ok · forms ok · legacy 도구 층 warn · fail ${j.fails} · warn ${j.warns}`
})

await check(133, '없앤 CLI 명령 — mcp · setup · index · derive · apply · sync · examples · docs drop · package · serve kit-refresh 는 「v1.0 에서 없앴다」 를 stderr 에 내고 exit 2', async () => {
  const EMPTY = path.join(TMP, 'empty-root')
  await fs.mkdir(EMPTY, { recursive: true })
  const cmds = [['mcp'], ['setup'], ['index'], ['derive'], ['apply', 'table:x'], ['sync'], ['examples', '--purge'], ['docs', 'drop', 'docs/x.md'], ['package', 'check', '--all'], ['serve', 'kit-refresh', '--root', EMPTY, '--port', String(PORT + 13)]]
  const bad = []
  for (const c of cmds) {
    // 60초 — 모르는 serve 갈래는 서버를 띄운다(끝나지 않는다). 그러면 죽이고 실패로 적는다. 부하 걸린 기계에서는
    // node 하나 뜨는 데 10초가 넘는다 — 여유를 둔다
    const r = await cli(c, { timeout: 60000 })
    if (r.killed) bad.push(`${c.slice(0, 2).join(' ')}: 60초 안에 안 끝났다 — 서버를 띄웠다`)
    else if (r.code !== 2 || !/v1\.0 에서 없앴다/.test(r.stderr)) bad.push(`${c.slice(0, 2).join(' ')}: exit ${r.code} · ${r.stderr.split(NL)[0].slice(0, 60)}`)
  }
  must(!bad.length, bad.join(' / '))
  return `${cmds.length}개 exit 2`
})

await check(85, '/login 속도 제한 — 21번째 안에 429 (마지막에 돈다 — 이 뒤로 로그인 없음)', async () => {
  let got = null
  for (let i = 1; i <= 21; i++) {
    const r = await fetch(`${BASE}/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: 'nope' }), redirect: 'manual' })
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

skip(24, 'active:false 가 열린 화면도 끊는다', '6.1 에서 브라우저 실측 — 여기서는 25번이 같은 경로를 덮는다')
skip(44, 'claude.ai 커넥터에 정적 Bearer', '해당 없음 — 공개 HTTPS 가 아니다(0단계 결정)')
skip(50, '두 사람의 /state 가 섞이지 않는다', 'localStorage 라 서버에 상태가 없다(§6.8) — 섞일 자리가 없음')
skip(63, '전환 메뉴에 권한 밖 레포가 없다', '6.2 브라우저 실측 — /me 가 거른다(42번이 같은 경로)')
skip(64, '레포를 바꾸면 화면 상태 초기화', '6.2 브라우저 실측 — 전환이 주소 이동이라 구조적으로 성립')
skip(65, '/r/<repo>/doc/<id> 를 새 창에 붙여넣으면 열린다', '6.2 브라우저 실측')
skip(66, '⌘K 가 다른 레포의 좌표를 안 낸다', '6.2 — 모든 호출이 /api/<repo> 기준(45번이 경로를 덮는다)')
skip(67, '레포 관리 메뉴 — 역할 × 항목(need: read · write · curate · admin)', '브라우저 실측 — 메뉴 표(shell/nav.js)는 test/nav.test.mjs 가 역할 × 화면으로 고정한다(v1.0 V18)')
skip(68, '공통 상단 바 · 왼쪽 메뉴 — 얼굴을 넘어도 같은 문서', '브라우저 실측 — 2026-09-28 화면 · 권한 검토 v0.1 R5 · R7 · v1.0 셸(SideNav · AppBar)')
skip(69, '레포 메뉴는 서버에서 항상 — 쓰기/읽기 칩 · 관리자에게 콘솔 › 지식 레포 줄', '6.2 브라우저 실측 — 2026-09-23 확인 (레포 하나여도 메뉴)')

await check(111, '스킬의 끝 보고는 save 응답(commit · mirror)과 brief 가 근거다 — push 를 말하는 문구 0 · 큐레이션 대기 n번째', async () => {
  // 서버형 끝 보고에 「push 는 하지 않았습니다」 가 옮겨졌다(2026-09-30) — 사람이 누를 push 가 없다. v1.0 은 모드가 하나라
  // 그 문구 자체가 없어야 한다(A1). 끝 보고 표는 cdp-save 한 곳이고 큐레이터 스킬은 그것을 가리킨다(A4).
  const dir = path.join(ROOT, 'agent', 'skills')
  const bad = []
  for (const n of SKILL_SET.filter((x) => x !== 'cdp-push')) {
    const lines = (await fs.readFile(path.join(dir, n, 'SKILL.md'), 'utf8')).split('\n')
    lines.forEach((l, i) => {
      if (/push\s*(는|를)?\s*(하지 않|안 한|안 함)|push\s*하세요|푸시하세요|직접 push/.test(l)) bad.push(`${n}:${i + 1}`)
    })
  }
  must(bad.length === 0, `push 를 말하는 문구 — ${bad.join(' · ')}`)

  const save = await fs.readFile(path.join(dir, 'cdp-save', 'SKILL.md'), 'utf8')
  const at = save.indexOf('## ⑥ 끝 보고')
  must(at >= 0, 'cdp-save 에 「⑥ 끝 보고」 가 없다')
  const end = save.indexOf('\n## ', at + 1)
  const sect = save.slice(at, end < 0 ? undefined : end)
  for (const k of ['commit', 'mirrorReason', 'mirrorLast', '"ok"', '"lag"', '"off"', 'brief', '큐레이션 대기']) must(sect.includes(k), `끝 보고에 ${k} 가 없다`)
  for (const n of ['cdp-curate', 'cdp-registry']) {
    must((await fs.readFile(path.join(dir, n, 'SKILL.md'), 'utf8')).includes('cdp-save 「끝 보고」'), `${n}: cdp-save 「끝 보고」 를 가리키지 않는다`)
  }
  return 'push 문구 0 · cdp-save 끝 보고 표(commit · mirror · 큐레이션 대기) · curate · registry 가 가리킨다'
})

await check(117, 'v1.1 스킬 여섯 — 폴더가 정확히 여섯 · 머리말이 YAML 로 읽힌다(name = 폴더 · description 은 큰따옴표 · 누가 쓰는지) · 줄 수 상한', async () => {
  // description 이 `**` 로 시작하면 `*` 가 YAML 별칭이라 머리말 전체가 깨진다(2026-10-06 cdp-save · cdp-push).
  // 그때 Claude Code 는 H1 을 설명으로 대신 쓴다 — 언제 쓰는지 · 무엇과 다른지가 **말없이** 사라진다. 그래서 큰따옴표로 싼다(A5).
  // 큐레이터 스킬은 writer 가 대신 무엇을 하는지까지 말한다(A6). 줄 수는 개편안 §6.1 의 목표 — 예시 · 드문 길은 참고 파일로(A3)
  const yaml = (await import('js-yaml')).default
  const dir = path.join(ROOT, 'agent', 'skills')
  const names = (await fs.readdir(dir, { withFileTypes: true })).filter((e) => e.isDirectory()).map((e) => e.name).sort()
  eq(names, SKILL_SET, '스킬 폴더')
  const bad = []
  const sizes = []
  for (const n of names) {
    const text = await fs.readFile(path.join(dir, n, 'SKILL.md'), 'utf8').catch(() => null)
    if (text == null) {
      bad.push(`${n}: SKILL.md 없음`)
      continue
    }
    const lines = text.split('\n').length - (text.endsWith('\n') ? 1 : 0)
    sizes.push(`${n.slice(4)} ${lines}`)
    if (lines > SKILL_LINES[n]) bad.push(`${n}: ${lines}줄 > ${SKILL_LINES[n]}`)
    const m = text.match(/^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/)
    if (!m) {
      bad.push(`${n}: 머리말 없음`)
      continue
    }
    let d
    try {
      d = yaml.load(m[1])
    } catch (err) {
      bad.push(`${n}: ${String(err.message).split(NL)[0]}`)
      continue
    }
    if (d?.name !== n) bad.push(`${n}: name ${JSON.stringify(d?.name)}`)
    if (typeof d?.description !== 'string' || !d.description.trim()) {
      bad.push(`${n}: description 없음`)
      continue
    }
    if (!/^description:\s*"/m.test(m[1])) bad.push(`${n}: description 이 큰따옴표 문자열이 아니다`)
    if (!/모두|누구나|writer|큐레이터/.test(d.description)) bad.push(`${n}: description 에 누가 쓰는지가 없다`)
    if (['cdp-curate', 'cdp-registry'].includes(n) && !(/큐레이터만/.test(d.description) && /기록만 남기고/.test(d.description))) {
      bad.push(`${n}: description 에 「큐레이터만」 · writer 는 「기록만 남기고」 가 없다`)
    }
  }
  must(bad.length === 0, bad.slice(0, 4).join(' · '))
  return `${names.length}종 · 줄 ${sizes.join(' · ')}`
})

// 제품화 2 — 원큐(빈 HOME 에서 ctx up 한 줄 → 작업 레포 둘 · 큐레이터 폴더 · 스킬 폴더 → kit 이 바뀌면 --update 가 넷을 센다)
await check(139, '원큐 — 빈 HOME 에서 ctx up <폴더> --install a --install b --curator c --skills s: 빈 틀 · 개인 서버 · 토큰 파일 · 대장 2 · 설치 목록 work 2 · curator · folder · /next 에 작업 레포 · 큐레이터 폴더 줄 없음 · stdout 에 토큰 원문 없음 · kit 이 바뀌면 ctx up --update 가 바뀔 곳 4', async () => {
  const H0 = path.join(TMP, 'one-shot')
  const HOME_T = path.join(H0, 'home')
  const REPO_T = path.join(HOME_T, 'cdp', 'team')
  const A = path.join(H0, 'code', 'a')
  const B = path.join(H0, 'code', 'b')
  const C = path.join(HOME_T, 'curator')
  const SK = path.join(HOME_T, 'skills')
  for (const d of [A, B]) {
    await fs.mkdir(d, { recursive: true })
    await run('git', ['-C', d, 'init', '-q'])
  }
  const P = PORT + 21
  const env = { ...BASE_ENV, HOME: HOME_T, USERPROFILE: HOME_T, SHELL: '/bin/zsh', CDP_KIT: KIT, CDP_TOKEN: '' }
  delete env.CDP_CONFIG_DIR
  const up = (args) => spawn(process.execPath, [path.join(ROOT, 'viewer/bin/ctx-cli.mjs'), 'up', ...args], { cwd: ROOT, env, stdio: ['ignore', 'pipe', 'pipe'] })
  const p = up([REPO_T, '--install', A, '--install', B, '--curator', C, '--skills', SK, '--no-open', '--port', String(P), '--web', WEB])
  let so = ''
  p.stdout.on('data', (d) => (so += d.toString('utf8')))
  p.stderr.on('data', () => {})
  try {
    for (const t0 = Date.now(); !/끄려면 Ctrl\+C/.test(so) && Date.now() - t0 < 120000; ) await wait(300)
    must(/끄려면 Ctrl\+C/.test(so), 'ctx up 이 끝까지 안 갔다 — ' + so.slice(-300))
    must(await exists(path.join(REPO_T, '_vocab.md')), '빈 틀')
    const data = path.join(HOME_T, '.cdp', 'personal', 'team')
    const tok = (await fs.readFile(path.join(data, 'personal.token'), 'utf8')).trim()
    must(!so.includes(tok), 'stdout 에 토큰 원문')
    eq((await fs.readFile(path.join(HOME_T, '.config', 'cdp', 'token'), 'utf8')).trim(), tok, '토큰 파일')
    for (const f of [path.join(A, '.mcp.json'), path.join(B, '.claude', 'skills', 'cdp-save', 'SKILL.md'), path.join(C, '.claude', 'skills', 'cdp-curate', 'SKILL.md'), path.join(SK, 'cdp-save', 'SKILL.md')]) must(await exists(f), '없다 — ' + f)
    must(!(await exists(path.join(C, '.claude', 'work-repo'))), '큐레이터 폴더에 kit 안쪽 원본(F12)')
    const reg = JSON.parse(await fs.readFile(path.join(HOME_T, '.config', 'cdp', 'workrepos.json'), 'utf8'))
    eq(reg.entries.map((e) => e.kind).sort(), ['curator', 'folder', 'work', 'work'], '설치 목록 kind')
    const H2 = http(`http://127.0.0.1:${P}`)
    const wrs = (await (await H2.call('/workrepos', bearer(tok))).json()).repos
    eq(wrs.map((r) => r.state), ['최신', '최신'], '대장')
    const nx = await (await H2.call('/next?repo=team', bearer(tok))).json()
    const ids = nx.steps.map((s) => s.id)
    must(!ids.includes('work-none') && !ids.includes('curator-folder'), '/next — ' + ids.join(','))
    must(ids.includes('docs-none'), '/next 에 관리 문서 줄이 없다 — ' + ids.join(','))
    // kit 이 바뀐다(판 올림) — 같은 서버에 ctx up --update 가 붙어 넷을 센다
    await fs.appendFile(path.join(KIT, 'skills', 'cdp-save', 'SKILL.md'), '\n<!-- 원큐 139 -->\n')
    const u = up([REPO_T, '--update', '--no-open'])
    let uo = ''
    u.stdout.on('data', (d) => (uo += d.toString('utf8')))
    const code = await new Promise((r) => u.on('exit', r))
    eq(code, 0, '--update — ' + uo.slice(-300))
    must(/이미 떠 있다/.test(uo), '두 번째 ctx up 이 떠 있는 서버를 못 찾았다')
    must(/바뀔 곳 4/.test(uo), '바뀔 곳 — ' + uo.slice(-400))
    must((await fs.readFile(path.join(SK, 'cdp-save', 'SKILL.md'), 'utf8')).includes('원큐 139'), '스킬 폴더가 안 바뀌었다')
    return `빈 틀 · 대장 최신 2 · 목록 work 2 · curator · folder · /next ${ids.join(',')} · --update 4곳`
  } finally {
    p.kill('SIGKILL')
  }
})

// ── 보고 ────────────────────────────────────────────────────────────────────

results.sort((a, b) => a.n - b.n)
const mark = { ok: '✓', fail: '✗', skip: '–' }
const width = (s) => [...s].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
const w = Math.max(...results.map((r) => width(r.label)))
const pad = (s, n) => s + ' '.repeat(Math.max(0, n - width(s)))

console.log('')
for (const r of results) console.log(` ${mark[r.state]} ${String(r.n).padStart(3)}  ${pad(r.label, w)}  ${r.note}`)

const n = (s) => results.filter((r) => r.state === s).length
console.log('')
console.log(`✓ ${n('ok')}  ✗ ${n('fail')}  – ${n('skip')}   (설계서 §10 1~69 · 제품화 70~77 · 관리 서비스 78~90 · 동시 기록 91~97 · 화면 · 권한 98~103 · 설치 한 줄 104~108 · 관리 문서 110 · 112~116 · 스킬 111 · 117 · v1.0 118~138 · 제품화 2 139)`)
await fs.writeFile(path.join(TMP, 'result.json'), JSON.stringify(results, null, 2))
process.exit(n('fail') ? 1 : 0)
