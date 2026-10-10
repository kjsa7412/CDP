// 설명서 절 링크 — 화면의 「왜」 는 여기로 간다(안내 글 규칙 ① · ⑥). **장 번호를 손으로 쓰지 않는다**(규칙 ⑤) —
// 주제 → 주소 표는 서버가 설명서의 제목에서 뽑아 `/site/info` 의 `help` 로 낸다(`core/nextsteps.js` helpLinks).
// 표에 없는 주제(옛 서버)면 설명서 첫 화면으로.

import { Link } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'

export const helpHref = (help, topic) => (topic && help?.[topic]) || '/manual'

export default function HelpLink({ topic, children = '?', title = '설명서', className = 'helpq', help = null }) {
  const s = useSession()
  const to = helpHref(help || s?.info?.help, topic)
  return (
    <Link to={to} className={className} title={title} aria-label={typeof children === 'string' && children !== '?' ? children : title}>
      {children}
    </Link>
  )
}
