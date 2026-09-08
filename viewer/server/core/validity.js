// 최신성 — 수행 v1.0 §6.
//
// **하나의 계산이 세 곳에 쓰인다.**
//
//   later(기준, 좌표) = 그 좌표를 touches 에 가진 작업 기록 중 기준보다 나중인 것
//
//   기준 = 작업 기록       → (문서, 좌표) 쌍의 최신성      §6.3
//   기준 = 섹션의 applied  → 그 섹션에 남은 파생            §6.2
//   기준 = 없음            → 그 좌표의 최신 작업 기록        §6.1
//
// "문서는 사건이라 통째로 낡지 않는다. 후속이 붙는 것은 (문서, 좌표) 쌍이다."
// 문서 단위로 판정하면 좌표가 여럿인 문서에서 반드시 둘 중 하나가 틀린다.
//
// 저장하지 않고 질의 시점에 계산한다 — 저장하면 반드시 낡는다. 수백 건에서
// 수 밀리초이므로 부분 갱신을 시도하지 않는다.

export function cmpDateDesc(a, b) {
  const da = a.date || ''
  const db = b.date || ''
  if (da === db) return String(a.id).localeCompare(String(b.id)) * -1
  if (!da) return 1
  if (!db) return -1
  return da < db ? 1 : -1
}

// works 는 layer === 'work' 인 문서만.
export function buildCoordIndex(works, opts = {}) {
  const exclude = new Set(opts.excludeTypes || [])
  const byId = new Map(works.map((d) => [d.id, d]))
  const byCoord = new Map()

  // **모든 기록이 사실이다.** 전에는 `status: 진행중` 인 것을 건너뛰었는데,
  // 진행중이라는 상태가 없어졌다 — 지식공유문서는 **작업의 완료에서 발생하고,
  // 항상 그 시점에 완료된 것이 넘어온다.** 아직 안 끝난 일은 문서가 아니다.
  for (const d of works) {
    for (const c of d.touches) {
      if (!byCoord.has(c)) byCoord.set(c, [])
      byCoord.get(c).push(d)
    }
  }
  for (const list of byCoord.values()) list.sort(cmpDateDesc)

  const slim = (d) => ({ id: d.id, title: d.title, date: d.date, author: d.author, status: d.status, path: d.path })

  const api = {
    byCoord,
    typeOf: (coord) => (coord.includes(':') ? coord.slice(0, coord.indexOf(':')) : ''),
    excluded: (coord) => exclude.has(api.typeOf(coord)),

    // 하나의 계산.
    //   ref: 작업 기록 객체 | 작업 기록 id 문자열 | null
    //
    // **같은 날짜는 후속이 아니다.**
    //
    // 날짜 입도가 하루이므로 하루 안의 순서를 알 수 없다. 그리고 관리 문서
    // 섹션의 `applied` 는 **하나만 가리킬 수 있는데** 하루에 같은 좌표를 두 번
    // 건드리면 섹션은 둘 다 반영하고 `applied` 는 그중 하나만 적는다.
    //
    // id 문자열 비교로 순서를 매기면 그때 남은 하나가 파생 누락으로 잡힌다 --
    // 실측에서 `screen:PLA011` 이 그랬다. 셋 다 반영했는데 1건이 남았다.
    //
    // **이 목록의 오탐은 부식성이 크다.** 한 번 틀리면 사람들이 그 목록 전체를
    // 안 믿는다. 그래서 같은 날짜는 동료로 본다 -- 선후를 모르니 단정하지 않는다.
    //
    // 대가 — 같은 날 실제로 반영 안 된 작업을 놓친다. 그것은 섹션의 `변경` 목록이
    // 실제 반영 기록이므로 거기서 보인다.
    later(ref, coord) {
      const list = byCoord.get(coord) || []
      const base = { coord, excluded: api.excluded(coord), total: list.length }

      if (ref == null) return { ...base, ref: null, count: list.length, items: list.map(slim) }

      const refDoc = typeof ref === 'string' ? byId.get(ref) : ref
      if (!refDoc) {
        // applied 가 없는 id 를 가리킨다. 전부 나중으로 보되 그 사실을 알린다 —
        // 조용히 "최신"으로 판정하면 그것이 조용한 실패다.
        return { ...base, ref: String(ref), refUnknown: true, count: list.length, items: list.map(slim) }
      }

      const items = list.filter((o) => o.id !== refDoc.id && (o.date || '') > (refDoc.date || ''))

      // **같은 날짜는 후속이 아니다 — 그러나 조용히 넘기지도 않는다.**
      //
      // 하루 안의 순서를 모르므로 후속으로 단정하면 오탐이 난다(아래 later 주석).
      // 그렇다고 없는 셈 치면 **하루에 같은 좌표를 두 번 건드린 두 번째가
      // 아무에게도 안 보인다** — 실측에서 파생을 안 하고도 커밋이 통과했다.
      //
      // 그래서 따로 센다. `check` 가 이것을 **경고**로 낸다. 오탐이 무서운
      // 이유는 오류라서 커밋을 막기 때문이고, 경고는 틀려도 부식되지 않는다.
      // **시각이 있으면 동배가 아니다.**
      //
      // `2026-09-08 14:30` 과 `2026-09-08 16:05` 는 순서가 결판나므로 위의
      // `items` 가 잡는다. 동배로 남는 것은 **둘 다 날짜만 있어 순서를 모르는**
      // 경우뿐이다. 시각을 쓰기 시작하면 이 목록은 옛 기록에서만 나온다.
      const hhmm = (d) => /\d{2}:\d{2}/.test(d || '')
      const peers = list.filter(
        (o) =>
          o.id !== refDoc.id &&
          (o.date || '') === (refDoc.date || '') &&
          !(hhmm(o.date) && hhmm(refDoc.date))
      )
      return { ...base, ref: refDoc.id, refDate: refDoc.date, count: items.length, items: items.map(slim), peers: peers.map(slim) }
    },

    latest(coord) {
      const list = byCoord.get(coord) || []
      return list.length ? slim(list[0]) : null
    },

    // 작업 기록 하나를 열었을 때 — 좌표마다 따로 판정한다.
    ofWork(doc) {
      return doc.touches.map((c) => api.later(doc, c))
    },
  }
  return api
}

