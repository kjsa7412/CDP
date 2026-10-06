// 레포 관리 › 현황 — **질문은 하나다: 지금 CDP 를 쓸 수 있는 상태인가.**
//
// 카드마다 답이 있고, 각 카드는 자기 메뉴로 간다. 여기서 고치지 않는다.
//
// **큐레이션 카드**(개편안 S6) — 대기 · 가장 오래된 · 미반영 섹션 · 마지막. 옛 「문서 상태 › 파생 남은 섹션」(오류였다)이 이것으로
// 바뀌었다 — 관리 문서는 큐레이션으로만 바뀌고(I6) 늦은 반영은 막는 오류가 아니라 **상태**다(I7). 서버가 값을 안 내면 카드가 없다.
// 깨진 섹션 · 미등재는 `/api/status` 그대로 「문서 상태」 에 남는다.
// 내려받기(zip)는 문서 화면의 빈 상태로 갔다 — 읽는 사람의 일이라 레포 관리에 둘 것이 아니었다.
//
// **알림을 만들지 않는다**(설계서 제4부). 이 화면은 사람이 열었을 때 말한다.

import { useEffect } from 'react'
import { api, isServer, currentRepo } from '../../lib/api.js'
import { navigate } from '../../lib/router.jsx'
import { repoBase } from '../../shell/nav.js'
import { useResource } from '../../lib/cache.js'
import { can } from '../../lib/roles.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mark, Mono, Note, Btn, when } from './ui.jsx'

// 큐레이션이 이만큼 밀리면 경고(개편안 §5.2 curation-stale)
const STALE_DAYS = 14

// 서버형의 미러 상태 다섯 — 사실만(동시 기록 검토 v0.1 §5.7). 고치는 것은 콘솔.
const MIRROR = { ok: [null, '최신 — origin 과 같다'], lag: ['warn', '밀림'], diverged: ['bad', 'origin 과 갈림'], behind: ['warn', 'origin 이 앞서 있다'], off: [null, '원격 없음'] }

