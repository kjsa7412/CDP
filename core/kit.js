// 에이전트 세팅(kit) — 작업 레포 · 큐레이터 폴더에 까는 스킬과 CLAUDE 블록. v1.0 개편안 §6.3 · V4 · W5.
//
// 전에는 **각 지식 레포의 `.claude/`** 가 kit 의 정본이었다. 그래서 upgrade 가 레포마다 도구 층 커밋을 만들고, 트리가
// 더럽거나 origin 이 앞선 레포는 건너뛰어 그 레포의 작업 레포는 옛 스킬을 계속 받았다(배포 조사 C1). v1.0 은 **레포에
// 지식만** 두고(I9) kit 은 서버 번들에서 낸다 — 판을 올리면 모든 레포의 kit 이 같이 바뀐다.
//
// 역할별 — writer 는 기록하는 스킬만(cdp-work · cdp-save · cdp-push) 받는다. 큐레이터는 다섯 전부와 큐레이터 블록을 받는다.
// 큐레이션 도구는 서버가 역할로 가리지만(I7 · §5.3), 스킬이 없으면 writer 세션이 그 절차를 흉내 낼 일도 없다.
//
// 자리 — 앞에서부터 있는 곳 하나: ① explicit(--kit) ② 환경변수 CDP_KIT ③ 번들 옆 <bin>/../kit ④ 소스 <root>/agent
// 모양은 셋 다 같다 — `skills/<cdp-*>/**` · `CLAUDE-프로젝트레포.md` · `CLAUDE-큐레이터.md`.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))
const isDir = (p) => fs.stat(p).then((s) => s.isDirectory()).catch(() => false)

export const WRITER_SKILLS = ['cdp-work', 'cdp-save', 'cdp-push']
export const BLOCK = { writer: 'CLAUDE-프로젝트레포.md', curator: 'CLAUDE-큐레이터.md' }

export async function findKitDir({ explicit = null, env = process.env, binDir = HERE, sourceRoot = path.resolve(HERE, '..') } = {}) {
  const cands = []
  if (explicit) cands.push(['--kit', path.resolve(explicit)])
  if (env.CDP_KIT) cands.push(['CDP_KIT', path.resolve(env.CDP_KIT)])
  if (binDir) cands.push(['번들 옆', path.resolve(binDir, '..', 'kit')])
  if (sourceRoot) cands.push(['소스', path.resolve(sourceRoot, 'agent')])
  for (const [how, dir] of cands) if (await isDir(path.join(dir, 'skills'))) return { dir, how }
  return null
}

async function walk(dir, rel, out) {
  for (const e of (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    const abs = path.join(dir, e.name)
    const r = rel + '/' + e.name
    if (e.isDirectory()) await walk(abs, r, out)
    else out.push({ name: r, data: await fs.readFile(abs) })
  }
}

// 역할의 kit — 작업 레포에 놓일 자리 이름으로(`.claude/skills/…` · `.claude/work-repo/CLAUDE.md`)
export async function kitFiles({ role = 'writer', explicit = null } = {}) {
  const found = await findKitDir({ explicit })
  if (!found) return { files: [], hash: null, skills: [], role, dir: null }
  const skillsDir = path.join(found.dir, 'skills')
  const names = (await fs.readdir(skillsDir, { withFileTypes: true }).catch(() => []))
    .filter((e) => e.isDirectory() && e.name.startsWith('cdp-'))
    .map((e) => e.name)
    .filter((n) => role === 'curator' || WRITER_SKILLS.includes(n))
    .sort()
  const files = []
  for (const n of names) await walk(path.join(skillsDir, n), '.claude/skills/' + n, files)
  const block = await fs.readFile(path.join(found.dir, BLOCK[role] || BLOCK.writer)).catch(() => null)
  if (block) files.push({ name: '.claude/work-repo/CLAUDE.md', data: block })
  files.sort((a, b) => a.name.localeCompare(b.name))
  return { files, hash: hashOf(files), skills: names, role, dir: found.dir }
}

// kit 해시 — 파일 이름 · 내용으로. 작업 레포 CLAUDE.md 의 `cdp:kit` 과 대 보아 낡았는지 안다
export function hashOf(files) {
  const h = crypto.createHash('sha256')
  for (const f of files) h.update(f.name + '\0' + Buffer.from(f.data).toString('utf8') + '\0')
  return h.digest('hex').slice(0, 6)
}
