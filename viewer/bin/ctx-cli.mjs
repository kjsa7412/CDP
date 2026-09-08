// ctx — 지식 레포 명령줄 도구.
//
// **git 훅이 부르는 유일한 보증 층이다** (작업환경 v1.1 §8.3). 그래서 두 가지가
// 중요하다.
//
//   1) 계산을 여기서 다시 하지 않는다. `core/repo.js` 를 쓴다 — 앱과 `ctx` 가
//      다른 답을 내면 사용자는 어느 쪽을 믿을지 알 수 없다.
//   2) 의존성이 없다. 번들되어 지식 레포 안에 단일 파일로 들어가고, Node 가
//      없는 PC 에서는 exe 가 같은 코드를 실행한다 (§3.1).
//
// 출력은 CP949 콘솔에서도 깨지지 않게 **ASCII 구두점만** 쓴다. em-dash(U+2014)와
// 박스 문자는 Windows 기본 콘솔에서 인코딩 오류를 낸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRepo, repoStatus, unregisteredCoords } from '../server/core/repo.js'
import { runBuiltinCheck } from '../server/core/check.js'
import { reconcile, normKey } from '../server/core/vocab.js'
import { resolveCoord } from '../server/core/managed.js'
import { cmpDateDesc } from '../server/core/validity.js'
import * as git from '../server/core/git.js'

// 번들 시각. `tools/build-ctx.mjs` 가 치환한다.
//
// **번들이 조용히 낡는 것이 실제 함정이다.** `ctx-cli.mjs` 에 명령을 추가하고
// 재번들하지 않으면 지식 레포의 `bin/ctx.mjs` 는 옛 명령 목록으로 돈다 --
// 그리고 그것은 "모르는 명령" 으로만 나타나서 원인을 짚기 어렵다.
export const BUILT = '__CTX_BUILT__'

const USAGE = `ctx - 지식 레포 도구  (번들 __CTX_BUILT__)

  ctx check [--json]        커밋 가능한가. 오류가 있으면 exit 1
  ctx index                 INDEX.md / INDEX-by-coord.md 재생성
  ctx match <이름...>       이름 -> 정본 좌표 (대조)
  ctx where <좌표>          그 좌표의 상태가 어느 문서 어느 섹션에 있나
  ctx derive [--json]       파생이 안 된 섹션 목록
  ctx term <이름>           어휘 조회 (정본 / alias / deprecated)
  ctx apply <좌표>          파생할 섹션에 붙일 변경 줄 초안
  ctx brief                 두 줄 요약 (절차 + 살아 있는 레포 상태)
  ctx sync [--pull]         원격과의 차이. --pull 은 ff 만 한다 (실패면 exit 1)
  ctx version               이 번들이 언제 만들어졌나

  --repo <경로>             지식 레포 경로 (기본: CDP_REPO 또는 현재 폴더 상위 탐색)
  --json                    기계 판독용 출력
`

// ── 유틸 ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  const out = { cmd: null, args: [], json: false, repo: null, pull: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--pull') out.pull = true
    else if (a === '--repo') out.repo = argv[++i]
    else if (a === '-h' || a === '--help' || a === 'help') out.cmd = out.cmd || 'help'
    else if (!out.cmd) out.cmd = a
    else out.args.push(a)
  }
  return out
}

// 레포를 찾는다. 규약 파일 두 개가 있는 폴더가 지식 레포다 -- 폴더 이름으로
// 판단하지 않는다. 이름은 사람이 바꾸고 규약 파일은 안 바꾼다.
async function findRepo(explicit) {
  const cands = []
  if (explicit) cands.push(path.resolve(explicit))
  if (process.env.CDP_REPO) cands.push(path.resolve(process.env.CDP_REPO))

  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    cands.push(dir)
    cands.push(path.join(dir, 'knowledge-repo'))
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }

  for (const c of cands) {
    const ok = await fs
      .access(path.join(c, '_vocab.md'))
      .then(() => true)
      .catch(() => false)
    if (ok) return c
  }
  return null
}

