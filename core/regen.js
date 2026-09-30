// 등록부의 **사본을 원본에서 찍는다** — 등록부 사본 · 모순 검토 v0.1 ㉠ ㉡.
//
// 패키지는 등록부(`_managed.md`)의 매핑을 손으로 더 적어 두었다 — 문서마다 머리 표의 `등록부` 칸, `_vocab.md`
// 의 타입 목록 · 개수. 서버가 등록부 행을 더하는 순간 그 사본이 거짓이 되고(서버형 레포에서 `회의록:*` 을
// 더했는데 `BM_411` 은 「비대상」), save 로는 고칠 길이 없었다. 「매핑이 두 곳에 있으면 반드시 어긋난다」 를
// 레포가 스스로 어겼다.
//
// 그래서 두 가지를 **생성물**로 한다(X1 · X3). 여기 있는 것은 전부 **순수 함수**다 — 글을 받아 글을 낸다.
// 쓰는 것은 부르는 쪽(`save` 의 `Snap` · `ctx index`)이고, `check` 는 같은 함수로 어긋남을 본다(판정은 한 곳).
//
//   머리 표 칸     문서 머리말(첫 `##` 앞) 표의 `| 등록부 | … |` 줄. 표식이 따로 없다 — 패키지 40 문서가 이미 한 모양이다
//   생성 블록      `_vocab.md` 의 `<!-- cdp:registry -->` … `<!-- /cdp:registry -->`. 표식이 있을 때만 채운다
//
// 생성하지 않는 문구(본문 산문)는 `proseConflicts` 가 **어림으로** 찾는다(X7) — 등록부를 바꿀 때 save 가 막고,
// `check` 는 경고로 말한다.

import { outsideFences, parseRegistry } from './managed.js'

const NL = '\n'
const lc = (s) => String(s).toLowerCase()
const bare = (l) => String(l).replace(/\r$/, '')

export const BLOCK_OPEN = '<!-- cdp:registry -->'
export const BLOCK_CLOSE = '<!-- /cdp:registry -->'
const BLOCK_NOTE = '<!-- 자동 생성 — _managed.md 에서 찍는다. 손으로 고치지 않는다 (save · ctx index 가 다시 쓴다) -->'

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

// 칸을 **뜻으로** 읽는다(X2) — 「비대상」 이면 off, 아니면 `패턴 → 앵커` 짝의 집합.
export function readCell(cell) {
  const c = String(cell || '')
  if (/비대상/.test(c)) return { off: true, set: new Set() }
  const set = new Set()
  for (const m of c.matchAll(/`([^`\s]+:[^`\s]*)`\s*→\s*(?:`(#{1,6})\s*\{값\}`|(—))/g)) set.add(m[1] + '|' + (m[3] ? 0 : m[2].length))
  // 짝을 못 읽었으면 백틱 패턴만 — 레벨은 모른다(글씨 모양이 다른 옛 칸)
  if (!set.size) for (const m of c.matchAll(/`([^`\s]+:[^`\s]+)`/g)) set.add(m[1] + '|?')
  return { off: false, set }
}

const rulesFor = (registry, doc) => (registry?.rules || []).filter((r) => lc(r.doc) === lc(doc))
const anchorOf = (r) => (r.whole ? '—' : '`' + '#'.repeat(r.level) + ' {값}`')

export function renderCell(rules) {
  if (!rules.length) return '**비대상**'
  return rules.map((r) => '`' + r.pattern + '` → ' + anchorOf(r)).join(' · ')
}

// 칸이 행과 뜻이 같은가
function cellAgrees(cell, rules) {
  const got = readCell(cell)
  if (!rules.length) return got.off
  if (got.off) return false
  const want = new Set(rules.map((r) => r.pattern + '|' + (r.whole ? 0 : r.level)))
  const loose = [...got.set].every((k) => k.endsWith('|?'))
  if (loose) return got.set.size === want.size && rules.every((r) => got.set.has(r.pattern + '|?'))
  return got.set.size === want.size && [...want].every((k) => got.set.has(k))
}

