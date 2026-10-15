// 어휘 연산 — 큐레이터가 좌표를 고치고 · 폐기하고 · 이름을 바꾼다(어휘 큐레이터 검토 R1~R15).
//
// dpms_wiki(2026-10-15) 에서 막힌 세 작업을 작은 레포로 옮겼다 — SCADA 경유 → PLC 직결로 바뀐 뒤의 어휘 정리.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { loadRepo } from '../core/repo.js'
import { toolMatch, toolWhere } from '../core/tools.js'
import { runBuiltinCheck } from '../core/check.js'
import { planVocab, checkVocabShape } from '../core/vocabops.js'
import { parseVocab, reconcile } from '../core/vocab.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const NOW = new Date(2026, 9, 15, 10, 0).getTime()

const VOCAB = [
  '# 어휘',
  '',
  '## term',
  '',
  '- `term:SCADA링크` — SCADA 링크',
  '  aliases: 링크, link_id',
  '- `term:PLC링크` — PLC 링크',
  '- `term:SCADA드라이버` — SCADA 드라이버',
  '',
  '## 인터페이스',
  '',
  '- `인터페이스:SCADA연계규격` — SCADA 연계 규격',
  '- `인터페이스:PLC연계규격` — PLC 연계 규격',
  '',
  '## 게이트웨이DB',
  '',
  '- `게이트웨이DB:gw_map_version` — 링크별 매핑 판',
  '- `게이트웨이DB:odbc_in_measure` — ODBC 계측 수신',
  '',
  '## 게이트웨이설계',
  '',
  '- `게이트웨이설계:SCADA마스터` — SCADA 마스터',
  '  aliases: 스카다 마스터',
  '- `게이트웨이설계:ODBC수신` — ODBC 수신',
  '',
].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `게이트웨이설계:*` | `docs/gw.md` | `## {값}` |', ''].join(NL)
const GW = ['# 게이트웨이 설계', '', '## SCADA마스터 — 현장 연계', '<!-- applied: 2026-0901-옛 -->', '', '연계 본문. `게이트웨이DB:gw_map_version` 을 쓴다.', '', '## ODBC수신 — 계측 이력', '<!-- applied: null -->', '', '수신 본문.', ''].join(NL)
const OTHER = ['# 운영 가이드', '', '현장 연계는 `게이트웨이설계:SCADA마스터` 를 본다. 다시 한 번 `게이트웨이설계:SCADA마스터`.', ''].join(NL)
const OLD = ['---', 'id: 2026-0901-옛', 'title: 옛 기록', 'date: 2026-09-01 10:00', 'author: kim', 'touches:', '  - term:SCADA링크', '  - 게이트웨이설계:SCADA마스터', 'tags: []', '---', '', 'SCADA 링크로 연계했다. `게이트웨이설계:SCADA마스터` 를 고쳤다.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-vocabops-'))
  const r = path.join(d, 'dpms')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 'gw.md'), GW)
  await fs.writeFile(path.join(r, 'docs', 'other.md'), OTHER)
  await fs.writeFile(path.join(r, 'work', '2026-0901-옛.md'), OLD)
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { r, rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const work = (id, extra = {}) => ({ id, title: id, date: '2026-10-15 10:00', touches: [], touchesEmpty: '어휘 정리', body: `${id} — 연계 방식이 PLC 직결로 바뀌어 어휘를 정리한다.`, ...extra })
const cur = (more = {}) => ({ user: 'curator', write: true, curate: true, now: NOW, ...more })
const read = (r, rel) => fs.readFile(path.join(r, rel), 'utf8')

// ── 순수 — planVocab ──────────────────────────────────────────────────────────

test('planVocab — retire 는 줄을 남기고 deprecated 한 줄 · 사유의 화살표는 걷는다', () => {
  const ops = checkVocabShape([{ op: 'retire', coord: 'term:SCADA링크', successor: 'term:PLC링크', reason: 'SCADA → PLC 직결' }])
  const p = planVocab(VOCAB, ops, { today: '2026-10-15' })
  assert.match(p.text, /- `term:SCADA링크` — SCADA 링크\n {2}aliases: 링크, link_id\n {2}deprecated: 2026-10-15 → term:PLC링크 — SCADA PLC 직결\n/)
  const v = parseVocab(p.text).coords.get('term:SCADA링크')
  assert.equal(v.deprecated, '2026-10-15')
  assert.equal(v.supersededBy, 'term:PLC링크')
})

test('planVocab — CRLF 를 지킨다 · 바꾼 것이 없으면 글이 같다', () => {
  const crlf = VOCAB.replace(/\n/g, '\r\n')
  assert.equal(planVocab(crlf, checkVocabShape([{ coord: 'term:PLC링크', label: 'PLC 링크' }]), { today: '2026-10-15' }).text, crlf)
  const p = planVocab(crlf, checkVocabShape([{ op: 'update', coord: 'term:PLC링크', label: 'PLC 직결 링크' }]), { today: '2026-10-15' })
  assert.ok(!/[^\r]\n/.test(p.text))
  assert.match(p.text, /`term:PLC링크` — PLC 직결 링크\r\n/)
})

test('planVocab — 후속이 없거나 고리면 E_INPUT', () => {
  assert.throws(() => planVocab(VOCAB, checkVocabShape([{ op: 'retire', coord: 'term:SCADA링크', successor: 'term:없는것' }]), { today: '2026-10-15' }), (e) => e.code === 'E_INPUT' && e.detail.successor === 'term:없는것')
  assert.throws(
    () => planVocab(VOCAB, checkVocabShape([{ op: 'retire', coord: 'term:SCADA링크', successor: 'term:PLC링크' }, { op: 'retire', coord: 'term:PLC링크', successor: 'term:SCADA링크' }]), { today: '2026-10-15' }),
    (e) => e.code === 'E_INPUT' && /고리/.test(e.message)
  )
})

test('alias 색인 — 같은 열쇠면 살아 있는 좌표가 답이다', () => {
  const text = VOCAB.replace('- `term:PLC링크` — PLC 링크', '- `term:PLC링크` — PLC 링크\n  aliases: 링크').replace('  aliases: 링크, link_id', '  aliases: 링크, link_id\n  deprecated: 2026-10-15 → term:PLC링크')
  assert.equal(reconcile(parseVocab(text), '링크').coord, 'term:PLC링크')
})

// ── save — 큐레이터 ───────────────────────────────────────────────────────────

test('① 좌표 폐기 + 후속 — dryRun 은 쓰지 않고, save 뒤 match · where 가 후속을 준다 · 옛 기록은 경고가 아니다', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    const input = {
      work: work('2026-1015-어휘-폐기', { touches: ['term:SCADA링크', 'term:PLC링크'], touchesEmpty: undefined }),
      vocab: [
        { coord: 'term:현장드라이버', label: '현장 드라이버' },
        // alias 「링크」 를 옛 좌표에서 걷고 새 좌표로 — 순서가 거꾸로여도 판정은 저장 뒤의 어휘로 한다
        { op: 'update', coord: 'term:PLC링크', aliases: ['링크', 'link_id'] },
        { op: 'update', coord: 'term:SCADA링크', aliases: [] },
        { op: 'retire', coord: 'term:SCADA링크', successor: 'term:PLC링크', reason: 'PLC 직결(Modbus TCP)' },
        { op: 'retire', coord: 'term:SCADA드라이버', successor: 'term:현장드라이버' },
        { op: 'retire', coord: '인터페이스:SCADA연계규격', successor: '인터페이스:PLC연계규격' },
        { op: 'retire', coord: '게이트웨이DB:odbc_in_measure', reason: '후속 없음 — ODBC 수신을 걷었다' },
      ],
    }
    const dry = await save(R.r, { ...input, dryRun: true }, cur())
    assert.equal(dry.dryRun, true)
    assert.equal(dry.vocabOps.retired.length, 4)
    assert.equal(await read(R.r, '_vocab.md'), VOCAB)

    const out = await save(R.r, input, cur())
    assert.ok(out.commit)
    assert.equal(out.vocab, 1)
    assert.deepEqual(out.vocabOps.updated, ['term:PLC링크', 'term:SCADA링크'])

    const r = await loadRepo(R.r)
    const [m] = toolMatch(r, { names: ['SCADA링크'] })
    assert.equal(m.coord, 'term:SCADA링크')
    assert.equal(m.deprecated, '2026-10-15')
    assert.equal(m.successor, 'term:PLC링크')
    assert.equal(toolMatch(r, { names: ['링크'] })[0].coord, 'term:PLC링크')
    const odbc = toolMatch(r, { names: ['게이트웨이DB:odbc_in_measure'] })[0]
    assert.equal(odbc.successor, null)
    assert.equal(odbc.deprecated, '2026-10-15')

    // 옛 기록의 touches 로 가는 길은 그대로 — 기록 둘(옛 것 · 이 정리 기록)이 다 걸린다
    const w = toolWhere(r, { coord: 'term:SCADA링크' })
    assert.equal(w.successor, 'term:PLC링크')
    assert.deepEqual(w.works.map((x) => x.id).sort(), ['2026-0901-옛', '2026-1015-어휘-폐기'])

    // 정리 기록은 시스템 기록(registry) — 대기열에 서지 않는다
    const rec = await read(R.r, 'work/2026-1015-어휘-폐기.md')
    assert.match(rec, /tags: \[registry\]/)
    assert.equal(r.curation.statusOf('2026-1015-어휘-폐기')?.state, 'system')

    // 폐기 전의 기록은 deprecated-coord 경고가 아니다(R12)
    const chk = runBuiltinCheck({ docs: r.docs, vocabText: r.vocabText, managedText: r.managedText, vocab: r.vocab, validity: r.validity, indexInfo: r.indexInfo, managedIndex: r.managedIndex, sections: r.sections, bodies: r.bodies, curation: r.curation })
    assert.ok(!chk.findings.some((f) => f.kind === 'deprecated-coord'))
  } finally {
    await R.rm()
  }
})

