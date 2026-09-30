// 망 — CIDR 판정과 속도 제한. 제품관리서비스 검토 §4.3.
//
// 둘 다 **순수하다.** 시계를 인자로 받고 소켓을 보지 않는다 — 그래야 "21번째가
// 거절된다" 를 테스트로 고정할 수 있다. 서버(`ctx-mcp-serve.mjs`)가 소켓 주소와
// 지금 시각을 넣어 부른다.
//
// **`X-Forwarded-For` 는 여기서 보지 않는다.** 프록시가 없는 배치에서 그 헤더는
// 누구나 쓸 수 있는 값이라, 그것으로 대역을 판정하면 제한이 없는 것과 같다.
// 프록시 뒤라면 IP 제한은 프록시가 한다(MCP 설계서 §4.4).

// ── CIDR ────────────────────────────────────────────────────────────────────

function ipv4ToInt(s) {
  const m = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(String(s || '').trim())
  if (!m) return null
  let n = 0
  for (let i = 1; i <= 4; i++) {
    const o = Number(m[i])
    if (o > 255) return null
    n = n * 256 + o
  }
  return n
}

// `::ffff:10.0.0.1` — Node 가 듀얼스택 소켓에서 IPv4 를 이렇게 낸다.
export function normalizeIp(ip) {
  const s = String(ip || '').trim()
  const m = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i.exec(s)
  return m ? m[1] : s
}

// `'192.168.0.0/24, 127.0.0.1, ::1'` → 규칙 목록. 잘못된 조각은 **던진다** —
// 조용히 빼면 "제한했다고 믿는데 열려 있는" 상태가 된다.
export function parseCidrs(spec) {
  const out = []
  for (const raw of String(spec || '').split(',')) {
    const part = raw.trim()
    if (!part) continue
    const [addr, bitsStr] = part.split('/')
    const v4 = ipv4ToInt(addr)
    if (v4 !== null) {
      const bits = bitsStr === undefined ? 32 : Number(bitsStr)
      if (!Number.isInteger(bits) || bits < 0 || bits > 32) throw new Error(`CIDR 비트가 틀렸다: ${part}`)
      const mask = bits === 0 ? 0 : (0xffffffff << (32 - bits)) >>> 0
      out.push({ kind: 'v4', base: (v4 & mask) >>> 0, mask, text: part })
      continue
    }
    // IPv6 — 정확 일치만. 사내 배치가 IPv4 라 마스크까지 구현하지 않는다.
    if (/^[0-9a-f:]+$/i.test(addr) && addr.includes(':') && bitsStr === undefined) {
      out.push({ kind: 'v6', text: addr.toLowerCase() })
      continue
    }
    throw new Error(`CIDR 형식이 아니다: ${part}`)
  }
  return out
}

export function ipInCidrs(ip, cidrs) {
  if (!cidrs || !cidrs.length) return true // 제한이 없다
  const s = normalizeIp(ip)
  const v4 = ipv4ToInt(s)
  for (const c of cidrs) {
    if (c.kind === 'v4' && v4 !== null && ((v4 & c.mask) >>> 0) === c.base) return true
    if (c.kind === 'v6' && s.toLowerCase() === c.text) return true
  }
  return false
}

// ── 속도 제한 ───────────────────────────────────────────────────────────────
//
// IP 마다 미끄러지는 창. `limit` 번째까지 통과하고 그 다음이 거절이다.
// 실패만 세지 않고 **시도를 센다** — 실패 여부를 판정하기 전에 막는 것이
// 이 장치의 일이다. 20/분은 사람에게는 넉넉하고 사전 대입에는 모자란다.

export function makeLimiter({ limit = 20, windowMs = 60_000, now = Date.now } = {}) {
  const hits = new Map()
  const prune = (arr, t) => {
    let i = 0
    while (i < arr.length && arr[i] <= t - windowMs) i++
    if (i) arr.splice(0, i)
    return arr
  }
  return {
    hit(ip) {
      const key = normalizeIp(ip) || '-'
      const t = now()
      // 표가 자라기만 하면 메모리가 새는 것이라 가끔 전체를 훑어 빈 것을 지운다
      if (hits.size > 5000) {
        for (const [k, arr] of hits) if (!prune(arr, t).length) hits.delete(k)
      }
      const arr = prune(hits.get(key) || [], t)
      arr.push(t)
      hits.set(key, arr)
      const ok = arr.length <= limit
      return { ok, remaining: Math.max(0, limit - arr.length), retryAfterMs: ok ? 0 : windowMs - (t - arr[0]) }
    },
    reset(ip) {
      hits.delete(normalizeIp(ip) || '-')
    },
  }
}
