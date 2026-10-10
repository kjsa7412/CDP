// 다음 할 일 — 지금 상태에서 이 사람이 할 일 한 줄씩. 제품화 2 검토 §5.5 · TODO ②.
//
// **계산은 여기 한 곳이다**(I1). 화면의 「시작하기」 카드 · `ctx up` · `repo new` · 설치기의 끝 출력 · MCP `brief` 첫 줄이
// 같은 함수를 부른다 — 두 곳에서 따로 판단하면 화면은 「다 됐다」 는데 CLI 는 「등록하라」 는 일이 생긴다.
//
// 규칙 —
//   · **끝난 줄은 내지 않는다.** 다 끝나면 빈 배열이고, 화면은 카드를 그리지 않는다(불변조건 7 — 빈 상태는 다음 할 일)
//   · **권한 밖 줄은 내지 않는다**(D4) — viewer 에게 「등록하라」 를 말하지 않는다
//   · 줄 하나 = 사실(fact) 한 문장 + 할 일 하나(go — 화면 주소 · cmd — 설치기 인자 · copy — 에이전트 지시) + 설명서 주제(help)
//   · 순서는 막힌 것부터 — 레포 → 관리 문서 → 작업 레포 → 큐레이터 폴더 → 낡음 → 대기 → 어긋남 → 토큰 만료
//
// 입력은 서버가 모은 사실뿐이다(계산값 · I8). 여기서는 파일 · 네트워크를 만지지 않는다.

// 설명서 주제 — 책 id 와 그 절의 제목을 맞히는 식. 서버가 설명서의 h2 · h3 에서 앵커를 찾아 `/manual/<책>#<앵커>` 로 낸다.
// 제목이 바뀌어 못 찾으면 책 첫머리로 — 손으로 장 번호를 쓰지 않는다(안내 글 규칙 5).
export const HELP_TOPICS = {
  repo: { book: '관리자_설명서', heading: /지식 레포 세우기/ },
  people: { book: '관리자_설명서', heading: /사람/ },
  curator: { book: '관리자_설명서', heading: /큐레이터 맡기기/ },
  install: { book: '사용자_설명서', heading: /처음 한 번/ },
  workrepo: { book: '관리자_설명서', heading: /작업 레포/ },
  update: { book: '관리자_설명서', heading: /갱신/ },
  curatorFolder: { book: '큐레이터_설명서', heading: /큐레이터 폴더/ },
  forms: { book: '큐레이터_설명서', heading: /서식에서 새 문서/ },
  registry: { book: '큐레이터_설명서', heading: /등록부/ },
  queue: { book: '큐레이터_설명서', heading: /한 바퀴/ },
  drift: { book: '큐레이터_설명서', heading: /다시 세우기/ },
  token: { book: '사용자_설명서', heading: /막혔을 때/ },
}

// GitHub 규칙의 제목 앵커 — 화면 `viewer/src/lib/markdown.js` 의 slugify 와 같다(시험이 지킨다)
export const slugify = (s) =>
  String(s)
    .trim()
    .toLowerCase()
    .replace(/[^\w가-힣\s-]/g, '')
    .replace(/\s/g, '-')

