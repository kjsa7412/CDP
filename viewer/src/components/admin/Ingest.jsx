// 작업실 › 지식 생성 — 문서 · 폴더 · 레포에서 작업 기록을 들인다. 지식 생성 · 작업실 검토 v0.1 §6.3 · §6.4.
//
// **서버는 LLM 을 부르지 않는다**(I11) — 여기서 「실행」 하지 않는다. 화면은 셋만 한다 —
//   새 들이기   유형 · 경로 · 거름 · 판단(claude -p) 여부를 고르면 잡을 만들고 그 사람 PC 에서 돌릴 명령을 셸에 맞게 낸다
//   목록        내 잡(큐레이터는 모두) — 보고된 것만 그린다(대기 · 실행 중 · 승인 대기 · 저장됨 · 일부 실패 · 멈춤)
//   잡 하나     파일마다 결과 · 판단(성격 · 좌표 후보) · 들어간 기록과 그 큐레이션 상태 · 다시 돌릴 명령
// 진행률(%)은 짐작하지 않는다(불변조건 7) — 보고된 파일 수만. 멈춤은 15분 넘게 보고가 없는 것(서버가 센다).
// **승인은 여기, 적용은 CLI**(G17) — 판단한 파일마다 좌표 후보 · 어휘 제안을 체크해 저장하면 다음 `--apply` 가 그것으로 들인다.
// 서버가 대신 들이지 않는 것은 원문이 그 사람 PC 에만 있어서다. 기본 체크는 review.md 와 같다 — 등재 + 인용.

import { useMemo, useState } from 'react'
import { api, currentRepo } from '../../lib/api.js'
import { invalidate, useResource } from '../../lib/cache.js'
import { guessShell } from '../../lib/install.js'
import { can } from '../../lib/roles.js'
import { Link, navigate } from '../../lib/router.jsx'
import { repoBase } from '../../shell/nav.js'
import { Card, Row, Mono, Note, Btn, Cmd, ShellTabs, Mark, when } from './ui.jsx'

const KIND = { file: '파일', folder: '폴더', git: 'git 레포' }
const STATE = {
  waiting: ['대기', '명령을 아직 돌리지 않았다', 'none'],
  running: ['실행 중', '보고가 오고 있다', 'info'],
  review: ['승인 대기', '판단이 끝났다 — review.md 를 고치고 --apply', 'warn'],
  saved: ['저장됨', '들인 기록이 대기열에 섰다', 'ok'],
  partial: ['일부 실패', '실패한 것만 고쳐 같은 명령을 다시', 'warn'],
  failed: ['실패', '', 'bad'],
  cancelled: ['취소', '', 'none'],
  stopped: ['멈춤', '15분 넘게 보고가 없다 — 같은 명령을 다시 돌리면 이어진다', 'warn'],
}
const FILE = {
  planned: '들일 것',
  drafted: '판단함',
  saved: '들임',
  exists: '이미 있음',
  have: '이미 들임',
  skipped: '건너뜀',
  asset: '첨부로',
  failed: '실패',
}
const CUR = { queued: '대기', reflected: '반영', kept: '기록으로 둠' }

// 셸마다 인용 — 경로에 공백 · 한글이 흔하다
const quote = (shell, s) => (shell === 'sh' ? `'${String(s).replace(/'/g, `'\\''`)}'` : `"${String(s).replace(/"/g, '\\"')}"`)

export function ingestCommands(shell, { origin, repo, job = null, paths = [], globs = [], excludes = [], llm = false }) {
  const base = ['ctx ingest', ...paths.map((p) => quote(shell, p)), '--repo', repo, ...globs.flatMap((g) => ['--glob', quote(shell, g)]), ...excludes.flatMap((g) => ['--exclude', quote(shell, g)]), ...(job ? ['--job', job] : [])].join(' ')
  return [
    { what: '처음 한 번 — 이 PC 의 CLI 를 이 서버에 붙인다(토큰은 숨김 입력)', cmd: `ctx login --server ${origin}` },
    { what: '계획 — 무엇이 어떤 기록이 되나(쓰지 않는다)', cmd: base },
    ...(llm ? [{ what: '판단 — 이 PC 의 claude 가 좌표 후보를 낸다(쓰지 않는다 · claude 로그인은 그 사람이)', cmd: base + ' --analyze' }] : []),
    { what: llm ? '들인다 — review.md 에서 체크한 좌표만' : '들인다 — 좌표 없이(큐레이터가 정한다)', cmd: base + ' --apply' + (llm ? '' : ' --no-llm') },
  ]
}

