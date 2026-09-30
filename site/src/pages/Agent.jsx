// 에이전트 — Claude Code 가 MCP 로 붙는 법 · 도구 14 · 스킬 7 · 「MCP 가 도는 길」.
// 「MCP 가 도는 길」 은 서버 소개 얼굴의 것을 그대로 쓴다 — 예의 값은 둘 다 데모 레포의 것이고, host 만 `<서버>` 로 넘긴다.

import McpFlow from '../../../viewer/src/site/McpFlow.jsx'
import Code from '../components/Code.jsx'
import { TOOLS, SKILLS } from '../data/facts.js'
import fig7 from '../../../docs/그림/7_MCP_두_모드.svg?url'
import fig8 from '../../../docs/그림/8_MCP_아키텍처.svg?url'

const MCP_JSON = `{
  "mcpServers": {
    "cdp": {
      "type": "http",
      "url": "http://<서버>:7374/mcp/library",
      "headers": { "Authorization": "Bearer \${CDP_TOKEN}" }
    }
  }
}`

export default function Agent() {
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>에이전트</h1>
        <p className="st-lead">
          CDP 는 <b>Claude Code</b> 에 MCP 서버로 붙는다. 에이전트는 좌표로 대상을 확정하고, 그 섹션만 읽고, 일을 마치면 <code>save</code> 한 번으로 기록과 정본을 같이 남긴다. 절차는 스킬 일곱이 든다 — 에이전트가 기억에 기대지 않는다.
        </p>
      </header>

      <section className="st-sec">
        <h2>붙는 법</h2>
        <div className="st-two">
          <div>
            <p>
              <b>서버형</b> — 작업 레포에 <code>.mcp.json</code> 을 커밋한다. 주소는 서버의 <code>/mcp/&lt;레포&gt;</code>, 토큰은 사람마다 환경변수로 둔다. 설치기 한 줄이 이것과 스킬 일곱 · 규약을 넣고, 토큰은 숨김 입력으로 받아 서버에 확인한 뒤 둔다.
            </p>
            <p>
              <b>로컬형</b> — 같은 도구가 stdio 로 돈다(<code>ctx mcp</code>). 작업 PC 한 대 안에서 끝나고, 쓰기는 <code>save</code> 대신 파일 편집 + git 훅의 검사다.
            </p>
          </div>
          <Code title=".mcp.json — 서버형" value={MCP_JSON} lang="text" />
        </div>
        <figure className="fig st-fig">
          <img src={fig7} alt="MCP 두 모드 — 모드 A 로컬 stdio · 모드 B 서버 HTTP" loading="lazy" />
          <figcaption>두 모드 — A 는 작업 PC 한 대 안(stdio) · B 는 팀 서버(HTTP + 토큰)</figcaption>
        </figure>
      </section>

      <section className="st-sec">
        <h2>도구 14</h2>
        <p className="st-p">읽기 열둘과 쓰기 하나. 도구의 설명 문장이 모델이 도구를 부를지 말지를 정한다 — 그 문장이 서버 설계의 실체다.</p>
        <div className="st-table-wrap">
          <table className="st-table">
            <thead>
              <tr>
                <th>도구</th>
                <th>종류</th>
                <th>하는 일</th>
              </tr>
            </thead>
            <tbody>
              {TOOLS.map(([n, k, d]) => (
                <tr key={n}>
                  <td className="amono">{n}</td>
                  <td>{k === '쓰기' ? <b>쓰기</b> : <span className="amuted">읽기</span>}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>스킬 7</h2>
        <p className="st-p">작업 레포의 <code>.claude/skills/</code> 에 들어간다. 판이 오르면 서버의 갱신이 지식 레포의 스킬을 갈고, 작업 레포는 한 줄로 일괄 갱신한다.</p>
        <div className="st-table-wrap">
          <table className="st-table">
            <tbody>
              {SKILLS.map(([n, d]) => (
                <tr key={n}>
                  <td className="amono">{n}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>MCP 가 도는 길</h2>
        <p className="st-p">
          접속(tools/list)부터 도구 한 번(tools/call)까지 열두 걸음. 화살표나 [이전] · [다음] 을 누르면 그 구간에 오가는 요청 · 응답이 오른쪽에 뜬다. 구간이 둘이다 — Claude Code ↔ cdp 서버(MCP)와 Claude Code ↔ 모델 API.
        </p>
        <McpFlow host="<서버>:7374" />
      </section>

      <section className="st-sec">
        <h2>하나의 계산</h2>
        <figure className="fig st-fig">
          <img src={fig8} alt="CDP 시스템 아키텍처 — core 하나, 소비자 셋" loading="lazy" />
          <figcaption>core 하나, 소비자 셋 — CLI · 화면 · MCP 가 같은 함수를 부른다. 답이 갈리지 않는다</figcaption>
        </figure>
      </section>
    </div>
  )
}
