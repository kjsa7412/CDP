// 서버 — 이 프로세스가 무엇으로 떠 있나 · 진단 · git 자격 · 갱신 · 감사 · 로그. 제품관리서비스 검토 §4.7.
// 제품화 2 ⑥(콘솔 7 → 4) — 옛 「감사」 페이지가 여기 접힘으로 들어왔다(`/console/audit` → `#audit`). 감사 · 로그는 문제 났을 때 보는 것이라 접는다.
//
// **거의 읽기다.** 고치는 것은 셸이다(D7 · D8) — 갱신은 upgrade.sh, PAT 는 셸에서. 여기는
// 그 명령과 지금 값을 보이는 자리. 파일 위치 · 로그는 관리자에게만 보인다.
// 하나 예외 — 「git 자격」(`GitAuth.jsx`)의 SSH 배포 키 · 호스트 키 · 접속 확인. 비밀이 브라우저를 건너지 않는 것만 여기서 한다.

import { useEffect, useMemo, useState } from 'react'
import { admin } from '../lib/api.js'
import { put, useResource } from '../lib/cache.js'
import Icon from '../components/Icon.jsx'
import { PageHead, Card, Row, Mono, Note, Btn, Cmd, Search, when } from './ui.jsx'
import GitAuth from './GitAuth.jsx'
import HelpLink from '../components/HelpLink.jsx'
import Audit from './Audit.jsx'
import { builtOf } from '../lib/format.js'

const MARK = { ok: ['check', 'var(--text-3)'], warn: ['warn', 'var(--warn)'], fail: ['block', 'var(--danger)'] }

