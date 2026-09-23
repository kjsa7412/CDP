// 현황 — **질문은 하나다: 이 서버를 지금 쓸 수 있는 상태인가.** 제품관리서비스 검토 §4.7.
//
// 카드 넷에 답이 있고, 각 카드는 자기 페이지로 간다. 여기서 고치지 않는다.
// 경고 띠는 이상이 있을 때만 — 정상이면 카드와 감사 다섯 줄뿐이다(정상은 조용하다).

import { useCallback, useEffect, useState } from 'react'
import { admin } from '../lib/api.js'
import { Link, navigate } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { PageHead, Card, Row, Note, Btn, when, parseAudit, shortTime } from './ui.jsx'

export default function Overview({ say }) {
  const [d, setD] = useState(null)
  const [busy, setBusy] = useState(false)
  const load = useCallback(() => admin.overview().then(setD).catch((e) => say(e.message, 6000)), [say])
  useEffect(() => {
    load()
  }, [load])

  const recheck = async () => {
    setBusy(true)
    try {
      await admin.doctor(true)
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
  return (
    <>
      <PageHead title="현황" sub="이 서버를 지금 쓸 수 있는 상태인가 — 카드마다 자기 페이지로 간다">
        <span className="tcount">{d.doctor ? `진단 ${when(new Date(d.doctor.at).toISOString())}` : '진단 아직 없음'}</span>
        <Btn onClick={recheck} disabled={busy}>
          <Icon name="sync" size={13} className={busy ? 'spin' : undefined} /> {busy ? '검사 중…' : '다시 검사'}
        </Btn>
      </PageHead>

      {d.alerts.length > 0 && (
        <div className="alerts">
          {d.alerts.map((a, i) => (
            <div key={i} className={a.level === 'bad' ? 'alert alert--bad' : 'alert'}>
              <Icon name={a.level === 'bad' ? 'block' : 'warn'} size={14} />
              <span>{a.text}</span>
              <span className="sp" />
              {a.to && <Link to={'/console/' + a.to}>{({ users: '사용자', tokens: '토큰', repos: '지식 레포', server: '서버' })[a.to] || a.to} →</Link>}
            </div>
          ))}
        </div>
      )}

      <div className="agrid">
        <Card title="서버" actions={<Btn onClick={() => navigate('/console/server')}>자세히</Btn>}>
          <div className="stats">
            <Stat n={d.repos.count} l="지식 레포" />
            <Stat n={m.lag} l="미러 밀림" warn={m.lag > 0} />
            <Stat n={d.packages} l="패키지" />
          </div>
          <Row label="판">
            <span className="amono">{d.version ? `v${d.version}` : '—'}</span>
            <span className="amuted">· 빌드 {d.built} · node {d.node}</span>
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

        <Card title="진단" hint="ctx serve doctor 와 같은 줄" actions={<Btn onClick={() => navigate('/console/server')}>자세히</Btn>}>
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
