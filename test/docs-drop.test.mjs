// 안 쓰는 관리 문서 지우기 — save 의 `managed: [{ op: "drop" }]` · 참조 찾기 · 사용 현황 · 검사 둘.
// 관리문서 정리 검토 v0.1 · TODO ⑤. 임시 git 레포를 세우고 `save` 를 **직접** 부른다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import fsp from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { runBuiltinCheck } from '../core/check.js'
import { findDocRefs, isRefFile, suggestEdit, droppedDocs, docKeys } from '../core/docrefs.js'
import { docUsage } from '../core/docusage.js'
import { editableFile } from '../core/edits.js'
import { checkManagedShape } from '../core/managedops.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const skip = !hasGit && 'git 이 없다'

const P = 'docs/TE_202_성능시나리오.md'
const PLAN = 'docs/TE_201_성능계획서.md'
const TBL = 'docs/DE_431_테이블.md'

const FILES = {
  '_vocab.md': ['# 어휘', '', '## 테이블', '', '- `테이블:a` — 에이', '', '## 시나리오', '', '- `시나리오:PT-EX` — (예시) 성능 예시', '  example: 서식 예시 — 지우고 시작한다', '- `시나리오:PT-REAL` — 진짜', ''].join(NL),
  '_managed.md': ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `테이블:*` | `' + TBL + '` | `## {값}` |', '| `시나리오:PT-*` | `' + P + '` | `## {값}` |', ''].join(NL),
  [TBL]: ['# DE_431 테이블', '', '| | |', '|---|---|', '| 필수 제출 | 예 |', '', '## a — 에이', '<!-- applied: null -->', '', '에이 서식.', ''].join(NL),
  [P]: ['# TE_202 성능시나리오', '', '| | |', '|---|---|', '| 필수 제출 | 아니오 |', '', '## PT-EX — (예시) 성능 예시', '<!-- applied: null -->', '', '예시.', ''].join(NL),
  [PLAN]: ['# TE_201 성능계획서', '', '| 무엇 | 어디로 |', '|---|---|', '| 밟을 절차 | `성능시나리오` |', '| 테이블 | `테이블` |', '', '성능시나리오를 보고 계획한다.', '', '## 일정', '<!-- applied: null -->', '', '없음.', ''].join(NL),
  'README.md': ['# alpha', '', '| 번호 | 문서 |', '|---|---|', '| `DE_431` | [테이블](' + TBL + ') |', '| `TE_201` | [성능계획서](' + PLAN + ') |', '| `TE_202` | [성능시나리오](' + P + ') |', '', '시나리오는 [여기](' + P + ')와 [테이블](' + TBL + ') 를 본다.', ''].join(NL),
  '관리번호.md': ['# 관리번호', '', '| 묶음 | 번호 |', '|---|---|', '| 성능 | `TE_201` `TE_202` |', '| DB | `DE_431` |', ''].join(NL),
  'CLAUDE.md': '# 도구 층\n\n`TE_202` 를 말한다.\n',
  '.gitattributes': '* text=auto eol=lf\n',
  'work/.gitkeep': '',
}

