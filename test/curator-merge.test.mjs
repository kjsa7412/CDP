// 큐레이터 폴더 설치(`install.mjs --curator`)의 병합 — 서버가 보낸 빈 폴더 기준 파일을 있는 파일에 끼운다.
// 전에는 그대로 덮어 블록 밖의 레포 규칙 · 다른 MCP 서버가 사라졌다(ezipez_curator 설치).
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mergeCuratorFile, mergeClaude, mergeMcpJson, mcpEntryServer, BEGIN, END } from '../core/setup.js'

const sent = (rel, text) => ({ rel, data: Buffer.from(text) })
const KIT = 'abc123'

test('CLAUDE.md — 없으면 받은 그대로', () => {
  const s = sent('CLAUDE.md', mergeClaude(null, '## 큐레이터\n새 블록', KIT))
  assert.equal(mergeCuratorFile(s.rel, s.data, null, KIT).toString(), s.data.toString())
})

test('CLAUDE.md — 블록 밖의 글을 남기고 블록만 갈아 끼운다', () => {
  const s = sent('CLAUDE.md', mergeClaude(null, '## 큐레이터\n새 블록', KIT))
  const cur = mergeClaude('# 레포 규칙\n값을 옮겨 적지 않는다\n', '## 큐레이터\n옛 블록', 'old999')
  const out = mergeCuratorFile(s.rel, s.data, Buffer.from(cur), KIT).toString()
  assert.match(out, /# 레포 규칙\n값을 옮겨 적지 않는다/)
  assert.match(out, /새 블록/)
  assert.doesNotMatch(out, /옛 블록/)
  assert.match(out, /<!-- cdp:kit abc123 -->/)
  assert.equal(out.split(BEGIN).length, 2)
  assert.equal(out.split(END).length, 2)
})

test('CLAUDE.md — 블록이 없는 사람의 파일에는 뒤에 붙인다', () => {
  const s = sent('CLAUDE.md', mergeClaude(null, '## 큐레이터\n새 블록', KIT))
  const out = mergeCuratorFile(s.rel, s.data, Buffer.from('# 내 폴더\n규칙 하나\n'), KIT).toString()
  assert.ok(out.startsWith('# 내 폴더\n규칙 하나'))
  assert.match(out, /새 블록/)
})

test('.mcp.json — 다른 서버는 남기고 cdp 만 바꾼다', () => {
  const s = sent('.mcp.json', mergeMcpJson(null, mcpEntryServer('http://127.0.0.1:7400', 'r')))
  const cur = JSON.stringify({ mcpServers: { other: { type: 'stdio', command: 'x' }, cdp: { type: 'http', url: 'http://old/mcp/r' } } })
  const out = JSON.parse(mergeCuratorFile(s.rel, s.data, Buffer.from(cur), KIT).toString())
  assert.deepEqual(out.mcpServers.other, { type: 'stdio', command: 'x' })
  assert.equal(out.mcpServers.cdp.url, 'http://127.0.0.1:7400/mcp/r')
})

test('그 밖의 파일(스킬)은 받은 그대로', () => {
  const s = sent('.claude/skills/cdp-curate/SKILL.md', '# 새 스킬')
  assert.equal(mergeCuratorFile(s.rel, s.data, Buffer.from('# 옛 스킬'), KIT).toString(), '# 새 스킬')
})
