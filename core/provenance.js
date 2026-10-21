// 출처 — 들인 기록의 `source` 를 정형으로 쓰고 읽는다. 지식 생성 · 작업실 검토 v0.1 §5.2 · G10.
//
//   <이름>@<commit | ->/<경로>#blob:<git blob sha>[:<조각>]
//
//   이름    원천 폴더 · 레포의 이름(사람이 알아보는 조각)
//   commit  git 레포에서 읽었으면 그 커밋(짧게) · 아니면 `-`
//   경로    원천 안의 상대 경로(/ 로)
//   blob    파일 내용의 git blob sha1 — **같은 내용이면 같은 값**(이름 · 자리가 바뀌어도). git 이 아닌 파일도 같은 셈으로 낸다
//   조각    한 문서를 판단 단계가 여러 기록으로 나눴으면 1 부터 — 한 원본에서 기록이 여럿 나와도 조각마다 한 번이다
//
// 중복 판정의 열쇠는 blob(+ 조각)이다 — 같은 원본을 두 번 들이면 save 가 뮤텍스 안에서 거절한다(core/save.js). 판정은 여기 한 곳의
// 함수를 쓴다. **순수하다** — 파일 · git 을 모른다. 프론트매터 스키마는 바꾸지 않는다(`source` 는 원래 자유 글이다).

import crypto from 'node:crypto'

const RE = /^([^@\n]+)@([0-9a-f]{7,40}|-)\/(.+)#blob:([0-9a-f]{40})(?::(\d{1,3}))?$/

// git 의 blob 해시 — `git hash-object` 와 같은 값(sha1("blob <길이>\0" + 내용))
export function blobSha(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(String(buf), 'utf8')
  return crypto.createHash('sha1').update(`blob ${b.length}\0`).update(b).digest('hex')
}

export function formatSource({ name, commit = null, path, blob, part = null }) {
  const n = String(name || '').replace(/[@\n]/g, '_').trim() || 'src'
  return `${n}@${commit || '-'}/${String(path).replace(/\\/g, '/')}#blob:${blob}${part ? ':' + part : ''}`
}

export function parseSource(s) {
  const m = RE.exec(String(s ?? '').trim())
  return m ? { name: m[1], commit: m[2] === '-' ? null : m[2], path: m[3], blob: m[4], part: m[5] ? Number(m[5]) : null } : null
}

// 중복 판정의 열쇠 — `<blob>` 또는 `<blob>:<조각>`. 정형이 아니면 null(손으로 적은 출처 · seed 의 `<레포>@<sha>/<경로>` 는 blob 이 없다)
export const blobOf = (s) => {
  const p = parseSource(s)
  return p ? p.blob + (p.part ? ':' + p.part : '') : null
}
