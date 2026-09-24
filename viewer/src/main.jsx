// 진입 — **얼굴을 고른다.** 한 번들이 셋에서 돈다(MCP 설계서 §6.8 · 제품관리서비스 검토 §4.1).
//
//   local    로컬 뷰어(트레이 앱) · repo  /r/<레포>/   →  App
//   site     / · /manual · /login · /setup · /r      →  Site
//   console  /console/…                              →  Console
//
// 얼굴은 `lib/api.js` 의 `face` 가 주소와 서버의 표식(`window.__CDP_SERVER__`)으로 정한다.
// 왕복이 없다 — 첫 렌더에서 갈린다.

import { createRoot } from 'react-dom/client'
import { face, getTheme } from './lib/api.js'
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

// 테마 — **세 얼굴이 한 키(cdp.theme)를 본다**(화면 UX 검토 v0.1 P12). 레포 화면의 설정이 그 키에 쓰고,
// 사이트 · 콘솔은 읽기만 한다. 기본은 OS 따라가기(§16.4). 앱(레포 · 로컬)은 state.theme 으로 같은 값을
// 받아 App 이 맡는다.
if (face === 'site' || face === 'console') {
  const mq = window.matchMedia('(prefers-color-scheme: dark)')
  const apply = () => {
    const t = getTheme()
    document.documentElement.dataset.theme = t === 'dark' || (t === 'system' && mq.matches) ? 'dark' : 'light'
  }
  apply()
  mq.addEventListener('change', apply)
  window.addEventListener('storage', (e) => e.key === 'cdp.theme' && apply())
}

const Root = face === 'console' ? Console : face === 'site' ? Site : App
createRoot(document.getElementById('root')).render(<Root />)
