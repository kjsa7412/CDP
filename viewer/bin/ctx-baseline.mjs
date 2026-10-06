// ctx baseline — 기준선 블록을 뽑고 서버에 올린다. v1.0 개편안 §3.2 · §9.1.
//
//   ctx baseline extract <옛 레포> --doc <docs/…md> [--src "…"] [--asof YYYY-MM-DD] [--form <묶음/번호>] [--to docs/…md]
//       옛 관리 문서의 대상형 섹션을 기준선 JSON 으로 — 다시 세운 레포로 옮겨 오는 재료. 표준 출력에 낸다
//   ctx baseline push <파일.json> --server <주소> --repo <레포>
//       그 JSON 을 서버에 올린다(`POST /api/<레포>/baseline` · 큐레이터 토큰 — 환경변수 CDP_TOKEN). 한 커밋이다
//
// 프로젝트의 생성기(gdi 의 `gdi_wiki_gen` 처럼 DB · 소스에서 뽑는 스크립트)도 같은 JSON 을 만들어 `push` 로 올린다:
//   { source, asof, managed?: [{ pattern, doc, form }], vocab?: [{ coord, label, aliases }], items: [{ coord, heading?, body }] }

import fs from 'node:fs/promises'
import path from 'node:path'
import { loadRepo } from '../../core/repo.js'
import { extractFromDoc } from '../../core/baseline.js'
import { sliceSection, toError } from '../../core/tools.js'
import { docNo } from '../../core/docrefs.js'
import { formsLib } from '../../core/formslib.js'

const NL = '\n'
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

export async function runBaseline(opt) {
  const [sub, arg] = opt.args
  try {
    if (sub === 'extract') {
      if (!arg || !opt.doc) {
        err('ctx baseline extract <옛 레포> --doc <docs/…md> [--src "…"] [--asof YYYY-MM-DD] [--form <id>] [--to docs/…md]')
        return 2
      }
      const r = await loadRepo(path.resolve(arg))
      const x = extractFromDoc(r, opt.doc, { sliceSection })
      if (!x) {
        err(`ctx baseline extract: 그 관리 문서가 없다 — ${opt.doc}`)
        return 1
      }
      // 서식 — 주지 않으면 관리번호(DE_431)로 서식집에서 찾는다
      let form = opt.form || null
      let title = null
      if (!form) {
        const no = docNo(opt.doc)
        const lib = await formsLib({ explicit: opt.forms || null })
        const f = no ? lib.forms.find((f) => f.number === no && f.group === 'public-si') || lib.forms.find((f) => f.number === no) : null
        form = f?.id ?? null
        title = f?.title ?? null
      }
      const stem = path.basename(opt.doc).replace(/\.md$/i, '')
      const bare = docNo(opt.doc) ? stem.slice(docNo(opt.doc).length).replace(/^[_ -]+/, '') : stem
      const to = opt.to || `docs/${title || bare}.md`
      const asof = opt.asof || new Date().toISOString().slice(0, 10)
      const json = {
        source: opt.src || `옛 레포 ${path.basename(path.resolve(arg))} 의 ${opt.doc}`,
        asof,
        managed: x.rules.map((rule) => ({ op: 'add', pattern: rule.pattern, doc: to, ...(form ? { form } : {}) })),
        vocab: x.vocab,
        items: x.items,
      }
      out(JSON.stringify(json, null, 2))
      err(`ctx baseline extract: 섹션 ${x.items.length} · 등록부 행 ${x.rules.length} · 서식 ${form || '(없음)'} → ${to}`)
      return 0
    }

    if (sub === 'push') {
      if (!arg || !opt.server || !opt.repo) {
        err('ctx baseline push <파일.json> --server <주소> --repo <레포>   (토큰: 환경변수 CDP_TOKEN · 큐레이터)')
        return 2
      }
      const token = process.env.CDP_TOKEN
      if (!token) {
        err('ctx baseline push: 환경변수 CDP_TOKEN 이 없다 — 큐레이터 토큰을 넣는다')
        return 2
      }
      const body = JSON.parse(await fs.readFile(path.resolve(arg), 'utf8'))
      const url = String(opt.server).replace(/\/+$/, '') + '/api/' + encodeURIComponent(opt.repo) + '/baseline'
      const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) })
      const j = await res.json().catch(() => ({}))
      if (!res.ok) {
        err(`ctx baseline push: ${res.status} ${j?.error?.code || ''} ${j?.error?.message || ''}`)
        return 1
      }
      out(`ctx baseline push: 커밋 ${j.commit} · 블록 ${j.baseline ?? 0} · 등록부 ${j.managed ?? 0} · 어휘 ${j.vocab ?? 0}`)
      for (const w of j.warnings || []) out('  ⚠ ' + w)
      return 0
    }

    err('ctx baseline extract | push')
    return 2
  } catch (e) {
    const x = toError(e)
    err(`ctx baseline: ${x.code} ${x.message}`)
    return 1
  }
}
