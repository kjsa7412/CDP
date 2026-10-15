// 어휘 연산 — `save` 입력 `vocab: [{ op?, coord, label?, aliases?, successor?, reason?, to? }]`. 어휘 큐레이터 검토 R1~R10.
//
// 전에는 더하기 하나였다(`addVocab`). 이미 있는 좌표를 보내면 **조용히 건너뛰고** `vocab: 0` 으로 답했고, 고치기 ·
// 폐기는 `edits` 의 가드가 막아(어휘 줄이다) 누구도 도구로 할 수 없었다 — 좌표 체계를 관리하는 큐레이터가 설계 변경
// 큐레이션 뒤의 어휘 정리를 못 해 admin 요청으로 넘겼다(dpms_wiki 2026-10-15).
//
//   add      (기본) 없는 좌표를 타입 절 끝에 한 줄. 있으면 건너뛰고 `skipped` 로 알린다(거절하지 않는다 — R8)
//   update   label · aliases 를 바꾼다(aliases 는 통째로 — [] 면 지운다)
//   retire   `deprecated: <오늘> → <후속> — <사유>` 한 줄. **줄은 지우지 않는다** — 작업 기록의 touches 가 끊기지 않게
//   restore  폐기 표시를 걷는다(잘못 폐기했을 때 돌아올 길)
//   rename   어휘 쪽 — 새 좌표 등재(label · aliases 를 옮긴다) + 옛 좌표 폐기(후속 = 새 좌표). 문서 쪽은 save 가 한다
//
// **순수하다** — 글을 받아 글을 돌려준다. 쓰는 것은 `save`.

import { CtxError } from './errors.js'
import { parseVocab, normKey } from './vocab.js'

const NL = '\n'
export const VOCAB_OPS = ['add', 'update', 'retire', 'restore', 'rename']
const KEYS = ['op', 'coord', 'label', 'aliases', 'successor', 'reason', 'to']
const ITEM = /^(\s*[-*]\s+)`([^`]+)`\s*(?:[—–-]\s*(.*))?$/
const SUB = /^\s+(aliases|deprecated|superseded[-_]by|example)\s*:/i

const bad = (i, msg, detail = {}) => new CtxError('E_INPUT', msg, { field: `vocab[${i}]`, ...detail })

// 모양만 — 좌표 형식(`checkCoord`)은 save 가 본다
export function checkVocabShape(list, checkCoord = (c) => c) {
  if (list == null) return []
  if (!Array.isArray(list)) throw new CtxError('E_INPUT', 'vocab 은 배열이다', { field: 'vocab' })
  return list.map((v, i) => {
    if (!v || typeof v !== 'object' || Array.isArray(v)) throw bad(i, `vocab[${i}] 는 객체다`)
    for (const k of Object.keys(v)) if (!KEYS.includes(k)) throw bad(i, `vocab[${i}].${k} 는 받지 않는다 (${KEYS.join(' · ')})`)
    const op = v.op ?? 'add'
    if (!VOCAB_OPS.includes(op)) throw bad(i, `vocab[].op 는 ${VOCAB_OPS.join(' · ')} 중 하나다`)
    checkCoord(v.coord)
    if (v.label != null && (typeof v.label !== 'string' || !v.label.trim() || v.label.includes(NL))) throw bad(i, 'vocab[].label 은 한 줄 글이다', { coord: v.coord })
    if (v.aliases != null && (!Array.isArray(v.aliases) || v.aliases.some((a) => typeof a !== 'string' || !a.trim() || /[,\n]/.test(a)))) {
      throw bad(i, 'vocab[].aliases 는 글의 배열이다(쉼표 · 줄바꿈 없이)', { coord: v.coord })
    }
    if (v.reason != null && (typeof v.reason !== 'string' || v.reason.length > 200 || v.reason.includes(NL))) throw bad(i, 'vocab[].reason 은 200자까지의 한 줄이다', { coord: v.coord })
    const only = (ks) => {
      for (const k of ['label', 'aliases', 'successor', 'reason', 'to']) if (v[k] != null && !ks.includes(k)) throw bad(i, `vocab[].${k} 는 op: ${op} 에서 받지 않는다`, { coord: v.coord })
    }
    if (op === 'add') {
      only(['label', 'aliases'])
      if (!v.label) throw new CtxError('E_INPUT', 'vocab[].label 이 없다', { coord: v.coord })
    } else if (op === 'update') {
      only(['label', 'aliases'])
      if (v.label == null && v.aliases == null) throw bad(i, 'op: update 는 label · aliases 중 하나 이상을 보낸다', { coord: v.coord })
    } else if (op === 'retire') {
      only(['successor', 'reason'])
      if (v.successor != null) checkCoord(v.successor)
      if (v.successor === v.coord) throw bad(i, '후속이 자기 자신이다', { coord: v.coord })
    } else if (op === 'restore') {
      only(['reason'])
    } else if (op === 'rename') {
      only(['to', 'label', 'aliases', 'reason'])
      if (typeof v.to !== 'string' || !v.to) throw bad(i, 'op: rename 은 to(새 좌표)를 보낸다', { coord: v.coord })
      checkCoord(v.to)
      if (v.to === v.coord) throw bad(i, 'op: rename 의 to 가 coord 와 같다', { coord: v.coord })
    }
    return { ...v, op }
  })
}

// 항목 줄과 딸린 들여쓴 줄 — [at, end)
function entrySpan(lines, coord) {
  const at = lines.findIndex((l) => {
    const m = l.match(ITEM)
    return m && m[2].trim() === coord
  })
  if (at < 0) return null
  let end = at + 1
  while (end < lines.length && /^\s+\S/.test(lines[end]) && !ITEM.test(lines[end])) end++
  return { at, end }
}

function dropSub(lines, span, re) {
  for (let i = span.end - 1; i > span.at; i--) {
    if (re.test(lines[i])) {
      lines.splice(i, 1)
      span.end--
    }
  }
}

function setAliases(lines, span, aliases) {
  dropSub(lines, span, /^\s+aliases\s*:/i)
  if (aliases.length) {
    lines.splice(span.at + 1, 0, '  aliases: ' + aliases.join(', '))
    span.end++
  }
}

function setLabel(lines, span, coord, label) {
  const m = lines[span.at].match(ITEM)
  lines[span.at] = `${m[1]}\`${coord}\` — ${label}`
}

