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
