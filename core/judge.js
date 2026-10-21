// 들이기의 판단 단계 — 사용자가 로그인한 LLM CLI(`claude -p`)가 문서를 읽고 **초안**을 낸다. 지식 생성 · 작업실 검토 v0.1 §4.3 · G6 · G7.
//
//   누가     사람의 PC 의 `claude` — 그 사람의 로그인 · 키 · 비용(I11 — 서버는 LLM 을 부르지 않는다)
//   무엇을   성격 · 나눌 자리(줄 범위) · 날짜와 근거 · **좌표 후보와 인용** · 뺀 것 · 어휘 제안 · 열린 물음
//   못 하는 것  쓰기 — 자식에게 save · 편집 · 셸을 허용하지 않는다(허용 목록 + 금지 목록 두 겹). 쓰기는 ctx 가 승인된 초안으로
//   본문     **쓰지 않는다** — 줄 범위만 고르고 ctx 가 원문을 자른다(편입 규칙 — 원문 보존 · 요약 금지). 환각이 들어갈 자리가 없다
//   좌표     후보일 뿐이다 — 기록의 touches 로 올리는 것은 사람의 승인(review.md 의 체크)이다(R8 · cdp-save 【좌표 판정】)
//
// 이 파일은 셋을 한다 — 프롬프트 짓기 · 초안 검사 · 초안 + 승인 → 기록. 자식 프로세스를 띄우는 것은 `runClaude`(밖과 닿는 유일한 곳).

import { spawn } from 'node:child_process'
import { CtxError } from './errors.js'
import { COORD } from './importdir.js'

const NL = String.fromCharCode(10)
export const NATURES = ['결정', '정의', '혼합', '아젠다', '제외']
export const VERBS = ['신설', '변경', '폐기', '정의', '제기', '언급']
export const ALLOWED_TOOLS = ['mcp__cdp__match', 'mcp__cdp__where', 'mcp__cdp__docs', 'mcp__cdp__search', 'mcp__cdp__term', 'Read']
export const DENIED_TOOLS = ['mcp__cdp__save', 'Edit', 'Write', 'MultiEdit', 'NotebookEdit', 'Bash', 'WebFetch', 'WebSearch', 'Task']
export const MAX_PARTS = 12

// ── 프롬프트 ────────────────────────────────────────────────────────────────

export function buildPrompt({ rules, file, rel, repo, lines, title }) {
  return [
    `너는 CDP 지식 레포 「${repo}」 에 들일 문서 하나를 판단한다. **아무것도 쓰지 않는다** — 판단만 JSON 으로 낸다.`,
    '',
    `문서: ${rel}${title ? ` (제목 「${title}」)` : ''} — 원문은 지금 폴더의 \`${file}\` 에 있다(${lines}줄). Read 로 읽는다. 줄 번호는 그 파일의 줄 번호다.`,
    '',
    '할 일 —',
    '1. 문서 성격을 가른다(아래 규칙의 「문서 성격」).',
    '2. 좌표 후보를 낸다 — 정한 것 · 정의한 것만. 이름은 반드시 MCP 의 `match`(필요하면 `where` · `search` · `docs`)로 이 레포의 어휘와 대조한다. 등재된 좌표면 `registered: true`.',
    '   후보마다 근거가 되는 원문 구절을 `quote` 에 그대로 옮긴다(40자 안팎). 언급만 한 것은 `excluded` 에.',
    '3. 날짜 — 사건이 일어난 날(YYYY-MM-DD). 본문에서 찾은 근거를 `dateEvidence` 에. 없으면 date 를 빼라.',
    `4. 나누기 — **기본은 나누지 않는다**(records 하나 · lines 는 [1, ${lines}]). 서로 무관한 결정이 최상위 헤딩마다 따로 있을 때만 그 헤딩 경계로 나눈다(${MAX_PARTS}개까지). 범위는 겹치지 않고 빠짐없이.`,
    '5. 어휘에 없는 대상을 이 문서가 정의하면 `vocab` 에 제안한다(coord · label · aliases — 이름은 레포의 규약대로 · 원문 표기는 aliases).',
    '6. 결정이 안 난 물음은 `open` 에.',
    '',
    '**본문을 다시 쓰지 않는다 · 요약하지 않는다** — 줄 범위만 고른다. 들일 것이 없는 문서(서식 · 목차 · 빈 양식 · 코드)면 nature 를 「제외」 로.',
    '',
    '답은 **JSON 하나만** — 설명 · 코드 울타리 없이:',
    '{ "nature": "결정|정의|혼합|아젠다|제외", "why": "제외일 때 까닭",',
    '  "records": [{ "lines": [시작, 끝], "title": "…", "date": "YYYY-MM-DD", "dateEvidence": "…",',
    '    "touches": [{ "coord": "타입:값", "verb": "신설|변경|폐기|정의|제기|언급", "quote": "…", "registered": true }],',
    '    "excluded": [{ "coord": "…", "why": "…" }], "open": ["…"] }],',
    '  "vocab": [{ "coord": "타입:값", "label": "…", "aliases": ["…"] }] }',
    '',
    '── 편입 규칙(정본 — cdp-save 편입.md) ──',
    '',
    String(rules || '').trim(),
    '',
  ].join(NL)
}

