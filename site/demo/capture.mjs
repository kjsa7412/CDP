// 캡처 — 화면 17장 × 라이트 · 다크(공식 사이트 제작 검토 v0.1 S7 · §5.1 · v1.2 셸 — 화면 16 · 「시작하기」).
//
// `playwright-core` 에 이 PC 의 Edge(없으면 Chrome)를 붙인다 — 브라우저를 내려받지 않는다. CI 는 이것을 돌지 않는다:
// 사람이 판을 올릴 때 한 번 돌리고 PNG 를 커밋한다. **찍기 전에 화면의 글자와 속성값을 누출 패턴으로 훑는다** —
// 걸리면 그 장을 찍지 않고 멈춘다.
//
// 녹화(record.mjs) **뒤의** 상태를 찍는다 — 대기 5 · 미반영 · 큐레이션 7번. 장마다 누가 보나가 정해져 있다:
//   dev.a  writer(library 는 기록만) — 지식 묶음      doc.c  library 의 큐레이터 — 큐레이션 묶음(메뉴에 서버가 없다)
//   lead   admin — 레포 관리 · 서버 묶음(현황 · 지식 레포 · 사람 · 서버)   dev.b  viewer — 읽기만
//
// 선택자 · 주소는 제품 화면의 것이다(viewer/src · 셸 표 `shell/nav.js` · `shell/routes.js`). 화면을 고쳐 선택자가 바뀌면 여기가
// 멈춘다 — 그때 고친다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { ROOT, NL, wait } from './lib.mjs'
import { findLeaks } from '../tools/leaks.mjs'

const DEST = path.join(ROOT, 'site', 'public', 'shots')
const W = 1440
const H = 900
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)
const R = '/r/library/'
const doc = (p, at) => R + 'd/' + p.split('/').map(encodeURIComponent).join('/') + (at ? '?at=' + encodeURIComponent(at) : '')

async function launch() {
  for (const channel of ['msedge', 'chrome']) {
    try {
      return await chromium.launch({ channel, headless: true })
    } catch {}
  }
  throw new Error('Edge 도 Chrome 도 못 띄웠다 — 둘 중 하나를 깐다')
}

// 화면 전체의 글자 + 속성값
const textOf = (page) =>
  page.evaluate(() => {
    const out = [document.title, document.body.innerText]
    for (const el of document.querySelectorAll('*')) for (const a of ['placeholder', 'title', 'value', 'aria-label', 'alt', 'href']) if (el.getAttribute?.(a)) out.push(el.getAttribute(a))
    for (const el of document.querySelectorAll('input,textarea')) out.push(el.value)
    return out.join('\n')
  })

// 서버 › 서버 는 파일 자리(레포 · data · 화면 · 서식집 · kit · 설명서)를 그대로 보인다 — 이 PC 의 경로(사용자 이름이 든다)를
// 서버에 깐 모양의 자리로 바꿔 그린다. 긴 것부터 · 글자와 속성값 둘 다. 바꾼 뒤에 누출 검사가 다시 훑는다
const PATHS = [
  ['ops/out/site-demo/repos', '/srv/cdp/repos'],
  ['ops/out/site-demo/data', '/srv/cdp/data'],
  ['ops/out/site-demo', '/srv/cdp'],
  ['ops/out/web', '/srv/cdp/web'],
  ['ops/out/ctx', '/srv/cdp/bin'],
  ['site/demo/manual', '/srv/cdp/manual'],
  ['agent/forms', '/srv/cdp/forms'],
  ['agent', '/srv/cdp/kit'],
  ['', '/srv/cdp'],
].map(([rel, to]) => [rel ? path.join(ROOT, rel) : ROOT, to])
const maskPaths = (page) =>
  page.evaluate((pairs) => {
    const fix = (t) => pairs.reduce((s, [from, to]) => s.split(from).join(to), t)
    const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT)
    for (let n = w.nextNode(); n; n = w.nextNode()) if (pairs.some(([f]) => n.nodeValue.includes(f))) n.nodeValue = fix(n.nodeValue)
    for (const el of document.querySelectorAll('*')) for (const a of ['title', 'value', 'href', 'aria-label']) {
      const v = el.getAttribute?.(a)
      if (v && pairs.some(([f]) => v.includes(f))) el.setAttribute(a, fix(v))
    }
  }, PATHS)

