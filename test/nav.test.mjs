// 메뉴 표 · 주소 · 역할 — 화면의 순수 함수(개편안 §7.2 · V18). 역할 × 얼굴마다 **보이는 항목**을 고정한다.
// 화면이 숨기는 것은 예의이고 막는 것은 서버다 — 그래도 못 할 일을 띄워 놓고 403 을 내지 않게, 보이는 것을 여기서 지킨다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { can, canRead, curateOf } from '../viewer/src/lib/roles.js'
import { NAV, navGroups, navItems, navAreas, areaNow, areaHome, areaOf, currentItem, isRecordId, repoBase } from '../viewer/src/shell/nav.js'
import { faceOf, finderOf, screenOf, crumbOf, titleOf, redirectOf, navRepoOf, consoleHref, CONSOLE_PAGES } from '../viewer/src/shell/routes.js'

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
  const know = '지식:읽기·좌표 · 그래프'
  const make = '만든다:작업 레포 연결'
  const tidy = '정리한다:대기열·진단'
  const build = '세운다:관리 문서 · 서식집·현황'
  const buildW = '세운다:현황'
  const srv = '서버:현황·지식 레포·사람·서버'
  assert.deepEqual(groups({ face: 'repo', me: VIEWER, repo: 'alpha' }), [know], 'viewer — 보기 하나(작업실 묶음은 제목째 없다 · V18 정정)')
  assert.deepEqual(groups({ face: 'repo', me: WRITER, repo: 'alpha' }), [know, make, buildW], 'writer — 작업 레포 연결 · 현황')
  assert.deepEqual(groups({ face: 'repo', me: CURATOR, repo: 'alpha' }), [know, make, tidy, build], '그 레포의 큐레이터')
  assert.deepEqual(groups({ face: 'repo', me: CURATOR, repo: 'gamma' }), [know, make, buildW], '다른 레포에서는 writer 와 같다')
  assert.deepEqual(groups({ face: 'repo', me: ADMIN, repo: 'alpha' }), [know, make, tidy, build, srv], 'admin — 전부')
  assert.deepEqual(groups({ face: 'repo', me: null, repo: 'alpha' }), [], '세션이 없으면 아무것도')
  // 로컬 전용 셋(지식 레포 · 동기화 · 진단)은 v1.0 에 없앴다 — 표에 그 항목도 그 표지도 없다
  assert.ok(!NAV.some((it) => it.key.startsWith('local-') || 'local' in it || 'server' in it), '로컬 · 서버 얼굴 표지 없음')
  for (const me of [VIEWER, WRITER, ADMIN]) {
    const k = keys({ face: 'repo', me, repo: 'alpha' })
    assert.ok(!k.some((x) => x.startsWith('local-')), 'local- 항목 없음')
  }
})

