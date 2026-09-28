// 진입 — **껍데기 하나.** `Shell` 이 매 렌더 주소로 얼굴을 고른다(화면 · 권한 검토 v0.1 R7).
//
//   local    로컬 뷰어(트레이 앱) · repo  /r/<레포>/   →  App
//   site     / · /manual · /login · /setup · /r      →  Site
//   console  /console/…                              →  Console
//
// 전에는 여기서 얼굴을 한 번 고정해(`face` 상수) 얼굴 사이가 전부 문서 교체였다. 이제 얼굴을 넘는 이동도 pushState 다.

import { createRoot } from 'react-dom/client'
import { applyTheme } from './lib/api.js'
import Shell from './Shell.jsx'
import './styles/font.css'
import './styles/tokens.css'
import './styles/app.css'
import './styles/admin.css'
import './styles/doc.css'
import './styles/site.css'
import './styles/console.css'

// 테마 — **얼굴 무관 한 곳.** 첫 페인트 전에는 `index.html` 의 인라인 스크립트가 같은 계산(`cdp.theme` + OS)으로
// 붙였다(R9 · P10). 여기서는 OS 변화 · 다른 탭의 설정 변경을 따라간다. 레포 화면의 설정 세그는 같은 키에 쓰고
// `applyTheme` 를 부른다.
applyTheme()
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => applyTheme())
window.addEventListener('storage', (e) => e.key === 'cdp.theme' && applyTheme())

createRoot(document.getElementById('root')).render(<Shell />)
