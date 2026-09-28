// 지식 레포 — 어디를 보고 있나, 그 레포가 규약대로인가.
//
// **구조 검증 다섯 줄이 상시로 보인다.** 전에는 첫 실행 화면에만 있었고,
// 설정에서 경로를 바꿀 때는 `_vocab.md` 가 있나 한 줄이 전부였다. 그런데
// 규약과 어긋난 레포를 열어 놓고 지내는 일이 실제로 생긴다 — INDEX 가
// 어긋났거나 `bin/ctx` 가 없는 레포는 **열리기는 하고 답만 다르다.**
//
// 이 화면은 첫 실행(레포 미지정)에서도 쓴다. 같은 것을 두 군데 만들지 않는다.

import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import { navigate } from '../../lib/router.jsx'
import { clearAll } from '../../lib/cache.js'
import Icon from '../Icon.jsx'
import { Card, Row, Mark, Mono, PathText, Note, Btn, when } from './ui.jsx'

const MARK = { ok: 'ok', warn: 'warn', none: 'none', x: 'bad' }

export default function Repo({ state, repo, diag, firstRun = false, onOpened, say }) {
  const [path, setPath] = useState(state?.repoPath || '')
  const [probe, setProbe] = useState(null)
  const [here, setHere] = useState(null) // 지금 보고 있는 레포의 검증
  const [busy, setBusy] = useState(false)

  const dirty = !!path.trim() && path.trim() !== (state?.repoPath || '')

  // 지금 레포는 한 번만 본다 — 바뀔 때 다시 본다
  useEffect(() => {
    if (!repo?.root) return
    api.probe(repo.root).then(setHere).catch(() => setHere(null))
  }, [repo?.root])

  // 입력 중인 경로는 300ms 뒤에 본다
  useEffect(() => {
    if (!dirty) return setProbe(null)
    let dead = false
    const t = setTimeout(() => {
      api.probe(path.trim()).then((x) => !dead && setProbe(x)).catch(() => !dead && setProbe(null))
    }, 300)
    return () => {
      dead = true
      clearTimeout(t)
    }
  }, [path, dirty])

  const apply = async () => {
    if (!probe?.ok) return
    setBusy(true)
    try {
      await api.setRepo(path.trim())
      // 레포가 바뀌면 캐시·읽음 표시·좌표 인덱스가 전부 달라진다.
      // 부분 갱신으로 맞추려 들지 않는다 — 다시 읽는 쪽이 정확하다. 문서를 교체하지 않고 캐시를 비워 App 을 새로 세운다
      if (firstRun) onOpened?.()
      else {
        clearAll()
        navigate('/')
        window.dispatchEvent(new Event('cdp:remount'))
      }
    } catch (e) {
      say?.(e?.message || '열 수 없습니다')
      setBusy(false)
    }
  }

  const rows = (p) =>
    (p?.rows || []).map((r) => (
      <div className="aprobe" key={r.name}>
        <Mark kind={MARK[r.mark] || 'none'} />
        <code>{r.name}</code>
        <span className={r.mark === 'warn' || r.mark === 'x' ? 'awarn' : 'amuted'}>{r.note}</span>
      </div>
    ))

  // 번들이 조용히 낡는다 — 도구를 고치면 레포마다 새 bin/ctx.mjs 를 넣어야
  // 하고, 잊으면 **그 레포만 옛 답을 낸다.**
  const bundleStale = diag?.appBundle && diag?.repoBundle && diag.appBundle !== diag.repoBundle

  return (
    <>
      {firstRun && (
        <Note tone="accent">
          <b>먼저 지식 레포를 지정하세요.</b> 레포는 이미 규약대로 존재합니다 — 경로를 붙여넣으면
          맞는지 바로 확인합니다. <code>--repo</code> 인자로 넘기면 이 화면이 뜨지 않습니다.
        </Note>
      )}

      {!firstRun && (
        <Card
          title="지금 보는 레포"
          actions={
            <>
              <Btn onClick={() => api.open(repo.root).catch(() => say?.('열지 못했습니다'))}>
                <Icon name="folder" size={13} /> 폴더 열기
              </Btn>
              <Btn
                onClick={async () => {
                  setBusy(true)
                  try {
                    await api.rescan()
                    say?.('다시 읽었습니다')
                  } finally {
                    setBusy(false)
                  }
                }}
                disabled={busy}
              >
                다시 스캔
              </Btn>
            </>
          }
        >
          <Row label="경로" stack>
            <PathText>{repo?.root}</PathText>
          </Row>
          <Row label="담긴 것">
            문서 <b className="num">{repo?.docs ?? 0}</b> · 좌표 <b className="num">{repo?.coords ?? 0}</b>
          </Row>
          <Row label="마지막 스캔">
            <span className="amuted">
              {diag?.scannedAt ? when(diag.scannedAt) : '–'}
              {diag?.scanMs != null && ` · ${diag.scanMs}ms`}
              {' · '}
              {repo?.watchEnabled ? (repo?.watchAlive ? '감시 중' : '감시 끊김') : '감시 꺼짐'}
            </span>
          </Row>
        </Card>
      )}

      {!firstRun && (
        <Card title="구조 검증" hint="규약대로 있음 · 있지만 문제 있음 · 없음(선택 항목)">
          {here ? rows(here) : <span className="amuted">확인 중…</span>}
          <Note>
            문제가 있어도 열립니다 — 프로토콜 도입 초기에는 규약이 덜 갖춰져 있습니다.
            다만 <b>답이 달라집니다</b>: <code>_vocab.md</code> 가 없으면 좌표 트리가 없고,
            <code> INDEX.md</code> 가 어긋나면 집계가 맞지 않습니다.
          </Note>
        </Card>
      )}

      {!firstRun && (
        <Card title="레포가 든 도구" hint="bin/ctx — git 훅이 부르는 것">
          <Row label="레포 번들" mark={bundleStale ? 'warn' : null}>
            {diag?.repoBundle ? <Mono>{diag.repoBundle}</Mono> : <span className="amuted">번들 없음</span>}
          </Row>
          <Row label="앱 번들">
            {diag?.appBundle ? <Mono>{diag.appBundle}</Mono> : <span className="amuted">(원본 실행 — 번들 아님)</span>}
          </Row>
          {bundleStale && (
            <Note tone="warn">
              <b>레포의 번들이 앱과 다릅니다.</b> 도구를 고치면 레포마다 새 <code>bin/ctx.mjs</code> 를
              넣어야 하고, 잊으면 그 레포만 옛 답을 냅니다 — 그리고 그것은 "모르는 명령" 으로만 나타납니다.
            </Note>
          )}
        </Card>
      )}

      <Card title={firstRun ? '지식 레포 경로' : '다른 레포 열기'}>
        <input
          className="ain"
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && probe?.ok && apply()}
          placeholder={'C:' + String.fromCharCode(92) + 'work' + String.fromCharCode(92) + 'knowledge-repo'}
          spellCheck={false}
          autoFocus={firstRun}
          aria-label="지식 레포 경로"
        />

        {dirty && (
          <div className="aprobe__box">
            {!probe ? (
              <span className="amuted">확인 중…</span>
            ) : (
              <>
                {rows(probe)}
                <div className="arow">
                  <span className="topbar__spacer" />
                  <Btn kind="accent" onClick={apply} disabled={!probe.ok || busy}>
                    {busy ? '여는 중…' : '이 경로로 열기'}
                  </Btn>
                </div>
              </>
            )}
          </div>
        )}

        {!dirty && !firstRun && (
          <span className="amuted">경로를 붙여넣으면 규약에 맞는지 먼저 확인합니다.</span>
        )}
      </Card>

      {!firstRun && (
        <Card title="설정은 어디에 있나" hint="레포 안에는 아무것도 쓰지 않는다">
          <Row label="설정 파일" stack>
            <PathText>{diag?.stateFile}</PathText>
          </Row>
          <Note>
            읽음 표시 · 캐시 · 창 폭 · 작업 레포 목록까지 전부 여기 있습니다.
            <b> 레포에 커밋될 수 있는 파일을 이 앱은 하나도 만들지 않습니다.</b>
            {diag?.dataDir && !/AppData|\.local/i.test(diag.dataDir) && <> 지금은 포터블 모드입니다 — exe 옆 <code>data/</code> 에 씁니다.</>}
          </Note>
        </Card>
      )}
    </>
  )
}
