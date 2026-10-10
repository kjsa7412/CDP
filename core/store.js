// core 의 조립부 — 스캔 · 어휘 · 유효성 · 최신성 · 검색을 하나로 묶는다. 서버(`ctx serve`)의 화면 API 가 쓴다.
// HTTP 를 모른다 (설계서 §8). 파일 감시는 없다 — 서버가 유일한 작성자라 save 가 끝나면 그때 다시 읽는다
// (로컬 뷰어의 chokidar 감시는 v1.0 에서 로컬 뷰어와 함께 걷었다).

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRepo, repoStatus, unregisteredCoords } from './repo.js'
import * as git from './git.js'
import { reconcile } from './vocab.js'
import { buildBacklinks, cmpDateDesc } from './validity.js'
import { buildIndex, fullText, prepQuery, matchName, bestName } from './search.js'
import { runBuiltinCheck } from './check.js'
import { visualRefs, visualTitle } from './visuals.js'
import { formIdOfText, driftOf } from './tools.js'
import { nfc } from './frontmatter.js'

// 검색이 한 갈래에 내는 최대 줄 수. 그 아래는 사람이 안 읽는다 — 개수는
// 언제나 전체를 말한다(§13-②).
const SEARCH_LIMIT = 40
// 좌표에서 문서를 끌고 올 때 쓰는 좌표 수. 한 글자 질의가 좌표 200개에 걸리면
// 그 200개의 작업을 전부 끌고 오게 된다
const SEARCH_SEEDS = 8
// 방금 fetch 했으면 이만큼은 다시 하지 않는다. 화면의 주기 fetch 는 5분이고,
// 사람이 누르는 동기화(`/sync`)는 이것을 거치지 않는다
const FETCH_FRESH_MS = 60_000

export class Store {
  constructor({ root, settings = {} }) {
    this.root = root
    this.settings = settings
    this.cache = new Map()
    this.docs = []
    this.bodies = new Map()
    this.visuals = new Map()
    this.vocab = { types: [], excludedTypes: [], coords: new Map(), counted: new Map(), aliasIndex: new Map(), errors: [] }
    this.stats = null
  }

  async load({ onProgress } = {}) {
    const t0 = Date.now()
    // 계산은 core/repo.js 하나가 한다. 앱과 `bin/ctx` 가 같은 숫자를 말해야
    // 하고, 여기서 따로 계산하면 그 순간부터 둘이 갈라진다.
    const r = await loadRepo(this.root, { cache: this.cache, settings: this.settings, onProgress })
    Object.assign(this, r)
    this.units = this.works // v0.2 호출부 호환
    this.stats = r.stats

    // 백링크는 앱에만 필요하다 (CLI 는 한 번 읽고 끝난다).
    //
    // **전문 색인은 여기서 짓지 않는다.** load() 는 파일이 하나 바뀔 때마다
    // 불리는데, 전문 검색은 이름에서 못 찾았을 때만 도는 폴백이다. 매번 지으면
    // 그동안 이벤트 루프가 멈추고 화면의 모든 요청이 기다린다 — 쓸 때 짓는다.
    this._mini = null
    this.backlinks = buildBacklinks(this.works, this.bodies)
    this.visuals = await this.collectVisuals()

    // git 상태는 검사에도 쓰이므로 로드 때 한 번 읽는다. fetch 는 하지 않는다 --
    // load() 는 파일 감시로도 불리고, 그때마다 네트워크를 치면 안 된다.
    this._git = await git.status(this.root).catch(() => ({ repo: false }))

    this.stats.ms = Date.now() - t0
    return this.stats
  }

  // HTML 시각 자료 — 문서마다 가리키는 `.html` 과 그 이름(`<title>`). HTML 시각 자료 검토 V1 · V2.
  //
  // 이름은 **서버가** 읽는다 — 화면의 틀은 불투명 출처(sandbox)라 안을 들여다볼 수 없다. 파일마다 앞 64 KB 만
  // 읽고, 같은 파일을 여러 문서가 가리켜도 한 번만 읽는다. 없는 파일은 뺀다(본문의 깨진 링크는 링크 그대로 남는다)
  async collectVisuals() {
    const out = new Map()
    const titles = new Map()
    const head = async (rel) => {
      if (titles.has(rel)) return titles.get(rel)
      let t
      try {
        const fh = await fs.open(path.join(this.root, rel), 'r')
        try {
          const buf = Buffer.alloc(64 * 1024)
          const { bytesRead } = await fh.read(buf, 0, buf.length, 0)
          t = visualTitle(rel, buf.subarray(0, bytesRead).toString('utf8'))
        } finally {
          await fh.close()
        }
      } catch {
        t = null
      }
      titles.set(rel, t)
      return t
    }
    for (const d of this.docs) {
      const body = (this.bodies.get(d.path) || '').slice(d.bodyOffset || 0)
      if (!/\.html?/i.test(body) && !(d.attachments || []).some((a) => /\.html?$/i.test(a))) continue
      const list = []
      for (const rel of visualRefs(d.path, body, d.attachments || [])) {
        const title = await head(rel)
        if (title) list.push({ path: rel, title })
      }
      if (list.length) out.set(d.path, list)
    }
    return out
  }

  // 현황 — 화면과 `ctx brief` 가 같은 것을 쓴다
  status() {
    return repoStatus(this)
  }

  // git — 작업환경 v1.1 §10.
  //
  // **fetch 는 자동, pull 은 명시적 클릭에만.** pull 은 작업 트리를 바꾸므로
  // 조용히 하면 사용자가 편집 중인 파일과 충돌한다. 앱 시작과 주기적으로는
  // fetch 만 하고, 차이를 보여주고 사람이 누른다.
  async gitStatus({ fetch = false } = {}) {
    if (fetch) await this.fetchOnce()
    const st = await git.status(this.root).catch(() => ({ repo: false }))
    return { ...st, unpushed: git.unpushedWarning(st) }
  }

