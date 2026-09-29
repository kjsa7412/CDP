# 좌표 누락 TODO — 지식 문서 편입 때 `touches: []` 가 조용히 통과한 것

> 운영자 요청(2026-09-29) — 「CDP 에이전트 개선 요청 — 지식 문서 편입 때 좌표 누락」 의 A~F 를 고친다. **권장안으로 진행.**
> 사건: `cdp-import` 모드 B 로 `PLC_CIMON_SCADA_구조_및_데이터흐름.md` 를 들였더니 dpms_wiki 커밋 `b5a1fc6` ·
> 기록 `2026-0917-PLC-CIMON-SCADA-구조` 가 **`touches: []`** 로 들어갔다. 문서가 PLC · SCADA · CimonD · CimonX 를
> 정의하는데 어느 좌표로도 닿지 않고, `save` 검사는 경고 없이 통과했다.
> 커밋까지만 — push · 태그 · 실서버 갱신 · dpms_wiki 의 내용 수정(E · 후속 조치)은 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| A `cdp-import` ③ 좌표 판정 | **완료** — ③-1 성격 · ③-2 판정표(정의 한 줄) · ③-3 정규화(이름 규약) · ③-4 답 읽는 법(`미등재` · `registry: null`) · ③-5 0개면 멈춤 · ③-6 승인 · 예시 둘(도메인 지식 문서) |
| B 확인 게이트 강제 | **완료** — `cdp-import` ③-6 · `cdp-save` ⑤B-0 이 번호 붙은 필수 단계 · 맨 위에 금지 규칙 · 모드 표에 「승인」 행 · `save` 명함에도 같은 문장 |
| C 서버 `save` 검사 | **완료** — 빈 `touches` 는 `work.touchesEmpty`(사유) 없이 `E_INPUT` · 사유가 있으면 커밋하되 경고 |
| D `save` 스키마 `source` | **완료** — `work.source` · 프론트매터 · 파서 · `work` 도구 · 일괄 편입 · 뷰어 한 줄 |
| E 레포 어휘 규약 (dpms_wiki) | **안(案)만** — 아래 §E 블록을 dpms_wiki `_vocab.md` 에 붙이는 것은 사람이(레포가 이 PC 에 없다) |
| F 규칙 둘 | **정했다** — F1 정정 기록 · F2 편입이면 시각 경고 끔 |
| 후속 — PLC 기록 좌표 보완 | **사람 · 에이전트가** — 실서버 upgrade 뒤, §E 규약을 붙인 다음(아래 §4) |
| 검증 | 테스트 117 / 117 (`node --test test/*.test.mjs` — 새 둘 포함) · 빌드 ✓ · 뷰어 API 가 `source` · `touchesEmpty` 를 싣는 것 확인(화면 그림은 못 봤다 — 미리보기 창이 그려지지 않았다) · 하네스 `node ops/verify/run.mjs` ✓ 92 · ✗ 0 · – 16 |

---

## 0. 결정 (권장안)

