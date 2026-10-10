import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 정적 빌드(ops/out/web)를 서버(`ctx serve`)가 낸다. 개발 중에는 Vite 가 화면을, 개인 서버
// (`npm run dev:server` — `ctx serve --personal viewer/fixture --port 7373`)가 API 를 맡는다.
export default defineConfig({
  // 설정 파일이 `viewer/` 로 내려갔다. **루트를 명시한다** — 안 그러면 vite 가
  // 설정 파일 자리를 루트로 잡아 `viewer/index.html` 을 못 찾는다.
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    // 서버가 내는 자리만 넘긴다 — 화면 주소(/r · /console · /manual …)는 vite 가 그린다. Origin 이 루프백이라
    // 서버의 같은 출처 검사를 통과한다. 로그인은 POST 와 개인 서버의 첫 접속 주소(GET /login?auto=)만 서버로
    proxy: Object.fromEntries(
      ['/api', '/admin', '/me', '/next', '/workrepos', '/repos', '/logout', '/kit', '/mcp', '/healthz', '/install.mjs', '/site']
        .map((p) => [p, { target: 'http://127.0.0.1:7373', changeOrigin: true }])
        .concat([['/login', { target: 'http://127.0.0.1:7373', changeOrigin: true, bypass: (req) => (req.method === 'GET' && !/[?&]auto=/.test(req.url) ? '/index.html' : undefined) }]])
    ),
  },
  build: {
    // **산출물은 전부 `ops/out/` 아래 한 자리에 모은다.** 전에는 `dist/`(화면)와
    // `build/`(exe)가 따로 있어서 어디를 봐야 하는지 매번 헷갈렸다.
    outDir: '../ops/out/web',
    emptyOutDir: true,
    // highlight.js 는 markdown.js 의 동적 import 로만 들어온다.
    // manualChunks 로 이름을 붙이면 Vite 가 modulepreload 를 걸어버려
    // "코드블록이 보이는 순간 로드"(v0.1 §6)가 깨진다.
    modulePreload: { polyfill: false },
  },
})
