// 녹화 — 시나리오 다섯을 데모 서버에 **진짜로** 돌리고 요청 · 응답을 그대로 적는다(제작 검토 v0.1 S8).
//
// 사이트는 이 JSON 을 재생만 한다. 손으로 쓴 출력은 판이 바뀌면 거짓말이 된다. 걸음마다 세 가지를 남긴다:
//   ask   사람이 한 말(시나리오의 전제 — 지어낸 대화가 아니라 상황 설명이다)
//   note  **해설** — 이 걸음이 왜 이 도구인지. 녹화가 아니다(사이트가 「해설」 딱지를 단다)
//   req · res   녹화 — 서버가 실제로 받은 것과 낸 것
// 끝의 `must` 가 결과를 대조한다 — 시나리오 ③ 이 E_CHECK 로 안 끝나면 녹화가 실패한다.

import fs from 'node:fs/promises'
import path from 'node:path'
import os from 'node:os'
import { ROOT, NL, ctx, git, call } from './lib.mjs'
import { S } from './content.mjs'

const DEST = path.join(ROOT, 'site', 'src', 'data', 'examples')
const REPO = 'library'
const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))

function must(c, m) {
  if (!c) throw new Error('녹화 대조 실패 — ' + m)
}

// 녹화에서 기계마다 다른 값(절대경로 · 시각)을 걷는다. 커밋 해시는 남긴다 — 진짜라는 표시다.
function scrub(v) {
  const s = JSON.stringify(v)
  const root = JSON.stringify(path.join(ROOT, 'ops', 'out', 'site-demo')).slice(1, -1)
  return JSON.parse(s.split(root).join('<서버>'))
}

