// 읽기 API — 로컬 뷰어와 관리 서비스가 **같은 것을 쓴다.** MCP 설계서 §6.2.
//
// 왜 뽑았나 — §6.2 는 라우트를 셋으로 갈랐다: 레포를 읽는다 · 이 PC 를 만진다 ·
// 뜻이 갈린다. 첫 줄은 두 서버가 똑같이 내야 하는데, 두 곳에 각자 쓰면
// "로컬에서는 되는데 원격에서는 다르게 나온다" 가 생기고 그 차이는 화면에서만
// 드러난다.
//
// **여기 있는 것은 전부 읽기다.** 파일을 쓰거나 git 을 바꾸는 것은 하나도 없다 —
// `store` 를 읽고 돌려줄 뿐이다. 그래서 관리 서비스가 그대로 열어도 안전하다.
//
// `handled` 를 돌려준다. `false` 면 부르는 쪽이 자기 라우트를 이어서 본다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { resolveInside } from './security.js'

// 화면 자산도 이 표를 쓴다(관리 서비스의 `serveWeb`). **`.js` 가 빠지면
// 브라우저가 모듈 실행을 거부한다** — 화면이 통째로 안 뜬다.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.map': 'application/json; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.pdf': 'application/pdf',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
}

export async function handleRead({ p, method, url, res, send, store }) {
  if (p === '/repo' && method === 'GET') {
    send(res, 200, store.repoInfo())
    return true
  }

  if (p === '/docs') {
    const list = store.listUnits()
    const others = store.docs
      .filter((d) => !d.isUnit)
      .map((d) => ({ id: d.id, path: d.path, title: d.title, isUnit: false }))
    send(res, 200, { total: list.length, docs: list, others })
    return true
  }

  if (p.startsWith('/docs/')) {
    const key = decodeURIComponent(p.slice('/docs/'.length))
    const d = store.detail(key)
    if (!d) send(res, 404, { error: 'not-found', key })
    else send(res, 200, d)
    return true
  }

  // 뻗어나가기 — 한 노드의 다음 레벨 하나. 화면 왼쪽 아래가 이것만 쓴다.
  if (p === '/next') {
    const kind = url.searchParams.get('kind')
    const key = url.searchParams.get('key')
    const r = store.nextNodes(kind, key)
    if (!r) send(res, 404, { error: 'not-found', kind, key })
    else send(res, 200, r)
    return true
  }

  if (p === '/vocab') {
    send(res, 200, store.tree())
    return true
  }

  if (p === '/timeline') {
    const coord = url.searchParams.get('coord')
    if (!coord) send(res, 400, { error: 'coord required' })
    else send(res, 200, store.timeline(coord))
    return true
  }

  if (p === '/search') {
    send(res, 200, store.search(url.searchParams.get('q'), { force: url.searchParams.get('force') === '1' }))
    return true
  }

  if (p === '/check') {
    send(res, 200, store.check())
    return true
  }

  // 현황 — 화면과 `ctx brief` 가 **같은 계산**을 쓴다(core/repo.js repoStatus).
  if (p === '/status') {
    send(res, 200, store.status())
    return true
  }

  if (p === '/managed') {
    send(res, 200, store.managedList())
    return true
  }

  // 좌표 하나의 전모 — 지금 상태(섹션 본문) + 그것을 바꾼 작업 목록.
  if (p === '/coord') {
    const c = url.searchParams.get('coord')
    if (!c) send(res, 400, { error: 'coord 가 필요합니다' })
    else send(res, 200, store.coordDetail(c))
    return true
  }

  // git — GET 은 읽기만 한다. `?fetch=1` 은 fetch 까지 하는데 작업 트리를
  // 건드리지 않으므로 안전하다. **pull · push 는 여기 없다** — 그것은
  // 로컬 뷰어의 것이고 관리 서비스에서는 404 다(§6.2).
  if (p === '/git' && method === 'GET') {
    send(res, 200, await store.gitStatus({ fetch: url.searchParams.get('fetch') === '1' }))
    return true
  }

  if (p === '/git/config' && method === 'GET') {
    const { readConfig } = await import('../../../core/git.js')
    send(res, 200, await readConfig(store.root))
    return true
  }

  // 레포 안의 파일 하나. **`root` 밖은 열지 않는다** — 경로 검사는
  // `resolveInside` 한 곳에만 있다.
  if (p === '/file') {
    const rel = url.searchParams.get('path')
    const r = await resolveInside(store.root, rel || '')
    if (!r.ok) {
      send(res, r.reason === 'outside' ? 403 : 404, { error: r.reason, resolved: r.resolved || null })
      return true
    }
    const ext = path.extname(r.abs).toLowerCase()
    send(res, 200, await fs.readFile(r.abs), { 'content-type': MIME[ext] || 'application/octet-stream' })
    return true
  }

  return false
}

export { MIME }
