// 지식 레포 — 서버의 레포 **전부**(관리자에게만 · 검토 v0.1 D6). 제품관리서비스 검토 §4.7.
//
// 등록 = 폴더를 두는 것(§4.2). 두는 길이 둘 — 패키지에서 세우기 · origin 에서 clone(D9).
// 세우면서 접근을 준다 — 전에는 세운 뒤 CLI 로 한 명씩 열어야 했다. 같은 함수(`buildRepo`)를 CLI `ctx repo new` 도 쓴다.
// **세우는 자리는 여기 하나다** — 레포 화면의 관리 › 지식 레포(`POST /repos` · writer)는 없앴다(화면 · 권한 검토 v0.1 R1).

import { useCallback, useEffect, useState } from 'react'
import { admin } from '../lib/api.js'
import { Link, navigate } from '../lib/router.jsx'
import { invalidate, put, useResource } from '../lib/cache.js'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from './Console.jsx'
import { PageHead, Note, Modal, Field, Chip, Mono, Confirm } from './ui.jsx'

// 상태 다섯 — 사실만(동시 기록 검토 v0.1 D4 · §5.7). 갈라짐은 기계가 못 푸는 것이라 bad.
const MIRROR = { ok: [null, '최신'], lag: ['warn', '밀림'], diverged: ['bad', '갈림'], behind: ['warn', 'origin 앞섬'], off: ['off', '원격 없음'] }
// 사유 — 서버의 `core/mirror.REASON_TEXT` 와 같은 말. 칩에는 짧게, 문장은 `title` 로.
const REASON = { 'non-ff': 'non-ff', auth: '인증 실패', net: '원격 불통', protected: '보호 브랜치', locked: 'ref 잠김', 'no-upstream': 'upstream 없음', unknown: '원인 미상' }

