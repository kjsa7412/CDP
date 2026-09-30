// 누출 검사 — 빌드 산출물(ops/out/site)의 모든 텍스트 파일을 훑는다. 하나라도 걸리면 exit 1(제작 검토 v0.1 S12).
//
// PNG 는 글자를 읽지 않는다 — 대신 캡처가 데모 서버만 찍고, 찍기 전에 화면 글자 · 속성값을 같은 규칙으로 본다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { findLeaks } from './leaks.mjs'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = process.argv[2] ? path.resolve(process.argv[2]) : path.join(ROOT, 'ops', 'out', 'site')
const TEXT = /\.(html|js|mjs|css|json|svg|txt|xml|map)$/i

async function walk(dir) {
  const out = []
  for (const e of await fs.readdir(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name)
    if (e.isDirectory()) out.push(...(await walk(p)))
    else out.push(p)
  }
  return out
}

const files = await walk(OUT)
let bad = 0
let scanned = 0
for (const f of files) {
  const rel = path.relative(OUT, f).split(path.sep).join('/')
  // 파일 이름도 본다
  for (const l of findLeaks(rel)) {
    console.error(`[check-leaks] ${rel} (파일명) · ${l.kind} 「${l.hit}」`)
    bad++
  }
  if (!TEXT.test(f)) continue
  scanned++
  const text = await fs.readFile(f, 'utf8')
  for (const l of findLeaks(text)) {
    console.error(`[check-leaks] ${rel}:${l.line} · ${l.kind} 「${l.hit}」 … ${l.near.replace(/\s+/g, ' ')}`)
    bad++
  }
}
if (bad) {
  console.error(`[check-leaks] ${bad}건 — 사외 공개 사이트에 나오면 안 되는 것이 있다. 빌드를 멈춘다`)
  process.exit(1)
}
console.log(`[check-leaks] 누출 0 · 텍스트 ${scanned} · 전체 ${files.length} 파일`)
