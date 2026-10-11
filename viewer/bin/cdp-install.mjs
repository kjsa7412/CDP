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
//   일괄     에이전트 세팅이 바뀌었을 때 — **이 PC 에 이 서버로 설치한 작업 레포 전부**를 한 번에(에이전트 세팅 갱신 T9)
//              node cdp-install.mjs --update [<작업 레포 경로>…] [--dry] [--yes] [--commit]
//            설치할 때마다 이 PC 의 설치 목록(`core/localreg.js`)에 경로를 적어 두고 그것을 돈다.
//            `--commit` 이면 레포마다 **바꾼 파일만** 커밋한다 — 그 파일에 원래 커밋 안 된 변경이 있으면 그 레포는 커밋하지 않는다
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
import { planSetup, applySetup, mergeMcpJson, mcpEntryServer, repoDriftNote, mergeCuratorFile } from '../../core/setup.js'
import { saveToken, storeLabel, loadToken } from '../../core/tokenstore.js'
import { execFile } from 'node:child_process'
import { regFile, loadReg, saveReg, record, forServer, samePath } from '../../core/localreg.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

// 서버가 이 파일 맨 앞에 한 줄로 박아 넣는다.
// 없으면 손으로 꺼내 온 것이라 안내만 하고 멈춘다.
const CFG = globalThis.__CDP_KIT__ || null

function parseArgs(argv) {
  const flags = { dry: false, yes: false, noSave: false, repo: null, workrepo: null, update: false, commit: false, curator: false, folder: false, fixIgnore: false, brief: false, connect: false }
  const pos = []
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--dry') flags.dry = true
    else if (a === '--yes' || a === '-y') flags.yes = true
    else if (a === '--no-save') flags.noSave = true
    else if (a === '--update') flags.update = true
    else if (a === '--commit') flags.commit = true
    else if (a === '--curator') flags.curator = true
    else if (a === '--folder') flags.folder = true
    else if (a === '--fix-gitignore') flags.fixIgnore = true
    else if (a === '--brief') flags.brief = true
    else if (a === '--connect') flags.connect = true
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

  // 일괄 — 이 PC 의 설치 목록을 돈다. 레포 · 등록 id 는 목록에 있다
  if (flags.update) {
    if (!net) return bail('--update 는 한 줄 설치기로 돈다 — 화면 「시작하기」 의 「에이전트 세팅이 바뀌었다」 줄을 쓰세요.')
    return updateAll({ server, paths: pos, dry, yes, commit: flags.commit, noSave: flags.noSave, fixIgnore: flags.fixIgnore })
  }

  // 큐레이터 폴더(v1.0 §6.3) — git 레포가 아니어도 되고 대장에 오르지 않는다. 큐레이터 kit(스킬 여섯 · 큐레이터 블록)을 받는다
  if (flags.curator) {
    if (!net) return bail('--curator 는 한 줄 설치기로 돈다 — 화면 「시작하기」 의 「큐레이터 폴더」 줄을 쓰세요.')
    const dir = pos[0] || '.'
    if (!repo) return bail('사용법 — node cdp-install.mjs --curator --repo <레포> [<폴더>] [--dry] [--yes]')
    return installSimple({ kind: 'curator', server, repo, dir, dry, yes, noSave: flags.noSave, brief: flags.brief })
  }

  // 여러 코드 레포를 한 번에(제품화 2 F11) — 상위 폴더 아래의 git 레포를 고르고 · 대장에 한 번에 등록하고 · 설치한다. 묻는 것은 한 번
  if (flags.connect) {
    if (!net) return bail('--connect 는 한 줄 설치기로 돈다.')
    if (!repo || !pos[0]) return bail('사용법 — node cdp-install.mjs --connect --repo <레포> <코드 레포들이 있는 폴더> [--commit] [--dry] [--yes] [--fix-gitignore]')
    return connectAll({ server, repo, dir: pos[0], dry, yes, noSave: flags.noSave, fixIgnore: flags.fixIgnore, commit: flags.commit })
  }

  // 스킬 사본 폴더(제품화 2 F15) — 워크스페이스 공용 skills 폴더처럼 **스킬만** 두는 자리. `cdp-*/` 를 그 폴더 바로 아래에 둔다.
  // 설치 목록에 `folder` 로 남아 `--update` 가 같이 돈다 — 손으로 cp 하던 사본이 낡지 않게
  if (flags.folder) {
    if (!net) return bail('--folder 는 한 줄 설치기로 돈다.')
    if (!repo || !pos[0]) return bail('사용법 — node cdp-install.mjs --folder --repo <레포> <skills 폴더> [--dry] [--yes]')
    return installSimple({ kind: 'folder', server, repo, dir: pos[0], dry, yes, noSave: flags.noSave, brief: flags.brief })
  }

  const work = pos[0]
  if (!work || (net && (!repo || !workrepo))) {
    out('사용법 —')
    if (net) {
      out('  node cdp-install.mjs --repo <레포> --workrepo <등록 id> <작업 레포 경로> [--dry] [--yes] [--no-save]')
      out('  node cdp-install.mjs --update [<경로>…] [--dry] [--yes] [--commit]   이 PC 의 작업 레포 · 큐레이터 폴더 · 스킬 폴더 전부를 한 번에')
      out('  node cdp-install.mjs --connect --repo <레포> <코드 레포들이 있는 폴더>   여러 레포를 한 번에 등록 · 설치')
      out('  node cdp-install.mjs --curator --repo <레포> [<폴더>]                큐레이터 폴더')
      out('  node cdp-install.mjs --folder --repo <레포> <skills 폴더>            스킬만 두는 폴더(워크스페이스 사본)')
    } else out('  node install.mjs <작업 레포 경로> [--dry] [--yes] [--no-save]')
    out('')
    out('  --dry      무엇이 바뀔지만 보고 쓰지 않는다')
    out('  --yes      묻지 않는다 (스크립트에서 부를 때 — 토큰은 CDP_TOKEN 에서)')
    out('  --no-save  입력한 토큰을 이 PC 에 두지 않는다')
    if (net) out('  --commit   (--update) 레포마다 바꾼 파일만 커밋한다')
    out('  --fix-gitignore  .gitignore 가 CDP 파일을 막으면 푸는 줄을 더한다')
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

  if (!flags.brief) {
    out(`서버     ${server}`)
    out(`레포     ${repo}`)
    out(`작업 레포 ${path.resolve(work)}`)
  }

  // ── 토큰(I3) — 한 줄 모양은 kit 을 받아야 하니 **없으면 못 간다.** 꾸러미는 보고에만 쓴다
  const tk = await resolveToken(server, { required: net, yes, quiet: flags.brief })
  if (tk?.error) return bail(tk.error)
  if (!flags.brief) out('')

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
    return await install({ server, repo, workrepo, kit, kitDir, work, dry, yes, token: tk?.token || null, fixIgnore: flags.fixIgnore, brief: flags.brief })
  } finally {
    await cleanup()
  }
}

