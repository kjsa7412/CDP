// ctx setup --server — 모드 B 의 설치. 설계서 §4.7.
//
// **클라이언트에 지식 레포가 없다.** 그래서 서버의 `GET /kit/<name>` 에서
// 스킬과 CLAUDE 블록을 받아 임시 폴더에 푼 뒤, 그것을 지식 레포처럼 써서
// 기존 `planSetup` 을 그대로 태운다 — 설치 로직을 두 벌 만들지 않는다.
//
// 산출물은 §4.7 표 그대로 —
//   .mcp.json              HTTP · ${CDP_TOKEN}      커밋 ○
//   .claude/cdp.json       { server, repo }          커밋 ○  (PC 와 무관하다)
//   .claude/skills/cdp-*   kit 에서                  커밋 ○
//   CLAUDE.md 블록         kit 에서                  커밋 ○
//
// 훅은 설치하지 않는다 — 서버가 검사한다(§4.5).

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzip } from '../../core/zip.js'
import { planSetup, applySetup, mergeMcpJson, mcpEntryServer, repoDriftNote, kitHash, kitOf } from '../../core/setup.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

export async function runSetupServer(opt) {
  const server = String(opt.server).replace(/\/+$/, '')
  const repo = opt.repo
  const work = opt.args[0]

  if (!repo) return bail('--repo <지식 레포 이름> 이 필요합니다')
  if (!work) return bail('작업 레포 경로를 주세요.  ctx setup --server <url> --repo <이름> <작업 레포>')

  // 토큰은 **환경변수에서만** 온다. 명령줄에 두면 셸 히스토리에 남는다.
  const token = process.env.CDP_TOKEN
  if (!token) return bail('CDP_TOKEN 환경변수가 없습니다. 관리자에게 받은 토큰을 넣고 다시 여세요.')

  out(`서버   ${server}`)
  out(`레포   ${repo}`)
  out('')

  // ── kit 받기
  let buf
  try {
    const res = await fetch(`${server}/kit/${encodeURIComponent(repo)}`, {
      headers: { authorization: 'Bearer ' + token },
    })
    if (!res.ok) {
      const body = await res.text().catch(() => '')
      return bail(`kit 을 받지 못했습니다 (HTTP ${res.status}) ${body.slice(0, 200)}`)
    }
    buf = Buffer.from(await res.arrayBuffer())
  } catch (e) {
    return bail(`서버에 닿지 못했습니다 — ${server}${NL}  ${e?.message || e}`)
  }

  const files = await unzip(buf)
  out(`kit    ${files.length}개 · ${Math.round(buf.length / 1024)}KB`)

  // ── 임시 폴더에 푼다. 지식 레포 모양 그대로다.
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-kit-'))
  try {
    for (const f of files) {
      // zip 안의 경로를 믿지 않는다 — `..` 하나가 임시 폴더 밖을 연다.
      const dst = path.resolve(tmp, f.name)
      if (!dst.startsWith(path.resolve(tmp) + path.sep)) {
        return bail(`kit 안에 이상한 경로가 있습니다: ${f.name}`)
      }
      await fs.mkdir(path.dirname(dst), { recursive: true })
      await fs.writeFile(dst, f.data)
    }

    // kit 해시 — 임시 폴더가 곧 지식 레포 모양이라 같은 함수를 쓴다.
    const kit = (await kitHash(tmp)).hash

    // `--check` — **받아서 쓰지 않고 비교만 한다**(§4.7).
    //
    // `inspect()` 는 로컬 지식 레포를 전제하므로 서버 모드에서는 못 쓴다.
    // 대신 `CLAUDE.md` 의 `cdp:kit` 과 견준다 — §6.7.4 가 그 한 줄을 박아 둔 이유다.
    if (opt.check) {
      const cur = kitOf(await fs.readFile(path.join(path.resolve(work), 'CLAUDE.md'), 'utf8').catch(() => ''))
      const state = !cur ? '미설치' : cur === kit ? '최신' : '낡음'
      out('')
      out(`${state}    여기 ${cur || '(없음)'}  ·  서버 ${kit}`)
      if (state === '낡음') out('        ctx setup --server … 로 다시 받는다')
      return state === '낡음' ? 1 : 0
    }

    const plan = await planSetup(tmp, work, { server, repo, kit })
    if (!plan.ok) return bail(plan.reason)

    // ── .mcp.json 을 계획에 더한다. `planSetup` 은 모드 A 시절 산출물만 안다.
    const mcpPath = path.join(path.resolve(work), '.mcp.json')
    const had = await fs.readFile(mcpPath, 'utf8').catch(() => null)
    let next
    try {
      next = mergeMcpJson(had, mcpEntryServer(server, repo))
    } catch (e) {
      return bail(e.message)
    }
    const drift = repoDriftNote(had, repo)
    if (drift) plan.warnings.push(drift)
    plan.actions.push({
      kind: 'mcp',
      to: mcpPath,
      op: had == null ? 'create' : had === next ? 'same' : 'update',
      content: next,
    })

    const changes = plan.actions.filter((a) => a.op !== 'same')
    for (const a of plan.actions) {
      out(`  ${a.op === 'same' ? ' ' : '*'} ${a.op.padEnd(7)} ${a.kind.padEnd(8)} ${short(a.to, work)}`)
    }
    for (const w of plan.warnings) {
      out('')
      out('[주의] ' + String(w).split(NL).join(NL + '       '))
    }

    if (opt.dry) {
      out('')
      out(`--dry 이므로 쓰지 않았습니다. 바뀔 것 ${changes.length}건.`)
      return 0
    }
    if (!changes.length) {
      out('')
      out('이미 최신입니다.')
      return 0
    }

    await applySetup(plan)
    out('')
    out(`${changes.length}건 적용했습니다. (kit ${kit})`)

    // 설치 결과를 보고한다(§6.7.4). **관문이 아니다** — 실패해도 설치는 끝났고
    // 대장이 "미설치" 로 남을 뿐이다. 그래서 조용히 삼킨다.
    if (opt.workrepo) {
      const r = await fetch(`${server}/workrepos/${encodeURIComponent(opt.workrepo)}/applied`, {
        method: 'POST',
        headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' },
        body: JSON.stringify({ kit }),
      }).catch(() => null)
      out(r?.ok ? '대장에 보고했습니다.' : '대장 보고는 실패했습니다 — 설치는 끝났습니다 (보고는 추적용입니다)')
    }
    out('')
    out('다음 —')
    out('  1. Claude Code 를 다시 켠다 (환경변수는 프로세스 시작 때 읽힌다)')
    out('  2. /mcp 에 cdp 가 connected 인지 본다')
    out('  3. git add .mcp.json .claude CLAUDE.md && git commit')
    out('     팀원은 pull 과 CDP_TOKEN 만으로 끝난다')
    return 0
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

function bail(msg) {
  err('ctx setup: ' + msg)
  return 2
}

function short(p, work) {
  const w = path.resolve(work)
  const r = path.resolve(p)
  return r.startsWith(w) ? r.slice(w.length + 1).split(path.sep).join('/') : r
}
