// 껍데기 하나 — **라우트가 얼굴을 고른다.** 화면 · 권한 검토 v0.1 R7 · R8.
//
// 전에는 `main.jsx` 가 첫 렌더에서 얼굴을 한 번 고르고(`face` 상수) 상단 바는 얼굴마다 자기 것을 그렸다.
// 그래서 소개 → 레포 · 레포 → 콘솔 · 레포 바꾸기가 전부 문서 교체였고, 그때마다 밝은 첫 페인트 → 세션 없는
// 상단 바 → 세션 있는 상단 바 → 「읽는 중…」 → 내용의 다섯 단계를 겪었다(§2.4).
//
// 지금은 —
//   Shell   `useRoute()` 로 **매 렌더** 얼굴을 정한다. `/r/<repo>/…` 레포 · `/console…` 콘솔 · 나머지 사이트 ·
//           `window.__CDP_SERVER__` 없음 → 로컬
//   TopBar  Shell 이 **한 번** 그린다 — 얼굴 사이에 살아남는다. 레포 얼굴의 도구(세그 · 검색 · 검증 · ⋯)는 App 이
//           Shell 이 미리 만든 DOM 노드 둘(`slots`)에 포털로 넣는다 — 상태와 핸들러는 App 에 남고 DOM 은 그대로다
//   세션    `SessionProvider` 가 `/site/info` · `/me` 를 한 번 읽어 내린다. `ready` 전에는 아무것도 그리지 않는다 —
//           반 그려진 상단 바(P11)를 내지 않는다
//   레포    `<App key={repo}>` — 레포마다 상태를 새로. 「화면 상태를 들고 가지 않는다」(§6.6.2)는 그대로다

import { useEffect, useLayoutEffect, useMemo, useState } from 'react'
import { useRoute, modeOf } from './lib/router.jsx'
import { SessionProvider, useSession } from './lib/session.jsx'
import { SlotCtx } from './lib/slots.js'
import TopBar from './components/TopBar.jsx'
import App from './App.jsx'
import Site from './site/Site.jsx'
import Console from './console/Console.jsx'

export default function Shell() {
  const route = useRoute()
  const m = modeOf(route.path)
  // 인라인 스크립트(index.html)가 첫 페인트 전에 같은 값을 붙였다 — 여기서는 얼굴이 바뀔 때 따라간다(페인트 전 · 한 프레임도 어긋나지 않게)
  useLayoutEffect(() => {
    document.documentElement.dataset.face = m.face
  }, [m.face])
  return (
    <SessionProvider>
      <Frame m={m} route={route} />
    </SessionProvider>
  )
}

function mk(cls) {
  const el = document.createElement('div')
  el.className = cls
  return el
}

function Frame({ m, route }) {
  const s = useSession()
  // 포털 자리 둘 — App 이 렌더될 때 이미 있어야 하므로 여기서 만든다. TopBar 가 마운트되며 자기 안에 붙인다
  const slots = useMemo(() => ({ center: mk('topbar__center'), right: mk('topbar__right') }), [])
  // 로컬 — 보는 레포 경로를 바꾸면 App 을 새로 세운다(`cdp:remount`). 전에는 `location.reload()` 였다(화면 · 권한 검토 v0.1 부록 A #5)
  const [gen, setGen] = useState(0)
  useEffect(() => {
    const f = () => setGen((g) => g + 1)
    window.addEventListener('cdp:remount', f)
    return () => window.removeEventListener('cdp:remount', f)
  }, [])
  if (!s.ready) return null

  const seg = route.segs[0] || ''
  let body
  if (m.face === 'repo' || m.face === 'local') body = <App key={(m.repo || 'local') + ':' + gen} />
  else if (m.face === 'console') body = <Console />
  else body = <Site />

  return (
    <div className="shell" data-face={m.face}>
      <TopBar
        face={m.face}
        repoName={m.repo}
        cur={m.face === 'site' ? (seg === '' ? 'intro' : seg === 'manual' ? 'manual' : null) : null}
        hideLogin={m.face === 'site' && (seg === 'login' || seg === 'setup')}
        slots={slots}
      />
      <SlotCtx.Provider value={slots}>{body}</SlotCtx.Provider>
    </div>
  )
}
