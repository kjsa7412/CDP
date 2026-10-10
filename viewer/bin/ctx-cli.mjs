// ctx — 지식 레포 명령줄 도구. **읽기와 서버 관리만 한다**(v1.0 개편안 §5.6) — 쓰기 길은 서버 `save` 하나다(I2).
//
//   1) 계산을 여기서 다시 하지 않는다. `core/` 를 쓴다 — 서버 · 화면과 `ctx` 가 다른 답을 내면
//      사람은 어느 쪽을 믿을지 알 수 없다.
//   2) 서버 번들의 `bin/ctx.mjs` 하나로 돈다 — 지식 레포 안에는 더 들어가지 않는다(I9).
//
// 출력은 CP949 콘솔에서도 깨지지 않게 **ASCII 구두점만** 쓴다. em-dash(U+2014)와
// 박스 문자는 Windows 기본 콘솔에서 인코딩 오류를 낸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRepo } from '../../core/repo.js'
import { runBuiltinCheck } from '../../core/check.js'
import { buildIndex, fullText, tokenize } from '../../core/search.js'
import { reconcile, normKey } from '../../core/vocab.js'
import { resolveCoord } from '../../core/managed.js'
import * as git from '../../core/git.js'
import { appVersion } from '../../core/appinfo.js'
import { hereDir } from '../server/runtime.js'
// 도구 12종의 형태는 **여기서 만들지 않는다.** `core/tools.js` 가 만든 것을
// 그대로 낸다 -- MCP 의 tools/call 과 바이트까지 같아야 하기 때문이다(MCP 설계서 §10).
import * as T from '../../core/tools.js'

// 번들 시각. `tools/build-ctx.mjs` 가 치환한다.
//
// **번들이 조용히 낡는 것이 실제 함정이다.** `ctx-cli.mjs` 에 명령을 추가하고
// 재번들하지 않으면 지식 레포의 `bin/ctx.mjs` 는 옛 명령 목록으로 돈다 --
// 그리고 그것은 "모르는 명령" 으로만 나타나서 원인을 짚기 어렵다.
export const BUILT = '__CTX_BUILT__'

const BS = String.fromCharCode(92)
const SEP = path.sep

