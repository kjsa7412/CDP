// 주소 일곱 — 라우터 · 상단 바 · 사전 생성(prerender) · 사이트맵이 **이 목록 하나**를 본다(공식 사이트 제작 검토 v0.1 §3 · S13).
// JSX 를 싣지 않는다 — node 의 prerender 가 그대로 import 한다.

export const ROUTES = [
  { path: '/', nav: null, title: 'CDP — 좌표로 찾고 사람이 본문을 읽는다', description: '프로젝트 지식을 작업 기록과 관리 문서 두 층으로 두고, 좌표로 잇고, 커밋할 때 검사한다. 지식 레포 뷰어 · ctx 도구 · MCP 서버.' },
  { path: '/concept', nav: '개념', title: '개념 · CDP', description: '사건과 상태 두 층 · 좌표 · 어휘와 등록부 · 파생과 파생 누락 · 정정. 「밀림」 이 없는 이유.' },
  { path: '/screens', nav: '화면', title: '화면 · CDP', description: '판 v0.19 의 실제 화면 14장 — 레포 · 콘솔 · 사이트 · 설명서. 가상 데모 레포로 찍었다.' },
  { path: '/examples', nav: '예제', title: '예제 · CDP', description: '좌표 찾기 · 기록 · 갱신 누락 거절 · 동시 수정 충돌 · 정정 — 데모 레포에서 실제로 돌린 요청과 응답.' },
  { path: '/agent', nav: '에이전트', title: '에이전트 · CDP', description: 'Claude Code 가 MCP 로 붙는 법 · 도구 14 · 스킬 7 · MCP 가 도는 길 열두 걸음.' },
  { path: '/deploy', nav: '배치 · 설치', title: '배치 · 설치 · CDP', description: '서버형과 로컬형 · 설치 5단계 · 콘솔 · git 자격 · 미러 · 문서 내용은 PC 를 떠나지 않는다.' },
  { path: '/releases', nav: '판 이력', title: '판 이력 · CDP', description: 'v0.2 부터 지금까지 판마다 무엇이 바뀌었나.' },
]

export const NOT_FOUND = { title: '없는 주소 · CDP', description: '없는 주소입니다.' }
