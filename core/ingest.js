// 들이기 계획 — 파일 · 폴더 · git 레포의 작업 문서를 작업 기록 초안으로. 지식 생성 · 작업실 검토 v0.1 §4 · G5 · G10 · G11.
//
// **계획은 파일을 쓰지 않는다** — 원천도 지식 레포도 만지지 않는다. 쓰는 것은 `ctx ingest --apply` 가 서버의 묶음 save
// (`/api/<레포>/records`)로 한다(I2 — 쓰는 길은 save 하나). 옛 `import-dir` 는 로컬 클론에 직접 썼다.
//
//   대상       파일 · 폴더(하위를 편다) · git 작업 트리(커밋 · 첫 커밋 날짜 · 작성자를 이력에서)
//   받는 글    md · markdown · txt — 그 밖(docx · pdf · xlsx · hwp …)은 「변환 전」 으로 건너뛴다(변환은 다음 판 · G8)
//   id         YYYY-MMDD-<원천 이름>-<경로 조각>-<blob 앞 7자> — **원본에서 정한다**(같은 원본이면 같은 id · 결정론)
//   date       원문의 날 — 프론트매터 → 파일명 → git 첫 커밋 → mtime. 근거를 남긴다(importdir 와 같은 규칙)
//   source     `<이름>@<commit|->/<경로>#blob:<sha>` — 중복 판정의 열쇠(core/provenance.js · save 가 판정한다)
//   touches    **비운다** — 좌표를 추측하지 않는다(R8). 원문 프론트매터의 좌표는 tags 의 `touches/<좌표>` 로 보존하고
//              touchesEmpty 에 사유를 적는다 — 큐레이터가 대기열에서 정한다(판단 단계 `claude -p` 는 다음 판)
//   tags       `ingest/<runId>`(들인 날 · 대기 나이를 여기서 잰다 — core/curation.js) + 원문 tags + 모르는 필드(key/value)
//   본문       원문 그대로(요약하지 않는다 · 편입 규칙) — 머리에 들임 한 줄(원문 경로 · 원문 작성 · 이전 판)
//   그림 · 첨부  본문이 가리키는 원천 안의 png · jpg · gif · webp · pdf · html — 그 기록의 첨부로 싣고 링크를 다시 잇는다
//   이전 판    같은 원천 · 같은 경로인데 blob 이 다르면 **새 기록**이고 머리에 이전 판 id(supersedes 는 정정 전용 — G11)
//
// 결정론 — 같은 원본 · 같은 known 이면 같은 계획. 시각은 `now`(들인 날)에서만 온다.

import { execFile } from 'node:child_process'
import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'
import { readText } from './scan.js'
import { CtxError } from './errors.js'
import { walk, splitFrontmatter, normDate, slugOf, stripLeadingDate, firstH1, toArr, COORD, KNOWN, SKIP_DIRS } from './importdir.js'
import { blobSha, formatSource } from './provenance.js'
import { ASSET_EXTS, ASSET_MAX, ASSETS_COUNT_MAX } from './assets.js'

const NL = String.fromCharCode(10)
export const TEXT_EXTS = ['.md', '.markdown', '.txt']
export const MAX_FILES = 200
export const MAX_CHARS = 200_000
// MCP · /records 의 몸통 상한(2 MB)보다 작게 — 기록 하나가 묶음 하나를 넘지 않게
export const MAX_BODY_BYTES = 1_500_000
export const TOUCHES_EMPTY = '들이기 — 좌표는 큐레이터가 판정한다'
const ID_SLUG_MAX = 120

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: 15000, windowsHide: true, encoding: 'utf8', maxBuffer: 16 << 20 }, (e, stdout) => resolve(e ? null : String(stdout || '')))
  })
}

