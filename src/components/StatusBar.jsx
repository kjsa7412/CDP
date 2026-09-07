// 상태바 — 설계서 §23.3.
//
// §23.1 에서 새로고침 버튼을 없앴으므로 이 표시가 사용자가 화면을 믿을 수 있는
// 유일한 근거다. "감시 중"은 감시가 살아 있다는 증거이고, 끊기면 그때만
// 수동 스캔 버튼이 나타난다.
//
// 낡음을 추정하지 않는다 — fetch 없이 "낡았을 수 있습니다"를 띄우는 것은
// 근거 없는 경고이고, §13-① 의 나이/유효성 혼동과 같은 오류다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import { clockTime } from '../lib/format.js'

export default function StatusBar({ repo, scanning, onRescanned, onCheck = () => {} }) {
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

  const gitAct = async (kind) => {
    setGitBusy(kind)
    try {
      const r = kind === 'pull' ? await api.gitPull() : await api.gitPush()
      if (r.status) setGit({ ...r.status, unpushed: null })
      else setGit(await api.git(false))
      if (kind === 'pull' && r.ok && r.skipped !== 'up-to-date') onRescanned?.()
      // ff 가 안 되면 앱이 해결하지 않는다. 그대로 알리고 사람에게 넘긴다
      if (!r.ok) alert(r.message || `${kind} 실패`)
    } catch (e) {
      alert(e?.message || String(e))
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

  const c = repo.checkCounts || { error: 0, warn: 0, info: 0 }

  return (
    <div className="statusbar">
      <span>
        문서 <b className="num">{repo.docs}</b>
      </span>
      <span className="statusbar__sep">·</span>
      <span>
        좌표 <b className="num">{repo.coords}</b>
      </span>

      {repo.unregistered > 0 && (
        <>
          <span className="statusbar__sep">·</span>
          <button className="is-warn" onClick={onCheck}>
            ⚠ 미등재 {repo.unregistered}
          </button>
        </>
      )}

      <span className="statusbar__sep">·</span>
      {c.error > 0 ? (
        <button className="is-error" onClick={onCheck}>
          ⛔ 검증 {c.error}
        </button>
      ) : c.warn > 0 ? (
        <button className="is-warn" onClick={onCheck}>
          ⚠ 검증 {c.warn}
        </button>
      ) : (
        // **통과했다는 것도 눌러서 확인할 수 있어야 한다.**
        //
        // "정상이면 표시가 사라진다"를 여기까지 밀면, 오류가 0일 때 검사
        // 결과로 가는 길이 통째로 없어진다 -- 검사가 돌았는지조차 알 수 없다.
        // 조용하게 두되 길은 남긴다.
        <button style={{ color: 'var(--text-3)' }} onClick={onCheck}>
          ✓ 검사
        </button>
      )}

      {/* `미결` 은 상태가 아니라 이관 대상이다 (정정_판정모델_v2 §2).
          `검증` 오류에 이미 포함되므로 여기 따로 세지 않는다. */}

      {/* git — 유일한 수신 채널이다(§1). 안 보내면 남에게는 없는 것과 같다 */}
      {git?.repo && (
        <>
          <span className="statusbar__sep">·</span>
          {git.behind > 0 ? (
            <button className="is-warn" onClick={() => gitAct('pull')} disabled={gitBusy}>
              {gitBusy === 'pull' ? '받는 중…' : `⬇ 원격 ${git.behind}건 받기`}
            </button>
          ) : null}
          {git.ahead > 0 ? (
            <button
              className={git.unpushed ? 'is-warn' : ''}
              onClick={() => gitAct('push')}
              disabled={gitBusy}
              title={git.unpushed?.message || undefined}
            >
              {gitBusy === 'push' ? '보내는 중…' : `⬆ 미전송 ${git.ahead}건 보내기`}
            </button>
          ) : null}
          {git.behind === 0 && git.ahead === 0 && (
            <span style={{ color: 'var(--text-3)' }} title={git.upstream || 'upstream 없음'}>
              {git.upstream ? '원격 동기' : 'upstream 없음'}
            </span>
          )}
          {/* 훅 미설치는 조용한 실패다 — 커밋은 통과하고 검사는 안 돈다 */}
          {!git.hooksPath && (
            <button className="is-warn" onClick={onCheck} title="git config core.hooksPath .githooks">
              ⚠ 훅 없음
            </button>
          )}
        </>
      )}

      <span className="topbar__spacer" style={{ flex: 1 }} />

      {/* 감시 생존 여부는 추측이 아니라 표시로 확인돼야 한다 */}
      {scanning ? (
        <span>스캔 중…</span>
      ) : !repo.watchEnabled ? (
        <>
          <span style={{ color: 'var(--text-3)' }}>감시 꺼짐</span>
          <button onClick={rescan} disabled={busy}>
            {busy ? '스캔 중…' : '다시 스캔'}
          </button>
        </>
      ) : repo.watchAlive ? (
        <span style={{ color: 'var(--text-3)' }}>감시 중</span>
      ) : (
        <>
          <span className="is-warn">⚠ 감시 끊김</span>
          <button onClick={rescan} disabled={busy}>
            {busy ? '스캔 중…' : '다시 스캔'}
          </button>
        </>
      )}

      {/* 트레이에서 '탭 닫아도 계속 실행' 을 켰으면 화면에도 보여야 한다.
          안 보이면 켠 사실을 잊고 "왜 안 꺼지지" 가 된다(§5.2 ⑥) */}
      {repo.keepAlive && (
        <>
          <span className="statusbar__sep">·</span>
          <span title="트레이 메뉴에서 껐다 켤 수 있습니다">탭 닫아도 계속 실행</span>
        </>
      )}

      <span className="statusbar__sep">·</span>
      <span style={{ color: 'var(--text-3)' }}>
        마지막 스캔 <span className="num">{clockTime(repo.scannedAt)}</span>
      </span>
    </div>
  )
}
