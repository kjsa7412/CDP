지식 레포다. 두 층이다.

  docs/   관리 문서 — 지금 어떤 상태인가. 팀이 하나로 관리하는 산출물
  work/   작업 기록 — 무슨 일이 있었나. append-only. 여러 좌표가 함께 있다

  _vocab.md     좌표 어휘 — 정본과 alias
  _managed.md   등록부 — 좌표 패턴 → 관리 문서 · 섹션

## 절차는 여기 없다

`.claude/skills/` 에 있다.

  cdp-work     작업 요청 하나를 ① 검토 → ② 맥락 주입 → ③ 요청수행 으로 처리
  cdp-load     좌표를 인자로 받아 현재 상태를 주입
  cdp-save     작업 기록 작성 + 관리 문서 섹션 갱신
  cdp-managed  밀린 섹션 따라잡기

**읽는 규칙·밀림 통보·좌표별 판정·pull 선행이 전부 그 skill 안에 있다.**
같은 것을 이 파일에도 적으면 한쪽만 고쳐지고, 그 순간 어느 쪽이 맞는지 알 수 없다.

## 기계가 보증하는 것

커밋 시 `.githooks/pre-commit` 이 `bin/ctx check` 를 돌린다.
미등재 좌표 · 등록부가 가리키는 앵커 없음 · 프론트매터 오류는 거부된다.

    git config core.hooksPath .githooks    ← clone 직후 한 번

훅은 clone 을 따라오지 않는다.
