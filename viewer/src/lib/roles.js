// 역할 판정 — **화면의 것은 이 함수 하나다**(개편안 §7.2 · V18). 메뉴 · 단추 · 주소 고침이 전부 여기서 묻는다.
//
// 권한의 근거는 언제나 명부다 — 이 함수는 **숨기는 예의**이고 막는 것은 서버다(D4). 그래서 모르는 값은 거짓이다:
// 세션이 없거나 · 레포를 못 보거나 · 서버가 `curate` 를 아직 내지 않으면(옛 서버) 그 항목을 그리지 않는다.
//
//   read    그 레포를 볼 수 있다 — `/me` 의 repos 에 있다(admin 도 할당된 레포만 · auth.grantOf 의 allow)
//   write   read + writer · admin
//   curate  read + admin 이거나 `curate` 에 그 레포 · `*` 가 있다(admin 은 모든 레포의 큐레이터 — 개편안 §3.1)
//   admin   서버 전체 — 레포와 무관하다
//
// React 를 import 하지 않는다 — `node --test` 가 역할 × 화면을 고정한다(test/nav.test.mjs).

export const NEEDS = ['read', 'write', 'curate', 'admin']

const repoNames = (me) => (me?.repos || []).map((r) => (typeof r === 'string' ? r : r?.name)).filter(Boolean)

export function canRead(me, repo) {
  return !!me && !!repo && repoNames(me).includes(repo)
}

// 이 사람이 큐레이션하는 레포 — admin 은 `*` · 옛 서버(필드 없음)는 빈 목록
export function curateOf(me) {
  if (!me) return []
  if (me.admin) return ['*']
  return Array.isArray(me.curate) ? me.curate.filter((x) => typeof x === 'string' && x) : []
}

export function can(me, need, repo = null) {
  if (!me) return false
  if (need === 'admin') return !!me.admin
  if (!canRead(me, repo)) return false
  if (need === 'read') return true
  if (need === 'write') return !!(me.write || me.admin)
  if (need === 'curate') {
    const c = curateOf(me)
    return c.includes('*') || c.includes(repo)
  }
  return false
}
