// 큐레이션 › 진단 — 반영된 뒤 시간이 지나며 어긋난 관리 문서(리빌딩 검토 v0.1 §5.1 · RB2).
//
//   위      신호 다섯 — 근거 없음 · 복제 · 비대 · 일지형 · 좌표 없는 기록(서버가 계산한다 · 저장하지 않는다)
//   가운데   신호가 있는 섹션 — 문서로 거른다 · 신호 칩 · 복제 짝. 고른 좌표로 [에이전트 지시 복사](cdp-rebuild)
//   아래    좌표 없는 기록(앞 50) · [근거 없는 섹션 스냅샷 뜨기]
//
// **대기열(미반영)과 다르다** — 미반영이 0 이어도 생긴다. 화면이 직접 하는 쓰기는 스냅샷 하나다(서버가 원문 그대로 뜬다 — 글을
// 쓰지 않는다). 좌표정정 · 다시 쓰기는 글을 쓰는 일이라 큐레이터의 에이전트 세션(`cdp-rebuild`)이 판정표 · 승인 뒤 save 한다.
// 막는 것은 서버다(drift · snapshot 은 curate) — 이 화면은 메뉴가 큐레이터에게만 보인다.

import { useMemo, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Card, Note, Btn } from '../../components/admin/ui.jsx'
import { api, currentRepo } from '../../lib/api.js'
import { invalidate, useResource } from '../../lib/cache.js'
import { copyText } from '../../lib/clip.js'
import { Link } from '../../lib/router.jsx'
import { docHref } from '../../lib/doclink.js'
import { rebuildCommand } from '../../lib/curation.js'
import { repoBase } from '../../shell/nav.js'
import { useSudo, CANCELLED } from '../../shell/sudo.jsx'
import { ServerAbsent, isAbsent } from './marks.jsx'

const SIGNALS = [
  ['unsourced', '근거 없음', '그 좌표를 건드린 기록 · 스냅샷 · 기준선이 없다 — 기록만 옮겨 다시 세우면 사라진다'],
  ['duplicated', '복제', '같은 산문 줄이 다른 섹션에도 있다 — 하나만 고쳐진다'],
  ['oversize', '비대', '경과 앞 본문이 40줄을 넘는다 — 경위 · 논의가 쌓였다'],
  ['diary', '일지형', '날짜별로 덧붙인 줄 — 섹션은 지금의 상태다'],
  ['unreachable', '좌표 없는 기록', '좌표 0 · 좌표정정이 없는 사람의 기록 — 정본과 만나지 않는다'],
]

