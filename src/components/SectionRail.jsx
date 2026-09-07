// 목차 레일 — 뷰어 v0.2 §19 를 자유 형식에 맞게.
//
// v0.2 는 프로토콜 §8.4 의 고정 4섹션을 레일로 그렸다. **그 강제를 폐기했으므로**
// (수행 v1.0 §13) 레일은 문서의 **실제 제목**으로 만든다.
//
// 잃은 것 — 모든 문서가 같은 목차를 갖던 예측 가능성.
// 얻은 것 — 문서가 실제로 말하는 구조. 빈 칸을 취소선으로 보여줄 일도 없다.

import { useEffect, useState } from 'react'

export default function SectionRail({ doc, scrollRef, toc = [] }) {
  const [current, setCurrent] = useState(null)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const onScroll = () => {
      let cur = null
      for (const t of toc) {
        const node = document.getElementById(t.slug)
        if (!node) continue
        if (node.getBoundingClientRect().top - el.getBoundingClientRect().top <= 80) cur = t.slug
      }
      setCurrent(cur)
    }
    onScroll()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => el.removeEventListener('scroll', onScroll)
  }, [doc.id, toc.length])

  if (!toc.length) return null

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  return (
    <nav className="rail" aria-label="목차">
      {toc.slice(0, 14).map((t) => (
        <button
          key={t.slug}
          className="rail__item"
          data-current={current === t.slug}
          onClick={() => jump(t.slug)}
          style={t.level === 3 ? { opacity: 0.75, fontSize: 11.5 } : undefined}
          title={t.text}
        >
          {t.text}
        </button>
      ))}
      {toc.length > 14 && (
        <span className="rail__item" style={{ pointerEvents: 'none' }}>+{toc.length - 14}</span>
      )}
    </nav>
  )
}
