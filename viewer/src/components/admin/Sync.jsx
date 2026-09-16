// 동기화 — **진행이 보이고, 한 일이 남는다.**
//
// 전에는 `⋯ > 문서 동기화` 를 누르면 토스트가 2.6초 떴다 사라지는 것이 전부였다.
// 사내망 fetch 실측이 19.5초인데 그 20초 동안 화면은 아무 말도 하지 않았고,
// 누른 뒤 다른 곳을 보고 돌아오면 됐는지 안 됐는지 알 방법이 없었다.
//
// 세 가지가 여기 있다 —
//   ① 지금 어느 단계인가   (서버가 알고 SSE 로 온다. 탭이 달라도 같은 것을 본다)
//   ② 직전에 무슨 일이 있었나  (최근 20건)
//   ③ git 이 어떻게 설정돼 있나 (읽기. 고치는 것은 훅 한 줄뿐)

import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mark, Mono, Cmd, Note, Btn, when, secs } from './ui.jsx'

const PHASE_LABEL = {
  fetching: '원격 확인 중…',
  pulling: '받는 중…',
  rescanning: '다시 읽는 중…',
}

export default function Sync({ sync, onSync, onRefreshSync, say }) {
  const [git, setGit] = useState(null)
  const [cfg, setCfg] = useState(null)
  const [busy, setBusy] = useState(null)
  const [elapsed, setElapsed] = useState(0)

  const running = sync && sync.phase && sync.phase !== 'idle'

  const readAll = () => {
    api.git(false).then(setGit).catch(() => setGit(null))
    api.gitConfig().then(setCfg).catch(() => setCfg({ error: true }))
  }
  useEffect(readAll, [])
  // 동기화가 끝나면 숫자가 달라진다. 끝난 순간 다시 읽는다.
  useEffect(() => {
    if (!running) readAll()
  }, [running])

  // 경과 초 — **없으면 멎은 줄로 읽는다.** 19.5초가 실측이다.
  useEffect(() => {
    if (!running || !sync?.startedAt) return setElapsed(0)
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - sync.startedAt) / 1000)), 250)
    return () => clearInterval(t)
  }, [running, sync?.startedAt])

  const push = async () => {
    setBusy('push')
    try {
      const r = await api.gitPush()
      if (!r.ok) say(r.message || '보내기 실패')
      else say(r.skipped === 'nothing-to-push' ? '보낼 것이 없습니다' : '보냈습니다')
      readAll()
    } catch (e) {
      say(e?.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const setHooks = async () => {
    setBusy('hooks')
    try {
      const r = await api.gitHooks()
      say(r.ok ? 'core.hooksPath = .githooks 로 설정했습니다' : r.message || '설정하지 못했습니다')
      readAll()
    } catch (e) {
      say(e?.message || String(e))
    } finally {
      setBusy(null)
    }
  }

  const last = sync?.last
  const log = sync?.log || []

  return (
    <>
      <Card
        title="원격과 맞추기"
        hint="fetch → (뒤처졌으면) ff pull → 다시 읽기"
        actions={
          <Btn kind="accent" onClick={onSync} disabled={!!running}>
            <Icon name="sync" size={13} /> {running ? '도는 중…' : '지금 받기'}
          </Btn>
        }
      >
        {running ? (
          <div className="aphase" role="status">
            <span className="aphase__dot" />
            <b>{PHASE_LABEL[sync.phase] || sync.phase}</b>
            <span className="amuted"> {elapsed}초</span>
            <span className="topbar__spacer" />
            <span className="amuted">사내망에서는 원격 확인에 20초쯤 걸립니다</span>
          </div>
        ) : last ? (
          <div className="aphase" data-bad={last.ok ? '0' : '1'}>
            <Mark kind={last.ok ? 'ok' : 'bad'} />
            <b>{last.line || (last.ok ? '완료' : '실패')}</b>
            <span className="amuted"> {when(last.at)} · {secs(last.ms)}</span>
          </div>
        ) : (
          <div className="aphase">
            <Mark kind="none" />
            <span className="amuted">이번 실행에서는 아직 동기화하지 않았습니다</span>
          </div>
        )}

        {/* ff 가 안 되면 **앱이 정리하지 않는다.** git 이 낸 문장을 그대로 낸다 */}
        {last && !last.ok && last.message && (
          <Note tone="bad">
            <pre className="apre">{last.message}</pre>
          </Note>
        )}

        {/* 여기도 같다 — **아직 안 읽은 것을 "아니다" 라고 말하지 않는다.** */}
        <Row label="브랜치">
          {!git ? (
            <span className="amuted">읽는 중…</span>
          ) : git.repo ? (
            <Mono>
              {git.branch || '(없음)'} {git.upstream ? `→ ${git.upstream}` : ''}
            </Mono>
          ) : (
            <span className="amuted">git 레포가 아닙니다</span>
          )}
        </Row>
        <Row label="받을 것" mark={git?.behind > 0 ? 'warn' : null}>
          <b className="num">{git?.behind ?? '–'}</b> 건
        </Row>
        <Row label="커밋 안 된 변경">
          <b className="num">{git?.dirty ?? '–'}</b> 건
        </Row>
      </Card>

      {/* **받는 것과 보내는 것을 같은 자리에 두지 않는다.**
          커밋은 되돌릴 수 있지만 push 는 남의 눈에 들어간다 — 누르는 자리가 달라야 한다. */}
      <Card
        title="보내지 않은 것"
        hint="사람이 누를 때만 나간다"
        actions={
          git?.ahead > 0 ? (
            <Btn onClick={push} disabled={busy === 'push'}>
              {busy === 'push' ? '보내는 중…' : `미전송 ${git.ahead}건 보내기`}
            </Btn>
          ) : null
        }
      >
        {git?.ahead > 0 ? (
          <Note tone={git.unpushed ? 'warn' : 'quiet'}>
            {git.unpushed?.message ? (
              <pre className="apre">{git.unpushed.message}</pre>
            ) : (
              <>보내지 않은 커밋 {git.ahead}건. 보내지 않으면 다른 사람에게는 이 작업이 없는 것과 같습니다.</>
            )}
          </Note>
        ) : (
          <Row label="미전송">
            <span className="amuted">없음</span>
          </Row>
        )}
      </Card>

      <Card title="git 설정" hint="읽기. 고치는 것은 훅 한 줄뿐이다">
        {/* **모르는 것과 없는 것은 다르다.**
            읽는 중일 때 `cfg?.remote` 는 undefined 라서, 그대로 두면 여섯 줄이
            전부 "없음 · 미설정" 으로 뜬다 — 멀쩡히 설정된 레포를 열었는데
            한순간 아무것도 안 돼 있는 것처럼 보인다. 실측에서 그렇게 떴다. */}
        {!cfg ? (
          <span className="amuted">읽는 중…</span>
        ) : cfg.error ? (
          <Note tone="bad">git 설정을 읽지 못했습니다.</Note>
        ) : cfg.repo === false ? (
          <Note tone="warn">이 폴더는 git 레포가 아닙니다. 받을 곳도 보낼 곳도 없습니다.</Note>
        ) : (
          <>
            <Row label="원격" mark={cfg?.remote ? null : 'warn'}>
              {cfg?.remote ? <Mono wrap>{cfg.remote} · {cfg.remoteUrl}</Mono> : <span className="amuted">remote 없음</span>}
            </Row>

            <Row label="upstream" mark={cfg?.upstream ? null : 'warn'}>
              {cfg?.upstream ? (
                <Mono>{cfg.upstream}</Mono>
              ) : (
                <Cmd>git push -u origin {cfg?.branch || 'main'}</Cmd>
              )}
            </Row>

            {/* 훅 미설정은 **조용한 실패다** — 커밋은 통과하고 검사는 안 돈다.
                그래서 여기만 버튼을 준다. 레포 로컬 설정 한 키뿐이다. */}
            <Row label="커밋 검사 훅" mark={cfg?.hooksPath ? null : 'warn'}>
              {cfg?.hooksPath ? (
                <Mono>core.hooksPath = {cfg.hooksPath}</Mono>
              ) : (
                <Btn kind="warn" onClick={setHooks} disabled={busy === 'hooks' || !cfg?.hooksDir}>
                  {busy === 'hooks' ? '설정 중…' : '.githooks 로 설정'}
                </Btn>
              )}
            </Row>
            {!cfg?.hooksPath && (
              <Note tone="warn">
                설정되지 않았습니다. <b>커밋은 통과하고 검사는 안 돕니다</b> — 조용한 실패입니다.
                {cfg?.hooksDir === false && <> 그런데 레포에 <code>.githooks/</code> 가 없습니다. 배포본을 부으면 들어옵니다.</>}
                <div className="anote__cmds">
                  <Cmd>git config core.hooksPath .githooks</Cmd>
                  <Cmd>git config --unset core.hooksPath</Cmd>
                </div>
              </Note>
            )}

            {/* **자격 증명은 앱이 다루지 않는다.** 값이 있는지만 말하고, 없으면
                명령을 복사해 준다 — 앱이 아이디·토큰을 들고 있으면 그것을 저장할
                자리가 하나 더 생기고, 그 자리가 가장 약한 곳이 된다. */}
            <Row label="자격 증명" mark={cfg?.credentialHelper ? null : 'warn'}>
              {cfg?.credentialHelper ? (
                <Mono>{cfg.credentialHelper}</Mono>
              ) : (
                <Cmd>git config --global credential.helper manager</Cmd>
              )}
            </Row>

            <Row label="커밋 이름" mark={cfg?.userName && cfg?.userEmail ? null : 'warn'}>
              {cfg?.userName || cfg?.userEmail ? (
                <Mono wrap>{cfg.userName || '(이름 없음)'} · {cfg.userEmail || '(메일 없음)'}</Mono>
              ) : (
                <Cmd>git config --global user.name "이름"</Cmd>
              )}
            </Row>

            <Row label="마지막 fetch">
              {cfg?.lastFetch ? <span className="amuted">{when(cfg.lastFetch)}</span> : <span className="amuted">한 번도 하지 않음</span>}
            </Row>

            <Note>
              <b>git 로그인은 여기서 하지 않습니다.</b> 인증은 git 이 OS 자격 증명 관리자로 처리합니다 —
              한 번 설정하고 아무 <code>git push</code> 를 하면 OS 창이 뜨고, 그 뒤로는 앱의 받기·보내기가
              그대로 됩니다.
            </Note>
          </>
        )}
      </Card>

      <Card title="최근 동기화" hint={`${log.length}건 · 20건까지 남습니다`}>
        {log.length === 0 ? (
          <span className="amuted">아직 기록이 없습니다.</span>
        ) : (
          <table className="atable">
            <thead>
              <tr>
                <th>시각</th>
                <th>결과</th>
                <th className="ar">받음</th>
                <th className="ar">걸린 시간</th>
                <th>비고</th>
              </tr>
            </thead>
            <tbody>
              {log.map((r, i) => (
                <tr key={r.at + i}>
                  <td className="amono">{when(r.at)}</td>
                  <td>
                    <Mark kind={r.ok ? 'ok' : 'bad'} /> {r.line || (r.ok ? '완료' : '실패')}
                  </td>
                  <td className="ar num">{r.pulled || ''}</td>
                  <td className="ar amuted">{secs(r.ms)}</td>
                  <td className="amuted">{r.ok ? '' : String(r.message || '').split('\n')[0]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        <Note>
          기록에는 <b>건수와 사유 문장까지만</b> 남깁니다. 문서 내용·검색어·커밋 메시지는 쓰지 않습니다.
        </Note>
      </Card>
    </>
  )
}
