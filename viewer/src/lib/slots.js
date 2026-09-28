// 상단 바의 포털 자리 둘 — Shell 이 만들고 TopBar 가 자기 안에 붙이고 App 이 그린다(화면 · 권한 검토 v0.1 R7).
// Shell ↔ App 순환 import 를 피하려고 따로 둔다.
import { createContext, useContext } from 'react'

export const SlotCtx = createContext(null)
export const useSlots = () => useContext(SlotCtx)
