// 이 프로그램이 자기에 대해 아는 것 — 버전과 번들 시각. 서버 번들(`bin/ctx.mjs`) 하나가 낸다
// (v1.0 — 레포마다 든 번들은 없다).

import fs from 'node:fs'
import path from 'node:path'

// 번들 빌드가 치환한다(`ops/lib/build-ctx.mjs`). node 로 돌 때는 그대로 남고,
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
