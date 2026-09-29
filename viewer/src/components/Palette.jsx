// ⌘K — 설계서 §20.
//
// **거는 곳 넷, 나오는 것 셋.**
//
//   관리문서명 · 작업문서명 · 좌표명 · alias   →   관리문서 · 작업문서 · 좌표
//
// 왼쪽 목록(Finder)이 다루는 객체가 셋인데 검색만 `좌표 문서 / 전문 검색`
// 이라는 다른 갈래로 답하면 같은 레포를 두 가지 이름 체계로 보게 된다.
// 갈래는 **어디서 걸렸나가 아니라 무엇인가**로 정하고, 왜 걸렸는지는 줄마다
// 붙는 `왜` 가 말한다 — alias 로 걸렸으면 **그 alias 를 그대로** 보여준다.
//
// 대조 블록은 그대로 주인공이다. 프로토콜 §9.5(2)는 "사람이 정본을 외울
// 필요가 없어진다"고 했다. 맞다. 그런데 대조를 몰래 해주면 사용자는 영원히
// 정본을 모른다(§13-⑤). 어떤 표현이 어떤 정본으로 정규화됐고 _vocab.md 의
// 몇 번째 줄이 근거인지 보여준다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { shortDate } from '../lib/format.js'
import Icon from './Icon.jsx'
import { copyText } from '../lib/clip.js'

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

  const openAndClose = (id, at = null) => {
    // 이름으로도 본문으로도 정본을 못 집고 문서를 열었으면 alias 후보 재료가
    // 된다. 프로토콜 §9.7 "alias 는 발견될 때마다 추가한다"(§20.2)
    if (res && !res.reconciled && res.fullTextRan) onAliasMiss(q, id)
    onOpen(id, at)
    onClose()
  }

  const goCoord = (coord) => {
    onCoord(coord)
    onClose()
  }

  // 키보드는 **한 줄기로 흐른다.** 갈래가 셋이어도 ↑↓ 는 화면에 보이는 순서
  // 그대로 내려간다 — 갈래를 오가는 키를 따로 두면 손가락이 갈래를 외워야 한다.
  const flat = useMemo(() => {
    if (!res) return []
    return [
      ...(res.managed || []).map((m) => ({ go: () => openAndClose(m.path, m.at) })),
      ...(res.works || []).map((d) => ({ go: () => openAndClose(d.id) })),
      ...(res.coords || []).map((c) => ({ go: () => goCoord(c.coord) })),
    ]
  }, [res])

  const onKey = (e) => {
    if (e.key === 'Escape') return onClose()
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setActive((a) => Math.min(a + 1, flat.length - 1))
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((a) => Math.max(a - 1, 0))
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      if (e.shiftKey) return setForce(true)
      if (res?.idJump) return openAndClose(res.idJump)
      flat[active]?.go()
    }
  }

  const copyCoord = () => {
    copyText(res.reconciled.coord).then((ok) => {
      if (!ok) return
      setCopied(true)
      setTimeout(() => setCopied(false), 1400)
    })
  }

  const counts = res?.counts || { managed: 0, work: 0, coord: 0 }
  const nothing = res && flat.length === 0 && !res.idJump
  // 갈래마다 앞에 몇 줄이 있었나 — 한 줄기 커서를 갈래 안의 자리로 되돌린다
  const at0 = { managed: 0, work: (res?.managed || []).length, coord: (res?.managed || []).length + (res?.works || []).length }

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
            placeholder="관리문서 · 작업문서 · 좌표 이름으로 찾습니다 — 테이블정의서 · 계획서마스터"
            aria-label="검색어"
          />
        </div>

        <div className="palette__body">
          {!q.trim() && (
            <div className="palette__group">
              <div className="palette__label">쓰는 법</div>
              <div style={{ padding: '4px 12px', color: 'var(--text-2)', lineHeight: 1.8 }}>
                <b>관리문서명 · 작업문서명 · 좌표명 · alias</b> 에 겁니다.
                <br />
                자유로운 표현은 <b>정본 좌표</b>로 대조한다 — 정본을 외울 필요가 없다.
                <br />
                문서 <code>id</code> 를 붙여넣으면 바로 이동한다.
                <br />
                <span className="kbd">⇧⏎</span> 본문까지 찾기
              </div>
            </div>
          )}

          {/* 대조 성공 — 이 블록이 주인공이다 */}
          {res?.reconciled && (
            <div className="palette__group">
              <div className="palette__label">대조</div>
              <div className="recon">
                <span className="recon__from">"{res.reconciled.matched}"</span>
                <Icon name="arrowRight" size={13} style={{ color: 'var(--text-3)' }} />
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

          {/* 대조 실패는 **좌표를 하나도 못 찾았을 때만** 말한다.
              좌표가 이름으로 걸렸으면 아래 좌표 갈래가 정본을 이미 보여주고
              있다 — 그때 "정본 좌표를 찾지 못함" 을 띄우면 화면이 자기 결과를
              부정한다. 관리문서를 찾은 사람에게 좌표 대조 실패를 말하는 것도
              같은 소음이다. */}
          {res && !res.reconciled && counts.coord === 0 && q.trim() && (
            <div className="palette__group">
              <div className="palette__label">대조</div>
              <div className="recon is-miss">
                <span className="recon__from">"{q.trim()}"</span>
                <Icon name="arrowRight" size={13} style={{ color: 'var(--text-3)' }} />
                <span className="recon__to">정본 좌표를 찾지 못함</span>
                <span className="recon__why">
                  {res.fullTextRan ? '본문까지 찾았습니다' : '문서 이름에서 찾았습니다'}
                </span>
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

          {/* 갈래 셋 — **왼쪽 목록과 같은 순서, 같은 이름.** */}
          {res && counts.managed > 0 && (
            <Group icon="managed" label="관리문서" shown={res.managed.length} total={counts.managed}>
              {res.managed.map((m, i) => (
                <ManagedHit
                  key={m.path}
                  m={m}
                  active={at0.managed + i === active}
                  onClick={() => openAndClose(m.path, m.at)}
                />
              ))}
            </Group>
          )}

          {res && counts.work > 0 && (
            <Group icon="work" label="작업문서" shown={res.works.length} total={counts.work}>
              {res.works.map((d, i) => (
                <WorkHit key={d.id} d={d} active={at0.work + i === active} onClick={() => openAndClose(d.id)} />
              ))}
            </Group>
          )}

          {res && counts.coord > 0 && (
            <Group icon="coord" label="좌표" shown={res.coords.length} total={counts.coord}>
              {res.coords.map((c, i) => (
                <CoordHit key={c.coord} c={c} active={at0.coord + i === active} onClick={() => goCoord(c.coord)} />
              ))}
            </Group>
          )}

          {nothing && (
            <div className="palette__group">
              <div className="palette__label">
                결과
                <span className="count num">0건</span>
              </div>
              <div style={{ padding: '4px 12px', color: 'var(--text-3)' }}>
                {res.fullTextRan ? <>이름에도 본문에도 없습니다</> : <>이름에 걸리는 것이 없습니다</>}
              </div>
              {!res.fullTextRan && (
                <button className="palette__hit" style={{ color: 'var(--accent)' }} onClick={() => setForce(true)}>
                  본문까지 찾기 (⇧⏎)
                </button>
              )}
            </div>
          )}

          {/* 본문까지 갔으면 **말하고 간다.** 이름으로 찾은 것과 본문으로 찾은
              것은 믿을 수 있는 정도가 다르다 */}
          {res && flat.length > 0 && (
            <div className="palette__note">
              {res.fullTextRan ? (
                <span>이름에서 못 찾아 <b>본문까지</b> 찾았습니다</span>
              ) : (
                <>
                  <span>이름에서 찾았습니다</span>
                  <button onClick={() => setForce(true)}>본문까지 찾기 (⇧⏎)</button>
                </>
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
            <span className="kbd">⇧⏎</span> 본문까지
          </span>
          <span>
            <span className="kbd">esc</span> 닫기
          </span>
        </div>
      </div>
    </div>
  )
}

function Group({ icon, label, shown, total, children }) {
  return (
    <div className="palette__group">
      <div className="palette__label">
        <Icon name={icon} size={12} />
        {label}
        {/* 개수는 언제나 전체를 말한다(§13-②) — 자른 것은 자랐다고 말한다 */}
        <span className="count num">
          {total}건{shown < total ? ` 중 ${shown}건` : ''}
        </span>
      </div>
      {children}
    </div>
  )
}

// 왜 걸렸나 — **alias 로 걸렸으면 그 alias 를 그대로 보여준다.**
// "검색이 알아서 찾아줬다" 로 끝나면 사용자는 그 말이 정본과 어떻게 이어지는지
// 영원히 모른다(§13-⑤).
function Why({ why, matched }) {
  if (!why) return null
  return <span className="hit__why">{matched && matched !== why ? `${why} · ${matched}` : why}</span>
}

function ManagedHit({ m, active, onClick }) {
  return (
    <button className="palette__hit" data-active={active} onClick={onClick}>
      <Icon name="managed" size={13} className="hit__ico" />
      <span className="row__title">{m.name}</span>
      {/* 좌표로 딸려온 줄은 **그 섹션 자리에서** 연다 */}
      {m.at && <span className="hit__at">→ {m.at}</span>}
      <Why why={m.why} />
      <span className="topbar__spacer" />
      <span className="hit__n num" title={`섹션 ${m.sections}개`}>
        {m.sections}
      </span>
    </button>
  )
}

function WorkHit({ d, active, onClick }) {
  return (
    <button className="palette__hit" data-active={active} onClick={onClick}>
      <span className="row__date num">{shortDate(d.date)}</span>
      <span className="row__title">{d.title}</span>
      {d.validity.state === 'superseded' && (
        <span className="badge badge--danger">
          <Icon name="block" size={12} /> 정정됨
        </span>
      )}
      {/* `미결` 은 이관 대상이다 (정정_판정모델_v2 §2) — 상태가 아니라 오류다 */}
      {(d.status === '미결' || d.status === '제안') && (
        <span className="badge badge--danger">{d.status} — 이관 필요</span>
      )}
      {d.settledCoords > 0 && (
        <span className="badge badge--warn">
          <Icon name="warn" size={12} />
          {d.settledCoords}
        </span>
      )}
      <span className="topbar__spacer" />
      <Why why={d.why} />
    </button>
  )
}

function CoordHit({ c, active, onClick }) {
  return (
    <button className="palette__hit" data-active={active} onClick={onClick} title={`${c.coord}\n뻗어나가기로 갑니다`}>
      <Icon name="coord" size={13} className="hit__ico" />
      {/* **정본을 그대로 쓴다.** 값만 보여주면 정본이 무엇인지 영원히 안 배운다 */}
      <span className="row__title mono">{c.coord}</span>
      {c.label && <span className="hit__label">{c.label}</span>}
      {c.deprecated && <span className="badge badge--warn">deprecated</span>}
      <Why why={c.why} matched={c.why === 'alias' ? c.matched : null} />
      <span className="topbar__spacer" />
      <span className="hit__n num" data-zero={c.count ? '0' : '1'} title={`작업문서 ${c.count}건`}>
        {c.count || '·'}
      </span>
    </button>
  )
}

function kindLabel(kind) {
  return { alias: 'alias 일치', canonical: '정본 좌표', value: '좌표 값 일치', label: '설명 일치' }[kind] || kind
}
