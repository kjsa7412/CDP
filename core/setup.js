// 작업 레포에 에이전트 세팅을 넣는다.
//
// **앱과 `ctx` 가 같은 함수를 부른다**(불변식 12). 화면의 [에이전트 설치]와
// `ctx setup` 이 다른 일을 하면 둘 중 하나는 반드시 거짓말이 된다.
//
// 계획(plan)과 적용(apply)이 나뉘어 있다. 화면은 계획을 먼저 보여 주고
// 사람이 누르면 적용한다 — **레포 밖에 파일을 쓰는 일**이라 무엇을 쓸지
// 미리 보이지 않으면 안 된다.

import fs from 'node:fs/promises'
import path from 'node:path'

// CLAUDE.md 안에서 우리가 관리하는 구획.
//
// 전에는 파일을 통째로 덮고 `.bak` 을 남겼다. **남의 집을 갈아엎는 것**이다 --
// 실제 프로젝트의 CLAUDE.md 에는 빌드 명령과 컨벤션이 들어 있다.
// 블록만 갈아 끼우면 몇 번을 다시 돌려도 사용자 내용이 다치지 않는다.
export const BEGIN = '<!-- cdp:begin -- 이 블록은 ctx setup 이 관리한다. 손으로 고치지 마라 -->'
export const END = '<!-- cdp:end -->'

const PREFIX = 'cdp-'

async function isDir(p) {
  return fs.stat(p).then((s) => s.isDirectory()).catch(() => false)
}
async function read(p) {
  return fs.readFile(p, 'utf8').catch(() => null)
}

// 디렉터리 하나를 통째로 비교한다. 같으면 건드리지 않는다 -- 화면에
// "갱신" 이라고 떠 있는데 실제로는 같은 것을 다시 쓰면 사람이 못 믿는다.
async function sameTree(a, b) {
  const la = await fs.readdir(a, { withFileTypes: true }).catch(() => null)
  const lb = await fs.readdir(b, { withFileTypes: true }).catch(() => null)
  if (!la || !lb || la.length !== lb.length) return false
  const na = la.map((e) => e.name).sort()
  const nb = lb.map((e) => e.name).sort()
  if (na.join('|') !== nb.join('|')) return false
  for (const e of la) {
    const pa = path.join(a, e.name)
    const pb = path.join(b, e.name)
    if (e.isDirectory()) {
      if (!(await sameTree(pa, pb))) return false
    } else {
      const [x, y] = [await read(pa), await read(pb)]
      if (x == null || x !== y) return false
    }
  }
  return true
}

function blockOf(body) {
  return `${BEGIN}\n${body.trim()}\n${END}\n`
}

// 기존 CLAUDE.md 에 블록을 끼우거나 갈아 끼운다.
export function mergeClaude(existing, body) {
  const block = blockOf(body)
  if (existing == null) return block
  const i = existing.indexOf(BEGIN)
  const j = existing.indexOf(END)
  if (i >= 0 && j > i) {
    return existing.slice(0, i) + block.trimEnd() + existing.slice(j + END.length)
  }
  // **옛 판이 만든 파일은 통째로 갈아 끼운다.**
  //
  // v0.3.0 까지는 `ctx setup` 이 CLAUDE.md 를 통째로 썼다(마커가 없다).
  // 그 파일에 블록을 덧붙이면 규약이 두 벌이 되고, 그중 하나에는 낡은
  // 절대경로가 박혀 있다. 우리가 쓴 것임을 알아볼 수 있을 때만 대체한다 --
  // 사람이 쓴 파일은 절대 통째로 건드리지 않는다.
  if (/^\s*<!--[\s\S]{0,200}?CDP 작업 레포 설정/.test(existing)) return block

  // 마커가 없으면 **맨 뒤에** 붙인다. 앞에 붙이면 프로젝트가 제일 먼저
  // 말하고 싶은 것을 밀어낸다.
  return existing.replace(/\s*$/, '') + '\n\n' + block
}

/**
 * 무엇을 할지 정한다. 파일은 건드리지 않는다.
 */
