// 진단 — **값만 낸다. 행동은 열기 둘뿐이다(데이터 폴더 · 로그 파일).**
//
// 콘솔 없는 exe 에서 문제가 나면 볼 데가 로그 파일뿐인데(§6.1), 그 파일이
// 어디 있는지 화면이 말한 적이 없었다. 탐색기로 `%LOCALAPPDATA%` 를 찾아가는
// 것이 유일한 길이었다.

import Icon from '../Icon.jsx'
import { api } from '../../lib/api.js'
import { Card, Row, Mono, PathText, Note, Btn, when } from './ui.jsx'

export default function Diag({ diag, repo, say }) {
  if (!diag) return <span className="amuted">읽는 중…</span>

  const open = (p) => api.open(p).catch(() => say?.('열지 못했습니다'))
  const stale = diag.appBundle && diag.repoBundle && diag.appBundle !== diag.repoBundle

  return (
    <>
      <Card title="이 프로그램">
        <Row label="버전">
          <Mono>{diag.version || '알 수 없음'}</Mono>
        </Row>
        <Row label="실행 형태">
          <span className="amuted">
            {diag.sea ? '단일 실행 파일(exe)' : 'node'} · node {diag.node} · pid {diag.pid}
          </span>
        </Row>
        <Row label="기동">
          <span className="amuted">{when(diag.startedAt)}</span>
        </Row>
        <Row label="git">
          {diag.git ? <Mono>{diag.git}</Mono> : <span className="awarn">git 이 없습니다 — 동기화가 되지 않습니다</span>}
        </Row>
      </Card>

      <Card title="번들 시각" hint="앱이 든 것과 레포가 든 것">
        <Row label="앱">
          {diag.appBundle ? <Mono>{diag.appBundle}</Mono> : <span className="amuted">(원본 실행 — 번들 아님)</span>}
        </Row>
        <Row label="레포" mark={stale ? 'warn' : null}>
          {diag.repoBundle ? <Mono>{diag.repoBundle}</Mono> : <span className="amuted">번들 없음</span>}
        </Row>
        {diag.repoBundlePath && (
          <Row label="레포의 ctx" stack>
            <PathText>{diag.repoBundlePath}</PathText>
          </Row>
        )}
        {stale && (
          <Note tone="warn">
            <b>둘이 다릅니다.</b> 레포의 <code>bin/ctx.mjs</code> 가 옛 판이면 git 훅은 옛 판정을 씁니다 —
            화면과 커밋 판정이 갈라지는 자리입니다.
          </Note>
        )}
      </Card>

      <Card title="파일이 어디에 있나">
        <Row label="데이터 폴더" stack>
          <PathText>{diag.dataDir}</PathText>
        </Row>
        <Row label="설정" stack>
          <PathText>{diag.stateFile}</PathText>
        </Row>
        <Row label="로그" stack>
          <PathText>{diag.logFile}</PathText>
        </Row>
        <div className="arow">
          <span className="topbar__spacer" />
          <Btn onClick={() => open(diag.dataDir)}>
            <Icon name="folder" size={13} /> 데이터 폴더 열기
          </Btn>
          <Btn onClick={() => open(diag.logFile)}>로그 열기</Btn>
        </div>
        <Note>
          로그는 회전 3개 × 1MB 입니다. <b>문서 내용·검색어·토큰은 쓰지 않습니다</b> — PC 를 안
          떠나는 것과 디스크에 남기는 것은 다른 문제입니다.
        </Note>
      </Card>

      <Card title="서버">
        <Row label="주소" mark={diag.hostWarning ? 'bad' : null}>
          <Mono>
            {diag.host}:{diag.port}
          </Mono>
        </Row>
        {diag.hostWarning && (
          <Note tone="bad">
            <b>loopback 이 아닌 주소에 열려 있습니다.</b> 같은 네트워크의 다른 PC 가 이 문서를 볼 수 있습니다.
          </Note>
        )}
        <Row label="유휴 종료">
          <span className="amuted">
            {diag.keepAlive ? '꺼짐 — 탭을 닫아도 계속 실행됩니다 (트레이에서 켠 것)' : '탭을 닫으면 90초 뒤 종료'}
          </span>
        </Row>
        <Row label="감시" mark={diag.watchEnabled && !diag.watchAlive ? 'warn' : null}>
          <span className="amuted">
            {!diag.watchEnabled ? '꺼짐 (--no-watch)' : diag.watchAlive ? '살아 있음' : '끊김 — 화면이 낡았을 수 있습니다'}
            {diag.scanMs != null && ` · 마지막 스캔 ${diag.scanMs}ms`}
          </span>
        </Row>
        <Row label="보는 레포" stack>
          <PathText>{diag.repoRoot}</PathText>
        </Row>
      </Card>
    </>
  )
}