test('① 뒤 — 폐기한 날 뒤에 옛 좌표를 쓴 기록은 경고 · 사슬이면 successorLatest', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    await save(R.r, { work: work('2026-1015-폐기'), vocab: [{ op: 'retire', coord: 'term:SCADA링크', successor: 'term:PLC링크' }] }, cur())
    await save(R.r, { work: work('2026-1015-사슬'), vocab: [{ coord: 'term:현장링크', label: '현장 링크' }, { op: 'retire', coord: 'term:PLC링크', successor: 'term:현장링크' }] }, cur())
    const later = { ...work('2026-1020-늦은'), date: '2026-10-20 09:00', touches: ['term:SCADA링크'], touchesEmpty: undefined }
    const out = await save(R.r, { work: later }, { user: 'kim', write: true, curate: false, now: NOW })
    assert.ok(out.warnings.some((x) => /deprecated 좌표 사용 1건/.test(x)))
    const r = await loadRepo(R.r)
    const m = toolMatch(r, { names: ['term:SCADA링크'] })[0]
    assert.equal(m.successor, 'term:PLC링크')
    assert.equal(m.successorLatest, 'term:현장링크')
    assert.equal(toolWhere(r, { coord: 'term:SCADA링크' }).successorLatest, 'term:현장링크')
  } finally {
    await R.rm()
  }
})