// `brief` — 여러 곳을 한 번에 붙이는 쪽(`ctx up`)이 부를 때. 파일 목록 · 「다음 —」 을 빼고 결과 한 줄 — 안내는 부른 쪽이 한 번만 낸다
async function install({ server, repo, workrepo, kit, kitDir, work, dry, yes, token, fixIgnore = false, brief = false }) {
  // `.mcp.json` 은 `planSetup` 이 모른다 — `planFor` 가 기존 파일을 읽어 병합한다. 덮지 않는다
  const pf = await planFor({ server, repo, kit, kitDir, work })
  if (pf.error) return bail(pf.error)
  const plan = pf.plan

  if (!brief) {
    for (const a of plan.actions) {
      out(`  ${a.op === 'same' ? ' ' : '*'} ${a.op.padEnd(7)} ${a.kind.padEnd(8)} ${short(a.to, work)}`)
    }
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
    out((await reportTo(server, workrepo, token, kit)) ? '대장에 보고했습니다.' : '대장 보고는 실패했습니다 — 설치는 끝났습니다 (보고는 추적용입니다)')
  }

  const changes = plan.actions.filter((a) => a.op !== 'same')
  if (!changes.length) {
    out('')
    out('이미 최신입니다.')
    if (!dry) {
      await report()
      await remember({ server, repo, workrepo, work, kit })
    }
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
  if (!brief) out('')
  out(`${changes.length}건 적용했습니다.${kit ? ` (kit ${kit})` : ''}`)
  await report()
  await remember({ server, repo, workrepo, work, kit })
  if (brief) {
    const ig = await ignoredOf(work, changes.map((a) => relTo(work, a.to)))
    if (ig.length && fixIgnore) out(`.gitignore 에 ${(await fixGitignore(work, ig)).length}줄을 더했습니다`)
    else if (ig.length) out(`! .gitignore 가 CDP 파일을 막습니다 — 더할 줄 ${negations(ig).join(' ')} (--fix-gitignore)`)
    return 0
  }

  out('')
  out('다음 —')
  if (!token) {
    out('  0. 토큰을 이 PC 에 둔다 (관리자에게 받는다) — 이 명령을 한 번 더 돌리면 묻고 둔다')
  }
  out('  1. Claude Code 를 완전히 끄고 다시 켠다 — 환경변수는 프로세스가 시작할 때 읽힌다')
  out('     VS Code · 데스크톱 앱 안의 Claude Code 면 그 앱을 다시 켠다 (열려 있던 터미널에는 새 값이 없다)')
  out('  2. /mcp 에 cdp 가 connected 인지 본다')
  // .gitignore 가 .claude 를 막으면 `git add` 가 스킬을 조용히 빼먹는다(제품화 2 S3) — 커밋 줄을 내기 전에 본다
  const rels = changes.map((a) => relTo(work, a.to))
  const ig = await ignoredOf(work, rels)
  if (ig.length) {
    if (fixIgnore) {
      const added = await fixGitignore(work, ig)
      out(`     .gitignore 에 ${added.length}줄을 더했습니다 — ${added.join(' · ')}`)
    } else {
      out(`  ! .gitignore 가 CDP 파일을 막습니다 — ${ig.join(' · ')}`)
      out(`    .gitignore 에 더할 줄: ${negations(ig).join('  ')}   (--fix-gitignore 를 주면 이 명령이 더한다)`)
    }
  }
  out('  3. git add .mcp.json .claude CLAUDE.md .gitignore && git commit')
  out('     팀원은 pull 과 토큰만으로 끝난다 — 이 명령을 돌리면 토큰을 묻고 대장에 보고까지 한다')
  return 0
}

// ── 큐레이터 폴더 — 등록 없이(v1.0 §6.3 · W5) ────────────────────────────────
//
// 큐레이션은 작업 레포가 아니라 큐레이터의 아무 폴더에서 한다(코드가 없다 · 커밋도 없다). 서버가 그 폴더에 놓일 모양 그대로
// 준다 — `.mcp.json` · `.claude/cdp.json` · `.claude/skills/cdp-*` · `CLAUDE.md`(큐레이터 블록). 있는 `.mcp.json` · `CLAUDE.md`
// 는 병합한다(덮지 않는다 — 같은 규칙의 `mergeMcpJson` · `mergeClaude` 를 서버가 이미 적용해 보냈다면 그대로 쓴다).
async function installCurator({ server, repo, dir, dry, yes, noSave }) {
  return installSimple({ kind: 'curator', server, repo, dir, dry, yes, noSave })
}

// 큐레이터 폴더 · 스킬 사본 폴더의 계획 — 받은 kit 을 그 폴더에 놓일 모양으로. 한 번 설치와 `--update` 가 같은 것을 쓴다
async function planSimple({ kind, server, repo, root, token }) {
  const role = kind === 'curator' ? 'curator' : 'writer'
  const r = await fetch(`${server}/kit/${encodeURIComponent(repo)}?as=json&role=${role}`, { headers: { authorization: 'Bearer ' + token } }).catch(() => null)
  if (!r) return { error: `서버에 닿지 않습니다 — ${server}` }
  const j = await r.json().catch(() => null)
  if (!r.ok || !j || !Array.isArray(j.files)) return { error: `kit 을 받지 못했습니다 — ${j?.error?.message || 'HTTP ' + r.status}` }
  if (kind === 'curator' && j.role !== 'curator') return { error: `이 토큰은 ${repo} 의 큐레이터가 아닙니다 — 관리자에게 그 레포의 큐레이터 권한(curate)을 받습니다.` }
  const plan = []
  for (const f of j.files) {
    let rel = String(f.name || '')
    // 서버가 옛 판이면 kit 안쪽 원본이 온다 — 폴더에 두지 않는다(F12)
    if (rel.startsWith('.claude/work-repo/')) continue
    if (kind === 'folder') {
      // 스킬만 — `.claude/skills/cdp-x/…` → `cdp-x/…`
      if (!rel.startsWith('.claude/skills/')) continue
      rel = rel.slice('.claude/skills/'.length)
    }
    const dst = path.resolve(root, rel)
    if (!rel || !(dst === root || dst.startsWith(root + path.sep))) continue
    const cur = await fs.readFile(dst).catch(() => null)
    const raw = Buffer.from(String(f.data || ''), 'base64')
    const data = kind === 'curator' ? mergeCuratorFile(rel, raw, cur, j.kit) : raw
    plan.push({ rel, dst, data, op: cur == null ? 'create' : Buffer.compare(cur, data) === 0 ? 'same' : 'update' })
  }
  return { plan, kit: j.kit || null }
}

const SIMPLE_LABEL = { curator: '큐레이터 폴더', folder: '스킬 폴더' }

async function installSimple({ kind, server, repo, dir, dry, yes, noSave, brief = false }) {
  const root = path.resolve(dir)
  if (!brief) {
    out(`서버     ${server}`)
    out(`레포     ${repo}`)
    out(`${SIMPLE_LABEL[kind]} ${root}`)
  }
  const tk = await resolveToken(server, { required: true, yes, quiet: brief })
  if (tk?.error) return bail(tk.error)
  if (tk?.entered && !noSave && !dry) await offerSave(tk.token, { yes })
  const got = await planSimple({ kind, server, repo, root, token: tk.token })
  if (got.error) return bail(got.error)
  const plan = got.plan
  if (!brief) for (const a of plan) out(`  ${a.op === 'same' ? ' ' : '*'} ${a.op.padEnd(7)} ${a.rel}`)
  const changes = plan.filter((a) => a.op !== 'same')
  if (!changes.length) {
    out('')
    out('이미 최신입니다.')
    if (!dry) await remember({ server, repo, workrepo: null, work: root, kit: got.kit, kind })
    return 0
  }
  if (dry) {
    out('')
    out(`--dry 이므로 쓰지 않았습니다. 바뀔 것 ${changes.length}건.`)
    return 0
  }
  if (!yes && !(await confirm(`위 ${changes.length}건을 적용할까요? [y/N] `))) {
    out('그만둡니다. 아무것도 쓰지 않았습니다.')
    return 1
  }
  await applySimple(changes)
  await remember({ server, repo, workrepo: null, work: root, kit: got.kit, kind })
  if (!brief) out('')
  out(`${changes.length}건 적용했습니다. (kit ${got.kit})`)
  if (brief) return 0
  if (kind === 'curator') out('다음 — 이 폴더에서 Claude Code 를 다시 켜고 「큐레이션해 줘」 · 화면의 [에이전트 지시 복사] 를 붙여 넣는다')
  else out('다음 — 이 폴더를 읽는 Claude Code 를 다시 켠다. 판이 오르면 --update 가 이 폴더도 같이 돈다')
  return 0
}

async function applySimple(changes) {
  for (const a of changes) {
    await fs.mkdir(path.dirname(a.dst), { recursive: true })
    await fs.writeFile(a.dst, a.data)
  }
}

// ── 여러 코드 레포를 한 번에(--connect) ──────────────────────────────────────

async function gitReposUnder(dir) {
  const root = path.resolve(dir)
  if (await isDir(path.join(root, '.git'))) return [root]
  const out = []
  for (const e of (await fs.readdir(root, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory() || e.name.startsWith('.')) continue
    const p = path.join(root, e.name)
    if (await fs.stat(path.join(p, '.git')).then(() => true, () => false)) out.push(p)
  }
  return out
}

// 작업 레포에 CDP 가 두는 자리 — 커밋할 때 이것만(사람의 다른 .claude 파일은 건드리지 않는다)
const CDP_PATHS = ['.mcp.json', 'CLAUDE.md', '.claude/cdp.json', '.claude/skills/cdp-work', '.claude/skills/cdp-save', '.claude/skills/cdp-push']

async function connectAll({ server, repo, dir, dry, yes, noSave, fixIgnore, commit = false }) {
  const found = await gitReposUnder(dir)
  out(`서버     ${server}`)
  out(`레포     ${repo}`)
  out(`찾은 곳  ${path.resolve(dir)} — git 레포 ${found.length}개`)
  if (!found.length) return bail('그 아래에 git 레포가 없다 — 코드 레포들이 들어 있는 폴더를 준다')
  const tk = await resolveToken(server, { required: true, yes })
  if (tk?.error) return bail(tk.error)
  if (tk?.entered && !noSave && !dry) await offerSave(tk.token, { yes })
  const H = { authorization: 'Bearer ' + tk.token, 'content-type': 'application/json' }
  const list = await fetch(`${server}/workrepos`, { headers: H }).then((r) => r.json()).catch(() => null)
  if (!list) return bail(`대장을 읽지 못했다 — ${server}`)
  if (!list.write) return bail('이 토큰은 작업 레포를 등록할 수 없다(쓰기 권한) — 관리자에게 writer 이상을 받는다')
  const rows = found.map((p) => ({ path: p, name: path.basename(p), row: list.repos.find((r) => r.knowledge === repo && r.name === path.basename(p)) || null }))
  out('')
  for (const r of rows) out(`  ${r.row ? ' ' : '*'} ${r.name.padEnd(24)} ${r.row ? `등록됨 ${r.row.id}` : '새로 등록'}`)
  if (dry) {
    out('')
    out(`--dry 이므로 쓰지 않았습니다. 등록 ${rows.filter((r) => !r.row).length} · 설치 ${rows.length}`)
    return 0
  }
  if (!yes && !(await confirm(`위 ${rows.length}곳을 ${repo} 에 붙일까요? [y/N] `))) {
    out('그만둡니다. 아무것도 쓰지 않았습니다.')
    return 1
  }
  const fresh = rows.filter((r) => !r.row)
  if (fresh.length) {
    const r = await fetch(`${server}/workrepos`, { method: 'POST', headers: H, body: JSON.stringify({ repos: fresh.map((x) => ({ name: x.name, knowledge: repo, owner: tk.who?.user || null })) }) })
    const j = await r.json().catch(() => null)
    if (!r.ok) return bail(`대장 등록 실패 — ${j?.error?.message || r.status}${j?.error?.detail?.name ? ' (' + j.error.detail.name + ')' : ''}`)
    j.repos.forEach((row, i) => (fresh[i].row = row))
  }
  // kit 은 레포(지식 레포)마다 같다 — 한 번 받는다
  const got = await fetchKit(server, repo, rows[0].row.id, tk.token)
  if (got.error) return bail(got.error)
  let bad = 0
  try {
    for (const r of rows) {
      out('')
      out(`── ${r.path}`)
      // 커밋하려면 — 사람이 고치던 CDP 파일이 있으면 그 레포는 커밋하지 않는다(--update --commit 과 같은 규칙)
      const pre = commit ? (await git(r.path, ['status', '--porcelain', '--', ...CDP_PATHS])).out : ''
      const code = await install({ server, repo, workrepo: r.row.id, kit: got.kit, kitDir: got.dir, work: r.path, dry: false, yes: true, token: tk.token, fixIgnore, brief: true })
      if (code) bad++
      else if (commit) {
        if (pre) out('커밋 안 함 — 원래 커밋 안 된 CDP 파일이 있었다')
        else {
          const c = await commitChanged(r.path, CDP_PATHS, got.kit, { fixIgnore })
          out(c.ok ? `커밋 ${c.commit}` : `커밋 못 함 — ${c.why}`)
          if (!c.ok) bad++
        }
      }
    }
  } finally {
    await got.cleanup()
  }
  out('')
  out('다음 —')
  out('  1. Claude Code 를 다시 켠다 — 새 스킬 · MCP 는 시작할 때 읽힌다')
  if (!commit) out('  2. 레포마다 커밋(팀원은 pull 로 받는다) — 이 명령에 --commit 을 주면 CDP 파일만 커밋한다')
  return bad ? 1 : 0
}

// ── 이 PC 의 설치 목록(T9) ─────────────────────────────────────────────────

// 설치가 끝났으면(바뀐 것이 없어도) 한 줄 적는다 — 다음에 에이전트 세팅이 바뀌면 `--update` 가 이 줄을 돈다.
// **관문이 아니다** — 못 적어도 설치는 끝났다.
async function remember({ server, repo, workrepo, work, kit, kind = 'work' }) {
  if (!repo) return
  try {
    const f = regFile()
    const db = await loadReg(f)
    record(db, { server, repo, workrepo, path: work, kit, kind })
    await saveReg(db, f)
  } catch (e) {
    out(`이 PC 의 설치 목록에 적지 못했습니다 — ${e.message} (설치는 끝났습니다 · --update 가 이 레포를 모릅니다)`)
  }
}

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { windowsHide: true, encoding: 'utf8', timeout: 60000 }, (e, stdout, stderr) =>
      resolve({ ok: !e, out: String(stdout || '').trim(), err: String(stderr || '').trim() })
    )
  })
}

