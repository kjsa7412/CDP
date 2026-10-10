// 배치 · 설치 — 우리 환경에 들일 수 있나. **다운로드 단추는 없다**(Q4) — 산출물은 서버 관리자가 받고, 서버는 install.sh 로 선다.
// v1.2(제품화 2) — 한 줄 셋: 개인 서버 `ctx up` · 팀 서버 `install.sh --admin …` · 연결과 갱신 `--connect` · `--update`.
// 남은 일은 명령의 끝 출력과 화면 「시작하기」 가 말한다 — 여기에 단계 목록을 다시 쓰지 않는다.

import Code from '../components/Code.jsx'
import fig1 from '../../../docs/그림/1_세_레포_구조.svg?url'

const PERSONAL = `# 개인 서버 — 서버 없는 팀 · 한 사람 (Node 20 · git)
ctx up ~/cdp/library --install ~/code/library-web --curator ~/cdp/curator
#   → 빈 틀(없으면) · 빈 포트(7400 부터) · 토큰 · 브라우저 · 작업 레포 연결까지 · 끝은 다음 할 일
#   → 이미 떠 있으면 그 주소를 쓴다 · --service 면 로그인할 때 뜬다

# 새 판 — ~/.cdp/server 에 풀고(SHA256SUMS 대조) 작업 레포 · 큐레이터 폴더까지
ctx self-update cdp-server-v<판>.tar.gz
ctx up ~/cdp/library --update`

const TEAM = `# 팀 서버 — 서버 산출물 폴더에서 한 줄 (멱등 · --dry 로 미리보기 · root 없이 --prefix ~/…)
echo "$PAT" | sudo bash deploy/install.sh --bind <서버IP> --admin <id> --repo <이름> --origin <git url> \
     --pat-stdin --git-host <GitLab> --git-user <계정>
#   → serve.json · 서비스 · 첫 관리자 토큰(원문은 여기서 한 번) · git 자격 · 첫 레포와 push · doctor — 끝에는 남은 일만
#   → SSH 배포 키면 --ssh — 공개 키를 GitLab 에 넣은 뒤 origin 을 잇는 한 줄이 끝에 남는다
cdp serve doctor            # 설정은 serve.json 이 준다 — 플래그 없이

# 새 판 — 화면 · 서식집 · kit 을 갈고 레포는 건드리지 않는다
sudo bash /opt/cdp/deploy/upgrade.sh cdp-server-v<판>.tar.gz`

const CONNECT = `# 연결 — 사람마다. 설치기는 서버의 /install.mjs (화면 「시작하기」 가 셸별 한 줄로 채워 준다)
node cdp-install.mjs --connect --repo library ~/code     # 아래 git 레포를 한 번에 등록 · 설치 (--commit)
node cdp-install.mjs --curator --repo library ~/cdp/curator

# 갱신 — 이 PC 의 작업 레포 · 큐레이터 폴더 · 스킬 폴더 전부
node cdp-install.mjs --update`

const DOCKER = `# Docker — compose 한 장 (-p 로 프로젝트 이름을 고정한다)
docker compose -p cdp -f deploy/docker-compose.yml up -d --build
docker compose -p cdp -f deploy/docker-compose.yml logs cdp    # 첫 관리자 코드 → 브라우저 /setup`

