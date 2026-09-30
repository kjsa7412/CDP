// import-dir — md 폴더를 `work/` 사건으로 들인다. 검토 §3.6 · R8 · 제품화 TODO 6단계.
//
// 규칙은 앞선 이관 한 건의 실행계획(§3)에서 **프로젝트와 무관한
// 부분만** 옮겼다. 그 이관은 한 번 돌고 끝났고 스크립트는 attic 에 갔다 —
// 다음 프로젝트가 오면 같은 것을 다시 짜게 된다. 그래서 규칙을 제품 안에 둔다.
//
//   work/ 는 평면      하위 폴더를 편다.  이름은 YYYY-MMDD-<출처조각>-<원래이름>
//   id = 파일명        title = 프론트매터 → H1 → 파일명
//   date               프론트매터 → 파일명의 날짜 → git 최초 커밋 → mtime.  **근거를 남긴다**
//   author             프론트매터 → --author → git 작성자 → 'import'
//   touches            **비운다.** 프론트매터에 있던 좌표는 tags 의 `touches/<좌표>` 로 보존한다 —
//                      등록부에 걸리는 좌표를 touches 에 두면 파생 누락으로 검사가 막히는데, 정본
//                      섹션을 기계가 채울 수는 없다(R8). `keepTouches` 를 주면 그대로 두고, 그때
//                      검사가 막히면 E_CHECK 로 되돌린다.  **좌표를 추측하지 않는다** (P2 는 사람 · LLM)
//   status             전건 소거.  모르는 필드는 tags 로 접는다 (key/value)
//   md 가 아닌 파일     work/assets/<출처조각>/ 로.  본문의 상대 링크를 다시 쓴다
//   결정론             같은 원본이면 같은 결과.  시각 · 난수 의존 없음 (mtime 폴백은 근거에 적힌다)
//
// 두 단계다 — `planImport` 는 파일을 쓰지 않고 표를 만든다. `applyImport` 가
// 쓰고, 끝에 `runBuiltinCheck` 로 error 0 을 확인한다. 아니면 쓴 것을 지운다.

import { execFile } from 'node:child_process'
import fs from 'node:fs/promises'
import path from 'node:path'
import yaml from 'js-yaml'
import { readText } from './scan.js'
import { loadRepo } from './repo.js'
import { runBuiltinCheck } from './check.js'
import { CtxError } from './tools.js'

const NL = String.fromCharCode(10)
const FM = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/
const KNOWN = new Set(['id', 'title', 'date', 'author', 'source', 'status', 'touches', 'supersedes', 'attachments', 'tags'])
const SKIP_DIRS = new Set(['.git', 'node_modules', '.claude', '.vite', '.idea', '.vscode', '__pycache__'])
const COORD = /^[A-Za-z가-힣][A-Za-z0-9가-힣_-]*:\S+$/
const MAX_NAME = 150

function git(cwd, args) {
  return new Promise((resolve) => {
    execFile('git', ['-C', cwd, ...args], { timeout: 15000, windowsHide: true, encoding: 'utf8', maxBuffer: 8 << 20 }, (e, stdout) => {
      resolve(e ? null : String(stdout || '').trim())
    })
  })
}

async function* walk(root, rel = '') {
  const dir = rel ? path.join(root, rel) : root
  let ents
  try {
    ents = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of ents.sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))) {
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue
      yield* walk(root, rel ? rel + '/' + e.name : e.name)
    } else if (e.isFile()) {
      yield rel ? rel + '/' + e.name : e.name
    }
  }
}

function splitFrontmatter(text) {
  const m = text.match(FM)
  if (!m) return { fm: {}, body: text, hadFm: false }
  let fm = {}
  try {
    const y = yaml.load(m[1])
    if (y && typeof y === 'object' && !Array.isArray(y)) fm = y
  } catch {}
  return { fm, body: text.slice(m[0].length), hadFm: true }
}