const USAGE = `ctx - 지식 레포 도구  (번들 __CTX_BUILT__)

  ctx check [--json]        레포 검사. 오류가 있으면 exit 1
  ctx docs [<문서|관리번호>] 관리 문서 목록 · 사용 현황 / 그 문서 원문 (MCP docs 와 같다)
  ctx match <이름...>       이름 -> 정본 좌표 (대조)
  ctx where <좌표...>       그 좌표의 상태가 어느 문서 어느 섹션에 · 얼마나 되나
  ctx search <말...>        말 -> 좌표 후보 (match 가 미등재를 낼 때의 폴백)
  ctx term <이름>           어휘 조회 (정본 / alias / deprecated)
  ctx brief                 두 줄 요약 (절차 + 살아 있는 레포 상태 · 대기열)
  ctx version               이 번들이 언제 만들어졌나
  ctx up [<폴더>] [--install <코드 폴더>]… [--curator <폴더>] [--service]
                            **혼자 · 서버 없이 시작하는 한 줄** — 빈 틀 · 개인 서버 · 토큰 · 화면 · 작업 레포 설치까지
  ctx up <폴더> --update [--commit]   판이 오른 뒤 — 이 PC 의 작업 레포 · 큐레이터 폴더 전부
  ctx self-update <tar.gz|url>        서버 산출물을 ~/.cdp/server 에 풀고 current 를 옮긴다 · 서비스면 다시 띄운다
  ctx serve --root <폴더>    MCP 서버 + 관리 서비스 (HTTP). 상주 프로세스
  ctx serve --personal <레포>  개인 서버 — 레포 하나 · 127.0.0.1 · 명부(나 하나)를 스스로 만든다. 서버 없는 팀 · 한 사람
  ctx serve user add|set|list --auth <f> [--role viewer|writer|admin] [--curate <레포,…|*>]   명부 — 권한은 여기 붙는다(--curate 는 레포별 큐레이터 · 빈 값이면 해제)
  ctx serve token [list|reissue|set|revoke] --auth <f>   토큰 — 신원만 증명한다. 폐기는 상태로 남는다
  ctx serve git-auth --host <h[:p]> --user <계정> [--test <url>]   origin 자격 — PAT 를 숨김 입력으로(.git-credentials 600)
  ctx serve git-auth --ssh --data <dir> [--rotate] | --list      SSH 배포 키(공개 키를 GitLab 에) · 지금 상태
  ctx serve doctor --root … --auth … --data …   서버 준비물 검사 (fail 이면 exit 1)
  ctx serve init --auth <f> --name <이름>       첫 관리자 + 토큰을 한 번에 (명부가 없을 때만 · 브라우저 /setup 과 같은 일)
  ctx repo new <경로> [--title <한 줄>] [--origin <url>] [--push]   지식 레포를 빈 틀로 세운다(서식은 서식집 · 스킬은 서버 kit)
  ctx repo list --root <폴더>               서버 <root> 의 레포 목록
  ctx repo new <경로> --records-from <옛 레포>   다시 세우기 — 작업 기록 · 첨부 · 그 기록이 쓰는 어휘만 옮긴다
  ctx baseline extract|push …               옛 섹션을 기준선 블록으로 옮긴다(다시 세운 레포의 출발점)
  ctx drift [<좌표>] [--doc <문서>] [--json]   어긋남 진단 — 근거 없음 · 복제 · 비대 · 일지형 · 좌표 없는 기록(읽기만)
  ctx rebuild snapshot --server <주소> --repo <레포> [--doc <문서>] [--all] [--dry]   근거 없는 섹션을 정본 스냅샷 기록으로 뜬다(큐레이터 · 200 개씩 · 기록을 인용하는 섹션은 --all 일 때만)
  ctx forms list|show <id>|check [--forms <dir>] [--data <dir>]   서식집 — 목록 · 서식 하나(찍힐 빈 문서까지) · 번들과 팀 서식(<data>/forms) 검사
  ctx migrate <레포> [--dry] [--by <이름>] [--keep-tools]   제자리 이행 — 전환 기록 하나 · 서식 예시 · 도구 층 걷기(서버를 멈추고)
  ctx import-dir <원본> --repo <지식레포> [--dry] [--author <이름>]   md 폴더를 work/ 로 들인다

  --repo <경로>             지식 레포 경로 (기본: CDP_REPO 또는 현재 폴더 상위 탐색)
  --root <폴더>             ctx serve -- 그 폴더의 하위를 전부 레포로 본다
  --prompts auto|always|never   MCP prompt 노출 (기본 auto — HTTP 에서는 always 와 같다)
  --bind · --port · --auth · --data · --mirror · --web · --forms · --kit   ctx serve 용
  --manual <dir> · --private-pages · --admin-from <cidr,…>            ctx serve 용 — 설명서 폴더 · 소개/설명서에 로그인 요구 · 관리 API 대역
  --forms <dir> · --kit <dir>   서식집 · 작업 레포 kit (기본: CDP_FORMS · CDP_KIT → 번들 옆 forms/ · kit/ → 소스 agent/)
  --json                    기계 판독용 출력
`

// ── 유틸 ────────────────────────────────────────────────────────────────────

