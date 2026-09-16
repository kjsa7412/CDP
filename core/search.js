// 검색 — 프로토콜 §9.5(2) 읽기 시점 대조가 1차 경로, 전문 검색은 폴백.
//
// 설계서 §20.4 — MiniSearch 기본 토크나이저는 공백 분리라 한글 조사를 못 잡는다.
// 한글 구간만 2-gram 으로 쪼갠다. 라틴·숫자는 기존 단어 토크나이저를 쓴다.
//   "연구계획테이블" → 연구·구계·계획·획테·테이·이블
//   질의 "연구계획"   → 연구·구계·계획              → 매칭
//   질의 "연구계획을" → …·이블·블을 (조사 무해)
//
// 형태소 분석은 넣지 않는다. 사전 수십 MB 가 붙고, 1차 경로가 alias 대조이므로
// 폴백에 그만한 비용을 쓰지 않는다.

import MiniSearch from 'minisearch'
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

export function buildIndex(docs, bodies) {
  const mini = new MiniSearch({
    fields: ['title', 'body', 'touches', 'tags', 'author', 'id'],
    storeFields: ['id', 'path'],
    idField: 'path',
    tokenize,
    processTerm: (t) => (t.length ? t : null),
    searchOptions: { prefix: true, fuzzy: false, combineWith: 'AND' },
  })

  mini.addAll(
    docs.map((d) => ({
      path: d.path,
      id: d.id,
      title: d.title,
      body: (bodies.get(d.path) || '').slice(0, 200_000),
      touches: d.touches.join(' '),
      tags: d.tags.join(' '),
      author: d.author || '',
    }))
  )
  return mini
}

export function fullText(mini, query, limit = 50) {
  if (!query || !query.trim()) return []
  try {
    return mini.search(query, { boost: { title: 3, touches: 2, id: 2 } }).slice(0, limit)
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
// 지우고 소문자로(`vocab.normKey`). 그래서 `RP_PLND_MST` 도 `rp plnd mst` 도
// `연구 계획서` 도 같은 것을 가리킨다. **띄어쓰기를 질의하는 사람이 맞출 필요가
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
