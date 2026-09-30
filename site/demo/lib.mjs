// 데모 레포 도구 — ctx · 서버 · MCP 부르기 · 패키지 예시 걷기.
//
// 검증 하네스(`ops/verify/run.mjs`)와 같은 길로 부른다 — 소스의 `ctx-cli.mjs` 를 node 로. 번들을 따로 만들지 않는다.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const NL = String.fromCharCode(10)
// 빌드된 번들로 돈다 — 소스로 띄우면 화면에 「빌드 __CTX_BUILT__」 자리표시가 그대로 찍힌다. run.mjs 가 먼저 build:ctx 를 부른다
export const CLI = path.join(ROOT, 'ops/out/ctx/ctx.mjs')

export const ctx = (...args) => run(process.execPath, [CLI, ...args], { cwd: ROOT, encoding: 'utf8', maxBuffer: 64e6 })
export const git = (dir, ...args) => run('git', ['-C', dir, '-c', 'core.quotepath=false', ...args], { encoding: 'utf8', maxBuffer: 64e6 })
export const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function serve(args) {
  const p = spawn(process.execPath, [CLI, 'serve', ...args], { cwd: ROOT, stdio: ['ignore', 'ignore', 'pipe'] })
  let err = ''
  p.stderr.on('data', (d) => (err += d.toString('utf8')))
  return { p, err: () => err, kill: () => p.kill() }
}

export async function ready(port, ms = 60000) {
  await wait(1500)
  for (const t0 = Date.now(); Date.now() - t0 < ms; await wait(300)) {
    if (await fetch(`http://127.0.0.1:${port}/`, { redirect: 'manual' }).then(() => true, () => false)) return
  }
  throw new Error(`서버가 ${port} 에 뜨지 않았다`)
}

// MCP `tools/call` 하나 — 요청과 응답을 둘 다 돌려준다(녹화가 그대로 싣는다).
let rpcId = 0
export async function call(base, repo, token, name, args) {
  const req = { jsonrpc: '2.0', id: ++rpcId, method: 'tools/call', params: { name, arguments: args } }
  const r = await fetch(`${base}/mcp/${repo}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream', authorization: 'Bearer ' + token },
    body: JSON.stringify(req),
  })
  const t = await r.text()
  const d = t.split(NL).find((l) => l.startsWith('data: '))
  const res = JSON.parse(d ? d.slice(6) : t)
  const text = res?.result?.content?.[0]?.text
  let out
  try {
    out = text ? JSON.parse(text) : res
  } catch {
    out = { text }
  }
  return { req, res: out, status: r.status }
}

// ── 패키지 예시 걷기 ────────────────────────────────────────────────────────
//
// 패키지는 값이 `(예시)` 로 채워져 나간다(`_vocab.md` 「값이 예시로 채워져 있다 — 지우고 시작한다」). 사람이 첫날
// 하는 일을 여기서 한다 — 예시 어휘 · 예시 섹션을 걷고, 그 자리에 이 프로젝트의 초안을 넣는다.

const isExampleHeading = (l) => /^#{2,3}\s/.test(l) && (/\(예시\)/.test(l) || /^#{2,3}\s+예시/.test(l))
const headLevel = (l) => /^(#{1,6})\s/.exec(l)?.[1].length || 0
const isCategory = (l) => /^<!--\s*[^:>]+-->\s*$/.test(l.trim()) && !/applied/.test(l)

export function stripDoc(text, block) {
  const lines = text.split(NL)
  const ex = lines.map((l, i) => (isExampleHeading(l) ? i : -1)).filter((i) => i >= 0)
  if (!ex.length) return { text, removed: 0 }
  let start = ex[0]
  // 바로 위의 분류 주석 · 빈 줄도 걷는다
  for (let i = start - 1; i >= 0 && (!lines[i].trim() || isCategory(lines[i])); i--) if (isCategory(lines[i])) start = i
  const last = ex[ex.length - 1]
  const lv = headLevel(lines[last])
  let end = lines.length
  for (let i = last + 1; i < lines.length; i++) {
    const h = headLevel(lines[i])
    if (h && h <= lv) {
      end = i
      break
    }
  }
  // 섹션과 작성지침 사이의 `---` 는 문서의 것이다 — 남긴다
  while (end > last + 1 && (!lines[end - 1].trim() || lines[end - 1].trim() === '---')) end--
  const between = lines.slice(start, end).filter((l) => headLevel(l) >= 2 && !isExampleHeading(l) && headLevel(l) >= lv)
  const out = [...lines.slice(0, start), ...(block ? block.split(NL) : []), ...lines.slice(end)]
  return { text: out.join(NL).replace(/\n{3,}/g, '\n\n'), removed: ex.length, between }
}

export function renderBlock(items) {
  const out = []
  for (const it of items) {
    if (typeof it === 'string') out.push(it, '')
    else out.push(it[0], '<!-- applied: null -->', '', it[1], '')
  }
  return out.join(NL)
}

// 어휘 — `example:` 를 단 항목을 걷고, 타입 섹션 끝에 이 프로젝트의 것을 붙인다.
export function stripVocab(text, add) {
  const lines = text.split(NL)
  const out = []
  for (let i = 0; i < lines.length; ) {
    if (/^- `[^`]+`/.test(lines[i])) {
      let j = i + 1
      while (j < lines.length && /^\s{2,}\S/.test(lines[j])) j++
      const entry = lines.slice(i, j)
      if (!entry.some((l) => /^\s+example:/.test(l))) out.push(...entry)
      i = j
    } else out.push(lines[i++])
  }
  for (const [type, rows] of Object.entries(add)) {
    const head = out.findIndex((l) => l.trim() === '## ' + type)
    if (head < 0) throw new Error(`어휘에 ## ${type} 가 없다`)
    let end = out.length
    for (let i = head + 1; i < out.length; i++) if (/^##\s/.test(out[i])) { end = i; break }
    while (end > head + 1 && !out[end - 1].trim()) end--
    const ins = rows.flatMap(([c, label, al]) => ['- `' + c + '` — ' + label, ...(al ? ['  aliases: ' + al] : [])])
    // 타입 머리 바로 밑이 설명 문단이면(업무영역) 그 뒤에 붙는다 — 끝에 붙이는 것과 같다
    out.splice(end, 0, ...(out[end - 1]?.trim() === '## ' + type ? [''] : []), ...ins)
  }
  return out.join(NL).replace(/\n{3,}/g, '\n\n')
}

export async function walk(dir, rel = '') {
  const out = []
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true })) {
    const r = path.join(rel, e.name)
    if (e.isDirectory()) out.push(...(await walk(dir, r)))
    else if (e.name.endsWith('.md')) out.push(r.split(path.sep).join('/'))
  }
  return out
}