const out = (s = '') => process.stdout.write(s + '\n')
const err = (s = '') => process.stderr.write(s + '\n')
const short = (p) => String(p || '').replace(/^docs\//, '').replace(/\.md$/, '')
const pad = (s, n) => {
  // 한글은 콘솔에서 2칸을 차지한다. 폭을 세어야 표가 맞는다.
  const w = [...String(s)].reduce((a, ch) => a + (ch.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s) + ' '.repeat(Math.max(0, n - w))
}

// finding 항목은 종류마다 모양이 다르다. 식별자가 없는 것도 있다(INDEX 불일치).
// 없는 필드를 `undefined` 로 찍으면 사용자는 그것을 값으로 읽는다.
function itemLine(i) {
  const who = i.coord || i.id || i.path || ''
  return [who, i.detail].filter(Boolean).join('  ')
}

// ── 명령 ────────────────────────────────────────────────────────────────────

// exit 1 을 내는 것은 error 등급뿐이다. warn 으로 막으면 밀린 섹션이 있는
// 동안 아무도 커밋을 못 하고, 그러면 훅을 끈다 (작업환경 §8.3).
async function cmdCheck(r, opt) {
  const res = runBuiltinCheck({
    docs: r.docs,
    vocab: r.vocab,
    validity: r.validity,
    indexInfo: r.indexInfo,
    managedIndex: r.managedIndex,
    sections: r.sections,
  })
  const errors = res.findings.filter((f) => f.sev === 'error')
  const warns = res.findings.filter((f) => f.sev === 'warn')
  const nErr = errors.reduce((a, f) => a + f.items.length, 0)
  const nWarn = warns.reduce((a, f) => a + f.items.length, 0)

  if (opt.json) {
    out(JSON.stringify({ ok: nErr === 0, errors: nErr, warnings: nWarn, findings: res.findings }, null, 2))
    return nErr === 0 ? 0 : 1
  }

  for (const f of errors) {
    err(`[오류] ${f.label}  ${f.items.length}건`)
    for (const i of f.items) err('   ' + itemLine(i))
  }
  for (const f of warns) {
    out(`[경고] ${f.label}  ${f.items.length}건`)
    for (const i of f.items.slice(0, 5)) out('   ' + itemLine(i))
    if (f.items.length > 5) out(`   ... ${f.items.length - 5}건 더`)
  }

  if (nErr) {
    err('')
    err(`ctx check: 오류 ${nErr}건. 커밋할 수 없습니다.`)
    return 1
  }
  out(nWarn ? `ctx check: 오류 없음 (경고 ${nWarn}건)` : 'ctx check: 이상 없음')
  return 0
}

// INDEX 는 사람이 손으로 맞추면 반드시 어긋난다. 커밋 훅이 이것을 부른다.
async function cmdIndex(r) {
  const rows = ['| id | date | status | touches |', '|---|---|---|---|']
  for (const d of r.works) {
    rows.push(`| ${d.id} | ${d.date || ''} | ${d.status || ''} | ${d.touches.join(', ') || '-'} |`)
  }
  const head = ['# INDEX', '', `자동 생성 - \`ctx index\`. 작업 기록 ${r.works.length}건.`, '', '']
  await fs.writeFile(path.join(r.root, 'INDEX.md'), head.concat(rows).join('\n') + '\n', 'utf8')

  // 좌표별 색인 — 좌표로 찾는 사람에게는 이쪽이 1차 입구다
  const lines = ['# INDEX (좌표별)', '', '자동 생성 - `ctx index`.', '']
  const byType = new Map()
  for (const c of r.allCoords) {
    const t = c.slice(0, c.indexOf(':')) || '기타'
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(c)
  }
  for (const [type, cs] of [...byType.entries()].sort()) {
    lines.push(`## ${type}`, '')
    for (const c of cs) {
      const list = r.coords.byCoord.get(c) || []
      const sec = r.sections.find((x) => x.coord === c)
      // 상태를 적지 않는다. 파생 누락은 `ctx check` 가 오류로 잡으므로
      // 인덱스에 남을 상태가 없다 — 어디에 있는지만 적는다.
      const mark = ''
      const where = sec && sec.doc ? ` \`${short(sec.doc)}\`` : ''
      lines.push(`- \`${c}\` 작업 ${list.length}건${where}${mark}`)
      for (const d of list.slice(0, 3)) lines.push(`  - ${d.date || ''} [${d.title}](work/${d.id}.md)`)
      if (list.length > 3) lines.push(`  - ... ${list.length - 3}건 더`)
    }
    lines.push('')
  }
  await fs.writeFile(path.join(r.root, 'INDEX-by-coord.md'), lines.join('\n') + '\n', 'utf8')

  out(`ctx index: INDEX.md ${r.works.length}행 / INDEX-by-coord.md 좌표 ${r.allCoords.length}개`)
  return 0
}

// 판단은 LLM, 대조는 기계 (작업환경 §6.4).
async function cmdMatch(r, opt) {
  if (!opt.args.length) {
    err('ctx match: 대조할 이름을 주세요.  예) ctx match "면접심사의견등록" PS130')
    return 2
  }
  const rows = opt.args.map((q) => {
    const hit = reconcile(r.vocab, q)
    if (!hit) return { input: q, coord: null }
    const e = r.vocab.coords.get(hit.coord)
    return {
      input: q,
      coord: hit.coord,
      kind: hit.kind, // canonical | value | alias | label
      exact: !!hit.exact,
      line: e ? e.line : null,
      deprecated: e ? e.deprecated : null,
      supersededBy: e ? e.supersededBy : null,
    }
  })

  if (opt.json) {
    out(JSON.stringify(rows, null, 2))
    return 0
  }
  const w = Math.max(...rows.map((x) => [...x.input].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)), 8)
  for (const x of rows) {
    if (!x.coord) {
      out(`${pad(x.input, w)}  ->  (미등재)  _vocab.md 에 없습니다`)
      continue
    }
    const how = x.kind === 'canonical' ? '정본' : x.kind === 'alias' ? 'alias 일치' : x.kind === 'label' ? '이름 일치' : '값 일치'
    const dep = x.deprecated ? `  [폐기 ${x.deprecated}${x.supersededBy ? ' -> ' + x.supersededBy : ''}]` : ''
    out(`${pad(x.input, w)}  ->  ${x.coord}  (${how}${x.exact ? '' : ' / 부분'} · _vocab.md:${x.line})${dep}`)
  }
  return 0
}

async function cmdWhere(r, opt) {
  const coord = opt.args[0]
  if (!coord) {
    err('ctx where: 좌표를 주세요.  예) ctx where table:rp_plnd_mst')
    return 2
  }
  const hit = resolveCoord(r.registry, coord)
  const sec = r.sections.find((x) => x.coord === coord) || null
  const works = r.coords.byCoord.get(coord) || []

  if (opt.json) {
    out(JSON.stringify({ coord, registry: hit, section: sec, works: works.map((d) => ({ id: d.id, date: d.date })) }, null, 2))
    return 0
  }
  if (!hit) {
    out(`${coord}: 등록부에 없습니다. 관리 문서가 없는 타입입니다 (정상)`)
    out(`  작업 기록 ${works.length}건`)
    for (const d of works.slice(0, 5)) out(`    ${d.date || ''}  ${d.id}`)
    return 0
  }
  out(`${coord}`)
  out(`  문서   ${hit.doc}${hit.whole ? '  (문서 전체)' : ''}`)
  if (!hit.whole) out(`  섹션   ${'#'.repeat(hit.level)} ${hit.value}`)
  if (sec) {
    // **판정이 아니라 사실을 적는다.** 무엇이 실려 있나(applied), 파생이
    // 남았으면 그것은 `ctx check` 가 오류로 말한다.
    const label =
      sec.applied ? `반영 ${sec.applied}`
      : sec.state === 'anchor-missing' ? '섹션이 없음'
      : sec.state === 'doc-missing' ? '문서가 없음'
      : sec.state === 'unwritten' ? `파생 남음 — 작업 ${sec.total}건 (ctx apply ${coord})`
      : '아직 실린 작업 없음'
    out(`  상태   ${label}`)
  }
  out(`  작업   ${works.length}건`)
  for (const d of works.slice(0, 5)) out(`    ${d.date || ''}  ${d.id}`)
  if (works.length > 5) out(`    ... ${works.length - 5}건 더`)
  return 0
}

// 파생이 남은 섹션 — **`ctx stale` 이었다.**
//
// "밀림"은 상태가 아니다. 지식공유문서를 남기면 관리 문서 파생은 필수이므로,
// 안 된 섹션은 상태가 아니라 **해야 할 일**이다. 그래서 이름이 할 일을 말한다.
async function cmdDerive(r, opt) {
  const st = repoStatus(r)
  const todo = [...st.pendingDerive]
  const broken = st.brokenSections
  if (opt.json) {
    out(JSON.stringify({ pendingDerive: todo, brokenSections: broken }, null, 2))
    return 0
  }
  if (!todo.length && !broken.length) {
    out('ctx derive: 파생 남은 섹션 없음')
    return 0
  }
  if (todo.length) {
    out(`파생 남은 섹션 ${todo.length}곳`)
    out('')
    for (const x of todo) {
      out(`  ${pad(x.coord, 32)} ${pad(`작업 ${x.total}건`, 12)} ${short(x.doc)}`)
      if (x.applied) out(`  ${' '.repeat(32)} 실린 것 ${x.applied}`)
      for (const i of x.items) out(`  ${' '.repeat(32)}   + ${i.date || ''}  ${i.id}`)
    }
  }
  if (broken.length) {
    if (todo.length) out('')
    out(`깨진 섹션 ${broken.length}곳 — 등록부가 없는 자리를 가리킨다`)
    for (const x of broken) out(`  ${pad(x.coord, 32)} ${pad(x.state, 14)} ${short(x.doc)}`)
  }
  return 0
}

async function cmdTerm(r, opt) {
  const q = opt.args.join(' ').trim()
  if (!q) {
    err('ctx term: 조회할 이름을 주세요.')
    return 2
  }
  const hit = reconcile(r.vocab, q)
  const e = hit ? r.vocab.coords.get(hit.coord) : null

  if (opt.json) {
    out(JSON.stringify({ query: q, match: hit, entry: e ? { ...e } : null }, null, 2))
    return 0
  }
  if (!e) {
    out(`"${q}": _vocab.md 에 없습니다.`)
    // 값 부분이 비슷한 것을 후보로 — 미등재 좌표를 추가할 때 이게 쓸모 있다
    const nq = normKey(q)
    const near = [...r.vocab.coords.keys()].filter((c) => normKey(c).includes(nq) || nq.includes(normKey(c))).slice(0, 5)
    if (near.length) out('  비슷한 것: ' + near.join(', '))
    return 1
  }
  out(`${e.coord}${e.label ? '  ' + e.label : ''}`)
  if (e.aliases.length) out(`  aliases   ${e.aliases.join(', ')}`)
  if (e.deprecated) out(`  폐기      ${e.deprecated}${e.supersededBy ? '  -> ' + e.supersededBy : ''}${e.deprecatedNote ? '  ' + e.deprecatedNote : ''}`)
  out(`  _vocab.md:${e.line}`)
  const hit2 = resolveCoord(r.registry, e.coord)
  if (hit2) out(`  관리 문서 ${hit2.doc}${hit2.whole ? '' : '  ' + '#'.repeat(hit2.level) + ' ' + hit2.value}`)
  const works = r.coords.byCoord.get(e.coord) || []
  out(`  작업 기록 ${works.length}건`)
  return 0
}

// 밀린 섹션에 붙일 변경 줄 초안. **파일을 고치지 않는다** -- 출력만 한다.
// 관리 문서의 입도와 표현은 팀이 정하는 것이고, 기계가 본문을 쓰면 아무도
// 그 문서를 자기 것으로 여기지 않는다 (수행 v1.0 §3.2).
async function cmdApply(r, opt) {
  const coord = opt.args[0]
  if (!coord) {
    err('ctx apply: 좌표를 주세요.  예) ctx apply table:ps_ext_emp_mst')
    return 2
  }
  const sec = r.sections.find((x) => x.coord === coord)
  if (!sec) {
    out(`${coord}: 등록부에 없어 붙일 섹션이 없습니다.`)
    return 0
  }
  if (sec.state === 'ok') {
    out(`${coord}: 이미 반영돼 있습니다 (applied ${sec.applied}).`)
    return 0
  }
  const items = sec.items.length ? sec.items : (r.coords.byCoord.get(coord) || []).slice().sort(cmpDateDesc)
  if (!items.length) {
    out(`${coord}: 반영할 작업 기록이 없습니다.`)
    return 0
  }
  const newest = items[0]

  out(`# ${sec.doc}  ${sec.anchor || ''}`)
  out('')
  out(`<!-- applied: ${sec.applied || 'null'} -> ${newest.id} -->`)
  out('')
  out('아래 줄을 그 섹션의 "변경" 목록에 붙이고, 본문은 직접 고치세요.')
  out('')
  for (const i of items.slice().reverse()) {
    out(`**변경** · ${i.date || ''} [\`${String(i.id).replace(/^\d{4}-\d{4}-/, '')}\`](../work/${i.id}.md)`)
  }
  out('')
  out(`작업 기록 ${items.length}건: ` + items.map((i) => `work/${i.id}.md`).join(', '))
  return 0
}

// 두 줄. 사람이 터미널에서 상태를 볼 때 쓴다.
//
// v1.1 초안은 이것을 하네스 훅으로 매 요청에 주입하려 했다. 뺐다 -- skill
// description 이 발동 규칙이고 그 뒤에 git 훅이 있으므로, 비결정을 비결정으로
// 덮는 층을 하나 더 두지 않는다 (작업환경 §8.2).
async function cmdBrief(r, opt) {
  const st = repoStatus(r)
  const parts = [`작업 기록 ${st.works}`, `관리 문서 ${st.managedDocs}`]
  if (st.pendingDerive.length) parts.push(`파생 남음 ${st.pendingDerive.length}`)
  if (st.unregistered.length) parts.push(`미등재 좌표 ${st.unregistered.length}`)
  // 14단계에서 `pending` → `legacyPending` 으로 바꿨는데 여기가 안 따라와
  // **`ctx brief` 가 통째로 죽어 있었다.** 미결은 상태가 아니라 이관 대상이다.
  if (st.legacyPending.length) {
    const oldest = st.legacyPending[0]
    parts.push(`미결 ${st.legacyPending.length} — 이슈 대장으로 이관 (최장 ${oldest.days}일)`)
  }
  if (st.running.length) parts.push(`진행중 ${st.running.length}`)
  if (st.indexStale) parts.push('INDEX 불일치')

  if (opt.json) {
    out(JSON.stringify(st, null, 2))
    return 0
  }
  out('[CDP] 절차: (1) 검토(대상 추출) -> (2) 맥락 주입(필요시) -> (3) 요청수행 / 작업 끝에 cdp-save')
  out('[CDP] 레포: ' + parts.join(' · '))
  return 0
}

// 원격과의 차이. `--pull` 없이는 **작업 트리를 건드리지 않는다.**
//
// fetch 는 안전하므로 항상 하고, pull 은 ff 만 한다. ff 가 안 되는 것은
// "원격이 앞서 있고 로컬에도 커밋이 있다"는 뜻이고 그건 사람이 정리할 일이다 --
// merge 를 대신 하면 관리 문서 섹션에서 두 갱신을 기계가 섞은 결과가 정본
// 자리에 앉는다 (작업환경 §10).
async function cmdSync(r, opt) {
  const pull = opt.args.includes('--pull') || opt.pull

  if (!(await git.isRepo(r.root))) {
    if (opt.json) out(JSON.stringify({ repo: false }))
    else out('ctx sync: git 레포가 아닙니다. 동기화할 것이 없습니다.')
    return 0
  }

  const f = await git.fetch(r.root)
  let st = await git.status(r.root)

  let pulled = null
  if (pull) {
    pulled = await git.pullFfOnly(r.root)
    if (pulled.status) st = pulled.status
  }

  if (opt.json) {
    out(JSON.stringify({ fetch: f, status: st, pull: pulled }, null, 2))
    return pulled && !pulled.ok ? 1 : 0
  }

  out(`브랜치  ${st.branch || '(없음)'}${st.upstream ? '  ->  ' + st.upstream : '  (upstream 없음)'}`)
  if (!f.ok && f.message) out(`fetch   실패 -- ${f.message}`)
  out(`차이    받을 것 ${st.behind}건 · 보낼 것 ${st.ahead}건` + (st.dirty ? ` · 커밋 안 된 변경 ${st.dirty}건` : ''))

  // 훅 미설정은 **조용한 실패**다. 커밋은 통과하고 검사는 안 돈다.
  if (!st.hooksPath) {
    out('')
    out('[주의] core.hooksPath 가 설정되지 않았습니다. 커밋 검사가 돌지 않습니다.')
    out('       git config core.hooksPath .githooks')
  }

  const w = git.unpushedWarning(st)
  if (w) {
    out('')
    out('[주의] ' + w.message.split('\n').join('\n       '))
  }

  if (pulled) {
    out('')
    if (pulled.ok) out(pulled.skipped === 'up-to-date' ? 'pull    이미 최신입니다.' : 'pull    완료 (ff).')
    else {
      err('pull    실패 -- ' + pulled.reason)
      err(String(pulled.message || '').split('\n').join('\n        '))
      return 1
    }
  } else if (st.behind > 0) {
    out('')
    out(`받을 것이 ${st.behind}건 있습니다.  ctx sync --pull`)
  }
  return 0
}

// ── 진입점 ──────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const opt = parseArgs(argv)
  if (opt.cmd === 'version') {
    out(BUILT.startsWith('__') ? '(원본 실행 — 번들 아님)' : BUILT)
    return 0
  }
  if (!opt.cmd || opt.cmd === 'help') {
    out(USAGE)
    return opt.cmd ? 0 : 2
  }

  const root = await findRepo(opt.repo)
  if (!root) {
    err('ctx: 지식 레포를 찾을 수 없습니다. --repo 로 지정하거나 CDP_REPO 를 설정하세요.')
    err('     (_vocab.md 가 있는 폴더를 찾습니다)')
    return 2
  }

  const settings = { settledness: { excludeTypes: ['domain'] } }
  const r = await loadRepo(root, { settings })

  const table = {
    check: cmdCheck,
    index: cmdIndex,
    match: cmdMatch,
    where: cmdWhere,
    derive: cmdDerive,
    term: cmdTerm,
    apply: cmdApply,
    brief: cmdBrief,
    sync: cmdSync,
  }
  const fn = table[opt.cmd]
  if (!fn) {
    err(`ctx: 모르는 명령 "${opt.cmd}"`)
    out(USAGE)
    return 2
  }
  return (await fn(r, opt)) || 0
}

// exe 서브커맨드로 불릴 때는 main() 을 직접 부른다 (server/index.js 참고)
const invokedDirect = process.argv[1] && /ctx(-cli)?(\.mjs|\.js)?$/i.test(process.argv[1])
if (invokedDirect) {
  main().then(
    (code) => process.exit(code),
    (e) => {
      err('ctx: ' + (e?.message || e))
      process.exit(1)
    }
  )
}
