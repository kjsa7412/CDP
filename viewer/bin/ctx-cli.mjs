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
import { planSetup, applySetup } from '../../core/setup.js'
import { loadRepo, repoStatus, unregisteredCoords } from '../../core/repo.js'
import { runBuiltinCheck } from '../../core/check.js'
import { buildIndex, fullText, tokenize } from '../../core/search.js'
import { outline } from '../../core/frontmatter.js'
import { reconcile, normKey } from '../../core/vocab.js'
import { resolveCoord } from '../../core/managed.js'
import { cmpDateDesc } from '../../core/validity.js'
import * as git from '../../core/git.js'
import { runSync } from '../../core/sync.js'

// 번들 시각. `tools/build-ctx.mjs` 가 치환한다.
//
// **번들이 조용히 낡는 것이 실제 함정이다.** `ctx-cli.mjs` 에 명령을 추가하고
// 재번들하지 않으면 지식 레포의 `bin/ctx.mjs` 는 옛 명령 목록으로 돈다 --
// 그리고 그것은 "모르는 명령" 으로만 나타나서 원인을 짚기 어렵다.
export const BUILT = '__CTX_BUILT__'

const BS = String.fromCharCode(92)
const SEP = path.sep

const USAGE = `ctx - 지식 레포 도구  (번들 __CTX_BUILT__)

  ctx check [--json]        커밋 가능한가. 오류가 있으면 exit 1
  ctx index                 INDEX.md / INDEX-by-coord.md 재생성
  ctx match <이름...>       이름 -> 정본 좌표 (대조)
  ctx where <좌표...>       그 좌표의 상태가 어느 문서 어느 섹션에 · 얼마나 되나
  ctx search <말...>        말 -> 좌표 후보 (match 가 미등재를 낼 때의 폴백)
  ctx derive [--json]       파생이 안 된 섹션 목록
  ctx term <이름>           어휘 조회 (정본 / alias / deprecated)
  ctx apply <좌표>          파생할 섹션에 붙일 변경 줄 초안
  ctx brief                 두 줄 요약 (절차 + 살아 있는 레포 상태)
  ctx sync [--pull]         원격과의 차이. --pull 은 ff 만 한다 (실패면 exit 1)
  ctx version               이 번들이 언제 만들어졌나
  ctx setup <작업 레포>      그 레포에 규약과 skill 을 넣는다 (--dry 로 미리보기)

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
    else if (a === '--dry') out.dry = true
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

  // **작업 레포의 포인터.** `ctx setup` 이 넣어 둔다.
  //
  // 지식 레포는 사람마다 다른 자리에 있다. 그 경로를 커밋되는 파일에 박으면
  // 팀원 수만큼 서로 다른 값이 커밋을 오간다. 그래서 커밋하지 않는 포인터
  // 파일에 두고, 여기서 읽는다.
  {
    let d = process.cwd()
    for (let i = 0; i < 8; i++) {
      try {
        const j = JSON.parse(await fs.readFile(path.join(d, '.claude', 'cdp.json'), 'utf8'))
        if (j?.knowledgeRepo) { cands.push(path.resolve(j.knowledgeRepo)); break }
      } catch {}
      const up = path.dirname(d)
      if (up === d) break
      d = up
    }
  }

  let dir = process.cwd()
  for (let i = 0; i < 6; i++) {
    cands.push(dir)
    cands.push(path.join(dir, 'knowledge-repo'))
    const up = path.dirname(dir)
    if (up === dir) break
    dir = up
  }

  // **자기가 어디 있는지도 본다.**
  //
  // `ctx` 는 지식 레포 안에서 산다 -- `<repo>/bin/ctx.mjs` 이거나
  // `<repo>/tools/cdp.exe` 다. 그러니 자기 위치의 부모가 곧 레포다.
  //
  // 전에는 cwd 에서 위로만 찾았다. 그래서 작업 레포(C:\gdi)에 서서
  // `C:\cdp\bin\ctx brief` 라고 **전체 경로로 부르는데도** "지식 레포를
  // 찾을 수 없습니다" 가 나왔다. 형제 폴더는 상위 탐색에 걸리지 않는다.
  // 부른 사람은 경로를 다 적었는데 못 찾는다는 말을 듣는다.
  //
  // cwd 탐색 **뒤에** 둔다 -- 지식 레포 안에 서 있으면 그쪽이 우선이다.
  for (const self of [process.argv[1], process.execPath]) {
    if (!self) continue
    const d = path.dirname(path.resolve(self))
    cands.push(d, path.dirname(d))
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
    bodies: r.bodies,
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

// 좌표의 섹션이 문서 어디에 있고 **얼마나 되는지.**
//
// 주입은 문서가 아니라 **섹션 하나**다. 그런데 검토 출력이 좌표만 늘어놓으면
// 읽는 사람은 그 좌표에 관한 것이 전부 들어온다고 읽는다 -- 실제로 헷갈렸다.
// 그래서 자리(문서·앵커)와 크기(줄·글자)를 같이 낸다. 크기가 있으면 그것이
// 문서 전체가 아니라 **한 조각**이라는 것이 눈에 보인다.
function sectionAt(r, coord) {
  const hit = r.managedIndex?.find(coord)
  if (!hit || hit.docMissing || !hit.section) return null
  const body = r.bodies.get(hit.doc) || ''
  const lines = body.split(NL)
  const seg = hit.section.whole ? lines : lines.slice(hit.section.line, hit.section.end)
  return {
    doc: hit.doc,
    anchor: hit.whole ? '(문서 전체)' : '#'.repeat(hit.level) + ' ' + hit.value,
    from: hit.section.whole ? 1 : hit.section.line + 1,
    lines: seg.length,
    chars: seg.reduce((a, l) => a + l.trim().length, 0),
  }
}

async function cmdWhere(r, opt) {
  const coord = opt.args[0]
  if (!coord) {
    err('ctx where: 좌표를 주세요.  예) ctx where table:rp_plnd_mst')
    return 2
  }

  // 좌표 여럿이면 표로. 검토(cdp-work ①)가 한 번에 묻는 자리다 --
  // 좌표마다 따로 부르면 호출이 N 번이고 사람이 그걸 다 붙여 읽어야 한다.
  if (opt.args.length > 1) {
    const rows = opt.args.map((c) => {
      const sec = sectionAt(r, c)
      const st = r.sections.find((x) => x.coord === c) || null
      const works = r.coords.byCoord.get(c) || []
      return { coord: c, sec, state: stateLabel(st, c), works: works.length, ids: works.slice(0, 3) }
    })
    if (opt.json) {
      out(JSON.stringify(rows, null, 2))
      return 0
    }
    for (const x of rows) {
      out(`${x.coord}`)
      if (x.sec) {
        out(`  정본   ${x.sec.doc}   ${x.sec.anchor}`)
        out(`  주입   그 섹션만 — ${x.sec.lines}줄 · 약 ${x.sec.chars}자 (${x.sec.doc}:${x.sec.from})${thin(x.sec)}`)
      } else {
        out('  정본   등록부에 없음 — 관리 문서가 없는 타입이다 (정상)')
        out(`  주입   작업 기록 최신 3건까지 (총 ${x.works}건)`)
      }
      out(`  상태   ${x.state}`)
      out(`  작업   ${x.works}건`)
      // **id 를 낸다.** 처음에 건수만 냈는데, 그러면 검토가 "이 요청을 이미
      // 결정한 기록이 있다" 를 볼 길이 없다 -- 실제로 놓쳤다. CDP 의 id 는
      // 날짜+주제라서 **id 만으로 주제가 읽힌다**(2026-0831-A10-결의서-기본값).
      // 본문이 아니라 이름이므로 ①의 본문 읽기 금지를 깨지 않는다.
      for (const d of x.ids) out(`    ${d.date || ''}  ${d.id}`)
      if (x.works > x.ids.length) out(`    ... ${x.works - x.ids.length}건 더 (ctx where ${x.coord})`)
      out('')
    }
    out('viewer: 검색창(Ctrl+K)에 좌표를 붙여 넣으면 그 문서로 간다. 섹션은 오른쪽 목차에서 고른다')
    return 0
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
  if (sec) out(`  상태   ${stateLabel(sec, coord)}`)
  const at = sectionAt(r, coord)
  if (at) out(`  주입   그 섹션만 — ${at.lines}줄 · 약 ${at.chars}자 (${at.doc}:${at.from})${thin(at)}`)
  out(`  작업   ${works.length}건`)
  for (const d of works.slice(0, 5)) out(`    ${d.date || ''}  ${d.id}`)
  if (works.length > 5) out(`    ... ${works.length - 5}건 더`)
  return 0
}

// 말 -> 좌표 후보. **`ctx match` 가 1차 경로이고 이것은 폴백이다** (프로토콜 §9.5(2)).
//
// 왜 필요한가 — `match` 는 `_vocab.md` 의 이름·alias 만 본다. 그래서 **자연어
// 도메인 용어가 alias 로 등재돼 있어야만 걸린다.** 등재가 얇으면 요청문의
// 핵심 명사가 전부 `(미등재)` 로 떨어지고, 그러면 주입할 좌표가 없다 -- 답을
// 가진 섹션이 레포에 멀쩡히 있는데도 빈손으로 돌아온다. 실측 사례:
//
//   "지출결의서" · "입출금계좌코드" · "거래처코드"  -> 전부 (미등재)
//   답은 api:/adapter/a10/expense-slip 섹션에 있었다
//   -- 좌표 이름이 API 경로여서 요구사항서의 어떤 단어와도 이어지지 않는다
//
// **본문을 싣지 않는다. 좌표 이름만 낸다.** cdp-work 의 ① 검토는 관리 문서와
// 작업 기록을 읽는 것이 금지돼 있다(의견을 담은 본문을 요청 해석 전에 읽으면
// 그 틀로 요청을 읽는다). 좌표 이름은 이름표라서 그 금지를 깨지 않는다.
// 본문은 ② 주입에서 `cdp-load` 가 읽는다.
//
// 두 경로를 함께 쓴다 --
//   ① 작업 기록 전문검색 -> 걸린 기록의 `touches` 를 후보로 집계
//   ② 관리 문서 섹션 매칭 -> 섹션 본문에 말이 있으면 그 섹션의 좌표
//
// ②를 넣는 이유: 작업 기록이 없는 좌표도 섹션에는 내용이 있을 수 있다.
// ①만 쓰면 그 좌표가 안 나온다.
const NL = String.fromCharCode(10)

// **판정이 아니라 사실을 적는다.** 무엇이 실려 있나(applied), 파생이 남았으면
// 그것은 `ctx check` 가 오류로 말한다.
// 비어 있음은 **재서** 말한다. 상태로 추측하면 내용이 있는 섹션까지 비었다고
// 말한다 -- 코드그룹 섹션은 작업 기록이 0건이어도 코드 표가 들어 있다.
function thin(sec) {
  if (sec.chars < 40) return '   ** 사실상 비어 있다 — 주입해도 얻는 것이 없다'
  return ''
}

function stateLabel(sec, coord) {
  if (!sec) return '등록부에 없음'
  if (sec.applied) return `반영 ${sec.applied}`
  if (sec.state === 'anchor-missing') return '섹션이 없음 — 주입해도 빈손이다'
  if (sec.state === 'doc-missing') return '문서가 없음 — 주입해도 빈손이다'
  if (sec.state === 'unwritten') return `파생 남음 — 작업 ${sec.total}건 (ctx apply ${coord})`
  return '아직 실린 작업 없음'
}

// 말 하나가 이 텍스트에 있나. **전부 일치를 요구하지 않는다.**
//
// 한글은 2-gram 으로 쪼개는데(search.js) 띄어쓰기가 바이그램을 끊는다 --
// 질의 "거래처코드"(거래·래처·처코·코드) 대 본문 "거래처 코드"(거래·래처·코드)
// 는 `처코` 하나가 없어서 AND 로는 안 걸린다. 문서가 띄어 쓸지 붙여 쓸지를
// 질의하는 사람이 맞춰야 한다면 그건 검색이 아니다.
//
// 그래서 **비율**로 본다. 3분의 2 이상이면 그 말이 있는 것으로 센다.
function wordHit(word, toks) {
  const all = [...new Set(tokenize(word))].filter((x) => x.length > 1)
  if (!all.length) return false
  if (toks.has(word.toLowerCase())) return true // 붙여 쓴 그대로 있으면 끝
  // **원본 덩어리 토큰을 분모에서 뺀다.** tokenize 는 바이그램과 함께 낱말
  // 자체도 낸다. 띄어쓰기가 다르면 그 낱말 토큰은 절대 안 맞으므로, 남겨 두면
  // 분모만 키워 실제로 걸려야 하는 것을 떨어뜨린다 -- "거래처코드" 대
  // "거래처 코드" 가 3/5=0.60 으로 문턱 아래에 깔렸다. 바이그램만 세면 3/4 이다.
  const grams = all.filter((x) => x !== word.toLowerCase())
  const t = grams.length ? grams : all
  const n = t.filter((x) => toks.has(x)).length
  return n / t.length >= 0.67
}

async function cmdSearch(r, opt) {
  const words = opt.args
  if (!words.length) {
    err('ctx search: 찾을 말을 주세요.  예) ctx search 지출결의서 입출금계좌코드')
    return 2
  }

  // 후보 집계. 좌표 -> 몇 개의 말이 걸렸나 · 어디서 걸렸나
  const cand = new Map()
  const get = (coord) => {
    let c = cand.get(coord)
    if (!c) cand.set(coord, (c = { coord, words: new Set(), work: new Set(), section: false }))
    return c
  }

  // ① 작업 기록 전문검색 -- **말마다 따로 돌린다.**
  //
  // 질의 전체를 한 번에 AND 로 넣으면 요청문에만 있는 말 하나("디폴트" -- 문서는
  // "기본값"이라 쓴다)가 나머지 전부를 죽인다. 말 단위로 돌려 각자 기여하게 한다.
  const mini = buildIndex(r.docs, r.bodies)
  for (const w of words) {
    for (const hit of fullText(mini, w, 20)) {
      const d = r.byPath.get(hit.path)
      if (!d || d.layer !== 'work') continue
      for (const coord of d.touches) {
        const c = get(coord)
        c.words.add(w)
        if (c.work.size < 3) c.work.add(d.id)
      }
    }
  }

  // ② 관리 문서 섹션 -- 등록부가 좌표를 보내는 자리의 본문에 그 말이 있나.
  //
  // ①만 쓰면 작업 기록이 없는 좌표는 안 나온다. 섹션에 내용이 있는데도.
  for (const coord of r.allCoords) {
    const hit = r.managedIndex?.find(coord)
    if (!hit || hit.docMissing || !hit.section) continue
    const bodyText = r.bodies.get(hit.doc)
    if (!bodyText) continue
    const lines = bodyText.split(NL)
    const text = (hit.section.whole ? lines : lines.slice(hit.section.line, hit.section.end)).join(NL)
    const toks = new Set(tokenize(text))
    for (const w of words) if (wordHit(w, toks)) { const c = get(coord); c.words.add(w); c.section = true }
  }

  // 걸린 말이 많은 순. 같으면 섹션에서 걸린 것을 위로 -- 그쪽이 현재 상태다
  const rows = [...cand.values()]
    .map((c) => ({ ...c, n: c.words.size }))
    .sort((a, b) => b.n - a.n || (b.section - a.section) || a.coord.localeCompare(b.coord))

  if (opt.json) {
    out(JSON.stringify({
      words,
      candidates: rows.map((c) => ({ coord: c.coord, matched: [...c.words], section: c.section, works: [...c.work] })),
    }, null, 2))
    return 0
  }
  if (!rows.length) {
    out(`ctx search: 좌표 후보 없음  (${words.join(' · ')})`)
    return 0
  }
  out(`ctx search  -- 좌표 후보 ${rows.length}건. **본문은 싣지 않는다** (cdp-load 가 읽는다)`)
  for (const c of rows.slice(0, 12)) {
    const where = r.managedIndex?.find(c.coord)
    const doc = where && !where.docMissing && where.section ? where.doc : '등록부에 없음 -- 작업 기록만'
    out(`  ${c.coord}`)
    out(`      걸린 말  ${[...c.words].join(' · ')}${c.section ? '   (섹션)' : ''}`)
    out(`      ${doc}`)
    if (c.work.size) out(`      ${[...c.work].join(' · ')}`)
  }
  if (rows.length > 12) out(`  ... ${rows.length - 12}건 더 (--json 으로 전체)`)
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
  // **초안이 규칙보다 강하다.** 전에는 이 출력이 변경 줄부터 냈고 "본문은
  // 직접 고치세요" 가 뒤에 한 줄 붙어 있었다. 그러면 붙여 넣기 좋은 것이
  // 변경 줄뿐이라 **요약 한 줄 + 링크**로 끝내게 된다 -- 실측에서 applied 가
  // 붙은 섹션 66개 중 38개가 그 형태였다. 사람이 아니라 초안이 그렇게 유도한다.
  //
  // 그래서 순서를 뒤집는다. 자립 요구를 먼저 말하고, **작업 기록의 목차를
  // 보여주고**, 변경 줄은 맨 끝에 낸다. 목차가 있으면 "무엇을 옮겨야 하는지"가
  // 보인다 -- 옮길 것의 목록 없이 "직접 고치세요" 는 지시가 아니라 소원이다.
  out('**섹션은 홀로 서야 한다.** 이 섹션만 읽고 그 대상의 현재 상태를 알 수')
  out('있어야 한다. 작업 기록 링크를 타고 가야 알 수 있으면 파생이 안 된 것이다')
  out('-- 주입은 섹션만 싣는다 (cdp-load).')
  out('')
  out('아래 목차가 이 좌표에 대해 작업 기록이 말한 것이다. **판단·표·규칙·값을')
  out('섹션 본문으로 옮겨라.** 요약하지 말고, 그 대상의 상태로 다시 써라.')
  out('')
  for (const i of items) {
    out(`  ${i.date || ''}  ${i.id}   work/${i.id}.md`)
    // **`sec.items` 는 경량 객체다** ({id, date}). `path`·`bodyOffset` 이
    // 없으므로 본문을 못 찾고 목차가 통째로 "(제목 없음)" 이 됐다. id 로 문서를
    // 되찾는다.
    const doc = r.byId.get(i.id) || i
    const body = r.bodies.get(doc.path) || ''
    const heads = outline(body.slice(doc.bodyOffset || 0))
    // `outline` 은 h2·h3 만 본다. 소제목 없이 h1 하나로 쓴 기록이 실제로 많아
    // 그때 목록이 통째로 비면 이 안내가 헛돈다. 제목으로 폴백한다.
    if (!heads.length) out(`      · ${doc.title || '(제목 없음)'}   -- 소제목이 없다. 본문을 직접 읽어라`)
    for (const h of heads.slice(0, 12)) out('      ' + '  '.repeat(h.level - 2) + '· ' + h.title)
    if (heads.length > 12) out(`      ... ${heads.length - 12}개 더`)
  }
  out('')
  out('옮긴 뒤 그 섹션의 "변경" 목록에 아래를 붙인다. **이 줄은 출처 표시이지')
  out('내용이 아니다** -- 이 줄만 붙이고 끝내면 섹션은 여전히 빈 것이다.')
  out('')
  for (const i of items.slice().reverse()) {
    out(`**변경** · ${i.date || ''} [\`${String(i.id).replace(/^\d{4}-\d{4}-/, '')}\`](../work/${i.id}.md)`)
  }
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
//
// **순서는 `core/sync.js` 가 갖는다.** 화면도 같은 것을 부른다 -- 전에는 둘이
// 각자 fetch/pull/재스캔을 엮고 있었고, 그러면 "앱에서는 됐는데 CLI 에서는
// 안 된다" 가 생겼을 때 어느 쪽이 맞는지 알 수 없다.
async function cmdSync(r, opt) {
  const pull = opt.args.includes('--pull') || opt.pull

  if (!(await git.isRepo(r.root))) {
    if (opt.json) out(JSON.stringify({ repo: false }))
    else out('ctx sync: git 레포가 아닙니다. 동기화할 것이 없습니다.')
    return 0
  }

  // 진행을 찍는다 -- 사내망 fetch 실측이 19.5초다. 조용하면 멎은 줄로 읽는다.
  const PHASE = { fetching: '원격 확인 중...', pulling: '받는 중...', rescanning: '다시 읽는 중...' }
  const res = await runSync(r.root, {
    pull,
    onPhase: ({ phase }) => {
      if (!opt.json && PHASE[phase]) err(PHASE[phase])
    },
  })
  const st = res.status || (await git.status(r.root))

  if (opt.json) {
    out(JSON.stringify(res, null, 2))
    return res.ok ? 0 : 1
  }

  out(`브랜치  ${st.branch || '(없음)'}${st.upstream ? '  ->  ' + st.upstream : '  (upstream 없음)'}`)
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

  out('')
  if (!res.ok) {
    err('sync    실패 -- ' + res.reason)
    err(String(res.message || '').split('\n').join('\n        '))
    return 1
  }
  if (pull) out('pull    ' + (res.pulled > 0 ? `완료 (ff) -- ${res.pulled}건` : '이미 최신입니다.'))
  else if (st.behind > 0) out(`받을 것이 ${st.behind}건 있습니다.  ctx sync --pull`)
  else out('이미 최신입니다.')
  return 0
}

