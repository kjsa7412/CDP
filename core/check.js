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
// **`status` 에는 쓸 수 있는 값이 하나도 없다.**
//
// 지식공유문서는 작업의 **완료**에서 발생하고, 항상 그 시점에 완료된 것이
// 넘어온다. 그러므로 —
//
//   확정 · 완료   기본값이다. 파싱 경계에서 지운다 (frontmatter.normStatus)
//   미결 · 제안   결정이 안 났다. 아젠다이고 갈 곳은 이슈 대장이다
//   진행중        **그런 상태가 없다.** 끝나지 않은 일은 문서가 아니다
//
// 남는 값이 없으므로 규칙은 "값이 있으면 오류" 하나다. 다만 미결·제안은
// 갈 곳을 알려 줘야 하므로 메시지를 따로 낸다.
import { normValue } from './managed.js'

const AGENDA = new Set(['미결', '제안'])
const REQUIRED = ['id', 'title', 'date', 'author']

export function runBuiltinCheck({ docs, vocab, validity, indexInfo, managedIndex, sections, gitStatus, bodies }) {
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

  // 서식 예시가 아직 어휘에 남아 있다.
  //
  // **경고다.** 예시를 달고 일해도 아무것도 깨지지 않는다 — 좌표로 세지
  // 않으므로 좌표 수도 INDEX 도 부풀지 않는다. 다만 그대로 두면 `ctx match`
  // 가 예시를 후보로 내놓고, 문서에서 예시 섹션만 지운 상태면 `ctx where` 가
  // "섹션이 없음" 을 낸다. **지울 때가 됐다는 신호**로만 쓴다.
  const examples = [...vocab.coords.values()].filter((e) => e.example)
  push(
    'warn',
    'example-coord',
    '서식 예시 좌표가 남아 있다 — 시작할 때 _vocab.md 와 문서에서 같이 지운다',
    examples.map((e) => ({ coord: e.coord, detail: `_vocab.md:${e.line}${e.label ? ' · ' + e.label : ''}` }))
  )

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

  // 그 밖의 값 — `진행중` 이 여기로 온다. 갈 곳이 따로 없으므로 그냥 지우라고 한다.
  push(
    'error',
    'status-value',
    'status 에 쓸 수 있는 값이 없습니다 — 지우세요',
    units
      .filter((d) => d.status && !AGENDA.has(d.status))
      .map((d) => ({ id: d.id, path: d.path, detail: `status: ${d.status} — 지식공유문서는 완료된 것만 옵니다` }))
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

  // 본문에는 있는데 `touches` 에 없는 좌표 — 판정 실수의 유일한 흔적.
  //
  // 다른 모든 검사(미등재 · 파생 누락 · dangling anchor)는 `touches` 를 훑는다.
  // 그래서 **좌표를 빼는 실수는 자기가 켜야 할 검사를 통째로 끄고 지나간다** —
  // 방향이 비대칭이다. 더 넣으면 파생 누락으로 걸리고, 빼면 아무것도 안 걸린다.
  // 본문 산문이 그 좌표를 부르고 있다는 것이 남는 유일한 신호다.
  //
  // **경고다. 오류로 올리지 않는다.** 본문에서 다른 좌표를 참조만 해도 커밋이
  // 막히면 사람이 본문에서 좌표 표기를 지우기 시작한다 — 검사를 피하려고
  // 정보를 없애는 쪽으로 움직이고, 그러면 이 신호 자체가 사라진다.
  //
  // 백틱 안에 쓴 `type:값` 만 본다. 산문에 맨몸으로 쓴 것은 세지 않는다 —
  // "http://…" 같은 것을 좌표로 읽으면 오탐이 신호를 덮는다.
  if (bodies && vocab.coords.size) {
    const bodyOnly = []
    for (const d of units) {
      const text = bodies.get(d.path)
      if (!text) continue
      const inTouches = new Set(d.touches)
      const seen = new Set()
      // 타입에 한글이 올 수 있다(`core/vocab.js` 의 COORD 와 같은 문자 집합).
      // 여기를 ASCII 로 두면 한글 타입을 쓰는 레포에서 이 경고만 조용히 꺼진다.
      for (const m of text.matchAll(/`([a-z가-힣][a-z0-9가-힣_-]*:[^`\s]+)`/gi)) {
        const c = m[1]
        if (seen.has(c) || inTouches.has(c)) continue
        if (!vocab.coords.has(c)) continue // 등재된 좌표만. 오탐을 줄인다
        seen.add(c)
        // coord 가 있으면 itemLine 이 id 를 안 찍는다. 어느 기록인지 없으면
        // 경고를 받고도 파일을 못 찾는다.
        bodyOnly.push({ id: d.id, path: d.path, coord: c, detail: `${d.id} 본문에 있는데 touches 에 없음` })
      }
    }
    push('warn', 'body-only-coord', '본문에만 있는 좌표 — 바꾼 것이면 touches 에 넣는다', bodyOnly)
  }

  // 등록부가 가리키는데 없는 것 — 앵커 없음. **커밋을 막는다.**
  //
  // 등록부에 `screen:RS*` → `화면정의서_연구.md ## {값}` 이 있는데 그 문서에
  // `## RSB020` 이 없으면, 그 좌표의 현재 상태를 적을 자리가 없다는 뜻이다.
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

    // **같은 좌표의 섹션이 한 문서에 둘** — 뒤의 것은 도달할 수 없다(`buildManagedIndex` 는
    // 앞의 것을 쓴다). 헤딩이 두 번 들어간 save 가 이렇게 만들었고(2026-09-23 실사용), 그때
    // 파생 판정도 where 도 앞의 빈 섹션을 보며 "ok" 라 했다 — 좌표 하나에 정본 섹션 하나
    // (불변조건 2)가 깨진 채 확신 있게 틀린 답을 내는 자리라 error 다. 등록부의 앵커 레벨에
    // 있는 헤딩만 본다 — `###` 소제목이 섹션마다 반복되는 것은 정상이다.
    const dups = []
    const rules = managedIndex.registry?.rules || []
    for (const d of managedIndex.docs || []) {
      const levels = new Set(rules.filter((r) => r.doc === d.path && !r.whole).map((r) => r.level))
      if (!levels.size) continue
      const seen = new Map()
      for (const s of d.managedSections || []) {
        if (!levels.has(s.level)) continue
        const k = s.level + normValue(s.value)
        if (seen.has(k)) {
          dups.push({
            path: d.path,
            detail: `${d.path} \`${'#'.repeat(s.level)} ${s.value}\` 이 ${seen.get(k) + 1}행과 ${s.line + 1}행에 둘 — 뒤의 것은 보이지 않는다`,
          })
        } else seen.set(k, s.line)
      }
    }
    push('error', 'dup-anchor', '같은 좌표의 섹션이 한 문서에 둘 — 뒤의 것은 보이지 않는다', dups)
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

    // **같은 날 기록 — 경고다. 막지 않는다.**
    //
    // 날짜 입도가 하루라 하루 안의 순서를 모른다. 그래서 같은 날짜는 후속으로
    // 세지 않는데(validity.later), 그 대가로 **하루에 같은 좌표를 두 번 건드린
    // 두 번째가 아무에게도 안 보였다** — 실측에서 파생을 안 하고도 커밋이
    // 통과했다. 하루에 같은 화면을 두 번 고치는 것은 드문 일이 아니다.
    //
    // 오류로 올리지 않는 이유는 **반영됐는지 기계가 알 수 없기 때문**이다.
    // 섹션이 이미 둘 다 담고 있을 수 있고, `applied` 는 하나만 가리킨다.
    // 오탐으로 커밋을 막으면 사람들이 이 목록 전체를 안 믿는다. 경고는
    // 틀려도 부식되지 않고, 맞으면 눈에 띈다.
    push(
      'warn',
      'derive-sameday',
      '같은 날 기록이 더 있습니다 — 반영됐는지 눈으로 확인하세요',
      sections
        .filter((r) => r.state === 'ok' && (r.peers || []).length)
        .map((r) => ({
          coord: r.coord,
          detail: `${r.doc} · applied ${r.applied} 와 같은 날 ${r.peers.length}건 — ${r.peers.map((p) => p.id).join(' · ')}`,
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