// `.mcp.json` 병합까지 붙인 계획 — 한 레포 설치와 일괄이 같은 것을 쓴다
async function planFor({ server, repo, kit, kitDir, work }) {
  const plan = await planSetup(kitDir, work, { server, repo, kit })
  if (!plan.ok) return { error: plan.reason }
  const mcpPath = path.join(path.resolve(work), '.mcp.json')
  const had = await fs.readFile(mcpPath, 'utf8').catch(() => null)
  let next
  try {
    next = mergeMcpJson(had, mcpEntryServer(server, repo))
  } catch (e) {
    return { error: e.message }
  }
  const drift = repoDriftNote(had, repo)
  if (drift) plan.warnings.push(drift)
  plan.actions.push({ kind: 'mcp', to: mcpPath, op: had == null ? 'create' : had === next ? 'same' : 'update', content: next })
  return { plan, changes: plan.actions.filter((a) => a.op !== 'same') }
}

async function reportTo(server, workrepo, token, kit) {
  if (!workrepo || !token) return null
  const r = await fetch(`${server}/workrepos/${encodeURIComponent(workrepo)}/applied`, {
    method: 'POST',
    headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
    body: JSON.stringify({ kit: kit || null }),
  }).catch(() => null)
  return !!r?.ok
}

const relTo = (work, p) => path.relative(path.resolve(work), p).split(path.sep).join('/')