test('영역 셋 — 보기 · 작업실 · 서버(지식 생성 · 작업실 검토 G1~G3)', () => {
  const areas = (me, face = 'repo', repo = 'alpha') => navAreas({ face, me, repo }).map((a) => a.key)
  assert.deepEqual(areas(VIEWER), ['read'], 'viewer — 보기 하나 · 스위치 없음')
  assert.deepEqual(areas(WRITER), ['read', 'studio'])
  assert.deepEqual(areas(CURATOR), ['read', 'studio'])
  assert.deepEqual(areas(ADMIN), ['read', 'studio', 'server'])
  assert.deepEqual(areas(ADMIN, 'console', null), ['server'], '콘솔에 레포가 없으면 서버만')
  // 왼쪽 메뉴는 지금 영역의 묶음만
  const at = (area, me = ADMIN) => navGroups({ face: 'repo', me, repo: 'alpha', area }).map((g) => g.label)
  assert.deepEqual(at('read'), ['지식'])
  assert.deepEqual(at('studio'), ['만든다', '정리한다', '세운다'])
  assert.deepEqual(at('server'), ['서버'])
  assert.deepEqual(at('studio', VIEWER), [], 'viewer 는 작업실 항목 0')
  // 모든 항목은 영역이 있다 · 보기 영역에는 쓰는 화면이 없다(need 가 read 뿐)
  for (const it of NAV) assert.ok(['read', 'studio', 'server'].includes(areaOf(it)), it.key)
  assert.ok(NAV.filter((it) => areaOf(it) === 'read').every((it) => it.need === 'read'), '보기는 read 만')
  assert.ok(NAV.filter((it) => areaOf(it) === 'studio').every((it) => it.need === 'write' || it.need === 'curate'), '작업실은 write 이상')
  // 지금 영역
  assert.equal(areaNow('repo', screenOf({ path: '/r/alpha/d/README.md' }).item), 'read')
  assert.equal(areaNow('repo', screenOf({ path: '/r/alpha/manage/curation' }).item), 'studio')
  assert.equal(areaNow('repo', null), 'read', '없는 주소는 보기')
  assert.equal(areaNow('console', null), 'server')
  // 영역의 첫 주소 — 큐레이터는 대기열 · writer 는 작업실 첫 항목
  assert.equal(areaHome('studio', { me: CURATOR, repo: 'alpha' }), '/r/alpha/manage/curation')
  assert.equal(areaHome('studio', { me: WRITER, repo: 'alpha' }), '/r/alpha/manage/work')
  assert.equal(areaHome('read', { me: WRITER, repo: 'alpha' }), '/r/alpha/')
  assert.equal(areaHome('server', { me: ADMIN }), '/console')
})

test('보이는 묶음 — 콘솔 얼굴 · 메뉴 없는 얼굴', () => {
  // 콘솔 — 메뉴의 레포는 마지막으로 본 레포. 없으면 레포 묶음 없이 서버만
  assert.deepEqual(
    navGroups({ face: 'console', me: ADMIN, repo: null }).map((g) => g.label),
    ['서버']
  )
  assert.deepEqual(navGroups({ face: 'console', me: ADMIN, repo: 'alpha', area: 'server' }).map((g) => g.label), ['서버'], '콘솔의 왼쪽 메뉴는 서버 영역')
  assert.deepEqual(navGroups({ face: 'console', me: WRITER, repo: 'alpha', area: 'server' }), [], '비관리자는 서버 묶음 없음')
  // 사이트 얼굴에는 메뉴가 없다 · 모르는 얼굴(옛 로컬)도 없다 — 판정 없이 다 보이던 갈래가 남지 않게
  assert.deepEqual(navGroups({ face: 'site', me: ADMIN, repo: 'alpha' }), [])
  assert.deepEqual(navGroups({ face: 'local', me: null, repo: null }), [])
  assert.deepEqual(navGroups({ face: 'local', me: ADMIN, repo: 'alpha' }), [])
})

test('얼굴 — 주소 하나로 정한다(서버 표식 없이 · 로컬 얼굴 없음)', () => {
  assert.deepEqual(faceOf('/'), { repo: null, face: 'site', rest: [] }, '/ 는 소개')
  assert.equal(faceOf('/manual/사용자_설명서').face, 'site')
  assert.equal(faceOf('/r').face, 'site', '/r 은 레포 고르기(사이트)')
  assert.equal(faceOf('/r/').face, 'site')
  assert.equal(faceOf('/console').face, 'console')
  assert.equal(faceOf('/console/users').face, 'console')
  assert.deepEqual(faceOf('/r/alpha/manage/docs'), { repo: 'alpha', face: 'repo', rest: ['manage', 'docs'] })
  // 옛 로컬 주소(`/manage/sync` · `/w`)는 사이트의 없는 주소다 — 레포 화면으로 읽지 않는다
  for (const p of ['/manage/sync', '/manage/repo', '/w', '/graph', '/d/README.md']) {
    const s = screenOf({ path: p })
    assert.equal(s.face, 'site', p)
    assert.equal(s.item, null, p)
    assert.equal(redirectOf(s, ADMIN), null, `${p} — 사이트는 바꿔 쓰지 않는다(없는 주소 화면)`)
  }
})

