// 스크린숏 — 사이트 테마를 따라 라이트/다크 PNG 를 고른다. 누르면 확대(Lightbox).
//
// `<picture media>` 는 OS 설정만 따른다. 사이트의 테마 전환(수동)을 따라가려고 상태로 고른다.

import { useEffect, useState } from 'react'
import { href } from '../router.jsx'
import { isDark } from '../theme.js'
import { shotById } from '../data/screens.js'

export function useDark() {
  const [d, setD] = useState(isDark)
  useEffect(() => {
    const on = () => setD(isDark())
    addEventListener('cdp-theme', on)
    return () => removeEventListener('cdp-theme', on)
  }, [])
  return d
}

export const shotSrc = (id, dark) => href(`/shots/${id}-${dark ? 'dark' : 'light'}.png`)
export const SHOT_W = 1440
export const SHOT_H = 900

export default function Shot({ id, onOpen, eager = false, caption = true }) {
  const dark = useDark()
  const s = shotById[id]
  if (!s) return null
  const img = <img src={shotSrc(id, dark)} width={SHOT_W} height={SHOT_H} alt={`${s.title} — ${s.desc}`} loading={eager ? 'eager' : 'lazy'} decoding="async" />
  return (
    <figure className="shot">
      {onOpen ? (
        <button type="button" className="shot__btn" onClick={() => onOpen(id)} aria-label={`${s.title} 크게 보기`}>
          {img}
        </button>
      ) : (
        img
      )}
      {caption && (
        <figcaption>
          <b>{s.title}</b> <span className="amuted">— {s.desc}</span>
        </figcaption>
      )}
    </figure>
  )
}