// .gitignore 가 막는 경로 — `git add` 가 실패하거나(경로를 콕 집으면) 조용히 빼먹는다(폴더를 주면). 제품화 2 S3
async function ignoredOf(work, rels) {
  if (!rels.length) return []
  const r = await git(work, ['check-ignore', '--no-index', '--', ...rels])
  return r.out ? r.out.split(NL).map((l) => l.trim()).filter(Boolean) : []
}

// 막힌 경로를 푸는 `.gitignore` 줄 — 폴더 단위로(`!.claude/skills/` · `!.claude/cdp.json`). 상위가 `dir/*` 로 막혀야 `!` 가 먹는다
function negations(ignored) {
  const set = new Set()
  for (const p of ignored) {
    const m = /^(\.claude\/skills)\//.exec(p)
    set.add(m ? '!' + m[1] + '/' : '!' + p)
  }
  return [...set]
}

async function fixGitignore(work, ignored) {
  const f = path.join(path.resolve(work), '.gitignore')
  const had = await fs.readFile(f, 'utf8').catch(() => '')
  const lines = negations(ignored).filter((l) => !had.split(/\r?\n/).includes(l))
  if (lines.length) await fs.writeFile(f, had + (had && !had.endsWith(NL) ? NL : '') + '# CDP 에이전트 세팅' + NL + lines.join(NL) + NL)
  return lines
}

