// seed 런처 — 파이썬 이름이 플랫폼마다 다르다.
//
// Windows 는 `python`(런처 `py` 도 흔하다), macOS·Linux 는 **`python3` 뿐이고
// `python` 이 아예 없다.** package.json 에 `python` 을 박아 두면 맥에서
// `npm run release` 가 exit 127 로 죽는다 -- 어디서 죽었는지도 안 보인다.
// 있는 것을 찾아 부르고, 하나도 없으면 무엇을 깔아야 하는지 말한다.
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')
const script = path.join(ROOT, 'ops', 'lib', 'seed_repo.py')
const args = process.argv.slice(2)

const candidates =
  process.platform === 'win32' ? ['python', 'py', 'python3'] : ['python3', 'python']

for (const cmd of candidates) {
  const probe = spawnSync(cmd, ['--version'], { stdio: 'ignore' })
  if (probe.error || probe.status !== 0) continue
  const r = spawnSync(cmd, [script, ...args], { cwd: ROOT, stdio: 'inherit' })
  process.exit(r.status ?? 1)
}

console.error('[seed] 파이썬을 찾지 못했습니다 — 시도한 이름: ' + candidates.join(', '))
console.error('[seed] macOS: brew install python  ·  Windows: python.org 설치본(런처 py 포함)')
process.exit(1)
