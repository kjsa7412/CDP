// ctx-mcp — MCP 서버. 설계서 §2.
//
// **전송을 모른다.** stdio(모드 A · §3)도 Streamable HTTP(모드 B · §4)도 이
// `buildServer()` 가 만든 같은 서버를 쓴다. 전송을 갈아끼우는 것은 부르는
// 쪽이고, 그래서 도구·리소스·명함·판정이 두 모드에서 같다.
//
// **계산을 여기서 하지 않는다.** 형태는 전부 `core/tools.js` 가 만든다 --
// `ctx <명령> --json` 과 바이트까지 같아야 하기 때문이다(§10). 이 파일이 하는
// 일은 셋뿐이다: 레포를 고르고, 명함을 붙이고, 오류를 규약 모양으로 싼다.

import path from 'node:path'
import fs from 'node:fs/promises'
import { McpServer, ResourceTemplate } from '@modelcontextprotocol/server'
import * as z from 'zod'

import { loadRepo } from '../../core/repo.js'
import * as T from '../../core/tools.js'
import { CtxError, toError, guardSize } from '../../core/tools.js'

export const BUILT = '__CTX_BUILT__'

const NL = String.fromCharCode(10)

// ── 명함 (§2.2) ─────────────────────────────────────────────────────────────
//
// **설계서에서 그대로 옮긴 것이다. 요약하지 않는다.**
//
// 서버 설계의 실체는 `registerTool` 스무 줄이 아니라 이 문구다(근거 문서 §7).
// 모델이 도구를 부를지 말지를 이것만 보고 정하므로, 짧게 줄이면 그만큼
// 기억으로 답한다. 설계서 §2.2 표를 고치면 여기도 같이 고친다.

const CARD = {
  match:
    '이름·alias·자유 표현을 정본 좌표로 대조한다. 테이블·화면·API·팩터·원천·용어를 말로 가리켰으면 좌표를 짐작하지 말고 먼저 이것으로 확정한다. `미등재` 는 어휘에 없다는 뜻이다 — 다른 좌표로 바꾸지 말고 그대로 보고한다. 폐기 좌표면 후속 좌표를 준다. `repo` 를 주지 않으면 **든 레포를 전부 대조**하고 결과마다 `repo` 를 적는다 — 그 값을 이후 도구에 그대로 넘긴다. 두 레포에 다 있으면 둘 다 보고한다(고르지 않는다)',
  where:
    '좌표의 지금 상태가 어느 관리 문서 어느 섹션에 있나, 마지막으로 반영된 작업, 그 좌표를 건드린 작업들. "지금 어떻게 돼 있나"는 이것. alias 를 주면 정본으로 바꾸고 `normalized` 에 적는다. `state` 가 `derive-pending` 이면 그 섹션은 아직 최신이 아니다 — 답에 그 사실을 적는다. 등록부에 없는 타입은 관리 문서가 없는 것이 정상이고 작업 기록이 유일한 근거다',
  section:
    '관리 문서에서 그 좌표의 섹션 본문만 돌려준다. 문서 전체를 읽지 않는다. 섹션이 없으면 `body: null` 로 알린다',
  work:
    '작업 기록 본문. "왜 그렇게 정했나"는 관리 문서가 아니라 여기 있다. 한 기록에 좌표가 여럿이고 좌표마다 그 뒤 사정이 다르다 — 문서 단위로 "덮였다"고 판정하지 말고 좌표별로 `where` 를 본다',
  search:
    '말 → 좌표 후보. `match` 가 미등재를 냈을 때의 폴백. 본문은 싣지 않는다 — 후보를 고른 뒤 `section` 으로 읽는다. 유사도 검색이 아니다: 걸리지 않으면 없는 것이다',
  derive: '파생이 남은 섹션과 깨진 섹션. 이것이 비어야 커밋된다. 치우는 것은 `cdp-managed` 절차',
  apply: '파생할 섹션에 붙일 변경 줄 초안. 파일은 고치지 않는다 — 고치는 것은 `cdp-save` 안에서 사람이 승인한 뒤',
  check: '커밋 가능한가. 커밋 때 같은 검사가 돈다 — 이 도구로 미리 본다',
  sync:
    '원격과의 차이와 훅 설정 여부. 받지 않는다. 받을 것이 있으면 주입한 섹션이 최신이 아닐 수 있다고 알린다. 모드 B 의 `kit.hash` 는 서버가 가진 스킬의 해시다 — 이 작업 레포 `CLAUDE.md` 의 `cdp:kit` 값과 다르면 여기 깔린 스킬이 낡았다는 뜻이므로 답에 적는다',
  brief: '두 줄 요약 — 절차와 살아 있는 레포 상태',
  repos:
    '이 서버가 든 지식 레포 목록. 레포를 모르겠으면 먼저 이것. 레포는 **고르는 것이지 합치는 것이 아니다** — 한 답에 두 레포를 섞지 않는다',
  version: '이 번들이 언제 만들어졌나. 번들이 낡으면 옛 판정을 낸다',
  save:
    '작업 단위 하나를 기록한다: 작업 기록 1건 + 그 작업이 바꾼 좌표의 관리 문서 섹션 + 신규 어휘. 검사를 통과해야 커밋된다. 섹션은 `section` 으로 읽었을 때의 `applied` 를 그대로 보내야 하며, 그 사이 바뀌었으면 거부된다. `repo` 는 필수다 — 쓰기에서 기본값은 사고다',
}

