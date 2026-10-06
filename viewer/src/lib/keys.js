// 단축키 표 — **한 곳.** 도움말(`?`)과 관리 › 정보(서버)가 같은 표를 그린다.
// 두 자리가 각자 들면 하나만 고쳐진다(화면 · 권한 검토 v0.1 R3).
//
// 표기는 **그 PC 의 것으로** — `kbd('⌘K')` 가 Mac 이 아니면 `Ctrl+K`. 전에는 Windows 에서도 ⌘ · ⌥ · ⇧ 를 보여 줘서
// 사용자가 그 키를 찾았다(실서버 종합 시험 F17). 키 처리(App.jsx)는 원래 Ctrl · Meta 둘 다 받는다.

const platform = () => (typeof navigator === 'undefined' ? '' : navigator.userAgentData?.platform || navigator.platform || navigator.userAgent || '')
export const isMac = (p = platform()) => /Mac|iPhone|iPad/i.test(p)

export function kbd(s, mac = isMac()) {
  if (mac) return s
  return String(s).replace(/⌘/g, 'Ctrl+').replace(/⌥/g, 'Alt+').replace(/⇧/g, 'Shift+').replace(/⏎/g, 'Enter')
}

const RAW = [
  [['⌘K'], '검색 · 이동 — 자연어를 정본 좌표로 대조한다'],
  [['\\'], '왼쪽 전환 — 목록 ↔ 뻗어나가기'],
  [['⌘.'], '읽기 모드 — 왼쪽을 접는다'],
  [['⌘+', '⌘-', '⌘0'], '본문 글자 크기'],
  [['j', 'k'], '작업문서 목록 위아래'],
  [['x'], '읽음 표시 토글'],
  [['⇧C'], '요약 복사 — AI 세션에 붙여넣는 형식 그대로'],
  [['⌥←', '⌥→'], '이전 · 다음 문서 — 브라우저 뒤로 · 앞으로와 같다'],
  [['?'], '도움말'],
  [['esc'], '닫기 — 겹쳐 있으면 위에서부터 하나씩'],
]

export const KEYS = RAW.map(([keys, what]) => [keys.map((k) => kbd(k)), what])
