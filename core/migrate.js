// 제자리 이행 — 옛 레포(파생 필수 시절)를 v1.0 으로. 개편안 §9.2 · W7.
//
// 옛 레포는 큐레이션 기록이 없어 「암묵 전환」 으로 읽힌다(core/curation.js) — 옛 판정이 남긴 기록만 대기다. 그 어림을
// **기록으로 남기는 것**이 전환 기록이다: 지금 섹션이 최신인 기록은 `reflect`(into = 섹션이 있는 좌표), 섹션이 있는
// 좌표를 하나도 안 건드린 기록은 `keep`. 옛 판정이 남긴 기록(applied 뒤 후속 · 섹션 없는 등록부 좌표)은 판정하지 않고
// 대기열에 둔다. **날짜 경계로 자르지 않는다** — 원문 날짜를 단 편입 기록이 경계 앞으로 숨는다(데이터 모델 조사 §4.4).
//
// 전환 기록은 섹션을 쓰지 않는다 — 그래서 「반영(into)한 좌표는 같은 save 의 섹션이어야 한다」 를 면한다(태그 transition).
// 순수하다 — 레포(loadRepo)를 받아 save 입력을 낸다.

import { recordKind, coordClass } from './curation.js'

export function planTransition(r, { now = new Date(), by = null } = {}) {
  if (!r.curation) return { error: '큐레이션 계산이 없다' }
  if (!r.curation.implicit) return { error: r.works.some((d) => d.curates) ? '이미 큐레이션 기록이 있다 — 전환은 한 번이다' : '옛 파생 이력(applied 가 있는 섹션)이 없다 — 전환할 것이 없다(새 레포 · 다시 세운 레포)' }
  const queued = new Set(r.curation.queue.map((q) => q.id))
  const curates = []
  let reflect = 0
  let keep = 0
  for (const d of r.works.slice().reverse()) {
    if (recordKind(d) !== 'work' || queued.has(d.id)) continue
    const into = (d.touches || []).filter((c) => coordClass(r.managedIndex, c) === 'section')
    if (into.length) {
      curates.push({ id: d.id, verdict: 'reflect', into })
      reflect++
    } else {
      curates.push({ id: d.id, verdict: 'keep', reason: (d.touches || []).length ? '전환 — 등록부 없는 좌표만 건드렸다(기록이 원천)' : '전환 — 좌표 없는 기록' })
      keep++
    }
  }
  const p2 = (n) => String(n).padStart(2, '0')
  const id = `${now.getFullYear()}-${p2(now.getMonth() + 1)}${p2(now.getDate())}-전환-v1`
  const body = [
    '# 전환 — v1.0 큐레이션 모델로',
    '',
    `옛 파생 필수 시절의 기록 ${curates.length}건을 판정으로 남긴다 — 반영됨 ${reflect}건(그때 섹션에 실렸다) · 기록으로 둠 ${keep}건(실을 섹션이 없었다).`,
    `대기열에 남긴 기록 ${queued.size}건 — 옛 판정이 남긴 것(applied 뒤 후속 · 섹션 없는 등록부 좌표). 큐레이터가 다룬다.`,
    '',
    '날짜 경계로 자르지 않았다 — 판정은 기록마다 섹션 상태로 정했다.',
    '',
  ].join('\n')
  return {
    input: {
      work: { id, title: `전환 — 옛 기록 ${curates.length}건을 판정으로 남김`, date: `${now.getFullYear()}-${p2(now.getMonth() + 1)}-${p2(now.getDate())} ${p2(now.getHours())}:${p2(now.getMinutes())}`, touches: [], tags: ['transition'], curates, body },
    },
    stats: { reflect, keep, queued: queued.size },
  }
}

// 레포 안의 도구 층 — v1.0 레포에는 지식만 둔다(I9). 이행이 걷는다
export const TOOL_LAYER = ['bin', '.githooks', '.claude', 'tools', 'MANUAL.md', 'MANUAL-관리자.md', 'MANUAL-시스템.md', 'CLAUDE.md', 'TEMPLATE-work.md', 'INDEX.md', 'INDEX-by-coord.md']
