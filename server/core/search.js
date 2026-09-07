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