// ── 레포 캐시 (§2.6) ────────────────────────────────────────────────────────
//
// 요청마다 스탬프를 계산해 바뀌었으면 **통째로 교체**한다. 부분 갱신은 하지
// 않는다 -- 반쯤 갱신된 레포 객체는 어떤 판정도 신뢰할 수 없다.
//
// 감시(chokidar)를 쓰지 않는 이유: stdio 서버는 세션과 함께 죽고, HTTP 서버는
// 레포가 N 개다. 감시자 N 개를 살려 두는 것보다 요청 때 파일 몇 개의 mtime 을
// 읽는 쪽이 싸고 예측 가능하다.

const SETTINGS = { settledness: { excludeTypes: ['domain'] } }

async function stamp(root) {
  const parts = []
  for (const rel of ['_vocab.md', '_managed.md', '.git/HEAD']) {
    const st = await fs.stat(path.join(root, rel)).catch(() => null)
    parts.push(st ? String(st.mtimeMs) : '-')
  }
  for (const dir of ['docs', 'work']) {
    const ents = await fs.readdir(path.join(root, dir), { withFileTypes: true }).catch(() => [])
    let n = 0
    let max = 0
    for (const e of ents) {
      if (!e.isFile() || !e.name.endsWith('.md')) continue
      n++
      const st = await fs.stat(path.join(root, dir, e.name)).catch(() => null)
      if (st && st.mtimeMs > max) max = st.mtimeMs
    }
    parts.push(n + ':' + max)
  }
  return parts.join('|')
}

export function makeRepoCache(root) {
  let cur = null
  let sig = null
  let inflight = null
  return async () => {
    const s = await stamp(root)
    if (cur && s === sig) return cur
    if (inflight) return inflight
    inflight = loadRepo(root, { settings: SETTINGS })
      .then((r) => {
        cur = r
        sig = s
        inflight = null
        return r
      })
      .catch((e) => {
        inflight = null
        throw new CtxError('E_REPO', '레포를 열 수 없다', { path: root, cause: String(e?.message || e) })
      })
    return inflight
  }
}

// ── 서버 ────────────────────────────────────────────────────────────────────
//
// repos    [{ name, root, title? }]
// fallback 기본 레포 이름 또는 null (§2.9)
// mode     'local' | 'server'
// allow    (name) => boolean   모드 B 의 토큰 권한. 없으면 전부 허용
// saver    (repoName, input) => 결과   모드 B 만. 없으면 `save` 를 등록하지 않는다
// notice   brief 에 한 줄 더 — 토큰 만료 임박 등(§4.4.2). 레포와 무관한 알림 자리

