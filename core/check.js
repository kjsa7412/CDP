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
import { normValue, lintRegistry, docEscapes } from './managed.js'
import { danglingRefs } from './docrefs.js'

const AGENDA = new Set(['미결', '제안'])
const REQUIRED = ['id', 'title', 'date', 'author']

export function runBuiltinCheck({ docs, vocab, validity, indexInfo, managedIndex, sections, gitStatus, bodies, vocabText = null, managedText = null, curation = null }) {
  const findings = []
  // `fix` — 누가 무엇으로 치우는가(등록부 사본 검토 X30). 경고를 받은 사람이 다음 할 일을 안다
  const push = (sev, kind, label, items, fix) => {
    if (items.length) findings.push({ sev, kind, label, items, ...(fix ? { fix } : {}) })
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
    examples.map((e) => ({ coord: e.coord, detail: `_vocab.md:${e.line}${e.label ? ' · ' + e.label : ''}` })),
    '쓰기 권한자가 save 의 examples: "purge" 한 번으로 어휘 줄과 짝 섹션을 같이 지운다(작업 기록 하나) · 모드 A 는 ctx examples --purge 뒤 커밋'
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

  // INDEX.md 불일치 검사는 걷었다(v1.0 I9) — 레포에 INDEX 를 두지 않는다. 옛 레포의 INDEX 는 이행이 지운다

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
      // 큐레이션 · 기준선 기록은 다룬 좌표를 본문에 적는 것이 모양이다(판정표 · 갈아 끼운 블록 목록) — touches 를 갖지 않는다
      if (d.curates || d.baseline) continue
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

  // 등록부가 가리키는데 섹션이 없는 좌표를 기록이 건드린 것 — **v1.0 에서 오류가 아니다**(개편안 H1).
  //
  // 전에는 error 였다(「적을 자리가 없으면 cdp-load 가 빈손」). 그런데 writer 가 등록부 패턴 아래 **새 좌표**를 건드리는
  // 것 — 가장 흔한 일 — 이 전부 막혔고, writer 는 섹션을 쓸 수 없다. 이제 그 기록은 대기열의 「등록부 있음 · 섹션 없음」
  // 으로 서고, `section` 은 섹션 대신 그 미반영 기록을 낸다 — 빈손이 아니다. 자리를 만드는 것은 큐레이터다.
  if (managedIndex) {

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

    // 등록부 스스로의 결함 — 서버가 행을 더하게 되면서(`save.managed`) 손 편집도 같은 눈으로 본다.
    // 탈출만 error 다(레포 밖을 쓰게 만든다). 나머지는 훅이 막을 일이 아니라 **사람이 알아야 할 일**이다.
    const lint = lintRegistry(rules)
    push(
      'error',
      'registry-path',
      '등록부 행의 관리 문서가 레포 밖을 가리킴',
      lint.escape.map((x) => ({ detail: `_managed.md:${x.line} \`${x.pattern}\` → ${x.doc}` }))
    )
    push(
      'warn',
      'registry-outside',
      '등록부 행의 관리 문서가 docs/ 밖에 있음',
      lint.outside.map((x) => ({ detail: `_managed.md:${x.line} \`${x.pattern}\` → ${x.doc}` }))
    )
    push(
      'warn',
      'registry-shadowed',
      '앞 행이 완전히 가리는 등록부 행 — 그 행의 좌표는 닿지 않는다',
      lint.shadowed.map((x) => ({ detail: `_managed.md:${x.line} \`${x.pattern}\` 을 ${x.byLine}행 \`${x.by}\` 이 가져간다` }))
    )
    push(
      'warn',
      'registry-level-mix',
      '한 관리 문서에 앵커 레벨이 둘 — 섹션이 겹친다',
      lint.levelMix.map((x) => ({ path: x.doc, detail: `${x.doc} ${x.levels.map((l) => (l ? '#'.repeat(l) : '—')).join(' · ')}` }))
    )

    // **등록부 행이 없는 파일을 가리킨다**(관리문서 정리 검토 Q4 · K2). 셸에서 파일만 지우면 지금까지 조용했고, 그 타입에
    // 처음 touches 가 닿는 순간 파생 대조(`… 문서가 없음`)가 레포의 모든 커밋을 막았다. 미리 말한다 — error 로 올리면
    // 이미 그런 레포가 업그레이드 순간 잠긴다(registry-outside 와 같은 판단)
    const paths = new Set(docs.map((d) => d.path.toLowerCase()))
    push(
      'warn',
      'registry-missing',
      '등록부 행이 없는 관리 문서를 가리킴 — 그 타입에 작업 기록이 닿으면 커밋이 막힌다',
      (managedIndex.registry?.rules || []).filter((r) => !docEscapes(r.doc) && !paths.has(r.doc.toLowerCase())).map((r) => ({ detail: `_managed.md:${r.line} \`${r.pattern}\` → ${r.doc}` })),
      '서버형은 admin 이 save 의 managed: retire(행만) · 모드 A 는 그 행을 지운다'
    )
    // **끊긴 참조**(K3) — 없는 관리 문서로 가는 링크 · 지운 문서의 이름. drop 은 거절로 막지만 셸에서 지운 것 · reviewed 로 넘긴 것이
    // 계속 보여야 한다
    if (bodies) {
      push(
        'warn',
        'doc-ref-dangling',
        '없는 관리 문서를 가리키는 줄',
        danglingRefs({ texts: bodies, exists: (p) => paths.has(String(p).toLowerCase()), managedText }).map((x) => ({ path: x.file, detail: `${x.file}:${x.line} → ${x.docs.join(' · ')}` })),
        '쓰기 권한자가 save 의 edits 로 그 줄을 고친다 · 모드 A 는 손으로'
      )
    }

    // 등록부 사본(머리 표 · 생성 블록) · 어긋나는 산문 검사는 걷었다(v1.0 V4) — 사본을 만들지 않는다
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
    // **미반영은 상태다**(v1.0 개편안 I7 · 「파생 누락은 오류」 를 대신한다).
    //
    // 전에는 기록을 남기면서 섹션까지 고치는 것이 필수였고 안 했으면 error 로 커밋을 막았다. 그 강제가 세션 하나에
    // 기록과 섹션을 한꺼번에 쓰게 했고, 섹션이 근거보다 커지고 같은 결정이 여러 섹션에 복제됐다(파생 검토 §2).
    // 이제 기록은 대기열에 서고 큐레이터가 반영한다. 늦은 반영이 정보를 새게 하지 않도록 **섹션을 내보내는 모든
    // 자리가 미반영 기록을 같이 낸다** — 그래서 여기서는 막지 않고 알리기만 한다.
    const pend = curation
      ? sections.filter((r) => r.state !== 'doc-missing' && r.state !== 'anchor-missing' && curation.pendingOf(r.coord).length)
      : sections.filter((r) => r.state === 'stale' || r.state === 'unwritten')
    push(
      'info',
      'curation-pending',
      '미반영 섹션 — 그 좌표를 건드린 기록이 큐레이션을 기다린다(section 이 섹션과 함께 그 기록을 낸다)',
      pend.map((r) => {
        const n = curation ? curation.pendingOf(r.coord).length : r.count || r.total
        return { coord: r.coord, detail: `${r.doc} · 미반영 ${n}건` }
      }),
      '큐레이터가 cdp-curate 로 대기열을 다룬다'
    )
    if (curation?.stats?.stale) {
      const q = curation.queue[0]
      push(
        'warn',
        'curation-stale',
        `큐레이션 대기가 ${curation.stats.oldestDays}일 됐다 — 14일을 넘겼다`,
        [{ id: q?.id, detail: `가장 오래된 대기 ${q?.id ?? ''} (${q?.date ?? ''}) · 대기 ${curation.stats.queue}건` }],
        '큐레이터가 cdp-curate 로 오래된 것부터 다룬다'
      )
    }
  }

  // 큐레이션 기록의 판정 — save 가 거르지만 손으로 고친 기록 · 지운 대상은 여기서 본다. 판정이 틀린 기록은 그 대상을
  // 「큐레이션됐다」 로 만든 채 근거가 없다 — 확신 있게 틀린 상태라 error 다.
  if (units.some((d) => d.curates)) {
    const byId = new Map(units.map((d) => [d.id, d]))
    const bad = []
    for (const d of units) {
      for (const j of d.curates || []) {
        if (j.bad) bad.push({ id: d.id, path: d.path, detail: `${j.id || '(id 없음)'} — ${j.bad}` })
        else if (!byId.has(j.id)) bad.push({ id: d.id, path: d.path, detail: `${j.id} — 그런 작업 기록이 없다` })
      }
    }
    push('error', 'curates-shape', '큐레이션 판정이 틀렸다 — 대상이 없거나 모양이 아니다', bad, '큐레이터가 바른 판정으로 다시 큐레이션한다(가장 늦은 판정이 이긴다)')
  }

  // 훅 미설치 경고는 걷었다(v1.0 V5) — 서버 save 는 훅 없이 같은 검사를 커밋 전에 돈다

  // 좌표 1개짜리 문서 — 프로토콜 §9.3
  push(
    'info',
    'single-coord',
    '좌표가 1개인 문서 (대개 놓친 것이 있다)',
    units.filter((d) => d.touches.length === 1).map((d) => ({ id: d.id, coord: d.touches[0] }))
  )

  return { source: 'builtin', ranAt: new Date().toISOString(), findings }
}

// ── 오류의 정체 — save 가 「자기가 만든 오류」 를 가린다(v1.0 개편안 I10 · V21) ──────────────────────────
//
// save 는 쓰기 전 레포와 쓴 뒤 레포를 같은 검사로 본다. 쓴 뒤에만 있는 error 가 **이 save 가 만든 것**이고, 그것만
// 막는다. 원래 있던 오류(남이 남긴 중복 섹션 · 손으로 고친 등록부)로 모든 save 가 막히면 고칠 권한이 없는 사람은
// 풀 길이 없다(gdi 의 `## rp_plnd_mst` 중복 동안 save 전부 E_CHECK — 실서버 종합시험 F8).
//
// 열쇠는 종류 · 기록 id · 좌표 · 경로 · 설명이다. 설명 속 **숫자는 지운다** — 줄 번호와 건수는 다른 기록이 더해지거나
// 섹션이 늘면 바뀌는데, 그것 때문에 원래 있던 오류가 「새 오류」 가 되면 안 된다.
export function findingKey(f, item) {
  const detail = String(item?.detail ?? '').replace(/\d+/g, '#')
  return [f.kind, item?.id ?? '', item?.coord ?? '', item?.path ?? '', detail].join('\u0000')
}

// 쓴 뒤 검사(after)에서 쓰기 전(before)에 없던 error 항목만 — 종류별로 묶어 같은 모양(findings)으로 낸다
export function newErrors(before, after) {
  const seen = new Set()
  for (const f of before?.findings || []) if (f.sev === 'error') for (const it of f.items) seen.add(findingKey(f, it))
  const out = []
  for (const f of after?.findings || []) {
    if (f.sev !== 'error') continue
    const items = f.items.filter((it) => !seen.has(findingKey(f, it)))
    if (items.length) out.push({ ...f, items })
  }
  return out
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
