import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { releasesOf } from './tools/releases.mjs'

// 공식 사이트 — 제품 번들과 따로 선다(공식 사이트 제작 검토 v0.1 S2). 제품 설정은 `ops/out/web` 을 비우고 다시 쓰므로
// 설정 파일과 출력 폴더를 가른다. 색 · 아이콘 · 「MCP 가 도는 길」 은 `../viewer/src` 에서 가져다 쓴다 — 사본을 두면
// 스크린숏과 사이트의 색이 서서히 갈라진다.
//
// base — Vercel 은 루트(`/`)다. 하위 경로에 올리면 `CDP_SITE_BASE=/cdp/` 로 다시 빌드한다(S3).

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(HERE, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'))
const base = process.env.CDP_SITE_BASE || '/'

// 판 이력 — CHANGELOG 의 절 제목과 첫 문단만. 빌드 때 만든다(S14).
function releases() {
  const id = 'virtual:cdp-releases'
  return {
    name: 'cdp-releases',
    resolveId: (s) => (s === id ? '\0' + id : null),
    load: (s) => (s === '\0' + id ? 'export default ' + JSON.stringify(releasesOf(fs.readFileSync(path.join(ROOT, 'CHANGELOG.md'), 'utf8'))) : null),
  }
}

export default defineConfig({
  root: HERE,
  base,
  plugins: [react(), releases()],
  define: {
    __CDP_VERSION__: JSON.stringify(pkg.version),
    __CDP_BASE__: JSON.stringify(base),
  },
  server: { port: 5174, fs: { allow: [ROOT] } },
  build: {
    outDir: path.join(ROOT, 'ops', 'out', 'site'),
    emptyOutDir: true,
    modulePreload: { polyfill: false },
    assetsInlineLimit: 0,
  },
})
