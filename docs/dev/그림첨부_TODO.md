# 그림 · 첨부 TODO

> 운영자 보고(2026-09-30) — ① 관리 화면에서 본문 그림이 안 보인다 · ② 첨부를 올릴 길이 없어 지식 레포를 로컬로
> 받아 push 하고 「origin 과 맞추기」 로 들였다 — 자동으로 처리하는 방법. 검토 · 결정은
> `docs/design/CDP_그림첨부_검토_v0.1.md`(G1~G6 · A1~A9). 결정은 전부 권장안. 커밋까지만 — push · 태그 · 실서버 upgrade 는 사람이.

---

## 지금 어디까지 됐나

| | 상태 |
|---|---|
| 검토 · 결정 | **완료** |
| ① 본문 그림 (G1~G6) | **완료** — 로컬 뷰어 4가지 적는 법 중 3 보임 · 없는 것 1 은 「그림을 찾을 수 없음 · docs/images/없음.png」 · 서버 모드(쿠키) 480×200 · 다크 |
| ② 올리기 API (A2~A4) | **완료** — 실제 `curl` 로 200(ref) · svg 415 · 토큰 없음 401 · 5 MB 200 · 11 MB 413(`Expect: 100-continue`) · 트리 그대로 |
| ③ save `assets[]` (A1 · A5~A7) | **완료** — MCP `save` 한 번 → 커밋 하나(작업 기록 · 섹션 · PNG · INDEX) · 틀린 경로 경고 · `test/save-assets.test.mjs` 8 |
| ④ 스킬 · 명함 · 설명서 (A8 · A9) | **완료** |
| ⑤ 검증 · 판 | **완료** — 테스트 191 / 191 · 하네스 ✓ 96 ✗ 1(110 · 이 변경과 무관 — 아래 9 · 뒤에 고쳐 ✓ 97 ✗ 0) · 112 ✓ · 빌드 ✓ · 판 v0.20.0 |

### 시작 상태 (v0.19.3 · 699595a)

```
본문 그림     ![](../work/assets/…png) → <img src="../work/assets/%EC…"> — 화면 주소 기준으로 풀려 4/4 깨짐(파일은 있다)
첨부 목록     /api/…/file 로 부른다 — 여기서만 보였다
본문 링크     [원본](x.pdf) 도 「문서 열기」 로 가로채 x.pdf 문서를 찾는다
모드 B 첨부   길 없음 — 사람이 clone · 커밋 · push · 콘솔 「origin 과 맞추기」
```

---

## ① 본문 그림 — G1~G6

**바뀌는 파일** — `viewer/src/lib/repopath.js`(새) · `viewer/src/lib/markdown.js` · `viewer/src/components/DocView.jsx` · `viewer/src/site/Manual.jsx` · `viewer/src/styles/doc.css` · `viewer/server/adapter/read-api.js`

- [x] `repoPath(docPath, href)` — 외부(`http:` · `data:` · `mailto:`) · 앵커면 null, `/x` 는 루트, `docs/` · `work/` · `knowledge/` 로 시작하면 루트, 그 밖은 문서 폴더 기준 + `..` 정리, 퍼센트 인코딩을 푼다. 레포 밖으로 나가면 `{ outside: true }`
- [x] 렌더러 — 이미지 규칙: 상대 `src` 는 `data-src`, 절대(`http(s):` · `data:`)는 그대로. `loading="lazy"`. DOMPurify `ADD_ATTR` 에 `data-src`
- [x] `DocView` — 렌더 뒤 `img[data-src]` 를 `api.fileUrl(repoPath(doc.path, …))` 로. 실패하면 「그림을 찾을 수 없음 · 경로」 상자(`.doc-img-missing`), 레포 밖이면 「레포 밖을 가리키는 그림」. 그림 클릭 → 새 탭 원본
- [x] `DocView` 링크 — `.md` 가 아닌 상대 링크는 파일 API 로 새 탭. `.md` 는 지금처럼 문서 열기
- [x] `Attachment` 가 같은 `repoPath` 를 쓴다
- [x] `Manual` — `img[data-src]` 를 GitHub raw 로
- [x] 파일 API — `.svg` 응답에 `content-security-policy: sandbox`
- [x] 브라우저 실측 — 로컬 뷰어(4가지 적는 법) · 서버 모드(쿠키) · 다크 테마의 상자

## ② 올리기 API — A2~A4

**바뀌는 파일** — `core/assets.js`(새 — 종류 판별 · 보관 · 꺼내기 · 청소) · `viewer/bin/ctx-mcp-serve.mjs`(`POST /api/<repo>/assets` · `checkContinue` 상한을 경로별로)

- [x] `sniff(buf)` — png · jpg · gif · webp · pdf 의 첫 바이트. 모르면 null
- [x] `stage(dir, buf)` → `{ ref, size, type }` — `sha256` 이름으로 쓰고 옆에 `.json`(type · size · at). 이미 있으면 시각만 갱신
- [x] `take(dir, ref)` → `{ buf, type }` 또는 E_INPUT(없음 · 만료) — 해시를 다시 대조한다
- [x] `sweep(dir, now)` — 24시간 넘은 것 지우기. 올릴 때마다 한 번
- [x] 라우트 — writer 이상(`a.write`) · 권한 밖 레포는 404 · 10 MB 넘으면 413(몸통 받기 전 · `Expect: 100-continue` 도) · 모르는 종류 415 · `auth.log` 는 안 쓴다(쓰기는 save 가 남긴다), `serve.log` 한 줄
- [x] 보관 자리 — `<data>/staging/`. `--data` 가 없으면 `os.tmpdir()/cdp-staging`

