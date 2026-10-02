// 패키지 — 폴더를 물건으로. 검토 §3.4 · R4 · R5.
//
// 패키지는 `agent/packages/<이름>/`(소스) 또는 서버 산출물의 `packages/<이름>/`
// 에 사는 폴더다. 지금까지 폴더는 이름밖에 말하지 않았다 — 목록도 판도 검사도
// 없었다. 여기서 셋을 준다.
//
//   findPackagesDir   어디에 있나 — --packages → CDP_PACKAGES → 번들 옆 → 소스
//   listPackages      무엇이 있나 — 매니페스트 + 폴더에서 **계산한** 것
//   checkPackage      쓸 수 있나 — 임시 폴더에 부어서 ctx check
//
// **매니페스트에 적는 것은 사람이 정하는 것만이다** — 이름 · 제목 · 판 · 설명 ·
// 출처. 문서 수 · 좌표 타입 · 등록부 패턴은 폴더에서 센다. 적어 두면 갈라진다.
//
// 판정을 새로 짜지 않는다(불변조건 1). `checkPackage` 는 `loadRepo` 와
// `runBuiltinCheck` 를 그대로 부른다.

import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { loadRepo } from './repo.js'
import { runBuiltinCheck } from './check.js'
import { parseRegistry } from './managed.js'
import { parseVocab } from './vocab.js'
import { readText } from './scan.js'
import { CtxError } from './tools.js'
import { docNo } from './docrefs.js'
import { requiredOf } from './docusage.js'

export const MANIFEST = '_package.json'
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/

async function isDir(p) {
  return fs.stat(p).then((s) => s.isDirectory()).catch(() => false)
}
async function exists(p) {
  return fs.access(p).then(() => true).catch(() => false)
}

// 패키지 폴더인가 — `_vocab.md` 가 표지다(`ctx` 가 지식 레포를 알아보는 것과 같다).
export async function isPackageDir(dir) {
  return exists(path.join(dir, '_vocab.md'))
}

/**
 * 패키지가 사는 폴더를 찾는다. 순서 —
 *   ① explicit (--packages)
 *   ② 환경변수 CDP_PACKAGES
 *   ③ 번들 옆 — <bin>/../packages   (서버 산출물: bin/ctx.mjs 와 packages/ 가 형제)
 *   ④ 소스 레포 — <root>/agent/packages
 * 없으면 null. 어느 것으로 찾았는지 `how` 에 남긴다 — 화면과 doctor 가 말할 수 있게.
 */
export async function findPackagesDir({ explicit = null, env = process.env, binDir = null, sourceRoot = null } = {}) {
  const cands = []
  if (explicit) cands.push(['--packages', path.resolve(explicit)])
  if (env.CDP_PACKAGES) cands.push(['CDP_PACKAGES', path.resolve(env.CDP_PACKAGES)])
  if (binDir) cands.push(['번들 옆', path.resolve(binDir, '..', 'packages')])
  if (sourceRoot) cands.push(['소스', path.resolve(sourceRoot, 'agent', 'packages')])
  for (const [how, dir] of cands) {
    if (await isDir(dir)) return { dir, how }
  }
  return null
}

export async function readManifest(dir) {
  const name = path.basename(dir)
  const raw = await fs.readFile(path.join(dir, MANIFEST), 'utf8').catch(() => null)
  if (raw == null) return { name, title: null, version: null, description: null, source: null, updated: null, present: false }
  let j
  try {
    j = JSON.parse(readText(raw))
  } catch (e) {
    throw new CtxError('E_INPUT', `${MANIFEST} 이 JSON 이 아니다`, { dir, cause: e.message })
  }
  if (j.name && j.name !== name) {
    // 이름이 폴더와 다르면 어느 것이 이 패키지의 이름인지 알 수 없다.
    throw new CtxError('E_INPUT', `${MANIFEST} 의 name(${j.name})이 폴더명(${name})과 다르다`, { dir })
  }
  return {
    name,
    title: j.title ?? null,
    version: j.version ?? null,
    description: j.description ?? null,
    source: j.source ?? null,
    updated: j.updated ?? null,
    present: true,
  }
}

