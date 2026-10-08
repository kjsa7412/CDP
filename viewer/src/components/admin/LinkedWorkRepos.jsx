// 레포 관리 › 연결된 작업 레포 — 이 지식 레포를 쓰는 코드 레포. MCP 설계서 §6.7.3. 서버 전부의 설치 대장(서버 › 작업 레포 대장)과
// 다른 것이다 — 여기는 **이 레포의 것을 등록하고 설치 한 줄을 내주고 결과를 추적한다**(§6.7.1).
//
// 브라우저는 사용자 PC 에 파일을 쓸 수 없다. 그 제약을 우회하지 않고, 대신
// 사람이 자기 PC 에서 할 일을 한 줄(설치기가 묻고 · 병합하고 · 대장에 보고한다)로 줄였다.

import { useState } from 'react'
import { api, currentRepo } from '../../lib/api.js'
import { useResource } from '../../lib/cache.js'
import { installCommand, guessShell } from '../../lib/install.js'
import { can } from '../../lib/roles.js'
import CuratorFolder from './CuratorFolder.jsx'
import Icon from '../Icon.jsx'
import { Card, Row, Mono, Note, Btn, Cmd, ShellTabs } from './ui.jsx'
import { Confirm } from '../../console/ui.jsx'

// 표시 세 가지. **정상은 조용하다** — `ui.jsx` 의 규칙 그대로다.
const MARK = { 최신: 'ok', 낡음: 'warn', 미설치: 'none' }

