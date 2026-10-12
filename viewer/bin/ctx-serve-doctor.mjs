// ctx serve doctor · init — 서버 준비물을 명령 하나로. 검토 §3.3 · 제품화 TODO 3.3 · 3.4.
//
//   ctx serve doctor --root <폴더> --auth <f> --data <d> [--web <dir>] [--manual <dir>] [--bind <IP>] [--port <n>] [--forms <dir>] [--kit <dir>] [--json]
//   ctx serve init   --auth <f> --data <d> --name <이름> [--label …] [--repos *]
//
// `doctor` 는 설치절차 0장(준비물) · 3장(git 자격 · push --dry-run) · 부록 A(확인표)를 한
// 자리에서 본다. 줄마다 ok · warn · fail. **fail 이 하나라도 있으면 exit 1**,
// warn 만이면 0 — 경고로 설치를 막지 않는다.
//
// **`doctorRows` 와 출력이 갈려 있다.** 콘솔의 `/admin/doctor` 가 같은 줄을
// 낸다(제품관리서비스 검토 §4.7) — 두 곳이 같은 함수를 부르므로 화면과 셸의
// 진단이 갈라지지 않는다.
//
// `init` 은 5장 ②③(첫 사용자 + 토큰)을 한 번에. 이미 명부가 있으면 거절한다 —
// 덮지 않는다. 첫 사용자는 **admin** 이다. 브라우저 `/setup` 이 같은 일을 한다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import * as auth from '../../core/auth.js'
import { listRepos } from '../../core/reponew.js'
import { classifyPushError } from '../../core/git.js'
import { REASON_TEXT } from '../../core/mirror.js'
import { findKitDir } from '../../core/kit.js'
import { findFormsDir } from '../../core/formslib.js'
import { TOOL_LAYER } from '../../core/migrate.js'
import { hereDir } from '../server/runtime.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

function git(cwd, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout, windowsHide: true, encoding: 'utf8' }, (e, stdout, stderr) => {
      resolve({ ok: !e, out: String(stdout || '').trim(), err: String(stderr || '').trim(), killed: e?.killed, code: e?.code })
    })
  })
}

// 설명서 폴더 — `--manual` → 번들 옆 `manual/`(서버 산출물) → 소스 루트의 `manual/`.
// 설명서가 한 권이라도 있는 첫 폴더다. 없으면 null — 서버는 그대로 돈다(설명서 페이지만 빈다).
export async function resolveManualDir({ explicit = null, binDir = hereDir(import.meta.url) } = {}) {
  const cands = [explicit, path.resolve(binDir, '..', 'manual'), path.resolve(binDir, '..', '..', 'manual')].filter(Boolean)
  for (const dir of cands) {
    // 이름은 NFC 로 본다 — macOS 에서 싼 옛 산출물은 NFD 였다(제품화 2 S1)
    const names = (await fs.readdir(dir).catch(() => null))?.map((n) => n.normalize('NFC'))
    if (names && names.some((n) => /_설명서\.md$/.test(n))) return { dir: path.resolve(dir), books: names.filter((n) => /_설명서\.md$/.test(n)).sort() }
  }
  return null
}

// 화면 파일 자리 — forms · kit · manual 처럼 **번들 옆을 먼저** 찾는다(제품화 2 F1). 전에는 소스 자리(ops/out/web)만 봐서
// 산출물에서 --web 없이 띄우면 「npm run build 를 돌려…」 가 관리자에게 보였다
export async function resolveWebDir({ explicit = null, binDir = hereDir(import.meta.url) } = {}) {
  if (explicit) return path.resolve(explicit)
  const cands = [path.resolve(binDir, '..', 'web'), path.resolve(binDir, '..', '..', 'ops', 'out', 'web')]
  for (const dir of cands) if (await fs.access(path.join(dir, 'index.html')).then(() => true).catch(() => false)) return dir
  return cands[cands.length - 1]
}

