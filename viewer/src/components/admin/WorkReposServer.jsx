// 작업 레포 — 서버판. MCP 설계서 §6.7.3.
//
// **로컬의 같은 이름 화면과 다른 것이다.** 로컬은 이 PC 에 규약과 skill 을
// 깔고, 여기는 **등록하고 꾸러미를 내주고 결과를 추적한다**(§6.7.1).
//
// 브라우저는 사용자 PC 에 파일을 쓸 수 없다. 그 제약을 우회하지 않고, 대신
// 사람이 자기 PC 에서 할 일을 zip 하나 푸는 것으로 줄였다.

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mono, Note, Btn, Cmd } from './ui.jsx'

// 표시 세 가지. **정상은 조용하다** — `ui.jsx` 의 규칙 그대로다.
const MARK = { 최신: 'ok', 낡음: 'warn', 미설치: 'none' }

export default function WorkReposServer({ say }) {
  const [data, setData] = useState(null)
  const [open, setOpen] = useState(null)
  const [form, setForm] = useState({ name: '', owner: '', note: '' })
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => api.registry().then(setData).catch(() => setData(null)), [])
  useEffect(() => {
    load()
  }, [load])

  const submit = async (e) => {
    e.preventDefault()
    if (!form.name.trim()) return
    setBusy(true)
    try {
      const repo = location.pathname.split('/').filter(Boolean)[1]
      await api.registryAdd({ name: form.name.trim(), knowledge: decodeURIComponent(repo), owner: form.owner || null, note: form.note || null })
      setForm({ name: '', owner: '', note: '' })
      await load()
      say?.('등록했습니다')
    } catch (e) {
      say?.(e.message || '등록하지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  if (!data) return <Note>대장을 읽는 중입니다…</Note>

  return (
    <>
      <Card title="작업 레포" hint="어디에 무엇이 깔려 있나">
        {data.repos.length === 0 && <Note>등록된 작업 레포가 없습니다. 아래에서 등록하세요.</Note>}
        {data.repos.map((r) => (
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
            </span>
          </Row>
        ))}

        {open && <HowTo row={data.repos.find((r) => r.id === open)} />}
      </Card>

      {!data.write ? (
        <Card title="등록" hint="쓰기 권한이 필요합니다">
          <Note>
            등록·삭제는 <code>write</code> 가 있는 사람만 할 수 있습니다. 목록과 설치 방법은 그대로 보입니다.
          </Note>
        </Card>
      ) : (
      <Card title="등록" hint="담당자는 명부에 있어야 합니다">
        <div className="wr-form">
          <input
            placeholder="작업 레포 이름 (예: ezipez-web)"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <select value={form.owner} onChange={(e) => setForm({ ...form, owner: e.target.value })}>
            <option value="">담당자 —</option>
            {(data.users || []).map((u) => (
              <option key={u} value={u}>
                {u}
              </option>
            ))}
          </select>
          <input placeholder="메모 (선택)" value={form.note} onChange={(e) => setForm({ ...form, note: e.target.value })} />
          <Btn onClick={submit} disabled={busy || !form.name.trim()}>
            등록
          </Btn>
        </div>
      </Card>
      )}
    </>
  )
}

// **토큰을 보여 주지 않는다**(§6.7.3). 화면이 토큰을 내면 HTTP 발급 경로를
// 만든 것과 같아진다 — 발급은 서버 셸에서만 한다(§4.4.1).
function HowTo({ row }) {
  if (!row) return null
  return (
    <div className="howto">
      <ol>
        <li>
          꾸러미를 받아 <b>작업 레포 루트에 푼다.</b>
          <div>
            <a className="btn" href={api.kitUrl(row.id)} download>
              <Icon name="copy" size={13} /> cdp-kit-{row.name}.zip 내려받기
            </a>
          </div>
          <Note>
            <code>CLAUDE.md</code> 가 이미 있으면 <code>cdp:begin ~ cdp:end</code> 블록만 갈아 끼웁니다. 안에
            <code> 설치.md</code> 가 들어 있습니다.
          </Note>
        </li>
        <li>
          토큰을 환경변수에 둔다.
          <Cmd>setx CDP_TOKEN &lt;관리자에게 받은 토큰&gt;</Cmd>
          <Note>토큰은 관리자에게 직접 받습니다. 이 화면과 꾸러미에는 토큰이 없습니다.</Note>
        </li>
        <li>Claude Code 를 다시 켠다.</li>
        <li>
          커밋한다.
          <Cmd>git add .mcp.json .claude CLAUDE.md</Cmd>
          <Note>팀원은 여기서부터 pull 과 토큰만으로 끝납니다.</Note>
        </li>
      </ol>
      <Note>
        <code>bin/ctx</code> 가 있으면 1번 대신 <Mono>{`ctx setup --server … --workrepo ${row.id}`}</Mono> 를
        써도 됩니다. 그러면 병합과 대장 보고까지 한 번에 됩니다.
      </Note>
    </div>
  )
}