// 설명서 본문들 → 주제마다 주소. `books` = [{ id, text }]
export function helpLinks(books) {
  const out = {}
  for (const [topic, t] of Object.entries(HELP_TOPICS)) {
    const b = books.find((x) => x.id === t.book)
    if (!b) continue
    const seen = new Map()
    let hit = null
    for (const line of String(b.text || '').split(/\r?\n/)) {
      const m = /^(##|###) (.+)$/.exec(line)
      if (!m) continue
      let slug = slugify(m[2])
      const n = seen.get(slug) || 0
      seen.set(slug, n + 1)
      if (n) slug = `${slug}-${n}`
      if (!hit && t.heading.test(m[2])) hit = slug
    }
    out[topic] = '/manual/' + encodeURIComponent(t.book) + (hit ? '#' + hit : '')
  }
  return out
}

// facts —
//   me        { admin, write, curate: bool(이 레포), tokenDays: n|null }
//   repos     볼 수 있는 지식 레포 수
//   repo      null | { name, docs: 관리 문서 수, queue: { n, oldestDays }, drift: 신호 합 }
//   work      null | { mine: 이 레포의 작업 레포 등록 수, stale: 낡음 수, unset: 미설치 수 }
//   curatorKit null | { installed: bool, stale: bool }   — 이 사람이 이 레포의 큐레이터 폴더를 받았나(서버가 본 것)
export function nextSteps({ me = {}, repos = 0, repo = null, work = null, curatorKit = null } = {}) {
  const steps = []
  const r = repo?.name || null
  const at = (sub) => (r ? `/r/${encodeURIComponent(r)}/${sub}` : null)

  if (me.admin && !repos) {
    steps.push({ id: 'repo-none', who: 'admin', fact: '지식 레포가 없다', go: { label: '새 레포', to: '/console/repos' }, help: 'repo' })
  }
  if (r && me.curate && repo.docs === 0) {
    steps.push({
      id: 'docs-none',
      who: 'curate',
      fact: '관리 문서가 없다 — 서식집에서 첫 문서를 고른다',
      go: { label: '서식집', to: at('manage/docs?add=forms') },
      help: 'forms',
    })
  }
  if (r && me.write && work && work.mine === 0) {
    steps.push({ id: 'work-none', who: 'write', fact: '코드 레포(작업 레포)가 아직 안 붙었다', go: { label: '연결하기', to: at('manage/work') }, help: 'install' })
  }
  if (r && me.curate && curatorKit && !curatorKit.installed) {
    steps.push({ id: 'curator-folder', who: 'curate', fact: '큐레이터 폴더가 없다 — 큐레이션은 그 폴더의 Claude Code 에서 한다', cmd: { args: `--curator --repo ${r} .` }, help: 'curatorFolder' })
  }
  const stale = (work?.stale || 0) + (curatorKit?.installed && curatorKit.stale ? 1 : 0)
  if (r && (me.write || me.curate) && stale > 0) {
    steps.push({ id: 'kit-stale', who: 'write', fact: `에이전트 세팅이 바뀌었다 · ${stale}곳`, cmd: { args: '--update' }, help: 'update' })
  }
  if (r && me.curate && repo.queue?.n > 0) {
    const d = repo.queue.oldestDays
    steps.push({
      id: 'queue',
      who: 'curate',
      fact: `대기 ${repo.queue.n}건${d != null ? ` · 가장 오래된 ${d}일` : ''}`,
      level: d != null && d > 14 ? 'warn' : 'info',
      go: { label: '대기열', to: at('manage/curation') },
      help: 'queue',
    })
  }
  if (r && me.curate && repo.drift > 0) {
    steps.push({ id: 'drift', who: 'curate', fact: `어긋남 ${repo.drift}`, go: { label: '진단', to: at('manage/drift') }, help: 'drift' })
  }
  if (me.tokenDays != null && me.tokenDays <= 14) {
    steps.push({ id: 'token', who: 'any', fact: `토큰 만료 ${me.tokenDays}일 남음 — 관리자에게 재발급을 받는다`, level: 'warn', help: 'token' })
  }
  return steps
}

// CLI 끝 출력 — 같은 줄을 글로. `installLine(args)` 는 부르는 쪽이 셸에 맞게 짓는다
export function stepsText(steps, { installLine = (a) => `node install.mjs ${a}`, origin = '' } = {}) {
  if (!steps.length) return []
  return steps.map((s, i) => {
    const how = s.cmd ? installLine(s.cmd.args) : s.go?.to ? `${origin}${s.go.to}` : ''
    return `  ${i + 1}. ${s.fact}${how ? NL_PAD + how : ''}`
  })
}
const NL_PAD = '\n     '
