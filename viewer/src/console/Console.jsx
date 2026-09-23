// 콘솔 — 관리자의 자리. 제품관리서비스 검토 §4.7.
//
// 상단은 앱의 크롬(.topbar) · 왼쪽 메뉴는 관리 화면의 .astep — 같은 프로그램의 다른 얼굴이다.
// admin 이 아니면 문장 하나로 멈춘다(D4 — 403 을 화면에서도 같은 말로).
//
// **재인증은 끼어드는 모달이다.** 쓰기 동작이 `E_REAUTH` 를 받으면 뜨고, 통과하면 하던 동작을
// 이어 한다(D5). 관리자가 미리 재인증할 필요가 없다 — `withSudo(fn)` 하나로 페이지가 부른다.

import { createContext, useCallback, useContext, useEffect, useState } from 'react'
import { api, admin, ApiError } from '../lib/api.js'
import { useRoute, Link } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { Modal, Field } from './ui.jsx'
import Overview from './Overview.jsx'
import Users from './Users.jsx'
import Tokens from './Tokens.jsx'
import Repos from './Repos.jsx'
import WorkRepos from './WorkRepos.jsx'
import Server from './Server.jsx'
import Audit from './Audit.jsx'

const MENU = [
  ['overview', 'check', '현황', '지금 쓸 수 있는 상태인가'],
  ['users', 'users', '사용자', '역할 · 레포 할당 · 비활성'],
  ['tokens', 'key', '토큰', '발급 · 재발급 · 폐기'],
  ['repos', 'managed', '지식 레포', '전부 · 세우기 · 접근'],
  ['workrepos', 'plug', '작업 레포', '설치 대장 · 낡음'],
  ['server', 'server', '서버', '설정 · 진단 · 갱신 · 로그'],
  ['audit', 'list', '감사', 'auth.log'],
]
const PAGES = { overview: Overview, users: Users, tokens: Tokens, repos: Repos, workrepos: WorkRepos, server: Server, audit: Audit }

const SudoCtx = createContext(null)
export const useSudo = () => useContext(SudoCtx)
export const CANCELLED = '취소했습니다'

export default function Console() {
  const route = useRoute()
  const [me, setMe] = useState(null)
  const [err, setErr] = useState(null)
  const [toast, setToast] = useState(null)
  const say = useCallback((m, ms = 3200) => {
    setToast(m)
    setTimeout(() => setToast(null), ms)
  }, [])

  useEffect(() => {
    document.title = 'CDP 콘솔'
    api.me().then(setMe).catch((e) => setErr(e.message))
  }, [])

  const page = route.segs[1] || 'overview'
  if (err) return <Bare>{err}</Bare>
  if (!me) return <Bare>불러오는 중…</Bare>
  if (!me.admin) return <NoAdmin me={me} />
  const Page = PAGES[page] || Overview

  return (
    <SudoProvider>
      <div className="con">
        <header className="topbar">
          <Link to="/console" className="con__brand">
            <span className="topbar__mark" aria-hidden="true">C</span>CDP <small>콘솔</small>
          </Link>
          <span className="topbar__spacer" />
          <nav className="con__links">
            <a href="/manual">
              <Icon name="book" size={13} /> 설명서
            </a>
            <a href="/r">
              <Icon name="doc" size={13} /> 문서로
            </a>
          </nav>
          <span className="who">
            <b style={{ color: 'var(--text)' }}>{me.user}</b>
            <span className="who__role">{me.role}</span>
            <a className="who__out" href="/logout" title="로그아웃">
              <Icon name="power" size={13} />
            </a>
          </span>
        </header>
        <div className="admin">
          <nav className="admin__menu" aria-label="콘솔">
            {MENU.map(([k, icon, t, s]) => (
              <Link key={k} to={'/console/' + k} className="astep" aria-current={page === k ? 'true' : undefined}>
                <Icon name={icon} size={15} className="astep__i" />
                <span className="astep__txt">
                  <span className="astep__t">{t}</span>
                  <span className="astep__s">{s}</span>
                </span>
              </Link>
            ))}
            <span className="topbar__spacer" style={{ flex: 1 }} />
            <a className="astep astep--back" href="/r">
              <Icon name="doc" size={15} />
              <span className="astep__txt">
                <span className="astep__t">문서로</span>
                <span className="astep__s">/r</span>
              </span>
            </a>
          </nav>
          <div className="admin__body">
            <div className="admin__wrap">
              <Page me={me} say={say} route={route} />
            </div>
          </div>
        </div>
        {toast && <div className="toast" role="status">{toast}</div>}
      </div>
    </SudoProvider>
  )
}

