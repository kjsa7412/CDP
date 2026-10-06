// 재인증 — **셸에 하나**(개편안 §7.2). 전에는 콘솔 안에만 있어 레포 얼굴의 쓰기(큐레이션 판정 등)가 `E_REAUTH` 를 받으면
// 갈 곳이 없었다. 제품관리서비스 검토 D5.
//
// **끼어드는 모달이다.** 쓰기 동작이 `E_REAUTH` 를 받으면 뜨고, 통과하면 하던 동작을 이어 한다 — 미리 재인증할 필요가 없다.
// 부르는 쪽은 `withSudo(fn)` 하나. 자기 토큰 원문을 한 번 더 넣으면 15분 동안 다시 묻지 않는다(서버의 `cdp_su` 쿠키).

import { createContext, useCallback, useContext, useState } from 'react'
import { admin, ApiError } from '../lib/api.js'
import Icon from '../components/Icon.jsx'
import { Modal, Field } from '../console/ui.jsx'

const SudoCtx = createContext((fn) => fn())
export const useSudo = () => useContext(SudoCtx)
export const CANCELLED = '취소했습니다'

export function SudoProvider({ children }) {
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
              <button className="abtn" onClick={cancel} disabled={busy}>
                취소
              </button>
              <button className="abtn abtn--accent" onClick={confirm} disabled={busy || !tok.trim()}>
                {busy ? '확인 중…' : '확인하고 계속'}
              </button>
            </>
          }
        >
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>
            명부 · 레포를 바꾸는 동작입니다. <b>내 토큰</b>을 한 번 더 넣으면 <b>15분</b> 동안 다시 묻지 않습니다.
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