// 바꾼 파일만 커밋한다(T10). **그 파일에 원래 커밋 안 된 변경이 있으면 커밋하지 않는다** — 사람이 고치던
// CLAUDE.md 줄이 「에이전트 세팅 갱신」 커밋에 딸려 가면 안 된다. 다른 경로의 스테이징은 건드리지 않는다(`commit -- <경로>`).
// **.gitignore 에 막히면 add 전에 멈춘다** · 실패하면 그 경로의 스테이징을 되돌린다(제품화 2 S3 — staged 를 남기던 버그).
async function commitChanged(work, rels, kit, { fixIgnore = false } = {}) {
  const ig = await ignoredOf(work, rels)
  if (ig.length) {
    if (!fixIgnore) return { ok: false, ignored: ig, why: `.gitignore 가 막는다 — ${ig.join(' · ')} · 더할 줄 ${negations(ig).join(' ')} (--fix-gitignore)` }
    await fixGitignore(work, ig)
    rels = [...rels, '.gitignore']
    const still = await ignoredOf(work, rels)
    if (still.length) return { ok: false, ignored: still, why: `.gitignore 를 고쳐도 막힌다 — ${still.join(' · ')} (상위 폴더 규칙을 사람이 본다)` }
  }
  const undo = () => git(work, ['reset', '-q', '--', ...rels])
  const add = await git(work, ['add', '-A', '--', ...rels])
  if (!add.ok) {
    await undo()
    return { ok: false, why: add.err.split(NL)[0] }
  }
  const c = await git(work, ['commit', '-q', '-m', `CDP 에이전트 세팅 갱신${kit ? ' — kit ' + kit : ''}`, '--', ...rels])
  if (!c.ok) {
    await undo()
    return { ok: false, why: (c.err || c.out).split(NL)[0] }
  }
  const head = await git(work, ['rev-parse', '--short', 'HEAD'])
  return { ok: true, commit: head.out }
}

