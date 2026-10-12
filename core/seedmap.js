// 문서 레포에서 세우기 — 지도(`cdp-sources.json`) 읽기 · 검사 · 쪼개기 · 다듬기 · 링크. 문서레포 세우기 검토 v0.1 §2 · §3.
//
// **순수 함수다** — 파일 · git · 서버를 모른다. 글을 받아 글을 돌려준다. 읽기(git show · archive)와 쓰기(save)는
// `viewer/bin/ctx-seed.mjs` 가 한다. 그래야 seed apply · verify · follow · update 가 같은 쪼개기로 같은 좌표를 본다.
//
// 지도 —
//   { version: 1, root: "01. 산출물",
//     rules: { history: [정규식…], nestedLinks: true, skip: ["부록"] },
//     docs:    [{ key, src, doc, type | coord, split: "h2" | "whole" | "chapters", chapters?, preamble?, chapterAliases?,
//                 form?, title?, kind?, label?, aliases?, figs?, attach?, baseline? }],
//     records: [{ id, date, src | from, title?, touches: [좌표 | "@<doc key>"], attach?, attachDir? }],
//     alias:   { "<원천 경로>": "<기록 id>" },
//     ignore:  [{ src, why }],
//     intent:  { "<좌표>": "<위키와 다른 까닭>" },
//     target:  { server, repo } }   — 세울 지식 레포(명령의 --server · --repo 를 대신한다)

import path from 'node:path'

const NL = '\n'
export const SEED_FILE = 'cdp-sources.json'
// 옛 반영 이력 줄 — `**변경** · 날짜 …` · `· 날짜 [근거] …`. 섹션의 내용이 아니다(이관 기록 · 스냅샷이 출처다)
export const DEFAULT_HISTORY = ['^\\s*\\*\\*(신설|변경|경과|제기)\\*\\*\\s*·', '^\\s*·\\s*\\d{4}-\\d{2}-\\d{2}\\s*\\[']
const SPLITS = ['h2', 'whole', 'chapters']
const KINDS = ['대상', '대장', '정의', '사건', '서술']

class SeedError extends Error {
  constructor(message, detail = {}) {
    super(message)
    this.code = 'E_INPUT'
    this.detail = detail
  }
}

// ── 지도 모양 ────────────────────────────────────────────────────────────────

export function parseSeedMap(text) {
  let m
  try {
    m = JSON.parse(String(text).replace(/^﻿/, ''))
  } catch (e) {
    throw new SeedError(`${SEED_FILE} 를 JSON 으로 읽을 수 없다 — ${e.message}`)
  }
  return normalizeSeedMap(m)
}

