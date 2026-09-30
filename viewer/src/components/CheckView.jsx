// 검증 뷰 — 설계서 §24.1.
//
// 출처를 맨 위에 명시한다. 내장 검사를 정본처럼 보여주면 뷰어와 훅이 어긋났을
// 때 사용자가 훅을 의심하지 않는다. 뷰어는 편의, ctx check 가 보증이다(§12).
//
// 미등재 좌표에 후보를 제시하는 것이 이 화면의 실질적 가치다 — 프로토콜 §9.6 은
// 커밋 시점에 막는 이유를 "작성자가 맥락을 쥐고 있어 1초면 고친다"로 설명했다.
// 훅이 안 걸린 PC 에서는 이 화면이 그 1초를 대신한다.

import { useState } from 'react'
import { api, currentRepo } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import Icon from './Icon.jsx'
import { copyText } from '../lib/clip.js'

const SEV = {
  error: { icon: 'block', label: '커밋이 거부될 것' },
  warn: { icon: 'warn', label: '확인 필요' },
  info: { icon: 'info', label: '안내' },
}

export default function CheckView({ onOpen }) {
  // 결과는 캐시(화면 · 권한 검토 v0.1 R8) — 오버레이를 다시 열면 지난 결과를 즉시 그리고 뒤에서 다시 돈다
  const { data, refresh } = useResource('api:' + (currentRepo() || 'local') + '/check', api.check, { ttl: 0 })
  const [busy, setBusy] = useState(false)
  const [copied, setCopied] = useState('')

  const run = () => {
    setBusy(true)
    refresh()
      .catch(() => {})
      .finally(() => setBusy(false))
  }

  if (!data) return <div className="empty">불러오는 중…</div>

  const counts = { error: 0, warn: 0, info: 0 }
  for (const f of data.findings) counts[f.sev] += f.items.length

  const copy = (text, label) => {
    copyText(text).then((ok) => {
      if (!ok) return
      setCopied(label)
      setTimeout(() => setCopied(''), 1400)
    })
  }

  return (
    <div className="docpane">
      <div className="docwrap">
        <h1 style={{ fontSize: 22, margin: '24px 0 8px' }}>검증</h1>

        {/* 출처 — 어느 쪽 결과를 보고 있는지 숨기지 않는다(§12).
            **전에는 거짓말을 하고 있었다.** `bin/ctx 가 없거나 --json 을
            지원하지 않습니다` 를 늘 띄웠는데, 앱은 `bin/ctx` 를 부르려고
            시도한 적이 없다. 그리고 부를 필요도 없다 --

              앱     store.check()  → runBuiltinCheck (core/check.js)
              ctx    cmdCheck()     → runBuiltinCheck (같은 파일을 번들)

            **같은 함수다.** 결과가 갈릴 수 있는 경우는 하나뿐이고, 그것은
            그 레포의 `bin/ctx.mjs` 번들이 낡았을 때다. 그건 앱이 틀린 것이
            아니라 번들이 낡은 것이므로, 그렇게 말한다. */}
        <div className="checkhead">
          <span>출처:</span>
          <code>core/check.js</code>
          <span className="src"><Icon name="check" size={12} /> ctx check 와 같은 코드</span>
          <span style={{ color: 'var(--text-2)' }}>
            — 커밋을 막는 것은 git 훅의 <code>bin/ctx check</code> 다. 그 레포의
            번들이 낡았으면 결과가 다를 수 있다 (<code>ctx version</code>)
          </span>
          <span className="topbar__spacer" />
          <button style={{ color: 'var(--accent)' }} onClick={run} disabled={busy}>
            {busy ? '실행 중…' : '재실행'}
          </button>
        </div>

        {/* 0건일 때도 숫자를 그대로 표시한다. 빈 화면을 만들지 않는다(§13-②) */}
        <div className="checkzero">
          <span style={{ color: counts.error ? 'var(--danger)' : undefined, fontWeight: counts.error ? 600 : 400 }}>
            <Icon name="block" size={13} /> {counts.error}
          </span>
          <span style={{ color: counts.warn ? 'var(--warn)' : undefined, fontWeight: counts.warn ? 600 : 400 }}>
            <Icon name="warn" size={13} /> {counts.warn}
          </span>
          <span><Icon name="info" size={13} /> {counts.info}</span>
          {copied && <span style={{ color: 'var(--accent)' }}>· {copied} 복사됨</span>}
        </div>

        {['error', 'warn', 'info'].map((sev) =>
          data.findings
            .filter((f) => f.sev === sev)
            .map((f) => (
              <section className={`finding sev-${sev}`} key={f.kind}>
                <div className="finding__head">
                  <Icon name={SEV[sev].icon} size={14} />
                  <span>{f.label}</span>
                  {/* 뷰어만 하는 검사에는 꼬리표를 붙인다 — 어느 것이 훅에서
                      걸릴지 사용자가 구분해야 한다(§12) */}
                  {['no-why', 'no-next', 'index-stale'].includes(f.kind) && (
                    <span className="badge badge--quiet">뷰어 자체 검사</span>
                  )}
                  <span className="count num">{f.items.length}건</span>
                </div>
                {/* 누가 무엇으로 치우는가 — 경고를 받은 사람이 다음 할 일을 안다(등록부 사본 검토 X30) */}
                {f.fix && (
                  <div className="finding__suggest" style={{ padding: '2px 0 6px 20px' }}>
                    <Icon name="arrowRight" size={12} /> {f.fix}
                  </div>
                )}

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
                        <Icon name="arrowRight" size={12} /> {typeof it.suggest === 'string' ? it.suggest : `${it.suggest.coord} (${it.suggest.why})`}
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
