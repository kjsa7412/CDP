// 화면 안의 탭 — 주소다(대기열 · 이력 / 목록 · 서식집). 메뉴 항목을 늘리지 않고 한 화면에 둘을 둔다(화면 22 → 16).
// 탭은 링크라 새 탭 · 뒤로 가기 · 북마크가 된다. 바꿔 쓰지 않고 쌓는다 — 탭을 오간 것이 히스토리다.

import { Link } from '../lib/router.jsx'

export default function ScreenTabs({ items, cur, label }) {
  if (!items || items.length < 2) return null
  return (
    <div className="stabs" role="tablist" aria-label={label}>
      {items.map((t) => (
        <Link key={t.key} to={t.to} role="tab" aria-selected={cur === t.key}>
          {t.label}
          {t.n ? <span className="stabs__n">{t.n}</span> : null}
        </Link>
      ))}
    </div>
  )
}
