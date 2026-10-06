// 큐레이션 › 이력 — 큐레이션 기록(`curates:` 가 있는 작업 기록) 목록(개편안 §7.3 S4 · §4.2).
//
// 한 줄 = 큐레이션 한 번(언제 · 누가 · 다룬 기록 · 반영 섹션 · 새 문서 · 기록으로 둠). 줄을 누르면 그 판정표가 펼쳐진다 —
// 기록마다 반영 · 새 문서 · 기록으로 둠과 어디로(좌표) · 왜(사유). 펼친 것은 주소다(`/manage/curation/log/<id>`) — 링크로 보낸다.
// 판정은 데이터다(`curates: [{ id, verdict, into, reason }]` — V17) — 화면이 마크다운 표를 파싱하지 않는다.

import { useMemo } from 'react'
import { Card, Note } from '../../components/admin/ui.jsx'
import { api, currentRepo } from '../../lib/api.js'
import { useResource } from '../../lib/cache.js'
import { Link, navigate } from '../../lib/router.jsx'
import { docHref } from '../../lib/doclink.js'
import { VERDICT_LABEL, verdictCounts } from '../../lib/curation.js'
import { repoBase } from '../../shell/nav.js'
import { ServerAbsent, isAbsent } from './marks.jsx'

export default function Log({ logId = null }) {
  const rk = currentRepo()
  const base = repoBase(rk)
  const h = useResource('api:' + rk + '/curations', api.curations)
  // 늦은 것이 위 — 이력이다. 날짜가 같으면 id 로
  const items = useMemo(
    () => [...(h.data?.items || [])].sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || String(b.id).localeCompare(String(a.id))),
    [h.data]
  )

  if (isAbsent(h.error)) return <ServerAbsent what="큐레이션 이력" />
  if (h.error) return <Note tone="bad">이력을 읽지 못했습니다 — {h.error.message}</Note>
  if (!h.data) return <span className="amuted">읽는 중…</span>

  const logBase = base + 'manage/curation/log'
  return (
    <>
      <Card title="큐레이션 이력" hint={`${items.length}번 — 늦은 것이 위`}>
        {items.length === 0 ? (
          <Note>아직 큐레이션이 없다 — 대기열에서 기록을 골라 에이전트 지시를 복사하거나 기록으로 둔다.</Note>
        ) : (
          <table className="atable ltable">
            <thead>
              <tr>
                <th>언제</th>
                <th>누가</th>
                <th className="ar">다룬 기록</th>
                <th className="ar">반영 섹션</th>
                <th>새 문서</th>
                <th className="ar">기록으로 둠</th>
                <th aria-label="펼치기" />
              </tr>
            </thead>
            <tbody>
              {items.map((c) => {
                const open = logId === c.id
                const n = verdictCounts(c.judgments)
                return [
                  <tr key={c.id} className={open ? 'is-picked' : undefined} onClick={() => navigate(open ? logBase : logBase + '/' + encodeURIComponent(c.id))} style={{ cursor: 'pointer' }}>
                    <td className="num nowrap">{String(c.date || '').slice(5, 16)}</td>
                    <td>{c.author || '—'}</td>
                    <td className="ar num">{(c.judgments || []).length}</td>
                    <td className="ar num">{c.sections ?? '—'}</td>
                    <td>
                      {(c.newDocs || []).length ? (
                        c.newDocs.map((p) => (
                          <span key={p} className="cchip cchip--new" title={p}>
                            {String(p).split('/').pop().replace(/\.md$/i, '')}
                          </span>
                        ))
                      ) : (
                        <span className="amuted">—</span>
                      )}
                    </td>
                    <td className="ar num">{n.keep}</td>
                    <td aria-hidden="true">{open ? '▾' : '▸'}</td>
                  </tr>,
                  open ? (
                    <tr key={c.id + ':open'} className="ltable__open">
                      <td colSpan={7}>
                        <Judgments c={c} base={base} />
                      </td>
                    </tr>
                  ) : null,
                ]
              })}
            </tbody>
          </table>
        )}
      </Card>
      {logId && !items.some((c) => c.id === logId) && <Note>그 큐레이션 기록(<code>{logId}</code>)은 이력에 없다 — 지워졌거나 다른 레포의 것이다.</Note>}
    </>
  )
}

function Judgments({ c, base }) {
  const js = c.judgments || []
  return (
    <div className="ljud">
      <table className="atable">
        <thead>
          <tr>
            <th>기록</th>
            <th>판정</th>
            <th>어디로 · 왜</th>
          </tr>
        </thead>
        <tbody>
          {js.map((j) => (
            <tr key={j.id}>
              <td>
                <Link to={docHref(base, j.id)} title={j.id}>
                  {j.id}
                </Link>
              </td>
              <td>
                <span className={j.verdict === 'new' ? 'cchip cchip--new' : 'cchip'}>{VERDICT_LABEL[j.verdict] || j.verdict}</span>
              </td>
              <td>
                {(j.into || []).length ? (
                  j.into.map((x, i) => (
                    <span key={x}>
                      {i > 0 && ' · '}
                      <code>{x}</code>
                    </span>
                  ))
                ) : j.reason ? (
                  <span>「{j.reason}」</span>
                ) : (
                  <span className="amuted">—</span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="ljud__foot">
        <Link to={docHref(base, c.id)}>큐레이션 기록 열기 ›</Link>
        <span className="amuted"> — 정본을 어디로 정했나 · 경과는 그 기록의 본문에 있다</span>
      </div>
    </div>
  )
}
