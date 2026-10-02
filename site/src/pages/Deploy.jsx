// 배치 · 설치 — 우리 환경에 들일 수 있나. **다운로드 단추는 없다**(Q4) — 배포본은 관리자가 받고, 서버는 install.sh 로 선다.

import Code from '../components/Code.jsx'
import fig2 from '../../../docs/그림/2_설치_5단계.svg?url'
import fig1 from '../../../docs/그림/1_세_레포_구조.svg?url'

const SERVER = `# 서버 — 한 번
sudo bash deploy/install.sh --bind <서버IP>     # 멱등 · --dry 로 미리보기
#   → 셸에 일회용 코드가 찍힌다 → 브라우저 /setup 에서 첫 관리자
sudo -u cdp node /opt/cdp/bin/ctx.mjs serve doctor   # fail 0 이면 끝

# 새 판
sudo bash /opt/cdp/deploy/upgrade.sh /tmp/cdp-server-v<판>.tar.gz`

const WORKREPO = String.raw`# 작업 레포 — 사람마다 한 줄 (PowerShell · 관리 › 작업 레포에서 채워진 채로 복사한다)
curl.exe -fsSLo "$env:TEMP\cdp-install.mjs" http://<서버>:7374/install.mjs; if ($?) { node "$env:TEMP\cdp-install.mjs" --repo library --workrepo <id> . }
#   → 토큰을 숨김 입력으로 묻고, 서버에 확인하고, .mcp.json · 스킬 · 규약을 둔다`

const LOCAL = String.raw`# 로컬형 — 배포본 zip 하나를 반입한다 (exe + 완성된 지식 레포 폴더)
<지식 레포>\tools\cdp.exe                      # 화면 + 도구 · Node 가 없어도 돈다 · 트레이
<지식 레포>\tools\cdp.exe ctx setup C:\work\alpha   # 작업 레포에 규약과 스킬을 넣는다
git commit                                     # pre-commit 훅이 bin/ctx check 를 부른다`

export default function Deploy() {
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>배치 · 설치</h1>
        <p className="st-lead">
          두 가지로 들인다. 팀이 서버 하나를 두는 <b>서버형</b>, 인터넷이 없는 PC 에서 각자 도는 <b>로컬형</b>. 어느 쪽이든 지식 레포는 평범한 git 레포다 — CDP 를 걷어내도 md 파일과 이력이 남는다.
        </p>
      </header>

      <section className="st-sec">
        <h2>문서 내용은 PC 를 떠나지 않는다</h2>
        <div className="st-callout">
          네트워크로 나가는 것은 <b>git 원격</b>뿐이고, 그것은 사용자가 누를 때만 움직인다. 서버 로그에는 사람 · 레포 · 도구 · 좌표 · 걸린 시간만 남고 문서 본문은 남지 않는다. 지식 레포에 캐시 · 설정을 쓰지 않는다.
          <br />
          <span className="amuted">에이전트가 읽은 섹션은 그 에이전트가 쓰는 모델 API 로 간다 — 그것은 작업 레포의 에이전트 설정이 정한다.</span>
        </div>
      </section>

      <section className="st-sec">
        <h2>서버형 對 로컬형</h2>
        <div className="st-table-wrap">
          <table className="st-table st-table--cmp">
            <thead>
              <tr>
                <th></th>
                <th>서버형</th>
                <th>로컬형</th>
              </tr>
            </thead>
            <tbody>
              <tr><td>지식 레포</td><td>서버에 하나 · 서버가 유일한 작성자</td><td>사람마다 clone · 원격이 정본</td></tr>
              <tr><td>에이전트</td><td>HTTP MCP + 토큰</td><td>stdio MCP</td></tr>
              <tr><td>쓰기</td><td><code>save</code> — 검사 · 커밋 · origin 미러를 한 번에</td><td>파일 편집 → git 훅이 <code>ctx check</code></td></tr>
              <tr><td>동시에 여럿</td><td>저장이 레포마다 줄을 선다 · 같은 섹션이면 <code>E_CONFLICT</code></td><td>git 병합</td></tr>
              <tr><td>화면</td><td>브라우저 — 소개 · 설명서 · 레포 · 콘솔</td><td><code>cdp.exe</code> 하나 · 트레이</td></tr>
              <tr><td>사람 관리</td><td>콘솔 — 역할 셋 · 토큰 · 감사</td><td>없다(git 권한이 전부)</td></tr>
              <tr><td>받는 것</td><td><code>cdp-server-v&lt;판&gt;.tar.gz</code></td><td>배포본 zip — exe + 완성된 지식 레포 폴더</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>서버형 — 세우기</h2>
        <div className="st-two st-two--code">
          <Code title="서버" value={SERVER} lang="text" />
          <Code title="작업 레포" value={WORKREPO} lang="text" />
        </div>
        <ul className="st-list">
          <li>
            <b>콘솔</b> — 현황 · 사용자 · 토큰 · 지식 레포 · 작업 레포 · 서버 · 감사. 쓰기마다 토큰으로 다시 확인한다(15분).
          </li>
          <li>
            <b>git 자격</b> — SSH 배포 키는 콘솔에서 만든다(공개 키만 보인다). PAT 는 셸에서 숨김 입력으로. 비밀은 브라우저를 지나지 않는다.
          </li>
          <li>
            <b>미러</b> — save 가 커밋하면 origin 으로 보낸다. 상태는 다섯 — 최신 · 대기 · 밀림 · 갈라짐 · 원격 없음. 갈라지면 멈추고 콘솔이 맞추기 · 다시 보내기 · 되돌리기를 준다.
          </li>
          <li>
            <b>패키지</b> — 지식 레포는 서식 패키지로 세운다. 일하는 방식대로 고른다 — 공공 SI 산출물 · 애자일 제품 개발 · 클라우드 네이티브 운영 · AI · LLM 서비스, 또는 빈 레포. 패키지는 서식이지 내용이 아니다.
          </li>
        </ul>
      </section>

      <section className="st-sec">
        <h2>로컬형 — 반입하기</h2>
        <Code title="로컬형" value={LOCAL} lang="text" />
        <figure className="fig st-fig">
          <img src={fig2} alt="설치 5단계" loading="lazy" />
          <figcaption>설치 5단계 — 배포본을 만들고, 반입하고, 지식 레포를 두고, 작업 레포를 세팅하고, 쓴다</figcaption>
        </figure>
      </section>

      <section className="st-sec">
        <h2>세 레포</h2>
        <figure className="fig st-fig">
          <img src={fig1} alt="세 레포 — CDP 소스 · 지식 레포 · 작업 레포" loading="lazy" />
          <figcaption>CDP 소스(도구 개발자만) · 지식 레포(팀의 지식) · 작업 레포(코드 — 규약과 스킬만 들어간다)</figcaption>
        </figure>
      </section>

      <section className="st-sec">
        <h2>설명서</h2>
        <p className="st-p">
          설명서는 설치된 서버의 <code>/manual</code> 에 있고 토큰 없이 읽힌다. 세 권이다 — <b>사용자</b>(연결 · 하루 흐름 · 작업 요청 · 기록 · 막혔을 때) · <b>관리자</b>(서버형 · 로컬형 설치 · 사람 관리 · 레포 운영 · 갱신 · 장애) · <b>개발자</b>(구조 · 검증 · 릴리스 · 서버 · MCP · 패키지).
        </p>
      </section>
    </div>
  )
}
