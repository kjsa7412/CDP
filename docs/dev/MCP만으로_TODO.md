# MCP 만으로 TODO — 검토 `docs/design/CDP_MCP만으로_검토_v0.1.md`

| 단계 | 무엇 | 상태 |
|---|---|---|
| 0 | writer 의 `ctx update` 걷기 — cdp-save 보통 기록 · dpms CLAUDE.md | **완료** — f53a255 |
| 0 | ctx.cmd 한글 홈 결함 | **완료** — 9660022 |
| ① | 원천 연결(M2 · M3) · `source` 의 `follow` · `update` · `save` 의 「왜」 검사(M6) | |
| ② | `source` 의 `map` · `init` · `plan` · `apply` · `verify`(M7) | |
| ③ | 스킬 · 큐레이터 규칙 · 설명서의 ctx 줄 걷기 · 하네스 검사 | |

## ①

- [ ] 레포 설정 `source: { url, branch }` — 저장 · 콘솔 「레포 설정」 입력 · 연결 시험(`testRemote`)
- [ ] `data/sources/<레포>.git` bare clone · 도구마다 fetch(30초 · 실패면 마지막 것 + 경고) · SSH 배포 키 · PAT
- [ ] ctx-seed 의 `source()` 를 core 로 — 작업 트리 대신 git dir 을 받는다(CLI 는 로컬 레포 · 서버는 bare)
- [ ] `changedCoords` · follow · update 초안 짓기를 core 로 — CLI 는 껍데기(M8)
- [ ] MCP `source` 도구(curate 권한) · `op: follow | update` · `E_NO_SOURCE` · 출력 상한
- [ ] `save` — 「왜」 안내 줄 · 태그 `업데이트` 의 빈 `## 왜` 를 E_CHECK
- [ ] 시험 — 임시 원천 레포 · follow 누락/있음 · update 초안 · E_NO_SOURCE · viewer/writer 에 안 보임
- [ ] dpms_wiki 실측은 사람(서버 upgrade · 배포 키) — 같은 결과인지 이 PC 의 `ctx follow` 와 대조
