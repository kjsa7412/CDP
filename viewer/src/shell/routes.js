// 주소 → 화면. **주소가 상태다**(§6.6.2) — 셸(메뉴 · 빵부스러기 · 탭 제목 · 없는/권한 밖 주소)과 App · 관리 화면이
// 같은 함수로 주소를 읽는다. 전에는 App 이 관리 탭을 한 조각만 읽었고(`rest[1]`) 콘솔은 따로 읽었다.
//
//   얼굴       주소                                              화면
//   레포       /r/<레포>/                                        문서(왼쪽 = 관리 문서 목록)
//              /r/<레포>/d/<id>[?at=&v=]                         문서 하나(왼쪽 = 고른 목록 · 없으면 문서 종류로)
//              /r/<레포>/w[?only=pending|mine]                   작업 기록(왼쪽 = 기록 목록 · 거름)
//              /r/<레포>/graph                                   좌표 · 그래프
//              /r/<레포>/manage[/overview|docs|work]             작업실 › 현황 · 관리 문서 · 작업 레포 연결(write 이상)
//              /r/<레포>/manage/curation[/log[/<id>]]            작업실 › 대기열 — 탭 둘(대기열 · 이력)
//              /r/<레포>/manage/drift                           작업실 › 진단(리빌딩)
//              /r/<레포>/manage/forms[/<묶음>/<id>][?tab=]       작업실 › 관리 문서 › 문서 추가 › 서식집(탭 · curate)
//              /r/<레포>/manage/docs?add=forms                   → 위 서식집 탭(다음 할 일의 주소)
//   콘솔       /console[/repos|people|server]                    서버 묶음 넷 · 옛 페이지(workrepos · users · tokens · audit)는 바꿔 쓴다
//   사이트     그 밖 전부(/ · /manual · /login · /setup · /r)    소개 · 설명서 · 로그인 · 마법사 · 레포 고르기
//
// 화면은 늘 서버(`ctx serve` · 개인 서버 `--personal`)가 낸다 — 로컬 얼굴(PC 의 뷰어 · `/` 가 레포였던 것)은 v1.0 에 없앴다(개편안 §5.6).
// 서버는 `/r/<레포>/` 아래 아무 주소에나 같은 index.html 을 낸다 — 새 주소에 서버 고칠 것이 없다(개편안 §7.3).
// React 를 import 하지 않는다(`lib/router.jsx` 의 modeOf 도 이것을 쓴다).

import { NAV, AREAS, groupOf, areaOf, currentItem, repoBase, isRecordRest } from './nav.js'
import { can, canRead } from '../lib/roles.js'

const dec = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// 얼굴 — **주소 하나로 정한다.** 전에는 `/r/` 밖에서 로컬(`/` 가 레포)과 서버(`/` 가 소개)를 가를 수 없어 서버가 심은
// 표식(`window.__CDP_SERVER__`)을 받았다. 로컬 얼굴이 없어져 표식 없이 갈린다 — vite 개발 서버(표식 없음)도 같은 얼굴이다.
export function faceOf(path = '/') {
  const seg = String(path).split('/').filter(Boolean).map(dec)
  if (seg[0] === 'r' && seg[1]) return { repo: seg[1], face: 'repo', rest: seg.slice(2) }
  return { repo: null, face: seg[0] === 'console' ? 'console' : 'site', rest: seg }
}

const ONLY = ['pending', 'mine']
export const onlyOf = (v) => (ONLY.includes(v) ? v : null)
const get = (q, k) => (q && typeof q.get === 'function' ? q.get(k) : null)

