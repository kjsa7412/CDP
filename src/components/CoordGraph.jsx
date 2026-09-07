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

function rng(seed) {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

// 색은 예산 안에서만(뷰어 §16). **정상은 색이 없다** — 무채색이 대부분이어야
// 문제가 눈에 띈다.
function stateOf(sec) {
  if (!sec) return 'ok'
  if (sec === 'stale' || sec === 'orphan') return 'stale'
  if (sec === 'anchor-missing' || sec === 'doc-missing') return 'bad'
  if (sec === 'unwritten' || sec === 'empty') return 'none'
  return 'ok'
}
// **무채색이다.** 색으로 상태를 말하지 않고 **형태와 농도**로 말한다.
//
//   정상        옅게 채운 원
//   미작성      **빈 원** — 아직 안 채워졌다는 것이 형태로 읽힌다
//   밀림        진하게 채운 원 + 얇은 링
//   없음·끊김    진하게 채운 원 + 두 겹 링
//
// 색을 빼면 "무엇이 문제인가"를 색상환이 아니라 **농도와 테두리**로 읽게 된다.
// 화면 전체가 조용해지고, 눈은 진한 것과 빈 것에 먼저 간다.
//
// 배경은 테마를 따른다 — 밝은 테마면 흰 바탕, 어두운 테마면 검은 바탕.
// 발광은 어두운 바탕에서만 성립하는데 여기는 두 바탕을 다 써야 한다.

// 노드가 겹쳐도 읽히게 배경색으로 얇게 두른다.
// 발광이 아니라 **분리선**이다 — 헤일로처럼 번지지 않는다.
const HAIRLINE = 1.5

export default function CoordGraph({ tree, docs, onPick, picked }) {
  const cvRef = useRef(null)
  const paintRef = useRef(null)
  const spinRef = useRef(null)
  const stRef = useRef({ rx: -0.2, ry: 0.5, spin: true, hover: null, drag: null, pts: [], zoom: 1, px: 0, py: 0 })
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

      const Z = S.zoom
      const cx = r.width / 2, cy = r.height / 2, F = Math.min(r.width, r.height) * 1.2
      const sy = Math.sin(S.ry), cy2 = Math.cos(S.ry), sx = Math.sin(S.rx), cx2 = Math.cos(S.rx)
      // 공간 이동(pan)을 더한다. 줌만으로는 가장자리 노드를 못 본다 --
      // 화면 밖으로 나간 것을 보려고 매번 축소하면 다시 안 읽힌다.
      const proj = (x, y, z) => {
        const x1 = x * cy2 - z * sy, z1 = x * sy + z * cy2
        const y1 = y * cx2 - z1 * sx, z2 = y * sx + z1 * cx2
        const sc = F / (F + z2 + 250)
        return { X: cx + x1 * sc * Z + S.px, Y: cy + y1 * sc * Z + S.py, z: z2, sc }
      }

      S.pts = g.nodes.map((n, i) => ({ i, n, ...proj(n.x, n.y, n.z) })).sort((a, b) => b.z - a.z)
      const H = S.hover

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

      for (const p of S.pts) {
        const n = p.n
        const dim = H != null && p.i !== H && !g.nbr[H].has(p.i)
        const R = (2.3 + Math.sqrt(n.count) * 1.5) * p.sc * Z
        const depth = Math.max(0.55, Math.min(1, p.sc * 1.15))
        ctx.globalAlpha = dim ? 0.12 : depth

        // 겹침 분리 — 배경색 하이라이너. 번지지 않는다
        ctx.strokeStyle = bg
        ctx.lineWidth = HAIRLINE
        ctx.beginPath(); ctx.arc(p.X, p.Y, R + HAIRLINE / 2, 0, 7); ctx.stroke()

        if (n.state === 'none') {
          // 미작성 = 빈 원. 아직 안 채워졌다
          ctx.strokeStyle = ink2
          ctx.lineWidth = 1.3
          ctx.beginPath(); ctx.arc(p.X, p.Y, R, 0, 7); ctx.stroke()
        } else {
          ctx.fillStyle = n.state === 'ok' ? ink2 : ink
          ctx.beginPath(); ctx.arc(p.X, p.Y, R, 0, 7); ctx.fill()
          if (n.state !== 'ok') {
            // 밀림 한 겹 · 없음/끊김 두 겹
            ctx.strokeStyle = ink
            ctx.lineWidth = 1
            ctx.beginPath(); ctx.arc(p.X, p.Y, R + 2.5, 0, 7); ctx.stroke()
            if (n.state === 'bad') {
              ctx.beginPath(); ctx.arc(p.X, p.Y, R + 5, 0, 7); ctx.stroke()
            }
          }
        }

        if (n.coord === picked || p.i === H) {
          ctx.globalAlpha = 1
          ctx.strokeStyle = accent
          ctx.lineWidth = 1.5
          ctx.beginPath(); ctx.arc(p.X, p.Y, R + 4.5, 0, 7); ctx.stroke()
        }
      }

      // 라벨 — 조용하게. 찾는 것만
      for (const p of S.pts) {
        const n = p.n
        if (H != null && p.i !== H && !g.nbr[H].has(p.i)) continue
        if (!(n.state !== 'ok' || n.count >= 2 || p.i === H)) continue
        const R = (2.3 + Math.sqrt(n.count) * 1.5) * p.sc * Z
        ctx.globalAlpha = Math.min(1, p.sc * 1.15) * (p.i === H ? 1 : 0.92)
        ctx.fillStyle = p.i === H ? ink : ink2
        // Roboto Mono — `font.css` 에 파일째 심었다. 폐쇄망에서도 이 폰트가 뜬다
        ctx.font = `${Math.max(9, Math.round(10.5 * p.sc))}px 'Roboto Mono', ui-monospace, Consolas, monospace`
        ctx.fillText(n.v, p.X + R + 5, p.Y + 3.5)
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
      S.drag = { x: e.clientX, y: e.clientY, rx: S.rx, ry: S.ry, px: S.px, py: S.py, pan: panning, moved: 0 }
      cv.style.cursor = panning ? 'grabbing' : 'grab'
    }
    const up = () => { if (!S.drag) return; S.drag = null; cv.style.cursor = ''; spinOn(); now() }
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
      if (S.drag && S.drag.moved > 6) return
      if (S.hover != null) onPick(g.nodes[S.hover].coord)
    }
    // 줌 — 휠. 화면 좌표를 배율만 바꾸므로 원근이 흔들리지 않는다
    // 줌은 **커서를 기준으로** 한다. 화면 중앙 기준이면 가장자리를 확대할 때
    // 보려던 것이 밖으로 밀려나 계속 놓친다.
    const wheel = (e) => {
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
    paintRef.current = now
    spinRef.current = spinOn
    draw()
    return () => {
      paintRef.current = null
      spinRef.current = null
      cancelAnimationFrame(raf)
      themeObs.disconnect()
      mq.removeEventListener('change', paint)
      cv.removeEventListener('mousedown', down)
      cv.removeEventListener('mousemove', move)
      cv.removeEventListener('click', click)
      cv.removeEventListener('wheel', wheel)
      cv.removeEventListener('contextmenu', ctxmenu)
      window.removeEventListener('mouseup', up)
    }
  }, [g, picked])

  if (!g || !g.nodes.length) return <div className="gr__empty">좌표가 없습니다 — <code>_vocab.md</code> 를 확인하세요</div>

  const S = stRef.current
  // 버튼은 상태만 바꾸고 **다시 그리라고 알린다** — React 리렌더는 캔버스를
  // 건드리지 않는다. `paintRef` 가 그 다리다.
  const repaint = () => { paintRef.current?.(); force((x) => x + 1) }
  const zoomBy = (k) => { S.zoom = Math.min(6, Math.max(0.3, S.zoom * k)); repaint() }

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
          onClick={() => { S.zoom = 1; S.rx = -0.2; S.ry = 0.5; S.px = 0; S.py = 0; repaint() }}
        >
          맞춤
        </button>
        <button className="gr__btn" onClick={() => { S.spin = !S.spin; spinRef.current?.(); repaint() }} aria-pressed={S.spin}>
          회전
        </button>
      </div>
      <div className="gr__legend">
        <i><b className="gr__d gr__d--ok" />정상</i>
        <i><b className="gr__d gr__d--none" />미작성</i>
        <i><b className="gr__d gr__d--stale" />밀림</i>
        <i><b className="gr__d gr__d--bad" />섹션/문서 없음</i>
        <span className="gr__hint">크기 = 작업 건수 · 휠 확대 · 끌어서 회전 · <b>Shift+끌기 이동</b></span>
      </div>
      <div className="gr__wrap"><canvas ref={cvRef} className="gr__cv" /></div>
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
        count: c.count || 0, state: stateOf(c.sec), x: 0, y: 0, z: 0,
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