// ── 초안 검사 ───────────────────────────────────────────────────────────────

const str = (v, max = 400) => (typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null)

// LLM 의 글에서 JSON 하나 — 코드 울타리 · 앞뒤 말이 붙어 와도
export function extractJson(text) {
  const t = String(text ?? '').trim()
  const fence = /```(?:json)?\s*\n([\s\S]*?)\n```/.exec(t)
  const body = fence ? fence[1] : t
  const a = body.indexOf('{')
  const b = body.lastIndexOf('}')
  if (a < 0 || b <= a) throw new CtxError('E_JUDGE', 'JSON 이 없다', { head: t.slice(0, 200) })
  try {
    return JSON.parse(body.slice(a, b + 1))
  } catch (e) {
    throw new CtxError('E_JUDGE', `JSON 이 깨졌다 — ${e.message}`, { head: body.slice(a, a + 200) })
  }
}

/** 초안 → 고른 모양. 틀린 것은 고치지 않고 버리거나(후보 하나) 거절한다(전체). `lines` 는 원문 줄 수 */
export function checkDraft(raw, { lines }) {
  const bad = (why) => new CtxError('E_JUDGE', why)
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw bad('초안이 객체가 아니다')
  const nature = NATURES.includes(raw.nature) ? raw.nature : null
  if (!nature) throw bad(`nature 가 ${NATURES.join(' · ')} 중 하나가 아니다`)
  const warnings = []
  if (nature === '제외') return { nature, why: str(raw.why) || '판단: 들일 것이 아니다', records: [], vocab: [], warnings }
  const recs = Array.isArray(raw.records) ? raw.records : []
  if (!recs.length) throw bad('records 가 비었다')
  if (recs.length > MAX_PARTS) throw bad(`records 가 ${MAX_PARTS}개를 넘는다`)
  const out = []
  let last = 0
  for (const [i, r] of recs.entries()) {
    const l = Array.isArray(r?.lines) ? r.lines.map(Number) : null
    if (!l || l.length !== 2 || !l.every(Number.isInteger) || l[0] < 1 || l[1] < l[0] || l[1] > lines) throw bad(`records[${i}].lines 가 [시작, 끝](1~${lines}) 이 아니다`)
    if (l[0] <= last) throw bad(`records[${i}].lines 가 앞 범위와 겹친다`)
    last = l[1]
    const date = typeof r.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.date) && !Number.isNaN(Date.parse(r.date)) ? r.date : null
    const touches = []
    for (const t of Array.isArray(r.touches) ? r.touches : []) {
      const coord = str(t?.coord, 200)
      if (!coord || !COORD.test(coord)) {
        if (coord) warnings.push(`좌표 모양이 아니라 버렸다: ${coord}`)
        continue
      }
      if (touches.some((x) => x.coord === coord)) continue
      touches.push({ coord, verb: VERBS.includes(t.verb) ? t.verb : null, quote: str(t.quote, 200), registered: t.registered === true })
    }
    out.push({
      lines: l,
      title: str(r.title, 200),
      date,
      dateEvidence: date ? str(r.dateEvidence, 200) : null,
      touches,
      excluded: (Array.isArray(r.excluded) ? r.excluded : []).map((x) => ({ coord: str(x?.coord, 200), why: str(x?.why, 200) })).filter((x) => x.coord),
      open: (Array.isArray(r.open) ? r.open : []).map((x) => str(x, 300)).filter(Boolean),
    })
  }
  if (out.length > 1 && (out[0].lines[0] !== 1 || out[out.length - 1].lines[1] !== lines)) warnings.push('나눈 범위가 문서 처음 · 끝까지 닿지 않는다 — 빠진 줄은 들이지 않는다')
  const vocab = []
  for (const v of Array.isArray(raw.vocab) ? raw.vocab : []) {
    const coord = str(v?.coord, 200)
    if (!coord || !COORD.test(coord) || vocab.some((x) => x.coord === coord)) continue
    vocab.push({ coord, label: str(v.label, 120), aliases: (Array.isArray(v.aliases) ? v.aliases : []).map((a) => str(a, 120)).filter(Boolean).slice(0, 10) })
  }
  return { nature, why: null, records: out, vocab, warnings }
}

