// 관리 화면의 작은 부품들 — 카드 · 줄 · 표시 · 복사.
//
// **새 디자인 언어를 만들지 않는다.** 색은 tokens.css 의 예산 그대로이고
// (정상은 무채색, 파랑은 고른 것, 노랑·빨강은 이상), 모양은 기존 클래스를
// 되도록 그대로 쓴다. 여기 있는 것은 그것을 카드 모양으로 묶는 껍데기뿐이다.

import { useState } from 'react'
import Icon from '../Icon.jsx'
import { copyText } from '../../lib/clip.js'
import { serverNow } from '../../lib/clock.js'
import { SHELLS } from '../../lib/install.js'

export function Card({ title, hint, children, actions, id }) {
  return (
    <section className="acard" id={id}>
      {(title || actions) && (
        <div className="acard__head">
          <span className="acard__title">{title}</span>
          {hint && <span className="acard__hint">{hint}</span>}
          <span className="topbar__spacer" />
          {actions}
        </div>
      )}
      <div className="acard__body">{children}</div>
    </section>
  )
}

// 한 줄 — 왼쪽에 이름, 오른쪽에 값. 값이 길면(경로·URL) 아래로 내린다.
export function Row({ label, children, stack = false, mark = null }) {
  return (
    <div className={stack ? 'arow arow--stack' : 'arow'}>
      <span className="arow__label">
        {mark && <Mark kind={mark} />}
        {label}
      </span>
      <span className="arow__value">{children}</span>
    </div>
  )
}

// 표시 세 가지 — **정상은 조용하다.** 정상에 초록을 주지 않는다(tokens.css).
const MARK = {
  ok: { icon: 'check', color: 'var(--text-3)' },
  warn: { icon: 'warn', color: 'var(--warn)' },
  bad: { icon: 'block', color: 'var(--danger)' },
  none: { icon: 'info', color: 'var(--text-3)' },
}

export function Mark({ kind = 'none', size = 13 }) {
  const m = MARK[kind] || MARK.none
  return <Icon name={m.icon} size={size} style={{ color: m.color, flex: 'none' }} />
}

export function Mono({ children, wrap = false }) {
  return <span className={wrap ? 'amono amono--wrap' : 'amono'}>{children}</span>
}

// 명령 한 줄 — **누르면 복사된다. 앱이 실행하지는 않는다.**
//
// `--global` 을 건드리는 것과 자격 증명 설정은 앱이 대신 하지 않는다는 선을
// 여기서 지킨다. 사람이 자기 터미널에서 실행한다.
export function Cmd({ children }) {
  const [done, setDone] = useState(false)
  const text = String(children)
  return (
    <button
      className="acmd"
      title="복사"
      onClick={() => {
        copyText(text).then((ok) => {
          if (!ok) return
          setDone(true)
          setTimeout(() => setDone(false), 1400)
        })
      }}
    >
      <code>{text}</code>
      <Icon name={done ? 'check' : 'copy'} size={13} />
    </button>
  )
}

// 셸 고르기 — 설치 한 줄의 터미널 셋(`lib/install.js`). 작업 레포 · 일괄 갱신 · 큐레이터 폴더가 같은 탭을 쓴다
export function ShellTabs({ shell, setShell }) {
  return (
    <div className="howto-tabs" role="tablist" aria-label="터미널">
      {SHELLS.map((s) => (
        <button key={s.key} role="tab" aria-selected={shell === s.key} className={shell === s.key ? 'on' : ''} onClick={() => setShell(s.key)}>
          {s.label}
        </button>
      ))}
    </div>
  )
}

export function Note({ children, tone = 'quiet' }) {
  return <div className={`anote anote--${tone}`}>{children}</div>
}

export function Btn({ children, onClick, disabled, kind = 'quiet', title }) {
  return (
    <button className={`abtn abtn--${kind}`} onClick={onClick} disabled={disabled} title={title}>
      {children}
    </button>
  )
}

// 시각 — **상대 + 절대를 같이 쓴다**(§17.3). "3주 전"만 있으면 언제인지 모르고
// 절대 시각만 있으면 감각이 없다.
// `now` 은 **서버 시각**이다 — 찍은 쪽이 서버라서(clock.js · 실서버 종합 시험 F4)
export function when(iso, { now = serverNow() } = {}) {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (Number.isNaN(t)) return null
  const s = Math.max(0, Math.floor((now - t) / 1000))
  const rel =
    s < 60 ? '방금' : s < 3600 ? `${Math.floor(s / 60)}분 전` : s < 86400 ? `${Math.floor(s / 3600)}시간 전` : `${Math.floor(s / 86400)}일 전`
  const d = new Date(iso)
  const p = (n) => String(n).padStart(2, '0')
  return `${rel} · ${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`
}
