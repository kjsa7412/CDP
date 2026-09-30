// MCP 가 도는 길 — 소개 맨 아래. tools/list 를 받고 모델의 tool_use 를 tools/call 로 옮기는 열두 걸음.
//
// **구간이 둘이다.** Claude Code ↔ 이 서버(MCP · JSON-RPC over HTTP)와 Claude Code ↔ 모델 API.
// 모델은 이 서버를 모른다 — "불러 달라" 는 JSON 을 낼 뿐이고 옮겨 적는 것은 Claude Code 다.
// 화살표나 [이전] · [다음] 을 누르면 그 구간에 실제로 오가는 요청 · 응답이 오른쪽에 뜬다.
// ⑨ 의 값은 공식 사이트의 데모 레포(site/demo — 가상 프로젝트)에서 `where 화면설계서:LN030` 이 낸 그대로다. 소개는
// 사외에도 보이는 면이라 실물 fixture 의 값을 싣지 않는다(공식 사이트 제작 검토 v0.1). 레포 이름은 `<레포>` 로 둔다(D2).

import { useState } from 'react'

const X = { m: 100, c: 253, s: 407, k: 560 }
const LANES = [
  ['m', '모델', 'Claude API'],
  ['c', 'Claude Code', 'MCP 클라이언트'],
  ['s', 'cdp 서버', 'ctx serve'],
  ['k', 'core/', '지식 레포'],
]
const KIND = {
  mcp: { label: 'MCP 구간', cls: 'mcpflow__tag--mcp' },
  api: { label: '모델 API 구간', cls: 'mcpflow__tag--api' },
  in: { label: '서버 안', cls: 'mcpflow__tag--in' },
}

// 예의 값 — 데모 레포(site/demo)의 예제 ① 에서 녹화한 where 와 같다. 다른 값을 보이려면 `ex` 로 넘긴다.
export const EX = {
  coord: '화면설계서:LN030',
  name: '연체 현황',
  anchor: '## LN030',
  doc: 'docs/2.개발/DE_331_화면설계서.md',
  applied: '2026-0702-연체현황-화면',
  ask: '연체 현황 화면에 엑셀 내려받기 붙여 줘',
  program: 'LN030',
}

