// _vocab.md 파싱 — 프로토콜 §9.4 의 통제 어휘(authority file).
//
// 형식:
//   ## table
//   - `table:tb_biz_plan` — 사업계획 마스터
//     aliases: 사업계획테이블, 계획서테이블, TB_BIZ_PLAN
//   - `table:tb_plan_history` — 계획서 변경 이력 (구)
//     deprecated: 2026-06-01 → table:tb_biz_plan_hist 로 통합
//
// deprecated 의 후속 좌표는 산문이라 안정적으로 뽑을 수 없다. 설계서 §34-4 에서
// 형식 고정을 요청했고, 그 전까지는 "화살표 뒤 첫 번째 타입:값 토큰"으로 읽는다.
// 실패하면 산문을 그대로 보여준다 (§13-③ — 못 읽었다는 사실을 숨기지 않는다).

// **타입에 한글을 허용한다.** 전에는 ASCII 만 받았는데, 그러면 좌표 타입이
// `table` `screen` `req` 같은 영문 약어로 굳는다. 그 낱말들은 너무 보편적이라
// 무엇을 가리키는지 이름만으로는 알 수 없고 -- 어느 시스템에나 테이블은 있다 --
// 정본 문서와의 연결이 `_managed.md` 를 열어 봐야만 드러난다.
//
// 타입을 **정본 문서 이름에서 따면** 좌표 자체가 어디로 가는지 말한다:
// `테이블정의서:ex_plan_mst`. 값은 여전히 무엇이든 된다.
const COORD = /^[A-Za-z가-힣][A-Za-z0-9가-힣_-]*:\S+$/
// 좌표의 앞자리만. `## <타입>` 머리글이 타입인지 가르는 데 쓴다.
const TYPE = /^[A-Za-z가-힣][A-Za-z0-9가-힣_-]*$/

// 좌표의 모양 — `타입:값`. 값에 공백 · 제어문자가 없다. save 의 `checkCoord` 와 어휘 검사(`check` 의 vocab-coord-format)가
// 이 하나를 쓴다 — 둘이 갈라지면 어휘에는 있는데 save 가 거절하는 좌표가 생긴다(ezipez_cdp 리빌딩 — `term:이벤트 도메인`)
export const RE_COORD = /^(?:[a-z][a-z0-9_-]*|[가-힣][A-Za-z0-9가-힣_-]*):[^\s\x00-\x1f]{1,200}$/
export const isCoordShape = (c) => RE_COORD.test(String(c ?? '')) && !String(c).includes('..')