function normDate(v) {
  if (v == null) return null
  if (v instanceof Date) {
    const iso = v.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
  }
  const s = String(v).trim()
  const m = s.match(/^(\d{4})[-./]?(\d{2})[-./]?(\d{2})(?:[ T](\d{2}):(\d{2}))?/)
  if (!m) return null
  return `${m[1]}-${m[2]}-${m[3]}` + (m[4] ? ` ${m[4]}:${m[5]}` : '')
}

// 출처 조각 — 원 폴더 경로에서 공백 · 쉼표 · 구분자를 `-` 로. `sh` 와 훅이 인용
// 없이 다뤄도 깨지지 않게(02 §4.2). 앞의 번호 접두(`01_`) 는 뗀다.
function slugOf(s) {
  return String(s || '')
    .split(/[\\/]+/)
    .map((seg) => seg.replace(/^\d+[._-]\s*/, ''))
    .filter(Boolean)
    .join('-')
    .replace(/[\s,;:'"`()[\]{}<>|*?]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^-|-$/g, '')
}

// 파일명 앞의 날짜를 뗀다 — `2026-09-05_ops로그-…` · `20260905-…` · `2026-0905-…`
function stripLeadingDate(base) {
  const m = base.match(/^(\d{4})[-.]?(\d{2})[-.]?(\d{2})[-_. ]*(.*)$/)
  if (m) return { date: `${m[1]}-${m[2]}-${m[3]}`, rest: m[4] || '' }
  return { date: null, rest: base }
}

// 상대 링크를 옮긴 자리로 다시 쓴다.
//
// **대상에 공백이 있어도 잡는다** — `](../projects/비교 개편/layout.png)`. 규격상
// 공백은 `<>` 로 싸야 하지만 실제 문서는 그냥 쓴다(앞선 이관 실측 7건). `)` 까지를
// 대상으로 보고 뒤에 붙은 제목(`"…"`)과 `#조각` 은 떼어 둔다. 스킴이 있는 것(`http:`)
// 과 절대경로는 건드리지 않는다.
function rewriteLinks(body, fromDir, moved) {
  return body.replace(/\]\(([^)]*)\)/g, (m0, inner) => {
    let target = inner.trim()
    let title = ''
    const t = target.match(/^(.*?)(\s+"[^"]*")$/)
    if (t) {
      target = t[1].trim()
      title = t[2]
    }
    let frag = ''
    const h = target.indexOf('#')
    if (h >= 0) {
      frag = target.slice(h)
      target = target.slice(0, h)
    }
    if (!target || /^[a-z][a-z0-9+.-]*:/i.test(target) || target.startsWith('/')) return m0
    let dec
    try {
      dec = decodeURI(target)
    } catch {
      dec = target
    }
    const resolved = path.posix.normalize(path.posix.join(fromDir, dec))
    const hit = moved.get(resolved)
    return hit ? '](' + hit + frag + title + ')' : m0
  })
}

function firstH1(body) {
  let fence = null
  for (const line of body.split(NL)) {
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0].repeat(3)
      else if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fence) continue
    const h = line.match(/^#\s+(.+?)\s*$/)
    if (h) return h[1].trim()
  }
  return null
}

const toArr = (v) => (v == null ? [] : Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [String(v).trim()].filter(Boolean))

/**
 * 계획 — 파일을 쓰지 않는다.
 * @returns {{ src, repo, files: [{ kind, from, to, id, title, date, dateSource, author, touches, tags, dropped, warnings }], assets, warnings, summary }}
 */
