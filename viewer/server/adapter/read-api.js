// 읽기 API — 서버(`ctx serve` · 개인 서버 포함)의 화면용 읽기. MCP 설계서 §6.2.
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
import { HTML_CSP, HTML_EXTS, themeHtml } from '../../../core/assets.js'
import { zip } from '../../../core/zip.js'
import { toolDocs, toolDrift } from '../../../core/tools.js'
import { lastChanges } from '../../../core/git.js'
import { dropBlockers } from '../../../core/docusage.js'
import { droppedDocs } from '../../../core/docrefs.js'
import { materialsOf } from '../../../core/curation.js'
import { addedBy } from '../../../core/managed.js'
import { cmpDateDesc } from '../../../core/validity.js'
import { formsLib, formRow, formDetail, searchForms } from '../../../core/formslib.js'
import { formIdOfText } from '../../../core/tools.js'

// 화면 자산도 이 표를 쓴다(관리 서비스의 `serveWeb`). **`.js` 가 빠지면
// 브라우저가 모듈 실행을 거부한다** — 화면이 통째로 안 뜬다.
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.htm': 'text/html; charset=utf-8',
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

  // 어긋남 진단(리빌딩 검토 §5.1) — 큐레이터 몫(권한은 부르는 서버가 먼저 본다). `doc` · `coord` 로 좁힌다
  if (p === '/drift' && method === 'GET') {
    send(res, 200, toolDrift(store, { doc: url.searchParams.get('doc') || undefined, coord: url.searchParams.get('coord') || undefined }))
    return true
  }

  // 큐레이션 — 대기열(오래된 순 · 좌표 셋 분류) · 기록 하나의 판정 재료 · 큐레이션 이력(v1.0 TODO §1.3).
  // 재료(`/queue/<id>`)는 큐레이터 몫이다 — 권한은 부르는 서버가 먼저 본다(관리 서비스). 여기는 읽기만 한다
  if (p === '/queue' && method === 'GET') {
    const c = store.curation
    send(res, 200, { items: c?.queue || [], total: c?.queue?.length || 0, oldestDays: c?.stats?.oldestDays ?? null, implicit: !!c?.implicit })
    return true
  }
  const qm = /^\/queue\/(.+)$/.exec(p)
  if (qm && method === 'GET') {
    const m = store.curation ? materialsOf(store, decodeURIComponent(qm[1])) : null
    if (!m) {
      send(res, 404, { error: { code: 'E_NOT_FOUND', message: '그 id 의 작업 기록이 없다' } })
      return true
    }
    // 등록부 없는 타입마다 비슷한 서식(제목 · 번호 · 등록부 타입이 그 이름을 품는 것) — 새 문서 후보를 서식에서 세우게(계약 1.3)
    const lib = await formsLib(store.formsOpt || {}).catch(() => null)
    const unregisteredTypes = m.unregisteredTypes.map((u) => ({
      ...u,
      forms: lib ? searchForms(lib, u.type).slice(0, 5).map((f) => ({ id: f.id, group: f.group, number: f.number, title: f.title })) : [],
    }))
    // `canonical` 은 계약 이름 — 같은 좌표를 건드린 다른 대기 기록(`together`)을 함께 다룰 자리로 낸다
    send(res, 200, { ...m, unregisteredTypes, canonical: m.together })
    return true
  }
  // 서식집 — 목록(이 레포가 쓰는 서식 표시) · 서식 하나(head · guide · example · 서버가 찍을 빈 문서)
  if (p === '/forms' && method === 'GET') {
    const lib = await formsLib(store.formsOpt || {})
    const used = new Set((store.managedDocs || []).map((d) => formIdOfText(store.bodies.get(d.path))).filter(Boolean))
    const list = searchForms(lib, url.searchParams.get('q')).map((f) => formRow(f, used))
    send(res, 200, { groups: lib.groups, forms: list, total: list.length })
    return true
  }
  const fm = /^\/forms\/(.+)$/.exec(p)
  if (fm && method === 'GET') {
    const lib = await formsLib(store.formsOpt || {})
    const f = lib.byId.get(decodeURIComponent(fm[1]))
    if (!f) send(res, 404, { error: { code: 'E_NOT_FOUND', message: '그 id 의 서식이 없다' } })
    else send(res, 200, formDetail(f))
    return true
  }

  if (p === '/curations' && method === 'GET') {
    // 새 문서 — 그 큐레이션 save 가 **세운** 관리 문서. 등록부 행의 넷째 칸(「서버 추가 · <기록 id>」)이 그 save 의 기록 id 이고
    // 그 문서를 가리키는 **첫 행**일 때다(뒤 행이면 이미 있던 문서에 패턴만 더한 것). 전에는 판정 `new` 의 into 좌표가 가는
    // 문서를 다 셌다 — into 에 이미 있던 문서의 좌표가 섞이면(cdp-curate 의 예시가 그렇다) 그 문서까지 새 문서로 떴다
    const firstRow = new Map()
    for (const rule of store.registry?.rules || []) if (!firstRow.has(rule.doc)) firstRow.set(rule.doc, rule)
    const createdBy = new Map()
    for (const [doc, rule] of firstRow) {
      const by = addedBy(rule)
      if (by) createdBy.set(by, [...(createdBy.get(by) || []), doc])
    }
    const items = (store.works || [])
      .filter((d) => d.curates)
      .slice()
      .sort(cmpDateDesc)
      .map((d) => {
        const into = new Set()
        for (const j of d.curates) for (const c of j.into || []) into.add(c)
        return { id: d.id, title: d.title, date: d.date, author: d.author, judgments: d.curates, sections: into.size, newDocs: createdBy.get(d.id) || [] }
      })
    send(res, 200, { items, total: items.length })
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

  // 관리 문서 목록 · 사용 현황(관리문서 정리 검토 §4.6) — MCP `docs` 와 같은 함수. 문서마다 `blocked` 는 지우기를 거절할
  // 까닭(작업 기록이 쓴 섹션 · touches) — 화면이 그 행을 고르지 못하게 한다. 지우기 자체는 서버형의 POST /docs-drop(admin)
  if (p === '/managed-docs' && method === 'GET') {
    const lastChange = await lastChanges(store.root).catch(() => new Map())
    const out = toolDocs(store, { lastChange })
    for (const d of out.docs) {
      const b = dropBlockers(store, d.path)
      d.blocked = b.realSections.length || b.touchedBy.length ? { realSections: b.realSections.length, touchedBy: b.touchedBy.length } : null
    }
    out.dropped = droppedDocs(store.managedText)
    send(res, 200, out)
    return true
  }

  // 좌표 하나의 전모 — 지금 상태(섹션 본문) + 그것을 바꾼 작업 목록.
  if (p === '/coord') {
    const c = url.searchParams.get('coord')
    if (!c) send(res, 400, { error: 'coord 가 필요합니다' })
    else send(res, 200, store.coordDetail(c))
    return true
  }

  // git(`/git` · `/git/config`)은 **여기 없다** — 옛 로컬 뷰어의 것이었고 v1.0 에서 걷었다. 받을 것 · 보낼 것 · pull/push 는
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
    // SVG 는 문서다 — 「원문」 으로 새 탭에 열면 안의 스크립트가 이 출처 · 세션 쿠키로 돈다. `<img>` 로 쓸 때는 영향 없다(그림 · 첨부 검토 G5)
    const svg = ext === '.svg' ? { 'content-security-policy': "sandbox; default-src 'none'; img-src data:; style-src 'unsafe-inline'" } : {}
    // HTML 도 문서다 — 응답 헤더의 sandbox 는 **어떻게 열든**(틀 · 새 탭 · 주소 직접) 불투명 출처로 만든다. 스크립트는 돌되
    // 이 서버의 쿠키 · 저장소 · DOM 에 닿지 못한다. 전에는 CSP 없이 같은 출처로 나갔다(HTML 시각 자료 검토 H0 · S1 · S2)
    const isHtml = HTML_EXTS.includes(ext)
    const html = isHtml ? { 'content-security-policy': HTML_CSP } : {}
    // `theme=light|dark` — 화면 테마를 루트 `data-theme` 으로 싣는다(V6). 내려받기는 원본 그대로
    let body = await fs.readFile(r.abs)
    if (isHtml && !dl['content-disposition']) body = themeHtml(body, url.searchParams.get('theme'))
    send(res, 200, body, { 'content-type': MIME[ext] || 'application/octet-stream', ...svg, ...html, ...dl })
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
  work: { dir: 'work', label: '작업기록', keep: (rel) => !/(^|\/)\.gitkeep$/.test(rel) },
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
