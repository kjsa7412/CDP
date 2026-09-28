// 정보 — 서버 모드의 「문제 났을 때 본다」 자리. 화면 · 권한 검토 v0.1 R3.
//
// **값만 낸다. 요청이 없다.** 전에는 로컬의 「진단 · 정보」 가 그대로 서버에도 떠서 `/api/<레포>/diag` ·
// `/open` 을 불렀고 둘 다 404 라 영원한 「읽는 중…」 이었다(P2 · 불변조건 7 — 없는 상태를 그리지 않는다).
// 서버 경로 · 로그 · pid 는 콘솔 › 서버의 것이다(MCP 설계서 §6.6.3). 여기 있는 것은 **세션이 이미 든 것**뿐 —
// 판 · 빌드 · 내 계정 · 역할 · 이 레포에서 할 수 있는 것 · 토큰 만료 · 볼 수 있는 레포 수 · 단축키 · 설명서.

import Icon from '../Icon.jsx'
import { Link } from '../../lib/router.jsx'
import { KEYS } from '../../lib/keys.js'
import { Card, Row, Mono, Note } from './ui.jsx'

export default function Info({ me, built: builtRaw = null, repoName = null }) {
  // 소스에서 띄운 서버는 번들 시각이 자리표시(`__CTX_BUILT__`)다 — 없는 값을 그리지 않는다(불변조건 7)
  const built = builtRaw && !/^__/.test(builtRaw) ? builtRaw : null
  const can = me?.admin
    ? '읽기 · save · 작업 레포 등록 · 콘솔(사람 · 토큰 · 레포 전부 · 서버)'
    : me?.write
      ? '읽기 · save · 작업 레포 등록'
      : '읽기 — 화면 · 검색 · MCP 읽기 도구'
  const days = me?.expiresInDays
  return (
    <>
      <Card title="이 서버">
        <Row label="판">
          <Mono>{me?.version ? `v${me.version}` : '—'}</Mono>
          {built && <span className="amuted"> · 빌드 {built}</span>}
        </Row>
        <Row label="보고 있는 레포">
          <Mono>{repoName || '—'}</Mono>
          {me?.repos && <span className="amuted"> · 볼 수 있는 레포 {me.repos.length}</span>}
        </Row>
      </Card>

      <Card title="내 계정">
        <Row label="이름">
          <b>{me?.user || '—'}</b>
          {me?.label && <span className="amuted"> · {me.label}</span>}
        </Row>
        <Row label="역할">
          <span className="who__role">{me?.role || '—'}</span>
        </Row>
        <Row label="이 레포에서">
          <span className="amuted">{can}</span>
        </Row>
        {/* 로그인한 그 토큰의 만료 — 모르면(옛 쿠키) 모른다고 말한다. 무기한과 모름을 섞지 않는다(불변조건 7). 임박(≤7)만 소리를 낸다 */}
        <Row label="토큰 만료" mark={typeof days === 'number' && days <= 7 ? 'warn' : null}>
          {typeof days === 'number' ? (
            <span className={days <= 7 ? 'awarn' : 'amuted'}>
              D-<b className="num">{days}</b> · {me.tokenExpires}
              {days <= 7 ? ' — 관리자에게 재발급을 받는다' : ''}
            </span>
          ) : me?.tokenExpires === 'never' ? (
            <span className="amuted">무기한</span>
          ) : (
            <span className="amuted">이 세션에서는 모른다 — 다시 로그인하면 보인다</span>
          )}
        </Row>
        <Note>
          권한은 사람에 붙어 있다 — 역할 · 레포 할당이 바뀌면 토큰을 다시 받을 필요 없이 다음 요청부터 먹는다. 토큰을 잃었으면{' '}
          <b>관리자</b>에게 재발급을 받는다.
        </Note>
      </Card>

      <Card title="단축키">
        <dl className="help__keys">
          {KEYS.map(([keys, what]) => (
            <div className="help__row" key={what}>
              <dt>
                {keys.map((k) => (
                  <span className="kbd" key={k}>
                    {k}
                  </span>
                ))}
              </dt>
              <dd>{what}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card title="설명서">
        <Link className="help__doc" to="/manual/사용자_설명서" style={{ textDecoration: 'none' }}>
          <Icon name="book" size={14} /> 사용자 설명서 — 연결 · 하루 흐름 · 기록 · 화면
        </Link>
        {me?.admin && (
          <Link className="help__doc" to="/manual/관리자_설명서" style={{ textDecoration: 'none' }}>
            <Icon name="shield" size={14} /> 관리자 설명서 — 서버 · 지식 레포 · 명부 · 운영
          </Link>
        )}
      </Card>
    </>
  )
}
