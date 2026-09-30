// 등록부와 관리 문서 — 수행 v1.0 §4 · §6.2.
//
// 두 가지를 읽는다.
//   _managed.md   좌표 패턴 → (관리 문서, 섹션 앵커).  **매핑이 선언되는 유일한 곳**
//   docs/*.md     관리 문서. 섹션이 1급 단위이고 섹션마다 applied 주석이 붙는다
//
// 왜 등록부가 한 곳이어야 하는가 — 매핑이 두 곳에 있으면 반드시 어긋나고,
// 어긋난 순간 어느 쪽이 맞는지 판단할 근거가 없다. 그래서 파서도 하나다.

const BS = String.fromCharCode(92)
const RE_SPECIAL = '.+?^${}()|[]' + BS

const coordValue = (coord) => coord.slice(coord.indexOf(':') + 1)

function escapeLiteral(s) {
  let out = ''
  for (const ch of s) out += RE_SPECIAL.includes(ch) ? BS + ch : ch
  return out
}

// `screen:RS*` → /^screen:RS.*$/   `table:*` → /^table:.*$/
// glob 의 * 만 지원한다. 정규식을 그대로 허용하면 등록부가 읽기 어려워지고,
// 등록부는 사람이 읽고 고치는 표다.
function patternToRegex(pat) {
  return new RegExp('^' + pat.split('*').map(escapeLiteral).join('.*') + '$')
}

// 코드펜스 안의 제목·표는 예시다. 설계 문서와 등록부 모두 펜스 안에 마크다운을
// 넣으므로 펜스를 세지 않으면 예시가 실제 규칙으로 잡힌다.
export function* outsideFences(lines) {
  let fence = null
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0].repeat(3)
      else if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fence) continue
    yield [i, line]
  }
}

