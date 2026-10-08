// 상태바 — 설계서 §23.3.
//
// **정상이면 조용하다.** 전에는 문서·좌표·검증·원격·감시·스캔시각까지 열 조각을
// 늘 말했다. 이 앱의 색 규칙은 "정상은 조용하고 이상만 소리를 낸다"인데
// (tokens.css) 상태바만 그 밖에 있었다. 지금 남는 것은 —
//
//   늘      작업 기록 · 좌표 수(무채색)
//   있을 때  큐레이션 대기 · 미등재 · 미러 이상(밀림 · 갈림 · origin 앞섬 · 트리 더러움)
//
// **검증 건수는 상단바로 올라갔다.** 아침에 제일 먼저 보는 값을 11.5px 글씨로
// 화면 맨 아래 두면 매일 찾아 읽어야 한다. 여기서 한 번 더 세지 않는다.
//
// 감시 · 스캔 시각 · 받을 것 · 보낼 것 · 훅은 없다 — 서버가 유일한 작성자이고 save 뒤 스스로 다시 읽는다. 로컬 얼굴(PC 의
// git 체크아웃 · 파일 감시)을 v1.0 에 없애며 같이 지웠다 — 없는 상태를 그리지 않는다(불변조건 7).
//
// 낡음을 추정하지 않는다 — 근거 없이 "낡았을 수 있습니다"를 띄우는 것은
// 근거 없는 경고이고, §13-① 의 나이/유효성 혼동과 같은 오류다.

import { useEffect } from 'react'
import { api, currentRepo } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import { navigate } from '../lib/router.jsx'
import { useSession } from '../lib/session.jsx'
import { can } from '../lib/roles.js'
import { repoBase } from '../shell/nav.js'
import Icon from './Icon.jsx'

// 큐레이션 대기가 이만큼 오래되면 경고(개편안 §5.2 curation-stale · 14일)
const STALE_DAYS = 14

// 미러 한 줄 — 이상이 있을 때만(동시 기록 검토 v0.1 D12). 정상은 조용하다. 사유 말은 `core/mirror.REASON_TEXT` 와 같다.
const REASON = { 'non-ff': 'non-ff', auth: '인증 실패', net: '원격 불통', protected: '보호 브랜치', locked: 'ref 잠김', 'no-upstream': 'upstream 없음', unknown: '원인 미상' }
function mirrorLine(m) {
  if (!m) return null
  const parts = []
  if (m.mirror === 'lag') parts.push(`미러 밀림 ${m.ahead}${m.mirrorReason ? ' · ' + (REASON[m.mirrorReason] || m.mirrorReason) : ''}`)
  else if (m.mirror === 'diverged') parts.push(`origin 과 갈림 ${m.ahead}/${m.behind ?? '?'}`)
  else if (m.mirror === 'behind') parts.push(`origin 앞섬 ${m.behind}`)
  if (m.dirty > 0) parts.push(`트리 더러움 ${m.dirty}`)
  return parts.length ? parts.join(' · ') : null
}

export default function StatusBar({ repo, onCheck = () => {} }) {
  const me = useSession()?.me || null
  // 이 레포의 미러 한 값은 `/repos` 의 자기 행. **관리 현황과 같은 키**라 요청 하나를 나눠 받는다(화면 · 권한 검토 v0.1 R8)
  const { data: rows, refresh } = useResource('/repos', api.repos, { ttl: 15_000 })
  const mine = (rows || []).find((r) => r.name === currentRepo()) || null

  // 창 초점이 돌아오면 다시 읽는다 — 다만 방금 읽었으면 넘긴다. 에디터와 화면을 번갈아 보는 것이 이 도구의
  // 일상이라 초점은 몇 초에 한 번씩 온다. 그때마다 서버가 레포마다 git 을 보게 하지 않는다
  useEffect(() => {
    let lastAt = Date.now()
    const onFocus = () => {
      if (Date.now() - lastAt < 15_000) return
      lastAt = Date.now()
      refresh().catch(() => {})
    }
    window.addEventListener('focus', onFocus)
    return () => window.removeEventListener('focus', onFocus)
  }, [refresh])

  if (!repo) return <div className="statusbar" />
  const line = mirrorLine(mine)

  return (
    <div className="statusbar">
      <span className="statusbar__quiet">
        {/* 「문서」 는 작업 기록 수였다 — 관리 문서와 헷갈렸다(실서버 종합 시험 F18) */}
        작업 <b className="num">{repo.docs}</b>
        <span className="statusbar__sep">·</span>
        좌표 <b className="num">{repo.coords}</b>
      </span>

      {/* 큐레이션 대기 — 섹션 뒤에 아직 반영 안 된 기록이 있다(개편안 S9). 값이 없으면(옛 서버) 그리지 않는다. 큐레이터는
          대기열로, 나머지는 작업 기록의 「대기」 거름으로 — 갈 수 있는 곳으로만 보낸다(못 할 일을 띄우지 않는다) */}
      {typeof repo.curation?.queue === 'number' && repo.curation.queue > 0 && (
        <button
          className={'is-pending' + (repo.curation.oldestDays > STALE_DAYS ? ' is-old' : '')}
          onClick={() => {
            const r = currentRepo()
            navigate(repoBase(r) + (can(me, 'curate', r) ? 'manage/curation' : 'w?only=pending'))
          }}
          title={`큐레이션 대기 ${repo.curation.queue}건${repo.curation.pendingSections != null ? ` · 미반영 섹션 ${repo.curation.pendingSections}곳` : ''}`}
        >
          대기 <b className="num">{repo.curation.queue}</b>
          {typeof repo.curation.oldestDays === 'number' && <span>· 가장 오래된 {repo.curation.oldestDays}일</span>}
        </button>
      )}

      {/* 미등재 — 어휘에 없는 좌표를 쓴 작업 기록이 있다. 그런 좌표를 새로 쓰는 save 는 막힌다 */}
      {repo.unregistered > 0 && (
        <button className="is-warn" onClick={onCheck}>
          <Icon name="warn" size={12} /> 미등재 {repo.unregistered}
        </button>
      )}

      {/* 미러 · 갈림 · 더러움 한 줄 — 이상이 있을 때만. 단추는 서버 › 지식 레포(관리자)에 있다 */}
      {line && (
        <span className="is-warn" title={mine.note || undefined}>
          <Icon name="warn" size={12} /> {line}
        </span>
      )}
    </div>
  )
}