// 재인증 — 자기 토큰 원문을 한 번 더. 15분 동안 다시 묻지 않는다(서버의 `cdp_su` 쿠키).
function SudoProvider({ children }) {
  const [pend, setPend] = useState(null)
  const [tok, setTok] = useState('')
  const [show, setShow] = useState(false)
  const [msg, setMsg] = useState(null)
  const [busy, setBusy] = useState(false)

  const withSudo = useCallback(async (fn) => {
    try {
      return await fn()
    } catch (e) {
      if (!(e instanceof ApiError) || e.code !== 'E_REAUTH') throw e
      await new Promise((resolve, reject) => setPend({ resolve, reject }))
      return await fn()
    }
  }, [])

  const confirm = async () => {
    const t = tok.trim()
    if (!t) return
    setBusy(true)
    setMsg(null)
    try {
      const r = await admin.sudo(t)
      if (r?.ok) {
        const p = pend
        setPend(null)
        setTok('')
        p.resolve()
      } else setMsg(r?.error?.message || '토큰을 확인하세요')
    } catch (e) {
      setMsg(e.message)
    } finally {
      setBusy(false)
    }
  }
  const cancel = () => {
    const p = pend
    setPend(null)
    setTok('')
    setMsg(null)
    p?.reject(new Error(CANCELLED))
  }

  return (
    <SudoCtx.Provider value={withSudo}>
      {children}
      {pend && (
        <Modal
          title={
            <>
              <Icon name="shield" size={15} /> 관리자 확인
            </>
          }
          onClose={cancel}
          small
          foot={
            <>
              <span className="sp" />
              <button className="abtn" onClick={cancel} disabled={busy}>취소</button>
              <button className="abtn abtn--accent" onClick={confirm} disabled={busy || !tok.trim()}>
                {busy ? '확인 중…' : '확인하고 계속'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>
            명부를 바꾸는 동작입니다. <b>내 토큰</b>을 한 번 더 넣으면 <b>15분</b> 동안 다시 묻지 않습니다.
          </p>
          <Field label="내 토큰">
            <div className="field--row" style={{ display: 'flex' }}>
              <input className="mono" type={show ? 'text' : 'password'} value={tok} onChange={(e) => setTok(e.target.value)} autoComplete="off" autoFocus spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && confirm()} />
              <button className="abtn" type="button" style={{ flex: 'none' }} onClick={() => setShow((s) => !s)} aria-label={show ? '숨기기' : '보기'} title={show ? '숨기기' : '보기'}>
                <Icon name="eye" size={13} />
              </button>
            </div>
          </Field>
          {msg && <div className="anote anote--bad">{msg}</div>}
          <div className="anote">세션이 탈취돼도 이 15분 밖에서는 명부가 바뀌지 않게 하는 장치입니다(sudo 와 같은 모양). 통과하면 하던 동작을 이어 합니다.</div>
        </Modal>
      )}
    </SudoCtx.Provider>
  )
}

function Bare({ children }) {
  return (
    <div className="con">
      <div className="empty" style={{ paddingTop: '20vh' }}>{children}</div>
    </div>
  )
}

// admin 이 아닌 사람 — v1.1 명부를 그대로 올린 서버가 정확히 이 상태다(관리자 0명).
function NoAdmin({ me }) {
  return (
    <div className="con">
      <div className="empty-page">
        <section className="acard">
          <div className="acard__head">
            <span className="acard__title">관리자 권한이 필요합니다</span>
          </div>
          <div className="acard__body">
            <div className="arow">
              <span className="arow__label">계정</span>
              <span className="arow__value">
                <b>{me.user}</b> <span className="who__role">{me.role}</span>
              </span>
            </div>
            <div className="anote">
              콘솔은 <b>admin</b> 의 것입니다. 관리자가 사용자 페이지에서 역할을 올려 줍니다. 이 서버에 관리자가 아직 없다면 셸에서 —
            </div>
            <div className="apre">ctx serve user set --auth /opt/cdp/auth.json --data /opt/cdp/data --name {me.user} --role admin</div>
            <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
              <a className="btn btn--sm" href="/r">문서로</a>
              <a className="btn btn--sm" href="/manual/관리자_설명서">설명서 · 관리자 6장</a>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
