// 배치 · 설치 — 우리 환경에 들일 수 있나. **다운로드 단추는 없다**(Q4) — 산출물은 서버 관리자가 받고, 서버는 install.sh 로 선다.
// v1.0 — 쓰는 길은 서버 save 하나 · 산출물은 서버 tar 와 사이트 둘 · 설치 · 갱신 길은 셋(서버 · 지식 레포 · 에이전트 세팅).

import Code from '../components/Code.jsx'
import fig2 from '../../../docs/그림/2_설치_세_길.svg?url'
import fig1 from '../../../docs/그림/1_세_레포_구조.svg?url'

const SERVER = `# 서버 — 한 번
sudo bash deploy/install.sh --bind <서버IP>     # 멱등 · --dry 로 미리보기
#   → 셸에 일회용 코드가 찍힌다 → 브라우저 /setup 에서 첫 관리자
sudo -u cdp node /opt/cdp/bin/ctx.mjs serve doctor   # fail 0 이면 끝

# 새 판 — 화면 · 서식집 · kit 을 갈고 레포는 건드리지 않는다
sudo bash /opt/cdp/deploy/upgrade.sh /tmp/cdp-server-v<판>.tar.gz`

const WORKREPO = String.raw`# 작업 레포 — 사람마다 한 줄 (PowerShell · 레포 관리 › 연결된 작업 레포에서 채워진 채로 복사한다)
curl.exe -fsSLo "$env:TEMP\cdp-install.mjs" http://<서버>:7374/install.mjs; if ($?) { node "$env:TEMP\cdp-install.mjs" --repo library --workrepo <id> . }
#   → 토큰을 숨김 입력으로 묻고, 서버에 확인하고, .mcp.json · 스킬 셋 · 규약 블록을 둔다

# 큐레이터 폴더 — 같은 설치기에 --curator (등록 없이 · 스킬 여섯)
node "$env:TEMP\cdp-install.mjs" --curator --repo library .`

const PERSONAL = `# 개인 서버 — 서버 없는 팀 · 한 사람. 같은 서버 산출물을 자기 PC 에 푼다 (Node 20 · git)
node cdp-server-v<판>/bin/ctx.mjs repo new ./library                 # 지식 레포가 없으면 — 빈 틀 하나
node cdp-server-v<판>/bin/ctx.mjs serve --personal ./library --web cdp-server-v<판>/web
#   → 127.0.0.1:7400 · 명부(나 하나 · admin)를 스스로 만든다 · 첫 접속 주소로 바로 로그인
#   → 작업 레포에는 --curator 한 줄 — 혼자 기록하고 혼자 큐레이션한다`

