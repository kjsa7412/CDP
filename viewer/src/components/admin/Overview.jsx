// 현황 — **질문은 하나다: 지금 CDP 를 쓸 수 있는 상태인가.**
//
// 카드 넷에 답이 있고, 각 카드는 자기 메뉴로 간다. 여기서 고치지 않는다.
//
// `/api/status` 를 **이 화면이 처음 쓴다.** 파생 남은 섹션·깨진 섹션·미등재는
// 지금까지 검사 오버레이 안에서만 볼 수 있었다 — 그런데 그것은 "무엇이 커밋을
// 막았나" 를 보는 자리지 "레포가 지금 어떤가" 를 보는 자리가 아니다.
//
// **알림을 만들지 않는다**(설계서 제4부). 이 화면은 사람이 열었을 때 말한다.

import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mark, Mono, Note, Btn, when } from './ui.jsx'

export default function Overview({ repo, sync, diag, onGo, onCheck, onSync }) {
  const [status, setStatus] = useState(null)
  const [git, setGit] = useState(null)
  const [work, setWork] = useState(null)

  useEffect(() => {
    api.status().then(setStatus).catch(() => setStatus(null))
    api.git(false).then(setGit).catch(() => setGit(null))
    api.workRepos().then(setWork).catch(() => setWork(null))
  }, [sync?.phase])

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
          actions={<Btn onClick={() => onGo('repo')}>자세히</Btn>}
        >
          <Row label="보고 있는 곳">
            <Mono>{(repo?.root || '').split(/[\\/]/).filter(Boolean).pop()}</Mono>
          </Row>
          <Row label="담긴 것">
            문서 <b className="num">{repo?.docs ?? 0}</b> · 좌표 <b className="num">{repo?.coords ?? 0}</b>
          </Row>
          <Row label="마지막 스캔" mark={repo?.watchEnabled && !repo?.watchAlive ? 'warn' : null}>
            <span className="amuted">
              {diag?.scannedAt ? when(diag.scannedAt) : '–'} ·{' '}
              {repo?.watchEnabled ? (repo?.watchAlive ? '감시 중' : '감시 끊김') : '감시 꺼짐'}
            </span>
          </Row>
        </Card>

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

        <Card title="문서 상태" hint="ctx brief 와 같은 계산">
          <Row label="파생 남은 섹션" mark={status?.pendingDerive?.length ? 'warn' : null}>
            <b className="num">{status?.pendingDerive?.length ?? '–'}</b> 곳
          </Row>
          <Row label="깨진 섹션" mark={status?.brokenSections?.length ? 'bad' : null}>
            <b className="num">{status?.brokenSections?.length ?? '–'}</b> 곳
          </Row>
          <Row label="미등재 좌표" mark={status?.unregistered?.length ? 'warn' : null}>
            <b className="num">{status?.unregistered?.length ?? '–'}</b> 개
          </Row>
        </Card>
      </div>

      <Card title="작업 레포" actions={<Btn onClick={() => onGo('work')}>자세히</Btn>}>
        {!work ? (
          <span className="amuted">읽는 중…</span>
        ) : repos.length === 0 ? (
          <span className="amuted">등록된 작업 레포가 없습니다 — 코드 레포에 규약과 skill 을 넣으려면 등록하세요.</span>
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
        되돌릴 수 없고, 그때 <i>"알림이 안 왔으니 없는 것"</i> 이라는 더 나쁜 오해가 자리 잡습니다.
      </Note>
    </>
  )
}