// 산문의 화살표 · 꺾쇠는 파서가 후속 자리로 읽는다(`deprecated: … → 좌표`)
const plain = (s) => String(s || '').replace(/[→>]+/g, ' ').replace(/\s+/g, ' ').trim()

function setRetired(lines, span, { today, successor, reason }) {
  dropSub(lines, span, /^\s+(deprecated|superseded[-_]by)\s*:/i)
  const why = plain(reason)
  const line = '  deprecated: ' + today + (successor ? ' → ' + successor : '') + (why ? ' — ' + why : '')
  lines.splice(span.end, 0, line)
  span.end++
}

function append(lines, coord, label, aliases, newTypes) {
  const type = coord.slice(0, coord.indexOf(':'))
  let head = lines.findIndex((l) => l.trim() === '## ' + type)
  const fresh = head < 0
  if (fresh) {
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    lines.push('', '## ' + type, '')
    head = lines.length - 2
    newTypes.push(type)
  }
  let end = lines.length
  for (let i = head + 1; i < lines.length; i++) {
    if (/^##\s/.test(lines[i])) {
      end = i
      break
    }
  }
  while (!fresh && end > head + 1 && !lines[end - 1].trim()) end--
  const row = ['- `' + coord + '` — ' + label]
  if (aliases?.length) row.push('  aliases: ' + aliases.join(', '))
  lines.splice(end, 0, ...row)
}

// alias 가 다른 좌표의 열쇠(좌표 · 값 · alias)와 겹치나 — [{ alias, other }]
export function aliasClashes(vocab, coord, aliases) {
  const out = []
  for (const a of aliases || []) {
    const k = normKey(a)
    if (!k) continue
    for (const e of vocab.coords.values()) {
      if (e.coord === coord) continue
      const keys = [e.coord, e.coord.slice(e.coord.indexOf(':') + 1), ...e.aliases].map(normKey)
      if (keys.includes(k)) {
        out.push({ alias: a, other: e.coord })
        break
      }
    }
  }
  return out
}

/**
 * @param text  지금 `_vocab.md` 원문(CRLF 면 그대로 돌려준다)
 * @param ops   checkVocabShape 결과
 * @param today 'YYYY-MM-DD' — 폐기 표시의 날짜
 */