export async function doctorRows(opt) {
  const rows = []
  const add = (state, what, note = '') => rows.push({ state, what, note })
  const ok = (w, n) => add('ok', w, n)
  const warn = (w, n) => add('warn', w, n)
  const fail = (w, n) => add('fail', w, n)
  const bind = opt.bind || '127.0.0.1'
  const port = Number(opt.port) || 7374

  // ── 런타임
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 20) ok('node', process.version)
  else fail('node', `${process.version} — 20 이상이어야 한다`)
  // 판 확인은 현재 폴더에 기대지 않는다 — root 가 /root 에서 `cdp serve doctor` 를 부르면 서비스 계정이 그 폴더에
  // 못 들어가 `git -C /root` 가 실패했고, 그것을 「git 이 없다」 로 냈다(2026-10-12 실서버)
  const gv = await git(os.tmpdir(), ['--version'], 5000)
  if (gv.ok) ok('git', gv.out)
  else if (gv.code === 'ENOENT') fail('git', '없다 — 서버가 clone · commit · push 를 직접 한다')
  else fail('git', `실행하지 못했다 — ${gv.err || gv.code || '까닭 모름'}`)

  // ── 명부
  if (!opt.auth) {
    fail('--auth', '없다. 루프백 밖에 인증 없이 열 수 없다')
  } else {
    const st = await fs.stat(opt.auth).catch(() => null)
    if (!st) {
      warn('auth.json', `${opt.auth} 가 아직 없다 — 브라우저 /setup 또는 ctx serve init 으로 만든다`)
    } else {
      if (process.platform !== 'win32' && st.mode & 0o077) fail('auth.json 권한', `0${(st.mode & 0o777).toString(8)} — 600 이어야 한다`)
      else ok('auth.json', opt.auth)
      try {
        const db = await auth.load(opt.auth)
        const active = db.users.filter((u) => u.active !== false)
        const admins = auth.admins(db)
        const writers = active.filter((u) => auth.roleOf(u) === 'writer')
        const live = db.tokens.filter((t) => t.status !== 'revoked')
        if (!db.users.length) warn('명부', '사용자가 없다 — 브라우저 /setup 또는 ctx serve init')
        else ok('명부', `사용자 ${db.users.length} · admin ${admins.length} · writer ${writers.length} · 토큰 ${live.length}${db.tokens.length !== live.length ? ` (폐기 ${db.tokens.length - live.length})` : ''}`)
        // **관리자가 없으면 콘솔에 아무도 못 들어간다.** v1.1 명부를 그대로 올린 서버가 이 상태다.
        if (db.users.length && !admins.length) warn('관리자', '없다 — ctx serve user set --name <이름> --role admin (콘솔은 admin 만 들어간다)')
        if (db.users.length && !admins.length && !writers.length) warn('write', 'save 를 할 수 있는 사람이 없다')
        const list = auth.tokenList(db)
        const soon = list.filter((t) => t.status === 'active' && t.daysLeft !== null && t.daysLeft <= 7)
        if (soon.length) warn('토큰 만료', soon.map((t) => `${t.user}(${t.id}) ${t.daysLeft}일`).join(' · '))
        // 관리자 토큰은 짧아야 한다(30일). 90일 · 무기한이면 말한다.
        const adminNames = new Set(admins.map((a) => a.name))
        // 남은 일수는 그날 끝까지라 올림이다 — 갓 발급한 30일 토큰이 31 로 센다. 하루를 봐준다.
        const longAdmin = list.filter((t) => t.status === 'active' && adminNames.has(t.user) && (t.daysLeft === null || t.daysLeft > auth.ADMIN_EXPIRES_DAYS))
        // 개인 서버는 그 PC 의 주인 하나 — 무기한이 설계다(preparePersonal)
        if (longAdmin.length && !opt.only) warn('관리자 토큰', longAdmin.map((t) => `${t.user}(${t.id}) ${t.daysLeft === null ? '무기한' : t.daysLeft + '일'}`).join(' · ') + ` — 관리자 토큰은 ${auth.ADMIN_EXPIRES_DAYS}일 안으로 둔다`)
      } catch (e) {
        fail('auth.json 형식', e.message)
      }
    }
  }

  // ── 데이터 폴더
  if (!opt.data) warn('--data', '없다 — 로그 · 세션 비밀 · 대장이 저장되지 않는다')
  else {
    const probe = path.join(opt.data, '.doctor-write')
    try {
      await fs.mkdir(opt.data, { recursive: true })
      await fs.writeFile(probe, 'x')
      await fs.rm(probe, { force: true })
      ok('--data', opt.data)
    } catch (e) {
      fail('--data', `${opt.data} 에 쓸 수 없다 — ${e.message}`)
    }
    // 부트스트랩 코드 — 명부가 비어 있을 때만 있다. 있으면 다음 할 일이 그것이다.
    const boot = await fs.readFile(path.join(opt.data, 'bootstrap.code'), 'utf8').catch(() => null)
    if (boot) warn('첫 관리자', `아직 없다 — 브라우저 http://${bind}:${port}/setup 에 부트스트랩 코드(${path.join(opt.data, 'bootstrap.code')})를 넣는다`)
  }

  // ── 화면 · 설명서
  {
    const web = await resolveWebDir({ explicit: opt.web || null })
    const has = await fs.access(path.join(web, 'index.html')).then(() => true).catch(() => false)
    if (has) ok('web', web)
    else if (opt.web) fail('web', `${opt.web}/index.html 이 없다 — 산출물의 web/ 을 준다`)
    else warn('web', '없다 — 화면 없이 MCP 와 읽기 API 만 돈다. 산출물의 web/ 을 번들 옆에 둔다')
  }
  const man = await resolveManualDir({ explicit: opt.manual })
  if (man) ok('manual', `${man.dir} · 설명서 ${man.books.length}권`)
  else warn('manual', '없다 — 설명서 페이지가 빈다. 산출물의 manual/ 을 두거나 --manual')

  // ── kit · 서식집 — 작업 레포의 스킬 · CLAUDE 블록과 새 문서의 서식은 서버 번들에서 나간다(v1.0 W5 · U6)
  const kit = await findKitDir({ explicit: opt.kit })
  if (kit) ok('kit', `${kit.dir} (${kit.how})`)
  else fail('kit', '없다 — 설치 한 줄 · 큐레이터 kit 이 빈 채로 나간다. 산출물의 kit/ 을 두거나 --kit')
  const forms = await findFormsDir({ explicit: opt.forms })
  if (forms) ok('forms', `${forms.dir} (${forms.how})`)
  else warn('forms', '없다 — 서식에서 새 관리 문서를 세울 수 없다(큐레이터 forms · managed.add { form }). 산출물의 forms/ 을 두거나 --forms')

  // ── 레포
  if (!opt.root) fail('--root', '없다')
  else {
    // 개인 서버는 레포 하나 — 옆 폴더들(~/Documents/GitHub 의 코드 레포들)을 「레포 아님」 으로 세지 않는다
    const repos = await listRepos(path.resolve(opt.root)).then((rs) => (opt.only ? rs.filter((r) => r.name === opt.only) : rs)).catch(() => null)
    if (!repos) fail('--root', `${opt.root} 를 읽을 수 없다`)
    else {
      const real = repos.filter((r) => r.vocab)
      if (!real.length) warn('레포', `${opt.root} 에 지식 레포가 없다 (_vocab.md 있는 폴더) — 콘솔 > 지식 레포 · ctx repo new · git clone`)
      for (const r of repos) {
        if (!r.vocab) {
          warn(`레포 ${r.name}`, '_vocab.md 가 없어 레포로 인식되지 않는다')
          continue
        }
        if (!r.git) {
          fail(`레포 ${r.name}`, 'git 레포가 아니다 — save 가 커밋할 수 없다')
          continue
        }
        // 더러운 트리 — save 가 거절된다(동시 기록 검토 v0.1 D5). 전에는 doctor 가 보지 않았다(실측 M8)
        if (r.dirty > 0) fail(`레포 ${r.name} 트리`, `커밋 안 된 변경 ${r.dirty}건 — save 가 거절된다. 콘솔 > 지식 레포 > 「트리 되돌리기」 (셸: git -C ${r.path} checkout -- . && git clean -fd)`)
        if (!r.upstream) warn(`레포 ${r.name}`, `upstream 없음 — 미러가 off 다 (head ${r.head})`)
        else {
          // origin 도달 · push 자격 — 아무것도 보내지 않는다
          const ls = await git(r.path, ['ls-remote', '--exit-code', '-h', 'origin'], 10000)
          if (!ls.ok) fail(`레포 ${r.name} origin`, ls.killed ? '10초 안에 닿지 않았다' : (ls.err || '닿지 않는다').split(NL)[0])
          else {
            // **origin 이 앞서 있나** — fetch 없이 안다(동시 기록 검토 v0.1 D4 · D9). ls-remote 가 이미 받아 온 origin 의
            // 브랜치 sha 를 마지막 fetch 의 `origin/<branch>` 와 견준다. 다르면 누군가 서버 밖에서 썼다.
            const branch = (r.upstream.split('/').slice(1).join('/') || r.branch || '').trim()
            const remoteSha = ls.out
              .split(NL)
              .map((l) => l.split(/\s+/))
              .find(([, ref]) => ref === 'refs/heads/' + branch)?.[0]
            const localUp = (await git(r.path, ['rev-parse', r.upstream], 5000)).out
            const moved = !!remoteSha && !!localUp && remoteSha !== localUp
            const originAhead = moved || r.behind > 0
            if (originAhead && r.ahead > 0) fail(`레포 ${r.name} origin`, `갈라졌다 — 서버 ${r.ahead}건 · origin 이 앞섬. 기계는 합치지 않는다: 셸에서 sudo -u cdp -H git -C ${r.path} pull --rebase 뒤 콘솔 「다시 보내기」`)
            else if (originAhead) warn(`레포 ${r.name} origin`, `origin 이 앞서 있다 — 누군가 서버 밖에서 썼다. 콘솔 > 지식 레포 > 「origin 과 맞추기」(ff-only)`)
            const dry = await git(r.path, ['push', '--dry-run', 'origin', 'HEAD'], 15000)
            if (dry.ok) ok(`레포 ${r.name}`, `head ${r.head} · ${r.upstream} · push 자격 있음${r.ahead ? ' · origin 에 못 보냄 ' + r.ahead + '건' : ''}`)
            else {
              const c = classifyPushError(dry.err || dry.out)
              fail(`레포 ${r.name} push`, `${REASON_TEXT[c.reason] || c.reason}${c.line ? ' — ' + c.line : ''}`)
            }
          }
        }
        if (r.ahead > 0) warn(`레포 ${r.name} 미러`, `${r.ahead}건이 origin 에 안 갔다 — 콘솔 > 지식 레포 > 「다시 보내기」`)
        // 옛 레포 — 도구 층(bin · 훅 · 스킬 사본 · INDEX)이 남아 있으면 아직 v1.0 으로 옮기지 않았다(I9 · 개편안 §9.2)
        const left = []
        for (const rel of TOOL_LAYER) if (await fs.stat(path.join(r.path, rel)).catch(() => null)) left.push(rel)
        if (left.length) warn(`레포 ${r.name} 도구 층`, `옛 도구 층이 남았다(${left.slice(0, 4).join(' · ')}${left.length > 4 ? ' …' : ''}) — 서버를 멈추고 sudo -u cdp -H node <prefix>/bin/ctx.mjs migrate ${r.path}`)
      }
    }
  }

  // ── git 자격 스코프 — 평문 PAT 가 넓은 스코프(api)일 수 있다는 것만 말한다
  try {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const cred = await fs.readFile(path.join(home, '.git-credentials'), 'utf8').catch(() => '')
    const alt = await fs.readFile(path.join(path.dirname(opt.auth || ''), '.git-credentials'), 'utf8').catch(() => '')
    if (/glpat-/.test(cred + alt)) warn('git 자격', '평문 PAT 가 있다 — 스코프가 api 면 계정 전체를 연다. Deploy Key 로 좁힐 수 있으면 좁힌다(설치절차 3장)')
  } catch {}

  // ── 포트 — 이미 떠 있으면 /healthz 를 본다. 서버 안에서 부를 때는 자기 자신이라 건너뛴다
  if (!opt.inProcess) {
    try {
      const ac = new AbortController()
      const t = setTimeout(() => ac.abort(), 3000)
      const r = await fetch(`http://${bind === '0.0.0.0' ? '127.0.0.1' : bind}:${port}/healthz`, { signal: ac.signal })
      clearTimeout(t)
      if (r.ok) {
        const j = await r.json().catch(() => ({}))
        ok('서버', `${bind}:${port} 응답 · built ${j.built} · 레포 ${j.repos} · 미러 ok ${j.mirror?.ok} lag ${j.mirror?.lag} off ${j.mirror?.off}`)
      } else warn('서버', `${bind}:${port} 가 ${r.status} 로 답한다 — 다른 무엇이 그 포트에 있다`)
    } catch {
      ok('포트', `${bind}:${port} 비어 있다 (서버가 아직 안 떴다)`)
    }
  }

  const fails = rows.filter((r) => r.state === 'fail').length
  const warns = rows.filter((r) => r.state === 'warn').length
  return { ok: fails === 0, fails, warns, rows }
}

