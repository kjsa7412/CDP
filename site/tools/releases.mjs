// 판 이력 — CHANGELOG 의 절마다 「판 · 날짜 · 무엇이」 만 뽑는다(공식 사이트 제작 검토 v0.1 S14).
//
// 본문은 싣지 않는다 — 고친 파일 · 실측 경위가 들어 있고 사외에 낼 말이 아니다. 굵은 머리(`**…**`)가 있는 절은
// 그 머리들을, 없는 옛 절은 첫 문단을 쓴다. 결과는 누출 검사(check-leaks)를 거친다.

const NL = String.fromCharCode(10)
const clean = (s) =>
  s
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // 링크 → 글자
    .replace(/\s+—\s+`[0-9a-f]{7}`(\s*·\s*`[0-9a-f]{7}`)*\s*$/, '') // 끝의 커밋 해시
    .replace(/\s+/g, ' ')
    .trim()

export function releasesOf(md) {
  const out = []
  const parts = md.split(/^## /m).slice(1)
  for (const p of parts) {
    const [head, ...rest] = p.split(NL)
    const m = /^v(\d+\.\d+\.\d+)(?:\s*~\s*v(\d+\.\d+\.\d+))?(?:\s*—\s*(\d{4}-\d{2}-\d{2}))?(\s*\(태그 없음\))?/.exec(head.trim())
    if (!m) continue
    const body = rest.join(NL)
    const heads = [...body.matchAll(/^\*\*([^*]+)\*\*/gm)].map((x) => clean(x[1]))
    let items = heads.filter((h) => h && h !== '문서' && h !== '그 밖' && h !== '하네스')
    if (!items.length) {
      const para = body.split(/\n\s*\n/).map((x) => x.trim()).find((x) => x && !x.startsWith('-'))
      const first = (para || body.split(NL).find((l) => l.trim().startsWith('-')) || '').replace(/^-\s*/, '')
      items = [clean(first).split(/(?<=다)\.\s|\. /)[0].replace(/\.$/, '')]
    }
    out.push({ v: m[1], to: m[2] || null, date: m[3] || null, untagged: !!m[4], items: items.slice(0, 5) })
  }
  return out
}
