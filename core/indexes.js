// INDEX.md · INDEX-by-coord.md 생성. 설계서 §4.5 의 9단계.
//
// **`ctx index` 와 `save` 가 같은 함수를 쓴다.** 두 곳에서 각자 만들면 커밋 훅이
// 만든 INDEX 와 서버가 만든 INDEX 가 달라지고, 그 차이는 diff 로만 나타난다 --
// 무엇이 맞는지 아무도 모른 채 서로 덮는다.
//
// 문자열만 낸다. 파일을 쓰는 것은 부르는 쪽이다.

const NL = String.fromCharCode(10)
const short = (p) => String(p || '').replace(/^docs\//, '').replace(/\.md$/, '')

export function renderIndex(r) {
  const rows = ['| id | date | status | touches |', '|---|---|---|---|']
  for (const d of r.works) {
    rows.push(`| ${d.id} | ${d.date || ''} | ${d.status || ''} | ${d.touches.join(', ') || '-'} |`)
  }
  const head = ['# INDEX', '', `자동 생성 - \`ctx index\`. 작업 기록 ${r.works.length}건.`, '', '']
  return head.concat(rows).join(NL) + NL
}

export function renderByCoord(r) {
  const lines = ['# INDEX (좌표별)', '', '자동 생성 - `ctx index`.', '']
  const byType = new Map()
  for (const c of r.allCoords) {
    const t = c.slice(0, c.indexOf(':')) || '기타'
    if (!byType.has(t)) byType.set(t, [])
    byType.get(t).push(c)
  }
  for (const [type, cs] of [...byType.entries()].sort()) {
    lines.push(`## ${type}`, '')
    for (const c of cs) {
      const list = r.coords.byCoord.get(c) || []
      const sec = r.sections.find((x) => x.coord === c)
      // 상태를 적지 않는다. 파생 누락은 `ctx check` 가 오류로 잡으므로
      // 인덱스에 남을 상태가 없다 — 어디에 있는지만 적는다.
      const where = sec && sec.doc ? ` \`${short(sec.doc)}\`` : ''
      lines.push(`- \`${c}\` 작업 ${list.length}건${where}`)
      for (const d of list.slice(0, 3)) lines.push(`  - ${d.date || ''} [${d.title}](work/${d.id}.md)`)
      if (list.length > 3) lines.push(`  - ... ${list.length - 3}건 더`)
    }
    lines.push('')
  }
  return lines.join(NL) + NL
}
