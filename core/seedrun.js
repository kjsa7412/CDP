// 세우기 — 지도 뼈대(init) · 검사(check) · 미리보기 · 세우기(plan · apply) · 대조(verify). 문서레포 세우기 검토 v0.1 §4 · MCP 만으로 검토 M4 · M7.
//
// 원천은 `openSource`(core/sourcerepo.js) 하나로 읽는다. 쓰기는 `ops` 로 받는다 — 부르는 쪽이 길을 고른다:
//   CLI(`ctx seed plan · apply`)   서버의 MCP save · /assets · /baseline 을 HTTP 로
//   서버(MCP `source`)             같은 프로세스에서 core/save.js 를 바로 — HTTP 를 돌지 않는다(M7)
// 그래서 두 길의 결과(관리 문서 · 기록 · _seed.json)가 같다. 줄은 `out` 으로 낸다 — 같은 문장이다.
// 판정(큐레이션)은 하지 않는다(S8) — apply 는 대기열을 세워 두고 끝난다.

import path from 'node:path'
import { CtxError } from './errors.js'
import { checkSeedMap, docSections, appendixOf, linkTable, relink, expandTouches, transferId, normForCompare, SEED_FILE } from './seedmap.js'
import { sliceSection } from './tools.js'
import { splitBaseline } from './baseline.js'
import { buildDrift } from './drift.js'
import { runBuiltinCheck } from './check.js'

