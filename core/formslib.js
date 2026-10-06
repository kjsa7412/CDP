// 서식집을 읽는다 — `agent/forms/<묶음>/<번호>_<제목>.md`. v1.0 개편안 §8.1.
//
// 서식 하나의 모양 · 찍는 법은 `core/forms.js`(순수)가 정한다. 여기는 **어디서 읽나**와 **묶어서 들고 있기**만 한다.
//
// 자리 — 앞에서부터 있는 곳 하나(패키지 폴더를 찾던 순서와 같다):
//   ① explicit(--forms) ② 환경변수 CDP_FORMS ③ 번들 옆 <bin>/../forms(서버 산출물) ④ 소스 <root>/agent/forms
// 그리고 **팀 서식** `<data>/forms/<묶음>/` — upgrade 가 덮지 않는 자리. 같은 id 면 팀 서식이 이긴다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseForm, stampDoc } from './forms.js'
import { readText } from './scan.js'

const isDir = (p) => fs.stat(p).then((s) => s.isDirectory()).catch(() => false)
const HERE = path.dirname(fileURLToPath(import.meta.url))

// 번들 안에서는 이 파일이 `bin/ctx.mjs` 에 들어가 HERE 가 bin/ 이다 — 그 옆의 `forms/` 가 서버 산출물의 서식집이다
export async function findFormsDir({ explicit = null, env = process.env, binDir = HERE, sourceRoot = path.resolve(HERE, '..') } = {}) {
  const cands = []
  if (explicit) cands.push(['--forms', path.resolve(explicit)])
  if (env.CDP_FORMS) cands.push(['CDP_FORMS', path.resolve(env.CDP_FORMS)])
  if (binDir) cands.push(['번들 옆', path.resolve(binDir, '..', 'forms')])
  if (sourceRoot) cands.push(['소스', path.resolve(sourceRoot, 'agent', 'forms')])
  for (const [how, dir] of cands) if (await isDir(dir)) return { dir, how }
  return null
}

async function loadDir(dir, origin) {
  const groups = []
  const forms = []
  for (const g of (await fs.readdir(dir, { withFileTypes: true }).catch(() => [])).filter((e) => e.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
    const gdir = path.join(dir, g.name)
    let meta = { name: g.name, title: null, version: null, description: null }
    const raw = await fs.readFile(path.join(gdir, '_묶음.json'), 'utf8').catch(() => null)
    if (raw) {
      try {
        meta = { ...meta, ...JSON.parse(readText(raw)), name: g.name }
      } catch {}
    }
    groups.push({ ...meta, origin })
    for (const f of (await fs.readdir(gdir)).filter((n) => /\.md$/i.test(n)).sort()) {
      const text = readText(await fs.readFile(path.join(gdir, f), 'utf8'))
      const form = parseForm(text, { group: g.name, file: f })
      if (form.id) forms.push({ ...form, origin })
    }
  }
  return { groups, forms }
}

// 서식집 전부 — { dir, how, groups, forms, byId }. 팀 서식(`dataDir/forms`)이 같은 id 를 덮는다
export async function loadForms({ explicit = null, binDir = HERE, dataDir = null, env = process.env } = {}) {
  const found = await findFormsDir({ explicit, binDir, env })
  const base = found ? await loadDir(found.dir, 'bundle') : { groups: [], forms: [] }
  const team = dataDir && (await isDir(path.join(dataDir, 'forms'))) ? await loadDir(path.join(dataDir, 'forms'), 'team') : { groups: [], forms: [] }
  const byId = new Map()
  for (const f of [...base.forms, ...team.forms]) byId.set(f.id, f)
  const groups = new Map()
  for (const g of [...base.groups, ...team.groups]) groups.set(g.name, g)
  return { dir: found?.dir ?? null, how: found?.how ?? null, groups: [...groups.values()], forms: [...byId.values()], byId }
}

// 같은 프로세스에서 다시 읽지 않는다 — 서식집은 판과 함께만 바뀐다(팀 서식을 고치면 서버를 다시 띄운다)
let cached = null
export async function formsLib(opts = {}) {
  const key = JSON.stringify([opts.explicit ?? null, opts.binDir ?? null, opts.dataDir ?? null])
  if (cached && cached.key === key) return cached.lib
  const lib = await loadForms(opts)
  cached = { key, lib }
  return lib
}
export const resetFormsCache = () => {
  cached = null
}

// 화면 · 도구가 내는 한 줄 — 목록 행
export function formRow(f, usedIds = new Set()) {
  return { id: f.id, group: f.group, number: f.number ?? null, title: f.title, kind: f.kind ?? null, registry: f.registry || [], due: f.due ?? null, origin: f.origin, used: usedIds.has(f.id) }
}

// 서식 하나 — head · guide · example 과 **서버가 실제로 찍을 빈 문서**(찍는 함수와 같은 함수)
export function formDetail(f) {
  return { ...formRow(f), coordValue: f.coordValue ?? null, fixed: f.fixed || [], head: f.head, guide: f.guide, example: f.example, stamp: stampDoc(f) }
}

// 말 → 서식 — 제목 · 번호 · 묶음 · 등록부 타입에 걸리면
export function searchForms(lib, q) {
  const key = String(q || '').toLowerCase().replace(/[\s_\-·]/g, '')
  if (!key) return lib.forms
  return lib.forms.filter((f) => {
    const hay = [f.title, f.number, f.group, f.id, ...(f.registry || []).map((r) => r.pattern.slice(0, r.pattern.indexOf(':')))].map((s) => String(s || '').toLowerCase().replace(/[\s_\-·]/g, ''))
    return hay.some((h) => h.includes(key))
  })
}