// `**/*.md` · `설계/**` · `*.txt` — 경로(/ 로)에 맞춘다. `**` 는 폴더 여럿 · `*` 는 한 조각 안 · `?` 는 한 글자
export function globRe(glob) {
  let re = ''
  const g = String(glob).replace(/\\/g, '/')
  for (let i = 0; i < g.length; i++) {
    const c = g[i]
    if (c === '*' && g[i + 1] === '*') {
      re += g[i + 2] === '/' ? '(?:.*/)?' : '.*'
      i += g[i + 2] === '/' ? 2 : 1
    } else if (c === '*') re += '[^/]*'
    else if (c === '?') re += '[^/]'
    else re += c.replace(/[.+^${}()|[\]\\]/g, '\\$&')
  }
  return new RegExp('^' + re + '$', 'i')
}

// 대상 하나 → { root, name, files: [rel] , single } — 파일이면 그 폴더가 root
async function expand(input) {
  const abs = path.resolve(input)
  const st = await fs.stat(abs).catch(() => null)
  if (!st) throw new CtxError('E_INPUT', `대상이 없다 — ${abs}`, { path: abs })
  if (st.isFile()) return { root: path.dirname(abs), name: path.basename(path.dirname(abs)) || 'src', files: [path.basename(abs)], single: true }
  if (!st.isDirectory()) throw new CtxError('E_INPUT', `파일도 폴더도 아니다 — ${abs}`, { path: abs })
  const files = []
  for await (const rel of walk(abs)) if (!rel.split('/').some((seg) => SKIP_DIRS.has(seg) || seg === '.cdp-ingest')) files.push(rel)
  return { root: abs, name: path.basename(abs) || 'src', files, single: false }
}

// git 작업 트리면 HEAD · 바뀐 파일 · 파일마다 첫 커밋(날짜 · 작성자)
async function gitInfo(root) {
  const top = (await git(root, ['rev-parse', '--show-toplevel']))?.trim()
  if (!top) return null
  const head = (await git(root, ['rev-parse', '--short=12', 'HEAD']))?.trim() || null
  // root 의 레포 안 자리 — path.relative 로 셈하지 않는다(Windows 의 짧은 이름 `세정아~1` 과 git 이 낸 긴 이름이 갈린다)
  const prefix = ((await git(root, ['rev-parse', '--show-prefix'])) || '').trim()
  const st = (await git(top, ['status', '--porcelain', '-z', '--untracked-files=all'])) || ''
  const dirty = new Set()
  for (const ent of st.split('\0')) if (ent.length > 3) dirty.add(ent.slice(3))
  return { top: path.resolve(top), head, prefix, dirty }
}

async function firstCommit(g, rel) {
  const log = await git(g.top, ['log', '--diff-filter=A', '--follow', '--format=%cs%x09%an', '--', rel])
  const last = log ? log.split(NL).filter(Boolean).at(-1) : null
  if (!last) return null
  const [date, author] = last.split('\t')
  return { date, author, rel }
}