export function buildServer({ repos = [], fallback = null, mode = 'local', prompts = 'auto', allow = null, notice = null, saver = null } = {}) {
  if (!repos.length) throw new CtxError('E_REPO', '지식 레포가 하나도 없다', {})

  const caches = new Map()
  const meta = new Map()
  for (const r of repos) {
    caches.set(r.name, makeRepoCache(r.root))
    meta.set(r.name, r)
  }

  const visible = () => repos.map((r) => r.name).filter((n) => !allow || allow(n))

  // 레포 확정. **임의로 고르지 않는다** — 기본이 없는데 생략하면 E_REPO 다(§2.9).
  // 쓰기에서 기본값은 사고이므로 `save` 는 아예 필수로 받는다(모드 B).
  const pick = (want) => {
    const n = want || fallback
    if (!n) throw new CtxError('E_REPO', 'repo 를 주지 않았고 기본 레포가 없다', { repos: visible() })
    if (!caches.has(n)) throw new CtxError('E_REPO', '그런 레포가 없다', { repo: n, repos: visible() })
    if (allow && !allow(n)) throw new CtxError('E_FORBIDDEN', '그 레포에 대한 권한이 없다', { repo: n })
    return n
  }

  const server = new McpServer(
    { name: 'cdp', version: BUILT },
    { instructions: instructions({ repos, fallback, mode, allow }) }
  )

  const ok = (r) => ({ content: [{ type: 'text', text: JSON.stringify(r) }], structuredContent: r })
  const bad = (e) => ({ isError: true, content: [{ type: 'text', text: JSON.stringify({ error: toError(e) }) }] })

  // 레포 하나 안에서 도는 도구. `repo?` 를 받고 출력에 `repo` 를 붙인다.
  //
  // **배열을 돌려주는 도구는 원소마다 붙인다**(`search`). 객체처럼 스프레드하면
  // `{ repo, 0: …, 1: … }` 이 되어 배열이 통째로 망가진다 -- 실측으로 잡았다.
  // §2.9 의 "결과마다 repo 를 적는다" 가 이 모양을 말한다.
  const withRepo = (n, v) => (Array.isArray(v) ? v.map((x) => ({ repo: n, ...x })) : { repo: n, ...v })

  const tool = (name, shape, run, { big = false } = {}) =>
    server.registerTool(
      name,
      { description: CARD[name], inputSchema: { repo: z.string().max(64).optional(), ...shape } },
      async ({ repo: want, ...args }) => {
        try {
          const n = pick(want)
          const out = withRepo(n, await run(await caches.get(n)(), args))
          return ok(big ? guardSize(out, name) : out)
        } catch (e) {
          return bad(e)
        }
      }
    )

  tool('where', { coord: z.string().max(240), limit: z.number().int().min(1).max(50).optional() }, (r, a) => T.toolWhere(r, a))
  tool('section', { coord: z.string().max(240) }, (r, a) => T.toolSection(r, a), { big: true })
  tool('work', { id: z.string().max(140) }, (r, a) => T.toolWork(r, a), { big: true })
  tool('search', { words: z.array(z.string().max(100)).min(1).max(10), limit: z.number().int().min(1).max(50).optional() }, (r, a) => T.toolSearch(r, a))
  tool('derive', {}, (r) => T.toolDerive(r))
  tool('apply', { coord: z.string().max(240) }, (r, a) => T.toolApply(r, a))
  tool('check', {}, (r) => T.toolCheck(r))
  tool('brief', {}, (r) => {
    const b = T.toolBrief(r)
    return notice ? { ...b, lines: [...b.lines, notice] } : b
  })
  tool('sync', {}, async (r) => syncOf(r, mode))

  // match 만 레포를 가로지른다 (§2.9).
  //
  // **모델이 레포를 짐작할 자리를 없애는 것이 이 설계의 전부다.** 좌표를 말로
  // 받았으면 먼저 이것을 부르고, 돌아온 `repo` 를 이후 도구에 그대로 넘긴다.
  // 그래서 여기서만 여러 레포를 본다 -- 나머지 열하나는 레포 하나 안에서 돈다.
  server.registerTool(
    'match',
    {
      description: CARD.match,
      inputSchema: { repo: z.string().max(64).optional(), names: z.array(z.string().max(100)).min(1).max(20) },
    },
    async ({ repo: want, names }) => {
      try {
        const targets = want ? [pick(want)] : visible()
        if (!targets.length) throw new CtxError('E_FORBIDDEN', '볼 수 있는 레포가 없다', {})
        const rows = []
        for (const n of targets) {
          const r = await caches.get(n)()
          for (const row of T.toolMatch(r, { names })) {
            // 레포를 가로지를 때 미등재는 **다른 레포에 있을 수 있다.** 한
            // 레포에서 못 찾은 것을 미등재로 못박으면 거짓말이 된다.
            if (row.coord === null && targets.length > 1) continue
            rows.push({ repo: n, ...row })
          }
        }
        for (const nm of names) {
          if (!rows.some((x) => x.name === nm)) rows.push({ repo: null, name: nm, coord: null, kind: '미등재', vocabLine: null })
        }
        return ok(rows)
      } catch (e) {
        return bad(e)
      }
    }
  )

  server.registerTool('repos', { description: CARD.repos, inputSchema: {} }, async () => {
    try {
      const rows = []
      for (const n of visible()) {
        const r = await caches.get(n)()
        rows.push({
          name: n,
          title: meta.get(n).title ?? null,
          default: n === fallback,
          coords: r.vocab.counted.size,
          works: r.works.length,
          docs: r.managedDocs.length,
        })
      }
      return ok(rows)
    } catch (e) {
      return bad(e)
    }
  })

  server.registerTool('version', { description: CARD.version, inputSchema: {} }, async () =>
    ok({ built: BUILT, mode, repos: visible() })
  )

  // save — 모드 B 만. **`repo` 는 필수다**(§2.9). 읽기 도구처럼 기본 레포로
  // 대신하지 않는다 — 쓰기에서 기본값은 사고다.
  if (saver) {
    server.registerTool(
      'save',
      {
        description: CARD.save,
        inputSchema: {
          repo: z.string().max(64),
          work: z.object({
            id: z.string().max(140),
            title: z.string().max(400),
            date: z.string().max(40).optional(),
            touches: z.array(z.string().max(240)).max(50).optional(),
            supersedes: z.string().max(140).nullable().optional(),
            tags: z.array(z.string().max(60)).max(30).optional(),
            body: z.string(),
          })
            // **모르는 키를 거절한다.** zod 는 기본으로 조용히 버리는데,
            // 그러면 `author` 를 보낸 클라이언트가 자기 값이 무시된 것을
            // 모른 채 "기록했다" 고 답한다(§4.5). 오타도 같은 자리에서 걸린다.
            .strict(),
          sections: z
            .array(
              z.object({
                coord: z.string().max(240),
                applied: z.string().max(140).nullable().optional(),
                heading: z.string().max(200).optional(),
                body: z.string(),
              })
            )
            .max(50)
            .optional(),
          vocab: z
            .array(
              z.object({
                coord: z.string().max(240),
                label: z.string().max(200),
                aliases: z.array(z.string().max(100)).max(30).optional(),
              })
            )
            .max(50)
            .optional(),
        },
      },
      async ({ repo: want, ...input }) => {
        try {
          const n = pick(want)
          return ok({ repo: n, ...(await saver(n, input)) })
        } catch (e) {
          return bad(e)
        }
      }
    )
  }

  registerResources(server, { caches, meta, pick, visible })
  if (prompts !== 'never') registerPrompts(server, { caches, pick, fallback, prompts })

  return server
}

