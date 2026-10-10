// 화면 안내 글 — 제품화 2 ⑦ 의 규칙을 소스로 지킨다(화면 설계서 「안내 글 규칙」).
//
//   ⑤ 숫자 · 장 번호 · 경로는 서버 값 — 화면 글에 「N장」 · 「다섯」(스킬 수) · `/opt/cdp`(설치 자리) 리터럴이 없다
//   ① 화면 하나에 한 줄 — 카드 `hint` 의 글 리터럴은 40자 안
//   ④ 설계 근거는 화면에서 뺀다 — 「알림을 띄우지 않는다」 · 「서버는 LLM 을 부르지 않는다」 가 화면 글에 없다
//   「시작하기」 의 설치 한 줄은 서버가 준 인자(`cmd.args`)를 같은 함수(`installCommand`)로 짓는다
// 주석은 본다(역사를 적는 자리다) — 검사는 주석을 걷은 코드에만.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installCommand } from '../viewer/src/lib/install.js'
import { registryCommand, REGISTRY_RULE } from '../viewer/src/lib/curation.js'
import { builtOf } from '../viewer/src/lib/format.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'viewer', 'src')

function sources() {
  const out = []
  const walk = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name)
      if (e.isDirectory()) walk(p)
      else if (/\.(jsx?|mjs)$/.test(e.name)) out.push({ rel: path.relative(ROOT, p).split(path.sep).join('/'), text: fs.readFileSync(p, 'utf8') })
    }
  }
  walk(SRC)
  out.push({ rel: 'viewer/index.html', text: fs.readFileSync(path.join(ROOT, 'viewer', 'index.html'), 'utf8') })
  return out
}
const stripComments = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\/])\/\/.*$/gm, '$1')
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1

test('⑤ 손으로 쓴 장 번호 · 개수 · 설치 경로가 없다', () => {
  const BAN = [
    [/[0-9]+\s?장(?![가-힣])/, '장 번호 — 설명서 절 링크(HelpLink · /site/info 의 help)로'],
    [/다섯/, '「다섯」 — 개수는 서버 값으로(스킬 · 도구 수)'],
    [/\/opt\/cdp/, '/opt/cdp — 설치 자리는 서버 값(/admin/server 의 data)으로'],
    [/도구 1[0-9]|스킬 [0-9]+종/, '도구 · 스킬 수 — 서버 값이 아니면 숫자를 적지 않는다'],
  ]
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    for (const [re, what] of BAN) {
      const m = re.exec(code)
      if (m) assert.fail(`${rel}:${lineOf(text, m[0])} — ${what}: 「${m[0]}」`)
    }
  }
})

test('① 카드 hint 는 40자 안 — 「왜」 는 설명서 절로', () => {
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    for (const m of code.matchAll(/\bhint="([^"]*)"/g)) {
      // 입력 창(Prompt · Field)의 hint 는 칸 아래 설명이라 이 규칙 밖 — 카드 머리만(`<Card … hint=`)
      const before = code.slice(Math.max(0, m.index - 200), m.index)
      if (!/<Card\b[^<>]*$/.test(before)) continue
      assert.ok([...m[1]].length <= 40, `${rel}:${lineOf(text, m[1])} — hint ${[...m[1]].length}자: 「${m[1]}」`)
    }
  }
})

test('④ 설계 근거 문장이 화면 글에 없다', () => {
  const BAN = [/알림을 띄우지 않/, /LLM 을 부르지 않/, /탭을 다 닫은 자리/, /_vocab\.md<\/code> 를 확인/]
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    for (const re of BAN) {
      const m = re.exec(code)
      if (m) assert.fail(`${rel}:${lineOf(text, m[0])} — 「${m[0]}」 는 설계서 · 설명서의 글이다`)
    }
  }
})

test('시작하기의 설치 한 줄 — 서버가 준 인자를 같은 함수로', () => {
  const o = 'http://127.0.0.1:7400'
  assert.equal(installCommand('sh', { origin: o, args: '--curator --repo alpha .' }), `curl -fsSLo /tmp/cdp-install.mjs ${o}/install.mjs && node /tmp/cdp-install.mjs --curator --repo alpha .`)
  assert.equal(installCommand('sh', { origin: o, args: '--update' }), installCommand('sh', { origin: o, update: true }), 'args 와 옛 깃발이 같은 줄')
  assert.match(installCommand('ps', { origin: o, args: '--update' }), /\$env:TEMP.*--update \}$/)
  assert.match(installCommand('cmd', { origin: o, args: '--update' }), /%TEMP%.* --update$/)
})

test('서식집의 에이전트 지시 — cdp-registry', () => {
  assert.equal(registryCommand('alpha', ['public-si/DE_431']), `cdp-registry alpha\n서식: public-si/DE_431\n${REGISTRY_RULE}`)
  assert.match(registryCommand('alpha'), /^cdp-registry alpha\n서식: \(.*forms\(\)/)
  assert.equal(registryCommand('a', ['x', 'x', '', 'y']).split('\n')[2].trim(), 'y', '겹침 · 빈 값은 뺀다 · 둘째부터 들여 쓴다')
})

test('빌드 시각 — 소스로 돌린 서버의 자리표는 그리지 않는다', () => {
  assert.equal(builtOf('__CTX_BUILT__'), null)
  assert.equal(builtOf(''), null)
  assert.equal(builtOf(undefined), null)
  assert.equal(builtOf('2026-10-10 12:00'), '2026-10-10 12:00')
})
