# MCP 만으로 TODO — 검토 `docs/design/CDP_MCP만으로_검토_v0.1.md`

| 단계 | 무엇 | 상태 |
|---|---|---|
| 0 | writer 의 `ctx update` 걷기 — cdp-save 보통 기록 · dpms CLAUDE.md | **완료** — f53a255 |
| 0 | ctx.cmd 한글 홈 결함 | **완료** — 9660022 |
| ① | 원천 연결(M2 · M3) · `source` 의 `follow` · `update` · `save` 의 「왜」 검사(M6) | **완료** |
| ② | `source` 의 `map` · `init` · `plan` · `apply` · `verify`(M7) | |
| ③ | 스킬 · 큐레이터 규칙 · 설명서의 ctx 줄 걷기 · 하네스 검사 | |

## ①

- [x] 레포 설정 `source: { url, branch }` — 저장 · 콘솔 「레포 설정」 입력 · 연결 시험(`testRemote`)
    - 레포마다의 설정 파일이 없어서 `<data>/sources.json`(`{ repos: { <레포>: { url, branch } } }`)에 둔다. 콘솔에는 「레포 설정」 폼이 없어 지식 레포 표의 행 단추 「원천 연결」 · 창(주소 · 브랜치 · 비우면 끊기) — `POST /admin/repos/<레포>/source`(재인증 · auth.log · 적고 ls-remote 결과를 답한다 · 안 닿아도 적는다)
- [x] `data/sources/<레포>.git` bare clone · 도구마다 fetch(30초 · 실패면 마지막 것 + 경고) · SSH 배포 키 · PAT
    - 받은 커밋은 `refs/heads/source` 하나(브랜치 없으면 원천 HEAD). 같은 레포의 fetch 는 프로세스 안에서 줄 세운다. 한 번도 못 받았으면 E_SOURCE
- [x] ctx-seed 의 `source()` 를 core 로 — 작업 트리 대신 git dir 을 받는다(CLI 는 로컬 레포 · 서버는 bare)
    - `core/sourcerepo.js` `openSource({ top | gitDir, at })`. 지도는 작업 트리면 파일(옛 CLI 그대로), bare 면 그 커밋의 `cdp-sources.json`. git 은 동기 호출 그대로 — 큰 범위의 follow 는 서버 이벤트 루프를 몇 초 잡을 수 있다(dpms 실측에서 보고 비동기로 바꿀지 정한다)
- [x] `changedCoords` · follow · update 초안 짓기를 core 로 — CLI 는 껍데기(M8)
- [x] MCP `source` 도구(curate 권한) · `op: follow | update` · `E_NO_SOURCE` · 출력 상한
    - follow 의 기본 since 는 `_seed.json` 의 **`from` 의 @sha** — `at` 은 세운 날(YYYY-MM-DD)이라 sha 가 아니다(검토 M5 의 「at(세운 sha)」 는 from 을 뜻한다). follow 커밋 300 상한(앞을 자르고 `truncated`) · update 의 diff 80줄 · 바뀐 작업문서 원문 200줄 · 그 위에 guardSize. 명함 · CLAUDE-큐레이터 · 사이트 도구 14 · 설명서 · 하네스 118
- [x] `save` — 「왜」 안내 줄 · 태그 `업데이트` 의 빈 `## 왜` 를 E_CHECK
- [x] 시험 — 임시 원천 레포 · follow 누락/있음 · update 초안 · E_NO_SOURCE · viewer/writer 에 안 보임 — `test/source-tool.test.mjs` · fetch 실패면 마지막 것 + 경고까지
- [ ] dpms_wiki 실측은 사람(서버 upgrade · 배포 키) — 같은 결과인지 이 PC 의 `ctx follow` 와 대조