// 한 문서의 글 → 머리 표를 맞춘 글(바뀔 것이 없으면 null)
export function fixHead(text, rules) {
  const lines = String(text).split(NL)
  const h = headRow(lines)
  if (!h || cellAgrees(h.cell, rules)) return null
  const cr = lines[h.line].endsWith('\r') ? '\r' : ''
  const parts = bare(lines[h.line]).split('|')
  // | 등록부 | 칸 |  → ['', ' 등록부 ', ' 칸 ', '']
  parts[2] = ' ' + renderCell(rules) + ' '
  lines[h.line] = parts.slice(0, 3).join('|') + '|' + cr
  return { text: lines.join(NL), line: h.line + 1, from: h.cell, to: renderCell(rules) }
}

// ── `_vocab.md` 생성 블록 ────────────────────────────────────────────────────

export function blockRange(lines) {
  let open = -1
  for (const [i, l] of outsideFences(lines.map(bare))) {
    if (l.trim() === BLOCK_OPEN && open < 0) open = i
    else if (l.trim() === BLOCK_CLOSE && open >= 0) return { open, close: i }
  }
  return null
}

export function renderBlock(registry, vocab) {
  const rules = registry?.rules || []
  const out = [BLOCK_OPEN, BLOCK_NOTE, '']
  if (rules.length) {
    out.push('| 타입 | 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|---|')
    for (const r of rules) out.push(`| \`${r.pattern.slice(0, r.pattern.indexOf(':'))}\` | \`${r.pattern}\` | \`${r.doc}\` | ${anchorOf(r)} |`)
  } else out.push('등록부에 행이 없다 — 관리 문서로 파생되는 타입이 없다.')
  const regTypes = new Set(rules.map((r) => r.pattern.slice(0, r.pattern.indexOf(':'))))
  const rest = (vocab?.types || []).filter((t) => !regTypes.has(t))
  out.push('', rest.length ? `**등록부에 없는 타입** — ${rest.map((t) => '`' + t + '`').join(' · ')}. 파생할 관리 문서가 없고 작업 기록이 원천이다.` : '**등록부에 없는 타입** — 없다.', BLOCK_CLOSE)
  return out
}

// `_vocab.md` 의 글 → 블록을 채운 글(표식이 없거나 같으면 null)
export function fixBlock(text, registry, vocab) {
  const lines = String(text).split(NL)
  const b = blockRange(lines)
  if (!b) return null
  const cr = lines[b.open].endsWith('\r') ? '\r' : ''
  const next = renderBlock(registry, vocab).map((l) => l + cr)
  const cur = lines.slice(b.open, b.close + 1)
  if (cur.length === next.length && cur.every((l, i) => l === next[i])) return null
  lines.splice(b.open, b.close - b.open + 1, ...next)
  return { text: lines.join(NL) }
}

// ── 한 번에 ─────────────────────────────────────────────────────────────────

/**
 * @param registry  parseRegistry 결과(새 등록부)
 * @param vocab     parseVocab 결과
 * @param docs      Map<rel, text> — docs/ 아래 관리 문서 원문
 * @param vocabText `_vocab.md` 원문(없으면 null)
 * @returns { files: Map<rel, text>, heads: [{ path, line, from, to }], block: bool }
 */
export function regenerate({ registry, vocab, docs, vocabText = null }) {
  const files = new Map()
  const heads = []
  for (const [rel, text] of docs) {
    const f = fixHead(text, rulesFor(registry, rel))
    if (f) {
      files.set(rel, f.text)
      heads.push({ path: rel, line: f.line, from: f.from, to: f.to })
    }
  }
  let block = false
  if (vocabText != null) {
    const f = fixBlock(vocabText, registry, vocab)
    if (f) {
      files.set('_vocab.md', f.text)
      block = true
    }
  }
  return { files, heads, block }
}

// `check` 가 쓴다 — 뜻이 다른 머리 칸 · 낡은 블록(X6)
export function lintGenerated({ registry, vocab, docs, vocabText = null }) {
  const out = []
  for (const [rel, text] of docs) {
    const lines = String(text).split(NL)
    const h = headRow(lines)
    if (!h) continue
    const rules = rulesFor(registry, rel)
    if (!cellAgrees(h.cell, rules)) out.push({ path: rel, detail: `${rel}:${h.line + 1} 머리 표 등록부 칸이 「${h.cell.slice(0, 60)}」 인데 등록부는 ${rules.length ? renderCell(rules) : '비대상(행 없음)'}` })
  }
  if (vocabText != null && fixBlock(vocabText, registry, vocab)) out.push({ path: '_vocab.md', detail: '_vocab.md 생성 블록(cdp:registry)이 등록부와 다르다' })
  return out
}

