// 메뉴 표 — **하나다**(개편안 §7.2 · 좌측 메뉴 셸 설계 v0.1). SideNav · 빵부스러기 · 없는 주소 · 권한 밖 주소 · 탭 제목이
// 전부 이 표를 본다. 전에는 TopBar 의 `items` · `AdminView.MENU` · `Console.MENU` 셋이 따로 있었고 역할 판정이 열 곳에
// 흩어져 있어 역할별 메뉴를 지킬 자리가 없었다.
//
// 항목 하나 — { key, group, label, icon, need, scope, to(repo), match(rest, ctx), tab?, page?, badge? }
//   need    'read' · 'write' · 'curate' · 'admin' — 판정은 `lib/roles.js` 의 `can` 하나(V18 — 묶음이 아니라 항목마다)
//   scope   'repo'   레포 하나의 것 — 주소 `/r/<레포>/…` · rest 는 레포 뒤 조각
//           'server' 서버 전부(옛 콘솔) — 주소 `/console/…` · rest 는 `console` 뒤 조각
//   tab     관리 화면(AdminView)이 그릴 것 · page 는 콘솔이 그릴 것
//   badge   'queue' — `/api/<레포>/repo` 의 curation.queue(없으면 그리지 않는다 · 옛 서버)
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

// 문서 주소(`/d/…`)에서 왼쪽 목록이 무엇인가 — 고른 사람이 정한 것(히스토리의 `list`)이 이긴다. 없으면(받은 링크) 문서의 종류로
const docList = (rest, ctx) => (ctx?.list === 'records' || ctx?.list === 'docs' ? ctx.list : isRecordRest(rest) ? 'records' : 'docs')

const R = 'repo'
const S = 'server'
const manage = (rest, tab) => rest[0] === 'manage' && rest[1] === tab && rest.length === 2

export const NAV = [
  // ── 지식 — 읽는다 · 모두 ──
  {
    key: 'docs', group: 'know', label: '문서', icon: 'doc', need: 'read', scope: R,
    to: (r) => repoBase(r),
    match: (rest, ctx) => rest.length === 0 || (rest[0] === 'd' && docList(rest, ctx) === 'docs'),
  },
  {
    key: 'records', group: 'know', label: '작업 기록', icon: 'work', need: 'read', scope: R, badge: 'queue',
    to: (r) => repoBase(r) + 'w',
    match: (rest, ctx) => (rest[0] === 'w' && rest.length === 1) || (rest[0] === 'd' && docList(rest, ctx) === 'records'),
  },
  {
    key: 'graph', group: 'know', label: '좌표 · 그래프', icon: 'graph', need: 'read', scope: R,
    to: (r) => repoBase(r) + 'graph',
    match: (rest) => rest[0] === 'graph' && rest.length === 1,
  },

  // ── 큐레이션 — 매일 바꾼다 · 큐레이터(레포별 curate) ──
  {
    key: 'queue', group: 'curation', label: '대기열', icon: 'hourglass', need: 'curate', scope: R, badge: 'queue', tab: 'curation',
    to: (r) => repoBase(r) + 'manage/curation',
    match: (rest) => manage(rest, 'curation'),
  },
  {
    key: 'log', group: 'curation', label: '이력', icon: 'history', need: 'curate', scope: R, tab: 'curation-log',
    to: (r) => repoBase(r) + 'manage/curation/log',
    match: (rest) => rest[0] === 'manage' && rest[1] === 'curation' && rest[2] === 'log' && rest.length <= 4,
  },
  // 진단 — 반영된 뒤 어긋난 정본(리빌딩 검토 §5.1). 미반영(대기열)과 다르다
  {
    key: 'drift', group: 'curation', label: '진단', icon: 'warn', need: 'curate', scope: R, tab: 'drift',
    to: (r) => repoBase(r) + 'manage/drift',
    match: (rest) => manage(rest, 'drift'),
  },
  {
    key: 'forms', group: 'curation', label: '서식집', icon: 'grid', need: 'curate', scope: R, tab: 'forms',
    to: (r) => repoBase(r) + 'manage/forms',
    match: (rest) => rest[0] === 'manage' && rest[1] === 'forms' && (rest.length === 2 || rest.length === 4),
  },

  // ── 레포 관리 — 이 레포 하나 · 읽기면 보인다(쓰는 단추만 write — 화면 안에서 · 개편안 §3.1) ──
  {
    key: 'overview', group: 'repo', label: '현황', icon: 'check', need: 'read', scope: R, tab: 'overview',
    to: (r) => repoBase(r) + 'manage',
    match: (rest) => rest[0] === 'manage' && (rest.length === 1 || manage(rest, 'overview')),
  },
  {
    key: 'managed', group: 'repo', label: '관리 문서', icon: 'managed', need: 'read', scope: R, tab: 'docs',
    to: (r) => repoBase(r) + 'manage/docs',
    match: (rest) => manage(rest, 'docs'),
  },
  // 옛 「관리 › 작업 레포」 — 서버 전부의 설치 대장(서버 › 작업 레포 대장)과 이름이 같았다(셸 설계 §2.2)
  {
    key: 'linked', group: 'repo', label: '연결된 작업 레포', icon: 'plug', need: 'read', scope: R, tab: 'work',
    to: (r) => repoBase(r) + 'manage/work',
    match: (rest) => manage(rest, 'work'),
  },

  // ── 서버 — 서버 전부 · admin(옛 콘솔 · 주소는 그대로 `/console/…` — L2) ──
  {
    key: 'con-overview', group: 'server', label: '현황', icon: 'check', need: 'admin', scope: S, page: 'overview',
    to: () => '/console',
    match: (rest) => rest.length === 0 || (rest[0] === 'overview' && rest.length === 1),
  },
  { key: 'con-repos', group: 'server', label: '지식 레포', icon: 'managed', need: 'admin', scope: S, page: 'repos', to: () => '/console/repos', match: (rest) => rest[0] === 'repos' && rest.length === 1 },
  { key: 'con-workrepos', group: 'server', label: '작업 레포 대장', icon: 'plug', need: 'admin', scope: S, page: 'workrepos', to: () => '/console/workrepos', match: (rest) => rest[0] === 'workrepos' && rest.length === 1 },
  { key: 'con-users', group: 'server', label: '사용자', icon: 'users', need: 'admin', scope: S, page: 'users', to: () => '/console/users', match: (rest) => rest[0] === 'users' && rest.length === 1 },
  { key: 'con-tokens', group: 'server', label: '토큰', icon: 'key', need: 'admin', scope: S, page: 'tokens', to: () => '/console/tokens', match: (rest) => rest[0] === 'tokens' && rest.length === 1 },
  { key: 'con-audit', group: 'server', label: '감사', icon: 'list', need: 'admin', scope: S, page: 'audit', to: () => '/console/audit', match: (rest) => rest[0] === 'audit' && rest.length === 1 },
  // 옛 「콘솔 › 서버」 — 묶음 이름과 같았다
  { key: 'con-server', group: 'server', label: '서버 설정', icon: 'server', need: 'admin', scope: S, page: 'server', to: () => '/console/server', match: (rest) => rest[0] === 'server' && rest.length === 1 },
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

// 지금 주소의 항목 — 레포 얼굴은 레포 뒤 조각, 콘솔은 `console` 뒤 조각. ctx.list 는 문서 주소의 왼쪽 목록
export function currentItem(face, rest = [], ctx = null) {
  if (!MENU_FACES.includes(face)) return null
  const scope = face === 'console' ? S : R
  return NAV.find((it) => it.scope === scope && it.match(rest, ctx)) || null
}
