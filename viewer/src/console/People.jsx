// 서버 › 사람 — 사용자 + 토큰 한 페이지(제품화 2 ⑥ · 콘솔 7 → 4). 둘은 같은 사람의 두 얼굴이다 — 권한은 사람에, 토큰은 신원만.
// [발급] 은 사람 줄 한 곳이고, 그 단추가 `?user=` 를 들고 오면 토큰 절이 발급 창을 연다. 옛 주소 `/console/users` · `/console/tokens` 는
// 셸이 여기로 바꿔 쓴다(`shell/routes.js` CONSOLE_ALIAS).

import Users from './Users.jsx'
import Tokens from './Tokens.jsx'

export default function People({ me, say, route }) {
  return <Users me={me} say={say} route={route} tokens={<Tokens me={me} say={say} route={route} />} />
}
