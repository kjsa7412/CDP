// save 의 `managed[]` — 관리 문서(등록부 행 · 문서)를 서버가 만들고 붙이고 정리한다.
// 관리문서 동적 생성 검토 v0.1 · TODO ③. 임시 git 레포를 세우고 `save` 를 **직접** 부른다(서버는 하네스 110).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { toolSection, toolWhere } from '../core/tools.js'
import { parseRegistry, addedBy } from '../core/managed.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const skip = !hasGit && 'git 이 없다'

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', '- `table:b` — 비', '', '## view', '', '- `view:x` — 엑스', '', '## note', '', '- `note:회의` — 회의', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', '| `view:*` | `docs/v.md` | `## {값}` |', '| `note:*` | `docs/n.md` | `—` |', ''].join(NL)
const T = ['# 테이블정의서', '', ...['a', 'b'].flatMap((v) => [`## ${v} — ${v.toUpperCase()}`, '<!-- applied: null -->', '', `${v} 의 처음 본문.`, '']), ''].join(NL)
const V = ['# 화면', '', '## x — X', '<!-- applied: null -->', '', 'x 의 처음 본문.', ''].join(NL)
const N = ['# 회의록', '', '처음 본문 전체.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-savemg-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, 'docs', 'v.md'), V)
  await fs.writeFile(path.join(r, 'docs', 'n.md'), N)
  await fs.writeFile(path.join(r, 'README.md'), '# alpha\n')
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { d, r, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, touches, extra = {}) => ({ id, title: id, date: '2026-09-30 10:00', touches, body: `${id} 의 본문 — 왜 그렇게 했나.`, ...extra })
const commits = async (r) => Number((await run('git', ['-C', r, 'rev-list', '--count', 'HEAD'])).stdout.trim())
const porcelain = async (r) => (await run('git', ['-C', r, 'status', '--porcelain'])).stdout.trim()
const read = (r, rel) => fs.readFile(path.join(r, rel), 'utf8')
const exists = (r, rel) => fs.access(path.join(r, rel)).then(() => true).catch(() => false)
// 큐레이터(admin 아님) — v1.0 에서 등록부 · 섹션은 레포별 큐레이터가 쓴다. 기록만 쓰는 writer 는 `plain`
const writer = { user: 'hong', write: true, curate: true }
const plain = { user: 'lee', write: true }
const admin = { user: 'kim', write: true, admin: true }

// 한 save 가 거절되면 — 커밋 그대로 · 트리 깨끗 · 파일 그대로
async function untouched(R, fn, code, re) {
  const c0 = await commits(R.r)
  const reg0 = await read(R.r, '_managed.md')
  await assert.rejects(fn, (e) => {
    assert.equal(e.code, code, e.message)
    if (re) assert.match(e.message + JSON.stringify(e.detail), re)
    return true
  })
  assert.equal(await commits(R.r), c0, '커밋이 늘었다')
  assert.equal(await porcelain(R.r), '', '트리가 더럽다')
  assert.equal(await read(R.r, '_managed.md'), reg0)
}

test('dpms_wiki 사례 — 새 타입 term:PLC + 용어집 문서 + term:* 행 + 섹션 + 작업 기록이 한 save · 한 커밋', { skip }, async () => {
  const R = await repo()
  try {
    const c0 = await commits(R.r)
    const out = await save(
      R.r,
      {
        work: work('2026-0930-PLC-CIMON-SCADA', ['term:PLC', 'term:SCADA']),
        vocab: [{ coord: 'term:PLC', label: '프로그래머블 로직 컨트롤러', aliases: ['피엘씨'] }, { coord: 'term:SCADA', label: '감시제어 시스템' }],
        managed: [{ pattern: 'term:*', doc: 'docs/용어집.md', title: '용어집' }],
        sections: [
          { coord: 'term:PLC', applied: null, heading: 'PLC — 프로그래머블 로직 컨트롤러', body: '공장 설비를 제어하는 산업용 컴퓨터.' },
          { coord: 'term:SCADA', applied: null, body: '설비를 원격에서 감시 · 제어하는 시스템.' },
        ],
      },
      writer
    )
    assert.ok(out.commit)
    assert.equal(out.managed, 1)
    assert.deepEqual(out.managedChanges, [{ op: 'add', pattern: 'term:*', doc: 'docs/용어집.md', level: 2, created: true }])
    assert.ok(out.warnings.some((w) => /새 어휘 타입 "term"/.test(w)))
    assert.equal(await commits(R.r), c0 + 1, '커밋 하나')
    assert.equal(await porcelain(R.r), '')

    // 등록부 — 마지막 규칙 행 뒤 · 기존 행은 안 바뀐다 · note 에 작업 기록 id
    const regText = await read(R.r, '_managed.md')
    const rules = parseRegistry(regText).rules
    assert.deepEqual(rules.map((x) => x.pattern), ['table:*', 'view:*', 'note:*', 'term:*'])
    assert.equal(addedBy(rules[3]), '2026-0930-PLC-CIMON-SCADA')
    // 규칙 행은 그대로 · 머리는 넷째 칸(비고)까지 넓힌다 — 서버가 더한 행의 「서버 추가 · id」 가 그려지게
    assert.deepEqual(regText.split(NL).slice(4, 7), MANAGED.split(NL).slice(4, 7), '기존 규칙 행 그대로')
    assert.deepEqual(regText.split(NL).slice(2, 4), ['| 좌표 패턴 | 관리 문서 | 섹션 | 비고 |', '|---|---|---|---|'], '머리를 넓혔다')

    // 문서 — 제목 + 섹션 둘 · applied 는 이 기록
    const doc = await read(R.r, 'docs/용어집.md')
    assert.ok(doc.startsWith('# 용어집'))
    assert.match(doc, /## PLC — 프로그래머블 로직 컨트롤러\n<!-- applied: 2026-0930-PLC-CIMON-SCADA -->/)
    assert.match(doc, /## SCADA\n<!-- applied: 2026-0930-PLC-CIMON-SCADA -->/)

    // 읽는 쪽 — where · section 이 그 섹션을 가리킨다 · 새 문서가 관리 문서 층으로 읽힌다
    const r = await loadRepo(R.r, {})
    const s = toolSection(r, { coord: 'term:PLC' })
    assert.equal(s.doc, 'docs/용어집.md')
    assert.equal(s.applied, '2026-0930-PLC-CIMON-SCADA')
    assert.match(s.content, /산업용 컴퓨터/)
    assert.equal(toolWhere(r, { coord: 'term:PLC' }).registry.doc, 'docs/용어집.md')
    assert.ok(r.managedDocs.some((d) => d.path === 'docs/용어집.md'))
    assert.ok(r.vocab.coords.has('term:PLC'))

    // 둘째 save 는 managed 없이 같은 행을 쓴다 — 새 섹션은 문서 끝에 붙는다
    const two = await save(R.r, { work: work('2026-0930-CIMON', ['term:CIMON']), vocab: [{ coord: 'term:CIMON', label: '시몬' }], sections: [{ coord: 'term:CIMON', applied: null, body: '국산 PLC 제조사.' }] }, writer)
    assert.equal(two.managed, 0)
    assert.equal('managedChanges' in two, false)
    assert.ok(!two.warnings.some((w) => /새 어휘 타입/.test(w)))
    assert.match(await read(R.r, 'docs/용어집.md'), /## CIMON\n<!-- applied: 2026-0930-CIMON -->/)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('새 섹션의 heading 은 제목 줄 전체 — 값이 빠지면 E_INPUT(앵커 없음으로 E_CHECK 가 나던 것)', { skip }, async () => {
  const R = await repo()
  try {
    await untouched(R, () => save(R.r, { work: work('2026-0930-헤딩', ['table:a']), vocab: [{ coord: 'table:new', label: '새' }], sections: [{ coord: 'table:new', applied: null, heading: '새 테이블', body: 'x' }] }, writer), 'E_INPUT', /heading/)
    const ok = await save(R.r, { work: work('2026-0930-헤딩2', ['table:new']), vocab: [{ coord: 'table:new', label: '새' }], sections: [{ coord: 'table:new', applied: null, heading: 'new — 새 테이블', body: 'x' }] }, writer)
    assert.ok(ok.commit)
  } finally {
    await R.rm()
  }
})

test('managed 없는 옛 입력은 그대로 — 응답은 managed: 0', { skip }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: work('2026-0930-옛', ['table:a']), sections: [{ coord: 'table:a', applied: null, body: 'a 새 본문' }] }, writer)
    assert.equal(out.managed, 0)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('등록부에 안 걸리는 좌표의 sections — 거절하되 풀 길(managed)을 말한다', { skip }, async () => {
  const R = await repo()
  try {
    await untouched(R, () => save(R.r, { work: work('2026-0930-길', ['term:X']), vocab: [{ coord: 'term:X', label: '엑스' }], sections: [{ coord: 'term:X', applied: null, body: 'x' }] }, writer), 'E_INPUT', /managed/)
    assert.equal(await read(R.r, '_vocab.md'), VOCAB, '어휘도 되돌았다')
  } finally {
    await R.rm()
  }
})

test('권한 — 큐레이터가 아닌 writer 는 등록부(add 포함) · 섹션을 못 쓴다 · 파일을 만지기 전에(v1.0 I6)', { skip }, async () => {
  const R = await repo()
  try {
    for (const op of [{ op: 'rename', doc: 'docs/t.md', to: 'docs/tt.md' }, { op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }, { op: 'retire', pattern: 'note:*' }, { pattern: 'term:*', doc: 'docs/g.md' }]) {
      await untouched(R, () => save(R.r, { work: work('2026-0930-권한', ['table:a']), managed: [op], sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, plain), 'E_FORBIDDEN')
    }
    assert.ok(await exists(R.r, 'docs/t.md'))
    assert.ok(!(await exists(R.r, 'work/2026-0930-권한.md')))
    // 섹션만 보내도 막는다 — 기록은 대기열로, 반영은 큐레이터가
    await untouched(R, () => save(R.r, { work: work('2026-0930-섞임', ['table:a']), sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, plain), 'E_FORBIDDEN')
    assert.ok(!(await exists(R.r, 'docs/g.md')))
  } finally {
    await R.rm()
  }
})

test('경로 · 패턴 — 레포 밖 · 절대 · docs 밖 · 표를 깨는 패턴은 E_INPUT · 아무것도 안 남는다', { skip }, async () => {
  const R = await repo()
  try {
    for (const m of [
      { pattern: 'term:*', doc: '../escape.md' },
      { pattern: 'term:*', doc: '/tmp/abs.md' },
      { pattern: 'term:*', doc: 'docs/../../escape.md' },
      { pattern: 'term:*', doc: 'README.md' },
      { pattern: 'term:*', doc: 'docs/x.txt' },
      { pattern: 'term:*', doc: 'docs\\x.md' },
      { pattern: 'term:*', doc: 'docs/con.md' },
      { pattern: '*:*', doc: 'docs/x.md' },
      { pattern: 'term:a|b', doc: 'docs/x.md' },
    ]) {
      await untouched(R, () => save(R.r, { work: work('2026-0930-경로', ['table:a']), managed: [m], sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, writer), 'E_INPUT')
    }
    assert.ok(!(await exists(path.dirname(R.r), 'escape.md')))
  } finally {
    await R.rm()
  }
})

test('겹침 — 앞 행이 덮는 새 패턴은 거절 · 같은 패턴 다른 문서는 E_CONFLICT { current } · 같은 자리는 멱등', { skip }, async () => {
  const R = await repo()
  try {
    const base = { work: work('2026-0930-겹침', ['table:a']), sections: [{ coord: 'table:a', applied: null, body: 'x' }] }
    await untouched(R, () => save(R.r, { ...base, managed: [{ pattern: 'table:a*', doc: 'docs/x.md' }] }, writer), 'E_INPUT', /shadowedBy/)
    await assert.rejects(save(R.r, { ...base, managed: [{ pattern: 'table:*', doc: 'docs/x.md' }] }, writer), (e) => e.code === 'E_CONFLICT' && e.detail.current.doc === 'docs/t.md' && e.detail.kind === 'managed')
    assert.equal(await porcelain(R.r), '')
    const same = await save(R.r, { ...base, managed: [{ pattern: 'table:*', doc: 'docs/t.md' }] }, writer)
    assert.equal(same.managed, 0)
    assert.ok(same.warnings.some((w) => /이미 있다/.test(w)))
    assert.equal((await read(R.r, '_managed.md')).match(/`table:\*`/g).length, 1)
  } finally {
    await R.rm()
  }
})

test('레벨 — 이미 ## 인 문서에 ### 행은 거절 · — 문서에 섹션 행은 거절', { skip }, async () => {
  const R = await repo()
  try {
    const base = { work: work('2026-0930-레벨', ['table:a']), sections: [{ coord: 'table:a', applied: null, body: 'x' }] }
    await untouched(R, () => save(R.r, { ...base, managed: [{ pattern: 'term:*', doc: 'docs/t.md', level: 3 }] }, writer), 'E_INPUT', /한 레벨/)
    await untouched(R, () => save(R.r, { ...base, managed: [{ pattern: 'term:*', doc: 'docs/n.md' }] }, writer), 'E_INPUT', /한 레벨/)
  } finally {
    await R.rm()
  }
})

test('기존 좌표가 새 행에 걸려도 섹션 없이 행 · 문서를 세운다 — 그 좌표는 대기열의 「등록부 있음 · 섹션 없음」 · 다음 save 도 안 막힌다(v1.0 H1)', { skip }, async () => {
  const R = await repo()
  try {
    // 행이 없던 타입의 좌표를 touches 로만 건드린 기록이 이미 있다
    await save(R.r, { work: work('2026-0929-옛', ['term:X']), vocab: [{ coord: 'term:X', label: '엑스' }] }, writer)
    const c1 = await commits(R.r)
    await save(R.r, { work: work('2026-0930-행만', ['table:a']), managed: [{ pattern: 'term:*', doc: 'docs/g.md' }], sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, writer)
    assert.equal(await commits(R.r), c1 + 1)
    const { loadRepo } = await import('../core/repo.js')
    const r = await loadRepo(R.r)
    const q = r.curation.queue.find((x) => x.id === '2026-0929-옛')
    assert.deepEqual(q?.coords, [{ coord: 'term:X', cls: 'anchor' }])
    // 그 뒤 섹션을 채우고 · 다른 좌표의 save 가 막히지 않는다
    await save(R.r, { work: work('2026-0930-부착', ['term:X']), sections: [{ coord: 'term:X', applied: null, body: '엑스의 지금 상태' }] }, writer)
    await save(R.r, { work: work('2026-0930-다른', ['table:b']), sections: [{ coord: 'table:b', applied: null, body: 'b' }] }, writer)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('롤백 — 섹션 충돌(6단계)이 나면 등록부 · 새 문서 · 새 폴더까지 원래대로', { skip }, async () => {
  const R = await repo()
  try {
    await untouched(
      R,
      () =>
        save(R.r, { work: work('2026-0930-롤백', ['table:a', 'term:Q']), vocab: [{ coord: 'term:Q', label: '큐' }], managed: [{ pattern: 'term:*', doc: 'docs/신규/용어집.md' }], sections: [{ coord: 'term:Q', applied: null, body: 'q' }, { coord: 'table:a', applied: '2099-0101-없는기록', body: 'x' }] }, writer),
      'E_CONFLICT'
    )
    assert.ok(!(await exists(R.r, 'docs/신규/용어집.md')))
    assert.ok(!(await exists(R.r, 'docs/신규')), '새 폴더도 치웠다')
    assert.equal(await read(R.r, '_vocab.md'), VOCAB)
  } finally {
    await R.rm()
  }
})

test('손으로 고친 등록부 행이 레포 밖을 가리키면 쓰기 전에 E_INPUT', { skip }, async () => {
  const R = await repo()
  try {
    await fs.appendFile(path.join(R.r, '_managed.md'), '| `term:*` | `../outside.md` | `## {값}` |\n')
    await g(R.r, 'commit', '-qam', '손 편집')
    await untouched(R, () => save(R.r, { work: work('2026-0930-탈출', ['term:X']), vocab: [{ coord: 'term:X', label: '엑스' }], sections: [{ coord: 'term:X', applied: null, body: 'x' }] }, writer), 'E_INPUT', /레포 밖/)
    assert.ok(!(await exists(path.dirname(R.r), 'outside.md')))
  } finally {
    await R.rm()
  }
})

test('admin rename — 파일이 옮겨지고 행이 바뀌고 같은 save 의 섹션이 새 경로로 쓰인다 · 한 커밋 · 삭제가 커밋된다', { skip }, async () => {
  const R = await repo()
  try {
    const c0 = await commits(R.r)
    const out = await save(R.r, { work: work('2026-0930-이름', ['table:a']), managed: [{ op: 'rename', doc: 'docs/t.md', to: 'docs/2.개발/테이블정의서.md' }], sections: [{ coord: 'table:a', applied: null, body: 'a 를 옮긴 뒤에 고쳤다' }] }, admin)
    assert.equal(out.managed, 1)
    assert.equal(await commits(R.r), c0 + 1)
    assert.equal(await porcelain(R.r), '')
    assert.ok(!(await exists(R.r, 'docs/t.md')))
    const moved = await read(R.r, 'docs/2.개발/테이블정의서.md')
    assert.match(moved, /## a — A\n<!-- applied: 2026-0930-이름 -->\n\na 를 옮긴 뒤에 고쳤다/)
    assert.match(moved, /## b — B\n<!-- applied: null -->/, '다른 섹션은 그대로')
    assert.match(await read(R.r, '_managed.md'), /`table:\*` \| `docs\/2\.개발\/테이블정의서\.md`/)
    const files = (await run('git', ['-C', R.r, '-c', 'core.quotepath=false', 'show', '--name-status', '--no-renames', '--format=', 'HEAD'])).stdout
    assert.match(files, /D\s+docs\/t\.md/, '삭제가 커밋됐다')
    assert.match(files, /A\s+docs\/2\.개발\/테이블정의서\.md/)
    const r = await loadRepo(R.r, {})
    assert.equal(toolSection(r, { coord: 'table:b' }).doc, 'docs/2.개발/테이블정의서.md')
    assert.equal(toolSection(r, { coord: 'table:a' }).applied, '2026-0930-이름')
  } finally {
    await R.rm()
  }
})

test('admin merge — 섹션을 이어 붙이고 원본을 지운다 · 이름이 겹치면 E_CHECK 로 전부 되돌린다(지운 문서도)', { skip }, async () => {
  const R = await repo()
  try {
    // 겹치지 않는 경우 — view 행 · 문서가 table 문서로 합쳐진다(둘 다 ##)
    await save(R.r, { work: work('2026-0930-합침', ['table:a']), managed: [{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], sections: [{ coord: 'table:a', applied: null, body: 'a 새 본문' }] }, admin)
    assert.ok(!(await exists(R.r, 'docs/v.md')))
    const t = await read(R.r, 'docs/t.md')
    assert.match(t, /## x — X\n<!-- applied: null -->\n\nx 의 처음 본문\./)
    assert.ok(!t.includes('# 화면'), '제목 줄은 버렸다')
    const r = await loadRepo(R.r, {})
    assert.equal(toolSection(r, { coord: 'view:x' }).doc, 'docs/t.md')
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
  const R2 = await repo()
  try {
    // 겹치는 경우 — v.md 에 `## a` 가 있다 → dup-anchor → 롤백
    await fs.writeFile(path.join(R2.r, 'docs', 'v.md'), V + NL + '## a' + NL + NL + '겹친다' + NL)
    await g(R2.r, 'commit', '-qam', 'v 에 a')
    const v0 = await read(R2.r, 'docs/v.md')
    const t0 = await read(R2.r, 'docs/t.md')
    await untouched(R2, () => save(R2.r, { work: work('2026-0930-합침2', ['table:b']), managed: [{ op: 'merge', doc: 'docs/v.md', into: 'docs/t.md' }], sections: [{ coord: 'table:b', applied: null, body: 'b' }] }, admin), 'E_CHECK', /dup-anchor/)
    assert.equal(await read(R2.r, 'docs/v.md'), v0, '지운 문서가 돌아왔다')
    assert.equal(await read(R2.r, 'docs/t.md'), t0)
  } finally {
    await R2.rm()
  }
})

test('admin retire — 행만 지운다 · 문서는 남고 경고 · 그 좌표의 섹션 요구가 사라진다', { skip }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: work('2026-0930-폐기', [], { touchesEmpty: '등록부 정리만 했다' }), managed: [{ op: 'retire', pattern: 'note:*' }] }, admin)
    assert.equal(out.managed, 1)
    assert.deepEqual(out.managedChanges, [{ op: 'retire', pattern: 'note:*', doc: 'docs/n.md' }])
    assert.ok(out.warnings.some((w) => /docs\/n\.md 은 이제 등록부에 안 걸린 관리 문서/.test(w)))
    assert.ok(await exists(R.r, 'docs/n.md'))
    assert.ok(!/note:\*/.test(await read(R.r, '_managed.md')))
    assert.equal(await porcelain(R.r), '')
    // 이제 note:회의 는 touches 로만 닿는다
    await save(R.r, { work: work('2026-0930-노트', ['note:회의']) }, writer)
    await untouched(R, () => save(R.r, { work: work('2026-0930-없는행', ['table:a']), managed: [{ op: 'retire', pattern: 'nope:*' }], sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, admin), 'E_NOT_FOUND')
  } finally {
    await R.rm()
  }
})

test('동시 save 둘이 같은 행을 더한다 — 행은 한 줄 · 뒤 쪽은 멱등 · 둘 다 커밋 · 트리 깨끗', { skip }, async () => {
  const R = await repo()
  try {
    const mk = (id, c, label) =>
      save(R.r, { work: work(id, [c]), vocab: [{ coord: c, label }], managed: [{ pattern: 'term:*', doc: 'docs/용어집.md' }], sections: [{ coord: c, applied: null, body: label + ' 본문' }] }, writer)
    const [a, b] = await Promise.all([mk('2026-0930-동시-A', 'term:A', '에이'), mk('2026-0930-동시-B', 'term:B', '비')])
    assert.equal([a, b].filter((x) => x.managed === 1).length, 1, '행을 더한 것은 하나')
    assert.equal([a, b].filter((x) => x.warnings.some((w) => /이미 있다/.test(w))).length, 1)
    assert.equal((await read(R.r, '_managed.md')).match(/`term:\*`/g).length, 1)
    const doc = await read(R.r, 'docs/용어집.md')
    assert.match(doc, /## A\n/)
    assert.match(doc, /## B\n/)
    assert.equal(await porcelain(R.r), '')
  } finally {
    await R.rm()
  }
})

test('check — 손 편집으로 덮인 행 · 레벨이 섞인 문서는 경고로 말한다(save 경고에도 실린다)', { skip }, async () => {
  const R = await repo()
  try {
    await fs.appendFile(path.join(R.r, '_managed.md'), '| `table:a*` | `docs/ta.md` | `## {값}` |\n| `scr:*` | `docs/t.md` | `### {값}` |\n')
    await fs.writeFile(path.join(R.r, 'docs', 'ta.md'), '# ta\n')
    await g(R.r, 'add', '-A')
    await g(R.r, 'commit', '-qm', '손 편집')
    const out = await save(R.r, { work: work('2026-0930-경고', ['table:a']), sections: [{ coord: 'table:a', applied: null, body: 'x' }] }, writer)
    assert.ok(out.warnings.some((w) => /앞 행이 완전히 가리는 등록부 행/.test(w)), out.warnings.join())
    assert.ok(out.warnings.some((w) => /앵커 레벨이 둘/.test(w)), out.warnings.join())
  } finally {
    await R.rm()
  }
})