function parseArgs(argv) {
  // `--repo` 는 `ctx mcp` 에서만 **여러 번** 쓴다(§3.1). 나머지 명령은 지금처럼
  // 하나만 보므로 `repo` 에 첫 값을 그대로 남긴다 -- 기존 호출이 안 바뀐다.
  const out = { cmd: null, args: [], json: false, repo: null, repos: [], root: null, prompts: null, pull: false }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === '--json') out.json = true
    else if (a === '--pull') out.pull = true
    else if (a === '--purge') out.purge = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--apply-suggest') out.applySuggest = true
    else if (a === '--reason') out.reason = argv[++i]
    else if (a === '--work') out.work = argv[++i]
    else if (a === '--no-examples') out.noExamples = true
    else if (a === '--repo') { const v = argv[++i]; out.repos.push(v); if (out.repo == null) out.repo = v }
    else if (a === '--root') out.root = argv[++i]
    else if (a === '--prompts') out.prompts = argv[++i]
    else if (a === '--bind') out.bind = argv[++i]
    else if (a === '--port') out.port = argv[++i]
    else if (a === '--auth') out.auth = argv[++i]
    else if (a === '--data') out.data = argv[++i]
    else if (a === '--mirror') out.mirror = true
    else if (a === '--server') out.server = argv[++i]
    else if (a === '--web') out.web = argv[++i]
    else if (a === '--check') out.check = true
    else if (a === '--workrepo') out.workrepo = argv[++i]
    else if (a === '--public-url') out.publicUrl = argv[++i]
    else if (a === '--name') out.name = argv[++i]
    else if (a === '--user') out.user = argv[++i]
    else if (a === '--label') out.label = argv[++i]
    else if (a === '--note') out.note = argv[++i]
    else if (a === '--id') out.id = argv[++i]
    else if (a === '--expires') out.expires = argv[++i]
    else if (a === '--repos') out.repos2 = argv[++i]
    else if (a === '--role') out.role = argv[++i]
    else if (a === '--records-from') out.recordsFrom = argv[++i]
    else if (a === '--curate') out.curate = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : ''
    else if (a === '--manual') out.manual = argv[++i]
    else if (a === '--private-pages') out.privatePages = true
    else if (a === '--admin-from') out.adminFrom = argv[++i]
    else if (a === '--of-repo') out.repoFilter = argv[++i]
    else if (a === '--write') out.write = true
    else if (a === '--no-write') out.write = false
    else if (a === '--active') out.active = true
    else if (a === '--inactive') out.active = false
    else if (a === '--dry') out.dry = true
    else if (a === '--all') out.all = true
    else if (a === '--packages') out.packages = argv[++i]
    else if (a === '--forms') out.forms = argv[++i]
    else if (a === '--kit') out.kit = argv[++i]
    else if (a === '--by') out.by = argv[++i]
    else if (a === '--keep-tools') out.keepTools = true
    else if (a === '--personal') out.personal = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true
    else if (a === '--doc') out.doc = argv[++i]
    else if (a === '--src') out.src = argv[++i]
    else if (a === '--asof') out.asof = argv[++i]
    else if (a === '--form') out.form = argv[++i]
    else if (a === '--to') out.to = argv[++i]
    else if (a === '--server') out.server = argv[++i]
    else if (a === '--package') out.package = argv[++i]
    else if (a === '--origin') out.origin = argv[++i]
    else if (a === '--push') out.push = true
    else if (a === '--no-push') out.noPush = true
    else if (a === '--all') out.all = true
    else if (a === '--from') out.from = argv[++i]
    else if (a === '--title') out.title = argv[++i]
    else if (a === '--description') out.description = argv[++i]
    else if (a === '--author') out.author = argv[++i]
    else if (a === '--keep-touches') out.keepTouches = true
    else if (a === '--yes' || a === '-y') out.yes = true
    // ctx up(제품화 2 ③)
    else if (a === '--install') (out.install = out.install || []).push(argv[++i])
    else if (a === '--curator') out.curatorDir = argv[++i]
    else if (a === '--skills') out.skillsDir = argv[++i]
    else if (a === '--service') out.service = true
    else if (a === '--no-open') out.noOpen = true
    else if (a === '--save-token') out.saveToken = true
    else if (a === '--update') out.update = true
    else if (a === '--commit') out.commit = true
    else if (a === '--fix-gitignore') out.fixIgnore = true
    else if (a === '--desktop') out.desktop = true
    else if (a === '--also') (out.also ||= []).push(argv[++i])
    else if (a === '--built-at') out.builtAt = argv[++i]
    else if (a === '--host') out.host = argv[++i]
    else if (a === '--scheme') out.scheme = argv[++i]
    else if (a === '--file') out.file = argv[++i]
    else if (a === '--test') out.test = argv[++i]
    else if (a === '--ssh') out.ssh = true
    else if (a === '--rotate') out.rotate = true
    else if (a === '--list') out.list = true
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
  // 전에는 cwd 에서 위로만 찾았다. 그래서 작업 레포(C:\work\alpha)에 서서
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
  const errors = res.findings.filter((f) => f.sev === 'error')
  const warns = res.findings.filter((f) => f.sev === 'warn')
  const nErr = errors.reduce((a, f) => a + f.items.length, 0)
  const nWarn = warns.reduce((a, f) => a + f.items.length, 0)

  if (opt.json) {
    const j = T.toolCheck(r)
    out(JSON.stringify(j, null, 2))
    return j.ok ? 0 : 1
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

// 관리 문서 목록 · 한 문서 — MCP `docs` 와 같은 함수(등록부 사본 검토 X20)
async function cmdDocs(r, opt) {
  const res = T.toolDocs(r, { doc: opt.args[0], lastChange: opt.args[0] ? undefined : await git.lastChanges(r.root) })
  if (opt.json) {
    out(JSON.stringify(res, null, 2))
    return 0
  }
  if (res.docs) {
    for (const d of res.docs) {
      const u = d.usage
      const use = u ? `  [${u.state}] 섹션 ${u.sections.written}/${u.sections.total} · 작업 ${u.touchedBy + u.mentionedBy} · 참조 ${u.refsIn}${u.required ? ' · 필수' : ''}${u.lastChange ? ' · ' + u.lastChange.date : ''}` : ''
      out(`${d.registered ? '●' : '○'} ${(d.no || '').padEnd(7)} ${d.path}${d.rules.length ? '  ' + d.rules.map((x) => x.pattern).join(' · ') : ''}${use}`)
    }
    const idle = res.docs.filter((d) => d.usage?.state === '서식 그대로').length
    out(`\n관리 문서 ${res.total} · 등록부 대상 ${res.registered} (● 대상 · ○ 비대상) · 서식 그대로 ${idle}`)
    if (idle) out('안 쓰는 문서는 큐레이터가 화면 「관리 문서」 탭(또는 save managed drop)으로 지운다')
    return 0
  }
  out(res.text ?? '')
  return 0
}

// 판단은 LLM, 대조는 기계 (작업환경 §6.4).
async function cmdMatch(r, opt) {
  if (!opt.args.length) {
    err('ctx match: 대조할 이름을 주세요.  예) ctx match "면접심사의견등록" HR130')
    return 2
  }
  const rows = T.toolMatch(r, { names: opt.args })

  if (opt.json) {
    out(JSON.stringify(rows, null, 2))
    return 0
  }
  const w = Math.max(...rows.map((x) => [...x.name].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)), 8)
  for (const x of rows) {
    if (!x.coord) {
      out(`${pad(x.name, w)}  ->  (미등재)  _vocab.md 에 없습니다`)
      continue
    }
    const how = x.matchedBy === 'canonical' ? '정본' : x.matchedBy === 'alias' ? 'alias 일치' : x.matchedBy === 'label' ? '이름 일치' : '값 일치'
    const dep = x.deprecated ? `  [폐기 ${x.deprecated}${x.successor ? ' -> ' + x.successor : ''}]` : ''
    out(`${pad(x.name, w)}  ->  ${x.coord}  (${how}${x.exact ? '' : ' / 부분'} · _vocab.md:${x.vocabLine})${dep}`)
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
    err('ctx where: 좌표를 주세요.  예) ctx where table:pj_plan_mst')
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
      out(JSON.stringify(opt.args.map((c) => T.toolWhere(r, { coord: c, limit: 50 })), null, 2))
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
      // 날짜+주제라서 **id 만으로 주제가 읽힌다**(2026-0831-ERP-결의서-기본값).
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
    out(JSON.stringify(T.toolWhere(r, { coord, limit: 50 }), null, 2))
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
//   답은 api:/adapter/erp/expense-slip 섹션에 있었다
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

// **판정이 아니라 사실을 적는다.** 무엇이 실려 있나(applied). 미반영 기록은 `ctx check` 가
// 알림(info)으로 말하고 `section` 이 섹션과 함께 낸다(v1.0 I7).
// 비어 있음은 **재서** 말한다. 상태로 추측하면 내용이 있는 섹션까지 비었다고
// 말한다 -- 코드그룹 섹션은 작업 기록이 0건이어도 코드 표가 들어 있다.
function thin(sec) {
  if (sec.chars < 40) return '   ** 사실상 비어 있다 — 주입해도 얻는 것이 없다'
  return ''
}

function stateLabel(sec, coord) {
  if (!sec) return '등록부에 없음'
  if (sec.applied) return `반영 ${sec.applied}`
  if (sec.state === 'anchor-missing') return '섹션이 없음 — 큐레이터가 세운다(그동안은 section 이 대기 기록을 근거로 준다)'
  if (sec.state === 'doc-missing') return '문서가 없음 — 주입해도 빈손이다'
  if (sec.state === 'unwritten') return `미반영 — 작업 ${sec.total}건 · 큐레이터가 반영한다(section 이 그 기록을 같이 준다)`
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
    out(JSON.stringify(T.toolSearch(r, { words, limit: 50 }), null, 2))
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

// 두 줄. 사람이 터미널에서 상태를 볼 때 쓴다.
//
// v1.1 초안은 이것을 하네스 훅으로 매 요청에 주입하려 했다. 뺐다 -- skill
// description 이 발동 규칙이고 그 뒤에 git 훅이 있으므로, 비결정을 비결정으로
// 덮는 층을 하나 더 두지 않는다 (작업환경 §8.2).
async function cmdBrief(r, opt) {
  // 번들 나이 — 하네스가 `--built-at` 으로 시각을 주입한다(20번). 실제로는 BUILT 다.
  const built = opt.builtAt || BUILT
  if (opt.json) {
    out(JSON.stringify(T.toolBrief(r, { built }), null, 2))
    return 0
  }
  for (const l of T.toolBrief(r, { built }).lines) out(l)
  return 0
}

// 어긋남 진단(리빌딩 검토 §5.1) — 화면 「진단」 · MCP `drift` 와 같은 계산. 읽기만
async function cmdDrift(r, opt) {
  const d = T.toolDrift(r, { doc: opt.doc, coord: opt.args[0] })
  if (opt.json) {
    out(JSON.stringify(d, null, 2))
    return 0
  }
  const t = d.totals
  out(`ctx drift: 섹션 ${t.sections} — 근거 없음 ${t.unsourced} · 복제 ${t.duplicated} · 비대 ${t.oversize} · 큼 ${t.big ?? 0} · 일지형 ${t.diary} · 좌표 없는 기록 ${t.unreachable}`)
  for (const x of d.sections.slice(0, 40)) {
    const sig = [x.unsourced && '근거 없음', x.duplicated.length && `복제 ${x.duplicated.length}(${x.duplicated.slice(0, 3).join(' · ')}${x.duplicated.length > 3 ? ' …' : ''})`, x.oversize && `비대 ${x.oversize.lines}줄`, x.big && `큼 ${x.big.lines}줄`, x.diary && `일지형 ${x.diary}`].filter(Boolean)
    out(`   ${x.coord}  ${x.doc}  ${sig.join(' · ')}`)
  }
  if (d.total > 40) out(`   … ${d.total - 40}개 더 (--json · --doc · 좌표 인자로 좁힌다)`)
  if (t.unsourced) out('다음 — 근거 없는 섹션은 ctx rebuild snapshot 으로 먼저 뜬다(기록만 옮겨 다시 세워도 잃지 않게)')
  return 0
}

// ── 진입점 ──────────────────────────────────────────────────────────────────

export async function main(argv = process.argv.slice(2)) {
  const opt = parseArgs(argv)
  if (opt.cmd === 'version') {
    // 판을 먼저 — 「지금 몇 판인가」 를 CLI 로 알 수 있게(제품화 2 F9). 빌드 시각은 같은 판의 다른 번들을 가른다
    out(`v${appVersion(hereDir(import.meta.url))} · ${BUILT.startsWith('__') ? '원본 실행(번들 아님)' : '빌드 ' + BUILT}`)
    // **무엇을 할 수 있는 번들인가**를 같이 낸다. 낡은 번들은 `ctx mcp` 를
    // "모르는 명령" 으로 답하는데, 그것만으로는 번들이 낡은 것인지 설정이
    // 잘못된 것인지 알 수 없다(MCP 설계서 §9).
    out('mcp: http')
    return 0
  }
  if (!opt.cmd || opt.cmd === 'help') {
    out(USAGE)
    return opt.cmd ? 0 : 2
  }

  // 모드 A 의 명령은 v1.0 에서 끝났다(개편안 §5.6) — 무엇으로 바뀌었는지 한 줄로 답한다
  const gone = {
    mcp: 'stdio MCP 는 없다 — 작업 레포는 서버의 HTTP MCP 를 쓴다. 서버 없이 혼자면 ctx serve --personal <레포>',
    setup: '작업 레포 세팅은 서버의 설치 한 줄이다 — ctx up --install · 화면 「연결된 작업 레포」 의 한 줄 (--update · --curator)',
    index: 'INDEX 와 등록부 사본은 더 만들지 않는다 — 레포에는 지식만 둔다(v1.0)',
    derive: '파생은 큐레이션이다 — 서버 화면 「큐레이션 › 대기열」 · MCP queue',
    apply: '파생은 큐레이션이다 — 서버 화면 「큐레이션 › 대기열」 · MCP section(미반영 기록이 같이 온다)',
    sync: '원격과의 차이는 brief 가 낸다(미러) — ctx brief · MCP brief',
    examples: '서식 예시는 레포에 두지 않는다 — 옛 레포는 ctx migrate <레포> 가 지운다',
  }
  if (gone[opt.cmd] || (opt.cmd === 'docs' && opt.args[0] === 'drop')) {
    err(`ctx ${opt.cmd}${opt.cmd === 'docs' ? ' drop' : ''}: v1.0 에서 없앴다 — ${gone[opt.cmd] || '관리 문서 지우기는 큐레이터의 save managed drop(화면 「관리 문서」 탭)이다'}`)
    return 2
  }
  // 패키지 · 레포 · 이관 — 지식 레포 **밖**에서 도는 명령이다. findRepo 를 타지 않는다.
  if (opt.cmd === 'package') {
    err('ctx package: v1.0 에서 없앴다 — 새 레포는 빈 틀(ctx repo new)이고 서식은 서식집(큐레이터의 forms · 화면 「큐레이션 › 서식집」)이다')
    return 2
  }
  if (opt.cmd === 'up') {
    const { runUp } = await import('./ctx-up.mjs')
    return runUp(opt)
  }
  if (opt.cmd === 'self-update') {
    const { runSelfUpdate } = await import('./ctx-selfupdate.mjs')
    return runSelfUpdate(opt)
  }
  if (opt.cmd === 'repo') {
    const { runRepo } = await import('./ctx-repo.mjs')
    return runRepo(opt)
  }
  if (opt.cmd === 'forms') {
    const { runForms } = await import('./ctx-forms.mjs')
    return runForms(opt)
  }
  if (opt.cmd === 'migrate') {
    const { runMigrate } = await import('./ctx-migrate.mjs')
    return runMigrate(opt)
  }
  if (opt.cmd === 'rebuild') {
    const { runRebuild } = await import('./ctx-rebuild.mjs')
    return runRebuild(opt)
  }
  if (opt.cmd === 'baseline') {
    const { runBaseline } = await import('./ctx-baseline.mjs')
    return runBaseline(opt)
  }
  if (opt.cmd === 'import-dir') {
    const { runImportDir } = await import('./ctx-import.mjs')
    return runImportDir(opt)
  }
  if (opt.cmd === 'serve') {
    // `serve doctor` · `serve init` — 준비물 검사와 첫 사용자. 서버를 띄우지 않는다.
    if (opt.args[0] === 'doctor' || opt.args[0] === 'init') {
      const { runDoctor, runInit } = await import('./ctx-serve-doctor.mjs')
      return opt.args[0] === 'doctor' ? runDoctor(opt) : runInit(opt)
    }
    // `serve user …` · `serve token …` 는 명부를 고치고 끝난다. 서버를 띄우지
    // 않으므로 여기서 갈라진다.
    // `serve git-auth` — origin 자격(PAT · SSH 배포 키). 서버를 띄우지 않는다
    if (opt.args[0] === 'git-auth') {
      const { runGitAuth } = await import('./ctx-gitauth.mjs')
      return runGitAuth(opt)
    }
    if (opt.args[0] === 'user' || opt.args[0] === 'token') {
      const { runAuthCmd } = await import('./ctx-mcp-serve.mjs')
      return runAuthCmd({ ...opt, repos: opt.repos2 })
    }
    // 모르는 하위 명령은 서버를 띄우지 않는다 — 전에는 오타 · 없앤 명령(kit-refresh)도 상주 서버로 떴다.
    // 위치 인자를 받는 것은 `--personal` 뒤의 레포 경로 하나뿐이다
    if (opt.args[0] && !(opt.personal === true && opt.args.length === 1)) {
      if (opt.args[0] === 'kit-refresh') err('ctx serve kit-refresh: v1.0 에서 없앴다 — 레포 안에 도구 층이 없다. 작업 레포의 kit 은 서버 번들에서 나간다(설치 한 줄 --update)')
      else err(`ctx serve: 모르는 하위 명령 "${opt.args[0]}" — doctor · init · git-auth · user · token (서버를 띄우려면 인자 없이 --root …)`)
      return 2
    }
    const { runServe } = await import('./ctx-mcp-serve.mjs')
    return runServe(opt)
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
    docs: cmdDocs,
    match: cmdMatch,
    where: cmdWhere,
    term: cmdTerm,
    brief: cmdBrief,
    drift: cmdDrift,
  }
  const fn = table[opt.cmd]
  if (!fn) {
    err(`ctx: 모르는 명령 "${opt.cmd}"`)
    out(USAGE)
    return 2
  }
  return (await fn(r, opt)) || 0
}

// 직접 불렸을 때만 돈다 — 시험 · 다른 모듈이 import 하면 main() 을 부르지 않는다
const invokedDirect = process.argv[1] && /ctx(-cli)?(\.mjs|\.js)?$/i.test(process.argv[1])
if (invokedDirect) {
  main().then(
    // 파이프로 받은 stdout 은 비동기로 흘러간다 — 바로 exit 하면 큰 --json 이 8KB 언저리에서 잘렸다(하네스 1 · 137).
    // 빈 쓰기의 콜백은 앞선 쓰기가 다 나간 뒤에 온다
    (code) => process.stdout.write('', () => process.exit(code)),
    (e) => {
      err('ctx: ' + (e?.message || e))
      process.exit(1)
    }
  )
}
