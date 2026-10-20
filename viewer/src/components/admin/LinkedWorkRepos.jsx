// 작업실 › 작업 레포 연결 — 이 지식 레포를 쓰는 코드 레포. MCP 설계서 §6.7.3. 서버 전부의 설치 대장(서버 › 지식 레포의 펼침 열)과
// 다른 것이다 — 여기는 **이 레포의 것을 등록하고 설치 한 줄을 내주고 결과를 추적한다**(§6.7.1).
//
// 브라우저는 사용자 PC 에 파일을 쓸 수 없다. 그 제약을 우회하지 않고, 대신 사람이 자기 PC 에서 할 일을 한 줄로 줄였다.
// 제품화 2 ⑥ — **등록하면 그 자리에 설치 한 줄이 펼쳐진다**(전에는 접혀 있어 새 writer 가 [설치 방법] 을 찾아야 했다) ·
// 설치 안내는 명령 한 줄 + 두 줄 + 설명서 절 링크 · 낡음(일괄 갱신)과 큐레이터 폴더는 「시작하기」 로 갔다 ·
// 등록 카드는 write 에게만(viewer 에게 못 할 일을 안내하지 않는다).

import { useState } from 'react'
import { api, currentRepo } from '../../lib/api.js'
import { invalidate, useResource } from '../../lib/cache.js'
import { installCommand, guessShell } from '../../lib/install.js'
import Icon from '../Icon.jsx'
import HelpLink from '../HelpLink.jsx'
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
      const r = await api.registryAdd({ name: form.name.trim(), knowledge: currentRepo(), owner: form.owner || null, note: form.note || null })
      setForm({ name: '', owner: '', note: '' })
      invalidate('/next')
      await load()
      // 등록 직후 그 행의 설치 한 줄을 편다 — 다음 할 일이 바로 그것이다
      const id = r?.id || (Array.isArray(r) ? r[0]?.id : r?.rows?.[0]?.id) || null
      if (id) setOpen(id)
      say?.('등록했습니다 — 아래 한 줄을 그 코드 레포 폴더에서')
    } catch (e) {
      say?.(e.message || '등록하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Note>{error ? '대장을 읽지 못했습니다 — ' + error.message : '대장을 읽는 중입니다…'}</Note>

  // **이 레포의 등록만.** 대장(`/workrepos`)은 볼 수 있는 레포 전부를 낸다 — 전에는 그것을 다 그려서 gdi 화면에
  // dpms_wiki 소속 작업 레포가 나오고, 그 행의 설치 명령이 gdi 로 나갔다(실서버 종합 시험 F1). 작업실 › 현황 카드와 같은 거름
  const repos = data.repos.filter((r) => r.knowledge === currentRepo())

  const remove = async () => {
    const r = removing
    setBusy(true)
    try {
      await api.registryDel(r.id)
      setRemoving(null)
      if (open === r.id) setOpen(null)
      invalidate('/next')
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
      <Card title="연결된 작업 레포" hint="이 지식 레포를 쓰는 코드 레포" actions={<HelpLink topic="install" />}>
        {repos.length === 0 && <Note>{data.write ? '등록된 작업 레포가 없다 — 아래에 코드 레포 이름을 적는다.' : '등록된 작업 레포가 없다.'}</Note>}
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
                <Icon name="plug" size={13} /> {open === r.id ? '접기' : '설치 한 줄'}
              </Btn>
              {data.write && (
                <Btn kind="quiet" onClick={() => setRemoving(r)} title="대장에서 지운다 — 작업 레포의 파일은 그대로다">
                  삭제
                </Btn>
              )}
            </span>
            {open === r.id && <HowTo row={r} />}
          </Row>
        ))}
      </Card>
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

      {data.write && (
        <Card title="등록" hint="담당자는 이 레포를 볼 수 있는 사람">
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

// **토큰을 보여 주지 않는다**(§6.7.3). 화면도 명령도 원문을 들지 않는다 — 사람이 관리자에게 받아 설치기가 물을 때 붙여넣는다.
// 명령은 `lib/install.js` 한 곳에서 짓는다. 안내는 **명령 한 줄 + 두 줄**이고 나머지(토큰을 어디 두나 · 병합이 무엇을 지키나 ·
// Node 가 없을 때)는 설명서 절이다(안내 글 규칙 ⑥). zip 은 Node 가 없거나 손으로 옮길 때의 길로 접어 둔다(I7).
function HowTo({ row }) {
  const [shell, setShell] = useState(guessShell)
  // 레포는 **행의 것**이다 — 지금 보는 레포가 아니다(F1). 서버 `/kit` 도 둘이 다르면 409 로 막는다
  const cmd = installCommand(shell, { origin: window.location.origin, repo: row.knowledge, id: row.id })
  return (
    <div className="howto">
      <ShellTabs shell={shell} setShell={setShell} />
      <Cmd>{cmd}</Cmd>
      <ol>
        <li>그 코드 레포 폴더에서 붙여넣는다. 토큰을 물으면 관리자에게 받은 것을 — 이 PC 에서 처음일 때만.</li>
        <li>
          Claude Code 를 다시 켜고 <code>.mcp.json</code> · <code>.claude</code> · <code>CLAUDE.md</code> 를 커밋한다. 팀원은 pull 뒤 같은 한 줄을 한 번.{' '}
          <HelpLink topic="install" className="">설명서 →</HelpLink>
        </li>
      </ol>
      <details className="howto-more">
        <summary>Node 가 없을 때 — 꾸러미 zip</summary>
        <div>
          <a className="btn" href={api.kitUrl(row.id, row.knowledge)} download>
            <Icon name="copy" size={13} /> cdp-kit-{row.name}.zip 내려받기
          </a>
        </div>
      </details>
    </div>
  )
}
