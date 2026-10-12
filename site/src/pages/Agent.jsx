// 에이전트 — Claude Code 가 MCP 로 붙는 법 · 역할이 가르는 도구 13 · 스킬 7 · 「MCP 가 도는 길」.
// 「MCP 가 도는 길」 은 서버 소개 얼굴의 것을 그대로 쓴다 — 예의 값은 둘 다 데모 레포의 것이고, host 만 `<서버>` 로 넘긴다.

import McpFlow from '../../../viewer/src/site/McpFlow.jsx'
import Code from '../components/Code.jsx'
import { TOOLS, SKILLS } from '../data/facts.js'
import fig9 from '../../../docs/그림/9_MCP_한_길.svg?url'

const MCP_JSON = `{
  "mcpServers": {
    "cdp": {
      "type": "http",
      "url": "http://<서버>:7374/mcp/library",
      "headers": { "Authorization": "Bearer \${CDP_TOKEN}" }
    }
  }
}`

const INSTALL = String.raw`# 설치기는 서버의 /install.mjs — 화면 「시작하기」 · 연결된 작업 레포가 셸별(PowerShell · cmd · macOS/Linux) 한 줄로 채워 준다
curl -fsSLo /tmp/cdp-install.mjs http://<서버>:7374/install.mjs

# 작업 레포 — 아래 git 레포를 한 번에 등록 · 설치(--commit 이면 바꾼 파일만 커밋)
node /tmp/cdp-install.mjs --connect --repo library ~/code

# 큐레이터 폴더 — 등록 없이 폴더 하나 · 그 레포의 큐레이터 토큰
node /tmp/cdp-install.mjs --curator --repo library ~/cdp/curator

# 판이 올라 스킬이 바뀌면 — 이 PC 의 작업 레포 · 큐레이터 폴더 · 스킬 폴더 전부
node /tmp/cdp-install.mjs --update

# 개인 서버면 설치기를 따로 부르지 않는다 — 토큰 복사 없이 한 줄
ctx up ~/cdp/library --install ~/code/library-web --curator ~/cdp/curator`

export default function Agent() {
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>에이전트</h1>
        <p className="st-lead">
          CDP 는 <b>Claude Code</b> 에 MCP 서버로 붙는다. 에이전트는 좌표로 대상을 확정하고, 그 섹션만 읽고(아직 반영 안 된 기록까지), 일을 마치면 <code>save</code> 한 번으로 작업 기록을 남긴다.
          관리 문서는 레포마다 맡은 큐레이터의 에이전트가 기록을 판정해 반영한다. 절차는 스킬 일곱이 든다 — 에이전트가 기억에 기대지 않는다.
        </p>
      </header>

      <section className="st-sec">
        <h2>붙는 법</h2>
        <div className="st-two">
          <div>
            <p>
              작업 레포에 <code>.mcp.json</code> 을 커밋한다. 주소는 서버의 <code>/mcp/&lt;레포&gt;</code>, 토큰은 사람마다 환경변수로 둔다. <b>설치 한 줄</b>이 이것과 스킬 · 규약 블록을 넣고,
              토큰은 숨김 입력으로 받아 서버에 확인한 뒤 이 PC 에 둔다(<code>~/.config/cdp/token</code> · Windows 는 사용자 환경변수) — 명령에도 설치기에도 토큰은 없다.
            </p>
            <p>
              서버는 요청마다 <b>토큰의 역할로 도구를 등록한다</b> — 역할에 없는 도구는 보이지도 않는다. 큐레이터는 자기 PC 의 <b>큐레이터 폴더</b>에 <code>--curator</code> 로 붙는다.
              서버가 없는 팀 · 한 사람은 자기 PC 에 <b>개인 서버</b>(<code>ctx up</code>)를 띄운다 — 같은 HTTP MCP 다. 판정은 서버 안의 <code>core/</code> 한 곳이라 도구 · 화면 · CLI 의 답이 갈리지 않는다.
            </p>
          </div>
          <Code title=".mcp.json — 작업 레포" value={MCP_JSON} lang="text" />
        </div>
        <Code title="설치 한 줄" value={INSTALL} lang="text" />
        <figure className="fig st-fig">
          <img src={fig9} alt="MCP 한 길 — 작업 레포 · 큐레이터 폴더 · 브라우저가 서버 한 프로세스에 붙고, 역할이 도구를 가른다" loading="lazy" />
          <figcaption>한 길 — 작업 레포(writer) · 큐레이터 폴더 · 브라우저가 같은 서버에 붙는다. 역할이 도구와 메뉴를 가르고, 막는 것은 서버다</figcaption>
        </figure>
      </section>

      <section className="st-sec">
        <h2>도구 13</h2>
        <p className="st-p">
          읽기 아홉 · 큐레이터만 보는 셋 · 쓰기 하나. viewer 에게는 아홉, writer 에게는 <code>save</code> 까지 열, 큐레이터에게는 열셋 전부가 보인다. 도구의 설명 문장이 모델이 도구를 부를지 말지를 정한다 —
          그 문장이 서버 설계의 실체다.
        </p>
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
                  <td>{k === '쓰기' ? <b>쓰기</b> : <span className="amuted">{k}</span>}</td>
                  <td>{d}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>스킬 7</h2>
        <p className="st-p">
          서버 번들에서 <b>역할별로</b> 나간다 — 작업 레포에는 셋(<code>cdp-work</code> · <code>cdp-save</code> · <code>cdp-push</code>), 큐레이터 폴더에는 여섯 전부. 판이 오르면 서버의 갱신이 kit 을 같이 갈고,
          이 PC 의 작업 레포 · 큐레이터 폴더는 <code>--update</code> 한 줄로 같이 받는다. 낡았으면 <code>brief</code> 와 화면 「시작하기」 가 알린다. 지식 레포에는 스킬이 들어가지 않는다 — 레포에는 지식만 둔다.
        </p>
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
          접속(tools/list)부터 도구 한 번(tools/call)까지 열두 걸음. 화살표나 [이전] · [다음] 을 누르면 그 구간에 오가는 요청 · 응답이 오른쪽에 뜬다. 구간이 둘이다 — Claude Code ↔ cdp 서버(MCP)와
          Claude Code ↔ 모델 API. 이 그림의 도구 수와 「로컬형」 문장은 v0.x 판의 것이다 — 지금은 역할에 따라 도구 아홉 · 열 · 열셋이고 길은 HTTP 하나다.
        </p>
        <McpFlow host="<서버>:7374" />
      </section>
    </div>
  )
}