const NL = '\n'
export const TYPES = { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.gif': 'image/gif', '.webp': 'image/webp', '.pdf': 'application/pdf', '.html': 'text/html', '.htm': 'text/html' }

export const today = () => {
  const d = new Date()
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`
}

// ── init ─────────────────────────────────────────────────────────────────────

function nameOf(rel) {
  return path.posix
    .basename(rel, '.md')
    .replace(/^[A-Z]+_[\d.]+_/, '')
    .replace(/_(초안|v\d[\w.]*)$/g, '')
    .replace(/_(초안|v\d[\w.]*)$/g, '')
}

// 지도 뼈대 — 원천에 쓰지 않는다(쓰는 것은 CLI · 서버는 JSON 을 돌려주고 사람이 커밋한다)
export function initMap(s, { root = '' } = {}) {
  const pre = root ? root.replace(/\/+$/, '') + '/' : ''
  const files = s.git(['ls-tree', '-r', '-z', '--name-only', s.at, '--', root || '.']).split('\0').filter(Boolean).map((f) => (pre && f.startsWith(pre) ? f.slice(pre.length) : f))
  const md = files.filter((f) => /\.md$/i.test(f))
  const isRecord = (f) => /(^|\/)(작업문서|회의록|주간보고|meeting|notes?)\//i.test(f)
  const docs = []
  const records = []
  for (const f of md) {
    const text = s.git(['show', `${s.at}:${pre}${f}`]).replace(/\r\n/g, NL)
    if (isRecord(f)) {
      const first = s.git(['log', '--diff-filter=A', '--format=%ci', s.at, '--', pre + f]).trim().split(NL).pop() || ''
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
  return { version: 1, root, docs, records, alias: {}, ignore: [], intent: {} }
}

// ── check ────────────────────────────────────────────────────────────────────

export function checkMap(s) {
  if (!s.map) throw new CtxError('E_INPUT', `${s.mapPath} 가 없다 — 지도 뼈대(init)를 원천에 커밋한다`, { map: SEED_FILE })
  return checkSeedMap(s.map, s.files, s.read)
}

// ── plan · apply ─────────────────────────────────────────────────────────────
//
// ops — { exists(coord) → bool, upload(rel, buf, type) → { ref }, save(input) → 결과 | 던짐(code · message · detail),
//         baseline(body) → { commit, baseline }, brief() → { managedDocs, works, curation, drift } | null }
// 결과 — { commits: [{ label, commit }] } · 줄은 out 으로

const errJson = (e) => JSON.stringify(e?.json || { code: e?.code, message: e?.message, detail: e?.detail })

export async function seedApply(s, ops, { dry = true, day = today(), stage = null, only: onlyKey = null, server = '', repo = '', out = () => {} } = {}) {
  if (!s.map) throw new CtxError('E_INPUT', `${s.mapPath} 가 없다 — ctx seed init`, { map: SEED_FILE })
  const map = s.map
  const chk = checkSeedMap(map, s.files, s.read)
  if (chk.errors.length) {
    const e = new CtxError('E_INPUT', '지도 검사에 오류가 있다 — ctx seed check', { errors: chk.errors })
    e.errors = chk.errors
    throw e
  }
  const sha = s.at
  const srcRef = (rel) => `${s.name}@${sha}/${map.root ? map.root + '/' : ''}${rel}`
  const table = linkTable(map, s.files, day)
  const unlinked = new Map()
  const sectionsOf = (d) => docSections(d, s.read(d.src), map, (t) => relink(t, d.src, d.doc, table, unlinked))
  const stages = stage ? [stage] : ['baseline', 'managed', 'records']
  // 세운 자리(검토 S13) — 세우는 흔적은 작업 기록이 아니다. 구조 save 는 기록 파일 없이 `_seed.json` 의 sections 로,
  // 함께 들이는 기록은 `_seed.json` 의 records 로(판정 없이 반영됨). 섹션의 근거는 원천(from)이다 — 스냅샷을 뜨지 않는다
  const seed = { at: day, from: `${s.name}@${sha}` }
  const only = (x) => !onlyKey || onlyKey === x
  const commits = []
  const upload = async (rel) => {
    const ext = path.posix.extname(rel).toLowerCase()
    if (!TYPES[ext]) throw new CtxError('E_INPUT', `첨부 종류를 받지 않는다(${ext}) — ${rel}`, { file: rel })
    const j = await ops.upload(rel, s.readBuf(rel), TYPES[ext])
    return { ref: j.ref, name: path.posix.basename(rel) }
  }
  // 하나씩 — 같은 바이트의 그림 둘을 동시에 올리면 서버 staging 의 같은 이름을 두고 다툰다(Windows EPERM)
  const uploadAll = async (list) => {
    const res = []
    for (const rel of list) res.push(await upload(rel))
    return res
  }
  const save = async (input, label) => {
    let d
    try {
      d = await ops.save({ ...input, dryRun: true })
    } catch (e) {
      if (e?.code === 'E_EXISTS') return out(`   ${label} — 이미 있다(건너뜀)`)
      // 미리보기는 앞 단계를 쓰지 않는다 — 기록의 좌표는 이관이 어휘를 세운 뒤에야 등재된다
      if (dry && /어휘에 없는 좌표/.test(e?.message || '')) return out(`   ${label} — 앞 단계(이관) 뒤에 통과할 것(${e?.detail?.coord || ''} 가 아직 어휘에 없다)`)
      throw new CtxError(e?.code || 'E_INPUT', `${label} dryRun 거절 — ${errJson(e).slice(0, 1200)}`, e?.detail)
    }
    const warn = (d.warnings || []).filter((w) => !/touches 가 비어|새 어휘 타입|없는 관리 문서를 가리키는 줄|그림 \d+개가 레포에 없다/.test(w))
    if (dry) return out(`   ${label} — dryRun 통과${warn.length ? ' · 경고 ' + warn.join(' / ').slice(0, 300) : ''}`)
    let o
    try {
      o = await ops.save(input)
    } catch (e) {
      throw new CtxError(e?.code || 'E_INPUT', `${label} 거절 — ${errJson(e).slice(0, 1200)}`, e?.detail)
    }
    commits.push({ label, commit: o.commit })
    out(`   ${label} — 커밋 ${o.commit}${warn.length ? ' · 경고 ' + warn.join(' / ').slice(0, 300) : ''}`)
  }

  out(`ctx seed ${dry ? 'plan' : 'apply'}: ${s.top} @${sha} → ${server} ${repo} · 날 ${day}`)

  if (stages.includes('baseline')) {
    out('[기준선]')
    for (const d of map.docs.filter((x) => x.baseline != null && only(x.key))) {
      const secs = sectionsOf(d)
      if (!stage && (await ops.exists(secs[0]?.coord))) {
        out(`   ${d.key} — 이미 있다(건너뜀 · 다시 밀려면 --stage baseline)`)
        continue
      }
      if (dry) {
        out(`   ${d.key} — 블록 ${secs.length}(기준선은 dryRun 이 없다 — 숫자만)`)
        continue
      }
      const j = await ops.baseline({
        source: `${d.baseline} (${srcRef(d.src)})`,
        asof: day,
        managed: [{ op: 'add', pattern: `${d.type}:*`, doc: d.doc, ...(d.form ? { form: d.form } : { title: d.title || d.key }), ...(d.kind ? { kind: d.kind } : {}) }],
        vocab: secs.map((x) => ({ coord: x.coord, label: x.label })),
        items: secs.map((x) => ({ coord: x.coord, heading: x.heading, body: x.body })),
        seed,
      })
      commits.push({ label: d.key, commit: j.commit })
      out(`   ${d.key} — 커밋 ${j.commit} · 블록 ${j.baseline}`)
    }
  }

  if (stages.includes('managed')) {
    out('[관리 문서 이관]')
    for (const d of map.docs.filter((x) => x.baseline == null && only(x.key))) {
      const secs = sectionsOf(d)
      if (await ops.exists(secs[0]?.coord)) {
        out(`   ${d.key} — 이미 있다(건너뜀)`)
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
            body: [`세우기 — \`${d.src}\`(${sha}) → \`${d.doc}\` · 섹션 ${secs.length}${atts.length ? ` · 첨부 ${atts.length}` : ''}`].join(NL),
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
    out('[작업 기록]')
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

  if (unlinked.size) out(`글자로 남긴 링크(지도 밖 대상) — ${[...unlinked].map(([k, v]) => `${k}(${v})`).join(' · ')}`)
  const b = await ops.brief()
  if (b) out(`끝 — 관리 문서 ${b.managedDocs} · 기록 ${b.works}(세운 기록은 반영됨) · 대기 ${b.curation?.queue ?? '?'} · 근거 없음 ${b.drift?.unsourced ?? '?'} — 세운 자리는 _seed.json · 원천과 어긋남을 찾는 큐레이션은 cdp-curate · cdp-rebuild`)
  return { dry, at: sha, day, stages, commits, unlinked: [...unlinked].map(([k, v]) => ({ target: k, n: v })), brief: b ? { managedDocs: b.managedDocs, works: b.works, queue: b.curation?.queue ?? null, unsourced: b.drift?.unsourced ?? null } : null }
}

// ── verify ───────────────────────────────────────────────────────────────────

// r — 지식 레포(loadRepo). 섹션마다 원천과 같음 · 형식 차이(지도의 intent) · 확인 필요 · 위키에 없음
export function seedVerify(s, r, { date = today() } = {}) {
  if (!s.map) throw new CtxError('E_INPUT', `${s.mapPath} 가 없다`, { map: SEED_FILE })
  const map = s.map
  const table = linkTable(map, s.files, date)
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
      else if (map.intent[x.coord]) intent.push({ coord: x.coord, why: map.intent[x.coord] })
      else off.push(x.coord)
    }
  }
  const c = r.curation
  const chk = runBuiltinCheck({ ...r })
  const errs = chk.findings.filter((f) => f.sev === 'error')
  const drift = buildDrift(r, { sliceSection }).totals
  return {
    at: s.at,
    same,
    intent,
    off,
    missing,
    queue: c.stats.queue,
    pendingSections: c.stats.pendingSections,
    checkErrors: errs.reduce((a, f) => a + f.items.length, 0),
    drift,
    ok: !(off.length || missing.length || errs.length),
  }
}
