// 뻗어나가기 — 왼쪽이 하는 두 일 중 다른 하나. **이 화면의 핵심이다.**
//
// 목록에서 고른 **시작점**에서 한 단계씩 뻗어나가며 다음에 열 문서를 찾는다.
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
// 전에는 왼쪽 아래 절반(226px 열이 한 개 반)에서 이걸 했다. 지금은 왼쪽
// **전부**를 쓴다 — 열이 둘 이상 들어가야 "가로로 뻗는다"가 성립한다.
//
// 규칙 —
//
//   ① **다음 레벨 하나만** 편다. 전체 그래프를 펼치면 그건 그냥 그래프 뷰다
//   ② 중간 열에서 다시 고르면 **그 오른쪽이 전부 교체**된다
//   ③ **루프를 허용한다.** 같은 노드가 여러 열에 나올 수 있다 — 트리가 아니다.
//      A → 좌표 → A 를 막으면 "이 좌표를 이 작업이 또 건드렸다"가 사라진다
//   ④ **보고 있는 것에 따라 다음 한 계층만** 낸다. 계층이 섞이지 않는다 —
//
//        작업문서  →  (정정 관계의 작업문서) · 관리문서 · 좌표
//        좌표      →  관리문서 · 작업문서
//        관리문서  →  섹션
//
//   ⑤ 줄 이름은 **객체 이름 그대로**다. 열 머리에 시작점이 있으니 관계는
//      **자리가 말한다**. 예외 하나 — 정정(`supersedes`)은 작업문서끼리라
//      종류로는 갈리지 않아 그룹 이름이 방향을 말한다(「이 기록을 정정한」 ·
//      「이 기록이 정정한」). 있을 때만 서고 맨 앞에 선다
//   ⑥ 정렬은 객체 성격을 따른다 (store.js `nextNodes`). **상태로 정렬하지 않는다**
//   ⑦ **상태 배지가 없다.** 밀림·미작성은 상태가 아니다

import { useEffect, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import Icon from './Icon.jsx'

const ICON = { work: 'work', coord: 'coord', managed: 'managed', section: 'section' }

export default function Explore({ root, onOpen, onBack }) {
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
    // at — 문서 안에서 갈 자리(섹션). 관리 문서에서 섹션을 누르면 오른쪽
    // 문서가 그 섹션으로 간다. 없으면 문서 첫머리다.
    if (item.open) onOpen(item.open, item.at || null)
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
        <p>찾기에서 하나를 고르면 여기서 뻗어나갑니다.</p>
        <button className="linkbtn" onClick={onBack}>찾기로 <Icon name="arrowRight" size={13} /></button>
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
              <Icon name={ICON[lv.node.kind] || 'coord'} size={14} className="xp__ico" />
              <span className="xp__hname">{lv.node.label}</span>
              {/* 열 번호 — 몇 단계 왔는지. 가로 스크롤로 앞 열이 밀려 나가도
                  지금 깊이는 남는다 */}
              <span className="xp__depth">{i + 1}</span>
            </header>

            <div className="xp__scroll">
              {lv.groups.map((g) => (
                <div className="xp__g" key={g.label}>
                  <div className="xp__glabel">{g.label}<span className="xp__gn">{g.items.length}</span></div>
                  <div className="xp__items">
                    {g.items.map((it, k) => {
                      // 다음 열이 어느 항목에서 뻗었는지 — 선이 이어질 자리
                      const chosen = nextNode && nextNode.kind === it.kind && nextNode.key === it.key
                      return (
                        <button
                          className="xp__it"
                          key={it.kind + it.key + k}
                          aria-current={chosen ? 'true' : undefined}
                          onClick={() => pick(i, it)}
                          title={it.sub ? `${it.key}\n${it.sub}` : it.key}
                        >
                          <Icon name={ICON[it.kind] || 'section'} size={14} className="xp__ico" />
                          <span className="xp__body">
                            <span className="xp__name">{it.label}</span>
                            {/* 부가 한 줄 — 좌표의 한글 이름 · 작업의 작성일 ·
                                관리문서의 섹션 이름. 폭이 넓어져서 이제 들어간다 */}
                            {it.sub && <span className="xp__sub">{it.sub}</span>}
                          </span>
                          {it.n > 1 && <span className="xp__n">{it.n}</span>}
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
