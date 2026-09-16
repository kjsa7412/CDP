// 레포 로더 — 앱과 CLI 가 **같은 계산**을 쓴다.
//
// 이 파일이 없으면 `bin/ctx check` 와 앱의 검증 뷰가 각자 계산하게 되고,
// 둘이 어긋난 순간 사용자는 어느 쪽을 믿을지 알 수 없다. 설계가 등록부를
// 한 곳에 두라고 한 것과 같은 이유다 — **계산도 한 곳에 있어야 한다.**
//
// 감시(chokidar)와 검색 색인(minisearch)은 여기 없다. CLI 는 한 번 읽고
// 끝나므로 필요하지 않고, 넣으면 폐쇄망용 단일 파일이 무거워진다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { scan, countIndexRows, readText } from './scan.js'
import { parseVocab } from './vocab.js'
import { parseRegistry, buildManagedIndex } from './managed.js'
import { buildCoordIndex, buildSectionStatus, buildValidity, cmpDateDesc } from './validity.js'

// CRLF 는 여기서 이미 없앤다 (scan.js `readText` 주석 참고)
async function readOr(root, name, fallback = '') {
  const t = await fs.readFile(path.join(root, name), 'utf8').catch(() => null)
  return t == null ? fallback : readText(t)
}

export async function loadRepo(root, { cache = new Map(), settings = {}, onProgress } = {}) {
  const { docs, bodies, stats } = await scan(root, cache, { onProgress })

  const vocab = parseVocab(await readOr(root, '_vocab.md'))
  const registry = parseRegistry(await readOr(root, '_managed.md'))

  const indexText = await readOr(root, 'INDEX.md', null)
  const indexInfo = indexText == null ? { exists: false } : { exists: true, rows: countIndexRows(indexText) }

  // 두 층 — 수행 v1.0 §2
  const works = docs.filter((d) => d.layer === 'work' && d.hasFrontmatter).sort(cmpDateDesc)
  const managedDocs = docs.filter((d) => d.layer === 'managed')

  const coords = buildCoordIndex(works, { excludeTypes: settings.settledness?.excludeTypes || [] })
  const managedIndex = buildManagedIndex(registry, managedDocs)

  // 등록부에 걸릴 수 있는 좌표 전체 = 작업 기록이 쓴 것 ∪ 어휘에 등재된 것.
  // 어휘 쪽을 넣는 이유 — 작업 기록이 아직 없는 좌표의 섹션도 "미작성"으로
  // 보여야 한다. 작업이 없으니 안 보인다면 정리할 대상을 못 찾는다.
  const all = new Set()
  for (const d of works) for (const c of d.touches) all.add(c)
  for (const c of vocab.coords.keys()) all.add(c)
  const allCoords = [...all].sort()

  return {
    root,
    docs,
    bodies,
    stats,
    vocab,
    registry,
    indexInfo,
    works,
    managedDocs,
    coords,
    managedIndex,
    allCoords,
    sections: buildSectionStatus(coords, managedIndex, allCoords),
    validity: buildValidity(works),
    byId: new Map(works.map((d) => [d.id, d])),
    byPath: new Map(docs.map((d) => [d.path, d])),
  }
}

// 현황 — 화면과 `ctx brief` 가 같은 숫자를 말해야 한다.
export function repoStatus(r, { today = new Date() } = {}) {
  // **"밀림"·"미작성"이라는 상태는 없다.**
  //
  // 파생은 필수이므로(정정_판정모델_v2 §1) 안 된 섹션은 상태가 아니라 **할
  // 일**이고, 등록부가 없는 자리를 가리키는 섹션은 **깨진 것**이다. 이름이
  // 그 둘을 구별해야 화면과 CLI 가 같은 말을 한다.
  //
  //   pendingDerive   applied 뒤 후속이 있다 · applied 가 아예 없다 → 파생 남음
  //   brokenSections  섹션/문서가 없다 · applied 가 유령을 가리킨다
  //   (empty)         작업 기록이 아직 없는 섹션 → 낼 것이 없다. 정상이다
  const broken = new Set(['orphan', 'anchor-missing', 'doc-missing'])
  const pendingDerive = r.sections.filter((x) => x.state === 'stale' || x.state === 'unwritten')
  const brokenSections = r.sections.filter((x) => broken.has(x.state))
  const days = (d) => (d ? Math.max(0, Math.round((today - new Date(d)) / 86400000)) : null)

  return {
    docs: r.docs.length,
    works: r.works.length,
    managedDocs: r.managedDocs.length,
    coords: r.vocab.coords.size,
    pendingDerive,
    brokenSections,
    unregistered: unregisteredCoords(r),
    // **아젠다는 CDP 의 것이 아니다** (정정_판정모델_v2 §2).
    //
    // 지식공유문서는 **작업의 완료에서 발생하는 문서**다. 결정을 기다리는
    // 것은 아젠다이고, 아젠다는 이슈관리·TODO 같은 스케줄 문서가 다룬다.
    // `미결` 과 `제안` 은 같은 것 — 둘 다 상태가 아니라 **이관 대상**이다.
    legacyPending: r.works
      .filter((d) => d.status === '미결' || d.status === '제안')
      .map((d) => ({ id: d.id, title: d.title, author: d.author, date: d.date, days: days(d.date), touches: d.touches }))
      .sort((a, b) => (b.days ?? 0) - (a.days ?? 0)),
    thin: r.works.filter((d) => d.bodyThin).map((d) => ({ id: d.id, title: d.title, chars: d.bodyChars })),
    indexStale: r.indexInfo.exists ? r.indexInfo.rows !== r.works.length : null,
  }
}

// 어휘에 없는 좌표 — 프로토콜 §9.6 조용한 실패.
// 어휘가 비어 있으면 판정하지 않는다. 어휘를 아직 안 만든 레포에서 전부
// 미등재로 뜨면 그 경고는 정보가 없다.
export function unregisteredCoords(r) {
  if (!r.vocab.coords.size) return []
  const counts = new Map()
  for (const d of r.works) for (const c of d.touches) if (!r.vocab.coords.has(c)) counts.set(c, (counts.get(c) || 0) + 1)
  return [...counts.entries()]
    .map(([coord, count]) => ({
      coord,
      count,
      docs: r.works.filter((d) => d.touches.includes(coord)).map((d) => d.id),
    }))
    .sort((a, b) => b.count - a.count || a.coord.localeCompare(b.coord))
}
