// 데모 도구 — ctx · 서버 · MCP 부르기 · 줄거리의 save 두 가지(기록 · 큐레이션).
//
// 서버는 빌드한 번들(`ops/out/ctx/ctx.mjs`)로 띄운다 — 소스로 띄우면 화면에 「빌드 __CTX_BUILT__」 자리표시가 그대로 찍힌다.
// 쓰기는 전부 진짜 MCP `save` 다(서버가 검사 · 커밋 · author 를 채운다). 레포 파일을 손으로 고치지 않는다.

import { execFile, spawn } from 'node:child_process'
import { promisify } from 'node:util'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const run = promisify(execFile)
export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
export const NL = String.fromCharCode(10)
export const CLI = path.join(ROOT, 'ops/out/ctx/ctx.mjs')
// 서식집 · kit 은 소스 자리를 명시한다 — 번들이 `ops/out/ctx/` 에 있어 「번들 옆」 · 「소스」 자리를 스스로 못 찾는다
export const FORMS = path.join(ROOT, 'agent', 'forms')
export const KIT = path.join(ROOT, 'agent')

// 자식 프로세스에 이 PC 의 CDP 설정을 물려주지 않는다 — 설치 한 줄을 쓴 PC 에는 진짜 서버의 CDP_TOKEN 이 있고,
// CDP_KIT · CDP_FORMS · CDP_REPO 가 있으면 서버가 엉뚱한 자리를 읽는다(검증 하네스와 같은 규칙)
export const ENV = (() => {
  const e = { ...process.env }
  for (const k of ['CDP_TOKEN', 'CDP_KIT', 'CDP_FORMS', 'CDP_REPO', 'CDP_CONFIG_DIR']) delete e[k]
  return e
})()

export const ctx = (...args) => run(process.execPath, [CLI, ...args], { cwd: ROOT, env: ENV, encoding: 'utf8', maxBuffer: 64e6 })
export const git = (dir, ...args) => run('git', ['-C', dir, '-c', 'core.quotepath=false', ...args], { env: ENV, encoding: 'utf8', maxBuffer: 64e6 })
export const wait = (ms) => new Promise((r) => setTimeout(r, ms))

export function serve(args) {
  const p = spawn(process.execPath, [CLI, 'serve', ...args], { cwd: ROOT, env: ENV, stdio: ['ignore', 'ignore', 'pipe'] })
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

// ── 큐레이션의 글 ────────────────────────────────────────────────────────────

const VERDICT = { reflect: '반영', new: '새 문서', keep: '기록으로 둠' }

// 경과 한 줄 — `- 날짜 [`<id 의 주제>`](../work/<id>.md) 무엇이`(cdp-curate ⑤ · 서식 작성지침). 문서가 `docs/` 바로 아래라 `../work/`
export const progressLine = (w, what) => `- ${w.date.slice(0, 10)} [\`${w.id.slice(10)}\`](../work/${w.id}.md) ${what}`

// 섹션 본문 = 지금(현재형) + 끝의 경과 목록
export const withProgress = (body, lines) => body + NL + NL + '**경과**' + NL + lines.join(NL)

// 큐레이션 기록의 본문은 판정표다 — 좌표는 백틱 없이(큐레이션 기록은 touches 가 없다 · cdp-curate ⑦)
export function judgmentTable(c, { sections = 0, newDocs = [] } = {}) {
  const rows = c.judgments.map((j) => `| [${j.id}](${j.id}.md) | ${VERDICT[j.verdict]} | ${j.into?.length ? j.into.join(' · ') : j.reason || ''} |`)
  const head = `판정표 — 기록 ${c.judgments.length}건 · 섹션 ${sections}${newDocs.length ? ' · 새 문서 ' + newDocs.length : ''}`
  return [
    head,
    '',
    '| 기록 | 판정 | 어디로 · 사유 |',
    '|---|---|---|',
    ...rows,
    ...(c.canon ? ['', `**정본** — ${c.canon}`] : []),
    ...(newDocs.length ? ['', `**새 문서** — ${newDocs.join(' · ')}`] : []),
  ].join(NL)
}
