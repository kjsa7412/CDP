// 공식 사이트 진입 — 서버 없는 정적 SPA(공식 사이트 제작 검토 v0.1 S1). 색 · 카드 · 「MCP 가 도는 길」 의 모양은
// 제품의 것을 그대로 쓴다(`tokens.css` · `site.css`) — 스크린숏과 사이트가 같은 색이어야 그림이 제자리에 앉는다.

import { createRoot } from 'react-dom/client'
import '../../viewer/src/styles/tokens.css'
import '../../viewer/src/styles/site.css'
import './site.css'
import App from './App.jsx'
import { RouterProvider } from './router.jsx'
import { followTheme } from './theme.js'

followTheme()
createRoot(document.getElementById('root')).render(
  <RouterProvider>
    <App />
  </RouterProvider>
)
