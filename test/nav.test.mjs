// 메뉴 표 · 주소 · 역할 — 화면의 순수 함수(개편안 §7.2 · V18). 역할 × 얼굴마다 **보이는 항목**을 고정한다.
// 화면이 숨기는 것은 예의이고 막는 것은 서버다 — 그래도 못 할 일을 띄워 놓고 403 을 내지 않게, 보이는 것을 여기서 지킨다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, canRead, curateOf } from '../viewer/src/lib/roles.js'
import { NAV, navGroups, navItems, currentItem, isRecordId, repoBase } from '../viewer/src/shell/nav.js'
import { faceOf, finderOf, screenOf, crumbOf, titleOf, redirectOf, navRepoOf, CONSOLE_PAGES } from '../viewer/src/shell/routes.js'

const repos = (...n) => n.map((name) => ({ name, title: '' }))
const VIEWER = { user: 'hong', role: 'viewer', admin: false, write: false, repos: repos('alpha') }
const WRITER = { user: 'lee', role: 'writer', admin: false, write: true, repos: repos('alpha', 'gamma') }
const CURATOR = { ...WRITER, user: 'park', curate: ['alpha'] }
const CURATOR_ALL = { ...WRITER, user: 'choi', curate: ['*'] }
const ADMIN = { user: 'kjsa', role: 'admin', admin: true, write: true, repos: repos('alpha', 'gamma'), curate: ['*'] }
// 옛 서버(v0.26 이전) — `/me` 에 curate 가 없다
const ADMIN_OLD = { user: 'kjsa', role: 'admin', admin: true, write: true, repos: repos('alpha') }

const keys = (args) => navItems(args).map((it) => it.key)
const groups = (args) => navGroups(args).map((g) => `${g.label}:${g.items.map((it) => it.label).join('·')}`)

test('can — 판정 하나 · 모르는 값은 거짓', () => {
  assert.equal(can(null, 'read', 'alpha'), false, '세션 없음')
  assert.equal(can(VIEWER, 'read', 'alpha'), true)
  assert.equal(can(VIEWER, 'read', 'gamma'), false, '할당 밖')
  assert.equal(can(VIEWER, 'write', 'alpha'), false)
  assert.equal(can(WRITER, 'write', 'alpha'), true)
  assert.equal(can(WRITER, 'curate', 'alpha'), false, 'writer 는 curate 가 없으면 아니다')
  assert.equal(can(CURATOR, 'curate', 'alpha'), true)
  assert.equal(can(CURATOR, 'curate', 'gamma'), false, '레포별')
  assert.equal(can(CURATOR_ALL, 'curate', 'gamma'), true, '* 는 볼 수 있는 레포 전부')
  assert.equal(can(CURATOR_ALL, 'curate', 'delta'), false, '볼 수 없는 레포는 * 여도 아니다')
  assert.equal(can(ADMIN_OLD, 'curate', 'alpha'), true, 'admin 은 모든 레포의 큐레이터 — 옛 서버도')
  assert.equal(can(ADMIN, 'admin'), true)
  assert.equal(can(WRITER, 'admin'), false)
  assert.equal(can(ADMIN, 'read', 'delta'), false, 'admin 도 할당된 레포만 읽는다(auth.grantOf)')
  assert.equal(can(WRITER, 'nope', 'alpha'), false)
  assert.equal(canRead({ repos: ['alpha'] }, 'alpha'), true, 'repos 가 이름 배열이어도')
  assert.deepEqual(curateOf(ADMIN_OLD), ['*'])
  assert.deepEqual(curateOf(WRITER), [])
  assert.deepEqual(curateOf({ curate: ['a', '', 3] }), ['a'])
})

test('보이는 묶음 — 역할 × 레포 얼굴(V18 · 묶음은 보이는 항목이 있을 때만)', () => {
  const know = '지식:문서·작업 기록·좌표 · 그래프'
  const repo = '레포 관리:현황·관리 문서·연결된 작업 레포'
  const cur = '큐레이션:대기열·이력·서식집'
  const srv = '서버:현황·지식 레포·작업 레포 대장·사용자·토큰·감사·서버 설정'
  assert.deepEqual(groups({ face: 'repo', me: VIEWER, repo: 'alpha' }), [know, repo], 'viewer — 큐레이션 · 서버 묶음은 제목째 없다')
  assert.deepEqual(groups({ face: 'repo', me: WRITER, repo: 'alpha' }), [know, repo], 'writer — 같다')
  assert.deepEqual(groups({ face: 'repo', me: CURATOR, repo: 'alpha' }), [know, cur, repo], '그 레포의 큐레이터')
  assert.deepEqual(groups({ face: 'repo', me: CURATOR, repo: 'gamma' }), [know, repo], '다른 레포에서는 아니다')
  assert.deepEqual(groups({ face: 'repo', me: ADMIN, repo: 'alpha' }), [know, cur, repo, srv], 'admin — 넷')
  assert.deepEqual(groups({ face: 'repo', me: null, repo: 'alpha' }), [], '세션이 없으면 아무것도')
  // 로컬 전용 셋(지식 레포 · 동기화 · 진단)은 서버 얼굴에 없다
  for (const me of [VIEWER, WRITER, ADMIN]) {
    const k = keys({ face: 'repo', me, repo: 'alpha' })
    assert.ok(!k.some((x) => x.startsWith('local-')), 'local- 항목 없음')
  }
})