test('② label · alias 정정 — 겹치면 E_INPUT 에 겹친 좌표 · 맞으면 고친다', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    await assert.rejects(
      save(R.r, { work: work('2026-1015-겹침'), vocab: [{ op: 'update', coord: 'term:PLC링크', aliases: ['링크'] }] }, cur()),
      (e) => e.code === 'E_INPUT' && e.detail.clashes[0].other === 'term:SCADA링크'
    )
    assert.equal(await read(R.r, '_vocab.md'), VOCAB)
    const out = await save(
      R.r,
      {
        work: work('2026-1015-정정'),
        vocab: [
          { op: 'update', coord: '게이트웨이DB:gw_map_version', label: '사이트별 매핑 판' },
          { op: 'update', coord: '게이트웨이설계:ODBC수신', aliases: ['계측 이력'] },
        ],
      },
      cur()
    )
    assert.ok(out.commit)
    const v = await read(R.r, '_vocab.md')
    assert.match(v, /`게이트웨이DB:gw_map_version` — 사이트별 매핑 판\n/)
    assert.match(v, /`게이트웨이설계:ODBC수신` — ODBC 수신\n {2}aliases: 계측 이력\n/)
    assert.equal(toolMatch(await loadRepo(R.r), { names: ['계측이력'] })[0].coord, '게이트웨이설계:ODBC수신')
  } finally {
    await R.rm()
  }
})