async function repo() {
  const d = await fsp.mkdtemp(path.join(os.tmpdir(), 'cdp-drop-'))
  const r = path.join(d, 'alpha')
  for (const [rel, text] of Object.entries(FILES)) {
    await fsp.mkdir(path.dirname(path.join(r, rel)), { recursive: true })
    await fsp.writeFile(path.join(r, rel), text)
  }
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { r, rm: () => fsp.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, extra = {}) => ({ id, title: id, date: '2026-10-01 10:00', touches: [], touchesEmpty: '관리 문서 정리', body: `${id} — 이 사업은 성능시험을 하지 않는다.`, ...extra })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const read = (r, rel) => fsp.readFile(path.join(r, rel), 'utf8')
const exists = (r, rel) => fsp.access(path.join(r, rel)).then(() => true).catch(() => false)
const admin = { user: 'kim', write: true, admin: true }

async function untouched(R, fn, code, re) {
  const c0 = await commits(R.r)
  await assert.rejects(fn, (e) => {
    assert.equal(e.code, code, e.message)
    if (re) assert.match(e.message + JSON.stringify(e.detail), re)
    return true
  })
  assert.equal(await commits(R.r), c0, '커밋이 늘었다')
  assert.equal(await porcelain(R.r), '', '트리가 더럽다')
  assert.ok(await exists(R.r, P), '지울 문서가 사라졌다')
}

// 미리보기의 refs 로 edits · reviewed 를 만든다 — 화면이 하는 그대로
async function resolve(R, targets, refs) {
  const edits = []
  const reviewed = []
  for (const x of refs) {
    const e = suggestEdit(await read(R.r, x.file), x, targets)
    if (e) edits.push(e)
    else reviewed.push(x.file + ':' + x.line)
  }
  return { edits, reviewed }
}

test('drop 의 모양 — doc 필수 · reason 한 줄 · 모르는 키 거절', () => {
  assert.deepEqual(checkManagedShape([{ op: 'drop', doc: P, reason: '안 씀' }]).map((o) => o.op), ['drop'])
  assert.throws(() => checkManagedShape([{ op: 'drop' }]), /doc 가 없다/)
  assert.throws(() => checkManagedShape([{ op: 'drop', doc: P, reason: 'a\nb' }]), /reason/)
  assert.throws(() => checkManagedShape([{ op: 'drop', doc: P, to: 'x' }]), /받지 않는다/)
})

test('writer 는 지우지 못한다 — 파일을 만지기 전에 E_FORBIDDEN', { skip }, async () => {
  const R = await repo()
  try {
    await untouched(R, () => save(R.r, { work: work('2026-1001-drop-w'), managed: [{ op: 'drop', doc: P }] }, { user: 'hong', write: true }), 'E_FORBIDDEN', /admin/)
  } finally {
    await R.rm()
  }
})

test('가리키는 줄이 남으면 거절 — detail.refs 에 줄마다 suggest', { skip }, async () => {
  const R = await repo()
  try {
    let refs = null
    await untouched(
      R,
      () => save(R.r, { work: work('2026-1001-drop-a'), managed: [{ op: 'drop', doc: P }] }, admin).catch((e) => {
        refs = e.detail?.refs
        throw e
      }),
      'E_INPUT',
      /가리키는 줄/
    )
    const at = Object.fromEntries(refs.map((x) => [x.file + ':' + x.line, x.suggest]))
    assert.equal(at[PLAN + ':5'], 'drop-row', '「어디로」 표 행')
    assert.equal(at[PLAN + ':8'], 'review', '산문 이름')
    assert.equal(at['README.md:7'], 'drop-row', 'README 목록 행')
    assert.equal(at['README.md:9'], 'unlink', '다른 문서도 가리키는 산문 링크')
    assert.equal(at['관리번호.md:5'], 'review', '남는 문서와 같이 적힌 행')
    assert.ok(!Object.keys(at).some((k) => k.startsWith('CLAUDE.md')), '도구 층은 보지 않는다')
    assert.ok(!Object.keys(at).some((k) => k.startsWith('_managed.md')), '등록부 행은 drop 이 닫는다')
  } finally {
    await R.rm()
  }
})

test('dryRun — 계획 · refs 를 돌려주고 커밋 · 트리 무변화', { skip }, async () => {
  const R = await repo()
  try {
    const c0 = await commits(R.r)
    const out = await save(R.r, { work: work('2026-1001-drop-d'), managed: [{ op: 'drop', doc: P }], dryRun: true }, admin)
    assert.equal(out.dryRun, true)
    assert.equal(out.commit, undefined)
    assert.deepEqual(out.managedChanges.map((e) => e.op), ['drop'])
    assert.deepEqual(out.dropped.vocabRemoved, ['시나리오:PT-EX'])
    assert.deepEqual(out.dropped.vocabKept, ['시나리오:PT-REAL'])
    assert.equal(out.dropped.refs.length, 5)
    assert.ok(out.dropped.refs.every((x) => x.left))
    // 줄마다 제안의 edits 초안 — review 는 null
    for (const x of out.dropped.refs) assert.equal(!!x.edit, x.suggest !== 'review', x.file + ':' + x.line)
    assert.equal(await commits(R.r), c0)
    assert.equal(await porcelain(R.r), '')
    assert.ok(await exists(R.r, P))
  } finally {
    await R.rm()
  }
})

test('지운다 — 파일 · 행 · 예시 좌표 · 참조 줄 · 지운 기록이 한 커밋, 검사가 조용하다', { skip }, async () => {
  const R = await repo()
  try {
    const pre = await save(R.r, { work: work('2026-1001-drop-p'), managed: [{ op: 'drop', doc: P }], dryRun: true }, admin)
    const { edits, reviewed } = await resolve(R, [P], pre.dropped.refs)
    assert.equal(edits.length, 3)
    assert.deepEqual(reviewed.sort(), [PLAN + ':8', '관리번호.md:5'].sort())
    const c0 = await commits(R.r)
    const out = await save(R.r, { work: work('2026-1001-drop-p'), managed: [{ op: 'drop', doc: P, reason: '성능시험 없음', reviewed }], edits }, admin)
    assert.equal(await commits(R.r), c0 + 1)
    assert.equal(await porcelain(R.r), '')
    assert.ok(!(await exists(R.r, P)))
    const reg = await read(R.r, '_managed.md')
    assert.ok(!reg.includes('`시나리오:PT-*`'), '행이 남았다')
    assert.deepEqual(droppedDocs(reg), [{ doc: P, work: '2026-1001-drop-p', reason: '성능시험 없음' }])
    const vocab = await read(R.r, '_vocab.md')
    assert.ok(!vocab.includes('시나리오:PT-EX'), '예시 좌표가 남았다')
    assert.ok(vocab.includes('시나리오:PT-REAL'), '예시 아닌 좌표는 남긴다')
    const readme = await read(R.r, 'README.md')
    assert.ok(!readme.includes('`TE_202`'), 'README 목록 행')
    assert.match(readme, /시나리오는 여기와 \[테이블\]/, '링크만 풀었다')
    assert.ok(out.warnings.some((w) => /알고 두었다/.test(w)))
    const r = await loadRepo(R.r)
    const res = runBuiltinCheck({ ...r, docs: r.docs })
    const kinds = res.findings.map((f) => f.kind)
    assert.ok(!kinds.includes('registry-missing'))
    // reviewed 로 둔 줄 중 백틱 이름(관리번호.md)은 지운 기록 덕에 계속 보인다
    const dang = res.findings.find((f) => f.kind === 'doc-ref-dangling')
    assert.ok(dang && dang.items.some((i) => i.path === '관리번호.md'), JSON.stringify(res.findings))
  } finally {
    await R.rm()
  }
})

test('묶음 — 같이 지우는 문서끼리의 참조는 고칠 목록에서 뺀다', { skip }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: work('2026-1001-drop-b'), managed: [{ op: 'drop', doc: P }, { op: 'drop', doc: PLAN }], dryRun: true }, admin)
    const files = out.dropped.refs.map((x) => x.file)
    assert.ok(!files.includes(PLAN), 'TE_201 안의 TE_202 참조')
    const row = out.dropped.refs.find((x) => x.file === '관리번호.md')
    assert.equal(row.suggest, 'drop-row', '지울 문서만 적힌 행이 됐다')
  } finally {
    await R.rm()
  }
})

