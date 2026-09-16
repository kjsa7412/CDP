// 이 프로그램이 자기에 대해 아는 것 — 버전과 번들 시각.
//
// **없는 것과 낡은 것은 다르고, 낡은 쪽이 더 나쁘다.** 도구를 고쳤는데
// 레포의 `bin/ctx.mjs` 를 안 갈아 끼우면 그 레포만 옛 답을 낸다 — 그리고
// 그것은 "모르는 명령" 으로만 나타난다(README 의 경고). 그래서 두 시각을
// 나란히 볼 수 있어야 한다: 앱이 든 번들과 레포가 든 번들.

import fs from 'node:fs'
import path from 'node:path'

// exe 빌드가 치환한다(`ops/lib/build-exe.mjs`). node 로 돌 때는 그대로 남고,
// 그때는 아래에서 package.json 을 읽는다.
const STAMPED = '__CDP_VERSION__'

export function appVersion(startDir) {
  if (!STAMPED.startsWith('__')) return STAMPED
  let dir = startDir || process.cwd()
  for (let i = 0; i < 6; i++) {
    try {
      const p = path.join(dir, 'package.json')
      if (fs.existsSync(p)) {
        const v = JSON.parse(fs.readFileSync(p, 'utf8'))?.version
        if (v) return v
      }
    } catch {}
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }
  return null
}

// 지식 레포가 들고 있는 `bin/ctx.mjs` 의 번들 시각.
// `build-ctx` 가 심어 두는 `BUILT = '…'` 한 줄을 읽는다.
export function repoBundleStamp(root) {
  for (const rel of [['bin', 'ctx.mjs'], ['bin', 'ctx.js']]) {
    try {
      const p = path.join(root, ...rel)
      if (!fs.existsSync(p)) continue
      const m = fs.readFileSync(p, 'utf8').match(/BUILT\s*=\s*['"]([^'"]+)['"]/)
      if (m && !m[1].startsWith('__')) return { path: p, stamp: m[1] }
      return { path: p, stamp: null }
    } catch {}
  }
  return null
}
