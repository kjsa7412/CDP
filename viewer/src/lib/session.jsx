// 세션 하나 — **Shell 이 한 번 읽고 얼굴 셋이 나눠 쓴다.** 화면 · 권한 검토 v0.1 R8.
//
// 전에는 `App` · `Console` · `Site` · `NoRepo` · `RepoServer` 가 각자 `/me` 또는 `/site/info` 를 읽어 문서마다
// 상단 바가 두 번 그려졌다(세션 없이 한 번 · 있이 한 번 — P11). 지금은 `/site/info`(공개 · 판 · 빌드 · 레포 수 ·
// 설명서 목록 · 로그인했으면 이름 · 역할)와 `/me`(세션 · 볼 수 있는 레포 · write · 만료)를 **한 번에** 읽고,
// 로그인 · 로그아웃이 갱신한다. 로컬 모드는 세션이 없다(null · 즉시 ready).
//
// `ready` 전에는 Shell 이 아무것도 그리지 않는다 — 반 그려진 상단 바를 내지 않는다. 첫 문서에서 한 번뿐이다
// (그 뒤 얼굴 전환은 pushState 라 세션이 그대로다).

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react'
import { api, site, isServer } from './api.js'

const Ctx = createContext(null)

export function SessionProvider({ children }) {
  const server = isServer()
  const [st, setSt] = useState(() => ({ ready: !server, info: null, me: null, err: null }))
  const atRef = useRef(0)

  const refresh = useCallback(async () => {
    if (!server) return null
    try {
      // 둘을 같이 — `/me` 는 401 을 답으로 받는다(비로그인 · 로그인으로 보내지 않는다)
      const [info, me] = await Promise.all([site.info(), api.me({ probe: true })])
      atRef.current = Date.now()
      setSt({ ready: true, info, me, err: null })
      return me
    } catch (e) {
      setSt((s) => ({ ...s, ready: true, err: e?.message || String(e) }))
      return null
    }
  }, [server])

  // 오래됐으면 뒤에서 한 번 더 — 관리자가 역할 · 레포 할당을 바꾼 것이 다음 레포 화면에서 보이게. 화면은 그대로 선다
  const refreshIfStale = useCallback((ms = 30_000) => {
    if (server && Date.now() - atRef.current > ms) refresh()
  }, [server, refresh])

  // 로그아웃 — 서버는 쿠키를 지웠다. 화면의 세션도 비운다(공개 값은 남긴다)
  const clear = useCallback(() => {
    atRef.current = 0
    setSt((s) => ({ ...s, me: null, info: s.info ? { ...s.info, user: null, role: null, admin: false } : null }))
  }, [])

  useEffect(() => {
    refresh()
  }, [refresh])

  const value = useMemo(() => ({ ...st, server, refresh, refreshIfStale, clear }), [st, server, refresh, refreshIfStale, clear])
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

export const useSession = () => useContext(Ctx)