// ── 승인 — review.md ────────────────────────────────────────────────────────
//
// 사람이 고치는 글이다. 체크(`- [x]`)한 좌표 · 어휘만 들어간다. 기본 체크는 **등재된 좌표 + 인용 있음** 하나 —
// 미등재 · 새 이름 · 어휘 제안은 사람이 고른다(G7). 고르지 않은 후보는 태그 `touches?/<좌표>` 로 남아 큐레이터가 본다.

const defaultOn = (t) => t.registered && !!t.quote

export function reviewText(items) {
  const out = ['# 들이기 판단 — 승인', '', '체크(`[x]`)한 좌표 · 어휘만 기록에 들어간다. 체크를 고치고 저장한 뒤 `--apply` 한다. 고르지 않은 후보는 태그 `touches?/…` 로 남는다.', '']
  for (const it of items) {
    out.push(`<!-- file: ${it.key} -->`, `## ${it.rel}`, '')
    if (!it.draft) {
      out.push(`판단 없음 — ${it.why || '좌표 없이 들인다'}`, '')
      continue
    }
    const d = it.draft
    if (d.nature === '제외') {
      out.push(`성격 제외 — ${d.why} (들이지 않는다 · 들이려면 \`- [x] 그래도 들인다\`)`, `- [${it.state?.force ? 'x' : ' '}] 그래도 들인다 <!-- force -->`, '')
      continue
    }
    out.push(`성격 ${d.nature}${d.records.length > 1 ? ` · 기록 ${d.records.length}개로 나눈다` : ''}`, '')
    d.records.forEach((r, i) => {
      out.push(`### ${d.records.length > 1 ? `${i + 1}. ` : ''}${r.title || it.title || it.rel} — 줄 ${r.lines[0]}–${r.lines[1]}${r.date ? ` · ${r.date}${r.dateEvidence ? ` (${r.dateEvidence})` : ''}` : ''}`)
      for (const t of r.touches) {
        const on = it.state?.coords?.[`${i}|${t.coord}`] ?? defaultOn(t)
        out.push(`- [${on ? 'x' : ' '}] \`${t.coord}\`${t.registered ? '' : ' (미등재)'}${t.verb ? ' ' + t.verb : ''}${t.quote ? ` — 「${t.quote}」` : ''} <!-- c:${i} -->`)
      }
      if (!r.touches.length) out.push('- (좌표 후보 없음)')
      for (const x of r.excluded) out.push(`  - 뺀 것 \`${x.coord}\`${x.why ? ' — ' + x.why : ''}`)
      for (const q of r.open) out.push(`  - 열린 물음 — ${q}`)
      out.push('')
    })
    if (d.vocab.length) {
      out.push('어휘 제안 —')
      for (const v of d.vocab) out.push(`- [${it.state?.vocab?.[v.coord] ? 'x' : ' '}] \`${v.coord}\`${v.label ? ' ' + v.label : ''}${v.aliases.length ? ` (aliases: ${v.aliases.join(', ')})` : ''} <!-- v -->`)
      out.push('')
    }
  }
  return out.join(NL)
}

