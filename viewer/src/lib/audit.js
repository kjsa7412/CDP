// 감사 — auth.log 한 줄 → { 시각 · 행위자 · 내용 }. 콘솔의 현황 · 감사가 같이 쓴다(시험이 부를 수 있게 JSX 밖). `시각 · 행위 …`. 콘솔의 것은 `admin <행위> · <행위자> · …`, 셸의 것은 행위자가 없다.
export function parseAudit(line) {
  const i = line.indexOf(' · ')
  const time = i > 0 ? line.slice(0, i) : ''
  const rest = i > 0 ? line.slice(i + 3) : line
  let actor = '(셸)'
  let text = rest
  // 콘솔은 `admin <행위> · <행위자> · …`, 마법사는 `setup · <행위> · <이름> · …` — 사이 점이 다르다.
  const m = /^(admin|setup)(?: ·)? ([^·]+?) · ([^·]+?)(?: · (.*))?$/.exec(rest)
  if (m) {
    actor = m[3].trim()
    text = `${m[2].trim()}${m[4] ? ' · ' + m[4] : ''}`
    if (m[1] === 'setup') actor = '(마법사) ' + actor
    return { time, actor, text }
  }
  // 작업 레포 대장은 **화면(레포 관리 › 연결된 작업 레포)에서만** 바뀐다 — 셸 명령이 없다. 줄은 `workrepo add · <사람> · …` 라
  // 접두가 없어 「(셸)」 로 읽혔다(실서버 종합 시험 F6). 둘째 칸이 행위자다 — 옛 줄도 이것으로 바로 보인다
  const w = /^(workrepo (?:add|del)) · ([^·]+?) · (.*)$/.exec(rest)
  if (w) return { time, actor: w[2].trim(), text: `${w[1]} · ${w[3]}` }
  return { time, actor, text }
}
