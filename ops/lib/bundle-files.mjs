// 산출물에 담는 파일 — 서버 산출물(`release-server.mjs`)이 쓴다. v1.0 개편안 §8.2.
//
// v0.x 의 「지식 레포 조립」(패키지 + 도구 층 → `knowledge-repo-<이름>/`)은 v1.0 에서 끝났다 — 새 레포는 서버가
// 빈 틀로 세우고(`core/skeleton.js`), 서식은 `forms/`, 작업 레포의 스킬은 `kit/` 으로 나간다.
//
// 파일 시스템만 만진다. npm 도 git 도 부르지 않는다.

import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

// **`..` 가 두 번이다.** 이 파일은 `ops/lib/` 에 있다.
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..')

const BIN = /[.](?:exe|png|jpe?g|gif|ico|pdf|xlsx?|hwpx?|pptx?|zip|woff2?|ttf|otf|blob)$/i

// **`.cmd` 는 손대지 않는다.** cmd.exe 는 CRLF 를 전제한다 — LF 로 바꾸면 `( … )` 블록과
// `%VAR%` 가 어긋나 "'RLEVELHEREctx.mjs' 은(는) 내부 또는 외부 명령…" 으로 죽는다(2026-09-23 실측).
const KEEP = /[.](?:cmd|bat)$/i

// **줄바꿈을 LF 로 맞춰서 담는다.** 기준은 자기 자신을 clone 한 결과와 같아지는 것이다. 이진과 `.cmd` 는 그대로.
export function copyFileLF(s, d) {
  if (BIN.test(s) || KEEP.test(s)) return fs.copyFileSync(s, d)
  const b = fs.readFileSync(s)
  if (b.includes(0)) return fs.copyFileSync(s, d)
  fs.writeFileSync(d, b.toString('utf8').replace(/\r\n/g, '\n'))
}

export function copyDirLF(src, dst, { skip = () => false } = {}) {
  fs.mkdirSync(dst, { recursive: true })
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (skip(e.name, src)) continue
    if (e.isFile() && /[.]exe$/i.test(e.name)) continue
    const s = path.join(src, e.name)
    const d = path.join(dst, e.name)
    if (e.isDirectory()) copyDirLF(s, d, { skip })
    else copyFileLF(s, d)
  }
}

// 작업 레포 kit — `kit/skills/cdp-*/` · `kit/CLAUDE-프로젝트레포.md`(writer 블록) · `kit/CLAUDE-큐레이터.md`(큐레이터 블록).
// `core/kit.js` 가 이 모양을 읽는다(소스에서는 `agent/` 를 그대로 읽는다). 빠진 것을 돌려준다
export const KIT_BLOCKS = ['CLAUDE-프로젝트레포.md', 'CLAUDE-큐레이터.md']
export function copyKit(root, dest) {
  const missing = []
  const skills = path.join(root, 'agent', 'skills')
  const names = fs.existsSync(skills) ? fs.readdirSync(skills, { withFileTypes: true }).filter((e) => e.isDirectory() && e.name.startsWith('cdp-')).map((e) => e.name) : []
  if (!names.length) missing.push('agent/skills/cdp-*')
  for (const n of names) copyDirLF(path.join(skills, n), path.join(dest, 'skills', n))
  for (const f of KIT_BLOCKS) {
    const s = path.join(root, 'agent', f)
    if (!fs.existsSync(s)) missing.push('agent/' + f)
    else copyFileLF(s, path.join(dest, f))
  }
  return { skills: names.sort(), missing }
}

// 번들 시각 — `ctx.mjs` 안의 `BUILT = '…'`. 없으면 '?'.
export function bundleStamp(root = ROOT, ctxDir = null) {
  try {
    const f = path.join(ctxDir || path.join(root, 'ops', 'out', 'ctx'), 'ctx.mjs')
    const m = fs.readFileSync(f, 'utf8').match(/BUILT\s*=\s*['"]([^'"]+)['"]/)
    return m && !m[1].startsWith('__') ? m[1] : '?'
  } catch {
    return '?'
  }
}

// 폴더 크기 · 파일 수 — 보고용.
export function measure(dir) {
  let files = 0
  let bytes = 0
  ;(function walk(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else {
        files++
        bytes += fs.statSync(p).size
      }
    }
  })(dir)
  return { files, bytes, mb: (bytes / 1048576).toFixed(1) }
}