export function planVocab(text, ops, { today }) {
  const crlf = String(text).includes('\r\n')
  const lines = String(text).replace(/\r\n/g, NL).split(NL)
  const out = { added: 0, updated: [], retired: [], restored: [], renamed: [], skipped: [], newTypes: [], warnings: [] }
  const strict = new Map() // 겹침을 거절할 좌표 → 보낸 aliases(update · rename)
  const loose = new Map() // 겹침을 경고만 할 좌표(add)
  const cur = () => parseVocab(lines.join(NL))
  const need = (v, i, c = v.coord) => {
    const e = cur().coords.get(c)
    if (!e) throw bad(i, `어휘에 없는 좌표다 — ${c}`, { coord: c })
    return e
  }

  ops.forEach((v, i) => {
    const c = v.coord
    if (v.op === 'add') {
      const e = cur().coords.get(c)
      if (e) {
        const differs = (v.label && v.label.trim() !== e.label) || (v.aliases && v.aliases.join(',') !== e.aliases.join(','))
        out.skipped.push({ coord: c, why: differs ? 'label · aliases 가 다르다 — 고치려면 op: "update"(큐레이터)' : '이미 있다' })
        return
      }
      append(lines, c, v.label.trim(), v.aliases, out.newTypes)
      out.added++
      if (v.aliases?.length) loose.set(c, v.aliases)
      return
    }
    if (v.op === 'update') {
      need(v, i)
      const span = entrySpan(lines, c)
      if (v.label != null) setLabel(lines, span, c, v.label.trim())
      if (v.aliases != null) {
        setAliases(lines, span, v.aliases.map((a) => a.trim()))
        strict.set(c, v.aliases)
      }
      out.updated.push(c)
      return
    }
    if (v.op === 'retire') {
      need(v, i)
      setRetired(lines, entrySpan(lines, c), { today, successor: v.successor, reason: v.reason })
      out.retired.push({ coord: c, successor: v.successor ?? null })
      return
    }
    if (v.op === 'restore') {
      const e = need(v, i)
      if (!e.deprecated && !e.supersededBy && !e.deprecatedNote) throw bad(i, `${c} 는 폐기된 좌표가 아니다`, { coord: c })
      dropSub(lines, entrySpan(lines, c), /^\s+(deprecated|superseded[-_]by)\s*:/i)
      out.restored.push(c)
      return
    }
    // rename — 새 좌표는 없어야 한다(있으면 합치기다 — 그때는 retire 에 successor)
    const e = need(v, i)
    if (cur().coords.has(v.to)) throw bad(i, `${v.to} 는 이미 있다 — 옛 좌표를 그 좌표로 넘기려면 op: "retire" · successor`, { coord: c, to: v.to })
    const aliases = v.aliases ?? e.aliases
    append(lines, v.to, (v.label ?? e.label ?? '').trim() || v.to, aliases, out.newTypes)
    const span = entrySpan(lines, c)
    setAliases(lines, span, [])
    setRetired(lines, span, { today, successor: v.to, reason: '이름 바꿈' + (v.reason ? ' — ' + v.reason : '') })
    strict.set(v.to, aliases)
    out.renamed.push({ coord: c, to: v.to })
  })

  // 저장 뒤의 어휘로 본다 — 후속은 있어야 하고 사슬에 고리가 없어야 한다(R4)
  const fin = cur()
  for (const { coord, successor } of out.retired) {
    if (successor && !fin.coords.has(successor)) throw new CtxError('E_INPUT', `후속 좌표 ${successor} 가 어휘에 없다 — 먼저 등재하거나 같은 save 의 vocab 에 add 로`, { field: 'vocab', coord, successor })
  }
  for (const c of [...out.retired.map((x) => x.coord), ...out.renamed.map((x) => x.coord)]) {
    const seen = [c]
    for (let x = fin.coords.get(c)?.supersededBy; x; x = fin.coords.get(x)?.supersededBy) {
      if (seen.includes(x)) throw new CtxError('E_INPUT', `폐기 사슬이 고리를 만든다 — ${[...seen, x].join(' → ')}`, { field: 'vocab', coord: c, chain: [...seen, x] })
      seen.push(x)
    }
  }
  // alias 는 한 좌표에만(R9) — update · rename 은 거절, add 는 경고
  for (const [c, aliases] of strict) {
    const hit = aliasClashes(fin, c, aliases)
    if (hit.length) {
      throw new CtxError('E_INPUT', `alias 가 다른 좌표에 이미 걸려 있다 — ${hit.map((h) => `「${h.alias}」 → ${h.other}`).join(' · ')}. 그 좌표의 aliases 를 같은 save 에서 op: "update" 로 먼저 걷는다`, {
        field: 'vocab',
        coord: c,
        clashes: hit,
      })
    }
  }
  for (const [c, aliases] of loose) {
    const hit = aliasClashes(fin, c, aliases)
    if (hit.length) out.warnings.push(`${c} 의 alias 가 다른 좌표에 이미 걸려 있다 — ${hit.map((h) => `「${h.alias}」 → ${h.other}`).join(' · ')}. match 는 살아 있는 · 먼저 적힌 좌표를 답한다 — 큐레이터가 op: "update" 로 정리한다`)
  }

  if (out.newTypes.length && lines[lines.length - 1] !== '') lines.push('')
  const joined = lines.join(NL)
  return { text: crlf ? joined.replace(/\n/g, '\r\n') : joined, ...out }
}
