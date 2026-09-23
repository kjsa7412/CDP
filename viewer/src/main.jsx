// 진입 — **얼굴을 고른다.** 한 번들이 셋에서 돈다(MCP 설계서 §6.8 · 제품관리서비스 검토 §4.1).
//
//   local    로컬 뷰어(트레이 앱) · repo  /r/<레포>/   →  App
//   site     / · /manual · /login · /setup · /r      →  Site
//   console  /console/…                              →  Console
//
// 얼굴은 `lib/api.js` 의 `face` 가 주소와 서버의 표식(`window.__CDP_SERVER__`)으로 정한다.
// 왕복이 없다 — 첫 렌더에서 갈린다.

import { createRoot } from 'react-dom/client'
import { face } from './lib/api.js'
import App from './App.jsx'
import Site from './site/Site.jsx'
import Console from './console/Console.jsx'
import './styles/font.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/admin.css'
import './styles/doc.css'
import './styles/site.css'
import './styles/console.css'

document.documentElement.dataset.face = face

// 사이트 · 콘솔은 OS 테마를 따른다. 앱은 자기 설정(state.theme)이 있어 App 이 맡는다.
if (face === 'site' || face === 'console') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    document.documentElement.dataset.theme = mq.matches ? 'dark' : 'light'
  }
  apply()
  mq.addEventListener('change', apply)
}

const Root = face === 'console' ? Console : face === 'site' ? Site : App
createRoot(document.getElementById('root')).render(<Root />)