export async function runDoctor(opt) {
  // 개인 서버 — 자리는 정해져 있다(~/.cdp/personal/<레포> · up.json 의 포트). 플래그를 다시 받지 않는다(제품화 2 F5)
  if (opt.personal) {
    const repo = path.resolve(String(opt.personal === true ? opt.args?.[1] || '.' : opt.personal))
    const data = path.resolve(opt.data || path.join(os.homedir(), '.cdp', 'personal', path.basename(repo)))
    const up = await fs.readFile(path.join(data, 'up.json'), 'utf8').then(JSON.parse).catch(() => null)
    opt = { ...opt, root: path.dirname(repo), auth: path.join(data, 'auth.json'), data, bind: '127.0.0.1', port: opt.port || up?.port || 7400, only: path.basename(repo) }
  }
  const res = await doctorRows(opt)
  if (opt.json) {
    out(JSON.stringify(res, null, 2))
    return res.fails ? 1 : 0
  }
  const mark = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' }
  const width = (s) => [...s].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  const w = Math.max(...res.rows.map((r) => width(r.what)), 8)
  const pad = (s) => s + ' '.repeat(Math.max(0, w - width(s)))
  for (const r of res.rows) out(` ${mark[r.state]}  ${pad(r.what)}  ${r.note}`)
  out('')
  out(`doctor: fail ${res.fails} · warn ${res.warns} · ok ${res.rows.length - res.fails - res.warns}`)
  return res.fails ? 1 : 0
}

