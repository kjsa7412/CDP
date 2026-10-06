// HTML 시각 자료 — 파일 API 의 격리(H0 · S1 · S2). HTML 시각 자료 검토 v0.1 · TODO ①.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { handleRead } from '../viewer/server/adapter/read-api.js'
import { HTML_CSP } from '../core/assets.js'

// `/file` 하나를 부르고 send 가 받은 것을 돌려준다
async function file(root, rel) {
  let got = null
  const url = new URL('http://x/file?path=' + encodeURIComponent(rel))
  await handleRead({ p: '/file', method: 'GET', url, res: {}, send: (res, status, body, headers = {}) => (got = { status, body, headers }), store: { root } })
  return got
}

test('/file — .html · .htm 은 sandbox CSP 로 · 그림 · md 에는 붙이지 않는다', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-html-'))
  try {
    await fs.mkdir(path.join(d, 'work', 'assets', 'x'), { recursive: true })
    await fs.writeFile(path.join(d, 'work', 'assets', 'x', '구성도.html'), '<!doctype html><title>t</title><script>parent.document</script>')
    await fs.writeFile(path.join(d, 'work', 'assets', 'x', 'b.HTM'), '<html></html>')
    await fs.writeFile(path.join(d, 'a.md'), '# a')
    for (const rel of ['work/assets/x/구성도.html', 'work/assets/x/b.HTM']) {
      const r = await file(d, rel)
      assert.equal(r.status, 200, rel)
      assert.equal(r.headers['content-type'], 'text/html; charset=utf-8', rel)
      assert.equal(r.headers['content-security-policy'], HTML_CSP, rel)
    }
    const md = await file(d, 'a.md')
    assert.equal(md.headers['content-security-policy'], undefined)
    // 같은 출처 · 밖으로 나가는 길 · 남의 틀
    assert.match(HTML_CSP, /^sandbox allow-scripts allow-popups allow-popups-to-escape-sandbox;/)
    assert.doesNotMatch(HTML_CSP, /allow-same-origin|allow-forms|allow-top-navigation/)
    assert.match(HTML_CSP, /connect-src 'none'/)
    assert.match(HTML_CSP, /img-src data: blob:(;|$)/)
    assert.match(HTML_CSP, /frame-ancestors 'self'/)
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})

// ── 받기 · save (TODO ②) ────────────────────────────────────────────────────

import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { save } from '../core/save.js'
import { sniff, stage, checkAssetName } from '../core/assets.js'
import { visualRefs, htmlTitle, visualTitle, htmlExternal, proseLength } from '../core/visuals.js'

const run = promisify(execFile)
const hasGit = await run('git', ['--version']).then(() => true).catch(() => false)
const g = (cwd, ...args) => run('git', ['-C', cwd, '-c', 'user.name=t', '-c', 'user.email=t@x', ...args])
const NL = '\n'
const skip = !hasGit && 'git 이 없다'

const PAGE = Buffer.from(
  '<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>SCADA 연계 &mdash; 구성도</title>' +
    '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=X"></head><body><svg></svg></body></html>'
)

test('sniff — doctype · <html · BOM · 주석 앞 · 대소문자는 HTML · 아닌 것 · 깨진 UTF-8 은 아니다', () => {
  for (const t of ['<!doctype html><p>', '<!DOCTYPE HTML>\n<html>', '﻿  <html lang="ko">', '<!-- 만든 것: claude -->\n<!doctype html>', '<HTML>']) {
    assert.equal(sniff(Buffer.from(t))?.type, 'text/html', t)
  }
  for (const t of ['<p>안녕</p>', '<svg xmlns="http://www.w3.org/2000/svg"/>', '<!-- 끝없는 주석', '<htmlx>', '# md']) {
    assert.equal(sniff(Buffer.from(t)), null, t)
  }
  assert.equal(sniff(Buffer.concat([Buffer.from('<!doctype html>'), Buffer.from([0xff, 0xfe, 0xc0])])), null, '깨진 UTF-8')
  assert.equal(checkAssetName('SCADA_연계_구성도.html'), '.html')
  assert.equal(checkAssetName('a.HTM'), '.htm')
})

