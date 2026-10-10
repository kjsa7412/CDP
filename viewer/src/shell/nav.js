// 메뉴 표 — **하나다**(개편안 §7.2 · 좌측 메뉴 셸 설계 v0.1). SideNav · 빵부스러기 · 없는 주소 · 권한 밖 주소 · 탭 제목이
// 전부 이 표를 본다. 전에는 TopBar 의 `items` · `AdminView.MENU` · `Console.MENU` 셋이 따로 있었고 역할 판정이 열 곳에
// 흩어져 있어 역할별 메뉴를 지킬 자리가 없었다.
//
// 항목 하나 — { key, group, label, icon, need, scope, to(repo), match(rest, ctx), tab?, page?, badge? }
//   need    'read' · 'write' · 'curate' · 'admin' — 판정은 `lib/roles.js` 의 `can` 하나(V18 — 묶음이 아니라 항목마다)
//   scope   'repo'   레포 하나의 것 — 주소 `/r/<레포>/…` · rest 는 레포 뒤 조각
//           'server' 서버 전부(옛 콘솔) — 주소 `/console/…` · rest 는 `console` 뒤 조각
//   tab     관리 화면(AdminView)이 그릴 것 · page 는 콘솔이 그릴 것
//   badge   'queue' — `/api/<레포>/repo` 의 curation.queue(없으면 그리지 않는다 · 옛 서버). 기록 목록의 대기 수는 읽기 화면의 세그가 든다
//
// 로컬 얼굴(이 PC 의 지식 레포 · 동기화 · 진단)은 v1.0 에 없앴다(개편안 §5.6 · §7.2) — 화면은 늘 서버가 낸다.
// React 를 import 하지 않는다 — `node --test test/nav.test.mjs` 가 역할 × 얼굴마다 보이는 항목을 고정한다.

import { can } from '../lib/roles.js'

export const GROUPS = [
  { key: 'know', label: '지식' },
  { key: 'curation', label: '큐레이션' },
  { key: 'repo', label: '레포 관리' },
  { key: 'server', label: '서버' },
]

// 레포의 뿌리 주소 — `/r/<레포>/`. 레포 항목은 레포가 있을 때만 보이므로(`can`) 레포 없이 부르는 자리는 없다 — 부르면 소개(`/`)
export const repoBase = (repo) => (repo ? '/r/' + encodeURIComponent(repo) + '/' : '/')

// 작업 기록의 문서 주소인가 — `/d/<id>`. 기록 id 에는 `/` 도 `.md` 도 없다(관리 · 기타 문서는 레포 안 경로다 — doclink.js)
export function isRecordId(id) {
  const s = String(id || '')
  return !!s && !s.includes('/') && !/\.(md|markdown)$/i.test(s)
}
export const isRecordRest = (rest = []) => rest[0] === 'd' && rest.length === 2 && isRecordId(rest[1])

const R = 'repo'
const S = 'server'
const manage = (rest, tab) => rest[0] === 'manage' && rest[1] === tab && rest.length === 2

// 메뉴는 **화면 16**(제품화 2 검토 §5.4 · D6) — 레포 7 · 콘솔 4 · 사이트 5. 겹치던 것은 탭 · 세그 · 펼침 열로 들어갔다:
//   문서 ↔ 작업 기록      「읽기」 하나 — 왼쪽 목록 위 세그(문서 · 기록). `/w` 는 기록 목록의 주소로 남는다
//   대기열 ↔ 이력          대기열 화면의 탭 — `manage/curation/log[/<id>]` 는 탭 주소
//   관리 문서 ↔ 서식집      관리 문서 화면의 「문서 추가 › 서식집」 탭 — `manage/forms[/<묶음>/<번호>]` 는 탭 주소(curate)
//   사용자 ↔ 토큰          서버 › 사람 — [발급] 은 사람 줄 한 곳
//   작업 레포 대장         서버 › 지식 레포의 펼침 열
//   감사 · 로그            서버 › 서버 — 접힘
// 옛 주소는 그대로 열린다 — 콘솔의 옛 페이지는 `routes.js` 의 CONSOLE_ALIAS 가 새 주소로 바꿔 쓴다(북마크가 깨지지 않게).
const manageAny = (rest, ...tabs) => rest[0] === 'manage' && tabs.includes(rest[1])