| | 결정 | 왜 |
|---|---|---|
| K1 | **문서 성격을 먼저 가른다** — 결정 문서(정한 것) · 정의 · 지식 문서(정의하거나 처음 도입한 것). 판정표에 「정의했다 · 처음 도입했다 → O」 | 결정 문서의 기준만 대면 지식 문서는 모든 대상이 「설명」 으로 떨어져 0개가 된다(원인 1) |
| K2 | `미등재` = **등재 후보** · `registry: null` = **`touches` 가 유일한 길** 을 스킬(표의 「틀린 해석」 칸)과 도구 명함(`match` · `where`) 양쪽에 적는다 | 원인 2 · 3 — 모델은 명함만 보고 도구를 읽는다. 스킬에만 적으면 스킬을 안 연 세션이 같은 해석을 한다 |
| K3 | 승인 게이트는 **모드 A · B 둘 다** 필수 — 「승인 없이 기록하지 않는다(모드 B 는 `save` 를 부르지 않는다)」 를 절차 맨 위 금지 규칙으로 | 원인 4 — 「메모리에 준비해 사람에게 보인다」 가 권고로 읽혔다. 모드 A 도 훅은 좌표 누락을 모르므로 같은 게이트가 필요하다 |
| K4 | 서버는 빈 `touches` 를 **사유 없이 거절한다**(`E_INPUT { field: 'work.touches' }`). 사유는 `work.touchesEmpty`(400자) — 받으면 커밋하고 경고 한 줄 · 프론트매터에 `touchesEmpty:` 로 남긴다 | 원인 5. 요청의 「경고」 만으로는 모델이 경고를 읽고 넘어간다 — 이번에도 검사는 돌았다. 0개가 정상인 작업(일정만 정한 것)은 사유 한 줄로 통과한다 |
| K5 | **모드 A 의 `ctx check` 는 바꾸지 않는다** | 이미 있는 `touches: []` 기록을 오류 · 경고로 만들면 매번 나오는 경고가 된다(check.js 머리 주석 — 「0개가 정상」). 새로 쓰는 쪽(save · 스킬)에서 막는다 |
| K6 | `touches` 와 `touchesEmpty` 를 같이 보내면 `E_INPUT` | 둘 중 하나다. 같이 오면 어느 쪽이 참인지 서버가 고를 수 없다 |
| K7 | `work.source`(선택 · 400자) — 프론트매터 `author` 다음 줄. 파서 · `work` 도구 · `ctx import`(일괄 편입) · 뷰어가 아는 필드로 | D. 전에는 스키마(`strict`)가 거절해 모드 B 에서 `cdp-import` ④ 의 필수 필드를 쓸 수 없었다. 뷰어에 「모르는 필드」 로 뜨지 않게 파서 목록에도 |
| K8 | 프론트매터 스칼라(title · author · source · touchesEmpty · tags)는 YAML 이 깨지는 글자가 있으면 인용 · 빈 좌표는 `touches: []` | 정정 기록의 제목이 `[정정] …` 으로 시작한다(F1). 전에는 `save` 가 title 을 그대로 적어 배열로 읽힐 자리였다. 빈 `touches:` 는 YAML 로 null 이다 |
| F1 | **좌표 누락도 오기재다 → 정정 기록.** id `<원 id>-좌표정정` · date 는 **원 기록의 date** · `touches` 는 빠졌던 좌표만 · `supersedes: <원 id>` · 본문은 원문을 다시 싣지 않고 판정표와 원 기록 링크 | 기존 기록을 고치는 길(touches 보완 경로)은 만들지 않는다 — 「기존 `work/*.md` 는 수정 · 삭제하지 않는다」(설계서 §4.5)를 깨면 기록이 사건이 아니게 된다. date 를 오늘로 하면 그 사이 같은 좌표 기록과 선후가 뒤집힌다. `supersedes` 는 참조라 원 기록은 검색에서 안 내려간다 |
| F2 | `work.source` 가 있으면(편입) **시각 없는 date 경고를 내지 않는다** | 밖에서 온 문서는 시각을 모르는 것이 보통이고, 날짜는 원문의 것이라 고칠 수도 없다. 매번 나오는 경고는 아무것도 알리지 않는다. 세션 작업(`source` 없음)은 그대로 경고 |

---

## 1. 서버 — `save` (C · D · F2)