function steps(host, ex) {
  const tok = 'Authorization: Bearer <CDP_TOKEN 값>'
  return [
    {
      f: 'c', t: 's', y: 110, k: 'mcp', l: '① POST initialize', g: 'HTTP · Claude Code → cdp 서버',
      b: `POST /mcp/<레포> HTTP/1.1\nHost: ${host}\n${tok}\nContent-Type: application/json\nAccept: application/json, text/event-stream\n\n{"jsonrpc":"2.0","id":0,"method":"initialize",\n "params":{"protocolVersion":"…","clientInfo":{"name":"claude-code"}}}`,
      n: '주소와 헤더는 작업 레포의 .mcp.json 에서 온다. ${CDP_TOKEN} 자리는 Claude Code 가 시작할 때 환경변수로 채운다. 본문은 JSON-RPC 2.0 이다.',
    },
    {
      f: 's', t: 'c', y: 148, k: 'mcp', r: 1, l: '② instructions', g: 'HTTP 응답 · cdp 서버 → Claude Code',
      b: '200 OK\n{"jsonrpc":"2.0","id":0,"result":{\n  "serverInfo":{"name":"cdp"},\n  "capabilities":{"tools":{},"resources":{},"prompts":{}},\n  "instructions":"지식 레포의 도구다. 여기 있는 것이 정본이고\n    모델의 기억이 아니다. … match 로 확정 → where 로 상태\n    → section 으로 그 섹션만 …"}}',
      n: '토큰으로 사람과 권한을 확인한 뒤 그 사람이 볼 수 있는 레포 목록을 넣어 instructions 를 만든다. Claude Code 가 이것을 시스템 프롬프트에 넣는다. 서버는 상태를 들지 않는다 — 세션 id 없이 요청마다 새로 처리한다.',
    },
    {
      f: 'c', t: 's', y: 186, k: 'mcp', l: '③ POST tools/list', g: 'HTTP · Claude Code → cdp 서버',
      b: `POST /mcp/<레포>\n${tok}\n\n{"jsonrpc":"2.0","id":1,"method":"tools/list"}`,
      n: '같은 주소 · 같은 토큰. 요청마다 인증을 다시 한다.',
    },
    {
      f: 's', t: 'c', y: 224, k: 'mcp', r: 1, l: '④ 도구 14개', g: 'HTTP 응답 · cdp 서버 → Claude Code',
      b: '{"jsonrpc":"2.0","id":1,"result":{"tools":[\n  {"name":"where",\n   "description":"좌표의 지금 상태가 어느 관리 문서 어느 섹션에\n     있나, 마지막으로 반영된 작업 … \\"지금 어떻게 돼 있나\\"는 이것…",\n   "inputSchema":{"type":"object","properties":{\n     "repo":{"type":"string","maxLength":64},\n     "coord":{"type":"string","maxLength":240},\n     "limit":{"type":"integer","minimum":1,"maximum":50}},\n   "required":["coord"]}},\n  { "name":"match", … }, { "name":"section", … }, … 13개 ]}}',
      n: 'description 은 ctx-mcp.mjs 의 명함(CARD) 문장이고 inputSchema 는 zod 정의를 JSON Schema 로 바꾼 것이다. 모델이 도구를 부를지 말지를 이 문장만 보고 정한다.',
    },
    {
      f: 'c', t: 'm', y: 290, k: 'api', l: '⑤ 대화 + 도구 14개', g: 'HTTPS · Claude Code → 모델 API',
      b: `POST /v1/messages\n{"system":"… CLAUDE.md … cdp instructions …",\n "tools":[\n   {"name":"mcp__cdp__where","description":"좌표의 지금 상태가 …",\n    "input_schema":{ …④ 와 같다… }},\n   {"name":"mcp__cdp__match", …}, … ],\n "messages":[{"role":"user",\n   "content":"${ex.ask}"}]}`,
      n: '여기부터는 MCP 가 아니라 모델 API 구간이다. MCP 도구는 mcp__cdp__<이름> 으로 이름이 바뀌어 Read · Edit 같은 기본 도구 옆에 나란히 실린다.',
    },
    {
      f: 'm', t: 'c', y: 328, k: 'api', r: 1, l: '⑥ tool_use: where', g: 'HTTPS 응답 · 모델 → Claude Code',
      b: `{"role":"assistant","content":[\n  {"type":"tool_use","id":"toolu_01…",\n   "name":"mcp__cdp__where",\n   "input":{"coord":"${ex.coord}"}}]}`,
      n: `모델은 도구를 실행하지 않는다. "이것을 불러 달라" 는 JSON 을 낼 뿐이다. 이 예는 match 로 "${ex.name}" → ${ex.coord} 을 확정한 다음 차례다.`,
    },
    {
      f: 'c', t: 's', y: 366, k: 'mcp', l: '⑦ POST tools/call', g: 'HTTP · Claude Code → cdp 서버',
      b: `POST /mcp/<레포>\n${tok}\n\n{"jsonrpc":"2.0","id":7,"method":"tools/call",\n "params":{"name":"where",\n   "arguments":{"coord":"${ex.coord}"}}}`,
      n: 'Claude Code 가 ⑥ 의 tool_use 를 JSON-RPC tools/call 로 옮겨 적는다. 이름 앞의 mcp__cdp__ 를 떼고 input 을 arguments 로 옮긴다.',
    },
    {
      f: 's', t: 'k', y: 404, k: 'in', l: '⑧ 인증 → 계산', g: '서버 안 · 네트워크가 아니다',
      b: '1. Bearer 토큰 → 명부에서 사람 · 역할 (없거나 틀리면 401)\n2. 본문 2MB 상한 (넘으면 413)\n3. 권한 밖 레포를 목록에서 걷어낸다\n4. inputSchema 검사 (coord 240자 · 모르는 키 거절)\n5. core/tools.js toolWhere() — 레포 캐시에서 계산',
      n: '판정은 core/ 한 곳뿐이다. CLI 의 ctx where 와 화면이 같은 함수를 부른다.',
    },
    {
      f: 'k', t: 's', y: 442, k: 'in', r: 1, l: '⑨ JSON', g: '서버 안 · 계산 결과',
      b: `{"coord":"${ex.coord}",\n "section":{"doc":"${ex.doc}","anchor":"${ex.anchor}",\n   "applied":"${ex.applied}","state":"ok"},\n "works":[{"id":"${ex.applied}", …}],\n "total":1}`,
      n: '데모 레포(가상 프로젝트)에서 실제로 나온 값을 줄였다. MCP 의 where 는 ctx where --json 과 바이트까지 같다(검증 하네스 1번).',
    },
    {
      f: 's', t: 'c', y: 480, k: 'mcp', r: 1, l: '⑩ result', g: 'HTTP 응답 · cdp 서버 → Claude Code',
      b: `200 OK\n{"jsonrpc":"2.0","id":7,"result":{"content":[\n  {"type":"text",\n   "text":"{\\"repo\\":\\"<레포>\\",\\"coord\\":\\"${ex.coord}\\", …}"}]}}`,
      n: '서버 로그에는 사용자 · 레포 · 도구 · 좌표 · 걸린 ms · 상태만 남는다. 문서 본문은 남기지 않는다.',
    },
    {
      f: 'c', t: 'm', y: 518, k: 'api', l: '⑪ tool_result', g: 'HTTPS · Claude Code → 모델 API',
      b: `POST /v1/messages\n{"messages":[ …앞 대화…,\n  {"role":"assistant","content":[ ⑥ 의 tool_use ]},\n  {"role":"user","content":[\n    {"type":"tool_result","tool_use_id":"toolu_01…",\n     "content":"{\\"repo\\":\\"<레포>\\",\\"coord\\":\\"${ex.coord}\\", …}"}]}]}`,
      n: '도구가 돌려준 내용은 이 구간을 지나 모델 API 로 간다. 대화 전체와 도구 목록을 매번 다시 보낸다.',
    },
    {
      f: 'm', t: 'c', y: 556, k: 'api', r: 1, l: '⑫ 다음 호출 또는 답', g: 'HTTPS 응답 · 모델 → Claude Code',
      b: `{"type":"tool_use","name":"mcp__cdp__section",\n "input":{"coord":"${ex.coord}"}}\n\n→ 다시 ⑦ 로 (section · work …)\n→ 충분하면 {"type":"text","text":"${ex.program} 에 넣겠습니다 …"}`,
      n: '⑥ ~ ⑫ 가 필요한 만큼 되풀이된다. 접속(① ~ ④)은 세션을 시작할 때 한 번이다.',
    },
  ]
}

