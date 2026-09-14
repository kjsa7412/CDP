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

// `screen:SE*` → /^screen:SE.*$/   `table:*` → /^table:.*$/
// glob 의 * 만 지원한다. 정규식을 그대로 허용하면 등록부가 읽기 어려워지고,
// 등록부는 사람이 읽고 고치는 표다.
function patternToRegex(pat) {
  return new RegExp('^' + pat.split('*').map(escapeLiteral).join('.*') + '$')
}

// 코드펜스 안의 제목·표는 예시다. 설계 문서와 등록부 모두 펜스 안에 마크다운을
// 넣으므로 펜스를 세지 않으면 예시가 실제 규칙으로 잡힌다.
function* outsideFences(lines) {
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

// 위에서부터 먼저 걸리는 규칙. `screen:SEB010` 은 `screen:SE*` 에 걸리고
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
//   ## rp_plnd_mst — 계획서마스터
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
      // "rp_plnd_mst — 계획서마스터" → 값은 구분선 앞
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
  // `ctx check` 가 **3.9초**였다 -- 커밋마다 그만큼 기다린다. 색인을 여기서
  // 한 번 만들면 **1.0초**다 (실측. 검사 결과는 같다).
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
        return {
          ...hit,
          docMissing: false,
          section: { level: 0, title: doc.title, value: hit.value, line: 0, end: 0, applied: null, hasAppliedComment: false, empty: false, whole: true },
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
