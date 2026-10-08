// 관리 문서 — 목록 · 사용 현황 · 안 쓰는 문서 지우기. 관리문서 정리 검토 v0.1 §4.9.
//
// 옛 레포는 패키지가 40종을 부어 한 프로젝트가 다 쓰지 않는다. 여기서 문서마다 「쓰는가」(작업 기록이 쓴 섹션 · 닿은 작업 기록 ·
// 들어오는 참조 · 필수 제출 · 마지막 변경)를 보고, 그 레포의 큐레이터는 고른 문서를 지운다.
//
// **화면은 계획을 세우지 않는다.** 미리보기도 지우기도 서버의 `save`(managed drop)를 부른다 — 미리보기는 `dryRun` 이고
// 고칠 줄(refs)과 그 초안(edit)도 서버가 준다. 화면은 줄마다 「행 지우기 · 링크만 풀기 · 알고 둔다」 를 고르게 할 뿐이다.
// 산문을 고쳐 쓰지 않는다 — 그건 에이전트(`cdp-registry`)에게.
//
// 보기는 누구나 · 지우기 단추는 그 레포의 큐레이터에게만(v1.0 — 관리 문서는 큐레이터만 바꾼다 · admin 은 모든 레포의 큐레이터).

import { useMemo, useState } from 'react'
import { api, currentRepo } from '../../lib/api.js'
import { can } from '../../lib/roles.js'
import { useResource } from '../../lib/cache.js'
import { Card, Note, Btn } from './ui.jsx'

const FILTERS = [
  ['all', '전부'],
  ['idle', '서식 그대로'],
  ['used', '쓰는 중'],
  ['req', '필수'],
]
const CHOICE = { 'drop-row': '행 지우기', unlink: '링크만 풀기', review: '알고 둔다' }
// 같은 묶음 — 관리번호의 끝자리만 다른 것(`TE_201` · `TE_202` · `TE_203`). 안 쓰는 단위는 대개 묶음이다(검토 Q2'')
const groupOf = (no) => (no && /\d{2,}$/.test(no) ? no.slice(0, -1) : null)

