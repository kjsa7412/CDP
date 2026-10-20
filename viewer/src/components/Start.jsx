// 시작하기 — 지금 이 사람이 할 일 한 줄씩. 제품화 2 검토 §5.5 · TODO ⑥.
//
// **부품 하나 · 자리 셋**(+ 그래프 빈 상태) — 읽기 화면의 빈 상태 · 레포 현황 맨 위 · 콘솔 현황 맨 위. 계산은 서버 한 곳
// (`GET /next` → `core/nextsteps.js`)이고 이 부품은 줄을 그릴 뿐이다 — CLI 의 끝 출력(`ctx up` · `repo new` · 설치기)과 같은 줄.
//
//   줄 = 사실 한 문장 + 할 일 하나(화면 주소 · 설치 한 줄) + `?`(설명서 절)
//   끝난 줄 · 권한 밖 줄은 서버가 이미 뺐다 — 빈 배열이면 **카드가 없다**(불변조건 7). 그 자리에 `empty` 를 그린다
//   읽는 동안은 아무것도 그리지 않는다 — 「읽는 중…」 으로 자리를 잡았다 사라지면 그것이 깜빡임이다
//   옛 서버(404)는 카드가 없다 · 그 밖의 실패는 한 줄로 말한다(조용히 지우지 않는다)
//   `who` — 자리마다 거른다(지식 생성 · 작업실 검토 G2). 보기의 빈 상태는 누구에게나 할 일(`any`)만 — write · curate 줄은
//   작업실 › 현황에서 낸다. 보기에서 작업실로 보내는 단추를 두지 않는다

import { useState } from 'react'
import { steps as readSteps, stepsKey } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import { Link } from '../lib/router.jsx'
import { installCommand, guessShell } from '../lib/install.js'
import { Card, Note, Cmd, ShellTabs, Mark } from './admin/ui.jsx'
import HelpLink from './HelpLink.jsx'

export default function Start({ repo = null, empty = null, who = null }) {
  const r = useResource(stepsKey(repo), () => readSteps(repo), { ttl: 30_000 })
  if (r.error) return r.error.status === 404 ? empty : <Note tone="warn">다음 할 일을 읽지 못했다 — {r.error.message}</Note>
  if (!r.data) return null
  const list = (r.data.steps || []).filter((s) => !who || who.includes(s.who))
  if (!list.length) return empty
  return (
    <Card title="시작하기" hint={`할 일 ${list.length}`}>
      <ol className="start">
        {list.map((s) => (
          <Step key={s.id} s={s} help={r.data.help} />
        ))}
      </ol>
    </Card>
  )
}

function Step({ s, help }) {
  const [open, setOpen] = useState(false)
  const [shell, setShell] = useState(guessShell)
  return (
    <li className="start__row" data-level={s.level || 'info'}>
      <div className="start__line">
        {s.level === 'warn' && <Mark kind="warn" />}
        <span className="start__fact">{s.fact}</span>
        <span className="topbar__spacer" />
        {s.go?.to && (
          <Link className="abtn abtn--accent" to={s.go.to}>
            {s.go.label} →
          </Link>
        )}
        {s.cmd?.args && (
          <button type="button" className="abtn" aria-expanded={open} onClick={() => setOpen((v) => !v)}>
            {open ? '접기' : '설치 한 줄'}
          </button>
        )}
        {s.help && <HelpLink topic={s.help} help={help} />}
      </div>
      {open && s.cmd?.args && (
        <div className="howto start__cmd">
          <ShellTabs shell={shell} setShell={setShell} />
          <Cmd>{installCommand(shell, { origin: window.location.origin, args: s.cmd.args })}</Cmd>
        </div>
      )}
    </li>
  )
}
