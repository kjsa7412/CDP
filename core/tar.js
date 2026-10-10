// tar.gz — 서버 산출물을 싸고 푼다. 제품화 2 검토 §2 S1.
//
// **왜 시스템 tar 를 안 쓰나.** macOS 의 bsdtar 는 디스크에서 NFC 인 한글 파일명을
// **NFD 로 바꿔** 싼다(`manual/사용자_설명서.md` → 자모가 갈린 이름). 그 tar 를
// Linux 에 풀면 `kit/CLAUDE-프로젝트레포.md` 를 NFC 이름으로 찾는 코드가 못 읽고,
// 설명서 색인의 `/_설명서\.md$/` 가 안 맞는다 — 조용히 빠진다. 이름을 우리가 쓴다.
//
// 쓰는 범위 — ustar + pax 확장 헤더(`path` · UTF-8 · 긴 이름) · 파일과 디렉터리만 ·
// 모드는 실행 비트만 살린다. 읽는 쪽은 같은 범위에 GNU 긴 이름(`L`)을 더한다.
// 의존성을 더하지 않는다(`zip.js` 와 같은 이유).

import fs from 'node:fs'
import path from 'node:path'
import zlib from 'node:zlib'

const BLOCK = 512

function octal(n, len) {
  return n.toString(8).padStart(len - 1, '0') + '\0'
}

function header({ name, size, mode, mtime, type }) {
  const b = Buffer.alloc(BLOCK)
  b.write(name, 0, 100, 'utf8')
  b.write(octal(mode, 8), 100, 8, 'ascii')
  b.write(octal(0, 8), 108, 8, 'ascii')
  b.write(octal(0, 8), 116, 8, 'ascii')
  b.write(octal(size, 12), 124, 12, 'ascii')
  b.write(octal(mtime, 12), 136, 12, 'ascii')
  b.fill(' ', 148, 156)
  b.write(type, 156, 1, 'ascii')
  b.write('ustar\0', 257, 6, 'ascii')
  b.write('00', 263, 2, 'ascii')
  let sum = 0
  for (let i = 0; i < BLOCK; i++) sum += b[i]
  b.write(octal(sum, 7) + ' ', 148, 8, 'ascii')
  return b
}

function pad(size) {
  const r = size % BLOCK
  return r ? Buffer.alloc(BLOCK - r) : Buffer.alloc(0)
}

function paxRecord(key, value) {
  const body = ` ${key}=${value}\n`
  let len = Buffer.byteLength(body) + 1
  while (String(len).length + Buffer.byteLength(body) !== len) len = String(len).length + Buffer.byteLength(body)
  return `${len}${body}`
}

// entries — [{ name, data?: Buffer, dir?: true, mode? }]. 이름은 '/' 구분 · NFC 로 맞춘다.
export function packTar(entries, { mtime = Math.floor(Date.now() / 1000) } = {}) {
  const parts = []
  for (const e of entries) {
    const name = String(e.name).normalize('NFC').replace(/\\/g, '/') + (e.dir && !e.name.endsWith('/') ? '/' : '')
    const data = e.dir ? Buffer.alloc(0) : e.data
    const mode = e.mode ?? (e.dir ? 0o755 : 0o644)
    // ASCII 100바이트 안이면 ustar 이름 하나로, 아니면 pax `path` 를 앞에 둔다(UTF-8 이름은 늘 pax — 읽는 쪽이 고르지 않게).
    const plain = /^[\x20-\x7e]*$/.test(name) && name.length < 100
    if (!plain) {
      const rec = Buffer.from(paxRecord('path', name), 'utf8')
      parts.push(header({ name: 'PaxHeader/' + name.replace(/[^\x20-\x7e]/g, '_').slice(-80), size: rec.length, mode: 0o644, mtime, type: 'x' }), rec, pad(rec.length))
    }
    const short = plain ? name : name.replace(/[^\x20-\x7e]/g, '_').slice(-99)
    parts.push(header({ name: short, size: data.length, mode, mtime, type: e.dir ? '5' : '0' }))
    if (data.length) parts.push(data, pad(data.length))
  }
  parts.push(Buffer.alloc(BLOCK * 2))
  return zlib.gzipSync(Buffer.concat(parts), { level: 9 })
}

// 폴더 하나를 `<prefix>/…` 로 싼다. 실행 비트(소유자 x)는 살린다 — `bin/ctx` · `deploy/*.sh`.
export function packDir(dir, prefix) {
  const entries = [{ name: prefix, dir: true }]
  ;(function walk(d, rel) {
    for (const e of fs.readdirSync(d, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
      const p = path.join(d, e.name)
      const r = rel + '/' + e.name
      if (e.isDirectory()) {
        entries.push({ name: r, dir: true })
        walk(p, r)
      } else if (e.isFile()) {
        const st = fs.statSync(p)
        entries.push({ name: r, data: fs.readFileSync(p), mode: st.mode & 0o100 ? 0o755 : 0o644 })
      }
    }
  })(dir, prefix)
  return packTar(entries)
}

function readOctal(b, off, len) {
  const s = b.toString('ascii', off, off + len).replace(/\0.*$/, '').trim()
  return s ? parseInt(s, 8) : 0
}

// tar.gz(또는 tar) Buffer → [{ name, data, dir, mode }]. 이름은 NFC 로.
export function unpackTar(buf) {
  const raw = buf[0] === 0x1f && buf[1] === 0x8b ? zlib.gunzipSync(buf) : buf
  const out = []
  let off = 0
  let nextName = null
  while (off + BLOCK <= raw.length) {
    const h = raw.subarray(off, off + BLOCK)
    if (h.every((x) => x === 0)) break
    const type = String.fromCharCode(h[156] || 0x30)
    const size = readOctal(h, 124, 12)
    const mode = readOctal(h, 100, 8)
    let name = h.toString('utf8', 0, 100).replace(/\0.*$/s, '')
    const prefix = h.toString('utf8', 345, 500).replace(/\0.*$/s, '')
    if (prefix) name = prefix + '/' + name
    const data = raw.subarray(off + BLOCK, off + BLOCK + size)
    off += BLOCK + Math.ceil(size / BLOCK) * BLOCK
    if (type === 'x') {
      const m = /(?:^|\n)\d+ path=([^\n]*)\n/.exec(data.toString('utf8'))
      if (m) nextName = m[1]
      continue
    }
    if (type === 'L') {
      nextName = data.toString('utf8').replace(/\0.*$/s, '')
      continue
    }
    if (type === 'g') continue
    if (nextName) {
      name = nextName
      nextName = null
    }
    name = name.normalize('NFC')
    if (type === '5') out.push({ name: name.replace(/\/$/, ''), dir: true, mode })
    else if (type === '0' || type === '\0') out.push({ name, data: Buffer.from(data), mode })
  }
  return out
}

// 푼다 — `dest` 밖으로 나가는 이름은 거절한다(`..` · 절대 경로).
export function extractTar(buf, dest) {
  const root = path.resolve(dest)
  const written = []
  for (const e of unpackTar(buf)) {
    const p = path.resolve(root, e.name)
    if (p !== root && !p.startsWith(root + path.sep)) throw new Error(`tar 밖으로 나가는 이름: ${e.name}`)
    if (e.dir) fs.mkdirSync(p, { recursive: true })
    else {
      fs.mkdirSync(path.dirname(p), { recursive: true })
      fs.writeFileSync(p, e.data, { mode: e.mode & 0o100 ? 0o755 : 0o644 })
      written.push(e.name)
    }
  }
  return written
}
