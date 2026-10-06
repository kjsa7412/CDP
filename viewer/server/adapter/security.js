// 경로 안전 — 읽기 API(`read-api.js`)가 레포 밖 파일을 내지 않게. 서버(`ctx serve`)가 쓴다.
//
// 로컬 뷰어(모드 A)의 세션 토큰 · Host 화이트리스트 · 실행 파일 판정은 v1.0 에서 로컬 뷰어와 함께 걷었다.

import path from 'node:path'
import fs from 'node:fs/promises'

// 레포 루트 안의 파일만 — 심볼릭 링크를 따라간 실제 자리로 본다
export async function resolveInside(root, rel) {
  if (!rel || typeof rel !== 'string') return { ok: false, reason: 'empty' }
  if (rel.includes('\0')) return { ok: false, reason: 'nul' }

  const abs = path.resolve(root, rel)
  let realRoot
  let realAbs
  try {
    realRoot = await fs.realpath(root)
  } catch {
    return { ok: false, reason: 'no-root' }
  }
  try {
    realAbs = await fs.realpath(abs)
  } catch {
    // 없는 파일: 순회만 검사하고 없음으로 답한다
    const inside = isInside(realRoot, abs)
    return { ok: false, reason: inside ? 'missing' : 'outside' }
  }
  if (!isInside(realRoot, realAbs)) return { ok: false, reason: 'outside', resolved: realAbs }
  return { ok: true, abs: realAbs }
}

function isInside(root, target) {
  const r = path.resolve(root)
  const t = path.resolve(target)
  return t === r || t.startsWith(r + path.sep)
}
