// 첨부 올리기 — 바이트를 잠시 들고 있다가 `save` 가 한 커밋에 넣는다. 그림 · 첨부 검토 v0.1 A2~A6.
//
// **올리기만으로 레포를 바꾸지 않는다.** 올린 즉시 트리에 쓰면 save 의 「트리가 더러우면 거절」(동시 기록 M8)에
// 걸리고, 올리고 save 를 안 한 첨부가 커밋 안 된 파일로 남는다. 그래서 레포 밖(`<data>/staging/`)에 **내용
// 해시 이름**으로 두고, save 가 `ref` 로 꺼내 작업 기록 · 섹션과 같이 쓴다. 같은 파일을 두 번 올려도 한 벌이다.
//
// 바이트는 MCP 도구 인자로 오지 않는다 — 모델이 파일을 토큰으로 옮겨 적어야 하고(300 KB 가 수십만 토큰)
// MCP 몸통 상한 2 MB 에 걸린다(검토 ㉠). 에이전트는 셸의 `curl --data-binary @파일` 로 보낸다.

import fs from 'node:fs/promises'
import path from 'node:path'
import crypto from 'node:crypto'
import { CtxError } from './tools.js'

export const ASSET_MAX = 10 * 1024 * 1024 // 한 파일
export const ASSETS_TOTAL_MAX = 30 * 1024 * 1024 // save 한 번
export const ASSETS_COUNT_MAX = 20
export const STAGING_TTL_MS = 24 * 60 * 60 * 1000