test('htmlTitle · visualTitle · htmlExternal · proseLength', () => {
  assert.equal(htmlTitle(PAGE.toString()), 'SCADA 연계 — 구성도')
  assert.equal(htmlTitle('<title>  </title>'), null)
  assert.equal(htmlTitle('<p>'), null)
  assert.equal(htmlTitle('<title>A &amp; B &#x2014; &#45;</title>'), 'A & B — -')
  assert.equal(visualTitle('work/assets/x/SCADA_연계_구성도.html', '<p>'), 'SCADA_연계_구성도')
  assert.deepEqual(htmlExternal(PAGE.toString()), { cdn: [], blocked: [] }, '글꼴은 조용하다')
  const ext = htmlExternal(
    '<script src="https://cdn.jsdelivr.net/npm/d3@7"></script><script src="//unpkg.com/x"></script>' +
      '<img src="https://evil.example/p.png"><link rel=stylesheet href=http://cdnjs.cloudflare.com/a.css>' +
      '<style>@import "https://other.example/a.css"; .x{background:url(data:image/png;base64,AA)}</style><a href="https://링크는.자원이.아니다">x</a>'
  )
  assert.deepEqual(ext.cdn.sort(), ['cdn.jsdelivr.net', 'unpkg.com'])
  assert.deepEqual(ext.blocked.sort(), ['http://cdnjs.cloudflare.com/a.css', 'https://evil.example/p.png', 'https://other.example/a.css'])
  assert.equal(proseLength('## 제목\n\n[구성도](assets/x/a.html)\n'), '제목구성도'.length)
})

test('visualRefs — attachments 먼저 · 본문 링크 · 중복 · 레포 밖 · 그림 · 코드 블록은 뺀다', () => {
  const body = [
    '[구성도](../work/assets/x/%EA%B5%AC%EC%84%B1%EB%8F%84.html) [다시](<../work/assets/x/구성도.html>)',
    '[시퀀스](../work/assets/y/seq.htm) ![그림](../work/assets/x/a.png) [밖](../../밖.html) [웹](https://x/a.html)',
    '```',
    '[코드](../work/assets/z/no.html)',
    '```',
  ].join(NL)
  assert.deepEqual(visualRefs('docs/인터페이스정의서.md', body, []), ['work/assets/x/구성도.html', 'work/assets/y/seq.htm'])
  assert.deepEqual(visualRefs('work/2026-1006-x.md', '[a](assets/2026-1006-x/b.html)', ['assets/2026-1006-x/a.html', 'assets/2026-1006-x/a.png']), [
    'work/assets/2026-1006-x/a.html',
    'work/assets/2026-1006-x/b.html',
  ])
})

const VOCAB = ['# 어휘', '', '## table', '', '- `table:a` — 에이', ''].join(NL)
const MANAGED = ['# 등록부', '', '| 좌표 패턴 | 관리 문서 | 섹션 |', '|---|---|---|', '| `table:*` | `docs/t.md` | `## {값}` |', ''].join(NL)
const T = ['# 테이블정의서', '', '## a — A', '<!-- applied: null -->', '', 'a 의 처음 본문.', ''].join(NL)

async function repo() {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-savehtml-'))
  const r = path.join(d, 'alpha')
  await fs.mkdir(path.join(r, 'docs'), { recursive: true })
  await fs.mkdir(path.join(r, 'work'), { recursive: true })
  await fs.writeFile(path.join(r, '_vocab.md'), VOCAB)
  await fs.writeFile(path.join(r, '_managed.md'), MANAGED)
  await fs.writeFile(path.join(r, 'docs', 't.md'), T)
  await fs.writeFile(path.join(r, '.gitattributes'), '* text=auto eol=lf\n')
  await fs.writeFile(path.join(r, 'work', '.gitkeep'), '')
  await g(r, 'init', '-q')
  await g(r, 'add', '-A')
  await g(r, 'commit', '-qm', 'seed')
  return { r, staging: path.join(d, 'staging'), rm: () => fs.rm(d, { recursive: true, force: true, maxRetries: 8, retryDelay: 250 }) }
}

