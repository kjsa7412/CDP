// 좌표 그래프 — **3D** (사용자 확정).
//
// **노드는 좌표다. 문서가 아니다.** 실측이 결정했다 —
//
//   문서 노드   31개 · 간선 1개 (supersedes 뿐)   → 그릴 것이 없다
//   좌표 노드   55개 · 간선 65개                   → 덩어리가 보인다
//
// 옵시디언식 문서 그래프가 여기서는 성립하지 않는다. 옵시디언은 본문의
// `[[링크]]` 가 간선인데 CDP 의 작업 기록은 서로를 링크하지 않는다 —
// **좌표를 통해서만 만난다.**
//
// **의존성 0.** 폐쇄망에서 exe 하나로 도는 앱이라 CDN 을 못 쓴다. three.js 를
// 번들하면 exe 가 크게 는다. 3D force + 원근 투영 + z 정렬이면 아래 150줄이고,
// 그것으로 충분하다.
//
// **배치는 결정론적이다.** 고정 시드로 한 번 풀고 멈춘다 — 회전만 한다.
// 매번 다른 모양이 나오면 눈이 그림을 못 외우고, 못 외우면 "저기가 심의
// 덩어리"라는 읽기가 성립하지 않는다.
//
// 여기서 고른 좌표는 **시작점**이다. 그 뒤는 왼쪽 아래가 뻗어나간다.

import { useEffect, useMemo, useRef, useState } from 'react'

const TYPES = ['table', 'screen', 'api', 'module', 'code', 'term', 'batch', 'domain',
  'req', 'proc', 'func', 'prog', 'arch', 'issue', 'test', 'scenario']

// 기본 배율 = 전체가 들어오는 배율의 1.5배.
//
// **전체를 넣으면 읽히지 않는다.** 실측에서 전체 맞춤은 프레임을 폭 99% ·
// 높이 96% 로 이미 꽉 채웠는데, 고립 노드가 57개 중 21개라 바깥으로 밀린
// 그것들이 배율을 정하고 **정작 볼 덩어리는 가운데에 작게 뭉쳤다**(중앙 절반에
// 잉크 39%).
//
// 그래서 기본을 한 단계 조인다. 바깥 몇 개는 프레임을 벗어나지만 `−` 와
// 끌기로 닿을 수 있고, 무엇보다 **처음 보이는 화면이 읽힌다.**
const SNUG = 1.5

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// **노드는 상태를 말하지 않는다.**
//
// 전에는 원의 농도와 테두리로 밀림·미작성을 그렸다. 그 둘은 개념이 아니다 —
// 파생은 필수이므로 섹션은 늘 최신이고, 안 했으면 그것은 상태가 아니라
// **오류**다(`ctx check` 가 커밋을 막는다). 상태가 없는 것을 그림으로 그리면
// 화면이 없는 구분을 있는 것처럼 말한다.
//
// 그래서 노드는 모두 같은 원이고, **크기만 다르다 — 작업 건수다.**
// 남은 색은 고른 것·짚은 것 하나뿐이다.
//
// 배경은 테마를 따른다 — 밝은 테마면 흰 바탕, 어두운 테마면 검은 바탕.

// 노드가 겹쳐도 읽히게 배경색으로 얇게 두른다.
// 발광이 아니라 **분리선**이다 — 헤일로처럼 번지지 않는다.
const HAIRLINE = 1.5

// 클릭과 끌기의 경계(px).
//
// **너무 좁으면 클릭이 안 먹는다.** 누르는 순간 손이 1~3px 은 움직인다.
// 너무 넓으면 회전이 클릭으로 새어 선택이 멋대로 바뀐다. 6px 은 그 사이다.
const SLOP = 6