// 왼쪽 목록 — 'docs'(관리 문서) · 'records'(작업 기록) + 거름. 문서 주소(`/d/…`)에서는 **고른 사람이 정한 것**(히스토리 항목의
// `cdp.list` · `cdp.only`)을 따른다 — 기록을 읽다 본문 링크로 용어집에 가도 왼쪽은 기록 목록이다(옛 범위 칩과 같은 규칙).
// 받은 링크처럼 히스토리에 없으면 문서의 종류로.
export function finderOf(rest = [], query = null, hist = null) {
  if (rest[0] === 'w') return { list: 'records', only: onlyOf(get(query, 'only')) }
  if (rest[0] === 'd') {
    const list = hist?.list === 'records' || hist?.list === 'docs' ? hist.list : isRecordRest(rest) ? 'records' : 'docs'
    return { list, only: list === 'records' ? onlyOf(hist?.only) : null }
  }
  return { list: 'docs', only: null }
}

const FORM_TABS = ['stamp', 'guide', 'example']

// 콘솔의 옛 페이지 → 새 자리(제품화 2 ⑥ · 화면 22 → 16). 북마크 · 설명서의 옛 링크가 깨지지 않게 **바꿔 쓴다**(replace).
// 값은 함수 — 옛 주소의 거름(`?user=` · `?repo=`)을 들고 간다
export const CONSOLE_ALIAS = {
  workrepos: () => '/console/repos?wr=1',
  users: (q) => '/console/people' + (get(q, 'repo') ? '?repo=' + encodeURIComponent(get(q, 'repo')) : ''),
  tokens: (q) => '/console/people' + (get(q, 'user') ? '?user=' + encodeURIComponent(get(q, 'user')) : '#tokens'),
  audit: () => '/console/server#audit',
}
// 콘솔 페이지 하나로 가는 주소 — 옛 이름도 받는다(현황의 경고 줄 `to` 가 서버에서 온다)
export const consoleHref = (page) => (CONSOLE_ALIAS[page] ? CONSOLE_ALIAS[page](null) : '/console' + (page && page !== 'overview' ? '/' + page : ''))

// 주소 하나를 화면으로 — 셸 · App · 관리 화면이 이것 하나를 본다.
//   item     메뉴 표의 항목(없으면 없는 주소)
//   tab      관리 화면이 그릴 것 · page 는 콘솔이 그릴 것
//   sub      화면 안의 탭 — 대기열 'queue' · 'log' / 관리 문서 'list' · 'forms'
//   logId    큐레이션 이력에서 펼친 기록 · form 은 서식집에서 고른 서식({ group, id }) · formTab 은 그 탭
//   finder   왼쪽 목록(읽기 화면)
//   alias    이 주소가 옛 · 별칭 주소면 바꿔 쓸 새 주소(redirectOf 가 먼저 본다)
export function screenOf({ path = '/', query = null, hist = null } = {}) {
  const m = faceOf(path)
  const rest = m.face === 'console' ? m.rest.slice(1) : m.rest
  const finder = m.face === 'repo' ? finderOf(rest, query, hist) : null
  const item = currentItem(m.face, rest)
  const out = { ...m, rest, item, finder, tab: item?.tab || null, page: item?.page || null, sub: null, logId: null, form: null, formTab: null, alias: null }
  if (item?.key === 'queue') {
    out.sub = rest[2] === 'log' ? 'log' : 'queue'
    if (out.sub === 'log' && rest[3]) out.logId = rest[3]
  }
  if (item?.key === 'managed') {
    out.sub = rest[1] === 'forms' ? 'forms' : 'list'
    if (out.sub === 'forms') {
      if (rest.length === 4) out.form = { group: rest[2], id: rest[3] }
      const t = get(query, 'tab')
      out.formTab = FORM_TABS.includes(t) ? t : 'stamp'
    } else if (get(query, 'add') === 'forms') out.alias = repoBase(m.repo) + 'manage/forms'
  }
  if (m.face === 'console' && !item && rest.length === 1 && CONSOLE_ALIAS[rest[0]]) out.alias = CONSOLE_ALIAS[rest[0]](query)
  return out
}

// 메뉴가 가리키는 레포 — 레포 얼굴은 주소의 레포, 콘솔은 **마지막으로 본 레포**(볼 수 있을 때만 · 셸 설계 §3)
export function navRepoOf(face, repo, me, last = null) {
  if (face === 'repo') return repo
  if (face !== 'console' || !me) return null
  if (last && canRead(me, last)) return last
  const first = (me.repos || [])[0]
  return first ? (typeof first === 'string' ? first : first.name) : null
}