// ── instructions (§2.1) ─────────────────────────────────────────────────────
//
// 호스트가 시스템 프롬프트에 넣는 짧은 규칙이다. 레포 줄은 **서버가 실제
// 목록으로 채운다** — 6개 이상이면 `repos` 도구로 미룬다(§2.1).

function instructions({ repos, fallback, mode, allow }) {
  const vis = repos.filter((r) => !allow || allow(r.name))
  const lines = ['지식 레포의 도구다. 여기 있는 것이 정본이고 모델의 기억이 아니다.']
  if (vis.length <= 5) {
    lines.push('· 다루는 레포 —')
    const w = Math.max(...vis.map((r) => r.name.length), 4)
    for (const r of vis) lines.push('    ' + r.name.padEnd(w) + '  ' + (r.title || ''))
  } else {
    lines.push('· 다루는 레포는 repos 도구로 본다.')
  }
  if (fallback) lines.push(`  기본은 ${fallback}. 다른 레포면 repo 를 넘긴다. 어느 레포인지 모르면 match 가 찾아준다.`)
  else lines.push('  기본 레포가 없다. repo 를 반드시 넘긴다 — 모르면 match 가 찾아준다.')
  lines.push(
    '· 시스템의 지금 상태·결정 이유를 물으면 기억으로 답하지 않는다.',
    '· 좌표를 말로 받았으면 match 로 확정 → where 로 상태 → section 으로 그 섹션만.',
    '  이유는 where 가 준 작업 id 로 work 를 연다.',
    '· 문서 전체를 읽지 않는다. "후속 있음"을 "덮임"이라 쓰지 않는다.',
    '  파생 남음이면 그 사실을 답에 적는다.',
    mode === 'server' ? '· 기록·갱신은 cdp-save 절차로만 한다.' : '· 쓰기 도구는 없다. 기록·갱신은 스킬과 git 이 한다.'
  )
  return lines.join(NL)
}

