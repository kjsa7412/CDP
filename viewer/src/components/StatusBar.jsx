// 상태바 — 설계서 §23.3.
//
// §23.1 에서 새로고침 버튼을 없앴으므로 이 표시가 사용자가 화면을 믿을 수 있는
// 유일한 근거다. "감시 중"은 감시가 살아 있다는 증거이고, 끊기면 그때만
// 수동 스캔 버튼이 나타난다.
//
// **정상이면 조용하다.** 전에는 문서·좌표·검증·원격·감시·스캔시각까지 열 조각을
// 늘 말했다. 이 앱의 색 규칙은 "정상은 조용하고 이상만 소리를 낸다"인데
// (tokens.css) 상태바만 그 밖에 있었다. 지금 남는 것은 —
//
//   늘      문서·좌표 수(무채색) · 감시 · 마지막 스캔
//   있을 때  미등재 · 받을 것 · 보낼 것 · 훅 없음
//
// **검증 건수는 상단바로 올라갔다.** 아침에 제일 먼저 보는 값을 11.5px 글씨로
// 화면 맨 아래 두면 매일 찾아 읽어야 한다. 여기서 한 번 더 세지 않는다.
//
// 낡음을 추정하지 않는다 — fetch 없이 "낡았을 수 있습니다"를 띄우는 것은
// 근거 없는 경고이고, §13-① 의 나이/유효성 혼동과 같은 오류다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { clockTime } from '../lib/format.js'
import Icon from './Icon.jsx'

export default function StatusBar({ repo, scanning, onRescanned, onCheck = () => {}, onSay }) {
  const [busy, setBusy] = useState(false)
  const [git, setGit] = useState(null)
  const [gitBusy, setGitBusy] = useState(null)

  // git 상태 — **두 단계로 읽는다.**
  //
  // 실측에서 `fetch=1` 이 사내망 원격에 **19.5초** 걸렸다. 그것을 기다리면
  // 그 20초 동안 git 상태가 화면에 아예 없고, 사용자는 이 앱이 git 을 모르는
  // 줄로 안다. 그런데 **보낼 것(ahead)은 로컬만 알면 되는 값이다** --
  // 네트워크가 필요한 것은 받을 것(behind) 하나뿐이다.
  //
  //   1단계  fetch 없이 즉시     ahead · dirty · hooksPath 가 바로 뜬다
  //   2단계  백그라운드 fetch    behind 가 뒤늦게 채워진다
  //
  // **pull 은 자동으로 하지 않는다**(작업환경 §10). pull 은 작업 트리를 바꾸므로
  // 조용히 하면 사용자가 편집 중인 파일과 충돌한다. 차이를 보여주고 사람이 누른다.
  useEffect(() => {
    let dead = false
    const put = (g) => {
      if (!dead) setGit(g)
    }
    const local = () => api.git(false).then(put).catch(() => put(null))
    const remote = () => api.git(true).then(put).catch(() => {})

    local().then(() => remote())
    const t = setInterval(remote, 5 * 60 * 1000)
    const onFocus = () => local().then(() => remote())
    window.addEventListener('focus', onFocus)
    return () => {
      dead = true
      clearInterval(t)
      window.removeEventListener('focus', onFocus)
    }
  }, [repo?.root])

  if (!repo) return <div className="statusbar" />

  const say = (m) => (onSay ? onSay(m) : alert(m))

  const gitAct = async (kind) => {
    setGitBusy(kind)
    try {
      const r = kind === 'pull' ? await api.gitPull() : await api.gitPush()
      if (r.status) setGit({ ...r.status, unpushed: null })
      else setGit(await api.git(false))
      if (kind === 'pull' && r.ok && r.skipped !== 'up-to-date') onRescanned?.()
      // ff 가 안 되면 앱이 해결하지 않는다. 그대로 알리고 사람에게 넘긴다
      if (!r.ok) say(r.message || `${kind} 실패`)
    } catch (e) {
      say(e?.message || String(e))
    } finally {
      setGitBusy(null)
    }
  }

  const rescan = async () => {
    setBusy(true)
    try {
      await api.rescan()
      onRescanned?.()
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="statusbar">
      <span className="statusbar__quiet">
        문서 <b className="num">{repo.docs}</b>
        <span className="statusbar__sep">·</span>
        좌표 <b className="num">{repo.coords}</b>
      </span>

      {/* 미등재 — 어휘에 없는 좌표를 쓴 작업이 있다. 커밋에서 막힌다 */}
      {repo.unregistered > 0 && (
        <button className="is-warn" onClick={onCheck}>
          <Icon name="warn" size={12} /> 미등재 {repo.unregistered}
        </button>
      )}

      {/* git — 유일한 수신 채널이다(§1). 안 보내면 남에게는 없는 것과 같다.
          **여기는 할 일이 있을 때만 말한다** — `원격 동기` 를 늘 띄우던 자리는
          아무 행동도 없는 자리였다. */}
      {git?.repo && (
        <>
          {git.behind > 0 && (
            <button className="is-warn" onClick={() => gitAct('pull')} disabled={gitBusy}>
              {gitBusy === 'pull' ? '받는 중…' : `⬇ 원격 ${git.behind}건 받기`}
            </button>
          )}
          {git.ahead > 0 && (
            <button
              className={git.unpushed ? 'is-warn' : ''}
              onClick={() => gitAct('push')}
              disabled={gitBusy}
              title={git.unpushed?.message || undefined}
            >
              {gitBusy === 'push' ? '보내는 중…' : `⬆ 미전송 ${git.ahead}건 보내기`}
            </button>
          )}
          {/* 훅 미설치는 조용한 실패다 — 커밋은 통과하고 검사는 안 돈다 */}
          {!git.hooksPath && (
            <button className="is-warn" onClick={onCheck} title="git config core.hooksPath .githooks">
              <Icon name="warn" size={12} /> 훅 없음
            </button>
          )}
          {!git.upstream && (
            <span className="statusbar__quiet" title="보낼 곳이 없다 — git push -u 로 한 번 정한다">
              upstream 없음
            </span>
          )}
        </>
      )}

      <span className="topbar__spacer" style={{ flex: 1 }} />

      {/* 트레이에서 '탭 닫아도 계속 실행' 을 켰으면 화면에도 보여야 한다.
          안 보이면 켠 사실을 잊고 "왜 안 꺼지지" 가 된다(§5.2 ⑥) */}
      {repo.keepAlive && (
        <span className="statusbar__quiet" title="트레이 메뉴에서 껐다 켤 수 있습니다">
          탭 닫아도 계속 실행
          <span className="statusbar__sep">·</span>
        </span>
      )}

      {/* 감시 생존 여부는 추측이 아니라 표시로 확인돼야 한다 */}
      {scanning ? (
        <span>스캔 중…</span>
      ) : !repo.watchEnabled ? (
        <>
          <span className="statusbar__quiet">감시 꺼짐</span>
          <button onClick={rescan} disabled={busy}>
            {busy ? '스캔 중…' : '다시 스캔'}
          </button>
        </>
      ) : repo.watchAlive ? (
        <span className="statusbar__quiet">
          감시 중
          <span className="statusbar__sep">·</span>
          <span className="num">{clockTime(repo.scannedAt)}</span>
        </span>
      ) : (
        <>
          <span className="is-warn"><Icon name="warn" size={12} /> 감시 끊김</span>
          <button onClick={rescan} disabled={busy}>
            {busy ? '스캔 중…' : '다시 스캔'}
          </button>
        </>
      )}
    </div>
  )
}