export default function Deploy() {
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>배치 · 설치</h1>
        <p className="st-lead">
          서버 하나로 들인다. 팀은 서버 한 대(<b>팀 서버</b>)를 두고, 서버가 없는 팀 · 한 사람은 같은 서버를 자기 PC 에 띄운다(<b>개인 서버</b>). 어느 쪽이든 쓰는 길은 서버의{' '}
          <code>save</code> 하나이고, 지식 레포는 평범한 git 레포다 — CDP 를 걷어내도 md 파일과 이력이 남는다.
        </p>
      </header>

      <section className="st-sec">
        <h2>문서 내용은 PC 를 떠나지 않는다</h2>
        <div className="st-callout">
          네트워크로 나가는 것은 서버가 save 뒤에 미는 <b>git 원격(미러)</b>뿐이다. 서버는 LLM 을 부르지 않고, CDN · 인터넷도 타지 않는다 — 화면의 폰트까지 파일 안에 있다. 서버 로그에는
          사람 · 레포 · 도구 · 좌표 · 걸린 시간만 남고 문서 본문은 남지 않는다.
          <br />
          <span className="amuted">에이전트가 읽은 섹션은 그 에이전트가 쓰는 모델 API 로 간다 — 그것은 작업 레포의 에이전트 설정이 정한다.</span>
        </div>
      </section>

      <section className="st-sec">
        <h2>팀 서버 對 개인 서버</h2>
        <div className="st-table-wrap">
          <table className="st-table st-table--cmp">
            <thead>
              <tr>
                <th></th>
                <th>팀 서버</th>
                <th>개인 서버</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>지식 레포</td><td>서버에 여럿 · 서버가 유일한 작성자</td><td>내 PC 의 레포 하나</td></tr>
              <tr><td>주소</td><td><code>&lt;서버 IP&gt;:7374</code> — 그 IP 하나에 바인드</td><td><code>127.0.0.1:7400</code> — 이 PC 밖에서는 닿지 않는다</td></tr>
              <tr><td>사람</td><td>서버 화면 — 역할 셋 · 레포별 큐레이터 · 토큰 · 감사</td><td>스스로 만든다 — 나 하나(admin · 모든 레포의 큐레이터)</td></tr>
              <tr><td>쓰기</td><td colSpan={2}><code>save</code> — 검사 · 한 커밋 · origin 미러. 같은 코드 · 같은 화면 · 같은 MCP</td></tr>
              <tr><td>세우기</td><td><code>install.sh</code> — systemd · Docker</td><td><code>ctx serve --personal</code> 한 줄 · 켜 둘 때만 돈다</td></tr>
              <tr><td>받는 것</td><td colSpan={2}><code>cdp-server-v&lt;판&gt;.tar.gz</code> 하나 — 서버 본체 · 화면 · 서식집 · kit · 설명서 · 배포 스크립트</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>설치 세 길</h2>
        <figure className="fig st-fig">
          <img src={fig2} alt="설치 · 갱신 세 길 — 서버 · 지식 레포 · 에이전트 세팅" loading="lazy" />
          <figcaption>세 길 — 서버(install.sh · upgrade.sh) · 지식 레포(빈 틀 · 기록만 옮겨 오기 · clone) · 에이전트 세팅(설치 한 줄 · --update · --curator)</figcaption>
        </figure>
        <div className="st-two st-two--code">
          <Code title="서버" value={SERVER} lang="text" />
          <Code title="작업 레포 · 큐레이터 폴더" value={WORKREPO} lang="text" />
        </div>
        <ul className="st-list">
          <li>
            <b>서버 화면</b>(admin) — 현황 · 지식 레포 · 작업 레포 대장 · 사용자(레포 × 큐레이터) · 토큰 · 감사 · 서버 설정. 쓰기마다 토큰으로 다시 확인한다(15분).
          </li>
          <li>
            <b>지식 레포</b> — 새 레포는 <b>빈 틀</b>로 선다(README · 어휘 · 등록부 · <code>docs/</code> · <code>work/</code>). 옛 레포는 작업 기록만 옮겨 다시 세우거나 origin 에서 받아 온다. 세우면{' '}
            <b>큐레이터부터 맡긴다</b> — 레포마다 writer 중 누구에게나.
          </li>
          <li>
            <b>서식집</b> — 관리 문서는 큐레이터가 서식을 골라 세운다. 묶음 넷 · 79종 — 공공 SI 산출물 · 애자일 제품 개발 · 클라우드 네이티브 운영 · AI · LLM 서비스 — 과 팀이 둔 서식.
            서식은 서식이지 내용이 아니다 — 서버는 제목 · 서식 표지 · 첫 문단만 찍는다.
          </li>
          <li>
            <b>git 자격</b> — SSH 배포 키는 서버 화면에서 만든다(공개 키만 보인다). PAT 는 셸에서 숨김 입력으로. 비밀은 브라우저를 지나지 않는다.
          </li>
          <li>
            <b>미러</b> — save 가 커밋하면 origin 으로 보낸다. 상태는 다섯 — 최신 · 대기 · 밀림 · 갈라짐 · 원격 없음. 갈라지면 멈추고 서버 화면이 맞추기 · 다시 보내기 · 되돌리기를 준다.
            기계는 merge 하지 않는다.
          </li>
        </ul>
      </section>

      <section className="st-sec">
        <h2>개인 서버 — 서버가 없을 때</h2>
        <Code title="개인 서버" value={PERSONAL} lang="text" />
        <p className="st-cap">
          v0.x 의 로컬형(PC 의 지식 레포 + git 훅 + <code>cdp.exe</code>)을 대신한다. 다른 사람은 붙지 못한다 — 팀이 쓰려면 서버 하나를 세운다.
        </p>
      </section>

      <section className="st-sec">
        <h2>v0.x 에서 올라올 때</h2>
        <ul className="st-list">
          <li>
            서버는 <code>upgrade.sh</code> 한 번 — 그 뒤 진단이 옛 모양 레포(도구 층 · 훅이 든 것)를 알린다.
          </li>
          <li>
            레포마다 둘 중 하나 — 관리 문서를 그대로 쓰면 <b>제자리 이행</b>(<code>ctx migrate</code> — 전환 기록 하나 · 서식 예시 · 도구 층 걷기), 엉망이면 <b>다시 세우기</b>(빈 레포에 작업 기록만 옮기고
            큐레이션부터).
          </li>
          <li>
            큐레이터를 맡기고, 작업 레포마다 설치 한 줄 <code>--update</code> — 옛 스킬이 걷히고 셋이 들어간다. 패키지 · 로컬형 · exe 는 없다.
          </li>
        </ul>
      </section>

      <section className="st-sec">
        <h2>세 레포</h2>
        <figure className="fig st-fig">
          <img src={fig1} alt="세 레포 — CDP 소스 · 서버의 지식 레포 · 작업 레포와 큐레이터 폴더" loading="lazy" />
          <figcaption>CDP 소스(도구 개발자만) · 서버의 지식 레포(지식만) · 작업 레포와 큐레이터 폴더(스킬 · 규약 블록 · MCP 연결만 들어간다)</figcaption>
        </figure>
      </section>

      <section className="st-sec">
        <h2>설명서</h2>
        <p className="st-p">
          설명서는 설치된 서버의 <code>/manual</code> 에 있고 토큰 없이 읽힌다. 네 권이다 — <b>사용자</b>(연결 · 하루 흐름 · 작업 요청 · 기록 남기기 · 미반영 읽는 법 · 막혔을 때) ·{' '}
          <b>큐레이터</b>(대기열 · 판정 · 섹션 쓰기 · 서식에서 새 문서 · 등록부 · 기준선) · <b>서버 관리자</b>(설치 · 갱신 · v1.0 으로 올리기 · 사람 · 큐레이터 맡기기 · 운영 · 장애 · 개인 서버) ·{' '}
          <b>개발자</b>(구조 · 불변조건 · 검증 · 릴리스 · 서버 · MCP · 서식집). 다섯째는 서버 설치 절차다.
        </p>
      </section>
    </div>
  )
}
