// 실행 형태 판별 — node 로 직접 실행 / 단일 실행 파일(SEA).
//
// 설계서 §5.1 은 A(포터블 exe)와 B(npx)를 동등하게 채택했다. 두 경로가 같은
// 코드에서 나오므로 경로 계산도 한 군데서 갈라야 한다.
//
// 이 파일은 ESM 으로 직접 실행될 때와 esbuild 가 CJS 로 말았을 때 **둘 다**
// 돌아야 한다. 그래서 top-level await 도, require 도 쓰지 않는다.
//   · ESM : import.meta.url 이 있고 __dirname 이 없다
//   · CJS : 그 반대. esbuild 가 import.meta 를 {} 로 바꾼다

import path from 'node:path'
import { fileURLToPath } from 'node:url'

// SEA 판별 — node:sea 를 import 하려면 top-level await 가 필요해 CJS 번들이
// 깨진다. 실행 파일 이름으로 본다. 휴리스틱이지만 이 용도에는 충분하다.
const exeName = path.basename(process.execPath).toLowerCase()
export const isSea = !/^node(\.exe)?$/.test(exeName)

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

// 포터블 마커(cdp.portable)를 찾는 기준(§6.1).
//
// SEA 면 exe 가 있는 폴더다. node 실행이면 process.execPath 가 node.exe 라
// 그대로 쓸 수 없으므로 프로젝트 루트를 받는다.
export function appRoot(fallbackDir) {
  return isSea ? path.dirname(process.execPath) : fallbackDir
}