export async function record({ base, st, saveWork, out }) {
  await fs.mkdir(DEST, { recursive: true })
  const rec = (steps) => async (who, tool, args, extra = {}) => {
    const r = await call(base, REPO, st.tokens[who], tool, args)
    const step = { who, kind: 'call', tool, req: r.req, res: scrub(r.res), ...extra }
    steps.push(step)
    return r.res
  }
  const saveStep = (steps) => async (w, extra = {}, opt = {}) => {
    const r = await saveWork(st, REPO, w, opt)
    steps.push({ who: w.by, kind: 'call', tool: 'save', req: r.req, res: scrub(r.res), ...extra })
    return r.res
  }
  const fileOf = async (rel) => ({ path: rel, text: (await fs.readFile(path.join(out.repos, REPO, rel), 'utf8')).replace(/\r\n/g, NL) })
  const sectionFile = async (coord) => {
    const r = (await call(base, REPO, st.tokens.lead, 'section', { coord })).res
    return { path: `${r.doc} § ${coord}`, text: r.body }
  }
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
    must(JSON.stringify(m).includes('화면설계서:LN030'), 'match 가 LN030 을 못 냈다')
    await R('dev.a', 'where', { coord: '화면설계서:LN030' }, { note: '그 좌표의 상태가 어느 문서 어느 섹션에 있고, 마지막으로 누가 무엇으로 반영했는지.' })
    await R('dev.a', 'section', { coord: '화면설계서:LN030' }, { note: '문서 전체가 아니라 **그 섹션만** 읽는다. 에이전트의 문맥에 들어가는 것은 이만큼이다.' })
    await R('dev.a', 'work', { id: '2026-0512-연체이력-분리' }, { note: '「왜 저장하지 않고 계산하나」 는 섹션이 아니라 작업 기록에 있다. 섹션의 좌표가 그 기록으로 이어진다.' })
    await write(1, 'find', {
      title: '이름으로 좌표를 찾는다',
      summary: '말 한마디에서 정본 좌표 → 그 섹션 → 그렇게 정한 까닭까지 네 걸음.',
      ask: '연체 현황 화면에 무엇을 보여 주기로 했지? 연체일수는 왜 저장하지 않고 그때그때 계산해?',
      steps,
      files: [await sectionFile('화면설계서:LN030'), await fileOf('work/2026-0512-연체이력-분리.md')],
    })
  }

  // ② 작업하고 기록한다 ─────────────────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const SV = saveStep(steps)
    await R('dev.a', 'where', { coord: '이슈:LIB-ISS-01' }, { note: '이슈가 걸린 좌표를 먼저 본다 — 무엇을 같이 고쳐야 하는지가 여기서 나온다.' })
    await R('dev.a', 'section', { coord: '도메인용어:연체일수' }, { note: '고칠 섹션을 읽는다. 응답의 `applied` 를 기억해 두었다가 save 에 그대로 보낸다.' })
    const w = {
      by: 'dev.a',
      id: '2026-0922-연체일수-기준-확정',
      title: '연체일수 기준 확정 — 반납예정일 다음날부터',
      date: '2026-09-22 14:30',
      touches: ['도메인용어:연체일수', '프로그램사양서:LN020', '이슈:LIB-ISS-01'],
      tags: ['연체', '이슈'],
      body: `운영 부서 답이 왔다 — **반납예정일 다음날부터 센다.** 당일 반납은 연체가 아니다.

반납 화면(0일)과 연체 안내 배치(1일)가 달랐던 것을 이 기준 하나로 맞춘다. 배치는 이미 다음날부터 세고 있어
고칠 것이 없다. 이슈를 닫는다.`,
      secs: {
        '도메인용어:연체일수': [S.ov2, '다음날부터 센다'],
        '프로그램사양서:LN020': [S.ln020p2, '연체일수 기준'],
        '이슈:LIB-ISS-01': [S.iss2, '완료'],
      },
    }
    const r = await SV(w, { note: '작업 기록 하나 + 고친 섹션 셋 + (있으면) 새 어휘를 **한 번에** 보낸다. 서버가 검사하고 한 커밋으로 남긴다. author 는 보내지 않는다 — 토큰이 정한다.' })
    must(r.commit, 'save ② 실패 ' + JSON.stringify(r).slice(0, 300))
    const after = await R('dev.a', 'where', { coord: '도메인용어:연체일수' }, { note: '섹션의 `applied` 가 방금 기록으로 바뀌었다. 다음 사람이 이 좌표를 읽으면 이 기록부터 본다.' })
    must(JSON.stringify(after).includes(w.id), 'applied 가 안 바뀌었다')
    await write(2, 'save', {
      title: '작업하고 기록한다',
      summary: '작업 기록과 정본 섹션 갱신이 한 커밋이다. 섹션마다 어느 기록까지 실었는지가 따라온다.',
      ask: '이슈 LIB-ISS-01 답이 왔어 — 반납예정일 다음날부터 센대. 반영하고 기록해 줘.',
      steps,
      files: [await fileOf(`work/${w.id}.md`), await sectionFile('도메인용어:연체일수')],
    })
  }

  // ③ 갱신 누락은 커밋되지 않는다 ───────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const SV = saveStep(steps)
    const w = {
      by: 'dev.a',
      id: '2026-0923-반납예정일-휴관일',
      title: '반납예정일이 휴관일이면 다음 개관일로',
      date: '2026-09-23 10:15',
      touches: ['도메인용어:반납예정일', '프로그램사양서:LN010'],
      tags: ['대출'],
      body: `반납예정일이 휴관일에 걸리면 회원이 반납할 수 없는데 다음날부터 연체가 된다. 다음 개관일로 민다.`,
      secs: {
        '도메인용어:반납예정일': [S.due2, '휴관일이면 다음 개관일'],
        '프로그램사양서:LN010': [S.ln010p2, '반납예정일 계산'],
      },
    }
    const bad = await SV(w, { note: '섹션을 빼고 기록만 보내 본다 — 좌표를 건드렸다고 적었는데 그 정본은 그대로다.' }, { withSections: false })
    must(bad.error?.code === 'E_CHECK', '③ 이 E_CHECK 가 아니다: ' + JSON.stringify(bad).slice(0, 300))
    // 로컬형 — 같은 계산을 git 훅이 한다. 복사본에 같은 기록 파일을 두고 ctx check 를 부른다.
    const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-site-'))
    try {
      await git(tmp, 'clone', '-q', path.join(out.repos, REPO), 'r').catch(() => null)
      const lr = path.join(tmp, 'r')
      const fm = ['---', `id: ${w.id}`, `title: ${w.title}`, `date: ${w.date}`, 'author: dev.a', 'touches:', ...w.touches.map((c) => '  - ' + c), 'tags: [대출]', '---', '', w.body, ''].join(NL)
      await fs.writeFile(path.join(lr, 'work', w.id + '.md'), fm)
      await ctx('index', '--repo', lr)
      const c = await ctx('check', '--repo', lr).catch((e) => e)
      must(c.code === 1, '로컬 ctx check 가 exit 1 이 아니다')
      steps.push({
        who: 'dev.a',
        kind: 'cli',
        cmd: 'bin/ctx check      # 로컬형 — git pre-commit 훅이 부르는 것과 같다',
        out: (String(c.stdout || '') + String(c.stderr || '')).replace(/\r\n/g, NL).split(lr).join('.').trim(),
        exit: c.code,
        note: '**로컬형**에서는 서버가 없다. 같은 계산을 git pre-commit 훅이 한다 — 답도 같다.',
      })
    } finally {
      await fs.rm(tmp, { recursive: true, force: true })
    }
    const ok = await SV(w, { note: '두 섹션을 채워 다시 보낸다. 이번에는 통과한다.' })
    must(ok.commit, '③ 두 번째 save 실패 ' + JSON.stringify(ok).slice(0, 300))
    await write(3, 'blocked', {
      title: '갱신 누락은 커밋되지 않는다',
      summary: '「문서는 나중에」 가 없다. 좌표를 건드린 기록은 그 섹션을 채워야 들어간다 — 그래서 밀린 문서가 없다.',
      ask: '반납예정일이 휴관일이면 다음 개관일로 밀어 줘. 기록도.',
      steps,
      files: [await fileOf(`work/${w.id}.md`), await sectionFile('도메인용어:반납예정일')],
    })
  }

  // ④ 같은 섹션을 둘이 고친다 ───────────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const SV = saveStep(steps)
    const a0 = await R('lead', 'section', { coord: '화면설계서:LN030' }, { note: 'lead 가 연체 현황 섹션을 읽는다.' })
    await R('dev.a', 'section', { coord: '화면설계서:LN030' }, { note: '같은 때 dev.a 도 같은 섹션을 읽는다. 둘이 받은 `applied` 가 같다.' })
    const wl = {
      by: 'lead',
      id: '2026-0924-연체현황-등급-필터',
      title: '연체 현황 — 회원등급으로 거른다',
      date: '2026-09-24 09:40',
      touches: ['화면설계서:LN030'],
      tags: ['화면'],
      body: `우수 회원은 안내 전화 대신 문자로 충분하다는 운영 의견. 목록을 회원등급으로 거를 수 있게 한다.`,
      secs: { '화면설계서:LN030': [S.ln030s2, '회원등급 조건'] },
    }
    const r1 = await SV(wl, { note: 'lead 가 먼저 저장한다. 통과.' })
    must(r1.commit, '④ lead save 실패')
    const wa = {
      by: 'dev.a',
      id: '2026-0924-연체현황-엑셀',
      title: '연체 현황 — 엑셀로 내려받기',
      date: '2026-09-24 09:55',
      touches: ['화면설계서:LN030'],
      tags: ['화면'],
      body: `대출 담당이 목록을 출력해 전화를 돌린다. 지금 목록 그대로 엑셀로 내려받는 버튼을 붙인다.`,
      secs: { '화면설계서:LN030': [S.ln030s1.replace('**버튼** — `조회`', '**버튼** — `조회` · `엑셀` — 지금 목록 그대로 내려받는다'), '엑셀 버튼'] },
    }
    const stale = { '화면설계서:LN030': a0.applied }
    const r2 = await SV(wa, { note: 'dev.a 가 **처음 읽은 applied** 로 보낸다. 그 사이 lead 가 바꿨으니 덮어쓰지 않고 거절한다 — 누가 무엇으로 바꿨는지와 지금 본문을 같이 준다.' }, { applied: stale })
    must(r2.error?.code === 'E_CONFLICT', '④ 가 E_CONFLICT 가 아니다: ' + JSON.stringify(r2).slice(0, 300))
    wa.secs['화면설계서:LN030'] = [S.ln030s3, '엑셀 버튼']
    const r3 = await SV(wa, { note: '거절에 실려 온 지금 본문 위에 엑셀 버튼을 얹고, `applied` 에 current 를 넣어 다시 보낸다. 둘 다 남는다.' })
    must(r3.commit, '④ 다시 보낸 save 실패 ' + JSON.stringify(r3).slice(0, 300))
    await write(4, 'conflict', {
      title: '같은 섹션을 둘이 고친다',
      summary: '저장은 줄을 서고, 같은 섹션을 먼저 누가 바꿨으면 조용히 덮지 않고 거절한다. 다시 만들 재료를 같이 준다.',
      ask: '(lead) 연체 현황에 회원등급 조건을 넣자. · (dev.a) 연체 현황에 엑셀 내려받기를 붙여 줘.',
      steps,
      files: [await sectionFile('화면설계서:LN030')],
    })
  }

  // ⑤ 잘못 적은 것을 정정한다 ──────────────────────────────────────────────
  {
    const steps = []
    const R = rec(steps)
    const SV = saveStep(steps)
    await R('lead', 'work', { id: '2026-0821-우수회원-한도-상향' }, { note: '틀린 기록을 읽는다. **작업 기록은 고치지 않는다** — 그때 그렇게 적었다는 것도 사실이다.' })
    const w = {
      by: 'lead',
      id: '2026-0925-우수회원-한도-정정',
      title: '우수 회원 한도 정정 — 10권이 아니라 8권',
      date: '2026-09-25 16:00',
      supersedes: '2026-0821-우수회원-한도-상향',
      touches: ['코드정의서:LN02', '요구사항:LIB-SFR-02'],
      tags: ['정정', '한도'],
      body: `8월 기록에 우수 회원 한도를 10권으로 적었는데, 운영위원회 회의록(8/20)은 **8권**이다. 옮겨 적다 틀렸다.
정본 섹션을 8권으로 바로잡고, 옛 기록은 이 기록이 대신한다(supersedes).`,
      secs: {
        '코드정의서:LN02': [S.ln02b.replace('| 한도 10권 |', '| 한도 8권 |'), '우수 한도 10 → 8권(정정)'],
        '요구사항:LIB-SFR-02': [S.sfr02b.replace('우수 등급 한도를 올리기로', '우수 등급 한도를 8권으로 올리기로'), '8권으로 정정'],
      },
    }
    const r = await SV(w, { note: '정정도 사건이다. 새 기록에 `supersedes` 를 달고, 정본 섹션은 평소처럼 고친다.' })
    must(r.commit, '⑤ save 실패 ' + JSON.stringify(r).slice(0, 300))
    await R('lead', 'where', { coord: '코드정의서:LN02' }, { note: '좌표의 이력에 두 기록이 다 남는다. 지금 상태는 정정 기록까지 실은 것이다.' })
    await write(5, 'supersede', {
      title: '잘못 적은 것을 정정한다',
      summary: 'work/ 는 지우지도 고치지도 않는다. 틀린 기록은 그것을 대신하는 새 기록으로 바로잡는다.',
      ask: '8월 우수 회원 한도 기록이 틀렸어 — 회의록을 보니 10권이 아니라 8권이야.',
      steps,
      files: [await fileOf(`work/${w.id}.md`), await sectionFile('코드정의서:LN02')],
    })
  }

  await fs.writeFile(path.join(out.data, '..', 'state.json'), JSON.stringify(st, null, 2))
  console.log('[site:demo] 녹화 ' + written.join(' · '))
}
