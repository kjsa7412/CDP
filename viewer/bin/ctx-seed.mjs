// ctx seed · follow · update — 기존 문서 레포에서 지식 레포를 세우고, 정본 둘을 잇는다. 문서레포 세우기 검토 v0.1 §4.
//
//   ctx seed init|check [--from <문서 레포>]
//   ctx seed plan|apply --server <주소> --repo <레포> [--from …] [--at <sha>] [--stage baseline|managed|records] [--only <key|id>] [--date <YYYY-MM-DD>]
//   ctx seed verify --clone <지식 레포 클론> [--from …] [--at <sha>]
//   ctx follow --clone <클론> --since <sha> [--from …]
//   ctx update [--from …] <from sha> [<to sha>]   ·   ctx update --save <초안> [--server … --repo …] [--go]
//
// 원천 문서 레포는 **읽기만** 한다(git ls-tree · show). 쓰는 길은 서버의 기존 길 — MCP save · /assets · /baseline(검토 S3). 세우는 흔적은 기록이 아니라 _seed.json 하나다(S13).
// 판정(큐레이션)은 하지 않는다(S8) — apply 는 대기열을 세워 두고 끝난다.

import fs from 'node:fs'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { parseSeedMap, checkSeedMap, docSections, appendixOf, coordMap, linkTable, relink, expandTouches, transferId, normForCompare, SEED_FILE } from '../../core/seedmap.js'

const NL = '\n'
const WHY = '<!-- 왜: 세션이 채운다 — 왜 바꿨나 · 버린 안 · 근거(회의 · 회신 · 실측). 이 줄을 지워야 저장된다 -->'
const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.html': 'text/html', '.htm': 'text/html' }

const today = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── 원천 문서 레포 ──────────────────────────────────────────────────────────────

function source(opt) {
  const start = path.resolve(opt.from || process.cwd())
  let top
  try {
    top = execFileSync('git', ['-C', start, 'rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
  } catch {
    throw new Error(`${start} 는 git 레포가 아니다 — --from <문서 레포>`)
  }
  const git = (args, buffer = false) => execFileSync('git', ['-C', top, '-c', 'core.quotePath=false', ...args], { encoding: buffer ? 'buffer' : 'utf8', maxBuffer: 256 << 20, stdio: ['ignore', 'pipe', 'pipe'] })
  const mapPath = path.join(top, SEED_FILE)
  const hasMap = fs.existsSync(mapPath)
  const map = hasMap ? parseSeedMap(fs.readFileSync(mapPath, 'utf8')) : null
  const at = git(['rev-parse', '--short', opt.at || 'HEAD']).trim()
  const root = map?.root ?? ''
  const pre = root ? root + '/' : ''
  const list = (sha) =>
    git(['ls-tree', '-r', '-z', '--name-only', sha, '--', root || '.'])
      .split('\0')
      .filter(Boolean)
      .map((f) => (pre && f.startsWith(pre) ? f.slice(pre.length) : f))
  const show = (sha, rel) => {
    try {
      return git(['show', `${sha}:${pre}${rel}`]).replace(/\r\n/g, NL)
    } catch {
      return null
    }
  }
  const showBuf = (sha, rel) => git(['show', `${sha}:${pre}${rel}`], true)
  return { top, git, map, mapPath, at, files: list(at), list, read: (rel) => show(at, rel), show, readBuf: (rel) => showBuf(at, rel) }
}

// ── 서버 ──────────────────────────────────────────────────────────────────────

async function client(opt, map) {
  const server = String(opt.server || map?.target?.server || '').replace(/\/+$/, '')
  const repo = opt.repo || map?.target?.repo
  if (!server || !repo) throw new Error('--server <주소> --repo <레포> 가 필요하다(지도의 target 에 적어 둘 수 있다)')
  const token = String(process.env.CDP_TOKEN || '').trim() || (await (await import('../../core/tokenstore.js')).loadToken().catch(() => null))?.token
  if (!token) throw new Error('환경변수 CDP_TOKEN 이 없다')
  const auth = { authorization: 'Bearer ' + token }
  const rpc = async (name, args) => {
    const r = await fetch(`${server}/mcp/${encodeURIComponent(repo)}`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name, arguments: { repo, ...args } } }),
    })
    const t = await r.text()
    const line = t.split(NL).find((l) => l.startsWith('data: '))
    const j = JSON.parse(line ? line.slice(6) : t)
    const txt = j?.result?.content?.[0]?.text
    let value = j
    if (txt) {
      try {
        value = JSON.parse(txt)
      } catch {
        value = { error: { code: 'RAW', message: txt.slice(0, 1500) } }
      }
    }
    return { error: !!j?.result?.isError || !!j?.error, value }
  }
  const post = async (sub, body, type = 'application/json') => {
    const r = await fetch(`${server}/api/${encodeURIComponent(repo)}/${sub}`, { method: 'POST', headers: { ...auth, 'content-type': type }, body: type === 'application/json' ? JSON.stringify(body) : body })
    const j = await r.json().catch(() => null)
    if (!r.ok) throw new Error(`${sub} ${r.status} ${j?.error?.code || ''} ${j?.error?.message || JSON.stringify(j).slice(0, 300)}`)
    return j
  }
  return { server, repo, rpc, post }
}