// ── sync (§2.2) ─────────────────────────────────────────────────────────────
//
// **받지 않는다.** `--pull` 은 도구가 아니다(§2.2 각주) -- 작업 트리를 바꾸는
// 것은 사람의 승인 아래서만 한다.

// 미러 상태 — 원격이 없으면 `off`, 안 보낸 커밋이 있으면 `lag`, 같으면 `ok`.
// **push 를 여기서 하지 않는다.** `sync` 는 받지도 보내지도 않는다(§2.2).
export function mirrorOf(st) {
  if (!st?.repo || !st.upstream) return 'off'
  return st.ahead > 0 ? 'lag' : 'ok'
}

async function syncOf(r, mode) {
  const git = await import('../../core/git.js')
  const st = await git.status(r.root).catch(() => null)
  if (mode === 'server') {
    // kit 해시를 같이 낸다(§6.7.4). **서버는 클라이언트의 `.claude/skills` 를
    // 볼 수 없으므로** 비교의 한쪽을 이렇게 건네고, 다른 쪽은 스킬이
    // `CLAUDE.md` 의 `cdp:kit` 에서 읽는다.
    const { kitHash } = await import('../../core/setup.js')
    const kit = await kitHash(r.root).catch(() => null)
    return {
      mode: 'server',
      head: st?.head ?? null,
      mirror: mirrorOf(st),
      kit: kit ? { hash: kit.hash, skills: kit.skills } : null,
    }
  }
  return {
    mode: 'local',
    remote: st?.upstream ?? null,
    behind: st?.behind ?? 0,
    ahead: st?.ahead ?? 0,
    hooksPath: st?.hooksPath ?? null,
  }
}

// ── 리소스 (§2.4) ───────────────────────────────────────────────────────────
//
// 레포 이름이 URI 의 첫 조각이다 — 하나만 든 서버도 형식을 지킨다. 작업 기록은
// 정적 목록에 올리지 않는다(900건이 목록에 뜨면 목록이 쓸모를 잃는다).

function registerResources(server, { caches, meta, pick, visible }) {
  const text = (uri, body, mime = 'text/markdown') => ({ contents: [{ uri, mimeType: mime, text: body }] })

  server.registerResource(
    'section',
    new ResourceTemplate('cdp://{repo}/section/{coord}', { list: undefined }),
    { description: '좌표의 섹션 본문 (section 도구와 같다)' },
    async (uri, { repo, coord }) => {
      const n = pick(repo)
      const r = await caches.get(n)()
      const s = T.toolSection(r, { coord: decodeURIComponent(coord) })
      return text(uri.href, s.body ?? '')
    }
  )

  server.registerResource(
    'work',
    new ResourceTemplate('cdp://{repo}/work/{id}', { list: undefined }),
    { description: '작업 기록 본문 (work 도구와 같다)' },
    async (uri, { repo, id }) => {
      const n = pick(repo)
      const r = await caches.get(n)()
      return text(uri.href, T.toolWork(r, { id: decodeURIComponent(id) }).body)
    }
  )

  for (const name of visible()) {
    for (const [slug, file] of [['index', 'INDEX.md'], ['vocab', '_vocab.md'], ['managed', '_managed.md']]) {
      server.registerResource(
        `${name}-${slug}`,
        `cdp://${name}/${slug}`,
        { description: `${name} · ${file}` },
        async (uri) => {
          const r = await caches.get(name)()
          const body = await fs.readFile(path.join(r.root, file), 'utf8').catch(() => null)
          if (body == null) throw new CtxError('E_NOT_FOUND', '그 파일이 없다', { uri: uri.href })
          return text(uri.href, body)
        }
      )
    }
  }
}

