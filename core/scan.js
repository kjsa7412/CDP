// 디렉터리 순회 + 증분 캐시 — 설계서 §10.2.
//
// 캐시 키는 path, 무효화는 mtime **또는 size** 불일치.
// v0.1 은 lastModified 만 봤는데, Windows 에서 동기화 도구·git checkout 이
// mtime 을 보존하는 경우가 있어 변경을 놓친다. size 는 공짜로 얻는 둘째 신호다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { parseDoc } from './frontmatter.js'

// §11 — .git 을 읽지 않는다. 감시·스캔에서도 제외한다. 성능이 아니라 정확성
// 문제다: git 내부 파일 변경이 문서 변경으로 오인되면 갱신이 폭발한다.
export const IGNORED_DIRS = new Set(['.git', 'design', '.claude', 'node_modules', 'dist', 'build', '.vite', '.cache', '.idea', '.vscode'])

export const TEXT_EXT = new Set(['.md', '.markdown', '.txt', '.json', '.yml', '.yaml', '.sql', '.csv'])

// **CRLF 를 읽기 경계에서 한 번만 없앤다.**
//
// 파서들이 전부 `split('\n')` 을 쓰는데, CRLF 파일이면 줄 끝에 `\r` 이 남는다.
// JS 정규식의 `.` 은 `\r` 을 안 먹으므로 `...(.*)$` 로 끝나는 패턴이 전부
// 실패한다 — `_vocab.md` 의 좌표 항목 패턴이 정확히 그 모양이다.
//
// 증상이 고약하다: 좌표가 **하나도** 파싱되지 않아 전부 "미등재"로 잡히고,
// 미등재는 훅이 커밋을 막는 유일한 항목이라 **레포 전체가 커밋 불가**가 된다.
// 그런데 파일은 멀쩡해 보인다. `core.autocrlf=true` 로 clone 한 Windows PC 나
// 메모장으로 한 번 저장한 `_vocab.md` 만으로 재현된다 — LF 로 개발하는
// 기계에서는 절대 안 보인다(8단계의 "Node 없는 PC" 와 같은 부류다).
//
// 층마다 `\r` 을 지우면 반드시 한 곳을 빠뜨린다. 들어오는 자리에서 없앤다.
export function readText(text) {
  return text.includes('\r') ? text.replace(/\r\n?/g, '\n') : text
}

function posix(p) {
  return p.split(path.sep).join('/')
}

export async function* walk(root, rel = '') {
  const dir = rel ? path.join(root, rel) : root
  let entries
  try {
    entries = await fs.readdir(dir, { withFileTypes: true })
  } catch {
    return
  }
  for (const e of entries) {
    if (e.isDirectory()) {
      if (IGNORED_DIRS.has(e.name)) continue
      yield* walk(root, rel ? `${rel}/${e.name}` : e.name)
    } else if (e.isFile() || e.isSymbolicLink()) {
      yield rel ? `${rel}/${e.name}` : e.name
    }
  }
}

// 반환: { docs, bodies, stats }
//  docs   — 파싱된 문서 메타 (프론트매터 + 섹션)
//  bodies — path → 원문 텍스트. 클라이언트가 렌더하므로 서버는 원문만 들고 있다
export async function scan(root, cache, { onProgress } = {}) {
  const docs = []
  const bodies = new Map()
  const seen = new Set()
  let read = 0
  let reused = 0
  const started = Date.now()

  const files = []
  for await (const f of walk(root)) {
    const ext = path.extname(f).toLowerCase()
    if (TEXT_EXT.has(ext) || isImage(ext)) files.push(f)
  }

  for (let i = 0; i < files.length; i++) {
    const relPath = posix(files[i])
    const abs = path.join(root, relPath)
    seen.add(relPath)

    let st
    try {
      st = await fs.stat(abs)
    } catch {
      continue
    }

    const ext = path.extname(relPath).toLowerCase()
    if (isImage(ext)) continue // 이미지는 목록에 넣지 않는다. 요청 시 직접 서빙

    const hit = cache.get(relPath)
    if (hit && hit.mtime === st.mtimeMs && hit.size === st.size) {
      docs.push(hit.doc)
      bodies.set(relPath, hit.body)
      reused++
    } else {
      let text
      try {
        text = readText(await fs.readFile(abs, 'utf8'))
      } catch {
        continue
      }
      const doc = parseDoc(relPath, text)
      doc.size = st.size
      doc.mtime = st.mtimeMs
      cache.set(relPath, { mtime: st.mtimeMs, size: st.size, doc, body: text })
      docs.push(doc)
      bodies.set(relPath, text)
      read++
    }
    if (onProgress && i % 25 === 0) onProgress({ done: i + 1, total: files.length })
  }

  // 사라진 파일 정리
  for (const key of [...cache.keys()]) if (!seen.has(key)) cache.delete(key)

  return {
    docs,
    bodies,
    stats: { total: docs.length, read, reused, ms: Date.now() - started, scannedAt: new Date().toISOString() },
  }
}

