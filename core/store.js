// core 의 조립부 — 스캔 · 어휘 · 유효성 · 최신성 · 검색 · 감시를 하나로 묶는다.
// HTTP 를 모른다 (설계서 §8). 이벤트는 콜백으로만 내보낸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import chokidar from 'chokidar'
import { IGNORED_DIRS } from './scan.js'
import { loadRepo, repoStatus, unregisteredCoords } from './repo.js'
import * as git from './git.js'
import { reconcile } from './vocab.js'
import { buildBacklinks, cmpDateDesc } from './validity.js'
import { buildIndex, fullText } from './search.js'
import { runBuiltinCheck } from './check.js'

export class Store {
  constructor({ root, settings = {}, onEvent = () => {}, hostWarning = false }) {
    this.root = root
    this.settings = settings
    this.hostWarning = hostWarning
    this.onEvent = onEvent
    this.cache = new Map()
    this.docs = []
    this.bodies = new Map()
    this.vocab = { types: [], coords: new Map(), aliasIndex: new Map(), errors: [] }
    this.stats = null
    this.watcher = null
    this.watchAlive = false
    this._pending = null
  }

  // 레포 경로 교체 — 화면에서 경로를 지정하면 이 경로로 들어온다(§26.1).
  //
  // appState 의 repoPath 만 바꾸면 스캔은 원래 폴더를 계속 본다. 경로를 넣어도
  // 문서가 0건으로 남던 원인이 그것이었다. 캐시는 경로 단위이므로 함께 버린다.
  async setRoot(next) {
    if (!next || next === this.root) return this.repoInfo()
    await this.stopWatch()
    this.root = next
    this.cache.clear()
    this.docs = []
    this.bodies = new Map()
    await this.load()
    await this.startWatch() // ready 를 기다린 뒤 응답해야 화면이 맞는다
    return this.repoInfo()
  }