export async function planImport(src, repo, { author = null, keepTouches = false } = {}) {
  const S = path.resolve(src)
  const R = path.resolve(repo)
  if (!(await fs.stat(S).then((s) => s.isDirectory()).catch(() => false))) throw new CtxError('E_INPUT', `원본 폴더가 없다 — ${S}`, { src: S })
  if (!(await fs.access(path.join(R, '_vocab.md')).then(() => true).catch(() => false))) {
    throw new CtxError('E_INPUT', '지식 레포가 아니다 (_vocab.md 없음) — ctx repo new 로 먼저 세운다', { repo: R })
  }
  if (S === R || S.startsWith(R + path.sep) || R.startsWith(S + path.sep)) {
    throw new CtxError('E_INPUT', '원본과 지식 레포가 겹친다', { src: S, repo: R })
  }

  const gitTop = await git(S, ['rev-parse', '--show-toplevel'])
  const gitRoot = gitTop ? path.resolve(gitTop) : null
  const warnings = []
  const files = []
  const moved = new Map() // 원본 상대경로(posix) → work/ 기준 새 경로

  const all = []
  for await (const rel of walk(S)) all.push(rel)

  // 1) 자산 먼저 — md 의 링크를 다시 쓰려면 자산의 새 자리를 알아야 한다
  for (const rel of all) {
    if (/\.md$/i.test(rel)) continue
    const dir = path.posix.dirname(rel)
    const seg = slugOf(dir === '.' ? '' : dir) || 'import'
    const to = `work/assets/${seg}/${path.posix.basename(rel)}`
    files.push({ kind: 'asset', from: rel, to })
    moved.set(rel, to.slice('work/'.length))
  }

  // 2) md → work/<id>.md
  const used = new Map() // to → n
  for (const rel of all) {
    if (!/\.md$/i.test(rel)) continue
    const abs = path.join(S, rel)
    const text = readText(await fs.readFile(abs, 'utf8'))
    const { fm, body, hadFm } = splitFrontmatter(text)
    const base = path.posix.basename(rel).replace(/\.md$/i, '')
    const dir = path.posix.dirname(rel)
    const seg = slugOf(dir === '.' ? '' : dir)
    const w = []

    // date — 근거를 남긴다
    let date = normDate(fm.date)
    let dateSource = date ? 'frontmatter' : null
    const lead = stripLeadingDate(base)
    if (!date && lead.date) {
      date = lead.date
      dateSource = 'filename'
    }
    if (!date && gitRoot) {
      const relToGit = path.relative(gitRoot, abs).split(path.sep).join('/')
      const log = await git(gitRoot, ['log', '--diff-filter=A', '--follow', '--format=%cs', '--', relToGit])
      const first = log ? log.split(NL).filter(Boolean).at(-1) : null
      if (first) {
        date = first
        dateSource = 'git'
      }
    }
    if (!date) {
      const st = await fs.stat(abs)
      date = st.mtime.toISOString().slice(0, 10)
      dateSource = 'mtime'
      w.push('날짜 근거가 mtime 이다 — 복사한 날일 수 있다')
    }

    // id — YYYY-MMDD-<조각>-<이름>. 이미 규약 모양이면 그대로.
    let id
    if (/^\d{4}-\d{4}-[^/\\]+$/.test(base) && !fm.id) {
      id = base
    } else {
      const ymd = date.slice(0, 10).replace(/-/g, '')
      const restName = slugOf(lead.date ? lead.rest : base) || 'untitled'
      id = `${ymd.slice(0, 4)}-${ymd.slice(4, 8)}-${[seg, restName].filter(Boolean).join('-')}`
    }
    if (id.length > MAX_NAME) {
      id = id.slice(0, MAX_NAME).replace(/-$/, '')
      w.push(`파일명이 ${MAX_NAME}자를 넘어 잘랐다 (Windows MAX_PATH)`)
    }
    if (fm.id && String(fm.id).trim() !== id) w.push(`프론트매터 id(${fm.id})를 파일명에 맞춰 바꾼다 — 검사는 id = 파일명을 요구한다`)

    // 충돌 — 접미
    let to = `work/${id}.md`
    if (used.has(to)) {
      const n = used.get(to) + 1
      used.set(to, n)
      id = `${id}-${n}`
      to = `work/${id}.md`
      w.push(`같은 이름이 있어 -${n} 을 붙였다`)
    } else used.set(to, 1)

    // title · author
    const title = fm.title ? String(fm.title).trim() : firstH1(body) || (lead.rest || base)
    let who = fm.author ? String(fm.author).trim() : author
    let authorSource = fm.author ? 'frontmatter' : author ? '--author' : null
    if (!who && gitRoot) {
      const relToGit = path.relative(gitRoot, abs).split(path.sep).join('/')
      const a = await git(gitRoot, ['log', '--diff-filter=A', '--follow', '--format=%an', '--', relToGit])
      const first = a ? a.split(NL).filter(Boolean).at(-1) : null
      if (first) {
        who = first
        authorSource = 'git'
      }
    }
    if (!who) {
      who = 'import'
      authorSource = 'default'
    }

    // touches — 프론트매터에 있고 좌표 모양인 것만 본다. 추측하지 않는다.
    // 기본은 **tags 로 보존**한다 — 등록부에 걸리는 좌표가 touches 에 서면 그 섹션의
    // 파생이 필수가 되고(설계서 §1.5), 기계는 그 섹션을 채울 수 없다. `keepTouches`
    // 는 그것을 알고 쓰는 사람의 것이다.
    const candidates = toArr(fm.touches).filter((c) => COORD.test(c))
    const droppedTouches = toArr(fm.touches).filter((c) => !COORD.test(c))
    if (droppedTouches.length) w.push(`좌표 모양이 아닌 touches 를 버렸다: ${droppedTouches.join(', ')}`)
    const touches = keepTouches ? candidates : []
    const tags = [...toArr(fm.tags)]
    if (!keepTouches && candidates.length) {
      for (const c of candidates) tags.push('touches/' + c)
      w.push(`touches ${candidates.length}건을 tags(touches/…) 로 보존했다 — P2 에서 touches 로 올린다`)
    }

    // tags — + 모르는 필드 (key/value) · status 는 소거
    const dropped = []
    for (const [k, v] of Object.entries(fm)) {
      if (KNOWN.has(k)) continue
      if (v == null || v === '') {
        dropped.push(k)
        continue
      }
      if (typeof v === 'object' && !Array.isArray(v)) {
        dropped.push(k)
        continue
      }
      for (const one of toArr(v)) tags.push(`${k}/${one}`.replace(/\s+/g, '_'))
    }
    if (fm.status != null) dropped.push(`status=${String(fm.status)}`)

    // 본문의 상대 링크 — 옮긴 자리로
    const fromDir = dir === '.' ? '' : dir
    const rewritten = rewriteLinks(body, fromDir, moved)

    files.push({
      kind: 'work',
      from: rel,
      to,
      id,
      title,
      date,
      dateSource,
      author: who,
      authorSource,
      source: fm.source ? String(fm.source).trim() : null,
      touches,
      supersedes: toArr(fm.supersedes),
      attachments: toArr(fm.attachments),
      tags: [...new Set(tags)],
      dropped,
      hadFm,
      body: rewritten,
      warnings: w,
    })
    moved.set(rel, to.slice('work/'.length))
  }

  // 3) md 사이의 링크도 다시 쓴다 — 자산과 같은 표를 두 번째로 적용한다
  for (const f of files) {
    if (f.kind !== 'work') continue
    const fromDir = path.posix.dirname(f.from) === '.' ? '' : path.posix.dirname(f.from)
    f.body = rewriteLinks(f.body, fromDir, moved)
  }

  // 이미 레포에 같은 이름이 있으면 — 기존 기록은 고치지 않는다(§4.5)
  for (const f of files) {
    if (await fs.access(path.join(R, f.to)).then(() => true).catch(() => false)) {
      f.warnings = [...(f.warnings || []), '레포에 같은 파일이 이미 있다 — 건너뛴다 (기존 기록은 고치지 않는다)']
      f.skip = true
    }
  }

  const works = files.filter((f) => f.kind === 'work')
  const assets = files.filter((f) => f.kind === 'asset')
  const summary = {
    works: works.length,
    assets: assets.length,
    skipped: files.filter((f) => f.skip).length,
    dateSources: works.reduce((a, f) => ((a[f.dateSource] = (a[f.dateSource] || 0) + 1), a), {}),
    withTouches: works.filter((f) => f.touches.length).length,
    touchCandidates: works.filter((f) => f.tags.some((t) => t.startsWith('touches/'))).length,
    dropped: works.reduce((a, f) => a + f.dropped.length, 0),
  }
  if (!works.length) warnings.push('들일 md 가 없다')
  if (summary.withTouches === 0 && works.length) {
    warnings.push(
      summary.touchCandidates
        ? `좌표가 하나도 없다 — 의도다. 원본의 touches ${summary.touchCandidates}건은 tags(touches/…) 에 보존됐다. P2(사람 · LLM · cdp-import)가 올린다`
        : '좌표가 하나도 없다 — 의도다. P2(사람 · LLM · cdp-import)가 채운다'
    )
  }
  return { src: S, repo: R, gitRoot, files, warnings, summary }
}

