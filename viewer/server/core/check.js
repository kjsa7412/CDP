// 내장 검증 — 설계서 §12.
//
// 원칙은 실제 bin/ctx 에 위임하는 것이고, 이것은 폴백이다. 그래서 결과에
// source: 'builtin' 을 실어 보내고 화면이 그것을 표시한다. 내장 검사를
// 정본처럼 보여주면 뷰어와 훅이 어긋났을 때 사용자가 훅을 의심하지 않는다.
//
// 뷰어만 할 수 있는 검사와 ctx check 만 할 수 있는 검사(조직이 추가한 규칙)가
// 서로 달라 둘은 대체 관계가 아니라 보완 관계다.
//
// **error 는 커밋을 막을 근거다.** 그 등급을 함부로 쓰지 않는다 — 막히는 것이
// 잦으면 사람들이 훅을 끄고, 그 순간 보증 층이 사라진다.

// touches 는 넣지 않는다 — **좌표 0개가 정상이기 때문이다** (수행 v1.0 §5.3).
// "일정을 정했을 뿐 어떤 대상도 바꾸지 않았다" 는 작업이 실제로 있고, 그것을
// 오류로 막으면 사람들이 억지로 좌표를 붙인다. 억지 좌표는 없는 좌표보다 나쁘다.
// 아젠다 상태 — 지식공유문서에 있을 수 없는 값.
//
// `미결` 과 `제안` 은 같은 것이다: **결정이 안 났다.** 지식공유문서는 작업의
// **완료**에서 발생하므로 그 상태로는 여기 올 수 없다. 갈 곳은 이슈 대장이다.
const AGENDA = new Set(['미결', '제안'])

// `status` 는 필수에 넣지 않는다 — **`확정` 은 값이 아니다.**
// 30건 중 28건이 `확정` 이면 그 칸은 아무것도 구별하지 않는다. 지식공유문서는
// 작업의 완료에서 발생하는 문서이므로 완료가 기본값이고, 기본값은 적지 않는다.
// 뜻이 있는 값은 `진행중`(점유) 하나뿐이고 그것은 적고 싶을 때만 적는다.
const REQUIRED = ['id', 'title', 'date', 'author']

