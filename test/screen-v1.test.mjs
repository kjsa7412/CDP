// 화면 v1.0 — 로컬 얼굴을 걷은 뒤의 지킴(개편안 §5.6 · §4.5 · §7.2). 화면 소스를 훑어 **없앤 것이 다시 들어오지 않게** 한다.
//
//   로컬 얼굴      PC 의 뷰어(`?t=` 토큰 헤더 · SSE · 하트비트 · git · 동기화 · 경로 고르기)를 부르는 코드가 없다
//   없앤 서버 길   콘솔 「에이전트 세팅 갱신」(POST /admin/repos/<r>/kit) · 패키지(GET /packages)를 부르지 않는다
//   용어 v1.0      사람이 읽는 화면 글에 버린 이름이 없다(주석은 본다 — 역사를 적는 자리다)
//   설치 한 줄     작업 레포 · 일괄 갱신 · 큐레이터 폴더가 한 함수(`lib/install.js`)로 짓는다

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { installCommand, guessShell, SHELLS } from '../viewer/src/lib/install.js'

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..')
const SRC = path.join(ROOT, 'viewer', 'src')

// 화면 소스 전부 — { rel, text }
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

// 주석을 걷는다 — 블록(`/* */` · JSX 의 `{/* */}` · HTML `<!-- -->`) · 줄(`//` — `://` 는 주소라 남긴다)
const stripComments = (s) =>
  s
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/(^|[^:'"`\\/])\/\/.*$/gm, '$1')

// 줄 번호를 찾는다(원문 기준) — 실패 문장에 적는다
const lineOf = (text, needle) => text.split('\n').findIndex((l) => l.includes(needle)) + 1

test('로컬 얼굴이 없다 — 화면이 PC 의 뷰어를 부르지 않는다(개편안 §5.6)', () => {
  const BAN = [
    [/EventSource|\/api\/events/, 'SSE(파일 감시)'],
    [/heartbeat/i, '하트비트(탭이 닫히면 뷰어를 끄던 것)'],
    [/['"`]\/git(\/(pull|push|config|hooks))?['"`?]/, '/git 라우트(pull · push · hooks)'],
    [/req\(['"`]\/sync['"`]/, '/sync(동기화)'],
    [/['"`]\/(diag|rescan|open|probe-external|state)['"`]/, '로컬 전용 라우트(diag · rescan · open · probe-external · state)'],
    [/\/repo\/probe/, '경로 고르기(/repo/probe)'],
    [/isServer\(|getMode\(/, '얼굴 갈래(isServer · getMode)'],
    [/__CDP_SERVER__/, '서버 표식으로 로컬과 가르기'],
    [/face\s*===\s*'local'|face:\s*'local'/, "로컬 얼굴('local')"],
    [/cdp:remount/, '로컬 레포 경로 바꾸기(cdp:remount)'],
    [/watchAlive|watchEnabled|hostWarning|keepAlive/, '감시 · loopback 경고 · 트레이(서버가 내지 않는다)'],
    [/sessionStorage\.(get|set)Item\(\s*['"`]cdp\.token/, '?t= 세션 토큰'],
  ]
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    for (const [re, what] of BAN) {
      const m = re.exec(code)
      if (m) assert.fail(`${rel}:${lineOf(text, m[0])} — ${what}: 「${m[0]}」`)
    }
  }
})

test('없앤 서버 길을 부르지 않는다 — 에이전트 세팅 갱신 · 패키지', () => {
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    assert.ok(!/repoKit|\/kit['"`]\s*,\s*\{\s*\.\.\.J\('POST'/.test(code), `${rel} — POST /admin/repos/<r>/kit(에이전트 세팅 갱신)은 서버에서 지웠다`)
    assert.ok(!/['"`]\/packages['"`]/.test(code), `${rel} — GET /packages 는 서버에서 지웠다`)
    assert.ok(!/에이전트 세팅 갱신/.test(code), `${rel} — 「에이전트 세팅 갱신」 단추 · 문구`)
  }
})

// 개편안 §4.5 의 「버린다」 열 — 화면 글(주석 밖)에 없어야 한다. 서버가 내는 키 이름(`pendingDerive` 등)은 읽지 않으니 검사 밖이다
const DROPPED = ['지식공유문서', '지식 단위', '작업문서', '파생', '따라잡', '밀림', '미작성', '패키지', '템플릿', '서식 예시', '예시 좌표']

test('화면 글에 버린 용어가 없다(용어 v1.0 · 개편안 §4.5)', () => {
  for (const { rel, text } of sources()) {
    const code = stripComments(text)
    for (const w of DROPPED) {
      if (code.includes(w)) assert.fail(`${rel}:${lineOf(text, w)} — 「${w}」 는 v1.0 에서 버린 이름이다(작업 기록 · 반영 · 미반영 · 대기열 · 서식 · 서식집 · 못 보냄)`)
    }
  }
})

test('설치 한 줄 — 작업 레포 · 일괄 갱신 · 큐레이터 폴더가 한 함수로', () => {
  const o = 'http://cdp.example:7374'
  assert.deepEqual(SHELLS.map((s) => s.key), ['ps', 'cmd', 'sh'])
  // 큐레이터 폴더 — 등록 id 도 git 도 없다 · 그 폴더에서(.)
  assert.equal(installCommand('sh', { origin: o, repo: 'alpha', curator: true }), `curl -fsSLo /tmp/cdp-install.mjs ${o}/install.mjs && node /tmp/cdp-install.mjs --curator --repo alpha .`)
  assert.equal(
    installCommand('ps', { origin: o, repo: 'alpha', curator: true }),
    `curl.exe -fsSLo "$env:TEMP\\cdp-install.mjs" ${o}/install.mjs; if ($?) { node "$env:TEMP\\cdp-install.mjs" --curator --repo alpha . }`
  )
  assert.equal(installCommand('cmd', { origin: o, repo: 'alpha', curator: true }), `curl -fsSLo "%TEMP%\\cdp-install.mjs" ${o}/install.mjs && node "%TEMP%\\cdp-install.mjs" --curator --repo alpha .`)
  for (const sh of ['ps', 'cmd', 'sh']) assert.ok(!installCommand(sh, { origin: o, repo: 'alpha', curator: true }).includes('--workrepo'), `${sh} — 큐레이터 폴더는 대장에 오르지 않는다`)
  // 작업 레포 · 일괄 갱신 — 전과 같은 모양
  assert.match(installCommand('sh', { origin: o, repo: 'alpha', id: 'wr-1' }), / --repo alpha --workrepo wr-1 \.$/)
  assert.match(installCommand('sh', { origin: o, update: true }), / --update$/)
  // 토큰은 명령에 없다(§6.7.3)
  for (const args of [{ repo: 'alpha', curator: true }, { repo: 'alpha', id: 'x' }, { update: true }]) assert.ok(!/token|Bearer|CDP_TOKEN/i.test(installCommand('ps', { origin: o, ...args })))
  assert.equal(guessShell({ platform: 'Win32' }), 'ps')
  assert.equal(guessShell({ platform: 'MacIntel' }), 'sh')
  assert.equal(guessShell(null), 'sh')
})
