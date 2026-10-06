// 현황 — **질문은 하나다: 이 서버를 지금 쓸 수 있는 상태인가.** 제품관리서비스 검토 §4.7.
//
// 카드 넷에 답이 있고, 각 카드는 자기 페이지로 간다. 여기서 고치지 않는다.
// 경고 띠는 이상이 있을 때만 — 정상이면 카드와 감사 다섯 줄뿐이다(정상은 조용하다).

import { useEffect, useState } from 'react'
import { admin } from '../lib/api.js'
import { invalidate, useResource } from '../lib/cache.js'
import { Link, navigate } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { skewText } from '../lib/clock.js'
import { PageHead, Card, Row, Note, Btn, when, parseAudit, shortTime } from './ui.jsx'

export default function Overview({ say }) {
  const [busy, setBusy] = useState(false)
  const { data: d, error, refresh: load } = useResource('/admin/overview', admin.overview)
  // 큐레이션 대기 — 레포마다의 값은 `/admin/repos` 행에 있다(서버 › 지식 레포 · 레포 메뉴와 같은 키 — 요청 하나). 없으면 칸이 없다
  const { data: rs } = useResource('/admin/repos', admin.repos, { ttl: 60_000 })
  const curRows = (rs?.repos || []).filter((r) => r.curation && typeof r.curation === 'object')
  const queued = curRows.reduce((a, r) => a + (r.curation.queue || 0), 0)
  const oldest = curRows.reduce((m, r) => (r.curation.queue > 0 && r.curation.oldestDays > m ? r.curation.oldestDays : m), 0)
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])

  const recheck = async () => {
    setBusy(true)
    try {
      await admin.doctor(true)
      invalidate('/admin/')
      await load()
    } catch (e) {
      say(e.message, 6000)
    } finally {
      setBusy(false)
    }
  }

  if (!d) return <span className="amuted">읽는 중…</span>
  const m = d.repos.mirror
  const wr = d.workrepos
  // 시계 — 서버는 이 PC 의 시계를 모른다. 화면이 잰다(clock.js · 실서버 종합 시험 F4)
  const skew = skewText()
  const alerts = skew
    ? [...d.alerts, { level: 'warn', text: `${skew} — 「N분 전」 은 서버 시각으로 보인다. 기록 id 의 날짜 · 토큰 만료가 두 기계에서 갈릴 수 있다 → 서버 timedatectl · PC w32tm /resync` }]
    : d.alerts
  return (
    <>
      <PageHead title="현황" sub="이 서버를 지금 쓸 수 있는 상태인가 — 카드마다 자기 페이지로 간다">
        <span className="tcount">{d.doctor ? `진단 ${when(new Date(d.doctor.at).toISOString())}` : '진단 아직 없음'}</span>
        <Btn onClick={recheck} disabled={busy}>
          <Icon name="sync" size={13} className={busy ? 'spin' : undefined} /> {busy ? '검사 중…' : '다시 검사'}
        </Btn>
      </PageHead>

      {alerts.length > 0 && (
        <div className="alerts">
          {alerts.map((a, i) => (
            <div key={i} className={a.level === 'bad' ? 'alert alert--bad' : 'alert'}>
              <Icon name={a.level === 'bad' ? 'block' : 'warn'} size={14} />
              <span>{a.text}</span>
              <span className="sp" />
              {a.to && <Link to={'/console/' + a.to}>{({ users: '사용자', tokens: '토큰', repos: '지식 레포', workrepos: '작업 레포', server: '서버' })[a.to] || a.to} →</Link>}
            </div>
          ))}
        </div>
      )}

      <div className="agrid">
        <Card title="서버" actions={<Btn onClick={() => navigate('/console/server')}>자세히</Btn>}>
          <div className="stats">
            <Stat n={d.repos.count} l="지식 레포" />
            <Stat n={m.lag} l={m.diverged ? `미러 밀림 · 갈림 ${m.diverged}` : '미러 밀림'} warn={m.lag > 0 && !m.diverged} bad={m.diverged > 0} />
            {/* 패키지 칸은 지웠다 — 레포는 늘 빈 틀로 선다(개편안 S7 · §8.2). 대신 큐레이션 대기(서버가 낼 때만) */}
            {curRows.length > 0 && <Stat n={queued} l={oldest ? `큐레이션 대기 · 가장 오래된 ${oldest}일` : '큐레이션 대기'} warn={oldest > 14} />}
          </div>
          {/* 판과 빌드를 두 줄로 — 한 줄에 두면 좁을 때 둘째 줄이 「·」 로 시작했다(실서버 종합 시험 L6) */}
          <Row label="판">
            <span className="amono">{d.version ? `v${d.version}` : '—'}</span>
            <div className="amuted asub">
              빌드 {d.built} · node {d.node}
            </div>
          </Row>
          <Row label="기동">
            <span className="amuted">{when(new Date(d.startedAt).toISOString())}</span>
          </Row>
        </Card>

        <Card title="사람" actions={<Btn onClick={() => navigate('/console/users')}>자세히</Btn>}>
          <div className="stats">
            <Stat n={d.users.count} l={`사용자 · 활성 ${d.users.active}`} />
            <Stat n={d.users.admins} l="관리자" bad={d.users.admins === 0} />
            <Stat n={d.tokens.soon} l="토큰 만료 임박" warn={d.tokens.soon > 0} />
          </div>
          <Row label="토큰">
            활성 <b className="num">{d.tokens.active}</b> <span className="amuted">·</span> 폐기 <b className="num">{d.tokens.revoked}</b>
          </Row>
        </Card>

        <Card title="작업 레포" actions={<Btn onClick={() => navigate('/console/workrepos')}>자세히</Btn>}>
          <div className="stats">
            <Stat n={wr.count} l="등록" />
            <Stat n={wr['최신'] || 0} l="최신" />
            <Stat n={(wr['낡음'] || 0) + (wr['미설치'] || 0)} l="낡음 · 미설치" warn={(wr['낡음'] || 0) + (wr['미설치'] || 0) > 0} />
          </div>
          <Note>
            등록 · 꾸러미는 그 지식 레포의 <b>관리 &gt; 작업 레포</b>에서 한다. 여기서는 서버 전체를 한눈에.
          </Note>
        </Card>

        {/* 「자세히」 가 서버 카드와 같은 목적지로 둘 있었다 — 진단은 그 페이지의 진단 카드(#doctor)로(화면 · 권한 검토 v0.1 R6) */}
        <Card title="진단" hint="ctx serve doctor 와 같은 줄" actions={<Btn onClick={() => navigate('/console/server#doctor')}>자세히</Btn>}>
          {d.doctor ? (
            <div className="stats">
              <Stat n={d.doctor.oks} l="ok" />
              <Stat n={d.doctor.warns} l="warn" warn={d.doctor.warns > 0} />
              <Stat n={d.doctor.fails} l="fail" bad={d.doctor.fails > 0} />
            </div>
          ) : (
            <Note>
              아직 검사하지 않았다 — <b>다시 검사</b>를 누른다. 레포마다 origin 에 닿는지 · push 자격이 있는지를 본다(레포 하나에 몇 초).
            </Note>
          )}
        </Card>
      </div>

      {/* 기록의 흐름 — 누가 언제 어느 레포에 무엇을 기록했고 무엇이 거절됐나(동시 기록 검토 v0.1 D10).
          serve.log 의 save 줄이 출처라 본문 · 검색어는 없다. 거절 집계는 24시간. */}
      <Card
        title="최근 기록"
        hint={
          d.saves
            ? `save 24h ${d.saves.total24h}건 · 거절 ${Object.values(d.saves.rejected24h || {}).reduce((a, b) => a + b, 0)}${
                Object.keys(d.saves.rejected24h || {}).length ? ' — ' + Object.entries(d.saves.rejected24h).map(([k, v]) => `${k} ${v}`).join(' · ') : ''
              }`
            : ''
        }
      >
        {(!d.saves || d.saves.recent.length === 0) && <span className="amuted">아직 없다 — 첫 save 가 오면 여기 뜬다</span>}
        {d.saves?.recent.map((s, i) => (
          <div className="auditline" key={i}>
            <time>{shortTime(s.at)}</time>
            <span className="who2">{s.user}</span>
            <span className="what">
              <b>{s.repo}</b>
              {s.via && (
                <span className="awarn" title={`/mcp/${s.via} 로 붙어서 ${s.repo} 에 썼다 — 그 작업 레포의 .mcp.json 과 .claude/cdp.json 이 갈렸다`}>
                  {' '}(주소 {s.via})
                </span>
              )}{' '}
              · {s.id || '(id 없음)'} ·{' '}
              {s.result === 'ok' ? <span>기록됨</span> : <span style={{ color: 'var(--warn)', fontWeight: 600 }}>{s.result}</span>}
              {s.ms != null ? <span className="amuted"> · {s.ms}ms</span> : null}
            </span>
          </div>
        ))}
      </Card>

      <Card title="최근 감사" hint="auth.log 마지막 5줄" actions={<Btn onClick={() => navigate('/console/audit')}>전부 →</Btn>}>
        {d.audit.length === 0 && <span className="amuted">아직 없다</span>}
        {d.audit.map((line, i) => {
          const a = parseAudit(line)
          return (
            <div className="auditline" key={i}>
              <time>{shortTime(a.time)}</time>
              <span className="who2">{a.actor}</span>
              <span className="what">{a.text}</span>
            </div>
          )
        })}
      </Card>
      <Note>
        이 화면은 <b>사람이 열었을 때만 말합니다.</b> 알림을 띄우지 않습니다.
      </Note>
    </>
  )
}

function Stat({ n, l, warn = false, bad = false }) {
  return (
    <div className={`stat${bad ? ' stat--bad' : warn ? ' stat--warn' : ''}`}>
      <span className="stat__n">{n ?? '—'}</span>
      <span className="stat__l">{l}</span>
    </div>
  )
}
