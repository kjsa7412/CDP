// 라우터 — 손으로 짠 것. 의존성 0(제품관리서비스 검토 D12).
//
// 뷰어(`/r/<레포>/`)는 라우터가 없다 — URL 이 상태가 되면 `?t=` 토큰과 섞이는 로컬의
// 이유였다. 사이트(`/` · `/manual`)와 콘솔(`/console`)은 **주소가 상태다**(§6.6.2) —
// 새로고침 · 북마크 · 남에게 링크로 보내기가 되어야 한다. 그래서 여기만 `pushState` 를 쓴다.
//
// 얼굴을 넘는 이동(사이트 → 레포 · 콘솔 → 레포)은 `location.href` 다 — `main.jsx` 가
// 첫 렌더에서 얼굴을 고르므로 그 사이는 pushState 로 건널 수 없다.

import { useEffect, useState } from 'react'

const listeners = new Set()

function read() {
  const u = new URL(location.href)
  return {
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

export function navigate(to, { replace = false } = {}) {
  if (replace) history.replaceState(null, '', to)
  else history.pushState(null, '', to)
  for (const l of listeners) l()
}

export function useRoute() {
  const [loc, setLoc] = useState(read)
  useEffect(() => {
    const l = () => setLoc(read())
    listeners.add(l)
    window.addEventListener('popstate', l)
    return () => {
      listeners.delete(l)
      window.removeEventListener('popstate', l)
    }
  }, [])
  return loc
}

// 같은 얼굴 안의 링크. 새 탭(⌘/Ctrl 클릭)은 브라우저에 맡긴다.
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
