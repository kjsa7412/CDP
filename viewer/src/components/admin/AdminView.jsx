// 관리 — **창 전체를 쓰는 세 번째 화면.**
//
// 그래프를 패널에서 화면으로 올린 것과 같은 이유다. 좌표 288개짜리 그림이
// 400px 패널에 안 들어가듯, 작업 레포 여섯 곳의 설치 상태와 동기화 이력
// 스무 줄은 380px 팝오버에 안 들어간다.
//
// **메뉴는 작업의 성격으로 가른다.** "설정" 이라는 한 덩어리가 아니다 —
// 매일 보는 것(현황·동기화)과 바꿀 때만 보는 것(레포)과 프로젝트 시작할 때
// 하는 것(작업 레포)과 문제 났을 때 보는 것(진단)은 서로 다른 일이다.
//
// **읽기 설정(글자 크기·본문 폭·테마)은 여기 없다.** `⋯` 메뉴에 있다 —
// 매일 만지는 것과 평생 한 번 하는 것을 같은 스크롤에 두지 않는다. 그리고
// 여기에 복제하지도 않는다: 같은 값을 고치는 자리가 둘이면 어느 쪽이 정본인지
// 사람이 모른다.

import { useEffect, useState } from 'react'
import { api } from '../../lib/api.js'
import Icon from '../Icon.jsx'
import Overview from './Overview.jsx'
import Repo from './Repo.jsx'
import Sync from './Sync.jsx'
import WorkRepos from './WorkRepos.jsx'
import WorkReposServer from './WorkReposServer.jsx'
import Diag from './Diag.jsx'
import { isServer } from '../../lib/api.js'

// 서버 모드에서는 **이 PC 를 만지는 화면이 없다**(MCP 설계서 §6.6.3).
// 지우는 것이 아니라 내지 않는 것이다 — 라우트도 404 이므로 화면만 숨겨서
// API 가 살아 있는 구멍이 생기지 않는다(§6.2).
const MENU = [
  { key: 'overview', icon: 'check', label: '현황', sub: '지금 쓸 수 있는 상태인가' },
  { key: 'repo', icon: 'managed', label: '지식 레포', sub: '어디를 보고 있나', local: true },
  // **서버 모드에는 없다.** 모드 B 에서 git 을 도는 것은 서버 자신이다 —
  // `save` 가 커밋하고 `--mirror` 가 push 한다(§4.5). 사람이 브라우저에서
  // pull/push 를 누를 자리가 아니고, 실제로 `POST /git/pull` · `/git/push` ·
  // `/sync` 는 모드 B 에 없다. 화면만 남으면 눌러서 404 를 보게 된다.
  { key: 'sync', icon: 'sync', label: '동기화', sub: '원격 · git 설정', local: true },
  // **서버에도 있다 — 다른 화면이다**(§6.7.3). 로컬은 이 PC 에 깔고,
  // 서버는 등록하고 꾸러미를 내주고 결과를 추적한다.
  { key: 'work', icon: 'plug', label: '작업 레포', sub: '에이전트 설치' },
  { key: 'diag', icon: 'info', label: '진단 · 정보', sub: '버전 · 경로 · 로그' },
]

export default function AdminView({
  tab,
  onTab,
  state,
  repo,
  patch,
  sync,
  onSync,
  onCheck,
  onClose,
  firstRun = false,
  onOpened,
  say,
}) {
  const [diag, setDiag] = useState(null)

  // 진단 값은 여러 화면이 같이 쓴다(스캔 시각 · 번들 · 데이터 폴더).
  // **한 번만 읽는다** — 화면을 옮길 때마다 다시 읽을 값이 아니다.
  useEffect(() => {
    api.diag().then(setDiag).catch(() => setDiag(null))
  }, [repo?.root, sync?.phase])

  // 서버 모드에는 첫 실행 분기가 없다 — 고를 레포 경로가 없다(§6.6.3).
  const menu = MENU.filter((m) => !m.local || !isServer)
  const cur = !isServer && firstRun ? 'repo' : menu.some((m) => m.key === tab) ? tab : 'overview'

  return (
    <div className="admin">
      {!firstRun && (
        <nav className="admin__menu" aria-label="관리">
          {menu.map((m) => (
            <button
              key={m.key}
              className="astep"
              aria-current={cur === m.key}
              onClick={() => onTab(m.key)}
            >
              <Icon name={m.icon} size={15} />
              <span className="astep__txt">
                <span className="astep__t">{m.label}</span>
                <span className="astep__s">{m.sub}</span>
              </span>
            </button>
          ))}
          <span className="topbar__spacer" style={{ flex: 1 }} />
          <button className="astep astep--back" onClick={onClose}>
            <Icon name="doc" size={15} />
            <span className="astep__txt">
              <span className="astep__t">문서로 돌아가기</span>
              <span className="astep__s kbd">esc</span>
            </span>
          </button>
        </nav>
      )}

      <div className="admin__body">
        <div className="admin__wrap">
          {cur === 'overview' && (
            <Overview
              repo={repo}
              sync={sync}
              diag={diag}
              onGo={onTab}
              onCheck={onCheck}
              onSync={onSync}
            />
          )}
          {cur === 'repo' && (
            <Repo
              state={state}
              repo={repo}
              diag={diag}
              firstRun={firstRun}
              onOpened={onOpened}
              say={say}
            />
          )}
          {cur === 'sync' && <Sync sync={sync} onSync={onSync} say={say} />}
          {cur === 'work' &&
            (isServer ? <WorkReposServer say={say} /> : <WorkRepos state={state} patch={patch} say={say} />)}
          {cur === 'diag' && <Diag diag={diag} repo={repo} say={say} />}
        </div>
      </div>
    </div>
  )
}
