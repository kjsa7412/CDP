// 작업 레포 — 서버 전체의 설치 대장. MCP 설계서 §6.7.2 · 제품관리서비스 검토 §4.7.
//
// **읽기다.** 등록 · 꾸러미 · 설치 방법은 그 지식 레포의 관리 > 작업 레포에 있다 — 꾸러미가
// 레포마다 다르기 때문이다(권장안 · 검토 결정). 여기서는 어느 코드 레포가 어느 판을 들고 있나를 한눈에.

import { useEffect, useMemo, useState } from 'react'
import { admin } from '../lib/api.js'
import { Link } from '../lib/router.jsx'
import { useResource } from '../lib/cache.js'
import { PageHead, Toolbar, Note, Chip } from './ui.jsx'

const STATE = { 최신: null, 낡음: 'warn', 미설치: 'off' }

export default function WorkRepos({ say }) {
  const [k, setK] = useState('')
  const [st, setSt] = useState('')
  const { data, error } = useResource('/admin/workrepos', admin.workrepos)
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])

  const rows = useMemo(() => (data ? data.repos.filter((r) => (!k || r.knowledge === k) && (!st || r.state === st)) : []), [data, k, st])
  if (!data) return <span className="amuted">읽는 중…</span>
  const knowledge = [...new Set(data.repos.map((r) => r.knowledge))].sort()
  const cnt = (s) => data.repos.filter((r) => r.state === s).length

  return (
    <>
      <PageHead title="작업 레포" sub="어느 코드 레포가 어느 판의 꾸러미를 들고 있나 — 서버 전체 대장. 관문이 아니라 장부다" />
      <Toolbar>
        <select className="tsel" value={k} onChange={(e) => setK(e.target.value)}>
          <option value="">지식 레포 전체</option>
          {knowledge.map((x) => (
            <option key={x} value={x}>
              {x}
            </option>
          ))}
        </select>
        <select className="tsel" value={st} onChange={(e) => setSt(e.target.value)}>
          <option value="">상태 전체</option>
          <option value="최신">최신</option>
          <option value="낡음">낡음</option>
          <option value="미설치">미설치</option>
        </select>
        <span className="sp" />
        <span className="tcount">
          {data.repos.length}곳 · 최신 {cnt('최신')} · 낡음 {cnt('낡음')} · 미설치 {cnt('미설치')}
        </span>
      </Toolbar>
      <section className="acard acard--table">
        <div className="acard__body">
          <table className="ctable">
            <thead>
              <tr>
                <th>작업 레포</th>
                <th>지식 레포</th>
                <th>담당</th>
                <th>상태</th>
                <th>kit</th>
                <th>마지막 보고</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={7} className="dim">등록된 작업 레포가 없다 — 그 지식 레포의 관리 &gt; 작업 레포에서 등록한다</td>
                </tr>
              )}
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    <span className="name">{r.name}</span>
                    {r.note && <span className="sub">{r.note}</span>}
                  </td>
                  <td>
                    <Chip kind="off">{r.knowledge}</Chip>
                  </td>
                  <td>{r.owner || <span className="dim">담당 없음</span>}</td>
                  <td>
                    <Chip kind={STATE[r.state] ?? 'off'}>{r.state}</Chip>
                  </td>
                  <td className="mono">
                    {r.applied?.kit || <span className="dim">—</span>}
                    {r.state === '낡음' && r.kitNow && <span className="dim"> → {r.kitNow}</span>}
                  </td>
                  <td className="dim">{r.applied ? `${r.applied.at} · ${r.applied.by}` : '—'}</td>
                  <td>
                    <div className="rowact">
                      <Link className="abtn" to={'/r/' + encodeURIComponent(r.knowledge) + '/'}>그 레포로 →</Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <Note>
        등록 · 설치 명령 · 꾸러미는 <b>그 지식 레포의 관리 &gt; 작업 레포</b>에 있다 — kit 이 레포마다 다르기 때문이다. <b>낡음</b>은 설치 보고의 kit 해시가 서버의 지금 해시와 다르다는 뜻 — 각자 그 [설치 방법] 의 한 줄을 한 번 더.
      </Note>
    </>
  )
}
