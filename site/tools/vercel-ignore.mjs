// Vercel 빌드 건너뛰기 — `vercel.json` 의 `ignoreCommand`. **사이트에 닿는 파일이 바뀐 배포만 빌드한다.**
//
// Vercel 의 약속: 이 명령이 exit 0 이면 빌드를 **건너뛰고**, exit 1 이면 **빌드한다**. 이 레포는 제품 코드 · 설계서가 같이
// 있어 push 마다 사이트를 다시 빌드하면 낭비다. 비교 기준은 Vercel 이 주는 `VERCEL_GIT_PREVIOUS_SHA`(그 브랜치에서 마지막으로
// 성공한 배포의 커밋)라서, 커밋 여럿을 한 번에 push 해도 그 사이의 변경을 다 본다.
//
// **모르면 빌드한다.** 기준 커밋이 없거나(첫 배포) · 얕은 clone 이라 그 커밋이 없거나 · git 이 실패하면 exit 1.
// 억지로 빌드하려면 Vercel 환경변수 `CDP_SITE_FORCE=1`.
//
// 사이트가 `site/` 밖에서 읽는 파일이 늘면 WATCH 에 더한다 — test/site.test.mjs 가 import 를 훑어 빠진 것을 잡는다.
//
//   node site/tools/vercel-ignore.mjs        (VERCEL_GIT_PREVIOUS_SHA 를 본다)

import { spawnSync } from 'node:child_process'
import { pathToFileURL } from 'node:url'

export const WATCH = [
  'site/',
  'vercel.json',
  'package.json', // 판 번호가 사이트 머리에 찍힌다 · 의존성
  'package-lock.json',
  '.nvmrc',
  'CHANGELOG.md', // 판 이력 페이지
  'docs/그림/', // 개념 · 에이전트 · 배치 페이지의 그림
  'viewer/src/styles/tokens.css', // 색 · 간격 — 제품과 같은 것을 쓴다
  'viewer/src/styles/site.css', // 카드 · 히어로 · 「MCP 가 도는 길」 의 모양
  'viewer/src/components/Icon.jsx',
  'viewer/src/site/McpFlow.jsx',
]

const BUILD = 1
const SKIP = 0

export function decide({ prev, force, cwd = process.cwd() } = {}) {
  if (force) return { code: BUILD, why: 'CDP_SITE_FORCE — 억지로 빌드한다' }
  if (!prev) return { code: BUILD, why: '기준 커밋이 없다(첫 배포) — 빌드한다' }
  const git = (...a) => spawnSync('git', ['-c', 'core.quotepath=false', ...a], { cwd, encoding: 'utf8' })
  if (git('cat-file', '-e', prev + '^{commit}').status !== 0) return { code: BUILD, why: `기준 커밋 ${prev.slice(0, 7)} 이 이 clone 에 없다 — 빌드한다` }
  const d = git('diff', '--name-only', prev, 'HEAD', '--', ...WATCH)
  if (d.status !== 0) return { code: BUILD, why: 'git diff 실패 — 빌드한다: ' + String(d.stderr).trim().split('\n')[0] }
  const files = d.stdout.split('\n').filter(Boolean)
  if (!files.length) return { code: SKIP, why: `${prev.slice(0, 7)} 이후 사이트에 닿는 변경이 없다 — 건너뛴다` }
  return { code: BUILD, why: `사이트에 닿는 변경 ${files.length} — ${files.slice(0, 5).join(' · ')}${files.length > 5 ? ' …' : ''}` }
}

if (import.meta.url === pathToFileURL(process.argv[1] || '').href) {
  const r = decide({ prev: process.env.VERCEL_GIT_PREVIOUS_SHA, force: process.env.CDP_SITE_FORCE === '1' })
  console.log('[vercel-ignore] ' + r.why)
  process.exit(r.code)
}
