// 라우터 — 손으로 짠 것. 의존성 0(제품관리서비스 검토 D12).
//
// **주소가 상태다**(§6.6.2) — 사이트(`/` · `/manual`) · 콘솔(`/console`) · 레포(`/r/<레포>/` · `/graph` ·
// `/manage/<탭>`) · 로컬(`/` · `/graph` · `/manage/<탭>`) 전부. 새로고침 · 북마크 · 남에게 링크로 보내기 ·
// 뒤로 가기가 된다.
//
// 얼굴을 넘는 이동도 `pushState` 다 — `Shell` 이 매 렌더 `modeOf(path)` 로 얼굴을 고른다(화면 · 권한 검토 v0.1 R7).
// 전에는 `main.jsx` 가 첫 렌더에서 얼굴을 한 번 고정해 얼굴 사이가 전부 문서 교체였다. 로컬의 `?t=` 토큰은
// `api.js` 의 `readToken()` 이 모듈 로드에서 지운다 — 여기서 읽기 전이다.
//
// 라우트 전환은 `startTransition` — 새 화면의 첫 렌더가 끝날 때까지 이전 화면이 남는다(React 18 · R8).

import { startTransition, useEffect, useState } from 'react'

const listeners = new Set()

function read() {
  const u = new URL(location.href)
  return {
    href: u.href,
    path: u.pathname,
    segs: u.pathname.split('/').filter(Boolean).map((s) => {
      try {
        return decodeURIComponent(s)
      } catch {
        return s
      }
    }),
    query: u.searchParams,
    hash: u.hash,
  }
}

// `state` — 그 히스토리 항목에 실을 것. 레포 화면이 문서마다 왼쪽(뿌리 · 범위)과 직전 문서를 싣고, 뒤로 가기에서
// 되살린다(문서 이동 검토 v0.1). 새로고침해도 브라우저가 들고 있다.
export function navigate(to, { replace = false, state = null } = {}) {
  const cur = location.pathname + location.search + location.hash
  // 같은 주소를 다시 누른 것 — 히스토리를 쌓지 않는다
  if (to === cur) return
  if (replace) history.replaceState(state, '', to)
  else history.pushState(state, '', to)
  for (const l of listeners) l()
}

export function useRoute() {
  const [loc, setLoc] = useState(read)
  useEffect(() => {
    const l = () => startTransition(() => setLoc(read()))
    listeners.add(l)
    window.addEventListener('popstate', l)
    // 구독 전에 바뀐 주소를 따라잡는다 — 자식의 effect 가 부모보다 먼저 돈다. 설명서의 「첫 권으로」 처럼 자식이 첫 렌더
    // 직후 `navigate(…, { replace })` 하면 부모의 이 구독이 아직 없어 주소만 바뀌고 화면은 그대로였다
    setLoc((cur) => (cur.href === location.href ? cur : read()))
    return () => {
      listeners.delete(l)
      window.removeEventListener('popstate', l)
    }
  }, [])
  return loc
}

// 얼굴 — **주소가 말해 준다.** 한 번들이 셋에서 돈다(MCP 설계서 §6.8).
//
//   로컬   /                 face: local   (window.__CDP_SERVER__ 없음)
//   레포   /r/<repo>/…       face: repo    rest = 그 뒤 조각(d/<문서> · graph · manage/<탭>)
//   사이트 / · /manual · /login · /setup · /r      face: site    ┐ 서버가 index.html 에 심은
//   콘솔   /console/…                              face: console ┘ window.__CDP_SERVER__ 로 안다
//
// `/r/` 밖에서는 경로만으로 로컬과 서버를 가를 수 없다(둘 다 `/`). 그래서 서버가 `index.html` 을 낼 때
// 한 줄을 심는다 — 왕복 없이 갈린다.
export function modeOf(path = location.pathname) {
  const seg = path.split('/').filter(Boolean)
  const dec = (s) => {
    try {
      return decodeURIComponent(s)
    } catch {
      return s
    }
  }
  if (seg[0] === 'r' && seg[1]) return { server: true, repo: dec(seg[1]), face: 'repo', rest: seg.slice(2).map(dec) }
  if (typeof window !== 'undefined' && window.__CDP_SERVER__) {
    return { server: true, repo: null, face: seg[0] === 'console' ? 'console' : 'site', rest: seg.map(dec) }
  }
  return { server: false, repo: null, face: 'local', rest: seg.map(dec) }
}

// 같은 번들 안의 링크 — 얼굴 안이든 밖이든. 새 탭(⌘/Ctrl 클릭)은 브라우저에 맡긴다.
export function Link({ to, children, className, replace = false, onClick, ...rest }) {
  return (
    <a
      href={to}
      className={className}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return
        e.preventDefault()
        navigate(to, { replace })
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

// 탭 제목 — `<페이지> · CDP` 한 규칙(화면 UX 검토 v0.1 P3). 히스토리 · 탭 · 북마크에서 얼굴이 갈린다.
export function useTitle(title) {
  useEffect(() => {
    if (title) document.title = title
  }, [title])
}