  async load({ onProgress } = {}) {
    const t0 = Date.now()
    // 계산은 core/repo.js 하나가 한다. 앱과 `bin/ctx` 가 같은 숫자를 말해야
    // 하고, 여기서 따로 계산하면 그 순간부터 둘이 갈라진다.
    const r = await loadRepo(this.root, { cache: this.cache, settings: this.settings, onProgress })
    Object.assign(this, r)
    this.units = this.works // v0.2 호출부 호환
    this.stats = r.stats

    // 검색 색인과 백링크는 앱에만 필요하다 (CLI 는 한 번 읽고 끝난다)
    this.mini = buildIndex(this.docs, this.bodies)
    this.backlinks = buildBacklinks(this.works, this.bodies)

    // git 상태는 검사에도 쓰이므로 로드 때 한 번 읽는다. fetch 는 하지 않는다 --
    // load() 는 파일 감시로도 불리고, 그때마다 네트워크를 치면 안 된다.
    this._git = await git.status(this.root).catch(() => ({ repo: false }))

    this.stats.ms = Date.now() - t0
    return this.stats
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
    if (fetch) await git.fetch(this.root).catch(() => {})
    const st = await git.status(this.root).catch(() => ({ repo: false }))
    return { ...st, unpushed: git.unpushedWarning(st) }
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
  managedList() {
    return this.managedDocs
      .map((d) => {
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
        }
      })
      .sort((a, b) => b.sections - a.sections || a.name.localeCompare(b.name))
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
    //   문서 안을 훑는 자리   "rp_plnd_chg_mst"  coordAt  → 좌표 열
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
      if (applied.length) groups.push({ label: '관리문서', items: byDoc(applied).sort(bySection) })
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
      if (rows.length) groups.push({ label: '관리문서', items: byDoc(rows).sort(bySection) })
      const list = this.coords.byCoord.get(key) || []
      if (list.length) groups.push({ label: '작업문서', items: list.map(work).sort(byDate) })
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
    }
  }

  // ── 감시 ────────────────────────────────────────────────────────────────
  // 최신화는 뷰어의 일이 아니다(§2.2 ④). 밖에서 git pull 한 것을 알아차리는 것이
  // 뷰어의 일이고, pull 을 안 하기 때문에 오히려 감시가 더 중요해진다(§2.3).
  // ready 를 기다릴 수 있게 프라미스를 돌려준다.
  //
  // chokidar 의 ready 는 비동기인데 응답을 먼저 보내면 watchAlive=false 가
  // 화면에 박히고, 뒤늦게 오는 SSE 는 그 사이 갱신에 덮인다. 실제로 경로를
  // 지정한 직후 "감시 끊김"이 뜨는 원인이었다.
  startWatch() {
    if (this.settings.watch === false) return Promise.resolve(false)
    return new Promise((resolve) => {
      let settled = false
      const done = (v) => {
        if (settled) return
        settled = true
        resolve(v)
      }
      // 대형 레포에서 ready 가 오래 걸릴 수 있다. 무한정 막지 않는다.
      const timer = setTimeout(() => done(false), 4000)
      timer.unref?.()

      try {
        this.watcher = chokidar.watch(this.root, {
          ignoreInitial: true,
          ignored: (p) =>
            path.basename(p).startsWith('.git') ||
            [...IGNORED_DIRS].some((d) => p.includes(`${path.sep}${d}${path.sep}`) || p.endsWith(`${path.sep}${d}`)),
          awaitWriteFinish: { stabilityThreshold: 120, pollInterval: 30 },
        })
        this.watcher
          .on('all', () => this.scheduleRescan())
          .on('ready', () => {
            clearTimeout(timer)
            this.watchAlive = true
            this.onEvent({ type: 'watch', alive: true })
            done(true)
          })
          .on('error', () => {
            clearTimeout(timer)
            this.watchAlive = false
            this.onEvent({ type: 'watch', alive: false })
            done(false)
          })
      } catch {
        clearTimeout(timer)
        this.watchAlive = false
        done(false)
      }
    })
  }

  // git pull 이나 브랜치 전환은 수십~수백 이벤트를 쏟아낸다. 파일마다
  // 재계산하면 화면이 수십 번 깜빡인다. 조용해진 뒤 한 번 계산한다(§23.2).
  scheduleRescan() {
    clearTimeout(this._pending)
    this._pending = setTimeout(async () => {
      const before = new Map(this.docs.map((d) => [d.path, d.mtime]))
      await this.load()
      const changed = []
      const added = []
      for (const d of this.docs) {
        if (!before.has(d.path)) added.push(d.path)
        else if (before.get(d.path) !== d.mtime) changed.push(d.path)
      }
      const removed = [...before.keys()].filter((p) => !this.byPath.has(p))
      this.onEvent({ type: 'changed', changed, added, removed, stats: this.stats })
    }, 300)
  }

  async stopWatch() {
    clearTimeout(this._pending)
    if (this.watcher) {
      await this.watcher.close().catch(() => {})
      this.watcher = null
    }
    this.watchAlive = false
  }

  async stop() {
    await this.stopWatch()
  }

  // ── 조회 ────────────────────────────────────────────────────────────────

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
      // 판정하면 "screen:PSC043 후속 1건" 처럼 남의 좌표 후속을 이 좌표에
      // 붙여 보여준다 (수행 v1.0 §6.3).
      coordFlags: s
        .map((x) => ({ x, sec: this.sections.find((r) => r.coord === x.coord) }))
        .filter(({ x, sec }) => x.count > 0 || (sec && sec.state !== 'ok'))
        .map(({ x, sec }) => ({ coord: x.coord, later: x.count, sec: sec ? sec.state : null, secCount: sec ? sec.count : 0 })),
      unregistered: d.touches.filter((c) => this.vocab.coords.size && !this.vocab.coords.has(c)),
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
    for (const c of this.vocab.coords.values()) {
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
    const d = this.byId.get(idOrPath) || this.byPath.get(idOrPath)
    if (!d) return null
    const body = this.bodies.get(d.path) || ''
    const settled = this.coords.ofWork(d)

    return {
      ...this.summary(d),
      text: body.slice(d.bodyOffset),
      raw: body,
      headings: d.headings,
      managedSections: d.managedSections || null,
      // 관리 문서를 읽을 때 **섹션마다 상태가 보여야 한다.**
      //
      // 테이블정의서에 섹션이 32개인데 그중 어느 것이 밀렸는지 본문만 봐서는
      // 알 수 없다. `applied` 주석은 기계용 메타라 본문에 글자로 노출되면
      // 소음이고, 정작 그것이 말하는 것(밀렸나)은 계산해야 나온다.
      sectionStates:
        d.layer === 'managed'
          ? this.sections
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
              }))
          : null,
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

  // 검색 — 대조가 1차, 전문 검색이 폴백. 개수는 항상 함께 낸다(§13-②).
  search(query, { force = false } = {}) {
    const q = String(query || '').trim()
    const rec = reconcile(this.vocab, q)

    let coordHits = []
    if (rec) {
      const all = this.coords.byCoord.get(rec.coord) || []
      coordHits = all.map((d) => this.summary(d))
    }

    const needFullText = force || !rec || coordHits.length === 0
    const ftRaw = needFullText ? fullText(this.mini, q) : []
    const ft = ftRaw.map((r) => {
      const d = this.byPath.get(r.path)
      return d ? { ...this.summary(d), score: Math.round(r.score * 100) / 100 } : null
    }).filter(Boolean)

    const vocabLine = rec ? this.vocab.coords.get(rec.coord)?.line ?? null : null

    return {
      query: q,
      // 대조 결과를 항상 드러낸다 — 몰래 해주면 사용자는 정본을 영원히 모른다(§13-⑤)
      reconciled: rec ? { ...rec, vocabLine, label: this.vocab.coords.get(rec.coord)?.label || null } : null,
      coord: rec?.coord || null,
      // **정정된 문서를 검색에서 내리지 않는다** (정정_판정모델_v2 §3).
      // `supersedes` 는 판정이 아니라 참조다. 순서는 시간이 정한다.
      coordHits,
      coordHiddenSuperseded: [],
      coordTotal: coordHits.length,
      fullTextRan: needFullText,
      fullTextReason: !needFullText ? '좌표 결과가 있어 실행하지 않음' : rec ? '좌표 매칭 0건' : '정본 좌표로 정규화하지 못함',
      fullText: ft,
      idJump: /^\d{4}-\d{4}-[\w가-힣-]+$/.test(q) && this.byId.has(q) ? q : null,
    }
  }

  check() {
    return runBuiltinCheck({
      gitStatus: this._git || null,
      docs: this.docs,
      vocab: this.vocab,
      validity: this.validity,
      indexInfo: this.indexInfo,
      managedIndex: this.managedIndex,
      sections: this.sections,
      bodies: this.bodies,
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
        watchAlive: false,
        watchEnabled: this.settings.watch !== false,
        hostWarning: this.hostWarning,
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
      coords: this.vocab.coords.size,
      vocabTypes: this.vocab.types.length,
      // 미결·제안은 상태가 아니라 이관 대상이다 (정정_판정모델_v2 §2)
      legacyPending: this.units.filter((d) => d.status === '미결' || d.status === '제안').length,
      unregistered: this.tree().unregistered.length,
      pendingDerive: this.status().pendingDerive.length,
      parseErrors: errors,
      checkCounts: counts,
      watchAlive: this.watchAlive,
      watchEnabled: this.settings.watch !== false,
      // loopback 이 아닌 주소에 리스너를 열었으면 화면에 상시 경고를 띄운다(§7.2)
      hostWarning: this.hostWarning,
      scannedAt: this.stats?.scannedAt || null,
      scanMs: this.stats?.ms ?? null,
      indexInfo: this.indexInfo,
      loaded: true,
    }
  }
}