function renderWork(f) {
  const fm = ['---', `id: ${f.id}`, `title: ${yamlStr(f.title)}`, `date: ${f.date}`, `author: ${yamlStr(f.author)}`]
  if (f.source) fm.push(`source: ${yamlStr(f.source)}`)
  fm.push('touches:' + (f.touches.length ? '' : ' []'))
  for (const c of f.touches) fm.push(`  - ${c}`)
  if (f.supersedes.length) fm.push(`supersedes: ${f.supersedes[0]}`)
  if (f.attachments.length) fm.push(`attachments: [${f.attachments.map(yamlStr).join(', ')}]`)
  if (f.tags.length) fm.push(`tags: [${f.tags.map(yamlStr).join(', ')}]`)
  fm.push('---', '')
  return fm.join(NL) + NL + f.body.replace(/\s*$/, '') + NL
}

// YAML 에서 그대로 두면 깨지는 값(콜론 · 대괄호 · 따옴표 · # )은 인용한다
function yamlStr(s) {
  const v = String(s ?? '')
  return /[:#\[\]{}&*!|>'"%@`,]|^\s|\s$|^$/.test(v) ? JSON.stringify(v) : v
}

/**
 * 적용 — 쓴다. 끝에 검사. error 가 있으면 쓴 것을 지우고 E_CHECK.
 */
export async function applyImport(plan) {
  const R = plan.repo
  const written = []
  try {
    for (const f of plan.files) {
      if (f.skip) continue
      const dst = path.join(R, f.to)
      await fs.mkdir(path.dirname(dst), { recursive: true })
      if (f.kind === 'asset') await fs.copyFile(path.join(plan.src, f.from), dst)
      else await fs.writeFile(dst, renderWork(f), 'utf8')
      written.push(dst)
    }
    const r = await loadRepo(R, { settings: { settledness: { excludeTypes: ['domain'] } } })
    const res = runBuiltinCheck({
      docs: r.docs,
      vocabText: r.vocabText,
      managedText: r.managedText,
      vocab: r.vocab,
      validity: r.validity,
      indexInfo: r.indexInfo,
      managedIndex: r.managedIndex,
      sections: r.sections,
      bodies: r.bodies,
    })
    const errors = res.findings.filter((f) => f.sev === 'error')
    if (errors.length) {
      for (const p of written) await fs.rm(p, { force: true }).catch(() => {})
      throw new CtxError('E_CHECK', '들인 뒤 검사에서 오류가 났다 — 쓴 것을 지웠다', { findings: errors })
    }
    return {
      written: written.length,
      works: plan.files.filter((f) => f.kind === 'work' && !f.skip).length,
      assets: plan.files.filter((f) => f.kind === 'asset' && !f.skip).length,
      warnings: res.findings.filter((f) => f.sev === 'warn').map((f) => `${f.label} ${f.items.length}건`),
    }
  } catch (e) {
    if (!(e instanceof CtxError)) for (const p of written) await fs.rm(p, { force: true }).catch(() => {})
    throw e
  }
}
