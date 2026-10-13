// 에이전트는 ctx 를 부르지 않는다 — 스킬 · 작업 규칙 본문에 `ctx <명령>` 이 없다(MCP 만으로 검토 v0.1 M1 · ③).
//
// ctx 는 설치(`ctx up` · 설치 한 줄) · 서버 셸(admin) · 개발 시험의 도구다. 에이전트가 하는 일은 MCP 도구만으로 끝난다 —
// PC 마다 PATH · 한글 경로 · 토큰 환경변수가 갈리는 사고(2026-10-13 ctx.cmd)가 에이전트 길에 다시 들어오지 않게.
// 예외는 설치 안내뿐이고 여기 명시한다.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
// 설치 안내 — 에이전트가 아니라 사람이 한 번 돌린다
const ALLOW = ['ctx up']

function mdFiles(dir) {
  const out = []
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...mdFiles(p))
    else if (e.name.endsWith('.md')) out.push(p)
  }
  return out
}

test('스킬 · CLAUDE-*.md 본문에 ctx 명령이 없다(설치 안내만 예외)', () => {
  const files = [...mdFiles(path.join(ROOT, 'agent', 'skills')), ...fs.readdirSync(path.join(ROOT, 'agent')).filter((f) => /^CLAUDE-.*\.md$/.test(f)).map((f) => path.join(ROOT, 'agent', f))]
  assert.ok(files.length >= 8, `파일 ${files.length}`)
  const bad = []
  for (const f of files) {
    const lines = fs.readFileSync(f, 'utf8').split('\n')
    lines.forEach((l, i) => {
      for (const m of l.matchAll(/(?<![\w./-])ctx\s+([a-z][\w-]*)/g)) {
        const cmd = 'ctx ' + m[1]
        if (!ALLOW.includes(cmd)) bad.push(`${path.relative(ROOT, f)}:${i + 1} 「${cmd}」`)
      }
    })
  }
  assert.deepEqual(bad, [], '에이전트 문서에 ctx 명령이 남았다 — MCP 도구(source · save …)나 콘솔로 바꾼다')
})
