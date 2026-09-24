// 지식 레포 — 서버의 레포 **전부**(관리자에게만 · 검토 v0.1 D6). 제품관리서비스 검토 §4.7.
//
// 등록 = 폴더를 두는 것(§4.2). 두는 길이 둘 — 패키지에서 세우기 · origin 에서 clone(D9).
// 세우면서 접근을 준다 — 전에는 세운 뒤 CLI 로 한 명씩 열어야 했다. 같은 함수(`buildRepo`)를
// 레포 화면의 `POST /repos` 도 쓴다.

import { useCallback, useEffect, useState } from 'react'
import { admin } from '../lib/api.js'
import { navigate } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from './Console.jsx'
import { PageHead, Note, Modal, Field, Chip, Mono } from './ui.jsx'

const MIRROR = { ok: [null, '최신'], lag: ['warn', '밀림'], off: ['off', '원격 없음'] }

export default function Repos({ say }) {
  const withSudo = useSudo()
  const [data, setData] = useState(null)
  const [adding, setAdding] = useState(false)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)
  // 다시 읽는 중 — 세운 직후 표가 "레포가 없다" 인 채 노트만 뜨던 것(화면 UX 검토 v0.1 P16). 레포마다 첫 스캔을
  // 하느라 목록이 1초를 넘게 걸린다 — 그 사이를 "읽는 중" 으로 둔다.
  const [loading, setLoading] = useState(false)

  const load = useCallback(() => {
    setLoading(true)
    return admin
      .repos()
      .then(setData)
      .catch((e) => say(e.message, 6000))
      .finally(() => setLoading(false))
  }, [say])
  useEffect(() => {
    load()
  }, [load])

  const create = async (body) => {
    setBusy(true)
    setDone(null)
    try {
      const r = await withSudo(() => admin.repoNew(body))
      setDone(r)
      say(`${r.name} 을 ${r.cloned ? '받아 왔다' : '세웠다'}`)
      setAdding(false)
      await load()
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setBusy(false)
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
                      <Chip kind={mk} icon={mk === 'warn' ? 'warn' : null}>
                        {ml}
                        {r.mirror === 'lag' && r.ahead ? ` ${r.ahead}` : ''}
                      </Chip>
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
                        <a className="abtn" href={'/r/' + encodeURIComponent(r.name) + '/'}>
                          <Icon name="doc" size={12} /> 열기
                        </a>
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
          <a className="abtn" href={'/r/' + encodeURIComponent(done.name) + '/'}>열기</a>
        </Note>
      )}
      <Note>
        커밋과 push 는 서버가 합니다 — <code>save</code> 가 끝날 때마다. <b>밀림</b>이 계속되면 서버 &gt; 진단의 <code>레포 … push</code> 줄과 origin 자격(PAT · 셸)을 봅니다. 등록부 · 어휘를 서버 밖에서 고쳤으면 설명서 7.6.
      </Note>

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