test('보이는 묶음 — 콘솔 얼굴 · 로컬 얼굴', () => {
  // 콘솔 — 메뉴의 레포는 마지막으로 본 레포. 없으면 레포 묶음 없이 서버만
  assert.deepEqual(
    navGroups({ face: 'console', me: ADMIN, repo: null }).map((g) => g.label),
    ['서버']
  )
  assert.deepEqual(
    navGroups({ face: 'console', me: ADMIN, repo: 'alpha' }).map((g) => g.label),
    ['지식', '큐레이션', '레포 관리', '서버']
  )
  assert.deepEqual(navGroups({ face: 'console', me: WRITER, repo: 'alpha' }).map((g) => g.label), ['지식', '레포 관리'], '비관리자는 서버 묶음 없음')
  // 로컬 — 판정 없음 · 지식 + 레포 관리(로컬 항목) · 큐레이션 · 서버 없음
  assert.deepEqual(groups({ face: 'local', me: null, repo: null }), [
    '지식:문서·작업 기록·좌표 · 그래프',
    '레포 관리:현황·관리 문서·지식 레포·동기화·연결된 작업 레포·진단 · 정보',
  ])
  // 사이트 얼굴에는 메뉴가 없다
  assert.deepEqual(navGroups({ face: 'site', me: ADMIN, repo: 'alpha' }), [])
})

test('주소 — 메뉴의 to 와 match 가 짝이다(눌러 간 곳이 그 항목으로 칠해진다)', () => {
  for (const it of NAV) {
    const path = it.scope === 'server' ? it.to() : it.local ? it.to(null) : it.to('alpha')
    const s = screenOf({ path, server: !it.local })
    assert.equal(s.item?.key, it.key, `${it.key} — ${path}`)
    assert.equal(redirectOf(s, ADMIN), null, `${it.key} — admin 은 바꿔 쓰지 않는다`)
  }
  assert.deepEqual(CONSOLE_PAGES, ['overview', 'repos', 'workrepos', 'users', 'tokens', 'audit', 'server'])
})

test('주소 — 옛 주소는 그대로 · 새 주소', () => {
  const at = (path, query = '', hist = null) => screenOf({ path, query: new URLSearchParams(query), server: true, hist })
  assert.equal(at('/r/alpha/').item.key, 'docs')
  assert.equal(at('/r/alpha/d/docs/2.개발/DE_431_테이블정의서.md').item.key, 'docs')
  assert.equal(at('/r/alpha/d/README.md').item.key, 'docs', '기타 문서는 문서')
  assert.equal(at('/r/alpha/d/2026-0925-우수회원-한도-정정').item.key, 'records', '기록 id 는 작업 기록')
  assert.equal(at('/r/alpha/d/docs/x.md', '', { list: 'records', only: 'pending' }).item.key, 'records', '고른 목록이 이긴다')
  assert.deepEqual(at('/r/alpha/d/docs/x.md', '', { list: 'records', only: 'pending' }).finder, { list: 'records', only: 'pending' })
  assert.equal(at('/r/alpha/graph').item.key, 'graph')
  assert.equal(at('/r/alpha/manage').item.key, 'overview')
  assert.equal(at('/r/alpha/manage/overview').item.key, 'overview')
  assert.equal(at('/r/alpha/manage/docs').item.tab, 'docs')
  assert.equal(at('/r/alpha/manage/work').item.key, 'linked')
  assert.equal(at('/r/alpha/manage/curation').item.key, 'queue')
  assert.equal(at('/r/alpha/manage/curation/log').item.key, 'log')
  assert.equal(at('/r/alpha/manage/curation/log/2026-1007-큐레이션').logId, '2026-1007-큐레이션')
  const f = at('/r/alpha/manage/forms/public-si/DE_431', 'tab=guide')
  assert.equal(f.item.key, 'forms')
  assert.deepEqual(f.form, { group: 'public-si', id: 'DE_431' })
  assert.equal(f.formTab, 'guide')
  assert.equal(at('/r/alpha/manage/forms', 'tab=nope').formTab, 'stamp', '모르는 탭은 첫 탭')
  assert.equal(at('/r/alpha/manage/forms/public-si').item, null, '묶음만 — 없는 주소')
  // 콘솔
  assert.equal(at('/console').item.key, 'con-overview')
  assert.equal(at('/console/overview').item.page, 'overview')
  assert.equal(at('/console/workrepos').item.label, '작업 레포 대장')
  assert.equal(at('/console/server').item.label, '서버 설정')
  // 로컬 — 서버 표식 없음
  const L = (path) => screenOf({ path, server: false })
  assert.equal(L('/').face, 'local')
  assert.equal(L('/manage/sync').item.key, 'local-sync')
  assert.equal(L('/w').item.key, 'records')
  assert.equal(L('/manage/curation').item, null, '로컬에는 큐레이션이 없다')
})