test('주소 — 메뉴의 to 와 match 가 짝이다(눌러 간 곳이 그 항목으로 칠해진다)', () => {
  for (const it of NAV) {
    const path = it.scope === 'server' ? it.to() : it.to('alpha')
    const s = screenOf({ path })
    assert.equal(s.item?.key, it.key, `${it.key} — ${path}`)
    assert.equal(redirectOf(s, ADMIN), null, `${it.key} — admin 은 바꿔 쓰지 않는다`)
  }
  assert.deepEqual(CONSOLE_PAGES, ['overview', 'repos', 'people', 'server'])
})

test('메뉴 수 — viewer 2 · writer 4 · curator 7 · admin 11(작업실 검토 G3 — 작업실은 write 이상)', () => {
  const n = (me) => navItems({ face: 'repo', me, repo: 'alpha' }).length
  assert.equal(n(VIEWER), 2)
  assert.equal(n(WRITER), 4)
  assert.equal(n(CURATOR), 7)
  assert.equal(n(ADMIN), 11)
  assert.equal(new Set(NAV.map((it) => it.key)).size, NAV.length, '키는 하나씩')
})

test('주소 — 옛 주소는 그대로 열린다 · 탭 주소 · 거름 주소', () => {
  const at = (path, query = '', hist = null) => screenOf({ path, query: new URLSearchParams(query), hist })
  // 읽기 — 문서 · 작업 기록이 한 화면(왼쪽 목록 위 세그). `/w` 는 기록 목록의 주소로 남는다
  assert.equal(at('/r/alpha/').item.key, 'docs')
  assert.equal(at('/r/alpha/w').item.key, 'docs', '/w — 읽기 화면 · 기록 목록')
  assert.deepEqual(at('/r/alpha/w', 'only=pending').finder, { list: 'records', only: 'pending' })
  assert.equal(at('/r/alpha/d/docs/2.개발/DE_431_테이블정의서.md').item.key, 'docs')
  assert.equal(at('/r/alpha/d/README.md').item.key, 'docs', '기타 문서는 문서')
  assert.equal(at('/r/alpha/d/2026-0925-우수회원-한도-정정').item.key, 'docs', '기록도 읽기')
  assert.equal(at('/r/alpha/d/2026-0925-우수회원-한도-정정').finder.list, 'records', '받은 기록 링크 — 왼쪽은 기록 목록')
  assert.deepEqual(at('/r/alpha/d/docs/x.md', '', { list: 'records', only: 'pending' }).finder, { list: 'records', only: 'pending' }, '고른 목록이 이긴다')
  assert.equal(at('/r/alpha/graph').item.key, 'graph')
  assert.equal(at('/r/alpha/manage').item.key, 'overview')
  assert.equal(at('/r/alpha/manage/overview').item.key, 'overview')
  assert.equal(at('/r/alpha/manage/docs').item.tab, 'docs')
  assert.equal(at('/r/alpha/manage/docs').sub, 'list')
  assert.equal(at('/r/alpha/manage/work').item.key, 'linked')
  // 대기열 — 탭 둘. 이력은 탭 주소(옛 메뉴 「이력」 의 주소 그대로)
  assert.equal(at('/r/alpha/manage/curation').item.key, 'queue')
  assert.equal(at('/r/alpha/manage/curation').sub, 'queue')
  assert.equal(at('/r/alpha/manage/curation/log').item.key, 'queue')
  assert.equal(at('/r/alpha/manage/curation/log').sub, 'log')
  assert.equal(at('/r/alpha/manage/curation/log/2026-1007-큐레이션').logId, '2026-1007-큐레이션')
  assert.equal(at('/r/alpha/manage/curation/log/a/b').item, null, '이력 아래 둘 — 없는 주소')
  // 서식집 — 관리 문서의 탭(옛 메뉴 「서식집」 의 주소 그대로)
  const f = at('/r/alpha/manage/forms/public-si/DE_431', 'tab=guide')
  assert.equal(f.item.key, 'managed')
  assert.equal(f.sub, 'forms')
  assert.deepEqual(f.form, { group: 'public-si', id: 'DE_431' })
  assert.equal(f.formTab, 'guide')
  assert.equal(at('/r/alpha/manage/forms').sub, 'forms')
  assert.equal(at('/r/alpha/manage/forms', 'tab=nope').formTab, 'stamp', '모르는 탭은 첫 탭')
  assert.equal(at('/r/alpha/manage/forms/public-si').item, null, '묶음만 — 없는 주소')
  // 다음 할 일의 주소(core/nextsteps.js — `manage/docs?add=forms`)는 서식집 탭으로 바꿔 쓴다
  assert.equal(at('/r/alpha/manage/docs', 'add=forms').alias, '/r/alpha/manage/forms')
  assert.equal(redirectOf(at('/r/alpha/manage/docs', 'add=forms'), CURATOR), '/r/alpha/manage/forms')
  // 콘솔 — 넷. 옛 페이지 넷은 새 자리로(북마크가 깨지지 않게)
  assert.equal(at('/console').item.key, 'con-overview')
  assert.equal(at('/console/overview').item.page, 'overview')
  assert.equal(at('/console/people').item.label, '사람')
  assert.equal(at('/console/server').item.label, '서버')
  const old = (p, q = '') => redirectOf(at(p, q), ADMIN)
  assert.equal(old('/console/workrepos'), '/console/repos?wr=1')
  assert.equal(old('/console/users'), '/console/people')
  assert.equal(old('/console/users', 'repo=alpha'), '/console/people?repo=alpha')
  assert.equal(old('/console/tokens'), '/console/people#tokens')
  assert.equal(old('/console/tokens', 'user=lee'), '/console/people?user=lee')
  assert.equal(old('/console/audit'), '/console/server#audit')
  assert.equal(consoleHref('tokens'), '/console/people#tokens', '현황 경고 줄의 옛 이름도 새 자리로')
  assert.equal(consoleHref('repos'), '/console/repos')
  assert.equal(consoleHref('overview'), '/console')
  // 옛 로컬 전용 탭 — 레포 얼굴에서도 없는 주소다(셸이 현황으로 바꿔 쓴다)
  for (const tab of ['repo', 'sync', 'diag']) assert.equal(at('/r/alpha/manage/' + tab).item, null, tab)
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
  const at = (path) => screenOf({ path })
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), WRITER), '/r/alpha/', 'writer 가 대기열 주소 → 문서')
  assert.equal(redirectOf(at('/r/alpha/manage/drift'), WRITER), '/r/alpha/', 'writer 가 진단 주소 → 문서(어긋남 진단은 큐레이터의 것)')
  assert.equal(redirectOf(at('/r/alpha/manage/forms/public-si/DE_431'), VIEWER), '/r/alpha/', 'viewer 가 서식집 탭 → 보기(작업실이 없다)')
  assert.equal(redirectOf(at('/r/alpha/manage/forms'), WRITER), '/r/alpha/', 'writer 도 — 관리 문서 · 서식집은 큐레이터의 것')
  assert.equal(redirectOf(at('/r/alpha/manage'), VIEWER), '/r/alpha/', 'viewer 가 현황 → 보기(V18 정정)')
  assert.equal(redirectOf(at('/r/alpha/manage/work'), VIEWER), '/r/alpha/', 'viewer 가 작업 레포 연결 → 보기')
  assert.equal(redirectOf(at('/r/alpha/manage/work'), WRITER), null, 'writer 는 작업 레포 연결')
  assert.equal(redirectOf(at('/r/alpha/manage/docs'), WRITER), '/r/alpha/', 'writer 가 관리 문서 → 보기(읽기는 보기의 「읽기」)')
  assert.equal(redirectOf(at('/r/alpha/manage/forms'), CURATOR), null)
  assert.equal(redirectOf(at('/r/alpha/manage/curation/log'), WRITER), '/r/alpha/', 'writer 가 이력 주소 → 문서')
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), CURATOR), null, '큐레이터는 그대로')
  assert.equal(redirectOf(at('/r/gamma/manage/curation'), CURATOR), '/r/gamma/', '다른 레포의 큐레이터는 아니다')
  assert.equal(redirectOf(at('/r/alpha/manage/zzz'), ADMIN), '/r/alpha/manage', '없는 관리 주소 → 현황')
  assert.equal(redirectOf(at('/r/alpha/manage/info'), ADMIN), '/r/alpha/manage', '옛 「정보」 는 내 계정 메뉴로 갔다')
  for (const tab of ['repo', 'sync', 'diag']) assert.equal(redirectOf(at('/r/alpha/manage/' + tab), ADMIN), '/r/alpha/manage', `옛 로컬 전용 탭(${tab})은 없다 — 현황으로`)
  assert.equal(redirectOf(at('/r/alpha/zzz'), ADMIN), '/r/alpha/')
  assert.equal(redirectOf(at('/r/alpha/w/zzz'), ADMIN), '/r/alpha/')
  assert.equal(redirectOf(at('/r/delta/manage/curation'), ADMIN), null, '볼 수 없는 레포는 서버의 404 → /r?from= 길')
  assert.equal(redirectOf(at('/r/alpha/manage/curation'), null), null, '세션 전에는 고치지 않는다')
  assert.equal(redirectOf(at('/console/zzz'), ADMIN), '/console')
  assert.equal(redirectOf(at('/console/people'), WRITER), null, '비관리자 콘솔은 Console 의 문장(403 과 같은 말)')
  assert.equal(redirectOf(at('/console/users'), WRITER), '/console/people', '옛 주소는 누구에게나 새 자리로 — 그 뒤는 같은 문장')
  assert.equal(redirectOf(at('/'), ADMIN), null, '사이트')
})

