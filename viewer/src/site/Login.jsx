// 로그인 — 토큰 한 칸. MCP 설계서 §6.6.1 · 제품관리서비스 검토 §4.2.
//
// 서버가 그리던 HTML 을 화면으로 옮겼다 — 소개 · 설명서와 같은 토큰. 입력은 여전히 하나다
// (토큰이 아이디를 든다). **실패 메시지는 하나다** — 만료 · 명부에 없음 · 폐기를 가르면
// 명부를 흘린다. 분당 20회를 넘으면 서버가 429 를 낸다.

import { useState } from 'react'
import { site, landingFor } from '../lib/api.js'
import { Link, navigate, useTitle } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import { clearAll } from '../lib/cache.js'
import Icon from '../components/Icon.jsx'

export default function Login({ next = null }) {
  const session = useSession()
  const me = session.me
  const [tok, setTok] = useState('')
  const [show, setShow] = useState(false)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState(null)
  useTitle('로그인 · CDP')

  const submit = async (e) => {
    e.preventDefault()
    const t = tok.trim()
    if (!t) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await site.login(t, next)
      if (r?.ok) {
        // 얼굴이 바뀐다(사이트 → 레포 · 콘솔) — 세션을 새로 읽고 pushState 로 간다(문서 교체 없음 · 화면 · 권한 검토 v0.1 R7).
        // 다른 사람이었을 수 있으니 캐시는 비운다. 갈 곳은 **역할이 정한다**(`landingFor`) — admin 은 콘솔 · 나머지는 레포.
        // `next` 는 그 역할이 갈 수 있을 때만 따른다
        clearAll()
        const who = await session.refresh()
        navigate(landingFor(who || r, next))
        return
      }
      setMsg(r?.error?.message || '토큰을 확인하세요.')
    } catch (e2) {
      setMsg(e2.message || '토큰을 확인하세요.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="auth">
      <div className="auth__box">
        <div className="auth__brand">
          <span className="topbar__mark" aria-hidden="true">C</span>
          <h1>CDP</h1>
        </div>
        <p className="auth__sub">지식 레포 관리 서비스 · {location.host}</p>
        {me && (
          // 이미 로그인한 채 왔다 — 그대로 들어가거나, 다른 토큰으로 바꿔 로그인한다
          <div className="anote" style={{ marginBottom: 12 }}>
            <b>{me.user}</b> {me.role && <span className="who__role">{me.role}</span>} 로 로그인되어 있습니다.{' '}
            <Link to={landingFor(me, next)}>들어가기 →</Link>
            <br />
            다른 계정은 그 토큰을 아래에 넣습니다.
          </div>
        )}
        <form className="form" onSubmit={submit}>
          <div className="field">
            <label className="field__l" htmlFor="tk">토큰</label>
            <div className="field--row" style={{ display: 'flex' }}>
              <input id="tk" className="mono" type={show ? 'text' : 'password'} value={tok} onChange={(e) => setTok(e.target.value)} autoComplete="off" spellCheck={false} autoFocus />
              <button className="abtn" type="button" style={{ flex: 'none' }} onClick={() => setShow((s) => !s)} title={show ? '숨기기' : '보기'}>
                <Icon name="eye" size={13} /> {show ? '숨기기' : '보기'}
              </button>
            </div>
            <span className="field__h">붙여넣는 값이다. 앞뒤 공백은 지운다.</span>
          </div>
          {msg && <div className="anote anote--bad">{msg}</div>}
          <button className="btn btn--accent" type="submit" disabled={busy || !tok.trim()}>
            {busy ? '확인 중…' : '로그인'}
          </button>
          <div className="anote">
            토큰은 관리자에게 받는다. 분실하면 <b>재발급</b> — 재사용할 수 없다.
          </div>
        </form>
        <div className="auth__links">
          <Link to="/">← 소개</Link>
          <Link to="/manual">설명서</Link>
        </div>
      </div>
    </div>
  )
}
