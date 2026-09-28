// 사용자 — 권한은 사람에 붙는다(역할 · 볼 수 있는 레포). 제품관리서비스 검토 §4.7 · 검토 v0.1 §3.2.
//
// 표 한 장 + 아래 **레포 × 사용자 매트릭스** — 레포마다 여는 쪽이 실제 운영이다.
// 삭제는 없다, 비활성이다(D6). 자기 자신의 역할 · 활성은 바꿀 수 없다(`E_SELF`) · 마지막 admin 은
// 내릴 수 없다(`E_LAST_ADMIN`) — 서버가 거절하고 화면은 그 버튼을 흐린다.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { admin } from '../lib/api.js'
import { navigate } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from './Console.jsx'
import { PageHead, Toolbar, Search, Card, Note, Modal, Field, Seg, Chip, RoleChip, Confirm, when } from './ui.jsx'

const ROLE_OPTS = [
  ['viewer', 'viewer', '읽기'],
  ['writer', 'writer', 'save · 작업 레포 등록'],
  ['admin', 'admin', '콘솔'],
]

export default function Users({ me, say, route }) {
  const withSudo = useSudo()
  const [data, setData] = useState(null)
  const [q, setQ] = useState('')
  const [role, setRole] = useState('')
  const [activeOnly, setActiveOnly] = useState(true)
  const [adding, setAdding] = useState(false)
  const [editRole, setEditRole] = useState(null) // { name, role }
  const [toggle, setToggle] = useState(null) // { name, active }
  const [busy, setBusy] = useState(false)

  const load = useCallback(() => admin.users().then(setData).catch((e) => say(e.message, 6000)), [say])
  useEffect(() => {
    load()
  }, [load])
  // 매트릭스로 바로 — 지식 레포 페이지의 [접근] 이 여기로 온다
  useEffect(() => {
    if (route.hash === '#matrix' && data) document.getElementById('matrix')?.scrollIntoView({ block: 'start' })
  }, [route.hash, data])

  const act = async (fn, ok) => {
    setBusy(true)
    try {
      await withSudo(fn)
      if (ok) say(ok)
      await load()
      return true
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 6000)
      return false
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(() => {
    if (!data) return []
    const k = q.trim().toLowerCase()
    return data.users.filter((u) => (!activeOnly || u.active) && (!role || u.role === role) && (!k || u.name.toLowerCase().includes(k) || (u.label || '').toLowerCase().includes(k)))
  }, [data, q, role, activeOnly])

  if (!data) return <span className="amuted">읽는 중…</span>
  const repos = data.repos || []
  const active = data.users.filter((u) => u.active)

  return (
    <>
      <PageHead title="사용자" sub="권한은 사람에 붙는다 — 역할과 볼 수 있는 레포. 삭제는 없다, 비활성이다">
        <button className="btn btn--accent btn--sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> 사용자
        </button>
      </PageHead>

      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="이름 · 라벨" />
        <select className="tsel" value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="">역할 전체</option>
          <option value="admin">admin</option>
          <option value="writer">writer</option>
          <option value="viewer">viewer</option>
        </select>
        <label className="tchk">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> 활성만
        </label>
        <span className="sp" />
        <span className="tcount">
          {data.users.length}명 · 활성 {active.length} · 관리자 {active.filter((u) => u.admin).length}
        </span>
      </Toolbar>

      <section className="acard acard--table">
        <div className="acard__body">
          <table className="ctable">
            <thead>
              <tr>
                <th>이름</th>
                <th>역할</th>
                <th>볼 수 있는 레포</th>
                <th className="ar">토큰</th>
                <th>마지막 사용</th>
                <th>활성</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="dim">해당하는 사용자가 없다</td>
                </tr>
              )}
              {rows.map((u) => {
                const self = u.name === me.user
                return (
                  <tr key={u.name} className={u.active ? undefined : 'is-off'}>
                    <td>
                      <span className="name">{u.name}</span>
                      <span className="sub">
                        {u.label || '—'}
                        {u.left ? ` · ${u.left} 떠남` : ''}
                      </span>
                    </td>
                    <td>
                      <RoleChip role={u.role} />
                    </td>
                    <td>
                      {u.repos.includes('*') ? (
                        <Chip kind="off">전체 *</Chip>
                      ) : u.repos.length ? (
                        u.repos.map((r) => (
                          <Chip key={r} kind="off">
                            {r}
                          </Chip>
                        ))
                      ) : (
                        <span className="dim">없음</span>
                      )}
                    </td>
                    <td className="ar num">
                      {u.liveTokens} / {u.tokens}
                    </td>
                    <td className="dim">{u.lastUsed ? when(u.lastUsed) : '—'}</td>
                    <td>{u.active ? <Chip>활성</Chip> : <Chip kind="off">비활성</Chip>}</td>
                    <td>
                      <div className="rowact">
                        {u.active && (
                          <>
                            <button className="abtn" disabled={self} title={self ? '자기 자신의 역할은 바꿀 수 없다 — 다른 관리자가 한다' : '역할'} onClick={() => setEditRole({ name: u.name, role: u.role })}>
                              역할
                            </button>
                            <a className="abtn" href="#matrix" onClick={(e) => { e.preventDefault(); document.getElementById('matrix')?.scrollIntoView({ block: 'start' }) }}>
                              레포
                            </a>
                            <button className="abtn" onClick={() => navigate('/console/tokens?user=' + encodeURIComponent(u.name))}>
                              <Icon name="key" size={12} /> 발급
                            </button>
                          </>
                        )}
                        <button className="abtn" disabled={self} title={self ? '자기 자신은 끌 수 없다' : undefined} onClick={() => setToggle({ name: u.name, active: !u.active })}>
                          {u.active ? '비활성' : '재활성'}
                        </button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>

      <div id="matrix" />
      <Card title="레포 × 사용자" hint="체크 하나가 그 사람의 repos 한 줄이다 — 저장 즉시 다음 요청부터">
        {repos.length === 0 ? (
          <Note>이 서버에 지식 레포가 없다 — 지식 레포 페이지에서 세우면 여기 열이 생긴다.</Note>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table className="matrix">
              <thead>
                <tr>
                  <th>사용자</th>
                  {repos.map((r) => (
                    <th key={r}>{r}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {active.map((u) => (
                  <tr key={u.name}>
                    <td>
                      <b>{u.name}</b> {u.repos.includes('*') && <span className="all">전체 *</span>}
                    </td>
                    {repos.map((r) =>
                      u.repos.includes('*') ? (
                        <td key={r} className="all">●</td>
                      ) : (
                        <td key={r}>
                          <input
                            type="checkbox"
                            checked={u.repos.includes(r)}
                            disabled={busy}
                            onChange={(e) => {
                              const next = e.target.checked ? [...u.repos, r] : u.repos.filter((x) => x !== r)
                              act(() => admin.userSet(u.name, { repos: next }), `${u.name} — ${r} ${e.target.checked ? '열었다' : '닫았다'}`)
                            }}
                          />
                        </td>
                      )
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Note>
          권한 밖 레포는 그 사람의 화면 · API · MCP 어디에도 <b>존재를 알리지 않는다</b>. 전체(<code>*</code>)인 사람은 표에서 고칠 수 없다 — 역할처럼 사람에게 붙은 값이다.
        </Note>
      </Card>

      {adding && <AddUser repos={repos} busy={busy} onClose={() => setAdding(false)} onOk={async (body) => (await act(() => admin.userAdd(body), `${body.name} 을 넣었다`)) && setAdding(false)} />}

      {editRole && (
        <Modal
          title={`${editRole.name} 의 역할`}
          onClose={() => setEditRole(null)}
          small
          foot={
            <>
              <span className="amuted" style={{ fontSize: 11.5 }}>auth.log 에 남는다 · 재인증</span>
              <span className="sp" />
              <button className="abtn" onClick={() => setEditRole(null)}>취소</button>
              <button className="abtn abtn--accent" disabled={busy} onClick={async () => (await act(() => admin.userSet(editRole.name, { role: editRole.role }), `${editRole.name} → ${editRole.role}`)) && setEditRole(null)}>
                저장
              </button>
            </>
          }
        >
          <Field label="역할">
            <Seg value={editRole.role} onChange={(v) => setEditRole({ ...editRole, role: v })} options={ROLE_OPTS} />
          </Field>
          <Note>
            <b>writer</b> 는 save 로 기록을 만들고 작업 레포를 등록한다. 지식 레포를 세우는 것은 <b>admin</b>(콘솔 › 지식 레포)만 — <b>admin</b> 은 콘솔에 들어온다. 마지막 admin 은 내릴 수 없다.
          </Note>
        </Modal>
      )}

      {toggle && (
        <Confirm
          title={toggle.active ? '다시 활성으로' : '비활성으로'}
          text={toggle.active ? `${toggle.name} 을 다시 활성으로 돌립니다. 그 사람의 토큰이 다음 요청부터 다시 통합니다.` : `${toggle.name} 을 비활성으로 둡니다. 그 사람의 토큰 전부가 다음 요청부터 막힙니다 — 삭제가 아니라 되돌릴 수 있고, 커밋의 author 와 감사 로그는 그대로 이어집니다.`}
          okLabel={toggle.active ? '재활성' : '비활성'}
          danger={!toggle.active}
          busy={busy}
          onClose={() => setToggle(null)}
          onOk={async () => (await act(() => admin.userSet(toggle.name, { active: toggle.active }), `${toggle.name} — ${toggle.active ? '활성' : '비활성'}`)) && setToggle(null)}
        />
      )}
    </>
  )
}

function AddUser({ repos, busy, onClose, onOk }) {
  const [f, setF] = useState({ name: '', label: '', role: 'viewer', repos: [], all: false })
  const okName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(f.name.trim())
  return (
    <Modal
      title="사용자 추가"
      onClose={onClose}
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>auth.log 에 남는다 · 재인증 필요</span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>취소</button>
          <button className="abtn abtn--accent" disabled={busy || !okName} onClick={() => onOk({ name: f.name.trim(), label: f.label.trim() || null, role: f.role, repos: f.all ? ['*'] : f.repos })}>
            추가
          </button>
        </>
      }
    >
      <Field label="이름 (아이디)" hint="커밋의 author 로 남는다 — 사내 아이디를 쓴다. 바꿀 수 없다.">
        <input className="mono" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} placeholder="영문 · 숫자 · . _ -" spellCheck={false} autoFocus />
      </Field>
      <Field label="라벨">
        <input value={f.label} onChange={(e) => setF({ ...f, label: e.target.value })} placeholder="소속 · 역할" />
      </Field>
      <Field label="역할">
        <Seg value={f.role} onChange={(v) => setF({ ...f, role: v })} options={ROLE_OPTS} />
      </Field>
      <Field label="볼 수 있는 레포">
        <div className="checks">
          {repos.map((r) => (
            <label key={r}>
              <input type="checkbox" disabled={f.all} checked={f.all || f.repos.includes(r)} onChange={(e) => setF({ ...f, repos: e.target.checked ? [...f.repos, r] : f.repos.filter((x) => x !== r) })} /> {r}
            </label>
          ))}
          <label>
            <input type="checkbox" checked={f.all} onChange={(e) => setF({ ...f, all: e.target.checked })} /> <b>전체 *</b>
          </label>
        </div>
      </Field>
      <Note>토큰은 여기서 발급하지 않는다 — 추가한 뒤 그 행의 [발급], 또는 토큰 페이지에서.</Note>
    </Modal>
  )
}
