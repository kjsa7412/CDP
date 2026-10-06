// git 자격 — 서버가 origin 에 닿는 두 길. 서버 › 서버 설정 의 카드 셋. git 자격 TODO G1~G8.
//
//   SSH 배포 키   서버가 만들고 공개 키만 보인다 → 사람이 GitLab 의 Deploy keys 에 붙인다(쓰기 권한)
//   호스트 키     사람이 지문을 보고 믿는다 — 모르는 호스트에 서버는 묻지도 붙지도 않는다(StrictHostKeyChecking)
//   PAT(http)    **여기서 받지 않는다** — 서버는 평문 HTTP 라 비밀이 건너간다(D8). 셸 명령 한 줄과 저장된 호스트만 보인다
//
// 쓰는 것(키 만들기 · 호스트 믿기 · 접속 확인)은 전부 재인증 뒤 · `auth.log`.

import { useEffect, useState } from 'react'
import { admin } from '../lib/api.js'
import { invalidate, useResource } from '../lib/cache.js'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from '../shell/sudo.jsx'
import { Card, Row, Mono, Note, Btn, Cmd, Chip, Confirm, when } from './ui.jsx'

// 원격 주소 → 종류 · 호스트(서버 `core/gitauth.parseRemote` 의 줄임)
export function remoteOf(url) {
  const u = String(url || '').trim()
  let m = /^ssh:\/\/(?:[^@/]+@)?([^:/]+)(?::(\d+))?\//i.exec(u)
  if (m) return { kind: 'ssh', host: m[1], port: Number(m[2] || 22), hostKey: m[2] && m[2] !== '22' ? `[${m[1]}]:${m[2]}` : m[1] }
  m = /^[^@/\s]+@([^:/\s]+):(?!\/\/)/.exec(u)
  if (m) return { kind: 'ssh', host: m[1], port: 22, hostKey: m[1] }
  m = /^(https?):\/\/(?:[^@/]+@)?([^/]+)/i.exec(u)
  if (m) return { kind: m[1].toLowerCase(), host: m[2] }
  return { kind: u ? 'file' : null }
}

// 이 주소로 서버가 지금 닿을 수 있나 — 모자란 것 하나를 문장으로. 되면 null. 연결 창도 이것을 쓴다
export function missingFor(url, g) {
  if (!g) return null
  const r = remoteOf(url)
  if (r.kind === 'ssh') {
    if (!g.ssh?.exists) return '서버에 SSH 배포 키가 없다 — 서버 › 서버 설정 › git 자격에서 만들어 GitLab 에 붙인다'
    if (!(g.knownHosts || []).some((h) => h.host === r.hostKey)) return `호스트 ${r.hostKey} 를 아직 믿지 않았다 — 서버 › 서버 설정 › git 자격 › 「호스트 키 받기」`
  }
  if (r.kind === 'http' || r.kind === 'https') {
    if (!(g.https?.entries || []).some((e) => e.scheme === r.kind && e.host === r.host)) return `${r.kind}://${r.host} 의 PAT 가 서버에 없다 — 셸에서 ctx serve git-auth (서버 › 서버 설정 › git 자격)`
  }
  return null
}

// 퍼센트 인코딩을 사람이 읽는 모양으로 — 깨진 인코딩이면 그대로
const safeDecode = (x) => {
  try {
    return decodeURIComponent(x)
  } catch {
    return x
  }
}