// 일괄 — 이 PC 에 이 서버로 설치한 작업 레포 전부(또는 준 경로만). 계획을 다 보여 주고 **한 번** 묻는다.
async function updateAll({ server, paths, dry, yes, commit, noSave, fixIgnore = false }) {
  const file = regFile()
  const db = await loadReg(file)
  let rows = forServer(db, server)
  if (paths.length) {
    const miss = paths.filter((p) => !rows.some((r) => samePath(r.path, p)))
    if (miss.length) {
      return bail(
        `이 PC 의 설치 목록에 없는 경로입니다 — ${miss.map((p) => path.resolve(p)).join(' · ')}${NL}` +
          '레포 관리 › 연결된 작업 레포 에서 그 행의 [설치 방법] 한 줄로 한 번 설치하면 목록에 들어갑니다.'
      )
    }
    rows = rows.filter((r) => paths.some((p) => samePath(r.path, p)))
  }
  out(`서버     ${server}`)
  out(`목록     ${file}`)
  if (!rows.length) {
    out('')
    out('이 PC 에 이 서버로 설치한 작업 레포가 없습니다.')
    out('레포 관리 › 연결된 작업 레포 에서 행마다 [설치 방법] 의 한 줄로 한 번 설치하면 목록에 들어갑니다 — 그 뒤부터 이 한 줄이 전부를 돕니다.')
    return 1
  }

  const tk = await resolveToken(server, { required: true, yes })
  if (tk?.error) return bail(tk.error)
  if (tk?.entered && !noSave && !dry) await offerSave(tk.token, { yes })

  // kit 은 레포(지식 레포)마다 한 번 받는다
  const kits = new Map()
  const cleanups = []
  const items = []
  try {
    for (const r of rows) {
      const it = { row: r, plan: null, changes: [], error: null, kit: null }
      items.push(it)
      if (!(await isDir(r.path))) {
        it.error = '폴더가 없다 — 옮겼거나 지웠다(목록에서 빼려면 그 자리에 다시 설치하거나 목록 파일에서 그 줄을 지운다)'
        continue
      }
      // 큐레이터 폴더 · 스킬 폴더 — 등록 없이 받는 kit(제품화 2 S4 · F15). 커밋 · 대장 보고가 없다
      if (r.kind === 'curator' || r.kind === 'folder') {
        const got = await planSimple({ kind: r.kind, server, repo: r.repo, root: r.path, token: tk.token })
        if (got.error) {
          it.error = got.error.split(NL)[0]
          continue
        }
        it.kit = got.kit
        it.simple = got.plan.filter((a) => a.op !== 'same')
        it.changes = it.simple.map((a) => ({ op: a.op, kind: r.kind, to: a.dst }))
        continue
      }
      if (!r.workrepo) {
        it.error = '등록 id 가 없다 — 행의 한 줄로 한 번 다시 설치한다'
        continue
      }
      // 실패는 기억하지 않는다 — 낡은 등록 하나가 같은 레포의 다른 작업 레포까지 「못 함」 으로 만들었다
      if (!kits.has(r.repo) || kits.get(r.repo).error) {
        const got = await fetchKit(server, r.repo, r.workrepo, tk.token)
        if (!got.error) cleanups.push(got.cleanup)
        kits.set(r.repo, got)
      }
      const got = kits.get(r.repo)
      if (got.error) {
        it.error = got.error.split(NL)[0]
        continue
      }
      it.kit = got.kit
      const pf = await planFor({ server, repo: r.repo, kit: got.kit, kitDir: got.dir, work: r.path })
      if (pf.error) {
        it.error = pf.error.split(NL)[0]
        continue
      }
      it.plan = pf.plan
      it.changes = pf.changes
    }

    out('')
    for (const it of items) {
      const tag = it.error ? '못 함' : it.changes.length ? `바뀔 것 ${it.changes.length}` : '이미 최신'
      const what = it.row.kind === 'curator' ? '큐레이터 폴더' : it.row.kind === 'folder' ? '스킬 폴더' : it.row.workrepo || '—'
      out(`■ ${it.row.path}  (${it.row.repo} · ${what})  ${tag}${it.kit ? ' · kit ' + it.kit : ''}`)
      if (it.error) out('    ' + it.error)
      for (const a of it.changes) out(`    * ${a.op.padEnd(7)} ${a.kind.padEnd(8)} ${short(a.to, it.row.path)}`)
    }
    const todo = items.filter((x) => !x.error && x.changes.length)
    const fresh = items.filter((x) => !x.error && !x.changes.length)
    const bad = items.filter((x) => x.error)
    out('')
    out(`바뀔 곳 ${todo.length} · 이미 최신 ${fresh.length} · 못 함 ${bad.length}`)
    if (dry) {
      out('--dry 이므로 쓰지 않았습니다.')
      return bad.length ? 1 : 0
    }
    if (todo.length && !yes) {
      const ok = await confirm(`위 ${todo.length}곳에 적용할까요?${commit ? ' (바꾼 파일만 커밋합니다)' : ''} [y/N] `)
      if (!ok) {
        out('그만둡니다. 아무것도 쓰지 않았습니다.')
        return 1
      }
    }

    const needCommit = []
    let reported = 0
    for (const it of [...todo, ...fresh]) {
      const w = it.row.path
      if (it.simple) {
        if (it.simple.length) {
          await applySimple(it.simple)
          out(`  ${w} — ${it.simple.length}건 적용`)
        }
        record(db, { server, repo: it.row.repo, workrepo: null, path: w, kit: it.kit, kind: it.row.kind })
        continue
      }
      let committed = true
      if (it.changes.length) {
        const rels = it.changes.map((a) => relTo(w, a.to))
        // 원래 커밋 안 된 변경이 있던 파일인가 — 적용 **전에** 본다
        const pre = commit ? (await git(w, ['status', '--porcelain', '--', ...rels])).out : ''
        await applySetup(it.plan)
        let line = `  ${w} — ${it.changes.length}건 적용`
        if (commit) {
          // porcelain 줄은 「XY 경로」 — 첫 줄은 git() 가 trim 해 앞 칸이 빠질 수 있다. 상태 칸을 글자 수가 아니라 모양으로 뗀다
          if (pre) line += ' · 커밋 안 함 — 원래 커밋 안 된 변경이 있던 파일이 있다: ' + pre.split(NL).map((l) => l.trim().replace(/^\S{1,2}\s+/, '')).join(' · ')
          else {
            const c = await commitChanged(w, rels, it.kit, { fixIgnore })
            line += c.ok ? ` · 커밋 ${c.commit}` : ` · 커밋 못 함 — ${c.why}`
            committed = c.ok
          }
          if (pre) committed = false
        } else needCommit.push(w)
        out(line)
      }
      // 커밋하라 했는데 못 한 레포는 대장에 「최신」 으로 올리지 않는다 — 팀원은 pull 로 아무것도 못 받는다(제품화 2 S3)
      if (!committed) continue
      const rep = await reportTo(server, it.row.workrepo, tk.token, it.kit)
      if (rep === false) out(`  ${w} — 대장 보고 실패 (설치는 끝났습니다)`)
      else if (rep) reported++
      record(db, { server, repo: it.row.repo, workrepo: it.row.workrepo, path: w, kit: it.kit })
    }
    await saveReg(db, file).catch((e) => out('설치 목록을 쓰지 못했습니다 — ' + e.message))
    out('')
    out(`끝났습니다 — 적용 ${todo.length}곳 · 대장 보고 ${reported}곳${bad.length ? ` · 못 함 ${bad.length}곳(위)` : ''}`)
    if (needCommit.length) {
      out('')
      out('커밋은 각 레포에서 — 팀원은 pull 로 받습니다 (--commit 을 주면 이 명령이 바꾼 파일만 커밋합니다)')
      for (const w of needCommit) {
        const ig = await ignoredOf(w, ['.mcp.json', '.claude/cdp.json', '.claude/skills/cdp-save/SKILL.md', 'CLAUDE.md'])
        if (ig.length) out(`  ! ${w} — .gitignore 가 막는다: 더할 줄 ${negations(ig).join(' ')} (--fix-gitignore)`)
        out(`  git -C "${w}" add .mcp.json .claude CLAUDE.md && git -C "${w}" commit -m "CDP 에이전트 세팅 갱신"`)
      }
    }
    if (todo.length) out('Claude Code 를 열어 둔 레포는 다시 켜야 새 스킬을 읽습니다.')
    return bad.length ? 1 : 0
  } finally {
    for (const c of cleanups) await c()
  }
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

async function resolveToken(server, { required, yes, quiet = false }) {
  const env = String(process.env.CDP_TOKEN || '').trim()
  if (env) {
    const w = await whoami(server, env)
    if (w.reach === false) return { error: `서버에 닿지 않습니다 — ${server}` }
    if (w.ok) {
      if (!quiet) out(`토큰     ${whoLine(w)} — CDP_TOKEN`)
      return { token: env, who: w, entered: false }
    }
    out('')
    out('CDP_TOKEN 이 이 서버에서 통하지 않습니다 — 만료 · 폐기됐거나 다른 서버의 것일 수 있습니다.')
  }
  // 두 번째 자리 — 이 PC 에 저장된 토큰(rc 를 안 읽은 셸 · IDE 터미널 · cron). 제품화 2 S2
  const saved = await loadToken().catch(() => null)
  if (saved && saved.token !== env) {
    const w = await whoami(server, saved.token)
    if (w.reach === false) return { error: `서버에 닿지 않습니다 — ${server}` }
    if (w.ok) {
      if (!quiet) out(`토큰     ${whoLine(w)} — ${saved.where}`)
      return { token: saved.token, who: w, entered: false }
    }
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
  // 409 — 등록의 지식 레포가 --repo 와 다르다(실서버 종합 시험 F1). 서버 문장이 어디서 다시 받는지 말한다
  if (!r.ok) {
    const j = await r.json().catch(() => ({}))
    return { error: `kit 을 받지 못했습니다 — ${j?.error?.message || 'HTTP ' + r.status}` }
  }
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