// 관리 문서 섹션에 남은 파생 — 좌표를 알아야 계산되므로 등록부를 거꾸로 쓴다.
// (섹션 → 좌표가 아니라 좌표 → 섹션이 등록부의 방향이다)
export function buildSectionStatus(coordIndex, managedIndex, allCoords) {
  const rows = []
  const seen = new Set()

  for (const coord of allCoords) {
    if (seen.has(coord)) continue
    seen.add(coord)
    const hit = managedIndex.find(coord)
    if (!hit) continue // 등록부에 없다 — module: · domain: 등. 정상이다

    if (hit.docMissing) {
      rows.push({ coord, doc: hit.doc, state: 'doc-missing', total: (coordIndex.byCoord.get(coord) || []).length, count: 0, items: [], latest: coordIndex.latest(coord) })
      continue
    }
    if (!hit.section) {
      rows.push({
        coord,
        doc: hit.doc,
        anchor: '#'.repeat(hit.level) + ' ' + hit.value,
        state: 'anchor-missing',
        total: (coordIndex.byCoord.get(coord) || []).length,
        count: 0,
        items: [],
        latest: coordIndex.latest(coord),
      })
      continue
    }

    const s = hit.section
    const l = coordIndex.later(s.applied, coord)

    // 내부 상태 넷. **화면에 나가지 않는다** — `ctx check` 만 읽는다.
    //
    //   ok        섹션이 최신이다
    //   stale     applied 뒤에 그 좌표를 건드린 후속이 있다
    //   unwritten applied 가 없는데 작업 기록은 있다
    //   empty     applied 도 작업 기록도 없다 (정상)
    //   orphan    applied 가 없는 작업 기록을 가리킨다
    //
    // stale · unwritten 은 같은 위반(파생 누락)이고 check.js 가 한 건으로 낸다.
    // 이것을 "밀림"·"미작성"이라는 **상태로 보여 주지 않는다** -- 파생은
    // 필수이므로 그 둘은 상태가 아니라 오류다.
    let state = 'ok'
    if (l.refUnknown) state = 'orphan'
    else if (!s.applied) state = l.total ? 'unwritten' : 'empty'
    else if (l.count > 0) state = 'stale'

    rows.push({
      coord,
      doc: hit.doc,
      anchor: '#'.repeat(s.level) + ' ' + s.value,
      line: s.line,
      end: s.end,
      level: s.level,
      applied: s.applied,
      sectionEmpty: s.empty,
      state,
      total: l.total,
      count: l.count,
      items: l.items,
      // 같은 날 기록 — 반영됐는지 기계가 알 수 없다. 경고로만 낸다
      peers: l.peers || [],
      latest: coordIndex.latest(coord),
    })
  }

  const order = { stale: 0, orphan: 1, 'anchor-missing': 2, 'doc-missing': 3, unwritten: 4, empty: 5, ok: 6 }
  return rows.sort((a, b) => (order[a.state] - order[b.state]) || b.count - a.count || a.coord.localeCompare(b.coord))
}

