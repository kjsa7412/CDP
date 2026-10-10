// 큐레이션 — 화면이 쓰는 순수 함수(개편안 §4.4 · §7.3 · TODO §1.2 · §1.3). 계산은 서버(core/curation.js)가 하고 화면은
// **그 값을 그릴 뿐이다** — 여기 있는 것은 이름 · 거름 · 복사할 글뿐. React 를 import 하지 않는다(test/curation-ui.test.mjs).
//
// 값이 없으면(옛 서버 — 필드 · 엔드포인트가 없다) 그리지 않는다. 「대기 0」 과 「모름」 을 섞지 않는다(불변조건 7).

// 기록의 큐레이션 상태 — { state: 'queued' | 'reflected' | 'kept' | 'system', into, reason, by, at }
//   대기       queued     보라(행동 대기 — tokens.css 색 예산)
//   반영됨     reflected  무채색 — 정상은 조용하다(V19)
//   기록으로 둠 kept       무채색 · 사유는 툴팁
//   system     큐레이션 · 기준선 · 등록부 · 문서정리 기록 자신 — 그리지 않는다
export const STATE_LABEL = { queued: '대기', reflected: '반영됨', kept: '기록으로 둠' }

export function stateOf(c) {
  const s = c?.state
  return s === 'queued' || s === 'reflected' || s === 'kept' ? s : null
}

// 작업 기록 목록의 거름 — `?only=pending`(대기) · `?only=mine`(내가 쓴 기록 · author 는 save 의 토큰 사용자다)
export function filterRecords(docs = [], only = null, me = null) {
  if (only === 'pending') return docs.filter((d) => d.curation?.state === 'queued')
  if (only === 'mine') return me?.user ? docs.filter((d) => d.author === me.user) : docs
  return docs
}

// 서버가 기록마다 큐레이션 상태를 내나 — 아니면 「대기」 칩 · 거름을 그리지 않는다
export const hasCuration = (docs = []) => docs.some((d) => d && d.curation && typeof d.curation === 'object')

// [에이전트 지시 복사] 의 글 — 큐레이터가 자기 PC 의 Claude Code(`cdp-curate`)에 붙인다(개편안 §3.3 · 목업 S3).
// 대상은 한 줄에 하나 — 첫 줄은 「대상: 」 뒤, 다음 줄부터 그 자리에 맞춰 들여 쓴다(사람이 읽고 고치기 쉽게)
export const CURATE_RULE = '정본 한 곳 · 본문 현재형 · 경과 한 줄. 판정표를 보이고 승인 뒤 save.'
export function curateCommand(repo, ids = []) {
  const list = [...new Set(ids.filter(Boolean))]
  // 「대상: 」 의 **보이는 폭** — 고정폭에서 한글은 두 칸이라 글자 수(4)가 아니라 6칸이다(목업 S3 의 정렬)
  const pad = ' '.repeat(6)
  const target = list.length ? '대상: ' + list.join('\n' + pad) : '대상: (대기열 전부 — queue() 가 오래된 순으로 준다)'
  return `cdp-curate ${repo}\n${target}\n${CURATE_RULE}`
}

// 진단 › [에이전트 지시 복사] — 큐레이터의 Claude Code(`cdp-rebuild`)에 붙인다(리빌딩 검토 §5.3). 대상은 좌표 · 한 줄에 하나
export const REBUILD_RULE = '원천부터(근거 없음 → 좌표정정 · 스냅샷) · 사라지는 사실이 있으면 다시 쓰지 않는다 · 판정표를 보이고 승인 뒤 save.'
export function rebuildCommand(repo, coords = []) {
  const list = [...new Set(coords.filter(Boolean))]
  const pad = ' '.repeat(6)
  const target = list.length ? '대상: ' + list.join('\n' + pad) : '대상: (레포 전체 — drift() 가 신호가 있는 섹션을 준다)'
  return `cdp-rebuild ${repo}\n${target}\n${REBUILD_RULE}`
}

// 대기열 행의 좌표 넷 분류를 센다 — section(섹션 있음) · anchor(등록부 있음 · 섹션 없음) · unregistered(등록부 없음)
export function coordCounts(coords = []) {
  const n = { section: 0, anchor: 0, unregistered: 0 }
  for (const c of coords) if (c && n[c.cls] !== undefined) n[c.cls]++
  return n
}

// 판정 하나의 이름 — reflect 반영 · new 새 문서 · keep 기록으로 둠
export const VERDICT_LABEL = { reflect: '반영', new: '새 문서', keep: '기록으로 둠' }
export function verdictCounts(judgments = []) {
  const n = { reflect: 0, new: 0, keep: 0 }
  for (const j of judgments) if (j && n[j.verdict] !== undefined) n[j.verdict]++
  return n
}

// 서식의 주소 조각 — 서식 id 가 `<묶음>/<번호>` 면 그대로, 번호만이면 묶음을 붙인다(계약 1.3 의 /forms/<group>/<id>)
export function formPath(f) {
  if (!f) return ''
  const id = String(f.id || '')
  return id.includes('/') ? id : `${f.group}/${id}`
}

// 관리 문서 › 문서 추가 › 서식집 › [에이전트 지시 복사] — 큐레이터의 Claude Code(`cdp-registry`)에 붙인다. 화면은 문서를 세우지 않는다 —
// 서식에서 새 문서(행 더하기)는 등록부를 바꾸는 save 라 에이전트가 【등록부 변경】 을 보이고 승인 뒤 한다(cdp-registry 「행 더하기」).
export const REGISTRY_RULE = '있는 문서부터 본다 · 서식에서 새 문서(행 더하기) · 【등록부 변경】 을 보이고 승인 뒤 save.'
export function registryCommand(repo, forms = []) {
  const list = [...new Set(forms.filter(Boolean))]
  const pad = ' '.repeat(6)
  const target = list.length ? '서식: ' + list.join('\n' + pad) : '서식: (기록이 쓴 좌표에 맞는 것 — forms() 에서 고른다)'
  return `cdp-registry ${repo}\n${target}\n${REGISTRY_RULE}`
}
