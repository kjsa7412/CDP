// _vocab.md 파싱 — 프로토콜 §9.4 의 통제 어휘(authority file).
//
// 형식:
//   ## table
//   - `table:tb_research_plan` — 연구계획 마스터
//     aliases: 연구계획테이블, 계획서테이블, TB_RESEARCH_PLAN
//   - `table:tb_plan_history` — 계획서 변경 이력 (구)
//     deprecated: 2026-06-01 → table:tb_research_plan_hist 로 통합
//
// deprecated 의 후속 좌표는 산문이라 안정적으로 뽑을 수 없다. 설계서 §34-4 에서
// 형식 고정을 요청했고, 그 전까지는 "화살표 뒤 첫 번째 타입:값 토큰"으로 읽는다.
// 실패하면 산문을 그대로 보여준다 (§13-③ — 못 읽었다는 사실을 숨기지 않는다).

const COORD = /^[A-Za-z][A-Za-z0-9_-]*:\S+$/

export function parseVocab(text) {
  if (!text) return { types: [], coords: new Map(), aliasIndex: new Map(), errors: [] }

  const lines = text.split('\n')
  const types = []
  const coords = new Map() // 정본 좌표 → 항목
  const errors = []
  let curType = null
  let cur = null

  const flush = () => {
    if (cur) coords.set(cur.coord, cur)
    cur = null
  }

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i]

    const h2 = raw.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      flush()
      curType = h2[1].trim()
      if (!types.includes(curType)) types.push(curType)
      continue
    }

    // - `table:tb_x` — 설명
    const item = raw.match(/^\s*[-*]\s+`([^`]+)`\s*(?:[—–-]\s*(.*))?$/)
    if (item) {
      flush()
      const coord = item[1].trim()
      if (!COORD.test(coord)) errors.push({ line: i + 1, message: `좌표 형식이 타입:값 이 아님: ${coord}` })
      cur = {
        coord,
        type: coord.includes(':') ? coord.slice(0, coord.indexOf(':')) : curType,
        label: (item[2] || '').trim(),
        aliases: [],
        deprecated: null,
        supersededBy: null,
        deprecatedNote: null,
        line: i + 1,
      }
      continue
    }

    if (!cur) continue

    const al = raw.match(/^\s+aliases\s*:\s*(.+)$/i)
    if (al) {
      cur.aliases = al[1]
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
      continue
    }

    const dep = raw.match(/^\s+deprecated\s*:\s*(.+)$/i)
    if (dep) {
      const rest = dep[1].trim()
      cur.deprecated = (rest.match(/^(\d{4}-\d{2}-\d{2})/) || [null, null])[1]
      const arrow = rest.split(/[→>]+/)
      if (arrow.length > 1) {
        const tok = arrow.slice(1).join(' ').trim().split(/\s+/).find((t) => COORD.test(t))
        cur.supersededBy = tok || null
        cur.deprecatedNote = tok ? null : arrow.slice(1).join(' ').trim()
      } else {
        cur.deprecatedNote = rest
      }
      continue
    }

    // superseded-by: table:x  (§34-4 가 채택되면 이 경로로 온다)
    const sb = raw.match(/^\s+superseded[-_]by\s*:\s*(.+)$/i)
    if (sb) {
      const tok = sb[1].trim()
      cur.supersededBy = COORD.test(tok) ? tok : null
      continue
    }
  }
  flush()

  // alias → 정본. 정규화 키는 공백·하이픈·언더스코어를 지우고 소문자로.
  // 프로토콜 §9.5(2) 읽기 시점 대조가 이 표 하나로 돌아간다.
  const aliasIndex = new Map()
  const put = (key, coord, kind, aliasText) => {
    const k = normKey(key)
    if (!k) return
    if (!aliasIndex.has(k)) aliasIndex.set(k, { coord, kind, aliasText })
  }
  for (const c of coords.values()) {
    put(c.coord, c.coord, 'canonical', c.coord)
    // 좌표의 값 부분만으로도 걸리게 한다 (tb_research_plan)
    const v = c.coord.slice(c.coord.indexOf(':') + 1)
    put(v, c.coord, 'value', v)
    for (const a of c.aliases) put(a, c.coord, 'alias', a)
    if (c.label) put(c.label, c.coord, 'label', c.label)
  }

  return { types, coords, aliasIndex, errors }
}

export function normKey(s) {
  return String(s || '')
    .toLowerCase()
    .replace(/[\s_\-·]/g, '')
    .trim()
}

// 자유로운 표현 → 정본 좌표. 프로토콜 §9.5 의 대조 연산.
// 결과를 화면에 그대로 노출한다 (설계서 §13-⑤ · §20.1).
export function reconcile(vocab, query) {
  const q = String(query || '').trim()
  if (!q) return null

  const direct = vocab.aliasIndex.get(normKey(q))
  if (direct) return { ...direct, matched: q, exact: true }

  // 질의 안에 alias 가 섞여 있는 경우 — "연구계획 테이블 관련 최근 변경"
  const nq = normKey(q)
  let best = null
  for (const [k, v] of vocab.aliasIndex) {
    if (k.length < 3) continue
    if (nq.includes(k) && (!best || k.length > best.key.length)) best = { key: k, ...v }
  }
  return best ? { coord: best.coord, kind: best.kind, aliasText: best.aliasText, matched: best.aliasText, exact: false } : null
}
