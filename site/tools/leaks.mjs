// 누출 패턴 — 사외 공개 사이트에 나오면 안 되는 것(공식 사이트 제작 검토 v0.1 S12).
//
// 두 곳이 같은 규칙을 쓴다: 캡처가 찍기 전 화면(글자 + 속성값)에, check-leaks 가 빌드 산출물 전체에.
// 실명 목록은 `leak-names.txt` 에 따로 둔다 — 이 폴더는 산출물에 들어가지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = path.dirname(fileURLToPath(import.meta.url))

const names = fs
  .readFileSync(path.join(HERE, 'leak-names.txt'), 'utf8')
  .split(/\r?\n/)
  .map((l) => l.replace(/#.*/, '').trim())
  .filter(Boolean)

const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export const PATTERNS = [
  ['사내 주소', /\b10\.10\.\d{1,3}\.\d{1,3}\b/],
  ['사설 주소', /\b192\.168\.\d{1,3}\.\d{1,3}\b/],
  ['로컬 경로', /\b[A-Z]:[\\/](?:Users|project)[\\/]/i],
  ['사람', /\bkjsa/i], // kjsa7412(계정)까지
  ['사람', /\bhong\b/i],
  ['사내 도메인', /sjinc/i],
  ['사내 git', /\bsoln1\b|dpms_wiki|\bplatform\/dpms/i],
  ['고객 · 프로젝트', /\bgdi\b|경북|더존|이집이지/i],
  ['실물 테이블', /\b(?:rp|ps)_[a-z]{2,}_[a-z]/i],
  ['토큰 모양', /cdp_su=|\bBearer [A-Za-z0-9_-]{30,}/],
  ['실명', new RegExp(names.map(esc).join('|'))],
]

export function findLeaks(text) {
  const out = []
  const lines = String(text).split(/\n/)
  for (let i = 0; i < lines.length; i++) {
    for (const [kind, re] of PATTERNS) {
      const m = re.exec(lines[i])
      if (m) out.push({ line: i + 1, kind, hit: m[0], near: lines[i].slice(Math.max(0, m.index - 40), m.index + m[0].length + 40) })
    }
  }
  return out
}