// `host` — 공식 사이트는 자기 도메인이 아니라 `<서버>` 를 보인다(공식 사이트 제작 검토 v0.1). 소개 얼굴은 그 서버의 host 그대로.
export default function McpFlow({ host = location.host, ex = EX }) {
  const [cur, setCur] = useState(0)
  const S = steps(host, ex)
  const wrap = (i) => (i + S.length) % S.length
  const go = (i) => setCur(wrap(i))
  // [이전] · [다음] 은 앞 값에서 센다 — 빨리 두 번 누르면 둘 다 같은 cur 를 보고 한 칸만 간다
  const step = (d) => setCur((c) => wrap(c + d))
  const s = S[cur]
  return (
    <div className="sec">
      <p className="sec__cap">MCP 가 도는 길 — tools/list 에서 tools/call 까지</p>
      <div className="mcpflow">
        <svg className="mcpflow__svg" viewBox="0 0 680 590" role="img" aria-label="MCP 순서도 — 모델 · Claude Code · cdp 서버 · core 사이를 열두 메시지가 오간다">
          <defs>
            <marker id="mcpflow-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
              <path d="M2 1L8 5L2 9" fill="none" stroke="context-stroke" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </marker>
          </defs>
          {LANES.map(([id, t, sub]) => (
            <g key={id}>
              <rect className="mcpflow__lane" x={X[id] - 65} y="20" width="130" height="44" rx="8" />
              <text className="mcpflow__th" x={X[id]} y="37" textAnchor="middle" dominantBaseline="central">{t}</text>
              <text className="mcpflow__ts" x={X[id]} y="53" textAnchor="middle" dominantBaseline="central">{sub}</text>
              <line className="mcpflow__life" x1={X[id]} y1="64" x2={X[id]} y2="572" />
            </g>
          ))}
          <text className="mcpflow__ts" x="40" y="88" dominantBaseline="central">접속 때</text>
          <line className="mcpflow__rule" x1="40" y1="252" x2="640" y2="252" />
          <text className="mcpflow__ts" x="40" y="268" dominantBaseline="central">요청마다</text>
          {S.map((a, i) => {
            const x1 = X[a.f]
            const x2 = X[a.t]
            const d = x2 > x1 ? 1 : -1
            const on = i === cur
            return (
              <g
                key={i}
                className={'mcpflow__step mcpflow__step--' + a.k + (on ? ' is-on' : '')}
                role="button"
                tabIndex={0}
                aria-label={a.l}
                aria-pressed={on}
                onClick={() => go(i)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    go(i)
                  }
                }}
              >
                <rect x={Math.min(x1, x2)} y={a.y - 24} width={Math.abs(x2 - x1)} height="30" fill="transparent" />
                <line x1={x1 + d * 4} y1={a.y} x2={x2 - d * 6} y2={a.y} strokeDasharray={a.r ? '5 4' : undefined} markerEnd="url(#mcpflow-arrow)" />
                <text x={(x1 + x2) / 2} y={a.y - 10} textAnchor="middle">{a.l}</text>
              </g>
            )
          })}
        </svg>

        <div className="mcpflow__side">
          <div className="mcpflow__panel" aria-live="polite">
            <div className="mcpflow__head">
              <span>
                <b>{s.l}</b> · {s.g}
              </span>
              <span className={'mcpflow__tag ' + KIND[s.k].cls}>{KIND[s.k].label}</span>
            </div>
            <pre className="mcpflow__body">{s.b}</pre>
            <p className="mcpflow__note">{s.n}</p>
          </div>
          <div className="mcpflow__nav">
            <button type="button" className="btn" onClick={() => step(-1)}>← 이전</button>
            <span className="mcpflow__pos">
              {cur + 1} / {S.length}
            </span>
            <button type="button" className="btn" onClick={() => step(1)}>다음 →</button>
          </div>
          <p className="mcpflow__foot">
            모델과 이 서버는 직접 말하지 않는다 — Claude Code 가 ⑥ 을 ⑦ 로 옮겨 적는다. 로컬형은 HTTP 대신 <code>bin/ctx mcp</code> 를 stdio 로 띄울 뿐 메시지는 같다.
          </p>
        </div>
      </div>
    </div>
  )
}
