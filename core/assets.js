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
// 한 사람이 들고 있는(아직 save 에 안 실린 · 만료 전) 첨부의 합 — 들이기가 폴더째 올려도 서버 디스크가 끝없이 차지 않게(G14)
export const STAGING_USER_MAX = 500 * 1024 * 1024

// 종류는 **바이트로** 가린다 — 확장자 · content-type 은 부르는 쪽이 아무렇게나 적을 수 있다.
// svg 는 받지 않는다: 스크립트를 담는 문서이고 파일 API 로 새 탭에 열면 이 출처에서 돈다(G5 · A4).
const KINDS = [
  { type: 'image/png', ext: ['.png'], magic: (b) => b.length > 8 && b.readUInt32BE(0) === 0x89504e47 && b.readUInt32BE(4) === 0x0d0a1a0a },
  { type: 'image/jpeg', ext: ['.jpg', '.jpeg'], magic: (b) => b.length > 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { type: 'image/gif', ext: ['.gif'], magic: (b) => b.length > 6 && /^GIF8[79]a$/.test(b.toString('latin1', 0, 6)) },
  { type: 'image/webp', ext: ['.webp'], magic: (b) => b.length > 12 && b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP' },
  { type: 'application/pdf', ext: ['.pdf'], magic: (b) => b.length > 5 && b.toString('latin1', 0, 5) === '%PDF-' },
  // HTML 시각 자료(검토 S4 · W1) — 스크립트를 담지만 받는다. 낼 때 sandbox CSP(`HTML_CSP`)로 불투명 출처가 된다.
  // svg 를 거절한 것과 다른 까닭: svg 는 `<img>` 로 본문에 박혀 그 틀이 없고, 이것은 늘 자기 문서로 열린다
  { type: 'text/html', ext: ['.html', '.htm'], magic: isHtml },
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

// HTML 시각 자료를 화면 테마로 — 루트에 `data-theme` 하나를 넣는다(HTML 시각 자료 검토 V6).
//
// 틀 요소의 `color-scheme` 으로 틀 안 `prefers-color-scheme` 을 바꾸는 길은 Chrome 154 에서 듣지 않았다(실측 — 같은 출처
// srcdoc 도). 틀은 불투명 출처라 화면이 안을 만질 수도 없다. 그래서 낼 때 넣는다: 클로드 코드가 내놓는 자료는
// `:root[data-theme="dark"]` · `:root:not([data-theme="light"])` 로 테마를 받는다. 그 규약을 안 쓰는 자료는 OS 를 따른다.
//
// doctype **뒤에** `<html data-theme>` 를 끼운다 — 앞에 두면 quirks 모드다. 원래의 `<html lang>` 이 뒤에 오면 HTML
// 파서가 그 속성을 루트에 더한다. 이미 `data-theme` 을 단 문서는 건드리지 않는다
export function themeHtml(buf, theme) {
  if (theme !== 'light' && theme !== 'dark') return buf
  const s = buf.toString('utf8')
  const head = s.slice(0, 8192)
  if (/<html\b[^>]*\sdata-theme\s*=/i.test(head)) return buf
  const m = /^\uFEFF?\s*(?:<!--[\s\S]*?-->\s*)*<!doctype[^>]*>/i.exec(s)
  const at = m ? m[0].length : s.startsWith('\uFEFF') ? 1 : 0
  return Buffer.from(s.slice(0, at) + `<html data-theme="${theme}">` + s.slice(at), 'utf8')
}

// HTML 인가 — BOM · 공백 · `<!-- -->` 주석 뒤 첫 태그가 `<!doctype html` 또는 `<html`, 그리고 **전체가 UTF-8 로 풀린다.**
// 다른 것을 `.html` 이라 부르며 올리지 못하게 바이트로 가린다
function isHtml(b) {
  let head = b.subarray(0, 4096).toString('utf8').replace(/^\uFEFF/, '')
  for (;;) {
    head = head.replace(/^\s+/, '')
    if (!head.startsWith('<!--')) break
    const end = head.indexOf('-->')
    if (end < 0) return false
    head = head.slice(end + 3)
  }
  if (!/^<(!doctype\s+html|html)[\s>]/i.test(head)) return false
  try {
    new TextDecoder('utf-8', { fatal: true }).decode(b)
    return true
  } catch {
    return false
  }
}

/** @returns {null | { type: string, ext: string[] }} */
export function sniff(buf) {
  const k = KINDS.find((x) => x.magic(buf))
  return k ? { type: k.type, ext: k.ext } : null
}

const REF = /^sha256:([0-9a-f]{64})$/

/** 이 사람이 들고 있는 첨부의 합(만료 전) — 같은 내용을 여럿이 올렸으면 마지막에 올린 사람의 것으로 센다 */
export async function usageOf(dir, by, { now = Date.now() } = {}) {
  let total = 0
  for (const e of await fs.readdir(dir).catch(() => [])) {
    if (!e.endsWith('.json')) continue
    const meta = await fs.readFile(path.join(dir, e), 'utf8').then(JSON.parse).catch(() => null)
    if (!meta || meta.by !== by || now - Number(meta.at || 0) > STAGING_TTL_MS) continue
    total += Number(meta.size || 0)
  }
  return total
}

/** 올린 바이트를 들고 있는다 → `{ ref, size, type }`. 모르는 종류 · 빈 몸통 · 상한 초과는 CtxError.
 *  `by` 를 주면 그 사람의 합이 `userMax` 를 넘을 때 E_TOO_LARGE(413) — 이미 들고 있는 같은 내용은 다시 세지 않는다 */
export async function stage(dir, buf, { now = Date.now(), by = null, userMax = STAGING_USER_MAX } = {}) {
  if (!buf?.length) throw new CtxError('E_INPUT', '몸통이 비었다 — 파일 바이트를 그대로 보낸다(curl --data-binary @파일)')
  if (buf.length > ASSET_MAX) throw new CtxError('E_INPUT', `파일 하나는 ${ASSET_MAX / 1024 / 1024} MB 까지다`, { size: buf.length })
  const kind = sniff(buf)
  if (!kind) {
    throw new CtxError('E_INPUT', `받는 종류가 아니다 — ${ASSET_EXTS.join(' · ')} (내용으로 가린다 · svg 는 받지 않는다)`, { head: buf.subarray(0, 8).toString('hex') })
  }
  const sha = crypto.createHash('sha256').update(buf).digest('hex')
  await fs.mkdir(dir, { recursive: true })
  const file = path.join(dir, sha)
  if (by) {
    const had = await fs.readFile(file + '.json', 'utf8').then(JSON.parse).catch(() => null)
    const mine = had && had.by === by && now - Number(had.at || 0) <= STAGING_TTL_MS
    const used = await usageOf(dir, by, { now })
    if (!mine && used + buf.length > userMax) {
      throw new CtxError('E_TOO_LARGE', `올려 둔 첨부가 ${Math.round(used / 1024 / 1024)} MB 다 — 한 사람 ${userMax / 1024 / 1024} MB 까지. save 에 실어 들이거나 ${STAGING_TTL_MS / 3600000}시간 뒤 비워진 다음 올린다`, { used, size: buf.length, max: userMax })
    }
  }
  if (!(await fs.stat(file).then((s) => s.size === buf.length).catch(() => false))) {
    // 반쯤 쓴 파일을 take 가 읽지 않게 — 옆 이름으로 쓰고 옮긴다
    const tmp = file + '.' + process.pid + '.' + crypto.randomBytes(4).toString('hex')
    await fs.writeFile(tmp, buf)
    await fs.rename(tmp, file)
  }
  await fs.writeFile(file + '.json', JSON.stringify({ type: kind.type, size: buf.length, at: now, ...(by ? { by } : {}) }))
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