export function normalizeSeedMap(m) {
  if (!m || typeof m !== 'object') throw new SeedError('지도는 객체다')
  if (m.version !== 1) throw new SeedError('지도의 version 은 1 이다', { field: 'version' })
  const root = String(m.root ?? '').replace(/\\/g, '/').replace(/\/+$/, '')
  const rules = { history: DEFAULT_HISTORY, nestedLinks: true, skip: ['부록'], ...(m.rules || {}) }
  const history = rules.history.map((s, i) => {
    try {
      return new RegExp(s)
    } catch (e) {
      throw new SeedError(`rules.history[${i}] 정규식이 틀렸다 — ${e.message}`, { field: `rules.history[${i}]` })
    }
  })
  const docs = (m.docs || []).map((d, i) => {
    const at = `docs[${i}]`
    for (const k of ['key', 'src', 'doc']) if (typeof d[k] !== 'string' || !d[k]) throw new SeedError(`${at}.${k} 가 없다`, { field: `${at}.${k}` })
    if (!/^docs\/.+\.md$/.test(d.doc)) throw new SeedError(`${at}.doc 은 docs/…md 다`, { field: `${at}.doc` })
    const split = d.split ?? (d.coord ? 'whole' : 'h2')
    if (!SPLITS.includes(split)) throw new SeedError(`${at}.split 은 ${SPLITS.join(' · ')} 중 하나다`, { field: `${at}.split` })
    if (split === 'whole' && !/^[^:\s]+:\S+$/.test(d.coord || '')) throw new SeedError(`${at}.coord(문서 전체 좌표 — 타입:값)가 없다`, { field: `${at}.coord` })
    if (split !== 'whole' && !/^[^:\s*]+$/.test(d.type || '')) throw new SeedError(`${at}.type(좌표 타입)이 없다`, { field: `${at}.type` })
    if (split === 'chapters' && !(Array.isArray(d.chapters) && d.chapters.length)) throw new SeedError(`${at}.chapters(장 번호 → 값)가 없다`, { field: `${at}.chapters` })
    if (d.kind != null && !KINDS.includes(d.kind)) throw new SeedError(`${at}.kind 는 ${KINDS.join(' · ')} 중 하나다`, { field: `${at}.kind` })
    if (d.baseline != null && split === 'whole') throw new SeedError(`${at} — 기준선은 문서 전체 좌표로 받지 않는다`, { field: `${at}.baseline` })
    return { ...d, split }
  })
  const records = (m.records || []).map((r, i) => {
    const at = `records[${i}]`
    if (typeof r.id !== 'string' || !/^\d{4}-\d{4}-\S+$/.test(r.id)) throw new SeedError(`${at}.id 는 YYYY-MMDD-<주제> 다`, { field: `${at}.id` })
    if (typeof r.date !== 'string' || !/^\d{4}-\d{2}-\d{2}( \d{2}:\d{2})?$/.test(r.date)) throw new SeedError(`${at}.date 는 YYYY-MM-DD[ HH:MM] 다`, { field: `${at}.date` })
    if (!r.src === !r.from) throw new SeedError(`${at} — src(파일) 와 from(문서 key 의 부록 섹션) 중 하나`, { field: at })
    if (!Array.isArray(r.touches)) throw new SeedError(`${at}.touches 는 배열이다(비면 [])`, { field: `${at}.touches` })
    return r
  })
  const dupe = (list, key, what) => {
    const seen = new Set()
    for (const x of list) {
      if (seen.has(x[key])) throw new SeedError(`${what} ${key} 가 겹친다 — ${x[key]}`)
      seen.add(x[key])
    }
  }
  dupe(docs, 'key', '문서')
  dupe(docs, 'src', '문서')
  dupe(docs, 'doc', '문서')
  dupe(records, 'id', '기록')
  return { version: 1, root, rules: { ...rules, history }, docs, records, alias: m.alias || {}, ignore: m.ignore || [], intent: m.intent || {}, ...(m.target ? { target: m.target } : {}) }
}

// ── 다듬기 ───────────────────────────────────────────────────────────────────

export function dropHistory(text, map) {
  const res = map.rules.history
  return String(text ?? '')
    .split(NL)
    .filter((l) => !res.some((re) => re.test(l)))
    .join(NL)
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

// 옛 통합 때 생긴 겹 링크 `[[라벨](옛 경로)](원천 경로)` — 바깥(원천 경로)만 남긴다
export const collapseNested = (text) => String(text ?? '').replace(/\[\[([^\]\n]*)\]\([^)\s]+\)\]\(([^)\s]+)\)/g, (m, label, outer) => `[${label}](${outer})`)

