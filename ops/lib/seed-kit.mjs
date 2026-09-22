// fixture 의 `.claude/` 를 `agent/` 에서 만든다 — **Python 없이.**
//
// `viewer/fixture/.claude/` 는 추적하지 않는다(`.gitignore` — 사본을 추적하면
// 원본이 둘로 보인다). 그래서 fresh clone 에는 없다. 지금까지는
// `ops/lib/seed_repo.py` 가 만들어 줬는데 그것은 Python 과 개인 PC 의 덤프에
// 의존한다. 검증 하네스(`ops/verify/run.mjs`)는 fixture 를 복사해 서버 레포로
// 쓰고 `GET /kit` 이 그 `.claude/` 를 싼다 — CI 의 fresh clone 에서는 38 · 52 ·
// 56 · 57 번이 `.claude/` 가 없어 죽는다.
//
// `seed_repo.py` 가 하는 일 중 **그 부분만** 옮겼다. 내용(work · docs)은
// 그대로 Python 이 만든다 — 그것은 여기 일이 아니다.
//
//   node ops/lib/seed-kit.mjs [지식레포 경로]        기본: viewer/fixture
//
// 라이브러리로도 쓴다 — 하네스가 `seedKit(dest)` 를 부른다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// **`..` 가 두 번이다.** 이 파일은 `ops/lib/` 에 있다.
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

// LF 로 쓴다. 지식 레포의 `.gitattributes` 가 `* text=auto eol=lf` 라
// clone 한 결과와 같아야 한다(`release.mjs` 의 copyFile 과 같은 규칙).
async function copyText(src, dst) {
  const b = await fs.readFile(src)
  await fs.mkdir(path.dirname(dst), { recursive: true })
  if (b.includes(0)) return fs.writeFile(dst, b)
  await fs.writeFile(dst, b.toString('utf8').replace(/\r\n/g, '\n'))
}

async function copyDir(src, dst) {
  await fs.mkdir(dst, { recursive: true })
  for (const e of await fs.readdir(src, { withFileTypes: true })) {
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) await copyDir(s, d)
    else await copyText(s, d)
  }
}

/**
 * 지식 레포 `dest` 에 `.claude/skills/cdp-*` 와 `.claude/work-repo/CLAUDE.md` 를 넣는다.
 * 있던 `cdp-` 스킬은 지우고 다시 넣는다 — `core/setup.js` 의 `applySetup` 과 같다.
 * `cdp-` 가 아닌 스킬은 건드리지 않는다.
 */
export async function seedKit(dest, { root = ROOT } = {}) {
  const agent = path.join(root, 'agent')
  const skillsSrc = path.join(agent, 'skills')
  const skillsDst = path.join(dest, '.claude', 'skills')
  const done = []

  const names = (await fs.readdir(skillsSrc, { withFileTypes: true }))
    .filter((e) => e.isDirectory() && e.name.startsWith('cdp-'))
    .map((e) => e.name)
    .sort()
  for (const n of names) {
    await fs.rm(path.join(skillsDst, n), { recursive: true, force: true })
    await copyDir(path.join(skillsSrc, n), path.join(skillsDst, n))
    done.push('.claude/skills/' + n)
  }

  // **CLAUDE.md 는 두 종류다.** 여기 넣는 것은 작업 레포에 갈 **서식**이다 —
  // 지식 레포 자신의 CLAUDE.md 는 fixture 가 이미 추적한다.
  await copyText(path.join(agent, 'CLAUDE-프로젝트레포.md'), path.join(dest, '.claude', 'work-repo', 'CLAUDE.md'))
  done.push('.claude/work-repo/CLAUDE.md')
  return done
}

const invokedDirect = process.argv[1] && /seed-kit\.mjs$/i.test(process.argv[1])
if (invokedDirect) {
  const dest = path.resolve(process.argv[2] || path.join(ROOT, 'viewer', 'fixture'))
  seedKit(dest).then(
    (done) => {
      console.log(`[seed-kit] ${path.relative(ROOT, dest) || dest} ← agent/  (${done.length}개)`)
    },
    (e) => {
      console.error('[seed-kit] 실패: ' + (e?.message || e))
      process.exit(1)
    }
  )
}
