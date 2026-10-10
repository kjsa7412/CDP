// save — 유일한 쓰기 도구(I2). 설계서 §4.5 · v1.0 개편안 §5.2.
//
// 단위는 **작업 기록 1건 + (큐레이터면) 관리 문서 섹션 · 등록부 + 어휘 등재**이고 한 커밋이다(§0).
//
// **v1.0 — 역할이 입력을 가른다.** writer 는 작업 기록(`work` · `vocab` · `assets`)만 쓴다 — 관리 문서는
// 큐레이션으로만 바뀐다(I6). 섹션 · 등록부 · 섹션 밖 손질 · 서식 예시 정리 · 큐레이션 판정(`work.curates`)은
// 그 레포의 큐레이터(`curate`)만. 기록만 쓴 save 는 파생 때문에 막히지 않는다 — 기록은 대기열에 서고, 섹션을
// 읽는 모든 자리가 그 미반영 기록을 같이 낸다(I7).
// 검사 · 커밋 · 미러를 서버가 한 번에 한다 — 클라이언트에 작업 트리가 없다(§4.2). 커밋은 훅을 타지 않는다(V5).
//
// **전부 되거나 전부 안 된 것이어야 한다.** 검사에서 걸리면 만지기 전으로
// 되돌린다. 반쯤 쓰인 트리는 다음 요청에게 거짓말을 하고, 그 다음 `save` 는
// 그 거짓말 위에서 판정한다.
//
// 그래서 파일을 만지기 전에 원본을 전부 들고 시작한다(`Snap`). 레포 하나가
// 수 MB 라 메모리에 드는 비용이 복구 못 하는 위험보다 싸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRepo } from './repo.js'
import { runBuiltinCheck, newErrors } from './check.js'
import { resolveCoord, parseRegistry, docEscapes, normValue, outsideFences } from './managed.js'
import { planManaged, checkManagedShape } from './managedops.js'
import { readText } from './scan.js'
import * as git from './git.js'
import { CtxError, checkCoord, checkId, sliceSection } from './tools.js'
import { withLock } from './lock.js'
import { enqueuePush, lastPush, describe as mirrorLine } from './mirror.js'
import { topApplied, normalizeCurates, nfc } from './frontmatter.js'
import { recordKind, SYSTEM_TAGS } from './curation.js'
import { cmpDateDesc } from './validity.js'
import { splitBaseline, joinBaseline, renderBlock, hasMark } from './baseline.js'
import { formsLib } from './formslib.js'
import { take as takeAsset, checkAssetName, ASSETS_COUNT_MAX, ASSETS_TOTAL_MAX } from './assets.js'
import { repoPath, mdRefs } from './repopath.js'
import { htmlExternal, proseLength } from './visuals.js'
import { planPurge } from './examples.js'
import { checkEditsShape, planEdits } from './edits.js'
import { checkDrop, dropVocab, dropRefs, refsError } from './docdrop.js'
import { suggestEdit } from './docrefs.js'

const NL = String.fromCharCode(10)
const SETTINGS = { settledness: { excludeTypes: ['domain'] } }
// 미러 push 를 응답 전에 기다리는 상한 — **뮤텍스 밖**이다. 빠른 원격(파일 · 사내 GitLab 이
// 멀쩡할 때)은 실제 결과를 답하고, 느리면 `queued` 로 답하고 다음 save 가 `mirrorLast` 로 말한다.
export const MIRROR_WAIT_MS = 1500
// E_CONFLICT 에 싣는 지금 본문의 상한 — 응답 크기를 지킨다. 넘으면 `truncated` 이고 그때만 `section` 을 다시 부른다.
export const CONFLICT_CONTENT_MAX = 8000
// 커밋의 상한 — git 기본 20초는 부하 걸린 기계에서 모자란다(훅은 타지 않는다 · V5).
// 넘어도 판정은 index.lock · HEAD 로 한다(10단계). 뮤텍스 안이라 그동안 다른 save 는 줄을 선다.
export const COMMIT_TIMEOUT_MS = 120000
// 남이 쥔 index.lock 때문에 커밋이 시작도 못 했을 때 다시 하는 횟수 — 잠금이 풀린 뒤에(10단계)
export const LOCK_RETRIES = 2
// 정본 스냅샷 한 save 의 상한 — 섹션 하나에 기록 하나(RB3)라 실레포의 근거 없는 섹션(ezipez_cdp 192)을 두 번에
export const SNAPSHOT_MAX = 200

// ── 되돌리기 ────────────────────────────────────────────────────────────────
//
// 쓰기 전에 원본을 들고, 실패하면 그대로 돌려놓는다. 새로 만든 파일은 지운다.
// `git checkout` 으로 대신하지 않는다 — 추적되지 않는 새 파일은 그것으로
// 돌아오지 않고, 커밋 전이라 되돌릴 기준도 없다.

class Snap {
  constructor(root) {
    this.root = path.resolve(root)
    this.before = new Map()
    this.made = [] // 이 save 가 만든 폴더 — 되돌릴 때 비었으면 치운다
  }
  // **레포 밖으로 나가는 경로는 여기서 막는다** — 등록부 · 좌표 · id 가 파일 이름이 되는 마지막 문이다.
  abs(rel) {
    const abs = path.resolve(this.root, rel)
    if (abs !== this.root && !abs.startsWith(this.root + path.sep)) {
      throw new CtxError('E_INPUT', '레포 밖 경로는 쓰지 않는다', { path: String(rel).slice(0, 120) })
    }
    return abs
  }
  async keep(rel, abs) {
    if (!this.before.has(rel)) this.before.set(rel, await fs.readFile(abs, 'utf8').catch(() => null))
  }
  async mkdirs(dir) {
    const missing = []
    for (let d = dir; d !== this.root && d !== path.dirname(d); d = path.dirname(d)) {
      if (await fs.stat(d).then(() => true).catch(() => false)) break
      missing.push(d)
    }
    for (const d of missing.reverse()) {
      await fs.mkdir(d).catch(() => {})
      this.made.push(d)
    }
  }
  // 첨부 — **새 파일만** 쓴다(A5). 경로는 서버가 정한 `work/assets/<id>/<이름>` 이고 id 는 새 기록이라
  // 있을 수 없지만, 있으면 남의 파일을 덮는 것이니 거절한다. 되돌리면 지운다(`before` 가 null).
  async writeBin(rel, buf) {
    const abs = this.abs(rel)
    if (await fs.access(abs).then(() => true).catch(() => false)) throw new CtxError('E_EXISTS', '그 자리에 파일이 이미 있다', { path: rel })
    this.before.set(rel, null)
    await this.mkdirs(path.dirname(abs))
    await fs.writeFile(abs, buf)
  }
  async write(rel, text) {
    const abs = this.abs(rel)
    await this.keep(rel, abs)
    await this.mkdirs(path.dirname(abs))
    await fs.writeFile(abs, text, 'utf8')
  }
  // 파일을 지운다 — 원본을 들고 있어 되돌리면 다시 쓴다. `git add -- <지운 경로>` 가 삭제를 커밋한다.
  async remove(rel) {
    const abs = this.abs(rel)
    await this.keep(rel, abs)
    await fs.rm(abs, { force: true })
    // 비게 된 docs/ 하위 폴더를 치운다(깊은 쪽부터 · 비어 있지 않으면 거기서 멈춘다)
    const docs = path.join(this.root, 'docs') + path.sep
    for (let d = path.dirname(abs); d.startsWith(docs); d = path.dirname(d)) {
      if (!(await fs.rmdir(d).then(() => true).catch(() => false))) break
    }
  }
  paths() {
    return [...this.before.keys()]
  }
  async restore() {
    for (const [rel, body] of this.before) {
      const abs = path.join(this.root, rel)
      if (body == null) await fs.rm(abs, { force: true }).catch(() => {})
      else {
        await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => {})
        await fs.writeFile(abs, body, 'utf8').catch(() => {})
      }
    }
    for (const d of [...this.made].reverse()) await fs.rmdir(d).catch(() => {})
  }
}

// ── 뮤텍스 (§2.6) ───────────────────────────────────────────────────────────
//
// 레포마다 하나. 읽기는 상태를 바꾸지 않으므로 동시에 돌지만 `save` 는
// 직렬화된다 — 두 `save` 가 같은 섹션을 동시에 고치면 `applied` 대조가
// 무의미해진다. 실물은 `core/lock.js` — 미러 큐 · 「origin 과 맞추기」 ·
// 「트리 되돌리기」 가 같은 줄에 선다(동시 기록 검토 v0.1 D4 · D5).

export { withLock }

// ── 스키마 (2단계) ──────────────────────────────────────────────────────────

const APPLIED_MARK = '<!-- applied:'

