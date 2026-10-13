// 원천 문서 레포 — 읽기(git ls-tree · show · log · diff) · 따라가기(follow) · 업데이트 초안(update) · 서버의 원천 연결.
// MCP 만으로 검토 v0.1 M2 · M4 · M5 · M8.
//
// **원천에는 쓰지 않는다.** 같은 함수를 두 자리가 부른다 —
//   CLI(`ctx follow · update · seed`)   작업 트리가 있는 로컬 레포(`-C <top>`) · 지도는 작업 트리의 파일
//   서버(MCP `source`)                  `<data>/sources/<레포>.git`(bare · `--git-dir`) · 지도는 받은 커밋의 파일
// 판정은 하지 않는다(S8) — 재료와 초안만 낸다. 출력은 데이터다(찍는 것은 CLI 의 일).

import fs from 'node:fs'
import fsp from 'node:fs/promises'
import path from 'node:path'
import { execFile, execFileSync } from 'node:child_process'
import { CtxError } from './errors.js'
import { parseSeedMap, docSections, coordMap, SEED_FILE } from './seedmap.js'
import { recordKind } from './curation.js'
import { isSsh, sshPaths, sshCommand } from './gitauth.js'
import { maskUrl } from './git.js'
import { initMap, checkMap, seedApply, seedVerify } from './seedrun.js'
import { toolSection, toolBrief } from './tools.js'
import { baselineInput } from './baseline.js'
import { loadRepo } from './repo.js'

const NL = '\n'

// 「왜」 안내 줄 — 초안이 넣고 세션이 지운다. 남아 있으면 save 가 거절한다(M6 · core/save.js)
export const WHY = '<!-- 왜: 세션이 채운다 — 왜 바꿨나 · 버린 안 · 근거(회의 · 회신 · 실측). 이 줄을 지워야 저장된다 -->'
export const WHY_MARK = '<!-- 왜: 세션이 채운다'
export const DIFF_LINES = 80

// ── 원천 열기 ─────────────────────────────────────────────────────────────────