// ── prompts (§2.5) ──────────────────────────────────────────────────────────
//
// 도구는 확률이고 prompt 는 확정이다 — 사람이 시작하기 때문이다(근거 문서 §7).
// 절차 문장은 **스킬 파일을 읽어서** 낸다. 따로 적으면 스킬과 어긋난다.

function registerPrompts(server, { caches, pick, fallback, prompts }) {
  const say = (t) => ({ messages: [{ role: 'user', content: { type: 'text', text: t } }] })

  server.registerPrompt(
    'load',
    { description: '좌표 하나의 정본을 규칙과 함께 한 번에 넣는다', argsSchema: { coord: z.string(), repo: z.string().optional() } },
    async ({ coord, repo }) => {
      const n = pick(repo)
      const r = await caches.get(n)()
      const rules = await readSkill(r.root, 'cdp-load')
      const parts = [rules, '', `## ${n} · ${coord}`, '', '### where', '```json', JSON.stringify(T.toolWhere(r, { coord }), null, 1), '```']
      const sec = T.toolSection(r, { coord })
      parts.push('', '### section', sec.body ?? '(섹션 없음)')
      return say(parts.join(NL))
    }
  )

  server.registerPrompt('brief', { description: '두 줄 요약' }, async () => {
    const r = await caches.get(pick(null))()
    return say(T.toolBrief(r).lines.join(NL) + NL + '절차는 스킬 · 이 대화창에서는 읽기만.')
  })
}

async function readSkill(root, name) {
  const p = path.join(root, '.claude', 'skills', name, 'SKILL.md')
  const body = await fs.readFile(p, 'utf8').catch(() => null)
  if (!body) return '(스킬 파일을 찾지 못했다 — 절차는 레포의 MANUAL 을 본다)'
  return body.replace(/^---[\s\S]*?^---\s*/m, '').trim()
}

// ── 모드 A — stdio (§3) ─────────────────────────────────────────────────────
//
// **stdout 은 규약 전용이다.** MCP 는 stdout(1) 으로만 JSON-RPC 를 주고받으므로
// 여기서 `console.log` 한 줄이 섞이면 연결이 통째로 깨진다 — 그리고 그것은
// "서버가 응답하지 않습니다" 로만 나타나서 원인을 짚기 어렵다. 로그는 전부
// stderr(2) 로 간다(§2.8).

const log = (s) => process.stderr.write('[cdp-mcp] ' + s + String.fromCharCode(10))

