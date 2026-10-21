// 작업실 › 어휘 — 좌표 · 이름 · alias · 폐기와 후속 · 쓰임(작업 기록 수) · 미등재. 지식 생성 · 작업실 검토 v0.1 §6.2 · D3.
//
// **읽기다.** 어휘를 고치는 것(이름 · alias · 폐기 · 되살리기 · 이름 바꾸기)은 큐레이터 세션의 save `vocab[].op` 다(cdp-registry) —
// 화면은 고른 좌표로 지시 한 줄을 복사하게 한다(대기열의 [에이전트 지시 복사] 와 같은 틀). 계산은 서버 `/vocab`(그래프와 같은 나무).

import { useMemo, useState } from 'react'
import { api, currentRepo } from '../../lib/api.js'
import { useResource } from '../../lib/cache.js'
import { copyText } from '../../lib/clip.js'
import { Card, Note, Btn } from './ui.jsx'

export function vocabCommand(repo, coords) {
  if (!coords.length) return ''
  return `레포 ${repo} 의 어휘를 정리한다(cdp-registry) — ${coords.map((c) => '`' + c + '`').join(' · ')}. 지금 이름 · alias · 쓰임을 match · where 로 보고 고칠 것(update · retire · rename)을 표로 보인 뒤 승인받아 save 한다.`
}

export default function VocabView({ say }) {
  const repo = currentRepo()
  const { data, error } = useResource(`api:${repo}/vocab`, api.vocab, { ttl: 30_000 })
  const [q, setQ] = useState('')
  const [only, setOnly] = useState('all')
  const [picked, setPicked] = useState(() => new Set())
  const types = useMemo(() => {
    const s = q.trim().toLowerCase()
    const hit = (c) => !s || [c.coord, c.label, ...(c.aliases || [])].some((x) => String(x || '').toLowerCase().includes(s))
    const pass = (c) => (only === 'deprecated' ? !!c.deprecated : only === 'unused' ? !c.count && !c.deprecated : true)
    return (data?.types || []).map((t) => ({ ...t, coords: t.coords.filter((c) => hit(c) && pass(c)) })).filter((t) => t.coords.length)
  }, [data, q, only])
  if (error) return <Note tone="warn">어휘를 읽지 못했다 — {error.message}</Note>
  if (!data) return null
  const total = (data.types || []).reduce((a, t) => a + t.coords.length, 0)
  const toggle = (c) =>
    setPicked((s) => {
      const n = new Set(s)
      n.has(c) ? n.delete(c) : n.add(c)
      return n
    })
  const copy = () =>
    copyText(vocabCommand(repo, [...picked])).then((ok) => say?.(ok ? `에이전트 지시를 복사했다 — 좌표 ${picked.size}개 · 자기 PC 의 Claude Code 에 붙인다` : '복사하지 못했다'))

  return (
    <>
      <Card title="어휘" hint={`좌표 ${total} · 타입 ${(data.types || []).length}`}>
        {(data.vocabErrors || []).length > 0 && <Note tone="warn">_vocab.md 오류 {data.vocabErrors.length} — {String(data.vocabErrors[0]?.message || data.vocabErrors[0])}</Note>}
        <div className="adocs__bar">
          <div className="adocs__seg" role="tablist" aria-label="거르기">
            {[
              ['all', '전부'],
              ['unused', '안 쓰임'],
              ['deprecated', '폐기'],
            ].map(([k, l]) => (
              <button key={k} role="tab" aria-selected={only === k} className="adocs__segbtn" onClick={() => setOnly(k)}>
                {l}
              </button>
            ))}
          </div>
          <input className="adocs__q" placeholder="좌표 · 이름 · alias 찾기" value={q} onChange={(e) => setQ(e.target.value)} aria-label="어휘 찾기" />
        </div>
        <div className="adocs__scroll">
          <table className="atable" data-ui="vocab">
            <thead>
              <tr>
                <th aria-label="고르기" />
                <th>좌표</th>
                <th>이름 · alias</th>
                <th className="ar" title="이 좌표를 건드린 작업 기록">기록</th>
                <th>상태</th>
              </tr>
            </thead>
            <tbody>
              {types.flatMap((t) => [
                <tr key={'t:' + t.type} className="qrun">
                  <td />
                  <td colSpan={4}>
                    <b>{t.type}</b> <span className="amuted">· {t.coords.length}</span>
                  </td>
                </tr>,
                ...t.coords.map((c) => (
                  <tr key={c.coord} className={c.deprecated ? 'is-idle' : undefined}>
                    <td>
                      <input type="checkbox" checked={picked.has(c.coord)} onChange={() => toggle(c.coord)} aria-label={`${c.coord} 고르기`} />
                    </td>
                    <td className="amono">{c.coord}</td>
                    <td>
                      {c.label || <span className="amuted">—</span>}
                      {c.aliases?.length ? <div className="adocs__path">{c.aliases.join(' · ')}</div> : null}
                    </td>
                    <td className="ar amono">{c.count || ''}</td>
                    <td>
                      {c.deprecated ? (
                        <span title={c.deprecatedNote || ''}>
                          폐기 {c.deprecated}
                          {c.supersededBy ? <> → <code>{c.supersededBy}</code></> : null}
                        </span>
                      ) : c.sec ? (
                        <span className="amuted">섹션 {c.sec}</span>
                      ) : null}
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          </table>
        </div>
        {!types.length && <Note>맞는 좌표가 없다.</Note>}
        <div className="qfoot">
          <span className="amuted">{picked.size ? `${picked.size}개 고름` : '고칠 좌표를 고른다 — 고치는 것은 큐레이터 세션(cdp-registry)'}</span>
          <span className="topbar__spacer" />
          <Btn kind="accent" onClick={copy} disabled={!picked.size}>
            에이전트 지시 복사
          </Btn>
        </div>
      </Card>
      {(data.unregistered || []).length > 0 && (
        <Card title="미등재" hint="기록이 썼지만 어휘에 없다">
          {data.unregistered.slice(0, 50).map((u) => (
            <div key={u.coord} className="amuted">
              <code>{u.coord}</code> · 기록 {u.count}
            </div>
          ))}
        </Card>
      )}
    </>
  )
}