export default function Drift({ say, onChanged }) {
  const rk = currentRepo()
  const base = repoBase(rk)
  const withSudo = useSudo()
  const d = useResource('api:' + rk + '/drift', () => api.drift())
  const [doc, setDoc] = useState('')
  const [only, setOnly] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const rows = d.data?.sections || []
  const docs = useMemo(() => [...new Set(rows.map((x) => x.doc))].sort(), [rows])
  const shown = rows.filter((x) => (!doc || x.doc === doc) && (!only || (only === 'duplicated' ? x.duplicated.length : x[only])))
  const coords = picked.size ? shown.filter((x) => picked.has(x.coord)).map((x) => x.coord) : []
  const cmd = rebuildCommand(rk, coords)

  if (isAbsent(d.error)) return <ServerAbsent what="어긋남 진단" />
  if (d.error) return <Note tone="bad">진단을 읽지 못했습니다 — {d.error.message}</Note>
  if (!d.data) return <span className="amuted">읽는 중…</span>

  const t = d.data.totals || {}
  const toggle = (c) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })

  const copy = () =>
    copyText(cmd).then((ok) => {
      if (!ok) return say?.('복사하지 못했습니다 — 아래 글을 직접 고른다')
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
      say?.(`에이전트 지시를 복사했다 — 좌표 ${coords.length || '전체'} · 자기 PC 의 Claude Code 에 붙인다`)
    })

  // 근거 없는 섹션 스냅샷 — 미리보기(dryRun)로 수를 보이고 확인받은 뒤 뜬다. 문서를 거르고 있으면 그 문서만
  const snapshot = async () => {
    setBusy(true)
    try {
      const body = doc ? { doc } : {}
      const pre = await api.snapshot({ ...body, dryRun: true })
      if (pre?.error) return say?.(`스냅샷을 미리 보지 못했다 — ${pre.error.message || pre.error.code || ''}`, 10000)
      const n = pre?.snapshots?.length || 0
      const linked = t.unsourcedLinked || 0
      if (!window.confirm(`근거 없는 섹션 ${n}개를 원문 그대로 기록으로 뜹니다${pre.left ? ` (남은 ${pre.left}개는 다음 번에)` : ''}.\n기록을 인용하는 섹션 ${linked}개는 빼고 — 그 기록의 좌표정정이 낫다(cdp-rebuild).\n섹션은 바뀌지 않습니다. 뜰까요?`)) return
      const r = await withSudo(() => api.snapshot(body))
      if (r?.error) return say?.(`스냅샷을 뜨지 못했다 — ${r.error.message || r.error.code || ''}`, 10000)
      say?.(`정본 스냅샷 ${r?.snapshots?.length || 0}건을 떴다${r?.commit ? ' · 커밋 ' + String(r.commit).slice(0, 7) : ''}`, 6000)
      invalidate('api:' + rk + '/')
      await d.refresh().catch(() => {})
      onChanged?.()
    } catch (e) {
      if (e.message !== CANCELLED) say?.(e.message || '스냅샷을 뜨지 못했다', 8000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="kpis">
        {SIGNALS.map(([k, l, s]) => (
          <button key={k} type="button" className={only === k ? 'kpi kpi--on' : 'kpi'} title={s} onClick={() => setOnly(only === k || k === 'unreachable' ? '' : k)}>
            <span className="kpi__l">{l}</span>
            <b className="kpi__n num">{t[k] ?? '—'}</b>
            <span className="kpi__s">{k === 'unsourced' && t.unsourcedLinked ? `기록 인용 ${t.unsourcedLinked}` : k === 'unreachable' ? '아래 목록' : '섹션'}</span>
          </button>
        ))}
      </div>

      <Card
        title="어긋난 섹션"
        hint={`섹션 ${t.sections ?? '—'} 중 신호가 있는 것 · 미반영과 다르다 — 반영된 뒤에 생긴다`}
        actions={
          <select className="ainput" value={doc} onChange={(e) => setDoc(e.target.value)} aria-label="문서로 거르기">
            <option value="">문서 전부</option>
            {docs.map((x) => (
              <option key={x} value={x}>
                {x.replace(/^docs\//, '')}
              </option>
            ))}
          </select>
        }
      >
        {shown.length === 0 ? (
          <Note>{rows.length ? '거른 조건에 맞는 섹션이 없다.' : '어긋난 섹션이 없다 — 근거 · 복제 · 비대 · 일지형 모두 0.'}</Note>
        ) : (
          <table className="atable dtable">
            <thead>
              <tr>
                <th aria-label="고르기" />
                <th>좌표</th>
                <th>문서</th>
                <th>신호</th>
              </tr>
            </thead>
            <tbody>
              {shown.slice(0, 200).map((x) => (
                <tr key={x.coord}>
                  <td>
                    <input type="checkbox" checked={picked.has(x.coord)} onChange={() => toggle(x.coord)} aria-label={x.coord + ' 고르기'} />
                  </td>
                  <td className="amono">
                    <Link to={docHref(base, x.doc, String(x.coord).split(':').slice(1).join(':'))}>{x.coord}</Link>
                  </td>
                  <td className="amuted">{x.doc.replace(/^docs\//, '')}</td>
                  <td>
                    <Signals x={x} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {d.data.omitted ? <Note>앞 200개만 보인다 — 문서로 거른다.</Note> : null}
      </Card>

      <div className="qsplit">
        <Card title="다시 세우기" hint="글을 쓰는 일은 큐레이터의 Claude Code — cdp-rebuild 가 판정표와 「사라지는 사실」 을 보이고 승인 뒤 save 한다">
          <div className="drow">
            <Btn kind="accent" onClick={copy}>
              <Icon name={copied ? 'check' : 'copy'} size={13} /> 에이전트 지시 복사{coords.length ? ` · 좌표 ${coords.length}` : ''}
            </Btn>
            <Btn onClick={snapshot} disabled={busy || !t.unsourced} title="근거 없는 섹션을 서버가 원문 그대로 기록으로 뜬다 — 섹션은 바뀌지 않는다">
              <Icon name="file" size={13} /> 근거 없는 섹션 스냅샷 뜨기{doc ? ' · 이 문서' : ''}
            </Btn>
          </div>
          <pre className="dcmd">{cmd}</pre>
        </Card>

        <Card title="좌표 없는 기록" hint={`${d.data.unreachableTotal ?? 0}건 · 앞 50 — 좌표정정 기록으로 정본과 잇는다(cdp-rebuild ③)`}>
          {(d.data.unreachable || []).length === 0 ? (
            <Note>없다.</Note>
          ) : (
            <ul className="dlist">
              {d.data.unreachable.map((w) => (
                <li key={w.id}>
                  <span className="amono amuted">{String(w.date || '').slice(0, 10)}</span> {w.title}
                  {w.state === 'kept' ? <span className="chip chip--off">기록으로 둠</span> : null}
                </li>
              ))}
            </ul>
          )}
        </Card>
      </div>
    </>
  )
}

function Signals({ x }) {
  return (
    <span className="dsig">
      {x.unsourced ? <span className={x.linked ? 'chip chip--pending' : 'chip chip--warn'} title={x.linked ? `본문이 기록을 인용한다 — ${x.linked.join(' · ')} 의 좌표정정` : '근거 없음 — 스냅샷'}>근거 없음{x.linked ? ' · 인용' : ''}</span> : null}
      {x.duplicated.length ? (
        <span className="chip chip--warn" title={'같은 줄이 있는 섹션 — ' + x.duplicated.join(' · ')}>
          복제 {x.duplicated.length + (x.duplicatedOmitted || 0)}
        </span>
      ) : null}
      {x.oversize ? <span className="chip" title={`경과 앞 본문 ${x.oversize.lines}줄 · 문턱 ${x.oversize.limit}`}>비대 {x.oversize.lines}줄</span> : null}
      {x.diary ? <span className="chip" title="날짜별로 덧붙인 줄">일지형 {x.diary}</span> : null}
    </span>
  )
}
