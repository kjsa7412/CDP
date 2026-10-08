// 주소 일곱 — 라우터 · 상단 바 · 사전 생성(prerender) · 사이트맵이 **이 목록 하나**를 본다(공식 사이트 제작 검토 v0.1 §3 · S13).
// JSX 를 싣지 않는다 — node 의 prerender 가 그대로 import 한다.

export const ROUTES = [
  { path: '/', nav: null, title: 'CDP — 좌표로 찾고 사람이 본문을 읽는다', description: '프로젝트 지식을 작업 기록과 관리 문서 두 층으로 두고 좌표로 잇는다. 사람은 기록만 남기고 큐레이터가 관리 문서에 반영한다 — 아직 반영 안 된 기록은 섹션과 같이 실린다. 서버 · MCP · 화면.' },
  { path: '/concept', nav: '개념', title: '개념 · CDP', description: '사건과 상태 두 층 · 좌표 · 어휘와 등록부 · 큐레이션과 미반영 · 기준선 · 정정. 쓰는 길은 save 하나.' },
  { path: '/screens', nav: '화면', title: '화면 · CDP', description: '실제 화면 17장 — 레포 · 큐레이션 · 서버 · 사이트 · 설명서. 가상 데모 레포로 찍었다 — 화면은 진짜이고 내용만 가상이다.' },
  { path: '/examples', nav: '예제', title: '예제 · CDP', description: '좌표 찾기 · 기록 · 미반영 · 큐레이터 둘의 충돌 · 정정 — 데모 레포에 실제로 보낸 MCP 요청과 응답.' },
  { path: '/agent', nav: '에이전트', title: '에이전트 · CDP', description: 'Claude Code 가 MCP 로 붙는 법 · 역할이 가르는 도구 12 · 스킬 5 · MCP 가 도는 길 열두 걸음.' },
  { path: '/deploy', nav: '배치 · 설치', title: '배치 · 설치 · CDP', description: '팀 서버와 개인 서버 · 설치 세 길 · 서버 산출물 · 큐레이터 맡기기 · git 자격 · 미러 · 문서 내용은 PC 를 떠나지 않는다.' },
  { path: '/releases', nav: '판 이력', title: '판 이력 · CDP', description: 'v0.2 부터 지금까지 판마다 무엇이 바뀌었나.' },
]

export const NOT_FOUND = { title: '없는 주소 · CDP', description: '없는 주소입니다.' }
