// 큐레이터 폴더 — 에이전트 지시를 붙일 Claude Code 가 도는 자리. **처음 한 번** 세운다.
// 작업 레포 설치 한 줄과 같은 설치기 · 같은 명령 짓기(`lib/install.js`) — `--curator` 라 git 도 대장 등록도 없고, 서버가 그 토큰이
// 이 레포의 큐레이터일 때만 큐레이터 kit(스킬 다섯 · 큐레이터 블록)을 준다(`/kit/<레포>?as=json` · 아니면 설치기가 거절한다).
//
// 두 자리에 뜬다 — 큐레이션 › 대기열(접어 둔다 · 매일 여는 화면) · 레포 관리 › 연결된 작업 레포(펼쳐 둔다 · 설치를 찾아오는 화면).
// 등록된 작업 레포는 누가 받든 writer kit(스킬 셋)이다 — 팀이 같이 커밋하는 자리라 큐레이터 스킬을 섞지 않는다.

import { useState } from 'react'
import { installCommand, guessShell } from '../../lib/install.js'
import { Card, Note, Cmd, ShellTabs } from './ui.jsx'

export default function CuratorFolder({ repo, folded = true }) {
  const [shell, setShell] = useState(guessShell)
  const cmd = installCommand(shell, { origin: window.location.origin, repo, curator: true })
  const body = (
    <div className="howto">
      <ShellTabs shell={shell} setShell={setShell} />
      <Cmd>{cmd}</Cmd>
      <Note>
        설치기를 임시 폴더에 받아 돌립니다 — 그 폴더에는 <code>.mcp.json</code> · <code>.claude/</code>(스킬 다섯 — 작업 레포의 셋 + <code>cdp-curate</code> ·{' '}
        <code>cdp-registry</code>) · <code>CLAUDE.md</code>(큐레이터 블록)만 들어갑니다. git 레포가 아니어도 되고 작업 레포 대장에 오르지 않습니다.
        토큰을 물으면 <b>이 레포의 큐레이터</b> 토큰을 붙여넣습니다(이 PC 에서 처음일 때만) — 큐레이터가 아니면 설치기가 거절합니다. 끝나면 그 폴더에서
        Claude Code 를 다시 켜고, 큐레이션 › 대기열의 「에이전트 지시 복사」 를 붙입니다.
      </Note>
    </div>
  )
  return (
    <Card title="큐레이터 폴더" hint="큐레이터만 · 처음 한 번 · 자기 PC 에서">
      {folded ? (
        <details className="howto-more">
          <summary>큐레이션은 코드가 없는 아무 폴더에서 한다 · 이 한 줄을 그 폴더에서</summary>
          {body}
        </details>
      ) : (
        <>
          <Note>큐레이션은 작업 레포가 아니라 <b>코드가 없는 아무 폴더</b>에서 합니다 — 그 폴더에서 이 한 줄을 붙여넣습니다.</Note>
          {body}
        </>
      )}
    </Card>
  )
}
