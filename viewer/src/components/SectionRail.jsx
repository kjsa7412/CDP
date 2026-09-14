// 목차 — 문서 **오른쪽에 세로로.**
//
// 전에는 본문 위에 가로 한 줄로 sticky 하게 얹혔다. 두 가지가 문제였다 —
//
//   ① **다 못 들어간다.** 화면설계서는 섹션이 57개인데 14개만 적고 `+43` 으로
//      끊었다. 끊긴 43개로 가려면 결국 본문을 스크롤해야 했고, 그러면 목차가
//      하는 일이 없다
//   ② **본문 폭을 가로로 먹는다.** 읽기 폭은 `--doc-measure` 로 맞춰 놨는데
//      그 위에 가로 레일이 얹히면 첫 화면에서 본문이 그만큼 밀린다
//
// 세로로 세우면 둘 다 풀린다. 57개가 다 들어가고(넘치면 레일만 스크롤된다),
// 본문은 자기 폭을 그대로 쓴다. **접으면 28px 띠만 남는다** — 좁은 창에서
// 본문을 넓게 볼 때.

import { useEffect, useRef, useState } from 'react'

export default function SectionRail({ doc, scrollRef, toc = [], open = true, onToggle }) {
  const [current, setCurrent] = useState(null)
  const navRef = useRef(null)

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

  // 읽고 있는 섹션이 레일 밖으로 나가면 따라 올린다 — 57개짜리 목차에서
  // 지금 자리가 화면 밖이면 목차가 현재 위치를 말하지 못한다.
  useEffect(() => {
    if (!open || !current) return
    navRef.current?.querySelector('[data-current="true"]')?.scrollIntoView({ block: 'nearest' })
  }, [current, open])

  if (!toc.length) return null

  const jump = (id) => document.getElementById(id)?.scrollIntoView({ block: 'start', behavior: 'smooth' })

  return (
    <aside className="toc" data-open={open ? '1' : '0'}>
      <button
        className="toc__toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? '목차 접기' : `목차 펴기 — 섹션 ${toc.length}개`}
      >
        <span className="toc__ico" aria-hidden="true">{open ? '▸' : '☰'}</span>
        {open && <span className="toc__cap">목차<span className="toc__n">{toc.length}</span></span>}
      </button>

      {open && (
        <nav className="toc__list" ref={navRef} aria-label="목차">
          {toc.map((t) => (
            <button
              key={t.slug}
              className="toc__item"
              data-current={current === t.slug}
              data-level={t.level}
              onClick={() => jump(t.slug)}
              title={t.text}
            >
              {t.text}
            </button>
          ))}
        </nav>
      )}
    </aside>
  )
}