- [x] `core/save.js` — 스키마(2단계)에 `source` · `touchesEmpty` 형식 검사 · 3.7 좌표 0개(존재 · 트리 검사 **뒤** — `E_EXISTS` · `E_GIT dirty` 가 먼저 답하게 · 하네스 95 가 잡았다) · 시각 경고는 `source` 없을 때만 · `renderWork` 가 `source` · `touches: []` · `touchesEmpty` · 인용
- [x] `viewer/bin/ctx-mcp.mjs` — zod `work` 에 `touchesEmpty` · `source` · 명함 셋(`save` 에 승인 · touchesEmpty · source, `match` 에 등재 후보, `where` 에 `registry: null`)
- [x] `core/frontmatter.js` — `source` · `touchesEmpty` 를 아는 필드로(값도 싣는다) · `core/tools.js` `work` 도구의 frontmatter 에 둘
- [x] `core/importdir.js` — `source` 를 태그로 흩지 않고 필드로 옮긴다
- [x] `core/store.js` · `DocView.jsx` · `doc.css` — 기록 화면에 「원문 출처 — …」 · 「좌표가 없다 — … 사유」 한 줄
- [x] `ops/verify/run.mjs` 95 — 좌표 없는 save 둘에 `touchesEmpty`
- [x] `test/save.test.mjs` — 둘: 빈 touches 거절 · 사유 있으면 커밋 + 경고 + 프론트매터 / source · 시각 경고 · 인용된 제목이 파싱된다
- [x] 설계서 §2.2 표(`match` · `where`) · §4.5 정정 블록

## 2. 스킬 (A · B · F1)

- [x] `cdp-import` — 절차 머리에 ③-6 · 금지 규칙 · 모드 표 「승인」 행 · ③ 을 ③-1~③-6 으로 · ④ 에 `source`(모드 B) · `touchesEmpty` · 「이미 들인 기록의 좌표가 빠졌으면 — 정정 기록」 · 예시 둘(도메인 지식 문서 — 틀린 판정과 맞는 판정)
- [x] `cdp-save` — 모드 B 흐름에 ⑤B-0 · 금지 규칙 · 모드 표 「승인」 행 · ② 에 「정의했다 → O」 · 0개면 멈추고 사유 · 답 읽는 법 · 판정표를 넣은 것 · 뺀 것 · 이슈로 · supersedes 에 「좌표 누락도 오기재」 · ⑤B-0 절 · `save` 예시에 두 필드 · `E_INPUT work.touches`
- [x] `agent/TEMPLATE-work.md` — `source` · `touchesEmpty` 주석 줄

## E. dpms_wiki 어휘 규약 — **사람이 붙인다**

dpms_wiki 는 서버에만 있다(이 PC 에 clone 없음). 아래를 dpms_wiki `_vocab.md` 의 `## term` 바로 위(또는 머리 설명 끝)에
붙인다. `_vocab.md` 는 `save` 로 고치지 않으므로(어휘 줄 추가만 한다) 서버 트리에서 사람이 커밋한다 — 커밋 전에 트리가 깨끗해야 `save` 가 계속 돈다.

```markdown
### `term:` 이름 짓는 법

`term:` 은 등록부에 없다 — 관리 문서가 없고 **작업 기록의 `touches` 가 유일한 길**이다.
그래서 이름이 흔들리면 같은 용어가 두 좌표로 갈라지고, 그 순간 기록 절반이 안 걸린다.

| 규칙 | 예 |
|---|---|
| **공백 없이 붙인다.** 원문의 띄어 쓴 표기는 `aliases` 에 | `term:PLC프로그램` ← "PLC 프로그램" |
| 영문 약어 · 제품명은 **원문의 대소문자 그대로** | `term:PLC` · `term:SCADA` · `term:CimonD` · `term:CimonX` |
| 영문 · 한글 혼용은 그대로 둔다 — 현장에서 부르는 말이 정본이다 | `term:SCADA태그` · `term:PLC디바이스주소` |
| 기호는 뺀다(`/` `.` `·` 공백) | `term:IO드라이버` ← "I/O 드라이버" · "IO 드라이버" |
| 원래 밑줄이 든 **식별자**(프로그램 · 파일 · 설정 이름)는 그대로 | `term:SCADA_VIEWER` |
| 뗀 표기 · 한글 풀이 · 옛 이름은 전부 `aliases` | `aliases: I/O드라이버, IO 드라이버, 입출력 드라이버` |

새 이름이 기존 좌표와 겹치는 것 같으면 `match` 로 먼저 대조하고, 없으면 등재한다.
```

