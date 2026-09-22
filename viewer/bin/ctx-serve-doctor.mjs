// ctx serve doctor · init — 서버 준비물을 명령 하나로. 검토 §3.3 · 제품화 TODO 3.3 · 3.4.
//
//   ctx serve doctor --root <폴더> --auth <f> --data <d> [--web <dir>] [--bind <IP>] [--port <n>] [--packages <dir>] [--json]
//   ctx serve init   --auth <f> --data <d> --name <이름> [--label …] [--repos *] [--write]
//
// `doctor` 는 설치절차 0장(준비물)과 4장 끝(push --dry-run)과 6장 확인을 한
// 자리에서 본다. 줄마다 ok · warn · fail. **fail 이 하나라도 있으면 exit 1**,
// warn 만이면 0 — 경고로 설치를 막지 않는다.
//
// `init` 은 5장 ②③(첫 사용자 + 토큰)을 한 번에. 이미 명부가 있으면 거절한다 —
// 덮지 않는다. 발급은 여전히 서버 셸의 CLI 다(§4.4.1).

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import * as auth from '../../core/auth.js'
import { listRepos } from '../../core/reponew.js'
import { resolvePackages } from './ctx-package.mjs'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

function git(cwd, args, timeout = 10000) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout, windowsHide: true, encoding: 'utf8' }, (e, stdout, stderr) => {
      resolve({ ok: !e, out: String(stdout || '').trim(), err: String(stderr || '').trim(), killed: e?.killed })
    })
  })
}

export async function runDoctor(opt) {
  const rows = []
  const add = (state, what, note = '') => rows.push({ state, what, note })
  const ok = (w, n) => add('ok', w, n)
  const warn = (w, n) => add('warn', w, n)
  const fail = (w, n) => add('fail', w, n)

  // ── 런타임
  const major = Number(process.versions.node.split('.')[0])
  if (major >= 20) ok('node', process.version)
  else fail('node', `${process.version} — 20 이상이어야 한다`)
  const gv = await git(process.cwd(), ['--version'], 5000)
  if (gv.ok) ok('git', gv.out)
  else fail('git', '없다 — 서버가 clone · commit · push 를 직접 한다')

  // ── 명부
  if (!opt.auth) {
    fail('--auth', '없다. 루프백 밖에 인증 없이 열 수 없다')
  } else {
    const st = await fs.stat(opt.auth).catch(() => null)
    if (!st) warn('auth.json', `${opt.auth} 가 아직 없다 — ctx serve init 으로 만든다`)
    else {
      if (process.platform !== 'win32' && st.mode & 0o077) fail('auth.json 권한', `0${(st.mode & 0o777).toString(8)} — 600 이어야 한다`)
      else ok('auth.json', opt.auth)
      try {
        const db = await auth.load(opt.auth)
        const writers = db.users.filter((u) => u.write && u.active !== false)
        if (!db.users.length) warn('명부', '사용자가 없다 — ctx serve init')
        else ok('명부', `사용자 ${db.users.length} · write ${writers.length} · 토큰 ${db.tokens.length}`)
        if (db.users.length && !writers.length) warn('write', 'save 를 할 수 있는 사람이 없다')
        const soon = auth.tokenList(db).filter((t) => t.daysLeft !== null && t.daysLeft <= 7)
        if (soon.length) warn('토큰 만료', soon.map((t) => `${t.user}(${t.id}) ${t.daysLeft}일`).join(' · '))
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
  }

  // ── 화면
  if (opt.web) {
    if (await fs.access(path.join(opt.web, 'index.html')).then(() => true).catch(() => false)) ok('--web', opt.web)
    else fail('--web', `${opt.web}/index.html 이 없다 — npm run build`)
  } else warn('--web', '없다 — 화면 없이 MCP 와 읽기 API 만 돈다')

  // ── 패키지
  const pk = await resolvePackages({ explicit: opt.packages })
  if (pk) {
    const n = (await fs.readdir(pk.dir).catch(() => [])).length
    ok('packages', `${pk.dir} (${pk.how}) · ${n}개`)
  } else warn('packages', '없다 — ctx repo new 를 쓰려면 --packages')

  // ── 레포
  if (!opt.root) fail('--root', '없다')
  else {
    const repos = await listRepos(path.resolve(opt.root)).catch(() => null)
    if (!repos) fail('--root', `${opt.root} 를 읽을 수 없다`)
    else {
      const real = repos.filter((r) => r.vocab)
      if (!real.length) warn('레포', `${opt.root} 에 지식 레포가 없다 (_vocab.md 있는 폴더) — ctx repo new 또는 git clone`)
      for (const r of repos) {
        if (!r.vocab) {
          warn(`레포 ${r.name}`, '_vocab.md 가 없어 레포로 인식되지 않는다')
          continue
        }
        if (!r.git) {
          fail(`레포 ${r.name}`, 'git 레포가 아니다 — save 가 커밋할 수 없다')
          continue
        }
        if (!r.upstream) warn(`레포 ${r.name}`, `upstream 없음 — 미러가 off 다 (head ${r.head})`)
        else {
          // origin 도달 · push 자격 — 아무것도 보내지 않는다
          const ls = await git(r.path, ['ls-remote', '--exit-code', '-h', 'origin'], 10000)
          if (!ls.ok) fail(`레포 ${r.name} origin`, ls.killed ? '10초 안에 닿지 않았다' : (ls.err || '닿지 않는다').split(NL)[0])
          else {
            const dry = await git(r.path, ['push', '--dry-run', 'origin', 'HEAD'], 15000)
            if (dry.ok) ok(`레포 ${r.name}`, `head ${r.head} · ${r.upstream} · push 자격 있음${r.ahead ? ' · 미러 밀림 ' + r.ahead + '건' : ''}`)
            else fail(`레포 ${r.name} push`, (dry.err || '거부').split(NL).find((l) => l.trim()) || '거부')
          }
        }
        if (r.ahead > 0) warn(`레포 ${r.name} 미러`, `${r.ahead}건이 origin 에 안 갔다`)
      }
    }
  }

  // ── git 자격 스코프 — 평문 PAT 가 넓은 스코프(api)일 수 있다는 것만 말한다
  try {
    const home = process.env.HOME || process.env.USERPROFILE || ''
    const cred = await fs.readFile(path.join(home, '.git-credentials'), 'utf8').catch(() => '')
    const alt = await fs.readFile(path.join(path.dirname(opt.auth || ''), '.git-credentials'), 'utf8').catch(() => '')
    if (/glpat-/.test(cred + alt)) warn('git 자격', '평문 PAT 가 있다 — 스코프가 api 면 계정 전체를 연다. Deploy Key 로 좁힐 수 있으면 좁힌다(설치절차 10장)')
  } catch {}

  // ── 포트 — 이미 떠 있으면 /healthz 를 본다
  const bind = opt.bind || '127.0.0.1'
  const port = Number(opt.port) || 7374
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

  const fails = rows.filter((r) => r.state === 'fail').length
  const warns = rows.filter((r) => r.state === 'warn').length
  if (opt.json) {
    out(JSON.stringify({ ok: fails === 0, fails, warns, rows }, null, 2))
    return fails ? 1 : 0
  }
  const mark = { ok: 'ok  ', warn: 'warn', fail: 'FAIL' }
  const w = Math.max(...rows.map((r) => [...r.what].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)), 8)
  const pad = (s) => s + ' '.repeat(Math.max(0, w - [...s].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)))
  for (const r of rows) out(` ${mark[r.state]}  ${pad(r.what)}  ${r.note}`)
  out('')
  out(`doctor: fail ${fails} · warn ${warns} · ok ${rows.length - fails - warns}`)
  return fails ? 1 : 0
}