export default function Overview({ repo, sync, diag, me = null, onCheck, onSync }) {
  // 전부 캐시(화면 · 권한 검토 v0.1 R8) — 탭을 오가도 「읽는 중…」 이 다시 뜨지 않는다. 키는 레포 + 경로.
  // 서버형 — 이 레포의 미러 상태는 `/repos` 의 자기 행(사유 포함 · 상태바와 **같은 키** — 요청 하나). `/api/<레포>/git` 은 로컬형 문법이다.
  // 작업 레포는 **대장**(`/workrepos`)의 이 레포 것 — 관리 › 작업 레포와 같은 키.
  const server = isServer()
  const rk = currentRepo() || 'local'
  const st = useResource('api:' + rk + '/status', api.status)
  const rows = useResource('/repos', api.repos, { enabled: server, ttl: 15_000 })
  const reg = useResource('/workrepos', api.registry, { enabled: server })
  const gitR = useResource('api:local/git', () => api.git(false), { enabled: !server })
  const wrL = useResource('api:local/workrepos', api.workRepos, { enabled: !server })
  // 로컬 — 동기화가 끝나면 받을 것 · 설치 상태가 바뀐다
  useEffect(() => {
    if (server || !sync?.phase || sync.phase !== 'idle') return
    gitR.refresh().catch(() => {})
    wrL.refresh().catch(() => {})
    st.refresh().catch(() => {})
  }, [sync?.phase])
  const status = st.data || null
  const git = gitR.data || null
  const mine = server ? (rows.data || []).find((r) => r.name === rk) || null : null
  const work = server
    ? reg.data
      ? { repos: (reg.data.repos || []).filter((r) => r.knowledge === rk), server: true }
      : reg.error
        ? { repos: [], server: true, failed: true }
        : null
    : wrL.data || null

  const c = repo?.checkCounts || { error: 0, warn: 0, info: 0 }
  const running = sync && sync.phase && sync.phase !== 'idle'
  const last = sync?.last
  const repos = work?.repos || []
  const cnt = (s) => repos.filter((r) => r.state === s).length

  return (
    <>
      <div className="agrid">
        <Card
          title="지식 레포"
          // 「자세히」 는 로컬만 — 서버형에는 고를 경로가 없다(지식 레포 탭이 없어 누르면 현황으로 돌아왔다)
          actions={!isServer() ? <Btn onClick={() => navigate(repoBase(null) + 'manage/repo')}>자세히</Btn> : null}
        >
          <Row label="보고 있는 곳">
            <Mono>{(repo?.root || '').split(/[\\/]/).filter(Boolean).pop()}</Mono>
          </Row>
          <Row label="담긴 것">
            작업 기록 <b className="num">{repo?.docs ?? 0}</b> · 좌표 <b className="num">{repo?.coords ?? 0}</b>
          </Row>
          {/* 서버형에는 감시도 스캔 시각도 없다(`save` 뒤 재스캔) — 없는 상태를 그리지 않는다(불변조건 7) */}
          {!isServer() && (
            <Row label="마지막 스캔" mark={repo?.watchEnabled && !repo?.watchAlive ? 'warn' : null}>
              <span className="amuted">
                {diag?.scannedAt ? when(diag.scannedAt) : '–'} ·{' '}
                {repo?.watchEnabled ? (repo?.watchAlive ? '감시 중' : '감시 끊김') : '감시 꺼짐'}
              </span>
            </Row>
          )}
        </Card>

        {/* **서버 모드는 버튼이 없다.** 미는 것은 서버 자신이다(§4.5) —
            여기서 보는 것은 상태 한 값과 사유다(동시 기록 검토 v0.1 D3). 고치는 단추는 콘솔(관리자 · 재인증). */}
        {isServer() ? (
          <Card title="미러">
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
            {/* 못 들어가는 곳을 안내하지 않는다 — writer · viewer 에게는 「관리자에게」(화면 · 권한 검토 v0.1 P6 · R4) */}
            <Note>
              커밋과 push 는 서버가 합니다 — <code>save</code> 가 끝날 때마다. 밀림 · 갈림 · 더러움을 푸는 단추는{' '}
              {me?.admin ? <><b>서버 › 지식 레포</b>에 있습니다.</> : <><b>관리자</b>에게 있습니다(서버 › 지식 레포).</>}
            </Note>
          </Card>
        ) : (
        <Card
          title="동기화"
          actions={
            <Btn kind="accent" onClick={onSync} disabled={!!running}>
              <Icon name="sync" size={13} /> {running ? '도는 중…' : '지금 받기'}
            </Btn>
          }
        >
          <Row label="받을 것" mark={git?.behind > 0 ? 'warn' : null}>
            <b className="num">{git?.behind ?? '–'}</b> 건
          </Row>
          <Row label="보낼 것" mark={git?.ahead > 0 ? 'warn' : null}>
            <b className="num">{git?.ahead ?? '–'}</b> 건
          </Row>
          <Row label="직전 결과" mark={last && !last.ok ? 'bad' : null}>
            {running ? (
              <span>도는 중…</span>
            ) : last ? (
              <span className={last.ok ? 'amuted' : 'awarn'}>
                {last.line} · {when(last.at)}
              </span>
            ) : (
              <span className="amuted">이번 실행에서는 아직</span>
            )}
          </Row>
        </Card>
        )}

        <Card title="검증" actions={<Btn onClick={onCheck}>검사 결과</Btn>}>
          <Row label="커밋을 막는 것" mark={c.error > 0 ? 'bad' : null}>
            <b className="num">{c.error}</b> 건
          </Row>
          <Row label="경고" mark={c.warn > 0 ? 'warn' : null}>
            <b className="num">{c.warn}</b> 건
          </Row>
          {c.error === 0 && c.warn === 0 && (
            <Row label="지금">
              <span className="amuted">통과 — 커밋할 수 있습니다</span>
            </Row>
          )}
        </Card>

        {/* 큐레이션 — 섹션 뒤에 아직 반영 안 된 기록. 서버가 값을 낼 때만(`/api/<레포>/repo` 의 curation) */}
        {repo?.curation && <CurationCard cur={repo.curation} me={me} />}

        <Card title="문서 상태" hint="ctx brief 와 같은 계산">
          <Row label="깨진 섹션" mark={status?.brokenSections?.length ? 'bad' : null}>
            <b className="num">{status?.brokenSections?.length ?? '–'}</b> 곳
          </Row>
          <Row label="미등재 좌표" mark={status?.unregistered?.length ? 'warn' : null}>
            <b className="num">{status?.unregistered?.length ?? '–'}</b> 개
          </Row>
        </Card>
      </div>

      <Card title="연결된 작업 레포" actions={<Btn onClick={() => navigate(repoBase(isServer() ? currentRepo() : null) + 'manage/work')}>자세히</Btn>}>
        {!work ? (
          <span className="amuted">읽는 중…</span>
        ) : work.failed ? (
          <span className="amuted">대장을 읽지 못했습니다 — 작업 레포 메뉴에서 다시 봅니다.</span>
        ) : repos.length === 0 ? (
          <span className="amuted">등록된 작업 레포가 없습니다 — 코드 레포에 규약과 skill 을 넣으려면 등록하세요.</span>
        ) : work.server ? (
          // 서버형 대장의 상태 이름 셋 — 최신 · 낡음 · 미설치(§6.7.2)
          <Row label="설치 상태" mark={cnt('낡음') || cnt('미설치') ? 'warn' : null}>
            등록 <b className="num">{repos.length}</b>곳 · 최신 <b className="num">{cnt('최신')}</b>
            {cnt('낡음') > 0 && <> · 낡음 <b className="num">{cnt('낡음')}</b></>}
            {cnt('미설치') > 0 && <> · 미설치 <b className="num">{cnt('미설치')}</b></>}
          </Row>
        ) : (
          <Row label="설치 상태" mark={cnt('update') || cnt('none') || cnt('error') ? 'warn' : null}>
            등록 <b className="num">{repos.length}</b>곳 · 최신 <b className="num">{cnt('ok')}</b>
            {cnt('update') > 0 && <> · 갱신 필요 <b className="num">{cnt('update')}</b></>}
            {cnt('none') > 0 && <> · 미설치 <b className="num">{cnt('none')}</b></>}
            {cnt('error') > 0 && <> · 오류 <b className="num">{cnt('error')}</b></>}
          </Row>
        )}
      </Card>

      <Note>
        이 화면은 <b>사람이 열었을 때만 말합니다.</b> 알림을 띄우지 않습니다 — 무시되기 시작하면
        되돌릴 수 없고, 그때 <i>"알림이 안 왔으니 없는 것"</i> 이라는 더 나쁜 오해가 자리 잡습니다. 내려받기(zip)는 문서 화면의 빈 상태(탭을 다 닫은 자리)에 있습니다.
      </Note>
    </>
  )
}