// 폴더에서 세는 것 — 문서 · 타입 · 등록부 패턴 · 예시 좌표.
export async function statsOf(dir) {
  const vocab = parseVocab(readText(await fs.readFile(path.join(dir, '_vocab.md'), 'utf8').catch(() => '')))
  const registry = parseRegistry(readText(await fs.readFile(path.join(dir, '_managed.md'), 'utf8').catch(() => '')))
  const docs = []
  const docsDir = path.join(dir, 'docs')
  ;(async function walk(d, rel) {
    return null
  })()
  async function walk(d, rel) {
    for (const e of await fs.readdir(d, { withFileTypes: true }).catch(() => [])) {
      const r = rel ? rel + '/' + e.name : e.name
      if (e.isDirectory()) await walk(path.join(d, e.name), r)
      else if (/\.md$/i.test(e.name)) docs.push('docs/' + r)
    }
  }
  await walk(docsDir, '')
  docs.sort()
  return {
    docs,
    types: vocab.types,
    excludedTypes: vocab.excludedTypes,
    coords: vocab.counted.size,
    examples: [...vocab.coords.values()].filter((e) => e.example).map((e) => e.coord),
    patterns: registry.rules.map((r) => ({ pattern: r.pattern, doc: r.doc, level: r.level, whole: r.whole })),
    registryErrors: registry.errors,
    vocabErrors: vocab.errors,
  }
}

/**
 * 패키지 목록. 매니페스트가 없는 폴더도 **이름과 함께** 낸다 — 옛 패키지가
 * 조용히 빠지지 않게. `present: false` 가 그 표시다.
 */