export default function LinkedWorkRepos({ me = null, say }) {
  // 대장은 캐시(화면 · 권한 검토 v0.1 R8) — 관리 현황의 작업 레포 카드와 같은 키. 등록 · 삭제 뒤 refresh 가 둘 다 갱신한다
  const { data, error, refresh: load } = useResource('/workrepos', api.registry)
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState({ name: '', owner: '', note: '' })
  const [busy, setBusy] = useState(false)
  const [removing, setRemoving] = useState(null)
  // 서버의 규칙과 같다 — `core/workrepos.js` NAME_RE
  const nameOk = /^[^\s/\\][^/\\]{0,79}$/.test(form.name.trim())

  const submit = async (e) => {
    e?.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    try {
      await api.registryAdd({ name: form.name.trim(), knowledge: currentRepo(), owner: form.owner || null, note: form.note || null })
      setForm({ name: '', owner: '', note: '' })
      await load()
      say?.('등록했습니다')
    } catch (e) {
      say?.(e.message || '등록하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Note>{error ? '대장을 읽지 못했습니다 — ' + error.message : '대장을 읽는 중입니다…'}</Note>

  // **이 레포의 등록만.** 대장(`/workrepos`)은 볼 수 있는 레포 전부를 낸다 — 전에는 그것을 다 그려서 gdi 화면에
  // dpms_wiki 소속 작업 레포가 나오고, 그 행의 설치 명령이 gdi 로 나갔다(실서버 종합 시험 F1). 레포 관리 › 현황 카드와 같은 거름
  const repos = data.repos.filter((r) => r.knowledge === currentRepo())
  const stale = repos.filter((r) => r.state === '낡음')

  const remove = async () => {
    const r = removing
    setBusy(true)
    try {
      await api.registryDel(r.id)
      setRemoving(null)
      if (open === r.id) setOpen(null)
      await load()
      say?.(`${r.name} — 대장에서 지웠습니다`)
    } catch (e) {
      say?.(e.message || '지우지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      {stale.length > 0 && <UpdateAll rows={stale} />}
      <Card title="연결된 작업 레포" hint="이 지식 레포를 쓰는 코드 레포 — 어디에 무엇이 깔려 있나">
        {repos.length === 0 && <Note>등록된 작업 레포가 없습니다. 아래에서 등록하세요.</Note>}
        {repos.map((r) => (
          <Row key={r.id} label={r.name} mark={MARK[r.state] || 'none'} stack>
            <span className="wr-line">
              <span className="wr-state">{r.state}</span>
              <Mono>{r.applied?.kit || '—'}</Mono>
              <span className="wr-dim">
                {r.owner || '담당 없음'}
                {r.note ? ' · ' + r.note : ''}
                {r.applied ? ` · ${r.applied.at} ${r.applied.by}` : ''}
              </span>
              <Btn onClick={() => setOpen(open === r.id ? null : r.id)}>
                <Icon name="plug" size={13} /> 설치 방법
              </Btn>
              {data.write && (
                <Btn kind="quiet" onClick={() => setRemoving(r)} title="대장에서 지운다 — 작업 레포의 파일은 그대로다">
                  삭제
                </Btn>
              )}
            </span>
          </Row>
        ))}

        {open && <HowTo row={repos.find((r) => r.id === open)} curator={can(me, 'curate', currentRepo())} />}
      </Card>
      {/* 설치는 역할에 따라 둘이다 — 작업 레포(writer kit · 스킬 셋 · 팀이 커밋) · 큐레이터 폴더(큐레이터 kit · 스킬 다섯 · 이 PC 에만) */}
      {can(me, 'curate', currentRepo()) && <CuratorFolder repo={currentRepo()} folded={false} />}
      {removing && (
        <Confirm
          title={`${removing.name} — 대장에서 지우기`}
          text={`작업 레포 ${removing.name}(${removing.id}) 의 등록을 지웁니다. 그 레포에 깔린 파일과 Claude Code 연결은 그대로입니다 — 대장이 그 레포를 더 세지 않을 뿐입니다. 감사에 남습니다.`}
          okLabel="지운다"
          danger
          busy={busy}
          onClose={() => setRemoving(null)}
          onOk={remove}
        />
      )}

      {!data.write ? (
        <Card title="등록" hint="쓰기 권한이 필요합니다">
          <Note>
            등록·삭제는 <code>write</code> 가 있는 사람만 할 수 있습니다. 목록과 설치 방법은 그대로 보입니다.
          </Note>
        </Card>
      ) : (
      <Card title="등록" hint="담당자는 이 레포를 볼 수 있는 사람 중에서">
        {/* <form> — Enter 로 등록된다(F10). 이름 형식은 칸 아래에서 말한다 — 말없이 꺼진 단추로 두지 않는다 */}
        <form className="wr-form" onSubmit={submit}>
          <input
            placeholder="작업 레포 이름 (예: my-app)"
            aria-label="작업 레포 이름"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select aria-label="담당자" value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
            <option value="">담당자 —</option>
            {(data.usersByRepo?.[currentRepo()] ?? data.users ?? []).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input placeholder="메모 (선택)" aria-label="메모" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <button type="submit" className="abtn abtn--quiet" disabled={busy || !nameOk}>
            등록
          </button>
        </form>
        {form.name && !nameOk && <Note tone="warn">이름에 / \ 는 쓸 수 없고 공백으로 시작할 수 없다 — 80자 안</Note>}
      </Card>
      )}
    </>
  )
}

// **토큰을 보여 주지 않는다**(§6.7.3). 화면도 명령도 원문을 들지 않는다 — 사람이 관리자에게 받아
// 설치기가 물을 때 붙여넣는다(설치 한 줄 TODO I3). 명령은 `lib/install.js` 한 곳에서 짓는다.
//
// **한 줄이 기본이다**(I1 · I6). 전에는 zip 을 받아 풀고 그 폴더로 가서 경로를 적고, 토큰은 따로
// `setx` 로 넣었다. 지금은 작업 레포 폴더에서 붙여넣는 한 줄이 설치기를 받고, 설치기가 토큰을 묻고
// 확인하고 이 PC 에 두고, kit 을 그 토큰으로 받아 병합하고, 대장에 보고한다. zip 은 Node 가 없거나
// 손으로 옮길 때의 길로 접어 둔다(I7).
//
// **사람이 하는 일만 적는다.** 병합이 무엇을 지키는지(`CLAUDE.md` 블록 · `.mcp.json` 의 다른 서버)는
// 설치기가 바뀔 것을 보여 주며 말한다 — 화면은 한 줄로 줄인다.

// 에이전트 세팅이 바뀌었다 — 서버 판이 오르면(upgrade 가 번들 kit/ 을 간다) 대장의 kit 해시와 달라져 행이 「낡음」 이 된다.
// **서버는 PC 에 못 쓴다**(§6.7.1) — 담당자가 자기 PC 에서 한 줄을 돌리면 설치기가 그 PC 에 이 서버로 설치한 작업 레포를
// 전부 돈다(설치 목록 · 에이전트 세팅 갱신 T9 · T10).
function UpdateAll({ rows }) {
  const [shell, setShell] = useState(guessShell)
  const owners = new Map()
  for (const r of rows) {
    const k = r.owner || '담당 없음'
    owners.set(k, [...(owners.get(k) || []), r.name])
  }
  const cmd = installCommand(shell, { origin: window.location.origin, update: true })
  return (
    <Card title="에이전트 세팅이 바뀌었습니다" hint={`낡음 ${rows.length}곳 — 담당자 PC 에서 한 줄`}>
      <div className="howto">
        <ol>
          <li>
            <b>담당자마다 자기 PC 에서</b> 이 한 줄 — 그 PC 에 이 서버로 설치한 작업 레포를 <b>전부</b> 갱신합니다.
            <ul className="wr-owners">
              {[...owners].map(([o, names]) => (
                <li key={o}>
                  <b>{o}</b> — {names.join(' · ')}
                </li>
              ))}
            </ul>
            <ShellTabs shell={shell} setShell={setShell} />
            <Cmd>{cmd}</Cmd>
            <Note>
              바뀔 것을 레포마다 보여 주고 한 번 묻습니다. 대장에 레포마다 보고합니다. 끝에 <code>--commit</code> 을 붙이면 레포마다{' '}
              <b>바꾼 파일만</b> 커밋합니다 — 그 파일을 고치던 중인 레포는 커밋하지 않고 알려 줍니다. 미리 보기만 하려면 <code>--dry</code>.
            </Note>
          </li>
          <li>
            목록에 없다고 하면 — 그 PC 에서 이 한 줄을 처음 쓰는 것입니다.
            <Note>
              아래 행의 [설치 방법] 한 줄로 한 번 설치하면 그 PC 의 설치 목록에 들어갑니다(이미 최신이어도 적힙니다). 그 뒤부터는 이 한 줄이 전부를 돕니다.
            </Note>
          </li>
          <li>
            커밋을 올리고, Claude Code 를 열어 둔 레포는 다시 켠다.
            <Note>팀원은 pull 로 받습니다 — 같은 한 줄을 돌릴 필요가 없습니다.</Note>
          </li>
        </ol>
      </div>
    </Card>
  )
}

function HowTo({ row, curator = false }) {
  const [shell, setShell] = useState(guessShell)
  if (!row) return null
  // 레포는 **행의 것**이다 — 지금 보는 레포가 아니다(F1). 서버 `/kit` 도 둘이 다르면 409 로 막는다
  const cmd = installCommand(shell, { origin: window.location.origin, repo: row.knowledge, id: row.id })
  return (
    <div className="howto">
      <ol>
        <li>
          <b>작업 레포 폴더에서</b> 이 한 줄을 붙여넣는다.
          <ShellTabs shell={shell} setShell={setShell} />
          <Cmd>{cmd}</Cmd>
          <Note>
            설치기를 임시 폴더에 받아 돌립니다 — 작업 레포에는 CDP 파일만 들어갑니다. 무엇이 바뀔지 먼저 보여 주고
            묻습니다. 여러 번 돌려도 됩니다 — 두 번째부터는 <b>이미 최신입니다</b>. Node 20 이상이 있어야 합니다.
          </Note>
          <Note>
            작업 레포에는 누가 설치하든 <b>기록하는 스킬 셋</b>(<code>cdp-work</code> · <code>cdp-save</code> · <code>cdp-push</code>)이 깔립니다 — 팀이 같이
            커밋하는 자리라서입니다.{' '}
            {curator ? (
              <>큐레이션 스킬(<code>cdp-curate</code> · <code>cdp-registry</code>)은 아래 <b>큐레이터 폴더</b> 한 줄로 따로 받습니다.</>
            ) : (
              <>큐레이션 스킬은 이 레포의 큐레이터가 큐레이터 폴더에서 받습니다.</>
            )}
          </Note>
        </li>
        <li>
          토큰을 물으면 붙여넣는다 — <b>이 PC 에서 처음일 때만.</b>
          <Note>
            관리자에게 받은 토큰입니다. 이 화면과 명령에는 토큰이 없습니다. 설치기가 서버에 맞는지 바로 확인하고,
            이 PC 에 둘지 묻습니다 — Windows 는 사용자 환경변수 <code>CDP_TOKEN</code>, macOS · Linux 는{' '}
            <code>~/.config/cdp/token</code>. Claude Code 가 이 값으로 서버에 붙습니다(<code>.mcp.json</code> 은 커밋되는
            파일이라 원문 대신 <code>${'{'}CDP_TOKEN{'}'}</code> 자리만 둡니다).
          </Note>
        </li>
        <li>
          Claude Code 를 <b>완전히</b> 끄고 다시 켠다.
          <Note>
            환경변수는 프로세스가 시작할 때 읽힙니다 — VS Code · 데스크톱 앱 안이면 그 앱을 다시 켭니다.{' '}
            <code>/mcp</code> 에 <code>cdp</code> 가 connected 면 된 것입니다.
          </Note>
        </li>
        <li>
          커밋한다.
          <Cmd>git add .mcp.json .claude CLAUDE.md</Cmd>
          <Note>팀원은 pull 뒤 같은 한 줄을 한 번 — 설치할 것은 없고, 토큰을 묻고 두고 대장에 보고합니다.</Note>
        </li>
      </ol>
      <details className="howto-more">
        <summary>Node 가 없거나 파일로 받아 손으로 옮길 때 — 꾸러미 zip</summary>
        <div>
          <a className="btn" href={api.kitUrl(row.id, row.knowledge)} download>
            <Icon name="copy" size={13} /> cdp-kit-{row.name}.zip 내려받기
          </a>
        </div>
        <Note>
          아무 데나 풀고 그 안에서 <code>node install.mjs &lt;작업 레포 경로&gt;</code> — 위 한 줄과 같은 일을 합니다. Node 가
          없으면 꾸러미 안 <code>설치.md</code> 의 「Node 가 없으면」 대로 손으로 옮깁니다.
        </Note>
      </details>
    </div>
  )
}
