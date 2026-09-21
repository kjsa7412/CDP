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
import crypto from 'node:crypto'

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

// 블록 첫 줄에 **kit 해시**를 박는다 (MCP 설계서 §6.7.4).
//
// 모드 B 에서 서버는 클라이언트의 `.claude/skills` 를 볼 수 없다 — `kitHash()` 도
// `inspect()` 도 로컬 지식 레포를 전제한다. 그래서 비교의 한쪽을 **클라이언트가
// 들고 오게** 만든 것이 이 한 줄이다. `sync` 도구가 서버의 해시를 내고, 스킬이
// 둘을 견준다.
export const KIT_MARK = /<!--\s*cdp:kit\s+([0-9a-f]{4,64})\s*-->/

export function kitOf(claudeText) {
  return KIT_MARK.exec(String(claudeText || ''))?.[1] ?? null
}

function blockOf(body, kit) {
  const mark = kit ? `<!-- cdp:kit ${kit} -->\n` : ''
  return `${BEGIN}\n${mark}${body.trim()}\n${END}\n`
}

// 기존 CLAUDE.md 에 블록을 끼우거나 갈아 끼운다.
export function mergeClaude(existing, body, kit = null) {
  const block = blockOf(body, kit)
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
// `server` 를 주면 모드 B 다(§4.7). 포인터가 `{ server, repo }` 가 되고
// **커밋한다** — 모드 A 가 커밋하지 않은 이유는 `knowledgeRepo` 가 PC 마다
// 다른 절대경로여서였다. `{ server, repo }` 는 PC 와 무관하다.
export async function planSetup(knowledgeRoot, workRoot, { server = null, repo = null, kit = null } = {}) {
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
  const next = mergeClaude(had, body, kit)
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
  const nextPtr =
    JSON.stringify(server ? { server, repo } : { knowledgeRepo: kn.split(path.sep).join('/') }, null, 2) + '\n'
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
  if (!server && !ptrIgnored) {
    warnings.push(
      '.claude/cdp.json 은 **커밋하지 않습니다** — 지식 레포 경로는 사람마다 다릅니다.\n' +
        '.gitignore 에 `.claude/cdp.json` 을 넣으세요.'
    )
  }
  if (server && ptrIgnored) {
    warnings.push(
      '.gitignore 가 .claude/cdp.json 을 막고 있습니다. 서버 모드에서는 **커밋합니다** — ' +
        '{ server, repo } 는 PC 와 무관하고, 커밋해 두면 팀원은 pull 과 토큰만으로 끝납니다.'
    )
  }

  return { ok: true, knowledge: kn, work: wk, actions, warnings }
}

// ── .mcp.json — 호스트가 읽는 한 줄 (§3.2 · §4.7) ────────────────────────
//
// **토큰 원문을 넣지 않는다.** 이 파일은 커밋되므로 원문이 들어가면 레포에
// 박제된다. `${CDP_TOKEN}` 으로 두고 값은 PC 의 환경변수에서 온다.
//
// 기존 파일이 있으면 `mcpServers.cdp` 키만 병합한다 — 다른 서버는 남긴다.
export function mergeMcpJson(existing, entry) {
  let j = {}
  if (existing) {
    try {
      j = JSON.parse(existing)
    } catch {
      // 깨진 파일을 덮어쓰지 않는다. 사람이 고칠 것이다.
      throw new Error('.mcp.json 이 JSON 이 아닙니다 — 손으로 고친 뒤 다시 돌리세요')
    }
  }
  if (!j.mcpServers || typeof j.mcpServers !== 'object') j.mcpServers = {}
  j.mcpServers.cdp = entry
  return JSON.stringify(j, null, 2) + '\n'
}

export function mcpEntryServer(server, repo) {
  return {
    type: 'http',
    url: String(server).replace(/\/+$/, '') + '/mcp/' + repo,
    headers: { Authorization: 'Bearer ${CDP_TOKEN}' },
  }
}

// ── kit 해시 — **무엇을 심었는지 말할 수 있어야 한다** ────────────────────
//
// 지금까지 남는 것은 "설치했다" 까지였다. *어느 판을* 심었는지는 아무도 모른다.
// skill 을 고친 뒤 작업 레포 여섯 곳 중 어디가 옛 판인지 확인할 방법이 없었다.
//
// **판정에는 쓰지 않는다.** 낡았는지 아닌지는 `planSetup` 의 내용 비교가
// 그대로 판단한다 -- 판정을 두 곳에 두면 갈라진다. 이 값은 **이력에 적는
// 이름표**다.
export async function kitHash(knowledgeRoot) {
  const kn = path.resolve(knowledgeRoot)
  const h = crypto.createHash('sha256')
  const sSrc = path.join(kn, '.claude', 'skills')

  const walk = async (dir, rel) => {
    const ents = await fs.readdir(dir, { withFileTypes: true }).catch(() => [])
    for (const e of ents.sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(dir, e.name)
      const r = rel + '/' + e.name
      if (e.isDirectory()) await walk(p, r)
      else h.update(r + '\0' + ((await read(p)) ?? '') + '\0')
    }
  }

  const skills = (await fs.readdir(sSrc, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && e.name.startsWith(PREFIX))
    .map((e) => e.name)
    .sort()
  for (const n of skills) await walk(path.join(sSrc, n), n)
  h.update((await read(path.join(kn, '.claude', 'work-repo', 'CLAUDE.md'))) ?? '')

  return { hash: h.digest('hex').slice(0, 6), skills }
}

// ── 설치 상태 — **열어 보지 않고 안다** ───────────────────────────────────
//
// 계획을 dry 로 돌려서 한 글자로 접는다. 새 판정을 만들지 않는다.
//
//   ok      전부 same
//   update  쓸 것이 있다
//   none    아직 하나도 안 들어갔다
//   error   폴더가 없다 · git 레포가 아니다 · 지식 레포 자신이다
export async function inspect(knowledgeRoot, workRoot) {
  const plan = await planSetup(knowledgeRoot, workRoot)
  const wk = path.resolve(workRoot)

  if (!plan.ok) return { path: wk, state: 'error', reason: plan.reason, changes: [], warnings: [] }

  const changes = plan.actions
    .filter((a) => a.op !== 'same')
    .map((a) => ({ kind: a.kind, name: a.name || null, op: a.op }))

  // 미설치 — `cdp-` skill 이 하나도 없고 포인터도 없다. 전부 새로 쓴다는 뜻.
  const skills = plan.actions.filter((a) => a.kind === 'skill')
  const pointer = plan.actions.find((a) => a.kind === 'pointer')
  const fresh = skills.length > 0 && skills.every((a) => a.op === 'create') && pointer?.op === 'create'

  return {
    path: wk,
    state: fresh ? 'none' : changes.length ? 'update' : 'ok',
    // 들어가 있는 skill 수 — 카드가 "skill 7종" 이라고 말할 근거
    skills: skills.filter((a) => a.op === 'same' || a.op === 'update').map((a) => a.name),
    changes,
    warnings: plan.warnings,
  }
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
