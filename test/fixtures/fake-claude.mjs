// 시험용 가짜 `claude -p` — CDP_CLAUDE 로 이 파일을 주면 core/judge.js 의 runClaude 가 node 로 돌린다.
//
// 진짜처럼 표준 입력으로 프롬프트를 받고 `--output-format json` 의 한 줄을 낸다. 지키는 것도 본다 —
// save · 편집 · 셸이 금지 목록에 있고, MCP 설정이 있고, 원문 파일이 지금 폴더에 있다. 어기면 is_error 로 답한다.
//
//   원문에 「PLC」 가 있으면 등재 좌표 term:PLC(인용 · registered) · 「새것」 이 있으면 미등재 term:새것 + 어휘 제안
//   원문에 `## 둘째` 가 있으면 그 줄에서 둘로 나눈다 · 「서식」 이면 제외 · 「깨짐」 이면 JSON 이 아닌 글

import fs from 'node:fs'
import path from 'node:path'

const args = process.argv.slice(2)
const has = (k) => args.includes(k)
const val = (k) => args[args.indexOf(k) + 1]
const say = (o) => process.stdout.write(JSON.stringify({ type: 'result', subtype: 'success', is_error: false, usage: { input_tokens: 100, output_tokens: 50 }, total_cost_usd: 0.001, ...o }) + '\n')

if (has('--version')) {
  process.stdout.write('9.9.9 (Claude Code · 가짜)\n')
  process.exit(0)
}

let prompt = ''
process.stdin.on('data', (c) => (prompt += c))
process.stdin.on('end', () => {
  const deny = String(val('--disallowedTools') || '')
  const cfg = val('--mcp-config')
  if (!has('-p') || !deny.includes('mcp__cdp__save') || !deny.includes('Bash') || !cfg || !fs.existsSync(cfg)) return say({ is_error: true, subtype: 'error', result: '가짜 claude: 금지 목록 · MCP 설정이 없다' })
  const mcp = JSON.parse(fs.readFileSync(cfg, 'utf8'))
  if (!/^Bearer \S+/.test(mcp?.mcpServers?.cdp?.headers?.Authorization || '')) return say({ is_error: true, subtype: 'error', result: '가짜 claude: MCP 에 토큰이 없다' })
  if (process.env.FAKE_CLAUDE_LOGGED_OUT) return say({ is_error: true, subtype: 'error', result: 'Invalid API key · Please run /login' })
  const file = /원문은 지금 폴더의 `([^`]+)`/.exec(prompt)?.[1]
  const text = file ? fs.readFileSync(path.join(process.cwd(), file), 'utf8') : ''
  const lines = text.replace(/\n$/, '').split('\n')
  if (text.includes('깨짐')) return say({ result: '죄송합니다, 판단할 수 없습니다.' })
  if (text.includes('서식')) return say({ result: JSON.stringify({ nature: '제외', why: '빈 서식이다' }) })
  const touches = []
  const vocab = []
  if (text.includes('PLC')) touches.push({ coord: 'term:PLC', verb: '정의', quote: 'PLC 를 정의한다', registered: true })
  if (text.includes('새것')) {
    touches.push({ coord: 'term:새것', verb: '신설', quote: '새것을 들인다', registered: false })
    vocab.push({ coord: 'term:새것', label: '새것', aliases: ['새 것'] })
  }
  const cut = lines.findIndex((l) => l.startsWith('## 둘째'))
  const records =
    cut > 0
      ? [
          { lines: [1, cut], title: '첫째 조각', date: '2026-03-01', dateEvidence: '본문 「3월 1일」', touches, excluded: [], open: [] },
          { lines: [cut + 1, lines.length], title: '둘째 조각', touches: [], excluded: [{ coord: 'term:언급', why: '지나가며' }], open: ['회신 대기'] },
        ]
      : [{ lines: [1, lines.length], title: null, touches, excluded: [], open: [] }]
  // 진짜처럼 코드 울타리 · 앞말이 붙어 오기도 한다
  say({ result: '판단입니다.\n```json\n' + JSON.stringify({ nature: '결정', records, vocab }) + '\n```' })
})