// 레포의 한 줄 설명. `instructions` 와 `repos` 도구가 쓴다(§2.1).
// README 의 첫 문단이다 — 따로 적는 파일을 만들지 않는다. 두 곳에 적으면
// 반드시 어긋나고, 어긋난 설명은 모델이 레포를 잘못 고르게 한다.
async function titleOf(root) {
  const body = await fs.readFile(path.join(root, 'README.md'), 'utf8').catch(() => '')
  const lines = body.split(NL)
  const h = lines.findIndex((l) => l.startsWith('# '))
  if (h < 0) return null
  for (const l of lines.slice(h + 1)) {
    const t = l.trim()
    if (t && !t.startsWith('#')) return t.replace(/[*`]/g, '').slice(0, 80)
  }
  return lines[h].slice(2).trim() || null
}

async function isRepo(dir) {
  return fs.access(path.join(dir, '_vocab.md')).then(() => true).catch(() => false)
}

// §3.1 의 해결 순서.
//
//   --repo <경로>   여러 번 줄 수 있다. 첫 번째가 기본 레포
//   --root <폴더>   하위 디렉터리를 전부 레포로 본다 (모드 B 의 <root> 와 같은 모양)
//   둘 다 없음      지금까지와 같다 — findRepo 가 하나를 찾는다
//
// 이름은 폴더명이다. **겹치면 stderr 경고 후 뒤엣것을 무시한다** — 조용히
// 덮으면 어느 레포를 보고 있는지 아무도 모른다.
export async function resolveRepos({ root = null, repos = [], repo = null, findRepo } = {}) {
  const picked = []
  const seen = new Map()
  const add = async (dir) => {
    const abs = path.resolve(dir)
    const name = path.basename(abs)
    if (seen.has(name)) {
      log(`레포 이름이 겹친다: ${name} — ${abs} 를 무시한다 (먼저 잡힌 것: ${seen.get(name)})`)
      return
    }
    if (!(await isRepo(abs))) {
      log(`지식 레포가 아니다 (_vocab.md 없음): ${abs}`)
      return
    }
    seen.set(name, abs)
    picked.push({ name, root: abs, title: await titleOf(abs) })
  }

  for (const r of repos) await add(r)
  if (root) {
    const ents = await fs.readdir(path.resolve(root), { withFileTypes: true }).catch(() => [])
    for (const e of ents.filter((x) => x.isDirectory()).sort((a, b) => a.name.localeCompare(b.name))) {
      await add(path.join(root, e.name))
    }
  }
  if (!picked.length) {
    const one = findRepo ? await findRepo(repo) : null
    if (one) await add(one)
  }
  return picked
}

export async function runStdio(opt = {}) {
  const { StdioServerTransport } = await import('@modelcontextprotocol/server/stdio')
  const repos = await resolveRepos(opt)
  if (!repos.length) {
    log('지식 레포를 찾을 수 없다. --repo 로 지정하거나 CDP_REPO 를 설정한다.')
    return 2
  }

  const prompts = opt.prompts || 'auto'
  const server = buildServer({ repos, fallback: repos[0].name, mode: 'local', prompts })

  // §2.5 — `auto` 는 Claude Code 에 prompt 를 내놓지 않는다.
  //
  // 그 자리에는 이미 스킬이 있고(근거 문서 §7), 같은 절차를 두 통로로 내면
  // 사람이 어느 쪽을 쓸지 정해야 한다. Desktop·claude.ai 에는 스킬을 깔 자리가
  // 없으므로 거기서는 내놓는다.
  //
  // clientInfo.name 을 stderr 에 한 줄 남긴다 — §10 의 "픽스처로 저장" 은 이
  // 줄을 보고 닫는다. 값을 모른 채 패턴만 박아 두면 확인할 길이 없다.
  server.server.oninitialized = () => {
    const c = server.server.getClientVersion?.() || {}
    log(`클라이언트 ${c.name || '(이름 없음)'} ${c.version || ''}`)
    if (prompts === 'auto' && /claude[-_ ]?code/i.test(String(c.name || ''))) {
      for (const p of Object.values(server._registeredPrompts || {})) p.disable?.()
      log('prompts: Claude Code 라 내놓지 않는다 (--prompts always 로 강제)')
    }
  }

  log(`시작 · 레포 ${repos.length}개 (${repos.map((r) => r.name).join(' · ')}) · 기본 ${repos[0].name} · 번들 ${BUILT}`)

  const transport = new StdioServerTransport()
  await server.connect(transport)

  // **여기서 돌아가면 안 된다.**
  //
  // `ctx-cli.mjs` 의 진입점은 `main()` 이 준 코드로 `process.exit` 를 부른다.
  // 다른 명령은 한 번 답하고 죽는 것이 맞지만 MCP 서버는 세션 동안 살아서
  // 계속 답한다 -- 연결하자마자 반환하면 프로세스가 그 자리에서 죽고, 호스트
  // 쪽에는 "서버가 응답하지 않습니다" 로만 보인다. 실측으로 잡았다.
  //
  // 끝내는 쪽은 호스트다. stdin 이 닫히면 전송이 닫히고 그때 반환한다.
  await new Promise((resolve) => {
    transport.onclose = resolve
    process.stdin.on('end', resolve)
  })
  log('연결이 닫혔다')
  return 0
}
