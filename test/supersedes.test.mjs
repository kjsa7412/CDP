// 정정 관계(`supersedes`)가 화면으로 나가는 길 — 문서 상세의 양방향 목록과
// 뻗어나가기의 두 갈래. fixture 의 정정 쌍(2026-0903 이 2026-0902 오기재를 정정)으로 본다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { Store } from '../core/store.js'
import { summaryText } from '../viewer/src/lib/format.js'

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'viewer', 'fixture')
const OLD = '2026-0902-업무이력-오기재'
const NEW = '2026-0903-업무이력-상태분리'

const store = new Store({ root, settings: { watch: false } })
await store.load()

test('상세 — 새 기록은 supersedes, 옛 기록은 correctedBy 로 서로를 제목과 함께 싣는다', () => {
  const n = store.detail(NEW)
  assert.deepEqual(n.supersedes.map((s) => [s.id, s.exists]), [[OLD, true]])
  assert.deepEqual(n.correctedBy, [])
  const o = store.detail(OLD)
  assert.deepEqual(o.correctedBy.map((c) => c.id), [NEW])
  assert.ok(o.correctedBy[0].title)
})

test('뻗어나가기 — 작업문서에서 정정 관계가 방향 이름을 단 갈래로 맨 앞에 선다', () => {
  const o = store.nextNodes('work', OLD)
  assert.equal(o.groups[0].label, '이 기록을 정정한')
  assert.deepEqual(o.groups[0].items.map((x) => x.key), [NEW])
  const n = store.nextNodes('work', NEW)
  assert.equal(n.groups[0].label, '이 기록이 정정한')
  assert.deepEqual(n.groups[0].items.map((x) => x.key), [OLD])
  // 정정 관계가 없는 기록에는 그 갈래가 없다
  const plain = store.nextNodes('work', '2026-0326-테이블명-오타')
  assert.ok(!plain.groups.some((g) => g.label.includes('정정')))
})

test('요약 복사 — 정정당한 기록을 「정정한 문서 없음」 으로 쓰지 않는다', () => {
  const o = summaryText(store.detail(OLD))
  assert.ok(o.includes(`[유효] 정정됨 — ${NEW}`))
  assert.doesNotMatch(o, /정정한 문서 없음/)
  const n = summaryText(store.detail(NEW))
  assert.match(n, /정정한 문서 없음/)
  assert.ok(n.includes(`[정정] 이 기록이 ${OLD} 를 정정했습니다`))
})