test('③ 좌표 이름 바꾸기 — 헤딩 · applied · 참조 · 폐기 + 후속을 한 커밋에 · 작업 기록은 그대로', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    const out = await save(
      R.r,
      {
        work: work('2026-1015-이름', { touches: ['게이트웨이설계:현장연계'], touchesEmpty: undefined }),
        vocab: [{ op: 'rename', coord: '게이트웨이설계:SCADA마스터', to: '게이트웨이설계:현장연계', label: '4. 현장 연계', aliases: ['현장 연계'] }],
      },
      cur()
    )
    assert.ok(out.commit)
    assert.deepEqual(out.vocabOps.renamed, [{ coord: '게이트웨이설계:SCADA마스터', to: '게이트웨이설계:현장연계', section: 'docs/gw.md', refs: 2 }])
    const gw = await read(R.r, 'docs/gw.md')
    assert.match(gw, /## 현장연계 — 현장 연계\n<!-- applied: 2026-0901-옛 -->/)
    assert.ok(!/SCADA마스터/.test(gw))
    assert.equal((await read(R.r, 'docs/other.md')).split('`게이트웨이설계:현장연계`').length - 1, 2)
    assert.equal(await read(R.r, 'work/2026-0901-옛.md'), OLD)
    const v = parseVocab(await read(R.r, '_vocab.md'))
    assert.equal(v.coords.get('게이트웨이설계:SCADA마스터').supersededBy, '게이트웨이설계:현장연계')
    assert.deepEqual(v.coords.get('게이트웨이설계:SCADA마스터').aliases, [])
    assert.equal(v.coords.get('게이트웨이설계:현장연계').label, '4. 현장 연계')
    assert.equal((await run('git', ['-C', R.r, 'status', '--porcelain'])).stdout.trim(), '')

    const r = await loadRepo(R.r)
    const w = toolWhere(r, { coord: '게이트웨이설계:현장연계' })
    assert.equal(w.section.applied, '2026-0901-옛')
    // 옛 이름 · 옛 alias 로 온 사람은 폐기 좌표와 후속을 받는다
    const old = toolWhere(r, { coord: '게이트웨이설계:SCADA마스터' })
    assert.equal(old.successor, '게이트웨이설계:현장연계')
    assert.equal(toolMatch(r, { names: ['현장 연계'] })[0].coord, '게이트웨이설계:현장연계')
  } finally {
    await R.rm()
  }
})

test('③ 이름 바꾸기 — 같은 save 의 sections 가 새 좌표로 쓴다 · 새 좌표가 다른 문서에 걸리면 거절', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    const out = await save(
      R.r,
      {
        work: work('2026-1015-이름-섹션', { curates: [{ id: '2026-0901-옛', verdict: 'reflect', into: ['게이트웨이설계:계측이력'] }], touchesEmpty: undefined }),
        vocab: [{ op: 'rename', coord: '게이트웨이설계:ODBC수신', to: '게이트웨이설계:계측이력' }],
        sections: [{ coord: '게이트웨이설계:계측이력', applied: null, body: '계측 이력 본문(PLC 직결).' }],
      },
      cur()
    )
    assert.ok(out.commit)
    assert.match(await read(R.r, 'docs/gw.md'), /## 계측이력 — 계측 이력\n<!-- applied: 2026-0901-옛 -->\n\n계측 이력 본문/)

    await assert.rejects(
      save(R.r, { work: work('2026-1015-이름-밖'), vocab: [{ op: 'rename', coord: '게이트웨이설계:현장없음', to: 'term:x' }] }, cur()),
      (e) => e.code === 'E_INPUT' && /어휘에 없는/.test(e.message)
    )
    await assert.rejects(
      save(R.r, { work: work('2026-1015-이름-타입'), vocab: [{ op: 'rename', coord: '게이트웨이설계:SCADA마스터', to: 'term:현장연계' }] }, cur()),
      (e) => e.code === 'E_INPUT' && e.detail.doc === 'docs/gw.md'
    )
  } finally {
    await R.rm()
  }
})

