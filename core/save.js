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
import { resolveCoord } from './managed.js'
import { renderIndex, renderByCoord } from './indexes.js'
import * as git from './git.js'
import { CtxError, checkCoord, checkId, sliceSection } from './tools.js'
import { withLock } from './lock.js'
import { enqueuePush, lastPush, describe as mirrorLine } from './mirror.js'
import { topApplied } from './frontmatter.js'

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
    this.root = root
    this.before = new Map()
  }
  async write(rel, text) {
    const abs = path.join(this.root, rel)
    if (!this.before.has(rel)) {
      this.before.set(rel, await fs.readFile(abs, 'utf8').catch(() => null))
    }
    await fs.mkdir(path.dirname(abs), { recursive: true }).catch(() => {})
    await fs.writeFile(abs, text, 'utf8')
  }
  paths() {
    return [...this.before.keys()]
  }
  async restore() {
    for (const [rel, body] of this.before) {
      const abs = path.join(this.root, rel)
      if (body == null) await fs.rm(abs, { force: true }).catch(() => {})
      else await fs.writeFile(abs, body, 'utf8').catch(() => {})
    }
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
  return w
}

// ── 어휘 등재 (4단계) ───────────────────────────────────────────────────────
//
// 타입 섹션(`## table`) 끝에 한 줄을 붙인다. **타입 섹션이 없으면 만들지 않고
// 거절한다** — 어휘의 뼈대는 사람이 정하는 것이고, 서버가 타입을 늘리기
// 시작하면 통제 어휘가 통제되지 않는다.
//
// 삭제는 없다(`deprecated` 표기는 사람이).