export default function CoordGraph({ tree, docs, onPick, picked }) {
  const cvRef = useRef(null)
  const paintRef = useRef(null)
  const spinRef = useRef(null)
  // `lock` — **클릭으로 고정한 노드.** 마우스를 떼도 이어진 것이 계속 보인다.
  // `needFit`·`touched` — 첫 그림과 `맞춤` 에서 전체가 들어오게 맞춘다.
  // `base` — **맞춤이 정하는 내부 배율.** `zoom` 은 그 위에 얹는 사용자 배율이라
  // 맞춘 상태가 늘 100% 다. 전에는 둘이 한 값이어서 열자마자 57% 같은 숫자가
  // 떴고, 그 숫자는 아무 기준도 가리키지 않았다.
  const stRef = useRef({
    rx: -0.2, ry: 0.5, spin: true, hover: null, lock: null, drag: null, pts: [],
    base: 1, zoom: 1, px: 0, py: 0, needFit: true, touched: false, center: null,
  })
  // 카테고리 선택 — 고른 그룹만 색이 붙는다
  const [group, setGroup] = useState(null)
  const railRef = useRef(null)
  const [, force] = useState(0)

  const key = useMemo(() => {
    const cs = (tree?.types || []).flatMap((t) => t.coords.map((c) => `${c.coord}:${c.count}:${c.sec || ''}`))
    return cs.join('|') + '#' + (docs || []).map((d) => (d.touches || []).join(',')).join(';')
  }, [tree, docs])

  const g = useMemo(() => build(tree, docs), [key])

  useEffect(() => {
    if (!g || !cvRef.current) return
    const cv = cvRef.current
    const ctx = cv.getContext('2d')
    const S = stRef.current
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    let raf = 0
    const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

    // 그리기와 예약을 나눈다.
    //
    // 전에는 `draw()` 가 그리고 곧바로 다음 프레임을 예약했다. 그래서 **테마가
    // 바뀌어도 다음 프레임이 와야** 다시 칠했다 -- 배경 탭처럼 rAF 가 멎은
    // 상태에서는 어두운 바탕이 밝은 테마 위에 그대로 남는다.
    // 테마는 프레임을 기다릴 일이 아니다.
    const paint = () => {
      const r = cv.getBoundingClientRect()
      const dpr = window.devicePixelRatio || 1
      if (r.width < 4 || r.height < 4) return false
      cv.width = r.width * dpr; cv.height = r.height * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

      // 배경 — 테마를 그대로 따른다
      const bg = css('--surface') || '#fff'
      ctx.fillStyle = bg
      ctx.fillRect(0, 0, r.width, r.height)

      // 아주 느리게 돈다. 잔잔해야 한다
      if (S.spin && !S.drag && !calm) S.ry += 0.0016

      const cx = r.width / 2, cy = r.height / 2, F = Math.min(r.width, r.height) * 1.2

      const sy = Math.sin(S.ry), cy2 = Math.cos(S.ry), sx = Math.sin(S.rx), cx2 = Math.cos(S.rx)

      // 배율·이동을 빼고 원근만 적용한 자리. 맞춤이 이 값을 재고, 투영이 이 값을 쓴다
      const raw = (x, y, z) => {
        const x1 = x * cy2 - z * sy, z1 = x * sy + z * cy2
        const y1 = y * cx2 - z1 * sx, z2 = y * sx + z1 * cx2
        const sc = F / (F + z2 + 250)
        return { x: x1 * sc, y: y1 * sc, z: z2, sc }
      }

      // **맞춤 — 전체가 들어오게 배율을 정한다.**
      //
      // 전에는 `맞춤` 이 회전과 줌을 **상수로 되돌릴 뿐**이었다(이름이 거짓말을
      // 하고 있었다). 그래서 창이 낮으면(뻗어나가기가 아래 절반을 쓴다) 그래프가
      // 위아래로 잘려 나가고, **잘린 노드의 이름은 라벨을 다 그려도 볼 수
      // 없었다.** 실측에서 176px 캔버스에 잉크가 0~175 행까지 닿아 있었다.
      //
      // 이론적 상한(바깥 반지름 × 최악 원근)으로 계산해 봤더니 실제 분포보다
      // 훨씬 커서 배율이 1 로 눌렸다. **실제로 투영해 재는 쪽이 정확하다** —
      // 어차피 맞춤은 요청할 때만 도니 한 번 더 도는 비용은 없는 것과 같다.
      //
      // **결과는 `base` 에 넣고 `zoom` 은 1 로 둔다.** 그래서 맞춘 상태가 100%
      // 이고, 사용자가 보는 숫자는 "맞춤에서 얼마나 더/덜"이라는 뜻이 된다.
      // 전에는 열자마자 57% 가 떴는데 그 57% 는 아무 기준도 가리키지 않았다.
      if (S.needFit) {
        let mx = 0, my = 0
        for (const n of g.nodes) {
          const q = raw(n.x, n.y, n.z)
          mx = Math.max(mx, Math.abs(q.x))
          my = Math.max(my, Math.abs(q.y))
        }
        // 라벨이 노드보다 조금 나간다. 여백은 그만큼만 -- 전에는 52/14 로
        // 크게 비워 두어 그래프가 필요 이상으로 작았다. 라벨은 이제 캔버스
        // 경계에서 안쪽으로 밀리므로 여백으로 막을 필요가 없다.
        const zx = mx > 1 ? (r.width / 2 - 22) / mx : 6
        const zy = my > 1 ? (r.height / 2 - 9) / my : 6
        S.base = Math.max(0.05, Math.min(20, Math.min(zx, zy) * SNUG))
        S.zoom = 1
        S.px = 0
        S.py = 0
        S.needFit = false
      }

      const Z = S.base * S.zoom
      // 공간 이동(pan)을 더한다. 줌만으로는 가장자리 노드를 못 본다 --
      // 화면 밖으로 나간 것을 보려고 매번 축소하면 다시 안 읽힌다.
      const proj = (x, y, z) => {
        const q = raw(x, y, z)
        const x1 = q.x, y1 = q.y, z2 = q.z, sc = q.sc
        return { X: cx + x1 * Z + S.px, Y: cy + y1 * Z + S.py, z: z2, sc }
      }

      S.pts = g.nodes.map((n, i) => ({ i, n, ...proj(n.x, n.y, n.z) })).sort((a, b) => b.z - a.z)

      // **목록에서 고른 좌표는 가운데에 둔다 — 그릴 때마다 다시 맞춘다.**
      //
      // 한 번만 맞추면 어긋난다. 좌표를 고르면 아래 뻗어나가기 패널의 내용이
      // 바뀌고, 그 패널이 다시 흐르면서 **캔버스 높이가 곧바로 달라진다.**
      // 실측에서 고른 노드가 가운데는커녕 캔버스 밖으로 나가 있었다.
      // 크기가 어떻게 바뀌든 따라오게 한다. 사용자가 돌리거나 옮기면 푼다.
      if (S.center != null) {
        const c = S.pts.find((t) => t.i === S.center)
        if (c) {
          const dx = cx - c.X, dy = cy - c.Y
          if (Math.abs(dx) > 0.5 || Math.abs(dy) > 0.5) {
            S.px += dx; S.py += dy
            for (const t of S.pts) { t.X += dx; t.Y += dy }
          }
        }
      }

      // **초점은 짚은 것 아니면 고정한 것이다.**
      //
      // 전에는 hover 뿐이라 마우스를 떼면 강조가 사라졌다 -- 이어진 노드가
      // 무엇인지 보려면 마우스를 계속 그 자리에 두고 있어야 했고, 그러면
      // 정작 이어진 쪽을 눌러 볼 수가 없다.
      const H = S.hover != null ? S.hover : S.lock

      const line = css('--text-3') || '#999'
      const ink = css('--text') || '#111'
      const ink2 = css('--text-2') || '#555'
      const ink3 = css('--text-3') || '#999'
      const accent = css('--accent') || '#2f6fdb'

      // 간선 — 얇고 옅게. 깊이에 따라 더 옅어진다(부드러운 안개)
      ctx.lineWidth = 1
      for (const [i, j] of g.edges) {
        const p = S.pts.find((t) => t.i === i), q = S.pts.find((t) => t.i === j)
        if (!p || !q) continue
        const lit = H != null && (i === H || j === H)
        ctx.strokeStyle = lit ? accent : line
        ctx.globalAlpha = lit ? 0.7 : H != null ? 0.07 : 0.32 * Math.min(1, (p.sc + q.sc) / 2 + 0.3)
        ctx.beginPath(); ctx.moveTo(p.X, p.Y); ctx.lineTo(q.X, q.Y); ctx.stroke()
      }
      ctx.globalAlpha = 1

      // **1단계로 이어진 것을 강조한다.**
      //
      // 전에는 이웃이 "흐려지지만 않은" 상태였다 — 나머지가 0.12 로 빠지니
      // 상대적으로 도드라져 보였을 뿐, 이웃 자신은 아무 표시도 없었다.
      // 그래서 **어디까지가 1단계인지** 눈으로 세어야 했다.
      // **초점과 이웃을 맨 나중에 그린다.**
      //
      // 전에는 z 순(뒤→앞)으로만 그렸다. 밀집한 덩어리에서는 고른 노드가 다른
      // 노드 **뒤에 깔려 보이지 않았다** -- 실측에서 목록으로 찾아 가운데에
      // 세워 놓고도 그 자리 픽셀이 이웃 노드 색이었다. 강조가 가려지면 강조가
      // 아니다. 같은 등급 안에서는 z 순을 그대로 지킨다.
      const rank = (t) => (H == null ? 0 : t.i === H ? 2 : g.nbr[H].has(t.i) ? 1 : 0)
      for (const p of [...S.pts].sort((a, b) => rank(a) - rank(b) || b.z - a.z)) {
        const n = p.n
        const focus = H != null && p.i === H
        const nbr = H != null && !focus && g.nbr[H].has(p.i)
        const dim = H != null && !focus && !nbr
        const R = (2.3 + Math.sqrt(n.count) * 1.5) * p.sc * Z
        const depth = Math.max(0.55, Math.min(1, p.sc * 1.15))
        ctx.globalAlpha = dim ? 0.12 : focus || nbr ? 1 : depth

        // 겹침 분리 — 배경색 하이라이너. 번지지 않는다
        ctx.strokeStyle = bg
        ctx.lineWidth = HAIRLINE
        ctx.beginPath(); ctx.arc(p.X, p.Y, R + HAIRLINE / 2, 0, 7); ctx.stroke()

        // 원 하나. 크기가 곧 작업 건수다.
        //
        // **색은 고른 카테고리에만 붙는다.** 상태로 색을 쓰지 않는다는 원칙은
        // 그대로다 -- 이건 상태가 아니라 **사용자가 지금 무엇을 고르고 있나**
        // 이고, 그것이 색 예산의 파랑(상호작용)이 하는 일이다.
        const inGroup = group != null && n.type === group
        // 채우기 우선순위 — **초점·이웃 > 고른 카테고리 > 보통.**
        //
        // 전에는 카테고리가 이겼다. 그런데 왼쪽 목록에서 고른 좌표는 **언제나
        // 그 카테고리 안에 있다** -- 그래서 고른 순간 그것도 파랑, 주위 57개도
        // 파랑이 되어 무엇을 골랐는지 알 수 없었다. 초점은 어두운 먹으로 두고
        // 파랑 무리 위에 얹는다.
        ctx.fillStyle = focus || nbr ? ink : inGroup ? accent : ink2
        if (group != null && !inGroup && !focus && !nbr) ctx.globalAlpha = dim ? 0.1 : depth * 0.4
        ctx.beginPath(); ctx.arc(p.X, p.Y, R, 0, 7); ctx.fill()
        if (inGroup && !focus && !nbr) {
          // 고른 것은 조금 더 크게 — 색을 못 보는 사람에게도 구별이 남는다
          ctx.globalAlpha = 1
          ctx.strokeStyle = accent
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(p.X, p.Y, R + 2, 0, 7); ctx.stroke()
        }

        // 1단계 이웃 — 초점보다 한 겹 얇게. **초점과 구별돼야 한다**
        if (nbr) {
          ctx.globalAlpha = 0.8
          ctx.strokeStyle = accent
          ctx.lineWidth = 1
          ctx.beginPath(); ctx.arc(p.X, p.Y, R + 2.8, 0, 7); ctx.stroke()
        }

        if (n.coord === picked || focus) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = accent
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(p.X, p.Y, R + 4.5, 0, 7); ctx.stroke()
        }
      }

      // 라벨 — **전부 보인다.**
      //
      // 전에는 `count >= 2` 인 것만 이름을 달았다. 작업 1건인 좌표가 절반이
      // 넘으니 **대부분이 이름 없는 점**이었고, 그래프에서 무엇을 보고 있는지
      // 알 수 없었다. 크기가 이미 건수를 말하는데 이름까지 건수로 걸러
      // 같은 것을 두 번 말하고 있었다.
      //
      // 다 그리면 겹친다. 겹침은 **숨기지 않고 자리를 옮겨** 푼다 —
      //
      //   ① 가까운 것부터 놓는다. 앞에 있는 것이 제자리를 갖는다
      //   ② 오른쪽 → 왼쪽, 위아래로 한 줄씩 밀며 빈 자리를 찾는다
      //   ③ 그래도 없으면 **첫 자리에 그린다.** 안 보이는 것보다 겹치는 편이
      //      낫다 -- 사용자가 원한 것은 "다 보이는 것"이다
      //
      // 그리고 글자마다 **바탕색 테두리**를 두른다. 선·노드 위에 얹혀도 읽힌다.
      const placed = []
      const clash = (b) =>
        placed.some((o) => b.x < o.x2 && b.x2 > o.x && b.y < o.y2 && b.y2 > o.y)

      // **강조할 것이 자리를 먼저 고른다.** 깊이순으로만 놓으면 초점·이웃의
      // 이름이 뒤로 밀려 엉뚱한 데 붙는다 — 정작 읽어야 하는 이름이다.
      const pri = (t) => (H != null && (t.i === H || g.nbr[H].has(t.i)) ? 1 : 0)
      for (const p of [...S.pts].sort((a, b) => pri(b) - pri(a) || b.sc - a.sc)) {
        const n = p.n
        const R = (2.3 + Math.sqrt(n.count) * 1.5) * p.sc * Z
        const fs = Math.max(9, Math.round(10.5 * p.sc))

        // **굵기를 재기 전에 정한다.** 자리 계산이 글자 폭을 쓰는데, 다 잰
        // 뒤에 굵게 바꾸면 실제 글자가 잰 상자보다 넓어져 옆 라벨과 겹친다.
        const focus = H != null && p.i === H
        const nbr = H != null && !focus && g.nbr[H].has(p.i)
        // Roboto Mono — `font.css` 에 파일째 심었다. 폐쇄망에서도 이 폰트가 뜬다
        const face = `'Roboto Mono', ui-monospace, Consolas, monospace`
        ctx.font = `${focus || nbr ? '600 ' : ''}${fs}px ${face}`
        const w = ctx.measureText(n.v).width
        const h = fs + 2

        // 캔버스 밖은 후보가 아니다 — 밀어내다가 화면을 나가면 안 보이는 것과
        // 같다. 밀림 폭을 아무리 늘려도 그것이 상한이다.
        const inside = (b) => b.x >= 0 && b.y >= 0 && b.x2 <= r.width && b.y2 <= r.height
        let bx = Math.min(Math.max(0, p.X + R + 5), Math.max(0, r.width - w))
        let by = Math.min(Math.max(h, p.Y + 3.5), r.height - 2)
        for (let k = 0; k < 8; k++) {
          const dy = k * (h + 1)
          const cands = k === 0
            ? [[p.X + R + 5, p.Y + 3.5], [p.X - R - 5 - w, p.Y + 3.5]]
            : [[p.X + R + 5, p.Y + 3.5 - dy], [p.X + R + 5, p.Y + 3.5 + dy],
               [p.X - R - 5 - w, p.Y + 3.5 - dy], [p.X - R - 5 - w, p.Y + 3.5 + dy]]
          let done = false
          for (const [cx3, cy3] of cands) {
            const box = { x: cx3 - 1, y: cy3 - h + 2, x2: cx3 + w + 1, y2: cy3 + 3 }
            if (!inside(box) || clash(box)) continue
            bx = cx3; by = cy3; placed.push(box); done = true; break
          }
          if (done) break
        }

        // 짚은 것이 있으면 그 이웃만 진하게. **숨기지는 않는다.**
        const inGroup = group != null && n.type === group
        let a = H == null || focus || nbr ? Math.max(0.62, Math.min(1, p.sc * 1.15)) : 0.22
        if (group != null && !inGroup && !focus && !nbr) a = Math.min(a, 0.3)
        ctx.globalAlpha = focus || nbr || inGroup ? 1 : a

        // **이름도 같이 강조한다.** 노드만 굵게 하면 "저 점이 이어졌다"까지만
        // 알고 그것이 무엇인지는 다시 짚어야 한다 -- 이름이 답이다.
        // (굵기는 위에서 이미 정했다)
        ctx.lineJoin = 'round'
        ctx.strokeStyle = bg
        ctx.lineWidth = focus || nbr ? 3.2 : 2.6
        ctx.strokeText(n.v, bx, by)
        ctx.fillStyle = inGroup ? accent : focus || nbr ? ink : ink2
        ctx.fillText(n.v, bx, by)
      }
      ctx.globalAlpha = 1
      return true
    }
    // **회전만 프레임을 쓴다.** 끌기·줌·테마는 그 자리에서 그린다.
    //
    // 전에는 모든 그리기가 rAF 에 매달려 있었다. 그래서 rAF 가 멎은 상태
    // (배경 탭, 창이 안 그려지는 환경)에서는 **끌어도 화면이 안 움직였다.**
    // 그리고 멈춰 있는 그래프에 60fps 를 계속 태우는 것도 낭비다.
    const draw = () => {
      paint()
      raf = S.spin && !S.drag && !calm ? requestAnimationFrame(draw) : 0
    }
    // **가드를 두지 않는다.** "프레임이 예약돼 있으니 곧 그려진다"는 가정은
    // rAF 가 멎은 상태(배경 탭)에서 깨지고, 그러면 끌어도 화면이 안 움직인다.
    // 55노드에서 한 프레임 더 그리는 비용은 없는 것과 같다.
    const now = () => paint()
    const spinOn = () => { if (!raf && S.spin && !calm) draw() }

    // 왼쪽 끌기 = 회전 · Shift·가운데·오른쪽 끌기 = **공간 이동**
    const down = (e) => {
      const panning = e.shiftKey || e.button === 1 || e.button === 2
      if (e.button === 1) e.preventDefault()
      if (panning) S.touched = true
      S.dragged = false
      S.center = null   // 손으로 돌리거나 옮기면 따라다니기를 그만둔다
      S.drag = { x: e.clientX, y: e.clientY, rx: S.rx, ry: S.ry, px: S.px, py: S.py, pan: panning, moved: 0 }
      cv.style.cursor = panning ? 'grabbing' : 'grab'
    }
    // **끌었는지를 여기서 판정해 남긴다.**
    //
    // 브라우저는 mouseup 다음에 click 을 보낸다. 전에는 `up` 이 `S.drag` 를
    // 지운 뒤 `click` 이 `S.drag.moved` 를 보려 했으므로 그 검사는 **한 번도
    // 참이 된 적이 없다.** 회전을 끝낸 자리가 노드면 선택이 토글되고, 빈
    // 곳이면 선택이 풀렸다 -- 돌려 보는 동안 선택이 계속 사라졌다.
    const up = (e) => {
      if (!S.drag) return
      const dx = e.clientX - S.drag.x, dy = e.clientY - S.drag.y
      // 두 가지로 본다. **직선 거리**는 손떨림에 관대하고(제자리로 돌아온
      // 흔들림은 클릭이다), **누적 거리**는 크게 돌았다가 원점 근처에서 뗀
      // 경우를 잡는다. 둘 중 하나면 끌기다.
      S.dragged = Math.hypot(dx, dy) > SLOP || S.drag.moved > SLOP * 4
      S.drag = null
      cv.style.cursor = ''
      spinOn()
      now()
    }
    const move = (e) => {
      const r = cv.getBoundingClientRect()
      if (S.drag) {
        S.drag.moved += Math.abs(e.movementX) + Math.abs(e.movementY)
        if (S.drag.pan) {
          S.px = S.drag.px + (e.clientX - S.drag.x)
          S.py = S.drag.py + (e.clientY - S.drag.y)
        } else {
          S.ry = S.drag.ry + (e.clientX - S.drag.x) * 0.007
          S.rx = Math.max(-1.3, Math.min(1.3, S.drag.rx + (e.clientY - S.drag.y) * 0.007))
        }
        now()
        return
      }
      const mx = e.clientX - r.left, my = e.clientY - r.top
      let best = null, bd = 15
      for (const p of S.pts) { const d = Math.hypot(p.X - mx, p.Y - my); if (d < bd) { bd = d; best = p.i } }
      if (S.hover !== best) { S.hover = best; now() }
      cv.title = best == null ? '' : `${g.nodes[best].coord} · 작업 ${g.nodes[best].count}건 · 이웃 ${g.nbr[best].size}개`
    }
    const click = () => {
      // 회전·이동으로 끝난 몸짓은 클릭이 아니다. 선택은 그대로 둔다.
      if (S.dragged) { S.dragged = false; return }
      if (S.hover != null) {
        // 같은 노드를 다시 누르면 푼다 — 토글이 없으면 해제할 길이 없다
        S.lock = S.lock === S.hover ? null : S.hover
        S.center = null   // 손으로 고른 것은 따라다니지 않는다. 이미 눈앞에 있다
        if (S.lock != null) onPick(g.nodes[S.hover].coord)
        lockChanged()
        return
      }
      // 빈 곳을 누르면 고정을 푼다
      if (S.lock != null) { S.lock = null; S.center = null; lockChanged() }
    }
    // **고정이 바뀌면 React 에도 알린다.**
    //
    // `now()` 는 캔버스만 다시 그린다. 그런데 왼쪽 목록의 선택 표시는 React 가
    // 그린다 -- 알리지 않으면 **그래프에서는 풀렸는데 목록에는 그대로 남는다.**
    // 실측에서 빈 곳을 눌러 푼 뒤에도 목록이 계속 그 좌표를 가리키고 있었다.
    const lockChanged = () => { now(); force((x) => x + 1) }
    // 줌 — 휠. 화면 좌표를 배율만 바꾸므로 원근이 흔들리지 않는다
    // 줌은 **커서를 기준으로** 한다. 화면 중앙 기준이면 가장자리를 확대할 때
    // 보려던 것이 밖으로 밀려나 계속 놓친다.
    const wheel = (e) => {
      S.touched = true
      S.center = null
      e.preventDefault()
      const r = cv.getBoundingClientRect()
      const z0 = S.zoom
      const z1 = Math.min(6, Math.max(0.3, z0 * (e.deltaY < 0 ? 1.12 : 0.893)))
      if (z1 === z0) return
      const mx = e.clientX - r.left, my = e.clientY - r.top
      const cx = r.width / 2, cy = r.height / 2
      S.px += ((mx - cx - S.px) / z0) * (z0 - z1)
      S.py += ((my - cy - S.py) / z0) * (z0 - z1)
      S.zoom = z1
      now()
      force((x) => x + 1)
    }
    cv.addEventListener('mousedown', down)
    cv.addEventListener('mousemove', move)
    cv.addEventListener('click', click)
    cv.addEventListener('wheel', wheel, { passive: false })
    // 오른쪽 끌기로 이동할 수 있게 컨텍스트 메뉴를 막는다
    const ctxmenu = (e) => e.preventDefault()
    cv.addEventListener('contextmenu', ctxmenu)
    window.addEventListener('mouseup', up)
    // **캔버스는 폰트를 스스로 불러오지 않는다.**
    //
    // DOM 텍스트는 그리려 할 때 웹폰트를 받아오지만 `ctx.font` 는 그러지
    // 않는다 -- 이미 적재된 것만 쓰고, 아니면 조용히 대체 폰트로 그린다.
    // 실측에서 `document.fonts.check` 가 false 였다. 명시적으로 받아 온다.
    document.fonts?.load("500 12px 'Roboto Mono'").then(() => now()).catch(() => {})

    // 바탕은 테마를 따른다 — 프레임을 기다리지 않고 바로 따라간다
    const themeObs = new MutationObserver(paint)
    themeObs.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    mq.addEventListener('change', paint)

    // **크기가 바뀌면 다시 그린다.**
    //
    // `paint()` 는 폭·높이가 4px 미만이면 아무것도 하지 않고 돌아간다(0 크기에
    // 그릴 수 없다). 그런데 크기 변화를 보는 것이 없어서, **마운트 순간에 좁았던
    // 캔버스는 그 뒤로 영원히 빈 채로 남았다** -- 실측에서 좁은 창에서 그래프
    // 탭을 열고 창을 넓히니 캔버스 속성이 300x150(기본값) 그대로였다.
    //
    // 창 크기·좌우 비율·gutter 드래그·읽기 모드가 모두 이 크기를 바꾼다.
    // 하나씩 이벤트를 붙이지 않고 요소를 관찰한다.
    //
    // **캔버스가 아니라 부모를 본다.** 콜백에서 `cv.width` 를 쓰면 캔버스 자신의
    // 박스가 바뀌므로, 캔버스를 관찰하면 자기가 만든 변화를 다시 받거나(루프)
    // 브라우저가 그것을 눌러 아예 안 오거나 한다 -- 실측에서 후자였다.
    // 부모는 이 콜백이 건드리지 않으니 안전하다.
    const sizeObs = new ResizeObserver(() => {
      // **손댄 배율은 지키다.** 확대해 놓고 창을 넓혔는데 배율이 되돌아가면
      // 보던 자리를 잃는다. 아직 안 손댔으면 새 크기에 맞춘다.
      if (!S.touched) S.needFit = true
      now()
    })
    sizeObs.observe(cv.parentElement || cv)
    // 관찰이 막힌 환경(구형 웹뷰)에서도 창 크기만은 잡는다
    window.addEventListener('resize', now)

    paintRef.current = now
    spinRef.current = spinOn
    draw()
    return () => {
      paintRef.current = null
      spinRef.current = null
      cancelAnimationFrame(raf)
      themeObs.disconnect()
      sizeObs.disconnect()
      window.removeEventListener('resize', now)
      mq.removeEventListener('change', paint)
      cv.removeEventListener('mousedown', down)
      cv.removeEventListener('mousemove', move)
      cv.removeEventListener('click', click)
      cv.removeEventListener('wheel', wheel)
      cv.removeEventListener('contextmenu', ctxmenu)
      window.removeEventListener('mouseup', up)
    }
  }, [g, picked, group])

  // **목록이 그래프를 따라간다.**
  //
  // 그래프에서 노드를 눌러도 그 좌표가 왼쪽 목록의 스크롤 밖에 있으면 아무
  // 표시도 보이지 않는다 -- 두 쪽이 같은 것을 가리키는데 한쪽만 안 보이면
  // 무엇을 골랐는지 확인할 수 없다.
  useEffect(() => {
    railRef.current?.querySelector('[aria-pressed="true"]')
      ?.scrollIntoView({ block: 'nearest' })
  })

  if (!g || !g.nodes.length) return <div className="gr__empty">좌표가 없습니다 — <code>_vocab.md</code> 를 확인하세요</div>

  const S = stRef.current

  // 카테고리 — **있는 것만.** 0건인 타입을 줄로 내면 고를 수 없는 줄이 생긴다.
  // 순서는 `TYPES`(어휘 선언 순서)를 따른다 — 화면마다 다르면 눈이 자리를
  // 기억할 수 없다.
  const groups = []
  {
    const cnt = new Map()
    for (const n of g.nodes) cnt.set(n.type, (cnt.get(n.type) || 0) + 1)
    for (const t of TYPES) if (cnt.has(t)) groups.push([t, cnt.get(t)])
    for (const [t, c] of cnt) if (!TYPES.includes(t)) groups.push([t, c])
  }

  // 버튼은 상태만 바꾸고 **다시 그리라고 알린다** — React 리렌더는 캔버스를
  // 건드리지 않는다. `paintRef` 가 그 다리다.
  const repaint = () => { paintRef.current?.(); force((x) => x + 1) }
  const zoomBy = (k) => {
    S.touched = true
    S.zoom = Math.min(6, Math.max(0.3, S.zoom * k))
    repaint()
  }

  // 고른 카테고리의 좌표들. **이름순** — 좌표 정렬 규칙(카테고리순 + 카테고리
  // 안 이름순)의 뒷단이다. 여기는 이미 한 카테고리 안이므로 이름순만 남는다.
  const items = group == null ? [] : g.nodes
    .map((n, i) => ({ i, v: n.v, count: n.count, type: n.type }))
    .filter((n) => n.type === group)
    .sort((a, b) => a.v.localeCompare(b.v, 'ko'))

  // 목록에서 고른 좌표를 **그래프에서 찾아 준다.**
  //
  // 고정만 하면 화면 밖에 있을 때 아무 일도 안 일어난 것처럼 보인다. 그래서
  // `S.center` 에 적어 두면 `paint()` 가 **그릴 때마다** 그 노드를 가운데로
  // 끌어온다. 한 번만 맞추면 캔버스 크기가 곧바로 바뀌면서 어긋난다.
  //
  // 회전도 멈춘다. 찾아 놓고 흘러가 버리면 찾은 것이 아니다.
  const pickNode = (i) => {
    S.lock = i
    S.hover = null
    S.touched = true
    S.spin = false
    S.center = i
    onPick?.(g.nodes[i].coord)
    repaint()
  }

  return (
    <div className="gr">
      <div className="gr__bar">
        노드 {g.nodes.length} · 간선 {g.edges.length} · 덩어리 {g.comps}
        {g.iso > 0 && ` · 고립 ${g.iso}`}
        <span className="fd__spacer" />
        <button className="gr__btn" onClick={() => zoomBy(1 / 1.3)} aria-label="축소">−</button>
        <span className="gr__zoom">{Math.round(S.zoom * 100)}%</span>
        <button className="gr__btn" onClick={() => zoomBy(1.3)} aria-label="확대">+</button>
        <button
          className="gr__btn"
          onClick={() => {
            S.rx = -0.2; S.ry = 0.5; S.px = 0; S.py = 0
            S.lock = null; S.center = null; S.touched = false; S.needFit = true
            repaint()
          }}
          title="기본 배율로 되돌린다 (전체를 보려면 −) · 위치·고정 초기화"
        >
          맞춤
        </button>
        <button className="gr__btn" onClick={() => { S.spin = !S.spin; spinRef.current?.(); repaint() }} aria-pressed={S.spin}>
          회전
        </button>
      </div>
      <div className="gr__legend">
        <span className="gr__hint">
          크기 = 작업 건수 · <b>노드를 누르면 이어진 것이 고정</b> ·
          빈 곳을 누르면 풀린다 · <b>왼쪽에서 카테고리 → 좌표를 고르면 찾아 준다</b> ·
          휠 확대 · 끌어서 회전 · Shift+끌기 이동 · 바깥까지 보려면 <b>−</b>
        </span>
      </div>
      {/* 왼쪽 레일 — 두 단이다.
          ① 카테고리 목록 · ② 고른 카테고리의 좌표 목록.
          283개 중에서 하나를 눈으로 찾는 것은 불가능하다. 목록에서 고르면
          그 노드를 고정하고 화면 가운데로 데려온다. */}
      <div className="gr__body">
        <div ref={railRef} className={'gr__groups' + (group ? ' gr__groups--items' : '')} aria-label="카테고리">
          {group == null ? (
            groups.map(([t, c]) => (
              <button
                key={t}
                className="gr__g"
                title={`${t} ${c}개 — 눌러서 목록 보기`}
                onClick={() => setGroup(t)}
              >
                <span className="gr__gname">{t}</span>
                <span className="gr__gn">{c}</span>
              </button>
            ))
          ) : (
            <>
              <button className="gr__back" onClick={() => setGroup(null)} title="카테고리 목록으로">
                <span aria-hidden="true">←</span> {group}
              </button>
              {items.map(({ i, v, count }) => (
                <button
                  key={i}
                  className="gr__i"
                  aria-pressed={S.lock === i}
                  title={`${g.nodes[i].coord} · 작업 ${count}건 — 눌러서 그래프에서 찾기`}
                  onClick={() => pickNode(i)}
                >
                  <span className="gr__gname">{v}</span>
                  {count > 0 && <span className="gr__gn">{count}</span>}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="gr__wrap"><canvas ref={cvRef} className="gr__cv" /></div>
      </div>
    </div>
  )
}

function build(tree, docs) {
  if (!tree?.types) return null
  const nodes = []
  for (const t of tree.types) {
    for (const c of t.coords) {
      nodes.push({
        coord: c.coord, type: t.type, v: c.coord.slice(c.coord.indexOf(':') + 1),
        count: c.count || 0, x: 0, y: 0, z: 0,
      })
    }
  }
  if (!nodes.length) return { nodes, edges: [], nbr: [], comps: 0, iso: 0 }
  const idx = new Map(nodes.map((n, i) => [n.coord, i]))

  const em = new Map()
  for (const d of docs || []) {
    const t = (d.touches || []).filter((c) => idx.has(c))
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
      em.set([t[i], t[j]].sort().join('|'), 1)
    }
  }
  const edges = [...em.keys()].map((k) => { const [a, b] = k.split('|'); return [idx.get(a), idx.get(b)] })
  const nbr = nodes.map(() => new Set())
  for (const [i, j] of edges) { nbr[i].add(j); nbr[j].add(i) }

  layout3d(nodes, edges)


  const seen = new Set(); let comps = 0, iso = 0
  for (let i = 0; i < nodes.length; i++) {
    if (seen.has(i)) continue
    comps++; let size = 0; const stack = [i]; seen.add(i)
    while (stack.length) { const x = stack.pop(); size++; for (const y of nbr[x]) if (!seen.has(y)) { seen.add(y); stack.push(y) } }
    if (size === 1) iso++
  }
  return { nodes, edges, nbr, comps, iso }
}

// 3D 힘 배치 — 한 번 풀고 멈춘다.
//
// **순수 force 만으로는 값이 안 난다.** 실측 성분 분포가 23 · 7 · 5 · 2 · 그리고
// 1이 18개다. 그대로 풀면 떠다니는 점 구름이 된다. 타입별로 구(球) 위에 자리를
// 먼저 주고 그 위에서 force 가 푼다 — 고립 노드도 자기 타입 구역에 남는다.
function layout3d(nodes, edges) {
  const rand = rng(0x5eed)
  const types = [...new Set(nodes.map((n) => n.type))]
    .sort((a, b) => (TYPES.indexOf(a) + 99) % 99 - (TYPES.indexOf(b) + 99) % 99 || a.localeCompare(b))
  const C = new Map()
  types.forEach((t, i) => {
    // 구 위에 고르게 — 황금각 나선
    const y = 1 - (i / Math.max(1, types.length - 1)) * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = i * 2.399963
    C.set(t, { x: Math.cos(th) * r * 130, y: y * 110, z: Math.sin(th) * r * 130 })
  })
  for (const n of nodes) {
    const c = C.get(n.type)
    n.x = c.x + (rand() - 0.5) * 60
    n.y = c.y + (rand() - 0.5) * 60
    n.z = c.z + (rand() - 0.5) * 60
  }

  // O(n^2) x TICKS. 55노드에서 수십 ms 다. 수백을 넘으면 틱을 줄인다.
  const N = nodes.length
  const TICKS = N <= 120 ? 260 : N <= 400 ? 140 : 80
  const L = 52
  const F = nodes.map(() => [0, 0, 0])
  for (let s = 0; s < TICKS; s++) {
    const al = 1 - s / TICKS
    for (const f of F) { f[0] = 0; f[1] = 0; f[2] = 0 }
    for (let i = 0; i < N; i++) for (let j = i + 1; j < N; j++) {
      let dx = nodes[i].x - nodes[j].x, dy = nodes[i].y - nodes[j].y, dz = nodes[i].z - nodes[j].z
      let d2 = dx * dx + dy * dy + dz * dz
      if (d2 < 1) { dx = rand(); dy = rand(); dz = rand(); d2 = 1 }
      const f = Math.min(70, 3000 / d2), d = Math.sqrt(d2)
      F[i][0] += dx / d * f; F[i][1] += dy / d * f; F[i][2] += dz / d * f
      F[j][0] -= dx / d * f; F[j][1] -= dy / d * f; F[j][2] -= dz / d * f
    }
    for (const [i, j] of edges) {
      const dx = nodes[j].x - nodes[i].x, dy = nodes[j].y - nodes[i].y, dz = nodes[j].z - nodes[i].z
      const d = Math.max(1, Math.hypot(dx, dy, dz)), f = (d - L) * 0.055
      F[i][0] += dx / d * f; F[i][1] += dy / d * f; F[i][2] += dz / d * f
      F[j][0] -= dx / d * f; F[j][1] -= dy / d * f; F[j][2] -= dz / d * f
    }
    for (let i = 0; i < N; i++) {
      const n = nodes[i], c = C.get(n.type)
      F[i][0] += (c.x - n.x) * 0.02 - n.x * 0.004
      F[i][1] += (c.y - n.y) * 0.02 - n.y * 0.004
      F[i][2] += (c.z - n.z) * 0.02 - n.z * 0.004
      const m = Math.hypot(F[i][0], F[i][1], F[i][2]), cap = 8 * al + 0.3, k = m > cap ? cap / m : 1
      n.x += F[i][0] * k; n.y += F[i][1] * k; n.z += F[i][2] * k
    }
  }
}
