// 서식에서 문서를 세운다 — `managed.add { form }` · `core/formslib.js`. v1.0 개편안 §8.1 · TODO U6.
//
// 서버가 찍는 새 문서는 **제목 · 서식 표지 · 첫 문단뿐**이다 — 예시 섹션 · 작성지침 · 관리번호 표 · `applied: null` 은
// 가지 않는다(운영자: 「서식에서 관리문서로 가져올 때는 깨끗한 빈 문서로」).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { toolSection } from '../core/tools.js'
import { loadForms, searchForms, formDetail } from '../core/formslib.js'
import { planManaged } from '../core/managedops.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])

test('loadForms — 서식집 넷 · 79종 · 찾기 · 서식 하나의 stamp 는 깨끗하다', async () => {
  const lib = await loadForms()
  assert.equal(lib.groups.length, 4)
  assert.equal(lib.forms.length, 79)
  const t = searchForms(lib, '테이블').map((f) => f.id)
  assert.ok(t.includes('public-si/DE_431'), t.join(','))
  const d = formDetail(lib.byId.get('public-si/DE_431'))
  assert.equal(d.stamp.split('\n')[0], '# 테이블정의서')
  assert.match(d.stamp, /<!-- cdp:form public-si\/DE_431 -->/)
  assert.doesNotMatch(d.stamp, /예시|작성지침|applied|관리번호|^## /m)
  assert.ok(d.guide.length > 100)
})

test('planManaged — add { form } 는 새 문서를 서식의 빈 문서로 찍는다 · 모르는 서식은 E_INPUT', async () => {
  const lib = await loadForms()
  const p = await planManaged({
    ops: [{ op: 'add', pattern: '테이블정의서:*', doc: 'docs/테이블정의서.md', form: 'public-si/DE_431' }],
    registryText: '| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n',
    docPaths: [],
    read: async () => null,
    workId: '2026-1007-x',
    forms: lib.byId,
  })
  const doc = p.files.get('docs/테이블정의서.md')
  assert.match(doc, /^# 테이블정의서\n<!-- cdp:form public-si\/DE_431 -->\n\n테이블의 지금 상태/)
  assert.equal(p.events[0].form, 'public-si/DE_431')
  await assert.rejects(
    planManaged({ ops: [{ op: 'add', pattern: 't:*', doc: 'docs/t.md', form: 'nope/X' }], registryText: '', docPaths: [], read: async () => null, workId: 'w', forms: lib.byId }),
    (e) => e.code === 'E_INPUT' && /서식집에 없다/.test(e.message)
  )
})

test('save — 큐레이터가 서식으로 문서를 세우고 첫 섹션을 쓴다 · section 의 form · 예시가 섹션으로 잡히지 않는다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-fs-'))
  const r = path.join(d, 'repo')
  try {
    await fs.mkdir(path.join(r, 'work'), { recursive: true })
    await fs.writeFile(path.join(r, '_vocab.md'), '# 어휘\n\n## 테이블정의서\n\n- `테이블정의서:sy_user_info` — 사용자정보\n')
    await fs.writeFile(path.join(r, '_managed.md'), '| 좌표 패턴 | 관리 문서 | 섹션 |\n|---|---|---|\n')
    await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
    await fs.writeFile(path.join(r, 'work', '2026-1006-a.md'), '---\nid: 2026-1006-a\ntitle: a\ndate: 2026-10-06 10:00\nauthor: kim\ntouches:\n  - 테이블정의서:sy_user_info\ntags: []\n---\n\n사용자 테이블을 만들었다. user_id varchar(20) PK.\n')
    await g(r, 'init', '-q')
    await g(r, 'add', '-A')
    await g(r, 'commit', '-qm', 'seed')
    const out = await save(
      r,
      {
        work: { id: '2026-1007-큐레이션', title: '큐레이션 — 테이블정의서 세움', date: '2026-10-07 10:00', touches: [], body: '판정표 — 2026-1006-a 반영(새 문서).', curates: [{ id: '2026-1006-a', verdict: 'new', into: ['테이블정의서:sy_user_info'] }] },
        managed: [{ op: 'add', pattern: '테이블정의서:*', doc: 'docs/테이블정의서.md', form: 'public-si/DE_431' }],
        sections: [{ coord: '테이블정의서:sy_user_info', applied: null, heading: 'sy_user_info — 사용자정보', body: '사용자 계정.\n\n| 컬럼 | 타입 | 키 |\n|---|---|---|\n| user_id | varchar(20) | PK |' }],
      },
      { user: 'kim', write: true, curate: true }
    )
    assert.equal(out.sections, 1)
    const text = await fs.readFile(path.join(r, 'docs', '테이블정의서.md'), 'utf8')
    assert.match(text, /^# 테이블정의서\n<!-- cdp:form public-si\/DE_431 -->/)
    assert.doesNotMatch(text, /예시|작성지침|ex_plan_mst/)
    const rr = await loadRepo(r)
    const sec = toolSection(rr, { coord: '테이블정의서:sy_user_info' })
    assert.equal(sec.form, 'public-si/DE_431')
    assert.equal(sec.applied, '2026-1006-a')
    assert.equal(sec.state, 'ok')
    assert.equal(rr.curation.queue.length, 0)
    assert.deepEqual(rr.managedDocs[0].managedSections.filter((s) => s.level === 2).map((s) => s.value), ['sy_user_info'], '섹션은 쓴 것 하나뿐')
  } finally {
    await fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
