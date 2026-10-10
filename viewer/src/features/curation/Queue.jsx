// 큐레이션 › 대기열 — 큐레이터가 매일 여는 자리(개편안 §7.3 S3 · §3.3).
//
//   위      대기 · 가장 오래된 · 미반영 섹션 · 마지막 큐레이션(`/api/<레포>/repo` 의 curation — App 이 이미 읽은 값) — **0 인 칸은 없다**
//   왼쪽    대기열 — 오래된 순(서버가 정렬). 기록마다 걸린 좌표를 넷으로 — 섹션 있음 · 섹션 없음(등록부만) · 등록부 없음 · 좌표 0
//   오른쪽  고른 기록 하나의 판정 재료(`/queue/<id>` — curate 만) — 고르기 전에는 카드가 없다
//   아래    [기록으로 둠…] · [에이전트 지시 복사]
// 대기가 0 이면 한 문장뿐이다(불변조건 7). 이력은 이 화면의 탭이다(`AdminView`). 큐레이터 폴더 한 줄은 「시작하기」 한 곳에만.
//
// **화면이 직접 하는 판정은 「기록으로 둠」 하나다.** 반영 · 새 문서는 글을 쓰는 일이라 큐레이터의 에이전트 세션(`cdp-curate`)이
// 판정표 + diff 를 보이고 승인 뒤 save 한다 — 그래서 단추는 그 세션에 붙일 지시를 복사한다(서버는 LLM 을 부르지 않는다 · I11).
// 그 세션이 도는 자리가 큐레이터 폴더다 — 코드가 없는 아무 폴더 · 설치 한 줄 `--curator`(v1.0 §6.3). 설치기의 거절 문장이
// 「관리 화면의 큐레이터 한 줄」 을 가리키는 곳은 이제 레포 현황의 「시작하기」 다(서버가 그 폴더를 받았는지 안다).
// 막는 것은 서버다(재료 · 판정은 curate) — 이 화면은 메뉴가 큐레이터에게만 보인다.

import { useMemo, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Card, Note, Btn } from '../../components/admin/ui.jsx'
import { Prompt } from '../../console/ui.jsx'
import { api, currentRepo } from '../../lib/api.js'
import { invalidate, useResource } from '../../lib/cache.js'
import { copyText } from '../../lib/clip.js'
import { Link } from '../../lib/router.jsx'
import { docHref } from '../../lib/doclink.js'
import { coordCounts, curateCommand, formPath } from '../../lib/curation.js'
import { repoBase } from '../../shell/nav.js'
import { useSudo, CANCELLED } from '../../shell/sudo.jsx'
import { ServerAbsent, isAbsent } from './marks.jsx'

const STALE_DAYS = 14

