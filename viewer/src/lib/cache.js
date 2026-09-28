// 데이터 캐시 — **마운트 때 캐시가 있으면 즉시 그리고 뒤에서 갱신한다**(stale-while-revalidate).
// 화면 · 권한 검토 v0.1 R8.
//
// 전에는 관리 탭 넷 · 콘솔 페이지 일곱 · 설명서 책 · 검사 오버레이가 마운트마다 `useEffect(() => load(), [])` 로
// 처음부터 읽어 그 사이 「읽는 중…」 을 그렸다(P9 · 22곳). 문서 교체가 없는 전환도 그래서 깜빡였다.
//
//   키       레포 + 경로(`api:<레포>/status`) 또는 절대 경로(`/repos` · `/admin/users`)
//   ttl      이 안에 읽은 것은 마운트에서 다시 읽지 않는다(기본 10초 — 탭을 빠르게 오갈 때 요청이 겹치지 않게)
//   공유     같은 키를 읽는 부품 여럿(StatusBar 와 관리 현황의 `/repos`)이 **요청 하나**를 나눠 받고 같이 갱신된다
//   쓰기 뒤  `refresh()`(그 부품) 또는 `invalidate(키 · 접두)`(다른 부품이 다음 마운트에서 다시 읽게)
//
// 서버에 알림 · SSE 는 없다(§6.1) — 갱신은 마운트 · 초점 · 쓰기 뒤에만. 실시간이 아니라 **다시 열면 새것**이다.

import { useCallback, useEffect, useReducer, useRef } from 'react'

const store = new Map() // key → { data, at, promise, error, subs }

function entry(key) {
  let e = store.get(key)
  if (!e) {
    e = { data: undefined, at: 0, promise: null, error: null, subs: new Set() }
    store.set(key, e)
  }
  return e
}
const notify = (e) => {
  for (const s of e.subs) s()
}

export const peek = (key) => store.get(key)?.data

export function put(key, data) {
  const e = entry(key)
  e.data = data
  e.at = Date.now()
  e.error = null
  notify(e)
}

// 낡았다고 표시한다 — 데이터는 남긴다(다음 마운트가 즉시 그리고 뒤에서 다시 읽는다). 문자열은 접두로 본다.
export function invalidate(what) {
  for (const [k, e] of store) {
    if (typeof what === 'function' ? what(k) : k.startsWith(what)) e.at = 0
  }
}

// 전부 비운다 — 로그아웃 · 다른 사람으로 로그인. 사람마다 다른 값이 남지 않게.
export function clearAll() {
  for (const e of store.values()) {
    e.data = undefined
    e.at = 0
    e.promise = null
    e.error = null
  }
}

// 읽는다 — ttl 안이면 캐시 그대로, 진행 중이면 그 요청을 같이 받는다.
export function load(key, fetcher, { ttl = 10_000, force = false } = {}) {
  const e = entry(key)
  if (!force && e.data !== undefined && Date.now() - e.at < ttl) return Promise.resolve(e.data)
  if (e.promise) return e.promise
  e.promise = Promise.resolve()
    .then(fetcher)
    .then(
      (d) => {
        e.data = d
        e.at = Date.now()
        e.promise = null
        e.error = null
        notify(e)
        return d
      },
      (err) => {
        e.promise = null
        e.error = err
        notify(e)
        throw err
      }
    )
  return e.promise
}

// 부품에서 — `data` 는 캐시가 있으면 첫 렌더부터 있다. 「읽는 중…」 은 `data === undefined` 일 때만 그린다.
export function useResource(key, fetcher, { ttl = 10_000, enabled = true } = {}) {
  const [, tick] = useReducer((x) => x + 1, 0)
  const fRef = useRef(fetcher)
  fRef.current = fetcher
  useEffect(() => {
    if (!enabled || !key) return
    const e = entry(key)
    e.subs.add(tick)
    load(key, () => fRef.current(), { ttl }).catch(() => {})
    return () => {
      e.subs.delete(tick)
    }
  }, [key, enabled, ttl])
  const refresh = useCallback(() => load(key, () => fRef.current(), { ttl, force: true }), [key, ttl])
  const e = key && enabled ? store.get(key) : null
  // 401 은 `api.js` 가 로그인으로 보낸 뒤 던진 것 — 화면이 오류를 그릴 일이 아니다
  const error = e?.error && e.error.status !== 401 ? e.error : null
  return { data: e?.data, error, loading: !!e?.promise && e?.data === undefined, refresh }
}
