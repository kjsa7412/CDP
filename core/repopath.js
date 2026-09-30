// 문서 안의 링크 · 그림 경로를 **레포 안의 경로**로 푼다. 그림 · 첨부 검토 v0.1 G1 · A7.
//
// 화면(`DocView` 의 본문 그림 · 첨부 목록)과 서버(`save` 의 깨진 그림 경고)가 같은 규칙을 써야 한다 — 둘이 갈라지면
// 「save 는 조용했는데 화면에서 깨진다」 가 다시 생긴다. 그래서 Node 에도 브라우저에도 기대지 않는 순수 함수다.
//
//   ../work/assets/x.png   그 문서가 있는 폴더 기준(마크다운 표준 · GitHub · 편집기와 같다)
//   /work/assets/x.png     레포 루트
//   work/… · docs/…        레포 루트(첨부 목록이 v0.2 부터 이렇게 읽었다 — `docs/a.md` 안의 `docs/x.png` 를
//                          `docs/docs/x.png` 로 읽는 사람은 없다)
//   http: · data: · #…     레포 밖 링크가 아니라 **레포와 무관한 것** — null
//   C:/… · ../../..        레포 밖 — { outside: true }

const SCHEME = /^[a-z][a-z0-9+.-]*:/i
const DRIVE = /^[a-z]:[\\/]/i
const ROOTED = /^(docs|work|knowledge)\//

/** @returns {null | { path: string, outside: boolean }} */
export function repoPath(docPath, href) {
  let h = String(href ?? '').trim()
  if (h.startsWith('<') && h.endsWith('>')) h = h.slice(1, -1)
  if (!h || h.startsWith('#')) return null
  if (DRIVE.test(h) || h.startsWith('\\\\')) return { path: h, outside: true }
  if (SCHEME.test(h) || h.startsWith('//')) return null
  h = h.split('#')[0].split('?')[0]
  // 렌더러가 한글 · 공백을 퍼센트 인코딩해 둔다 — 풀지 않으면 `%EC%8B%9C…` 라는 파일을 찾는다
  try {
    h = decodeURIComponent(h)
  } catch {}
  h = h.replace(/\\/g, '/')
  if (!h) return null

  let joined
  if (h.startsWith('/')) joined = h.slice(1)
  else if (ROOTED.test(h.replace(/^(\.\/)+/, ''))) joined = h.replace(/^(\.\/)+/, '')
  else joined = String(docPath || '').replace(/\\/g, '/').replace(/[^/]*$/, '') + h

  const out = []
  for (const seg of joined.split('/')) {
    if (!seg || seg === '.') continue
    if (seg === '..') {
      if (!out.length) return { path: joined, outside: true }
      out.pop()
      continue
    }
    out.push(seg)
  }
  return out.length ? { path: out.join('/'), outside: false } : null
}

// 마크다운 원문의 링크 · 그림 대상 — `[말](대상)` · `![말](대상 "제목")` · `![말](<공백 있는 대상>)`.
// 코드 블록 · 인라인 코드 안은 예시라 뺀다. 참조식 링크(`[말][1]`)는 드물어 보지 않는다.
export function mdRefs(text) {
  const src = String(text ?? '')
    .replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, '')
    .replace(/`[^`\n]*`/g, '')
  const out = []
  const re = /(!?)\[[^\]\n]*\]\(\s*(<[^>\n]*>|[^)\s]*)(?:\s+(?:"[^"\n]*"|'[^'\n]*'))?\s*\)/g
  for (let m; (m = re.exec(src)); ) out.push({ href: m[2], image: m[1] === '!' })
  return out
}
