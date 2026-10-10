// 섹션 치환은 코드펜스 안의 `#` 줄을 헤딩으로 보지 않는다 — 읽는 쪽(parseManagedSections)과 같은 규칙.
// ezipez_cdp 리빌딩에서 셸 주석(`# ① …`)이 든 코드 블록의 섹션을 고쳐 쓰자 치환이 그 줄 앞에서 끝나 코드 블록 뒷부분이
// 섹션 밖에 남았고, 짝이 어긋난 펜스가 뒤의 헤딩(섹션 일곱)을 삼켰다.

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

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const NL = '\n'

const VOCAB = ['# 어휘', '', '## ops', '', '- `ops:설정` — 설정', '- `ops:로그` — 로그', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `ops:*` | `docs/ops.md` | `## {값}` |', ''].join(NL)
const DOC = ['# 운영', '', '## 설정 — 최초 설정', '', '```bash', 'cd /svc', '', '# ① 하나', 'run one', '', '# ② 둘', 'run two', '```', '', '> 끝 문장.', '', '## 로그 — 로그 위치', '', '로그는 logs/ 에 있다.', ''].join(NL)
const W = ['---', 'id: 2026-0901-s', 'title: s', 'date: 2026-09-01 10:00', 'author: kim', 'touches:', '  - ops:설정', '  - ops:로그', 'tags: []', '---', '', '설정 · 로그를 정했다.', ''].join(NL)

test('섹션 치환 — 코드 블록 안의 # 주석이 있어도 섹션 전체를 갈아 끼우고 뒤 헤딩이 산다', { skip: !hasGit && 'git 이 없다' }, async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-fence-'))
  const r = path.join(d, 'alpha')
  try {
    await fs.mkdir(path.join(r, 'docs'), { recursive: true })
    await fs.mkdir(path.join(r, 'work'), { recursive: true })
    await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
    await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
    await fs.writeFile(path.join(r, 'docs', 'ops.md'), DOC)
    await fs.writeFile(path.join(r, 'work', '2026-0901-s.md'), W)
    const g = (...a) => run('git', ['-C', r, '-c', 'user.name=t', '-c', 'user.email=t@x', ...a])
    await g('init', '-q')
    await g('add', '-A')
    await g('commit', '-qm', 'seed')

    const r0 = await loadRepo(r)
    const s0 = toolSection(r0, { coord: 'ops:설정' })
    assert.match(s0.content, /# ② 둘/, 'section 은 코드 블록 전체를 준다')
    const body = s0.content.replace('cd /svc\n', '').replace('> 끝 문장.', '> 끝 문장 — 고쳤다.')
    await save(r, { work: { id: '2026-1010-c', title: 'c', date: '2026-10-10 10:00', body: '고친다.', curates: [{ id: '2026-0901-s', verdict: 'reflect', into: ['ops:설정'] }] }, sections: [{ coord: 'ops:설정', applied: s0.applied, body }] }, { user: 'cur', write: true, curate: true })

    const text = await fs.readFile(path.join(r, 'docs', 'ops.md'), 'utf8')
    assert.equal(text.match(/# ② 둘/g).length, 1, '코드 블록이 두 번 남지 않는다')
    assert.equal(text.match(/^```/gm).length, 2, '펜스는 한 쌍')
    assert.doesNotMatch(text, /cd \/svc/)
    const r1 = await loadRepo(r)
    assert.equal(r1.sections.find((s) => s.coord === 'ops:로그').state === 'anchor-missing', false, '뒤 섹션이 산다')
    assert.match(toolSection(r1, { coord: 'ops:로그' }).content, /logs\//)
  } finally {
    await fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 })
  }
})
