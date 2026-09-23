// 마크다운 렌더 — 클라이언트가 소유한다(설계서 §9).
// 서버는 원문 텍스트만 보낸다. 조판·테마·지연 로드·인쇄 스타일이 전부
// 클라이언트 관심사이므로 렌더를 서버로 옮기면 §8 의 층 분리가 무너진다.
//
// 합격 기준은 §27.1 — 설계서 v1.1 원문이 깨지지 않는 것.

import MarkdownIt from 'markdown-it'
import DOMPurify from 'dompurify'

let hljs = null
let hljsPending = null

// highlight.js 는 초기 번들에 넣지 않는다. 코드블록이 보이는 순간 동적 import.
async function loadHljs() {
  if (hljs) return hljs
  if (!hljsPending) {
    hljsPending = (async () => {
      const core = (await import('highlight.js/lib/core')).default
      const langs = await Promise.all([
        import('highlight.js/lib/languages/yaml'),
        import('highlight.js/lib/languages/bash'),
        import('highlight.js/lib/languages/json'),
        import('highlight.js/lib/languages/sql'),
        import('highlight.js/lib/languages/javascript'),
        import('highlight.js/lib/languages/typescript'),
        import('highlight.js/lib/languages/markdown'),
        import('highlight.js/lib/languages/xml'),
      ])
      const names = ['yaml', 'bash', 'json', 'sql', 'javascript', 'typescript', 'markdown', 'xml']
      names.forEach((n, i) => core.registerLanguage(n, langs[i].default))
      core.registerAliases(['yml'], { languageName: 'yaml' })
      core.registerAliases(['sh', 'shell', 'console'], { languageName: 'bash' })
      core.registerAliases(['js', 'jsx'], { languageName: 'javascript' })
      core.registerAliases(['ts', 'tsx'], { languageName: 'typescript' })
      core.registerAliases(['md'], { languageName: 'markdown' })
      core.registerAliases(['html'], { languageName: 'xml' })
      hljs = core
      return core
    })()
  }
  return hljsPending
}

const md = new MarkdownIt({
  html: false, // 살균 전에 애초에 raw HTML 을 통과시키지 않는다
  linkify: true,
  typographer: false, // 한글 문서에서 따옴표 치환이 오히려 방해된다
  breaks: false,
})

// 제목 앵커
md.renderer.rules.heading_open = (tokens, idx, options, env, self) => {
  const t = tokens[idx]
  if (t.tag === 'h2' || t.tag === 'h3') {
    const inline = tokens[idx + 1]
    const text = inline?.content || ''
    const slug = slugify(text)
    t.attrSet('id', slug)
    env.toc = env.toc || []
    env.toc.push({ level: Number(t.tag[1]), text, slug })
  }
  return self.renderToken(tokens, idx, options)
}

// GFM 작업목록 — `- [ ]` / `- [x]`. §27.1 합격 기준에 든다.
// markdown-it 기본에는 없다. 인라인 토큰 앞머리만 치환하는 최소 구현으로 둔다 —
// 뷰어는 읽기 전용이므로 체크박스는 표시만 하고 클릭을 받지 않는다.
md.core.ruler.after('inline', 'tasklist', (state) => {
  const toks = state.tokens
  for (let i = 0; i < toks.length; i++) {
    if (toks[i].type !== 'inline') continue
    const parent = toks[i - 1]
    if (!parent || parent.type !== 'paragraph_open') continue
    const li = toks[i - 2]
    if (!li || li.type !== 'list_item_open') continue
    const m = toks[i].content.match(/^\[([ xX])\]\s+/)
    if (!m) continue
    const done = m[1].toLowerCase() === 'x'
    toks[i].content = toks[i].content.slice(m[0].length)
    const kids = toks[i].children
    if (kids && kids[0] && kids[0].type === 'text') kids[0].content = kids[0].content.replace(/^\[([ xX])\]\s+/, '')
    li.attrJoin('class', done ? 'task task--done' : 'task')
    const box = new state.Token('html_inline', '', 0)
    box.content = `<span class="taskbox" aria-hidden="true">${done ? '✓' : ' '}</span>`
    kids.unshift(box)
  }
  return true
})

// 표는 자체 스크롤 컨테이너로 감싼다. 본문(body)은 절대 가로 스크롤되지
// 않고 넓은 요소만 각자 스크롤한다(§27.3).
md.renderer.rules.table_open = () => '<div class="tablewrap wide"><table>'
md.renderer.rules.table_close = () => '</table></div>'

md.renderer.rules.fence = (tokens, idx) => {
  const t = tokens[idx]
  const lang = (t.info || '').trim().split(/\s+/)[0]
  const code = t.content
  const cls = lang ? ` class="language-${escapeAttr(lang)}"` : ''
  return `<div class="codeblock wide"><pre><code${cls} data-lang="${escapeAttr(lang)}">${escapeHtml(
    code
  )}</code></pre><button class="codeblock__copy" data-copy>복사</button></div>`
}

