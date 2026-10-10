// ctx rebuild — 리빌딩(리빌딩 검토 v0.1 §5.2). 지금은 정본 스냅샷 하나다.
//
//   ctx rebuild snapshot --server <주소> --repo <레포> [--doc <문서>] [--all] [--dry]
//
// 기본은 본문이 기록을 인용하지 않는 근거 없는 섹션만 — 인용하는 섹션은 그 기록의 좌표정정이 낫다(cdp-rebuild). --all 이면 같이
//
// 근거 없는 섹션(그 좌표를 건드린 기록 · 스냅샷 · 기준선이 없는 섹션)을 서버가 원문 그대로 기록 하나씩으로 뜬다 — 기록만 옮겨
// 다시 세워도(`repo new --records-from`) 잃지 않게. 좌표는 서버가 진단에서 고른다(200 개씩 · 남으면 다시 부른다).
// 쓰는 길은 서버 save 하나다 — 이 명령은 `POST /api/<레포>/snapshot` 을 부를 뿐이다(`baseline push` 와 같은 모양). 토큰: CDP_TOKEN(큐레이터)

const NL = '\n'

export async function runRebuild(opt, io = {}) {
  const out = io.out || ((s = '') => process.stdout.write(s + NL))
  const err = io.err || ((s = '') => process.stderr.write(s + NL))
  const sub = opt.args[0]
  if (sub !== 'snapshot') {
    err('ctx rebuild snapshot --server <주소> --repo <레포> [--doc <문서>] [--all] [--dry]')
    return 2
  }
  if (!opt.server || !opt.repo) {
    err('ctx rebuild snapshot: --server <주소> --repo <레포> 가 필요하다   (토큰: 환경변수 CDP_TOKEN · 큐레이터)')
    return 2
  }
  const token = process.env.CDP_TOKEN
  if (!token) {
    err('ctx rebuild snapshot: 환경변수 CDP_TOKEN 이 없다 — 큐레이터 토큰을 넣는다')
    return 2
  }
  const url = String(opt.server).replace(/\/+$/, '') + '/api/' + encodeURIComponent(opt.repo) + '/snapshot'
  const body = { ...(opt.doc ? { doc: opt.doc } : {}), ...(opt.all ? { all: true } : {}), ...(opt.dry ? { dryRun: true } : {}) }
  const res = await fetch(url, { method: 'POST', headers: { authorization: 'Bearer ' + token, 'content-type': 'application/json' }, body: JSON.stringify(body) }).catch((e) => ({ ok: false, status: 0, json: async () => ({ error: { message: e.message } }) }))
  const j = await res.json().catch(() => null)
  if (!res.ok) {
    err(`ctx rebuild snapshot: ${res.status} ${j?.error?.code || ''} ${j?.error?.message || ''}`)
    return 1
  }
  const n = j.snapshots?.length ?? 0
  out(`ctx rebuild snapshot: ${j.dryRun ? '(미리보기) ' : '커밋 ' + j.commit + ' · '}스냅샷 ${n} · 건너뜀 ${j.snapshotSkipped?.length ?? 0}${j.left ? ` · 남은 ${j.left} — 다시 부른다` : ''}`)
  for (const s of (j.snapshots || []).slice(0, 20)) out(`   ${s.coord}  ${s.date}  ${s.id}`)
  if (n > 20) out(`   … ${n - 20}개 더`)
  for (const w of j.warnings || []) out('   경고: ' + w)
  return 0
}
