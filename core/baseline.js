// 기준선 블록 — 섹션 안에서 **기계가 쓰는 자리**. v1.0 개편안 §3.2 · V3.
//
// 관리 문서의 원천은 셋이다 — 작업 기록(사건 · 결정) · 큐레이터의 판단(정본 · 현재형) · 추출(코드 · DB · 매뉴얼에서
// 기계로). gdi 는 셋째를 제품 밖 생성기(`gdi_wiki_gen`)로 해 왔고, 「작업 기록이 쓴 섹션(applied ≠ null)은 덮지 않는다」
// 는 규칙을 생성기가 스스로 지켰다. 그 규칙을 **블록 경계 하나**로 바꾼다:
//
//   ## sy_user_info — 사용자정보
//   <!-- applied: … -->
//
//   (큐레이터의 서술)
//
//   <!-- cdp:baseline src="개발 DB pg_catalog" asof="2026-10-04" -->
//   | 컬럼 | 타입 | … |              ← 기준선 save 만 갈아 끼운다(통째로 · 멱등)
//   <!-- /cdp:baseline -->
//
//   **경과**                           ← 블록은 경과 목록 앞에 둔다
//
// 큐레이션 save 는 블록 안을 못 고치고(본문에 표지를 넣으면 거절), 기준선 save 는 블록 밖을 못 고친다. 각자 자기 자리만.
// 여기 있는 것은 **순수 함수**다.

const NL = '\n'
export const OPEN_RE = /^\s*<!--\s*cdp:baseline\b([^>]*?)-->\s*$/
export const CLOSE_RE = /^\s*<!--\s*\/cdp:baseline\s*-->\s*$/
export const MARK = '<!-- cdp:baseline'

function attrsOf(s) {
  const out = {}
  for (const m of String(s || '').matchAll(/(\w+)="([^"]*)"/g)) out[m[1]] = m[2]
  return out
}

const q = (v) => String(v ?? '').replace(/"/g, "'").replace(/--+/g, '—').replace(/[\r\n]+/g, ' ').trim()

// 블록 글 — 여는 표지 · 본문 · 닫는 표지
export function renderBlock({ src = null, asof = null, body }) {
  const attrs = [src ? `src="${q(src)}"` : null, asof ? `asof="${q(asof)}"` : null].filter(Boolean).join(' ')
  return [`<!-- cdp:baseline${attrs ? ' ' + attrs : ''} -->`, String(body ?? '').replace(/\s+$/, ''), '<!-- /cdp:baseline -->'].join(NL)
}

// 섹션 본문(헤딩 · applied 를 뺀 것)을 큐레이터의 글과 블록으로 가른다. 블록이 둘이면 앞의 것만 블록이다(뒤는 글로 남아 check 가 본다)
export function splitBaseline(content) {
  const lines = String(content ?? '').split(NL)
  const at = lines.findIndex((l) => OPEN_RE.test(l))
  if (at < 0) return { curated: String(content ?? ''), block: null }
  let end = -1
  for (let i = at + 1; i < lines.length; i++) {
    if (CLOSE_RE.test(lines[i])) {
      end = i
      break
    }
  }
  if (end < 0) return { curated: String(content ?? ''), block: null, broken: true }
  const head = OPEN_RE.exec(lines[at])
  const a = attrsOf(head[1])
  const block = { src: a.src ?? null, asof: a.asof ?? null, body: lines.slice(at + 1, end).join(NL), text: lines.slice(at, end + 1).join(NL) }
  const rest = [...lines.slice(0, at), ...lines.slice(end + 1)]
  // 블록이 빠진 자리의 빈 줄 겹침을 하나로
  const curated = rest.join(NL).replace(/\n{3,}/g, '\n\n').replace(/^\s+$/, '')
  return { curated: curated.replace(/\s+$/, ''), block }
}

// 큐레이터의 글에 블록을 다시 붙인다 — `**경과**` 줄이 있으면 그 앞, 없으면 끝
export function joinBaseline(curated, blockText) {
  const text = String(curated ?? '').replace(/\s+$/, '')
  if (!blockText) return text
  const lines = text ? text.split(NL) : []
  const at = lines.findIndex((l) => /^\s*\*\*경과\*\*/.test(l))
  if (at < 0) return [text, blockText].filter(Boolean).join(NL + NL)
  const before = lines.slice(0, at).join(NL).replace(/\s+$/, '')
  const after = lines.slice(at).join(NL)
  return [before, blockText, after].filter(Boolean).join(NL + NL)
}

// 본문에 블록 표지가 있나 — 큐레이션 save 가 블록을 건드리려는 것을 거른다
export const hasMark = (s) => /<!--\s*\/?cdp:baseline\b/.test(String(s ?? ''))