test('작업 기록이 쓴 섹션이 있으면 거절 — merge · retire 안내', { skip }, async () => {
  const R = await repo()
  try {
    await save(R.r, { work: { id: '2026-1001-tbl', title: 'tbl', date: '2026-10-01 09:00', touches: ['테이블:a'], body: '에이를 고쳤다.' }, sections: [{ coord: '테이블:a', applied: null, body: '고친 에이.' }] }, admin)
    const c0 = await commits(R.r)
    await assert.rejects(
      () => save(R.r, { work: work('2026-1001-drop-t'), managed: [{ op: 'drop', doc: TBL }] }, admin),
      (e) => e.code === 'E_INPUT' && /merge/.test(e.message) && e.detail.realSections.includes('테이블:a')
    )
    assert.equal(await commits(R.r), c0)
  } finally {
    await R.rm()
  }
})

test('필수 제출 문서는 경고만', { skip }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: work('2026-1001-drop-req'), managed: [{ op: 'drop', doc: TBL }], dryRun: true }, admin)
    assert.ok(out.warnings.some((w) => /필수 제출/.test(w)))
  } finally {
    await R.rm()
  }
})

test('검사 — 손으로 파일만 지우면 registry-missing · doc-ref-dangling 경고(오류 아님)', { skip }, async () => {
  const R = await repo()
  try {
    await fsp.rm(path.join(R.r, P))
    const r = await loadRepo(R.r)
    const res = runBuiltinCheck({ ...r })
    const miss = res.findings.find((f) => f.kind === 'registry-missing')
    assert.equal(miss.sev, 'warn')
    assert.match(miss.items[0].detail, /시나리오:PT-\*/)
    const dang = res.findings.find((f) => f.kind === 'doc-ref-dangling')
    assert.deepEqual(dang.items.map((i) => i.path).sort(), ['README.md', 'README.md'])
    assert.ok(!res.findings.some((f) => f.sev === 'error' && /registry|dangling/.test(f.kind)))
  } finally {
    await R.rm()
  }
})