export default function Repos({ say }) {
  const withSudo = useSudo()
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  // 다시 읽는 중 — 세운 직후 표가 "레포가 없다" 인 채 노트만 뜨던 것(화면 UX 검토 v0.1 P16). 레포마다 첫 스캔을
  // 하느라 목록이 1초를 넘게 걸린다 — 그 사이를 "읽는 중" 으로 둔다.
  const [loading, setLoading] = useState(false)
  // 표 · 진단 줄은 캐시(R8) — 두 번째 방문은 즉시 그리고 뒤에서 갱신한다
  const { data, error, refresh } = useResource('/admin/repos', admin.repos)
  const { data: docData, refresh: refreshDoc } = useResource('/admin/doctor', () => admin.doctor(), { ttl: 60_000 })
  const doc = docData?.rows || null
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])
  // 복구 단추 셋 — 어느 행이 도는 중인가 · 되돌리기 확인(버리는 경로를 보여 준 뒤에)
  const [acting, setActing] = useState(null)
  const [restoring, setRestoring] = useState(null)

  // 진단의 레포 줄 — 서버는 fetch 를 안 하므로 "origin 이 앞서 있나" 는 doctor(ls-remote · 60초 캐시)만 안다.
  // 표를 먼저 그리고 뒤따라 채운다 — 레포마다 origin 에 닿는 검사라 몇 초 걸린다.
  const load = useCallback(() => {
    setLoading(true)
    refreshDoc().catch(() => {})
    // 레포 얼굴의 「레포 ▾」 · 상태바 · 관리 현황이 같은 목록을 본다 — 다음 마운트에서 다시 읽게
    invalidate('/repos')
    return refresh()
      .catch((e) => say(e.message, 6000))
      .finally(() => setLoading(false))
  }, [refresh, refreshDoc, say])
  // 레포 이름 → 진단 줄(트리 · origin · push) 중 warn · fail 인 것
  const docOf = (name) => (doc || []).filter((r) => r.state !== 'ok' && new RegExp(`^레포 ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(r.what))
  const create = async (body) => {
    setBusy(true)
    setDone(null)
    try {
      const r = await withSudo(() => admin.repoNew(body))
      setDone(r)
      say(`${r.name} 을 ${r.cloned ? '받아 왔다' : '세웠다'}`)
      setAdding(false)
      invalidate('/admin/')
      await load()
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setBusy(false)
    }
  }

  // 복구 셋 — 서버가 판정하고(`core/mirror.js` · save 와 같은 뮤텍스 · auth.log) 여기는 결과 문장을 그대로 전한다.
  const act = async (name, kind) => {
    setActing(name + ':' + kind)
    try {
      const fn = kind === 'sync' ? admin.repoSync : kind === 'push' ? admin.repoPush : admin.repoRestore
      const r = await withSudo(() => fn(name))
      if (kind === 'sync') say(r.ok ? (r.pulled ? `${name} — origin 에서 ${r.pulled}건 받았다` : `${name} — 이미 origin 과 같다`) : r.message || '맞추지 못했다', r.ok ? 4000 : 12000)
      else if (kind === 'push') say(r.ok ? `${name} — origin 에 보냈다` : `${name} — 보내지 못했다: ${r.message || r.reason || ''}`, r.ok ? 4000 : 10000)
      else say(r.ok ? `${name} — 트리를 되돌렸다 · 버린 것 ${r.discarded.length}` : r.message || '되돌리지 못했다', r.ok ? 5000 : 10000)
      invalidate('/admin/')
      await load()
      // 진단 줄은 60초 캐시라 방금 고친 것이 남아 보인다 — 한 번은 새로 (레포마다 origin 에 닿으니 뒤따라 채운다)
      admin
        .doctor(true)
        .then((d) => put('/admin/doctor', d))
        .catch(() => {})
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setActing(null)
    }
  }

  if (!data) return <span className="amuted">읽는 중…</span>
  return (
    <>
      <PageHead title="지식 레포" sub="이 서버가 든 레포 전부 — 등록은 폴더를 두는 것이고, 두는 길이 둘이다">
        <button className="btn btn--accent btn--sm" onClick={() => setAdding(true)}>
          <Icon name="plus" size={13} /> 새 레포
        </button>
      </PageHead>

      <section className="acard acard--table">
        <div className="acard__body">
          <table className="ctable">
            <thead>
              <tr>
                <th>이름</th>
                <th>head</th>
                <th>미러</th>
                <th className="ar">문서</th>
                <th className="ar">좌표</th>
                <th>볼 수 있는 사람</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.repos.length === 0 && (
                <tr>
                  <td colSpan={7} className="dim">{loading ? '읽는 중…' : '레포가 없다 — [새 레포] 로 패키지에서 세우거나 origin 에서 받아 온다'}</td>
                </tr>
              )}
              {data.repos.map((r) => {
                const [mk, ml] = MIRROR[r.mirror] || MIRROR.off
                const notes = docOf(r.name)
                // origin 이 앞선 것을 서버 상태(fetch 없음)는 모르고 진단은 안다 — 그때도 「origin 과 맞추기」 를 낸다
                const originAhead = r.mirror === 'behind' || r.mirror === 'diverged' || notes.some((n) => /origin/.test(n.what) && /앞서/.test(n.note))
                return (
                  <tr key={r.name}>
                    <td>
                      <span className="name">{r.name}</span>
                      <span className="sub">{r.title || '—'}</span>
                    </td>
                    <td className="mono">
                      {r.head || '—'} <span className="dim">{r.branch || ''}</span>
                    </td>
                    <td>
                      <Chip kind={mk} icon={mk === 'warn' || mk === 'bad' ? 'warn' : null} title={r.note || undefined}>
                        {ml}
                        {(r.mirror === 'lag' || r.mirror === 'diverged') && r.ahead ? ` ${r.ahead}` : ''}
                        {r.mirror === 'behind' && r.behind ? ` ${r.behind}` : ''}
                        {r.mirrorReason ? ` · ${REASON[r.mirrorReason] || r.mirrorReason}` : ''}
                      </Chip>
                      {r.dirty > 0 && (
                        <>
                          {' '}
                          <Chip kind="bad" icon="warn" title={(r.dirtyPaths || []).join(' · ')}>
                            트리 더러움 {r.dirty}
                          </Chip>
                        </>
                      )}
                      {notes.map((n, i) => (
                        <div key={i} className="sub" style={{ marginTop: 3, color: n.state === 'fail' ? 'var(--danger)' : 'var(--warn)' }} title={n.note}>
                          진단 · {n.what.replace(`레포 ${r.name}`, '').trim() || '레포'} — {n.note.split(' — ')[0].split('. ')[0]}
                        </div>
                      ))}
                      {(r.mirror === 'lag' || r.mirror === 'diverged' || originAhead || r.dirty > 0) && (
                        <div className="rowact" style={{ marginTop: 4 }}>
                          {originAhead && (
                            <button className="abtn" disabled={!!acting} onClick={() => act(r.name, 'sync')} title="fetch → 뒤처졌으면 ff-only → 재스캔. 갈라졌으면 거절하고 문장을 낸다">
                              {acting === r.name + ':sync' ? '맞추는 중…' : 'origin 과 맞추기'}
                            </button>
                          )}
                          {(r.mirror === 'lag' || r.mirror === 'diverged') && (
                            <button className="abtn" disabled={!!acting} onClick={() => act(r.name, 'push')} title="밀린 커밋을 origin 에 한 번 더 보낸다">
                              {acting === r.name + ':push' ? '보내는 중…' : '다시 보내기'}
                            </button>
                          )}
                          {r.dirty > 0 && (
                            <button className="abtn" disabled={!!acting} onClick={() => setRestoring(r)} title="커밋 안 된 변경을 버리고 HEAD 로 — 서버가 유일한 작성자라 누구의 것도 아니다">
                              {acting === r.name + ':restore' ? '되돌리는 중…' : '트리 되돌리기'}
                            </button>
                          )}
                        </div>
                      )}
                    </td>
                    <td className="ar num">{r.docs ?? '—'}</td>
                    <td className="ar num">{r.coords ?? '—'}</td>
                    <td>
                      {r.users.length ? (
                        r.users.map((u) => (
                          <Chip key={u} kind="off">
                            {u}
                          </Chip>
                        ))
                      ) : (
                        <span className="dim">아무도 못 본다</span>
                      )}
                    </td>
                    <td>
                      <div className="rowact">
                        <Link className="abtn" to={'/r/' + encodeURIComponent(r.name) + '/'}>
                          <Icon name="doc" size={12} /> 열기
                        </Link>
                        <button className="abtn" onClick={() => navigate('/console/users#matrix')}>접근</button>
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      {done && (
        <Note tone="accent">
          <b>{done.name}</b> — {done.cloned ? '받아 왔다' : '세웠다'} · 커밋 <Mono>{done.commit}</Mono>
          {done.files ? ` · 파일 ${done.files}` : ''}
          {done.origin ? (done.cloned ? '' : done.pushed ? ' · origin 에 보냈다' : ` · origin push 실패: ${done.pushError || ''}`) : ''}
          {done.granted?.length ? ` · 접근 ${done.granted.join(', ')}` : ''}{' '}
          <Link className="abtn" to={'/r/' + encodeURIComponent(done.name) + '/'}>열기</Link>
        </Note>
      )}
      <Note>
        커밋과 push 는 서버가 합니다 — <code>save</code> 가 끝날 때마다. <b>밀림</b>은 사유와 함께 뜹니다(인증 실패면 PAT · 셸). <b>origin 앞섬</b>은 누군가 서버 밖에서 쓴 것 — 「origin 과 맞추기」(ff-only). <b>갈림</b>은 기계가 합치지 않습니다 — 셸에서 rebase 한 뒤 「다시 보내기」. <b>트리 더러움</b>은 <code>save</code> 가 거절되는 상태 — 「트리 되돌리기」. 전부 관리자 확인 뒤에 돌고 감사에 남습니다(설명서 7.6).
      </Note>

      {restoring && (
        <Confirm
          title={`${restoring.name} — 트리를 되돌린다`}
          text={`커밋 안 된 변경 ${restoring.dirty}건을 버리고 HEAD 로 돌립니다: ${(restoring.dirtyPaths || []).join(' · ')}${restoring.dirty > (restoring.dirtyPaths || []).length ? ' …' : ''}. 서버 트리의 유일한 작성자는 서버라 이것은 누구의 편집도 아닙니다 — 사람의 것은 origin 에 올립니다.`}
          okLabel="되돌린다"
          danger
          busy={!!acting}
          onClose={() => setRestoring(null)}
          onOk={async () => {
            const n = restoring.name
            setRestoring(null)
            await act(n, 'restore')
          }}
        />
      )}
      {adding && <NewRepo data={data} busy={busy} onClose={() => setAdding(false)} onOk={create} />}
    </>
  )
}

function NewRepo({ data, busy, onClose, onOk }) {
  const pkgs = data.packages || []
  const [tab, setTab] = useState('package')
  const [f, setF] = useState({ name: '', pkg: pkgs.length === 1 ? pkgs[0].name : '', origin: '', clone: '', grant: [] })
  const okName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(f.name.trim())
  const ok = okName && (tab === 'package' ? !!f.pkg : !!f.clone.trim())
  const grantable = (data.users || []).filter((u) => !u.all)
  const pkg = pkgs.find((p) => p.name === f.pkg)
  return (
    <Modal
      title="새 지식 레포"
      onClose={onClose}
      wide
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>
            {tab === 'package' ? '첫 커밋에서 훅(ctx check)이 돈다' : 'clone 뒤 _vocab.md 가 없으면 지운다'} · auth.log · 재인증
          </span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>취소</button>
          <button
            className="abtn abtn--accent"
            disabled={busy || !ok}
            onClick={() =>
              onOk(
                tab === 'package'
                  ? { name: f.name.trim(), package: f.pkg, origin: f.origin.trim() || undefined, grant: f.grant }
                  : { name: f.name.trim(), clone: f.clone.trim(), grant: f.grant }
              )
            }
          >
            {busy ? (tab === 'package' ? '세우는 중…' : '받는 중…') : tab === 'package' ? '세우기' : '받아 오기'}
          </button>
        </>
      }
    >
      <div className="mtabs" style={{ padding: 0, marginBottom: -14 }}>
        <button aria-selected={tab === 'package'} onClick={() => setTab('package')}>패키지에서 세운다</button>
        <button aria-selected={tab === 'clone'} onClick={() => setTab('clone')}>origin 에서 받아 온다 (clone)</button>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="레포 이름" hint="폴더명 = 레포 이름 = 주소 조각. 영문 · 숫자 · . _ -">
          <input className="mono" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} spellCheck={false} autoFocus placeholder="예: gdi" />
        </Field>
        {tab === 'package' ? (
          <>
            <Field label="패키지 — 서식이지 내용이 아니다" hint="문서 골격 · 등록부 · 어휘가 들어오고 그 프로젝트의 값은 없다. 세운 뒤 첫날 할 일 다섯 줄은 그 레포의 README 에.">
              {pkgs.length === 0 ? (
                <div className="anote anote--warn">
                  서버에 패키지 폴더가 없다. <code>ctx serve --packages &lt;dir&gt;</code> 로 가리키거나 산출물의 <code>packages/</code> 를 둔다. 그 전에는 clone 으로만 둘 수 있다.
                </div>
              ) : (
                <select value={f.pkg} onChange={(e) => setF({ ...f, pkg: e.target.value })}>
                  {pkgs.length > 1 && <option value="">— 패키지를 고른다 —</option>}
                  {pkgs.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.version ? ` v${p.version}` : ''} — {p.title || ''} · 문서 {p.docs}
                    </option>
                  ))}
                </select>
              )}
              {pkg?.description && (
                <span className="field__h">
                  <b>{pkg.name}</b> — {pkg.description}
                </span>
              )}
            </Field>
            <Field label="origin (선택)" hint="있으면 첫 커밋을 바로 보낸다. 서버는 GitLab 프로젝트를 만들 수 없다 — 웹에서 빈 프로젝트를 먼저 만든다.">
              <input className="mono" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} spellCheck={false} placeholder="http://<gitlab>/<그룹>/<프로젝트>.git" />
            </Field>
          </>
        ) : (
          <Field label="origin 주소" hint="이미 있는 지식 레포를 받아 온다. 서버의 git 자격(PAT · 셸)으로 clone 한다 — _vocab.md 가 없으면 지식 레포가 아니라서 지운다.">
            <input className="mono" value={f.clone} onChange={(e) => setF({ ...f, clone: e.target.value })} spellCheck={false} placeholder="http://<gitlab>/<그룹>/<프로젝트>.git" />
          </Field>
        )}
        <Field label="볼 수 있는 사람" hint="세우면서 repos 에 넣는다 — 전체(*) 인 사람은 이미 본다.">
          <div className="checks">
            {(data.users || []).filter((u) => u.all).map((u) => (
              <label key={u.name}>
                <input type="checkbox" checked disabled /> {u.name} <span className="amuted">(전체 *)</span>
              </label>
            ))}
            {grantable.map((u) => (
              <label key={u.name}>
                <input type="checkbox" checked={f.grant.includes(u.name)} onChange={(e) => setF({ ...f, grant: e.target.checked ? [...f.grant, u.name] : f.grant.filter((x) => x !== u.name) })} /> {u.name}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  )
}
