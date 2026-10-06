// 문서 이동 줄 — 본문 위 한 줄. **「어디서 왔나」 를 맡는다**(문서 이동 검토 v0.1).
//
// 왼쪽은 「어디서 시작할까」(찾기) · 「무엇과 붙어 있나」(뻗어나가기), 오른쪽 목차는 「이 문서 안 어디인가」 를 답한다.
// 「방금 무엇을 읽고 있었나」 는 어느 영역의 일도 아니어서, 찾기의 범위를 관리문서로 바꾸는 순간 보던 문서가 화면에서
// 사라졌다(운영자 제기 — 용어집을 열면 돌아갈 곳을 모른다).
//
//   ← 이전: <제목>   직전 문서. **이름이 있어야 한다** — 「←」 만 있으면 Alt+← 를 아는 사람만 쓰던 지금과 같다
//   ▾               최근 10건
//   탭 줄            펴 둔 문서(용어집 · 테이블정의서처럼 계속 오가는 것). 탭은 이력이 아니다 — 닫은 문서도 뒤로 가기로 돌아온다
//
// 900px 아래는 탭을 숨기고 「← 이전」 만 남긴다(app.css).

import { useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'
import { kbd } from '../lib/keys.js'

export default function DocNav({ prev, onPrev, recent = [], onOpen, tabs = [], active, onTab, onClose, onPin, onCloseAll }) {
  const [open, setOpen] = useState(false)
  const boxRef = useRef(null)
  const tabsRef = useRef(null)

  useEffect(() => {
    if (!open) return
    const off = (e) => !boxRef.current?.contains(e.target) && setOpen(false)
    const esc = (e) => e.key === 'Escape' && (e.stopPropagation(), setOpen(false))
    window.addEventListener('mousedown', off)
    window.addEventListener('keydown', esc, true)
    return () => {
      window.removeEventListener('mousedown', off)
      window.removeEventListener('keydown', esc, true)
    }
  }, [open])

  // 지금 탭이 줄 밖이면 보이게 — 탭이 여덟이면 좁은 창에서 넘친다
  useEffect(() => {
    const el = tabsRef.current?.querySelector('[aria-selected="true"]')
    el?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' })
  }, [active, tabs.length])

  return (
    <nav className="docnav" aria-label="문서 이동">
      <div className="docnav__back" ref={boxRef}>
        {prev && (
          <button className="docnav__prev" onClick={onPrev} title={`이전 문서 — ${prev.title} (${kbd('⌥←')})`}>
            <Icon name="chevronLeft" size={14} />
            <span className="docnav__cap">이전</span>
            <span className="docnav__t">{prev.title}</span>
          </button>
        )}
        <button
          className="docnav__more"
          aria-expanded={open}
          aria-haspopup="menu"
          disabled={!recent.length}
          onClick={() => setOpen((o) => !o)}
          title={recent.length ? '최근에 본 문서' : '최근에 본 문서가 아직 없다'}
          aria-label="최근에 본 문서"
        >
          {!prev && <span className="docnav__cap">최근</span>}
          <Icon name="chevronDown" size={13} />
        </button>
        {open && (
          <div className="docnav__menu" role="menu">
            <div className="docnav__mcap">최근에 본 문서</div>
            {recent.map((r) => (
              <button
                key={r.id}
                role="menuitem"
                className="docnav__mrow"
                data-missing={r.missing ? '1' : '0'}
                title={r.id}
                onClick={() => {
                  setOpen(false)
                  onOpen(r.id)
                }}
              >
                {r.title}
              </button>
            ))}
          </div>
        )}
      </div>

      {tabs.length > 0 && (
        <div className="docnav__tabs" role="tablist" aria-label="열린 문서" ref={tabsRef}>
          {tabs.map((t) => (
            <div
              key={t.id}
              role="tab"
              className="dtab"
              aria-selected={t.id === active}
              data-pin={t.pin ? '1' : '0'}
              data-missing={t.missing ? '1' : '0'}
              // 가운데 단추 — 브라우저 탭과 같이 닫는다
              onAuxClick={(e) => e.button === 1 && (e.preventDefault(), onClose(t.id))}
            >
              <button
                className="dtab__main"
                onClick={() => onTab(t.id)}
                title={t.missing ? `${t.title} — 목록에 없다(지워졌거나 볼 수 없다)` : t.title}
              >
                {t.pin && <Icon name="pin" size={12} className="dtab__pinmark" />}
                <span className="dtab__t">{t.title}</span>
              </button>
              <button
                className="dtab__btn dtab__pin"
                onClick={() => onPin(t.id)}
                aria-pressed={!!t.pin}
                aria-label={t.pin ? '고정 풀기' : '고정 — 탭이 넘쳐도 닫히지 않는다'}
                title={t.pin ? '고정 풀기' : '고정 — 탭이 넘쳐도 닫히지 않는다'}
              >
                <Icon name="pin" size={12} />
              </button>
              <button className="dtab__btn dtab__x" onClick={() => onClose(t.id)} aria-label="탭 닫기" title="탭 닫기">
                <Icon name="close" size={12} />
              </button>
            </div>
          ))}
        </div>
      )}
      {tabs.length > 1 && (
        <button className="docnav__all" onClick={onCloseAll} title="열린 문서 탭을 모두 닫는다 — 고정한 탭도">
          모두 닫기
        </button>
      )}
    </nav>
  )
}
