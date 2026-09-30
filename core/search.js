// 검색 — 프로토콜 §9.5(2) 읽기 시점 대조가 1차 경로, 전문 검색은 폴백.
//
// 설계서 §20.4 — 공백 분리 토크나이저는 한글 조사를 못 잡는다.
// 한글 구간만 2-gram 으로 쪼갠다. 라틴·숫자는 기존 단어 토크나이저를 쓴다.
//   "사업계획테이블" → 사업·업계·계획·획테·테이·이블
//   질의 "사업계획"   → 사업·업계·계획              → 매칭
//   질의 "사업계획을" → …·이블·블을 (조사 무해)
//
// 형태소 분석은 넣지 않는다. 사전 수십 MB 가 붙고, 1차 경로가 alias 대조이므로
// 폴백에 그만한 비용을 쓰지 않는다.

import { normKey } from './vocab.js'

const HANGUL = /[\uAC00-\uD7A3\u3130-\u318F]/

export function tokenize(text) {
  const out = []
  const raw = String(text || '')
  // 라틴/숫자/기호 경계로 1차 분할
  for (const chunk of raw.split(/[^\w\uAC00-\uD7A3\u3130-\u318F:/._-]+/)) {
    if (!chunk) continue
    if (!HANGUL.test(chunk)) {
      out.push(chunk.toLowerCase())
      continue
    }
    // 한글이 섞인 덩어리: 덩어리 자체 + 한글 구간 바이그램
    out.push(chunk.toLowerCase())
    for (const han of chunk.match(/[\uAC00-\uD7A3\u3130-\u318F]+/g) || []) {
      if (han.length === 1) {
        out.push(han)
        continue
      }
      for (let i = 0; i < han.length - 1; i++) out.push(han.slice(i, i + 2))
    }
  }
  return out
}

// ── 전문 색인 ─────────────────────────────────────────────────────────────
//
// **MiniSearch 를 쓰지 않는다.** 점수 규칙은 그대로 옮겼고(BM25+ · 접두 가중 ·
// AND · 필드 가중) 자료 구조만 바꿨다.
//
// MiniSearch 의 색인은 기수 트리이고, 낱말 하나를 넣을 때마다 **노드의 자식을
// 처음부터 훑는다.** 영문은 뿌리 자식이 스물여섯 개 남짓이라 문제가 없지만 한글
// 바이그램은 첫 글자가 음절이다 — 관리 문서 패키지 하나(13만 자)에서 뿌리 자식이
// 718개였고, 등장 6만 번마다 그것을 훑었다. 실측 100~700ms. 그 시간 동안 서버의
// 이벤트 루프가 멈추고, 파일이 하나 바뀔 때마다(감시 → 재스캔) 다시 지었다.
// `ctx search` 와 MCP `search` 는 **부를 때마다** 지었다.
//
// 여기서는 낱말 → 문서 표를 `Map` 하나로 둔다. 넣기는 O(1) 이고, 접두 검색은
// 처음 찾을 때 한 번 정렬해 둔 낱말 목록을 이분 탐색한다.
const FIELDS = ['title', 'body', 'touches', 'tags', 'author', 'id']
const BODY_CAP = 200_000
// MiniSearch 기본값 — 점수가 옛 결과와 같아야 화면의 순서가 안 바뀐다
const BM25 = { k: 1.2, b: 0.7, d: 0.5 }
const PREFIX_WEIGHT = 0.375

function bm25(tf, matching, total, len, avg) {
  const idf = Math.log(1 + (total - matching + 0.5) / (matching + 0.5))
  return idf * (BM25.d + (tf * (BM25.k + 1)) / (tf + BM25.k * (1 - BM25.b + (BM25.b * len) / avg)))
}