/** review.md → Map(key → { coords: { "<i>|<좌표>": bool }, vocab: { 좌표: bool }, force }) */
export function parseReview(text) {
  const out = new Map()
  let cur = null
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const f = /^<!-- file: (.+) -->$/.exec(line.trim())
    if (f) {
      cur = { coords: {}, vocab: {}, force: false }
      out.set(f[1], cur)
      continue
    }
    if (!cur) continue
    const m = /^- \[( |x|X)\] (?:`([^`]+)`.*?<!-- (c:(\d+)|v) -->|그래도 들인다 <!-- force -->)\s*$/.exec(line.trim())
    if (!m) continue
    const on = m[1] !== ' '
    if (!m[2]) cur.force = on
    else if (m[3] === 'v') cur.vocab[m[2]] = on
    else cur.coords[`${m[4]}|${m[2]}`] = on
  }
  return out
}

// ── 초안 + 승인 → 기록 ───────────────────────────────────────────────────────

/**
 * row — 계획의 기록 행(planIngest) · body 는 링크를 다시 이은 원문(줄 번호의 기준) · head(i, n) 은 머리줄을 짓는 함수
 * 결과 { works: [{ work, assets }], vocab: [{coord,label,aliases}], skip: 까닭 | null, warnings }
 *   assets — 그 기록의 본문이 가리키는 것만(나누면 조각마다 다르다)
 */
export function recordsFrom(row, draft, state = null, { approve = null, known = new Set() } = {}) {
  if (!draft) return { works: [{ work: row.work, assets: row.assets }], vocab: [], skip: null, warnings: [] }
  if (draft.nature === '제외' && !state?.force) return { works: [], vocab: [], skip: `판단: 들일 것이 아니다 — ${draft.why}`, warnings: [] }
  const warnings = []
  const vocab = draft.vocab.filter((v) => state?.vocab?.[v.coord])
  const canUse = new Set([...known, ...vocab.map((v) => v.coord)])
  const recs = draft.records.length ? draft.records : [{ lines: [1, row.lines], touches: [], excluded: [], open: [] }]
  const lines = row.bodyText.split(NL)
  const works = recs.map((r, i) => {
    const on = (t) => state?.coords?.[`${i}|${t.coord}`] ?? (approve === 'registered' && defaultOn(t))
    const chosen = r.touches.filter(on)
    const touches = []
    const tags = [...row.work.tags.filter((t) => !t.startsWith('touches?/')), 'ingest-llm']
    for (const t of chosen) {
      if (t.registered || canUse.has(t.coord)) touches.push(t.coord)
      else {
        warnings.push(`${row.rel}: ${t.coord} 는 어휘에 없어 touches 에 올리지 못했다 — 어휘 제안을 같이 체크한다`)
        tags.push('touches?/' + t.coord)
      }
    }
    for (const t of r.touches) if (!chosen.includes(t)) tags.push('touches?/' + t.coord)
    const part = recs.length > 1 ? i + 1 : null
    const date = r.date || row.work.date
    const slice = recs.length > 1 || r.lines[0] !== 1 || r.lines[1] !== lines.length ? lines.slice(r.lines[0] - 1, r.lines[1]).join(NL) : row.bodyText
    const head = row.head({ part, of: recs.length, lines: part ? r.lines : null, date: r.date ? { date: r.date, evidence: r.dateEvidence } : null })
    const extra = [...r.open.map((q) => `- 열린 물음 — ${q}`)]
    const id = part ? row.idOf(date, part) : r.date && r.date !== row.work.date ? row.idOf(date, null) : row.work.id
    // 첨부 링크는 계획의 id 로 이어 두었다 — 이 기록의 id 로 · 이 조각이 가리키는 첨부만 싣는다
    const text = slice.replace(/^\s*\n/, '').replace(/\s*$/, '').split(`assets/${row.work.id}/`).join(`assets/${id}/`)
    const body = [head, '', text, '', ...(extra.length ? ['<!-- 판단 단계가 남긴 열린 물음 -->', ...extra, ''] : [])].join(NL)
    const assets = (row.assets || []).filter((a) => text.includes(`assets/${id}/${a.name}`))
    return {
      assets,
      ...row.work,
      id,
      title: r.title || row.work.title,
      date,
      source: row.sourceOf(part),
      ...(touches.length ? { touches, touchesEmpty: undefined } : { touchesEmpty: row.work.touchesEmpty }),
      tags: [...new Set(tags)],
      body,
    }
  })
  const out = works.map(({ assets, ...w }) => {
    if (w.touchesEmpty === undefined) delete w.touchesEmpty
    return { work: w, assets }
  })
  return { works: out, vocab, skip: null, warnings: [...draft.warnings.map((w) => `${row.rel}: ${w}`), ...warnings] }
}

// ── 자식 프로세스 ─────────────────────────────────────────────────────────────

// `claude` — 환경변수 CDP_CLAUDE 로 바꾼다(시험은 가짜 · .mjs 면 node 로 돌린다)
export function claudeCommand(env = process.env) {
  const c = env.CDP_CLAUDE || 'claude'
  if (/\.(m?js)$/i.test(c)) return { cmd: process.execPath, pre: [c], shell: false }
  return { cmd: c, pre: [], shell: process.platform === 'win32' }
}

const q = (s) => (process.platform === 'win32' ? `"${String(s).replace(/"/g, '\\"')}"` : String(s))