// supersedes 체인 — **오기재 정정** 관계다 (수행 v1.0 §6.3).
// 순환은 끊지 않고 표시한다. 못 읽었다는 사실을 숨기지 않는다.
export function buildValidity(docs) {
  const byId = new Map(docs.map((d) => [d.id, d]))
  const supersededBy = new Map()
  const missingTargets = []

  for (const d of docs) {
    for (const s of d.supersedes) {
      if (!byId.has(s.id)) {
        missingTargets.push({ doc: d.id, target: s.id })
        continue
      }
      if (!supersededBy.has(s.id)) supersededBy.set(s.id, [])
      supersededBy.get(s.id).push({ by: d.id, scope: s.scope })
    }
  }

  // 방문 집합 없이 체인을 따라가면 여기서 앱이 죽는다.
  const cycles = new Set()
  for (const start of byId.keys()) {
    const seen = new Set([start])
    let cur = start
    for (;;) {
      const next = (supersededBy.get(cur) || [])[0]
      if (!next) break
      if (seen.has(next.by)) {
        cycles.add(start)
        break
      }
      seen.add(next.by)
      cur = next.by
    }
  }

  return {
    of(id) {
      const covers = supersededBy.get(id) || []
      const full = covers.filter((c) => !c.scope)
      const scoped = covers.filter((c) => c.scope)
      const doc = byId.get(id)
      const broken = doc ? doc.supersedes.filter((s) => !byId.has(s.id)).map((s) => s.id) : []

      // **`supersedes` 는 판정이 아니다** (정정_판정모델_v2 §3).
      //
      // 작업 기록은 사건이라 무효가 되지 않는다. 지금 맞는 말을 말하는 것은
      // **관리 문서 섹션**이고, 파생 누락이 error 가 되면(§1) 섹션은 늘 최신이다.
      // 그러면 "이 문서는 무효다"라는 별도 축이 필요 없다.
      //
      // 선언은 그대로 받아 **참조로만** 낸다 -- 검색에서 내리지 않고
      // 화면에 적색 바를 세우지도 않는다. 다만 순환과 대상 없음은 여전히
      // 재려말한다 -- 그것은 의견이 아니라 깨진 참조다.
      let state = 'valid'
      if (cycles.has(id)) state = 'cycle'

      return {
        state, // valid | cycle
        correctedBy: full.map((c) => c.by),      // 이 기록을 정정한 문서 (참조)
        partialBy: scoped.map((c) => ({ by: c.by, scope: c.scope })),
        brokenTargets: broken,
        // v0.3 호출부 호환 -- 같은 목록이다
        supersededBy: full.map((c) => c.by),
      }
    },
    missingTargets,
    cycles: [...cycles],
  }
}

// 본문에서 이 문서의 id 를 언급한 문서 + supersedes 역참조.
export function buildBacklinks(docs, bodies) {
  const links = new Map()
  const add = (to, from) => {
    if (to === from) return
    if (!links.has(to)) links.set(to, new Set())
    links.get(to).add(from)
  }

  for (const d of docs) {
    for (const s of d.supersedes) add(s.id, d.id)
  }
  if (bodies) {
    const ids = docs.map((d) => d.id).filter((id) => /^\d{4}-\d{4}-/.test(id))
    for (const d of docs) {
      const body = bodies.get(d.path)
      if (!body) continue
      for (const id of ids) if (id !== d.id && body.includes(id)) add(id, d.id)
    }
  }
  return (id) => [...(links.get(id) || [])]
}

// v0.2 호환 — 이름만 유지한다. 내부는 buildCoordIndex 하나로 통합됐다.
export function buildSettledness(works, opts = {}) {
  const idx = buildCoordIndex(works, opts)
  return {
    byCoord: idx.byCoord,
    of(doc) {
      return idx.ofWork(doc).map((r) => ({
        coord: r.coord,
        excluded: r.excluded,
        total: r.total,
        laterCount: r.count,
        later: r.items,
      }))
    },
  }
}