test('되살리기 — 폐기 표시를 걷는다 · 폐기가 아니면 E_INPUT', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    await save(R.r, { work: work('2026-1015-폐기'), vocab: [{ op: 'retire', coord: 'term:SCADA드라이버' }] }, cur())
    await save(R.r, { work: work('2026-1015-되살림'), vocab: [{ op: 'restore', coord: 'term:SCADA드라이버' }] }, cur())
    assert.equal(await read(R.r, '_vocab.md'), VOCAB)
    await assert.rejects(save(R.r, { work: work('2026-1015-또'), vocab: [{ op: 'restore', coord: 'term:SCADA드라이버' }] }, cur()), (e) => e.code === 'E_INPUT')
  } finally {
    await R.rm()
  }
})

// ── 조용한 무시 · 권한 ────────────────────────────────────────────────────────

test('op 없이 기존 좌표 — 거절하지 않고 vocabSkipped · 다르면 경고', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    const out = await save(R.r, { work: { ...work('2026-1015-기록'), touches: ['term:PLC링크'], touchesEmpty: undefined }, vocab: [{ coord: 'term:PLC링크', label: 'PLC 직결 링크' }] }, { user: 'kim', write: true, curate: false, now: NOW })
    assert.equal(out.vocab, 0)
    assert.equal(out.vocabSkipped[0].coord, 'term:PLC링크')
    assert.ok(out.warnings.some((x) => /이미 있는 좌표 1개는 건너뛰었다/.test(x) && /op: "update"/.test(x)))
    assert.equal(await read(R.r, '_vocab.md'), VOCAB)
  } finally {
    await R.rm()
  }
})

test('권한 — writer · viewer 가 어휘 연산을 보내면 E_FORBIDDEN need: curate', { skip: !hasGit }, async () => {
  const R = await repo()
  try {
    const input = { work: work('2026-1015-몰래'), vocab: [{ op: 'retire', coord: 'term:SCADA링크', successor: 'term:PLC링크' }] }
    for (const o of [{ write: true, curate: false }, { write: false, curate: false }]) {
      await assert.rejects(save(R.r, input, { user: 'kim', now: NOW, ...o }), (e) => e.code === 'E_FORBIDDEN' && e.detail.need === 'curate' && e.detail.fields.includes('vocab(retire)'))
    }
    // 더하기는 writer 의 일 그대로
    const out = await save(R.r, { work: { ...work('2026-1015-새'), touches: ['term:Modbus'], touchesEmpty: undefined }, vocab: [{ coord: 'term:Modbus', label: 'Modbus TCP' }] }, { user: 'kim', write: true, curate: false, now: NOW })
    assert.equal(out.vocab, 1)
  } finally {
    await R.rm()
  }
})

test('모양 — 모르는 키 · op 에 안 맞는 키 · update 에 고칠 것 없음은 E_INPUT', () => {
  assert.throws(() => checkVocabShape([{ coord: 'term:a', label: 'a', deprecated: true }]), (e) => e.code === 'E_INPUT')
  assert.throws(() => checkVocabShape([{ op: 'retire', coord: 'term:a', label: 'a' }]), (e) => e.code === 'E_INPUT')
  assert.throws(() => checkVocabShape([{ op: 'update', coord: 'term:a' }]), (e) => e.code === 'E_INPUT')
  assert.throws(() => checkVocabShape([{ op: 'rename', coord: 'term:a' }]), (e) => e.code === 'E_COORD' || e.code === 'E_INPUT')
})
