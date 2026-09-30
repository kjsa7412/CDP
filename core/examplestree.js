// 폴더째 서식 예시 빼기 — 레포를 세울 때(`newRepo({ examples: false })`). 판정은 `core/examples.js` 하나다.
// 디스크를 읽고 쓰는 껍데기라 따로 둔다 — `examples.js` 는 순수 함수로 남는다(save 가 Snap 으로 쓴다).

import fs from 'node:fs/promises'
import path from 'node:path'
import { planPurge } from './examples.js'
import { parseRegistry } from './managed.js'

async function walk(dir, rel = '') {
  const out = []
  for (const e of await fs.readdir(path.join(dir, rel), { withFileTypes: true }).catch(() => [])) {
    const r = rel ? rel + '/' + e.name : e.name
    if (e.isDirectory()) out.push(...(await walk(dir, r)))
    else if (/\.md$/i.test(e.name)) out.push(r)
  }
  return out
}

export async function purgeTree(root) {
  const read = (rel) => fs.readFile(path.join(root, rel), 'utf8').catch(() => null)
  const docs = new Map()
  for (const rel of await walk(root, 'docs')) docs.set(rel, (await read(rel)) ?? '')
  const registry = parseRegistry(((await read('_managed.md')) ?? '').replace(/\r/g, ''))
  const p = planPurge({ vocabText: (await read('_vocab.md')) ?? '', registry, docs })
  if (p.vocabText != null) await fs.writeFile(path.join(root, '_vocab.md'), p.vocabText, 'utf8')
  for (const [rel, text] of p.files) await fs.writeFile(path.join(root, rel), text, 'utf8')
  return { coords: p.coords.length, sections: p.sections.length, left: p.left.length }
}