export const NAV = [
  // ── 지식 — 읽는다 · 모두 ──
  {
    key: 'docs', group: 'know', label: '읽기', icon: 'doc', need: 'read', scope: R,
    to: (r) => repoBase(r),
    match: (rest) => rest.length === 0 || (rest[0] === 'w' && rest.length === 1) || rest[0] === 'd',
  },
  {
    key: 'graph', group: 'know', label: '좌표 · 그래프', icon: 'graph', need: 'read', scope: R,
    to: (r) => repoBase(r) + 'graph',
    match: (rest) => rest[0] === 'graph' && rest.length === 1,
  },

  // ── 큐레이션 — 매일 바꾼다 · 큐레이터(레포별 curate) ──
  // 대기열 — 탭 둘(대기열 · 이력). 이력의 펼친 기록이 주소다(`log/<id>`)
  {
    key: 'queue', group: 'curation', label: '대기열', icon: 'hourglass', need: 'curate', scope: R, badge: 'queue', tab: 'curation',
    to: (r) => repoBase(r) + 'manage/curation',
    match: (rest) => manage(rest, 'curation') || (manageAny(rest, 'curation') && rest[2] === 'log' && rest.length <= 4),
  },
  // 진단 — 반영된 뒤 어긋난 정본(리빌딩 검토 §5.1). 미반영(대기열)과 다르다 · 매일이 아니라 가끔이라 묶음의 아래
  {
    key: 'drift', group: 'curation', label: '진단', icon: 'warn', need: 'curate', scope: R, tab: 'drift',
    to: (r) => repoBase(r) + 'manage/drift',
    match: (rest) => manage(rest, 'drift'),
  },

  // ── 레포 관리 — 이 레포 하나 · 읽기면 보인다(쓰는 단추만 write · 지우기 · 서식집은 curate — 화면 안에서) ──
  {
    key: 'overview', group: 'repo', label: '현황', icon: 'check', need: 'read', scope: R, tab: 'overview',
    to: (r) => repoBase(r) + 'manage',
    match: (rest) => rest[0] === 'manage' && (rest.length === 1 || manage(rest, 'overview')),
  },
  // 관리 문서 — 탭 둘(목록 · 문서 추가 › 서식집). 서식집 탭은 큐레이터만(routes.redirectOf)
  {
    key: 'managed', group: 'repo', label: '관리 문서', icon: 'managed', need: 'read', scope: R, tab: 'docs',
    to: (r) => repoBase(r) + 'manage/docs',
    match: (rest) => manage(rest, 'docs') || (manageAny(rest, 'forms') && (rest.length === 2 || rest.length === 4)),
  },
  {
    key: 'linked', group: 'repo', label: '연결된 작업 레포', icon: 'plug', need: 'read', scope: R, tab: 'work',
    to: (r) => repoBase(r) + 'manage/work',
    match: (rest) => manage(rest, 'work'),
  },

  // ── 서버 — 서버 전부 · admin(주소는 `/console/…`) ──
  {
    key: 'con-overview', group: 'server', label: '현황', icon: 'check', need: 'admin', scope: S, page: 'overview',
    to: () => '/console',
    match: (rest) => rest.length === 0 || (rest[0] === 'overview' && rest.length === 1),
  },
  { key: 'con-repos', group: 'server', label: '지식 레포', icon: 'managed', need: 'admin', scope: S, page: 'repos', to: () => '/console/repos', match: (rest) => rest[0] === 'repos' && rest.length === 1 },
  { key: 'con-people', group: 'server', label: '사람', icon: 'users', need: 'admin', scope: S, page: 'people', to: () => '/console/people', match: (rest) => rest[0] === 'people' && rest.length === 1 },
  { key: 'con-server', group: 'server', label: '서버', icon: 'server', need: 'admin', scope: S, page: 'server', to: () => '/console/server', match: (rest) => rest[0] === 'server' && rest.length === 1 },
]

export const groupOf = (key) => GROUPS.find((g) => g.key === key) || null

// 메뉴가 있는 얼굴 — 레포 · 콘솔. 사이트(소개 · 설명서 · 로그인)는 로그인 전에도 보는 공개 화면이라 메뉴가 없다(D4)
const MENU_FACES = ['repo', 'console']

// 이 사람에게 보이는 항목 — 레포 항목은 메뉴가 가리키는 레포(`repo`)가 있어야 한다
export function navItems({ face, me = null, repo = null }) {
  if (!MENU_FACES.includes(face)) return []
  return NAV.filter((it) => can(me, it.need, it.scope === R ? repo : null))
}

// 묶음 — **보이는 항목이 하나라도 있을 때만** 제목째 그린다. 권한 밖 묶음을 회색으로 보이지 않는다(D4)
export function navGroups(args) {
  const items = navItems(args)
  return GROUPS.map((g) => ({ ...g, items: items.filter((it) => it.group === g.key) })).filter((g) => g.items.length > 0)
}

// 지금 주소의 항목 — 레포 얼굴은 레포 뒤 조각, 콘솔은 `console` 뒤 조각
export function currentItem(face, rest = []) {
  if (!MENU_FACES.includes(face)) return null
  const scope = face === 'console' ? S : R
  return NAV.find((it) => it.scope === scope && it.match(rest)) || null
}
