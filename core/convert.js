// 변환 — md 가 아닌 작업 문서를 md 로. 지식 생성 · 작업실 검토 v0.1 §4.2 · G8.
//
// **의존성을 더하지 않는다**(core/zip.js 머리말) — docx · pptx · xlsx · hwpx 는 zip 안의 XML 이라 Node 로 직접 읽는다.
// 그 밖은 이 PC 에 있는 도구를 찾아 쓴다 — pdf 는 `pdftotext`(poppler), 옛 바이너리(doc · xls · ppt · hwp)는 `soffice`
// (LibreOffice) 로 docx · xlsx · pptx 로 바꾼 뒤 같은 길. 없으면 **들이지 않는다**(건너뜀 · 까닭) — 깨진 글을 기록으로 남기지 않는다.
// OCR 은 하지 않는다 — 글이 없는 pdf(스캔)는 「글이 없다」 로 건너뛴다.
//
//   결과  { md, title, images: [{ name, buf }], warnings }   — 그림은 md 안에서 `![](<이름>)` 로 가리킨다(들이기가 첨부로 다시 잇는다)
//   실패  CtxError('E_CONVERT', 까닭)
//
// 모양은 **뜻만** 옮긴다 — 제목(헤딩) · 문단 · 목록 · 표 · 줄바꿈 · 그림. 글꼴 · 색 · 위치는 버린다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { unzip } from './zip.js'
import { CtxError } from './errors.js'

const NL = String.fromCharCode(10)
export const OOXML_EXTS = ['.docx', '.pptx', '.xlsx', '.hwpx']
export const LEGACY_EXTS = { '.doc': 'docx', '.xls': 'xlsx', '.ppt': 'pptx', '.hwp': 'docx', '.odt': 'docx', '.ods': 'xlsx', '.odp': 'pptx', '.rtf': 'docx' }
export const PDF_EXTS = ['.pdf']
export const CONVERT_EXTS = [...OOXML_EXTS, ...Object.keys(LEGACY_EXTS), ...PDF_EXTS]
const MAX_ROWS = 500
const MAX_COLS = 40
const IMG = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp' }

const fail = (why, detail = {}) => new CtxError('E_CONVERT', why, detail)

// ── XML — 태그 · 글을 차례로. 우리가 보는 것은 요소 이름 · 속성 · 글뿐이다 ───────────────────────

