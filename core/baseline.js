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

// ── 옛 문서에서 뽑기 — 다시 세운 레포로 대상형 섹션을 옮겨 온다(v1.0 §9.1) ─────────────────────────────────────
//
// 옛 레포의 테이블 · 코드 · 화면 섹션은 대개 **기록이 아니라 섹션에만** 있었다(dpms_wiki 의 GDI-CLEAN 기록: 「컬럼 정의는 각
// 테이블정의서 섹션」). 기록만 옮겨 다시 세우면 그 내용이 사라진다. 그것은 추출물이었으니 기준선 블록이 제자리다 — 옛 섹션의
// 글을 그대로 블록에 싣는다. 옛 반영 이력(`**변경**` · `**경과**` 와 그 목록)은 옛 기록 층의 것이라 뺀다.
//
//   r      옛 레포(loadRepo)
//   doc    옛 관리 문서 경로
//   sliceSection  core/tools.js 의 것(순환 import 를 피해 받는다)
// 돌려준다 — { items: [{ coord, heading, body }], rules: [{ pattern, anchor }], vocab: [{ coord, label, aliases }] }
export function extractFromDoc(r, doc, { sliceSection }) {
  const d = r.managedDocs.find((x) => x.path === doc)
  if (!d) return null
  const rules = (r.registry?.rules || []).filter((x) => x.doc.toLowerCase() === doc.toLowerCase() && !x.whole)
  const types = [...new Set(rules.map((x) => x.pattern.slice(0, x.pattern.indexOf(':'))))]
  const levels = new Set(rules.map((x) => x.level))
  const items = []
  const vocab = []
  for (const s of d.managedSections || []) {
    if (!levels.has(s.level)) continue
    const coord = types.map((t) => t + ':' + s.value).find((c) => r.vocab.coords.has(c) && !r.vocab.coords.get(c).example)
    if (!coord) continue
    const cut = sliceSection(r, coord)
    if (!cut || cut.missing) continue
    const body = stripHistory(splitBaseline(cut.content).curated)
    if (!body.trim()) continue
    items.push({ coord, heading: s.title, body })
    const e = r.vocab.coords.get(coord)
    vocab.push({ coord, label: e.label || s.title, ...(e.aliases?.length ? { aliases: e.aliases } : {}) })
  }
  return { items, rules: rules.map((x) => ({ pattern: x.pattern, anchor: '#'.repeat(x.level) + ' {값}' })), vocab }
}

// 옛 반영 이력 — `**변경**` · `**경과**` 머리와 그 아래 날짜 목록. 옛 문서는 `**신설** · 날짜 [기록](…)` · `**제기** · …`
// 한 줄도 썼다(dpms_wiki 의 사업분석 · gdi 의 이슈 대장) — 그 줄이 기준선 블록에 새면 옛 경로의 기록 링크가 따라온다
export function stripHistory(text) {
  const lines = String(text || '').split(NL)
  const out = []
  let inHist = false
  for (const l of lines) {
    if (/^\s*\*\*(신설|변경|경과|제기)\*\*/.test(l)) {
      inHist = true
      continue
    }
    if (inHist) {
      if (!l.trim() || /^\s*[-·*]\s/.test(l) || /^\s*·/.test(l)) continue
      inHist = false
    }
    out.push(l)
  }
  return out.join(NL).replace(/\n{3,}/g, '\n\n').replace(/\s+$/, '')
}
