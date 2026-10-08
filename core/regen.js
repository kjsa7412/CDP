// 옛 등록부 사본을 **읽는** 도우미 — v1.0 은 만들지 않는다(I9 · W4).
//
// v0.21 ~ v0.25 의 save 는 등록부(`_managed.md`)의 사본 둘을 찍었다 — 문서 머리 표의 `| 등록부 | … |` 칸과
// `_vocab.md` 의 `<!-- cdp:registry -->` … `<!-- /cdp:registry -->` 생성 블록. v1.0 은 그것을 만들지도 검사하지도
// 않는다(화면이 `_managed.md` 에서 그린다). 다만 이행 전의 옛 레포에는 그 줄이 남아 있으므로, 그것을 **문서
// 본문이나 산문으로 잘못 읽지 않게** 자리를 찾는 함수만 남긴다 — 참조 찾기(`docrefs`) · 사용 현황(`docusage`) ·
// 섹션 밖 고치기(`edits`)가 쓴다. 전부 순수 함수다.

import { outsideFences, parseRegistry } from './managed.js'

const bare = (l) => String(l).replace(/\r$/, '')

export const BLOCK_OPEN = '<!-- cdp:registry -->'
export const BLOCK_CLOSE = '<!-- /cdp:registry -->'

// ── 머리말 · 머리 표 ─────────────────────────────────────────────────────────

// 첫 `##`(레벨 2 이상) 헤딩의 줄 번호(0부터) — 그 앞이 머리말이다. 펜스 안은 세지 않는다.
export function preambleEnd(lines) {
  for (const [i, l] of outsideFences(lines.map(bare))) if (/^#{2,6}\s/.test(l)) return i
  return lines.length
}

// 머리말 표의 `| 등록부 | … |` 줄 — { line(0부터), cell } 또는 null
export function headRow(lines) {
  const end = preambleEnd(lines)
  for (const [i, raw] of outsideFences(lines.map(bare))) {
    if (i >= end) break
    const m = raw.match(/^\s*\|\s*(?:\*\*)?등록부(?:\*\*)?\s*\|(.*)\|\s*$/)
    if (m) return { line: i, cell: m[1].trim() }
  }
  return null
}

// ── `_vocab.md` 의 옛 생성 블록 ──────────────────────────────────────────────

export function blockRange(lines) {
  let open = -1
  for (const [i, l] of outsideFences(lines.map(bare))) {
    if (l.trim() === BLOCK_OPEN && open < 0) open = i
    else if (l.trim() === BLOCK_CLOSE && open >= 0) return { open, close: i }
  }
  return null
}

// `_vocab.md` 의 어휘 줄(항목 · 들여쓴 줄 · `excluded:` · 타입 머리) — 산문이 아니다
export function vocabStructLines(lines) {
  const s = new Set()
  let inItem = false
  for (let i = 0; i < lines.length; i++) {
    const l = bare(lines[i])
    const h2 = l.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      inItem = false
      if (/^[A-Za-z가-힣][A-Za-z0-9가-힣_-]*$/.test(h2[1].trim())) s.add(i)
      continue
    }
    if (/^\s*[-*]\s+`[^`]+`\s*(?:[—–-]\s*.*)?$/.test(l)) {
      s.add(i)
      inItem = true
      continue
    }
    if (/^excluded\s*:/i.test(l)) {
      s.add(i)
      continue
    }
    if (inItem && /^\s+\S/.test(l)) {
      s.add(i)
      continue
    }
    inItem = false
  }
  return s
}

// `_managed.md` 의 규칙 행
export function registryRowLines(text) {
  return new Set(parseRegistry(String(text).replace(/\r/g, '')).rules.map((r) => r.line - 1))
}
