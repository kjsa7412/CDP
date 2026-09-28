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
import { zip } from '../../../core/zip.js'

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

  // git(`/git` · `/git/config`)은 **여기 없다** — 로컬 뷰어(`http.js`)의 것이다. 받을 것 · 보낼 것 · pull/push 는
  // 로컬형 문법이고 서버 화면은 어디서도 안 쓴다(동기화 메뉴가 `local: true`). 허용 레포의 viewer 에게 origin 호스트 ·
  // 커밋 신원 · hooksPath 가 나가던 것을 「없는 것」 으로(화면 · 권한 검토 v0.1 P5 · R4 · Q7).

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
    // `download=1` — 새 탭에 여는 대신 파일로 받는다(연결 · 삭제 · 내려받기 TODO K9). 한글 이름은 RFC 5987 로
    const dl = url.searchParams.get('download') === '1' ? { 'content-disposition': attachment(path.basename(r.abs)) } : {}
    send(res, 200, await fs.readFile(r.abs), { 'content-type': MIME[ext] || 'application/octet-stream', ...dl })
    return true
  }

  // 묶어서 받는다 — `layer=managed`(docs/ 의 관리 문서) · `layer=work`(work/ 전부 — 첨부 포함). zip 하나, 레포 안의
  // 상대 경로 그대로라 풀면 레포와 같은 모양이다. **읽기다** — 화면에서 이미 읽을 수 있는 것을 파일로 줄 뿐이다(K8).
  if (p === '/archive' && method === 'GET') {
    const layer = url.searchParams.get('layer')
    if (!ARCHIVE[layer]) {
      send(res, 400, { error: { code: 'E_INPUT', message: 'layer 는 managed · work 중 하나다' } })
      return true
    }
    const { dir, keep, label } = ARCHIVE[layer]
    const files = []
    await walk(store.root, dir, (rel) => keep(rel) && files.push(rel))
    if (!files.length) {
      send(res, 404, { error: { code: 'E_NOT_FOUND', message: `${label}가 없다` } })
      return true
    }
    const entries = []
    for (const rel of files.sort()) entries.push({ name: rel, data: await fs.readFile(path.join(store.root, rel)) })
    const buf = await zip(entries)
    const d = new Date()
    const day = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, '0')}${String(d.getDate()).padStart(2, '0')}`
    send(res, 200, buf, {
      'content-type': 'application/zip',
      'content-length': buf.length,
      'content-disposition': attachment(`${path.basename(store.root)}-${label}-${day}.zip`),
    })
    return true
  }

  return false
}

// 묶음 두 층 — 경로 규칙은 `core/frontmatter.layerOf` 와 같은 자리(docs/ · work/)다. 관리 문서는 .md 만(등록부 밖의 그림 ·
// 원본은 관리 문서가 아니다), 작업 문서는 첨부(`work/assets/`)까지 — 기록이 가리키는 것이 같이 가야 읽힌다.
const ARCHIVE = {
  managed: { dir: 'docs', label: '관리문서', keep: (rel) => /\.md$/i.test(rel) },
  work: { dir: 'work', label: '작업문서', keep: (rel) => !/(^|\/)\.gitkeep$/.test(rel) },
}

// 폴더 아래 파일 전부 — 숨김(.git 등)은 건너뛴다. 심볼릭 링크는 따라가지 않는다(레포 밖으로 나갈 수 있다).
async function walk(root, rel, fn) {
  const ents = await fs.readdir(path.join(root, rel), { withFileTypes: true }).catch(() => [])
  for (const e of ents) {
    const r = rel + '/' + e.name
    if (e.name.startsWith('.') && e.name !== '.gitkeep') continue
    if (e.isDirectory()) await walk(root, r, fn)
    else if (e.isFile()) fn(r)
  }
}

// 내려받을 이름 — ASCII 대체 이름 하나 + UTF-8 이름(RFC 5987). 브라우저는 뒤의 것을 쓴다.
function attachment(name) {
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_')
  return `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`
}

export { MIME }