// 렌더 결과를 **원문 그대로를 키로** 기억한다.
//
// 표 수백 개짜리 관리 문서 하나에 렌더 + 살균이 0.3초다(살균이 그 대부분).
// 뒤로 가기 · 그래프에서 돌아오기 · 같은 문서 다시 열기가 매번 그 값을 냈다.
// 원문이 키이므로 디스크에서 바뀐 문서는 저절로 새로 렌더된다.
const CACHE_MAX = 8
const cache = new Map()

export function renderMarkdown(text) {
  const src = text || ''
  const hit = cache.get(src)
  if (hit) {
    cache.delete(src)
    cache.set(src, hit) // 가장 최근으로
    return hit
  }
  const env = {}
  const raw = md.render(src, env)
  const html = DOMPurify.sanitize(raw, {
    ADD_ATTR: ['target', 'data-lang', 'data-copy', 'data-coord', 'data-alias', 'aria-hidden'],
    FORBID_TAGS: ['style', 'script', 'iframe', 'object', 'embed', 'form'],
  })
  const out = { html, toc: env.toc || [] }
  cache.set(src, out)
  if (cache.size > CACHE_MAX) cache.delete(cache.keys().next().value)
  return out
}

// 렌더 후처리 — 코드 하이라이팅, 내 좌표 강조, 좌표 링크화, 상대 링크 가로채기.
// DOM 을 직접 만지는 것은 markdown-it 플러그인으로 하면 규칙이 얽히기 때문이다.
export async function enhance(root, { myCoords = [], coordIndex = null, coordLinks = true, sectionStates = null } = {}) {
  if (!root) return

  // 1) 코드 하이라이팅 (코드블록이 있을 때만 로드)
  const codes = root.querySelectorAll('pre code[data-lang]')
  if (codes.length) {
    const langs = [...codes].map((c) => c.dataset.lang).filter(Boolean)
    if (langs.length) {
      const h = await loadHljs()
      for (const el of codes) {
        const lang = el.dataset.lang
        if (!lang || !h.getLanguage(lang)) continue
        try {
          el.innerHTML = h.highlight(el.textContent, { language: lang, ignoreIllegals: true }).value
        } catch {}
      }
    }
  }

  // 1.5) 관리 문서 섹션 — `applied` 주석을 감추고 **상태 배지**로 바꾼다.
  //
  // markdown-it 이 HTML 을 이스케이프하므로 `<!-- applied: … -->` 가 본문에
  // 글자로 그대로 나온다. 섹션 32개면 소음이 32줄이고, 정작 그것이 말하는 것
  // (이 섹션이 밀렸나)은 계산해야 나오므로 **주석 자체는 아무 값이 없다.**
  if (sectionStates) {
    const byValue = new Map(sectionStates.map((s) => [normValue(s.value), s]))

    // 주석 줄을 지운다
    for (const el of root.querySelectorAll('p')) {
      const t = (el.textContent || '').trim()
      if (/^<!--\s*applied\s*:.*-->$/.test(t)) el.remove()
    }

    // **섹션 머리에 상태 배지를 붙이지 않는다.**
    //
    // 밀림·미작성은 상태가 아니다. 파생이 필수이므로 섹션은 늘 최신이고,
    // 안 했으면 그것은 `ctx check` 가 커밋을 막는 오류다. 본문에 배지로
    // 그리면 없는 구분을 있는 것처럼 말하게 된다.
  }

  // 2) 내 좌표 강조 — **본문 전체**에서.
  //
  // v0.2 는 '누구에게 영향' 섹션 안에서만 찾았다. 그 섹션이 더 이상 보장되지
  // 않으므로(수행 v1.0 §13) 본문 전체를 본다. 오히려 이쪽이 맞다 — 내 좌표는
  // 영향 목록에만 나오는 것이 아니고, 왜를 설명하는 문단에 나올 때 더 중요하다.
  //
  // 강조만 하고 자동 스크롤은 하지 않는다. 본문의 주인은 본문이다(뷰어 §13-⓿).
  if (myCoords.length) {
    const hit = (txt) =>
      myCoords.some((c) => txt.includes(c) || (coordIndex?.aliasesOf(c) || []).some((a) => a && txt.includes(a)))
    for (const el of root.querySelectorAll('p, li, td, blockquote')) {
      if (el.closest('.mine')) continue // 중첩 강조를 겹치지 않는다
      if (hit(el.textContent || '')) el.classList.add('mine')
    }
  }

  // 3) 본문 산문의 좌표 링크화 — 정본은 링크, alias 는 옅은 밑줄만(§27.8)
  if (coordLinks && coordIndex) linkCoords(root, coordIndex)

  // 4) 코드 복사
  root.querySelectorAll('[data-copy]').forEach((btn) => {
    btn.onclick = () => {
      const code = btn.parentElement.querySelector('code')
      navigator.clipboard?.writeText(code?.textContent || '')
      btn.textContent = '복사됨'
      setTimeout(() => (btn.textContent = '복사'), 1200)
    }
  })
}