export async function runInit(opt) {
  if (!opt.auth) return bail('--auth <auth.json> 이 필요하다')
  if (!opt.name) return bail('--name <이름> 이 필요하다 — 첫 관리자. 커밋의 author 로 남는다')
  const dataDir = opt.data ? path.resolve(opt.data) : null
  let db
  try {
    db = await auth.load(opt.auth)
  } catch (e) {
    return bail(e.message)
  }
  if (db.users.length) {
    return bail(`명부가 이미 있다 (사용자 ${db.users.length}명) — 덮지 않는다. serve user add · serve token 을 쓴다`)
  }
  const repos = opt.repos2 !== undefined ? opt.repos2 : '*'
  try {
    // 첫 사용자는 **admin** 이다 — 다음 관리자는 이 사람이 콘솔에서 지정한다(D3).
    const u = auth.userAdd(db, { name: opt.name, label: opt.label ?? null, repos, role: 'admin' })
    const { raw, rec } = auth.issue(db, {
      user: u.name,
      expiresDays: opt.expires === undefined ? undefined : opt.expires === 'never' ? 'never' : Number(opt.expires),
      note: opt.note ?? '첫 토큰 (init)',
    })
    await auth.store(opt.auth, db)
    await auth.clearBootstrap(dataDir)
    await auth.audit(dataDir, `init · user add · ${u.name} · repos=${u.repos.join(',')} · role=${u.role}`)
    await auth.audit(dataDir, `init · token issue · ${u.name} · ${rec.id} · expires=${rec.expires}`)
    // **원문은 여기서 한 번만 나온다.** stdout 에 그 한 줄 · 나머지는 stderr.
    out(raw)
    err('')
    err(`명부를 만들었다: ${opt.auth} — 사용자 ${u.name} · repos ${u.repos.join(',')} · role ${u.role}`)
    err('위 한 줄이 토큰 원문이다. 다시 볼 수 없다 — 본인이 CDP_TOKEN 에 넣는다.')
    err(`id ${rec.id} · 만료 ${rec.expires} (관리자 토큰은 ${auth.ADMIN_EXPIRES_DAYS}일)`)
    err('다음 사람은 브라우저 콘솔(/console) 또는 serve user add → serve token 으로. 이 명령은 첫 번만이다.')
    return 0
  } catch (e) {
    return bail(e.message)
  }
}

function bail(msg) {
  err('ctx serve init: ' + msg)
  return 2
}
