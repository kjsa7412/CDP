// 소개 — 제품의 첫 화면. 제품관리서비스 검토 §4.4.
//
// **광고 문구를 쓰지 않는다.** 이 레포의 말 그대로 — 좌표 · 두 층 · 검사. 「이 서버」 카드는
// `/site/info` 하나로 그리고 레포 **이름**은 싣지 않는다(집계만 · D2). 그림은 산출물의
// `manual/그림/`(소스에서는 `docs/그림`) SVG 를 그대로 — 없으면 그 자리를 비운다.
// 맨 아래 「MCP 가 도는 길」 은 번들 안의 그림이라 늘 있다(`McpFlow.jsx`).

import { useState } from 'react'
import { site, repoHref } from '../lib/api.js'
import { Link, useTitle } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import McpFlow from './McpFlow.jsx'

const BOOKS = {
  사용자_설명서: { icon: 'book', desc: '작업 레포에서 에이전트로 일하고 기록한다.', items: ['처음 한 번 — 연결', '하루 흐름 · 작업 요청 · 기록', '막혔을 때'] },
  관리자_설명서: { icon: 'shield', desc: '서버 · 지식 레포 · 명부를 세우고, 어휘와 등록부를 지킨다.', items: ['서버형 · 로컬형 설치', '사람 관리 — 콘솔', '운영 · 갱신 · 장애'] },
  개발자_설명서: { icon: 'gear', desc: 'CDP 자체를 고치고 릴리스한다.', items: ['구조 · 불변조건', '검증 · 릴리스', '서버 · MCP · 패키지'] },
  설치절차: { icon: 'server', desc: '서버를 세우는 절차를 한 줄씩.', items: ['install.sh', 'git 자격 · 레포', '첫 관리자 · 확인'] },
}