export default function Docs({ me = null, say, onChanged = null }) {
  const rk = currentRepo()
  const canDrop = can(me, 'curate', rk)
  // 목록은 캐시(화면 · 권한 검토 v0.1 R8) — 전에는 마운트마다 처음부터 읽어 메뉴로 오갈 때마다 「읽는 중…」 이 섰다(실측 55/59 프레임).
  // 지운 뒤에는 refresh 로 새로 읽는다
  const list = useResource('api:' + rk + '/managed-docs', api.managedDocs, { ttl: 30_000 })
  const data = list.data || null
  const error = list.error ? list.error.message || String(list.error) : null
  const [filter, setFilter] = useState('all')
  const [q, setQ] = useState('')
  const [picked, setPicked] = useState(() => new Set())
  const [preview, setPreview] = useState(null) // { docs, out, choice: Map<key, 'drop-row'|'unlink'|'review'> }
  const [reason, setReason] = useState('')
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const load = () => list.refresh().catch(() => {})

  const docs = data?.docs || []
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return docs.filter((d) => {
      const u = d.usage || {}
      if (filter === 'idle' && u.state !== '서식 그대로') return false
      if (filter === 'used' && u.state !== '쓰는 중') return false
      if (filter === 'req' && !u.required) return false
      return !s || [d.no, d.title, d.path].some((x) => String(x || '').toLowerCase().includes(s))
    })
  }, [docs, filter, q])
  const idle = docs.filter((d) => d.usage?.state === '서식 그대로').length

  const toggle = (p) => {
    const n = new Set(picked)
    n.has(p) ? n.delete(p) : n.add(p)
    setPicked(n)
    setPreview(null)
    setDone(null)
  }
  // 고른 문서와 같은 묶음인데 아직 안 고른 것 — 「같이 고를까」
  const siblings = useMemo(() => {
    const groups = new Set([...picked].map((p) => groupOf(docs.find((d) => d.path === p)?.no)).filter(Boolean))
    return docs.filter((d) => !picked.has(d.path) && !d.blocked && groups.has(groupOf(d.no)))
  }, [picked, docs])

  const runPreview = async () => {
    setBusy(true)
    setDone(null)
    try {
      const list = [...picked]
      const out = await api.docsDrop({ docs: list, dryRun: true })
      if (out?.error) throw Object.assign(new Error(out.error.message), { detail: out.error.detail })
      const choice = new Map((out.dropped?.refs || []).map((x) => [x.file + ':' + x.line, x.edit ? x.suggest : 'review']))
      setPreview({ docs: list, out, choice })
    } catch (e) {
      say?.(e.message || String(e), 'warn')
      setPreview({ docs: [...picked], error: e.message || String(e), detail: e.detail })
    } finally {
      setBusy(false)
    }
  }

  const runDrop = async () => {
    if (!preview?.out) return
    setBusy(true)
    try {
      const refs = preview.out.dropped?.refs || []
      const edits = []
      const reviewed = []
      for (const x of refs) {
        const k = x.file + ':' + x.line
        if (preview.choice.get(k) !== 'review' && x.edit) edits.push(x.edit)
        else reviewed.push(k)
      }
      const out = await api.docsDrop({ docs: preview.docs, reason: reason.trim(), edits, reviewed })
      if (out?.error) throw Object.assign(new Error(out.error.message), { detail: out.error.detail })
      setDone({ commit: out.commit, docs: preview.docs, reviewed: reviewed.length, warnings: out.warnings || [] })
      say?.(`관리 문서 ${preview.docs.length}종을 지웠다 — 커밋 ${out.commit}`)
      setPicked(new Set())
      setPreview(null)
      setReason('')
      await load()
      onChanged?.()
    } catch (e) {
      say?.(e.message || String(e), 'warn')
      setPreview({ ...preview, error: e.message || String(e), detail: e.detail })
    } finally {
      setBusy(false)
    }
  }

  if (error) return <Note tone="warn">관리 문서 목록을 읽지 못했다 — {error}</Note>
  if (!data) return <Note>읽는 중…</Note>

  return (
    <>
      <Card
        title="관리 문서"
        hint={`${data.total}종 · 좌표 ${data.registered} · 비대상 ${data.total - data.registered} · 서식 그대로 ${idle}`}
      >
        <Note>
          「서식 그대로」 는 작업 기록이 쓴 섹션도 · 닿은 작업 기록도 없는 문서다 — <b>아직 안 쓴 것</b>일 수도 <b>안 쓸 것</b>일 수도 있다.
          지울지는 사람이 정한다. 작업 기록이 쓴 문서는 고를 수 없다(합치거나 등록부에서 떼는 것은 에이전트의 「구조 정리」).
        </Note>
        <div className="adocs__bar">
          <div className="adocs__seg" role="tablist" aria-label="거르기">
            {FILTERS.map(([k, label]) => (
              <button key={k} role="tab" aria-selected={filter === k} className="adocs__segbtn" onClick={() => setFilter(k)}>
                {label}
              </button>
            ))}
          </div>
          <input className="adocs__q" placeholder="번호 · 이름 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="문서 찾기" />
        </div>
        <div className="adocs__scroll">
          <table className="atable adocs__table">
            <thead>
              <tr>
                {canDrop && <th aria-label="고르기" />}
                <th>번호</th>
                <th>문서</th>
                <th>유형</th>
                <th>필수</th>
                <th className="ar" title="작업 기록이 쓴 섹션 / 전체">섹션</th>
                <th className="ar" title="이 문서의 좌표를 건드리거나 본문에서 가리킨 작업 기록">작업</th>
                <th className="ar" title="다른 관리 문서 · 어휘 · README 에서 들어오는 참조">참조</th>
                <th>마지막 변경</th>
              </tr>
            </thead>
            <tbody>
              {shown.map((d) => {
                const u = d.usage || {}
                const why = d.blocked ? `작업 기록이 쓴 섹션 ${d.blocked.realSections} · 닿은 작업 기록 ${d.blocked.touchedBy} — 지우지 않는다` : null
                return (
                  <tr key={d.path} className={picked.has(d.path) ? 'is-picked' : u.state === '쓰는 중' ? '' : 'is-idle'}>
                    {canDrop && (
                      <td>
                        <input type="checkbox" checked={picked.has(d.path)} disabled={!!d.blocked || busy} title={why || '지울 문서로 고른다'} onChange={() => toggle(d.path)} aria-label={`${d.no || d.title} 고르기`} />
                      </td>
                    )}
                    <td className="amono">{d.no || '—'}</td>
                    <td>
                      <div className="adocs__title">{d.title}</div>
                      <div className="adocs__path">{d.path}</div>
                    </td>
                    <td>{u.kind === '좌표' ? <span title={d.rules.map((x) => x.pattern).join(' · ')}>좌표</span> : <span className="amuted">비대상</span>}</td>
                    <td>{u.required ? '예' : ''}</td>
                    <td className="ar amono">
                      {u.sections ? `${u.sections.written}/${u.sections.total}` : '—'}
                    </td>
                    <td className="ar amono">{(u.touchedBy || 0) + (u.mentionedBy || 0) || ''}</td>
                    <td className="ar amono" title={(u.refFiles || []).join('\n')}>
                      {u.refsIn || ''}
                    </td>
                    <td title={u.lastChange ? `${u.lastChange.commit} ${u.lastChange.author} — ${u.lastChange.subject}` : ''}>
                      {u.lastChange ? <span className="amono">{u.lastChange.date}</span> : <span className="amuted">—</span>}
                    </td>
                  </tr>
                )
              })}
              {!shown.length && (
                <tr>
                  <td colSpan={canDrop ? 9 : 8} className="amuted">
                    맞는 문서가 없다
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        {canDrop && (
          <div className="adocs__act">
            <span className="amuted">고른 문서 {picked.size}</span>
            {siblings.length > 0 && (
              <Btn onClick={() => setPicked(new Set([...picked, ...siblings.map((d) => d.path)]))} title={siblings.map((d) => d.no).join(' · ')}>
                같은 묶음도 고르기 ({siblings.map((d) => d.no).join(' · ')})
              </Btn>
            )}
            <span className="topbar__spacer" />
            <Btn kind="accent" disabled={!picked.size || picked.size > 10 || busy} onClick={runPreview}>
              {busy && !preview ? '…' : '지우기 미리보기'}
            </Btn>
          </div>
        )}
        {!canDrop && <Note>지우기는 그 레포의 큐레이터가 한다 — 지울 문서를 골라 큐레이터에게 요청한다.</Note>}
      </Card>

      {preview && <Preview preview={preview} setPreview={setPreview} reason={reason} setReason={setReason} busy={busy} onDrop={runDrop} onCancel={() => setPreview(null)} />}

      {done && (
        <Card title="지웠다" hint={`커밋 ${done.commit}`}>
          <ul className="adocs__list">
            {done.docs.map((p) => (
              <li key={p} className="amono">
                {p}
              </li>
            ))}
          </ul>
          {done.reviewed > 0 && <Note tone="warn">알고 둔 줄 {done.reviewed}개는 그대로다 — 검사 「없는 관리 문서를 가리키는 줄」 이 계속 알려 준다.</Note>}
        </Card>
      )}

      {data.dropped?.length > 0 && (
        <Card title="지운 관리 문서" hint="_managed.md 의 기록 — 되살리려면 그 작업 기록의 커밋 바로 앞에서 꺼낸다">
          <table className="atable">
            <thead>
              <tr>
                <th>문서</th>
                <th>지운 기록</th>
                <th>사유</th>
              </tr>
            </thead>
            <tbody>
              {data.dropped.map((x) => (
                <tr key={x.doc + x.work}>
                  <td className="amono">{x.doc}</td>
                  <td className="amono">{x.work}</td>
                  <td>{x.reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  )
}

function Preview({ preview, setPreview, reason, setReason, busy, onDrop, onCancel }) {
  const { out, error, detail } = preview
  if (error && !out) {
    return (
      <Card title="지울 수 없다">
        <Note tone="warn">{error}</Note>
        {detail?.realSections && <Note>작업 기록이 쓴 섹션 — {detail.realSections.slice(0, 8).join(' · ')}</Note>}
        {detail?.touchedBy && <Note>건드린 작업 기록 — {detail.touchedBy.slice(0, 8).join(' · ')}</Note>}
        <Btn onClick={onCancel}>닫기</Btn>
      </Card>
    )
  }
  const d = out.dropped || {}
  const rules = (out.managedChanges || []).flatMap((e) => e.rules || [])
  const refs = d.refs || []
  const fixes = refs.filter((x) => x.edit && preview.choice.get(x.file + ':' + x.line) !== 'review').length
  const pick = (k, v) => {
    const choice = new Map(preview.choice)
    choice.set(k, v)
    setPreview({ ...preview, choice })
  }
  return (
    <Card title="지우기 미리보기" hint="아직 아무것도 바뀌지 않았다 — 한 커밋으로 지운다">
      <div className="arow arow--stack">
        <span className="arow__label">지울 문서 {preview.docs.length}</span>
        <span className="arow__value">
          {preview.docs.map((p) => (
            <div key={p} className="amono">
              {p}
            </div>
          ))}
        </span>
      </div>
      <div className="arow">
        <span className="arow__label">등록부 행</span>
        <span className="arow__value amono">{rules.length ? rules.join(' · ') : '없음(비대상)'}</span>
      </div>
      {d.vocabRemoved?.length > 0 && (
        <div className="arow">
          <span className="arow__label">예시 좌표</span>
          <span className="arow__value amono">{d.vocabRemoved.join(' · ')}</span>
        </div>
      )}
      {d.vocabKept?.length > 0 && <Note>지운 문서로 가던 어휘 좌표 {d.vocabKept.length}개는 남긴다 — 등록부 밖 좌표가 된다(작업 기록이 원천).</Note>}
      {(out.warnings || []).filter((w) => /필수 제출/.test(w)).map((w) => (
        <Note key={w} tone="warn">
          {w}
        </Note>
      ))}

      <div className="adocs__refs">
        <div className="adocs__refshead">
          지울 문서를 가리키는 줄 {refs.length}
          {refs.length > 0 && <span className="amuted"> — 줄마다 어떻게 할지 고른다. 산문은 고쳐 쓰지 않는다(「알고 둔다」 · 고쳐 쓰려면 에이전트에게)</span>}
        </div>
        {refs.map((x) => {
          const k = x.file + ':' + x.line
          const opts = x.edit ? [x.suggest, 'review'] : ['review']
          return (
            <div key={k} className="adocs__ref">
              <div className="adocs__refloc amono">{k}</div>
              <div className="adocs__reftext">{x.text}</div>
              <div className="adocs__refpick" role="radiogroup" aria-label={k}>
                {opts.map((o) => (
                  <label key={o}>
                    <input type="radio" name={k} checked={preview.choice.get(k) === o} onChange={() => pick(k, o)} /> {CHOICE[o]}
                  </label>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {fixes > 20 && <Note tone="warn">한 번에 고칠 줄은 20개까지다(지금 {fixes}) — 몇 줄을 「알고 둔다」 로 바꾸거나 문서를 나눠 지운다.</Note>}
      {error && <Note tone="warn">{error}</Note>}
      <div className="adocs__act">
        <input className="adocs__reason" placeholder="사유 (필수) — 예: 성능시험 없는 사업" value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} aria-label="사유" />
        <Btn onClick={onCancel} disabled={busy}>
          취소
        </Btn>
        <Btn kind="warn" disabled={!reason.trim() || busy || fixes > 20} onClick={onDrop}>
          {busy ? '지우는 중…' : `${preview.docs.length}종 지우기`}
        </Btn>
      </div>
    </Card>
  )
}
