// 캡처 — 화면 14장 × 라이트 · 다크(공식 사이트 제작 검토 v0.1 S7 · §5.1).
//
// `playwright-core` 에 이 PC 의 Edge(없으면 Chrome)를 붙인다 — 브라우저를 내려받지 않는다. CI 는 이것을 돌지 않는다:
// 사람이 판을 올릴 때 한 번 돌리고 PNG 를 커밋한다. **찍기 전에 화면의 글자와 속성값을 누출 패턴으로 훑는다** —
// 걸리면 그 장을 찍지 않고 멈춘다.
//
// 선택자 · 기다릴 것은 제품 화면의 것이다(viewer/src). 화면을 고쳐 선택자가 바뀌면 여기가 멈춘다 — 그때 고친다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { chromium } from 'playwright-core'
import { ROOT, NL, git, serve, ready, wait } from './lib.mjs'
import { findLeaks } from '../tools/leaks.mjs'

const DEST = path.join(ROOT, 'site', 'public', 'shots')
const W = 1440
const H = 900
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) || '').slice(7).split(',').filter(Boolean)

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

export async function capture({ base, st, out }) {
  await fs.mkdir(DEST, { recursive: true })
  const browser = await launch()
  // 빈 명부 서버 — 설치 마법사(12)는 명부가 비어야 뜬다
  const setupPort = Number(new URL(base).port) + 1
  const S2 = serve(['--root', out.repos, '--port', String(setupPort), '--auth', path.join(out.data, '..', 'auth-empty.json'), '--data', path.join(out.data, '..', 'data-empty'), '--web', path.join(ROOT, 'ops/out/web')])
  const done = []
  try {
    await ready(setupPort)
    for (const theme of ['light', 'dark']) {
      const ctxs = {}
      const ctxFor = async (who, init = {}) => {
        const key = who + JSON.stringify(init)
        if (ctxs[key]) return ctxs[key]
        const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, colorScheme: theme, reducedMotion: 'reduce', locale: 'ko-KR' })
        await c.addInitScript(
          ([t, st]) => {
            try {
              localStorage.setItem('cdp.theme', t)
              if (st) localStorage.setItem('cdp.state.library', JSON.stringify(st))
              else localStorage.removeItem('cdp.state.library')
            } catch {}
          },
          [theme, init.state || null]
        )
        if (who) {
          const r = await c.request.post(base + '/login', { data: { token: st.tokens[who] } })
          if (!r.ok()) throw new Error(`${who} 로그인 실패 ${r.status()}`)
        }
        ctxs[key] = c
        return c
      }
      const shoot = async (id, who, fn, init) => {
        if (ONLY.length && !ONLY.some((o) => id.startsWith(o))) return
        const c = await ctxFor(who, init)
        const page = await c.newPage()
        try {
          await fn(page)
          await page.mouse.move(1, 1)
          await wait(400)
          const leaks = findLeaks(await textOf(page))
          if (leaks.length) throw new Error(`${id} — 화면에 누출 패턴: ${leaks.slice(0, 5).map((l) => `${l.kind} 「${l.hit}」 … ${l.near}`).join(' | ')}`)
          const file = path.join(DEST, `${id}-${theme}.png`)
          await page.screenshot({ path: file, type: 'png' })
          done.push(path.basename(file))
        } finally {
          await page.close()
        }
      }
      const repoReady = async (page) => {
        await page.waitForSelector('.app[data-top]')
        await page.waitForFunction(() => !document.querySelector('.empty'))
        await page.waitForLoadState('networkidle')
      }
      const open = async (page, url) => {
        await page.goto(base + url)
        await page.waitForSelector('header.topbar')
      }
      const DOC = { lastDoc: 'docs/2.개발/DE_431_테이블정의서.md' }

      await shoot('01-repo-doc', 'dev.a', async (p) => {
        await open(p, '/r/library/')
        await repoReady(p)
        await p.waitForSelector('article.doc')
        await p.click('.toc__item[title="bk_loan_mst — 대출마스터"]')
        await wait(2600) // .doc__at 강조가 2초 남는다
      }, { state: DOC })

      await shoot('02-repo-explore', 'dev.a', async (p) => {
        await open(p, '/r/library/')
        await repoReady(p)
        await p.locator('.fd__chip', { hasText: '좌표' }).first().click()
        await p.fill('.fd__q input', 'bk_loan_mst')
        await p.click('.fd__row[title^="테이블정의서:bk_loan_mst"]')
        await p.waitForSelector('.xp__head[title="테이블정의서:bk_loan_mst"]')
        await p.waitForFunction(() => !document.querySelector('.xp__busy'))
        await wait(2600)
      }, { state: DOC })

      await shoot('03-repo-work', 'dev.a', async (p) => {
        await open(p, '/r/library/')
        await repoReady(p)
        await p.waitForSelector('article.doc')
        await p.locator('.fd__chip', { hasText: '작업문서' }).first().click()
        await wait(600)
      }, { state: { lastDoc: '2026-0925-우수회원-한도-정정' } })

      await shoot('04-repo-graph', 'dev.a', async (p) => {
        await open(p, '/r/library/graph')
        await p.waitForSelector('.gr__stat')
        await p.evaluate(() => document.fonts.ready)
        await p.locator('.gr__g', { has: p.locator('.gr__gname', { hasText: '테이블정의서' }) }).first().click()
        await p.click('.gr__i[title^="테이블정의서:bk_loan_mst "]')
        await wait(1200)
      })

      await shoot('05-repo-search', 'dev.a', async (p) => {
        await open(p, '/r/library/')
        await repoReady(p)
        await p.waitForSelector('article.doc')
        await p.keyboard.press('Control+k')
        await p.waitForSelector('.palette__input input')
        await p.keyboard.type('연체')
        await p.waitForSelector('.palette__group')
        await wait(500)
      }, { state: DOC })

      await shoot('07-repo-admin', 'lead', async (p) => {
        await open(p, '/r/library/manage/overview')
        await p.waitForSelector('.agrid')
        await p.waitForFunction(() => !document.body.innerText.includes('읽는 중…'))
        await p.waitForLoadState('networkidle')
      })

      await shoot('08-repo-viewer', 'dev.b', async (p) => {
        await open(p, '/r/library/')
        await repoReady(p)
        await p.waitForSelector('article.doc')
        await p.click('nav.faces button[aria-haspopup="menu"]')
        await p.waitForSelector('.repomenu')
        await wait(300)
      }, { state: { lastDoc: 'docs/2.개발/DE_331_화면설계서.md' } })

      for (const [id, url] of [['09-console-home', '/console'], ['10-console-tokens', '/console/tokens'], ['11-console-repos', '/console/repos']]) {
        await shoot(id, 'lead', async (p) => {
          await open(p, url)
          await p.waitForSelector('.admin__body')
          await p.waitForFunction(() => !document.body.innerText.includes('읽는 중…'))
          await p.waitForLoadState('networkidle')
          await wait(300)
        })
      }

      await shoot('12-site-setup', null, async (p) => {
        await p.goto(`http://127.0.0.1:${setupPort}/setup`)
        await p.waitForSelector('#su-code')
        await p.fill('#su-code', 'XXXXXXXXXXXXXXXXXXXXXXXX')
        await p.getByRole('button', { name: /다음/ }).click()
        await p.waitForSelector('#su-name')
        await p.fill('#su-code', '').catch(() => {})
        await wait(300)
      })

      await shoot('13-site-landing', null, async (p) => {
        await p.goto(base + '/')
        await p.waitForSelector('.hero')
        await p.waitForLoadState('networkidle')
      })

      await shoot('14-site-manual', null, async (p) => {
        await p.goto(base + '/manual/' + encodeURIComponent('사용자_설명서'))
        await p.waitForSelector('.man__body article.doc')
        await p.waitForFunction(() => !document.body.innerText.includes('읽는 중…'))
      })

      for (const c of Object.values(ctxs)) await c.close()
    }

    // 06 — 로컬형에서 훅 없이 들어온 기록 하나(섹션을 안 채웠다). 서버형 save 는 이것을 막으니 git 으로 직접 넣는다.
    if (!ONLY.length || ONLY.some((o) => '06-repo-check'.startsWith(o))) {
      const repo = path.join(out.repos, 'library')
      const id = '2026-0926-반납-영수증'
      await fs.writeFile(
        path.join(repo, 'work', id + '.md'),
        ['---', `id: ${id}`, 'title: 반납 영수증 출력', 'date: 2026-09-26 11:20', 'author: dev.a', 'touches:', '  - 화면설계서:LN020', 'tags: [화면]', '---', '', '반납하면 영수증을 출력한다. 화면설계서는 나중에 고친다.', ''].join(NL)
      )
      await git(repo, 'add', '-A')
      await git(repo, '-c', 'user.name=dev.a', '-c', 'user.email=dev.a@example.invalid', 'commit', '-qm', '반납 영수증 출력', '--no-verify')
      // 화면 쪽 Store 는 감시가 없고 save 만 다시 읽게 한다 — 밖에서 들어온 커밋은 새로 뜬 서버가 본다(방금 켠 서버처럼)
      const p3 = setupPort + 1
      const S3 = serve(['--root', out.repos, '--port', String(p3), '--auth', path.join(out.data, '..', 'auth.json'), '--data', out.data, '--web', path.join(ROOT, 'ops/out/web'), '--manual', path.join(ROOT, 'site/demo/manual')])
      const b3 = `http://127.0.0.1:${p3}`
      try {
      await ready(p3)
      for (const theme of ['light', 'dark']) {
        const c = await browser.newContext({ viewport: { width: W, height: H }, deviceScaleFactor: 1.5, colorScheme: theme, reducedMotion: 'reduce', locale: 'ko-KR' })
        await c.addInitScript((t) => localStorage.setItem('cdp.theme', t), theme)
        await c.request.post(b3 + '/login', { data: { token: st.tokens.lead } })
        const p = await c.newPage()
        await p.goto(b3 + '/r/library/')
        await p.waitForSelector('.app[data-top]')
        await p.waitForSelector('.topbar__center .pill--error', { timeout: 90000 })
        await p.click('.topbar__center .pill')
        await p.waitForSelector('[role=dialog][aria-label="검사 결과"]')
        await p.mouse.move(1, 1)
        await wait(500)
        const leaks = findLeaks(await textOf(p))
        if (leaks.length) throw new Error('06 — 화면에 누출 패턴: ' + leaks.map((l) => l.hit).join(', '))
        await p.screenshot({ path: path.join(DEST, `06-repo-check-${theme}.png`) })
        done.push(`06-repo-check-${theme}.png`)
        await c.close()
      }
      } finally {
        S3.kill()
      }
    }
  } finally {
    await browser.close()
    S2.kill()
  }
  // 어느 판으로 찍었나 — 판을 올려도 그림은 그대로라, 사이트가 「판 vX 의 화면」 을 package.json 이 아니라 이것으로 말한다
  if (!ONLY.length) {
    const pkg = JSON.parse(await fs.readFile(path.join(ROOT, 'package.json'), 'utf8'))
    await fs.writeFile(path.join(ROOT, 'site/src/data/shots.json'), JSON.stringify({ version: pkg.version, captured: new Date().toISOString().slice(0, 10) }, null, 2) + NL)
  }
  console.log(`[site:demo] 캡처 ${done.length}장 → site/public/shots/`)
}