// { top } 작업 트리 · 또는 { gitDir } bare. at 생략이면 HEAD(bare 는 ref 를 준다)
// name — 출처 줄의 레포 이름(CLI 는 폴더 이름 · 서버는 원천 주소의 끝 조각)
export function openSource({ top = null, gitDir = null, at = null, name = null }) {
  const base = gitDir ? ['--git-dir', gitDir] : ['-C', top]
  const git = (args, buffer = false) => execFileSync('git', [...base, '-c', 'core.quotePath=false', ...args], { encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
  const sha = git(['rev-parse', '--short', at || 'HEAD']).trim()
  // 지도 — 작업 트리면 파일(커밋 전 고친 지도도 본다 · 옛 CLI 그대로), bare 면 그 커밋의 것(S1)
  let mapText = null
  let mapPath
  if (gitDir) {
    mapPath = `${sha}:${SEED_FILE}`
    try {
      mapText = git(['show', mapPath])
    } catch {}
  } else {
    mapPath = path.join(top, SEED_FILE)
    if (fs.existsSync(mapPath)) mapText = fs.readFileSync(mapPath, 'utf8')
  }
  const map = mapText != null ? parseSeedMap(mapText) : null
  const root = map?.root ?? ''
  const pre = root ? root + '/' : ''
  const list = (rev) =>
    git(['ls-tree', '-r', '-z', '--name-only', rev, '--', root || '.'])
      .split('\0')
      .filter(Boolean)
      .map((f) => (pre && f.startsWith(pre) ? f.slice(pre.length) : f))
  const show = (rev, rel) => {
    try {
      return git(['show', `${rev}:${pre}${rel}`]).replace(/\r\n/g, NL)
    } catch {
      return null
    }
  }
  const showBuf = (rev, rel) => git(['show', `${rev}:${pre}${rel}`], true)
  return {
    top: top || gitDir,
    name: name || path.posix.basename(String(top || gitDir).replace(/\\/g, '/')).replace(/\.git$/, ''),
    git,
    map,
    mapPath,
    at: sha,
    files: list(sha),
    list,
    read: (rel) => show(sha, rel),
    show,
    readBuf: (rel) => showBuf(sha, rel),
  }
}

const logOf = (s, range) =>
  s
    .git(['log', '--reverse', '--format=%h%x09%ci%x09%s', range, '--', s.map.root || '.'])
    .trim()
    .split(NL)
    .filter(Boolean)
    .map((l) => l.split('\t'))

// ── 바뀐 좌표 ─────────────────────────────────────────────────────────────────

export function changedCoords(s, map, from, to) {
  const files = s.git(['diff', '--name-status', '-z', from, to, '--', map.root || '.']).split('\0').filter(Boolean)
  const pre = map.root ? map.root + '/' : ''
  const rows = []
  for (let i = 0; i < files.length; ) {
    const st = files[i++]
    const a = files[i++]
    const b = /^[RC]/.test(st) ? files[i++] : null
    const strip = (f) => (pre && f.startsWith(pre) ? f.slice(pre.length) : f)
    rows.push({ st: st[0], f: strip(b || a), old: b ? strip(a) : null })
  }
  const coords = []
  const vocab = []
  const changed = []
  const records = []
  const outside = []
  for (const { st, f, old } of rows) {
    const d = map.docs.find((x) => x.src === f || x.src === old)
    if (d) {
      const A = coordMap(d, s.show(from, old || f), map)
      const B = coordMap(d, s.show(to, f), map)
      for (const k of new Set([...A.keys(), ...B.keys()])) {
        if (A.get(k) === B.get(k)) continue
        coords.push(k)
        changed.push({ coord: k, a: A.get(k), b: B.get(k) })
        if (!A.has(k)) {
          const x = docSections(d, s.show(to, f), map).find((y) => y.coord === k)
          if (x) vocab.push({ coord: k, label: x.label, ...(x.aliases ? { aliases: x.aliases } : {}) })
        }
      }
      continue
    }
    const rec = map.records.find((x) => x.src === f || x.src === old)
    if (rec) records.push({ f, id: rec.id, st })
    else outside.push(`${st} ${f}${old ? ' ← ' + old : ''}`)
  }
  return { coords: [...new Set(coords)], changed, records, outside, vocab }
}

// ── follow ───────────────────────────────────────────────────────────────────

// 커밋마다 — 바뀐 좌표에 그 뒤 기록이 있나(touches 또는 출처가 그 커밋을 가리킴). works 는 지식 레포의 기록 전부
export function followReport(s, { since, works = [] }) {
  if (!s.map) throw new CtxError('E_INPUT', `${s.mapPath} 가 없다`, { map: SEED_FILE })
  if (!since) throw new CtxError('E_INPUT', 'since <지난 점검 sha> 가 필요하다(처음은 세운 sha)', { field: 'since' })
  const human = works.filter((w) => recordKind(w) === 'work')
  const commits = logOf(s, `${since}..${s.at}`)
  // 지도의 skip — 원천을 위키에 맞춘 커밋 · 기록을 일부러 두지 않은 커밋(sha 앞자리가 같으면 같은 커밋)
  const skipOf = (h) => Object.entries(s.map.skip || {}).find(([k]) => k.startsWith(h) || h.startsWith(k))?.[1]
  const rows = []
  let miss = 0
  let skipped = 0
  for (const [h, when, subj] of commits) {
    const why = skipOf(h)
    if (why) {
      skipped++
      rows.push({ sha: h, date: when.slice(0, 16), subject: subj, skip: why })
      continue
    }
    const x = changedCoords(s, s.map, `${h}^`, h)
    const after = human.filter((w) => String(w.date || '') >= when.slice(0, 10))
    // 출처로 잇는 것은 그 커밋을 **가리킨** 기록만 — `커밋 <sha>` · `@<sha>` · 범위의 끝 `..<sha>`. 범위의 시작(`<sha>..`)은 그 커밋을 빼는 쪽이다
    const cites = new RegExp(`(커밋 |@|\\.\\.)${h}`)
    const coords = x.coords.map((c) => ({ coord: c, by: after.filter((w) => (w.touches || []).includes(c) || cites.test(String(w.source || ''))).map((w) => w.id) }))
    const ok = x.coords.length ? coords.every((y) => y.by.length) : !x.records.length
    if (!ok) miss++
    rows.push({ sha: h, date: when.slice(0, 16), subject: subj, ok, coords, records: x.records.map((y) => y.id), outside: x.outside })
  }
  const counted = commits.length - skipped
  return { range: { since, at: s.at }, commits: rows, total: commits.length, miss, skipped, rate: counted ? Math.round((miss / counted) * 100) : null }
}

// ── update 초안 ──────────────────────────────────────────────────────────────

export const lineDiff = (a = '', b = '') => {
  const A = String(a).split(NL).filter((l) => l.trim())
  const B = String(b).split(NL).filter((l) => l.trim())
  const sa = new Set(A)
  const sb = new Set(B)
  return [...A.filter((l) => !sb.has(l)).map((l) => '- ' + l), ...B.filter((l) => !sa.has(l)).map((l) => '+ ' + l)]
}

// from..to 의 커밋을 업데이트 기록 하나로 — `{ work, vocab }`. 「## 왜」 는 안내 줄(WHY)로 비워 둔다 — 세션이 채운다.
// recordLines — 바뀐 작업문서 원문을 몇 줄까지 싣나(서버의 출력 상한 · CLI 는 전부)
export function updateDraft(s, { from, to: to0 = null, recordLines = Infinity }) {
  if (!s.map) throw new CtxError('E_INPUT', `${s.mapPath} 가 없다`, { map: SEED_FILE })
  if (!from) throw new CtxError('E_INPUT', 'from <작업 전 sha> 가 필요하다', { field: 'from' })
  const to = s.git(['rev-parse', '--short', to0 || s.at]).trim()
  const commits = logOf(s, `${from}..${to}`)
  if (!commits.length) throw new CtxError('E_INPUT', `${from}..${to} 에 문서 커밋이 없다`, { from, to })
  const x = changedCoords(s, s.map, from, to)
  const last = commits[commits.length - 1]
  const date = last[1].slice(0, 16)
  const cut = (t) => {
    if (t == null || !Number.isFinite(recordLines)) return t
    const ls = t.split(NL)
    return ls.length > recordLines ? [...ls.slice(0, recordLines), `… ${ls.length - recordLines}줄 더`].join(NL) : t
  }
  const work = {
    id: `${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-업데이트-${to}`,
    title: `[업데이트] ${s.name} ${to} — ${last[2]}`.slice(0, 200),
    date,
    touches: x.coords,
    ...(x.coords.length ? {} : { touchesEmpty: '관리 문서 섹션은 그대로 — 작업문서만 바뀌었다' }),
    tags: ['업데이트'],
    source: `${s.name} ${from}..${to}`,
    body: [
      `원천 문서 레포의 커밋(${from}..${to})을 지식 레포로 넘기는 업데이트 기록이다 — 큐레이터가 누락을 메운다. 반영은 큐레이터가 한다.`,
      '',
      '## 왜',
      '',
      WHY,
      '',
      '## 커밋',
      '',
      ...commits.map(([h, c, sj]) => `- ${h} ${c.slice(0, 16)} ${sj}`),
      '',
      '## 바뀐 섹션',
      '',
      ...(x.changed.length
        ? x.changed.flatMap((y) => {
            const lines = lineDiff(y.a, y.b)
            return [`### \`${y.coord}\`${y.a == null ? ' (새 섹션)' : y.b == null ? ' (없어짐)' : ''}`, '', '```diff', ...lines.slice(0, DIFF_LINES), ...(lines.length > DIFF_LINES ? [`… ${lines.length - DIFF_LINES}줄 더`] : []), '```', '']
          })
        : ['(없음)', '']),
      ...(x.records.length ? ['## 바뀐 작업문서(그 판의 원문)', '', ...x.records.flatMap((y) => [`### ${y.f} — 앞 판은 \`${y.id}\``, '', cut(s.show(to, y.f)) ?? '(지워짐)', ''])] : []),
      ...(x.outside.length ? ['## 지도 밖 파일 — 분류가 필요하면 큐레이터에게(cdp-sources.json)', '', ...x.outside.map((y) => '- ' + y), ''] : []),
    ].join(NL),
  }
  return { to, commits: commits.map(([h, c, sj]) => ({ sha: h, date: c.slice(0, 16), subject: sj })), work, vocab: x.vocab, coords: x.coords, records: x.records, outside: x.outside }
}

// 「왜」 가 비었나 — 안내 줄이 남았거나 태그 `업데이트` 인데 `## 왜` 절에 글이 없다(M6)
export function whyMissing(w) {
  const body = String(w?.body || '')
  if (body.includes(WHY_MARK)) return '「왜」 안내 줄(<!-- 왜: 세션이 채운다 …-->)이 남아 있다 — 지우고 이유를 쓴다'
  if ((w?.tags || []).includes('업데이트')) {
    const m = /^## 왜[ \t]*$/m.exec(body)
    if (!m) return '태그 업데이트 기록에 「## 왜」 절이 없다 — 왜 바꿨나 · 근거를 쓴다'
    const rest = body.slice(m.index + m[0].length)
    const next = rest.search(/^#{1,2} /m)
    const sec = (next < 0 ? rest : rest.slice(0, next)).replace(/<!--[\s\S]*?-->/g, '').trim()
    if (!sec) return '태그 업데이트 기록의 「## 왜」 가 비었다 — 왜 바꿨나 · 근거를 쓴다'
  }
  return null
}

// ── 서버의 원천 연결(M2 · M3) ────────────────────────────────────────────────
//
// 설정 `<data>/sources.json` = { repos: { <지식 레포>: { url, branch } } } · 받은 것 `<data>/sources/<레포>.git`(bare).
// 받은 커밋은 `refs/heads/source` 하나에 둔다 — 브랜치를 안 주면 원천의 HEAD.

const SOURCES_FILE = 'sources.json'
export const SOURCE_REF = 'refs/heads/source'
export const FETCH_MS = 30000
const BRANCH_RE = /^[A-Za-z0-9._/-]{1,100}$/
const URL_RE = /^(https?:\/\/|ssh:\/\/|git@|file:\/\/|\/|[A-Za-z]:[\\/])/

export const sourceDir = (dataDir, name) => path.join(path.resolve(dataDir), 'sources', `${name}.git`)

export async function loadSources(dataDir) {
  try {
    const j = JSON.parse(await fsp.readFile(path.join(dataDir, SOURCES_FILE), 'utf8'))
    return j && typeof j.repos === 'object' && j.repos ? j : { repos: {} }
  } catch {
    return { repos: {} }
  }
}

export async function sourceOf(dataDir, name) {
  return (await loadSources(dataDir)).repos[name] || null
}

// url 이 비면 연결을 끊는다(받아 둔 bare 는 지운다 — 원천의 사본일 뿐이다)
export async function setSource(dataDir, name, { url = '', branch = '' } = {}) {
  const u = String(url || '').trim()
  const b = String(branch || '').trim()
  if (u && (!URL_RE.test(u) || /\s/.test(u))) throw new CtxError('E_INPUT', '원천 주소는 http(s)://… · ssh://git@… 모양이다', { field: 'url' })
  if (b && (!BRANCH_RE.test(b) || b.includes('..'))) throw new CtxError('E_INPUT', '브랜치 이름이 아니다', { field: 'branch' })
  const db = await loadSources(dataDir)
  const before = db.repos[name] || null
  if (u) db.repos[name] = { url: u, branch: b || null }
  else delete db.repos[name]
  await fsp.mkdir(dataDir, { recursive: true })
  await fsp.writeFile(path.join(dataDir, SOURCES_FILE), JSON.stringify(db, null, 1) + NL)
  if (!u || (before && before.url !== u)) await fsp.rm(sourceDir(dataDir, name), { recursive: true, force: true }).catch(() => {})
  return db.repos[name] || null
}

function runGit(args, { env, timeout }) {
  return new Promise((resolve) => {
    execFile('git', args, { env, timeout, windowsHide: true, encoding: 'utf8', maxBuffer: 4 << 20 }, (e, out, err) => resolve({ ok: !e, out: String(out || '').trim(), err: String(err || '').trim(), timedOut: !!e?.killed }))
  })
}

// 같은 레포의 fetch 둘이 같은 ref 를 두고 다투지 않게 — 프로세스 안 줄 세우기
const chains = new Map()
function serial(key, fn) {
  const prev = chains.get(key) || Promise.resolve()
  const next = prev.catch(() => {}).then(fn)
  chains.set(key, next.finally(() => chains.get(key) === next && chains.delete(key)))
  return next
}

// 받는다 — 처음이면 bare 를 세우고, 매번 fetch(30초). 실패하면 마지막 받은 것 + 경고. 한 번도 못 받았으면 E_SOURCE
export function syncSource(dataDir, name, cfg, { timeout = FETCH_MS, env = process.env } = {}) {
  const dir = sourceDir(dataDir, name)
  return serial(dir, async () => {
    const e = { ...env, GIT_TERMINAL_PROMPT: '0' }
    if (isSsh(cfg.url) && fs.existsSync(sshPaths(dataDir).key)) e.GIT_SSH_COMMAND = sshCommand(dataDir)
    if (!fs.existsSync(path.join(dir, 'HEAD'))) {
      await fsp.mkdir(dir, { recursive: true })
      const r = await runGit(['init', '--bare', '-q', dir], { env: e, timeout: 10000 })
      if (!r.ok) throw new CtxError('E_SOURCE', '원천 사본을 세우지 못했다 — ' + (r.err.split(NL)[0] || ''), { dir })
    }
    const spec = `+${cfg.branch ? 'refs/heads/' + cfg.branch : 'HEAD'}:${SOURCE_REF}`
    const r = await runGit(['--git-dir', dir, 'fetch', '--quiet', '--no-tags', cfg.url, spec], { env: e, timeout })
    const have = (await runGit(['--git-dir', dir, 'rev-parse', '--verify', '--quiet', SOURCE_REF], { env: e, timeout: 10000 })).ok
    const fetchedAt = fs.existsSync(path.join(dir, 'FETCH_HEAD')) ? new Date(fs.statSync(path.join(dir, 'FETCH_HEAD')).mtimeMs).toISOString() : null
    if (r.ok) return { dir, fresh: true, fetchedAt, warning: null }
    const why = r.timedOut ? `${Math.round(timeout / 1000)}초 안에 못 받았다` : maskUrl(r.err.split(NL).filter(Boolean).pop() || '받지 못했다')
    if (!have) throw new CtxError('E_SOURCE', `원천을 받지 못했다 — ${why} · 콘솔 레포 설정의 「연결 시험」 · git 자격(배포 키 · PAT)을 본다`, { url: maskUrl(cfg.url) })
    return { dir, fresh: false, fetchedAt, warning: `원천 fetch 실패(${why}) — 마지막으로 받은 것(${fetchedAt || '시각 모름'})으로 답한다` }
  })
}

// ── MCP `source` (M4) ────────────────────────────────────────────────────────

export const FOLLOW_MAX = 300
export const RECORD_LINES = 200
export const APPLY_LINES = 400

const seedSha = (seed) => /@([0-9a-f]{4,40})\s*$/i.exec(String(seed?.from || ''))?.[1] || null
const nameFromUrl = (u) => String(u).replace(/[\\/]+$/, '').split(/[\\/:]/).pop().replace(/\.git$/, '') || 'source'

// r — 지식 레포(loadRepo · 캐시) · a — { op, since?, from?, to? }
// seed — { save(input), upload(rel, buf, type) } 세우기(plan · apply)의 쓰기 길. 서버가 같은 프로세스의 core/save.js 를 준다(M7)
export async function toolSource(r, a, { dataDir, name, sync = syncSource, seed = null }) {
  const cfg = await sourceOf(dataDir, name)
  if (!cfg) throw new CtxError('E_NO_SOURCE', '콘솔 레포 설정에서 원천 git 주소를 넣는다', { repo: name })
  const got = await sync(dataDir, name, cfg)
  const s = openSource({ gitDir: got.dir, at: SOURCE_REF, name: nameFromUrl(cfg.url) })
  const head = { source: { url: maskUrl(cfg.url), branch: cfg.branch || null, at: s.at, fetchedAt: got.fetchedAt }, ...(got.warning ? { warnings: [got.warning] } : {}) }
  const git = (fn) => {
    try {
      return fn()
    } catch (e) {
      if (e instanceof CtxError) throw e
      // 모르는 sha · 지운 브랜치 — git 의 stderr 첫 줄만
      throw new CtxError('E_INPUT', 'git 이 거절했다 — ' + (String(e?.stderr || e?.message || e).split(NL).find((l) => l.trim()) || ''), {})
    }
  }
  if (['follow', 'update'].includes(a.op) && !s.map) throw new CtxError('E_INPUT', `원천에 ${SEED_FILE} 가 없다 — source({ op: "init" }) 의 뼈대를 고쳐 원천 레포 루트에 커밋한다(cdp-seed)`, { at: s.at })
  if (a.op === 'follow') {
    const since = a.since || seedSha(r.seed)
    if (!since) throw new CtxError('E_INPUT', 'since 가 없고 _seed.json 에 세운 sha(from 의 @sha)도 없다 — since 를 준다', { field: 'since' })
    const f = git(() => followReport(s, { since, works: r.works }))
    const out = { ...head, ...f, ...(a.since ? {} : { sinceFrom: '_seed.json' }) }
    if (f.commits.length > FOLLOW_MAX) {
      out.commits = f.commits.slice(-FOLLOW_MAX)
      out.truncated = { shown: FOLLOW_MAX, total: f.commits.length, hint: `앞 커밋 ${f.commits.length - FOLLOW_MAX}개는 뺐다 — 누락 수(miss)는 전부의 것 · 앞쪽을 보려면 since 를 좁힌다` }
    }
    return out
  }
  if (a.op === 'update') {
    const u = git(() => updateDraft(s, { from: a.from, to: a.to || null, recordLines: RECORD_LINES }))
    return { ...head, draft: { work: u.work, ...(u.vocab.length ? { vocab: u.vocab } : {}) }, coords: u.coords, records: u.records, outside: u.outside, next: '「## 왜」 의 안내 줄을 지우고 이유를 쓴 뒤 save({ work, vocab }) — 안내 줄이 남으면 E_CHECK' }
  }
  if (a.op === 'init') {
    // 원천에 쓰지 않는다 — 사람이 이 JSON 을 원천 레포 루트에 cdp-sources.json 으로 커밋한다
    const map = git(() => initMap(s, { root: a.root ?? '' }))
    return { ...head, map, exists: !!s.map, next: `원천 레포 루트에 ${SEED_FILE} 로 커밋한다(분류 · 좌표 타입 · 서식 · 종류 · 기록 날짜 · touches 를 고친 뒤) — 서버는 원천에 쓰지 않는다${s.map ? ' · 이미 지도가 있다 — 이것은 비교용 뼈대다' : ''}` }
  }
  if (!s.map) throw new CtxError('E_INPUT', `원천에 ${SEED_FILE} 가 없다 — source({ op: "init" }) 의 뼈대를 고쳐 원천 레포 루트에 커밋한다(cdp-seed)`, { at: s.at })
  if (a.op === 'map') {
    const check = git(() => checkMap(s))
    return { ...head, at: s.at, map: s.map, check: { ok: !check.errors.length, errors: check.errors, warnings: check.warnings, docs: check.docs, sections: check.docs.reduce((n, d) => n + d.sections, 0), records: check.records } }
  }
  if (a.op === 'verify') {
    const v = git(() => seedVerify(s, r, { date: a.date || undefined }))
    return { ...head, ...v }
  }
  if (a.op === 'plan' || a.op === 'apply') {
    if (!seed) throw new CtxError('E_INPUT', '이 서버는 세우기를 받지 않는다', { op: a.op })
    if (a.stage && !['baseline', 'managed', 'records'].includes(a.stage)) throw new CtxError('E_INPUT', 'stage 는 baseline · managed · records 다', { field: 'stage' })
    const dry = a.op === 'plan' || a.dryRun !== false
    const repoNow = () => loadRepo(r.root)
    const ops = {
      exists: async (coord) => {
        if (!coord) return false
        try {
          const v = toolSection(await repoNow(), { coord })
          return v.state !== 'missing' && v.content != null
        } catch {
          return false
        }
      },
      upload: (rel, buf, type) => seed.upload(rel, buf, type),
      save: (input) => seed.save(input),
      baseline: async (body) => {
        const o = await seed.save(baselineInput(body))
        return { commit: o.commit, baseline: o.baseline ?? body.items.length }
      },
      brief: async () => toolBrief(await repoNow()),
    }
    const lines = []
    const res = await seedApply(s, ops, { dry, day: a.date || undefined, stage: a.stage || null, only: a.only || null, server: 'mcp', repo: name, out: (t) => lines.push(t) })
    const shown = lines.length > APPLY_LINES ? [...lines.slice(0, APPLY_LINES), `… ${lines.length - APPLY_LINES}줄 더 — stage · only 로 나눠 부른다`] : lines
    return { ...head, ...res, lines: shown, ...(dry ? { next: '같은 인자로 op: "apply", dryRun: false — 단계(stage)나 문서 하나(only)씩 나눠 부르면 한 호출이 짧다' } : {}) }
  }
  throw new CtxError('E_INPUT', 'op 는 map · init · follow · update · plan · apply · verify 다', { field: 'op' })
}
