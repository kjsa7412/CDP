// install.mjs — 꾸러미 안에 들어가는 실행기. 설계서 §6.7.3.
//
// **왜 스크립트를 넣나.** 지금까지 꾸러미는 "zip 을 작업 레포 루트에 푼다" 였다.
// 그러면 `CLAUDE.md` 와 `.mcp.json` 이 **푸는 순간 덮인다** — 안내문이 그다음
// 줄에서 "이미 있으면 덮지 말라" 고 하는데 이미 늦었다. 작업 레포에 다른 MCP
// 서버가 등록돼 있었다면 그것도 조용히 사라진다.
//
// **병합 규칙을 다시 쓰지 않는다.** `ctx setup --server` 는 받은 kit 을 임시
// 폴더에 풀고 그것을 지식 레포처럼 써서 `planSetup` 을 태운다(§4.7). 여기도
// 같다 — 다른 것은 kit 이 이미 옆에 풀려 있다는 것뿐이다. 그래서 `core/setup.js`
// 를 그대로 부른다. PowerShell 과 sh 로 옮겨 쓰면 규칙이 세 벌이 되고, 조금씩
// 어긋나면 어느 것이 맞는지 아무도 모르게 된다.
//
//   node install.mjs <작업 레포 경로> [--dry] [--yes]
//
// 꾸러미 모양 —
//   설치.md      안내
//   install.mjs  이 파일 (**이름을 ASCII 로 둔다** -- 명령줄에 치는 것이라
//                한글이면 IME 를 켜야 하고, 낡은 압축 도구에서 이름이 깨지면
//                그 자리에서 막힌다. 읽기만 하는 `설치.md` 는 한글로 둔다)
//   kit/         지식 레포 모양 (.claude/skills/cdp-* · .claude/work-repo/CLAUDE.md)

import fs from 'node:fs/promises'
import path from 'node:path'
import readline from 'node:readline'
import { fileURLToPath } from 'node:url'
import { planSetup, applySetup, mergeMcpJson, mcpEntryServer } from '../../core/setup.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

// 서버가 꾸러미를 쌀 때 이 파일 맨 앞에 한 줄로 박아 넣는다.
// 없으면 손으로 꺼내 온 것이라 안내만 하고 멈춘다.
const CFG = globalThis.__CDP_KIT__ || null

export async function main(argv) {
  const args = argv.filter((a) => !a.startsWith('--'))
  const dry = argv.includes('--dry')
  const yes = argv.includes('--yes') || argv.includes('-y')

  if (!CFG?.server || !CFG?.repo) {
    return bail(
      '이 파일 안에 서버 정보가 없습니다.' +
        NL +
        '관리 화면의 [설치 방법] 에서 받은 꾸러미 안의 install.mjs 를 그대로 쓰세요.'
    )
  }

  const work = args[0]
  if (!work) {
    out('사용법 —')
    out('  node install.mjs <작업 레포 경로> [--dry] [--yes]')
    out('')
    out('  --dry   무엇이 바뀔지만 보고 쓰지 않는다')
    out('  --yes   묻지 않는다 (스크립트에서 부를 때)')
    out('')
    out(`서버   ${CFG.server}`)
    out(`레포   ${CFG.repo}`)
    return 2
  }

  // kit 은 이 파일 옆이다. **작업 레포가 아니라 꾸러미 쪽에서 읽는다** —
  // 한 단 내려 둔 이유가 이것이다(푸는 것만으로는 아무것도 안 덮인다).
  const here = path.dirname(fileURLToPath(import.meta.url))
  const kitDir = path.join(here, 'kit')
  if (!(await isDir(kitDir))) {
    return bail(`kit 폴더가 없습니다 — ${kitDir}${NL}꾸러미를 통째로 푼 뒤 그 안에서 여세요.`)
  }

  out(`서버     ${CFG.server}`)
  out(`레포     ${CFG.repo}`)
  out(`작업 레포 ${path.resolve(work)}`)
  out('')

  const plan = await planSetup(kitDir, work, { server: CFG.server, repo: CFG.repo, kit: CFG.kit || null })
  if (!plan.ok) return bail(plan.reason)

  // `.mcp.json` 은 `planSetup` 이 모른다 — 모드 A 시절 산출물만 안다.
  // **여기서도 기존 파일을 읽어 병합한다.** 덮지 않는다.
  const mcpPath = path.join(path.resolve(work), '.mcp.json')
  const had = await fs.readFile(mcpPath, 'utf8').catch(() => null)
  let next
  try {
    next = mergeMcpJson(had, mcpEntryServer(CFG.server, CFG.repo))
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

  const changes = plan.actions.filter((a) => a.op !== 'same')
  if (!changes.length) {
    out('')
    out('이미 최신입니다.')
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
  out(`${changes.length}건 적용했습니다.${CFG.kit ? ` (kit ${CFG.kit})` : ''}`)

  // 설치 결과 보고(§6.7.4). **관문이 아니다** — 실패해도 설치는 끝났고
  // 대장이 "미설치" 로 남을 뿐이다. 토큰이 없으면 조용히 건너뛴다.
  if (CFG.workrepo) {
    const token = process.env.CDP_TOKEN
    if (!token) {
      out('CDP_TOKEN 이 없어 대장 보고는 건너뜁니다 — 설치는 끝났습니다.')
    } else {
      const r = await fetch(`${CFG.server}/workrepos/${encodeURIComponent(CFG.workrepo)}/applied`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ kit: CFG.kit || null }),
      }).catch(() => null)
      out(r?.ok ? '대장에 보고했습니다.' : '대장 보고는 실패했습니다 — 설치는 끝났습니다 (보고는 추적용입니다)')
    }
  }

  out('')
  out('다음 —')
  out('  1. CDP_TOKEN 을 환경변수에 둔다 (관리자에게 직접 받는다)')
  out('       macOS · Linux   export CDP_TOKEN=<토큰>')
  out('       Windows         setx CDP_TOKEN <토큰>')
  out('  2. Claude Code 를 다시 켠다 (환경변수는 프로세스 시작 때 읽힌다)')
  out('  3. /mcp 에 cdp 가 connected 인지 본다')
  out('  4. git add .mcp.json .claude CLAUDE.md && git commit')
  out('     팀원은 pull 과 CDP_TOKEN 만으로 끝난다 — 꾸러미를 다시 받지 않는다')
  return 0
}

function confirm(q) {
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
      res(/^y(es)?$/i.test(a.trim()))
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
