// 작업실 › 출처 — 이 지식 레포가 따라가는 원천 문서 레포. 지식 생성 · 작업실 검토 v0.1 §6.2 · X9 · D2.
//
// **읽기다.** 셋을 보인다 — 원천(주소 · 브랜치 · 받은 시각) · 지도 검사(`cdp-sources.json` — 문서 · 섹션 · 기록 · 오류) ·
// 따라가기(세운 뒤 원천에 들어온 커밋 중 위키 기록이 없는 것). 계산은 MCP `source` 의 map · follow 와 같다(서버 `/upstream`).
// 세우기 · 업데이트 기록은 큐레이터의 Claude Code(cdp-seed)가 한다 — 여기서 쓰지 않는다.
// 원천을 잇고 바꾸는 단추는 관리자에게만(재인증) — 서버의 자격(배포 키 · PAT)을 쓰는 일이라서다. 전에는 콘솔 표의 한 칸이었다.

import { useState } from 'react'
import { admin, api, currentRepo } from '../../lib/api.js'
import { invalidate, useResource } from '../../lib/cache.js'
import { useSudo, CANCELLED } from '../../shell/sudo.jsx'
import { Source } from '../../console/Repos.jsx'
import { Card, Row, Mono, Note, Btn, Mark, when } from './ui.jsx'

export default function Sources({ me, say }) {
  const repo = currentRepo()
  const map = useResource(`api:${repo}/upstream?op=map`, () => api.upstream('map'), { ttl: 60_000 })
  const [follow, setFollow] = useState(null)
  const [busy, setBusy] = useState(false)
  const [editing, setEditing] = useState(false)
  const withSudo = useSudo()
  const repos = useResource('/admin/repos', admin.repos, { enabled: !!me?.admin, ttl: 60_000 })
  const row = (repos.data?.repos || []).find((r) => r.name === repo) || { name: repo, source: map.data?.source || null }

  const loadFollow = async () => {
    setBusy(true)
    try {
      setFollow(await api.upstream('follow'))
    } catch (e) {
      say?.(e.message)
    } finally {
      setBusy(false)
    }
  }
  const saveSource = async (url, branch) => {
    setBusy(true)
    try {
      const r = await withSudo(() => admin.repoSource(repo, url, branch))
      if (!r.source) say?.('원천 연결을 끊었다')
      else if (r.ok) say?.(`원천을 적었다 · 연결 시험 통과${r.test?.head ? ' · ' + r.test.head : ''}`, 6000)
      else say?.(`원천은 적었지만 닿지 않는다: ${r.test?.reasonText || r.test?.reason || ''}${r.test?.message ? ' — ' + r.test.message : ''}`, 14000)
      setEditing(false)
      invalidate('/admin/')
      invalidate(`api:${repo}/upstream`)
      await map.refresh()
    } catch (e) {
      if (e.message !== CANCELLED) say?.(e.message, 8000)
    } finally {
      setBusy(false)
    }
  }

  const d = map.data
  const src = d?.source || null
  const check = d?.check || null
  return (
    <>
      <Card
        title="원천"
        hint="이 레포가 따라가는 문서 레포"
        actions={
          me?.admin ? (
            <Btn onClick={() => setEditing(true)} disabled={busy}>
              {src ? '바꾸기' : '원천 연결'}
            </Btn>
          ) : null
        }
      >
        {map.error && <Note tone="warn">읽지 못했다 — {map.error.message}</Note>}
        {d && !src && <Note>원천이 없다 — 문서 레포에서 세우지 않은 레포다(세운다면 관리자가 「원천 연결」 · 큐레이터가 cdp-seed).{d.note ? ' ' + d.note : ''}</Note>}
        {src && (
          <>
            <Row label="주소">
              <Mono wrap>{src.url}</Mono>
            </Row>
            <Row label="브랜치">{src.branch || <span className="amuted">기본(HEAD)</span>}</Row>
            {src.at && <Row label="받은 판"><Mono>{String(src.at).slice(0, 12)}</Mono>{src.fetchedAt ? <span className="amuted"> · {when(src.fetchedAt)}</span> : null}</Row>}
          </>
        )}
        {(d?.warnings || []).map((w) => (
          <Note key={w} tone="warn">
            {w}
          </Note>
        ))}
      </Card>

      {src && (
        <Card title="지도 검사" hint="cdp-sources.json">
          {d.error ? (
            <Note tone="warn">{d.error.message}</Note>
          ) : check ? (
            <>
              <Row label="결과" mark={check.ok ? null : 'bad'}>
                {check.ok ? '통과' : `오류 ${check.errors.length}`}
                {check.warnings.length ? ` · 경고 ${check.warnings.length}` : ''}
              </Row>
              <Row label="담는 것">
                문서 <b className="num">{check.docs.length}</b> · 섹션 <b className="num">{check.sections}</b> · 기록 <b className="num">{check.records}</b>
              </Row>
              {[...check.errors.map((x) => ['bad', x]), ...check.warnings.map((x) => ['warn', x])].slice(0, 30).map(([k, x], i) => (
                <div key={i} className="amuted" data-ui="map-finding">
                  <Mark kind={k} /> {typeof x === 'string' ? x : x.message || JSON.stringify(x)}
                </div>
              ))}
            </>
          ) : null}
        </Card>
      )}

      {src && !d?.error && (
        <Card title="따라가기" hint="세운 뒤 원천에 들어온 커밋" actions={<Btn onClick={loadFollow} disabled={busy}>{busy ? '보는 중…' : follow ? '다시 보기' : '보기'}</Btn>}>
          {!follow && <Note>원천을 받아 세운 판 뒤의 커밋마다 위키에 기록이 있는지 본다 — 누르면 원천을 받아 온다(몇 초).</Note>}
          {follow?.error && <Note tone="warn">{follow.error.message}</Note>}
          {follow && !follow.error && (
            <>
              <Row label="범위">
                <Mono>
                  {String(follow.range?.since || '').slice(0, 10)}..{String(follow.range?.at || '').slice(0, 10)}
                </Mono>
              </Row>
              <Row label="누락" mark={follow.miss ? 'warn' : null}>
                커밋 <b className="num">{follow.total}</b> 중 기록 없음 <b className="num">{follow.miss}</b>
                {follow.rate != null ? ` (${follow.rate}%)` : ''}
                {follow.skipped ? ` · 예외 ${follow.skipped}` : ''}
              </Row>
              {(follow.commits || [])
                .filter((c) => c.ok === false)
                .slice(0, 30)
                .map((c) => (
                  <div key={c.sha || c.h} className="amuted" data-ui="follow-miss">
                    <Mark kind="warn" /> <Mono>{String(c.sha || c.h || '').slice(0, 8)}</Mono> {c.subject || c.subj || ''}
                  </div>
                ))}
              {follow.miss > 0 && <Note>누락은 큐레이터가 Claude Code 에서 cdp-seed(업데이트 기록 초안 → 「왜」 를 채워 save)로 메운다.</Note>}
            </>
          )}
        </Card>
      )}

      {editing && <Source repo={row} busy={busy} onClose={() => setEditing(false)} onOk={(url, branch) => saveSource(url, branch)} />}
    </>
  )
}
