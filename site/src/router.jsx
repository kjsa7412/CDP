// 라우터 — base 를 아는 history 라우터(공식 사이트 제작 검토 v0.1 S3).
//
// 제품 `viewer/src/lib/router.jsx` 는 절대경로 `/` 전제라 가져다 쓰지 않는다. 여기는 base(`/` 또는 `/cdp/`)를 떼고
// 붙인다. 페이지를 넘기면 맨 위로(앵커가 있으면 그 자리로), 뒤로가기는 브라우저가 스크롤을 되돌린다.

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

const BASE = __CDP_BASE__.replace(/\/$/, '')
const Ctx = createContext(null)

const strip = (p) => (BASE && p.startsWith(BASE) ? p.slice(BASE.length) || '/' : p)
export const href = (to) => (to.startsWith('/') ? BASE + to : to)
const now = () => {
  const p = strip(location.pathname).replace(/\/index\.html$/, '/').replace(/(.)\/$/, '$1')
  return { path: p || '/', query: new URLSearchParams(location.search), hash: decodeURIComponent(location.hash.slice(1)) }
}

export function RouterProvider({ children }) {
  const [route, setRoute] = useState(now)
  useEffect(() => {
    const on = () => setRoute(now())
    addEventListener('popstate', on)
    return () => removeEventListener('popstate', on)
  }, [])
  const navigate = useCallback((to, { replace = false, keepScroll = false } = {}) => {
    const url = href(to)
    if (url === location.pathname + location.search + location.hash) return
    history[replace ? 'replaceState' : 'pushState'](null, '', url)
    setRoute(now())
    if (keepScroll) return
    const h = new URL(url, location.href).hash.slice(1)
    requestAnimationFrame(() => {
      const el = h && document.getElementById(decodeURIComponent(h))
      if (el) el.scrollIntoView()
      else scrollTo(0, 0)
    })
  }, [])
  return <Ctx.Provider value={{ route, navigate }}>{children}</Ctx.Provider>
}

export const useRoute = () => useContext(Ctx).route
export const useNavigate = () => useContext(Ctx).navigate

// 링크 — 같은 사이트면 pushState, 수정 키 · 새 탭 · 바깥 주소는 브라우저에 맡긴다.
export function Link({ to, children, onClick, ...rest }) {
  const navigate = useNavigate()
  return (
    <a
      href={href(to)}
      onClick={(e) => {
        onClick?.(e)
        if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || !to.startsWith('/')) return
        e.preventDefault()
        navigate(to)
      }}
      {...rest}
    >
      {children}
    </a>
  )
}

export function useTitle(t) {
  useEffect(() => {
    document.title = t
  }, [t])
}