// `## 값 — 설명` 헤딩으로 쪼갠다. 코드 블록 안의 `##` 는 헤딩이 아니다
export function splitH2(text) {
  const pre = []
  const secs = []
  let cur = null
  let fence = false
  for (const l of String(text ?? '').replace(/\r\n/g, NL).split(NL)) {
    if (/^(```|~~~)/.test(l.trim())) fence = !fence
    if (!fence && /^## /.test(l)) {
      const raw = l.slice(3).trim()
      let value = raw.split(/\s+[—–]\s+/)[0].trim()
      let heading = raw
      if (/\s/.test(value)) {
        value = value.split(/\s+/)[0]
        heading = value + ' — ' + raw.slice(value.length).trim()
      }
      cur = { raw, value, heading, body: [] }
      secs.push(cur)
      continue
    }
    if (cur) cur.body.push(l)
    else pre.push(l)
  }
  const tidy = (b) => b.join(NL).replace(/^\s*\n/, '').replace(/\s+$/, '')
  return { pre: tidy(pre), secs: secs.map((s) => ({ ...s, body: tidy(s.body) })) }
}

const stripHr = (t) => t.replace(/\n*---\s*$/, '').trim()

/**
 * 문서 하나 → 섹션 목록. `relinkFn` 을 주면 본문 링크를 새 자리로 고친다(apply · verify). 안 주면 원문 그대로(follow · update).
 * @returns [{ coord, value, heading?, body, label, aliases? }]
 */
export function docSections(d, text, map, relinkFn = null) {
  const src = String(text ?? '').replace(/\r\n/g, NL)
  const fix = (t) => {
    let x = dropHistory(t, map)
    if (map.rules.nestedLinks) x = collapseNested(x)
    return relinkFn ? relinkFn(x) : x
  }
  if (d.split === 'whole') {
    // 첫 줄의 제목 · 머리의 「출처」 메모만 걷는다 — 나머지가 그 좌표의 상태다
    const body = src
      .split(NL)
      .filter((l, i) => !(i < 6 && (/^# /.test(l) || /^> 출처/.test(l))))
      .join(NL)
      .trim()
    return [{ coord: d.coord, value: d.coord.split(':').slice(1).join(':'), body: fix(body), label: d.label || d.title || d.coord, ...(d.aliases ? { aliases: d.aliases } : {}) }]
  }
  const { pre, secs } = splitH2(src)
  const skip = map.rules.skip || []
  const out = []
  if (d.split === 'chapters') {
    if (d.preamble) {
      const head = stripHr(pre.split(NL).filter((l) => !/^# /.test(l)).join(NL))
      out.push({ coord: `${d.type}:${d.preamble}`, value: d.preamble, heading: `${d.preamble} — ${d.preambleLabel || '판 · 상태 · 근거'}`, body: fix(head), label: d.preambleLabel || `${d.title || d.key} 의 판 · 상태 · 근거`, ...(d.aliases ? { aliases: d.aliases } : {}) })
    }
    for (const s of secs) {
      const n = Number(s.raw.match(/^(\d+)\./)?.[1])
      const v = d.chapters[n - 1]
      if (!v) throw new SeedError(`${d.src} — 장 번호를 모른다: 「${s.raw}」 (chapters 에 ${n}번째 값이 없다)`, { doc: d.key })
      const aliases = (d.chapterAliases || []).map((a) => a.replaceAll('{n}', String(n)))
      out.push({ coord: `${d.type}:${v}`, value: v, heading: `${v} — ${s.raw}`, body: fix(stripHr(s.body)), label: s.raw.replace(/^\d+\.\s*/, ''), ...(aliases.length ? { aliases } : {}) })
    }
    return out
  }
  for (const s of secs) {
    if (skip.some((p) => s.value.startsWith(p))) continue
    out.push({ coord: `${d.type}:${s.value}`, value: s.value, heading: s.heading, body: fix(s.body), label: s.heading.split(/\s+[—–]\s+/).slice(1).join(' — ') || s.value })
  }
  return out
}

// 부록 섹션(`from` 기록) — 문서의 「부록」 으로 시작하는 첫 섹션
export function appendixOf(text, map) {
  const skip = map.rules.skip || []
  return splitH2(text).secs.find((s) => skip.some((p) => s.value.startsWith(p))) || null
}

// 좌표 → 원문 지도(이력 줄만 걷는다) — follow · update 가 커밋 앞뒤를 견준다(검토 S11)
export function coordMap(d, text, map) {
  const m = new Map()
  if (text == null) return m
  for (const s of docSections(d, text, map)) m.set(s.coord, s.body)
  return m
}

// ── 링크 ────────────────────────────────────────────────────────────────────

const posix = path.posix
export function relFrom(fromFile, toFile) {
  const a = posix.dirname(fromFile).split('/').filter((x) => x && x !== '.')
  const b = toFile.split('/')
  let i = 0
  while (i < a.length && i < b.length - 1 && a[i] === b[i]) i++
  return [...Array(a.length - i).fill('..'), ...b.slice(i)].join('/')
}

export const transferId = (d, day) => `${day.slice(0, 4)}-${day.slice(5, 7)}${day.slice(8, 10)}-이관-${d.key}`

/**
 * 원천 경로 → 새 자리 표. `files` 는 원천 문서 폴더의 파일 목록(root 기준 · `/`) — 첨부 폴더를 펴는 데 쓴다.
 * @returns { targetOf(srcPath) → 레포 경로 | null }
 */
export function linkTable(map, files, day) {
  const t = new Map()
  t.noAnchor = new Set() // 장으로 쪼갠 문서는 헤딩이 바뀌어 #앵커가 맞지 않는다
  for (const d of map.docs) {
    t.set(d.src, d.doc)
    if (d.split === 'chapters') t.noAnchor.add(d.doc)
    const id = transferId(d, day)
    if (d.figs) for (const f of files.filter((x) => x.startsWith(d.figs + '/'))) t.set(f, `work/assets/${id}/${posix.basename(f)}`)
    for (const a of d.attach || []) t.set(a, `work/assets/${id}/${posix.basename(a)}`)
  }
  for (const r of map.records) {
    if (r.src) t.set(r.src, `work/${r.id}.md`)
    if (r.attachDir) for (const f of files.filter((x) => x.startsWith(r.attachDir + '/'))) t.set(f, `work/assets/${r.id}/${posix.basename(f)}`)
    for (const a of r.attach || []) t.set(a, `work/assets/${r.id}/${posix.basename(a)}`)
  }
  for (const [src, id] of Object.entries(map.alias || {})) t.set(src, `work/${id}.md`)
  return t
}

/**
 * 원천 문서(`srcFile` · root 기준)의 상대 링크를 새 파일(`outFile` · 레포 기준) 자리로. 표에 없으면 글자만 남긴다(`unlinked` 에 센다).
 * 웹 · `#` · 파일 모양이 아닌 것(화면설계서의 버튼 표기 `[즉시실행](기타1)`)은 그대로.
 */
export function relink(text, srcFile, outFile, table, unlinked = null) {
  const dir = posix.dirname(srcFile)
  return String(text ?? '').replace(/(!?)\[([^\]\n]*)\]\(([^)\s]+)\)/g, (m, bang, label, href) => {
    if (/^[a-z][a-z0-9+.-]*:/i.test(href) || href.startsWith('#')) return m
    if (!/\/|\.(md|png|jpe?g|gif|svg|pdf|xlsx?|html?|pptx?|docx?|hwp)(#|$)/i.test(href)) return m
    const [p0, hash = ''] = href.split('#')
    let target
    try {
      target = posix.normalize(posix.join(dir, decodeURIComponent(p0)))
    } catch {
      return m
    }
    const to = table.get(target)
    if (to) return `${bang}[${label}](${relFrom(outFile, to)}${to.startsWith('docs/') && hash && !table.noAnchor?.has(to) ? '#' + hash : ''})`
    if (unlinked) unlinked.set(target, (unlinked.get(target) || 0) + 1)
    return label
  })
}

// 기록의 touches — `@<doc key>` 는 그 문서의 좌표 전부
export function expandTouches(r, map, sectionsOf) {
  const out = []
  for (const t of r.touches) {
    if (t.startsWith('@')) {
      const d = map.docs.find((x) => x.key === t.slice(1))
      if (!d) throw new SeedError(`기록 ${r.id} 의 touches ${t} — 그런 문서 key 가 없다`, { record: r.id })
      out.push(...sectionsOf(d).map((s) => s.coord))
    } else out.push(t)
  }
  return [...new Set(out)]
}

// ── 검사 ────────────────────────────────────────────────────────────────────

/**
 * 지도 검사. `files` = 원천 문서 폴더의 파일 목록(root 기준). `read(rel)` = 그 파일의 글.
 * @returns { errors: [..], warnings: [..], docs: [{ key, sections }], records: n, untracked: [md…] }
 */
export function checkSeedMap(map, files, read) {
  const errors = []
  const warnings = []
  const has = new Set(files)
  const sectionsOf = new Map()
  const coords = new Set()
  for (const d of map.docs) {
    if (!has.has(d.src)) {
      errors.push(`문서 ${d.key} — 원천 파일이 없다: ${d.src}`)
      continue
    }
    try {
      const secs = docSections(d, read(d.src), map)
      sectionsOf.set(d.key, secs)
      const seen = new Set()
      for (const s of secs) {
        if (seen.has(s.coord)) errors.push(`문서 ${d.key} — 좌표가 두 번 나온다: ${s.coord}(같은 값의 헤딩)`)
        seen.add(s.coord)
        if (coords.has(s.coord)) errors.push(`좌표 ${s.coord} 가 두 문서에 있다`)
        coords.add(s.coord)
      }
      if (!secs.length) warnings.push(`문서 ${d.key} — 섹션이 없다(헤딩 모양이 split 과 맞나)`)
    } catch (e) {
      errors.push(e.message)
    }
    if (d.figs && !files.some((f) => f.startsWith(d.figs + '/'))) errors.push(`문서 ${d.key} — 그림 폴더가 비었거나 없다: ${d.figs}`)
    for (const a of d.attach || []) if (!has.has(a)) errors.push(`문서 ${d.key} — 첨부가 없다: ${a}`)
  }
  for (const r of map.records) {
    if (r.src && !has.has(r.src)) errors.push(`기록 ${r.id} — 원천 파일이 없다: ${r.src}`)
    if (r.from) {
      const d = map.docs.find((x) => x.key === r.from)
      if (!d) errors.push(`기록 ${r.id} — from ${r.from} 문서가 없다`)
      else if (has.has(d.src) && !appendixOf(read(d.src), map)) errors.push(`기록 ${r.id} — ${d.src} 에 부록 섹션이 없다`)
    }
    for (const a of r.attach || []) if (!has.has(a)) errors.push(`기록 ${r.id} — 첨부가 없다: ${a}`)
    if (r.attachDir && !files.some((f) => f.startsWith(r.attachDir + '/'))) errors.push(`기록 ${r.id} — 첨부 폴더가 없다: ${r.attachDir}`)
    try {
      for (const c of expandTouches(r, map, (d) => sectionsOf.get(d.key) || [])) if (!coords.has(c)) warnings.push(`기록 ${r.id} — touches ${c} 는 지도의 관리 문서에 없는 좌표다(미등재 좌표로 남는다)`)
    } catch (e) {
      errors.push(e.message)
    }
  }
  const known = new Set([...map.docs.map((d) => d.src), ...map.records.filter((r) => r.src).map((r) => r.src), ...Object.keys(map.alias), ...map.ignore.map((x) => x.src)])
  const untracked = files.filter((f) => /\.md$/i.test(f) && !known.has(f))
  for (const f of untracked) warnings.push(`지도에 없는 md — ${f} (docs · records · ignore 중 하나로)`)
  for (const c of Object.keys(map.intent)) if (!coords.has(c)) warnings.push(`intent ${c} — 지도의 좌표가 아니다`)
  return { errors, warnings, docs: map.docs.map((d) => ({ key: d.key, sections: (sectionsOf.get(d.key) || []).length })), records: map.records.length, untracked }
}

// 대조의 정규화 — 기준선 표지 · 경과 목록을 걷고 링크는 라벨로 접는다(링크 대상만 다른 것은 같다)
export function normForCompare(t) {
  return String(t || '')
    .replace(/<!-- cdp:baseline[^>]*-->\n?|<!-- \/cdp:baseline -->\n?/g, '')
    .replace(/\n\*\*경과\*\*\n(- .*\n?)*/g, '\n')
    .replace(/\]\([^)]*\)/g, ']')
    .replace(/\s+/g, ' ')
    .trim()
}

export { SeedError }