export function isImage(ext) {
  return ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.svg', '.avif'].includes(ext)
}

// 경로 지정 화면의 구조 검증 — 설계서 §26.1.
// "경로가 맞는지는 폴더 이름이 아니라 이 다섯 줄로 판단된다."
export async function probe(root) {
  const rows = []
  const stat = async (p) => {
    try {
      return await fs.stat(path.join(root, p))
    } catch {
      return null
    }
  }

  const exists = await stat('.')
  if (!exists) return { ok: false, rows: [{ mark: 'x', name: root, note: '경로를 찾을 수 없습니다' }] }

  // knowledge/
  const kdir = await stat('knowledge')
  let mdCount = 0
  if (kdir?.isDirectory()) {
    const names = await fs.readdir(path.join(root, 'knowledge')).catch(() => [])
    mdCount = names.filter((n) => n.toLowerCase().endsWith('.md')).length
    rows.push({ mark: mdCount ? 'ok' : 'warn', name: 'knowledge/', note: `.md ${mdCount}건` })
  } else {
    rows.push({ mark: 'warn', name: 'knowledge/', note: '없음 — 루트의 .md 를 대신 읽습니다' })
  }

  // _vocab.md
  const vfile = await stat('_vocab.md')
  if (vfile) {
    const { parseVocab } = await import('./vocab.js')
    const v = parseVocab(readText(await fs.readFile(path.join(root, '_vocab.md'), 'utf8').catch(() => '')))
    rows.push({ mark: 'ok', name: '_vocab.md', note: `좌표 ${v.coords.size}개 · 타입 ${v.types.length}종` })
  } else {
    rows.push({ mark: 'none', name: '_vocab.md', note: '없음 — 좌표 트리를 만들 수 없습니다' })
  }

  // INDEX.md — 읽지 않지만 불일치는 경고한다 (설계서 §10.4)
  const ifile = await stat('INDEX.md')
  if (ifile) {
    const text = readText(await fs.readFile(path.join(root, 'INDEX.md'), 'utf8').catch(() => ''))
    const rowCount = countIndexRows(text)
    const diff = mdCount - rowCount
    rows.push({
      mark: diff === 0 ? 'ok' : 'warn',
      name: 'INDEX.md',
      note: diff === 0 ? `${rowCount}행 — 집계 일치` : `${rowCount}행 — 실제 집계와 ${Math.abs(diff)}건 차이`,
    })
  } else {
    rows.push({ mark: 'none', name: 'INDEX.md', note: '없음 — 뷰어가 직접 집계합니다' })
  }

  // bin/ctx
  const ctx = (await stat('bin/ctx')) || (await stat('bin/ctx.js')) || (await stat('bin/ctx.cmd'))
  rows.push(
    ctx
      ? { mark: 'ok', name: 'bin/ctx', note: '검증 위임 가능 — 최초 실행 시 확인' }
      : { mark: 'none', name: 'bin/ctx', note: '없음 — 검증은 뷰어 내장 검사로' }
  )

  return { ok: true, root, rows, mdCount }
}

export function countIndexRows(text) {
  return text
    .split('\n')
    .filter((l) => /^\|/.test(l.trim()) && !/^\|[\s:\-|]+\|$/.test(l.trim()))
    .filter((l) => !/^\|\s*id\s*\|/i.test(l.trim())).length
}
