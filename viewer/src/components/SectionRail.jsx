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

import { memo, useEffect, useRef, useState } from 'react'
import Icon from './Icon.jsx'

// `memo` — 본문이 스크롤될 때마다 DocView 가 진행률로 다시 그려진다. 그때마다
// 목차 수백 줄을 다시 맞춰 볼 일이 없다.
export default memo(function SectionRail({ doc, scrollRef, toc = [], open = true, onToggle }) {
  const [current, setCurrent] = useState(null)
  const navRef = useRef(null)

  // 지금 섹션 — **한 프레임에 한 번만 잰다.**
  //
  // 스크롤 이벤트는 프레임보다 자주 온다. 전에는 올 때마다 제목 292개를
  // `getElementById` 로 다시 찾고 전부 쟀다. 제목 노드는 문서가 바뀔 때 한 번만
  // 찾고, 문서 순서대로 서 있으므로 기준선을 넘는 첫 제목에서 멈춘다.
  useEffect(() => {
    const el = scrollRef.current
    if (!el) return
    const nodes = toc.map((t) => [t.slug, document.getElementById(t.slug)]).filter(([, n]) => n)
    let raf = 0
    const measure = () => {
      raf = 0
      const line = el.getBoundingClientRect().top + 80
      let cur = null
      for (const [slug, node] of nodes) {
        if (node.getBoundingClientRect().top > line) break
        cur = slug
      }
      setCurrent(cur)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    measure()
    el.addEventListener('scroll', onScroll, { passive: true })
    return () => {
      el.removeEventListener('scroll', onScroll)
      cancelAnimationFrame(raf)
    }
  }, [doc.id, toc])

  // 읽고 있는 섹션이 레일 밖으로 나가면 따라 올린다 — 57개짜리 목차에서
  // 지금 자리가 화면 밖이면 목차가 현재 위치를 말하지 못한다.
  //
  // **`scrollIntoView` 를 쓰지 않는다.** 그것은 조상 스크롤을 전부 건드리고
  // 문서 전체의 레이아웃을 그 자리에서 강제한다 — 표 수백 개짜리 문서에서
  // 섹션 경계를 넘을 때마다 스크롤이 한 번씩 걸렸다. 목차 목록만 움직인다.
  useEffect(() => {
    if (!open || !current) return
    const nav = navRef.current
    const item = nav?.querySelector('[data-current="true"]')
    if (!item) return
    const r = item.getBoundingClientRect()
    const n = nav.getBoundingClientRect()
    if (r.top < n.top) nav.scrollTop -= n.top - r.top
    else if (r.bottom > n.bottom) nav.scrollTop += r.bottom - n.bottom
  }, [current, open])

  if (!toc.length) return null

  // 섹션으로 — 컨테이너를 직접 옮긴다(DocView 의 섹션 이동과 같은 규칙).
  //
  // 화면 밖의 표는 그려지지 않은 채 어림 높이로 서 있다(doc.css). 옮긴 자리에서
  // 그것이 그려지면 제목이 조금 밀릴 수 있어 두 프레임 뒤에 한 번 더 맞춘다.
  // 부드러운 스크롤은 그 도중에 표가 그려지며 목표가 움직이므로 쓰지 않는다.
  const jump = (id) => {
    const pane = scrollRef.current
    const el = document.getElementById(id)
    if (!pane || !el) return
    const go = () => {
      pane.scrollTop += el.getBoundingClientRect().top - pane.getBoundingClientRect().top - 12
    }
    go()
    requestAnimationFrame(() => requestAnimationFrame(go))
  }

  return (
    <aside className="toc" data-open={open ? '1' : '0'}>
      <button
        className="toc__toggle"
        onClick={onToggle}
        aria-expanded={open}
        title={open ? '목차 접기' : `목차 펴기 — 섹션 ${toc.length}개`}
      >
        <Icon name={open ? 'chevronRight' : 'section'} size={14} className="toc__ico" />
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
})