/**
 * 한 번 — 프롬프트는 표준 입력으로(명령줄에 원문이 뜨지 않게 · 길이 상한 없이). `--output-format json` 의 결과 글에서 초안 JSON.
 * @returns {{ ok, text?, usage?, cost?, error? }}
 */
export function runClaude({ prompt, cwd, mcpConfig, env = process.env, timeoutMs = 600_000, maxTurns = 12, model = null }) {
  const { cmd, pre, shell } = claudeCommand(env)
  const args = [
    ...pre,
    '-p',
    '--output-format',
    'json',
    '--max-turns',
    String(maxTurns),
    '--mcp-config',
    shell ? q(mcpConfig) : mcpConfig,
    '--strict-mcp-config',
    '--allowedTools',
    ALLOWED_TOOLS.join(','),
    '--disallowedTools',
    DENIED_TOOLS.join(','),
    ...(model ? ['--model', model] : []),
  ]
  return new Promise((resolve) => {
    let out = ''
    let err = ''
    let done = false
    const p = spawn(cmd, args, { cwd, env, shell, windowsHide: true })
    const timer = setTimeout(() => {
      if (done) return
      done = true
      try {
        p.kill()
      } catch {}
      resolve({ ok: false, error: `시간이 넘었다(${Math.round(timeoutMs / 1000)}초)` })
    }, timeoutMs)
    p.stdout.on('data', (c) => (out += c))
    p.stderr.on('data', (c) => (err += c))
    p.on('error', (e) => {
      if (done) return
      done = true
      clearTimeout(timer)
      resolve({ ok: false, error: e.code === 'ENOENT' ? 'claude 를 찾지 못했다 — Claude Code 를 깔고 claude 를 한 번 켜서 로그인한다(CDP_CLAUDE 로 경로를 알려 줄 수도 있다)' : e.message })
    })
    p.on('close', (code) => {
      if (done) return
      done = true
      clearTimeout(timer)
      let j = null
      try {
        j = JSON.parse(out.trim().split(/\r?\n/).filter(Boolean).at(-1) || '')
      } catch {}
      if (!j) return resolve({ ok: false, error: `claude 의 답을 읽지 못했다(종료 ${code}) — ${(err || out).trim().slice(0, 300)}` })
      if (j.is_error || j.subtype && j.subtype !== 'success') {
        const msg = String(j.result || j.error || j.subtype || '').slice(0, 300)
        return resolve({ ok: false, error: /log ?in|auth|credential|api key/i.test(msg) ? `claude 가 로그인되어 있지 않다 — 터미널에서 claude 를 한 번 켜서 로그인한다 (${msg})` : `claude 가 실패했다 — ${msg}` })
      }
      const u = j.usage || {}
      resolve({ ok: true, text: String(j.result ?? ''), usage: (u.input_tokens || 0) + (u.output_tokens || 0) + (u.cache_creation_input_tokens || 0), cost: j.total_cost_usd ?? null })
    })
    p.stdin.on('error', () => {})
    p.stdin.end(prompt)
  })
}