// **작업 레포에 에이전트 세팅을 넣는다.**
//
// 코드가 있는 레포에서 클로드를 열면 지식 레포의 skill 이 보이지 않는다 --
// 하네스는 **프로젝트 루트의 `.claude/skills/` 만** 읽는다. 설계서 §8.1 은
// "절차는 지식 레포의 skill 에 있다" 고만 적어 두었는데, 그것은 사람에게
// 하는 안내지 기계적 연결이 아니다. 실측에서 작업 레포에는 skill 이 하나도
// 잡히지 않았다.
//
// 손으로 복사하게 두지 않는 이유 -- 두 가지(규약 + skill 전부)를 옮겨야 하고,
// 규약 안의 경로를 실제 경로로 바꿔야 한다. 셋 중 하나만 빠져도 조용히
// 작동하지 않는다.
async function cmdSetup(r, opt) {
  const target = opt.args[0]
  if (!target) {
    err('ctx setup <작업 레포 경로>')
    err('  예:  ctx setup C:' + BS + 'gdi')
    return 2
  }
  const plan = await planSetup(r.root, target)
  if (!plan.ok) {
    err('ctx: ' + plan.reason)
    return 2
  }

  const label = { create: '새로', update: '갱신', append: '블록 추가', remove: '제거', same: '같음' }
  const show = (a) =>
    a.kind === 'skill'
      ? `  ${label[a.op].padEnd(9)} .claude${SEP}skills${SEP}${a.name}`
      : a.kind === 'claude'
        ? `  ${label[a.op].padEnd(9)} CLAUDE.md`
        : `  ${label[a.op].padEnd(9)} .claude${SEP}cdp.json   지식 레포 = ${plan.knowledge}`

  if (opt.dry) {
    out(`ctx setup --dry: ${plan.work}`)
    for (const a of plan.actions) out(show(a))
  } else {
    const done = await applySetup(plan)
    out(`ctx setup: ${plan.work}`)
    for (const a of plan.actions) if (a.op !== 'same') out(show(a))
    if (!done.length) out('  (바뀐 것 없음)')
  }

  for (const w of plan.warnings) {
    out('')
    out('[주의] ' + String(w).split(String.fromCharCode(10)).join(String.fromCharCode(10) + '       '))
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
    search: cmdSearch,
    index: cmdIndex,
    match: cmdMatch,
    where: cmdWhere,
    derive: cmdDerive,
    term: cmdTerm,
    apply: cmdApply,
    brief: cmdBrief,
    sync: cmdSync,
    setup: cmdSetup,
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
