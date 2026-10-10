// 콘솔의 부품 — 페이지 머리 · 툴바 · 칩 · 모달 · 폼 필드 · 토큰 원문 · 확인.
//
// **새 디자인 언어를 만들지 않는다.** 색은 tokens.css 의 예산(정상은 회색 · 앰버 · 적 ·
// 초록 없음), 카드 · 표 · 버튼은 admin.css · app.css 의 것이다. 여기 있는 것은 상용 콘솔의
// 관례(머리 · 툴바 · 모달 · 칩)를 그 토큰으로 묶은 껍데기다(제품관리서비스 검토 §4.11).

import { Children, cloneElement, isValidElement, useEffect, useId, useState } from 'react'
import Icon from '../components/Icon.jsx'
import { copyText } from '../lib/clip.js'
export { Card, Row, Mono, Note, Btn, Cmd, when } from '../components/admin/ui.jsx'

export function PageHead({ title, sub, children }) {
  return (
    <div className="phead">
      <div>
        <h1 className="phead__t">{title}</h1>
        {sub && <p className="phead__s">{sub}</p>}
      </div>
      {children && <div className="phead__act">{children}</div>}
    </div>
  )
}

// 한 페이지 안의 둘째 머리 — 서버 › 사람의 「토큰」 처럼 옛 페이지가 절이 된 자리. id 가 `#토큰` 주소의 닻이다
export function SubHead({ id, title, sub, children }) {
  return (
    <div className="phead phead--sub" id={id}>
      <div>
        <h2 className="phead__t">{title}</h2>
        {sub && <p className="phead__s">{sub}</p>}
      </div>
      {children && <div className="phead__act">{children}</div>}
    </div>
  )
}

export function Toolbar({ children }) {
  return <div className="toolbar">{children}</div>
}

export function Search({ value, onChange, placeholder, style }) {
  return (
    <label className="tin" style={style}>
      <Icon name="search" size={13} />
      <input value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} spellCheck={false} />
    </label>
  )
}

// 칩 — 기본은 회색이다. admin 만 방패, 이상만 앰버 · 적.
export function Chip({ kind = null, icon = null, children, title }) {
  return (
    <span className={kind ? `chip chip--${kind}` : 'chip'} title={title}>
      {icon && <Icon name={icon} size={11} stroke={2} />}
      {children}
    </span>
  )
}

export function RoleChip({ role }) {
  if (role === 'admin') return <Chip kind="admin" icon="shield">admin</Chip>
  return <Chip>{role || 'viewer'}</Chip>
}

export function Seg({ value, onChange, options, disabled = false }) {
  return (
    <div className="seg" role="group">
      {options.map(([v, label, sub]) => (
        <button key={String(v)} type="button" aria-pressed={value === v} onClick={() => !disabled && onChange(v)} disabled={disabled}>
          {label}
          {sub && <small className="amuted"> {sub}</small>}
        </button>
      ))}
    </div>
  )
}

// 자식이 입력 하나(input · select · textarea)면 라벨을 `<label htmlFor>` 로 묶는다 — 보조기기가
// "내 토큰" 을 읽는다. 세그먼트 · 체크박스 여럿은 그대로 둔다(라벨 하나가 둘을 가리키면 첫 것만 눌린다).
export function Field({ label, hint, children }) {
  const auto = useId()
  const kids = Children.toArray(children)
  const one = kids.length === 1 && isValidElement(kids[0]) && ['input', 'select', 'textarea'].includes(kids[0].type) ? kids[0] : null
  const id = one ? one.props.id || auto : null
  return (
    <div className="field">
      {label &&
        (id ? (
          <label className="field__l" htmlFor={id}>
            {label}
          </label>
        ) : (
          <span className="field__l">{label}</span>
        ))}
      {one ? cloneElement(one, { id }) : children}
      {hint && <span className="field__h">{hint}</span>}
    </div>
  )
}