export function buildIndex(docs, bodies) {
  const terms = new Map() // 낱말 → [필드별 Map(문서 번호 → 등장 수)]
  const lens = [] // 문서 번호 → 필드별 고유 낱말 수
  const avg = FIELDS.map(() => 0)
  const rows = []

  docs.forEach((d, i) => {
    rows.push({ id: d.id, path: d.path })
    const values = [d.title, (bodies.get(d.path) || '').slice(0, BODY_CAP), d.touches.join(' '), d.tags.join(' '), d.author || '', d.id]
    const len = []
    FIELDS.forEach((_, f) => {
      const v = values[f]
      if (v == null) return
      const toks = tokenize(String(v))
      len[f] = new Set(toks).size
      // 평균은 MiniSearch 와 같은 식으로 굴린다(필드가 빈 문서도 센다)
      avg[f] = (avg[f] * i + len[f]) / (i + 1)
      for (const t of toks) {
        if (!t) continue
        let e = terms.get(t)
        if (!e) terms.set(t, (e = []))
        const m = e[f] || (e[f] = new Map())
        m.set(i, (m.get(i) || 0) + 1)
      }
    })
    lens.push(len)
  })

  let sorted = null // 접두 검색용 — 처음 찾을 때 만든다
  const prefixed = (q) => {
    if (!sorted) sorted = [...terms.keys()].sort()
    let lo = 0
    let hi = sorted.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if (sorted[mid] < q) lo = mid + 1
      else hi = mid
    }
    const out = []
    for (let i = lo; i < sorted.length && sorted[i].startsWith(q); i++) out.push(sorted[i])
    return out
  }

  // 질의 낱말 하나 → 문서 번호 → 점수. 같은 낱말이 접두로도 걸리면 합친다
  const one = (q, boost) => {
    const acc = new Map()
    const add = (term, weight) => {
      const e = terms.get(term)
      if (!e) return
      FIELDS.forEach((field, f) => {
        const m = e[f]
        if (!m) return
        for (const [doc, tf] of m) {
          const s = weight * (boost[field] || 1) * bm25(tf, m.size, docs.length, lens[doc][f], avg[f])
          acc.set(doc, (acc.get(doc) || 0) + s)
        }
      })
    }
    add(q, 1)
    for (const t of prefixed(q)) {
      const dist = t.length - q.length
      if (dist) add(t, (PREFIX_WEIGHT * t.length) / (t.length + 0.3 * dist))
    }
    return acc
  }

  return {
    size: docs.length,
    // 질의의 낱말은 **전부** 걸려야 한다(AND). 반복된 낱말도 그대로 센다 —
    // 옛 점수와 같게 하려고 MiniSearch 가 하던 대로 둔다
    search(query, { boost = {} } = {}) {
      const qs = tokenize(query).filter(Boolean)
      if (!qs.length) return []
      let hit = null
      for (const q of qs) {
        const r = one(q, boost)
        if (!hit) hit = r
        else {
          const next = new Map()
          for (const [doc, s] of r) if (hit.has(doc)) next.set(doc, hit.get(doc) + s)
          hit = next
        }
        if (!hit.size) return []
      }
      const quality = new Set(qs).size
      return [...hit]
        .map(([doc, s]) => ({ ...rows[doc], score: s * quality }))
        .sort((a, b) => b.score - a.score)
    },
  }
}

export function fullText(index, query, limit = 50) {
  if (!query || !query.trim()) return []
  try {
    return index.search(query, { boost: { title: 3, touches: 2, id: 2 } }).slice(0, limit)
  } catch {
    return []
  }
}

// ── 이름 대조 — 검색이 거는 네 자리 ────────────────────────────────────
//
// 검색어가 걸릴 자리는 넷이다 — **관리문서명 · 작업문서명 · 좌표명 · alias.**
// 넷 다 **이름**이라 색인이 필요 없다. 문서 수천 개가 아니라 이름 수천 개이고,
// 그것은 매 타이핑마다 훑어도 예산(30ms) 안이다.
//
// 정규화 키 하나로 네 자리를 같은 규칙으로 본다 — 공백·하이픈·언더스코어를
// 지우고 소문자로(`vocab.normKey`). 그래서 `PJ_PLAN_MST` 도 `pj plan mst` 도
// `사업 계획서` 도 같은 것을 가리킨다. **띄어쓰기를 질의하는 사람이 맞출 필요가
// 없다** — 한글 이름에서 그것을 맞추라고 하면 그건 검색이 아니다.
//
// 전문 검색(MiniSearch·바이그램)은 그대로 폴백이다. 이름에서 아무것도 못 찾았을
// 때만 돈다.

// 질의를 한 번만 정규화해 둔다 — 이름 수천 개에 대해 다시 만들지 않는다.
export function prepQuery(q) {
  const raw = String(q || '').trim()
  const nq = normKey(raw)
  // 낱말 AND — "계획 변경" 은 `계획변경` 으로는 안 걸리지만 낱말 둘로는 걸린다
  const words = [...new Set(raw.split(/\s+/).map(normKey).filter((w) => w.length >= 2))]
  return { raw, nq, words: words.length > 1 ? words : [] }
}

// 이름 하나 대 질의 하나. 점수는 **어디서 걸렸나가 아니라 얼마나 맞았나**다.
//   같음 100 · 앞에서 80 · 안에서 60 · 낱말 전부 40
export function matchName(name, pq) {
  if (!name || !pq?.nq) return null
  const k = normKey(name)
  if (!k) return null
  if (k === pq.nq) return { how: 'exact', score: 100 }
  if (k.startsWith(pq.nq)) return { how: 'prefix', score: 80 }
  if (k.includes(pq.nq)) return { how: 'contains', score: 60 }
  if (pq.words.length && pq.words.every((w) => k.includes(w))) return { how: 'words', score: 40 }
  return null
}

// 여러 이름 중 가장 잘 맞은 것 하나. `[텍스트, 어디]` 쌍을 받는다 —
// 어디서 걸렸는지(정본·alias·설명)를 화면이 그대로 말해야 하기 때문이다(§13-⑤).
export function bestName(pairs, pq) {
  let best = null
  for (const [text, via] of pairs) {
    if (!text) continue
    const m = matchName(text, pq)
    if (m && (!best || m.score > best.score)) best = { ...m, via, text }
  }
  return best
}
