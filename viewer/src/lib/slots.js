// 셸이 얼굴에 내려 주는 것 둘 — Shell ↔ App 순환 import 를 피하려고 따로 둔다.
//
//   SlotCtx    상단 바의 포털 자리 둘(화면 · 권한 검토 v0.1 R7) — Shell 이 만들고 AppBar 가 자기 안에 붙이고 App 이 그린다
//   ScreenCtx  지금 주소의 화면(`shell/routes.js` 의 screenOf) — 셸 · App · 관리 화면 · 콘솔이 **같은 값**을 본다
import { createContext, useContext } from 'react'

export const SlotCtx = createContext(null)
export const useSlots = () => useContext(SlotCtx)

export const ScreenCtx = createContext(null)
export const useScreen = () => useContext(ScreenCtx)
