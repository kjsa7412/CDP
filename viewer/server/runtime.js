// 이 파일의 자리 — ESM 으로 직접 실행될 때와 esbuild 가 CJS 로 말았을 때(서버 번들 `bin/ctx.mjs`) **둘 다**
// 돌아야 한다. 그래서 top-level await 도, require 도 쓰지 않는다.
//   · ESM : import.meta.url 이 있고 __dirname 이 없다
//   · CJS : 그 반대. esbuild 가 import.meta 를 {} 로 바꾼다

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// CJS 번들에서도 안전한 디렉터리.
// import.meta.url 은 CJS 에서 undefined 이므로 그때만 __dirname 으로 넘어간다.
export function hereDir(importMetaUrl) {
  if (importMetaUrl) {
    try {
      return path.dirname(fileURLToPath(importMetaUrl))
    } catch {}
  }
  if (typeof __dirname !== 'undefined') return __dirname
  return process.cwd()
}