export function parseVocab(text) {
  if (!text)
    return { types: [], excludedTypes: [], coords: new Map(), counted: new Map(), aliasIndex: new Map(), errors: [] }

  const lines = text.split('\n')
  const types = []
  const excludedTypes = []
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

    // **`##` 이 전부 타입은 아니다.** 전에는 아무 `##` 이나 타입으로 등록했고,
    // 그래서 이 파일에 산문 절을 하나 쓰면 `"무슨 일을 하면 무엇을 적나"` 가
    // 타입 목록에 끼어 화면에 빈 카테고리로 떴다. 타입은 좌표의 앞자리이므로
    // **공백을 가질 수 없다**(COORD 와 같은 문자 집합). 그것으로 가른다.
    //
    // 타입이 아닌 `##` 은 그냥 지나간다 — `curType` 을 비우지 않는다. 비우면
    // 타입 절 사이에 설명을 끼워 넣을 수 없다.
    const h2 = raw.match(/^##\s+(.+?)\s*$/)
    if (h2) {
      const head = h2[1].trim()
      if (TYPE.test(head)) {
        flush()
        curType = head
        if (!types.includes(curType)) types.push(curType)
      }
      continue
    }

    // `## <타입>` 바로 아래의 `excluded:` — **이 타입은 정착도에서 뺀다.**
    //
    // 전에는 앱 설정에 `excludeTypes: ['domain']` 이 박혀 있었다. 그런데
    // **타입 이름은 레포가 정한다** — 이 패키지가 `domain` 을 `업무영역` 으로
    // 바꾸자 그 설정은 아무것도 가리키지 않게 됐고, 제외는 조용히 사라졌다.
    // 죽은 설정은 없는 설정보다 나쁘다. 선언을 어휘 옆으로 옮긴다.
    if (curType && !cur && /^excluded\s*:/i.test(raw)) {
      if (!excludedTypes.includes(curType)) excludedTypes.push(curType)
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
        example: false,
        line: i + 1,
      }
      continue
    }

    if (!cur) continue

    // **서식 예시는 좌표가 아니다.**
    //
    // 패키지는 문서마다 `## ex_plan_mst` 같은 예시 섹션을 달고 나가고, 그
    // 좌표를 어휘에도 올려 둔다 -- 부은 직후에 파생 고리를 한 바퀴 돌려 볼 수
    // 있게 하려는 것이다. 그런데 그러면 예시가 **좌표 수에 끼고 INDEX 에 실린다.**
    //
    // 더 나쁜 것은 지울 때다. 문서에서 예시 섹션만 지우고 어휘 줄을 남기면
    // `ctx check` 는 통과하는데(dangling 검사는 작업 기록의 touches 만 본다)
    // `ctx where` 가 "섹션이 없음 -- 주입해도 빈손이다" 를 낸다. 조용한 실패다.
    //
    // `example:` 은 그 줄을 **세지 않게** 한다. 찾기는 그대로 되고,
    // `ctx check` 가 남아 있다고 알려 준다.
    const ex = raw.match(/^\s+example\s*:/i)
    if (ex) {
      cur.example = true
      continue
    }

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
  // **살아 있는 좌표가 먼저 자리를 잡는다**(어휘 큐레이터 검토 R10) — 폐기 좌표와 후속이 같은 열쇠(alias · label)를
  // 가지면 답은 후속이어야 한다. 폐기 좌표는 그 뒤에 남은 열쇠만 갖는다 — 제 이름 · 값으로는 여전히 찾아진다
  const retired = (c) => !!(c.deprecated || c.supersededBy || c.deprecatedNote)
  for (const c of [...coords.values()].sort((a, b) => retired(a) - retired(b))) {
    put(c.coord, c.coord, 'canonical', c.coord)
    // 좌표의 값 부분만으로도 걸리게 한다 (tb_biz_plan)
    const v = c.coord.slice(c.coord.indexOf(':') + 1)
    put(v, c.coord, 'value', v)
    for (const a of c.aliases) put(a, c.coord, 'alias', a)
    if (c.label) put(c.label, c.coord, 'label', c.label)
  }

  // **세는 것과 찾는 것을 나눈다.**
  //   coords   전부 — `ctx where` · `ctx match` · 검색이 쓴다. 예시도 찾아진다
  //   counted  예시를 뺀 것 — 좌표 수 · 목록 · INDEX 가 쓴다
  //
  // 서식 예시를 세면 갓 부은 레포가 "좌표 22개" 라고 말한다. 하나도 정하지
  // 않았는데 22개다. 그러면 그 숫자를 아무도 안 믿게 된다.
  const counted = new Map([...coords].filter(([, e]) => !e.example))

  return { types, excludedTypes, coords, counted, aliasIndex, errors }
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

  // 질의 안에 alias 가 섞여 있는 경우 — "사업계획 테이블 관련 최근 변경"
  const nq = normKey(q)
  let best = null
  for (const [k, v] of vocab.aliasIndex) {
    if (k.length < 3) continue
    if (nq.includes(k) && (!best || k.length > best.key.length)) best = { key: k, ...v }
  }
  return best ? { coord: best.coord, kind: best.kind, aliasText: best.aliasText, matched: best.aliasText, exact: false } : null
}

// 폐기 사슬 — 후속을 따라간다(A → B → C 면 [B, C]). 고리 · 없는 좌표에서 멈춘다. `match` · `where` 가 `successorLatest` 를 낸다
export function successorChain(vocab, coord) {
  const out = []
  for (let x = vocab.coords.get(coord)?.supersededBy; x && x !== coord && !out.includes(x); x = vocab.coords.get(x)?.supersededBy) {
    out.push(x)
    if (!vocab.coords.has(x)) break
  }
  return out
}
