// 알림 — **셸에 하나**(개편안 §7.2 「재인증 · 토스트 — 셸로」). 전에는 App 과 콘솔이 각자 들고 있어 얼굴을 넘으면
// 떠 있던 알림이 사라졌고, App 의 것은 앞 알림의 타이머가 뒤 알림을 일찍 지웠다.
//
// `say(글, ms)` 하나 — 화면 아래 가운데에 잠깐 뜬다(app.css `.toast` · 모달 위).

import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react'

const Ctx = createContext(() => {})

export function ToastProvider({ children }) {
  const [msg, setMsg] = useState(null)
  const timer = useRef(0)
  const say = useCallback((m, ms = 3200) => {
    clearTimeout(timer.current)
    setMsg(m)
    timer.current = setTimeout(() => setMsg(null), ms)
  }, [])
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Ctx.Provider value={say}>
      {children}
      {msg && (
        <div className="toast" role="status">
          {msg}
        </div>
      )}
    </Ctx.Provider>
  )
}

export const useToast = () => useContext(Ctx)
