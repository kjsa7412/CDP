// 레포 관리 › 현황 — **질문은 하나다: 지금 CDP 를 쓸 수 있는 상태인가.**
//
// 맨 위는 「시작하기」(다음 할 일 — 서버가 역할 × 상태로 계산 · 다 끝나면 없다). 카드마다 답이 있고, 각 카드는 자기 메뉴로 간다.
// 여기서 고치지 않는다. 큐레이션은 대기열로 가는 한 줄 · 작업 레포 카드는 등록이 있을 때만(없으면 시작하기가 말한다).
//
// **큐레이션 카드**(개편안 S6) — 대기 · 가장 오래된 · 미반영 섹션 · 마지막. 옛 「문서 상태 › 파생 남은 섹션」(오류였다)이 이것으로
// 바뀌었다 — 관리 문서는 큐레이션으로만 바뀌고(I6) 늦은 반영은 막는 오류가 아니라 **상태**다(I7). 서버가 값을 안 내면 카드가 없다.
// 깨진 섹션 · 미등재는 `/api/status` 그대로 「문서 상태」 에 남는다.
// 내려받기(zip)는 읽기 화면의 빈 상태로 갔다 — 읽는 사람의 일이라 레포 관리에 둘 것이 아니었다.
// 없는 상태를 그리지 않는다(불변조건 7). 알림을 만들지 않는다(설계서 제4부) — 그 근거는 설계서에 있고 화면에는 없다(안내 글 규칙 ④).

import { api, currentRepo } from '../../lib/api.js'
import { navigate } from '../../lib/router.jsx'
import { repoBase } from '../../shell/nav.js'
import { useResource } from '../../lib/cache.js'
import { can } from '../../lib/roles.js'
import { Link } from '../../lib/router.jsx'
import Start from '../Start.jsx'
import { Card, Row, Mono, Btn } from './ui.jsx'

// 큐레이션 대기가 이만큼 오래되면 경고(개편안 §5.2 curation-stale)
const STALE_DAYS = 14

// 미러 상태 다섯 — 사실만(동시 기록 검토 v0.1 §5.7). 고치는 것은 서버 › 지식 레포.
const MIRROR = { ok: [null, '최신 — origin 과 같다'], lag: ['warn', 'origin 에 못 보냄'], diverged: ['bad', 'origin 과 갈림'], behind: ['warn', 'origin 이 앞서 있다'], off: [null, '원격 없음'] }

