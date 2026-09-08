import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// 정적 빌드가 viewer/server/adapter 에 내장된다(§8). 개발 중에는 Vite 가 화면을,
// node viewer/server/index.js --dev 가 API 를 맡고 /api 만 프록시한다.
export default defineConfig({
  // 설정 파일이 `viewer/` 로 내려갔다. **루트를 명시한다** — 안 그러면 vite 가
  // 설정 파일 자리를 루트로 잡아 `viewer/index.html` 을 못 찾는다.
  root: __dirname,
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      // changeOrigin — 프록시가 Host 를 대상(127.0.0.1:7373)으로 바꿔 준다.
      // 그대로 두면 Host 가 localhost:5173 인 채 도착해 §7.2 의 Host 화이트리스트가
      // 소켓을 끊고, vite 는 500 을 낸다. Origin 은 프록시가 손대지 않으므로
      // 서버 쪽에서 --dev 로 받은 루프백 오리진만 통과시킨다.
      '/api': { target: 'http://127.0.0.1:7373', changeOrigin: true },
    },
  },
  build: {
    // **산출물은 전부 `out/` 아래 한 자리에 모은다.** 전에는 `dist/`(화면)와
    // `build/`(exe)가 따로 있어서 어디를 봐야 하는지 매번 헷갈렸다.
    outDir: '../out/web',
    emptyOutDir: true,
    // highlight.js 는 markdown.js 의 동적 import 로만 들어온다.
    // manualChunks 로 이름을 붙이면 Vite 가 modulepreload 를 걸어버려
    // "코드블록이 보이는 순간 로드"(v0.1 §6)가 깨진다.
    modulePreload: { polyfill: false },
  },
})