export default function Server({ say, route }) {
  const [q, setQ] = useState('')
  const [busy, setBusy] = useState(false)

  // 셋 다 캐시(R8) — 진단은 서버도 60초 캐시라 같은 ttl. 로그는 다시 열면 새것(ttl 기본)
  const { data: sv, error } = useResource('/admin/server', admin.server)
  const { data: doc, loading: docLoading } = useResource('/admin/doctor', () => admin.doctor(), { ttl: 60_000 })
  // 로그는 펼 때 읽는다 — 접힌 채로 매번 200줄을 받지 않는다
  const [logOpen, setLogOpen] = useState(false)
  const [auditOpen, setAuditOpen] = useState(route?.hash === '#audit')
  const { data: log } = useResource(logOpen ? '/admin/log?200' : null, () => admin.log(200), { enabled: logOpen })
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])
  // 현황의 진단 카드 「자세히」 가 `#doctor` 를 들고 온다 — 표가 선 뒤 그 카드로
  useEffect(() => {
    // 연결 창의 「git 자격」 안내는 `#gitauth` 를 들고 온다
    // 옛 감사 페이지는 `#audit` 로 온다 — 펴고 그 자리로
    if (route?.hash === '#audit') setAuditOpen(true)
    if ((route?.hash === '#doctor' || route?.hash === '#gitauth' || route?.hash === '#audit') && sv) document.getElementById(route.hash.slice(1))?.scrollIntoView({ block: 'start' })
  }, [route?.hash, sv])

  const recheck = async () => {
    setBusy(true)
    try {
      put('/admin/doctor', await admin.doctor(true))
    } catch (e) {
      say(e.message, 6000)
    } finally {
      setBusy(false)
    }
  }

  const logLines = useMemo(() => {
    if (!log) return []
    const k = q.trim()
    // 경로 칸이 퍼센트 인코딩(`/docs/docs%2F2.%EA%B0%9C…`)이라 사람이 못 읽었다(실서버 종합 시험 F15) — 보일 때만 푼다. 거르기도 푼 글로
    const plain = (l) => {
      try {
        return /%[0-9A-Fa-f]{2}/.test(l) ? decodeURIComponent(l) : l
      } catch {
        return l
      }
    }
    return log.lines.map(plain).filter((l) => !k || l.includes(k))
  }, [log, q])

  if (!sv) return <span className="amuted">읽는 중…</span>
  // 설치 자리 — 서버가 낸 데이터 경로의 부모(손으로 경로를 쓰지 않는다 · 안내 글 규칙 ⑤). 모르면 갱신 명령을 그리지 않는다
  const prefix = sv.data ? sv.data.replace(/[\\/][^\\/]+$/, '') : null
  return (
    <>
      <PageHead title="서버" sub="설정 · 진단 · git 자격 · 갱신 · 감사 · 로그 — 고치는 것은 셸이다">
        <Btn onClick={recheck} disabled={busy}>
          <Icon name="sync" size={13} className={busy ? 'spin' : undefined} /> {busy ? '검사 중…' : '다시 검사'}
        </Btn>
      </PageHead>

      <div className="agrid">
        <Card title="이 프로세스">
          <Row label="판">
            <Mono>{sv.version ? `v${sv.version}` : '—'}</Mono>
            {/* 둘째 줄이 「·」 로 시작하지 않게 — 값 아래 작은 줄로(실서버 종합 시험 L6) */}
            {builtOf(sv.built) && <div className="amuted asub">빌드 {builtOf(sv.built)}</div>}
          </Row>
          <Row label="실행">
            <span className="amuted">
              node {sv.node} · pid {sv.pid} · 기동 <span className="nowrap">{when(new Date(sv.startedAt).toISOString())}</span>
            </span>
          </Row>
          <Row label="bind">
            <Mono>
              {sv.bind}:{sv.port}
            </Mono>
            <span className="amuted">{sv.publicUrl ? `· 공개 주소 ${sv.publicUrl}` : '· 프록시 없음 · 평문'}</span>
          </Row>
          <Row label="mirror">
            <span className="amuted">{sv.mirror ? '켜짐 — save 뒤 push' : '꺼짐 — save 뒤 push 하지 않는다'}</span>
          </Row>
          <Row label="관리 API 대역">
            {sv.adminFrom?.length ? <Mono>{sv.adminFrom.join(' · ')}</Mono> : <span className="amuted">제한 없음 — bind 가 유일한 경계다</span>}
          </Row>
          <Row label="소개 · 설명서">
            <span className="amuted">{sv.privatePages ? '로그인 뒤에만 (--private-pages)' : '공개'}</span>
          </Row>
        </Card>
        <Card title="파일이 어디에 있나" hint="관리자에게만 보인다">
          <Row label="레포">
            <Mono>{sv.root}</Mono>
          </Row>
          <Row label="명부">
            <Mono>{sv.auth || '—'}</Mono>
            <span className="amuted">· 600</span>
          </Row>
          <Row label="데이터 · 로그">
            <Mono>{sv.data || '—'}</Mono>
          </Row>
          <Row label="화면 · 설명서">
            <Mono>{sv.web}</Mono>
            {sv.manual && <Mono>{sv.manual}</Mono>}
            {!sv.webOk && <span className="awarn">index.html 없음</span>}
          </Row>
          {/* 서식집 · kit — 새 문서의 서식과 작업 레포 · 큐레이터 폴더의 스킬이 나가는 자리(v1.0 §8). 패키지 줄은 지웠다 — v1.0 서버는 패키지를 모른다 */}
          <Row label="서식집 · kit">
            <Mono>{sv.forms || '—'}</Mono>
            <Mono>{sv.kit || '—'}</Mono>
            {(!sv.forms || !sv.kit) && <span className="awarn">없음 — --forms · --kit</span>}
          </Row>
        </Card>
      </div>

      <Card id="doctor" title="진단" hint={doc ? `ctx serve doctor 와 같은 줄 · ${when(new Date(doc.at).toISOString())} · 60초 캐시` : 'ctx serve doctor 와 같은 줄'} actions={doc && <span className="tcount">ok {doc.rows.length - doc.fails - doc.warns} · warn {doc.warns} · fail {doc.fails}</span>}>
        {!doc ? (
          // 처음 읽는 동안은 「아직 안 했다」 가 아니다 — 서버가 레포마다 origin 을 보느라 몇 초 걸린다(실서버 종합 시험 F23)
          <span className="amuted">{busy ? '검사 중…' : docLoading ? '진단을 읽는 중… 레포마다 origin 에 닿는지 보느라 몇 초 걸린다' : '아직 검사하지 않았다 — 다시 검사'}</span>
        ) : (
          <div className="doctor">
            {doc.rows.map((r, i) => {
              const [ic, color] = MARK[r.state] || MARK.ok
              return (
                <div className="doctor__row" key={i} data-s={r.state}>
                  <Icon name={ic} size={13} style={{ color, flex: 'none' }} />
                  <span className="what">{r.what}</span>
                  <span className="note">{r.note}</span>
                </div>
              )
            })}
          </div>
        )}
      </Card>

      <GitAuth say={say} prefix={prefix} />

      <div className="agrid">
        <Card title="갱신" hint="셸의 일이다" actions={<HelpLink topic="update" />}>
          <Row label="지금">
            <Mono>{sv.version ? `v${sv.version}` : '—'}</Mono>
            {builtOf(sv.built) && <span className="amuted">· {builtOf(sv.built)}</span>}
          </Row>
          {/* 명령은 서버가 낼 때(`upgrade`) 그대로 · 아니면 설치 자리(data 의 부모)의 upgrade.sh — 모르면 설명서 절만 */}
          {(sv.upgrade || prefix) && (
            <Row label="새 판을 올리려면" stack>
              <Cmd>{sv.upgrade || `sudo bash ${prefix}/deploy/upgrade.sh /tmp/cdp-server-v<버전>.tar.gz`}</Cmd>
            </Row>
          )}
        </Card>
      </div>

      <details id="audit" className="cfold" open={auditOpen} onToggle={(e) => setAuditOpen(e.currentTarget.open)}>
        <summary>
          감사<span className="amuted">auth.log — 명부 · 토큰 · 레포 · 대장의 변경</span>
        </summary>
        <div className="cfold__body">{auditOpen && <Audit say={say} embedded />}</div>
      </details>

      <details className="cfold" open={logOpen} onToggle={(e) => setLogOpen(e.currentTarget.open)}>
        <summary>
          로그<span className="amuted">serve.log{log ? ` 마지막 ${log.lines.length}줄 · 전체 ${log.total}` : ''}</span>
        </summary>
        <div className="cfold__body">
          <Search value={q} onChange={setQ} placeholder="걸러 보기 — 401 · save" style={{ minWidth: 180, height: 26 }} />
          <pre className="logbox">{log ? logLines.join('\n') || '(없음)' : '읽는 중…'}</pre>
        </div>
      </details>
    </>
  )
}