test('빵부스러기 · 탭 제목 · 메뉴의 레포', () => {
  const s = screenOf({ path: '/r/alpha/manage/curation/log/2026-1007-c' })
  assert.deepEqual(crumbOf(s).map((c) => c.label), ['alpha', '작업실', '대기열', '이력', '2026-1007-c'])
  assert.equal(crumbOf(s)[0].to, '/r/alpha/')
  assert.equal(titleOf(s), '이력 · alpha · CDP')
  const c = screenOf({ path: '/console/people' })
  assert.deepEqual(crumbOf(c).map((x) => x.label), ['서버', '사람'])
  assert.equal(titleOf(c), '서버 › 사람 · CDP')
  const f = screenOf({ path: '/r/alpha/manage/forms/public-si/DE_431' })
  assert.deepEqual(crumbOf(f).map((x) => x.label), ['alpha', '작업실', '관리 문서 · 서식집', '서식집', 'public-si/DE_431'])
  assert.deepEqual(crumbOf(screenOf({ path: '/r/alpha/zzz' })), [], '없는 주소는 빵부스러기 없음')
  assert.equal(titleOf(screenOf({ path: '/r/alpha/w' })), '작업 기록 · alpha · CDP', '읽기 — 왼쪽 목록의 이름')
  assert.equal(titleOf(screenOf({ path: '/r/alpha/' })), '문서 · alpha · CDP')
  assert.equal(navRepoOf('repo', 'alpha', null), 'alpha')
  assert.equal(navRepoOf('console', null, ADMIN, 'gamma'), 'gamma', '마지막으로 본 레포')
  assert.equal(navRepoOf('console', null, ADMIN, 'delta'), 'alpha', '볼 수 없으면 첫 레포')
  assert.equal(navRepoOf('console', null, { ...ADMIN, repos: [] }, null), null)
  assert.equal(navRepoOf('site', null, ADMIN, 'alpha'), null, '사이트에는 메뉴가 없다')
  assert.equal(repoBase('a b'), '/r/a%20b/')
  assert.equal(faceOf('/r/%EA%B0%80/').repo, '가', '레포 이름은 풀어서')
  assert.equal(currentItem('site', []), null)
  assert.equal(currentItem('local', []), null, '옛 로컬 얼굴은 메뉴 항목이 없다')
})
