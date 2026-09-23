// 전문 색인 — `core/search.js`. MiniSearch 를 걷어 내고 같은 규칙을 옮겼다.
//
// 점수가 옛것과 같아야 화면의 순서가 안 바뀐다. 옮길 때 실측 레포 넷 · 질의
// 스물넷에서 경로와 점수를 대 보았고(동점끼리의 순서만 달랐다), 여기에는 그
// 규칙 중 **깨지면 사람이 알아차리는 것**만 남긴다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { buildIndex, fullText, tokenize } from '../core/search.js'

const doc = (path, title, body, extra = {}) => ({ path, id: path.replace(/\.md$/, ''), title, touches: [], tags: [], author: '', body, ...extra })
const index = (docs) => buildIndex(docs, new Map(docs.map((d) => [d.path, d.body])))

const DOCS = [
  doc('a.md', '사전검토 스키마', '검토대상자별 의견서를 목록 테이블로 나눈다. 의견서작성일은 목록 쪽에 둔다.'),
  doc('b.md', '연구계획서 변경', '계획서변경마스터에 변경 사유를 남긴다.', { touches: ['table:rp_plnd_chg_mst'] }),
  doc('c.md', '결재선', 'RP_ELC_APV_MST 에 결재 순서를 둔다.'),
]

test('한글은 바이그램으로 걸린다 — 조사가 붙어도, 붙여 써도', () => {
  const ix = index(DOCS)
  assert.deepEqual(fullText(ix, '의견서').map((r) => r.path), ['a.md'])
  // 문서에는 `계획서변경마스터에` 로 붙어 있다 — 질의 덩어리가 그 앞머리면 걸린다
  assert.ok(fullText(ix, '계획서변경').some((r) => r.path === 'b.md'))
  // 덩어리 **가운데**는 안 걸린다. 질의 덩어리 자체도 낱말이라서다(옛 규칙 그대로)
  assert.deepEqual(fullText(ix, '변경마스터'), [])
  assert.deepEqual(tokenize('연구계획'), ['연구계획', '연구', '구계', '계획'])
})

test('낱말은 전부 걸려야 한다(AND) — 하나라도 없으면 빈 답', () => {
  const ix = index(DOCS)
  assert.deepEqual(fullText(ix, '결재 순서').map((r) => r.path), ['c.md'])
  assert.deepEqual(fullText(ix, '결재 의견서'), [])
})

test('접두로 걸린다 · 대소문자를 가리지 않는다', () => {
  const ix = index(DOCS)
  assert.deepEqual(fullText(ix, 'rp_elc').map((r) => r.path), ['c.md'])
  assert.deepEqual(fullText(ix, 'RP_ELC_APV').map((r) => r.path), ['c.md'])
})

test('제목에 걸린 것이 본문에만 걸린 것보다 앞선다', () => {
  const ix = index([doc('x.md', '마스터 정리', '다른 이야기'), doc('y.md', '다른 제목', '마스터 이야기가 본문에 있다')])
  assert.deepEqual(fullText(ix, '마스터').map((r) => r.path), ['x.md', 'y.md'])
})

test('결과는 path · id · score 를 싣는다 — 부르는 쪽 셋이 이것만 읽는다', () => {
  const [r] = fullText(index(DOCS), '결재')
  assert.equal(r.path, 'c.md')
  assert.equal(r.id, 'c')
  assert.ok(r.score > 0)
})

test('빈 질의 · 기호만 · 없는 말 → 빈 답 (예외 없이)', () => {
  const ix = index(DOCS)
  for (const q of ['', '   ', '!!!', '없는말임']) assert.deepEqual(fullText(ix, q), [], JSON.stringify(q))
  assert.deepEqual(fullText(index([]), '결재'), [])
})

test('limit 만큼만 낸다', () => {
  const many = Array.from({ length: 30 }, (_, i) => doc(`w${i}.md`, `작업 ${i}`, '공통 낱말'))
  assert.equal(fullText(index(many), '공통', 7).length, 7)
})