export async function runInit(opt) {
  if (!opt.auth) return bail('--auth <auth.json> 이 필요하다')
  if (!opt.name) return bail('--name <이름> 이 필요하다 — 첫 사용자. 커밋의 author 로 남는다')
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
    const u = auth.userAdd(db, { name: opt.name, label: opt.label ?? null, repos, write: opt.write !== false })
    const { raw, rec } = auth.issue(db, {
      user: u.name,
      expiresDays: opt.expires === 'never' ? 'never' : Number(opt.expires || auth.DEFAULT_EXPIRES_DAYS),
      note: opt.note ?? '첫 토큰 (init)',
    })
    await auth.store(opt.auth, db)
    await auth.audit(dataDir, `init · user add · ${u.name} · repos=${u.repos.join(',')} · write=${u.write}`)
    await auth.audit(dataDir, `init · token issue · ${u.name} · ${rec.sha256.slice(0, 8)} · expires=${rec.expires}`)
    // **원문은 여기서 한 번만 나온다.** stdout 에 그 한 줄 · 나머지는 stderr.
    out(raw)
    err('')
    err(`명부를 만들었다: ${opt.auth} — 사용자 ${u.name} · repos ${u.repos.join(',')} · write ${u.write}`)
    err('위 한 줄이 토큰 원문이다. 다시 볼 수 없다 — 본인이 CDP_TOKEN 에 넣는다.')
    err(`id ${rec.sha256.slice(0, 8)} · 만료 ${rec.expires}`)
    err('다음 사람은 serve user add → serve token 으로. 이 명령은 첫 번만이다.')
    return 0
  } catch (e) {
    return bail(e.message)
  }
}

function bail(msg) {
  err('ctx serve init: ' + msg)
  return 2
}