export default function Landing({ info }) {
  useTitle('소개 · CDP')
  // 로그인 뒤 갈 곳은 역할이 정한다(`landingFor`) — 여기서 `next` 를 붙이지 않는다. 이름은 상단 스위처와 같은 말 — 「로그인」 · 「레포」(화면 UX 검토 v0.1 §5.5)
  const enter = info?.user ? repoHref() : '/login'
  const m = info?.mirror || {}
  return (
    <>
      <div className="wrap">
        <div className="hero">
          <div>
            <div className="hero__eyebrow">CDP · 맥락 배포 프로토콜 — 지식 레포 뷰어 · 도구 · MCP 서버</div>
            <h1>
              좌표로 찾고
              <br />
              사람이 본문을 읽는다
            </h1>
            <p className="hero__lead">
              프로젝트 지식을 <b>작업 기록(사건)</b>과 <b>관리 문서(상태)</b> 두 층으로 두고, <b>좌표</b>로 잇고, 커밋할 때 <b>검사</b>한다.
              갱신 누락은 상태가 아니라 오류다 — 그래서 "밀림" 이 없다.
            </p>
            <div className="hero__cta">
              <Link className="btn btn--accent" to={enter}>
                {info?.user ? '레포 열기' : '로그인'} <Icon name="arrowRight" size={14} />
              </Link>
              <Link className="btn" to="/manual">
                <Icon name="book" size={14} /> 설명서
              </Link>
            </div>
          </div>
          <aside className="hero__aside">
            <section className="acard">
              <div className="acard__head">
                <span className="acard__title">이 서버</span>
                <span className="acard__hint">{location.host}</span>
              </div>
              <div className="acard__body">
                <div className="arow">
                  <span className="arow__label">판</span>
                  <span className="arow__value">
                    <span className="amono">{info?.version ? `v${info.version}` : '—'}</span>
                    {info?.built && <span className="amuted">· 빌드 {info.built}</span>}
                  </span>
                </div>
                <div className="arow">
                  <span className="arow__label">지식 레포</span>
                  <span className="arow__value">
                    <b className="num">{info?.repos ?? '—'}</b>
                    <span className="amuted">곳</span>
                  </span>
                </div>
                <div className="arow">
                  <span className="arow__label">미러</span>
                  <span className="arow__value">
                    최신 <b className="num">{m.ok ?? '—'}</b> <span className="amuted">·</span> 밀림{' '}
                    <b className="num" style={m.lag ? { color: 'var(--warn)' } : undefined}>{m.lag ?? '—'}</b> <span className="amuted">·</span> 원격 없음{' '}
                    <b className="num">{m.off ?? '—'}</b>
                  </span>
                </div>
                <div className="arow">
                  <span className="arow__label">얼굴</span>
                  <span className="arow__value">
                    <span className="amuted">
                      <b style={{ color: 'var(--text)' }}>소개</b>(이 화면) · <b style={{ color: 'var(--text)' }}>설명서</b>(토큰 없이) · <b style={{ color: 'var(--text)' }}>레포</b>(로그인 뒤 문서 · 그래프) · <b style={{ color: 'var(--text)' }}>콘솔</b>(관리자 — 사람 · 토큰 · 레포 · 서버)
                    </span>
                  </span>
                </div>
                <div className="arow">
                  <span className="arow__label">MCP</span>
                  <span className="arow__value">
                    <span className="amono">/mcp/&lt;레포&gt;</span>
                    <span className="amuted">· 도구 13</span>
                  </span>
                </div>
                {info?.setupNeeded ? (
                  <div className="anote anote--warn">
                    이 서버는 아직 <b>첫 관리자</b>가 없습니다. <Link to="/setup">설치 마법사</Link>에서 만듭니다 — install.sh 가 찍은 코드가 필요합니다.
                  </div>
                ) : (
                  <div className="anote">
                    토큰은 이 서버의 <b>관리자</b>에게 받는다. 화면과 에이전트가 같은 토큰을 쓴다.
                  </div>
                )}
              </div>
            </section>
          </aside>
        </div>

        <div className="sec">
          <p className="sec__cap">세 가지</p>
          <div className="cards3">
            <div className="fcard">
              <Icon name="coord" size={20} />
              <h3>좌표</h3>
              <p>
                <code>table:rp_plnd_mst</code> 같은 이름표 하나로 사건과 상태를 잇는다. 검색이 "비슷한 것" 을 내는 자리에서 좌표는 <b>그것</b>을 낸다.
              </p>
            </div>
            <div className="fcard">
              <Icon name="managed" size={20} />
              <h3>두 층</h3>
              <p>
                <b>work/</b> 는 사건 — 왜 그렇게 정했나, 불변. <b>docs/</b> 는 상태 — 지금 어떻게 생겼나, 가변. 좌표가 둘을 잇는다.
              </p>
            </div>
            <div className="fcard">
              <Icon name="check" size={20} />
              <h3>검사</h3>
              <p>
                좌표를 건드린 작업은 그 정본 섹션을 채워야 커밋된다. 서버형은 <code>save</code> 가, 로컬형은 git 훅이 <b>같은 계산</b>으로 막는다.
              </p>
            </div>
          </div>
        </div>

        <div className="sec">
          <p className="sec__cap">어떻게 쓰나</p>
          <div className="cards3">
            <div className="fcard">
              <h3>에이전트</h3>
              <p>
                Claude Code 가 MCP 로 붙는다. 읽기 도구 12종 + <code>save</code>. 스킬 7종이 절차를 든다 — 검토 → 주입 → 기록.
              </p>
            </div>
            <div className="fcard">
              <h3>화면</h3>
              <p>
                찾기 → 뻗어나가기 → 읽기. 좌표 그래프. 갱신이 남은 곳은 <b>현황</b>에 있다. 편집은 없다 — 쓰기는 <code>save</code> 하나다.
              </p>
            </div>
            <div className="fcard">
              <h3>CLI</h3>
              <p>
                <code>ctx check</code> · <code>derive</code> · <code>where</code> · <code>match</code>. 화면과 <b>같은 계산</b>이라 답이 갈리지 않는다.
              </p>
            </div>
          </div>
        </div>

        <div className="sec">
          <p className="sec__cap">두 배치</p>
          <div className="cards2">
            <div className="fcard">
              <h3>서버형 — 이 서버</h3>
              <p>지식 레포는 서버에 하나. 서버가 유일한 작성자다. 사람은 토큰 하나와 꾸러미 zip 으로 붙는다.</p>
              <ul>
                <li>HTTP + 토큰 · <code>.mcp.json</code> 을 커밋한다</li>
                <li><code>save</code> 가 검사 · 커밋 · origin 미러</li>
                <li>브라우저에서 사람 · 레포 · 토큰을 관리한다</li>
              </ul>
            </div>
            <div className="fcard">
              <h3>로컬형 — 폐쇄망 PC</h3>
              <p>
                사람마다 clone. 원격이 정본. <code>cdp.exe</code> 하나로 화면과 도구가 돈다 — Node 가 없어도 된다.
              </p>
              <ul>
                <li>stdio MCP · git 훅이 검사</li>
                <li>배포본 zip 한 개를 반입한다</li>
                <li>이 서버가 그 레포를 미러할 수도 있다</li>
              </ul>
            </div>
          </div>
        </div>

        <div className="sec">
          <p className="sec__cap">누가 읽나 — 설명서</p>
          <div className="cards3">
            {(info?.manuals || []).map((b) => {
              const meta = BOOKS[b.id] || { icon: 'book', desc: '', items: [] }
              return (
                <Link key={b.id} to={'/manual/' + encodeURIComponent(b.id)} className="fcard fcard--link" style={{ textDecoration: 'none', color: 'inherit' }}>
                  <Icon name={meta.icon} size={20} />
                  <h3>{b.title.replace(/^CDP\s*/, '')}</h3>
                  <p>{meta.desc}</p>
                  {meta.items.length > 0 && (
                    <ul>
                      {meta.items.map((it) => (
                        <li key={it}>{it}</li>
                      ))}
                    </ul>
                  )}
                  <div className="fcard__foot">읽기 →</div>
                </Link>
              )
            })}
            {info && !info.manuals?.length && (
              <div className="anote anote--warn">이 서버에 설명서 폴더(<code>manual/</code>)가 없습니다 — 산출물의 것을 두거나 <code>--manual</code>.</div>
            )}
          </div>
        </div>

        <Figures />
        <McpFlow />
      </div>
    </>
  )
}

// 그림 둘 — 없으면(소스에서 띄웠거나 산출물에 빠졌거나) 그 자리를 비운다. 깨진 그림을 그리지 않는다.
function Figures() {
  const [gone, setGone] = useState({})
  const figs = [
    ['1_세_레포_구조.svg', '세 레포 — 소스 · 지식 · 작업'],
    ['7_MCP_두_모드.svg', 'MCP 두 모드 — 서버형 · 로컬형'],
  ].filter(([f]) => !gone[f])
  if (!figs.length) return null
  return (
    <div className="sec">
      <p className="sec__cap">그림</p>
      <div className="cards2">
        {figs.map(([f, cap]) => (
          <figure className="fig" key={f} style={{ margin: 0 }}>
            <img src={site.figure(f)} alt={cap} onError={() => setGone((g) => ({ ...g, [f]: true }))} />
            <figcaption>{cap}</figcaption>
          </figure>
        ))}
      </div>
    </div>
  )
}