test('왼쪽 목록 — 주소가 정한다(범위 칩을 지웠다)', () => {
  const q = (s) => new URLSearchParams(s)
  assert.deepEqual(finderOf([], q('')), { list: 'docs', only: null })
  assert.deepEqual(finderOf(['w'], q('only=pending')), { list: 'records', only: 'pending' })
  assert.deepEqual(finderOf(['w'], q('only=mine')), { list: 'records', only: 'mine' })
  assert.deepEqual(finderOf(['w'], q('only=zzz')), { list: 'records', only: null }, '모르는 거름은 전체')
  assert.deepEqual(finderOf(['d', '2026-0101-a'], q('')), { list: 'records', only: null })
  assert.deepEqual(finderOf(['d', 'docs', 'a.md'], q(''), { list: 'docs', only: 'pending' }), { list: 'docs', only: null }, '문서 목록에는 거름이 없다')
  assert.equal(isRecordId('2026-0925-x'), true)
  assert.equal(isRecordId('README.md'), false)
  assert.equal(isRecordId('docs/a'), false)
  assert.equal(isRecordId(''), false)
})

test('없는 주소 · 권한 밖 주소 — 그리지 않고 바꿔 쓴다(D4)', () => {
  const at = (path) => screenOf({ path, server: true })
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), WRITER), '/r/alpha/', 'writer 가 대기열 주소 → 문서')
  assert.equal(redirectOf(at('/r/alpha/manage/forms/public-si/DE_431'), VIEWER), '/r/alpha/')
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), CURATOR), null, '큐레이터는 그대로')
  assert.equal(redirectOf(at('/r/gamma/manage/curation'), CURATOR), '/r/gamma/', '다른 레포의 큐레이터는 아니다')
  assert.equal(redirectOf(at('/r/alpha/manage/zzz'), ADMIN), '/r/alpha/manage', '없는 관리 주소 → 현황')
  assert.equal(redirectOf(at('/r/alpha/manage/info'), ADMIN), '/r/alpha/manage', '옛 「정보」 는 내 계정 메뉴로 갔다')
  assert.equal(redirectOf(at('/r/alpha/manage/repo'), ADMIN), '/r/alpha/manage', '로컬 전용 탭은 서버에 없다')
  assert.equal(redirectOf(at('/r/alpha/zzz'), ADMIN), '/r/alpha/')
  assert.equal(redirectOf(at('/r/alpha/w/zzz'), ADMIN), '/r/alpha/')
  assert.equal(redirectOf(at('/r/delta/manage/curation'), ADMIN), null, '볼 수 없는 레포는 서버의 404 → /r?from= 길')
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), null), null, '세션 전에는 고치지 않는다')
  assert.equal(redirectOf(at('/console/zzz'), ADMIN), '/console')
  assert.equal(redirectOf(at('/console/users'), WRITER), null, '비관리자 콘솔은 Console 의 문장(403 과 같은 말)')
  assert.equal(redirectOf(screenOf({ path: '/manage/curation', server: false }), null), '/manage', '로컬')
  assert.equal(redirectOf(screenOf({ path: '/', server: true }), ADMIN), null, '사이트')
})

test('빵부스러기 · 탭 제목 · 메뉴의 레포', () => {
  const s = screenOf({ path: '/r/alpha/manage/curation/log/2026-1007-c', server: true })
  assert.deepEqual(crumbOf(s).map((c) => c.label), ['alpha', '큐레이션', '이력', '2026-1007-c'])
  assert.equal(crumbOf(s)[0].to, '/r/alpha/')
  assert.equal(titleOf(s), '이력 · alpha · CDP')
  const c = screenOf({ path: '/console/tokens', server: true })
  assert.deepEqual(crumbOf(c).map((x) => x.label), ['서버', '토큰'])
  assert.equal(titleOf(c), '서버 › 토큰 · CDP')
  const f = screenOf({ path: '/r/alpha/manage/forms/public-si/DE_431', server: true })
  assert.deepEqual(crumbOf(f).map((x) => x.label), ['alpha', '큐레이션', '서식집', 'public-si/DE_431'])
  assert.deepEqual(crumbOf(screenOf({ path: '/r/alpha/zzz', server: true })), [], '없는 주소는 빵부스러기 없음')
  assert.equal(navRepoOf('repo', 'alpha', null), 'alpha')
  assert.equal(navRepoOf('console', null, ADMIN, 'gamma'), 'gamma', '마지막으로 본 레포')
  assert.equal(navRepoOf('console', null, ADMIN, 'delta'), 'alpha', '볼 수 없으면 첫 레포')
  assert.equal(navRepoOf('console', null, { ...ADMIN, repos: [] }, null), null)
  assert.equal(navRepoOf('local', null, null), null)
  assert.equal(repoBase('a b'), '/r/a%20b/')
  assert.equal(faceOf('/r/%EA%B0%80/', true).repo, '가', '레포 이름은 풀어서')
  assert.equal(currentItem('site', []), null)
})
