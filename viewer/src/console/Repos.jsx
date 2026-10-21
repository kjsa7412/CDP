// 서버 › 지식 레포 — 서버의 레포 **전부**(관리자에게만 · 검토 v0.1 D6). 제품관리서비스 검토 §4.7.
//
// 등록 = 폴더를 두는 것(§4.2). 두는 길이 둘 — **빈 레포로 세우기**(+ 옛 레포의 기록만 옮겨 오기) · origin 에서 clone(D9).
// 패키지 · 문서 고르기 · 서식 예시는 지웠다(개편안 S8 · §8.2) — 관리 문서는 큐레이터가 기록을 보고 서식집에서 골라 세운다.
// 세우면서 접근을 준다 — 전에는 세운 뒤 CLI 로 한 명씩 열어야 했다. 같은 함수(`buildRepo`)를 CLI `ctx repo new` 도 쓴다.
// **세우는 자리는 여기 하나다** — 레포 화면의 관리 › 지식 레포(`POST /repos` · writer)는 없앴다(화면 · 권한 검토 v0.1 R1).
// 세운 뒤의 둘도 여기다 — 「origin 연결」(세울 때 빠뜨린 원격 · 강제 push 없음) · 「삭제」(휴지통으로 옮김 · 이름을 쳐야 열림).
// 「원천」 — 이 지식 레포가 따라가는 원천 문서 레포(git 주소 · 브랜치). 잇고 바꾸는 자리는 그 레포의 작업실 › 출처다(지식 생성 · 작업실 검토 X9 —
// 레포 하나의 설정을 서버 전부의 표에 두지 않는다). 여기 표에는 상태 글자와 그 자리로 가는 길만 남긴다.
// 표에는 레포마다 큐레이션 대기 · 가장 오래된(개편안 S7) — 서버가 값을 낼 때만 열이 선다. 연결 · 삭제 · 내려받기 TODO K1~K7.
// **작업 레포 대장은 펼침 열이다**(제품화 2 ⑥ · 옛 「작업 레포 대장」 페이지) — 레포마다 등록 수 · 낡음, 누르면 그 레포의 등록이 펼쳐진다.
// `?wr=1`(옛 `/console/workrepos`)이면 전부 편다. 지식 레포가 없어진 등록(고아)은 표 아래 한 절 — 지울 자리가 여기뿐이다(F5).

import { useCallback, useEffect, useState } from 'react'
import { admin, api } from '../lib/api.js'
import HelpLink from '../components/HelpLink.jsx'
import { Link, navigate } from '../lib/router.jsx'
import { invalidate, put, useResource } from '../lib/cache.js'
import { josa } from '../lib/format.js'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from '../shell/sudo.jsx'
import { useSession } from '../lib/session.jsx'
import { missingFor } from './GitAuth.jsx'
import { PageHead, Note, Modal, Field, Chip, Mono, Confirm, Card, Row } from './ui.jsx'

// 원격 주소 두 모양 — 창의 예시. 어느 쪽이 되는지는 서버의 자격(PAT · 키)이 정한다
const ORIGIN_EX = ['http://<gitlab>/<그룹>/<프로젝트>.git', 'ssh://git@<gitlab>:<포트>/<그룹>/<프로젝트>.git']
// 서버 `core/reponew.ORIGIN_RE` 와 같은 모양
const ORIGIN_RE = /^(https?:\/\/|ssh:\/\/|git@|file:\/\/|\/|[A-Za-z]:[\\/])/
const originOk = (u) => ORIGIN_RE.test(u) && !/\s/.test(u)

// 큐레이션이 이만큼 밀리면 경고(개편안 §5.2 curation-stale)
const STALE_DAYS = 14
// 기록만 옮겨 오기 — 서버가 말한 옮긴 수(판에 따라 이름이 다를 수 있어 둘 다 본다). 없으면 null(그 입력을 모르는 서버)
const movedOf = (r) => (typeof r?.records === 'number' ? r.records : Array.isArray(r?.records) ? r.records.length : typeof r?.moved === 'number' ? r.moved : null)

