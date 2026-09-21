// zip — kit 꾸러미를 만들고 푼다. 설계서 §4.3 `GET /kit/<name>`.
//
// **의존성을 더하지 않는다.** `bin/ctx.mjs` 는 지식 레포 안에 단일 파일로
// 들어가고 Node 없는 PC 에서는 exe 가 같은 코드를 돌린다(`ctx-cli.mjs` 머리말).
// zip 라이브러리 하나를 위해 그 성질을 깨지 않는다 — 규격에서 우리가 쓰는
// 부분은 작고, `node:zlib` 이 압축을 해 준다.
//
// **진짜 zip 이어야 한다.** 사람이 내려받아 탐색기에서 푸는 경로가 있으므로
// (§6.7.3) 우리 코드만 읽을 수 있는 형식으로 만들면 안 된다.
//
// 쓰는 범위 — 디플레이트 · UTF-8 이름 · 디렉터리 항목 없음 · zip64 없음.
// kit 은 파일 열 개 남짓이라 이것으로 충분하다.

import zlib from 'node:zlib'
import { promisify } from 'node:util'

const deflateRaw = promisify(zlib.deflateRaw)
const inflateRaw = promisify(zlib.inflateRaw)

// CRC32 — zip 이 무결성에 쓰는 것. 테이블을 한 번 만들어 둔다.
const TABLE = (() => {
  const t = new Int32Array(256)
  for (let i = 0; i < 256; i++) {
    let c = i
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[i] = c
  }
  return t
})()

export function crc32(buf) {
  let c = -1
  for (let i = 0; i < buf.length; i++) c = TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ -1) >>> 0
}

// DOS 시각. zip 은 1980년 기준의 2초 단위를 쓴다.
function dosTime(d) {
  const t = ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() >> 1)) & 0xffff
  const dt = (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xffff
  return { t, dt }
}

// entries: [{ name, data: Buffer|string }]
export async function zip(entries, { now = new Date() } = {}) {
  const { t, dt } = dosTime(now)
  const locals = []
  const central = []
  let offset = 0

  for (const e of entries) {
    const name = Buffer.from(e.name.split('\\').join('/'), 'utf8')
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8')
    const comp = await deflateRaw(raw, { level: 9 })
    // 압축이 되레 커지는 파일이 있다 — 그때는 그냥 담는다(method 0).
    const useDeflate = comp.length < raw.length
    const body = useDeflate ? comp : raw
    const crc = crc32(raw)

    const lh = Buffer.alloc(30)
    lh.writeUInt32LE(0x04034b50, 0)
    lh.writeUInt16LE(20, 4) // version needed
    lh.writeUInt16LE(0x0800, 6) // flag: 이름이 UTF-8
    lh.writeUInt16LE(useDeflate ? 8 : 0, 8)
    lh.writeUInt16LE(t, 10)
    lh.writeUInt16LE(dt, 12)
    lh.writeUInt32LE(crc, 14)
    lh.writeUInt32LE(body.length, 18)
    lh.writeUInt32LE(raw.length, 22)
    lh.writeUInt16LE(name.length, 26)
    lh.writeUInt16LE(0, 28)
    locals.push(lh, name, body)

    const ch = Buffer.alloc(46)
    ch.writeUInt32LE(0x02014b50, 0)
    ch.writeUInt16LE(20, 4) // version made by
    ch.writeUInt16LE(20, 6)
    ch.writeUInt16LE(0x0800, 8)
    ch.writeUInt16LE(useDeflate ? 8 : 0, 10)
    ch.writeUInt16LE(t, 12)
    ch.writeUInt16LE(dt, 14)
    ch.writeUInt32LE(crc, 16)
    ch.writeUInt32LE(body.length, 20)
    ch.writeUInt32LE(raw.length, 24)
    ch.writeUInt16LE(name.length, 28)
    // `<< 16` 은 부호 있는 32비트라 음수가 된다. `>>> 0` 으로 되돌린다.
    ch.writeUInt32LE((0o100644 << 16) >>> 0, 38) // 외부 속성 — POSIX 권한
    ch.writeUInt32LE(offset, 42)
    central.push(ch, name)

    offset += lh.length + name.length + body.length
  }

  const cd = Buffer.concat(central)
  const eocd = Buffer.alloc(22)
  eocd.writeUInt32LE(0x06054b50, 0)
  eocd.writeUInt16LE(entries.length, 8)
  eocd.writeUInt16LE(entries.length, 10)
  eocd.writeUInt32LE(cd.length, 12)
  eocd.writeUInt32LE(offset, 16)
  return Buffer.concat([...locals, cd, eocd])
}

// 중앙 디렉터리에서 읽는다. 로컬 헤더가 아니라 이쪽이 정본이다 --
// 스트리밍으로 만든 zip 은 로컬 헤더의 크기가 0 일 수 있다.
export async function unzip(buf) {
  const eo = findEOCD(buf)
  if (eo < 0) throw new Error('zip 이 아니다 (EOCD 없음)')
  const count = buf.readUInt16LE(eo + 10)
  let p = buf.readUInt32LE(eo + 16)
  const out = []

  for (let i = 0; i < count; i++) {
    if (buf.readUInt32LE(p) !== 0x02014b50) throw new Error('중앙 디렉터리가 깨졌다')
    const method = buf.readUInt16LE(p + 10)
    const csize = buf.readUInt32LE(p + 20)
    const usize = buf.readUInt32LE(p + 24)
    const nlen = buf.readUInt16LE(p + 28)
    const elen = buf.readUInt16LE(p + 30)
    const clen = buf.readUInt16LE(p + 32)
    const lo = buf.readUInt32LE(p + 42)
    const name = buf.toString('utf8', p + 46, p + 46 + nlen)
    p += 46 + nlen + elen + clen

    // 로컬 헤더를 건너뛴다 (가변 길이 둘이 로컬에 따로 적혀 있다)
    const lnlen = buf.readUInt16LE(lo + 26)
    const lelen = buf.readUInt16LE(lo + 28)
    const start = lo + 30 + lnlen + lelen
    const body = buf.subarray(start, start + csize)
    const data = method === 8 ? await inflateRaw(body) : Buffer.from(body)
    if (data.length !== usize) throw new Error(`크기가 다르다: ${name}`)
    out.push({ name, data })
  }
  return out
}

function findEOCD(buf) {
  // 주석이 붙어 있을 수 있어 뒤에서 찾는다. 상한은 규격상 64KB + 22.
  const from = Math.max(0, buf.length - 0x10016)
  for (let i = buf.length - 22; i >= from; i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) return i
  }
  return -1
}
