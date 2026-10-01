// 관리 문서를 가리키는 자리 — 관리문서 정리 검토 v0.1 §4.4.
//
// 문서 하나를 지우면 그 문서를 가리키던 자리가 남는다 — 형제 문서의 「여기 적지 않는 것 → 어디로」 표 · `README.md`
// 목록 행(링크) · `_vocab.md` 판정표 · `관리번호.md`. dpms 40종 사이에 239곳이고 대부분 **백틱 안의 이름**이다
// (`` `데이터이관정의서` `` · `` `TE_202` ``). 이 파일이 그 자리를 찾는다 — `save` 의 drop 거절 · `check` 의 끊긴 참조 경고 ·
// 사용 현황의 들어오는 참조 수가 같은 함수를 쓴다(불변조건 1).
//
// 문서의 **열쇠 셋** — 경로 · 관리번호(`TE_202`) · 이름(`성능테스트시나리오` = 파일 이름에서 번호를 뗀 것).
// 센다: 마크다운 링크 대상이 그 경로 · 백틱 안이 열쇠와 같거나 열쇠 + 공백으로 시작.
// 안 센다: 생성 블록 · 머리 표 `등록부` 칸 · 등록부 규칙 행(drop 이 같이 닫는다) · `work/`(불변) · 코드 펜스 안.
// 백틱 밖 산문의 이름은 지울 문서에 한해 `prose` 로 — 거절 사유는 아니고 사람이 보라고.
//
// **순수하다** — 글을 받아 자리를 낸다. 고치는 것은 `edits` 로 들어온 것만이다(`suggestEdit` 은 그 초안).

import { outsideFences } from './managed.js'
import { repoPath } from './repopath.js'
import { blockRange, headRow, registryRowLines } from './regen.js'
import { TOOL_FILES } from './toollayer.js'

const NL = '\n'
const lc = (s) => String(s).toLowerCase()
const bare = (l) => String(l).replace(/\r$/, '')

// 「지운 관리 문서」 표 — `drop` 이 남기는 원본 기록(검토 §4.7). 규칙 행이 아니다(첫 칸에 콜론이 없다)
export const DROPPED_HEAD = '## 지운 관리 문서'

// 파일 이름 앞의 관리번호 — `BM_411_회의록.md` → `BM_411`. 사람이 부르는 이름이 그것이다
export function docNo(p) {
  const m = String(p).split('/').pop().match(/^([A-Za-z]{1,6}[_-]\d{1,5})(?=[_ -])/)
  return m ? m[1] : null
}

export function docKeys(p) {
  const stem = String(p).split('/').pop().replace(/\.md$/i, '')
  const no = docNo(p)
  const name = no ? stem.slice(no.length).replace(/^[_ -]+/, '') : stem
  return { path: p, no, stem, name: name.length >= 2 ? name : null }
}

