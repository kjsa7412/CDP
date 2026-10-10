// core/nextsteps — 다음 할 일(제품화 2 ②). 역할 × 상태 표.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { nextSteps, helpLinks, slugify, stepsText } from '../core/nextsteps.js'

const ids = (s) => s.map((x) => x.id)
const repo = (o = {}) => ({ name: 'lib', docs: 3, queue: { n: 0, oldestDays: null }, drift: 0, ...o })

test('빈 서버 — admin 에게만 「레포가 없다」 · writer 에게는 아무것도', () => {
  assert.deepEqual(ids(nextSteps({ me: { admin: true, write: true }, repos: 0 })), ['repo-none'])
  assert.deepEqual(ids(nextSteps({ me: { write: true }, repos: 0 })), [])
})

test('빈 레포 — 큐레이터: 관리 문서 · 큐레이터 폴더 · 작업 레포 / writer: 작업 레포만 / viewer: 없음', () => {
  const base = { repos: 1, repo: repo({ docs: 0 }), work: { mine: 0, stale: 0, unset: 0 }, curatorKit: { installed: false, stale: false } }
  assert.deepEqual(ids(nextSteps({ ...base, me: { write: true, curate: true } })), ['docs-none', 'work-none', 'curator-folder'])
  assert.deepEqual(ids(nextSteps({ ...base, me: { write: true, curate: false }, curatorKit: null })), ['work-none'])
  assert.deepEqual(ids(nextSteps({ ...base, me: {}, curatorKit: null })), [])
})

test('다 끝난 레포 — 빈 배열(카드를 그리지 않는다)', () => {
  const s = nextSteps({ me: { write: true, curate: true, tokenDays: 90 }, repos: 2, repo: repo(), work: { mine: 2, stale: 0, unset: 0 }, curatorKit: { installed: true, stale: false } })
  assert.deepEqual(s, [])
})

test('낡음 · 대기 · 어긋남 · 토큰 — 순서와 문장', () => {
  const s = nextSteps({
    me: { write: true, curate: true, tokenDays: 3 },
    repos: 1,
    repo: repo({ queue: { n: 4, oldestDays: 20 }, drift: 7 }),
    work: { mine: 2, stale: 1, unset: 0 },
    curatorKit: { installed: true, stale: true },
  })
  assert.deepEqual(ids(s), ['kit-stale', 'queue', 'drift', 'token'])
  assert.match(s[0].fact, /2곳/)
  assert.equal(s[0].cmd.args, '--update')
  assert.equal(s[1].level, 'warn')
  assert.equal(s[1].go.to, '/r/lib/manage/curation')
  assert.match(stepsText(s).join('\n'), /node install\.mjs --update/)
})

test('helpLinks — 제목을 맞혀 절 주소 · 같은 제목은 -1 · 못 찾으면 책 첫머리 · 책이 없으면 그 주제 없음', () => {
  const user = '# 책\n## 1. 무엇\n## 2. 처음 한 번 — 연결\n## 10. 막혔을 때\n'
  const h = helpLinks([{ id: '사용자_설명서', text: user }, { id: '큐레이터_설명서', text: '# 큐\n## 1. 자리 — 큐레이터 폴더\n' }])
  assert.equal(h.install, '/manual/' + encodeURIComponent('사용자_설명서') + '#2-처음-한-번--연결')
  assert.equal(h.curatorFolder, '/manual/' + encodeURIComponent('큐레이터_설명서') + '#1-자리--큐레이터-폴더')
  assert.equal(h.forms, '/manual/' + encodeURIComponent('큐레이터_설명서'))
  assert.equal(h.repo, undefined)
})

test('slugify 는 화면 markdown.js 의 것과 같다', () => {
  const src = fs.readFileSync(new URL('../viewer/src/lib/markdown.js', import.meta.url), 'utf8')
  const m = /const slugify = \(s\) =>([\s\S]*?)\nconst /.exec(src)
  assert.ok(m, '화면 slugify 를 못 찾았다')
  const client = new Function('s', 'return ' + m[1].trim().replace(/^String\(s\)/, 'String(s)'))
  for (const t of ['6. 사람 관리 — 명부와 토큰', '`ctx up` · 한 줄', 'A_b-c  d']) assert.equal(slugify(t), client(t))
})

test('실제 설명서 네 권에서 주제가 절을 맞힌다(못 맞히면 설명서 제목이 바뀐 것 — HELP_TOPICS 를 고친다)', () => {
  const books = ['사용자_설명서', '큐레이터_설명서', '관리자_설명서'].map((id) => ({ id, text: fs.readFileSync(new URL(`../manual/${id}.md`, import.meta.url), 'utf8') }))
  const h = helpLinks(books)
  for (const [k, v] of Object.entries(h)) assert.ok(v.includes('#'), `${k} 가 절을 못 찾았다 — ${v}`)
})