const idle = (p) => p.waitForFunction(() => !document.body.innerText.includes('읽는 중…'))

export async function capture({ base, st, out }) {
  await fs.mkdir(DEST, { recursive: true })
  const browser = await launch()
  const done = []
  try {
    for (const theme of ['light', 'dark']) {
      const ctxs = {}
      const ctxFor = async (who) => {
        if (ctxs[who || '-']) return ctxs[who || '-']
        const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, colorScheme: theme, reducedMotion: 'reduce', locale: 'ko-KR' })
        await c.addInitScript((t) => {
          try {
            localStorage.setItem('cdp.theme', t)
            localStorage.setItem('cdp.nav', 'open')
          } catch {}
        }, theme)
        if (who) {
          const r = await c.request.post(base + '/login', { data: { token: st.tokens[who] } })
          if (!r.ok()) throw new Error(`${who} 로그인 실패 ${r.status()}`)
        }
        ctxs[who || '-'] = c
        return c
      }
      const shoot = async (id, who, fn) => {
        if (ONLY.length && !ONLY.some((o) => id.startsWith(o))) return
        const c = await ctxFor(who)
        const page = await c.newPage()
        // 장마다 빈 화면 상태로 — 같은 사람의 앞 장이 연 문서 탭 · 최근이 남지 않게(`cdp.state.<레포>` · 테마 · 메뉴 접힘은 그대로)
        await page.addInitScript(() => {
          try {
            for (const k of Object.keys(localStorage)) if (k.startsWith('cdp.state.')) localStorage.removeItem(k)
          } catch {}
        })
        try {
          await fn(page)
          await page.mouse.move(1, 1)
          await wait(400)
          await maskPaths(page)
          const leaks = findLeaks(await textOf(page))
          if (leaks.length) throw new Error(`${id} — 화면에 누출 패턴: ${leaks.slice(0, 5).map((l) => `${l.kind} 「${l.hit}」 … ${l.near}`).join(' | ')}`)
          const file = path.join(DEST, `${id}-${theme}.png`)
          await page.screenshot({ path: file, type: 'png' })
          done.push(path.basename(file))
        } catch (e) {
          throw new Error(`${id}-${theme} — ${e.message}`)
        } finally {
          await page.close()
        }
      }
      // 레포 얼굴 — 셸(왼쪽 메뉴 · 상단 바)이 서고 데이터를 다 읽을 때까지
      const open = async (p, url) => {
        await p.goto(base + url)
        await p.waitForSelector('header.topbar')
      }
      const repoReady = async (p) => {
        await p.waitForSelector('.app[data-top]')
        await p.waitForSelector('.snav')
        await p.waitForFunction(() => !document.querySelector('.empty'))
        await p.waitForLoadState('networkidle')
      }
      const docReady = async (p) => {
        await repoReady(p)
        await p.waitForSelector('article.doc')
        await p.evaluate(() => document.fonts.ready)
      }

      // ── 지식 — 모두 ──
      // 관리 문서의 섹션 제목에 「미반영 1」 · 제목 아래 미반영 블록(S1). 대출마스터 뒤에 대출 이력 조회 기록이 아직 대기다
      await shoot('01-repo-doc', 'dev.a', async (p) => {
        await open(p, doc('docs/테이블정의서.md', 'bk_loan_mst'))
        await docReady(p)
        await p.waitForSelector('.pchip')
        await p.waitForSelector('.pblock')
        await wait(2600) // ?at= 의 섹션 강조가 2초 남는다
      })

      // 좌표 목록은 「좌표 · 그래프」 화면의 레일이 든다 — 거기서 골라 뻗어나가기로 나온다
      await shoot('02-repo-explore', 'dev.a', async (p) => {
        await open(p, R + 'graph')
        await p.waitForSelector('.gr__stat')
        await p.locator('.gr__g', { has: p.locator('.gr__gname', { hasText: '테이블정의서' }) }).first().click()
        await p.click('.gr__i[title^="테이블정의서:bk_loan_mst "]')
        await p.click('.gr__btn--go')
        await p.waitForSelector('.xp__head[title="테이블정의서:bk_loan_mst"]')
        await p.waitForFunction(() => !document.querySelector('.xp__busy'))
        await wait(2600)
      })

      // 작업 기록 — 목록의 상태 칩(대기 · 반영됨 · 기록으로 둠)과 정정 기록의 머리(대신하는 옛 기록 · 반영됨 → 좌표 · S2)
      await shoot('03-repo-work', 'dev.a', async (p) => {
        await open(p, doc('2026-1007-우수회원-한도-정정'))
        await docReady(p)
        await p.waitForSelector('.vblock__cur')
        await wait(600)
      })

      await shoot('04-repo-graph', 'dev.a', async (p) => {
        await open(p, R + 'graph')
        await p.waitForSelector('.gr__stat')
        await p.evaluate(() => document.fonts.ready)
        await p.locator('.gr__g', { has: p.locator('.gr__gname', { hasText: '테이블정의서' }) }).first().click()
        await p.click('.gr__i[title^="테이블정의서:bk_loan_mst "]')
        await wait(1200)
      })

      await shoot('05-repo-search', 'dev.a', async (p) => {
        await open(p, doc('docs/화면설계서.md'))
        await docReady(p)
        await p.keyboard.press('Control+k')
        await p.waitForSelector('.palette__input input')
        await p.keyboard.type('연체')
        await p.waitForSelector('.palette__group')
        await wait(500)
      })

      // 검증 — 상단 바의 검사 칸. 미반영은 오류가 아니라 알림이다
      await shoot('06-repo-check', 'lead', async (p) => {
        await open(p, doc('docs/코드정의서.md'))
        await docReady(p)
        await p.click('.topbar__center .pill')
        await p.waitForSelector('[role=dialog][aria-label="검사 결과"]')
        await idle(p)
        await wait(500)
      })

      // ── 레포 관리 ──
      // library 에는 「섹션 없음」 좌표(대기열의 등록부 있음 · 섹션 없음)가 둘 있다 — 깨진 섹션이 아니라 큐레이터의 일이다(v1.0 H1 ·
      // 현황의 「깨진 섹션」 은 문서 없는 행 · 유령 applied 만 센다)
      // 맨 위 「시작하기」 — 대기 · 낡은 작업 레포 · 큐레이터 폴더 줄(서버 /next 가 계산한다)
      await shoot('07-repo-admin', 'lead', async (p) => {
        await open(p, '/r/library/manage/overview')
        await p.waitForSelector('.agrid')
        await p.waitForSelector('.start')
        await idle(p)
        await p.waitForLoadState('networkidle')
      })

      // viewer — 메뉴에 큐레이션 · 서버가 없다. 미반영은 viewer 에게도 같이 보인다. 레포 고르기를 편다
      await shoot('08-repo-viewer', 'dev.b', async (p) => {
        await open(p, doc('docs/프로그램사양서.md'))
        await docReady(p)
        await p.waitForSelector('.pchip')
        await p.click('.snav__repobtn[aria-haspopup="menu"]')
        await p.waitForSelector('.repomenu')
        await wait(300)
      })

      // ── 큐레이션 — 큐레이터(doc.c) ──
      // 대기열 — 위 KPI · 왼쪽 대기 다섯 · 오른쪽 판정 재료(대출 이력 조회) · 둘을 골라 에이전트 지시를 만든다
      await shoot('09-curation-queue', 'doc.c', async (p) => {
        await open(p, R + 'manage/curation')
        await p.waitForSelector('.qtable')
        await idle(p)
        await p.click('.qtable__title[title="2026-0928-대출이력-조회-화면"]')
        await p.check('input[aria-label="대출 이력 조회 화면 — 회원별 · 기간별 고르기"]')
        await p.check('input[aria-label="대출 · 반납 통합 시험 시나리오 — 반납예정일 전날 · 당일 · 다음날 고르기"]')
        await p.waitForSelector('.qmat')
        await p.waitForLoadState('networkidle')
        await wait(500)
      })

      // 이력 — 큐레이션 한 번이 한 줄 · 펼친 줄은 판정표(반영 · 새 문서 · 기록으로 둠)
      await shoot('10-curation-log', 'doc.c', async (p) => {
        await open(p, R + 'manage/curation/log/' + encodeURIComponent('2026-0520-큐레이션-서지연계-연체이력'))
        await p.waitForSelector('.ltable__open')
        await idle(p)
        await wait(400)
      })

      // 서식집 — 서버가 실제로 찍을 빈 문서(만들어지는 문서)
      await shoot('11-curation-forms', 'doc.c', async (p) => {
        await open(p, R + 'manage/forms/public-si/DE_431')
        await p.waitForSelector('.fv__paper article.doc')
        await idle(p)
        // 묶음 거름 public-si — 이 레포가 쓰는 서식의 「씀」 이 보이게 · 고른 서식을 목록 가운데로
        await p.locator('.fl__groups .fd__chip', { hasText: 'public-si' }).click()
        await p.evaluate(() => {
          const l = document.querySelector('.fl__list')
          const r = document.querySelector('.fl__row[aria-current=page]')
          if (l && r) l.scrollTop += r.getBoundingClientRect().top - l.getBoundingClientRect().top - l.clientHeight / 2 + r.clientHeight / 2
        })
        await wait(400)
      })

      // ── 서버 — admin ──
      // 현황(「시작하기」 는 서버 일이 있을 때만 — 레포 없음 · 토큰 만료) · 지식 레포는 작업 레포 펼침 열을 전부 편다(?wr=1) · 서버는 설정 · 진단 · 감사(접힘)
      for (const [id, url, sel] of [
        ['12-console-home', '/console', '.agrid'],
        ['13-console-repos', '/console/repos?wr=1', '.ctable__sub'],
        ['15-console-server', '/console/server', '#doctor .tcount'],
      ]) {
        await shoot(id, 'lead', async (p) => {
          await open(p, url)
          await p.waitForSelector('.admin__body')
          await p.waitForSelector(sel)
          await idle(p)
          await p.waitForLoadState('networkidle')
          await wait(300)
        })
      }

      // 사람 — 명부(줄마다 [발급]) · 토큰 · 레포 × 사용자 · 레포 × 큐레이터(레포별 권한)
      await shoot('14-console-people', 'lead', async (p) => {
        await open(p, '/console/people')
        await p.waitForSelector('.admin__body .ctable')
        await idle(p)
        await p.waitForLoadState('networkidle')
        await p.evaluate(() => (document.getElementById('tokens') || document.getElementById('matrix'))?.scrollIntoView({ block: 'start' }))
        await wait(400)
      })

      // ── 사이트 · 설명서 — 토큰 없이 ──
      await shoot('16-site-landing', null, async (p) => {
        await p.goto(base + '/')
        await p.waitForSelector('.hero')
        await p.waitForLoadState('networkidle')
      })

      await shoot('17-site-manual', null, async (p) => {
        await p.goto(base + '/manual/' + encodeURIComponent('사용자_설명서'))
        await p.waitForSelector('.man__body article.doc')
        await idle(p)
      })

      for (const c of Object.values(ctxs)) await c.close()
    }
  } finally {
    await browser.close()
  }
  if (!ONLY.length) {
    // 이번에 찍지 않은 그림(판이 바뀌며 없어진 장)을 치운다
    for (const f of await fs.readdir(DEST)) if (f.endsWith('.png') && !done.includes(f)) await fs.rm(path.join(DEST, f))
    // 어느 판으로 찍었나 — 판을 올려도 그림은 그대로라, 사이트가 「판 vX 의 화면」 을 package.json 이 아니라 이것으로 말한다
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
    await fs.writeFile(path.join(ROOT, 'site/src/data/shots.json'), JSON.stringify({ version: pkg.version, captured: new Date().toISOString().slice(0, 10) }, null, 2) + NL)
  }
  console.log(`[site:demo] 캡처 ${done.length}장 → site/public/shots/`)
}
