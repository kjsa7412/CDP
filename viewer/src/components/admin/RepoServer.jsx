// 지식 레포 — **서버판.** 검토 §3.5 · §3.7 · R6 · R7.
//
// 로컬의 같은 이름 화면(`Repo.jsx`)은 이 PC 의 경로를 고른다. 서버에는 고를
// 경로가 없다 — 대신 **어느 레포들이 있고, 새 레포를 세우는 자리**다.
// 설계서 §4.2 "등록 = 폴더를 두는 것" 은 그대로다: clone 이 한 길이고
// 패키지에서 세우는 것(`POST /repos`)이 다른 길이다.
//
// 세우는 것은 `write` 인 사람만 — origin 에 커밋이 생기는 일이다. 못 할 일을
// 띄워 놓고 누른 뒤 403 을 내지 않는다(`WorkReposServer` 와 같은 규칙).
//
// **토큰 · 명부는 여기 없다.** 그것은 서버 셸의 것이다(§4.4.1).

import { useCallback, useEffect, useState } from 'react'
import { api, gotoRepo, mode } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mono, Note, Btn } from './ui.jsx'

const MIRROR = { ok: ['ok', '미러 최신'], lag: ['warn', '미러 밀림'], off: ['none', '원격 없음'] }

export default function RepoServer({ say }) {
  const [me, setMe] = useState(null)
  const [repos, setRepos] = useState(null)
  const [pkgs, setPkgs] = useState(null)
  const [form, setForm] = useState({ name: '', pkg: '', origin: '' })
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState(null)

  const load = useCallback(() => {
    api.me().then(setMe).catch(() => setMe(null))
    api.repos().then(setRepos).catch(() => setRepos([]))
    api.packages().then(setPkgs).catch(() => setPkgs({ dir: null, packages: [] }))
  }, [])
  useEffect(() => {
    load()
  }, [load])

  // 패키지가 하나면 그것이다. **여럿이면 고르게 한다** — 첫 것을 미리 골라 두면
  // 이름만 치고 세우기를 눌러 엉뚱한 서식으로 레포가 생긴다. origin 에 커밋이 가는 일이다.
  useEffect(() => {
    if (pkgs?.packages?.length === 1 && !form.pkg) setForm((f) => ({ ...f, pkg: pkgs.packages[0].name }))
  }, [pkgs, form.pkg])

  const submit = async () => {
    const name = form.name.trim()
    if (!name || !form.pkg) return
    setBusy(true)
    setDone(null)
    try {
      const r = await api.repoNew({ name, package: form.pkg, origin: form.origin.trim() || undefined })
      setDone(r)
      say?.(`${r.name} 을 세웠습니다 · 첫 커밋 ${r.commit}`)
      setForm({ name: '', pkg: form.pkg, origin: '' })
      load()
    } catch (e) {
      say?.(e.message || '세우지 못했습니다')
    } finally {
      setBusy(false)
    }
  }

  const write = !!me?.write

  return (
    <>
      <Card title="이 서버가 든 지식 레포" hint={repos ? `${repos.length}곳 · 보고 있는 것 ${mode.repo}` : ''}>
        {!repos ? (
          <span className="amuted">읽는 중…</span>
        ) : repos.length === 0 ? (
          <Note>레포가 없습니다. 아래에서 패키지로 세우거나 서버에서 <code>git clone</code> 합니다.</Note>
        ) : (
          repos.map((r) => {
            const [mark, label] = MIRROR[r.mirror] || MIRROR.off
            return (
              <Row key={r.name} label={r.name} mark={mark} stack>
                <span className="wr-line">
                  <span className="wr-dim">{r.title || ''}</span>
                  <Mono>{r.head || '—'}</Mono>
                  <span className="wr-dim">
                    {r.branch || ''} · {label}
                  </span>
                  {r.name !== mode.repo && (
                    <Btn onClick={() => gotoRepo(r.name)}>
                      <Icon name="doc" size={13} /> 열기
                    </Btn>
                  )}
                </span>
              </Row>
            )
          })
        )}
        <Note>
          커밋과 push 는 서버가 합니다 — <code>save</code> 가 끝날 때마다. <b>미러 밀림</b>이 계속되면 origin 자격이나
          보호 브랜치를 봅니다(설치절차 10장).
        </Note>
      </Card>

      {!write ? (
        <Card title="새 지식 레포" hint="쓰기 권한이 필요합니다">
          <Note>
            레포를 세우는 것은 <code>write</code> 가 있는 사람만 할 수 있습니다 — origin 에 커밋이 생기는 일입니다.
          </Note>
        </Card>
      ) : (
        <Card title="새 지식 레포" hint="패키지를 부어 세운다 — 복사하면 그게 지식 레포다">
          {!pkgs ? (
            <span className="amuted">패키지를 읽는 중…</span>
          ) : pkgs.packages.length === 0 ? (
            <Note tone="warn">
              서버에 패키지 폴더가 없습니다. <code>ctx serve --packages &lt;dir&gt;</code> 로 가리키거나 산출물의{' '}
              <code>packages/</code> 를 둡니다. 그 전에는 서버 셸에서 <code>git clone</code> 으로만 레포를 둘 수 있습니다.
            </Note>
          ) : (
            <>
              <div className="wr-form">
                <input
                  placeholder="레포 이름 (예: gdi · 영문·숫자·._-)"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  spellCheck={false}
                />
                <select value={form.pkg} onChange={(e) => setForm({ ...form, pkg: e.target.value })}>
                  {pkgs.packages.length > 1 && <option value="">— 패키지를 고른다 —</option>}
                  {pkgs.packages.map((p) => (
                    <option key={p.name} value={p.name}>
                      {p.name}
                      {p.version ? ` v${p.version}` : ''} — {p.title || ''} · 문서 {p.docs}
                    </option>
                  ))}
                </select>
                <Btn kind="accent" onClick={submit} disabled={busy || !form.name.trim() || !form.pkg}>
                  {busy ? '세우는 중…' : '세우기'}
                </Btn>
              </div>
              <div className="wr-form" style={{ marginTop: 8 }}>
                <input
                  placeholder="origin (선택) — 이미 만들어 둔 빈 git 프로젝트 주소. 있으면 첫 커밋을 바로 보낸다"
                  value={form.origin}
                  onChange={(e) => setForm({ ...form, origin: e.target.value })}
                  spellCheck={false}
                  style={{ flex: '1 1 100%' }}
                />
              </div>
              {form.pkg && pkgs.packages.find((p) => p.name === form.pkg)?.description && (
                <Note>
                  <b>{form.pkg}</b> — {pkgs.packages.find((p) => p.name === form.pkg).description}
                </Note>
              )}
              <Note>
                패키지는 <b>서식</b>입니다 — 문서 골격 · 등록부 · 어휘가 들어오고 그 프로젝트의 값은 없습니다. 세운 뒤
                첫날 할 일(안 쓰는 문서 지우기 · 등록부 패턴 지우기 · 어휘 등록)은 그 레포의 <code>README.md</code>{' '}
                다섯 줄입니다. origin 은 서버가 <b>만들 수 없습니다</b> — GitLab 에서 빈 프로젝트를 먼저 만들고 그
                주소를 줍니다.
              </Note>
              {done && (
                <Note tone="accent">
                  <b>{done.name}</b> 세웠습니다 — 첫 커밋 <Mono>{done.commit}</Mono> · 파일 {done.files}
                  {done.origin ? (done.pushed ? ' · origin 에 보냈습니다' : ` · origin push 실패: ${done.pushError || ''}`) : ''}
                  {'  '}
                  <Btn onClick={() => gotoRepo(done.name)}>열기</Btn>
                </Note>
              )}
            </>
          )}
        </Card>
      )}
    </>
  )
}