  // fetch 는 **한 번에 하나만**, 그리고 방금 했으면 다시 하지 않는다.
  //
  // 화면은 창에 포커스가 올 때마다 fetch 를 청한다. 원격이 안 닿으면 한 번에
  // 21초(TCP 연결 제한)가 걸리는데, 그동안 창을 몇 번 오가면 git 프로세스가
  // 겹겹이 뜨고 요청마다 브라우저 연결을 하나씩 물고 있었다 — 연결은 호스트당
  // 여섯 개뿐이고 하나는 SSE 가 쓴다. 다 차면 문서 하나 여는 요청도 줄을 선다.
  //
  // 돌고 있으면 **기다리지 않는다.** 로컬 상태만 돌려주고, fetch 결과는 먼저
  // 청한 쪽이 받는다.
  fetchOnce() {
    if (this._fetching) return null
    if (Date.now() - (this._fetchedAt || 0) < FETCH_FRESH_MS) return null
    this._fetching = git
      .fetch(this.root)
      .catch(() => {})
      .finally(() => {
        this._fetching = null
        this._fetchedAt = Date.now()
      })
    return this._fetching
  }

  async gitPull() {
    const r = await git.pullFfOnly(this.root)
    if (r.ok && r.skipped !== 'up-to-date') await this.load()
    return r
  }

  async gitPush() {
    return git.push(this.root)
  }

  // 관리 문서 목록 — 대상 뷰의 첫 화면이 쓴다.
  //
  // 여기까지 없으면 `docs/` 를 **좌표를 거쳐야만** 볼 수 있다. 그런데
  // "테이블정의서를 처음부터 훑고 싶다" 는 정당한 요구이고, 특히 아직 좌표가
  // 붙지 않은 섹션은 좌표 경로로 도달할 수가 없다.
  // **경로순으로 세운다.** 전에는 섹션 수 내림차순이 1순위였는데 둘이 틀렸다.
  //
  // 하나 — **문서를 고칠 때마다 목록의 순서가 바뀐다.** 섹션을 하나 더 쓰면
  // 그 문서가 위로 올라간다. 위치로 기억하는 사람에게는 매번 다른 목록이다.
  //
  // 둘 — 경로는 사람이 정한 것이고 섹션 수는 우연이다. 관리문서 패키지는
  // 폴더와 파일명을 **일하는 순서**로 짜 두는데(`docs/1.관리/BM_111_…`),
  // 섹션 수로 정렬하면 그 순서가 통째로 무시된다. 실측 -- dpms 패키지를 부으면
  // 46종 중 4종이 앞으로 튀고 9종이 뒤로 밀렸다.
  // **`localeCompare` 를 쓰지 않는다.** 로케일마다 답이 다르다 -- `ko` 에서는
  // 한글이 영문보다 앞이라 `DB도메인용어정의서` 가 `회의록` 뒤로 간다. 탐색기는
  // 반대(숫자 → 영문 → 한글)이고, 무엇보다 **기계마다 목록 순서가 달라진다.**
  // 코드포인트 비교는 어디서나 같고 탐색기와 같으며, 한글 음절은 U+AC00 부터
  // 사전 순으로 배열돼 있어 한글끼리도 제대로 선다.
  managedList() {
    return this.managedDocs
      .map((d) => this.managedRow(d))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
  }

