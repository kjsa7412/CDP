// 감사 — auth.log 그대로. 명부 · 토큰 · 레포 · 대장의 변경. 회전하지 않는다, 이력이다.
//
// 콘솔의 모든 쓰기가 여기 `admin <행위> · <행위자> · <대상> · <바뀐 값>` 으로 남는다. 셸의 것은
// 행위자가 없다 — CLI 와 콘솔이 같은 파일에 같은 모양으로 남긴다.

import { useEffect, useMemo, useState } from 'react'
import { admin } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import { PageHead, Toolbar, Search, Note, parseAudit, shortTime } from './ui.jsx'

const KINDS = [
  ['', '행위 전체'],
  ['user', 'user — 명부'],
  ['token', 'token — 발급 · 폐기'],
  ['repo', 'repo — 레포'],
  ['workrepo', 'workrepo — 대장'],
  ['sudo', 'sudo — 재인증'],
  ['init', 'init · setup — 첫 관리자'],
]

export default function Audit({ say }) {
  const [q, setQ] = useState('')
  const [kind, setKind] = useState('')
  const [limit, setLimit] = useState(200)
  const { data, error } = useResource('/admin/audit?' + limit, () => admin.audit(limit))
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])

  const rows = useMemo(() => {
    if (!data) return []
    const k = q.trim()
    return data.lines
      .map((l) => ({ raw: l, ...parseAudit(l) }))
      .filter((r) => (!k || r.raw.includes(k)) && (!kind || r.text.startsWith(kind) || (kind === 'init' && /^(init|setup)/.test(r.raw.split(' · ')[1] || '')) || (kind === 'sudo' && r.text.startsWith('sudo'))))
  }, [data, q, kind])

  if (!data) return <span className="amuted">읽는 중…</span>
  return (
    <>
      <PageHead title="감사" sub="명부 · 토큰 · 레포 · 대장의 변경 — auth.log 그대로. 회전하지 않는다, 이력이다" />
      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="사용자 · 행위 · id" />
        <select className="tsel" value={kind} onChange={(e) => setKind(e.target.value)}>
          {KINDS.map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </select>
        <select className="tsel" value={limit} onChange={(e) => setLimit(Number(e.target.value))}>
          <option value={200}>마지막 200줄</option>
          <option value={500}>마지막 500줄</option>
          <option value={2000}>마지막 2000줄</option>
        </select>
        <span className="sp" />
        <span className="tcount">
          보이는 것 {rows.length} · 전체 {data.total}줄
        </span>
      </Toolbar>
      <section className="acard">
        <div className="acard__body">
          {rows.length === 0 && <span className="amuted">해당하는 줄이 없다</span>}
          {rows.map((r, i) => (
            <div className="auditline" key={i}>
              <time>{shortTime(r.time)}</time>
              <span className="who2">{r.actor}</span>
              <span className="what">{r.text}</span>
            </div>
          ))}
        </div>
      </section>
      <Note>
        토큰은 앞 8자만 적힌다. 셸에서 한 것은 행위자가 <b>(셸)</b> 이다 — CLI 와 콘솔이 같은 파일에 같은 모양으로 남긴다.
      </Note>
    </>
  )
}
