// 녹화 — 시나리오 다섯을 데모 서버에 **진짜로** 돌리고 요청 · 응답을 그대로 적는다(제작 검토 v0.1 S8).
//
// 사이트는 이 JSON 을 재생만 한다. 손으로 쓴 출력은 판이 바뀌면 거짓말이 된다. 걸음마다 세 가지를 남긴다:
//   ask   사람이 한 말(시나리오의 전제 — 지어낸 대화가 아니라 상황 설명이다)
//   note  **해설** — 이 걸음이 왜 이 도구인지. 녹화가 아니다(사이트가 「해설」 딱지를 단다)
//   req · res   녹화 — 서버가 실제로 받은 것과 낸 것
// `must` 가 결과를 대조한다 — 시나리오가 뜻대로 안 끝나면(③ 이 E_FORBIDDEN · E_INPUT · 커밋이 아니면 등) 녹화가 실패한다.
//
// v1.0 의 뜻(개편안 §3.3) — writer 는 작업 기록만 남기고(①②③⑤ 의 dev.a · lead), 섹션은 그 레포의 큐레이터(doc.c · admin 인 lead)가
// 대기열에서 판정해 반영한다(④⑤). 반영 전의 기록은 섹션을 읽는 자리마다 「미반영」 으로 같이 온다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { ROOT, NL, call, git } from './lib.mjs'
import { S } from './content.mjs'

const DEST = path.join(ROOT, 'site', 'src', 'data', 'examples')
const REPO = 'library'
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
const LN030 = '화면설계서:LN030'

function must(c, m) {
  if (!c) throw new Error('녹화 대조 실패 — ' + m)
}
const brief = (v) => JSON.stringify(v).slice(0, 400)

// 녹화에서 기계마다 다른 값(절대경로)을 걷는다. 커밋 해시는 남긴다 — 진짜라는 표시다.
function scrub(v) {
  let s = JSON.stringify(v)
  for (const [p, to] of [[path.join(ROOT, 'ops', 'out', 'site-demo'), '<서버>'], [ROOT, '<CDP>']]) {
    s = s.split(JSON.stringify(p).slice(1, -1)).join(to).split(p.split(path.sep).join('/')).join(to)
  }
  return JSON.parse(s)
}