export default function GitAuth({ say, prefix = '/opt/cdp' }) {
  const withSudo = useSudo()
  const { data: g, refresh } = useResource('/admin/gitauth', admin.gitauth)
  const [url, setUrl] = useState('')
  const [busy, setBusy] = useState(null)
  const [scan, setScan] = useState(null)
  const [test, setTest] = useState(null)
  const [rotating, setRotating] = useState(false)
  // 연결 창의 「git 자격」 은 `#gitauth` 로 온다 — 이 카드는 페이지보다 늦게 서므로 선 뒤에 스스로 자리로
  useEffect(() => {
    if (g && location.hash === '#gitauth') document.getElementById('gitauth')?.scrollIntoView({ block: 'start' })
  }, [!!g])

  const act = async (kind, fn) => {
    setBusy(kind)
    try {
      return await withSudo(fn)
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 10000)
      return null
    } finally {
      setBusy(null)
    }
  }
  const after = async () => {
    invalidate('/admin/')
    await refresh().catch(() => {})
  }
  const makeKey = async (rotate) => {
    setRotating(false)
    const k = await act('key', () => admin.gitKey(rotate))
    if (!k) return
    say(`배포 키를 ${rotate ? '새로 ' : ''}만들었다 — ${k.fingerprint}${k.applied?.length ? ` · ssh 원격 레포 ${k.applied.length}곳에 걸었다` : ''}. 공개 키를 GitLab 에 붙인다`, 9000)
    await after()
  }
  const doScan = async () => {
    setScan(null)
    const r = await act('scan', () => admin.gitScan(url.trim()))
    if (r) setScan(r)
  }
  const trust = async (fp) => {
    const r = await act('trust:' + fp, () => admin.gitTrust(url.trim(), fp))
    if (!r) return
    say(`${r.hostKey} 를 믿는다 — ${r.type} ${r.fingerprint}`, 6000)
    setScan(null)
    await after()
  }
  const doTest = async () => {
    setTest(null)
    const r = await act('test', () => admin.gitTest(url.trim()))
    if (r) setTest(r)
  }

  if (!g) return <Card id="gitauth" title="git 자격"><span className="amuted">읽는 중…</span></Card>
  const r = remoteOf(url)
  const sshRepos = (g.repos || []).filter((x) => x.ssh)
  const miss = url.trim() ? missingFor(url, g) : null
  const httpHost = r.kind === 'http' || r.kind === 'https' ? r.host : '<호스트:포트>'
  const cli = `sudo -u cdp -H node ${prefix}/bin/ctx.mjs serve git-auth --host ${httpHost}${r.kind === 'https' ? ' --scheme https' : ''} --user <GitLab 계정>${url.trim() && (r.kind === 'http' || r.kind === 'https') ? ' --test ' + url.trim() : ''}`

  return (
    <div id="gitauth">
      <div className="agrid">
        <Card title="SSH 배포 키" hint="개인 키는 서버 밖으로 안 나간다 — 여기 보이는 것은 공개 키">
          {!g.ssh?.exists ? (
            <>
              <Row label="지금">
                <span className="amuted">없다 — ssh 주소(ssh://git@…)로 잇으려면 만든다</span>
              </Row>
              <Row label="">
                <Btn kind="accent" onClick={() => makeKey(false)} disabled={!!busy}>
                  <Icon name="plus" size={13} /> {busy === 'key' ? '만드는 중…' : '배포 키 만들기'}
                </Btn>
              </Row>
            </>
          ) : (
            <>
              <Row label="지문">
                <Mono>{g.ssh.fingerprint}</Mono>
                <span className="amuted"> · {g.ssh.type} · {when(g.ssh.createdAt)}</span>
              </Row>
              <Row label="공개 키 — 눌러 복사" stack>
                <Cmd>{g.ssh.publicKey}</Cmd>
              </Row>
              <Row label="ssh 원격 레포">
                {sshRepos.length ? (
                  sshRepos.map((x) => (
                    <Chip key={x.name} kind={x.applied ? 'off' : 'warn'} title={x.remote}>
                      {x.name}
                      {x.applied ? '' : ' · 키 안 걸림'}
                    </Chip>
                  ))
                ) : (
                  <span className="amuted">아직 없다</span>
                )}
              </Row>
              <Note>
                GitLab › 프로젝트 › <b>Settings › Repository › Deploy keys</b> 에 공개 키를 붙이고 <b>「Grant write permissions to this key」</b> 를 켠다. 프로젝트가 여럿이면
                같은 키를 프로젝트마다 켠다(다른 프로젝트의 「Privately accessible deploy keys」 에서 고른다).{' '}
                <button className="abtn" onClick={() => setRotating(true)} disabled={!!busy}>새로 만들기</button>
              </Note>
            </>
          )}
        </Card>

        <Card title="PAT — http 주소" hint="브라우저로는 받지 않는다 · 서버는 평문 HTTP 다">
          <Row label="저장된 곳">
            {g.https?.entries?.length ? (
              g.https.entries.map((e, i) => (
                <Chip key={i} kind="off">
                  {/* git-credential 저장소는 host 의 「:」 를 %3a 로 적는다 — 그대로 보이면 주소가 아니다(실서버 종합 시험 F19) */}
                  {e.scheme}://{e.user}@{safeDecode(e.host)}
                </Chip>
              ))
            ) : (
              <span className="amuted">없다</span>
            )}
          </Row>
          <Row label="credential.helper">
            <Mono>{g.https?.helper || '(없음)'}</Mono>
          </Row>
          <Row label="넣는 명령 — 서버 셸에서" stack>
            <Cmd>{cli}</Cmd>
          </Row>
          <Note>
            PAT 를 숨김 입력으로 받아 <code>.git-credentials</code>(600)에 쓰고 helper 를 건다 · 같은 호스트의 옛 줄은 바꾼다 · <code>--test</code> 면 바로 접속을 본다.
            PAT 는 GitLab › Preferences › Access tokens — scope <code>write_repository</code> · 만료 1년(설명서 3.3).
          </Note>
        </Card>
      </div>

      <Card title="접속 확인 · 호스트 키" hint="아무것도 보내지 않는다 — ls-remote">
        <div className="rowact" style={{ gap: 8, flexWrap: 'wrap' }}>
          <input
            className="mono"
            style={{ flex: '1 1 360px', minWidth: 0, height: 30 }}
            value={url}
            onChange={(e) => {
              setUrl(e.target.value)
              setScan(null)
              setTest(null)
            }}
            spellCheck={false}
            placeholder="origin 주소 — ssh://git@<gitlab>:<포트>/<그룹>/<프로젝트>.git 또는 http://…"
            aria-label="origin 주소"
          />
          {r.kind === 'ssh' && (
            <Btn onClick={doScan} disabled={!!busy}>
              {busy === 'scan' ? '받는 중…' : '호스트 키 받기'}
            </Btn>
          )}
          <Btn kind="accent" onClick={doTest} disabled={!!busy || !r.kind}>
            {busy === 'test' ? '확인 중…' : '접속 확인'}
          </Btn>
        </div>
        {miss && <div className="anote anote--warn" style={{ fontSize: 12, marginTop: 10 }}>{miss}</div>}
        {scan && (
          <div style={{ marginTop: 10 }}>
            <div className="amuted" style={{ fontSize: 12, marginBottom: 6 }}>
              {scan.hostKey} 가 낸 키 — <b>GitLab 관리자에게 받은 지문과 같은지</b> 보고 믿는다. 모르면 믿지 않는다.
            </div>
            {scan.keys.map((k) => (
              <Row key={k.fingerprint} label={k.type}>
                <Mono>{k.fingerprint}</Mono>{' '}
                <button className="abtn" disabled={!!busy} onClick={() => trust(k.fingerprint)}>
                  {busy === 'trust:' + k.fingerprint ? '…' : '이 지문을 믿는다'}
                </button>
              </Row>
            ))}
          </div>
        )}
        {test && (
          <div className={test.ok ? 'anote' : 'anote anote--warn'} style={{ fontSize: 12, marginTop: 10 }}>
            {test.ok ? (
              <>
                <Icon name="check" size={12} /> 닿는다 — {test.url} {test.empty ? '· 빈 프로젝트(첫 push 를 받을 수 있다)' : `· HEAD ${test.head} — 이미 커밋이 있다(연결하면 non-ff 로 거절된다)`}
              </>
            ) : (
              <>
                닿지 않는다 — {test.reasonText || test.reason}
                {test.message ? ` · ${test.message}` : ''}
              </>
            )}
          </div>
        )}
        <Row label="믿는 호스트">
          {g.knownHosts?.length ? (
            g.knownHosts.map((h, i) => (
              <Chip key={i} kind="off" title={h.fingerprint}>
                {h.host} · {h.type}
              </Chip>
            ))
          ) : (
            <span className="amuted">없다</span>
          )}
        </Row>
      </Card>

      {rotating && (
        <Confirm
          title="배포 키를 새로 만든다"
          text="옛 키는 서버에 .old-<시각> 으로 남고, GitLab 에 붙인 옛 공개 키로는 더 이상 밀지 않는다. 새 공개 키를 GitLab 에 다시 붙이고 옛 것은 떼어 낸다."
          okLabel="새로 만든다"
          danger
          busy={busy === 'key'}
          onClose={() => setRotating(false)}
          onOk={() => makeKey(true)}
        />
      )}
    </div>
  )
}
