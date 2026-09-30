// 확대 — 같은 페이지의 오버레이. ← → 로 다음 장, Esc 로 닫는다. 열려 있는 동안 포커스를 가둔다(S11).

import { useEffect, useRef } from 'react'
import Icon from '../../../viewer/src/components/Icon.jsx'
import { SHOTS, shotById } from '../data/screens.js'
import { shotSrc, useDark, SHOT_W, SHOT_H } from './Shot.jsx'

export default function Lightbox({ id, onGo, onClose }) {
  const dark = useDark()
  const box = useRef(null)
  const back = useRef(null)
  const i = SHOTS.findIndex((s) => s.id === id)
  const s = shotById[id]
  const go = (d) => onGo(SHOTS[(i + d + SHOTS.length) % SHOTS.length].id)
  useEffect(() => {
    back.current = document.activeElement
    box.current?.querySelector('.lb__close')?.focus()
    document.documentElement.classList.add('is-locked')
    return () => {
      document.documentElement.classList.remove('is-locked')
      back.current?.focus?.()
    }
  }, [])
  useEffect(() => {
    const on = (e) => {
      if (e.key === 'Escape') onClose()
      else if (e.key === 'ArrowRight') go(1)
      else if (e.key === 'ArrowLeft') go(-1)
      else if (e.key === 'Tab') {
        const f = [...box.current.querySelectorAll('button')]
        const k = f.indexOf(document.activeElement)
        e.preventDefault()
        f[(k + (e.shiftKey ? -1 : 1) + f.length) % f.length]?.focus()
      }
    }
    addEventListener('keydown', on)
    return () => removeEventListener('keydown', on)
  })
  if (!s) return null
  return (
    <div className="lb" role="dialog" aria-modal="true" aria-label={s.title} ref={box} onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="lb__bar">
        <span className="lb__pos amono">
          {i + 1} / {SHOTS.length}
        </span>
        <b>{s.title}</b>
        <span className="sp" />
        <button type="button" className="st-icon" onClick={() => go(-1)} aria-label="앞 장">
          <Icon name="chevronLeft" size={18} />
        </button>
        <button type="button" className="st-icon" onClick={() => go(1)} aria-label="다음 장">
          <Icon name="chevronRight" size={18} />
        </button>
        <button type="button" className="st-icon lb__close" onClick={onClose} aria-label="닫기 (Esc)">
          <Icon name="close" size={18} />
        </button>
      </div>
      <img className="lb__img" src={shotSrc(id, dark)} width={SHOT_W} height={SHOT_H} alt={`${s.title} — ${s.desc}`} />
      <p className="lb__cap">{s.desc}</p>
    </div>
  )
}