function checkSchema(input) {
  const w = input?.work
  if (!w || typeof w !== 'object') throw new CtxError('E_INPUT', 'work 가 없다', { field: 'work' })
  w.id = checkId(w.id)
  if (!w.title || typeof w.title !== 'string') throw new CtxError('E_INPUT', 'title 이 없다', { field: 'work.title' })
  if (typeof w.body !== 'string' || !w.body.trim()) throw new CtxError('E_INPUT', 'body 가 없다', { field: 'work.body' })
  if (w.author != null) {
    // **작성자는 서버가 토큰에서 채운다.** 클라이언트가 보내면 거절한다 —
    // 보낼 수 있으면 남의 이름으로 기록이 남는다(§4.5).
    throw new CtxError('E_INPUT', 'author 는 서버가 채운다 — 보내지 않는다', { field: 'work.author' })
  }
  // 파생 주석을 본문에 쓰면 섹션 치환이 그것을 진짜로 읽는다.
  if (w.body.includes(APPLIED_MARK)) {
    throw new CtxError('E_INPUT', `body 에 ${APPLIED_MARK} 를 쓸 수 없다`, { field: 'work.body' })
  }
  for (const c of w.touches || []) checkCoord(c)
  if (w.source != null && (typeof w.source !== 'string' || !w.source.trim())) {
    throw new CtxError('E_INPUT', 'source 가 비었다 — 원문이 어디서 왔는지 적거나 빼고 보낸다', { field: 'work.source' })
  }
  if (w.touchesEmpty != null) {
    if (typeof w.touchesEmpty !== 'string' || !w.touchesEmpty.trim()) {
      throw new CtxError('E_INPUT', 'touchesEmpty 에는 좌표가 0개인 사유를 적는다', { field: 'work.touchesEmpty' })
    }
    if ((w.touches || []).length) {
      throw new CtxError('E_INPUT', 'touches 가 있는데 touchesEmpty 를 보냈다 — 둘 중 하나다', { field: 'work.touchesEmpty' })
    }
  }

  for (const s of input.sections || []) {
    checkCoord(s.coord)
    if (typeof s.body !== 'string') throw new CtxError('E_INPUT', 'sections[].body 가 없다', { coord: s.coord })
    if (s.body.includes(APPLIED_MARK)) {
      throw new CtxError('E_INPUT', `sections[].body 에 ${APPLIED_MARK} 를 쓸 수 없다 — applied 는 서버가 쓴다`, { coord: s.coord })
    }
  }
  for (const b of input.baseline || []) {
    checkCoord(b?.coord)
    if (typeof b.body !== 'string' || !b.body.trim()) throw new CtxError('E_INPUT', 'baseline[].body 가 없다 — 기준선 블록에 넣을 글', { coord: b.coord })
    if (hasMark(b.body) || b.body.includes(APPLIED_MARK)) throw new CtxError('E_INPUT', 'baseline[].body 에 블록 표지 · applied 를 쓸 수 없다 — 서버가 붙인다', { coord: b.coord })
  }
  for (const s of input.sections || []) {
    // 큐레이터의 글은 기준선 블록을 건드리지 못한다 — 블록은 기준선 save 의 자리다(개편안 §3.2)
    if (hasMark(s.body)) throw new CtxError('E_INPUT', 'sections[].body 에 기준선 블록 표지가 있다 — 블록은 서버가 지키고 다시 붙인다. section 의 content(블록을 뺀 글)를 고쳐 보낸다', { coord: s.coord })
  }
  // 정본 스냅샷(리빌딩 검토 §5.2) — 좌표만 받는다. 본문은 서버가 섹션에서 짓는다(보낸 본문이 섹션과 다르면 스냅샷이 아니다 · RB4)
  if (input.snapshot != null) {
    if (!Array.isArray(input.snapshot)) throw new CtxError('E_INPUT', 'snapshot 은 배열이다 — [{ coord }]', { field: 'snapshot' })
    if (input.snapshot.length > SNAPSHOT_MAX) throw new CtxError('E_INPUT', `snapshot 은 save 한 번에 ${SNAPSHOT_MAX}개까지다 — 나눠 보낸다`, { field: 'snapshot', count: input.snapshot.length })
    const seen = new Set()
    for (const x of input.snapshot) {
      if (!x || typeof x !== 'object' || Object.keys(x).some((k) => k !== 'coord')) throw new CtxError('E_INPUT', 'snapshot[] 은 { coord } 하나만 받는다 — 본문은 서버가 섹션에서 뜬다', { field: 'snapshot' })
      checkCoord(x.coord)
      if (seen.has(x.coord)) throw new CtxError('E_INPUT', `snapshot 에 ${x.coord} 가 두 번 나온다`, { field: 'snapshot', coord: x.coord })
      seen.add(x.coord)
    }
  }
  for (const v of input.vocab || []) {
    checkCoord(v.coord)
    if (!v.label) throw new CtxError('E_INPUT', 'vocab[].label 이 없다', { coord: v.coord })
  }
  // 예시 정리(등록부 사본 검토 X10) — 값은 하나다. 다른 값이 조용히 무시되면 「지웠다」 고 답하게 된다
  if (input.examples != null && input.examples !== 'purge') throw new CtxError('E_INPUT', 'examples 는 "purge" 하나다', { field: 'examples' })
  // 미리보기(관리문서 정리 검토 N10) — 계획 · 거절 · 검사까지 돌고 쓰지 않는다. 화면이 계획을 따로 세우지 않게
  if (input.dryRun != null && typeof input.dryRun !== 'boolean') throw new CtxError('E_INPUT', 'dryRun 은 true · false 다', { field: 'dryRun' })
  const assets = input.assets || []
  if (!Array.isArray(assets)) throw new CtxError('E_INPUT', 'assets 는 배열이다', { field: 'assets' })
  if (assets.length > ASSETS_COUNT_MAX) throw new CtxError('E_INPUT', `첨부는 save 한 번에 ${ASSETS_COUNT_MAX}개까지다`, { count: assets.length })
  const names = new Set()
  for (const a of assets) {
    checkAssetName(a?.name)
    // 대소문자만 다른 이름은 Windows · macOS 에서 한 파일이다
    const k = a.name.toLowerCase()
    if (names.has(k)) throw new CtxError('E_INPUT', 'assets[].name 이 겹친다', { name: a.name })
    names.add(k)
  }
  return w
}

// ── 어휘 등재 (4단계) ───────────────────────────────────────────────────────
//
// 타입 섹션(`## table`) 끝에 한 줄을 붙인다. **타입 섹션이 없으면 문서 끝에 만든다** —
// 전에는 거절하고 "타입은 사람이 먼저 만든다" 로 답했는데, 지식 레포가 서버에만 있으면
// 사람이 커밋할 작업 트리가 없고(클라이언트에 clone 이 없다) 초기에는 새 타입이 계속 는다
// (dpms_wiki 에 `term:` 이 없어 도메인 지식 문서 편입이 막혔다 · 2026-09-30).
// 통제는 타입이 아니라 **좌표 하나하나의 등재**가 한다 — 그것은 그대로 save 안에서 검사되고
// (형식은 `checkCoord` — ASCII 타입은 소문자만이라 `Term` ↔ `term` 은 못 갈라진다) 커밋은 git 에
// 남아 사람이 되돌릴 수 있다. 오타로 만든 타입은 지워지지 않으니 만들었으면 경고로 알린다.
//
// 삭제는 없다(`deprecated` 표기는 사람이).

function addVocab(text, entries) {
  if (!entries.length) return { text, added: 0, newTypes: [] }
  const lines = text.split(NL)
  const newTypes = []
  let added = 0
  for (const v of entries) {
    const type = v.coord.slice(0, v.coord.indexOf(':'))
    if (text.includes('`' + v.coord + '`')) continue // 이미 있다
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
    const row = ['- `' + v.coord + '` — ' + v.label]
    if (v.aliases?.length) row.push('  aliases: ' + v.aliases.join(', '))
    lines.splice(end, 0, ...row)
    added++
  }
  if (newTypes.length && lines[lines.length - 1] !== '') lines.push('')
  return { text: lines.join(NL), added, newTypes }
}

// ── 섹션 치환 (6단계) ───────────────────────────────────────────────────────
//
// 헤딩은 **유지**하고 그 아래만 갈아 끼운다. `applied` 주석은 서버가 쓴다 --
// 클라이언트가 보내면 2단계에서 거절했다.