## ③ save `assets[]` — A1 · A5~A7

**바뀌는 파일** — `core/save.js` · `viewer/bin/ctx-mcp.mjs`(zod · 명함 · `buildServer` 에 `takeAsset`) · `viewer/bin/ctx-mcp-serve.mjs`(saver 가 staging 을 넘긴다)

- [x] 스키마 — `assets: [{ ref, name }]` · 20개 · 이름 규칙 · 이름 겹침 거절
- [x] `Snap.writeBin` — 새 파일만(있으면 E_EXISTS). 되돌리기는 새 파일 지우기(기존 `restore` 그대로)
- [x] 7단계 옆에서 쓴다 — `take` → 확장자 ↔ 종류 대조 → 합 30 MB → `work/assets/<id>/<name>`
- [x] 경고 A7 — 쓴 본문의 그림 경로 중 레포에 없는 것 · 어느 본문도 안 가리키는 첨부
- [x] 응답 `assets: [{ path, size }]`
- [x] `test/save-assets.test.mjs` — 한 커밋 · 검사 실패면 첨부도 되돌림 · 이름 규칙 · 종류 어긋남 · 모르는 ref · 경고 둘
- [x] `test/assets.test.mjs` — sniff · stage · take · sweep

## ④ 스킬 · 명함 · 설명서 — A8 · A9

- [x] `agent/skills/cdp-save/SKILL.md` — 「그림 · 첨부」 절(모드 A · B)
- [x] `cdp-edit` · `cdp-import` — 그 절을 가리킨다. `cdp-import` 의 모드 B 에서 원문의 그림을 올리는 순서
- [x] `save` 명함 한 줄
- [x] `manual/사용자_설명서.md` · `manual/관리자_설명서.md` — 그림 넣는 법 · `staging` 자리
- [x] 설계서 `CDP_MCP_설계서_v1.0.md` §4.5 save 입력에 `assets`

## ⑤ 검증 · 판

- [x] `node --test test/*.test.mjs`
- [x] 하네스 112 — curl 과 같은 요청(Bearer · 바이트) → ref → save `assets` → 커밋 하나 · 트리 깨끗 · `/api/<repo>/file` 이 그 그림 · viewer 는 403 · 11 MB 는 413
- [x] `npm run build` · 브라우저 실측(로컬 · 서버)
- [x] CHANGELOG · 판 v0.20.0

---

## 나온 것

| | 무엇 | 왜 그렇게 |
|---|---|---|
| 1 | 경로 규칙을 `core/repopath.js` 하나로 — 화면(`DocView` 본문 · 첨부 목록)과 서버(`save` 경고)가 같이 쓴다. 화면이 `core/` 를 import 하는 첫 자리 | 둘이 갈라지면 「save 는 조용했는데 화면에서 깨진다」 가 다시 생긴다. Node · 브라우저 어느 쪽에도 기대지 않는 순수 함수라 번들에 그대로 든다 |
| 2 | 렌더러는 상대 그림을 `data-src` 로 · `loading="lazy"` | 렌더 캐시는 원문이 키라 문서 경로를 모른다(G2). 관리 문서 하나에 그림이 수십 장이어도 보이는 것만 부른다 |
| 3 | `.md` 가 아닌 본문 링크는 파일로 새 탭 · 스킴 있는 링크(`mailto:` 등)는 가로채지 않는다 · 링크의 `#절` 은 떼고 문서를 찾는다 | 전에는 `x.pdf` · `mailto:` 까지 「문서 열기」 로 가서 없는 문서를 찾았다 |
| 4 | 첨부 꺼내기(ref · 종류 · 상한)는 **파일을 만지기 전**(3.8), 쓰기는 섹션 뒤(6.5) | 거절이 되돌리기에 기대지 않게. 검사 실패(8)는 `Snap` 이 첨부와 빈 폴더까지 지운다(테스트) |
| 5 | 올린 첨부는 작업 기록 프론트매터 `attachments` 에도 싣는다 | 화면의 「첨부」 목록이 이것을 읽는다 — 본문에 링크를 빠뜨려도 기록에서 보인다 |
| 6 | 같은 바이트를 이름 둘로 넣는 것은 된다 · 대소문자만 다른 이름은 겹침 | 내용이 같아도 자리가 다르다. Windows · macOS 에서는 한 파일이다 |
| 7 | 올리기 로그는 `serve.log` 한 줄(ref 앞 12자 · 크기)만 · `auth.log` 는 안 쓴다 | 레포를 바꾸는 것은 save 이고 그것이 이미 남는다 |
| 8 | 경고 문구의 「본문에만 있는 좌표」 같은 기존 경고는 그대로 | 이번 판의 범위 밖 |
| 9 | 하네스 110 ✗ — `viewer/fixture/_managed.md` 에 `term:*` 행이 09-14(`87b22cf`)부터 있어 110 의 `managed: [{ pattern: 'term:*' }]` 가 설계대로 `E_CONFLICT` 가 난다. 이 변경과 무관(첨부 · 그림 경로는 등록부를 만지지 않는다) | 따로 고쳤다 — 110 을 fixture 에 없는 타입 `gloss:*` 로(fixture 의 `term` 어휘 · 기록을 건드리지 않게). 하네스 ✓ 97 ✗ 0 |