export async function listPackages(dir) {
  const out = []
  for (const e of (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).sort((a, b) => a.name.localeCompare(b.name))) {
    if (!e.isDirectory()) continue
    const p = path.join(dir, e.name)
    if (!(await isPackageDir(p))) continue
    const manifest = await readManifest(p)
    const st = await statsOf(p)
    out.push({
      name: e.name,
      path: p,
      manifest,
      docs: st.docs.length,
      types: st.types.length,
      patterns: st.patterns.length,
      coords: st.coords,
      examples: st.examples.length,
      // 문서 고르기(관리문서 정리 검토 §4.9) — 새 레포 화면이 안 쓸 문서를 빼고 세운다. 세운 뒤 같은 drop save 가 지운다
      docList: await Promise.all(
        st.docs.map(async (rel) => {
          const text = readText(await fs.readFile(path.join(p, rel), 'utf8').catch(() => ''))
          const h = text.split('\n').find((l) => /^#\s/.test(l))
          return { path: rel, no: docNo(rel), title: h ? h.replace(/^#\s+/, '').trim() : rel.split('/').pop().replace(/\.md$/i, ''), required: requiredOf(text), registered: st.patterns.some((x) => x.doc.toLowerCase() === rel.toLowerCase()) }
        })
      ),
    })
  }
  return out
}

export async function showPackage(dir) {
  if (!(await isPackageDir(dir))) throw new CtxError('E_NOT_FOUND', '패키지가 아니다 (_vocab.md 없음)', { dir })
  return { name: path.basename(dir), path: dir, manifest: await readManifest(dir), ...(await statsOf(dir)) }
}

/**
 * 패키지가 쓸 수 있는가 — **부어서 본다.**
 *
 *   assemble(dest)  패키지를 완성된 지식 레포 모양으로 dest 에 만드는 함수.
 *                   소스에서는 ops/lib/assemble.mjs 가, 서버에서는 완성 폴더 복사가 이 자리다.
 *                   없으면 패키지 폴더 자체를 레포로 읽는다 — 등록부 · 어휘 · 문서는 거기 다 있다.
 *
 * 본다 —
 *   ① loadRepo 가 읽히고 runBuiltinCheck 에 error 가 없다 (작업 기록 0건이면 "이상 없음" 이어야 한다)
 *   ② 등록부가 가리키는 문서가 전부 있다
 *   ③ example: 어휘 줄마다 그 섹션이 문서에 있다 (한쪽만 지운 것을 잡는다)
 *   ④ 등록부 · 어휘 파서 오류 0
 */
export async function checkPackage(dir, { assemble = null } = {}) {
  if (!(await isPackageDir(dir))) throw new CtxError('E_NOT_FOUND', '패키지가 아니다 (_vocab.md 없음)', { dir })
  const name = path.basename(dir)
  const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-pkg-'))
  const problems = []
  try {
    let root = dir
    if (assemble) {
      root = path.join(tmp, name)
      await assemble(root)
    }
    const st = await statsOf(dir)
    for (const e of st.registryErrors) problems.push({ kind: 'registry', detail: `_managed.md:${e.line} ${e.message}` })
    for (const e of st.vocabErrors) problems.push({ kind: 'vocab', detail: `_vocab.md:${e.line} ${e.message}` })

    // ② 등록부 → 문서
    const missingDocs = []
    for (const p of st.patterns) {
      if (!(await exists(path.join(root, p.doc)))) missingDocs.push({ pattern: p.pattern, doc: p.doc })
    }
    for (const m of missingDocs) problems.push({ kind: 'doc-missing', detail: `${m.pattern} → ${m.doc} 가 없다` })

    // ① 판정 — core 그대로
    const r = await loadRepo(root, { settings: { settledness: { excludeTypes: ['domain'] } } })
    const res = runBuiltinCheck({
      docs: r.docs,
      vocabText: r.vocabText,
      managedText: r.managedText,
      vocab: r.vocab,
      validity: r.validity,
      indexInfo: r.indexInfo,
      managedIndex: r.managedIndex,
      sections: r.sections,
      bodies: r.bodies,
    })
    const errors = res.findings.filter((f) => f.sev === 'error')
    for (const f of errors) for (const i of f.items) problems.push({ kind: f.kind, detail: `${f.label}  ${i.coord || i.id || i.path || ''} ${i.detail || ''}`.trim() })

    // ③ 예시 좌표 ↔ 예시 섹션
    const exampleGaps = []
    for (const c of st.examples) {
      const hit = r.managedIndex.find(c)
      if (!hit) continue // 등록부에 없는 타입의 예시 — 섹션이 없는 것이 정상
      if (hit.docMissing || !hit.section) exampleGaps.push({ coord: c, doc: hit.doc })
    }
    for (const g of exampleGaps) problems.push({ kind: 'example-gap', detail: `${g.coord} 의 예시 섹션이 ${g.doc} 에 없다 — 어휘 줄만 남았다` })

    return {
      name,
      ok: problems.length === 0,
      problems,
      docs: st.docs.length,
      patterns: st.patterns.length,
      types: st.types.length,
      examples: st.examples.length,
      works: r.works.length,
      warnings: res.findings.filter((f) => f.sev === 'warn').map((f) => `${f.label} ${f.items.length}건`),
    }
  } finally {
    await fs.rm(tmp, { recursive: true, force: true }).catch(() => {})
  }
}

/**
 * 새 패키지 — 기존 것을 복사하고 매니페스트를 고친다. **문서 목록을 고치는 것은
 * 사람이다**(검토 R17). 표본이 하나인데 축을 세우지 않는다.
 *
 * 복사에서 빼는 것 — `convert/`. 원본 문서 종류의 변환기 자리라 복제한 패키지의
 * 것이 아니다(원본 xlsx 가 없으면 돌지도 않는다).
 *
 * README 도 고친다 — 패키지의 `README.md` 는 조립되어 지식 레포의 루트 README 가
 * 된다. 복제한 채로 두면 새 패키지로 세운 레포를 연 사람이 원본의 제목을 읽고,
 * 어디서 왔는지는 아무 데도 없다. 첫 제목을 새 이름으로 바꾸고 출처 한 줄을 넣는다.
 * 나머지 본문(문서 목록 · 첫날 할 일)은 그대로다 — 그것을 고치는 것이 사람의 일이다.
 */
export async function newPackage(packagesDir, { name, from, title = null, description = null }) {
  if (!NAME_RE.test(String(name || ''))) throw new CtxError('E_INPUT', '패키지 이름 형식이 아니다 (영문·숫자·._-)', { name })
  const src = path.join(packagesDir, from)
  const dst = path.join(packagesDir, name)
  if (!(await isPackageDir(src))) throw new CtxError('E_NOT_FOUND', `원본 패키지가 없다 — ${from}`, { from })
  if (await exists(dst)) throw new CtxError('E_EXISTS', '그 이름의 패키지가 이미 있다', { name })
  await fs.cp(src, dst, { recursive: true })
  // `fs.cp` 의 filter 는 경로 표기(8.3 단축명 · 대소문자)에 따라 비교가 어긋난다 —
  // 복사한 뒤 지우는 쪽이 확실하다. 지우는 것은 패키지 루트의 convert/ 하나다.
  await fs.rm(path.join(dst, 'convert'), { recursive: true, force: true })
  const base = await readManifest(src)
  const today = new Date().toISOString().slice(0, 10)
  const manifest = {
    name,
    title: title ?? (base.title ? base.title + ' (사본)' : null),
    version: '0.1.0',
    description: description ?? base.description ?? null,
    source: `${from}${base.version ? ' v' + base.version : ''} 에서 복제 (agent/packages/${from}) · ${today}`,
    updated: today,
  }
  await fs.writeFile(path.join(dst, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  // README — 첫 제목을 새 이름으로, 바로 아래 출처 한 줄
  const readmePath = path.join(dst, 'README.md')
  const raw = await fs.readFile(readmePath, 'utf8').catch(() => null)
  let readme = false
  if (raw != null) {
    const lines = readText(raw).split('\n')
    const heading = `# ${name} — ${manifest.title || name}`
    const note =
      `> **\`${from}\`${base.version ? ' v' + base.version : ''} 에서 복제** · ${today}. 이름 · 제목 · 문서 목록 · 등록부 · 어휘가 아직 원본의\n` +
      `> 것이다 — 적용하는 프로젝트의 것으로 고친다. 이름은 \`ctx package rename\`, 문서 목록은 사람이.\n` +
      `> 원본과 다른 것만이 이 패키지다.`
    const i = lines.findIndex((l) => /^#\s/.test(l))
    if (i >= 0) {
      lines[i] = heading
      lines.splice(i + 1, 0, '', note)
    } else {
      lines.unshift(heading, '', note, '')
    }
    await fs.writeFile(readmePath, lines.join('\n'), 'utf8')
    readme = true
  }
  return { name, path: dst, manifest, readme }
}

/**
 * 패키지 이름을 바꾼다 — 폴더 · 매니페스트 `name` · README 첫 제목을 한 번에.
 *
 * 패키지 이름은 **일하는 방식의 서식 이름**이다(프로젝트 맞춤은 세운 레포 안에서) —
 * 내용을 말하지 못하는 이름(`dpms` → `public-si`)은 바꾼다. 셋 중 하나만 바꾸면 `readManifest` 가
 * "name 이 폴더명과 다르다" 로 거절하거나(매니페스트), 레포를 연 사람이 옛 이름을
 * 읽는다(README). 그래서 하나의 동작이다.
 *
 * 이미 세운 지식 레포는 건드리지 않는다 — 레포는 패키지의 사본이고 이름을 따로
 * 갖는다(`ctx repo new <경로>`). 서버의 `packages/` 는 다음 산출물이 따라간다.
 */
export async function renamePackage(packagesDir, { from, to, title = null }) {
  if (!NAME_RE.test(String(to || ''))) throw new CtxError('E_INPUT', '패키지 이름 형식이 아니다 (영문·숫자·._-)', { name: to })
  if (from === to) throw new CtxError('E_INPUT', '같은 이름이다', { from, to })
  const src = path.join(packagesDir, from)
  const dst = path.join(packagesDir, to)
  if (!(await isPackageDir(src))) throw new CtxError('E_NOT_FOUND', `패키지가 없다 — ${from}`, { from })
  if (await exists(dst)) throw new CtxError('E_EXISTS', '그 이름의 패키지가 이미 있다', { name: to })
  const base = await readManifest(src) // 매니페스트가 폴더와 어긋나 있으면 여기서 멈춘다
  await fs.rename(src, dst)
  const today = new Date().toISOString().slice(0, 10)
  const manifest = {
    name: to,
    title: title ?? base.title ?? null,
    version: base.version ?? '0.1.0',
    description: base.description ?? null,
    source: [base.source, `이름 바꿈 ${from} → ${to} · ${today}`].filter(Boolean).join(' · '),
    updated: today,
  }
  await fs.writeFile(path.join(dst, MANIFEST), JSON.stringify(manifest, null, 2) + '\n', 'utf8')

  // README — 첫 제목만. 본문은 그 패키지의 것이라 손대지 않는다
  const readmePath = path.join(dst, 'README.md')
  const raw = await fs.readFile(readmePath, 'utf8').catch(() => null)
  let readme = false
  if (raw != null) {
    const lines = readText(raw).split('\n')
    const i = lines.findIndex((l) => /^#\s/.test(l))
    if (i >= 0) {
      const m = /^#\s+\S+(?:\s+—\s+(.*))?\s*$/.exec(lines[i])
      const oldTitle = m && m[1] ? m[1].trim() : null
      lines[i] = `# ${to} — ${title ?? oldTitle ?? manifest.title ?? to}`
      await fs.writeFile(readmePath, lines.join('\n'), 'utf8')
      readme = true
    }
  }
  return { from, to, path: dst, manifest, readme }
}
