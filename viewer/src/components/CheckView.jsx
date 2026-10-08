// 검증 뷰 — 설계서 §24.1.
//
// 출처를 맨 위에 명시한다 — 이 화면의 결과는 `save` 가 커밋 전에 보는 것과 **같은 계산**이다(§12). 어느 쪽 결과를
// 보고 있는지 숨기지 않는다.
//
// 미등재 좌표에 후보를 제시하는 것이 이 화면의 실질적 가치다 — 프로토콜 §9.6 은
// 쓰는 시점에 막는 이유를 "작성자가 맥락을 쥐고 있어 1초면 고친다"로 설명했다.

import { useState } from 'react'
import { api, currentRepo } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import Icon from './Icon.jsx'
import { copyText } from '../lib/clip.js'
import { plainDetail } from '../lib/format.js'

const SEV = {
  error: { icon: 'block', label: '오류 — 새로 만드는 save 는 거절된다' },
  warn: { icon: 'warn', label: '확인 필요' },
  info: { icon: 'info', label: '안내' },
}

export default function CheckView({ onOpen }) {
  // 결과는 캐시(화면 · 권한 검토 v0.1 R8) — 오버레이를 다시 열면 지난 결과를 즉시 그리고 뒤에서 다시 돈다
  const { data, refresh } = useResource('api:' + currentRepo() + '/check', api.check, { ttl: 0 })
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

        {/* 출처 — 어느 쪽 결과를 보고 있는지 숨기지 않는다(§12). 화면 · save · `ctx check` 가 같은 함수다 —

              화면   store.check()  → runBuiltinCheck (core/check.js)
              save   전 · 후 검사   → runBuiltinCheck — **그 save 가 새로 만든 오류**만 막는다(v1.0 V21)
              ctx    cmdCheck()     → runBuiltinCheck

            git 훅은 없다(v1.0 — 레포는 서버가 쓰고 커밋은 save 가 한다). */}
        <div className="checkhead">
          <span>출처:</span>
          <code>core/check.js</code>
          <span className="src"><Icon name="check" size={12} /> ctx check 와 같은 코드</span>
          <span style={{ color: 'var(--text-2)' }}>
            — <code>save</code> 가 이 계산으로 커밋 전에 막는다. 그 save 가 <b>새로 만든</b> 오류만 막고, 레포에 원래 있던 오류는 경고로 싣는다
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
                    {/* 문장이 id 로 시작하면 떼고 · 백틱을 벗긴다 — id 는 바로 앞 단추에 있다. CLI 는 그 줄만 보니 문장에 id 를 둔다(W4 · L7) */}
                    {it.detail && <span style={{ color: 'var(--text-2)' }}>{plainDetail(it.detail, it.id)}</span>}
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