export default function Ingest({ me, say, sub = 'list', jobId = null }) {
  const repo = currentRepo()
  if (sub === 'new') return <NewIngest me={me} say={say} repo={repo} />
  if (sub === 'job' && jobId) return <JobView me={me} say={say} repo={repo} id={jobId} />
  return <JobList me={me} repo={repo} />
}

function JobList({ me, repo }) {
  const curator = can(me, 'curate', repo)
  const [all, setAll] = useState(false)
  const key = `api:${repo}/jobs${all ? '' : '?mine=1'}`
  const { data, error } = useResource(key, () => api.jobs(!all), { ttl: 15_000 })
  const base = repoBase(repo)
  return (
    <Card
      title="지식 생성"
      hint="문서 · 폴더 · 레포를 작업 기록으로"
      actions={
        <Link className="abtn abtn--accent" to={base + 'manage/ingest/new'}>
          + 새 들이기
        </Link>
      }
    >
      {curator && (
        <div className="adocs__seg" role="tablist" aria-label="누구의 것" style={{ marginBottom: 10 }}>
          <button role="tab" aria-selected={!all} className="adocs__segbtn" onClick={() => setAll(false)}>
            내 것
          </button>
          <button role="tab" aria-selected={all} className="adocs__segbtn" onClick={() => setAll(true)}>
            모두
          </button>
        </div>
      )}
      {error && <Note tone="warn">목록을 읽지 못했다 — {error.message}</Note>}
      {!data && !error && null}
      {data && !data.jobs.length && <Note>아직 들인 것이 없다 — 「새 들이기」 에서 명령을 받아 이 PC 의 터미널에서 돌린다.</Note>}
      {data?.jobs?.length > 0 && (
        <div className="adocs__scroll">
          <table className="atable" data-ui="ingest-jobs">
            <thead>
              <tr>
                <th>만든 날</th>
                <th>유형</th>
                <th>대상</th>
                {all && <th>누가</th>}
                <th>상태</th>
                <th className="ar">파일</th>
                <th className="ar">들임</th>
                <th className="ar">실패</th>
                <th>마지막 보고</th>
              </tr>
            </thead>
            <tbody>
              {data.jobs.map((j) => {
                const [label, hint, mark] = STATE[j.state] || [j.state, '', 'none']
                return (
                  <tr key={j.id} onClick={() => navigate(base + 'manage/ingest/' + j.id)} style={{ cursor: 'pointer' }}>
                    <td className="amono">{j.created.slice(5, 10)}</td>
                    <td>{KIND[j.kind] || j.kind}</td>
                    <td>
                      <Link to={base + 'manage/ingest/' + j.id} onClick={(e) => e.stopPropagation()}>
                        <span className="adocs__path">{j.path}</span>
                      </Link>
                    </td>
                    {all && <td>{j.by}</td>}
                    <td title={hint}>
                      <Mark kind={mark} /> {label}
                    </td>
                    <td className="ar amono">{j.counts.files || ''}</td>
                    <td className="ar amono">{j.counts.saved || ''}</td>
                    <td className="ar amono">{j.counts.failed || ''}</td>
                    <td className="amono">{j.state === 'waiting' ? '—' : when(j.updated)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

function NewIngest({ say, repo }) {
  const [kind, setKind] = useState('folder')
  const [paths, setPaths] = useState('')
  const [globs, setGlobs] = useState('')
  const [excludes, setExcludes] = useState('')
  const [llm, setLlm] = useState(true)
  const [shell, setShell] = useState(guessShell)
  const [job, setJob] = useState(null)
  const [busy, setBusy] = useState(false)
  const [refused, setRefused] = useState(null)
  const list = (s) => String(s).split(/\r?\n/).map((x) => x.trim()).filter(Boolean)
  const ps = list(paths)

  const make = async (e) => {
    e?.preventDefault()
    if (!ps.length) return
    setBusy(true)
    setRefused(null)
    try {
      const r = await api.jobNew({ kind, path: ps.join(' · '), options: { llm } })
      if (r?.error) {
        setRefused(r.error.message)
        return
      }
      setJob(r)
      invalidate(`api:${repo}/jobs`)
      say?.('잡을 만들었다 — 아래 명령을 그 PC 의 터미널에서 차례로')
    } catch (e2) {
      setRefused(e2.message)
    } finally {
      setBusy(false)
    }
  }
  const cmds = job ? ingestCommands(shell, { origin: window.location.origin, repo, job: job.id, paths: ps, globs: list(globs), excludes: list(excludes), llm }) : []

  return (
    <>
      <Card title="새 들이기" hint="명령은 그 사람 PC 에서 돌린다">
        <form onSubmit={make} className="aform">
          <Row label="무엇을">
            <div className="adocs__seg" role="radiogroup" aria-label="유형">
              {Object.entries(KIND).map(([k, label]) => (
                <button type="button" key={k} role="radio" aria-checked={kind === k} className="adocs__segbtn" aria-selected={kind === k} onClick={() => setKind(k)}>
                  {label}
                </button>
              ))}
            </div>
          </Row>
          <Row label="경로" stack>
            <textarea
              className="aform__input"
              rows={kind === 'file' ? 3 : 2}
              value={paths}
              onChange={(e) => setPaths(e.target.value)}
              placeholder={kind === 'file' ? 'D:\\설계\\회의록_1017.docx  (줄마다 하나)' : kind === 'git' ? 'D:\\repos\\spec-docs  (git 작업 트리 — 커밋 · 날짜 · 작성자를 이력에서)' : 'D:\\설계\\회의록'}
              aria-label="경로"
            />
            <span className="amuted">그 사람 PC 의 경로다 — 서버는 확인할 수 없어 그대로 보인다</span>
          </Row>
          {kind !== 'file' && (
            <>
              <Row label="고르기">
                <input className="aform__input" value={globs} onChange={(e) => setGlobs(e.target.value)} placeholder="**/*.md  (비우면 전부 · 줄마다 하나)" aria-label="고르기 glob" />
              </Row>
              <Row label="빼기">
                <input className="aform__input" value={excludes} onChange={(e) => setExcludes(e.target.value)} placeholder="초안/**" aria-label="빼기 glob" />
              </Row>
            </>
          )}
          <Row label="판단">
            <label>
              <input type="checkbox" checked={llm} onChange={(e) => setLlm(e.target.checked)} /> 이 PC 의 claude 가 좌표 후보를 낸다(사람이 review.md 에서 고른다)
            </label>
          </Row>
          <Row label="">
            <Btn kind="accent" onClick={make} disabled={busy || !ps.length}>
              명령 만들기
            </Btn>
          </Row>
          {refused && <Note tone="warn">{refused}</Note>}
        </form>
        <Note>
          받는 것 — md · txt · docx · xlsx · pptx · hwpx(늘) · pdf · doc · hwp(그 PC 에 pdftotext · LibreOffice 가 있을 때). 결과는 작업 기록이고 대기열에 선다 — 관리 문서 반영은 큐레이터가 한다.
          git 서버의 문서 레포를 관리 문서째 옮겨 세우려면 큐레이터의 세우기(출처)다.
        </Note>
      </Card>
      {job && <Commands cmds={cmds} shell={shell} setShell={setShell} job={job} repo={repo} />}
    </>
  )
}

function Commands({ cmds, shell, setShell, job, repo }) {
  return (
    <Card title="이 PC 에서 돌린다" hint={`잡 ${job.id} — 돌리면 진행이 여기 보인다`} actions={<Link to={repoBase(repo) + 'manage/ingest/' + job.id}>잡 보기 →</Link>}>
      <ShellTabs shell={shell} setShell={setShell} />
      <ol className="start">
        {cmds.map((c) => (
          <li key={c.cmd} className="start__row">
            <div className="start__line">
              <span className="start__fact">{c.what}</span>
            </div>
            <div className="howto start__cmd">
              <Cmd>{c.cmd}</Cmd>
            </div>
          </li>
        ))}
      </ol>
      <Note>ctx 가 없으면 서버 산출물의 bin/ctx.mjs 로 한 번 — node bin/ctx.mjs self-update &lt;tar&gt;. 판단은 claude(Claude Code)가 깔리고 로그인돼 있어야 한다 — ctx ingest doctor 가 본다.</Note>
    </Card>
  )
}

// 기본 체크 — 등재된 좌표 + 인용 있음(core/judge.js 의 defaultOn 과 같다)
const defaultOn = (t) => !!t.registered && !!t.quote
const approvalOf = (f, saved) => {
  const a = saved || { coords: {}, vocab: {}, force: false }
  const coords = {}
  ;(f.draft?.records || []).forEach((r, i) => r.touches.forEach((t) => (coords[`${i}|${t.coord}`] = a.coords?.[`${i}|${t.coord}`] ?? defaultOn(t))))
  const vocab = {}
  for (const v of f.draft?.vocab || []) vocab[v.coord] = a.vocab?.[v.coord] ?? false
  return { coords, vocab, force: !!a.force }
}

function JobView({ me, say, repo, id }) {
  const key = `api:${repo}/jobs/${id}`
  const { data: j, error, refresh } = useResource(key, () => api.job(id), { ttl: 10_000 })
  const [shell, setShell] = useState(guessShell)
  const [filter, setFilter] = useState('all')
  const [open, setOpen] = useState(null)
  const [edits, setEdits] = useState({})
  const [saving, setSaving] = useState(false)
  const base = repoBase(repo)
  const files = useMemo(() => Object.entries(j?.files || {}).sort((a, b) => (a[0] < b[0] ? -1 : 1)), [j])
  if (error) return <Note tone="warn">{error.status === 404 ? '그런 잡이 없다 — 남의 잡이거나 지워졌다' : '잡을 읽지 못했다 — ' + error.message}</Note>
  if (!j) return null
  const [label, hint, mark] = STATE[j.state] || [j.state, '', 'none']
  const shown = files.filter(([, f]) => filter === 'all' || (filter === 'failed' ? f.status === 'failed' : filter === 'saved' ? ['saved', 'exists', 'have'].includes(f.status) : !['saved', 'exists', 'have', 'failed'].includes(f.status)))
  const mine = j.by === me?.user
  const paths = j.path.split(' · ')
  const cmds = ingestCommands(shell, { origin: window.location.origin, repo, job: j.id, paths, llm: !!j.options?.llm }).slice(1)
  const pending = Object.keys(edits).length
  const stateOf = (rel, f) => edits[rel] || approvalOf(f, j.approvals?.[rel])
  const setOne = (rel, f, fn) => setEdits((e) => ({ ...e, [rel]: fn(structuredClone(stateOf(rel, f))) }))
  const saveApprovals = async () => {
    setSaving(true)
    try {
      await api.jobApprove(j.id, edits)
      setEdits({})
      await refresh()
      say?.(`승인 ${pending}건을 저장했다 — 그 PC 에서 --apply 를 돌리면 이대로 들어간다`, 6000)
    } catch (e) {
      say?.(e.message)
    } finally {
      setSaving(false)
    }
  }
  const cancel = async () => {
    try {
      await api.jobCancel(j.id)
      invalidate(`api:${repo}/jobs`)
      await refresh()
      say?.('취소했다 — 그 PC 의 명령은 다음 보고에서 멈춘다')
    } catch (e) {
      say?.(e.message)
    }
  }
  return (
    <>
      <Card
        title={KIND[j.kind] || j.kind}
        hint={j.id}
        actions={
          <>
            <Link to={base + 'manage/ingest'}>‹ 목록</Link>
            {!['saved', 'cancelled'].includes(j.state) && (mine || can(me, 'curate', repo)) && (
              <Btn onClick={cancel} title="잡을 취소한다 — 이미 들어간 기록은 그대로다">
                취소
              </Btn>
            )}
          </>
        }
      >
        <Row label="대상">
          <Mono wrap>{j.path}</Mono>
        </Row>
        <Row label="누가">{j.by}</Row>
        <Row label="상태" mark={mark === 'bad' ? 'bad' : mark === 'warn' ? 'warn' : null}>
          {label}
          {hint ? <span className="amuted"> — {hint}</span> : null}
        </Row>
        <Row label="파일">
          <b className="num">{j.counts.files}</b> · 기록 될 것 {j.counts.records} · 판단 {j.counts.drafted} · 들임 {j.counts.saved} · 이미 있음 {j.counts.exists + j.counts.have} · 건너뜀 {j.counts.skipped} · 실패 {j.counts.failed}
          {typeof j.counts.queued === 'number' && j.counts.queued > 0 ? <> · 대기열 {j.counts.queued}</> : null}
        </Row>
        <Row label="마지막 보고">{j.state === 'waiting' ? <span className="amuted">아직 없다</span> : when(j.updated)}</Row>
      </Card>

      <Card title="파일" hint={`${files.length}`}>
        <div className="adocs__seg" role="tablist" aria-label="거르기" style={{ marginBottom: 10 }}>
          {[
            ['all', '전부'],
            ['todo', '남은 것'],
            ['saved', '들어감'],
            ['failed', '실패'],
          ].map(([k, l]) => (
            <button key={k} role="tab" aria-selected={filter === k} className="adocs__segbtn" onClick={() => setFilter(k)}>
              {l}
            </button>
          ))}
        </div>
        {!files.length && <Note>아직 보고가 없다 — 아래 명령을 그 PC 에서 돌린다.</Note>}
        {shown.length > 0 && (
          <div className="adocs__scroll">
            <table className="atable" data-ui="ingest-files">
              <thead>
                <tr>
                  <th>파일</th>
                  <th>결과</th>
                  <th>판단</th>
                  <th>기록</th>
                  <th>까닭</th>
                </tr>
              </thead>
              <tbody>
                {shown.flatMap(([rel, f]) => [
                  <tr key={rel} className={f.status === 'skipped' || f.status === 'asset' ? 'is-idle' : ''}>
                    <td className="amono">
                      {f.draft && mine && !['saved', 'exists', 'have'].includes(f.status) ? (
                        <button type="button" className="qtable__title" aria-expanded={open === rel} onClick={() => setOpen(open === rel ? null : rel)} title="판단의 후보를 보고 고른다">
                          {open === rel ? '▾' : '▸'} {rel}
                          {j.approvals?.[rel] || edits[rel] ? <span className="cchip">승인{edits[rel] ? ' · 저장 전' : ''}</span> : null}
                        </button>
                      ) : (
                        rel
                      )}
                    </td>
                    <td>
                      {f.status === 'failed' ? <Mark kind="bad" /> : null} {FILE[f.status] || f.status}
                    </td>
                    <td>
                      {f.nature || ''}
                      {f.coords?.length ? <div className="adocs__path">{f.coords.join(' · ')}</div> : null}
                    </td>
                    <td>
                      {(f.ids || []).map((x, i) => (
                        <div key={x}>
                          <Link to={base + 'd/' + encodeURIComponent(x)}>{x}</Link>
                          {f.states?.[i] ? <span className="amuted"> · {CUR[f.states[i]] || f.states[i]}</span> : null}
                        </div>
                      ))}
                    </td>
                    <td className="amuted">{f.error || f.reason || ''}</td>
                  </tr>,
                  open === rel && f.draft ? (
                    <tr key={rel + ':a'} className="qrun__item">
                      <td colSpan={5}>
                        <Approve f={f} st={stateOf(rel, f)} onChange={(fn) => setOne(rel, f, fn)} />
                      </td>
                    </tr>
                  ) : null,
                ])}
              </tbody>
            </table>
          </div>
        )}
        {mine && files.some(([, f]) => f.draft) && (
          <div className="qfoot">
            <span className="amuted">{pending ? `저장 전 승인 ${pending}건` : '판단한 파일을 펴서 좌표 · 어휘를 고른다 — 적용은 그 PC 의 --apply'}</span>
            <span className="topbar__spacer" />
            <Btn kind="accent" onClick={saveApprovals} disabled={!pending || saving}>
              {saving ? '저장하는 중…' : '승인 저장'}
            </Btn>
          </div>
        )}
      </Card>

      {mine && j.state !== 'cancelled' && (
        <Card title="다시 돌리기" hint="들어간 것은 건너뛴다">
          <ShellTabs shell={shell} setShell={setShell} />
          <ol className="start">
            {cmds.map((c) => (
              <li key={c.cmd} className="start__row">
                <div className="start__line">
                  <span className="start__fact">{c.what}</span>
                </div>
                <div className="howto start__cmd">
                  <Cmd>{c.cmd}</Cmd>
                </div>
              </li>
            ))}
          </ol>
        </Card>
      )}
    </>
  )
}

// 파일 하나의 승인 — 조각마다 좌표 후보(인용) · 어휘 제안 · 「제외」 판단이면 그래도 들이기
function Approve({ f, st, onChange }) {
  const d = f.draft
  if (d.nature === '제외') {
    return (
      <label data-ui="ingest-approve">
        <input type="checkbox" checked={st.force} onChange={(e) => onChange((s) => ((s.force = e.target.checked), s))} /> 판단은 「제외」({d.why || '들일 것이 아니다'}) — 그래도 들인다
      </label>
    )
  }
  return (
    <div data-ui="ingest-approve">
      {d.records.map((r, i) => (
        <div key={i} style={{ marginBottom: 8 }}>
          <div className="amuted">
            {d.records.length > 1 ? `${i + 1}. ` : ''}
            {r.title || ''} · 줄 {r.lines[0]}–{r.lines[1]}
            {r.date ? ` · ${r.date}` : ''}
          </div>
          {!r.touches.length && <div className="amuted">좌표 후보 없음</div>}
          {r.touches.map((t) => (
            <label key={t.coord} style={{ display: 'block' }}>
              <input type="checkbox" checked={!!st.coords[`${i}|${t.coord}`]} onChange={(e) => onChange((s) => ((s.coords[`${i}|${t.coord}`] = e.target.checked), s))} /> <code>{t.coord}</code>
              {t.registered ? '' : <span className="cchip cchip--new">미등재</span>}
              {t.verb ? ` ${t.verb}` : ''}
              {t.quote ? <span className="amuted"> — 「{t.quote}」</span> : null}
            </label>
          ))}
          {(r.excluded || []).map((x) => (
            <div key={x.coord} className="amuted">
              뺀 것 <code>{x.coord}</code>
              {x.why ? ` — ${x.why}` : ''}
            </div>
          ))}
          {(r.open || []).map((q) => (
            <div key={q} className="amuted">
              열린 물음 — {q}
            </div>
          ))}
        </div>
      ))}
      {d.vocab?.length > 0 && (
        <div>
          <div className="amuted">어휘 제안 — 미등재 좌표를 올리려면 같이 고른다</div>
          {d.vocab.map((v) => (
            <label key={v.coord} style={{ display: 'block' }}>
              <input type="checkbox" checked={!!st.vocab[v.coord]} onChange={(e) => onChange((s) => ((s.vocab[v.coord] = e.target.checked), s))} /> <code>{v.coord}</code> {v.label || ''}
              {v.aliases?.length ? <span className="amuted"> (aliases: {v.aliases.join(', ')})</span> : null}
            </label>
          ))}
        </div>
      )}
    </div>
  )
}
