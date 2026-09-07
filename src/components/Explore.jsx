// 뻗어나가기 — 왼쪽 아래 영역. **이 화면의 핵심이다.**
//
// 위 영역(문서 · 좌표 · 그래프)에서 **시작점**을 고르고, 여기서 한 단계씩
// 뻗어나가며 다음에 열 문서를 찾는다.
//
//   ┌ 작업 A ──┐   ┌ table:x ─┐   ┌ 09-02 작업B ┐
//   │ ├ table:x│──▸│ ├ 섹션    │──▸│ ├ …         │
//   │ ├ code:y │   │ └ 09-02 B│   │ └ …         │
//   │ └ 섹션S  │   └──────────┘   └─────────────┘
//
// **가로로 뻗는다.** 세로로 쌓으면 레벨이 깊어질수록 아래로 밀려 시작점이
// 화면 밖으로 나가고, 지금 어디쯤인지 감이 사라진다. 가로면 지나온 길이
// 왼쪽에 그대로 남는다.
//
// 규칙 넷 —
//
//   ① **다음 레벨 하나만** 편다. 전체 그래프를 펼치면 그건 그냥 그래프 뷰다
//   ② 중간 열에서 다시 고르면 **그 오른쪽이 전부 교체**된다
//   ③ **루프를 허용한다.** 같은 노드가 여러 열에 나올 수 있다 — 트리가 아니다.
//      A → 좌표 → A 를 막으면 "이 좌표를 이 작업이 또 건드렸다"가 사라진다
//   ④ 노드는 넷 — 작업 기록 · 좌표 · 관리 문서 · 섹션. 어디서 멈춰도
//      오른쪽에 문서가 뜬다. **줄의 이름이 곧 다음 열이다** — "테이블정의서"를
//      누르면 문서 열이, "rp_plnd_chg_mst" 를 누르면 섹션 열이 열린다

import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'

const MARK = {
  stale: ['밀림', 'w'],
  unwritten: ['미작성', 'q'],
  empty: ['미작성', 'q'],
  orphan: ['끊김', 'd'],
  'anchor-missing': ['섹션 없음', 'd'],
  'doc-missing': ['문서 없음', 'd'],
}
const ICON = { work: '◆', coord: '◇', section: '▤', managed: '▦' }

export default function Explore({ root, onOpen }) {
  // trail[i] = { node, groups } — i 열의 뿌리와 그 다음 레벨
  const [trail, setTrail] = useState([])
  const [busy, setBusy] = useState(false)
  const railRef = useRef(null)

  useEffect(() => {
    if (!root) return setTrail([])
    let dead = false
    setBusy(true)
    api
      .next(root.kind, root.key)
      .then((r) => !dead && setTrail(r ? [r] : []))
      .catch(() => !dead && setTrail([]))
      .finally(() => !dead && setBusy(false))
    return () => { dead = true }
  }, [root?.kind, root?.key])

  // 새 열이 붙으면 그리로 밀어 준다 — 안 하면 오른쪽 화면 밖에서 열린다
  useEffect(() => {
    const el = railRef.current
    if (el) el.scrollLeft = el.scrollWidth
  }, [trail.length])

  const pick = async (depth, item) => {
    if (item.open) onOpen(item.open)
    setBusy(true)
    try {
      const r = await api.next(item.kind, item.key)
      setTrail((t) => (r ? [...t.slice(0, depth + 1), r] : t.slice(0, depth + 1)))
    } finally {
      setBusy(false)
    }
  }

  if (!root) {
    return (
      <div className="xp__empty">
        위에서 <b>시작점</b>을 고르면 여기서 뻗어나갑니다
      </div>
    )
  }

  return (
    <div className="xp" ref={railRef}>
      {trail.map((lv, i) => {
        const nextNode = trail[i + 1]?.node
        return (
          <section className="xp__col" key={i}>
            <header className="xp__head" title={lv.node.key}>
              <span className="xp__ico">{ICON[lv.node.kind]}</span>
              <span className="xp__hname">{lv.node.label}</span>
            </header>

            <div className="xp__scroll">
              {lv.groups.map((g) => (
                <div className="xp__g" key={g.label}>
                  <div className="xp__glabel">{g.label}</div>
                  <div className="xp__items">
                    {g.items.map((it, k) => {
                      const m = MARK[it.mark]
                      // 다음 열이 어느 항목에서 뻗었는지 — 선이 이어질 자리
                      const chosen = nextNode && nextNode.kind === it.kind && nextNode.key === it.key
                      return (
                        <button
                          className="xp__it"
                          key={it.kind + it.key + k}
                          aria-current={chosen ? 'true' : undefined}
                          onClick={() => pick(i, it)}
                          title={it.key}
                        >
                          <span className="xp__ico">{ICON[it.kind]}</span>
                          <span className="xp__name">{it.label}</span>
                          {it.n > 1 && <span className="xp__n">{it.n}</span>}
                          {m && <span className={`xp__m xp__m--${m[1]}`}>{m[0]}</span>}
                        </button>
                      )
                    })}
                  </div>
                </div>
              ))}
              {lv.groups.length === 0 && <div className="xp__none">더 뻗을 곳이 없습니다</div>}
            </div>
          </section>
        )
      })}

      {busy && <div className="xp__busy">…</div>}
    </div>
  )
}