export default function Overview({ repo, me = null, onCheck }) {
  // 전부 캐시(화면 · 권한 검토 v0.1 R8) — 탭을 오가도 「읽는 중…」 이 다시 뜨지 않는다. 키는 레포 + 경로.
  // 이 레포의 미러 상태는 `/repos` 의 자기 행(사유 포함 · 상태바와 **같은 키** — 요청 하나).
  // 작업 레포는 **대장**(`/workrepos`)의 이 레포 것 — 연결된 작업 레포 화면과 같은 키.
  const rk = currentRepo()
  const st = useResource('api:' + rk + '/status', api.status)
  const rows = useResource('/repos', api.repos, { ttl: 15_000 })
  const reg = useResource('/workrepos', api.registry)
  const status = st.data || null
  const mine = (rows.data || []).find((r) => r.name === rk) || null
  const work = reg.data ? { repos: (reg.data.repos || []).filter((r) => r.knowledge === rk) } : reg.error ? { repos: [], failed: true } : null

  const c = repo?.checkCounts || { error: 0, warn: 0, info: 0 }
  const repos = work?.repos || []
  const cnt = (s) => repos.filter((r) => r.state === s).length

  return (
    <>
      <Start repo={rk} />
      <div className="agrid">
        <Card title="지식 레포">
          <Row label="보고 있는 곳">
            <Mono>{(repo?.root || '').split(/[\\/]/).filter(Boolean).pop()}</Mono>
          </Row>
          <Row label="담긴 것">
            작업 기록 <b className="num">{repo?.docs ?? 0}</b> · 좌표 <b className="num">{repo?.coords ?? 0}</b>
          </Row>
        </Card>

        {/* **단추가 없다.** 미는 것은 서버 자신이다(§4.5) — 여기서 보는 것은 상태 한 값과 사유다(동시 기록 검토 v0.1 D3).
            고치는 단추는 서버 › 지식 레포(관리자 · 재인증). */}
        <Card title="미러" hint="커밋 · push 는 save 마다 서버가">
          <Row label="상태" mark={mine ? (mine.dirty > 0 ? 'bad' : (MIRROR[mine.mirror] || MIRROR.off)[0]) : null}>
            {mine ? (MIRROR[mine.mirror] || MIRROR.off)[1] : <span className="amuted">–</span>}
            {mine && (mine.mirror === 'lag' || mine.mirror === 'diverged') ? <> · 보낼 것 <b className="num">{mine.ahead}</b> 건</> : null}
            {mine && mine.mirror === 'behind' ? <> · 받을 것 <b className="num">{mine.behind}</b> 건</> : null}
            {mine?.dirty > 0 ? <> · 트리 더러움 <b className="num">{mine.dirty}</b> 건</> : null}
          </Row>
          {mine?.note && (
            <Row label="사유">
              <span className="awarn">{mine.note}</span>
            </Row>
          )}
          {/* 푸는 단추는 서버 › 지식 레포 — 관리자에게만 길을 보인다(권한 밖 일은 안내하지 않는다 · 안내 글 규칙 ③) */}
          {me?.admin && mine && (mine.dirty > 0 || ['lag', 'diverged', 'behind'].includes(mine.mirror)) && (
            <Row label="푸는 곳">
              <Link to="/console/repos">서버 › 지식 레포 →</Link>
            </Row>
          )}
        </Card>

        {/* save 는 **그 save 가 새로 만든 오류**로만 막힌다 — 레포에 원래 있던 오류는 경고로 싣는다(v1.0 V21) */}
        <Card title="검증" hint="오류를 새로 만드는 save 는 거절된다" actions={<Btn onClick={onCheck}>검사 결과</Btn>}>
          <Row label="오류" mark={c.error > 0 ? 'bad' : null}>
            <b className="num">{c.error}</b> 건
          </Row>
          <Row label="경고" mark={c.warn > 0 ? 'warn' : null}>
            <b className="num">{c.warn}</b> 건
          </Row>
          {c.error === 0 && c.warn === 0 && (
            <Row label="지금">
              <span className="amuted">통과</span>
            </Row>
          )}
        </Card>


        <Card title="문서 상태" hint="ctx brief 와 같은 계산">
          <Row label="깨진 섹션" mark={status?.brokenSections?.length ? 'bad' : null}>
            <b className="num">{status?.brokenSections?.length ?? '–'}</b> 곳
          </Row>
          <Row label="미등재 좌표" mark={status?.unregistered?.length ? 'warn' : null}>
            <b className="num">{status?.unregistered?.length ?? '–'}</b> 개
          </Row>
        </Card>
      </div>

      {/* 큐레이션 — 대기 기록으로 가는 한 줄. 큐레이터는 「시작하기」 의 대기 줄이 같은 일을 한다(같은 단추를 두 곳에 두지 않는다) */}
      {repo?.curation?.queue > 0 && !can(me, 'curate', rk) && <CurationLine cur={repo.curation} />}

      {repos.length > 0 && (
        <Card title="연결된 작업 레포" actions={<Btn onClick={() => navigate(repoBase(rk) + 'manage/work')}>자세히</Btn>}>
          {/* 대장의 상태 이름 셋 — 최신 · 낡음 · 미설치(§6.7.2) */}
          <Row label="설치 상태" mark={cnt('낡음') || cnt('미설치') ? 'warn' : null}>
            등록 <b className="num">{repos.length}</b>곳 · 최신 <b className="num">{cnt('최신')}</b>
            {cnt('낡음') > 0 && <> · 낡음 <b className="num">{cnt('낡음')}</b></>}
            {cnt('미설치') > 0 && <> · 미설치 <b className="num">{cnt('미설치')}</b></>}
          </Row>
        </Card>
      )}
    </>
  )
}

// 큐레이션 한 줄 — 큐레이터가 아닌 사람에게. 갈 곳은 작업 기록의 「대기」 거름(못 할 일을 띄우지 않는다)
function CurationLine({ cur }) {
  const base = repoBase(currentRepo())
  const old = typeof cur.oldestDays === 'number' && cur.oldestDays > STALE_DAYS
  return (
    <Card title="큐레이션">
      <Row label="대기" mark={old ? 'warn' : null}>
        <b className="num">{cur.queue}</b> 기록
        {typeof cur.oldestDays === 'number' && <span className={old ? 'awarn' : 'amuted'}> · 가장 오래된 {cur.oldestDays}일</span>}
        <span className="topbar__spacer" />
        <Link to={base + 'w?only=pending'}>대기 기록 →</Link>
      </Row>
    </Card>
  )
}