// 모달 — app.css 의 .overlay 위. 스크림 클릭 · Esc 로 닫힌다(닫을 수 없는 것은 onClose 를 안 준다).
export function Modal({ title, onClose, children, foot, wide = false, small = false }) {
  useEffect(() => {
    if (!onClose) return
    const onKey = (e) => e.key === 'Escape' && onClose()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose?.()}>
      <div className={`overlay__box ${wide ? 'overlay__box--wide' : 'overlay__box--form'}`} role="dialog" aria-label={typeof title === 'string' ? title : undefined} style={small ? { width: 'min(440px, 94vw)' } : undefined}>
        <div className="overlay__head">
          {title}
          <span className="topbar__spacer" />
          {onClose && (
            <button className="iconbtn" onClick={onClose} aria-label="닫기">
              <Icon name="close" size={15} />
            </button>
          )}
        </div>
        <div className="mform">{children}</div>
        {foot && <div className="mfoot">{foot}</div>}
      </div>
    </div>
  )
}

// 확인 — 위험한 동작(폐기 · 비활성) 앞에 한 번 묻는다. 되돌릴 수 있는 것은 묻지 않는다.
export function Confirm({ title, text, okLabel = '확인', danger = false, onOk, onClose, busy = false }) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      small
      foot={
        <>
          <span className="sp" />
          <button className="abtn" onClick={onClose} disabled={busy}>취소</button>
          <button className={danger ? 'abtn abtn--warn' : 'abtn abtn--accent'} onClick={onOk} disabled={busy}>
            {busy ? '…' : okLabel}
          </button>
        </>
      }
    >
      <p style={{ margin: 0, fontSize: 13, color: 'var(--text-2)', lineHeight: 1.65 }}>{text}</p>
    </Modal>
  )
}

// 값 하나를 받는 모달 — 메모 · 만료 연장 · 역할.
export function Prompt({ title, label, hint, initial = '', mono = false, okLabel = '저장', onOk, onClose, busy = false, children }) {
  const [v, setV] = useState(initial)
  return (
    <Modal
      title={title}
      onClose={onClose}
      small
      foot={
        <>
          <span className="sp" />
          <button className="abtn" onClick={onClose} disabled={busy}>취소</button>
          <button className="abtn abtn--accent" onClick={() => onOk(v)} disabled={busy}>
            {busy ? '…' : okLabel}
          </button>
        </>
      }
    >
      {children}
      <Field label={label} hint={hint}>
        <input className={mono ? 'mono' : undefined} value={v} onChange={(e) => setV(e.target.value)} autoFocus spellCheck={false} onKeyDown={(e) => e.key === 'Enter' && onOk(v)} />
      </Field>
    </Modal>
  )
}

// 토큰 원문 — **지금 한 번만** 보인다. 닫으면 다시 못 본다고 적는다.
export function TokenReveal({ data, onClose }) {
  const [copied, setCopied] = useState(false)
  return (
    <Modal
      title={`${data.user} 의 ${data.old ? '새 ' : ''}토큰 — 지금 한 번만 보입니다`}
      foot={
        <>
          <span className="sp" />
          <button className="abtn abtn--accent" onClick={onClose}>확인 — 전했다</button>
        </>
      }
    >
      <div className="reveal">{data.raw}</div>
      <div className="reveal__act">
        <button
          className="abtn abtn--accent"
          onClick={() => {
            copyText(data.raw).then((ok) => {
              if (!ok) return
              setCopied(true)
              setTimeout(() => setCopied(false), 1400)
            })
          }}
        >
          <Icon name={copied ? 'check' : 'copy'} size={13} /> {copied ? '복사됨' : '복사'}
        </button>
        <span className="amuted" style={{ fontSize: 12 }}>
          id <span className="amono">{data.id}</span> · 만료 {data.expires === 'never' ? '무기한' : data.expires}
          {data.note ? ` · 메모 ${data.note}` : ''}
          {data.old ? ` · 옛 토큰 ${data.old} 는 폐기됐다` : ''}
        </span>
      </div>
      <div className="anote anote--warn">
        <b>닫으면 다시 볼 수 없습니다.</b> 본인에게 직접 전합니다 — 메신저 · 메일 · 이슈에 평문으로 남기지 않습니다. 남겼으면 유출로 보고 폐기 후 재발급합니다.
      </div>
    </Modal>
  )
}

export function Empty({ children }) {
  return <div className="anote">{children}</div>
}

export const daysText = (t) => (t.expires === 'never' || t.daysLeft === null ? '무기한' : `${t.daysLeft}일`)

export { parseAudit } from '../lib/audit.js'

export const shortTime = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return iso
  const p = (n) => String(n).padStart(2, '0')
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
