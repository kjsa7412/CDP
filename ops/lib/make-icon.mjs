// 아이콘 생성 — 의존성 없이 .ico 를 직접 만든다.
//
// 트레이가 그리는 마크(파란 사각형 + 흰 줄 셋)와 같은 모양이어야 한다.
// 작업표시줄·탐색기·트레이에서 같은 것으로 보여야 하기 때문이다.
//
// ICO 안에 PNG 를 넣는 형식(Vista+)도 있지만 그러면 zlib 압축이 필요하다.
// 무압축 DIB(BMP)는 바이트를 그대로 쓰면 되므로 더 단순하다.
//
//   node ops/lib/make-icon.mjs [출력경로]

import fs from 'node:fs'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const SIZES = [16, 24, 32, 48, 64, 256]

// 색 — src/styles/tokens.css 의 --accent 와 같다
const BLUE = [47, 111, 219]
const WHITE = [255, 255, 255]

// 한 변이 s 인 정사각형 아이콘의 픽셀을 만든다. 반환은 RGBA 배열.
function draw(s) {
  const px = new Uint8Array(s * s * 4) // RGBA
  const set = (x, y, [r, g, b], a = 255) => {
    if (x < 0 || y < 0 || x >= s || y >= s) return
    const i = (y * s + x) * 4
    px[i] = r
    px[i + 1] = g
    px[i + 2] = b
    px[i + 3] = a
  }

  const u = s / 32 // 32px 기준으로 그리고 배율을 곱한다
  const rect = (x, y, w, h, color) => {
    for (let yy = Math.round(y * u); yy < Math.round((y + h) * u); yy++) {
      for (let xx = Math.round(x * u); xx < Math.round((x + w) * u); xx++) set(xx, yy, color)
    }
  }

  // 본체
  rect(3, 2, 26, 28, BLUE)

  // 모서리 한 픽셀씩 깎아 각진 느낌을 줄인다 (작은 크기에서 효과가 크다)
  const r = Math.max(1, Math.round(2 * u))
  const clearCorner = (cx, cy, sx, sy) => {
    for (let i = 0; i < r; i++) {
      for (let j = 0; j < r - i; j++) {
        const x = cx + sx * i
        const y = cy + sy * j
        const idx = (y * s + x) * 4
        if (idx >= 0 && idx < px.length) px[idx + 3] = 0
      }
    }
  }
  const x0 = Math.round(3 * u)
  const x1 = Math.round(29 * u) - 1
  const y0 = Math.round(2 * u)
  const y1 = Math.round(30 * u) - 1
  clearCorner(x0, y0, 1, 1)
  clearCorner(x1, y0, -1, 1)
  clearCorner(x0, y1, 1, -1)
  clearCorner(x1, y1, -1, -1)

  // 본문 줄 셋 — 마지막 줄이 짧아 "문서"로 읽힌다
  rect(8, 9, 16, 3, WHITE)
  rect(8, 15, 16, 3, WHITE)
  rect(8, 21, 10, 3, WHITE)

  return px
}

// RGBA → ICO 한 장의 DIB (BITMAPINFOHEADER + BGRA 하단부터 + AND 마스크)
function toDib(px, s) {
  const header = Buffer.alloc(40)
  header.writeUInt32LE(40, 0) // biSize
  header.writeInt32LE(s, 4) // biWidth
  header.writeInt32LE(s * 2, 8) // biHeight — XOR + AND 를 합친 높이
  header.writeUInt16LE(1, 12) // biPlanes
  header.writeUInt16LE(32, 14) // biBitCount
  header.writeUInt32LE(0, 16) // BI_RGB

  const xor = Buffer.alloc(s * s * 4)
  for (let y = 0; y < s; y++) {
    const srcY = s - 1 - y // DIB 는 아래에서 위로
    for (let x = 0; x < s; x++) {
      const si = (srcY * s + x) * 4
      const di = (y * s + x) * 4
      xor[di] = px[si + 2] // B
      xor[di + 1] = px[si + 1] // G
      xor[di + 2] = px[si] // R
      xor[di + 3] = px[si + 3] // A
    }
  }

  // AND 마스크 — 32bpp 에서는 알파를 쓰므로 0으로 채우되 크기는 맞춰야 한다
  const maskRow = Math.ceil(s / 32) * 4
  const mask = Buffer.alloc(maskRow * s)

  return Buffer.concat([header, xor, mask])
}

export function buildIco() {
  const images = SIZES.map((s) => ({ s, dib: toDib(draw(s), s) }))

  const dir = Buffer.alloc(6)
  dir.writeUInt16LE(0, 0)
  dir.writeUInt16LE(1, 2) // 1 = ICO
  dir.writeUInt16LE(images.length, 4)

  const entries = []
  let offset = 6 + images.length * 16
  for (const img of images) {
    const e = Buffer.alloc(16)
    e.writeUInt8(img.s >= 256 ? 0 : img.s, 0) // 256 은 0 으로 표기한다
    e.writeUInt8(img.s >= 256 ? 0 : img.s, 1)
    e.writeUInt8(0, 2) // 팔레트 없음
    e.writeUInt8(0, 3)
    e.writeUInt16LE(1, 4) // planes
    e.writeUInt16LE(32, 6) // bpp
    e.writeUInt32LE(img.dib.length, 8)
    e.writeUInt32LE(offset, 12)
    entries.push(e)
    offset += img.dib.length
  }

  return Buffer.concat([dir, ...entries, ...images.map((i) => i.dib)])
}

// Windows 에서 file:// 슬래시 개수가 달라 문자열 비교는 어긋난다. pathToFileURL 을 쓴다.
if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  const out = process.argv[2] || path.join(process.cwd(), 'build', 'cdp.ico')
  fs.mkdirSync(path.dirname(out), { recursive: true })
  fs.writeFileSync(out, buildIco())
  console.log(`[make-icon] ${out} (${SIZES.join('/')}px, ${(fs.statSync(out).size / 1024).toFixed(1)}KB)`)
}