  // 관리 문서 한 줄. **목록과 검색이 같은 줄을 쓴다** — 같은 문서가 두 화면에서
  // 다른 숫자를 말하면 어느 쪽이 맞는지 알 방법이 없다.
  managedRow(d) {
    const secs = (d.managedSections || []).filter((x) => x.hasAppliedComment || x.level === 2)
    const rows = this.sections.filter((r) => r.doc === d.path)
    const bad = rows.filter((r) => r.state === 'stale' || r.state === 'orphan')
    const none = rows.filter((r) => r.state === 'unwritten' || r.state === 'empty')
    return {
      path: d.path,
      title: d.title,
      name: d.path.replace(/^docs\//, '').replace(/\.md$/, ''),
      sections: secs.length,
      written: secs.filter((x) => x.applied).length,
      stale: bad.length,
      unwritten: none.length,
      size: d.size,
      hasVisual: this.visuals.has(d.path),
    }
  }

  // ── 뻗어나가기 — 한 노드의 **다음 레벨** ──────────────────────────────
  //
  // 화면 왼쪽 아래가 이것만 쓴다. 위에서 시작점을 고르고, 여기서 한 단계씩
  // 뻗는다. **전체 그래프를 펴지 않는다** — 고른 노드의 다음 레벨 하나만.
  //
  // 트리가 아니라 그래프다. 같은 노드가 여러 레벨에 다시 나올 수 있고
  // (A → 좌표 → A), 그것을 막지 않는다. 막으면 "이 좌표를 이 작업이 또
  // 건드렸다"는 사실이 화면에서 사라진다.
  //
  // 노드는 셋뿐이다 — 작업 기록 · 좌표(= 섹션) · 관리 문서. 셋 다 열 수 있는
  // 것이라 어느 노드에서 멈춰도 오른쪽에 문서가 뜬다. 좌표는 문서를 **그 섹션
  // 자리에서** 연다.
  nextNodes(kind, key) {
    // 같은 것을 부르는 두 이름 — **좌표 = 섹션.**
    //
    // 등록부가 좌표 하나를 섹션 하나로 보낸다. 그래서 섹션은 좌표의 다른
    // 이름일 뿐이고, 노드를 따로 두지 않는다. 부르는 이름만 자리에 따라 바뀐다 —
    //
    //   좌표를 아는 자리     "테이블정의서"      docItem  → 관리 문서 열
    //   문서 안을 훑는 자리   "pj_plan_chg_mst"  coordAt  → 좌표 열
    //
    // **줄의 이름이 곧 다음 열이다.** 문서 이름을 단 줄이 섹션 열을 열면 누른
    // 것과 열린 것이 다르고, 섹션 이름을 단 줄이 또 섹션 열을 열면 같은 것을
    // 한 번 더 눌러야 좌표가 나온다 — 둘 다 헛클릭이다.
    const docName = (r) => r.doc.replace(/^docs\//, '').replace(/\.md$/, '')
    const anchor = (r) => (r.anchor || '').replace(/^#+\s*/, '') || r.coord
    // 문서를 앞으로 — 좌표를 이미 아는 자리에서 쓴다.
    //
    // 한 작업이 **같은 문서의 섹션 여럿**에 실리기도 한다(실측 2건 —
    // 테이블정의서 3섹션). 가는 곳이 문서 하나이므로 줄도 하나로 접고,
    // 몇 섹션인지는 숫자로 말한다.
    //
    // `at` — 문서를 열 때 **그 섹션 자리로** 간다. 여럿이면 **가장 앞선
    // 섹션**으로 간다.
    //
    // 전에는 여럿이면 문서 첫머리에 두었다 — 어느 섹션인지 이 줄이 하나로
    // 답할 수 없다는 이유였다. 그러나 첫머리는 다른 답이 아니라 **답을 버린
    // 것**이다. 파생된 섹션이 둘이든 셋이든 그중 어느 것도 문서 첫머리에는
    // 없고, 10개 섹션을 눈으로 훑는 일은 그대로 남는다. 가장 앞선 것으로
    // 보내면 적어도 파생된 자리에서 시작하고, 나머지는 거기서 아래로 순서대로
    // 나온다 — `sub` 가 이름으로 미리 말해 둔 그 순서 그대로다.
    const docItem = (unordered) => {
      // **문서에 나오는 순서로 세운다.** `this.sections` 는 상태 급한 순이라,
      // 그대로 두면 `sub` 가 목차 순서가 아니고 `at` 이 가리키는 곳이 거기
      // 적힌 첫 이름과 어긋나는 일이 생긴다.
      const rows = [...unordered].sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
      return {
        kind: 'managed',
        key: rows[0].doc,
        label: docName(rows[0]),
        sub: rows.map(anchor).join(' · '),
        // 섹션 순서 — 정렬 키. 이 문서에서 가장 앞선 섹션의 줄 번호
        line: rows[0].line ?? Infinity,
        n: rows.length,
        open: rows[0].doc,
        at: anchor(rows[0]),
      }
    }
    const byDoc = (rows) => {
      const m = new Map()
      for (const r of rows) {
        if (!m.has(r.doc)) m.set(r.doc, [])
        m.get(r.doc).push(r)
      }
      return [...m.values()].map(docItem)
    }
    const work = (d) => ({
      kind: 'work',
      key: d.id,
      label: d.title,
      sub: d.date,
      date: d.date,
      open: d.id,
    })
    const coordNode = (c) => {
      const v = this.vocab.coords.get(c)
      return {
        kind: 'coord',
        key: c,
        label: c,
        sub: v?.label || null,
        open: null,
        n: (this.coords.byCoord.get(c) || []).length,
      }
    }
    // 문서 안에서 본 좌표 — 섹션 이름을 앞으로.
    //
    // `table:` 접두어를 18번 반복하지 않는다. 여기서는 그것이 맥락이다 —
    // 테이블정의서의 섹션은 전부 table: 이다.
    //
    // 그리고 이 줄은 **문서를 그 섹션 자리에서 연다**(open + at). 좌표만
    // 열고 문서는 첫머리에 두면, 32개 섹션 중 어느 것인지 눈으로 찾게 된다 —
    // 등록부로 자리를 특정해 놓은 값이 거기서 사라진다.
    const coordAt = (r) => ({ ...coordNode(r.coord), label: anchor(r), line: r.line, open: r.doc, at: anchor(r) })

    // ── 정렬 ────────────────────────────────────────────────────────────
    //
    // 목록마다 규칙이 다르다. **찾는 방법이 다르기 때문이다** —
    //
    //   좌표       카테고리순 + 카테고리 안 이름순.  좌표는 `type:value` 이고
    //              타입이 카테고리다. 카테고리 순서는 `_vocab.md` 의 선언
    //              순서 — 팀이 어휘를 적은 순서가 곧 팀이 정한 순서다
    //   작업 문서  작성일자순 (최신 먼저)
    //   관리 문서  섹션 순서
    //   섹션       섹션 순서 — 문서에 나오는 순서 그대로. 목차이기 때문이다
    //
    // 상태로 정렬하지 않는다. 상태 급한 순으로 내면 목록이 아니라 할 일
    // 목록이 되고, **같은 것을 두 번 봐도 자리가 달라진다.**
    const ko = (a, b) => String(a || '').localeCompare(String(b || ''), 'ko')
    const rank = (c) => {
      const i = this.vocab.types.indexOf(String(c).split(':')[0])
      return i < 0 ? this.vocab.types.length : i
    }
    // 좌표 — 카테고리(타입)순 + 카테고리 안 이름순
    const byCoord = (a, b) => rank(a.key) - rank(b.key) || ko(a.label, b.label)
    // 작업 문서 — 작성일자순 (최신 먼저)
    const byDate = (a, b) => String(b.date || '').localeCompare(String(a.date || '')) || ko(a.label, b.label)
    // 관리 문서 · 섹션 — 섹션 순서(문서에 나오는 순서)
    const bySection = (a, b) => (a.line ?? Infinity) - (b.line ?? Infinity) || ko(a.label, b.label)

    // 그룹 이름은 **무엇이 들어 있는지**만 말한다.
    //
    // "이 작업이 바꾼 좌표"처럼 관계를 문장으로 쓰면, 어느 열에 있는지 이미
    // 아는 사실을 매번 다시 읽게 된다. 열 머리에 시작점이 있으니 관계는
    // 자리가 말한다 — 줄은 **종류**만 말하면 된다.
    if (kind === 'work') {
      const d = this.byId.get(key)
      if (!d) return null
      const applied = this.sections.filter((r) => r.applied === d.id)
      const groups = []
      // 정정 관계(`supersedes`)는 **작업문서에서 작업문서로** 가는 유일한 길이다.
      // 둘 다 작업문서라 종류만으로는 갈리지 않으므로 여기만 방향을 말한다.
      // 드물고, 있으면 먼저 봐야 한다 — 옛 기록을 연 사람에게 지금 맞는 말은
      // 새 기록 쪽에 있다. 대상이 없는 선언은 문서 머리가 적색으로 말한다.
      const olds = d.supersedes.map((s) => this.byId.get(s.id)).filter(Boolean)
      const news = this.correctors(d.id).map((c) => c.doc)
      if (news.length) groups.push({ label: '이 기록을 정정한', items: news.map(work).sort(byDate) })
      if (olds.length) groups.push({ label: '이 기록이 정정한', items: olds.map(work).sort(byDate) })
      if (applied.length) groups.push({ label: '관리 문서', items: byDoc(applied).sort(bySection) })
      groups.push({ label: '좌표', items: d.touches.map(coordNode).sort(byCoord) })
      return { node: work(d), groups }
    }

    if (kind === 'coord') {
      const rows = this.sections.filter((x) => x.coord === key)
      const groups = []
      // **`applied` 를 따로 세우지 않는다.**
      //
      // 섹션에 실린 작업도 결국 이 좌표를 바꾼 작업 중 하나다. 그것만 떼어
      // 위에 올리면 같은 목록이 둘로 갈라지고, 읽는 사람은 "이 둘이 왜
      // 다른가"를 먼저 풀어야 한다. 한 줄로 둔다.
      //
      // 등록부에 없는 좌표는 결함이 아니다 — 관리 문서는 **자주 쓰는 내용**을
      // 모아 둔 것이고 모든 것이 거기 녹지는 않는다. 그때는 그 지식공유문서가
      // 원천이다 (수행 v1.0 §3.2).
      if (rows.length) groups.push({ label: '관리 문서', items: byDoc(rows).sort(bySection) })
      const list = this.coords.byCoord.get(key) || []
      if (list.length) groups.push({ label: '작업 기록', items: list.map(work).sort(byDate) })
      return { node: coordNode(key), groups }
    }

    // `section` 노드는 없다 — **좌표가 그것이다.** 섹션 열을 따로 두면 좌표 열과
    // key 가 같은 열이 하나 더 생기고(같은 것을 두 번 누른다), 옆 섹션 목록은
    // 문서 열을 그 안에 복사하게 된다. 문서 열의 줄이 곧바로 좌표 열을 연다.

    if (kind === 'managed') {
      const rows = this.sections.filter((x) => x.doc === key)
      if (!rows.length) return null
      // this.sections 는 상태 급한 순이다. 그대로 내면 **목차가 아니라 할 일
      // 목록이 된다** — 문서에 나오는 순서로 다시 세운다.
      return {
        node: { kind: 'managed', key, label: key.replace(/^docs\//, '').replace(/\.md$/, ''), sub: null, open: key },
        groups: [{ label: '섹션', items: rows.map(coordAt).sort(bySection) }],
      }
    }
    return null
  }

  // 좌표 하나의 전모 — 지금 상태(섹션) + 왜(작업 기록). cdp-load 가 쓰는 모양.
  coordDetail(coord) {
    const hit = this.managedIndex.find(coord)
    const section = this.sections.find((r) => r.coord === coord) || null
    const works = (this.coords.byCoord.get(coord) || []).map((d) => ({
      id: d.id,
      title: d.title,
      date: d.date,
      author: d.author,
      status: d.status,
      path: d.path,
      later: this.coords.later(d, coord).count,
    }))
    const v = this.vocab.coords.get(coord) || null

    // **섹션 본문을 실어 보낸다.** 이것이 v0.3 의 핵심이다.
    //
    // 좌표를 찾은 사람이 원하는 것은 "그 좌표가 어느 문서 몇째 줄에 있다"가
    // 아니라 **지금 어떤 상태인가**다. 문서를 열어 32개 테이블 중에서 그 섹션을
    // 찾게 만들면, 등록부로 자리를 특정해 놓은 값이 사라진다.
    let sectionText = null
    if (section && !section.docMissing && section.line != null && section.end != null) {
      const body = this.bodies.get(section.doc)
      if (body) {
        const lines = body.split('\n')
        // 제목 줄과 applied 주석은 화면이 따로 그린다 -- 본문만 준다
        let from = section.line + 1
        while (from < section.end && (lines[from].includes('<!--') || !lines[from].trim())) from++
        sectionText = lines.slice(from, section.end).join('\n').trim()
      }
    }

    return {
      coord,
      registered: !!v,
      label: v?.label || null,
      aliases: v?.aliases || [],
      deprecated: v?.deprecated || null,
      supersededBy: v?.supersededBy || null,
      managed: hit ? { doc: hit.doc, level: hit.level, whole: hit.whole } : null,
      section,
      sectionText,
      works,
      // 섹션 상태와 미반영 기록(v1.0 I7) — 섹션만 보고 지금이라 믿지 않게
      curation: this.curation ? { state: this.curation.stateOf(coord, section), pending: this.curation.pendingOf(coord) } : null,
    }
  }

  // ── 조회 ────────────────────────────────────────────────────────────────

  // 이 기록을 정정한 새 기록 — 전체 정정 먼저, 범위 정정(scope) 뒤. `supersedes` 의 역방향
  correctors(id) {
    const v = this.validity.of(id)
    return [...v.correctedBy.map((by) => ({ by, scope: null })), ...v.partialBy]
      .map(({ by, scope }) => ({ doc: this.byId.get(by), scope }))
      .filter((c) => c.doc)
  }

  // 목록용 요약. 유효성·최신성은 항상 실려 나간다 — 그것이 이 뷰어의 판단 장치다.
  summary(d) {
    const v = this.validity.of(d.id)
    const s = this.coords.ofWork(d).filter((x) => !x.excluded)
    return {
      id: d.id,
      fileId: d.fileId,
      path: d.path,
      title: d.title,
      date: d.date,
      author: d.author,
      status: d.status,
      touches: d.touches,
      tags: d.tags,
      attachments: d.attachments,
      hasVisual: this.visuals.has(d.path),
      isUnit: d.isUnit,
      layer: d.layer,
      bodyThin: !!d.bodyThin,
      bodyChars: d.bodyChars,
      hasFrontmatter: d.hasFrontmatter,
      errors: d.errors,
      validity: v,
      settledCoords: s.filter((x) => x.count > 0).length,
      // 좌표별 플래그 — **문제가 있는 좌표만** 싣는다. 없으면 정상이라는 뜻이다.
      // 목록이 좌표 뷰에서 그 좌표만 보고 판정할 수 있어야 한다: 문서 단위로
      // 판정하면 "screen:HRC043 후속 1건" 처럼 남의 좌표 후속을 이 좌표에
      // 붙여 보여준다 (수행 v1.0 §6.3).
      coordFlags: s
        .map((x) => ({ x, sec: this.sections.find((r) => r.coord === x.coord) }))
        .filter(({ x, sec }) => x.count > 0 || (sec && sec.state !== 'ok'))
        .map(({ x, sec }) => ({ coord: x.coord, later: x.count, sec: sec ? sec.state : null, secCount: sec ? sec.count : 0 })),
      unregistered: d.touches.filter((c) => this.vocab.coords.size && !this.vocab.coords.has(c)),
      // 큐레이션 상태 — 목록의 칩(대기 · 반영됨 · 기록으로 둠)이 이것 하나로 그린다(v1.0 TODO §1.3)
      curation: d.layer === 'work' && this.curation ? (({ state }) => ({ state }))(this.curation.statusOf(d.id) || { state: null }) : null,
    }
  }

  listUnits() {
    return this.units.map((d) => this.summary(d))
  }

  // 좌표 트리 — 미등재 섹션은 0건이어도 남긴다(§21.1 · §13-③).
  tree() {
    const counts = new Map()
    for (const d of this.units) for (const c of d.touches) counts.set(c, (counts.get(c) || 0) + 1)

    const types = new Map()
    for (const c of this.vocab.counted.values()) {
      if (!types.has(c.type)) types.set(c.type, [])
      // 좌표별 섹션 상태를 함께 싣는다.
      //
      // 본문을 읽다 좌표를 만났을 때 **그 좌표가 밀렸는지**가 보여야 한다.
      // v0.2 는 좌표를 링크로만 만들었는데, 링크는 "여기 좌표가 있다" 까지고
      // "그 좌표의 상태가 낡았다" 는 말하지 않는다.
      const sec = this.sections.find((r) => r.coord === c.coord)
      types.get(c.type).push({
        coord: c.coord,
        label: c.label,
        aliases: c.aliases,
        sec: sec && sec.state !== 'ok' ? sec.state : null,
        secCount: sec ? sec.count : 0,
        count: counts.get(c.coord) || 0,
        deprecated: c.deprecated,
        supersededBy: c.supersededBy,
        deprecatedNote: c.deprecatedNote,
      })
    }

    const unregistered = []
    for (const [c, n] of counts) {
      if (this.vocab.coords.size && !this.vocab.coords.has(c)) {
        unregistered.push({ coord: c, count: n, docs: this.units.filter((d) => d.touches.includes(c)).map((d) => d.id) })
      }
    }

    return {
      types: [...types.entries()].map(([type, coords]) => ({
        type,
        total: coords.reduce((a, b) => a + b.count, 0),
        coords: coords.sort((a, b) => b.count - a.count || a.coord.localeCompare(b.coord)),
      })),
      unregistered: unregistered.sort((a, b) => b.count - a.count),
      vocabPresent: this.vocab.coords.size > 0,
      vocabErrors: this.vocab.errors,
    }
  }

  // 문서 상세 — 원문 텍스트를 그대로 보낸다. 렌더는 클라이언트가 한다(§9).
  detail(idOrPath) {
    const d = this.byId.get(nfc(idOrPath)) || this.byPath.get(idOrPath)
    if (!d) return null
    const body = this.bodies.get(d.path) || ''
    const settled = this.coords.ofWork(d)

    return {
      ...this.summary(d),
      text: body.slice(d.bodyOffset),
      raw: body,
      headings: d.headings,
      // HTML 시각 자료 — 화면의 「본문 | 자료」 탭 줄(V1 · V2)
      visuals: this.visuals.get(d.path) || [],
      managedSections: d.managedSections || null,
      // 관리 문서를 읽을 때 **섹션마다 상태가 보여야 한다.**
      //
      // 테이블정의서에 섹션이 32개인데 그중 어느 것이 밀렸는지 본문만 봐서는
      // 알 수 없다. `applied` 주석은 기계용 메타라 본문에 글자로 노출되면
      // 소음이고, 정작 그것이 말하는 것(밀렸나)은 계산해야 나온다.
      sectionStates:
        d.layer === 'managed'
          ? this.sectionsWithDrift(d.path)
              .filter((r) => r.doc === d.path)
              .map((r) => ({
                value: r.anchor ? r.anchor.replace(/^#+\s*/, '') : '',
                coord: r.coord,
                state: r.state,
                count: r.count,
                applied: r.applied,
                // 관계 패널이 쓴다 — 섹션이 어느 작업에서 왔고(applied),
                // 아직 못 실은 후속이 무엇인가(missing). 관리 문서 화면의
                // 관계 패널은 **섹션 목록 + 출처**가 본체다 (검토결과 §B-2).
                line: r.line ?? null,
                appliedTitle: r.applied ? this.byId.get(r.applied)?.title || null : null,
                appliedDate: r.applied ? this.byId.get(r.applied)?.date || null : null,
                missing: (r.items || []).map((x) => ({ id: x.id, title: x.title, date: x.date })),
                // v1.0 — 섹션 상태 셋(ok · pending · missing)과 미반영 기록(발췌 포함). 화면의 「미반영 n」 칩이 이것을 그린다
                cstate: this.curation ? this.curation.stateOf(r.coord, r) : null,
                pending: this.curation ? this.curation.pendingOf(r.coord) : [],
                // 어긋남(리빌딩 검토 §5.1) — 화면은 큐레이터에게만 칩으로 그린다. 신호가 없으면 null
                drift: r.drift || null,
              }))
          : null,
      // 관리 문서의 서식 표지(`<!-- cdp:form … -->`) — 화면이 칩으로 그린다
      form: d.layer === 'managed' ? formIdOfText(body) : null,
      // 작업 기록의 큐레이션 상태 — 대기 · 반영됨(into) · 기록으로 둠(reason)
      curation: d.layer === 'work' && this.curation ? this.curation.statusOf(d.id) : null,
      // **역참조 — 이 작업이 어느 관리 문서 섹션에 근거로 실렸나.**
      //
      // 사용자가 물은 "어떤 문서로 바뀌었고"가 정확히 이것이다. 계산은 이미
      // 다 있었는데 화면으로 나가는 길이 없었다: `sections` 는 섹션→작업
      // 방향만 들고 있고, 작업 쪽에서 되짚는 곳이 어디에도 없었다.
      //
      // 실측(C:\cdp) — 작업 31건 중 **21건만** 어느 섹션의 `applied` 로 지목된다.
      // 나머지 10건은 어느 관리 문서에도 근거로 실리지 않았다.
      appliedIn:
        d.layer === 'work'
          ? this.sections
              .filter((r) => r.applied === d.id)
              .map((r) => ({ coord: r.coord, doc: r.doc, anchor: r.anchor || null, state: r.state, count: r.count }))
          : null,
      unknownFields: d.unknownFields,
      source: d.source ?? null,
      touchesEmpty: d.touchesEmpty ?? null,
      // 좌표마다 따로 판정한다 — 문서 단위로 뭉치면 반드시 하나는 틀린다.
      // 그 좌표의 관리 문서 섹션 상태도 같이 싣는다: 이 문서를 근거로 쓰려는
      // 사람이 "지금 상태는 어디에 있나"를 한 화면에서 알아야 한다.
      coords: settled.map((r) => {
        const sec = this.sections.find((x) => x.coord === r.coord) || null
        return {
          coord: r.coord,
          excluded: r.excluded,
          total: r.total,
          laterCount: r.count,
          later: r.items,
          section: sec,
          // `mine` · `behind` 를 더 내지 않는다.
          //
          // 둘은 "이 섹션이 이 작업을 실었나 / 아직 안 실었나"였고, 뒤쪽이 곧
          // 밀림이다. 파생이 필수가 된 뒤로 안 실린 경우는 상태가 아니라
          // 오류이므로 화면에 실을 것이 없다. 아무도 읽지 않는 값이었다.
          registered: this.vocab.coords.size === 0 || this.vocab.coords.has(r.coord),
        }
      }),
      settled: settled.map((r) => ({ coord: r.coord, excluded: r.excluded, total: r.total, laterCount: r.count, later: r.items })),
      backlinks: this.backlinks(d.id).map((id) => {
        const o = this.byId.get(id)
        return o ? { id: o.id, title: o.title, date: o.date } : { id }
      }),
      supersedes: d.supersedes.map((s) => {
        const o = this.byId.get(s.id)
        return { id: s.id, scope: s.scope, exists: !!o, title: o?.title || null, date: o?.date || null }
      }),
      // 역방향 — 이 기록을 정정한 새 기록(범위 정정 포함). `validity` 는 id 만
      // 들고 있어 화면이 제목을 그릴 수 없었다
      correctedBy: this.correctors(d.id).map(({ doc: o, scope }) => ({ id: o.id, scope, title: o.title, date: o.date })),
      // 이어 읽기 — 이 문서의 좌표에서 바로 다음 문서(§27.8)
      nextInCoord: settled
        .filter((r) => !r.excluded && r.items.length)
        .map((r) => ({ coord: r.coord, next: r.items[r.items.length - 1] }))
        .slice(0, 3),
    }
  }

  // 좌표 타임라인 — 최신성을 숫자가 아니라 형태로(§18)
  timeline(coord) {
    const list = (this.coords.byCoord.get(coord) || []).map((d) => {
      const v = this.validity.of(d.id)
      return {
        id: d.id,
        title: d.title,
        date: d.date,
        status: d.status,
        state: v.state,
        supersededBy: v.supersededBy,
        supersedes: d.supersedes.map((s) => s.id),
      }
    })
    const entry = this.vocab.coords.get(coord)
    // 타임라인에 그 좌표의 관리 문서 섹션을 머리로 얹는다 — "지금 상태"가
    // 이력의 맨 위에 있어야 한다 (수행 v1.0 §6.1)
    const section = this.sections.find((x) => x.coord === coord) || null
    return { coord, section, label: entry?.label || null, deprecated: entry?.deprecated || null, supersededBy: entry?.supersededBy || null, docs: list }
  }

  // ── 검색 — **이름으로 걸고, 객체 셋으로 낸다** ────────────────────────
  //
  //   거는 곳   관리문서명 · 작업문서명 · 좌표명 · 좌표 alias
  //   나오는 것 관리문서 · 작업문서 · 좌표
  //
  // 왼쪽 목록(Finder)이 다루는 객체가 셋인데 검색만 `좌표 문서 / 전문 검색`
  // 이라는 다른 갈래로 답하면, 같은 레포를 **두 가지 이름 체계**로 보게 된다.
  // 전에는 그랬다 — 관리문서는 갈래가 없어 전문 검색에 섞여 나왔고, 좌표
  // 자체는 결과에 아예 없었다(좌표에 걸린 **작업문서**만 나왔다).
  //
  // **걸린 좌표는 문서를 끌고 온다.** `계획서마스터` 를 찾은 사람은 그 좌표를
  // 건드린 작업과 그 좌표가 실린 관리문서를 보려는 것이다. 그래서 세 갈래는
  // 서로 독립이 아니다 —
  //
  //   좌표가 걸린다 → 그 좌표를 건드린 작업문서 · 그 좌표가 실린 관리문서
  //
  // 이름에서 아무것도 못 찾았을 때만 **본문 전문 검색**이 돈다(⇧⏎ 로 강제).
  // 그 결과도 같은 세 갈래에 접힌다 — 갈래는 *어디서 걸렸나*가 아니라
  // *무엇인가*로 정한다. 왜 걸렸는지는 줄마다 `why` 가 말한다(§13-⑤).
  search(query, { force = false } = {}) {
    const q = String(query || '').trim()
    const rec = reconcile(this.vocab, q)
    const pq = prepQuery(q)
    const vocabLine = rec ? this.vocab.coords.get(rec.coord)?.line ?? null : null
    const head = {
      query: q,
      // 대조 결과를 항상 드러낸다 — 몰래 해주면 사용자는 정본을 영원히 모른다(§13-⑤)
      reconciled: rec ? { ...rec, vocabLine, label: this.vocab.coords.get(rec.coord)?.label || null } : null,
      coord: rec?.coord || null,
      idJump: /^\d{4}-\d{4}-[\w가-힣-]+$/.test(q) && this.byId.has(q) ? q : null,
    }
    if (!q) {
      return { ...head, managed: [], works: [], coords: [], counts: { managed: 0, work: 0, coord: 0 }, fullTextRan: false }
    }

    // ① 좌표 — 정본 · 값 · alias · 설명. 넷 중 가장 잘 맞은 자리 하나를 남긴다
    const coordRows = []
    for (const c of this.vocab.coords.values()) {
      const value = c.coord.slice(c.coord.indexOf(':') + 1)
      const m = bestName(
        [
          [c.coord, '좌표'],
          [value, '좌표'],
          ...c.aliases.map((a) => [a, 'alias']),
          [c.label, '설명'],
        ],
        pq
      )
      // 대조가 집은 좌표는 이름이 안 걸려도 들어간다 — "사업계획 테이블 관련
      // 최근 변경" 처럼 질의 **안에** alias 가 섞인 경우가 그것이다
      if (!m && c.coord !== rec?.coord) continue
      const sec = this.sections.find((r) => r.coord === c.coord) || null
      coordRows.push({
        coord: c.coord,
        type: c.type,
        label: c.label || null,
        value,
        count: (this.coords.byCoord.get(c.coord) || []).length,
        sec: sec && sec.state !== 'ok' ? sec.state : null,
        doc: sec?.doc || null,
        deprecated: c.deprecated || null,
        supersededBy: c.supersededBy || null,
        // 왜 걸렸나 — alias 로 걸렸으면 **그 alias 를 그대로 보여준다**
        why: m ? m.via : '대조',
        matched: m ? m.text : rec?.aliasText || q,
        score: (m?.score ?? 100) + (c.coord === rec?.coord ? 1000 : 0),
      })
    }
    coordRows.sort((a, b) => b.score - a.score || b.count - a.count || a.coord.localeCompare(b.coord))

    // ② 작업문서 — 제목이 먼저, 걸린 좌표를 건드린 것이 다음.
    //
    // `rank` 로 층을 가른다. 점수를 섞으면 "제목이 정확히 같은 것"과 "좌표가
    // 걸려서 딸려온 것"이 한 줄기로 뒤엉켜, 이름을 정확히 친 사람의 결과가
    // 딸려온 20건 밑으로 내려간다.
    const works = new Map() // id → row
    const putWork = (d, rank, score, why) => {
      const cur = works.get(d.id)
      if (cur && (cur.rank < rank || (cur.rank === rank && cur.score >= score))) return
      works.set(d.id, { d, rank, score, why })
    }
    for (const d of this.works) {
      const m = matchName(d.title, pq)
      if (m) putWork(d, 0, m.score, '제목')
    }
    // 좌표에서 딸려오는 것은 **상위 좌표 몇 개**만 본다. 한 글자 질의가 좌표
    // 200개에 걸리면 그 200개의 작업을 전부 끌고 오게 된다
    const seeds = coordRows.slice(0, SEARCH_SEEDS)
    for (const c of seeds) {
      for (const d of this.coords.byCoord.get(c.coord) || []) putWork(d, 1, c.score, `좌표 ${c.coord}`)
    }

    // ③ 관리문서 — 문서명(= 파일명)과 제목. 그리고 걸린 좌표가 실린 문서.
    const managed = new Map() // path → row
    const putManaged = (d, rank, score, why, at = null) => {
      const cur = managed.get(d.path)
      if (cur && (cur.rank < rank || (cur.rank === rank && cur.score >= score))) return
      managed.set(d.path, { d, rank, score, why, at: cur?.at ?? at })
    }
    for (const d of this.managedDocs) {
      const name = d.path.replace(/^docs\//, '').replace(/\.md$/, '')
      const m = bestName([[name, '문서명'], [d.title, '제목']], pq)
      if (m) putManaged(d, 0, m.score, m.via)
    }
    for (const c of seeds) {
      // 같은 문서의 섹션 여럿이 걸리면 **문서에 나오는 순서로 가장 앞선 것**을
      // 연다 — 뻗어나가기(`nextNodes`)가 같은 규칙을 쓴다
      const rows = this.sections
        .filter((r) => r.coord === c.coord && r.doc)
        .sort((a, b) => (a.line ?? Infinity) - (b.line ?? Infinity))
      for (const r of rows) {
        const d = this.byPath.get(r.doc)
        if (!d) continue
        putManaged(d, 1, c.score, `좌표 ${c.coord}`, (r.anchor || '').replace(/^#+\s*/, '') || r.coord)
        break
      }
    }

    // ④ 본문 — **이름에서 아무것도 못 찾았을 때만.** 결과는 위 세 갈래로 접힌다
    const named = coordRows.length + works.size + managed.size
    const needFullText = force || named === 0
    if (needFullText) {
      this._mini ||= buildIndex(this.docs, this.bodies)
      for (const r of fullText(this._mini, q)) {
        const d = this.byPath.get(r.path)
        if (!d) continue
        const score = Math.round(r.score * 100) / 100
        if (d.layer === 'work' && d.hasFrontmatter) putWork(d, 2, score, '본문')
        else if (d.layer === 'managed') putManaged(d, 2, score, '본문')
        // 그 밖(README · MANUAL · _vocab)은 **객체 셋에 없다.** 여기서 갈래를
        // 하나 더 만들면 화면이 다루는 객체가 검색에서만 넷이 된다
      }
    }

    const workRows = [...works.values()]
      .sort((a, b) => a.rank - b.rank || b.score - a.score || cmpDateDesc(a.d, b.d))
      .slice(0, SEARCH_LIMIT)
      .map(({ d, why, rank, score }) => ({ ...this.summary(d), why, rank, score }))

    const managedRows = [...managed.values()]
      .sort((a, b) => a.rank - b.rank || b.score - a.score || a.d.path.localeCompare(b.d.path))
      .slice(0, SEARCH_LIMIT)
      .map(({ d, why, rank, score, at }) => ({ ...this.managedRow(d), why, rank, score, at }))

    return {
      ...head,
      // **정정된 문서를 검색에서 내리지 않는다** (정정_판정모델_v2 §3).
      // `supersedes` 는 판정이 아니라 참조다. 순서는 시간이 정한다.
      managed: managedRows,
      works: workRows,
      coords: coordRows.slice(0, SEARCH_LIMIT),
      counts: { managed: managed.size, work: works.size, coord: coordRows.length },
      // 본문까지 갔나 — 화면은 이것으로 "이름에서 찾았습니다" 와 "본문까지
      // 찾았습니다" 를 가른다. 둘은 믿을 수 있는 정도가 다르다
      fullTextRan: needFullText,
    }
  }

  check() {
    return runBuiltinCheck({
      // 서버형(`settings.server`)은 git 훅을 보지 않는다 — save 가 같은 계산으로 커밋 전에 막는다. 전에는 서버 트리에
      // hooksPath 가 없다고 「커밋 검사가 돌지 않습니다」 를 내서 검사가 꺼진 것처럼 보였다(실서버 종합 시험 F7)
      gitStatus: this.settings.server ? null : this._git || null,
      docs: this.docs,
      vocab: this.vocab,
      validity: this.validity,
      indexInfo: this.indexInfo,
      managedIndex: this.managedIndex,
      sections: this.sections,
      bodies: this.bodies,
      curation: this.curation,
      vocabText: this.vocabText ?? null,
      managedText: this.managedText ?? null,
    })
  }

  // 이 문서의 섹션 행 + 어긋남 신호(같은 `driftOf` — 화면 「진단」 · MCP `drift` 와 한 계산 · I1)
  sectionsWithDrift(docPath) {
    const rows = this.sections.filter((r) => r.doc === docPath)
    let by = null
    try {
      by = new Map(driftOf(this).sections.map((x) => [x.coord, x]))
    } catch {
      by = new Map()
    }
    return rows.map((r) => {
      const x = by.get(r.coord)
      if (!x) return r
      return { ...r, drift: { unsourced: x.unsourced, linked: x.linked || null, duplicated: x.duplicated.length, pairs: x.duplicated.slice(0, 10), oversize: x.oversize, diary: x.diary } }
    })
  }

  repoInfo() {
    // 아직 load() 전이면 빈 상태를 돌려준다. 여기서 예외가 나면 화면이 통째로
    // 못 뜨고, 클라이언트는 그것을 "레포 미지정"으로 오해한다.
    if (!this.units) {
      return {
        root: this.root,
        docs: 0,
        files: 0,
        coords: 0,
        vocabTypes: 0,
        pending: 0,
        unregistered: 0,
        parseErrors: 0,
        checkCounts: { error: 0, warn: 0, info: 0 },
        scannedAt: null,
        scanMs: null,
        indexInfo: { exists: false },
        loaded: false,
      }
    }
    const errors = this.docs.filter((d) => d.errors.length).length
    const chk = this.check()
    const counts = { error: 0, warn: 0, info: 0 }
    for (const f of chk.findings) counts[f.sev] += f.items.length
    return {
      root: this.root,
      docs: this.units.length,
      files: this.docs.length,
      coords: this.vocab.counted.size,
      vocabTypes: this.vocab.types.length,
      // 미결·제안은 상태가 아니라 이관 대상이다 (정정_판정모델_v2 §2)
      legacyPending: this.units.filter((d) => d.status === '미결' || d.status === '제안').length,
      unregistered: this.tree().unregistered.length,
      pendingDerive: this.status().pendingDerive.length,
      // 큐레이션 — 메뉴 배지 · 현황 카드의 재료(v1.0 TODO §1.3). `/me` 에 싣지 않는다(레포마다 스캔을 깨운다)
      curation: this.curation ? this.curation.stats : null,
      parseErrors: errors,
      checkCounts: counts,
      scannedAt: this.stats?.scannedAt || null,
      scanMs: this.stats?.ms ?? null,
      indexInfo: this.indexInfo,
      loaded: true,
    }
  }
}