function addVocab(text, entries) {
  if (!entries.length) return { text, added: 0 }
  const lines = text.split(NL)
  let added = 0
  for (const v of entries) {
    const type = v.coord.slice(0, v.coord.indexOf(':'))
    if (text.includes('`' + v.coord + '`')) continue // 이미 있다
    const head = lines.findIndex((l) => l.trim() === '## ' + type)
    if (head < 0) throw new CtxError('E_INPUT', `어휘에 "## ${type}" 섹션이 없다 — 타입은 사람이 먼저 만든다`, { coord: v.coord })
    let end = lines.length
    for (let i = head + 1; i < lines.length; i++) {
      if (/^##\s/.test(lines[i])) {
        end = i
        break
      }
    }
    while (end > head + 1 && !lines[end - 1].trim()) end--
    const row = ['- `' + v.coord + '` — ' + v.label]
    if (v.aliases?.length) row.push('  aliases: ' + v.aliases.join(', '))
    lines.splice(end, 0, ...row)
    added++
  }
  return { text: lines.join(NL), added }
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

export async function save(root, input, { user, write = false, mirror = false, now = Date.now(), log = null, mirrorWaitMs = MIRROR_WAIT_MS, commitTimeout = COMMIT_TIMEOUT_MS } = {}) {
  const out = await withLock(path.resolve(root), async () => {
    const r = await run(root, input, { user, write, now })

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
      warnings: r.warnings,
      mirror: 'off',
    }
  })

  // 11 미러 — **뮤텍스 밖 · 큐 하나.** push 가 늦거나 실패해도 커밋은 서버 트리에 있고,
  // 못 간 것은 다음 push 가 가져간다. 겹치는 push 는 큐가 합친다(검토 D1).
  //
  // 상한(1.5초)까지는 기다려 **실제 결과**를 답한다 — 빠른 원격에서 `queued` 는 아무것도
  // 알리지 않는 말이었다. 넘으면 `queued` 이고 마지막 실제 상태를 `mirrorLast` 로 싣는다(D3).
  if (mirror) {
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

async function run(root, input, { user, write, mirror, now }) {
  // 1 권한
  if (!write) throw new CtxError('E_FORBIDDEN', '쓰기 권한이 없다', { user })

  // 2 스키마
  const w = checkSchema(input)
  const sections = input.sections || []
  const vocabAdds = input.vocab || []

  const snap = new Snap(root)
  const warnings = []
  // 편입(`source` 가 있다)은 끈다 — 밖에서 온 문서는 시각을 모르는 것이 보통이고, 날짜는 원문의 것이라
  // 고칠 수도 없다. 매번 나오는 경고는 아무것도 알리지 않는다(좌표 누락 TODO F2).
  if (!w.source && !/\d{2}:\d{2}/.test(String(w.date || ''))) {
    warnings.push('date 에 시각이 없다 — 같은 날 같은 좌표의 선후를 알 수 없다')
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

  try {
    // 4 어휘 (메모리 → 파일)
    const vocabPath = '_vocab.md'
    const vocabText = await fs.readFile(path.join(root, vocabPath), 'utf8')
    const { text: nextVocab, added } = addVocab(vocabText, vocabAdds)
    if (added) await snap.write(vocabPath, nextVocab)

    // 5 좌표 — 어휘 등재 **뒤에** 본다. 새 좌표를 같은 save 에서 등재하고 쓰는 것이 정상이다.
    const r0 = await loadRepo(root, { settings: SETTINGS })
    const known = new Set(r0.vocab.coords.keys())
    for (const v of vocabAdds) known.add(v.coord)
    for (const c of [...(w.touches || []), ...sections.map((s) => s.coord)]) {
      if (!known.has(c)) throw new CtxError('E_INPUT', '어휘에 없는 좌표다 — vocab 에 같이 보내거나 먼저 등재한다', { coord: c })
    }

    // 6 섹션
    const byDoc = new Map()
    for (const s of sections) {
      const hit = resolveCoord(r0.registry, s.coord)
      if (!hit) throw new CtxError('E_INPUT', '등록부에 걸리지 않는 좌표다 — 관리 문서가 없다', { coord: s.coord })
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
    }
    for (const [doc, text] of byDoc) await snap.write(doc, text)

    // 7 기록 — TEMPLATE 순서의 프론트매터. author 는 토큰의 user 다.
    await snap.write(workRel, renderWork(w, user))

    // 9→8 **인덱스를 검사보다 먼저 만든다.**
    //
    // 설계서 §4.5 는 8 검사 → 9 인덱스 순이었다. 그러면 검사가 **항상 낡은
    // INDEX 를 본다** — 작업 기록을 방금 하나 더했으니 행 수가 반드시 어긋나고,
    // "INDEX.md 불일치" 경고가 `save` 마다 빠짐없이 나온다. 매번 나오는 경고는
    // 아무것도 알리지 않는다. 검사는 **커밋될 트리**를 봐야 한다.
    const r0b = await loadRepo(root, { settings: SETTINGS })
    await snap.write('INDEX.md', renderIndex(r0b))
    await snap.write('INDEX-by-coord.md', renderByCoord(r0b))

    // 8 검사 — 갱신된 트리로 다시 본다. 오류면 **되돌리고** 커밋하지 않는다.
    const r1 = await loadRepo(root, { settings: SETTINGS })
    const res = runBuiltinCheck({
      docs: r1.docs,
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
      throw new CtxError('E_CHECK', '검사에서 오류가 났다 — 아무것도 커밋하지 않았다', { findings: errors })
    }
    for (const f of res.findings.filter((x) => x.sev === 'warn')) warnings.push(`${f.label} ${f.items.length}건`)

    return { snap, id: w.id, title: w.title, sections: sections.length, vocab: added, warnings }
  } catch (e) {
    await snap.restore()
    throw e
  }
}

function renderWork(w, user) {
  const fm = ['---', `id: ${w.id}`, `title: ${yamlStr(w.title)}`, `date: ${w.date || ''}`, `author: ${yamlStr(user)}`]
  if (w.source) fm.push(`source: ${yamlStr(w.source.trim())}`)
  // 0개는 `touches: []` — 빈 `touches:` 는 YAML 로 null 이라 "0개임을 확인했다" 는 선언이 안 된다.
  const touches = w.touches || []
  fm.push('touches:' + (touches.length ? '' : ' []'))
  for (const c of touches) fm.push(`  - ${c}`)
  if (!touches.length && w.touchesEmpty) fm.push(`touchesEmpty: ${yamlStr(w.touchesEmpty.trim())}`)
  if (w.supersedes) fm.push(`supersedes: ${w.supersedes}`)
  fm.push(`tags: [${(w.tags || []).map(yamlStr).join(', ')}]`, '---', '')
  return fm.join(NL) + NL + w.body.replace(/\s*$/, '') + NL
}

// YAML 에서 그대로 두면 깨지는 값(콜론 · 대괄호 · 따옴표 · # )은 인용한다 — importdir 와 같은 규칙.
// 전에는 title 을 그대로 적었다 — `[정정] …` 이면 배열로 읽혀 제목이 사라진다(cdp-save 「제목 인용」 을 사람이 지켜야 했다).
function yamlStr(s) {
  const v = String(s ?? '')
  return /[:#\[\]{}&*!|>'"%@`,]|^\s|\s$|^$/.test(v) ? JSON.stringify(v) : v
}
