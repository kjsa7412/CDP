# verify — v1.0 모델을 한 자리에서 돈다

```bash
npm run build                     # 화면(ops/out/web) — 없으면 화면 항목(62 · 79 · 89 · 90 · 102)은 skip
node ops/verify/run.mjs           # 빠른 것만
node ops/verify/run.mjs --slow    # 60초 갱신까지
node ops/verify/run.mjs --port 7477   # 7377 이 쓰이고 있으면
```

번호는 [설계서 §10](../../docs/design/CDP_MCP_설계서_v1.0.md) 의 줄 번호(1~69)에서 시작했고, 70 이상은 판마다
더한 것이다. **남은 항목의 번호는 바꾸지 않는다** — 옛 `result.json` 과 견줄 수 있게. v1.0 에서 걷은 항목 ·
바꾼 항목 · 더한 항목의 표는 `run.mjs` 머리에 있다.

## 왜 있나

단계마다 실측하며 왔지만 **한 번에 돌린 적이 없었다.** 흩어진 확인은 나중에
회귀를 못 잡는다 — 4.3 을 고치다 2단계를 깨도 아무도 모른다.

자동으로 못 도는 것은 **이유를 적고 `–` 로 낸다.** 조용히 빠지면 "통과"와
"안 돌았다"가 구별되지 않는다.

## 무엇을 만들고 무엇을 지우나

`ops/out/verify/` 아래에 판을 새로 깐다(돌 때마다 지우고 다시). 표본 레포(`viewer/fixture` — 지식만 있다)를
git 레포로 만들어 `save` 가 실제로 커밋하게 하고, 서버를 7377 포트에 띄운다. kit 은 `agent/` 를
`ops/out/verify/kit/` 에 베껴 서버의 `--kit` 으로 준다 — 판 갈기(56 · 108)를 원본을 건드리지 않고 흉내 낸다.
**실제 레포 · 이 PC 의 설정은 건드리지 않는다** — 자식 프로세스에 `CDP_TOKEN` · `CDP_KIT` 같은 환경변수를
물려주지 않고, 설치기의 설치 목록은 `CDP_CONFIG_DIR` 로 판 안에 둔다.

| 서버 | 포트 | 무엇 |
|---|---|---|
| 본 서버 | 7377 | `alpha` · `beta`(표본 사본) · 뒤에 `delta`(빈 틀) · `gamma`(clone) · `blank1` · `rebuilt`(다시 세우기) |
| 마법사 | 7378 | 빈 명부 — `/setup`(80) |
| 옛 명부 | 7379 | v1.1 명부 · `--admin-from`(88) |
| 미러 | 7386 | `--mirror` · bare origin · `—` 규칙(91~97 · 110 · 112 · 114~116) |
| 개인 서버 | 7388 | `ctx serve --personal`(131) |

명부 — `kjsa`(writer → 81 부터 admin) · `qa` · `ghost`(viewer) · `cur`(writer · alpha · delta 의 큐레이터) ·
`wr`(writer) · 미러 쪽 `mw`(writer · 큐레이터 *) · `mv`(viewer) · `mx`(writer).

## 오래 걸리면

끝난 항목은 바로 stderr 에 한 줄씩 나온다(`[초] ✓ 번호 이름 · 결과`). 부하 걸린 기계에서는 git · node 를
띄울 때마다 수 초가 걸려 한 바퀴가 수십 분이 된다 — 그래도 항목 하나는 15분을 넘기지 않는다(넘기면 ✗).
91~97 이 줄줄이 ✗ 면 첫 ✗ 의 사유 · `ops/out/verify/mirror/server.stderr.log` · 기계 부하부터 본다.

## 보류

| 왜 | 줄 |
|---|---|
| 해당 없음 (0단계 결정) | 44 — claude.ai 커넥터는 공개 HTTPS 가 아니라 불가 |
| 시간이 걸린다 | 39 — `--slow` 로 돈다 |
| 브라우저로만 볼 수 있다 | 24 · 63 · 64 · 65 · 66 · 67 · 68 · 69 (67 의 메뉴 표는 `test/nav.test.mjs`) |
| 구조적으로 성립 | 50 — `/state` 는 `localStorage` 라 서버에 섞일 상태가 없다 |
| 화면 빌드가 없다 | 62 · 79 · 89 · 90 · 102 — `npm run build` 뒤에 돈다 |