export async function planSetup(knowledgeRoot, workRoot) {
  const kn = path.resolve(knowledgeRoot)
  const wk = path.resolve(workRoot)
  const bad = (reason) => ({ ok: false, reason, knowledge: kn, work: wk, actions: [], warnings: [] })

  if (!(await isDir(wk))) return bad(`폴더가 없습니다 — ${wk}`)
  if (kn === wk) return bad('지식 레포 자신에는 설치하지 않습니다. 코드가 있는 레포를 지정하세요.')

  // **git 레포일 때만.** 아무 폴더에나 쓰지 않는다 -- 경로를 잘못 누르면
  // 남의 폴더에 파일이 생기고, 그것은 되돌리기 어렵다.
  const isGit = (await isDir(path.join(wk, '.git'))) || (await read(path.join(wk, '.git'))) != null
  if (!isGit) return bad(`git 레포가 아닙니다 — ${wk}\n작업 레포(코드가 있고 .git 이 있는 곳)를 지정하세요.`)

  const sSrc = path.join(kn, '.claude', 'skills')
  if (!(await isDir(sSrc))) return bad(`${sSrc} 가 없습니다. 지식 레포에 배포본을 부었는지 확인하세요.`)

  const tpl = path.join(kn, '.claude', 'work-repo', 'CLAUDE.md')
  const body = await read(tpl)
  if (body == null) return bad(`서식이 없습니다 — ${tpl}\n배포본 repo-kit 을 다시 부으면 들어옵니다.`)

  const actions = []
  const warnings = []

  // ── skill — **cdp- 로 시작하는 것만 건드린다** ─────────────────────
  //
  // 전에는 `.claude/skills` 를 통째로 지우고 다시 깔았다. 작업 레포에 자기
  // skill 이 있으면 **같이 사라진다.** 실측 레포에 마침 없어서 안 드러났다.
  const src = (await fs.readdir(sSrc, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX))
    .map((e) => e.name)
    .sort()

  const sDst = path.join(wk, '.claude', 'skills')
  const cur = (await fs.readdir(sDst, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory())
    .map((e) => e.name)

  for (const n of src) {
    const from = path.join(sSrc, n)
    const to = path.join(sDst, n)
    const same = (await isDir(to)) && (await sameTree(from, to))
    actions.push({
      kind: 'skill',
      name: n,
      from,
      to,
      op: same ? 'same' : (await isDir(to)) ? 'update' : 'create',
    })
  }
  // 정본에서 사라진 cdp- skill 은 치운다. 남겨 두면 없어진 절차가 계속 뜬다.
  for (const n of cur) {
    if (n.startsWith(PREFIX) && !src.includes(n)) {
      actions.push({ kind: 'skill', name: n, to: path.join(sDst, n), op: 'remove' })
    }
  }
  const kept = cur.filter((n) => !n.startsWith(PREFIX))
  if (kept.length) warnings.push(`이 레포의 다른 skill 은 건드리지 않습니다 — ${kept.join(' · ')}`)

  // ── CLAUDE.md — 블록만 ────────────────────────────────────────────
  const claude = path.join(wk, 'CLAUDE.md')
  const had = await read(claude)
  const next = mergeClaude(had, body)
  actions.push({
    kind: 'claude',
    to: claude,
    op: had == null ? 'create' : had === next ? 'same' : had.includes(BEGIN) ? 'update' : 'append',
    content: next,
  })

  // ── 포인터 — **경로는 여기 있고 커밋하지 않는다** ──────────────────
  //
  // 전에는 CLAUDE.md 에 지식 레포의 절대경로를 박았다. 그 파일은 커밋되어
  // 팀에 퍼지는데 **경로는 사람마다 다르다** -- 그래서 "팀이 같은 경로를
  // 쓴다" 는 규약을 강요해야 했다. 규약이 아니라 설계로 풀 문제였다.
  const ptr = path.join(wk, '.claude', 'cdp.json')
  const curPtr = await read(ptr)
  const nextPtr = JSON.stringify({ knowledgeRepo: kn.split(path.sep).join('/') }, null, 2) + '\n'
  actions.push({
    kind: 'pointer',
    to: ptr,
    op: curPtr == null ? 'create' : curPtr === nextPtr ? 'same' : 'update',
    content: nextPtr,
  })

  // ── .gitignore — 두 가지가 반대다 ─────────────────────────────────
  const gi = (await read(path.join(wk, '.gitignore'))) || ''
  const claudeBlocked = /^[.]claude\/[*]?\s*$/m.test(gi)
  const skillsFreed = /^![.]claude\/skills/m.test(gi)
  const ptrIgnored = claudeBlocked || /^[.]claude\/cdp[.]json\s*$/m.test(gi)

  if (claudeBlocked && !skillsFreed) {
    warnings.push(
      '.gitignore 가 .claude 를 통째로 막고 있습니다. 이대로면 skill 이 **이 PC 에만** 남고\n' +
        '팀은 받지 못합니다. `!.claude/skills/` 한 줄을 넣으세요.'
    )
  }
  if (!ptrIgnored) {
    warnings.push(
      '.claude/cdp.json 은 **커밋하지 않습니다** — 지식 레포 경로는 사람마다 다릅니다.\n' +
        '.gitignore 에 `.claude/cdp.json` 을 넣으세요.'
    )
  }

  return { ok: true, knowledge: kn, work: wk, actions, warnings }
}

/**
 * 계획을 실행한다. planSetup 이 낸 것만 받는다.
 */
export async function applySetup(plan) {
  if (!plan?.ok) throw new Error(plan?.reason || 'plan 이 없습니다')
  const done = []
  for (const a of plan.actions) {
    if (a.op === 'same') continue
    if (a.kind === 'skill') {
      if (a.op === 'remove') {
        await fs.rm(a.to, { recursive: true, force: true })
      } else {
        await fs.rm(a.to, { recursive: true, force: true })
        await fs.mkdir(path.dirname(a.to), { recursive: true })
        await fs.cp(a.from, a.to, { recursive: true })
      }
    } else {
      await fs.mkdir(path.dirname(a.to), { recursive: true })
      await fs.writeFile(a.to, a.content, 'utf8')
    }
    done.push(a)
  }
  return done
}
