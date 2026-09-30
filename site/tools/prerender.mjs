// 사전 생성 — 주소마다 index.html 사본 · 404.html · robots.txt · sitemap.xml(공식 사이트 제작 검토 v0.1 S3 · S11).
//
// 정적 호스트에 재작성 규칙 없이 `/screens` 를 새로 열어도 돈다(Vercel 은 `screens/index.html` 을 낸다). 사본마다
// <title> · description · og 가 박혀 JS 없이도 제목이 보인다. 본문은 사전 렌더하지 않는다 — noscript 한 줄이다.
//
// 절대 주소는 `CDP_SITE_URL` → 없으면 Vercel 의 `VERCEL_PROJECT_PRODUCTION_URL`. 둘 다 없으면 sitemap · og:image 를 뺀다
// (상대 주소 sitemap 은 무효다).

import fs from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { ROUTES, NOT_FOUND } from '../src/routes.js'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'ops', 'out', 'site')
const BASE = (process.env.CDP_SITE_BASE || '/').replace(/\/?$/, '/')
const host = process.env.CDP_SITE_URL || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? 'https://' + process.env.VERCEL_PROJECT_PRODUCTION_URL : '')
const SITE = host ? host.replace(/\/$/, '') + BASE.replace(/\/$/, '') : ''

const escHtml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const tpl = await fs.readFile(path.join(OUT, 'index.html'), 'utf8')
for (const mark of ['<!--cdp:meta-->', '<!--cdp:body-->', '<title>', 'name="description"']) {
  if (!tpl.includes(mark)) throw new Error(`index.html 에 ${mark} 가 없다 — site/index.html 을 확인한다`)
}

function page({ path: p, title, description }, { noindex = false } = {}) {
  const url = SITE ? SITE + (p === '/' ? '/' : p) : ''
  const meta = [
    `<meta property="og:type" content="website" />`,
    `<meta property="og:site_name" content="CDP" />`,
    `<meta property="og:title" content="${escHtml(title)}" />`,
    `<meta property="og:description" content="${escHtml(description)}" />`,
    `<meta property="og:locale" content="ko_KR" />`,
    ...(url ? [`<link rel="canonical" href="${url}" />`, `<meta property="og:url" content="${url}" />`] : []),
    ...(SITE ? [`<meta property="og:image" content="${SITE}/shots/01-repo-doc-light.png" />`] : []),
    ...(noindex ? [`<meta name="robots" content="noindex" />`] : []),
  ].join('\n    ')
  return tpl
    .replace(/<title>[^<]*<\/title>/, `<title>${escHtml(title)}</title>`)
    .replace(/<meta name="description" content="[^"]*" \/>/, `<meta name="description" content="${escHtml(description)}" />`)
    .replace('<!--cdp:meta-->', meta)
    .replace('<!--cdp:body-->', `<noscript><p style="padding:24px;font:15px/1.7 sans-serif">${escHtml(title)} — ${escHtml(description)} 이 사이트는 JavaScript 로 그린다.</p></noscript>`)
}

const written = []
for (const r of ROUTES) {
  const file = r.path === '/' ? path.join(OUT, 'index.html') : path.join(OUT, r.path.slice(1), 'index.html')
  await fs.mkdir(path.dirname(file), { recursive: true })
  await fs.writeFile(file, page(r))
  written.push(path.relative(OUT, file).split(path.sep).join('/'))
}
await fs.writeFile(path.join(OUT, '404.html'), page({ path: '/404', ...NOT_FOUND }, { noindex: true }))
written.push('404.html')

await fs.writeFile(path.join(OUT, 'robots.txt'), ['User-agent: *', 'Allow: /', ...(SITE ? [`Sitemap: ${SITE}/sitemap.xml`] : []), ''].join('\n'))
written.push('robots.txt')
if (SITE) {
  const urls = ROUTES.map((r) => `  <url><loc>${SITE}${r.path === '/' ? '/' : r.path}</loc></url>`).join('\n')
  await fs.writeFile(path.join(OUT, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>\n`)
  written.push('sitemap.xml')
}
console.log(`[prerender] ${written.length} 파일${SITE ? ' · ' + SITE : ' · 절대 주소 없음(sitemap 생략)'}`)
