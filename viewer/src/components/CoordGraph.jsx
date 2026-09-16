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
import Icon from './Icon.jsx'

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

export default function CoordGraph({ tree, docs, onPick, onGo, picked, onExit }) {
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
  // **이름을 켜고 끈다.**
  //
  // 283개에서는 라벨이 서로를 덮어 그래프가 글자 더미가 된다. 끄면 점만
  // 남아 **덩어리와 안팎**이 보인다 — 그것이 이 그림의 첫 번째 정보다.
  // 이름은 짚거나 고르면 그것만 뜬다.
  const [labels, setLabels] = useState('auto')   // 'on' | 'off' | 'auto'
  // **고립 노드도 기본으로 그린다.**
  //
  // 전에는 숨기는 것이 기본이었다. 어휘(`_vocab.md`)가 DB 덤프에서 이름표를
  // 대량으로 받아 와 넷 중 셋이 아무 것과도 안 이어진 점으로 떠 있었고,
  // **그것들이 배율을 정해 정작 볼 덩어리를 가운데로 밀어 넣었다.**
  //
  // 그 이유는 이제 사라졌다. 배치가 동심 구가 되면서 **고립은 바깥 껍질로
  // 가고 많이 이어진 것이 안쪽으로 온다** — 한쪽에 뭉쳐 배율을 끌고 가는
  // 대신 구의 표면이 된다. 덩어리는 가운데에 그대로 있다.
  //
  // 그리고 **어휘에 있는데 아무 기록도 안 건드린 좌표**는 숨길 사실이 아니다.
  // 그것이 몇 개인지가 이 레포의 상태다. 끄고 싶으면 `고립 숨기기` 가 있다.
  const [hideIso, setHideIso] = useState(false)
  const railRef = useRef(null)
  const [, force] = useState(0)


  const key = useMemo(() => {
    const cs = (tree?.types || []).flatMap((t) => t.coords.map((c) => `${c.coord}:${c.count}:${c.sec || ''}`))
    return cs.join('|') + '#' + (docs || []).map((d) => (d.touches || []).join(',')).join(';') + '#' + hideIso
  }, [tree, docs, hideIso])

  const g = useMemo(() => build(tree, docs, hideIso), [key])

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
        // **분모가 0 에 닿으면 안 된다.** `z2` 는 배치 반지름만큼 음수가 될 수
        // 있고, 그것이 `F + 250` 에 가까워지면 배율이 발산하다 부호가 뒤집힌다.
        // 좌표가 늘수록 배치가 커지므로 언젠가 닿는다 -- 절반에서 막는다.
        const sc = F / Math.max(F * 0.5, F + z2 + 250)
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

      // **인덱스로 찾는다.** 간선 루프가 `S.pts.find()` 를 두 번씩 돌았다 --
      // 간선 200 × 노드 283 = 5만 번의 선형 탐색이 프레임마다 있었다.
      // 지금은 1.4ms 라 티가 안 나지만 좌표가 늘면 그대로 자란다.
      const byI = new Array(g.nodes.length)
      for (const t of S.pts) byI[t.i] = t

      // **목록에서 고른 좌표는 가운데에 둔다 — 그릴 때마다 다시 맞춘다.**
      //
      // 한 번만 맞추면 어긋난다. 좌표를 고르면 아래 뻗어나가기 패널의 내용이
      // 바뀌고, 그 패널이 다시 흐르면서 **캔버스 높이가 곧바로 달라진다.**
      // 실측에서 고른 노드가 가운데는커녕 캔버스 밖으로 나가 있었다.
      // 크기가 어떻게 바뀌든 따라오게 한다. 사용자가 돌리거나 옮기면 푼다.
      if (S.center != null) {
        const c = byI[S.center]
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
      //
      // **옅기가 간선 수를 따라야 한다.** 한 줄의 진하기는 고정인데 줄 수는
      // 레포마다 열 배씩 차이가 난다 -- 옅은 줄도 이천 개가 겹치면 회색 판이
      // 되고, 그 위에서는 노드를 아무리 벌려도 안 벌어져 보인다.
      //
      // 실측 -- 같은 화면에서 선이 덮는 잉크
      //
      //   좌표  83 · 이음  282     1.9%     안개
      //   좌표 301 · 이음 2554    15.8%     판
      //
      // 이음 400 을 기준으로 제곱근만큼 줄인다. 400 이하면 1 이라 지금까지와
      // 같고, 2554 면 0.40 이 되어 6% 로 내려온다. **비례로 줄이지 않는 이유**는
      // 그러면 밀집 레포에서 선이 아예 안 보이기 때문이다 -- 많다는 사실 자체가
      // 정보이므로 짙기는 남기고 판이 되는 것만 막는다.
      const fade = Math.min(1, Math.sqrt(400 / Math.max(1, g.edges.length)))
      ctx.lineWidth = 1
      for (const [i, j] of g.edges) {
        const p = byI[i], q = byI[j]
        if (!p || !q) continue
        const lit = H != null && (i === H || j === H)
        ctx.strokeStyle = lit ? accent : line
        ctx.globalAlpha = lit ? 0.7 : (H != null ? 0.07 : 0.32 * Math.min(1, (p.sc + q.sc) / 2 + 0.3)) * fade
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

      // **이름을 그릴까.**
      //
      // auto — 배율이 낮으면 끈다. 좁은 화면에 283개를 다 적으면 서로를 덮고,
      // 덮인 글자는 없는 것보다 나쁘다(읽으려다 시간을 쓴다).
      // 끈 상태에서도 **짚은 것과 고른 것, 그 1단계 이웃**은 그린다 —
      // 이름을 보려고 켜는 것이 아니라 짚으면 나오게 한다.
      // `auto` 는 배율만 봤다. 그런데 이름이 서로를 덮는 것은 배율이 아니라
      // **개수**가 정한다 -- 좌표 301 개에서는 맞춤 배율이 얼마든 글자 더미다.
      // 실제로 그 레포 사용자는 `이름 끔` 을 손으로 눌러 놓고 쓰고 있었다.
      // auto 가 자동으로 해야 할 일을 사람이 하고 있었던 것이다.
      // `켬` 은 그대로 다 그린다 -- 끄는 것은 auto 의 판단이지 금지가 아니다.
      const showAll = labels === 'on'
        || (labels === 'auto' && S.base * S.zoom >= 0.9 && g.nodes.length <= 150)
      if (showAll || H != null) {
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
      // 끈 상태에서는 초점과 그 1단계 이웃만 이름을 갖는다
      for (const p of [...S.pts].sort((a, b) => pri(b) - pri(a) || b.sc - a.sc)) {
        if (!showAll && !(H != null && (p.i === H || g.nbr[H].has(p.i)))) continue
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
  }, [g, picked, group, labels])

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
  //
  // 순서는 **어휘가 선언한 순서**다. 전에는 여기 `TYPES` 라는 배열이 있었는데,
  // 주석은 "어휘 선언 순서"라고 해 놓고 실은 **옛 어휘를 얼려 둔 복사본**이었다.
  // 타입 이름은 레포가 정하므로 그 복사본은 맞을 수가 없다 — 한글 타입을 쓰는
  // 레포에서는 14개가 전부 "모르는 타입"이 되어 알파벳순으로 뭉갰다.
  //
  // `g.nodes` 는 `build()` 가 `tree.types` 를 그대로 훑어 쌓은 것이고, 그것이
  // `_vocab.md` 의 `## <타입>` 순서다. Map 은 넣은 순서를 지키므로 세기만 하면
  // 순서가 따라온다.
  const groups = []
  {
    const cnt = new Map()
    for (const n of g.nodes) cnt.set(n.type, (cnt.get(n.type) || 0) + 1)
    for (const [t, c] of cnt) groups.push([t, c])
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
        {onExit && (
          <button className="gr__btn gr__btn--exit" onClick={onExit} title="문서 화면으로 (Esc)">
            <Icon name="chevronLeft" size={13} /> 문서
          </button>
        )}
        <span className="gr__stat">
          좌표 <b>{g.nodes.length}</b> · 이음 <b>{g.edges.length}</b> · 덩어리 <b>{g.comps}</b>
          {!hideIso && g.iso > 0 && <> · 고립 <b>{g.iso}</b></>}
        </span>
        {/* 고립 — 이어진 곳이 없는 좌표. 어휘에는 있으나 어떤 작업도 다른
            좌표와 **함께** 건드리지 않았다. 켜면 그림이 점 무더기가 된다 */}
        {(g.hidden > 0 || !hideIso) && (
          <button
            className="gr__btn"
            aria-pressed={!hideIso}
            onClick={() => { stRef.current.needFit = true; stRef.current.touched = false; setHideIso((v) => !v) }}
            title="이어진 곳이 없는 좌표 — 켜면 배율이 그쪽에 맞춰진다"
          >
            고립 {hideIso ? `+${g.hidden}` : '숨기기'}
          </button>
        )}
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
        {/* 이름 — auto 는 배율이 낮으면 끈다. 283개에서 다 적으면 글자 더미가 된다 */}
        <button
          className="gr__btn"
          aria-pressed={labels !== 'off'}
          title={
            labels === 'auto' ? '이름: 자동 (배율이 낮으면 끈다)' : labels === 'on' ? '이름: 항상' : '이름: 끔'
          }
          onClick={() => setLabels(labels === 'auto' ? 'on' : labels === 'on' ? 'off' : 'auto')}
        >
          이름 {labels === 'auto' ? '자동' : labels === 'on' ? '켬' : '끔'}
        </button>
      </div>
      <div className="gr__legend">
        <span className="gr__hint">
          크기 = 작업 건수 · 안쪽일수록 많이 이어진 좌표 ·
          <b> 노드를 누르면 이어진 것만 남는다</b> · 휠 확대 · 끌어서 회전 · Shift+끌기 이동
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
                <Icon name="chevronLeft" size={12} /> {group}
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
        <div className="gr__wrap">
          <canvas ref={cvRef} className="gr__cv" />

          {/* 고른 좌표 — **여기가 그래프에서 나가는 문이다.**
              누르는 것만으로 화면을 바꾸지 않는다. 그 클릭은 "이어진 것만
              보여 달라"는 뜻이고, 떠날지는 읽고 나서 정한다. */}
          {S.lock != null && g.nodes[S.lock] && (
            <div className="gr__sel">
              <Icon name="coord" size={15} className="gr__selico" />
              <code className="gr__selname">{g.nodes[S.lock].coord}</code>
              <span className="gr__selmeta">
                작업 {g.nodes[S.lock].count}건 · 이웃 {g.nbr[S.lock].size}개
              </span>
              <span className="fd__spacer" />
              <button
                className="gr__btn gr__btn--go"
                onClick={() => onGo?.(g.nodes[S.lock].coord)}
                disabled={!onGo}
              >
                뻗어나가기 <Icon name="arrowRight" size={13} />
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function build(tree, docs, hideIso = false) {
  if (!tree?.types) return null
  const all = []
  for (const t of tree.types) {
    for (const c of t.coords) {
      all.push({
        coord: c.coord, type: t.type, v: c.coord.slice(c.coord.indexOf(':') + 1),
        count: c.count || 0, x: 0, y: 0, z: 0,
      })
    }
  }
  if (!all.length) return { nodes: all, edges: [], nbr: [], comps: 0, iso: 0, hidden: 0 }

  // 간선 후보를 먼저 센다 — **무엇을 그릴지 정한 뒤에 배치를 푼다.**
  // 숨길 노드를 배치에 넣고 나중에 빼면 좌표가 그 노드들 자리에 맞춰 굳는다.
  const have = new Set(all.map((n) => n.coord))
  const em = new Map()
  const linked = new Set()
  for (const d of docs || []) {
    const t = (d.touches || []).filter((c) => have.has(c))
    for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) {
      em.set([t[i], t[j]].sort().join('|'), 1)
      linked.add(t[i])
      linked.add(t[j])
    }
  }

  const nodes = hideIso ? all.filter((n) => linked.has(n.coord)) : all
  const hidden = all.length - nodes.length
  if (!nodes.length) return { nodes, edges: [], nbr: [], comps: 0, iso: 0, hidden }
  const idx = new Map(nodes.map((n, i) => [n.coord, i]))

  const edges = [...em.keys()]
    .map((k) => { const [a, b] = k.split('|'); return [idx.get(a), idx.get(b)] })
    .filter(([a, b]) => a != null && b != null)
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
  return { nodes, edges, nbr, comps, iso, hidden }
}

// 3D 힘 배치 — 한 번 풀고 멈춘다.
//
// **순수 force 만으로는 값이 안 난다.** 실측 성분 분포가 23 · 7 · 5 · 2 · 그리고
// 1이 18개다. 그대로 풀면 떠다니는 점 구름이 된다. 구(球) 위에 자리를 먼저 주고
// 그 위에서 force 가 푼다 — 고립 노드도 껍질에 남는다.
// **구다. 그리고 반지름이 뜻을 갖는다.**
//
// 자리는 둘로 나뉜다 — **방향과 반지름.**
//
//   방향    황금각 나선을 노드마다 하나씩. 구를 고르게 덮는다.
//           타입 순으로 돌려서 같은 타입이 위도 띠로 남는다
//   반지름  연결도 순위. 많이 이어진 것이 정중앙, 고립이 바깥 껍질
//
// **힘도 둘로 나눠 건다.** 목표점 하나로 당기면 이어진 것끼리는 스프링이
// 서로를 붙잡아 덩어리째 한쪽으로 떠내려간다. 반지름만 거는 힘은 덩어리가
// 어디로 돌든 원점과의 거리만 고치므로, 많이 이어진 것들이 뭉친 채 가운데로
// 내려앉는다.
//
// 잠깐 렌즈(캔버스 비율을 따르는 타원)로 바꿨다가 되돌렸다. 비율을 따르려면
// 캔버스가 바뀔 때마다 O(n^2) 배치를 다시 풀어야 하는데, 283개에서 그것이
// 창을 끌 때마다 걸렸다. **모양을 얻고 반응을 잃었다.**
//
// 대신 **깊이(반지름)에 뜻을 준다.**
//
//   많이 이어진 좌표   안쪽    이 프로젝트의 중심이다
//   적게 이어진 좌표   바깥    가장자리다
//
// 구는 원래 안쪽이 비어 보인다 -- 표면에만 점이 있으면 껍데기다. 연결도로
// 반지름을 주면 그 빈 곳이 의미로 채워지고, 돌릴 때 **중심에 무엇이 있는지**가
// 보인다. 그것이 이 그래프에서 가장 알고 싶은 것이다.
function layout3d(nodes, edges) {
  const rand = rng(0x5eed)
  // 어휘 선언 순서 그대로. `Set` 이 넣은 순서를 지키고 `nodes` 는 그 순서로
  // 쌓여 있다 — 방향(구 위의 자리)이 어휘 순서를 따라야 왼쪽 목록과 같은
  // 자리에서 같은 타입을 찾는다.
  const types = [...new Set(nodes.map((n) => n.type))]

  // 연결도 -- 이 좌표를 함께 건드린 다른 좌표가 몇 개인가
  const deg = nodes.map(() => 0)
  for (const [a, b] of edges) { deg[a]++; deg[b]++ }

  // **간격은 화면이 아니라 여기서 정해진다.** 맞춤이 전체를 프레임에 넣으므로
  // 배치를 통째로 키워 봐야 배율이 그만큼 줄어 화면은 똑같다 -- 노드 반지름도
  // `Z` 를 타고 같이 줄어든다. 벌어지게 하려면 **전체 크기 대비 이웃 간격**을
  // 키워야 하고, 그것을 정하는 것이 아래 넷(`R` · `L` · 반발 세기 · 스프링 세기)이다.
  //
  // 실측 -- 좌표 83 · 간선 282 (`C:\cdp`). 최근접 거리를 화면 반경으로 나눈 값.
  //
  //   이전  150 ·  52 · 3000 · 0.055    하위10% 0.034  중앙값 0.082  겹친 쌍 7.6
  //   지금  190 · 170 · 12000 · 0.03    하위10% 0.042  중앙값 0.095  겹친 쌍 1.5
  //
  // **겹친 쌍이 다섯 중 하나로 준다.** 중앙값보다 이쪽이 중요하다 -- 붙어 버린
  // 몇 쌍이 "빽빽하다"는 인상을 만들고, 그 쌍은 라벨도 서로를 덮는다.
  const R = 190

  // **방향은 타입이, 반지름은 연결도가 정한다.** 둘을 갈라 놓는 것이 이 배치의
  // 전부다 -- 방향만 있으면 타입별 덩어리이고, 반지름만 있으면 색 없는 양파다.
  //
  // 전에는 타입 중심 한 점을 잡고 그 점을 원점 쪽으로 당긴 자리에 노드를
  // 놓았다. 그러면 **같은 타입이 바큇살 하나에 줄을 선다** -- 방향이 타입마다
  // 하나뿐이라 흩어질 자리가 ±27 의 흔들림밖에 없었다. 어휘에만 있는 좌표가
  // 백 개씩 들어오는 레포에서 그 살 하나가 통째로 한쪽에 뭉쳐 보였다.
  //
  // 지금은 타입이 구 표면의 **구역(원뿔)**을 갖고, 노드는 그 구역 안에서
  // 저마다 다른 방향을 받는다. 구가 채워진다.

  // **반지름은 연결도 순위로 정한다 — 많이 이어진 것이 정중앙이다.**
  //
  // `deg / maxDeg` 를 쓰다가 순위(백분위)로 바꿨다. 나눗셈식은 **가장 많이
  // 이어진 한 좌표가 나머지 전부의 자리를 정한다** -- 최대가 150 인데 대부분
  // 10 언저리면 `sqrt(10/150)=0.26` 이라 거의 모두가 바깥 껍질로 밀리고
  // 안쪽은 텅 빈다. 순위로 재면 안팎이 고르게 채워진다.
  //
  //   순위 상위     0.08 R    거의 정중앙
  //   순위 하위     1.06 R    바깥 껍질 -- 고립 좌표(연결 0)가 여기다
  const ord = nodes.map((_, i) => i).sort((a, b) => deg[a] - deg[b] || a - b)
  const pct = new Array(nodes.length)
  ord.forEach((i, r) => { pct[i] = nodes.length > 1 ? r / (nodes.length - 1) : 0 })
  const rad = nodes.map((_, i) => R * (1.06 - 0.98 * pct[i]))

  // **방향은 구 전체를 고르게 덮는다 — 황금각 나선을 노드마다 하나씩.**
  //
  // 타입마다 원뿔을 하나씩 주다가 버렸다. 어휘에만 있는 좌표가 한 타입에
  // 몰리는 레포가 있다(`C:\cdp` 는 `code:` 159개 중 대부분이 고립이다).
  // 그러면 **그 원뿔만 바깥 껍질에 꽉 차고 나머지 방향은 빈다.** 빈 쪽이
  // 없으니 그 159개의 반발이 한 방향에서만 밀고, 이어진 덩어리가 구의
  // 반대편으로 떠밀린다 -- 실측에서 중심에서 32% 나가 있었다.
  //
  // 나선은 그런 쏠림이 없다. 그리고 **타입 순으로 돌린다** — 같은 타입이
  // 나선에서 이웃이 되어 위도 띠를 이룬다. 구는 고르게 차고 타입은 남는다.
  const order = nodes.map((_, i) => i).sort((a, b) =>
    types.indexOf(nodes[a].type) - types.indexOf(nodes[b].type) || nodes[a].coord.localeCompare(nodes[b].coord))
  const dir = new Array(nodes.length)
  order.forEach((i, k) => {
    const y = 1 - (k + 0.5) / nodes.length * 2
    const r = Math.sqrt(Math.max(0, 1 - y * y))
    const th = k * 2.399963
    dir[i] = [Math.cos(th) * r, y, Math.sin(th) * r]
  })

  for (let i = 0; i < nodes.length; i++) {
    const n = nodes[i], d = dir[i], q = rad[i]
    n.x = d[0] * q + (rand() - 0.5) * 30
    n.y = d[1] * q + (rand() - 0.5) * 30
    n.z = d[2] * q + (rand() - 0.5) * 30
  }

  // O(n^2) x TICKS.
  //
  // **평평한 배열로 돈다.** 전에는 `nodes[i].x` 와 `F[i][0]` 을 직접 읽고 썼다.
  // 좌표 55개에서는 수십 ms 라 티가 안 났는데, 301개 · 이음 2554 인 레포에서
  // **1.6초**가 됐다 -- 그래프 탭이 그만큼 멎는다. 반복 횟수(6백만)가 아니라
  // 객체 속성 접근과 중첩 배열이 그 시간의 대부분이었다.
  //
  // 값은 한 비트도 안 바뀐다. `Float64Array` 는 JS 의 수와 같은 배정밀도이고
  // 연산 순서를 그대로 뒀다 -- **배치가 결정론적이라는 전제가 이 함수의 값어치**라
  // 여기서 결과가 달라지면 안 된다.
  const N = nodes.length
  const TICKS = N <= 120 ? 260 : N <= 400 ? 140 : 80
  // `L` 은 이어진 두 좌표가 쉬는 거리다. 52 는 타입 구역 반지름(190)의 1/4 라
  // 간선이 덩어리를 끝까지 조였다 -- 3D 에서는 벌어져 있어도 **투영하면 겹쳤다.**
  const L = 170
  const px = new Float64Array(N), py = new Float64Array(N), pz = new Float64Array(N)
  const fx = new Float64Array(N), fy = new Float64Array(N), fz = new Float64Array(N)
  // 타입 중심을 연결도만큼 끌어당긴 자리 — 틱마다 다시 계산하던 것을 미리 둔다
  const tx = new Float64Array(N), ty = new Float64Array(N), tz = new Float64Array(N)
  for (let i = 0; i < N; i++) {
    const n = nodes[i], d = dir[i], q = rad[i]
    px[i] = n.x; py[i] = n.y; pz[i] = n.z
    tx[i] = d[0] * q; ty[i] = d[1] * q; tz[i] = d[2] * q
  }
  // 간선도 평평하게. 스프링을 나눌 연결도(제곱근)도 미리 재 둔다
  const E = edges.length
  const ea = new Int32Array(E), eb = new Int32Array(E), ek = new Float64Array(E)
  for (let e = 0; e < E; e++) {
    const [i, j] = edges[e]
    ea[e] = i; eb[e] = j
    // **연결도로 나눈다.** 안 나누면 간선이 많은 좌표일수록 세게 끌린다 --
    // 60개와 이어진 좌표는 2개와 이어진 좌표보다 30배를 받고, 그 힘이 반발을
    // 이겨 가운데로 말려 들어간다. 실측에서 좌표 301 · 이음 2554 일 때 원이
    // 겹친 노드가 55개였다(나누면 40개).
    //
    // 이어진 수가 많다는 것은 **더 넓게 자리를 잡아야 한다**는 뜻이지 더 세게
    // 당겨야 한다는 뜻이 아니다.
    ek[e] = Math.sqrt(Math.max(1, (deg[i] + deg[j]) / 2))
  }
  for (let s = 0; s < TICKS; s++) {
    const al = 1 - s / TICKS
    fx.fill(0); fy.fill(0); fz.fill(0)
    for (let i = 0; i < N; i++) {
      const xi = px[i], yi = py[i], zi = pz[i]
      for (let j = i + 1; j < N; j++) {
        let dx = xi - px[j], dy = yi - py[j], dz = zi - pz[j]
        let d2 = dx * dx + dy * dy + dz * dz
        if (d2 < 1) { dx = rand(); dy = rand(); dz = rand(); d2 = 1 }
        // 반발 12000 -- 3000 에서 올렸다. 상한 70 은 그대로다(가까운 쌍이 튕겨
        // 나가는 것을 막는 안전장치이지 세기가 아니다).
        //
        // **`dx / d * f` 를 `dx * (f / d)` 로 접지 않는다.** 값이 같아 보여도
        // 부동소수 반올림이 달라지고, 그러면 배치가 미세하게 바뀐다.
        const f = Math.min(70, 12000 / d2), d = Math.sqrt(d2)
        fx[i] += dx / d * f; fy[i] += dy / d * f; fz[i] += dz / d * f
        fx[j] -= dx / d * f; fy[j] -= dy / d * f; fz[j] -= dz / d * f
      }
    }
    for (let e = 0; e < E; e++) {
      const i = ea[e], j = eb[e]
      const dx = px[j] - px[i], dy = py[j] - py[i], dz = pz[j] - pz[i]
      // 스프링을 0.055 에서 0.03 으로 늦춘다. 세게 두면 L 을 늘려도 간선이
      // 다시 당겨 붙인다 -- 늘린 것은 쉬는 거리이지 당기는 힘이 아니다.
      const d = Math.max(1, Math.hypot(dx, dy, dz)), f = (d - L) * 0.03 / ek[e]
      fx[i] += dx / d * f; fy[i] += dy / d * f; fz[i] += dz / d * f
      fx[j] -= dx / d * f; fy[j] -= dy / d * f; fz[j] -= dz / d * f
    }
    const cap = 8 * al + 0.3
    for (let i = 0; i < N; i++) {
      const x = px[i], y = py[i], z = pz[i]
      // **반지름과 방향을 따로 건다.** 목표점 하나로 당기면 안 된다 --
      // 이어진 것끼리는 스프링이 서로를 붙잡으므로, 덩어리 전체가 목표점들의
      // 평균 자리로 통째로 떠내려가 **구의 한쪽에 뭉친다.** 실측에서 이어진
      // 83개가 원점이 아니라 바깥 반지름의 60% 지점에 공으로 뭉쳐 있었다.
      //
      //   반지름   자기 반지름 위로만 끌어당긴다. 접선 방향으로는 안 민다
      //   방향     타입 구역 쪽으로 약하게. 같은 타입이 이웃으로 남을 만큼만
      //
      // 반지름 힘은 덩어리가 어디로 돌든 **원점과의 거리만** 고친다. 그래서
      // 많이 이어진 것들은 스프링으로 뭉친 채 가운데로 내려앉고, 고립 좌표는
      // 바깥 껍질에 남는다.
      const m0 = Math.hypot(x, y, z) || 1
      const rp = (rad[i] - m0) * 0.03 / m0
      const ax = fx[i] + (x * rp + (tx[i] - x) * 0.006)
      const ay = fy[i] + (y * rp + (ty[i] - y) * 0.006)
      const az = fz[i] + (z * rp + (tz[i] - z) * 0.006)
      const m = Math.hypot(ax, ay, az), k = m > cap ? cap / m : 1
      px[i] = x + ax * k; py[i] = y + ay * k; pz[i] = z + az * k
    }
  }
  for (let i = 0; i < N; i++) { nodes[i].x = px[i]; nodes[i].y = py[i]; nodes[i].z = pz[i] }
}