// | `table:*` | `docs/테이블정의서.md` | `## {값}` |
export function parseRegistry(text) {
  const rules = []
  const errors = []
  if (!text) return { rules, errors, present: false }

  for (const [i, line] of outsideFences(text.split('\n'))) {
    if (!/^\s*\|/.test(line)) continue
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue // 구분행

    const cells = line.split('|').slice(1, -1).map((c) => c.trim())
    if (cells.length < 3) continue

    const unquote = (s) => s.replace(/^`|`$/g, '').trim()
    const pattern = unquote(cells[0])
    const doc = unquote(cells[1])
    const sec = unquote(cells[2])

    if (!pattern.includes(':')) continue // 머리행("좌표 패턴")에는 콜론이 없다
    // **규칙 모양일 때만 규칙으로 읽는다.** 등록부 파일에는 설명 표도 있다 — dpms 의
    // "CDP 16종 등록부에서 바뀐 것" 처럼 첫 칸에 좌표 타입(`배치:`)을 적은 비교표.
    // 그 줄을 규칙으로 읽으면 "관리 문서 경로가 .md 가 아님" 이 났다 — 문서가 틀린 게
    // 아니라 파서가 표를 가리지 못한 것이다(`ctx package check` 가 잡았다).
    // 둘째 칸이 경로 모양(`/` · `.md`)이거나 셋째 칸이 섹션 표기일 때만 규칙이다 —
    // 그래야 `docs/x.mdx` 같은 진짜 오타는 여전히 오류로 남는다.
    const ruleLike = /[\/]|\.md$/i.test(doc) || /^(?:#{1,6}\s*\{값\}|[—–-])$/.test(sec) || !sec
    if (!ruleLike) continue
    if (!doc || !/\.md$/i.test(doc)) {
      errors.push({ line: i + 1, message: `관리 문서 경로가 .md 가 아님: ${doc || '(빈칸)'}` })
      continue
    }

    // `## {값}` → h2 아래, `—` → 문서 전체가 그 좌표의 상태
    const whole = !sec || /^[—–-]$/.test(sec)
    const h = sec.match(/^(#{1,6})\s*\{값\}/)
    if (!whole && !h) {
      errors.push({ line: i + 1, message: `섹션 형식을 읽을 수 없음: ${sec}   (\`## {값}\` 또는 \`—\`)` })
      continue
    }

    rules.push({
      pattern,
      re: patternToRegex(pattern),
      doc,
      level: whole ? 0 : h[1].length,
      whole,
      note: cells[3] ? cells[3].trim() : '',
      line: i + 1,
    })
  }
  return { rules, errors, present: rules.length > 0 }
}

// 위에서부터 먼저 걸리는 규칙. `screen:RSB010` 은 `screen:RS*` 에 걸리고
// `screen:*` 까지 내려가지 않는다.
export function resolveCoord(registry, coord) {
  if (!registry || !registry.rules.length) return null
  for (const r of registry.rules) {
    if (r.re.test(coord)) {
      return { doc: r.doc, level: r.level, whole: r.whole, value: coordValue(coord), pattern: r.pattern }
    }
  }
  return null
}

// 관리 문서를 섹션으로 분해한다.
//
//   ## pj_plan_mst — 계획서마스터
//   <!-- applied: 2026-0821-계획서-상태값추가 -->
//
// applied 가 null 이거나 없으면 **아직 정리되지 않은 섹션**이다. 빈 섹션을
// 감추지 않는다 — 없는 것과 안 쓴 것은 다르고, 후자는 쓸 사람이 있다.
export function parseManagedSections(text) {
  const lines = text.split('\n')
  const found = []

  for (const [i, line] of outsideFences(lines)) {
    const h = line.match(/^(#{1,6})\s+(.+?)\s*$/)
    if (!h) continue
    const title = h[2].trim()
    found.push({
      level: h[1].length,
      title,
      // "pj_plan_mst — 계획서마스터" → 값은 구분선 앞
      value: title.split(/\s+[—–-]\s+/)[0].trim(),
      line: i,
    })
  }

  for (let k = 0; k < found.length; k++) {
    const s = found[k]
    const next = found.slice(k + 1).find((o) => o.level <= s.level)
    s.end = next ? next.line : lines.length

    s.applied = null
    s.appliedLine = null
    for (let i = s.line + 1; i < Math.min(s.line + 4, s.end); i++) {
      // **다음 제목을 넘어가지 않는다.** 전에는 세 줄을 무조건 봤는데, `# 제목`
      // 바로 아래에 `## 첫 섹션` 이 오면 그 섹션의 applied 주석을 제목의 것으로
      // 읽었다 — 문서마다 섹션 수가 하나씩 부풀었다(단위 테스트에서 잡았다).
      if (/^#{1,6}\s/.test(lines[i])) break
      const m = lines[i].match(/<!--\s*applied\s*:\s*(.*?)\s*-->/i)
      if (m) {
        const v = m[1].trim()
        s.applied = v && v !== 'null' && v !== '-' ? v : null
        s.appliedLine = i
        break
      }
    }
    s.hasAppliedComment = s.appliedLine != null

    // 본문이 실질적으로 비었는가. applied 주석과 경고 인용은 내용이 아니다
    const body = lines
      .slice(s.line + 1, s.end)
      .filter((l) => !l.includes('<!--') && !/^\s*>/.test(l))
      .join('')
      .trim()
    s.empty = body.length === 0
  }

  return found
}

export function normValue(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_·-]/g, '')
}

// 등록부 + 관리 문서 → 좌표로 섹션을 찾는 색인.
export function buildManagedIndex(registry, managedDocs) {
  const byPath = new Map(managedDocs.map((d) => [d.path, d]))

  // 섹션을 **한 번에** 색인한다.
  //
  // 전에는 `find()` 가 좌표마다 그 문서의 전 섹션을 훑고 섹션마다 `normValue`
  // 를 다시 불렀다. 좌표 4,747 · 섹션 5,194 인 레포에서 2,460만 번이고
  // `ctx check` 가 **4.5초**였다 -- 훅이 커밋마다 그만큼 기다린다. 색인을
  // 여기서 한 번 만들면 **0.55초**다 (3회 중앙값. 출력은 바이트까지 같다).
  //
  // 그 0.55초도 대부분 Node 기동이다 -- 섹션 48개짜리 레포와 시간이 같다.
  //
  // **여기가 맞는 자리다.** `buildManagedIndex` 는 `loadRepo` 당 한 번 불린다.
  // `doc` 객체에 캐시를 붙이면 스캔이 그 객체를 재사용할 때 낡을 수 있다.
  // 문서마다 Map 하나. **구분자를 쓰지 않는다** -- 값에 무엇이 들어올지
  // 모르는데 구분자를 고르면 그 자리가 다음 결함이 된다.
  // 레벨은 `#{1,6}` 이라 **항상 한 글자**이므로 `레벨+값` 이 겹치지 않는다.
  const sections = new Map() // path -> Map(레벨+정규화값 -> 섹션)
  for (const d of managedDocs) {
    let m = sections.get(d.path)
    if (!m) sections.set(d.path, (m = new Map()))
    for (const s of d.managedSections || []) {
      const k = s.level + normValue(s.value)
      // **값이 같은 섹션이 둘이면 앞의 것을 쓴다** -- 훑던 때와 같은 규칙이다.
      // 뒤의 것은 도달할 수 없다. 원본 문서에 동명이의가 실제로 있다.
      if (!m.has(k)) m.set(k, s)
    }
  }

  return {
    registry,
    docs: managedDocs,

    // 좌표 → 어디에 그 좌표의 현재 상태가 적혀 있는가.
    //   null                       등록부에 없다 (module: · domain: — 정상)
    //   { docMissing: true }       등록부가 가리키는 문서가 없다 (오류)
    //   { section: null }          문서는 있는데 섹션이 없다 (오류 — 앵커 없음)
    //   { section: {...} }         찾았다
    find(coord) {
      const hit = resolveCoord(registry, coord)
      if (!hit) return null

      const doc = byPath.get(hit.doc)
      if (!doc) return { ...hit, docMissing: true, section: null }

      if (hit.whole) {
        // 문서 전체가 좌표의 상태 — applied 는 문서 첫 줄의 주석(`frontmatter.topApplied`).
        // 전에는 `null` 고정이라 한 번 건드린 좌표가 영원히 파생 누락이었다(동시 기록 검토 v0.1 M5).
        const applied = doc.appliedTop ?? null
        return {
          ...hit,
          docMissing: false,
          section: { level: 0, title: doc.title, value: hit.value, line: 0, end: 0, applied, hasAppliedComment: applied != null, empty: false, whole: true },
        }
      }

      const m = sections.get(hit.doc)
      const section = (m && m.get(hit.level + normValue(hit.value))) || null
      return { ...hit, docMissing: false, section }
    },

    // 등록부가 가리키는데 실제로 없는 것 — 앵커 없음. 커밋을 거부할 대상이다.
    danglingFor(coords) {
      const out = []
      for (const c of coords) {
        const hit = this.find(c)
        if (!hit) continue
        if (hit.docMissing) out.push({ coord: c, doc: hit.doc, reason: 'doc' })
        else if (!hit.section) out.push({ coord: c, doc: hit.doc, anchor: '#'.repeat(hit.level) + ' ' + hit.value, reason: 'anchor' })
      }
      return out
    },
  }
}

// ── 등록부를 서버가 쓴다 — 패턴 · 경로 · 겹침 · 행 글씨 (관리문서 동적 생성 검토 v0.1) ──────────────
//
// 여기 있는 것은 전부 **순수 함수**다 — 파일을 안 읽고 안 쓴다. `save`(`managedops.js`)가 새 행을 받기 전에
// 거르고, `check` 가 이미 있는 행을 같은 눈으로 본다(불변조건 1: 판정은 한 곳).

// 서버가 더한 행의 표식 — 4번째 칸(`note`). 패키지가 세운 행과 갈라 보는 유일한 자리이고, 패키지를 다시 붓는
// 기능이 생기면 이 표식이 붙은 행 · 그 문서는 레포의 것이라 덮지 않는다.
export const ADDED_NOTE = '서버 추가 · '

// 서버가 더한 행이면 그 작업 기록 id. 아니면 null
export function addedBy(rule) {
  const n = String(rule?.note || '')
  return n.startsWith(ADDED_NOTE) ? n.slice(ADDED_NOTE.length).trim() || null : null
}

// 글롭(`*` 만) 포함 — `outer` 가 `inner` 가 받는 좌표를 **전부** 받는가.
// `inner` 의 `*` 를 **어느 패턴에도 없는 글자 하나**로 바꿔 `outer` 의 정규식에 넣는다. 그 글자는 `outer` 의 글자가
// 아니므로 `outer` 의 `*` 가 삼켜야만 맞고, 삼킨 자리는 어떤 문자열로 바꿔도 그대로 맞는다 — 그래서 정확하다.
function freshChar(...strs) {
  for (let c = 0xe000; c < 0xf8ff; c++) {
    const ch = String.fromCharCode(c)
    if (!strs.some((x) => x.includes(ch))) return ch
  }
  return String.fromCharCode(0xf8ff)
}
export function globContains(outer, inner) {
  return patternToRegex(outer).test(inner.split('*').join(freshChar(outer, inner)))
}

// 글롭 교차 — 둘이 **함께 받는 좌표가 하나라도** 있는가(`t:a*` 와 `t:*b` 는 `t:ab`). 메모 재귀.
export function globIntersects(a, b) {
  const memo = new Map()
  const f = (i, j) => {
    const k = i + ',' + j
    if (memo.has(k)) return memo.get(k)
    const sa = i < a.length && a[i] === '*'
    const sb = j < b.length && b[j] === '*'
    let r = false
    if (i === a.length && j === b.length) r = true
    else if (sa && f(i + 1, j)) r = true // a 의 * 가 비어 있다
    else if (sb && f(i, j + 1)) r = true // b 의 * 가 비어 있다
    else if (sa && j < b.length && f(i, j + 1)) r = true // a 의 * 가 b[j] 를 삼킨다
    else if (sb && i < a.length && f(i + 1, j)) r = true // b 의 * 가 a[i] 를 삼킨다
    else if (!sa && !sb && i < a.length && j < b.length && a[i] === b[j]) r = f(i + 1, j + 1)
    memo.set(k, r)
    return r
  }
  return f(0, 0)
}

// 타입은 `core/tools.js` 의 RE_COORD 와 같은 문자 집합의 **구체적인** 타입이다 — `*:*` · `*` 타입은 표를 넘본다.
const RE_PATTERN_TYPE = /^(?:[a-z][a-z0-9_-]*|[가-힣][A-Za-z0-9가-힣_-]*)$/

// 패턴이 등록부 행으로 쓸 수 있는가 — 문제가 있으면 사유 한 줄, 없으면 null.
export function patternProblem(pattern) {
  if (typeof pattern !== 'string' || !pattern) return '패턴이 없다'
  const at = pattern.indexOf(':')
  if (at <= 0) return '패턴 형식이 아니다 (type:glob)'
  const type = pattern.slice(0, at)
  const value = pattern.slice(at + 1)
  if (!RE_PATTERN_TYPE.test(type)) return '타입은 구체적이어야 한다 (소문자 영문 · 숫자 · _ - 또는 한글로 시작) — 타입에는 *를 쓰지 않는다'
  if (!value || value.length > 200) return '값 부분은 1~200자다'
  // 공백 · `|` · 백틱은 표를 깬다. 사용자 영역 글자는 글롭 포함 검사가 쓴다
  if (/[\s\x00-\x1f|`-]/.test(value)) return '값 부분에 공백 · 제어문자 · | · 백틱을 쓸 수 없다'
  if (value.includes('..')) return '값 부분에 ..을 쓸 수 없다'
  return null
}

// 등록부가 가리키는 문서가 **레포 밖으로 나가는가** — 절대경로 · 드라이브 · `..` · 역슬래시.
// 기존 행에도 쓴다(손으로 고친 행) — `docs/` 안인지는 따지지 않는다(그것은 경고다).
export function docEscapes(rel) {
  const v = String(rel ?? '')
  if (!v || v.startsWith('/') || /^[A-Za-z]:/.test(v) || v.includes(BS) || /[\x00-\x1f]/.test(v)) return true
  return v.split('/').some((s) => s === '..' || s === '.')
}

const RESERVED = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(\..*)?$/i

// **새 관리 문서**의 경로 — `docs/…md` 만. 문제가 있으면 사유 한 줄.
export function docPathProblem(rel) {
  if (typeof rel !== 'string' || !rel) return '문서 경로가 없다'
  if (rel.length > 200) return '문서 경로는 200자 이하다'
  if (docEscapes(rel)) return '문서 경로가 레포 밖을 가리킨다 (절대경로 · .. · 역슬래시 · 제어문자)'
  if (/[:*?"<>|`]/.test(rel)) return '문서 경로에 쓸 수 없는 글자가 있다 (: * ? " < > | 백틱)'
  const segs = rel.split('/')
  if (segs[0] !== 'docs') return '관리 문서는 docs/ 아래에만 둔다'
  if (segs.length < 2 || segs.length > 5) return '문서 경로는 docs/ 아래 깊이 4 이하다'
  for (const s of segs) {
    if (!s) return '문서 경로에 빈 조각이 있다'
    if (s !== s.trim() || /[. ]$/.test(s)) return '문서 경로 조각 끝에 공백 · 점을 둘 수 없다'
    if (s.startsWith('.')) return '문서 경로 조각이 .으로 시작할 수 없다'
    if (s.length > 80) return '문서 경로 조각은 80자 이하다'
    if (RESERVED.test(s)) return `문서 경로에 예약 이름(${s})을 쓸 수 없다`
  }
  if (!/\.md$/i.test(rel)) return '관리 문서는 .md 다'
  return null
}

// 등록부 한 행의 글씨 — 섹션 칸은 `## {값}`(레벨) 또는 `—`(문서 전체). `note` 가 있으면 4번째 칸.
export function registryRow({ pattern, doc, level = 2, note = '' }) {
  const q = String.fromCharCode(96)
  const sec = level === 0 ? '—' : q + '#'.repeat(level) + ' {값}' + q
  return `| ${q}${pattern}${q} | ${q}${doc}${q} | ${sec} |` + (note ? ` ${String(note).replace(/[|]/g, '¦')} |` : '')
}

const lc = (s) => String(s).toLowerCase()

// 등록부 스스로의 결함 — `check` 가 이미 있는 레포를 보고 `save` 가 새 행을 받기 전에 본다.
//   escape    문서 경로가 레포 밖으로 나간다                     (error)
//   outside   문서가 docs/ 밖이다                                (warn)
//   shadowed  앞 행이 **완전히 덮는** 행 — 죽은 행, 좌표가 못 닿는다  (warn)
//   levelMix  한 문서에 앵커 레벨이 둘이다 — 섹션이 겹친다          (warn)
export function lintRegistry(rules) {
  const out = { escape: [], outside: [], shadowed: [], levelMix: [] }
  const list = rules || []
  for (const r of list) {
    if (docEscapes(r.doc)) out.escape.push({ pattern: r.pattern, doc: r.doc, line: r.line })
    else if (!r.doc.startsWith('docs/')) out.outside.push({ pattern: r.pattern, doc: r.doc, line: r.line })
  }
  for (let j = 1; j < list.length; j++) {
    const by = list.slice(0, j).find((r) => globContains(r.pattern, list[j].pattern))
    if (by) out.shadowed.push({ pattern: list[j].pattern, doc: list[j].doc, line: list[j].line, by: by.pattern, byLine: by.line })
  }
  const byDoc = new Map()
  for (const r of list) {
    const k = lc(r.doc)
    if (!byDoc.has(k)) byDoc.set(k, { doc: r.doc, levels: new Set() })
    byDoc.get(k).levels.add(r.level)
  }
  for (const d of byDoc.values()) {
    if (d.levels.size > 1) out.levelMix.push({ doc: d.doc, levels: [...d.levels].sort((a, b) => a - b) })
  }
  return out
}
