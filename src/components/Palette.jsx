// ⌘K — 설계서 §20.
//
// 대조 블록이 이 화면의 주인공이다. 프로토콜 §9.5(2)는 "사람이 정본을 외울
// 필요가 없어진다"고 했다. 맞다. 그런데 대조를 몰래 해주면 사용자는 영원히
// 정본을 모른다(§13-⑤). 어떤 표현이 어떤 정본으로 정규화됐고 _vocab.md 의
// 몇 번째 줄이 근거인지 보여준다.

import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { shortDate } from '../lib/format.js'

export default function Palette({ onClose, onOpen, onCoord, onAliasMiss }) {
  const [q, setQ] = useState('')
  const [res, setRes] = useState(null)
  const [force, setForce] = useState(false)
  const [active, setActive] = useState(0)
  const [copied, setCopied] = useState(false)
  const inputRef = useRef(null)

  useEffect(() => inputRef.current?.focus(), [])

  useEffect(() => {
    if (!q.trim()) {
      setRes(null)
      return
    }
    const t = setTimeout(() => {
      api
        .search(q, force)
        .then(setRes)
        .catch(() => setRes(null))
    }, 120) // 타이핑 중 응답 예산 30ms + 디바운스 120ms (§29.2)
    return () => clearTimeout(t)
  }, [q, force])

  const hits = res ? [...res.coordHits, ...res.fullText] : []

  const onKey = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, hits.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) return setForce(true)
      if (res?.idJump) return openAndClose(res.idJump)
      const h = hits[active]
      if (h) openAndClose(h.id)
    }
  }

  const openAndClose = (id) => {
    // 대조 실패 후 전문 검색으로 문서를 열었으면 alias 후보 재료가 된다.
    // 프로토콜 §9.7 "alias 는 발견될 때마다 추가한다"(§20.2)
    if (res && !res.reconciled && res.fullTextRan) onAliasMiss(q, id)
    onOpen(id)
    onClose()
  }

  const copyCoord = () => {
    navigator.clipboard?.writeText(res.reconciled.coord)
    setCopied(true)
    setTimeout(() => setCopied(false), 1400)
  }

  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="palette" role="dialog" aria-label="검색">
        <div className="palette__input">
          <span style={{ color: 'var(--text-3)' }}>⌘K</span>
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => {
              setQ(e.target.value)
              setActive(0)
              setForce(false)
            }}
            onKeyDown={onKey}
            placeholder="자연어로 물어도 됩니다 — 연구계획 테이블 관련 최근 변경"
            aria-label="검색어"
          />
        </div>

        <div className="palette__body">
          {!q.trim() && (
            <div className="palette__group">
              <div className="palette__label">쓰는 법</div>
              <div style={{ padding: '4px 12px', color: 'var(--text-2)', lineHeight: 1.8 }}>
                자유로운 표현을 <b>정본 좌표</b>로 대조한다. 정본을 외울 필요가 없다.
                <br />
                문서 <code>id</code> 를 붙여넣으면 바로 이동한다.
                <br />
                <span className="kbd">⇧⏎</span> 전문 검색 강제 실행
              </div>
            </div>
          )}

          {/* 대조 성공 — 이 블록이 주인공이다 */}
          {res?.reconciled && (
            <div className="palette__group">
              <div className="palette__label">대조</div>
              <div className="recon">
                <span className="recon__from">"{res.reconciled.matched}"</span>
                <span style={{ color: 'var(--text-3)' }}>→</span>
                <span className="recon__to">{res.reconciled.coord}</span>
                <span className="recon__why">
                  {kindLabel(res.reconciled.kind)}
                  {res.reconciled.vocabLine ? ` · _vocab.md:${res.reconciled.vocabLine}` : ''}
                  {res.reconciled.label ? ` · ${res.reconciled.label}` : ''}
                </span>
                <button className="recon__copy" onClick={copyCoord}>
                  {copied ? '복사됨' : '복사'}
                </button>
              </div>
            </div>
          )}

          {/* 대조 실패 — 프로토콜 §9.7 의 재료를 모으는 곳(§20.2) */}
          {res && !res.reconciled && q.trim() && (
            <div className="palette__group">
              <div className="palette__label">대조 실패</div>
              <div className="recon is-miss">
                <span className="recon__from">"{q.trim()}"</span>
                <span style={{ color: 'var(--text-3)' }}>→</span>
                <span className="recon__to">정본 좌표를 찾지 못함</span>
                <span className="recon__why">전문 검색으로 폴백했습니다</span>
              </div>
            </div>
          )}

          {res?.idJump && (
            <div className="palette__group">
              <div className="palette__label">이동</div>
              <button className="palette__hit" data-active onClick={() => openAndClose(res.idJump)}>
                <span className="row__title">{res.idJump}</span>
                <span style={{ color: 'var(--text-3)', fontSize: 11.5 }}>id 붙여넣기 감지 · ⏎</span>
              </button>
            </div>
          )}

          {res?.coord && (
            <div className="palette__group">
              <div className="palette__label">
                좌표 문서
                <span className="count num">
                  {res.coordHits.length}건 중 {res.coordHits.length}건
                  {res.coordHiddenSuperseded.length > 0 && ` · 정정된 문서 ${res.coordHiddenSuperseded.length}건 숨김`}
                </span>
              </div>
              {res.coordHits.length === 0 && (
                <div style={{ padding: '4px 12px', color: 'var(--text-3)' }}>이 좌표에 유효한 문서가 없습니다</div>
              )}
              {res.coordHits.map((d, i) => (
                <Hit key={d.id} d={d} active={i === active} onClick={() => openAndClose(d.id)} />
              ))}
              <button className="palette__hit" style={{ color: 'var(--accent)' }} onClick={() => { onCoord(res.coord); onClose() }}>
                이 좌표에서 뻗어나가기 →
              </button>
            </div>
          )}

          {res && (
            <div className="palette__group">
              <div className="palette__label">
                전문 검색
                <span className="count num">
                  {res.fullTextRan ? `${res.fullText.length}건` : res.fullTextReason}
                </span>
              </div>
              {!res.fullTextRan && (
                <button className="palette__hit" style={{ color: 'var(--accent)' }} onClick={() => setForce(true)}>
                  강제 실행 (⇧⏎)
                </button>
              )}
              {res.fullText.map((d, i) => (
                <Hit
                  key={d.id}
                  d={d}
                  active={res.coordHits.length + i === active}
                  onClick={() => openAndClose(d.id)}
                />
              ))}
              {res.fullTextRan && res.fullText.length === 0 && (
                <div style={{ padding: '4px 12px', color: 'var(--text-3)' }}>0건</div>
              )}
            </div>
          )}
        </div>

        <div className="palette__foot">
          <span>
            <span className="kbd">↑↓</span> 이동
          </span>
          <span>
            <span className="kbd">⏎</span> 열기
          </span>
          <span>
            <span className="kbd">⇧⏎</span> 전문 검색 강제
          </span>
          <span>
            <span className="kbd">esc</span> 닫기
          </span>
        </div>
      </div>
    </div>
  )
}

function Hit({ d, active, onClick }) {
  return (
    <button className="palette__hit" data-active={active} onClick={onClick}>
      <span className="row__date num">{shortDate(d.date)}</span>
      <span className="row__title">{d.title}</span>
      {d.validity.state === 'superseded' && <span className="badge badge--danger">⛔ 정정됨</span>}
      {/* `미결` 은 이관 대상이다 (정정_판정모델_v2 §2) — 상태가 아니라 오류다 */}
      {d.status === '미결' && <span className="badge badge--danger">미결 — 이관 필요</span>}
      {d.settledCoords > 0 && <span className="badge badge--warn">⚠{d.settledCoords}</span>}
    </button>
  )
}

function kindLabel(kind) {
  return { alias: 'alias 일치', canonical: '정본 좌표', value: '좌표 값 일치', label: '설명 일치' }[kind] || kind
}