export default function Deploy() {
  return (
    <div className="wrap st-page st-wide">
      <header className="st-head">
        <h1 tabIndex={-1}>배치 · 설치</h1>
        <p className="st-lead">
          서버 하나로 들인다. 팀은 서버 한 대(<b>팀 서버</b>)를 두고, 서버가 없는 팀 · 한 사람은 같은 서버를 자기 PC 에 띄운다(<b>개인 서버</b>). 어느 쪽이든 세우기 · 연결 · 갱신이 한 줄이고,
          쓰는 길은 서버의 <code>save</code> 하나다. 지식 레포는 평범한 git 레포다 — CDP 를 걷어내도 md 파일과 이력이 남는다.
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
              <tr><td>주소</td><td><code>&lt;서버 IP&gt;:7374</code> — 그 IP 하나에 바인드</td><td><code>127.0.0.1:7400</code>~ 빈 포트 — 이 PC 밖에서는 닿지 않는다</td></tr>
              <tr><td>사람</td><td>서버 › 사람 — 역할 셋 · 레포별 큐레이터 · 토큰 · 감사</td><td>스스로 만든다 — 나 하나(admin · 모든 레포의 큐레이터)</td></tr>
              <tr><td>쓰기</td><td colSpan={2}><code>save</code> — 검사 · 한 커밋 · origin 미러. 같은 코드 · 같은 화면 · 같은 MCP</td></tr>
              <tr><td>세우기</td><td><code>install.sh --admin … --repo …</code> 한 줄 — systemd · Docker</td><td><code>ctx up &lt;폴더&gt;</code> 한 줄 — 켜 둘 때만 돈다(<code>--service</code> 면 로그인할 때)</td></tr>
              <tr><td>새 판</td><td><code>upgrade.sh &lt;tar&gt;</code></td><td><code>ctx self-update &lt;tar&gt;</code></td></tr>
              <tr><td>받는 것</td><td colSpan={2}><code>cdp-server-v&lt;판&gt;.tar.gz</code> 하나 — 서버 본체 · 화면 · 서식집 · kit · 설명서 · 배포 스크립트</td></tr>
            </tbody>
          </table>
        </div>
      </section>

      <section className="st-sec">
        <h2>한 줄 셋</h2>
        <p className="st-p">
          무엇이 남았는지는 명령의 끝 출력과 화면 「시작하기」 가 같은 계산으로 말한다 — 레포 없음 · 작업 레포 없음 · 큐레이터 폴더 없음 · 에이전트 세팅 낡음 · 대기 · 토큰 만료 중 그 사람의 역할에 맞는 줄만.
        </p>
        <Code title="① 개인 서버" value={PERSONAL} lang="text" />
        <Code title="② 팀 서버" value={TEAM} lang="text" />
        <Code title="③ 연결 · 갱신" value={CONNECT} lang="text" />
        <ul className="st-list">
          <li>
            <b>토큰</b> — 설치기가 숨김 입력으로 받아 서버에 확인한 뒤 이 PC 에 둔다(<code>~/.config/cdp/token</code> · Windows 는 사용자 환경변수). 개인 서버는 <code>ctx up</code> 이 스스로 둔다 — 토큰 복사가 없다.
          </li>
          <li>
            <b>Docker</b> — 명부 · git 자격은 <b>data 볼륨</b> 안이라 새 판 폴더에서 올려도 이어진다. 미리 만들어 둘 파일은 없다.
          </li>
          <li>
            <b>지식 레포</b> — 새 레포는 <b>빈 틀</b>로 선다(README · 어휘 · 등록부 · <code>docs/</code> · <code>work/</code>). 옛 레포는 작업 기록만 옮겨 다시 세우거나 origin 에서 받아 온다. 세우면{' '}
            <b>큐레이터부터 맡긴다</b> — 서버 › 사람의 「레포 × 큐레이터」.
          </li>
          <li>
            <b>서식집</b> — 관리 문서는 큐레이터가 서식을 골라 세운다. 묶음 넷 · 79종 — 공공 SI 산출물 · 애자일 제품 개발 · 클라우드 네이티브 운영 · AI · LLM 서비스 — 과 팀이 둔 서식.
            서버는 제목 · 서식 표지 · 첫 문단만 찍는다.
          </li>
          <li>
            <b>git 자격</b> — <code>--ssh</code> 면 배포 키를 만들고 공개 키만 보인다(서버 › 서버에서도 만든다). PAT 는 셸에서 숨김 입력으로. 비밀은 브라우저를 지나지 않는다.
          </li>
          <li>
            <b>미러</b> — save 가 커밋하면 origin 으로 보낸다. 갈라지면 멈추고 서버 › 지식 레포가 맞추기 · 다시 보내기 · 되돌리기를 준다. 기계는 merge 하지 않는다.
          </li>
        </ul>
        <Code title="Docker" value={DOCKER} lang="text" />
      </section>

      <section className="st-sec">
        <h2>v0.x 에서 올라올 때</h2>
        <ul className="st-list">
          <li>
            서버는 <code>upgrade.sh</code> 한 번 — 그 뒤 진단이 옛 모양 레포(도구 층 · 훅이 든 것)를 알린다. 로컬형을 쓰던 PC 는 개인 서버(<code>ctx up</code>)로 옮긴다.
          </li>
          <li>
            레포마다 둘 중 하나 — 관리 문서를 그대로 쓰면 <b>제자리 이행</b>(<code>ctx migrate</code> — 전환 기록 하나 · 서식 예시 · 도구 층 걷기), 엉망이면 <b>다시 세우기</b>(빈 레포에 작업 기록만 옮기고
            큐레이션부터).
          </li>
          <li>
            큐레이터를 맡기고, PC 마다 <code>--update</code> 한 줄 — 옛 스킬이 걷히고 새 kit 이 들어간다. 패키지 · 로컬형 · exe 는 없다.
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
          설명서는 설치된 서버의 <code>/manual</code> 에 있고 토큰 없이 읽힌다. 앞에 세 권 — <b>사용자</b>(처음 한 번 · 하루 흐름 · 기록 남기기 · 미반영 읽는 법 · 막혔을 때) · <b>큐레이터</b>(큐레이터 폴더 ·
          대기열 · 판정 · 서식에서 새 문서 · 등록부) · <b>서버 관리자</b>(개인 서버 · 팀 서버 · 사람 · 큐레이터 맡기기 · 갱신 · 장애). 개발자 설명서와 서버 설치 절차는 목록에서 접혀 있다. 화면의{' '}
          <code>?</code> 가 그 절로 간다.
        </p>
      </section>
    </div>
  )
}