// 참조를 찾는 파일 — 관리 문서 · 어휘 · 등록부 · 뿌리의 md(도구 층 · 생성물 제외). `work/` 는 넣지 않는다
const ROOT_SKIP = new Set([...TOOL_FILES.filter((f) => !f.includes('/')), 'INDEX.md', 'INDEX-by-coord.md'].map(lc))
export function isRefFile(rel) {
  const v = String(rel)
  if (!/\.md$/i.test(v)) return false
  if (v === '_vocab.md' || v === '_managed.md') return true
  if (/^docs\//.test(v)) return true
  return !v.includes('/') && !ROOT_SKIP.has(lc(v))
}

// 열쇠 → 문서 경로. 같은 이름이 둘이면 그 이름은 열쇠로 쓰지 않는다(어느 쪽인지 모른다)
export function keyIndex(paths) {
  const m = new Map()
  const dup = new Set()
  const put = (k, p) => {
    if (!k) return
    const key = lc(k)
    if (m.has(key) && m.get(key) !== p) dup.add(key)
    else m.set(key, p)
  }
  for (const p of paths) {
    const k = docKeys(p)
    put(p, p)
    put(k.no, p)
    put(k.stem, p)
    put(k.name, p)
  }
  for (const k of dup) m.delete(k)
  return m
}

// 그 파일에서 세지 않는 줄(0부터) — 기계가 닫는 자리 · 기록
function skipLines(rel, lines) {
  const out = new Set()
  if (rel === '_vocab.md') {
    const b = blockRange(lines)
    if (b) for (let i = b.open; i <= b.close; i++) out.add(i)
  } else if (rel === '_managed.md') {
    for (const i of registryRowLines(lines.join(NL))) out.add(i)
    let inDropped = false
    for (let i = 0; i < lines.length; i++) {
      const l = bare(lines[i])
      if (/^##\s/.test(l)) inDropped = l.trim() === DROPPED_HEAD
      if (inDropped) out.add(i)
    }
  } else if (/^docs\//.test(rel)) {
    const h = headRow(lines)
    if (h) out.add(h.line)
  }
  return out
}

const RE_LINK = /\[([^\]\n]*)\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g
const RE_CODE = /`([^`\n]+)`/g

// 한 줄이 가리키는 문서들 — [{ path, kind }]
function lineHits(rel, line, keys) {
  const hits = []
  for (const m of line.matchAll(RE_LINK)) {
    const r = repoPath(rel, m[2])
    if (!r || r.outside) continue
    const p = keys.get(lc(r.path))
    if (p) hits.push({ path: p, kind: 'link' })
  }
  for (const m of line.matchAll(RE_CODE)) {
    const c = m[1].trim()
    let p = keys.get(lc(c))
    if (!p) {
      const head = c.split(/\s+/)[0]
      if (head !== c) p = keys.get(lc(head))
    }
    if (p) hits.push({ path: p, kind: 'code' })
  }
  return hits
}

/**
 * 모든 관리 문서에 대해 들어오는 참조를 센다(사용 현황) — 링크 · 백틱만.
 * @param texts  Map<rel, text> — 찾을 파일들(`isRefFile` 로 거른 것 · 원하면 work/ 도)
 * @param paths  관리 문서 경로 전부
 * @returns Map<path, { files: Set<rel>, count }>
 */
export function countRefs(texts, paths) {
  const keys = keyIndex(paths)
  const out = new Map(paths.map((p) => [p, { files: new Set(), count: 0 }]))
  for (const [rel, text] of texts) {
    const lines = String(text).split(NL)
    const skip = skipLines(rel, lines)
    for (const [i, raw] of outsideFences(lines.map(bare))) {
      if (skip.has(i)) continue
      for (const h of lineHits(rel, raw, keys)) {
        if (lc(h.path) === lc(rel)) continue
        const o = out.get(h.path)
        o.files.add(rel)
        o.count++
      }
    }
  }
  return out
}

const RANK = { link: 3, code: 2, prose: 1 }

/**
 * 지울 문서들(`targets`)을 가리키는 줄.
 * @param texts    Map<rel, text> — 찾을 파일들. 지울 문서 자신은 빼고 본다
 * @param targets  지울 문서 경로들
 * @param paths    관리 문서 경로 전부(남는 문서의 열쇠로 「행에 다른 문서도 있나」 를 본다)
 * @returns [{ file, line(1부터), text, docs: [path], kind, suggest }]
 *   suggest — `drop-row`(표 행이 지울 문서만 가리킨다) · `unlink`(링크 — 글자만 남긴다) · `review`(사람이)
 */
export function findDocRefs({ texts, targets, paths }) {
  const keys = keyIndex([...new Set([...paths, ...targets])])
  const tset = new Set(targets.map(lc))
  const names = targets.map((t) => ({ path: t, name: docKeys(t).name })).filter((x) => x.name && x.name.length >= 3)
  const out = []
  for (const [rel, text] of texts) {
    if (tset.has(lc(rel))) continue
    const lines = String(text).split(NL)
    const skip = skipLines(rel, lines)
    for (const [i, raw] of outsideFences(lines.map(bare))) {
      if (skip.has(i)) continue
      const hits = lineHits(rel, raw, keys)
      const mine = hits.filter((h) => tset.has(lc(h.path)))
      let kind = null
      const docs = new Set(mine.map((h) => h.path))
      for (const h of mine) if (!kind || RANK[h.kind] > RANK[kind]) kind = h.kind
      if (!mine.length) {
        // 백틱 · 링크가 없는 줄의 산문 이름 — 지울 문서에 한해
        const stripped = raw.replace(RE_CODE, ' ').replace(RE_LINK, ' ')
        for (const n of names) {
          if (stripped.includes(n.name)) {
            docs.add(n.path)
            kind = 'prose'
          }
        }
      }
      if (!docs.size) continue
      const others = hits.some((h) => !tset.has(lc(h.path)))
      const row = /^\s*\|.*\|\s*$/.test(raw) && !/^\s*\|[\s:|-]+\|\s*$/.test(raw)
      const suggest = kind === 'prose' ? 'review' : row && !others ? 'drop-row' : kind === 'link' ? 'unlink' : 'review'
      out.push({ file: rel, line: i + 1, text: raw.trim().slice(0, 240), docs: [...docs], kind, suggest })
    }
  }
  return out.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line)
}

// 사람에게 보일 한 줄 — 거절 문구 · 경고
export const refLabel = (r) => `${r.file}:${r.line}`

/**
 * 제안을 `edits` 한 건으로 — 화면 · `ctx docs drop --apply-suggest` · 에이전트 초안이 같은 것을 쓴다.
 * `old` 는 한 번만 나와야 한다(edits 규칙) — 줄이 둘 이상이면 앞 줄을 붙인다.
 * @returns { file, old, new } | null  (`review` 는 null)
 */
export function suggestEdit(text, ref, targets) {
  if (ref.suggest !== 'drop-row' && ref.suggest !== 'unlink') return null
  const src = String(text)
  const nl = src.includes('\r\n') ? '\r\n' : '\n'
  const lines = src.split(/\r?\n/)
  const i = ref.line - 1
  const line = lines[i]
  if (line == null) return null
  const occurs = (s) => src.split(s).length - 1
  if (ref.suggest === 'drop-row') {
    // 지운 줄 · 앞 줄을 같이 쥐어 한 번만 나오게 — 줄 끝 개행까지 지운다
    if (i + 1 < lines.length) {
      const old = line + nl
      if (occurs(old) === 1) return { file: ref.file, old, new: '' }
      if (i > 0) return { file: ref.file, old: lines[i - 1] + nl + line + nl, new: lines[i - 1] + nl }
      return null
    }
    const old = nl + line
    return occurs(old) === 1 ? { file: ref.file, old, new: '' } : null
  }
  // unlink — 지울 문서를 가리키는 링크만 글자로
  const tset = new Set(targets.map(lc))
  const next = line.replace(RE_LINK, (all, label, href) => {
    const r = repoPath(ref.file, href)
    return r && !r.outside && tset.has(lc(r.path)) ? label : all
  })
  if (next === line) return null
  if (occurs(line) === 1) return { file: ref.file, old: line, new: next }
  if (i > 0) return { file: ref.file, old: lines[i - 1] + nl + line, new: lines[i - 1] + nl + next }
  return null
}

// 「지운 관리 문서」 표 — [{ doc, work, reason }]. `doc-ref-dangling` 이 지운 이름을 아는 근거다
export function droppedDocs(managedText) {
  const out = []
  let on = false
  for (const raw of String(managedText || '').split(NL)) {
    const l = bare(raw)
    if (/^##\s/.test(l)) on = l.trim() === DROPPED_HEAD
    if (!on) continue
    const m = l.match(/^\s*\|\s*`([^`]+\.md)`\s*\|\s*`?([^`|]*)`?\s*\|\s*([^|]*)\|/i)
    if (m) out.push({ doc: m[1], work: m[2].trim(), reason: m[3].trim() })
  }
  return out
}

/**
 * 끊긴 참조 — 레포에 없는 관리 문서 · 뿌리 md 를 가리키는 링크 · 지운 문서(「지운 관리 문서」 표)의 이름 · 번호를 쓴 백틱.
 * `work/` 를 가리키는 링크는 보지 않는다(패키지 예시가 없는 작업 기록을 가리킨다 — 예시 정리가 맡는다).
 * @param texts  Map<rel, text> — bodies 전부(여기서 `isRefFile` 로 거른다)
 * @param exists (rel) => boolean
 */
export function danglingRefs({ texts, exists, managedText }) {
  const out = []
  const gone = droppedDocs(managedText).map((d) => d.doc).filter((p) => !exists(p))
  const goneKeys = keyIndex(gone)
  for (const [rel, text] of texts) {
    if (!isRefFile(rel)) continue
    const lines = String(text).split(NL)
    const skip = skipLines(rel, lines)
    for (const [i, raw] of outsideFences(lines.map(bare))) {
      if (skip.has(i)) continue
      const why = []
      for (const m of raw.matchAll(RE_LINK)) {
        const r = repoPath(rel, m[2])
        if (!r || r.outside || !/\.md$/i.test(r.path) || /^work\//.test(r.path)) continue
        if (!exists(r.path)) why.push(r.path)
      }
      if (gone.length) for (const h of lineHits(rel, raw, goneKeys)) if (!why.includes(h.path)) why.push(h.path)
      if (why.length) out.push({ file: rel, line: i + 1, text: raw.trim().slice(0, 160), docs: why })
    }
  }
  return out
}