- [ ] (사람) 위 블록을 dpms_wiki `_vocab.md` 에 붙이고 커밋 · push
- [ ] (사람) 서식 예시 좌표 18건 — `save` 경고 「서식 예시 좌표가 남아 있다」. `_vocab.md` 의 `example:` 줄과 **문서의 예시 섹션을 같이** 지운다(한쪽만 지우면 `where` 가 「섹션이 없음」). 시작 절차는 `_vocab.md` 「값이 예시로 채워져 있다 — 지우고 시작한다」

## 4. 후속 — `2026-0917-PLC-CIMON-SCADA-구조` 좌표 보완 (실서버 upgrade · §E 뒤)

F1 대로 정정 기록 하나. 에이전트가 `cdp-import` 를 새 판으로 돌리면 ③-6 에서 판정표를 보이고 승인받은 뒤 이 모양으로 `save` 한다.

```
save({
  repo: "dpms_wiki",
  work: {
    id: "2026-0917-PLC-CIMON-SCADA-구조-좌표정정",
    title: "[정정] PLC · CIMON · SCADA 구조 — 좌표 보완",      // 서버가 인용한다
    date: "<원 기록의 date 그대로>",
    source: "<원 기록의 source 가 있으면 같은 값>",
    touches: [ "term:PLC", "term:PLC프로그램", "term:PLC디바이스주소", "term:SCADA", "term:SCADA태그",
               "term:CimonD", "term:CimonX", "term:SCADA_VIEWER", "term:IO드라이버" ],   // §E 규약 · 판정표 승인 뒤 확정
    supersedes: "2026-0917-PLC-CIMON-SCADA-구조",
    body: "좌표 누락 정정 — 원 기록은 정의 · 지식 문서인데 결정 문서 기준으로 판정해 touches 가 0개였다.\n\n(③-6 판정표)\n\n원문: [2026-0917-PLC-CIMON-SCADA-구조](2026-0917-PLC-CIMON-SCADA-구조.md)"
  },
  vocab: [ { coord: "term:PLC", label: "…", aliases: [ … ] }, … ]    // 아홉 · 원문의 정의에서 label · aliases
})
```

- [ ] (사람) 실서버 upgrade — 새 `save`(touchesEmpty · source) · 새 스킬 kit. 작업 레포의 스킬은 `sync` 의 `kit.hash` 가 다르다고 알린다
- [ ] (에이전트 · 사람 승인) 위 정정 기록 — 이름은 §E 를 붙인 뒤의 규약으로 최종

---

## 나온 것

| | 무엇 | 어디 |
|---|---|---|
| 1 | 빈 `touches` 는 사유 없이 `E_INPUT` · 사유 있으면 경고 + `touchesEmpty:` | `core/save.js` 3.7 |
| 2 | `work.source` · `work.touchesEmpty` 스키마 | `viewer/bin/ctx-mcp.mjs` |
| 3 | 편입이면 시각 경고 끔 | `core/save.js` |
| 4 | 프론트매터 인용 · `touches: []` | `core/save.js` `renderWork` · `yamlStr` |
| 5 | 명함 셋 — 승인 · 등재 후보 · `registry: null` | `viewer/bin/ctx-mcp.mjs` · 설계서 §2.2 |
| 6 | 파서 · work 도구 · 일괄 편입 · 뷰어가 `source` 를 안다 | `core/frontmatter.js` · `core/tools.js` · `core/importdir.js` · `core/store.js` · `DocView.jsx` |
| 7 | `cdp-import` ③-1~③-6 · 정정 기록 · 예시 둘 | `agent/skills/cdp-import/SKILL.md` |
| 8 | `cdp-save` ⑤B-0 · ② 보강 | `agent/skills/cdp-save/SKILL.md` |
| 9 | 템플릿 두 줄 | `agent/TEMPLATE-work.md` |

**남은 것(사람)** — push · 태그 · 실서버 upgrade · §E 블록과 예시 18건 정리 · §4 정정 기록.
**`ctx check`(모드 A 훅)는 좌표 누락을 여전히 모른다** — K5. 모드 A 의 보호는 스킬의 승인 게이트뿐이다.