export async function record({ base, st, out, saves: { writerSave, curatorSave }, saveState }) {
  // 판이 바뀌며 이름이 바뀐 녹화(옛 3-blocked)가 남아 여섯째로 재생되지 않게 비우고 쓴다
  await fs.mkdir(DEST, { recursive: true })
  for (const f of await fs.readdir(DEST)) if (f.endsWith('.json')) await fs.rm(path.join(DEST, f))

  const push = (steps, who, tool, r, extra) => steps.push({ who, kind: 'call', tool, req: r.req, res: scrub(r.res), ...extra })
  const rec = (steps) => async (who, tool, args, extra = {}) => {
    const r = await call(base, REPO, st.tokens[who], tool, args)
    push(steps, who, tool, r, extra)
    return r.res
  }
  const fileOf = async (rel) => ({ path: rel, text: (await fs.readFile(path.join(out.repos, REPO, rel), 'utf8')).replace(/\r\n/g, NL) })
  const sectionFile = async (coord) => {
    const r = (await call(base, REPO, st.tokens.lead, 'section', { coord })).res
    return { path: `${r.doc} § ${coord}`, text: r.body }
  }
  // 레포의 이력으로 확인한다 — 사이트의 설명(「커밋 0 · 트리 깨끗」 · 「관리 문서는 한 줄도 안 바뀌었다」)이 녹화와 어긋나지 않게
  const repoDir = path.join(out.repos, REPO)
  const commits = async () => Number((await git(repoDir, 'rev-list', '--count', 'HEAD')).stdout.trim())
  const clean = async () => (await git(repoDir, 'status', '--porcelain')).stdout.trim() === ''
  const headFiles = async () => (await git(repoDir, 'show', '--name-only', '--format=', 'HEAD')).stdout.split(/\r?\n/).filter(Boolean)
  const written = []
  const write = async (n, slug, doc) => {
    const file = path.join(DEST, `${n}-${slug}.json`)
    await fs.writeFile(file, JSON.stringify({ n, slug, version: pkg.version, recorded: new Date().toISOString().slice(0, 10), repo: REPO, ...doc }, null, 2) + NL)
    written.push(path.basename(file))
  }

  // ① 이름으로 좌표를 찾는다 ───────────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const m = await R('dev.a', 'match', { names: ['연체 현황'] }, { note: '말로 가리킨 대상은 좌표를 짐작하지 않고 먼저 어휘에 대조한다. alias 「연체 현황」 이 정본 좌표 하나로 풀린다.' })
    must(JSON.stringify(m).includes(LN030), 'match 가 LN030 을 못 냈다')
    const w = await R('dev.a', 'where', { coord: LN030 }, { note: '그 좌표의 섹션이 어느 문서에 있고, 큐레이터가 어느 기록까지 반영했나(`applied`) — 그 뒤에 아직 반영 안 된 기록이 몇 건인가(`pending`).' })
    must(w.section?.state === 'pending' && w.section.pending === 2, '① where — 미반영 둘이 아니다: ' + brief(w))
    const s = await R('dev.a', 'section', { coord: LN030 }, {
      note: '문서 전체가 아니라 **그 섹션만** 읽는다 — 그리고 아직 반영 안 된 기록 둘의 본문(`pendingRecords`)과 본문이 건 좌표의 정본 섹션(`refs`)이 같이 온다. 섹션과 그 기록을 둘 다 읽어야 지금을 안다.',
    })
    must(s.pendingRecords?.length === 2 && s.refs?.some((x) => x.coord === '도메인용어:연체일수'), '① section — 미반영 본문 · refs: ' + brief(s))
    await R('dev.a', 'work', { id: '2026-0512-연체이력-분리' }, { note: '「왜 저장하지 않고 계산하나」 는 섹션이 아니라 작업 기록에 있다 — refs 로 따라온 연체일수 섹션의 경과 줄이 그 기록을 가리킨다.' })
    await write(1, 'find', {
      title: '이름으로 좌표를 찾는다',
      summary: '말 한마디에서 정본 좌표 → 그 섹션과 미반영 기록 → 그렇게 정한 까닭까지 네 걸음.',
      ask: '연체 현황 화면에 무엇을 보여 주기로 했지? 연체일수는 왜 저장하지 않고 그때그때 계산해?',
      steps,
      files: [await sectionFile(LN030), await fileOf('work/2026-0512-연체이력-분리.md')],
    })
  }

  // ② 작업하고 기록한다 — writer 는 기록만 ─────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    await R('dev.a', 'section', { coord: '이슈:LIB-ISS-01' }, { note: '답이 온 이슈의 섹션을 먼저 읽는다 — 관련 좌표가 이 답이 바꾸는 대상(기록의 `touches`)이다. 그 좌표들의 정본이 `refs` 로 한 단계 같이 온다.' })
    const w = {
      by: 'dev.a',
      id: '2026-1005-연체일수-기준-확정',
      title: '연체일수 기준 확정 — 반납예정일 다음날부터',
      date: '2026-10-05 14:30',
      touches: ['도메인용어:연체일수', '배치:OverdueNoticeJob', '이슈:LIB-ISS-01'],
      tags: ['연체', '이슈'],
      body: `운영 부서 답이 왔다 — **반납예정일 다음날부터 센다.** 반납예정일 당일 반납은 연체가 아니다(0일). 휴관일도 센다.

반납 화면은 이미 이렇게 셌다(반납일 − 반납예정일, 음수면 0). 연체 안내 배치는 반납예정일 **당일**의 대출에도 문자를 보내고
있었다 — 대상을 「반납예정일이 기준일보다 앞선 대출」 로 고친다. 이슈 LIB-ISS-01 은 이 기준으로 해결이다.`,
    }
    const r = await writerSave(st, REPO, w)
    push(steps, 'dev.a', 'save', r, { note: '작업 기록 **하나만** 보낸다 — 값 · 결정을 본문에 담아 그 기록만 읽어도 알 수 있게. 서버가 검사하고 한 커밋으로 남긴다. `author` 는 보내지 않는다 — 토큰이 정한다. 섹션은 보내지 않는다 — 그 레포 큐레이터의 몫이다.' })
    must(r.res.commit && r.res.sections === 0, '② save 실패 ' + brief(r.res))
    const files2 = await headFiles()
    must(files2.length === 1 && files2[0] === `work/${w.id}.md`, '② 커밋에 기록 말고 다른 파일: ' + files2.join(' · '))
    const after = await R('dev.a', 'section', { coord: '도메인용어:연체일수' }, {
      note: '섹션도 `applied` 도 그대로다. 대신 이 좌표를 읽으면 방금 기록이 **미반영**으로 같이 온다(`state: pending` · `pendingRecords`) — 큐레이터가 반영하기 전에도 다음 사람이 이 답을 놓치지 않는다.',
    })
    must(after.state === 'pending' && after.pendingRecords?.some((p) => p.id === w.id), '② 미반영이 아니다 ' + brief(after))
    const wk = await R('dev.a', 'work', { id: w.id }, { note: '이 기록의 큐레이션 상태 — 대기(`queued`). 큐레이터가 판정하면 「반영됨 → 좌표」 나 「기록으로 둠(사유)」 으로 바뀐다. 상태는 저장하지 않고 판정 기록에서 계산한다.' })
    must(wk.curation?.state === 'queued', '② 대기가 아니다 ' + brief(wk.curation))
    await write(2, 'save', {
      title: '작업하고 기록한다',
      summary: '작업 기록 하나가 한 커밋이다. 기록은 큐레이션 대기열에 서고, 큐레이터가 반영할 때까지 그 좌표를 읽는 자리마다 「미반영」 으로 같이 실린다.',
      ask: '이슈 LIB-ISS-01 답이 왔어 — 반납예정일 다음날부터 센대. 기록해 줘.',
      steps,
      files: [await fileOf(`work/${w.id}.md`)],
    })
  }

  // ③ 섹션을 못 고쳐도 기록은 들어간다 ───────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const w = {
      by: 'dev.a',
      id: '2026-1006-반납예정일-휴관일',
      title: '반납예정일이 휴관일이면 다음 개관일로',
      date: '2026-10-06 10:15',
      touches: ['도메인용어:반납예정일', '프로그램사양서:LN010', '테이블정의서:bk_holi_cal'],
      tags: ['대출'],
      vocab: [{ coord: '테이블정의서:bk_holi_cal', label: '휴관일달력', aliases: ['휴관일', '휴관일 달력', 'BK_HOLI_CAL'] }],
      body: `반납예정일이 휴관일에 걸리면 회원은 반납할 수 없는데 다음날부터 연체가 된다. 휴관일이면 다음 개관일로 민다.

- 휴관일은 새 테이블 BK_HOLI_CAL 휴관일달력 — 휴관일자(PK) · 휴관사유 · 등록자. 정기 휴관(월요일)과 임시 휴관을 같이 둔다
- 대출 등록 프로그램이 반납예정일(대출일 + 14일)을 계산한 뒤 휴관일달력을 보고 민다. 연장(+14일)에도 같은 규칙`,
    }
    // 옛 판의 습관 — 기록과 섹션을 한 번에. 섹션은 읽은 그대로의 applied 로 고쳐 보낸다(읽기는 녹화하지 않는다 — 거절이 요점이다)
    const cur = {}
    for (const c of ['도메인용어:반납예정일', '프로그램사양서:LN010']) cur[c] = (await call(base, REPO, st.tokens['dev.a'], 'section', { coord: c })).res
    const sections = [
      { coord: '도메인용어:반납예정일', applied: cur['도메인용어:반납예정일'].applied, body: S.due2 },
      { coord: '프로그램사양서:LN010', applied: cur['프로그램사양서:LN010'].applied, body: S.ln010p2 },
    ]
    const n0 = await commits()
    const bad = await writerSave(st, REPO, w, { sections })
    push(steps, 'dev.a', 'save', bad, { note: '(옛 판의 습관대로) 기록과 함께 섹션까지 고쳐 보내 본다. writer 의 save 는 기록만 받는다 — **파일을 만지기 전에** 거절하고 무엇을 빼고 다시 보낼지 알려 준다(`need: curate` · `fields`).' })
    must(bad.res.error?.code === 'E_FORBIDDEN' && bad.res.error.detail?.need === 'curate', '③ 첫 save 가 E_FORBIDDEN 이 아니다: ' + brief(bad.res))
    const bad2 = await writerSave(st, REPO, w, { vocab: false })
    push(steps, 'dev.a', 'save', bad2, { note: '기록만 다시 보낸다. 그런데 새 테이블 휴관일달력을 `touches` 에 적고 어휘에 올리지 않았다 — save 가 막는 것은 이런 **이 save 자신의 결함**(미등재 좌표 · 필수 필드)뿐이다.' })
    must(bad2.res.error?.code === 'E_INPUT' && bad2.res.error.detail?.coord === '테이블정의서:bk_holi_cal', '③ 둘째 save 가 미등재 E_INPUT 이 아니다: ' + brief(bad2.res))
    must((await commits()) === n0 && (await clean()), '③ 거절된 save 가 흔적을 남겼다')
    const ok = await writerSave(st, REPO, w)
    push(steps, 'dev.a', 'save', ok, { note: '새 좌표를 `vocab` 으로 같이 등재해 보낸다. 통과 — 고칠 섹션 둘과 새 테이블은 큐레이터의 대기열로 간다. 섹션을 안 고친 것은 오류가 아니라 **상태(미반영)**다.' })
    must(ok.res.commit, '③ 셋째 save 실패 ' + brief(ok.res))
    const s1 = await R('dev.a', 'section', { coord: '도메인용어:반납예정일' }, { note: '섹션은 아직 옛 계산(대출일 + 14일)이다. 그러나 이 좌표를 읽는 자리마다 방금 기록이 같이 온다 — 「문서는 나중에」 가 정보를 잃지 않는다.' })
    must(s1.state === 'pending' && s1.pendingRecords?.some((p) => p.id === w.id), '③ 반납예정일이 미반영이 아니다 ' + brief(s1))
    const s2 = await R('dev.a', 'section', { coord: '테이블정의서:bk_holi_cal' }, { note: '섹션이 아직 없는 새 좌표도 같다 — 등록부(`테이블정의서:*`)는 있고 섹션은 큐레이터가 세운다. 그동안은 대기 기록이 근거로 온다.' })
    must(s2.state === 'missing' && s2.pendingRecords?.some((p) => p.id === w.id), '③ 새 좌표에 대기 기록이 안 온다 ' + brief(s2))
    await write(3, 'pending', {
      title: '섹션을 못 고쳐도 기록은 들어간다',
      summary: 'writer 의 save 는 기록만 받는다 — 섹션을 보내면 손대기 전에 거절된다. 막는 것은 그 save 자신의 결함(미등재 좌표 · 필수 필드)뿐이고, 못 고친 섹션은 「미반영」 으로 같이 실린다.',
      ask: '반납예정일이 휴관일이면 다음 개관일로 밀어 줘. 기록도.',
      steps,
      files: [await fileOf(`work/${w.id}.md`), await sectionFile('도메인용어:반납예정일')],
    })
  }

  // ④ 큐레이터 둘이 같은 섹션에 반영한다 ─────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const X = '2026-1002-연체현황-등급-필터'
    const Y = '2026-1002-연체현황-엑셀'
    const a0 = await R('lead', 'section', { coord: LN030 }, { note: 'lead(admin — 모든 레포의 큐레이터)가 대기열에서 회원등급 필터 기록을 맡아 연체 현황 섹션을 읽는다. 미반영 둘이 같이 온다.' })
    await R('doc.c', 'section', { coord: LN030 }, { note: '같은 때 doc.c(이 레포의 큐레이터)도 엑셀 기록을 맡아 같은 섹션을 읽는다. 둘이 받은 `applied` 가 같다.' })
    const seen = [...(st.changes[REPO + ' ' + LN030] || [])] // doc.c 가 읽은 때의 경과
    const cx = { by: 'lead', id: '2026-1007-큐레이션-연체현황-등급', title: '큐레이션 — 연체 현황 회원등급 조건', date: '2026-10-07 09:40', judgments: [{ id: X, verdict: 'reflect', into: [LN030] }], canon: '회원등급 조건은 화면설계서:LN030 의 조회 조건에 둔다.' }
    const r1 = await curatorSave(st, REPO, cx)
    push(steps, 'lead', 'save', r1, { note: 'lead 가 먼저 반영한다 — 판정(`work.curates`)과 고친 섹션을 큐레이션 기록 하나와 한 커밋에. 통과 — 섹션의 `applied` 는 서버가 반영한 기록(회원등급 필터)으로 쓴다.' })
    must(r1.res.commit, '④ lead 큐레이션 실패 ' + brief(r1.res))
    const cy = { by: 'doc.c', id: '2026-1007-큐레이션-연체현황-엑셀', title: '큐레이션 — 연체 현황 엑셀 내려받기', date: '2026-10-07 09:55', judgments: [{ id: Y, verdict: 'reflect', into: [LN030] }], canon: '엑셀 단추는 화면설계서:LN030 의 버튼 줄에 둔다.' }
    const r2 = await curatorSave(st, REPO, cy, { applied: { [LN030]: a0.applied }, base: { [LN030]: seen }, bodyOf: () => S.ln030s1x })
    push(steps, 'doc.c', 'save', r2, { note: 'doc.c 가 **처음 읽은 applied** 로 보낸다. 그 사이 lead 가 반영했으니 덮어쓰지 않고 거절한다 — 지금 `applied` 가 어느 기록인지(`current` · `currentWork`)와 지금 본문(`content`)을 같이 준다.' })
    must(r2.res.error?.code === 'E_CONFLICT' && r2.res.error.detail?.current === X, '④ 가 E_CONFLICT 가 아니다: ' + brief(r2.res))
    const r3 = await curatorSave(st, REPO, cy, { applied: { [LN030]: r2.res.error.detail.current }, bodyOf: () => S.ln030s3 })
    push(steps, 'doc.c', 'save', r3, { note: '거절에 실려 온 지금 본문 위에 엑셀 단추를 얹고 `applied` 에 `current` 를 넣어 다시 보낸다. 둘 다 남는다 — 경과도 두 줄.' })
    must(r3.res.commit, '④ 다시 보낸 큐레이션 실패 ' + brief(r3.res))
    await write(4, 'conflict', {
      title: '큐레이터 둘이 같은 섹션에 반영한다',
      summary: '섹션을 쓰는 것은 큐레이터다. 저장은 줄을 서고, 같은 섹션을 먼저 누가 바꿨으면 조용히 덮지 않고 거절한다 — 다시 만들 재료를 같이 준다.',
      ask: '(lead) 연체 현황 회원등급 필터 기록을 반영하자. · (doc.c) 연체 현황 엑셀 기록을 반영해 줘.',
      steps,
      files: [await sectionFile(LN030), await fileOf(`work/${cy.id}.md`)],
    })
  }

  // ⑤ 잘못 적은 것을 정정한다 ──────────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const old = '2026-0821-우수회원-한도-상향'
    const w0 = await R('lead', 'work', { id: old }, { note: '틀린 기록을 읽는다. **작업 기록은 고치지 않는다** — 그때 그렇게 적었다는 것도 사실이다. 큐레이션 상태는 「반영됨」 이다.' })
    must(w0.curation?.state === 'reflected', '⑤ 옛 기록이 반영됨이 아니다 ' + brief(w0.curation))
    const w = {
      by: 'lead',
      id: '2026-1007-우수회원-한도-정정',
      title: '우수 회원 한도 정정 — 10권이 아니라 8권',
      date: '2026-10-07 13:20',
      supersedes: old,
      touches: ['코드정의서:LN02', '요구사항:LIB-SFR-02'],
      tags: ['정정', '한도'],
      body: `8월 기록에 우수 회원 한도를 10권으로 적었는데, 운영위원회 회의록(8/20)은 **8권**이다. 옮겨 적다 틀렸다.
우수 등급(LN02 의 03) 한도는 8권이다. 옛 기록은 이 기록이 대신한다(supersedes).
회의록을 다시 본 것은 「10권까지 된다던데」 하는 회원 문의가 와서다. 화면 · 프로그램은 LN02 비고를 읽으므로 고칠 것이 없다.`,
      secs: {
        '코드정의서:LN02': [S.ln02c, '우수 한도 10 → 8권(정정)'],
        '요구사항:LIB-SFR-02': [S.sfr02b, '8권 정정 — 값은 LN02'],
      },
    }
    const r = await writerSave(st, REPO, w)
    push(steps, 'lead', 'save', r, { note: '정정도 사건이다. 새 기록에 `supersedes` 를 달아 **기록만** 보낸다 — 정본 섹션은 큐레이터가 고친다.' })
    must(r.res.commit, '⑤ 정정 기록 실패 ' + brief(r.res))
    const s = await R('doc.c', 'section', { coord: '코드정의서:LN02' }, { note: '큐레이터(doc.c)가 섹션을 읽는다. 섹션은 아직 10권이고, 정정 기록이 미반영으로 같이 온다 — 반영 전에 읽은 사람도 정정을 놓치지 않는다.' })
    must(s.state === 'pending' && s.pendingRecords?.some((p) => p.id === w.id), '⑤ 정정이 미반영이 아니다 ' + brief(s))
    const q = await R('doc.c', 'queue', { id: w.id }, { note: '판정 재료 — 그 기록이 건드린 좌표마다 섹션 · 상태 · `applied` · 미반영 수. `queue` 는 큐레이터에게만 등록되는 도구다(writer 에게는 보이지도 않는다).' })
    must(q.record?.id === w.id && q.coords?.length === 2, '⑤ 판정 재료 ' + brief(q))
    const cz = { by: 'doc.c', id: '2026-1007-큐레이션-한도-정정', title: '큐레이션 — 우수 회원 한도 정정', date: '2026-10-07 16:00', judgments: [{ id: w.id, verdict: 'reflect', into: ['코드정의서:LN02', '요구사항:LIB-SFR-02'] }], canon: '한도 숫자는 코드정의서:LN02 한 곳 — 요구사항:LIB-SFR-02 는 경과 한 줄.' }
    const c = await curatorSave(st, REPO, cz, { extra: [w] })
    push(steps, 'doc.c', 'save', c, { note: '판정표대로 두 섹션을 고쳐 큐레이션 기록 하나와 한 커밋에 — 숫자는 정본(LN02)에만, 요구사항에는 경과 한 줄. `applied` 는 서버가 정정 기록으로 쓴다.' })
    must(c.res.commit, '⑤ 큐레이션 실패 ' + brief(c.res))
    const wh = await R('doc.c', 'where', { coord: '코드정의서:LN02' }, { note: '섹션이 정정 기록까지 실었다 — 미반영 0. 옛 기록은 그대로 있고, 정정 기록이 그것을 대신한다.' })
    must(wh.section?.applied === w.id && wh.section.pending === 0, '⑤ applied 가 정정 기록이 아니다 ' + brief(wh))
    await write(5, 'supersede', {
      title: '잘못 적은 것을 정정한다',
      summary: 'work/ 는 지우지도 고치지도 않는다. 틀린 기록은 그것을 대신하는 새 기록으로 바로잡고, 큐레이터가 정본 섹션을 고친다 — 그 사이에도 정정은 미반영으로 같이 실린다.',
      ask: '8월 우수 회원 한도 기록이 틀렸어 — 회의록을 보니 10권이 아니라 8권이야.',
      steps,
      files: [await fileOf(`work/${w.id}.md`), await sectionFile('코드정의서:LN02')],
    })
  }

  await saveState(st)
  console.log('[site:demo] 녹화 ' + written.join(' · '))
}
