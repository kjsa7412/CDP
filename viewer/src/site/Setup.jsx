// 설치 마법사 — 첫 관리자. 제품관리서비스 검토 §4.6 · D3.
//
// 명부가 비어 있을 때만 통한다. `install.sh` 가 끝에 찍은 일회용 코드(또는 서버의
// `<data>/bootstrap.code`)를 넣으면 첫 관리자(admin · 레포 전부)와 토큰이 만들어진다.
// 원문은 이 화면에 **한 번** 보인다. 브라우저는 그 자리에서 로그인된다 — 다음은 서버 › 지식 레포다.

import { useState } from 'react'
import { site } from '../lib/api.js'
import { Link, useTitle } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { copyText } from '../lib/clip.js'

export default function Setup({ info, onDone }) {
  const [step, setStep] = useState(1)
  const [code, setCode] = useState('')
  const [name, setName] = useState('')
  const [label, setLabel] = useState('')
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  const [done, setDone] = useState(null)
  const [copied, setCopied] = useState(false)
  useTitle('첫 설정 · CDP')

  if (info && !info.setupNeeded && !done) {
    return (
      <div className="auth">
        <div className="auth__box">
          <div className="auth__brand">
            <span className="topbar__mark" aria-hidden="true">C</span>
            <h1>이미 설정된 서버입니다</h1>
          </div>
          <p className="auth__sub">첫 관리자가 있습니다. 토큰으로 로그인합니다 — 잃었으면 관리자에게 재발급을 받습니다.</p>
          <Link className="btn btn--accent" to="/login">로그인</Link>
        </div>
      </div>
    )
  }

  const submit = async () => {
    setBusy(true)
    setMsg(null)
    try {
      const r = await site.setup({ code: code.trim(), name: name.trim(), label: label.trim() || null })
      if (r?.raw) {
        setDone(r)
        setStep(3)
        onDone?.()
        return
      }
      const e = r?.error
      if (e?.code === 'E_AUTH') {
        setStep(1)
        setMsg('코드를 확인하세요 — install.sh 가 찍은 것, 또는 서버의 <data>/bootstrap.code')
      } else if (e?.code === 'E_EXISTS') {
        setMsg('그 사이 명부가 생겼습니다 — 로그인합니다')
        onDone?.()
      } else setMsg(e?.message || '만들지 못했습니다')
    } catch (e2) {
      setMsg(e2.message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__box auth__box--wide">
        <div className="auth__brand">
          <span className="topbar__mark" aria-hidden="true">C</span>
          <h1>이 서버를 처음 설정합니다</h1>
        </div>
        <p className="auth__sub">명부가 비어 있습니다. 첫 관리자를 만들면 나머지는 왼쪽 메뉴의 <b>서버</b> 묶음에서 합니다.</p>
        <div className="steps">
          <div className="step2" aria-current={step === 1 ? 'step' : undefined} data-done={step > 1 ? '1' : undefined}><b>1</b> 부트스트랩 코드</div>
          <div className="step2" aria-current={step === 2 ? 'step' : undefined} data-done={step > 2 ? '1' : undefined}><b>2</b> 첫 관리자</div>
          <div className="step2" aria-current={step === 3 ? 'step' : undefined}><b>3</b> 토큰</div>
        </div>

        {step === 1 && (
          <>
            <section className="acard">
              <div className="acard__body" style={{ padding: '16px 18px' }}>
                <div className="form">
                  <div className="field">
                    <label className="field__l" htmlFor="su-code">부트스트랩 코드</label>
                    <input id="su-code" className="mono" value={code} onChange={(e) => setCode(e.target.value)} spellCheck={false} autoFocus placeholder="install.sh 가 마지막에 찍은 한 줄" />
                    <span className="field__h">
                      서버의 <code>&lt;data&gt;/bootstrap.code</code> 와 같은 값이다. 명부가 생기면 어디서도 통하지 않는다.
                    </span>
                  </div>
                  {msg && <div className="anote anote--bad">{msg}</div>}
                  <div className="anote">
                    코드를 읽으려면 서버의 파일이나 로그(<code>journalctl -u cdp-serve</code>)를 볼 수 있어야 한다 — 그것이 "첫 관리자는 셸을 가진 사람" 이라는 규칙이다. 셸에서 하려면 <code>ctx serve init</code>.
                  </div>
                </div>
              </div>
            </section>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <Link className="btn" to="/">← 소개</Link>
              <span style={{ flex: 1 }} />
              <button className="btn btn--accent" disabled={code.trim().length < 16} onClick={() => setStep(2)}>
                다음 →
              </button>
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <section className="acard">
              <div className="acard__body" style={{ padding: '16px 18px' }}>
                <div className="form">
                  <div className="field">
                    <label className="field__l" htmlFor="su-name">이름 (아이디)</label>
                    <input id="su-name" className="mono" value={name} onChange={(e) => setName(e.target.value)} spellCheck={false} autoFocus placeholder="lead" />
                    <span className="field__h">
                      영문 · 숫자 · <code>.</code> <code>_</code> <code>-</code>. 커밋의 <code>author</code> 로 남는다 — 사내 아이디를 쓴다. 바꿀 수 없다.
                    </span>
                  </div>
                  <div className="field">
                    <label className="field__l" htmlFor="su-label">라벨</label>
                    <input id="su-label" value={label} onChange={(e) => setLabel(e.target.value)} placeholder="소속 · 역할" />
                    <span className="field__h">사람이 읽는 이름.</span>
                  </div>
                  {msg && <div className="anote anote--bad">{msg}</div>}
                  <div className="anote">
                    이 사람은 <b>admin</b> 이고 모든 레포(<code>*</code>)를 본다. 다음 사람부터는 서버 › 사용자에서 역할과 레포를 고른다.
                  </div>
                </div>
              </div>
            </section>
            <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
              <button className="btn" onClick={() => setStep(1)}>← 코드</button>
              <span style={{ flex: 1 }} />
              <button className="btn btn--accent" disabled={busy || !/^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(name.trim())} onClick={submit}>
                {busy ? '만드는 중…' : '관리자 만들기 →'}
              </button>
            </div>
          </>
        )}

        {step === 3 && done && (
          <section className="acard">
            <div className="acard__head">
              <span className="acard__title">첫 관리자를 만들었습니다 — 토큰은 지금 한 번만 보입니다</span>
            </div>
            <div className="acard__body" style={{ padding: '16px 18px', gap: 12 }}>
              <div className="reveal">{done.raw}</div>
              <div className="reveal__act">
                <button
                  className="abtn abtn--accent"
                  onClick={() => {
                    copyText(done.raw).then((ok) => {
                      if (!ok) return
                      setCopied(true)
                      setTimeout(() => setCopied(false), 1400)
                    })
                  }}
                >
                  <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? '복사됨' : '복사'}
                </button>
                <span className="amuted" style={{ fontSize: 12 }}>
                  id <span className="amono">{done.id}</span> · 사용자 <b>{done.user}</b> · 만료 {done.expires} (관리자 토큰은 30일)
                </span>
              </div>
              <div className="anote anote--warn">
                <b>닫으면 다시 볼 수 없습니다.</b> <code>CDP_TOKEN</code> 환경변수에 넣습니다 — 파일 · 메신저 · 이슈에 남기지 않습니다. 잃으면 서버 › 토큰에서 재발급합니다.
              </div>
              <div className="anote">
                브라우저는 이미 로그인되어 있습니다. 다음은 서버 › <b>지식 레포</b>에서 첫 레포를 세우는 것입니다(설치절차 4장).
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <Link className="btn btn--accent" to="/console/repos">
                  서버 › 지식 레포로 <Icon name="arrowRight" size={14} />
                </Link>
              </div>
            </div>
          </section>
        )}
      </div>
    </div>
  )
}