const LONG = '게이트웨이 방식으로 SCADA 와 연계한다. 책임 구간은 DPMS · DID · SCADA 셋으로 나눈다. 프레임 규격 초안 v0.1 의 요점은 길이 · 순번 · 체크섬이다. 확인 목록은 다섯 건이고 보안성 검토 대응이 그중 둘이다. 선례는 PSMW 익산 · 평창이다.'

test('save — HTML 첨부가 작업 기록 · 섹션과 한 커밋 · 링크로 가리키면 경고 없음 · 본문이 길면 요지 경고도 없음', { skip }, async () => {
  const R = await repo()
  try {
    const up = await stage(R.staging, PAGE)
    assert.equal(up.type, 'text/html')
    const id = '2026-1006-SCADA-연계'
    const out = await save(
      R.r,
      {
        work: { id, title: 'SCADA 연계', date: '2026-10-06 10:00', touches: ['table:a'], body: `${LONG}${NL}${NL}[SCADA 연계 구성도](assets/${id}/SCADA_연계_구성도.html)` },
        sections: [{ coord: 'table:a', applied: null, body: `a.${NL}${NL}[구성도](../work/assets/${id}/SCADA_연계_구성도.html)` }],
        assets: [{ ref: up.ref, name: 'SCADA_연계_구성도.html' }],
      },
      { user: 'hong', write: true, staging: R.staging }
    )
    assert.ok(out.commit)
    assert.deepEqual(out.assets, [{ path: `work/assets/${id}/SCADA_연계_구성도.html`, size: PAGE.length }])
    assert.deepEqual(out.warnings.filter((w) => /첨부|HTML|CDN|외부/.test(w)), [], out.warnings.join(' / '))
    assert.deepEqual(await fs.readFile(path.join(R.r, 'work', 'assets', id, 'SCADA_연계_구성도.html')), PAGE)
  } finally {
    await R.rm()
  }
})

test('save 경고 — HTML 만 걸고 요지가 없다 · 막히는 외부 자원 · CDN · 안 가리키면 링크 모양 예시', { skip }, async () => {
  const R = await repo()
  try {
    const page = Buffer.from('<!doctype html><title>t</title><script src="https://cdn.jsdelivr.net/npm/d3@7"></script><img src="https://evil.example/p.png">')
    const up = await stage(R.staging, page)
    const lone = await stage(R.staging, PAGE)
    const id = '2026-1006-짧음'
    const out = await save(
      R.r,
      {
        work: { id, title: '짧음', date: '2026-10-06 11:00', touches: ['table:a'], body: `[자료](assets/${id}/a.html)` },
        sections: [{ coord: 'table:a', applied: null, body: 'a.' }],
        assets: [{ ref: up.ref, name: 'a.html' }, { ref: lone.ref, name: '외톨이.html' }],
      },
      { user: 'hong', write: true, staging: R.staging }
    )
    assert.ok(out.commit)
    const all = out.warnings.join(' / ')
    assert.ok(out.warnings.some((w) => /본문이 짧다/.test(w) && /요지/.test(w)), all)
    assert.ok(out.warnings.some((w) => /a\.html 이 부르는 외부 자원 1개는 화면이 막는다/.test(w) && /evil\.example/.test(w)), all)
    assert.ok(out.warnings.some((w) => /a\.html 이 CDN\(cdn\.jsdelivr\.net\)/.test(w)), all)
    const un = out.warnings.find((w) => /어느 본문도 가리키지 않는다/.test(w))
    assert.ok(un && / \[설명\]\(\.\.\/work\/assets\//.test(un) && !/!\[설명\]/.test(un), un)
  } finally {
    await R.rm()
  }
})