export default function Queue({ repo, me = null, say, onChanged }) {
  const rk = currentRepo()
  const base = repoBase(rk)
  const withSudo = useSudo()
  const q = useResource('api:' + rk + '/queue', api.queue)
  const [picked, setPicked] = useState(() => new Set())
  const [focus, setFocus] = useState(null)
  const [keeping, setKeeping] = useState(false)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState(false)

  const items = q.data?.items || []
  // 고른 것 — 체크한 것, 없으면 지금 보고 있는 줄 하나
  const ids = useMemo(() => (picked.size ? items.filter((r) => picked.has(r.id)).map((r) => r.id) : focus ? [focus] : []), [picked, focus, items])
  const cmd = curateCommand(rk, ids)

  if (isAbsent(q.error)) return <ServerAbsent what="큐레이션 대기열" />
  if (q.error) return <Note tone="bad">대기열을 읽지 못했습니다 — {q.error.message}</Note>
  if (!q.data) return <span className="amuted">읽는 중…</span>
  if (!items.length) return <Note>대기 중인 기록이 없다.</Note>

  const cur = repo?.curation || null
  const oldest = q.data.oldestDays ?? cur?.oldestDays
  const toggle = (id) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })

  const copy = () =>
    copyText(cmd).then((ok) => {
      if (!ok) return say?.('복사하지 못했습니다 — 아래 글을 직접 고른다')
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
      say?.(`에이전트 지시를 복사했다 — 기록 ${ids.length}건 · 자기 PC 의 Claude Code 에 붙인다`)
    })

  // 기록으로 둠 — 사유는 필수다(이력에 남고 기록 머리에 뜬다). 서버가 큐레이션 기록을 지어 save 한다
  const keep = async (reason) => {
    const why = String(reason || '').trim()
    if (!why) return say?.('사유를 적는다 — 왜 섹션에 반영하지 않나')
    setBusy(true)
    try {
      const r = await withSudo(() => api.curate({ verdict: 'keep', ids, reason: why }))
      if (r?.error) {
        say?.(`기록으로 두지 못했다 — ${r.error.message || r.error.code || ''}${r.error.hint ? ' · ' + r.error.hint : ''}`, 10000)
        return
      }
      say?.(`기록 ${ids.length}건을 기록으로 뒀다${r?.id ? ' · ' + r.id : ''}${r?.commit ? ' · 커밋 ' + String(r.commit).slice(0, 7) : ''}`, 6000)
      setKeeping(false)
      setPicked(new Set())
      setFocus(null)
      // 대기열 · 이력 · 기록 목록 · 상태(배지 · 대기 n) · 시작하기가 옛 값으로 남지 않게
      invalidate('api:' + rk + '/')
      invalidate('/next')
      await q.refresh().catch(() => {})
      onChanged?.()
    } catch (e) {
      if (e.message !== CANCELLED) say?.(e.message || '기록으로 두지 못했다', 8000)
    } finally {
      setBusy(false)
    }
  }

  return (
    <>
      <div className="kpis">
        <Kpi n={q.data.total ?? items.length} l="대기" s="기록" />
        {oldest != null && <Kpi n={`${oldest}일`} l="가장 오래된" s={`${STALE_DAYS}일이 넘으면 경고`} warn={oldest > STALE_DAYS} />}
        {cur?.pendingSections > 0 && <Kpi n={cur.pendingSections} l="미반영 섹션" s="섹션 뒤에 기록이 있다" />}
        {cur?.last && <Kpi n={String(cur.last.date || '').slice(5, 10) || '—'} l="마지막 큐레이션" s={cur.last.author || ''} />}
      </div>

      <div className={focus ? 'qsplit' : 'qsplit qsplit--one'}>
        <Card title="대기열" hint="오래된 순">
          <table className="atable qtable">
              <thead>
                <tr>
                  <th aria-label="고르기" />
                  <th>기록</th>
                  <th>걸린 좌표</th>
                  <th>작성</th>
                </tr>
              </thead>
              <tbody>
                {items.map((r) => {
                  const n = coordCounts(r.coords)
                  return (
                    <tr key={r.id} className={focus === r.id ? 'is-picked' : undefined} onClick={() => setFocus(r.id)}>
                      <td onClick={(e) => e.stopPropagation()}>
                        <input type="checkbox" checked={picked.has(r.id)} onChange={() => toggle(r.id)} aria-label={`${r.title || r.id} 고르기`} />
                      </td>
                      <td>
                        <button type="button" className="qtable__title" onClick={() => setFocus(r.id)} title={r.id}>
                          {r.title || r.id}
                        </button>
                        <div className="amuted qtable__sub">
                          {String(r.date || '').slice(0, 16)}
                          {r.ageDays != null && <> · <span className={r.ageDays > STALE_DAYS ? 'awarn' : undefined}>{r.ageDays}일</span></>}
                        </div>
                      </td>
                      <td>
                        <span className="qtable__coords">
                          {r.zero ? <span className="cchip">좌표 0</span> : null}
                          {n.section > 0 && <span className="cchip" title="섹션 있음 — 반영 후보">섹션 {n.section}</span>}
                          {n.anchor > 0 && <span className="cchip" title="등록부에 패턴은 있고 섹션이 없다 — 섹션을 세운다">섹션 없음 {n.anchor}</span>}
                          {n.unregistered > 0 && <span className="cchip cchip--new" title="등록부에 패턴이 없다 — 새 문서 후보 · 또는 기록으로 둠">등록부 없음 {n.unregistered}</span>}
                        </span>
                      </td>
                      <td className="amuted">{r.author || '—'}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            <div className="qfoot">
              <span className="amuted">{picked.size ? `${picked.size}건 고름` : focus ? '지금 보는 기록 1건' : '기록을 고른다 — 체크 또는 줄을 누른다'}</span>
              <span className="topbar__spacer" />
              <Btn onClick={() => setKeeping(true)} disabled={!ids.length || busy} title="섹션에 반영하지 않고 기록으로 둔다 — 사유가 이력에 남는다">
                기록으로 둠…
              </Btn>
              <Btn kind="accent" onClick={copy} disabled={!ids.length} title="자기 PC 의 Claude Code(cdp-curate)에 붙일 지시">
                <Icon name={copied ? 'check' : 'copy'} size={13} /> 에이전트 지시 복사
              </Btn>
            </div>
        </Card>

        {focus && <Materials id={focus} base={base} cmd={ids.length ? cmd : null} />}
      </div>

      {keeping && (
        <Prompt
          title={`기록 ${ids.length}건 — 기록으로 둠`}
          label="사유"
          hint="왜 섹션에 반영하지 않나 — 사전지식 · 회의 잡담 · 다른 기록이 이미 담음. 이력과 그 기록의 머리에 남는다"
          okLabel={busy ? '두는 중…' : '기록으로 둔다'}
          busy={busy}
          onOk={keep}
          onClose={() => setKeeping(false)}
        >
          <ul className="qkeep">
            {items
              .filter((r) => ids.includes(r.id))
              .map((r) => (
                <li key={r.id}>{r.title || r.id}</li>
              ))}
          </ul>
        </Prompt>
      )}
    </>
  )
}

function Kpi({ n, l, s, warn = false }) {
  return (
    <div className={warn ? 'kpi kpi--warn' : 'kpi'}>
      <span className="kpi__l">{l}</span>
      <b className="kpi__n num">{n}</b>
      {s ? <span className="kpi__s">{s}</span> : null}
    </div>
  )
}

// 판정 재료 — 기록 하나. 큐레이터만(서버가 curate 로 막는다)
function Materials({ id, base, cmd }) {
  const rk = currentRepo()
  const m = useResource(id ? 'api:' + rk + '/queue/' + id : null, () => api.queueItem(id), { enabled: !!id, ttl: 30_000 })
  const d = m.data
  const title = d?.record?.title || id
  const coords = d?.coords || []
  const by = (cls) => coords.filter((c) => c.cls === cls)
  const at = (c) => String(c.coord || '').split(':').slice(1).join(':')
  return (
    <Card title={title} hint="판정 재료">
      {isAbsent(m.error) ? (
        <ServerAbsent what="판정 재료" />
      ) : m.error ? (
        <Note tone="bad">재료를 읽지 못했습니다 — {m.error.message}</Note>
      ) : !d ? (
        <span className="amuted">읽는 중…</span>
      ) : (
        <div className="qmat">
          <Section label="반영 후보 — 섹션 있음" empty="없다">
            {by('section').map((c) => (
              <Link key={c.coord} className={c.state === 'pending' ? 'cchip cchip--queued' : 'cchip'} to={c.doc ? docHref(base, c.doc, at(c)) : base} title={`${c.coord}${c.doc ? ' — ' + c.doc : ''}${c.state === 'pending' ? ' · 미반영' : ''}`}>
                {c.coord}
              </Link>
            ))}
          </Section>
          {by('anchor').length > 0 && (
            <Section label="등록부 있음 · 섹션 없음 — 섹션을 세운다">
              {by('anchor').map((c) => (
                <Link key={c.coord} className="cchip" to={c.doc ? docHref(base, c.doc) : base} title={c.doc || c.coord}>
                  {c.coord}
                </Link>
              ))}
            </Section>
          )}
          {by('unregistered').length > 0 && (
            <Section label="등록부 없음 — 새 문서 후보 · 또는 기록으로 둠">
              {by('unregistered').map((c) => (
                <span key={c.coord} className="cchip cchip--new">
                  {c.coord}
                </span>
              ))}
            </Section>
          )}
          {(d.unregisteredTypes || []).length > 0 && (
            <Section label="비슷한 서식">
              {d.unregisteredTypes.map((t) => (
                <div key={t.type} className="qmat__row">
                  <code>{t.type}:*</code>
                  {(t.forms || []).length ? (
                    t.forms.map((f) => (
                      <Link key={f.id} className="cchip" to={base + 'manage/forms/' + formPath(f)} title={f.id}>
                        {f.title || f.id}
                      </Link>
                    ))
                  ) : (
                    <span className="amuted">맞는 서식이 없다</span>
                  )}
                </div>
              ))}
            </Section>
          )}
          {(d.canonical || []).length > 0 && (
            <Section label="정본 후보 — 같은 사실이 걸릴 자리">
              {d.canonical.map((c) => (
                <div key={c.coord} className="qmat__row">
                  <code>{c.coord}</code>
                  {(c.also || []).length > 0 && <span className="amuted"> ← {c.also.join(' · ')}</span>}
                </div>
              ))}
            </Section>
          )}
          {(d.bodyOnly || []).length > 0 && (
            <Section label="본문에만 있는 좌표 — touches 에 없다">
              {d.bodyOnly.map((c) => (
                <span key={c} className="cchip">
                  {c}
                </span>
              ))}
            </Section>
          )}
          {cmd && (
            <Section label="에이전트 지시 — 복사되는 글">
              <pre className="qcmd">{cmd}</pre>
            </Section>
          )}
        </div>
      )}
    </Card>
  )
}

function Section({ label, empty = null, children }) {
  const has = Array.isArray(children) ? children.length > 0 : !!children
  return (
    <div className="qmat__sec">
      <div className="qmat__l">{label}</div>
      <div className="qmat__v">{has ? children : <span className="amuted">{empty}</span>}</div>
    </div>
  )
}