// 텍스트 노드만 훑어 좌표를 감싼다. 코드·링크·제목 안은 건드리지 않는다 —
// 산문을 링크로 도배하면 읽기가 망가진다.
function linkCoords(root, index) {
  const skip = new Set(['CODE', 'PRE', 'A', 'H1', 'H2', 'H3', 'H4'])
  // 요소도 같이 걷는다 — 건너뛸 요소에서 **가지째** 돌아선다.
  //
  // 전에는 글자 노드마다 부모를 뿌리까지 거슬러 올라가 확인했다. 표 수백 개짜리
  // 문서는 글자 노드가 3만 개를 넘고, 그 확인이 문서를 여는 시간의 한 몫이었다.
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, {
    acceptNode(n) {
      if (n.nodeType === 1) return skip.has(n.tagName) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_SKIP
      return n.nodeValue && n.nodeValue.trim().length > 1 ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT
    },
  })

  const targets = []
  let node
  while ((node = walker.nextNode())) targets.push(node)

  const re = index.regex
  if (!re) return

  for (const t of targets) {
    const text = t.nodeValue
    re.lastIndex = 0
    if (!re.test(text)) continue
    re.lastIndex = 0

    const frag = document.createDocumentFragment()
    let last = 0
    let m
    while ((m = re.exec(text))) {
      const hit = index.lookup(m[0])
      if (!hit) continue
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)))
      const span = document.createElement('span')
      span.className = hit.canonical ? 'coordlink' : 'aliashint'
      span.dataset.coord = hit.coord
      span.textContent = m[0]

      // **좌표에 상태 배지를 달지 않는다.** 붙일 상태가 없다.
      // 좌표는 눌러서 갈 수 있는 자리라는 것만 말한다.
      span.title = hit.canonical ? `좌표: ${hit.coord}` : `${m[0]} → ${hit.coord} (alias)`
      frag.appendChild(span)
      last = m.index + m[0].length
    }
    if (!frag.childNodes.length) continue
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)))
    t.parentNode.replaceChild(frag, t)
  }
}

// 좌표·alias 를 한 번에 찾는 정규식 인덱스
export function buildCoordIndex(tree) {
  if (!tree?.types?.length) return null
  const map = new Map()
  const words = []
  for (const ty of tree.types) {
    for (const c of ty.coords) {
      map.set(c.coord, { coord: c.coord, canonical: true, aliases: c.aliases, sec: c.sec || null, secCount: c.secCount || 0 })
      words.push(c.coord)
      for (const a of c.aliases || []) {
        if (a.length < 3) continue
        if (!map.has(a)) map.set(a, { coord: c.coord, canonical: false, sec: c.sec || null, secCount: c.secCount || 0 })
        words.push(a)
      }
    }
  }
  if (!words.length) return null
  words.sort((a, b) => b.length - a.length)
  const regex = new RegExp(words.map(escapeRe).join('|'), 'g')
  return {
    regex,
    lookup: (s) => map.get(s) || null,
    aliasesOf: (coord) => map.get(coord)?.aliases || [],
  }
}

const norm = (s) => String(s || '').replace(/\s+/g, '').trim()
const normValue = (s) => String(s || '').toLowerCase().replace(/[\s_·-]/g, '')
// 제목에서 등록부의 값만 떼어낸다 — "rp_plnd_chg_mst — 계획서변경마스터" → 앞쪽.
// **상태 배지(§1.5)와 섹션 이동이 같은 규칙을 써야 한다.** 갈라지면 배지는
// 붙는데 이동은 안 되는 섹션이 생긴다.
const headValue = (s) => String(s || '').trim().split(/\s+[—–-]\s+/)[0].trim()

// 섹션 값 → 제목 앵커(slug). 등록부가 가리키는 섹션으로 스크롤할 때 쓴다.
export function sectionSlug(toc, value) {
  const want = normValue(headValue(value))
  if (!want) return null
  return (toc || []).find((t) => normValue(headValue(t.text)) === want)?.slug || null
}
const slugify = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '')
    .replace(/\s+/g, '-')
    .slice(0, 60)
const escapeHtml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]))
const escapeAttr = (s) => String(s).replace(/[^\w-]/g, '')
const escapeRe = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
