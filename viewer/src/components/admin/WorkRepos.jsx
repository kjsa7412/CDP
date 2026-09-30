// 작업 레포 — 코드가 있는 레포에 규약과 skill 을 넣는다.
//
// **앱이 레포 밖에 파일을 쓰는 유일한 자리다.** 그래서 두 가지를 지킨다 —
// 무엇을 쓸지 먼저 보여 주고, 사람이 누르면 쓴다. 경로는 사람이 입력한 것만 온다.
//
// 전에는 경로 문자열 목록이었다. 그래서 **설치한 곳과 안 한 곳이 같은 줄로
// 보였고**, skill 을 고친 뒤 여섯 곳 중 어디가 옛 판인지 알 길이 없었다.
// 지금은 열어 보지 않고 안다 — 계획을 dry 로 돌려서 상태를 계산한다.

import { useCallback, useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mark, Mono, PathText, Note, Btn, when } from './ui.jsx'

const STATE = {
  ok: { mark: 'ok', label: '최신' },
  update: { mark: 'warn', label: '갱신 필요' },
  none: { mark: 'none', label: '미설치' },
  error: { mark: 'bad', label: '오류' },
}

const OPLBL = { create: '새로', update: '갱신', append: '블록', remove: '제거' }

function shortOf(c) {
  return c.kind === 'skill' ? `.claude/skills/${c.name}` : c.kind === 'claude' ? 'CLAUDE.md' : c.kind === 'mcp' ? '.mcp.json' : '.claude/cdp.json'
}

// MCP 가 붙었나 — `.mcp.json` 의 `cdp` 항목이 이 지식 레포를 가리키는가(§3.2)
const MCP = { ok: 'MCP 연결됨', update: 'MCP 갱신 필요', none: 'MCP 미연결' }