// 큐레이션 카드 — 단추는 갈 수 있는 곳으로만: 큐레이터는 대기열, 나머지는 작업 기록의 「대기」 거름(못 할 일을 띄우지 않는다)
function CurationCard({ cur, me }) {
  const rk = currentRepo()
  const base = repoBase(rk)
  const curator = can(me, 'curate', rk)
  const old = typeof cur.oldestDays === 'number' && cur.oldestDays > STALE_DAYS
  return (
    <Card
      title="큐레이션"
      actions={
        curator ? (
          <Btn onClick={() => navigate(base + 'manage/curation')}>대기열 열기</Btn>
        ) : cur.queue > 0 ? (
          <Btn onClick={() => navigate(base + 'w?only=pending')}>대기 기록 보기</Btn>
        ) : null
      }
    >
      <Row label="대기" mark={old ? 'warn' : null}>
        <b className="num">{cur.queue ?? '–'}</b> 기록
        {typeof cur.oldestDays === 'number' && cur.queue > 0 && (
          <span className={old ? 'awarn' : 'amuted'}>
            {' '}
            · 가장 오래된 {cur.oldestDays}일{old ? ` — ${STALE_DAYS}일을 넘겼다` : ''}
          </span>
        )}
      </Row>
      {cur.pendingSections != null && (
        <Row label="미반영 섹션">
          <b className="num">{cur.pendingSections}</b> 곳 <span className="amuted">— 어디서 보든 그 섹션의 미반영 기록이 같이 보인다</span>
        </Row>
      )}
      <Row label="마지막">
        {cur.last ? (
          <span className="amuted">
            {String(cur.last.date || '').slice(0, 10)} · {cur.last.author || '—'}
          </span>
        ) : (
          <span className="amuted">아직 없다</span>
        )}
      </Row>
    </Card>
  )
}