// 종류는 **바이트로** 가린다 — 확장자 · content-type 은 부르는 쪽이 아무렇게나 적을 수 있다.
// svg 는 받지 않는다: 스크립트를 담는 문서이고 파일 API 로 새 탭에 열면 이 출처에서 돈다(G5 · A4).
const KINDS = [
  { type: 'image/png', ext: ['.png'], magic: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { type: 'image/jpeg', ext: ['.jpg', '.jpeg'], magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', ext: ['.gif'], magic: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) },
  { type: 'image/webp', ext: ['.webp'], magic: (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { type: 'application/pdf', ext: ['.pdf'], magic: (b) => b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-' },
]
export const ASSET_EXTS = KINDS.flatMap((k) => k.ext)

// HTML 시각 자료를 낼 때의 CSP — 파일 API(`/file`)가 붙이고, 시험이 같은 글을 본다(HTML 시각 자료 검토 S1 · S2).
// `sandbox` 에 `allow-same-origin` 이 없으니 불투명 출처다. 밖으로 내보내는 길(`connect-src` · `img-src`)은 닫고,
// 클로드 코드가 내놓는 자료가 쓰는 CDN · 글꼴만 연다 — 폐쇄망이면 그것도 안 닿을 뿐이다
export const HTML_EXTS = ['.html', '.htm']
export const HTML_CDN = ['https://cdnjs.cloudflare.com', 'https://cdn.jsdelivr.net', 'https://unpkg.com']
export const HTML_FONT_HOSTS = ['https://fonts.googleapis.com', 'https://fonts.gstatic.com']
export const HTML_CSP = [
  'sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox',
  "default-src 'none'",
  `script-src 'unsafe-inline' ${HTML_CDN.join(' ')}`,
  `style-src 'unsafe-inline' https://fonts.googleapis.com ${HTML_CDN.join(' ')}`,
  `font-src data: https://fonts.gstatic.com ${HTML_CDN.join(' ')}`,
  'img-src data: blob:',
  "connect-src 'none'",
  "frame-ancestors 'self'",
].join('; ')

/** @returns {null | { type: string, ext: string[] }} */
export function sniff(buf) {
  const k = KINDS.find((x) => x.magic(buf))
  return k ? { type: k.type, ext: k.ext } : null
}

const REF = /^sha256:([0-9a-f]{64})$/

/** 올린 바이트를 들고 있는다 → `{ ref, size, type }`. 모르는 종류 · 빈 몸통 · 상한 초과는 CtxError */
export async function stage(dir, buf, { now = Date.now() } = {}) {
  if (!buf?.length) throw new CtxError('E_INPUT', '몸통이 비었다 — 파일 바이트를 그대로 보낸다(curl --data-binary @파일)')
  if (buf.length > ASSET_MAX) throw new CtxError('E_INPUT', `파일 하나는 ${ASSET_MAX / 1024 / 1024} MB 까지다`, { size: buf.length })
  const kind = sniff(buf)
  if (!kind) {
    throw new CtxError('E_INPUT', `받는 종류가 아니다 — ${ASSET_EXTS.join(' · ')} (내용으로 가린다 · svg 는 받지 않는다)`, { head: buf.subarray(0, 8).toString('hex') })
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, sha)
  if (!(await fs.stat(file).then((s) => s.size === buf.length).catch(() => false))) {
    // 반쯤 쓴 파일을 take 가 읽지 않게 — 옆 이름으로 쓰고 옮긴다
    const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex')
    await fs.writeFile(tmp, buf)
    await fs.rename(tmp, file)
  }
  await fs.writeFile(file + '.json', JSON.stringify({ type: kind.type, size: buf.length, at: now }))
  return { ref: 'sha256:' + sha, size: buf.length, type: kind.type, ext: kind.ext }
}

/** save 가 꺼낸다 → `{ buf, type, ext }`. 없거나 만료 · 해시가 안 맞으면 E_INPUT */
export async function take(dir, ref, { now = Date.now() } = {}) {
  const m = REF.exec(String(ref || ''))
  if (!m) throw new CtxError('E_INPUT', 'assets[].ref 는 올리기 응답의 ref(sha256:…) 다', { ref: String(ref).slice(0, 80) })
  const file = path.join(dir, m[1])
  const meta = await fs.readFile(file + '.json', 'utf8').then(JSON.parse).catch(() => null)
  const buf = await fs.readFile(file).catch(() => null)
  if (!buf || !meta || now - Number(meta.at || 0) > STAGING_TTL_MS) {
    throw new CtxError('E_INPUT', `올린 첨부가 없다 — ${STAGING_TTL_MS / 3600000}시간이 지났거나 다른 서버에 올렸다. 다시 올려 새 ref 로 보낸다`, { ref })
  }
  if (crypto.createHash('sha256').update(buf).digest('hex') !== m[1]) throw new CtxError('E_INPUT', '올린 첨부가 상했다 — 다시 올린다', { ref })
  const kind = sniff(buf)
  if (!kind) throw new CtxError('E_INPUT', '올린 첨부의 종류를 알 수 없다 — 다시 올린다', { ref })
  return { buf, type: kind.type, ext: kind.ext }
}

/** 만료된 것을 지운다. 올릴 때마다 한 번 — 따로 도는 타이머를 두지 않는다 */
export async function sweep(dir, { now = Date.now() } = {}) {
  const ents = await fs.readdir(dir).catch(() => [])
  let n = 0
  for (const e of ents) {
    if (!e.endsWith('.json')) continue
    const meta = await fs.readFile(path.join(dir, e), 'utf8').then(JSON.parse).catch(() => ({}))
    if (now - Number(meta.at || 0) <= STAGING_TTL_MS) continue
    await fs.rm(path.join(dir, e.slice(0, -5)), { force: true })
    await fs.rm(path.join(dir, e), { force: true })
    n++
  }
  // 옮기다 죽은 임시 파일
  for (const e of ents) if (/^[0-9a-f]{64}\.\d+\.[0-9a-f]{8}$/.test(e)) await fs.rm(path.join(dir, e), { force: true }).catch(() => {})
  return n
}

// 첨부 이름 — 파일 경로가 되는 마지막 문이다(A6). 한글 · 공백은 된다(문서 제목처럼 쓰인다).
export function checkAssetName(name) {
  const n = String(name ?? '')
  const bad = (why) => {
    throw new CtxError('E_INPUT', `assets[].name ${why} — "시스템 개요.png" 처럼 파일 이름 하나`, { name: n.slice(0, 120) })
  }
  if (!n.trim() || n !== n.trim()) bad('이 비었거나 앞뒤에 공백이 있다')
  if (n.length > 120) bad('이 너무 길다(120자)')
  if (/[\\/:*?"<>|\u0000-\u001f\u007f]/.test(n)) bad('에 경로 구분자 · 예약 문자가 있다')
  if (n.startsWith('.') || n.endsWith('.')) bad('가 점으로 시작하거나 끝난다')
  const ext = path.extname(n).toLowerCase()
  if (!ASSET_EXTS.includes(ext)) bad(`의 확장자가 받는 것이 아니다(${ASSET_EXTS.join(' · ')})`)
  return ext
}
