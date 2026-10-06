// 주소 → 화면. **주소가 상태다**(§6.6.2) — 셸(메뉴 · 빵부스러기 · 탭 제목 · 없는/권한 밖 주소)과 App · 관리 화면이
// 같은 함수로 주소를 읽는다. 전에는 App 이 관리 탭을 한 조각만 읽었고(`rest[1]`) 콘솔은 따로 읽었다.
//
//   얼굴       주소                                              화면
//   레포       /r/<레포>/                                        문서(왼쪽 = 관리 문서 목록)
//              /r/<레포>/d/<id>[?at=&v=]                         문서 하나(왼쪽 = 고른 목록 · 없으면 문서 종류로)
//              /r/<레포>/w[?only=pending|mine]                   작업 기록(왼쪽 = 기록 목록 · 거름)
//              /r/<레포>/graph                                   좌표 · 그래프
//              /r/<레포>/manage[/overview|docs|work]             레포 관리
//              /r/<레포>/manage/curation[/log[/<id>]]            큐레이션 › 대기열 · 이력
//              /r/<레포>/manage/forms[/<묶음>/<id>][?tab=]       큐레이션 › 서식집
//   콘솔       /console[/<page>]                                 서버 묶음
//   로컬       같은 꼴에서 `/r/<레포>` 만 뺀 것(+ manage/repo · sync · diag)
//
// 서버는 `/r/<레포>/` 아래 아무 주소에나 같은 index.html 을 낸다 — 새 주소에 서버 고칠 것이 없다(개편안 §7.3).
// React 를 import 하지 않는다(`lib/router.jsx` 의 modeOf 도 이것을 쓴다).

import { NAV, groupOf, currentItem, repoBase, isRecordRest } from './nav.js'
import { can, canRead } from '../lib/roles.js'

const dec = (s) => {
  try {
    return decodeURIComponent(s)
  } catch {
    return s
  }
}

// 얼굴 — 주소가 말해 준다. `/r/` 밖에서는 경로만으로 로컬과 서버를 가를 수 없어(둘 다 `/`) 서버가 index.html 에 심은
// 표식(`window.__CDP_SERVER__`)을 `server` 로 받는다.
export function faceOf(path = '/', server = false) {
  const seg = String(path).split('/').filter(Boolean).map(dec)
  if (seg[0] === 'r' && seg[1]) return { server: true, repo: seg[1], face: 'repo', rest: seg.slice(2) }
  if (server) return { server: true, repo: null, face: seg[0] === 'console' ? 'console' : 'site', rest: seg }
  return { server: false, repo: null, face: 'local', rest: seg }
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

// 주소 하나를 화면으로 — 셸 · App · 관리 화면이 이것 하나를 본다.
//   item     메뉴 표의 항목(없으면 없는 주소)
//   tab      관리 화면이 그릴 것 · page 는 콘솔이 그릴 것
//   logId    큐레이션 이력에서 펼친 기록 · form 은 서식집에서 고른 서식({ group, id }) · formTab 은 그 탭
//   finder   왼쪽 목록(문서 화면)
export function screenOf({ path = '/', query = null, server = false, hist = null } = {}) {
  const m = faceOf(path, server)
  const rest = m.face === 'console' ? m.rest.slice(1) : m.rest
  const finder = m.face === 'repo' || m.face === 'local' ? finderOf(rest, query, hist) : null
  const item = currentItem(m.face, rest, finder)
  const out = { ...m, rest, item, finder, tab: item?.tab || null, page: item?.page || null, logId: null, form: null, formTab: null }
  if (item?.key === 'log' && rest[3]) out.logId = rest[3]
  if (item?.key === 'forms') {
    if (rest.length === 4) out.form = { group: rest[2], id: rest[3] }
    const t = get(query, 'tab')
    out.formTab = FORM_TABS.includes(t) ? t : 'stamp'
  }
  return out
}

// 메뉴가 가리키는 레포 — 레포 얼굴은 주소의 레포, 콘솔은 **마지막으로 본 레포**(볼 수 있을 때만 · 셸 설계 §3). 로컬은 null
export function navRepoOf(face, repo, me, last = null) {
  if (face === 'repo') return repo
  if (face !== 'console' || !me) return null
  if (last && canRead(me, last)) return last
  const first = (me.repos || [])[0]
  return first ? (typeof first === 'string' ? first : first.name) : null
}

// 빵부스러기 — [{ label, to? }]. 레포 › 묶음 › 화면(› 이력 id · 서식 id). 콘솔은 서버 › 화면
export function crumbOf(s) {
  if (!s || !s.item) return []
  const g = groupOf(s.item.group)
  if (s.face === 'console') return [{ label: g.label }, { label: s.item.label, to: s.item.to() }]
  const base = repoBase(s.face === 'repo' ? s.repo : null)
  const out = []
  if (s.face === 'repo') out.push({ label: s.repo, to: base })
  out.push({ label: g.label })
  out.push({ label: s.item.label, to: s.item.to(s.face === 'repo' ? s.repo : null) })
  if (s.logId) out.push({ label: s.logId })
  if (s.form) out.push({ label: `${s.form.group}/${s.form.id}` })
  return out
}

// 탭 제목 — `<화면> · <레포> · CDP`(콘솔 `서버 › <화면> · CDP`). 규칙은 `<페이지> · CDP` 하나(화면 UX 검토 v0.1 P3)
export function titleOf(s) {
  if (!s?.item) return null
  if (s.face === 'console') return `서버 › ${s.item.label} · CDP`
  if (s.face === 'repo') return `${s.item.label} · ${s.repo} · CDP`
  return `${s.item.label} · CDP`
}

// 없는 주소 · 권한 밖 주소 — **그리지 않고 바꿔 쓴다**(replace · D4 — 「권한이 필요합니다」 로 존재를 알리지 않는다).
//   없는 관리 주소 → 현황 · 그 밖의 없는 주소 → 문서 · 권한 밖 → 문서
//   볼 수 없는 레포는 여기서 고치지 않는다 — 서버가 404 를 주고 App 이 `/r?from=` 으로 보낸다(없는 레포와 같은 길)
//   콘솔의 비관리자는 Console 이 서버의 403 과 같은 문장을 낸다(명부에 관리자가 0명인 서버를 세우는 길을 그 문장이 든다)
export function redirectOf(s, me = null) {
  if (!s) return null
  if (s.face === 'repo' || s.face === 'local') {
    const base = repoBase(s.face === 'repo' ? s.repo : null)
    if (!s.item) return s.rest[0] === 'manage' ? base + 'manage' : base
    if (s.face === 'local' || !me || !canRead(me, s.repo)) return null
    return can(me, s.item.need, s.repo) ? null : base
  }
  if (s.face === 'console') return s.item ? null : '/console'
  return null
}

// 콘솔 페이지 이름들 — Console 이 그릴 수 있는 것(메뉴 표에서)
export const CONSOLE_PAGES = NAV.filter((it) => it.page).map((it) => it.page)
