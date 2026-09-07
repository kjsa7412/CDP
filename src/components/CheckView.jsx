// 검증 뷰 — 설계서 §24.1.
//
// 출처를 맨 위에 명시한다. 내장 검사를 정본처럼 보여주면 뷰어와 훅이 어긋났을
// 때 사용자가 훅을 의심하지 않는다. 뷰어는 편의, ctx check 가 보증이다(§12).
//
// 미등재 좌표에 후보를 제시하는 것이 이 화면의 실질적 가치다 — 프로토콜 §9.6 은
// 커밋 시점에 막는 이유를 "작성자가 맥락을 쥐고 있어 1초면 고친다"로 설명했다.
// 훅이 안 걸린 PC 에서는 이 화면이 그 1초를 대신한다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const SEV = {
  error: { icon: '⛔', label: '커밋이 거부될 것' },
  warn: { icon: '⚠', label: '확인 필요' },
  info: { icon: '○', label: '안내' },
}

export default function CheckView({ onOpen }) {
  const [data, setData] = useState(null)
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const run = () => {
    setBusy(true)
    api
      .check()
      .then(setData)
      .finally(() => setBusy(false))
  }
  useEffect(run, [])

  if (!data) return <div className="empty">불러오는 중…</div>

  const counts = { error: 0, warn: 0, info: 0 }
  for (const f of data.findings) counts[f.sev] += f.items.length

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 1400)
  }

  return (
    <div className="docpane">
      <div className="docwrap">
        <h1 style={{ fontSize: 22, margin: '24px 0 8px' }}>검증</h1>

        {/* 출처 — 어느 쪽 결과를 보고 있는지 숨기지 않는다(§12) */}
        <div className="checkhead">
          <span>출처:</span>
          {data.source === 'ctx' ? (
            <>
              <code>bin/ctx check --json</code>
              <span className="src">✓ 정본 검증</span>
            </>
          ) : (
            <>
              <span>뷰어 내장 검사</span>
              <span className="src is-builtin">⚠ 정본과 다를 수 있음</span>
              <span style={{ color: 'var(--text-2)' }}>
                — <code>bin/ctx</code> 가 없거나 <code>--json</code> 을 지원하지 않습니다
              </span>
            </>
          )}
          <span className="topbar__spacer" />
          <button style={{ color: 'var(--accent)' }} onClick={run} disabled={busy}>
            {busy ? '실행 중…' : '재실행'}
          </button>
        </div>

        {/* 0건일 때도 숫자를 그대로 표시한다. 빈 화면을 만들지 않는다(§13-②) */}
        <div className="checkzero">
          <span style={{ color: counts.error ? 'var(--danger)' : undefined, fontWeight: counts.error ? 600 : 400 }}>
            ⛔ {counts.error}
          </span>
          <span style={{ color: counts.warn ? 'var(--warn)' : undefined, fontWeight: counts.warn ? 600 : 400 }}>
            ⚠ {counts.warn}
          </span>
          <span>○ {counts.info}</span>
          {copied && <span style={{ color: 'var(--accent)' }}>· {copied} 복사됨</span>}
        </div>

        {['error', 'warn', 'info'].map((sev) =>
          data.findings
            .filter((f) => f.sev === sev)
            .map((f) => (
              <section className={`finding sev-${sev}`} key={f.kind}>
                <div className="finding__head">
                  <span>{SEV[sev].icon}</span>
                  <span>{f.label}</span>
                  {/* 뷰어만 하는 검사에는 꼬리표를 붙인다 — 어느 것이 훅에서
                      걸릴지 사용자가 구분해야 한다(§12) */}
                  {['no-why', 'no-next', 'index-stale'].includes(f.kind) && (
                    <span className="badge badge--quiet">뷰어 자체 검사</span>
                  )}
                  <span className="count num">{f.items.length}건</span>
                </div>

                {f.items.map((it, i) => (
                  <div className="finding__item" key={i}>
                    {it.coord && <code style={{ color: 'var(--danger)' }}>{it.coord}</code>}
                    {it.id && (
                      <button style={{ color: 'var(--accent)' }} onClick={() => onOpen(it.id)}>
                        {it.id}
                      </button>
                    )}
                    {it.detail && <span style={{ color: 'var(--text-2)' }}>{it.detail}</span>}
                    {/* 고치는 방법을 같이 준다 */}
                    {it.suggest && (
                      <span className="finding__suggest">
                        → {typeof it.suggest === 'string' ? it.suggest : `${it.suggest.coord} (${it.suggest.why})`}
                        <button
                          style={{ color: 'var(--accent)', marginLeft: 6, textDecoration: 'underline' }}
                          onClick={() =>
                            copy(typeof it.suggest === 'string' ? it.suggest : it.suggest.coord, '정본 좌표')
                          }
                        >
                          복사
                        </button>
                      </span>
                    )}
                    {it.missing?.length > 0 && (
                      <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>누락: {it.missing.join(', ')}</span>
                    )}
                  </div>
                ))}
              </section>
            ))
        )}

        {data.findings.length === 0 && (
          <div className="empty">
            <p>검출된 문제가 없습니다</p>
          </div>
        )}
      </div>
    </div>
  )
}