const ymd = (ms) => {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`
}

// run 의 열쇠 — 대상 · 거름이 같으면 같은 값(들인 날과 무관하다 · 다시 돌리기가 같은 상태 폴더를 찾게)
export function runHash({ inputs, include = [], exclude = [], repo = '' }) {
  const key = JSON.stringify({ i: inputs.map((x) => path.resolve(x)).sort(), in: [...include].sort(), ex: [...exclude].sort(), r: repo })
  return crypto.createHash('sha1').update(key).digest('hex').slice(0, 8)
}
export const runIdOf = (hash, createdMs) => `${ymd(createdMs)}-${hash}`

function idOf(date, name, rel, blob) {
  const base = rel.replace(/\.(md|markdown|txt)$/i, '')
  const lead = stripLeadingDate(path.posix.basename(base))
  const dir = path.posix.dirname(base)
  const parts = [slugOf(name), dir === '.' ? '' : slugOf(dir), slugOf(lead.date ? lead.rest : path.posix.basename(base)) || 'untitled'].filter(Boolean)
  let slug = parts.join('-')
  const tail = '-' + blob.slice(0, 7)
  if (slug.length + tail.length > ID_SLUG_MAX) slug = slug.slice(0, ID_SLUG_MAX - tail.length).replace(/-+$/, '')
  const d = date.slice(0, 10).replace(/-/g, '')
  return `${d.slice(0, 4)}-${d.slice(4, 8)}-${slug}${tail}`
}

// 링크 대상 — `](대상)` · `](<대상>)` · `](대상 "제목")`. **공백이 든 대상도 잡는다** — 규격상 꺾쇠로 싸야 하지만 실제 문서는
// 그냥 쓴다(importdir 의 rewriteLinks 와 같은 규칙 · 앞선 이관 실측 7건). 코드 블록 · 인라인 코드 안은 건드리지 않는다
const LINK = /(\]\(\s*)(<[^>\n]*>|[^)\n]*?)(\s+"[^"\n]*")?(\s*\))/g
const codeless = (t) => t.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) => ' '.repeat(m.length)).replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length))

function targetOf(href, rel) {
  let h = href.startsWith('<') && href.endsWith('>') ? href.slice(1, -1) : href
  h = h.trim()
  if (!h || h.startsWith('#') || /^[a-z][a-z0-9+.-]*:/i.test(h) || h.startsWith('/') || h.startsWith('//')) return null
  h = h.split('#')[0].split('?')[0]
  try {
    h = decodeURIComponent(h)
  } catch {}
  const t = path.posix.normalize(path.posix.join(path.posix.dirname(rel), h.replace(/\\/g, '/')))
  return t.startsWith('..') ? null : t
}

// 본문이 가리키는 원천 안의 파일 → 첨부. 링크를 `assets/<id>/<이름>` 으로 다시 잇는다
async function attachOf(body, { root, rel, id }) {
  const out = []
  const warnings = []
  const byTarget = new Map()
  const used = new Set()
  const masked = codeless(body)
  for (const m of masked.matchAll(LINK)) {
    const target = targetOf(m[2], rel)
    if (!target) continue
    const ext = path.posix.extname(target).toLowerCase()
    if (!ASSET_EXTS.includes(ext)) continue
    if (byTarget.has(target)) continue
    const abs = path.join(root, ...target.split('/'))
    const st = await fs.stat(abs).catch(() => null)
    if (!st?.isFile()) {
      warnings.push(`본문이 가리키는 ${target} 이 원천에 없다 — 링크 그대로 둔다`)
      continue
    }
    if (st.size > ASSET_MAX) {
      warnings.push(`${target} 이 ${Math.round(st.size / 1024 / 1024)} MB 라 첨부 상한(${ASSET_MAX / 1024 / 1024} MB)을 넘는다 — 링크 그대로 둔다`)
      continue
    }
    if (out.length >= ASSETS_COUNT_MAX) {
      warnings.push(`첨부가 ${ASSETS_COUNT_MAX}개를 넘는다 — ${target} 은 링크 그대로 둔다`)
      continue
    }
    let name = path.posix.basename(target).replace(/[\\/:*?"<>|\x00-\x1f]/g, '_')
    for (let n = 2; used.has(name.toLowerCase()); n++) name = path.posix.basename(target, ext) + '-' + n + ext
    used.add(name.toLowerCase())
    byTarget.set(target, name)
    out.push({ abs, rel: target, name, size: st.size })
  }
  // 다시 잇기 — 같은 대상을 가리키는 링크 전부. 코드 안(가린 자리)은 그대로
  let rewritten = ''
  let at = 0
  for (const m of masked.matchAll(LINK)) {
    const target = targetOf(m[2], rel)
    const name = target ? byTarget.get(target) : null
    if (!name) continue
    const href = m[2].startsWith('<') ? m[2].slice(1, -1) : m[2]
    const frag = href.includes('#') ? href.slice(href.indexOf('#')) : ''
    const to = `assets/${id}/${name}`
    rewritten += body.slice(at, m.index) + m[1] + (/\s/.test(to) ? `<${to}>` : to) + frag + (m[3] || '') + m[4]
    at = m.index + m[0].length
  }
  rewritten += body.slice(at)
  return { assets: out, body: rewritten, warnings }
}

/**
 * 계획 — 파일을 쓰지 않는다.
 * @param {string[]} inputs  파일 · 폴더
 * @param {{ include?: string[], exclude?: string[], maxFiles?: number, maxChars?: number, now?: number, runId: string,
 *           known?: { name: string, path: string, blob: string, id: string }[] }} opt
 *   known — 이미 들인 것(서버의 `/sources` · 이 PC 의 원장). 같은 blob 이면 「있음」 · 같은 경로 다른 blob 이면 이전 판
 */
export async function planIngest(inputs, { include = [], exclude = [], maxFiles = MAX_FILES, maxChars = MAX_CHARS, now = Date.now(), runId, known = [] } = {}) {
  if (!Array.isArray(inputs) || !inputs.length) throw new CtxError('E_INPUT', '들일 파일 · 폴더를 하나 이상 준다', { field: 'inputs' })
  if (!runId) throw new CtxError('E_INPUT', 'runId 가 없다', { field: 'runId' })
  const inc = include.map(globRe)
  const exc = exclude.map(globRe)
  const today = `${ymd(now).slice(0, 4)}-${ymd(now).slice(4, 6)}-${ymd(now).slice(6, 8)}`
  const knownBlob = new Map(known.map((k) => [k.blob, k]))
  const knownPath = new Map()
  for (const k of known) if (!knownPath.has(k.name + '\n' + k.path)) knownPath.set(k.name + '\n' + k.path, k)

  const files = []
  const roots = []
  const ids = new Set()
  let counted = 0
  for (const input of inputs) {
    const t = await expand(input)
    const g = await gitInfo(t.root)
    roots.push({ input, root: t.root, name: t.name, git: g ? { top: g.top, head: g.head } : null })
    for (const rel of t.files) {
      const row = { input, root: t.root, name: t.name, rel, kind: 'skip', reason: null, warnings: [] }
      files.push(row)
      const ext = path.posix.extname(rel).toLowerCase()
      if (!t.single && inc.length && !inc.some((re) => re.test(rel))) {
        row.reason = '거름(--glob) 밖'
        continue
      }
      if (exc.some((re) => re.test(rel))) {
        row.reason = '제외(--exclude)'
        continue
      }
      if (!TEXT_EXTS.includes(ext)) {
        // 다른 md 가 그림으로 가리키면 그 기록의 첨부로 간다 — 따로 세지 않는다
        row.reason = ASSET_EXTS.includes(ext) ? '그림 · 첨부 — 가리키는 md 의 첨부로' : '변환 전 — md · txt 만 들인다(docx · pdf · xlsx 는 다음 판)'
        row.kind = ASSET_EXTS.includes(ext) ? 'asset' : 'skip'
        continue
      }
      if (counted >= maxFiles) {
        row.reason = `상한(--max-files ${maxFiles}) 밖 — 나눠 들인다`
        continue
      }
      const abs = path.join(t.root, ...rel.split('/'))
      const raw = await fs.readFile(abs)
      const blob = blobSha(raw)
      const text = readText(raw.toString('utf8').replace(/^﻿/, ''))
      row.blob = blob
      row.size = raw.length
      if (!text.trim()) {
        row.reason = '빈 파일'
        continue
      }
      if (text.length > maxChars) {
        row.reason = `${text.length.toLocaleString()}자 — 상한(--max-chars ${maxChars.toLocaleString()}) 밖 · 나눠 들인다`
        continue
      }
      counted++
      const hit = knownBlob.get(blob)
      if (hit) {
        row.kind = 'have'
        row.reason = `이미 들였다 — ${hit.id}`
        row.id = hit.id
        continue
      }
      const md = ext !== '.txt'
      const { fm, body } = md ? splitFrontmatter(text) : { fm: {}, body: text }
      const base = path.posix.basename(rel).replace(/\.(md|markdown|txt)$/i, '')
      const lead = stripLeadingDate(base)
      const gitRel = g ? g.prefix + rel : null
      const fc = g && !g.dirty.has(gitRel) ? await firstCommit(g, gitRel) : null

      // date — 근거를 남긴다
      let date = normDate(fm.date)
      let dateSource = date ? 'frontmatter' : null
      if (!date && lead.date) [date, dateSource] = [lead.date, 'filename']
      if (!date && fc?.date) [date, dateSource] = [fc.date, 'git']
      if (!date) {
        const st = await fs.stat(abs)
        date = new Date(st.mtimeMs).toISOString().slice(0, 10)
        dateSource = 'mtime'
        row.warnings.push('날짜 근거가 mtime 이다 — 복사한 날일 수 있다')
      }

      let id = idOf(date, t.name, rel, blob)
      for (let n = 2; ids.has(id); n++) id = idOf(date, t.name, rel, blob) + '-' + n
      ids.add(id)

      const title = String(fm.title || '').trim() || (md ? firstH1(body) : null) || lead.rest || base
      const writer = fm.author ? String(fm.author).trim() : fc?.author || null

      // 좌표 — 추측하지 않는다. 원문이 적은 좌표는 tags 로 보존(큐레이터가 판정)
      const tags = [`ingest/${runId}`, ...toArr(fm.tags)]
      const coords = toArr(fm.touches).filter((c) => COORD.test(c))
      for (const c of coords) tags.push('touches/' + c)
      for (const [k, v] of Object.entries(fm)) {
        if (KNOWN.has(k) || v == null || v === '' || (typeof v === 'object' && !Array.isArray(v))) continue
        for (const one of toArr(v)) tags.push(`${k}/${one}`.replace(/\s+/g, '_'))
      }

      const commit = g && !g.dirty.has(gitRel) ? g.head : null
      const source = formatSource({ name: t.name, commit, path: rel, blob })
      const prev = knownPath.get(t.name + '\n' + rel) || null

      const att = md ? await attachOf(body, { root: t.root, rel, id }) : { assets: [], body, warnings: [] }
      row.warnings.push(...att.warnings)
      const head = [
        `> 들임 — 원문 \`${rel}\`${commit ? ` @ ${commit}` : ''}`,
        writer ? ` · 원문 작성 ${writer}` : '',
        ` · 들인 날 ${today}`,
        dateSource !== 'frontmatter' ? ` · 날짜 근거 ${dateSource}` : '',
        prev ? ` · 이전 판 [\`${prev.id}\`](${prev.id}.md)` : '',
      ].join('')
      const out = [head, '', att.body.replace(/^\s*\n/, '').replace(/\s*$/, ''), ''].join(NL)
      if (Buffer.byteLength(out, 'utf8') > MAX_BODY_BYTES) {
        row.reason = `본문이 ${Math.round(Buffer.byteLength(out, 'utf8') / 1024)} KB — 한 번에 보낼 상한 밖 · 나눠 들인다`
        ids.delete(id)
        continue
      }

      Object.assign(row, {
        kind: 'record',
        reason: null,
        id,
        title,
        date,
        dateSource,
        writer,
        prev: prev?.id || null,
        coords,
        assets: att.assets,
        work: {
          id,
          title,
          date,
          source,
          touchesEmpty: TOUCHES_EMPTY,
          tags: [...new Set(tags)],
          body: out,
        },
      })
    }
  }
  // 그림 · 첨부 — 어느 md 도 가리키지 않으면 건너뜀으로(들이지 않는다)
  const pointed = new Set(files.filter((f) => f.kind === 'record').flatMap((f) => f.assets.map((a) => f.name + '\n' + a.rel)))
  for (const f of files) {
    if (f.kind !== 'asset') continue
    if (pointed.has(f.name + '\n' + f.rel)) f.reason = '가리키는 md 의 첨부로 간다'
    else {
      f.kind = 'skip'
      f.reason = '어느 md 도 가리키지 않는 그림 · 첨부 — 들이지 않는다'
    }
  }
  const count = (k) => files.filter((f) => f.kind === k).length
  return {
    runId,
    roots,
    files,
    summary: {
      files: files.length,
      records: count('record'),
      have: count('have'),
      assets: files.filter((f) => f.kind === 'record').reduce((a, f) => a + f.assets.length, 0),
      skipped: count('skip'),
      prev: files.filter((f) => f.prev).length,
      dateSources: files.filter((f) => f.kind === 'record').reduce((a, f) => ((a[f.dateSource] = (a[f.dateSource] || 0) + 1), a), {}),
    },
  }
}