// 섹션의 헤딩 줄 · 끝 줄 — **코드펜스 안의 `#` 줄은 헤딩이 아니다**(읽는 쪽 `parseManagedSections` 와 같은 규칙).
// 전에는 줄마다 `^#{1,6}\s` 를 봐서 셸 주석(`# ① …`)이 든 코드 블록에서 섹션이 거기서 끝났다 — `section` 은 섹션 전체를 주는데
// 치환은 그 앞까지만 갈아 끼워 코드 블록의 뒷부분이 섹션 밖에 남았고, 짝이 어긋난 펜스가 뒤의 헤딩을 전부 삼켰다
// (ezipez_cdp 리빌딩 — 운영매뉴얼 · 신규팩터추가런북 섹션 일곱이 anchor-missing)
function sectionSpan(lines, value, level) {
  const re = new RegExp('^#{' + level + '}\\s+' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)')
  const heads = []
  for (const [i, l] of outsideFences(lines)) {
    const m = /^(#{1,6})\s/.exec(l)
    if (m) heads.push([i, m[1].length, l])
  }
  const k = heads.findIndex(([, , l]) => re.test(l))
  if (k < 0) return { at: -1, end: lines.length }
  const at = heads[k][0]
  const next = heads.slice(k + 1).find(([, lv]) => lv <= level)
  return { at, end: next ? next[0] : lines.length }
}

function replaceSection(text, { value, level, applied, body, id, heading }) {
  // 등록부의 `—`(문서 전체) 규칙 — level 0. **파일 전체가 그 좌표의 상태**다.
  // applied 는 문서 첫 줄의 주석이고(`topApplied` — `section` 이 읽는 것과 같은 규칙), 본문은 통째로 갈린다.
  // 전에는 `^#{0}\s+값` 이 아무 줄에도 안 걸려 문서 끝에 ` 값` 줄을 붙였고, 그 앞의 헤딩 검사가
  // `#{1,0}` 으로 정규식 예외를 내 `E_REPO` 로 죽었다(동시 기록 검토 v0.1 M5).
  if (level === 0) {
    const current = topApplied(text)
    const next = [APPLIED_MARK + ' ' + id + ' -->', '', ...body.replace(/\s+$/, '').split(NL)]
    return { text: next.join(NL) + NL, created: false, current }
  }
  const lines = text.split(NL)
  const { at, end } = sectionSpan(lines, value, level)

  if (at < 0) {
    // 새 섹션 — 문서 끝에 붙인다.
    const add = ['', '#'.repeat(level) + ' ' + (heading || value), APPLIED_MARK + ' ' + id + ' -->', '', ...body.split(NL)]
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return { text: lines.concat(add).join(NL) + NL, created: true, current: null }
  }

  // 같은/상위 레벨의 다음 헤딩 전까지가 이 섹션이다(펜스 밖의 헤딩만 — sectionSpan)

  // 지금 실려 있는 applied
  let current = null
  for (let i = at + 1; i < end; i++) {
    const m = /<!--\s*applied:\s*(.*?)\s*-->/.exec(lines[i])
    if (m) {
      current = m[1] === 'null' ? null : m[1]
      break
    }
  }

  const head = lines[at]
  const tail = lines.slice(end)
  const next = [head, APPLIED_MARK + ' ' + id + ' -->', '', ...body.split(NL), '']
  return { text: lines.slice(0, at).concat(next, tail).join(NL), created: false, current }
}

// 기준선 블록만 갈아 끼운다 — 섹션을 찾고, 그 안의 블록을 바꾸거나(없으면) 경과 앞 · 끝에 넣는다. 섹션이 없으면 만든다(applied: null)
function replaceBaseline(text, { value, level, heading, block }) {
  const lines = text.split(NL)
  const { at, end } = sectionSpan(lines, value, level)
  if (at < 0) {
    const add = ['', '#'.repeat(level) + ' ' + (heading || value), APPLIED_MARK + ' null -->', '', ...block.split(NL)]
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return lines.concat(add).join(NL) + NL
  }
  // 헤딩 · applied 주석(앞 3줄)은 그대로 두고 그 아래를 가른다
  let k = at + 1
  const keep = [lines[at]]
  while (k < end && k < at + 4 && (/<!--\s*applied\s*:/i.test(lines[k]) || !lines[k].trim())) {
    if (/<!--\s*applied\s*:/i.test(lines[k])) keep.push(lines[k])
    k++
  }
  const inner = lines.slice(k, end).join(NL)
  const { curated } = splitBaseline(inner)
  const next = joinBaseline(curated, block)
  return lines.slice(0, at).concat(keep, [''], next.split(NL), [''], lines.slice(end)).join(NL).replace(/\n{3,}/g, '\n\n')
}

// ── 본체 ────────────────────────────────────────────────────────────────────

export async function save(root, input, { user, write = false, admin = false, curate = undefined, mirror = false, now = Date.now(), log = null, mirrorWaitMs = MIRROR_WAIT_MS, commitTimeout = COMMIT_TIMEOUT_MS, staging = null, formsDir = null, formsData = null, commitHooks = false } = {}) {
  const out = await withLock(path.resolve(root), async () => {
    // 큐레이터인가 — 서버는 토큰의 레포별 권한을 넘긴다. 안 넘기면 admin 만 큐레이터다(안전한 쪽)
    const r = await run(root, input, { user, write, admin, curate: curate ?? !!admin, now, staging, formsDir, formsData })

    // 미리보기 — 검사까지 지난 트리를 되돌리고 커밋하지 않는다. 색인에는 아무것도 올리지 않았다
    if (r.dryRun) {
      await r.snap.restore()
      return {
        dryRun: true,
        id: r.id,
        sections: r.sections,
        ...(r.snapshots ? { snapshots: r.snapshots, snapshotSkipped: r.snapshotSkipped } : {}),
        vocab: r.vocab,
        managed: r.managedChanges.length,
        ...(r.managedChanges.length ? { managedChanges: r.managedChanges } : {}),
        ...(r.edits.length ? { edits: r.edits } : {}),
        ...(r.examples ? { examples: r.examples } : {}),
        ...(r.dropped ? { dropped: r.dropped } : {}),
        warnings: r.warnings,
        mirror: 'off',
      }
    }

    // 10 커밋 — 바뀐 경로만. 실패하면 되돌린다 — **git 이 정말 커밋하지 않았을 때만.**
    //
    // 시간이 다 돼 실패로 돌아와도 Windows 에서는 진짜 git 이 살아서 커밋을 마쳤다. 그때 곧장 되돌리면
    // 빈 커밋(되돌린 색인) + 옛 파일이 남고 호출자는 실패를 듣는다 — 작업 기록 하나가 사라진다(도구 층에서
    // 2026-09-29 실측). `commitPaths` 는 이제 시간이 다 되면 git 을 나무째 죽이고 돌아온다 — 그래도 죽기
    // 직전에 커밋을 마쳤을 수 있고 누가 `index.lock` 을 쥐었을 수 있으니, 잠금이 풀린 뒤 HEAD 로 판정한다.
    const paths = r.snap.paths()
    const head0 = await git.headSha(root)
    // 커밋 훅은 돌리지 않는다(v1.0 V5) — 8단계가 커밋할 트리를 이미 검사했다. `commitHooks` 는 실패 경로를 시험하는 자리만 쓴다
    const commit = () => git.commitPaths(root, paths, { message: r.title, author: user, timeout: commitTimeout, hooks: commitHooks })
    let c = await commit()
    for (let retry = 0; !c.ok; retry++) {
      if (!(await git.waitIndexUnlocked(root))) {
        // 5분이 지나도 잠겨 있다 — 커밋이 됐는지 모르니 손대지 않는다. 트리가 더러워 다음 save 가 알린다.
        throw new CtxError('E_GIT', '커밋이 됐는지 알 수 없다 — .git/index.lock 이 풀리지 않아 파일은 쓴 채로 두었다. 셸에서 git status · git log 로 확인한다', {
          reason: 'locked',
          message: c.message,
        })
      }
      const head1 = await git.headSha(root)
      if (head1 && head1 !== head0) {
        // 커밋은 됐다 — 호출만 늦게 실패로 돌아왔다. 색인 · 파일 · INDEX 는 add 한 그대로다.
        c = { ok: true, commit: await git.headSha(root, { short: true }) }
        r.warnings.push(`커밋이 ${Math.round(commitTimeout / 1000)}초를 넘겨 늦게 끝났다 — 커밋 훅(check · index)이 느리다`)
      } else if (c.reason !== 'timeout' && /index\.lock/.test(c.message || '') && retry < LOCK_RETRIES) {
        // 남이 index.lock 을 잠깐 쥐어 add · commit 이 시작도 못 했다(HEAD 그대로) — 풀린 뒤 다시 한다.
        // 뮤텍스 밖의 읽기는 이제 잠그지 않지만(`git.status`), 사람의 셸 · 다른 도구는 여전히 쥘 수 있다.
        c = await commit()
      } else {
        // 색인에 올린 것을 먼저 내린다 — 파일만 돌리면 색인에 남아 다음 save 가 「더러운 트리」 로 막힌다
        await git.unstage(root, paths)
        await r.snap.restore()
        throw new CtxError('E_GIT', c.reason === 'timeout' ? `${c.message} — 되돌렸다` : '커밋하지 못했다 — 되돌렸다', { reason: c.reason, message: c.message })
      }
    }

    return {
      commit: c.commit,
      id: r.id,
      sections: r.sections,
      ...(r.baseline ? { baseline: r.baseline } : {}),
      ...(r.snapshots ? { snapshots: r.snapshots, snapshotSkipped: r.snapshotSkipped } : {}),
      vocab: r.vocab,
      managed: r.managedChanges.length,
      ...(r.managedChanges.length ? { managedChanges: r.managedChanges } : {}),
      ...(r.assets.length ? { assets: r.assets } : {}),
      ...(r.edits.length ? { edits: r.edits } : {}),
      ...(r.examples ? { examples: r.examples } : {}),
      ...(r.dropped ? { dropped: r.dropped } : {}),
      warnings: r.warnings,
      mirror: 'off',
    }
  })

  // 등록부를 바꿨으면 로그에 한 줄 — 누가 · 무엇을(행은 사라지기도 한다 · 작업 기록 id 가 그 이유다).
  // 미리보기(dryRun)는 아무것도 안 바꿨다 — 전에는 실제 지우기와 같은 줄이 남아 로그만 보면 지운 줄 알았다(실서버 종합 시험 F15)
  for (const e of out.managedChanges || []) {
    log?.(`${out.dryRun ? '(미리보기) ' : ''}등록부 ${e.op} ${user} ${e.pattern || e.doc}${e.to ? ' → ' + e.to : ''}${e.into ? ' → ' + e.into : ''} (${out.id})`)
  }

  // 11 미러 — **뮤텍스 밖 · 큐 하나.** push 가 늦거나 실패해도 커밋은 서버 트리에 있고,
  // 못 간 것은 다음 push 가 가져간다. 겹치는 push 는 큐가 합친다(검토 D1).
  //
  // 상한(1.5초)까지는 기다려 **실제 결과**를 답한다 — 빠른 원격에서 `queued` 는 아무것도
  // 알리지 않는 말이었다. 넘으면 `queued` 이고 마지막 실제 상태를 `mirrorLast` 로 싣는다(D3).
  if (mirror && !out.dryRun) {
    const p = enqueuePush(root, { log }).catch((e) => {
      log?.('미러 오류: ' + (e?.message || e))
      return null
    })
    const r = await Promise.race([p, new Promise((res) => setTimeout(() => res(undefined), mirrorWaitMs))])
    const last = r === undefined ? lastPush(root) : r
    out.mirror = r === undefined ? 'queued' : r ? r.state : 'queued'
    out.mirrorReason = r && !r.ok ? r.reason : null
    out.mirrorLast = last ? { state: last.state, reason: last.reason, at: last.at, ahead: last.ahead, behind: last.behind } : null
    if (last && !last.ok && last.state !== 'off') {
      const line = mirrorLine({ state: last.state, ahead: last.ahead, behind: last.behind, reason: last.reason, dirty: 0 })
      if (line) out.warnings = [...out.warnings, line]
    }
  }
  return out
}

// 큐레이터만 쓰는 입력과 예약 태그 — writer 가 보내면 파일을 만지기 전에 거절한다(H7)
export const RESERVED_TAGS = ['curate', 'baseline', 'transition', ...SYSTEM_TAGS]

function curatorOnly(input, w) {
  const why = []
  if ((input.sections || []).length) why.push('sections')
  if ((input.managed || []).length) why.push('managed')
  if ((input.edits || []).length) why.push('edits')
  if (input.examples != null) why.push('examples')
  if ((input.baseline || []).length) why.push('baseline')
  if ((input.snapshot || []).length) why.push('snapshot')
  if (w.curates != null) why.push('work.curates')
  if (w.baseline != null) why.push('work.baseline')
  const tags = (w.tags || []).filter((t) => RESERVED_TAGS.includes(t))
  if (tags.length) why.push(`work.tags(${tags.join(', ')})`)
  return why
}

async function run(root, input, { user, write, admin, curate, mirror, now, staging, formsDir = null, formsData = null }) {
  // 1 권한
  if (!write) throw new CtxError('E_FORBIDDEN', '쓰기 권한이 없다', { user })

  // 2 스키마
  const w = checkSchema(input)

  // 2.1 역할 — **writer 는 기록만**(v1.0 I6 · 개편안 §5.2). 관리 문서 층은 큐레이터 한 갈래로만 바뀐다
  if (!curate) {
    const why = curatorOnly(input, w)
    if (why.length) {
      throw new CtxError(
        'E_FORBIDDEN',
        `관리 문서 · 등록부 · 큐레이션은 그 레포의 큐레이터만 쓴다 — ${why.join(' · ')} 를 빼고 work 만 다시 보낸다. 기록은 대기열에 서고 큐레이터가 반영한다(섹션을 읽는 자리는 그동안 이 기록을 같이 낸다)`,
        { user, need: 'curate', fields: why }
      )
    }
  }

  // 2.2 큐레이션 기록 — 다룬 기록은 `curates` 에, 자신은 좌표를 갖지 않는다(대기열 · 미반영 계산이 섞이지 않게)
  let curates = null
  if (w.curates != null) {
    curates = normalizeCurates(w.curates) || []
    if (!curates.length) throw new CtxError('E_INPUT', 'work.curates 가 비었다 — 다룬 기록이 없으면 큐레이션 기록이 아니다', { field: 'work.curates' })
    const ids = new Set()
    for (const j of curates) {
      if (j.bad) throw new CtxError('E_INPUT', `work.curates — ${j.id || '(id 없음)'}: ${j.bad}`, { field: 'work.curates', id: j.id || null })
      if (ids.has(j.id)) throw new CtxError('E_INPUT', `work.curates — ${j.id} 가 두 번 나온다`, { field: 'work.curates', id: j.id })
      ids.add(j.id)
    }
    if ((w.touches || []).length) throw new CtxError('E_INPUT', '큐레이션 기록은 touches 를 갖지 않는다 — 다룬 기록과 좌표는 curates 의 id · into 에 적는다', { field: 'work.touches' })
    if (!w.touchesEmpty) w.touchesEmpty = '큐레이션'
    if (!(w.tags || []).includes('curate')) w.tags = [...(w.tags || []), 'curate']
    // 반영(reflect · new)한 좌표는 같은 save 의 섹션이어야 한다 — 「반영했다」 는 판정이 그 섹션을 쓴 커밋에 붙는다.
    // 예외는 **전환 기록**(태그 transition · `ctx migrate`) 하나 — 옛 파생이 이미 실은 것을 기록으로 남길 뿐 섹션을 쓰지 않는다
    const sent = new Set((input.sections || []).map((s) => s.coord))
    const transition = (w.tags || []).includes('transition')
    for (const j of transition ? [] : curates) {
      for (const c of j.into) {
        if (!sent.has(c)) {
          throw new CtxError('E_INPUT', `work.curates — ${j.id} 의 into ${c} 가 이 save 의 sections 에 없다. 반영한 섹션을 같이 보낸다(바뀐 것이 없으면 section 의 content 그대로) · 반영하지 않을 기록이면 verdict: keep`, {
            field: 'work.curates',
            id: j.id,
            coord: c,
          })
        }
      }
    }
  }
  const managedOps = checkManagedShape(input.managed)
  const editOps = checkEditsShape(input.edits)
  const sections = input.sections || []
  const vocabAdds = input.vocab || []

  const snap = new Snap(root)
  const warnings = []
  // 편입(`source` 가 있다)은 끈다 — 밖에서 온 문서는 시각을 모르는 것이 보통이고, 날짜는 원문의 것이라
  // 고칠 수도 없다. 매번 나오는 경고는 아무것도 알리지 않는다(좌표 누락 TODO F2).
  if (!w.source && !/\d{2}:\d{2}/.test(String(w.date || ''))) {
    warnings.push('date 에 시각이 없다 — 같은 날 같은 좌표의 선후를 알 수 없다')
  }

  // 2.3 기준선 기록 — 블록을 갈아 끼운 save. 기록은 출처 · 시점을 남기고 좌표를 갖지 않는다(대기열 · 미반영을 만들지 않는다)
  const baselineOps = input.baseline || []
  if (baselineOps.length) {
    if (curates) throw new CtxError('E_INPUT', '기준선과 큐레이션은 한 save 에 섞지 않는다 — 기계의 자리와 사람의 판단은 따로 남긴다', { field: 'baseline' })
    if ((w.touches || []).length) throw new CtxError('E_INPUT', '기준선 기록은 touches 를 갖지 않는다 — 갈아 끼운 좌표는 baseline[].coord 에', { field: 'work.touches' })
    const b0 = baselineOps[0]
    w.baseline = { source: (w.baseline?.source || b0.src || '').trim() || null, asof: w.baseline?.asof || b0.asof || null }
    if (!w.baseline.source) throw new CtxError('E_INPUT', '기준선의 출처가 없다 — work.baseline.source 또는 baseline[].src 에 어디서 뽑았나(DB · 커밋 · 파일)를 적는다', { field: 'work.baseline' })
    if (!w.touchesEmpty) w.touchesEmpty = '기준선'
    if (!(w.tags || []).includes('baseline')) w.tags = [...(w.tags || []), 'baseline']
  } else if (w.baseline != null) {
    throw new CtxError('E_INPUT', 'work.baseline 은 baseline[] 과 같이 보낸다', { field: 'work.baseline' })
  }

  // 2.4 정본 스냅샷(리빌딩 검토 §5.2) — 이 save 의 `work` 는 **봉투**다(태그 snapshot · 시스템 기록). 섹션마다 스냅샷 기록 하나를
  // 서버가 같은 커밋에 더 쓴다(6.3). 기계의 자리라 사람의 판단 · 다른 쓰기와 섞지 않는다(기준선과 같은 규칙)
  const snapshotOps = input.snapshot || []
  if (snapshotOps.length) {
    const mixed = [curates && 'work.curates', sections.length && 'sections', baselineOps.length && 'baseline', managedOps.length && 'managed', editOps.length && 'edits', input.examples != null && 'examples', (input.assets || []).length && 'assets'].filter(Boolean)
    if (mixed.length) throw new CtxError('E_INPUT', `정본 스냅샷은 다른 쓰기와 한 save 에 섞지 않는다 — ${mixed.join(' · ')} 를 빼고 보낸다`, { field: 'snapshot', mixed })
    if ((w.touches || []).length) throw new CtxError('E_INPUT', '스냅샷 봉투 기록은 touches 를 갖지 않는다 — 뜰 좌표는 snapshot[].coord 에', { field: 'work.touches' })
    if (!w.touchesEmpty) w.touchesEmpty = '정본 스냅샷'
    if (!(w.tags || []).includes('snapshot')) w.tags = [...(w.tags || []), 'snapshot']
  }

  // 2.5 구조 정리(rename · merge · retire · drop)도 큐레이터의 일이다(v1.0 V2) — 2.1 이 이미 걸렀다

  // 3 존재 — 기존 기록은 고치지도 지우지도 않는다. 정정은 supersedes 를 단 새 기록이다.
  // 파일명은 NFC 로도 NFD 로도 있을 수 있다(checkout 한 OS 마다 다르다) — 디스크에 묻지 않고 이름을 NFC 로 맞춰 대조한다.
  // 묻기만 하면 정규화를 가리지 않는 파일 시스템(Linux)에서 같은 id 의 기록이 둘 생긴다
  const workRel = 'work/' + w.id + '.md'
  const exists = await fs
    .readdir(path.join(root, 'work'))
    .then((names) => names.some((n) => nfc(n) === w.id + '.md'))
    .catch(() => false)
  if (exists) throw new CtxError('E_EXISTS', '그 id 의 작업 기록이 이미 있다', { id: w.id })

  // 3.5 트리 — **더러우면 거절한다.** 서버가 유일한 작성자라 미커밋 변경은 언제나 사고다
  // (중단된 save · 사람의 손). 전에는 그 위에서 섹션을 치환해 남의 줄이 이 사람의 이름으로
  // 커밋됐다(동시 기록 검토 v0.1 M8 — P0). git 한 번(≈80ms)이 그 값이다.
  const st = await git.status(root).catch(() => ({ repo: false }))
  if (st.repo && st.dirty > 0) {
    throw new CtxError(
      'E_GIT',
      `서버 트리에 커밋 안 된 변경 ${st.dirty}건이 있어 save 를 거절했다 (${st.dirtyPaths.slice(0, 5).join(' · ')}${st.dirty > 5 ? ' …' : ''}). ` +
        '콘솔 > 지식 레포 > 「트리 되돌리기」, 또는 셸에서 git -C <레포> checkout -- . && git clean -fd',
      { reason: 'dirty', dirty: st.dirty, paths: st.dirtyPaths }
    )
  }

  // 3.7 좌표 0개 — **사유 없이는 받지 않는다.** 0개도 정상이지만(일정만 정한 작업), 좌표가 없는 기록은
  // `match` · `where` 어디로도 닿지 않는다. 도메인 지식 문서를 편입하면서 정의한 용어를 전부 "설명" 으로
  // 떨어뜨려 `touches: []` 가 경고 없이 커밋됐다(실측 · 좌표 누락 TODO C). 0개임을 확인했다는
  // 선언을 `touchesEmpty` 로 받고, 받았어도 경고로 한 번 더 말한다. 레포 검사는 그대로다 — 이미 있는
  // `touches: []` 기록을 오류로 만들지 않는다.
  if (!(w.touches || []).length) {
    if (!w.touchesEmpty) {
      throw new CtxError(
        'E_INPUT',
        'touches 가 비어 있다 — 이 기록은 좌표로 찾을 수 없다. 정의하거나 처음 도입한 용어 · 바꾼 대상이 없는지 좌표 판정을 다시 보고, 정말 0개면 work.touchesEmpty 에 사유를 적어 보낸다',
        { field: 'work.touches' }
      )
    }
    // 큐레이션 · 기준선 기록은 좌표가 없는 것이 그 기록의 모양이다 — 매번 나오는 경고는 아무것도 알리지 않는다
    if (w.curates == null && !(input.baseline || []).length && !snapshotOps.length) warnings.push(`touches 가 비어 있다 — 이 기록은 좌표로 찾을 수 없다 (사유: ${w.touchesEmpty.trim()})`)
  }

  // 3.8 첨부 꺼내기 — **파일을 만지기 전에.** 없는 ref · 종류 어긋남 · 상한은 여기서 걸린다. 쓰는 것은 6.5
  const pulled = []
  if ((input.assets || []).length) {
    if (!staging) throw new CtxError('E_INPUT', '이 서버는 첨부를 받지 않는다(올리기 자리가 없다)', { field: 'assets' })
    let total = 0
    for (const a of input.assets) {
      const got = await takeAsset(staging, a.ref, { now })
      const ext = path.extname(a.name).toLowerCase()
      if (!got.ext.includes(ext)) {
        throw new CtxError('E_INPUT', `assets[].name 의 확장자(${ext})가 올린 파일의 종류(${got.type})와 다르다`, { name: a.name, type: got.type })
      }
      total += got.buf.length
      if (total > ASSETS_TOTAL_MAX) throw new CtxError('E_INPUT', `첨부는 save 한 번에 합 ${ASSETS_TOTAL_MAX / 1024 / 1024} MB 까지다`, { total })
      pulled.push({ name: a.name, buf: got.buf, type: got.type })
    }
  }

  try {
    // 4 어휘 (메모리 → 파일)
    const vocabPath = '_vocab.md'
    const vocabText = await fs.readFile(path.join(root, vocabPath), 'utf8')
    const { text: nextVocab, added, newTypes } = addVocab(vocabText, vocabAdds)
    if (added) await snap.write(vocabPath, nextVocab)
    // 타입을 만들었으면 말한다 — 오타면 사람이 _vocab.md 에서 고친다. 등록부에 없으면 섹션은 못 쓴다(6단계).
    // 같은 save 가 그 타입의 등록부 행을 더하면(큐레이터가 새 문서를 세운다) 등록부 안내는 붙이지 않는다
    const rowFor = (t) => managedOps.some((o) => (o.op ?? 'add') === 'add' && String(o.pattern || '').startsWith(t + ':'))
    for (const t of newTypes) {
      warnings.push(
        `새 어휘 타입 "${t}" 을 만들었다 (_vocab.md 끝) — 의도한 타입이 맞는지 본다 · 오타면 admin 이 _vocab.md 를 고친다(지우는 연산은 없다)` +
          (rowFor(t) ? '' : ' · 이 타입의 관리 문서는 큐레이터가 세운다(대기열의 「등록부 없음」 → managed 로 등록부 행)')
      )
    }

    // 5 좌표 — 어휘 등재 **뒤에** 본다. 새 좌표를 같은 save 에서 등재하고 쓰는 것이 정상이다.
    const r0 = await loadRepo(root, { settings: SETTINGS })
    // 쓰기 전 검사 — 8단계가 「이 save 가 새로 만든 오류」 만 가리는 기준(v1.0 I10 · V21). 어휘 추가는 오류를 만들지 않는다
    const before = checkOf(r0)
    // 5.0 큐레이션 판정의 대상 — 있는 기록이고 사람의 작업 기록이어야 한다.
    // 전환 기록은 **한 번** — 옛 파생 이력이 있고 큐레이션 기록이 아직 없는 레포(암묵 전환)에서만 into 검사를 면한다
    if (curates && (w.tags || []).includes('transition') && !r0.curation?.implicit) {
      throw new CtxError('E_INPUT', '전환 기록(태그 transition)은 옛 레포의 첫 큐레이션 한 번이다 — 이미 큐레이션 기록이 있거나 옛 파생 이력이 없다. 보통의 큐레이션으로 보낸다', { field: 'work.tags' })
    }
    for (const j of curates || []) {
      const d = r0.byId.get(j.id)
      if (!d) throw new CtxError('E_INPUT', `work.curates — ${j.id} 라는 작업 기록이 없다`, { field: 'work.curates', id: j.id })
      if (!['work', 'snapshot'].includes(recordKind(d))) throw new CtxError('E_INPUT', `work.curates — ${j.id} 는 큐레이션 · 기준선 · 옛 기계 기록이다 — 사람의 작업 기록 · 정본 스냅샷만 다룬다`, { field: 'work.curates', id: j.id })
    }
    // 5.05 정본 스냅샷 — 섹션 원문 · 날짜(섹션 줄의 마지막 커밋) · 출처를 지금 트리에서 뜬다. 근거가 이미 있는 섹션은 건너뛴다
    const snapshots = []
    const snapshotSkipped = []
    if (snapshotOps.length) {
      const head = await git.headSha(root, { short: true }).catch(() => null)
      const sourced = new Set()
      for (const d of r0.works) if (['work', 'snapshot'].includes(recordKind(d))) for (const c of d.touches || []) sourced.add(c)
      for (const { coord } of snapshotOps) {
        const x = sliceSection(r0, coord)
        if (!x) throw new CtxError('E_INPUT', '등록부에 걸리지 않는 좌표다 — 뜰 섹션이 없다', { field: 'snapshot', coord })
        if (x.missing) throw new CtxError('E_INPUT', `섹션이 없다(${x.missing === 'doc' ? '문서 없음' : '헤딩 없음'}) — 뜰 원문이 없다`, { field: 'snapshot', coord })
        const text = splitBaseline(x.content || '').curated.trim()
        if (!text) throw new CtxError('E_INPUT', '섹션에 큐레이터의 글이 없다(비었거나 기준선 블록뿐) — 뜰 것이 없다', { field: 'snapshot', coord })
        if (sourced.has(coord)) {
          snapshotSkipped.push({ coord, reason: '근거 있음 — 그 좌표를 건드린 기록 · 스냅샷이 있다' })
          continue
        }
        const hit = r0.managedIndex.find(coord)
        const t = hit?.section && !hit.section.whole ? await git.blameMaxTime(root, x.doc, hit.section.line + 1, hit.section.end).catch(() => null) : null
        const asof = fmtLocal(t != null ? t * 1000 : now)
        const id = `${asof.slice(0, 4)}-${asof.slice(5, 7)}${asof.slice(8, 10)}-스냅샷-${slugOf(coord)}`
        if (r0.byId.has(id) || snapshots.some((y) => y.id === id)) {
          snapshotSkipped.push({ coord, reason: `같은 id 의 기록이 있다(${id})` })
          continue
        }
        const heading = x.heading || x.anchor || coord
        const source = `${x.doc}${head ? '@' + head : ''}#${String(heading).replace(/^#+\s*/, '')}`
        snapshots.push({ coord, id, asof, source, heading, text, doc: x.doc })
      }
      if (!snapshots.length) throw new CtxError('E_INPUT', '뜰 스냅샷이 없다 — 보낸 좌표가 전부 근거가 있다', { field: 'snapshot', skipped: snapshotSkipped })
      w.body = [w.body.replace(/\s*$/, ''), '', `**뜬 섹션 ${snapshots.length}**`, '', ...snapshots.map((y) => `- \`${y.coord}\` → [\`${y.id}\`](${y.id}.md)`), ''].join(NL)
    }

    // 섹션의 applied — 반영(into)한 기록 중 그 좌표를 건드린 **가장 늦은 기록**(v1.0 §4.4 · H3). 판정이 없으면 이 기록
    // **applied 는 뒤로 가지 않는다** — 원문 날짜를 단 옛 기록(편입)만 반영해도 지금 applied 가 더 늦은 작업 기록이면 그것을 둔다.
    // 뒤로 가면 이미 반영한 늦은 기록이 그 섹션의 미반영(`later`)으로 되살아난다
    const appliedFor = (coord) => {
      const hits = (curates || []).filter((j) => j.verdict !== 'keep' && j.into.includes(coord)).map((j) => r0.byId.get(j.id)).filter(Boolean)
      if (!hits.length) return w.id
      const cur = r0.sections.find((x) => x.coord === coord)?.applied
      const curDoc = cur ? r0.byId.get(cur) : null
      if (curDoc && ['work', 'snapshot'].includes(recordKind(curDoc)) && !hits.includes(curDoc)) hits.push(curDoc)
      return hits.sort(cmpDateDesc)[0].id
    }
    const known = new Set(r0.vocab.coords.keys())
    for (const v of vocabAdds) known.add(v.coord)
    const readRaw = (rel) => fs.readFile(path.join(root, rel), 'utf8').catch(() => null)
    const docTexts = async (list) => new Map(await Promise.all(list.map(async (d) => [d.path, (await readRaw(d.path)) ?? ''])))

    // 5.1 예시 정리(등록부 사본 검토 X10~X12) — `example:` 어휘 줄과 그 짝 섹션 · 「(예시)」 섹션을 한 번에.
    // 작업 기록이 쓰는 예시 좌표는 지우지 않는다(그때는 좌표다 — 지우면 미등재 오류) · 표시만 뗀다.
    let purged = null
    if (input.examples === 'purge') {
      const touched = new Map()
      for (const d of r0.works) for (const c of d.touches) touched.set(c, [...(touched.get(c) || []), d.id])
      const p = planPurge({ vocabText: await readRaw(vocabPath), registry: r0.registry, docs: await docTexts(r0.managedDocs), touched })
      if (p.vocabText != null) await snap.write(vocabPath, p.vocabText)
      for (const [rel, text] of p.files) await snap.write(rel, text)
      for (const c of p.coords) known.delete(c)
      purged = { coords: p.coords, sections: p.sections, kept: p.kept, left: p.left }
      if (!p.coords.length && !p.sections.length && !p.kept.length) warnings.push('지울 서식 예시가 없다')
      if (p.left.length) warnings.push(`예시 표시가 남은 줄 ${p.left.length}개 — 섹션이 아니라 표의 행이라 두었다. 지우려면 edits 로: ${p.left.slice(0, 3).map((l) => l.file + ':' + l.line).join(' · ')}${p.left.length > 3 ? ' …' : ''}`)
    }

    // 5.2 섹션 밖 쓰기(X15~X19) — 머리말 · 산문 · 비대상 문서. 등록부 계획(5.5)이 고친 글을 읽도록 그 앞에서
    let editsDone = []
    const edited = new Map() // edits 가 고친 글 — 지우기 참조 판정(5.6)이 「고친 뒤」 로 본다
    if (editOps.length) {
      const vt = (await readRaw(vocabPath)) ?? ''
      const { parseVocab } = await import('./vocab.js')
      const e = await planEdits({ edits: editOps, read: readRaw, registry: r0.registry, vocabCoords: new Set(parseVocab(readText(vt)).coords.keys()) })
      for (const [rel, text] of e.files) {
        await snap.write(rel, text)
        edited.set(rel, readText(text))
      }
      editsDone = e.done
    }
    for (const c of [...(w.touches || []), ...sections.map((s) => s.coord), ...baselineOps.map((b) => b.coord)]) {
      if (!known.has(c)) throw new CtxError('E_INPUT', '어휘에 없는 좌표다 — vocab 에 같이 보내거나 먼저 등재한다', { coord: c })
    }

    // 5.5 등록부 — 행 더하기 · 문서 만들기 · 정리. 계획은 순수 함수가 세우고(`managedops`) 쓰는 것은 여기(`Snap`)다.
    // 새 행은 마지막 규칙 행 뒤에 붙으므로 기존 좌표의 자리는 바뀌지 않는다. 6단계는 **새 등록부**로 판정한다.
    let registry = r0.registry
    let plan = null
    let dropped = null
    if (managedOps.length) {
      const regText = await fs.readFile(path.join(root, '_managed.md'), 'utf8').catch(() => null)
      // 서식에서 세우는 문서가 있으면 서식집을 읽는다 — 서버가 넘긴 자리(--forms · 팀 서식) 또는 기본 자리
      const forms = managedOps.some((o) => o.form) ? (await formsLib({ explicit: formsDir, dataDir: formsData })).byId : null
      plan = await planManaged({
        ops: managedOps,
        registryText: regText,
        docPaths: r0.managedDocs.map((d) => d.path),
        read: (rel) => fs.readFile(path.join(root, rel), 'utf8').catch(() => null),
        workId: w.id,
        forms,
      })
      warnings.push(...plan.warnings)
      // 5.4 어긋나는 산문 검사는 걷었다(v1.0) — 서식에서 찍은 문서에는 등록부를 베낀 산문이 없다. 옛 레포의 그런 문구는
      // 이행(`ctx migrate`)이 정리하고, 남은 것은 큐레이터가 edits 로 고친다.
      // 5.6 지우기(관리문서 정리 검토 §4.3) — 내용이 있는 문서는 거절 · 그 문서로만 가던 예시 좌표는 같이 · 가리키는 줄은
      // edits 로 고쳤거나 reviewed 로 넘겼어야 한다. 판정은 **지우기 전** 레포(r0)로 — 섹션 · 작업 기록 · 행이 아직 있다
      const drops = plan.events.filter((e) => e.op === 'drop').map((e) => e.doc)
      if (drops.length) {
        warnings.push(...checkDrop(r0, drops))
        const after = new Map(r0.bodies)
        for (const [rel, text] of edited) after.set(rel, text)
        const reviewed = managedOps.filter((o) => o.op === 'drop').flatMap((o) => o.reviewed || [])
        const refs = dropRefs({ before: r0.bodies, after, targets: drops, paths: r0.managedDocs.map((d) => d.path), reviewed })
        if (refs.left.length && !input.dryRun) throw refsError(refs.left)
        if (refs.seen.length) warnings.push(`지울 문서를 가리키는 줄 ${refs.seen.length}개를 알고 두었다(reviewed): ${refs.seen.map((x) => x.file + ':' + x.line).join(' · ')}`)
        const v = dropVocab(await readRaw(vocabPath), r0.registry, drops)
        if (v.vocabText != null) await snap.write(vocabPath, v.vocabText)
        if (v.kept.length) warnings.push(`지운 문서로 가던 어휘 좌표 ${v.kept.length}개는 남겼다 — 이제 등록부 밖 좌표다(작업 기록이 원천): ${v.kept.slice(0, 5).join(' · ')}${v.kept.length > 5 ? ' …' : ''}`)
        const leftKey = new Set(refs.left.map((x) => x.file + ':' + x.line))
        // 미리보기에는 줄마다 제안의 edits 초안(`edit`)을 싣는다 — 화면이 원문을 따로 읽어 계획을 세우지 않게(판정 한 곳)
        const raws = new Map()
        if (input.dryRun) for (const x of refs.refs) if (!raws.has(x.file)) raws.set(x.file, (await readRaw(x.file)) ?? '')
        dropped = {
          docs: drops,
          vocabRemoved: v.removed,
          vocabKept: v.kept,
          refs: refs.refs.map((x) => ({ ...x, left: leftKey.has(x.file + ':' + x.line), ...(input.dryRun ? { edit: suggestEdit(raws.get(x.file), x, drops) } : {}) })),
          ...(input.dryRun ? { left: refs.left } : {}),
        }
      }
      if (plan.changed) {
        await snap.write('_managed.md', plan.registryText)
        registry = parseRegistry(readText(plan.registryText))
      }
      for (const [rel, body] of plan.files) {
        if (body === null) await snap.remove(rel)
        else await snap.write(rel, body)
      }
      // 새 행이 걸리는 기존 좌표의 섹션을 **같이 받지 않아도 된다**(v1.0 · H1). 전에는 그 좌표가 앵커 없음(error)이 되어
      // 레포의 다음 save 가 전부 막혔다(실측 P4). 이제 섹션이 없는 좌표는 오류가 아니라 대기열의 「등록부 있음 · 섹션 없음」
      // 이고, `section` 은 섹션 대신 그 좌표의 미반영 기록을 낸다. 문서를 세우고 섹션은 차례로 채운다.
    }

    // 6 섹션
    const byDoc = new Map()
    const written = [{ file: workRel, text: w.body }] // A7 — 이 save 가 쓴 본문과 그 파일(링크는 그 파일 기준이다)
    for (const s of sections) {
      const hit = resolveCoord(registry, s.coord)
      if (!hit) {
        throw new CtxError('E_INPUT', '등록부에 걸리지 않는 좌표다 — 관리 문서가 없다. managed: [{ pattern, doc }] 로 행을 같이 보내 만들거나, sections 에서 빼고 touches 로만 닿게 한다', { coord: s.coord })
      }
      // 등록부가 준 경로를 그대로 쓰지 않는다 — 손으로 고친 행이 레포 밖을 가리킬 수 있다(Snap 이 한 번 더 막는다)
      if (docEscapes(hit.doc)) throw new CtxError('E_INPUT', '등록부 행의 관리 문서 경로가 레포 밖을 가리킨다 — _managed.md 를 사람이 고친다', { coord: s.coord, doc: hit.doc })
      if (!byDoc.has(hit.doc)) {
        byDoc.set(hit.doc, await fs.readFile(path.join(root, hit.doc), 'utf8').catch(() => ''))
      }
      // **본문에 섹션 레벨 이하의 헤딩 줄이 있으면 거절한다.** `section` 이 준 `body` 는
      // 헤딩부터 실린 원문이라 그것을 그대로 고쳐 보내기 쉬운데, 서버가 헤딩을 또 붙이면
      // 파서가 둘째 헤딩을 새 섹션 시작으로 읽어 이 좌표의 섹션은 두 줄만 남고 빈다 —
      // 그리고 save 는 성공하고 check 도 where 도 조용했다(2026-09-23 실측). applied 주석은
      // 2단계에서 막는데 헤딩은 안 막았다. 같은 자리다. 보낼 것은 `section` 의 `content` 다.
      // `—`(문서 전체 · level 0) 는 본문에 헤딩이 있는 것이 정상이라 보지 않는다.
      if (hit.level > 0) {
        const splitRe = new RegExp('^#{1,' + hit.level + '}\\s')
        // 코드펜스 안의 `#` 줄(셸 주석)은 헤딩이 아니다 — 파서와 치환(sectionSpan)도 펜스 밖만 본다
        let at = -1
        for (const [i, l] of outsideFences(s.body.split(NL))) {
          if (splitRe.test(l)) {
            at = i
            break
          }
        }
        if (at >= 0) {
          throw new CtxError(
            'E_INPUT',
            `sections[].body 에 헤딩 줄(${s.body.split(NL)[at].trim().slice(0, 60)})이 있다 — 섹션을 쪼갠다. 헤딩과 applied 는 서버가 붙인다: section 의 content 를 고쳐 보낸다`,
            { coord: s.coord, line: at + 1 }
          )
        }
      }
      // 지금 섹션의 기준선 블록은 그대로 다시 붙인다 — 큐레이터는 블록 밖만 쓴다
      const curBlock = (() => {
        const cut0 = sliceSection(r0, s.coord)
        return cut0 && !cut0.missing ? splitBaseline(cut0.content).block : null
      })()
      const res = replaceSection(byDoc.get(hit.doc), {
        value: hit.value,
        level: hit.level,
        body: curBlock ? joinBaseline(s.body, curBlock.text) : s.body,
        id: appliedFor(s.coord),
        heading: s.heading,
      })
      // 새 섹션의 `heading` 은 제목 줄 **전체**(`값 — 설명`)다 — 값이 빠지면 그 섹션은 이 좌표의 것으로 안 읽힌다(앵커 없음)
      if (res.created && s.heading && hit.level > 0 && normValue(s.heading.split(/\s+[—–-]\s+/)[0]) !== normValue(hit.value)) {
        throw new CtxError('E_INPUT', `sections[].heading 은 제목 줄 전체다 — "${hit.value} — 설명" 처럼 값으로 시작한다(값이 빠지면 섹션이 이 좌표로 안 읽힌다)`, { coord: s.coord, heading: s.heading.slice(0, 80) })
      }
      // **읽은 뒤 바뀌었으면 거절한다.** 덮어쓰면 남의 갱신이 조용히 사라진다.
      //
      // 거절에 **다시 만들 재료**를 싣는다(동시 기록 검토 v0.1 D6) — 누가 · 언제 · 어느 기록으로
      // 바꿨고 지금 본문(`content`)이 무엇인지. 전에는 세 값뿐이라 `section` 을 한 번 더 부르고
      // 처음부터 다시 만들었다. 8,000자를 넘으면 자르고 `truncated` — 그때만 `section` 을 다시.
      const sent = s.applied ?? null
      if (!res.created && res.current !== sent) {
        const cw = res.current ? r0.byId.get(res.current) : null
        const cut = sliceSection(r0, s.coord)
        const content = cut && !cut.missing ? String(cut.content ?? '') : null
        // 누가 고쳤나 — v1.0 의 applied 는 **반영된 기록**이라 그 작성자가 섹션을 고친 사람이 아닐 수 있다(큐레이터가 남의
        // 기록을 반영한다). 이 좌표를 반영한 큐레이션 기록 중 applied 기록보다 늦은 것이 있으면 그 큐레이터가 고친 것이다
        const cc = cw ? lastCurationOf(r0, s.coord, cw) : null
        const who = cc
          ? `${cc.author || '(작성자 없음)'} 가 ${cc.date || '(날짜 없음)'} 에 큐레이션 ${cc.id} 로 갱신했다(applied 는 반영한 기록 ${cw.id})`
          : cw
            ? `${cw.author || '(작성자 없음)'} 가 ${cw.date || '(날짜 없음)'} 에 ${cw.id} 로 갱신했다`
            : res.current
              ? `${res.current} 로 갱신됐다`
              : '섹션이 만들어졌다'
        throw new CtxError('E_CONFLICT', `섹션이 읽은 뒤 바뀌었다 — ${who}. detail.content(지금 본문) 위에 다시 만들어 applied 에 current 를 넣어 보낸다`, {
          coord: s.coord,
          expected: sent,
          current: res.current,
          currentWork: cw ? { id: cw.id, title: cw.title, author: cw.author ?? null, date: cw.date ?? null } : null,
          currentCuration: cc ? { id: cc.id, author: cc.author ?? null, date: cc.date ?? null } : null,
          content: content == null ? null : content.slice(0, CONFLICT_CONTENT_MAX),
          truncated: content != null && content.length > CONFLICT_CONTENT_MAX,
        })
      }
      byDoc.set(hit.doc, res.text)
      written.push({ file: hit.doc, text: s.body })
    }
    // 6.2 기준선 — 섹션 안 블록만 통째로 갈아 끼운다. 블록 밖(큐레이터의 글) · applied 는 그대로. 섹션이 없으면 블록만 든 섹션을 만든다
    for (const b of baselineOps) {
      const hit = resolveCoord(registry, b.coord)
      if (!hit) throw new CtxError('E_INPUT', '등록부에 걸리지 않는 좌표다 — 기준선을 넣을 관리 문서가 없다. 큐레이터가 먼저 문서를 세운다', { coord: b.coord })
      if (hit.level === 0) throw new CtxError('E_INPUT', '문서 전체(—) 규칙의 좌표에는 기준선 블록을 넣지 않는다', { coord: b.coord })
      if (docEscapes(hit.doc)) throw new CtxError('E_INPUT', '등록부 행의 관리 문서 경로가 레포 밖을 가리킨다', { coord: b.coord, doc: hit.doc })
      if (!byDoc.has(hit.doc)) byDoc.set(hit.doc, await fs.readFile(path.join(root, hit.doc), 'utf8').catch(() => ''))
      const block = renderBlock({ src: b.src || w.baseline?.source, asof: b.asof || w.baseline?.asof, body: b.body })
      byDoc.set(hit.doc, replaceBaseline(byDoc.get(hit.doc), { value: hit.value, level: hit.level, heading: b.heading, block }))
    }
    for (const [doc, text] of byDoc) await snap.write(doc, text)

    // 6.5 첨부 — 올리기 API 가 들고 있던 바이트를 `work/assets/<id>/<이름>` 에(A1 · A5). 작업 기록 · 섹션과
    // 같은 커밋이고, 검사에서 걸리면 같이 되돌린다(`Snap` 이 새 파일을 지운다).
    const assetsOut = []
    for (const a of pulled) {
      const rel = `work/assets/${w.id}/${a.name}`
      await snap.writeBin(rel, a.buf)
      assetsOut.push({ path: rel, size: a.buf.length, type: a.type })
    }

    // 6.7 본문이 가리키는 그림 · 첨부(A7) — **경고다.** 편입 원문의 깨진 링크는 원문의 것이라 거절하지 않는다.
    // 화면과 같은 규칙(`core/repopath.js`)으로 풀어야 「save 는 조용했는데 화면에서 깨진다」 가 안 생긴다.
    const pointed = new Set()
    const missingImgs = []
    for (const { file, text } of written) {
      for (const ref of mdRefs(text)) {
        const r = repoPath(file, ref.href)
        if (!r) continue
        if (!r.outside) pointed.add(r.path)
        if (!ref.image) continue
        if (r.outside) missingImgs.push(`${ref.href} (레포 밖 · ${file})`)
        else if (!(await fs.access(path.join(root, r.path)).then(() => true).catch(() => false))) missingImgs.push(`${r.path} (${file})`)
      }
    }
    if (missingImgs.length) {
      warnings.push(`본문이 가리키는 그림 ${missingImgs.length}개가 레포에 없다 — 화면에서 「그림을 찾을 수 없음」 으로 나온다: ${missingImgs.slice(0, 5).join(' · ')}${missingImgs.length > 5 ? ' …' : ''}`)
    }
    const unlinked = assetsOut.filter((a) => !pointed.has(a.path))
    if (unlinked.length) {
      // HTML 시각 자료는 그림이 아니라 링크로 건다 — `![…]` 로 적으면 깨진 그림이 된다
      const bang = unlinked[0].type === 'text/html' ? '' : '!'
      warnings.push(
        `올린 첨부 ${unlinked.length}개를 어느 본문도 가리키지 않는다 — 관리 문서에서는 ${bang}[설명](../${unlinked[0].path}), 작업 기록에서는 ${bang}[설명](${unlinked[0].path.slice('work/'.length)}): ${unlinked.map((a) => a.path).join(' · ')}`
      )
    }

    // 6.8 HTML 시각 자료(W3) — **경고다.** 지식이 HTML 안에만 갇히면 검색 · section · 큐레이션 어디에도 걸리지 않는다.
    // 부르는 외부 자원은 CSP(`HTML_CSP`)가 막거나 폐쇄망에서 빈다 — 쓰는 순간에 안다
    const htmls = pulled.filter((a) => a.type === 'text/html')
    if (htmls.length) {
      if (proseLength(w.body) < 120) {
        warnings.push(
          `HTML 시각 자료(${htmls.map((a) => a.name).join(' · ')})를 들였는데 작업 기록 본문이 짧다 — 검색 · section · 큐레이션은 md 만 본다. 요지(무엇 · 결정 · 확인 목록)를 본문에 md 로 적는다`
        )
      }
      for (const a of htmls) {
        const ext = htmlExternal(a.buf.toString('utf8'))
        if (ext.blocked.length) {
          warnings.push(`${a.name} 이 부르는 외부 자원 ${ext.blocked.length}개는 화면이 막는다(CSP) — 보이지 않는다. 인라인으로 넣거나 cdnjs · jsdelivr · unpkg 로: ${ext.blocked.slice(0, 3).join(' · ')}${ext.blocked.length > 3 ? ' …' : ''}`)
        }
        if (ext.cdn.length) warnings.push(`${a.name} 이 CDN(${ext.cdn.join(' · ')})을 부른다 — 폐쇄망에서는 그 부분이 빌 수 있다`)
      }
    }

    // 6.9 정본 스냅샷 기록 — 섹션 하나에 하나. 원문 그대로(머리 한 줄만 — 사건이 아니라 그때의 상태라는 표시)
    for (const y of snapshots) {
      const body = [`> 정본 스냅샷 — \`${y.doc}\` 의 「${String(y.heading).replace(/^#+\s*/, '')}」 를 원문 그대로 떴다(${y.asof} 기준 · 봉투 [\`${w.id}\`](${w.id}.md)). 사건이 아니라 그때의 상태다.`, '', y.text].join(NL)
      const rec = { id: y.id, title: `[스냅샷] ${y.coord}`, date: y.asof, source: y.source, touches: [y.coord], snapshot: { source: y.source, asof: y.asof.slice(0, 10) }, tags: ['snapshot'], body }
      await snap.write(`work/${y.id}.md`, renderWork(rec, user))
    }

    // 7 기록 — TEMPLATE 순서의 프론트매터. author 는 토큰의 user 다. 첨부는 `attachments` 로 — 화면의 첨부 목록이 이것을 읽는다
    await snap.write(workRel, renderWork(w, user, assetsOut.map((a) => a.path.slice('work/'.length)), curates))

    // INDEX 두 파일 · 등록부 사본(문서 머리 표 칸 · _vocab.md 생성 블록)은 **더 만들지 않는다**(v1.0 I9 · V4) — 레포에는
    // 지식만 둔다. 목록과 좌표별 색인은 화면 · 도구가 계산하고, 등록부는 `_managed.md` 한 곳이다(사본은 반드시 낡는다).

    // 8 검사 — 갱신된 트리로 다시 본다. **이 save 가 새로 만든 오류**면 되돌리고 커밋하지 않는다(v1.0 I10 · V21).
    // 레포에 원래 있던 오류는 막지 않고 경고로 싣는다 — 그 오류를 만든 것도 고칠 권한도 이 save 가 아니다.
    const r1 = await loadRepo(root, { settings: SETTINGS })
    const res = checkOf(r1)
    const errors = newErrors(before, res)
    if (errors.length) {
      await snap.restore()
      throw new CtxError('E_CHECK', '검사에서 이 save 가 만든 오류가 났다 — 아무것도 커밋하지 않았다', {
        findings: errors,
        ...(plan?.added.length ? { hint: '새 등록부 행이 걸리는 좌표는 sections 를 같이 보낸다 · 문서 안에 같은 이름의 섹션이 둘이면 이름을 고친다' } : {}),
      })
    }
    const old = res.findings.filter((f) => f.sev === 'error')
    if (old.length) warnings.push(`레포에 원래 있던 오류 ${old.reduce((a, f) => a + f.items.length, 0)}건 — 이 save 와 무관해 막지 않았다(${old.map((f) => f.label).join(' · ')}). check 로 보고 고칠 사람이 고친다`)
    // 큐레이션 대기가 오래됐다는 경고는 큐레이터의 일이다 — writer 의 응답에 실으면 할 수 없는 일을 말하는 소음이다
    for (const f of res.findings.filter((x) => x.sev === 'warn' && (curate || x.kind !== 'curation-stale'))) warnings.push(`${f.label} ${f.items.length}건`)

    return {
      snap,
      id: w.id,
      title: w.title,
      sections: sections.length,
      ...(baselineOps.length ? { baseline: baselineOps.length } : {}),
      ...(snapshotOps.length ? { snapshots: snapshots.map(({ coord, id, asof }) => ({ coord, id, date: asof })), snapshotSkipped } : {}),
      vocab: added,
      managedChanges: plan?.events || [],
      assets: assetsOut.map(({ path: p, size }) => ({ path: p, size })),
      edits: editsDone,
      examples: purged,
      dropped,
      dryRun: !!input.dryRun,
      warnings,
    }
  } catch (e) {
    await snap.restore()
    throw e
  }
}

// 이 좌표를 반영한 가장 늦은 큐레이션 기록 — applied 기록(cw)보다 앞선 날의 것은 뺀다(같은 날이면 큐레이션이 뒤다 —
// 기록이 있어야 반영한다). E_CONFLICT 의 「누가 고쳤나」 가 읽는다
function lastCurationOf(r, coord, cw) {
  const day = (d) => String(d.date || '').slice(0, 10)
  let best = null
  for (const d of r.works) {
    if (d.id === cw.id || recordKind(d) !== 'curation') continue
    if (!(d.curates || []).some((j) => j.verdict !== 'keep' && (j.into || []).includes(coord))) continue
    if (day(d) < day(cw)) continue
    if (!best || cmpDateDesc(d, best) < 0) best = d
  }
  return best
}

// 검사 한 번 — save 의 쓰기 전 · 쓴 뒤가 같은 인자로 같은 함수를 부른다
function checkOf(r) {
  return runBuiltinCheck({
    docs: r.docs,
    vocabText: r.vocabText,
    managedText: r.managedText,
    vocab: r.vocab,
    validity: r.validity,
    indexInfo: r.indexInfo,
    managedIndex: r.managedIndex,
    sections: r.sections,
    bodies: r.bodies,
    curation: r.curation,
  })
}

function renderWork(w, user, attachments = [], curates = null) {
  const fm = ['---', `id: ${w.id}`, `title: ${yamlStr(w.title)}`, `date: ${w.date || ''}`, `author: ${yamlStr(user)}`]
  if (w.source) fm.push(`source: ${yamlStr(w.source.trim())}`)
  // 0개는 `touches: []` — 빈 `touches:` 는 YAML 로 null 이라 "0개임을 확인했다" 는 선언이 안 된다.
  const touches = w.touches || []
  fm.push('touches:' + (touches.length ? '' : ' []'))
  for (const c of touches) fm.push(`  - ${c}`)
  if (!touches.length && w.touchesEmpty) fm.push(`touchesEmpty: ${yamlStr(w.touchesEmpty.trim())}`)
  if (w.supersedes) fm.push(`supersedes: ${w.supersedes}`)
  if (attachments.length) fm.push(`attachments: [${attachments.map(yamlStr).join(', ')}]`)
  if (w.baseline) fm.push(`baseline: { source: ${JSON.stringify(w.baseline.source)}${w.baseline.asof ? ', asof: ' + JSON.stringify(String(w.baseline.asof)) : ''} }`)
  if (w.snapshot) fm.push(`snapshot: { source: ${JSON.stringify(w.snapshot.source)}, asof: ${JSON.stringify(String(w.snapshot.asof))} }`)
  // 큐레이션 판정 — 한 줄에 하나. 좌표 · 사유는 JSON 문자열로(콜론 · 대괄호가 YAML 을 깨지 않게)
  if (curates?.length) {
    fm.push('curates:')
    for (const j of curates) {
      const parts = [`id: ${JSON.stringify(j.id)}`, `verdict: ${j.verdict}`]
      if (j.into.length) parts.push(`into: [${j.into.map((c) => JSON.stringify(c)).join(', ')}]`)
      if (j.reason) parts.push(`reason: ${JSON.stringify(j.reason)}`)
      fm.push(`  - { ${parts.join(', ')} }`)
    }
  }
  fm.push(`tags: [${(w.tags || []).map(yamlStr).join(', ')}]`, '---', '')
  return fm.join(NL) + NL + w.body.replace(/\s*$/, '') + NL
}

// 스냅샷 id 의 꼬리 — 좌표의 `:` · `/` · 공백을 `-` 로(id 규칙 RE_ID 는 `/` · 제어문자를 받지 않는다)
function slugOf(coord) {
  return String(coord).replace(/[:/\\\s]+/g, '-').replace(/-+/g, '-').slice(0, 100)
}

// `YYYY-MM-DD HH:MM` (이 PC 의 시간대) — 작업 기록의 date 모양
function fmtLocal(ms) {
  const d = new Date(ms)
  const p = (n) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}

// YAML 에서 그대로 두면 깨지는 값(콜론 · 대괄호 · 따옴표 · # )은 인용한다 — importdir 와 같은 규칙.
// 전에는 title 을 그대로 적었다 — `[정정] …` 이면 배열로 읽혀 제목이 사라진다(cdp-save 「제목 인용」 을 사람이 지켜야 했다).
function yamlStr(s) {
  const v = String(s ?? '')
  return /[:#\[\]{}&*!|>'"%@`,]|^\s|\s$|^$/.test(v) ? JSON.stringify(v) : v
}