// 상태 다섯 — 사실만(동시 기록 검토 v0.1 D4 · §5.7). 갈라짐은 기계가 못 푸는 것이라 bad.
// lag 는 「못 보냄」 — 커밋은 됐는데 origin 에 아직 못 갔다(옛 이름 「밀림」 은 용어 v1.0 에서 버렸다 · 개편안 §4.5)
const MIRROR = { ok: [null, '최신'], lag: ['warn', '못 보냄'], diverged: ['bad', '갈림'], behind: ['warn', 'origin 앞섬'], off: ['off', '원격 없음'] }
// 사유 — 서버의 `core/mirror.REASON_TEXT` 와 같은 말. 칩에는 짧게, 문장은 `title` 로.
const REASON = { 'non-ff': 'non-ff', auth: '인증 실패', net: '원격 불통', protected: '보호 브랜치', locked: 'ref 잠김', 'no-upstream': 'upstream 없음', unknown: '원인 미상' }

// 작업 레포 상태 칩 — 최신은 조용하다
const WR_STATE = { 최신: null, 낡음: 'warn', 미설치: 'off' }

export default function Repos({ say, route }) {
  const withSudo = useSudo()
  // 치운 뒤 — 상단 「레포 ▾」 · /me 의 볼 수 있는 레포 목록이 사라진 이름을 들고 있지 않게
  const session = useSession()
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
  // 세운 뒤의 둘 — 원격 잇기 · 치우기
  const [linking, setLinking] = useState(null)
  const [removing, setRemoving] = useState(null)
  const [gone, setGone] = useState(null)
  // `--mirror` 가 꺼져 있으면 이어도 save 뒤 자동 push 는 없다 — 창이 그 한 줄을 낸다
  const { data: srv } = useResource('/admin/server', admin.server)
  // 작업 레포 대장 — 서버 전부. 레포 행의 펼침 열과 표 아래 고아 절이 같은 값을 본다
  const { data: wrData, refresh: refreshWr } = useResource('/admin/workrepos', admin.workrepos)
  const wrAll = route?.query?.get?.('wr') === '1'
  const [wrOpen, setWrOpen] = useState(() => new Set())
  const [orphanDel, setOrphanDel] = useState(null)
  const wrOf = (name) => (wrData?.repos || []).filter((w) => w.knowledge === name && !w.orphan)
  const orphans = (wrData?.repos || []).filter((w) => w.orphan)
  const toggleWr = (name) =>
    setWrOpen((cur) => {
      const n = new Set(cur)
      n.has(name) ? n.delete(name) : n.add(name)
      return n
    })
  const removeOrphan = async () => {
    const r = orphanDel
    setActing('wr:' + r.id)
    try {
      await api.registryDel(r.id)
      setOrphanDel(null)
      invalidate('/admin/')
      invalidate('/workrepos')
      await refreshWr()
      say(`${r.name} — 대장에서 지웠다`)
    } catch (e) {
      say(e.message, 6000)
    } finally {
      setActing(null)
    }
  }

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
  // 레포 이름 → 진단 줄(트리 · origin · push · 옛 도구 층) 중 warn · fail 인 것
  const docOf = (name) => (doc || []).filter((r) => r.state !== 'ok' && new RegExp(`^레포 ${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`).test(r.what))
  const create = async (body) => {
    setBusy(true)
    setDone(null)
    try {
      const r = await withSudo(() => admin.repoNew(body))
      // 기록만 옮겨 오기 — 서버가 옮긴 수를 말하지 않으면 그 판은 이 입력을 모르는 것이다(v0.27 미만 · 조용히 무시된다).
      // 조용한 실패를 문장으로 바꾼다 — 빈 레포만 섰고 기록은 옮겨지지 않았다
      const moved = body.recordsFrom ? movedOf(r) : null
      setDone({ ...r, recordsFrom: body.recordsFrom || null, moved })
      if (body.recordsFrom && moved == null)
        say(`${josa(r.name, '을/를')} 세웠지만 이 서버는 「기록만 옮겨 오기」 를 모른다(v0.27 미만) — ${body.recordsFrom} 의 기록은 옮기지 않았다`, 12000)
      else say(`${josa(r.name, '을/를')} ${r.cloned ? '받아 왔다' : '세웠다'}${moved != null ? ` · ${body.recordsFrom} 의 기록 ${moved}건을 옮겼다` : ''}`)
      setAdding(false)
      invalidate('/admin/')
      invalidate('/next')
      await load()
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setBusy(false)
    }
  }

  // 복구 셋 — 서버가 판정하고(`core/mirror.js` · save 와 같은 뮤텍스 · auth.log) 여기는 결과 문장을 그대로 전한다.
  // 옛 넷째 「에이전트 세팅 갱신」(POST /admin/repos/<r>/kit)은 지웠다 — v1.0 은 kit 을 레포가 아니라 서버 번들에서 낸다(개편안 §6.3)
  const act = async (name, kind) => {
    setActing(name + ':' + kind)
    try {
      const fn = kind === 'sync' ? admin.repoSync : kind === 'push' ? admin.repoPush : admin.repoRestore
      const r = await withSudo(() => fn(name))
      if (kind === 'sync') say(r.ok ? (r.pulled ? `${name} — origin 에서 ${r.pulled}건 받았다` : `${name} — 이미 origin 과 같다`) : r.message || '맞추지 못했다', r.ok ? 4000 : 12000)
      else if (kind === 'push') say(r.ok ? `${name} — origin 에 보냈다` : `${name} — 보내지 못했다: ${r.message || r.reason || ''}`, r.ok ? 4000 : 10000)
      else say(r.ok ? `${name} — 트리를 되돌렸다 · 버린 것 ${r.discarded.length}` : r.message || '되돌리지 못했다', r.ok ? 5000 : 10000)
      invalidate('/admin/')
      invalidate('/next')
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

  // 원격 잇기 — 거절(409)도 답이다. 원격은 남으니 자격을 고친 뒤 같은 단추로 다시 민다(K3)
  const link = async (name, url) => {
    setActing(name + ':origin')
    try {
      const r = await withSudo(() => admin.repoOrigin(name, url))
      if (r.ok) {
        say(`${name} — origin 에 이었다 · ${r.url}${r.pushed ? ' · 첫 push 완료' : ''}`, 6000)
        setLinking(null)
      } else say(`${name} — 원격은 적었지만 push 가 안 됐다: ${r.reasonText || r.reason || ''}${r.message ? ' — ' + r.message : ''}`, 14000)
      invalidate('/admin/')
      invalidate('/next')
      await load()
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setActing(null)
    }
  }
  // 치우기 — 휴지통으로 옮긴다(K5). 레포 얼굴의 「레포 ▾」 도 같은 목록을 보니 `/repos` · `/me` 까지 무효로
  const remove = async (name) => {
    setActing(name + ':delete')
    try {
      const r = await withSudo(() => admin.repoDelete(name, name))
      setRemoving(null)
      setGone(r)
      setDone(null)
      say(`${name} — 휴지통으로 옮겼다`, 6000)
      invalidate('/admin/')
      session?.refresh?.()
      await load()
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 8000)
    } finally {
      setActing(null)
    }
  }

  if (!data) return <span className="amuted">읽는 중…</span>
  // 큐레이션 열 — 서버가 행마다 curation 을 낼 때만(옛 서버는 열째 없다)
  const cur = data.repos.some((r) => r.curation && typeof r.curation === 'object')
  return (
    <>
      <PageHead title="지식 레포" sub="이 서버가 든 레포 전부 · 레포마다 연결된 작업 레포">
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
                <th className="ar">작업 기록</th>
                <th className="ar">좌표</th>
                {cur && <th className="ar" title="큐레이션 대기 — 섹션에 아직 반영 안 된 작업 기록">큐레이션 대기</th>}
                {cur && <th title={`가장 오래 기다린 기록 — ${STALE_DAYS}일을 넘으면 경고`}>가장 오래된</th>}
                <th title="이 레포에 등록된 작업 레포(서버 전부의 대장) — 누르면 펼친다">작업 레포</th>
                <th>볼 수 있는 사람</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {data.repos.length === 0 && (
                <tr>
                  <td colSpan={cur ? 10 : 8} className="dim">{loading ? '읽는 중…' : '레포가 없다 — [새 레포] 로 빈 레포를 세우거나 origin 에서 받아 온다'}</td>
                </tr>
              )}
              {data.repos.map((r) => {
                const [mk, ml] = MIRROR[r.mirror] || MIRROR.off
                const notes = docOf(r.name)
                // origin 이 앞선 것을 서버 상태(fetch 없음)는 모르고 진단은 안다 — 그때도 「origin 과 맞추기」 를 낸다
                const originAhead = r.mirror === 'behind' || r.mirror === 'diverged' || notes.some((n) => /origin/.test(n.what) && /앞서/.test(n.note))
                const wr = wrOf(r.name)
                const wrStale = wr.filter((w) => w.state !== '최신').length
                const wrShown = wr.length > 0 && (wrAll || wrOpen.has(r.name))
                return [
                  <tr key={r.name}>
                    <td>
                      <span className="name">{r.name}</span>
                      <span className="sub">{r.title || '—'}</span>
                    </td>
                    <td className="mono">
                      {r.head || '—'} <span className="dim">{r.branch || ''}</span>
                    </td>
                    <td>
                      <Chip kind={mk} icon={mk === 'warn' || mk === 'bad' ? 'warn' : null} title={r.note || r.remote || undefined}>
                        {r.mirror === 'off' && r.remote ? '이었지만 못 보냄' : ml}
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
                            <button className="abtn" disabled={!!acting} onClick={() => act(r.name, 'push')} title="못 보낸 커밋을 origin 에 한 번 더 보낸다">
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
                    {cur && (
                      <td className="ar">
                        {!r.curation ? (
                          <span className="dim">—</span>
                        ) : r.curation.queue > 0 ? (
                          <Link className="cchip cchip--queued" to={'/r/' + encodeURIComponent(r.name) + '/manage/curation'} title={`${r.name} › 작업실 › 대기열`}>
                            {r.curation.queue}
                          </Link>
                        ) : (
                          <span className="dim num">0</span>
                        )}
                      </td>
                    )}
                    {cur && (
                      <td>
                        {r.curation?.queue > 0 && typeof r.curation.oldestDays === 'number' ? (
                          <span className={r.curation.oldestDays > STALE_DAYS ? 'cchip cchip--warn' : 'num'}>{r.curation.oldestDays}일</span>
                        ) : (
                          <span className="dim">—</span>
                        )}
                      </td>
                    )}
                    <td>
                      {!wrData ? (
                        <span className="dim">—</span>
                      ) : wr.length ? (
                        <button className="abtn" aria-expanded={wrShown} onClick={() => toggleWr(r.name)} title="이 레포의 작업 레포 등록 — 펼친다">
                          {wrShown ? '▾' : '▸'} {wr.length}곳{wrStale ? <span className="awarn"> · 낡음 · 미설치 {wrStale}</span> : null}
                        </button>
                      ) : (
                        <span className="dim">없음</span>
                      )}
                    </td>
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
                        <button className="abtn" onClick={() => navigate(`/console/people?repo=${encodeURIComponent(r.name)}#matrix`)}>접근</button>
                        <button className="abtn" disabled={!!acting} onClick={() => setLinking(r)} title={r.remote ? `origin: ${r.remote} — 바꾸거나 다시 보낸다` : '원격 저장소에 잇고 첫 push 를 한다'}>
                          {acting === r.name + ':origin' ? '잇는 중…' : r.remote ? 'origin' : 'origin 연결'}
                        </button>
                        <Link className="abtn" to={'/r/' + encodeURIComponent(r.name) + '/manage/sources'} title={r.source ? `원천: ${r.source.url}${r.source.branch ? ' @' + r.source.branch : ''} — 작업실 › 출처에서 바꾼다` : '원천 문서 레포 — 작업실 › 출처에서 잇는다'}>
                          {r.source ? '원천 ›' : '출처 ›'}
                        </Link>
                        <button className="abtn" disabled={!!acting} onClick={() => setRemoving(r)} title="휴지통(서버 data/trash)으로 옮긴다 — 영구 삭제는 없다">
                          삭제
                        </button>
                      </div>
                    </td>
                  </tr>,
                  wrShown ? (
                    <tr key={r.name + ':wr'} className="ctable__sub">
                      <td colSpan={cur ? 10 : 8}>
                        <WorkRows rows={wr} />
                      </td>
                    </tr>
                  ) : null,
                ]
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
          {done.granted?.length ? ` · 접근 ${done.granted.join(', ')}` : ''}
          {done.recordsFrom ? (done.moved != null ? ` · ${done.recordsFrom} 의 기록 ${done.moved}건을 옮겼다 — 전부 큐레이션 대기열에 선다` : ` · 기록 옮기기는 이 서버가 모른다(v0.27 미만)`) : ''}{' '}
          <Link className="abtn" to={'/r/' + encodeURIComponent(done.name) + '/'}>열기</Link>
          {done.moved ? (
            <>
              {' '}
              <Link className="abtn" to={'/r/' + encodeURIComponent(done.name) + '/manage/curation'}>대기열</Link>
            </>
          ) : null}
        </Note>
      )}
      {gone && (
        <Note tone="accent">
          <b>{gone.name}</b> — 휴지통으로 옮겼다 · <Mono>{gone.trash}</Mono>
          {gone.revoked?.length ? ` · 접근을 뺀 사람 ${gone.revoked.join(', ')}` : ''}
          {gone.workrepos ? ` · 작업 레포 등록 ${gone.workrepos}건은 「지식 레포 없음」 으로 남는다 — 이 페이지 아래 「지식 레포 없음」 에서 지운다` : ''}. 되살리려면 셸에서 그 폴더를 서버 root 로 되돌려 놓는다.
        </Note>
      )}
      {/* 지식 레포가 없어진 등록(고아) — 그 레포의 관리 화면이 없어졌으니 지울 자리가 여기뿐이다(실서버 종합 시험 F5) */}
      {orphans.length > 0 && (
        <Card title="지식 레포 없음" hint={`남은 작업 레포 등록 ${orphans.length}`}>
          {orphans.map((w) => (
            <Row key={w.id} label={w.name}>
              <Chip kind="warn">{w.knowledge}</Chip>
              <span className="dim">{w.owner || '담당 없음'}</span>
              <span className="topbar__spacer" />
              <button className="abtn abtn--warn" disabled={!!acting} onClick={() => setOrphanDel(w)}>
                삭제
              </button>
            </Row>
          ))}
        </Card>
      )}
      {/* 미러 칩(못 보냄 · origin 앞섬 · 갈림 · 트리 더러움)의 뜻과 푸는 길은 설명서 절이다 — 범례 표를 화면에 두지 않는다(안내 글 규칙 ④ ⑥) */}
      <p className="amuted" style={{ fontSize: 12 }}>
        미러 칩이 이상을 말하면 그 행의 단추 · 설명서 <HelpLink topic="mirror" />
      </p>

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
      {linking && <Origin repo={linking} busy={acting === linking.name + ':origin'} mirrorOn={srv ? !!srv.mirror : null} onClose={() => setLinking(null)} onOk={(url) => link(linking.name, url)} />}
      {removing && <Remove repo={removing} busy={acting === removing.name + ':delete'} onClose={() => setRemoving(null)} onOk={() => remove(removing.name)} />}
      {adding && <NewRepo data={data} busy={busy} onClose={() => setAdding(false)} onOk={create} />}
      {orphanDel && (
        <Confirm
          title={`${orphanDel.name} — 대장에서 지우기`}
          text={`지식 레포 ${josa(orphanDel.knowledge, '이/가')} 없어진 등록 ${orphanDel.name}(${orphanDel.id})을 대장에서 지웁니다. 작업 레포의 파일은 그대로입니다. 감사에 남습니다.`}
          okLabel="지운다"
          danger
          busy={!!acting}
          onClose={() => setOrphanDel(null)}
          onOk={removeOrphan}
        />
      )}
    </>
  )
}

// 새 지식 레포 — 길이 둘: **빈 레포로 세운다**(+ 옛 레포의 기록만 옮겨 오기) · origin 에서 받아 온다(개편안 S8 · §9.1).
// 패키지 · 문서 고르기 · 서식 예시는 지웠다 — 세운 레포에는 빈 등록부 · 어휘뿐이고, 관리 문서는 큐레이터가 서식집에서 골라 세운다.
function NewRepo({ data, busy, onClose, onOk }) {
  const [tab, setTab] = useState('empty')
  const [f, setF] = useState({ name: '', origin: '', clone: '', grant: [], from: false, fromRepo: '' })
  const okName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(f.name.trim())
  const repos = data.repos || []
  const ok = okName && (tab === 'empty' ? (!f.origin.trim() || originOk(f.origin.trim())) && (!f.from || !!f.fromRepo) : originOk(f.clone.trim()))
  const grantable = (data.users || []).filter((u) => !u.all)
  // 패키지는 보내지 않는다 — v1.0 서버는 패키지를 모르고 늘 빈 틀로 세운다(개편안 §8.2)
  const body = () =>
    tab === 'empty'
      ? {
          name: f.name.trim(),
          grant: f.grant,
          ...(f.origin.trim() ? { origin: f.origin.trim() } : {}),
          ...(f.from && f.fromRepo ? { recordsFrom: f.fromRepo } : {}),
        }
      : { name: f.name.trim(), clone: f.clone.trim(), grant: f.grant }
  return (
    <Modal
      title="새 지식 레포"
      onClose={onClose}
      wide
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>
            {tab === 'empty' ? '빈 틀 하나 · 첫 커밋' : 'clone 뒤 _vocab.md 가 없으면 지운다'} · auth.log · 재인증
          </span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>
            취소
          </button>
          <button className="abtn abtn--accent" disabled={busy || !ok} onClick={() => onOk(body())}>
            {busy ? (tab === 'empty' ? '세우는 중…' : '받는 중…') : tab === 'empty' ? '세우기' : '받아 오기'}
          </button>
        </>
      }
    >
      <div className="mtabs" style={{ padding: 0, marginBottom: -14 }}>
        <button aria-selected={tab === 'empty'} onClick={() => setTab('empty')}>
          빈 레포로 세운다
        </button>
        <button aria-selected={tab === 'clone'} onClick={() => setTab('clone')}>
          origin 에서 받아 온다 (clone)
        </button>
      </div>
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 14, display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="레포 이름" hint="폴더명 = 레포 이름 = 주소 조각. 영문 · 숫자 · . _ -">
          <input className="mono" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} spellCheck={false} autoFocus placeholder="예: alpha" />
          {/* 왜 단추가 꺼졌는지 칸 아래에서 말한다 — 전에는 말없이 꺼져 있었다(실서버 종합 시험 F10) */}
          {f.name.trim() && !okName && <span className="field__h field__h--bad">영문 · 숫자 · . _ - 만 — 첫 글자는 영문이나 숫자, 64자 안. 한글 · 빈칸은 주소 조각이 될 수 없다</span>}
        </Field>
        {tab === 'empty' ? (
          <>
            <Field
              label="기록만 옮겨 오기 (옛 레포)"
              hint="옛 레포의 작업 기록 전부(첨부 포함)와 그 기록이 건드린 좌표만 옮긴다 — 관리 문서 · 등록부 행 · 옛 문서 층의 정리 기록(등록부 · 문서 정리)은 옮기지 않는다. 옮긴 기록은 전부 큐레이션 대기열에 선다. 옛 레포는 그대로 남는다(개편안 §9.1)."
            >
              <div className="checks">
                <label>
                  <input type="checkbox" checked={f.from} onChange={(e) => setF({ ...f, from: e.target.checked, fromRepo: e.target.checked ? f.fromRepo || repos[0]?.name || '' : '' })} disabled={!repos.length} /> 옛 레포에서 기록을 옮겨 와 다시 세운다
                </label>
              </div>
              {f.from && (
                <select value={f.fromRepo} onChange={(e) => setF({ ...f, fromRepo: e.target.value })} aria-label="옮겨 올 레포">
                  {repos.map((r) => (
                    <option key={r.name} value={r.name}>
                      {r.name}
                      {r.docs != null ? ` — 작업 기록 ${r.docs}건` : ''}
                    </option>
                  ))}
                </select>
              )}
            </Field>
            <Field label="origin (선택)" hint="있으면 첫 커밋을 바로 보낸다. 서버는 GitLab 프로젝트를 만들 수 없다 — 웹에서 빈 프로젝트를 먼저 만든다.">
              <input className="mono" value={f.origin} onChange={(e) => setF({ ...f, origin: e.target.value })} spellCheck={false} placeholder="http://<gitlab>/<그룹>/<프로젝트>.git" />
              {f.origin.trim() && !originOk(f.origin.trim()) && <span className="field__h field__h--bad">http(s)://… 또는 ssh://git@… 모양이어야 한다 — 비우면 origin 없이 세운다</span>}
            </Field>
            <div className="anote">
              <b>빈 레포로 시작한다</b> — 사용자는 작업 기록만 쌓고, 관리 문서는 큐레이터가 기록을 보고 <b>작업실 › 관리 문서 · 서식집</b>에서 골라 세운다. 서식에서
              가져온 문서는 제목과 머리말뿐이다(예시 · 작성지침은 서식집에 남는다).
            </div>
          </>
        ) : (
          <Field label="origin 주소" hint="이미 있는 지식 레포를 받아 온다. 서버의 git 자격(PAT · 셸)으로 clone 한다 — _vocab.md 가 없으면 지식 레포가 아니라서 지운다.">
            <input className="mono" value={f.clone} onChange={(e) => setF({ ...f, clone: e.target.value })} spellCheck={false} placeholder="http://<gitlab>/<그룹>/<프로젝트>.git" />
            {f.clone.trim() && !originOk(f.clone.trim()) && <span className="field__h field__h--bad">http(s)://… 또는 ssh://git@… 모양이어야 한다</span>}
          </Field>
        )}
        <Field label="볼 수 있는 사람" hint="세우면서 repos 에 넣는다 — 전체(*) 인 사람은 이미 본다.">
          <div className="checks">
            {(data.users || [])
              .filter((u) => u.all)
              .map((u) => (
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

// 원격 잇기 — 주소 하나. 세울 때 빠뜨렸거나 GitLab 프로젝트를 나중에 만든 경우(K1~K4).
function Origin({ repo, busy, mirrorOn, onClose, onOk }) {
  const [url, setUrl] = useState('')
  const u = url.trim()
  const ok = ORIGIN_RE.test(u) && !/\s/.test(u)
  // 서버가 이 주소에 닿을 자격이 있나 — 없으면 누르기 전에 말한다(git 자격 TODO). 막지는 않는다 — 판정은 push 가 한다
  const { data: g } = useResource('/admin/gitauth', admin.gitauth)
  const miss = ok ? missingFor(u, g) : null
  return (
    <Modal
      title={`${repo.name} — origin ${repo.remote ? '바꾸기 · 다시 보내기' : '연결'}`}
      onClose={onClose}
      wide
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>remote → push -u origin HEAD · 강제 push 없음 · auth.log · 재인증</span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>취소</button>
          <button className="abtn abtn--accent" disabled={busy || !ok} onClick={() => onOk(u)}>
            {busy ? '잇는 중…' : '잇고 보내기'}
          </button>
        </>
      }
    >
      {repo.remote && (
        <div className="anote" style={{ fontSize: 12 }}>
          지금 origin — <Mono>{repo.remote}</Mono>. 같은 주소를 넣으면 다시 보내고, 다른 주소면 바꾼 뒤 보낸다.
        </div>
      )}
      <Field label="origin 주소" hint="GitLab 에서 빈 프로젝트를 먼저 만든다 — 서버는 프로젝트를 만들 수 없다. 원격에 커밋이 있으면 거절된다(남의 이력을 덮지 않는다).">
        <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoFocus placeholder={ORIGIN_EX[0]} />
        {u && !ok && <span className="field__h field__h--bad">http(s)://… 또는 ssh://git@… 모양이어야 한다 — 아래 두 모양 중 하나</span>}
      </Field>
      <div className="anote" style={{ fontSize: 12, lineHeight: 1.7 }}>
        두 모양 다 받는다 — <Mono>{ORIGIN_EX[0]}</Mono> 은 서버에 넣은 <b>PAT</b>(셸의 <code>ctx serve git-auth</code>) 로,{' '}
        <Mono>{ORIGIN_EX[1]}</Mono> 은 서버의 <b>SSH 배포 키</b>(서버 › 서버 › git 자격)로 민다. 자격이 없으면 「인증 실패」 로 돌아오고 원격은 남는다 — 자격을 고친 뒤 이 단추를 다시 누른다.
      </div>
      {miss && (
        <div className="anote anote--warn" style={{ fontSize: 12 }}>
          {miss}.{' '}
          <Link className="abtn" to="/console/server#gitauth" onClick={onClose}>git 자격</Link>
        </div>
      )}
      {mirrorOn === false && (
        <div className="anote anote--warn" style={{ fontSize: 12 }}>
          이 서버는 <code>--mirror</code> 없이 떠 있다 — 첫 push 는 지금 되지만 그 뒤 <code>save</code> 의 커밋은 자동으로 가지 않는다(「다시 보내기」 로 민다).
        </div>
      )}
    </Modal>
  )
}

// 원천 문서 레포 — 주소 · 브랜치(선택). 서버가 <data>/sources/<레포>.git 로 받는다 · 원천에는 쓰지 않는다.
// 작업실 › 출처가 연다(관리자 · 재인증)
export function Source({ repo, busy, onClose, onOk }) {
  const [url, setUrl] = useState('')
  const [branch, setBranch] = useState(repo.source?.branch || '')
  const u = url.trim()
  const ok = !u || originOk(u)
  const { data: g } = useResource('/admin/gitauth', admin.gitauth)
  const miss = u && ok ? missingFor(u, g) : null
  return (
    <Modal
      title={`${repo.name} — 원천 문서 레포`}
      onClose={onClose}
      wide
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>연결 시험(ls-remote) · 읽기만 · auth.log · 재인증</span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>취소</button>
          <button className="abtn abtn--accent" disabled={busy || !ok || (!u && !repo.source)} onClick={() => onOk(u, branch.trim())}>
            {busy ? '적는 중…' : u ? '적고 시험' : '연결 끊기'}
          </button>
        </>
      }
    >
      {repo.source && (
        <div className="anote" style={{ fontSize: 12 }}>
          지금 원천 — <Mono>{repo.source.url}</Mono>
          {repo.source.branch ? <> @ <Mono>{repo.source.branch}</Mono></> : null}. 주소를 다시 넣으면 바꾸고, 비우고 누르면 끊는다.
        </div>
      )}
      <Field label="원천 git 주소" hint="이 지식 레포가 따라가는 문서 레포. 루트에 cdp-sources.json(지도)이 있어야 한다. 원천이 git 서버에 없으면 먼저 올린다.">
        <input className="mono" value={url} onChange={(e) => setUrl(e.target.value)} spellCheck={false} autoFocus placeholder={ORIGIN_EX[1]} />
        {u && !ok && <span className="field__h field__h--bad">http(s)://… 또는 ssh://git@… 모양이어야 한다</span>}
      </Field>
      <Field label="브랜치 (선택)" hint="비우면 원천의 기본 브랜치(HEAD).">
        <input className="mono" value={branch} onChange={(e) => setBranch(e.target.value)} spellCheck={false} placeholder="main" />
      </Field>
      <div className="anote" style={{ fontSize: 12, lineHeight: 1.7 }}>
        자격은 origin 과 같다 — ssh 주소는 서버의 <b>SSH 배포 키</b>(GitLab 에 <b>읽기 전용</b>으로 등록), http 는 서버에 넣은 <b>PAT</b>. 큐레이터는 MCP <code>source</code>(follow · update)로 원천을 본다.
      </div>
      {miss && (
        <div className="anote anote--warn" style={{ fontSize: 12 }}>
          {miss}.{' '}
          <Link className="abtn" to="/console/server#gitauth" onClick={onClose}>git 자격</Link>
        </div>
      )}
    </Modal>
  )
}

// 치우기 — 이름을 그대로 쳐야 열린다(K6). 원격에 없는 커밋이 있으면 그것을 먼저 말한다.
function Remove({ repo, busy, onClose, onOk }) {
  const [v, setV] = useState('')
  const only = repo.mirror === 'off' ? '원격에 올라간 적이 없다 — 이 서버의 사본이 유일하다.' : repo.ahead > 0 ? `origin 에 못 간 커밋이 ${repo.ahead}건 있다.` : null
  return (
    <Modal
      title={`${repo.name} — 삭제`}
      onClose={onClose}
      small
      foot={
        <>
          <span className="sp" />
          <button className="abtn" onClick={onClose} disabled={busy}>취소</button>
          <button className="abtn abtn--warn" disabled={busy || v.trim() !== repo.name} onClick={onOk}>
            {busy ? '옮기는 중…' : '휴지통으로 옮긴다'}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>
        서버 root 에서 빼서 <code>data/trash/</code> 로 옮긴다 — 영구 삭제는 없다. 화면 · MCP 에서 사라지고, 명부의 할당에서 이 이름이 빠진다(전체 * 인 사람은 그대로).
      </p>
      {only && <div className="anote anote--warn" style={{ fontSize: 12 }}>{only} 휴지통의 폴더가 남은 사본이다.</div>}
      <Field label={`확인 — 레포 이름 ${josa(repo.name, '을/를')} 그대로 친다`}>
        <input className="mono" value={v} onChange={(e) => setV(e.target.value)} spellCheck={false} autoFocus />
      </Field>
    </Modal>
  )
}

// 작업 레포 대장의 한 레포 몫 — 펼친 행. 등록 · 설치 한 줄 · 삭제는 그 레포의 연결된 작업 레포 화면(설치 한 줄에 그 레포 이름과 등록 id 가 든다)
function WorkRows({ rows }) {
  return (
    <table className="ctable ctable--inner">
      <thead>
        <tr>
          <th>작업 레포</th>
          <th>담당</th>
          <th>상태</th>
          <th>kit</th>
          <th>마지막 보고</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((w) => (
          <tr key={w.id}>
            <td>
              <span className="name">{w.name}</span>
              {w.note && <span className="sub">{w.note}</span>}
            </td>
            <td>{w.owner || <span className="dim">담당 없음</span>}</td>
            <td>
              <Chip kind={WR_STATE[w.state] ?? 'off'}>{w.state}</Chip>
            </td>
            <td className="mono">
              {w.applied?.kit || <span className="dim">—</span>}
              {w.state === '낡음' && w.kitNow && <span className="dim"> → {w.kitNow}</span>}
            </td>
            <td className="dim">{w.applied ? `${w.applied.at} · ${w.applied.by}` : '—'}</td>
          </tr>
        ))}
      </tbody>
    </table>
  )
}
