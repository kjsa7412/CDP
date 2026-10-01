// save — 모드 B 의 유일한 쓰기 도구. 설계서 §4.5.
//
// 단위는 **작업 기록 1건 + 파생 섹션 갱신 + 어휘 등재**이고 한 커밋이다(§0).
// 모드 A 에서는 스킬이 Edit/Write 로 하고 커밋 훅이 검사하던 것을, 여기서는
// 서버가 한 번에 한다 — 클라이언트에 작업 트리가 없기 때문이다(§4.2).
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
import { runBuiltinCheck } from './check.js'
import { resolveCoord, parseRegistry, docEscapes, normValue } from './managed.js'
import { planManaged, checkManagedShape, needsAdmin } from './managedops.js'
import { readText } from './scan.js'
import { renderIndex, renderByCoord } from './indexes.js'
import * as git from './git.js'
import { CtxError, checkCoord, checkId, sliceSection } from './tools.js'
import { withLock } from './lock.js'
import { enqueuePush, lastPush, describe as mirrorLine } from './mirror.js'
import { topApplied } from './frontmatter.js'
import { take as takeAsset, checkAssetName, ASSETS_COUNT_MAX, ASSETS_TOTAL_MAX } from './assets.js'
import { repoPath, mdRefs } from './repopath.js'
import { regenerate, proseConflicts } from './regen.js'
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
// 커밋(훅이 `bin/ctx check` · `ctx index` 를 돈다)의 상한 — git 기본 20초는 부하 걸린 기계에서 모자란다.
// 넘어도 판정은 index.lock · HEAD 로 한다(10단계). 뮤텍스 안이라 그동안 다른 save 는 줄을 선다.
export const COMMIT_TIMEOUT_MS = 120000
// 남이 쥔 index.lock 때문에 커밋이 시작도 못 했을 때 다시 하는 횟수 — 잠금이 풀린 뒤에(10단계)
export const LOCK_RETRIES = 2

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
  checkId(w.id)
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
  const re = new RegExp('^#{' + level + '}\\s+' + value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(\\s|$)')
  const at = lines.findIndex((l) => re.test(l))

  if (at < 0) {
    // 새 섹션 — 문서 끝에 붙인다.
    const add = ['', '#'.repeat(level) + ' ' + (heading || value), APPLIED_MARK + ' ' + id + ' -->', '', ...body.split(NL)]
    while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
    return { text: lines.concat(add).join(NL) + NL, created: true, current: null }
  }

  // 같은/상위 레벨의 다음 헤딩 전까지가 이 섹션이다.
  let end = lines.length
  for (let i = at + 1; i < lines.length; i++) {
    const m = /^(#{1,6})\s/.exec(lines[i])
    if (m && m[1].length <= level) {
      end = i
      break
    }
  }

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

// ── 본체 ────────────────────────────────────────────────────────────────────

export async function save(root, input, { user, write = false, admin = false, mirror = false, now = Date.now(), log = null, mirrorWaitMs = MIRROR_WAIT_MS, commitTimeout = COMMIT_TIMEOUT_MS, staging = null } = {}) {
  const out = await withLock(path.resolve(root), async () => {
    const r = await run(root, input, { user, write, admin, now, staging })

    // 미리보기 — 검사까지 지난 트리를 되돌리고 커밋하지 않는다. 색인에는 아무것도 올리지 않았다
    if (r.dryRun) {
      await r.snap.restore()
      return {
        dryRun: true,
        id: r.id,
        sections: r.sections,
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
    const commit = () => git.commitPaths(root, paths, { message: r.title, author: user, timeout: commitTimeout })
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

  // 등록부를 바꿨으면 로그에 한 줄 — 누가 · 무엇을(행은 사라지기도 한다 · 작업 기록 id 가 그 이유다)
  for (const e of out.managedChanges || []) {
    log?.(`등록부 ${e.op} ${user} ${e.pattern || e.doc}${e.to ? ' → ' + e.to : ''}${e.into ? ' → ' + e.into : ''} (${out.id})`)
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

async function run(root, input, { user, write, admin, mirror, now, staging }) {
  // 1 권한
  if (!write) throw new CtxError('E_FORBIDDEN', '쓰기 권한이 없다', { user })

  // 2 스키마
  const w = checkSchema(input)
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

  // 2.5 구조 정리는 admin 만 — **파일을 만지기 전에.** 행을 더하는 것(add)은 덧붙임이라 writer 도 한다
  if (needsAdmin(managedOps) && !admin) {
    throw new CtxError('E_FORBIDDEN', '등록부 정리(rename · merge · retire · drop)는 admin 만 한다 — admin 에게 요청한다', { user, need: 'admin' })
  }

  // 3 존재 — 기존 기록은 고치지도 지우지도 않는다. 정정은 supersedes 를 단 새 기록이다.
  const workRel = 'work/' + w.id + '.md'
  const exists = await fs
    .access(path.join(root, workRel))
    .then(() => true)
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
  // 선언을 `touchesEmpty` 로 받고, 받았어도 경고로 한 번 더 말한다. 모드 A 의 검사는 그대로다 — 기존
  // `touches: []` 기록을 오류로 만들지 않는다.
  if (!(w.touches || []).length) {
    if (!w.touchesEmpty) {
      throw new CtxError(
        'E_INPUT',
        'touches 가 비어 있다 — 이 기록은 좌표로 찾을 수 없다. 정의하거나 처음 도입한 용어 · 바꾼 대상이 없는지 좌표 판정을 다시 보고, 정말 0개면 work.touchesEmpty 에 사유를 적어 보낸다',
        { field: 'work.touches' }
      )
    }
    warnings.push(`touches 가 비어 있다 — 이 기록은 좌표로 찾을 수 없다 (사유: ${w.touchesEmpty.trim()})`)
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
    for (const t of newTypes) warnings.push(`새 어휘 타입 "${t}" 을 만들었다 (_vocab.md 끝) — 의도한 타입이 맞는지 본다. 관리 문서로 파생하려면 managed 로 등록부 행을 같이 · 오타면 admin 이 _vocab.md 를 고친다(지우는 연산은 없다)`)

    // 5 좌표 — 어휘 등재 **뒤에** 본다. 새 좌표를 같은 save 에서 등재하고 쓰는 것이 정상이다.
    const r0 = await loadRepo(root, { settings: SETTINGS })
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
    for (const c of [...(w.touches || []), ...sections.map((s) => s.coord)]) {
      if (!known.has(c)) throw new CtxError('E_INPUT', '어휘에 없는 좌표다 — vocab 에 같이 보내거나 먼저 등재한다', { coord: c })
    }

    // 5.5 등록부 — 행 더하기 · 문서 만들기 · 정리. 계획은 순수 함수가 세우고(`managedops`) 쓰는 것은 여기(`Snap`)다.
    // 새 행은 마지막 규칙 행 뒤에 붙으므로 기존 좌표의 자리는 바뀌지 않는다. 6단계는 **새 등록부**로 판정한다.
    let registry = r0.registry
    let plan = null
    let dropped = null
    if (managedOps.length) {
      const regText = await fs.readFile(path.join(root, '_managed.md'), 'utf8').catch(() => null)
      plan = await planManaged({
        ops: managedOps,
        registryText: regText,
        docPaths: r0.managedDocs.map((d) => d.path),
        read: (rel) => fs.readFile(path.join(root, rel), 'utf8').catch(() => null),
        workId: w.id,
      })
      warnings.push(...plan.warnings)
      // 5.4 **어긋나는 산문**(X7 · X8) — 새 행이 거짓으로 만드는 머리말 · 규칙 줄. 판정은 edits 를 적용한 **뒤**의 글로
      const adds = plan.events.filter((e) => e.op === 'add').map((e) => ({ type: e.pattern.slice(0, e.pattern.indexOf(':')), doc: e.doc }))
      if (adds.length) {
        const pre = new Map()
        for (const rel of new Set(['_vocab.md', ...adds.map((a) => a.doc)])) pre.set(rel, plan.files.has(rel) ? plan.files.get(rel) : await readRaw(rel))
        pre.set('_managed.md', plan.registryText)
        const hits = proseConflicts({ adds, texts: (rel) => pre.get(rel) ?? null })
        const ok = new Set(managedOps.flatMap((o) => o.reviewed || []))
        const left = hits.filter((h) => !ok.has(h.file + ':' + h.line))
        const seen = hits.filter((h) => ok.has(h.file + ':' + h.line))
        if (left.length) {
          throw new CtxError(
            'E_INPUT',
            `새 등록부 행과 어긋나는 문구 ${left.length}줄이 남는다 — 같은 save 의 edits 로 고치거나, 맞는 줄이면 managed[].reviewed 에 "파일:행" 을 적는다: ${left.slice(0, 4).map((h) => h.file + ':' + h.line).join(' · ')}${left.length > 4 ? ' …' : ''}`,
            { lines: left.slice(0, 50), total: left.length }
          )
        }
        if (seen.length) warnings.push(`어긋나 보이는 문구 ${seen.length}줄을 맞다고 확인했다(reviewed): ${seen.map((h) => h.file + ':' + h.line).join(' · ')}`)
      }
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
      // **새 행이 걸리는 기존 좌표는 섹션을 같이 받는다.** 안 받으면 그 행이 생긴 커밋부터 그 좌표가 앵커 없음이 되고
      // 이 레포의 다음 save 가 전부 E_CHECK 로 막힌다(실측 P4). 빈 섹션을 서버가 채우지 않는다 — 파생은 필수라
      // applied 가 없는 섹션은 「파생 누락」 이다.
      if (plan.added.length) {
        const sent = new Set(sections.map((x) => x.coord))
        const touched = new Set([...r0.works.flatMap((d) => d.touches), ...(w.touches || []), ...sent])
        const need = [...touched].filter((c) => !sent.has(c) && plan.added.includes(resolveCoord(registry, c)?.pattern))
        if (need.length) {
          throw new CtxError(
            'E_INPUT',
            `새 등록부 행이 걸리는 좌표 ${need.length}개의 섹션이 없다 — sections 에 같이 보낸다(처음 만드는 섹션은 applied: null). 많으면 패턴을 좁혀(예: term:P*) 나눠 붙인다`,
            { needSections: need.slice(0, 50), total: need.length }
          )
        }
      }
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
        const at = s.body.split(NL).findIndex((l) => splitRe.test(l))
        if (at >= 0) {
          throw new CtxError(
            'E_INPUT',
            `sections[].body 에 헤딩 줄(${s.body.split(NL)[at].trim().slice(0, 60)})이 있다 — 섹션을 쪼갠다. 헤딩과 applied 는 서버가 붙인다: section 의 content 를 고쳐 보낸다`,
            { coord: s.coord, line: at + 1 }
          )
        }
      }
      const res = replaceSection(byDoc.get(hit.doc), {
        value: hit.value,
        level: hit.level,
        body: s.body,
        id: w.id,
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
        const who = cw ? `${cw.author || '(작성자 없음)'} 가 ${cw.date || '(날짜 없음)'} 에 ${cw.id} 로 갱신했다` : res.current ? `${res.current} 로 갱신됐다` : '섹션이 만들어졌다'
        throw new CtxError('E_CONFLICT', `섹션이 읽은 뒤 바뀌었다 — ${who}. detail.content(지금 본문) 위에 다시 만들어 applied 에 current 를 넣어 보낸다`, {
          coord: s.coord,
          expected: sent,
          current: res.current,
          currentWork: cw ? { id: cw.id, title: cw.title, author: cw.author ?? null, date: cw.date ?? null } : null,
          content: content == null ? null : content.slice(0, CONFLICT_CONTENT_MAX),
          truncated: content != null && content.length > CONFLICT_CONTENT_MAX,
        })
      }
      byDoc.set(hit.doc, res.text)
      written.push({ file: hit.doc, text: s.body })
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
      warnings.push(
        `올린 첨부 ${unlinked.length}개를 어느 본문도 가리키지 않는다 — 관리 문서에서는 ![설명](../${unlinked[0].path}), 작업 기록에서는 ![설명](${unlinked[0].path.slice('work/'.length)}): ${unlinked.map((a) => a.path).join(' · ')}`
      )
    }

    // 7 기록 — TEMPLATE 순서의 프론트매터. author 는 토큰의 user 다. 첨부는 `attachments` 로 — 화면의 첨부 목록이 이것을 읽는다
    await snap.write(workRel, renderWork(w, user, assetsOut.map((a) => a.path.slice('work/'.length))))

    // 9→8 **인덱스를 검사보다 먼저 만든다.**
    //
    // 설계서 §4.5 는 8 검사 → 9 인덱스 순이었다. 그러면 검사가 **항상 낡은
    // INDEX 를 본다** — 작업 기록을 방금 하나 더했으니 행 수가 반드시 어긋나고,
    // "INDEX.md 불일치" 경고가 `save` 마다 빠짐없이 나온다. 매번 나오는 경고는
    // 아무것도 알리지 않는다. 검사는 **커밋될 트리**를 봐야 한다.
    let r0b = await loadRepo(root, { settings: SETTINGS })
    // 9.5 등록부 사본(X1 · X3 · X5) — 머리 표 칸 · _vocab.md 생성 블록을 **지금 등록부**로 찍는다. INDEX 와 같은 층의 파생물이다
    const gen = regenerate({ registry: r0b.registry, vocab: r0b.vocab, docs: await docTexts(r0b.managedDocs), vocabText: await readRaw(vocabPath) })
    for (const [rel, text] of gen.files) await snap.write(rel, text)
    if (gen.heads.length || gen.block) {
      warnings.push(`등록부 사본을 등록부에 맞췄다 — ${[...gen.heads.map((h) => h.path + ':' + h.line + ' 머리 표'), ...(gen.block ? ['_vocab.md 생성 블록'] : [])].join(' · ')}`)
      r0b = await loadRepo(root, { settings: SETTINGS })
    }
    await snap.write('INDEX.md', renderIndex(r0b))
    await snap.write('INDEX-by-coord.md', renderByCoord(r0b))

    // 8 검사 — 갱신된 트리로 다시 본다. 오류면 **되돌리고** 커밋하지 않는다.
    const r1 = await loadRepo(root, { settings: SETTINGS })
    const res = runBuiltinCheck({
      docs: r1.docs,
      vocabText: r1.vocabText,
      managedText: r1.managedText,
      vocab: r1.vocab,
      validity: r1.validity,
      indexInfo: r1.indexInfo,
      managedIndex: r1.managedIndex,
      sections: r1.sections,
      bodies: r1.bodies,
    })
    const errors = res.findings.filter((f) => f.sev === 'error')
    if (errors.length) {
      await snap.restore()
      throw new CtxError('E_CHECK', '검사에서 오류가 났다 — 아무것도 커밋하지 않았다', {
        findings: errors,
        ...(plan?.added.length ? { hint: '새 등록부 행이 걸리는 좌표는 sections 를 같이 보낸다 · 문서 안에 같은 이름의 섹션이 둘이면 이름을 고친다' } : {}),
      })
    }
    for (const f of res.findings.filter((x) => x.sev === 'warn')) warnings.push(`${f.label} ${f.items.length}건`)

    return {
      snap,
      id: w.id,
      title: w.title,
      sections: sections.length,
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

function renderWork(w, user, attachments = []) {
  const fm = ['---', `id: ${w.id}`, `title: ${yamlStr(w.title)}`, `date: ${w.date || ''}`, `author: ${yamlStr(user)}`]
  if (w.source) fm.push(`source: ${yamlStr(w.source.trim())}`)
  // 0개는 `touches: []` — 빈 `touches:` 는 YAML 로 null 이라 "0개임을 확인했다" 는 선언이 안 된다.
  const touches = w.touches || []
  fm.push('touches:' + (touches.length ? '' : ' []'))
  for (const c of touches) fm.push(`  - ${c}`)
  if (!touches.length && w.touchesEmpty) fm.push(`touchesEmpty: ${yamlStr(w.touchesEmpty.trim())}`)
  if (w.supersedes) fm.push(`supersedes: ${w.supersedes}`)
  if (attachments.length) fm.push(`attachments: [${attachments.map(yamlStr).join(', ')}]`)
  fm.push(`tags: [${(w.tags || []).map(yamlStr).join(', ')}]`, '---', '')
  return fm.join(NL) + NL + w.body.replace(/\s*$/, '') + NL
}

// YAML 에서 그대로 두면 깨지는 값(콜론 · 대괄호 · 따옴표 · # )은 인용한다 — importdir 와 같은 규칙.
// 전에는 title 을 그대로 적었다 — `[정정] …` 이면 배열로 읽혀 제목이 사라진다(cdp-save 「제목 인용」 을 사람이 지켜야 했다).
function yamlStr(s) {
  const v = String(s ?? '')
  return /[:#\[\]{}&*!|>'"%@`,]|^\s|\s$|^$/.test(v) ? JSON.stringify(v) : v
}