test('edits 가 뿌리 md 를 받는다 — 도구 층 · INDEX · work 는 아니다', () => {
  assert.ok(editableFile('README.md'))
  assert.ok(editableFile('관리번호.md'))
  assert.ok(editableFile('docs/a.md'))
  assert.ok(editableFile('_vocab.md'))
  assert.ok(!editableFile('CLAUDE.md'))
  assert.ok(!editableFile('MANUAL.md'))
  assert.ok(!editableFile('INDEX.md'))
  assert.ok(!editableFile('work/x.md'))
  assert.ok(!editableFile('../x.md'))
})

test('사용 현황 — 서식 그대로 · 쓰는 중 · 필수 · 들어오는 참조', { skip }, async () => {
  const R = await repo()
  try {
    let u = docUsage(await loadRepo(R.r))
    assert.equal(u.get(P).state, '서식 그대로')
    assert.equal(u.get(P).kind, '좌표')
    assert.equal(u.get(PLAN).kind, '비대상')
    assert.equal(u.get(TBL).required, true)
    assert.equal(u.get(P).required, false)
    assert.ok(u.get(P).refsIn >= 4, String(u.get(P).refsIn))
    await save(R.r, { work: { id: '2026-1001-tbl', title: 'tbl', date: '2026-10-01 09:00', touches: ['테이블:a'], body: '에이를 고쳤다 — `TE_201` 계획을 따랐다.' }, sections: [{ coord: '테이블:a', applied: null, body: '고친 에이.' }] }, admin)
    u = docUsage(await loadRepo(R.r))
    assert.equal(u.get(TBL).state, '쓰는 중')
    assert.deepEqual(u.get(TBL).sections, { total: 1, written: 1 })
    assert.equal(u.get(TBL).touchedBy, 1)
    assert.equal(u.get(PLAN).mentionedBy, 1, '작업 기록 본문의 백틱 번호')
    assert.equal(u.get(PLAN).state, '쓰는 중')
  } finally {
    await R.rm()
  }
})

// 패키지 그대로 — 검토 Q5 의 실측(TE_202 하나 · 시험 3벌)을 못박는다
test('dpms 패키지 — TE_202 를 가리키는 줄 · 묶음이면 서로의 참조가 빠진다', () => {
  const root = path.resolve('agent/packages/dpms')
  const files = []
  ;(function walk(d, rel = '') {
    for (const f of fs.readdirSync(d)) {
      const q = path.join(d, f)
      const rr = rel ? rel + '/' + f : f
      fs.statSync(q).isDirectory() ? walk(q, rr) : files.push(rr)
    }
  })(root)
  const texts = new Map(files.filter(isRefFile).map((f) => [f, fs.readFileSync(path.join(root, f), 'utf8').replace(/\r\n/g, '\n')]))
  const paths = files.filter((f) => f.startsWith('docs/'))
  const p = 'docs/2.개발/TE_202_성능테스트시나리오.md'
  const one = findDocRefs({ texts, targets: [p], paths })
  assert.deepEqual(
    one.map((x) => x.file.split('/').pop() + ':' + x.line).sort(),
    ['README.md:81', 'TE_201_성능테스트계획서.md:21', 'TE_203_성능테스트결과서.md:12', 'TE_203_성능테스트결과서.md:21', 'TE_203_성능테스트결과서.md:56', '_vocab.md:32', '관리번호.md:141'].sort()
  )
  const three = ['TE_201_성능테스트계획서', 'TE_202_성능테스트시나리오', 'TE_203_성능테스트결과서'].map((n) => `docs/2.개발/${n}.md`)
  const b = findDocRefs({ texts, targets: three, paths })
  assert.ok(!b.some((x) => /TE_20[13]/.test(x.file)))
  assert.equal(b.find((x) => x.file === '관리번호.md').suggest, 'drop-row')
  assert.equal(docKeys(p).name, '성능테스트시나리오')
})
