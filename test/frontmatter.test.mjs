// 프론트매터와 층 — `core/frontmatter.js`. 프로토콜 §8.1 · 시스템설계서 §1.6.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { layerOf, parseDoc, outline, bodyWeight, normalizeSupersedes } from '../core/frontmatter.js'

test('layerOf — work 는 평면 · assets 는 문서가 아니다 · docs 는 하위 폴더도 관리 문서', () => {
  assert.equal(layerOf('work/2026-0901-x.md'), 'work')
  assert.equal(layerOf('work/sub/2026-0901-x.md'), null, '하위 폴더는 인정하지 않는다')
  assert.equal(layerOf('work/assets/x/a.md'), null)
  assert.equal(layerOf('docs/테이블정의서.md'), 'managed')
  assert.equal(layerOf('docs/2.개발/DE_431_테이블정의서.md'), 'managed')
  assert.equal(layerOf('knowledge/x.md'), 'work', 'v0.2 배치도 읽는다')
  assert.equal(layerOf('README.md'), null)
  assert.equal(layerOf('_vocab.md'), null)
})

test('parseDoc — 필드 정규화: 확정 소거 · date UTC 왕복 · 시각은 문자열 그대로 · touches 키 유무', () => {
  const d = parseDoc(
    'work/2026-0821-면접-개편.md',
    `---
id: 2026-0821-면접-개편
title: PSC043 개편
date: 2026-08-21
author: kjsa
status: 확정
touches:
  - screen:PSC043
  - code:PS130
supersedes: 2026-0326-오타
tags: [채용]
custom: 1
---

# 본문

## 왜

이유.
`
  )
  assert.equal(d.layer, 'work')
  assert.equal(d.isUnit, true)
  assert.equal(d.id, '2026-0821-면접-개편')
  assert.equal(d.fileId, d.id)
  assert.equal(d.date, '2026-08-21', 'js-yaml 의 Date 를 날짜 문자열로 되돌린다')
  assert.equal(d.status, null, '확정은 기본값 — 지운다')
  assert.deepEqual(d.touches, ['screen:PSC043', 'code:PS130'])
  assert.equal(d.hasTouchesKey, true)
  assert.deepEqual(d.supersedes, [{ id: '2026-0326-오타', scope: null }])
  assert.deepEqual(d.tags, ['채용'])
  assert.deepEqual(d.unknownFields, ['custom'])
  assert.deepEqual(
    d.headings.map((h) => h.title),
    ['왜']
  )
  assert.equal(d.errors.length, 0)

  const t = parseDoc('work/x.md', '---\nid: x\ntitle: t\ndate: 2026-08-21 14:30\nauthor: a\ntouches: []\nstatus: 진행중\n---\n본문\n')
  assert.equal(t.date, '2026-08-21 14:30', '시각이 붙은 값은 문자열 그대로')
  assert.equal(t.status, '진행중', '기본값이 아닌 값은 남긴다 — check 가 오류로 낸다')
  assert.deepEqual(t.touches, [])
  assert.equal(t.hasTouchesKey, true, 'touches: [] 는 선언이다')

  const u = parseDoc('work/y.md', '---\nid: y\ntitle: t\ndate: 2026-08-21\nauthor: a\n---\n본문\n')
  assert.equal(u.hasTouchesKey, false, '키가 없는 것은 그냥 안 적은 것')
  assert.equal(u.bodyThin, true)
})

test('parseDoc — 프론트매터가 없으면 단위가 아니다 · YAML 오류는 errors 에', () => {
  const plain = parseDoc('work/plain.md', '# 제목\n\n본문\n')
  assert.equal(plain.hasFrontmatter, false)
  assert.equal(plain.isUnit, false)
  assert.equal(plain.title, 'plain')

  const bad = parseDoc('work/bad.md', '---\nid: [unclosed\n---\n본문\n')
  assert.equal(bad.errors.length, 1)
  assert.match(bad.errors[0], /YAML/)

  const list = parseDoc('work/list.md', '---\n- a\n- b\n---\n본문\n')
  assert.match(list.errors[0], /객체가 아님/)
})

test('parseDoc — 관리 문서는 섹션을 분해한다', () => {
  const m = parseDoc('docs/테이블정의서.md', '# T\n\n## a — 하나\n<!-- applied: null -->\n\n## b\n')
  assert.equal(m.layer, 'managed')
  assert.equal(m.managedSections.length, 3)
  assert.equal(m.sectionCount, 2)
  assert.equal(m.bodyThin, false, '관리 문서는 얇음을 재지 않는다')
})

test('outline · bodyWeight — 펜스 안 제목은 무시 · 길이로 어림', () => {
  const body = '## 하나\n\n```\n## 펜스\n```\n\n### 둘\n'
  assert.deepEqual(
    outline(body).map((h) => [h.level, h.title]),
    [
      [2, '하나'],
      [3, '둘'],
    ]
  )
  assert.equal(bodyWeight('## 제목\n<!-- x -->\n').chars, 0)
  assert.equal(bodyWeight('x'.repeat(139)).thin, true)
  assert.equal(bodyWeight('x'.repeat(140)).thin, false)
})

test('normalizeSupersedes — 문자열 · 객체 · 배열 · scope', () => {
  assert.deepEqual(normalizeSupersedes('a'), [{ id: 'a', scope: null }])
  assert.deepEqual(normalizeSupersedes({ id: 'a', scope: 'table:x' }), [{ id: 'a', scope: ['table:x'] }])
  assert.deepEqual(normalizeSupersedes(['a', { id: 'b' }]), [
    { id: 'a', scope: null },
    { id: 'b', scope: null },
  ])
  assert.deepEqual(normalizeSupersedes(null), [])
})