export default function WorkRepos({ state, patch, say }) {
  const [data, setData] = useState(null)
  const [add, setAdd] = useState('')
  const [plan, setPlan] = useState(null) // { path, actions, warnings } | { path, error }
  const [busy, setBusy] = useState(null)

  const load = useCallback(() => {
    api.workRepos().then(setData).catch(() => setData(null))
  }, [])
  useEffect(load, [load])

  const list = data?.repos || []
  const stale = list.filter((r) => r.state === 'update')

  const addRepo = () => {
    const v = add.trim()
    if (!v) return
    const cur = (state.workRepos || []).map((w) => (typeof w === 'string' ? w : w.path))
    if (!cur.includes(v)) {
      patch({ workRepos: [...(state.workRepos || []), { path: v, addedAt: new Date().toISOString(), lastApplied: null }] })
    }
    setAdd('')
    setTimeout(load, 200)
  }

  const removeRepo = (p) => {
    patch({ workRepos: (state.workRepos || []).filter((w) => (typeof w === 'string' ? w : w.path) !== p) })
    setTimeout(load, 200)
  }

  // **계획을 먼저 보여 준다.** 무엇을 쓸지 모르고 누르게 하지 않는다.
  const doPlan = async (p) => {
    setBusy(p)
    setPlan(null)
    try {
      const r = await api.setup(p, false)
      setPlan({ path: r.work, actions: r.actions, warnings: r.warnings, kit: r.kit })
    } catch (e) {
      setPlan({ path: p, error: String(e?.message || e) })
    } finally {
      setBusy(null)
    }
  }

  const doApply = async (p) => {
    setBusy(p)
    try {
      const r = await api.setup(p, true)
      setPlan({ path: r.work, actions: r.actions, warnings: r.warnings, kit: r.kit, done: true })
      say?.(`${r.work} 에 설치했습니다 · kit ${r.kit}`)
      load()
    } catch (e) {
      setPlan({ path: p, error: String(e?.message || e) })
    } finally {
      setBusy(null)
    }
  }

  // 일괄 갱신 — **하나씩 순서대로.** 동시에 쓰면 실패한 것이 어느 것인지 흐려진다.
  const applyAll = async () => {
    setBusy('*')
    let done = 0
    for (const r of stale) {
      try {
        await api.setup(r.path, true)
        done++
      } catch {}
    }
    setBusy(null)
    say?.(`${done}곳 갱신했습니다`)
    load()
  }

  return (
    <>
      <Note>
        코드가 있는 레포에 규약과 skill 을 넣습니다. <b>하네스는 프로젝트 루트의 <code>.claude/skills/</code> 만
        읽으므로</b>, 넣지 않으면 그 레포에서는 절차가 통째로 없습니다.
      </Note>

      <Card
        title="등록된 작업 레포"
        hint={data ? `${list.length}곳 · kit ${data.kit}` : ''}
        actions={
          stale.length > 1 ? (
            <Btn kind="warn" onClick={applyAll} disabled={!!busy}>
              {busy === '*' ? '쓰는 중…' : `갱신 필요 ${stale.length}곳 전부 갱신`}
            </Btn>
          ) : null
        }
      >
        {!data ? (
          <span className="amuted">읽는 중…</span>
        ) : list.length === 0 ? (
          <span className="amuted">아직 없습니다. 아래에서 경로를 넣으세요.</span>
        ) : (
          list.map((r) => {
            const s = STATE[r.state] || STATE.none
            return (
              <div className="awork" key={r.path}>
                <div className="awork__head">
                  <Mark kind={s.mark} size={14} />
                  <b className="awork__path">{r.path}</b>
                  <span className={r.state === 'ok' ? 'amuted' : 'awarn'}>
                    {s.label}
                    {r.state === 'update' && ` ${r.changes.length}건`}
                  </span>
                </div>

                {r.state === 'error' ? (
                  <pre className="apre">{r.reason}</pre>
                ) : (
                  <div className="awork__meta">
                    <span>
                      <Icon name="plug" size={12} /> skill {r.skills?.length || 0}종
                    </span>
                    {r.mcp && <span className={r.mcp === 'ok' ? '' : 'awarn'}>{MCP[r.mcp]}</span>}
                    {r.lastApplied ? (
                      <span>
                        마지막 설치 {when(r.lastApplied.at)} · kit <Mono>{r.lastApplied.kit}</Mono>
                      </span>
                    ) : (
                      <span className="amuted">이 앱으로 설치한 기록 없음</span>
                    )}
                  </div>
                )}

                {/* 낡았으면 무엇이 바뀌는지 **여기서 바로** 보인다 */}
                {r.state === 'update' && (
                  <pre className="apre">
                    {r.changes.map((c) => `${OPLBL[c.op] || c.op}  ${shortOf(c)}`).join('\n')}
                  </pre>
                )}

                {(r.warnings || []).map((w, i) => (
                  <div className="awarn awork__warn" key={i}>
                    <Mark kind="warn" />
                    <span>{w}</span>
                  </div>
                ))}

                <div className="awork__act">
                  {r.state !== 'error' && (
                    <Btn
                      kind={r.state === 'ok' ? 'quiet' : 'accent'}
                      onClick={() => doPlan(r.path)}
                      disabled={!!busy}
                    >
                      {busy === r.path ? '보는 중…' : r.state === 'none' ? '설치' : r.state === 'update' ? '갱신' : '다시 점검'}
                    </Btn>
                  )}
                  <Btn onClick={() => api.open(r.path).catch(() => say?.('열지 못했습니다'))}>
                    <Icon name="folder" size={13} /> 폴더
                  </Btn>
                  <Btn onClick={() => removeRepo(r.path)}>목록에서 빼기</Btn>
                </div>
              </div>
            )
          })
        )}

        {/* 계획 — 쓰기 전에 전부 보인다. 팝오버 다섯 줄이 아니라 전부. */}
        {plan && (
          <div className="aplan">
            {plan.error ? (
              <pre className="apre">{plan.error}</pre>
            ) : (
              <>
                <div className="aplan__head">
                  <b>{plan.path}</b>
                  <span className="amuted">{plan.done ? ' 에 썼습니다' : ' 에 이렇게 씁니다'}</span>
                  <span className="topbar__spacer" />
                  <Mono>kit {plan.kit}</Mono>
                </div>
                <pre className="apre">
                  {plan.actions
                    .filter((a) => a.op !== 'same')
                    .map((a) => `${OPLBL[a.op] || a.op}  ${shortOf(a)}`)
                    .join('\n') || '(바뀔 것 없음 — 이미 최신입니다)'}
                </pre>
                {plan.warnings.map((w, i) => (
                  <div className="awarn" key={i}>
                    <Mark kind="warn" /> <span>{w}</span>
                  </div>
                ))}
                {!plan.done && plan.actions.some((a) => a.op !== 'same') && (
                  <div className="awork__act">
                    <Btn kind="accent" onClick={() => doApply(plan.path)} disabled={!!busy}>
                      {busy === plan.path ? '쓰는 중…' : '이대로 설치'}
                    </Btn>
                    <Btn onClick={() => setPlan(null)}>취소</Btn>
                  </div>
                )}
                {(plan.done || !plan.actions.some((a) => a.op !== 'same')) && (
                  <div className="awork__act">
                    <Btn onClick={() => setPlan(null)}>닫기</Btn>
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </Card>

      <Card title="레포 추가" hint="git 레포여야 한다">
        <input
          className="ain"
          value={add}
          onChange={(e) => setAdd(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addRepo()}
          placeholder={'C:' + String.fromCharCode(92) + 'work' + String.fromCharCode(92) + 'alpha'}
          spellCheck={false}
          aria-label="작업 레포 경로"
        />
        {add.trim() && (
          <div className="arow">
            <span className="topbar__spacer" />
            <Btn kind="accent" onClick={addRepo}>목록에 넣기</Btn>
          </div>
        )}
        <Note>
          목록은 <b>이 PC 의 개인 설정</b>입니다 — 경로는 사람마다 다르므로 지식 레포에 두지 않습니다.
          디스크를 훑어 자동으로 찾지 않습니다.
        </Note>
      </Card>

      <Card title="설치 이력" hint={`${(data?.log || []).length}건 · 20건까지 남습니다`}>
        {!data?.log?.length ? (
          <span className="amuted">아직 기록이 없습니다.</span>
        ) : (
          <table className="atable">
            <thead>
              <tr>
                <th>시각</th>
                <th>레포</th>
                <th>kit</th>
                <th>쓴 것</th>
              </tr>
            </thead>
            <tbody>
              {data.log.map((e, i) => (
                <tr key={e.at + i}>
                  <td className="amono">{when(e.at)}</td>
                  <td className="amono">{e.path}</td>
                  <td className="amono">{e.kit}</td>
                  <td className="amuted">
                    {Object.entries(e.ops || {})
                      .map(([op, n]) => `${OPLBL[op] || op} ${n}`)
                      .join(' · ')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </>
  )
}
