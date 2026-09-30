// 산출물 미리보기 — Vercel 이 내는 방식 그대로: 파일 → 그 파일, 폴더 → 폴더/index.html, 없으면 404.html(상태 404).
// 헤더는 vercel.json 의 것을 붙인다 — CSP 가 사이트를 깨지 않는지 여기서 본다. `vite preview` 는 모든 주소에
// 루트 index.html 을 내서 주소별 사본 · 404 · CSP 를 볼 수 없다.
//
//   node site/tools/serve-static.mjs [--port 5176]

import http from 'node:http'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..')
const OUT = path.join(ROOT, 'ops', 'out', 'site')
const PORT = Number(process.argv[process.argv.indexOf('--port') + 1]) || 5176
const vercel = JSON.parse(fs.readFileSync(path.join(ROOT, 'vercel.json'), 'utf8'))
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8', '.xml': 'application/xml' }

function headersFor(url) {
  const h = {}
  for (const rule of vercel.headers || []) {
    const re = new RegExp('^' + rule.source.replace(/\(\.\*\)/g, '.*') + '$')
    if (re.test(url)) for (const x of rule.headers) h[x.key] = x.value
  }
  return h
}

http
  .createServer((req, res) => {
    const url = decodeURIComponent(new URL(req.url, 'http://x').pathname)
    let file = path.join(OUT, url)
    if (!file.startsWith(OUT)) return res.writeHead(400).end()
    let status = 200
    if (fs.existsSync(file) && fs.statSync(file).isDirectory()) file = path.join(file, 'index.html')
    if (!fs.existsSync(file)) {
      file = path.join(OUT, '404.html')
      status = 404
    }
    res.writeHead(status, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream', ...headersFor(url) })
    fs.createReadStream(file).pipe(res)
  })
  .listen(PORT, '127.0.0.1', () => console.log(`[serve-static] http://127.0.0.1:${PORT}  ← ${path.relative(ROOT, OUT)}`))
