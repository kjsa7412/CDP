// 작업 레포 세팅의 병합 규칙 — `core/setup.js`.
//
// `ctx setup` · 관리 화면 · `install.mjs` · `ctx setup --server` 가 전부 이 함수를
// 부른다. 여기가 갈라지면 넷이 다른 파일을 쓴다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import path from 'node:path'
import { BEGIN, END, KIT_MARK, kitOf, mergeClaude, mergeMcpJson, mcpEntryServer, TOKEN_HELPER } from '../core/setup.js'

const BODY = '## 업무 맥락\n\n지식 레포가 딸려 있다.\n'

test('mergeClaude — 없으면 블록만 · kit 해시가 첫 줄에', () => {
  const out = mergeClaude(null, BODY, 'a3f19c')
  assert.ok(out.startsWith(BEGIN + '\n<!-- cdp:kit a3f19c -->\n'))
  assert.ok(out.trimEnd().endsWith(END))
  assert.equal(kitOf(out), 'a3f19c')
  assert.equal(kitOf(mergeClaude(null, BODY)), null, 'kit 없이 부르면 표식도 없다')
})

test('mergeClaude — 사람이 쓴 파일은 뒤에 붙이고 그대로 둔다', () => {
  const mine = '# 우리 프로젝트\n\n빌드: npm run build\n'
  const out = mergeClaude(mine, BODY, 'aaaaaa')
  assert.ok(out.startsWith('# 우리 프로젝트'))
  assert.ok(out.includes('빌드: npm run build'))
  assert.ok(out.indexOf(BEGIN) > out.indexOf('npm run build'), '앞이 아니라 뒤에')
})

test('mergeClaude — 블록이 있으면 그 블록만 갈아 끼운다 · 두 번 돌려도 같다', () => {
  const mine = '# 우리 프로젝트\n\n' + mergeClaude(null, '옛 본문', '111111') + '\n## 뒤에 쓴 절\n'
  const once = mergeClaude(mine, BODY, '222222')
  assert.ok(once.includes('# 우리 프로젝트'))
  assert.ok(once.includes('## 뒤에 쓴 절'))
  assert.ok(!once.includes('옛 본문'))
  assert.equal(kitOf(once), '222222')
  assert.equal((once.match(new RegExp(BEGIN.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) || []).length, 1, '블록은 하나')
  assert.equal(mergeClaude(once, BODY, '222222'), once, '멱등')
})

test('mergeClaude — v0.3 이전 판(마커 없이 우리가 통째로 쓴 파일)은 통째로 바꾼다', () => {
  const old = '<!--\n  CDP 작업 레포 설정 — 옛 판\n-->\n\n지식 레포 = C:/cdp\n'
  const out = mergeClaude(old, BODY, 'abcdef')
  assert.ok(!out.includes('C:/cdp'), '낡은 절대경로가 남지 않는다')
  assert.ok(out.startsWith(BEGIN))
})

test('kitOf · KIT_MARK — 4~64자 16진수만', () => {
  assert.equal(kitOf('<!-- cdp:kit ABCDEF -->'), null, '대문자는 아니다')
  assert.equal(kitOf('<!-- cdp:kit abc -->'), null, '3자는 아니다')
  assert.equal(kitOf('x <!--cdp:kit deadbeef--> y'), 'deadbeef')
  assert.ok(KIT_MARK instanceof RegExp)
})

test('mergeMcpJson — cdp 키만 병합 · 다른 서버는 그대로 · 깨진 JSON 은 거절', () => {
  const entry = mcpEntryServer('https://cdp.example.com/', 'gdi')
  const had = JSON.stringify({ mcpServers: { other: { type: 'stdio', command: 'x' } }, extra: 1 })
  const out = JSON.parse(mergeMcpJson(had, entry))
  assert.deepEqual(out.mcpServers.other, { type: 'stdio', command: 'x' })
  assert.equal(out.extra, 1)
  assert.deepEqual(out.mcpServers.cdp, entry)

  const fresh = JSON.parse(mergeMcpJson(null, entry))
  assert.deepEqual(Object.keys(fresh.mcpServers), ['cdp'])

  assert.throws(() => mergeMcpJson('{ broken', entry), /JSON 이 아닙니다/)
  // mcpServers 가 객체가 아니면 새로 만든다
  assert.deepEqual(Object.keys(JSON.parse(mergeMcpJson('{"mcpServers": 3}', entry)).mcpServers), ['cdp'])
  assert.ok(mergeMcpJson(null, entry).endsWith('\n'))
})

test('mcpEntryServer — 끝 슬래시를 떼고 /mcp/<repo> · 토큰은 headersHelper 가 연결 때 읽는다', () => {
  const e = mcpEntryServer('http://10.10.20.188:7374///', 'gdi')
  assert.equal(e.type, 'http')
  assert.equal(e.url, 'http://10.10.20.188:7374/mcp/gdi')
  assert.equal(e.headersHelper, TOKEN_HELPER)
  // 정적 헤더를 두지 않는다 — ${CDP_TOKEN} 이 비면 그 빈 값이 나가 401 이었다(D3)
  assert.equal(e.headers, undefined)
})

test('TOKEN_HELPER — sh · cmd 의 큰따옴표 안에서 넘는 글자만 · env → CDP_CONFIG_DIR/token 순 · 없으면 exit 1', async () => {
  const { spawnSync } = await import('node:child_process')
  const fs = await import('node:fs')
  const os = await import('node:os')
  const path = await import('node:path')
  assert.match(TOKEN_HELPER, /^node -e "[^"]+"$/)
  assert.doesNotMatch(TOKEN_HELPER.slice(9, -1), /[$%`\\]/)
  // 셸을 거치지 않고 같은 코드를 돌린다 — 따옴표를 벗긴 그 문자열이 셸이 node 에 넘기는 것이다
  const code = TOKEN_HELPER.slice(9, -1)
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-helper-'))
  const env = (extra) => {
    const e = { ...process.env, ...extra }
    for (const k of Object.keys(extra)) if (extra[k] === undefined) delete e[k]
    return e
  }
  const run = (extra) => spawnSync(process.execPath, ['-e', code], { encoding: 'utf8', env: env(extra) })
  try {
    let r = run({ CDP_TOKEN: ' abc ', CDP_CONFIG_DIR: dir })
    assert.deepEqual(JSON.parse(r.stdout), { Authorization: 'Bearer abc' })
    fs.writeFileSync(path.join(dir, 'token'), 'zz\n')
    r = run({ CDP_TOKEN: undefined, CDP_CONFIG_DIR: dir })
    assert.deepEqual(JSON.parse(r.stdout), { Authorization: 'Bearer zz' })
    fs.rmSync(path.join(dir, 'token'))
    r = run({ CDP_TOKEN: undefined, CDP_CONFIG_DIR: dir })
    assert.equal(r.status, 1)
    assert.equal(r.stdout, '')
    assert.match(r.stderr, /no token/)
  } finally {
    fs.rmSync(dir, { recursive: true, force: true })
  }
})