// 빵부스러기 — [{ label, to? }]. 레포 › 묶음 › 화면(› 이력 id · 서식 id). 콘솔은 서버 › 화면.
// 작업실은 묶음(만든다 · 정리한다 · 세운다) 대신 영역 이름 — 「alpha › 작업실 › 대기열」
// 화면 이름 — 메뉴 항목 이름. 읽기는 왼쪽 목록으로(문서 · 작업 기록), 탭은 그 탭 이름까지
const SUB_LABEL = { log: '이력', forms: '서식집' }
const screenLabel = (s) => (s.item.key === 'docs' ? (s.finder?.list === 'records' ? '작업 기록' : '문서') : s.item.label)

export function crumbOf(s) {
  if (!s || !s.item) return []
  const g = groupOf(s.item.group)
  if (s.face === 'console') return [{ label: g.label }, { label: s.item.label, to: s.item.to() }]
  const mid = areaOf(s.item) === 'studio' ? AREAS.find((a) => a.key === 'studio').label : g.label
  const out = [{ label: s.repo, to: repoBase(s.repo) }, { label: mid }, { label: screenLabel(s), to: s.item.to(s.repo) }]
  if (SUB_LABEL[s.sub]) out.push({ label: SUB_LABEL[s.sub], to: s.item.key === 'queue' ? repoBase(s.repo) + 'manage/curation/log' : repoBase(s.repo) + 'manage/forms' })
  if (s.logId) out.push({ label: s.logId })
  if (s.form) out.push({ label: `${s.form.group}/${s.form.id}` })
  return out
}

// 탭 제목 — `<화면> · <레포> · CDP`(콘솔 `서버 › <화면> · CDP`). 규칙은 `<페이지> · CDP` 하나(화면 UX 검토 v0.1 P3)
export function titleOf(s) {
  if (!s?.item) return null
  if (s.face === 'console') return `서버 › ${s.item.label} · CDP`
  return `${SUB_LABEL[s.sub] || screenLabel(s)} · ${s.repo} · CDP`
}

// 없는 주소 · 권한 밖 주소 — **그리지 않고 바꿔 쓴다**(replace · D4 — 「권한이 필요합니다」 로 존재를 알리지 않는다).
//   옛 · 별칭 주소 → 새 주소(alias) · 없는 관리 주소 → 현황 · 그 밖의 없는 주소 → 문서 · 권한 밖 → 문서
//   작업실은 write 이상 · 관리 문서 · 서식집은 큐레이터 — 아니면 보기로(작업실 검토 G3)
//   볼 수 없는 레포는 여기서 고치지 않는다 — 서버가 404 를 주고 App 이 `/r?from=` 으로 보낸다(없는 레포와 같은 길)
//   콘솔의 비관리자는 Console 이 서버의 403 과 같은 문장을 낸다(명부에 관리자가 0명인 서버를 세우는 길을 그 문장이 든다)
export function redirectOf(s, me = null) {
  if (!s) return null
  if (s.alias) return s.alias
  if (s.face === 'repo') {
    const base = repoBase(s.repo)
    // 없는 작업실 주소 → 현황 — 작업실이 없는 사람(viewer)은 곧장 보기로(두 번 바꿔 쓰지 않게)
    if (!s.item) return s.rest[0] === 'manage' && (!me || can(me, 'write', s.repo)) ? base + 'manage' : base
    if (!me || !canRead(me, s.repo)) return null
    if (!can(me, s.item.need, s.repo)) return base
    return null
  }
  if (s.face === 'console') return s.item ? null : '/console'
  return null
}

// 콘솔 페이지 이름들 — Console 이 그릴 수 있는 것(메뉴 표에서)
export const CONSOLE_PAGES = NAV.filter((it) => it.page).map((it) => it.page)