export function runBuiltinCheck({ docs, vocab, validity, indexInfo, managedIndex, sections, gitStatus }) {
  const findings = []
  const push = (sev, kind, label, items) => {
    if (items.length) findings.push({ sev, kind, label, items })
  }

  const units = docs.filter((d) => d.layer === 'work' && d.hasFrontmatter)

  // 필수 필드 누락
  const missing = []
  for (const d of units) {
    const gaps = REQUIRED.filter((f) => {
      const v = d[f]
      return v == null || v === '' || (Array.isArray(v) && v.length === 0)
    })
    if (gaps.length) missing.push({ id: d.id, path: d.path, detail: gaps.join(', ') })
  }
  push('error', 'missing-field', '필수 필드 누락', missing)

  // touches 키 자체가 없는 것과 `touches: []` 는 다르다. 후자는 "좌표가 없음을
  // 확인했다" 는 선언이고, 전자는 그냥 안 적은 것이다.
  push(
    'info',
    'no-touches-key',
    'touches 키가 없음 — 좌표 0개라면 `touches: []` 로 적는다',
    units.filter((d) => !d.hasTouchesKey).map((d) => ({ id: d.id, path: d.path }))
  )

  // 프론트매터 파싱 오류
  push(
    'error',
    'frontmatter',
    '프론트매터 오류',
    units.filter((d) => d.errors.length).map((d) => ({ id: d.id, path: d.path, detail: d.errors.join(' / ') }))
  )

  // _vocab.md 미등재 좌표 — 프로토콜 §9.6 조용한 실패
  const unregistered = []
  if (vocab.coords.size) {
    for (const d of units) {
      for (const c of d.touches) {
        if (vocab.coords.has(c)) continue
        const hint = suggestCoord(vocab, c)
        unregistered.push({ id: d.id, path: d.path, coord: c, suggest: hint })
      }
    }
  }
  push('error', 'unregistered-coord', '_vocab.md 미등재 좌표', unregistered)

  // supersedes 대상 없음
  push(
    'error',
    'broken-supersedes',
    'supersedes 대상 문서 없음',
    validity.missingTargets.map((m) => ({ id: m.doc, detail: `→ ${m.target} (존재하지 않음)` }))
  )

  // 순환
  push(
    'error',
    'cycle',
    'supersedes 순환 참조',
    validity.cycles.map((id) => ({ id, detail: '체인이 자기 자신으로 돌아온다' }))
  )

  // id ≠ 파일명
  push(
    'error',
    'id-mismatch',
    'id 와 파일명 불일치',
    units.filter((d) => d.id !== d.fileId).map((d) => ({ id: d.id, path: d.path, detail: `파일명은 ${d.fileId}` }))
  )

  // deprecated 좌표 사용
  const deprecatedUse = []
  for (const d of units) {
    for (const c of d.touches) {
      const e = vocab.coords.get(c)
      if (e?.deprecated) deprecatedUse.push({ id: d.id, coord: c, suggest: e.supersededBy, detail: e.deprecated })
    }
  }
  push('warn', 'deprecated-coord', 'deprecated 좌표 사용', deprecatedUse)

  // **`미결` · `제안` 은 이관 대상이다** (정정_판정모델_v2 §2).
  //
  // 둘은 같은 것이다 — **아직 결정이 안 났다.** 이름만 다르다.
  // 등급을 나누거나 한쪽만 잡으면 다른 쪽으로 흘러 들어간다.
  //
  // 지식공유문서는 **작업의 완료에서 발생하는 문서**다. 결정을 기다리는
  // 것은 아젠다이고, 아젠다는 이슈관리·TODO 같은 스케줄 문서가 다룬다.
  // 둘을 같은 파일에 섮으면 — 불변인 사건과 가변인 상태가 섮이면 —
  // 지식 레포가 할 일 목록 노릇을 하기 시작하고 그 순간 둘 다 안 맞는다.
  push(
    'error',
    'agenda-status',
    'status: 미결·제안 — 지식공유문서가 아니라 아젠다입니다',
    units
      .filter((d) => AGENDA.has(d.status))
      .map((d) => ({ id: d.id, path: d.path, detail: `status: ${d.status} — docs/위험및이슈관리대장.md 로 옮기세요` }))
  )

  // INDEX.md 불일치 — 프로토콜 §10.5 "어긋난 인덱스는 없는 것보다 나쁘다"
  if (indexInfo?.exists && indexInfo.rows !== units.length) {
    findings.push({
      sev: 'warn',
      kind: 'index-stale',
      label: 'INDEX.md 불일치',
      items: [
        {
          detail: `집계 ${units.length}건 / INDEX.md ${indexInfo.rows}행 — ctx index 실행 필요`,
          missing: indexInfo.missing || [],
        },
      ],
    })
  }

  // 본문 형식은 검사하지 않는다 — 자유 형식이다 (수행 v1.0 §13).
  //
  // v0.2 는 4섹션의 '왜'가 비었는지 봤다. 그 강제가 없어졌으므로 대신 **길이**로
  // 어림하는데, 이건 신호가 약하다 — 227자에 왜가 있고 126자에 없는 문서가 있다.
  // 그래서 warn 이 아니라 info 로 낸다. 커밋을 막을 근거가 못 된다.
  push(
    'info',
    'thin-body',
    '본문이 얇음 — 왜가 없을 수 있다 (길이로 어림한 것이라 오탐이 있다)',
    units.filter((d) => d.bodyThin).map((d) => ({ id: d.id, path: d.path, chars: d.bodyChars }))
  )

  // 등록부가 가리키는데 없는 것 — 앵커 없음. **커밋을 막는다.**
  //
  // 등록부에 `screen:SE*` → `화면정의서_연구.md ## {값}` 이 있는데 그 문서에
  // `## SEB020` 이 없으면, 그 좌표의 현재 상태를 적을 자리가 없다는 뜻이다.
  // 조용히 지나가면 cdp-load 가 빈손으로 돌아오고 읽는 쪽은 그것을
  // "정의되지 않았다"로 읽는다 — 프로토콜 §9.6 조용한 실패다.
  if (managedIndex) {
    const coords = [...new Set(units.flatMap((d) => d.touches))]
    const dangling = managedIndex.danglingFor(coords)
    push(
      'error',
      'dangling-anchor',
      '등록부가 가리키는 섹션이 없음',
      dangling.map((x) => ({
        coord: x.coord,
        detail: x.reason === 'doc' ? `${x.doc} 문서가 없음` : `${x.doc} 에 \`${x.anchor}\` 섹션이 없음`,
      }))
    )
  }

  // 등록부의 applied 가 없는 작업 기록을 가리킨다 — 이름을 잘못 적었거나
  // 그 기록이 지워졌다. 어느 쪽이든 그 섹션을 판정할 수 없다.
  if (sections) {
    push(
      'error',
      'orphan-applied',
      'applied 가 없는 작업 기록을 가리킴',
      sections.filter((r) => r.state === 'orphan').map((r) => ({ coord: r.coord, detail: `${r.doc} → ${r.applied}` }))
    )
    // **파생 누락은 커밋을 막는다** (정정_판정모델_v2 §1).
    //
    // 수행 v1.0 §6.2 는 이것을 warn 으로 뒀고 이유 셋을 댔다 -- 파생이 넓다 ·
    // 남의 확인이 필요하다 · 급하다. 셋 다 성립하지 않는다:
    //
    //   넓어도 해야 한다. 넓다는 것은 그 작업이 실제로 그만큼 건드렸다는 뜻이다.
    //   확인은 필요 없다. 판단 근거가 지식공유문서에 이미 다 들어 있다.
    //   급할 이유가 없다. **막히는 것은 코드 커밋이 아니라 지식 레포 커밋**이고,
    //   그것은 작업이 끝난 뒤에 하는 일이다.
    //
    // 지식공유문서를 만들면서 관리 문서 파생은 **필수다. 선택이 아니다.**
    //
    // **한 건으로 낸다.** 전에는 둘로 갈라 `stale`(applied 뒤에 후속이 있다)은
    // error, `unwritten`(applied 가 아예 없다)은 info 였다. 둘은 같은 위반이다
    // -- 파생을 안 했다. 등급이 다르면 절반은 안 막히고, 그러면 "밀림"이라는
    // 없는 상태가 화면에 다시 생긴다.
    //
    // `empty`(작업 기록이 아직 없는 섹션)는 위반이 아니다 -- 낼 것이 없다.
    push(
      'error',
      'derive-missing',
      '관리 문서 파생 누락 — 지식공유문서를 남기면 파생 갱신은 필수입니다',
      sections
        .filter((r) => r.state === 'stale' || r.state === 'unwritten')
        .map((r) => ({
          coord: r.coord,
          detail: r.applied
            ? `${r.doc} · applied ${r.applied} 뒤 후속 ${r.count}건 — \`ctx apply ${r.coord}\``
            : `${r.doc} · applied 없음 · 작업 ${r.total}건 — \`ctx apply ${r.coord}\``,
        }))
    )
  }

  // 훅 미설치 — **조용한 실패다.** 커밋은 통과하고 검사는 안 돈다.
  //
  // 훅은 clone 을 따라오지 않는다. 실측해 보니 `core.hooksPath` 를 지운 상태에서
  // 미등재 좌표를 가진 작업 기록이 **그대로 커밋됐다.** 앱이 이것을 보여주지
  // 않으면 사용자는 검사가 도는 줄로 안다.
  if (gitStatus && gitStatus.repo && !gitStatus.hooksPath) {
    push('warn', 'hooks-off', 'git 훅이 설치되지 않음 — 커밋 검사가 돌지 않습니다', [
      { detail: 'git config core.hooksPath .githooks' },
    ])
  }

  // 좌표 1개짜리 문서 — 프로토콜 §9.3
  push(
    'info',
    'single-coord',
    '좌표가 1개인 문서 (대개 놓친 것이 있다)',
    units.filter((d) => d.touches.length === 1).map((d) => ({ id: d.id, coord: d.touches[0] }))
  )

  return { source: 'builtin', ranAt: new Date().toISOString(), findings }
}

// 미등재 좌표에 후보를 제시한다 — 설계서 §24.1 의 실질적 가치.
// 훅이 안 걸린 PC 에서 이 화면이 프로토콜 §9.6 의 "1초"를 대신한다.
function suggestCoord(vocab, coord) {
  const value = coord.slice(coord.indexOf(':') + 1)
  const type = coord.slice(0, coord.indexOf(':'))

  // 1) alias 일치
  const { normKey } = vocabHelpers()
  const hit = vocab.aliasIndex.get(normKey(value)) || vocab.aliasIndex.get(normKey(coord))
  if (hit) return { coord: hit.coord, why: 'alias 일치' }

  // 2) 같은 타입 안에서 접두/포함
  let best = null
  for (const c of vocab.coords.values()) {
    if (c.type !== type) continue
    const v = c.coord.slice(c.coord.indexOf(':') + 1)
    if (v.startsWith(value) || value.startsWith(v) || v.includes(value)) {
      if (!best || v.length < best.coord.length) best = { coord: c.coord, why: '유사' }
    }
  }
  return best
}

function vocabHelpers() {
  return {
    normKey: (s) =>
      String(s || '')
        .toLowerCase()
        .replace(/[\s_\-·]/g, '')
        .trim(),
  }
}
