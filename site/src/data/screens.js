// 화면 14장 — 판 v0.19 의 실제 서버를 가상 데모 레포로 띄워 찍었다(site/demo/capture.mjs · 제작 검토 v0.1 §5.1).
// 파일은 public/shots/<id>-light.png · <id>-dark.png. 없는 장은 그리지 않는다 — test/site.test.mjs 가 둘 다 있는지 본다.

export const GROUPS = [
  { key: 'repo', title: '레포 — 찾고 읽는 곳', lead: '로그인한 사람이 매일 여는 얼굴이다. 왼쪽에서 찾고 오른쪽에서 읽는다. 편집기는 없다 — 쓰기는 에이전트의 save 하나다.' },
  { key: 'console', title: '콘솔 — 서버 전부를 맡는 곳', lead: '관리자만 들어온다. 사람 · 토큰 · 지식 레포 · 서버 · 감사. 쓰기마다 토큰으로 한 번 더 확인한다.' },
  { key: 'site', title: '사이트 · 설명서 — 토큰 없이 읽는 곳', lead: '서버마다 앞문이 있다. 설치 전 사람도 읽을 수 있고, 레포 이름 · 사람 이름은 싣지 않는다.' },
]

export const SHOTS = [
  {
    id: '01-repo-doc', group: 'repo', role: 'writer', title: '문서 읽기',
    desc: '관리 문서 「테이블정의서」 의 대출마스터 섹션. 섹션 머리에 이 섹션이 어느 작업 기록까지 실었는지가 붙는다.',
    points: ['왼쪽 — 관리문서 · 작업문서 · 좌표 세 목록', '가운데 — 본문. 좌표는 누르면 따라간다', '오른쪽 — 세로 목차'],
  },
  {
    id: '02-repo-explore', group: 'repo', role: 'writer', title: '뻗어나가기',
    desc: '좌표 하나에서 그것을 건드린 작업 기록들 · 그 섹션 · 이웃 좌표로 뻗는다. 「왜 이렇게 됐나」 를 따라가는 길이다.',
    points: ['좌표 → 작업 기록 → 다른 좌표', '고르는 중이면 목록, 따라가는 중이면 뻗어나가기 — 왼쪽은 한 번에 하나만 한다'],
  },
  {
    id: '03-repo-work', group: 'repo', role: 'writer', title: '작업 기록',
    desc: '정정 기록 하나 — 8월 기록의 한도를 바로잡았다. 머리에 이 기록이 대신하는 옛 기록이 붙고, 옛 기록을 열면 거꾸로 이 기록으로 가는 길이 있다.',
    points: ['작업 기록은 고치지 않는다 — 틀렸으면 정정 기록을 새로 쓴다', '본문이 짧으면 「6개월 뒤에 “왜” 가 남아 있나」 를 되묻는다', '위 줄 — 이 기록의 좌표가 모두 최신인지'],
  },
  {
    id: '04-repo-graph', group: 'repo', role: 'writer', title: '좌표 그래프',
    desc: '데모 레포의 좌표 24개와 그 이음. 크기가 작업 건수다. 한 좌표를 고르면 이어진 것만 남고, 아래 줄에서 뻗어나가기로 넘어간다.',
    points: ['Canvas 2D 에 손으로 짠 힘 배치 — 라이브러리 없이', '끌어 돌리고 휠로 당긴다'],
  },
  {
    id: '05-repo-search', group: 'repo', role: 'writer', title: '검색 Ctrl+K',
    desc: '「연체」 한 마디. 맨 위 「대조」 가 alias 를 정본 좌표로 푼다. 그 아래 관리문서 · 작업문서 · 좌표 갈래. 유사도 검색이 아니다 — 걸리지 않으면 없는 것이다.',
    points: ['관리문서는 그 섹션으로 바로 연다', '키보드만으로 고르고 연다'],
  },
  {
    id: '06-repo-check', group: 'repo', role: 'admin', title: '검증',
    desc: '로컬형에서 훅 없이 들어온 기록 하나가 섹션을 안 채웠다. 서버형이면 save 가 막았을 것을 화면이 오류로 낸다 — 「밀림」 이라는 상태는 없다.',
    points: ['어느 좌표 · 어느 섹션 · 어느 기록 때문인지', '비어야 커밋된다'],
  },
  {
    id: '07-repo-admin', group: 'repo', role: 'admin', title: '관리 · 현황',
    desc: '이 레포 하나의 상태 — 문서 · 기록 · 좌표 수, 검증, 원격(미러), 작업 레포. 서버 전부는 콘솔이 맡는다.',
    points: ['관리는 레포 하나 · 콘솔은 서버 전부', '작업 레포 설치 한 줄도 여기서'],
  },
  {
    id: '08-repo-viewer', group: 'repo', role: 'viewer', title: 'viewer 가 본 레포',
    desc: '읽기만 하는 사람의 화면. 볼 수 있는 레포가 하나이고 권한 칩이 「읽기」 다. 콘솔로 가는 길이 없다 — 역할이 화면과 API 를 같은 경계에서 가른다(권한 밖은 403).',
    points: ['역할은 셋 — viewer · writer · admin', '볼 수 없는 레포는 이름도 알리지 않는다'],
  },
  {
    id: '09-console-home', group: 'console', role: 'admin', title: '콘솔 · 현황',
    desc: '서버 전부의 한눈 — 사람 · 토큰 · 지식 레포 · 미러 · 최근 감사.',
    points: ['경고만 소리를 낸다 — 정상은 조용하다(초록이 없다)'],
  },
  {
    id: '10-console-tokens', group: 'console', role: 'admin', title: '콘솔 · 토큰',
    desc: '토큰 원문은 발급할 때 한 번만 보인다. 서버에는 해시만 남는다. 재발급하면 옛 토큰은 그 자리에서 끝난다.',
    points: ['사람마다 여럿 · 메모 · 만료', '폐기도 행으로 남는다'],
  },
  {
    id: '11-console-repos', group: 'console', role: 'admin', title: '콘솔 · 지식 레포',
    desc: '서버가 든 지식 레포. 패키지로 새로 세우거나 clone 하고, origin 을 잇고, 휴지통으로 보낸다.',
    points: ['미러 — 최신 · 대기 · 밀림 · 갈라짐 · 원격 없음', '에이전트 세팅이 새 판과 다르면 칩으로'],
  },
  {
    id: '12-site-setup', group: 'site', role: null, title: '설치 마법사',
    desc: '명부가 빈 서버의 첫 화면. install.sh 가 셸에 찍은 코드로 첫 관리자를 만든다 — 코드를 읽으려면 셸이 필요하다.',
    points: ['세 단계 — 코드 · 이름 · 토큰 원문 한 번', '끝나면 다시 열리지 않는다'],
  },
  {
    id: '13-site-landing', group: 'site', role: null, title: '서버 소개',
    desc: '각 서버의 앞문. 그 서버의 판 · 레포 수 · 미러 집계만 싣는다. 맨 아래에 「MCP 가 도는 길」.',
    points: ['레포 이름 · 사람 이름은 싣지 않는다'],
  },
  {
    id: '14-site-manual', group: 'site', role: null, title: '설명서',
    desc: '사용자 · 관리자 · 개발자 세 권. 토큰 없이 읽는다. (이 그림은 데모 서버에 넣은 줄인 판이다.)',
    points: ['왼쪽 목차 · 오른쪽 본문', '역할별로 첫 권이 다르다'],
  },
]

export const shotById = Object.fromEntries(SHOTS.map((s) => [s.id, s]))