// ── 생성하지 않는 문구 — 어림 (X7) ─────────────────────────────────────────

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

const RE_OFF = /비대상|대상이 아니|1\s*:\s*1\s*로?\s*대응하지 않|등록부에\s*(?:없|안\s*걸|들지 않)/
// 그 타입 표기 뒤 **같은 문장**에서 타입 · 좌표를 부정하는가 — 「`시스템아키텍처:` 넷만 예시가 아니다」 는 아니다
const RE_NEG = /(?:타입|좌표)\s*(?:이|가|은|는)?\s*(?:없|아니)|비대상|등록부에\s*없/
const RE_COUNT = /\d+\s*개가\s*전부|\d+\s*종이\s*전부|[—–-]\s*\d+\s*종\s*$/

/**
 * 새 등록부 행과 어긋나는 산문을 찾는다.
 * @param adds   [{ type, doc }] — 이번에 더한 행
 * @param texts  (rel) => 원문 | null — `edits` 를 적용한 **뒤**의 글
 * @param counts 개수 주장까지 볼지(add 순간만 — check 는 끈다 · X9)
 * @returns [{ file, line(1부터), text, why }]
 */
export function proseConflicts({ adds, texts, counts = true }) {
  const out = []
  const seen = new Set()
  const hit = (file, i, text, why) => {
    const k = file + ':' + (i + 1)
    if (seen.has(k)) {
      const o = out.find((x) => x.file === file && x.line === i + 1)
      if (o && !o.why.includes(why)) o.why += ' · ' + why
      return
    }
    seen.add(k)
    out.push({ file, line: i + 1, text: bare(text).trim().slice(0, 200), why })
  }

  for (const { type, doc } of adds) {
    // ① 대상 문서 머리말 — 머리 표 등록부 칸은 생성물이라 뺀다
    const dt = texts(doc)
    if (dt != null) {
      const lines = dt.split(NL)
      const end = preambleEnd(lines)
      const h = headRow(lines)
      for (let i = 0; i < end; i++) {
        if (h && i === h.line) continue
        if (RE_OFF.test(bare(lines[i]))) hit(doc, i, lines[i], `${doc} 가 등록부 비대상이라고 적혀 있다`)
      }
    }
    // ② `_vocab.md` · `_managed.md` 산문 — 그 타입을 부정하는 줄
    for (const file of ['_vocab.md', '_managed.md']) {
      const t = texts(file)
      if (t == null) continue
      const lines = t.split(NL)
      const skip = file === '_vocab.md' ? vocabStructLines(lines) : registryRowLines(t)
      const b = blockRange(lines)
      for (const [i, l] of outsideFences(lines.map(bare))) {
        if (skip.has(i) || (b && i >= b.open && i <= b.close)) continue
        for (const tok of ['`' + type + ':`', '`' + type + ':*`']) {
          const at = l.indexOf(tok)
          if (at >= 0 && RE_NEG.test(l.slice(at).split(/[.。|]/)[0])) hit(file, i, l, `\`${type}:\` 타입이 없다고 적혀 있다`)
        }
        if (counts && RE_COUNT.test(l)) hit(file, i, l, '개수를 적어 둔 줄이다 — 등록부가 바뀌면 틀린다')
      }
    }
  }
  return out
}

// `check` 용 — 등록부의 지금 행 전부를 본다(개수 주장은 빼고 · X9)
export function proseLint({ registry, texts }) {
  const adds = []
  const seen = new Set()
  for (const r of registry?.rules || []) {
    const type = r.pattern.slice(0, r.pattern.indexOf(':'))
    const k = type + '|' + lc(r.doc)
    if (seen.has(k)) continue
    seen.add(k)
    adds.push({ type, doc: r.doc })
  }
  return proseConflicts({ adds, texts, counts: false })
}