const ENT = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" }
const unent = (s) => s.replace(/&(#x[0-9a-f]+|#\d+|\w+);/gi, (m, e) => (e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENT[e] ?? m))

function attrs(s) {
  const out = {}
  for (const m of s.matchAll(/([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g)) out[m[1]] = unent(m[3] ?? m[4] ?? '')
  return out
}

// 나무 — { name, attrs, kids: [node | 글] }. 주석 · 처리 지시 · CDATA 는 글로 다루지 않는다
export function parseXml(text) {
  const root = { name: '#root', attrs: {}, kids: [] }
  const stack = [root]
  const re = /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g
  for (const m of String(text).matchAll(re)) {
    const top = stack[stack.length - 1]
    if (m[1] != null) top.kids.push(m[1])
    else if (m[3]) {
      if (m[2] === '/') {
        for (let i = stack.length - 1; i > 0; i--) if (stack[i].name === m[3]) {
          stack.length = i
          break
        }
      } else {
        const node = { name: m[3], attrs: attrs(m[4] || ''), kids: [] }
        top.kids.push(node)
        if (!m[5]) stack.push(node)
      }
    } else if (m[6] != null) top.kids.push(unent(m[6]))
  }
  return root
}

const local = (n) => n.slice(n.indexOf(':') + 1)
const kids = (node, name) => node.kids.filter((k) => typeof k === 'object' && local(k.name) === name)
function* walkAll(node) {
  for (const k of node.kids) {
    if (typeof k !== 'object') continue
    yield k
    yield* walkAll(k)
  }
}
const find = (node, name) => {
  for (const k of walkAll(node)) if (local(k.name) === name) return k
  return null
}
const findAll = (node, name) => [...walkAll(node)].filter((k) => local(k.name) === name)
const attr = (node, name) => {
  if (!node) return null
  for (const [k, v] of Object.entries(node.attrs)) if (local(k) === name) return v
  return null
}

// 표 하나 → md. 첫 줄을 머리로 · 칸 안의 줄바꿈은 <br> · `|` 는 \|
export function mdTable(rows) {
  const width = Math.min(MAX_COLS, Math.max(0, ...rows.map((r) => r.length)))
  if (!rows.length || !width) return ''
  const cell = (s) => String(s ?? '').replace(/\r?\n/g, '<br>').replace(/\|/g, '\\|').trim()
  const line = (r) => '| ' + Array.from({ length: width }, (_, i) => cell(r[i])).join(' | ') + ' |'
  return [line(rows[0]), '|' + ' --- |'.repeat(width), ...rows.slice(1).map(line)].join(NL)
}

const relsOf = async (files, rel) => {
  const f = files.get(rel)
  if (!f) return new Map()
  return new Map(findAll(parseXml(f.toString('utf8')), 'Relationship').map((r) => [r.attrs.Id, { target: r.attrs.Target, type: r.attrs.Type || '' }]))
}
const joinPath = (base, target) => path.posix.normalize(path.posix.join(path.posix.dirname(base), target)).replace(/^\/+/, '')

// ── docx ────────────────────────────────────────────────────────────────────

async function docx(files, name) {
  const doc = files.get('word/document.xml')
  if (!doc) throw fail('docx 가 아니다 — word/document.xml 이 없다')
  const rels = await relsOf(files, 'word/_rels/document.xml.rels')
  // 스타일 이름 — id 가 「1」 「a3」 처럼 이름과 다르다(한글 Word). 이름에서 heading n 을 읽는다
  const level = new Map()
  const st = files.get('word/styles.xml')
  if (st) {
    for (const s of findAll(parseXml(st.toString('utf8')), 'style')) {
      const n = String(attr(find(s, 'name'), 'val') || '')
      const m = /^(?:heading|제목)\s*(\d)$/i.exec(n.trim()) || (/^title$/i.test(n.trim()) ? [0, '1'] : null)
      if (m) level.set(attr(s, 'styleId'), Number(m[1]))
    }
  }
  const images = []
  const warnings = []
  const used = new Set()
  const image = (rid) => {
    const r = rels.get(rid)
    if (!r) return ''
    const p = joinPath('word/document.xml', r.target)
    const buf = files.get(p)
    const ext = path.posix.extname(p).slice(1).toLowerCase()
    if (!buf || !IMG[ext]) {
      if (buf) warnings.push(`그림 ${path.posix.basename(p)} 은 받는 종류가 아니다(${ext}) — 뺐다`)
      return ''
    }
    let n = path.posix.basename(p)
    if (!used.has(n)) {
      used.add(n)
      images.push({ name: n, buf })
    }
    return `![](${n})`
  }
  const runText = (p) => {
    let s = ''
    for (const k of walkAll(p)) {
      const n = local(k.name)
      if (n === 't') s += k.kids.filter((x) => typeof x === 'string').join('')
      else if (n === 'tab') s += '\t'
      else if (n === 'br' || n === 'cr') s += NL
      else if (n === 'blip') s += image(attr(k, 'embed'))
    }
    return s
  }
  const out = []
  let title = null
  const body = find(parseXml(doc.toString('utf8')), 'body')
  for (const k of body?.kids || []) {
    if (typeof k !== 'object') continue
    const n = local(k.name)
    if (n === 'p') {
      const text = runText(k).replace(/[ \t]+$/gm, '')
      if (!text.trim()) {
        if (out.length && out[out.length - 1] !== '') out.push('')
        continue
      }
      const sid = attr(find(k, 'pStyle'), 'val')
      // 스타일 id 가 이름 그대로인 문서(영문 Word 의 Heading1)도 있다
      const lv = level.get(sid) ?? (Number(/^(?:heading|제목)\s*(\d)$/i.exec(String(sid || ''))?.[1]) || null)
      if (lv) {
        if (!title) title = text.trim()
        out.push('', '#'.repeat(Math.min(6, lv)) + ' ' + text.trim().replace(/\n/g, ' '), '')
      } else if (find(k, 'numPr')) {
        const ilvl = Number(attr(find(k, 'ilvl'), 'val') || 0)
        out.push('  '.repeat(ilvl) + '- ' + text.trim().replace(/\n/g, ' '))
      } else out.push(text.trim().replace(/\n/g, '  ' + NL), '')
    } else if (n === 'tbl') {
      const rows = kids(k, 'tr').map((tr) => kids(tr, 'tc').map((tc) => kids(tc, 'p').map(runText).join(NL).trim()))
      if (rows.length) out.push('', mdTable(rows), '')
    }
  }
  const core = files.get('docProps/core.xml')
  const dcTitle = core ? find(parseXml(core.toString('utf8')), 'title')?.kids.filter((x) => typeof x === 'string').join('').trim() : null
  return { md: tidy(out.join(NL)), title: dcTitle || title || name, images, warnings }
}

// ── xlsx ────────────────────────────────────────────────────────────────────

const colIndex = (ref) => {
  const m = /^([A-Z]+)/.exec(ref || '')
  if (!m) return 0
  let n = 0
  for (const c of m[1]) n = n * 26 + (c.charCodeAt(0) - 64)
  return n - 1
}
const textOf = (node) => (node ? findAll(node, 't').map((t) => t.kids.filter((x) => typeof x === 'string').join('')).join('') : '')

async function xlsx(files, name) {
  const wb = files.get('xl/workbook.xml')
  if (!wb) throw fail('xlsx 가 아니다 — xl/workbook.xml 이 없다')
  const rels = await relsOf(files, 'xl/_rels/workbook.xml.rels')
  const ss = files.get('xl/sharedStrings.xml')
  const shared = ss ? kids(find(parseXml(ss.toString('utf8')), 'sst') || { kids: [] }, 'si').map(textOf) : []
  const warnings = []
  const out = []
  for (const sh of findAll(parseXml(wb.toString('utf8')), 'sheet')) {
    if (attr(sh, 'state') === 'hidden' || attr(sh, 'state') === 'veryHidden') continue
    const r = rels.get(attr(sh, 'id'))
    const p = r ? joinPath('xl/workbook.xml', r.target) : null
    const x = p ? files.get(p) : null
    if (!x) continue
    const grid = []
    for (const row of findAll(parseXml(x.toString('utf8')), 'row')) {
      const cells = []
      for (const c of kids(row, 'c')) {
        const t = attr(c, 't')
        const v = find(c, 'v')?.kids.filter((y) => typeof y === 'string').join('') ?? ''
        let val = t === 's' ? shared[Number(v)] ?? '' : t === 'inlineStr' ? textOf(find(c, 'is')) : t === 'b' ? (v === '1' ? 'TRUE' : 'FALSE') : v
        cells[colIndex(attr(c, 'r'))] = val
      }
      if (cells.some((c) => String(c ?? '').trim())) grid.push(cells)
    }
    if (!grid.length) continue
    out.push(`## ${attr(sh, 'name') || '시트'}`, '')
    if (grid.length > MAX_ROWS) warnings.push(`시트 「${attr(sh, 'name')}」 가 ${grid.length}행이라 앞 ${MAX_ROWS}행만 옮겼다`)
    if (Math.max(...grid.map((r) => r.length)) > MAX_COLS) warnings.push(`시트 「${attr(sh, 'name')}」 가 ${MAX_COLS}열을 넘어 앞 ${MAX_COLS}열만 옮겼다`)
    out.push(mdTable(grid.slice(0, MAX_ROWS)), '')
  }
  if (!out.length) throw fail('글이 있는 시트가 없다')
  return { md: tidy(out.join(NL)), title: name, images: [], warnings }
}

// ── pptx ────────────────────────────────────────────────────────────────────

async function pptx(files, name) {
  const pres = files.get('ppt/presentation.xml')
  if (!pres) throw fail('pptx 가 아니다 — ppt/presentation.xml 이 없다')
  const rels = await relsOf(files, 'ppt/_rels/presentation.xml.rels')
  const out = []
  let title = null
  let n = 0
  for (const id of findAll(parseXml(pres.toString('utf8')), 'sldId')) {
    const r = rels.get(attr(id, 'id'))
    const p = r ? joinPath('ppt/presentation.xml', r.target) : null
    const x = p ? files.get(p) : null
    if (!x) continue
    n++
    let head = null
    const body = []
    for (const sp of findAll(parseXml(x.toString('utf8')), 'sp')) {
      const ph = attr(find(sp, 'ph'), 'type')
      const paras = findAll(sp, 'p').map(textOf).map((s) => s.trim()).filter(Boolean)
      if (!paras.length) continue
      if ((ph === 'title' || ph === 'ctrTitle') && !head) head = paras.join(' ')
      else body.push(...paras.map((s) => '- ' + s))
    }
    for (const tbl of findAll(parseXml(x.toString('utf8')), 'tbl')) {
      const rows = kids(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => textOf(tc).trim()))
      if (rows.length) body.push('', mdTable(rows), '')
    }
    if (!title && head) title = head
    out.push(`## ${n}. ${head || '슬라이드'}`, '', ...body, '')
  }
  if (!n) throw fail('슬라이드가 없다')
  return { md: tidy(out.join(NL)), title: title || name, images: [], warnings: [] }
}

// ── hwpx ────────────────────────────────────────────────────────────────────

async function hwpx(files, name) {
  const sections = [...files.keys()].filter((k) => /^Contents\/section\d+\.xml$/i.test(k)).sort((a, b) => Number(/(\d+)/.exec(a)[1]) - Number(/(\d+)/.exec(b)[1]))
  if (!sections.length) throw fail('hwpx 가 아니다 — Contents/section*.xml 이 없다')
  const out = []
  const para = (p) =>
    findAll(p, 't')
      .map((t) => t.kids.filter((x) => typeof x === 'string').join(''))
      .join('')
  for (const s of sections) {
    const root = parseXml(files.get(s).toString('utf8'))
    const sec = find(root, 'sec') || root
    for (const k of sec.kids) {
      if (typeof k !== 'object' || local(k.name) !== 'p') continue
      const tbl = find(k, 'tbl')
      if (tbl) {
        const rows = findAll(tbl, 'tr').map((tr) => kids(tr, 'tc').map((tc) => findAll(tc, 'p').map(para).join(NL).trim()))
        if (rows.length) out.push('', mdTable(rows), '')
        continue
      }
      const text = para(k).trim()
      out.push(text, '')
    }
  }
  const md = tidy(out.join(NL))
  if (!md.trim()) throw fail('글이 없다')
  return { md, title: md.split(NL).find((l) => l.trim())?.slice(0, 80) || name, images: [], warnings: [] }
}

// 빈 줄을 둘 이상 겹치지 않는다 · 끝 공백
const tidy = (s) => s.replace(/\n{3,}/g, NL + NL).replace(/^\s+|\s+$/g, '') + NL

// ── 밖의 도구 ────────────────────────────────────────────────────────────────

const run = (cmd, args, opt = {}) =>
  new Promise((res) => execFile(cmd, args, { timeout: 120000, windowsHide: true, maxBuffer: 64 << 20, encoding: 'buffer', ...opt }, (e, stdout, stderr) => res({ ok: !e, stdout, stderr, code: e?.code })))

// 이 PC 의 변환기 — 경로를 찾으면 그 경로 · 없으면 null. `CDP_PDFTOTEXT` · `CDP_SOFFICE` 로 바꿀 수 있다
export async function tools(env = process.env) {
  const probe = async (names, flag) => {
    for (const n of names) if (n && (await run(n, [flag], { timeout: 15000 })).ok) return n
    return null
  }
  const win = process.platform === 'win32'
  return {
    pdftotext: await probe([env.CDP_PDFTOTEXT, 'pdftotext'], '-v'),
    soffice: await probe([env.CDP_SOFFICE, 'soffice', win ? 'C:\\Program Files\\LibreOffice\\program\\soffice.exe' : null], '--version'),
  }
}

async function pdf(abs, have) {
  if (!have.pdftotext) throw fail('pdf 변환기가 없다 — poppler 의 pdftotext 를 깔거나 CDP_PDFTOTEXT 로 알려 준다')
  const r = await run(have.pdftotext, ['-layout', '-enc', 'UTF-8', abs, '-'])
  if (!r.ok) throw fail(`pdftotext 가 실패했다 — ${String(r.stderr || '').slice(0, 200)}`)
  const text = r.stdout.toString('utf8').replace(/\f/g, NL + NL).replace(/[ \t]+$/gm, '')
  if (text.replace(/\s/g, '').length < 20) throw fail('글이 없다 — 스캔 pdf 일 수 있다(OCR 은 하지 않는다)')
  // 레이아웃 글은 공백 정렬이 뜻이다 — 코드 블록으로 두면 md 가 줄을 합치지 않는다
  return { md: '```text' + NL + tidy(text) + '```' + NL, title: null, images: [], warnings: ['pdf 는 글만 옮겼다(표 · 그림의 자리는 공백 정렬) — 원본 pdf 를 첨부로 같이 싣는다'], attachSelf: true }
}

async function legacy(abs, ext, have) {
  if (!have.soffice) throw fail(`${ext} 변환기가 없다 — LibreOffice(soffice)를 깔거나 CDP_SOFFICE 로 알려 준다`)
  const to = LEGACY_EXTS[ext]
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-conv-'))
  try {
    const r = await run(have.soffice, ['--headless', '--convert-to', to, '--outdir', dir, abs], { timeout: 180000 })
    const outFile = path.join(dir, path.basename(abs, path.extname(abs)) + '.' + to)
    const buf = await fs.readFile(outFile).catch(() => null)
    if (!r.ok || !buf) throw fail(`soffice 가 ${ext} 를 ${to} 로 바꾸지 못했다${ext === '.hwp' ? ' — hwp 는 LibreOffice 의 한글 필터가 있어야 한다' : ''}`)
    return fromZip(buf, '.' + to, path.basename(abs, ext))
  } finally {
    await fs.rm(dir, { recursive: true, force: true }).catch(() => {})
  }
}

async function fromZip(buf, ext, name) {
  let entries
  try {
    entries = await unzip(buf)
  } catch (e) {
    throw fail(`zip 으로 읽지 못했다 — ${e.message}(암호가 걸렸거나 깨졌다)`)
  }
  const files = new Map(entries.map((e) => [e.name.replace(/\\/g, '/'), e.data]))
  if (ext === '.docx') return docx(files, name)
  if (ext === '.xlsx') return xlsx(files, name)
  if (ext === '.pptx') return pptx(files, name)
  if (ext === '.hwpx') return hwpx(files, name)
  throw fail(`모르는 형식 — ${ext}`)
}

/** 파일 하나 → md. `have` 는 `tools()` 의 결과(없으면 밖의 도구를 쓰지 않는다) */
export async function convertFile(abs, { have = {} } = {}) {
  const ext = path.extname(abs).toLowerCase()
  const name = path.basename(abs, ext)
  if (OOXML_EXTS.includes(ext)) return fromZip(await fs.readFile(abs), ext, name)
  if (PDF_EXTS.includes(ext)) return pdf(abs, have)
  if (LEGACY_EXTS[ext]) return legacy(abs, ext, have)
  throw fail(`변환하지 않는 형식 — ${ext}`)
}
