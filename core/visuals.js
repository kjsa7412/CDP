// HTML 시각 자료 — 문서가 가진 자료를 모으고(V1) · 이름(`<title>`)을 읽고(V2) · 부르는 외부 자원을 가린다(W3).
// HTML 시각 자료 검토 v0.1. **파일을 읽지 않는 순수 함수**다 — 읽기는 부르는 쪽(store · save)이 한다.
//
// 자료는 문서가 아니다. 첨부(`work/assets/<id>/x.html`)이고, 화면은 그것을 sandbox 틀로 연다(`HTML_CSP`).
// 지식(요지 · 결정 · 확인 목록)은 그것을 가리키는 md 가 맡는다.

import { repoPath, mdRefs } from './repopath.js'
import { HTML_CDN, HTML_FONT_HOSTS } from './assets.js'

export const isVisualPath = (p) => /\.html?$/i.test(String(p || ''))

/**
 * 문서가 가진 자료 — 프론트매터 `attachments` 먼저, 다음 본문의 상대 링크(코드 블록 안은 뺀다). 레포 안 · 순서 유지 · 중복 없음.
 * 관리 문서에는 `attachments` 가 없다 — 섹션이 `../work/assets/…html` 을 가리킬 뿐이라 본문 링크가 필요하다
 * @returns {string[]} 레포 루트 기준 경로
 */
export function visualRefs(docPath, body, attachments = []) {
  const out = []
  const seen = new Set()
  const add = (href) => {
    const r = repoPath(docPath, href)
    if (!r || r.outside || !isVisualPath(r.path)) return
    const k = r.path.toLowerCase()
    if (seen.has(k)) return
    seen.add(k)
    out.push(r.path)
  }
  for (const a of attachments || []) add(String(a))
  for (const ref of mdRefs(body || '')) if (!ref.image) add(ref.href)
  return out
}

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ', middot: '·', mdash: '—', ndash: '–' }

/** `<title>` — 앞 64 KB 에서. 없거나 비면 null */
export function htmlTitle(text) {
  const m = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(String(text || '').slice(0, 64 * 1024))
  if (!m) return null
  const t = m[1]
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (all, e) => {
      if (e[0] === '#') {
        const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
        return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : all
      }
      return ENT[e.toLowerCase()] ?? all
    })
    .replace(/\s+/g, ' ')
    .trim()
  return t ? t.slice(0, 120) : null
}

/** 자료 이름 — `<title>`, 없으면 파일 이름에서 확장자를 뺀 것 */
export function visualTitle(p, text) {
  return htmlTitle(text) || String(p).split('/').pop().replace(/\.html?$/i, '')
}

/**
 * 부르는 외부 자원 — `src=` · `<link href=` · CSS `url(` · `@import`. 글꼴 호스트는 조용하다(닿지 않으면 다른 글꼴로 떨어진다).
 * @returns {{ cdn: string[], blocked: string[] }} cdn = 허용 CDN(폐쇄망에서 빌 수 있다) · blocked = CSP 가 막는 곳(어디서도 안 보인다)
 */
export function htmlExternal(text) {
  const s = String(text || '')
  const urls = []
  const take = (re) => {
    for (const m of s.matchAll(re)) urls.push(m[1])
  }
  take(/\bsrc\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)
  take(/<link\b[^>]*?\bhref\s*=\s*["']?((?:https?:)?\/\/[^"'\s>]+)/gi)
  take(/url\(\s*["']?((?:https?:)?\/\/[^"')\s]+)/gi)
  take(/@import\s+["']((?:https?:)?\/\/[^"']+)/gi)
  const cdn = new Set()
  const blocked = new Set()
  for (const u of urls) {
    let origin
    try {
      origin = new URL(u.startsWith('//') ? 'https:' + u : u).origin
    } catch {
      continue
    }
    const https = /^https:|^\/\//i.test(u)
    if (https && HTML_FONT_HOSTS.includes(origin)) continue
    if (https && HTML_CDN.includes(origin)) cdn.add(origin.replace(/^https:\/\//, ''))
    else blocked.add(u.length > 80 ? u.slice(0, 77) + '…' : u)
  }
  return { cdn: [...cdn], blocked: [...blocked] }
}

/** 본문의 글 길이 — 링크 · 그림 · 제목 표시 · 표 칸 · 공백을 뺀 것. 「요지가 있나」 를 재는 데만 쓴다 */
export function proseLength(md) {
  return String(md || '')
    .replace(/```[\s\S]*?```/g, '')
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[#>*_`|\-]/g, '')
    .replace(/\s+/g, '').length
}