const errOf = (v) => v?.error || v
const codeOf = (v) => errOf(v)?.code || ''

// ── seed init ───────────────────────────────────────────────────────────────

function nameOf(rel) {
  return path.posix
    .basename(rel, '.md')
    .replace(/^[A-Z]+_[\d.]+_/, '')
    .replace(/_(초안|v\d[\w.]*)$/g, '')
    .replace(/_(초안|v\d[\w.]*)$/g, '')
}

function runInit(opt, io) {
  const s = source(opt)
  if (s.map) throw new Error(`${s.mapPath} 가 이미 있다 — 고치려면 그 파일을 편집한다`)
  const root = opt.root ?? ''
  const pre = root ? root.replace(/\/+$/, '') + '/' : ''
  const files = s.git(['ls-tree', '-r', '-z', '--name-only', 'HEAD', '--', root || '.']).split('\0').filter(Boolean).map((f) => (pre && f.startsWith(pre) ? f.slice(pre.length) : f))
  const md = files.filter((f) => /\.md$/i.test(f))
  const isRecord = (f) => /(^|\/)(작업문서|회의록|주간보고|meeting|notes?)\//i.test(f)
  const docs = []
  const records = []
  for (const f of md) {
    const text = s.git(['show', `HEAD:${pre}${f}`]).replace(/\r\n/g, NL)
    if (isRecord(f)) {
      const first = s.git(['log', '--diff-filter=A', '--format=%ci', '--', pre + f]).trim().split(NL).pop() || ''
      const day = (first || today()).slice(0, 10)
      records.push({ id: `${day.slice(0, 4)}-${day.slice(5, 7)}${day.slice(8, 10)}-${nameOf(f).replace(/\s+/g, '-')}`, date: day, src: f, touches: [] })
      continue
    }
    const h2 = text.split(NL).filter((l) => /^## /.test(l))
    const named = h2.filter((l) => /^## \S+\s+[—–]\s+/.test(l)).length
    const numbered = h2.filter((l) => /^## \d+\.\s/.test(l)).length
    const name = nameOf(f)
    const dir = path.posix.dirname(f) === '.' ? '' : path.posix.dirname(f).split('/')[0] + '/'
    const base = { key: name.replace(/[^\p{L}\p{N}]+/gu, '').slice(0, 24) || 'doc' + docs.length, src: f, doc: `docs/${dir}${name}.md` }
    if (named >= 2 && named >= h2.length / 2) docs.push({ ...base, split: 'h2', type: name })
    else if (numbered >= 3) docs.push({ ...base, split: 'chapters', type: name, chapters: h2.filter((l) => /^## \d+\.\s/.test(l)).map((l, i) => `장${i + 1}`), preamble: '개요' })
    else docs.push({ ...base, split: 'whole', coord: `${name}:${name}`, label: name })
  }
  const map = { version: 1, root, docs, records, alias: {}, ignore: [], intent: {} }
  fs.writeFileSync(s.mapPath, JSON.stringify(map, null, 1) + NL)
  io.out(`ctx seed init: ${s.mapPath} — 문서 ${docs.length} · 기록 ${records.length} (뼈대다)`)
  io.out('  다음 — 분류(관리 문서 · 기록 · 들이지 않음) · 좌표 타입 · 서식 · 종류 · 기록 날짜 · touches 를 고친다(cdp-seed 스킬) → ctx seed check')
  return 0
}

// ── seed check ──────────────────────────────────────────────────────────────

function runCheck(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다 — ctx seed init`)
  const res = checkSeedMap(s.map, s.files, s.read)
  io.out(`ctx seed check: ${s.top} @${s.at} — 문서 ${res.docs.length} · 섹션 ${res.docs.reduce((a, d) => a + d.sections, 0)} · 기록 ${res.records}`)
  for (const d of res.docs) io.out(`   ${d.key.padEnd(10)} 섹션 ${d.sections}`)
  for (const e of res.errors) io.out('   오류: ' + e)
  for (const w of res.warnings) io.out('   경고: ' + w)
  return res.errors.length ? 1 : 0
}

// ── seed plan · apply ───────────────────────────────────────────────────────

async function runApply(opt, io, dry) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다 — ctx seed init`)
  const map = s.map
  const chk = checkSeedMap(map, s.files, s.read)
  if (chk.errors.length) {
    for (const e of chk.errors) io.err('   오류: ' + e)
    throw new Error('지도 검사에 오류가 있다 — ctx seed check')
  }
  const c = await client(opt, map)
  const day = opt.date || today()
  const sha = s.at
  const srcRef = (rel) => `${path.posix.basename(s.top)}@${sha}/${map.root ? map.root + '/' : ''}${rel}`
  const table = linkTable(map, s.files, day)
  const unlinked = new Map()
  const sectionsOf = (d) => docSections(d, s.read(d.src), map, (t) => relink(t, d.src, d.doc, table, unlinked))
  const stages = opt.stage ? [opt.stage] : ['baseline', 'managed', 'records']
  // 세운 자리(검토 S13) — 세우는 흔적은 작업 기록이 아니다. 구조 save 는 기록 파일 없이 `_seed.json` 의 sections 로,
  // 함께 들이는 기록은 `_seed.json` 의 records 로(판정 없이 반영됨). 섹션의 근거는 원천(from)이다 — 스냅샷을 뜨지 않는다
  const seed = { at: day, from: `${path.posix.basename(s.top)}@${sha}` }
  const only = (x) => !opt.only || opt.only === x
  const exists = async (coord) => {
    const r = await c.rpc('section', { coord })
    return !r.error && r.value && r.value.state !== 'missing' && r.value.content != null
  }
  const upload = async (rel) => {
    const ext = path.posix.extname(rel).toLowerCase()
    if (!TYPES[ext]) throw new Error(`첨부 종류를 받지 않는다(${ext}) — ${rel}`)
    const j = await c.post('assets', s.readBuf(rel), TYPES[ext])
    return { ref: j.ref, name: path.posix.basename(rel) }
  }
  // 하나씩 — 같은 바이트의 그림 둘을 동시에 올리면 서버 staging 의 같은 이름을 두고 다툰다(Windows EPERM)
  const uploadAll = async (list) => {
    const out = []
    for (const rel of list) out.push(await upload(rel))
    return out
  }
  const save = async (input, label) => {
    const d = await c.rpc('save', { ...input, dryRun: true })
    if (d.error) {
      if (codeOf(d.value) === 'E_EXISTS') return io.out(`   ${label} — 이미 있다(건너뜀)`)
      // 미리보기는 앞 단계를 쓰지 않는다 — 기록의 좌표는 이관이 어휘를 세운 뒤에야 등재된다
      if (dry && /어휘에 없는 좌표/.test(errOf(d.value)?.message || '')) return io.out(`   ${label} — 앞 단계(이관) 뒤에 통과할 것(${errOf(d.value)?.detail?.coord || ''} 가 아직 어휘에 없다)`)
      throw new Error(`${label} dryRun 거절 — ${JSON.stringify(errOf(d.value)).slice(0, 1200)}`)
    }
    const warn = (d.value.warnings || []).filter((w) => !/touches 가 비어|새 어휘 타입|없는 관리 문서를 가리키는 줄|그림 \d+개가 레포에 없다/.test(w))
    if (dry) return io.out(`   ${label} — dryRun 통과${warn.length ? ' · 경고 ' + warn.join(' / ').slice(0, 300) : ''}`)
    const o = await c.rpc('save', input)
    if (o.error) throw new Error(`${label} 거절 — ${JSON.stringify(errOf(o.value)).slice(0, 1200)}`)
    io.out(`   ${label} — 커밋 ${o.value.commit}${warn.length ? ' · 경고 ' + warn.join(' / ').slice(0, 300) : ''}`)
  }

  io.out(`ctx seed ${dry ? 'plan' : 'apply'}: ${s.top} @${sha} → ${c.server} ${c.repo} · 날 ${day}`)

  if (stages.includes('baseline')) {
    io.out('[기준선]')
    for (const d of map.docs.filter((x) => x.baseline != null && only(x.key))) {
      const secs = sectionsOf(d)
      if (!opt.stage && (await exists(secs[0]?.coord))) {
        io.out(`   ${d.key} — 이미 있다(건너뜀 · 다시 밀려면 --stage baseline)`)
        continue
      }
      if (dry) {
        io.out(`   ${d.key} — 블록 ${secs.length}(기준선은 dryRun 이 없다 — 숫자만)`)
        continue
      }
      const j = await c.post('baseline', {
        source: `${d.baseline} (${srcRef(d.src)})`,
        asof: day,
        managed: [{ op: 'add', pattern: `${d.type}:*`, doc: d.doc, ...(d.form ? { form: d.form } : { title: d.title || d.key }), ...(d.kind ? { kind: d.kind } : {}) }],
        vocab: secs.map((x) => ({ coord: x.coord, label: x.label })),
        items: secs.map((x) => ({ coord: x.coord, heading: x.heading, body: x.body })),
        seed,
      })
      io.out(`   ${d.key} — 커밋 ${j.commit} · 블록 ${j.baseline}`)
    }
  }

  if (stages.includes('managed')) {
    io.out('[관리 문서 이관]')
    for (const d of map.docs.filter((x) => x.baseline == null && only(x.key))) {
      const secs = sectionsOf(d)
      if (await exists(secs[0]?.coord)) {
        io.out(`   ${d.key} — 이미 있다(건너뜀)`)
        continue
      }
      const atts = [...(d.figs ? s.files.filter((f) => f.startsWith(d.figs + '/')) : []), ...(d.attach || [])]
      const assets = dry ? [] : await uploadAll(atts)
      const managed = [
        {
          op: 'add',
          pattern: d.split === 'whole' ? d.coord : `${d.type}:*`,
          doc: d.doc,
          ...(d.split === 'whole' ? { level: 0 } : {}),
          ...(d.form ? { form: d.form } : { title: d.title || d.key }),
          ...(d.kind ? { kind: d.kind } : {}),
        },
      ]
      await save(
        {
          work: {
            id: transferId(d, day),
            title: `이관 — ${path.posix.basename(d.src, '.md')} → ${d.doc}`,
            date: `${day} 09:00`,
            touches: [],
            touchesEmpty: `세우기(${sha})`,
            source: srcRef(d.src),
            body: [
              `세우기 — \`${d.src}\`(${sha}) → \`${d.doc}\` · 섹션 ${secs.length}${atts.length ? ` · 첨부 ${atts.length}` : ''}`,
            ].join(NL),
          },
          seed,
          vocab: secs.map((x) => ({ coord: x.coord, label: x.label, ...(x.aliases ? { aliases: x.aliases } : {}) })),
          managed,
          sections: secs.map((x) => ({ coord: x.coord, applied: null, ...(x.heading ? { heading: x.heading } : {}), body: x.body })),
          ...(assets.length ? { assets } : {}),
        },
        `${d.key}(섹션 ${secs.length})`
      )
    }
  }

  if (stages.includes('records')) {
    io.out('[작업 기록]')
    for (const r of map.records.filter((x) => only(x.id))) {
      let body
      let title = r.title
      let src
      if (r.src) {
        const raw = s.read(r.src)
        title ||= (raw.split(NL).find((l) => /^# /.test(l)) || '').replace(/^#\s+/, '').trim() || path.posix.basename(r.src, '.md')
        body = relink(raw.split(NL).filter((l, i) => !(i < 3 && /^# /.test(l))).join(NL).trim(), r.src, `work/${r.id}.md`, table, unlinked)
        src = srcRef(r.src)
      } else {
        const d = map.docs.find((x) => x.key === r.from)
        const a = appendixOf(s.read(d.src), map)
        body = relink(a.body, d.src, `work/${r.id}.md`, table, unlinked)
        src = `${srcRef(d.src)} 의 「${a.raw}」`
      }
      const atts = [...(r.attachDir ? s.files.filter((f) => f.startsWith(r.attachDir + '/')) : []), ...(r.attach || [])]
      const extra = atts.filter((a) => !body.includes(path.posix.basename(a))).map((a) => `- 첨부 — [${path.posix.basename(a)}](assets/${r.id}/${path.posix.basename(a)})`)
      if (extra.length) body += NL + NL + '---' + NL + extra.join(NL)
      const touches = expandTouches(r, map, sectionsOf)
      const assets = dry ? [] : await uploadAll(atts)
      await save(
        {
          work: { id: r.id, title: title.slice(0, 200), date: r.date, touches, ...(touches.length ? {} : { touchesEmpty: '좌표 없음 — 가리키는 곳은 본문' }), source: src, body },
          seed: { ...seed, record: true },
          ...(assets.length ? { assets } : {}),
        },
        r.id
      )
    }
  }

  if (unlinked.size) io.out(`글자로 남긴 링크(지도 밖 대상) — ${[...unlinked].map(([k, v]) => `${k}(${v})`).join(' · ')}`)
  const b = await c.rpc('brief', {})
  if (!b.error) io.out(`끝 — 관리 문서 ${b.value.managedDocs} · 기록 ${b.value.works}(세운 기록은 반영됨) · 대기 ${b.value.curation?.queue ?? '?'} · 근거 없음 ${b.value.drift?.unsourced ?? '?'} — 세운 자리는 _seed.json · 원천과 어긋남을 찾는 큐레이션은 cdp-curate · cdp-rebuild`)
  return 0
}

// ── seed verify ─────────────────────────────────────────────────────────────

async function runVerify(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  if (!opt.clone) throw new Error('--clone <지식 레포 클론> 이 필요하다(git pull 해 둔 것)')
  const { loadRepo } = await import('../../core/repo.js')
  const { sliceSection } = await import('../../core/tools.js')
  const { splitBaseline } = await import('../../core/baseline.js')
  const { buildDrift } = await import('../../core/drift.js')
  const { runBuiltinCheck } = await import('../../core/check.js')
  const r = await loadRepo(path.resolve(opt.clone))
  const map = s.map
  const table = linkTable(map, s.files, opt.date || today())
  let same = 0
  const intent = []
  const off = []
  const missing = []
  for (const d of map.docs) {
    if (!s.files.includes(d.src)) continue
    for (const x of docSections(d, s.read(d.src), map, (t) => relink(t, d.src, d.doc, table))) {
      const cut = sliceSection(r, x.coord)
      if (!cut || cut.missing) {
        missing.push(x.coord)
        continue
      }
      const sb = splitBaseline(cut.content)
      if (normForCompare([sb.block?.body || '', sb.curated].join(NL)) === normForCompare(x.body)) same++
      else if (map.intent[x.coord]) intent.push(x.coord)
      else off.push(x.coord)
    }
  }
  const c = r.curation
  const chk = runBuiltinCheck({ ...r })
  const errs = chk.findings.filter((f) => f.sev === 'error')
  const dr = buildDrift(r, { sliceSection }).totals
  io.out(`ctx seed verify: ${s.top} @${s.at} ↔ ${opt.clone}`)
  io.out(`  섹션 — 같음 ${same} · 형식 차이 ${intent.length} · 확인 필요 ${off.length} · 위키에 없음 ${missing.length}`)
  for (const k of intent) io.out(`    형식 ${k} — ${map.intent[k]}`)
  for (const k of off) io.out(`    확인 ${k} — 늦음(기록 없음 · ctx follow) 또는 틀림`)
  for (const k of missing) io.out(`    없음 ${k}`)
  io.out(`  대기 ${c.stats.queue} · 미반영 섹션 ${c.stats.pendingSections} · 검사 오류 ${errs.reduce((a, f) => a + f.items.length, 0)}`)
  io.out(`  drift — 근거 없음 ${dr.unsourced} · 복제 ${dr.duplicated} · 비대 ${dr.oversize} · 큼 ${dr.big} · 일지형 ${dr.diary} · 좌표 없는 기록 ${dr.unreachable}`)
  return off.length || missing.length || errs.length ? 1 : 0
}

// ── follow ─────────────────────────────────────────────────────────────────

function changedCoords(s, map, from, to) {
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

async function runFollow(opt, io) {
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  if (!opt.since) throw new Error('--since <지난 점검 sha> 가 필요하다(처음은 세운 sha)')
  if (!opt.clone) throw new Error('--clone <지식 레포 클론> 이 필요하다')
  const { loadRepo } = await import('../../core/repo.js')
  const { recordKind } = await import('../../core/curation.js')
  const r = await loadRepo(path.resolve(opt.clone))
  const human = r.works.filter((w) => recordKind(w) === 'work')
  const commits = s
    .git(['log', '--reverse', '--format=%h%x09%ci%x09%s', `${opt.since}..${s.at}`, '--', s.map.root || '.'])
    .trim()
    .split(NL)
    .filter(Boolean)
    .map((l) => l.split('\t'))
  let miss = 0
  let skipped = 0
  // 지도의 skip — 원천을 위키에 맞춘 커밋 · 기록을 일부러 두지 않은 커밋(sha 앞자리가 같으면 같은 커밋)
  const skipOf = (h) => Object.entries(s.map.skip || {}).find(([k]) => k.startsWith(h) || h.startsWith(k))?.[1]
  io.out(`ctx follow: ${opt.since}..${s.at} — 커밋 ${commits.length}`)
  for (const [h, when, subj] of commits) {
    const why = skipOf(h)
    if (why) {
      skipped++
      io.out(`− 뺌 ${h} ${when.slice(0, 16)} ${subj}\n    ${why}`)
      continue
    }
    const x = changedCoords(s, s.map, `${h}^`, h)
    const after = human.filter((w) => String(w.date || '') >= when.slice(0, 10))
    // 출처로 잇는 것은 그 커밋을 **가리킨** 기록만 — `커밋 <sha>` · `@<sha>` · 범위의 끝 `..<sha>`. 범위의 시작(`<sha>..`)은 그 커밋을 빼는 쪽이다
    const cites = new RegExp(`(커밋 |@|\\.\\.)${h}`)
    const found = x.coords.map((c) => ({ c, by: after.filter((w) => (w.touches || []).includes(c) || cites.test(String(w.source || ''))).map((w) => w.id) }))
    const ok = x.coords.length ? found.every((y) => y.by.length) : !x.records.length
    if (!ok) miss++
    io.out(`${ok ? '○' : '✗ 누락'} ${h} ${when.slice(0, 16)} ${subj}`)
    for (const y of found) io.out(`    ${y.c}${y.by.length ? ' ← ' + y.by.join(', ') : ' — 기록 없음'}`)
    if (x.records.length) io.out(`    판단 문서가 바뀜(새 기록 거리): ${x.records.map((y) => y.id).join(', ')}`)
    if (x.outside.length) io.out(`    지도 밖 파일: ${x.outside.join(' · ')}`)
  }
  const counted = commits.length - skipped
  io.out(`커밋 ${commits.length} · 누락 ${miss}${counted ? ` (${Math.round((miss / counted) * 100)}%)` : ''}${skipped ? ` · 뺌 ${skipped}(지도의 skip)` : ''} — 누락은 같은 모양의 업데이트 기록으로 메운다(ctx update)`)
  return miss ? 1 : 0
}

// ── update ─────────────────────────────────────────────────────────────────

const lineDiff = (a = '', b = '') => {
  const A = String(a).split(NL).filter((l) => l.trim())
  const B = String(b).split(NL).filter((l) => l.trim())
  const sa = new Set(A)
  const sb = new Set(B)
  return [...A.filter((l) => !sb.has(l)).map((l) => '- ' + l), ...B.filter((l) => !sa.has(l)).map((l) => '+ ' + l)]
}

async function runUpdate(opt, io) {
  if (opt.saveDraft) {
    const draft = JSON.parse(fs.readFileSync(opt.saveDraft, 'utf8'))
    const work = draft.work || draft
    const vocab = draft.work ? draft.vocab || [] : []
    if (work.body.includes(WHY) || !/## 왜\n+\S/.test(work.body)) throw new Error('「## 왜」 를 채우지 않았다 — 초안의 안내 줄을 지우고 이유를 쓴다')
    if (!work.touches?.length && !work.touchesEmpty) throw new Error('touches 가 비었다 — 바뀐 좌표가 없으면 touchesEmpty 에 사유')
    let map = null
    try {
      map = source(opt).map
    } catch {}
    const c = await client(opt, map)
    const input = { work, ...(vocab.length ? { vocab } : {}) }
    const d = await c.rpc('save', { ...input, dryRun: true })
    if (d.error) throw new Error('dryRun 거절 — ' + JSON.stringify(errOf(d.value)).slice(0, 1200))
    io.out(`ctx update --save: dryRun 통과${(d.value.warnings || []).length ? ' · 경고 ' + d.value.warnings.join(' / ').slice(0, 300) : ''}`)
    if (!opt.go) {
      io.out('  저장하려면 --go')
      return 0
    }
    const o = await c.rpc('save', input)
    if (o.error) throw new Error('거절 — ' + JSON.stringify(errOf(o.value)).slice(0, 1200))
    io.out(`  커밋 ${o.value.commit} — 대기열에 섰다. 반영은 큐레이터(cdp-curate)`)
    return 0
  }
  const s = source(opt)
  if (!s.map) throw new Error(`${s.mapPath} 가 없다`)
  const [from, to0] = opt.args.slice(1)
  if (!from) throw new Error('ctx update <작업 전 sha> [<작업 뒤 sha>]')
  const to = s.git(['rev-parse', '--short', to0 || 'HEAD']).trim()
  const commits = s
    .git(['log', '--reverse', '--format=%h%x09%ci%x09%s', `${from}..${to}`, '--', s.map.root || '.'])
    .trim()
    .split(NL)
    .filter(Boolean)
    .map((l) => l.split('\t'))
  if (!commits.length) throw new Error(`${from}..${to} 에 문서 커밋이 없다`)
  const x = changedCoords(s, s.map, from, to)
  const last = commits[commits.length - 1]
  const date = last[1].slice(0, 16)
  const work = {
    id: `${date.slice(0, 4)}-${date.slice(5, 7)}${date.slice(8, 10)}-업데이트-${to}`,
    title: `[업데이트] ${path.posix.basename(s.top)} ${to} — ${last[2]}`.slice(0, 200),
    date,
    touches: x.coords,
    ...(x.coords.length ? {} : { touchesEmpty: '관리 문서 섹션은 그대로 — 작업문서만 바뀌었다' }),
    tags: ['업데이트'],
    source: `${path.posix.basename(s.top)} ${from}..${to}`,
    body: [
      `원천 문서 레포를 고친 세션이 지식 레포로 넘기는 업데이트 기록이다(${from}..${to}). 반영은 큐레이터가 한다.`,
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
            return [`### \`${y.coord}\`${y.a == null ? ' (새 섹션)' : y.b == null ? ' (없어짐)' : ''}`, '', '```diff', ...lines.slice(0, 80), ...(lines.length > 80 ? [`… ${lines.length - 80}줄 더`] : []), '```', '']
          })
        : ['(없음)', '']),
      ...(x.records.length ? ['## 바뀐 작업문서(그 판의 원문)', '', ...x.records.flatMap((y) => [`### ${y.f} — 앞 판은 \`${y.id}\``, '', s.show(to, y.f) ?? '(지워짐)', ''])] : []),
      ...(x.outside.length ? ['## 지도 밖 파일 — 분류가 필요하면 큐레이터에게(cdp-sources.json)', '', ...x.outside.map((y) => '- ' + y), ''] : []),
    ].join(NL),
  }
  const dir = path.join(s.top, '.cdp-updates')
  fs.mkdirSync(dir, { recursive: true })
  const out = path.join(dir, `${to}.json`)
  fs.writeFileSync(out, JSON.stringify({ work, ...(x.vocab.length ? { vocab: x.vocab } : {}) }, null, 1))
  let ignored = true
  try {
    s.git(['check-ignore', '-q', '.cdp-updates/x.json'])
  } catch {
    ignored = false
  }
  io.out(`ctx update: 초안 ${out}`)
  io.out(`  좌표 ${x.coords.length}${x.coords.length ? ' — ' + x.coords.join(' · ') : ''}${x.records.length ? ` · 바뀐 작업문서 ${x.records.length}` : ''}${x.outside.length ? ` · 지도 밖 ${x.outside.length}` : ''}`)
  if (!ignored) io.out('  알림 — .cdp-updates/ 가 .gitignore 에 없다(문서 레포에 커밋되지 않게 한 줄 더한다)')
  io.out(`  다음 — 「## 왜」 를 채우고  ctx update --save "${out}" --go`)
  return 0
}

// ── 들머리 ─────────────────────────────────────────────────────────────────

export async function runSeed(opt, io = {}) {
  io = { out: io.out || ((t = '') => process.stdout.write(t + NL)), err: io.err || ((t = '') => process.stderr.write(t + NL)) }
  try {
    if (opt.cmd === 'follow') return await runFollow(opt, io)
    if (opt.cmd === 'update') return await runUpdate({ ...opt, args: ['update', ...opt.args] }, io)
    const sub = opt.args[0]
    if (sub === 'init') return runInit(opt, io)
    if (sub === 'check') return runCheck(opt, io)
    if (sub === 'plan') return await runApply(opt, io, true)
    if (sub === 'apply') return await runApply(opt, io, !!opt.dry)
    if (sub === 'verify') return await runVerify(opt, io)
    io.err('ctx seed init|check|plan|apply|verify — ctx help')
    return 2
  } catch (e) {
    io.err(`ctx ${opt.cmd}${opt.args[0] && opt.cmd === 'seed' ? ' ' + opt.args[0] : ''}: ${e.message}`)
    return 1
  }
}

export { changedCoords }
