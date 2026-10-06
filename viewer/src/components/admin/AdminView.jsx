// 레포 관리 — 이 레포 하나의 것. **창 전체를 쓰는 화면이다**(그래프를 패널에서 화면으로 올린 것과 같은 이유).
//
// **메뉴는 왼쪽 메뉴다**(좌측 메뉴 셸 설계 v0.1 · 개편안 §7.2) — 안쪽 메뉴(`admin__menu`)를 지웠고 탭은 주소로만 고른다
// (`shell/nav.js` 의 tab). 묶음은 작업의 성격으로 갈린다 —
//
//   큐레이션     대기열 · 이력 · 서식집 — 매일 바꾼다(큐레이터)
//   레포 관리    현황 · 관리 문서 · 연결된 작업 레포 — 보고 · 가끔 바꾼다(읽기면 보인다 · 쓰는 단추만 write)
//   로컬만       지식 레포 · 동기화 · 진단 — 이 PC 를 만지는 것(서버에는 고를 경로도 사람이 누를 pull/push 도 없다 · §6.6.3)
//
// 옛 「정보」(판 · 내 계정 · 단축키)는 왼쪽 메뉴 맨 아래 내 계정으로 갔다 — 매일 가는 곳이 아니다(L6).
// **읽기 설정(글자 크기 · 본문 폭)은 여기 없다** — 레포 얼굴의 ⋯ 메뉴에 있다. 같은 값을 고치는 자리를 둘 두지 않는다.

import { useEffect, useState } from 'react'
import { api, isServer } from '../../lib/api.js'
import { useScreen } from '../../lib/slots.js'
import Queue from '../../features/curation/Queue.jsx'
import Log from '../../features/curation/Log.jsx'
import FormLibrary from '../../features/forms/FormLibrary.jsx'
import Overview from './Overview.jsx'
import Repo from './Repo.jsx'
import Sync from './Sync.jsx'
import WorkRepos from './WorkRepos.jsx'
import WorkReposServer from './WorkReposServer.jsx'
import Diag from './Diag.jsx'
import Docs from './Docs.jsx'

export default function AdminView({
  tab,
  state,
  repo,
  patch,
  sync,
  onSync,
  onCheck,
  firstRun = false,
  onOpened,
  say,
  me = null,
  // 관리에서 레포를 바꾼 뒤(관리 문서 지우기) — 상단 「검증 N」 · 문서 목록이 옛 값으로 남지 않게 레포를 다시 읽는다(F9)
  onChanged = null,
}) {
  const server = isServer()
  const scr = useScreen()
  const [diag, setDiag] = useState(null)

  // 진단 값은 여러 화면이 같이 쓴다(스캔 시각 · 번들 · 데이터 폴더).
  // **한 번만 읽는다** — 화면을 옮길 때마다 다시 읽을 값이 아니다. **로컬만** — 서버에는 그 라우트가 없다.
  useEffect(() => {
    if (server) return
    api.diag().then(setDiag).catch(() => setDiag(null))
  }, [server, repo?.root, sync?.phase])

  // 서버 모드에는 첫 실행 분기가 없다 — 고를 레포 경로가 없다(§6.6.3). 없는 탭은 셸이 현황으로 바꿔 썼다
  const cur = !server && firstRun ? 'repo' : tab || 'overview'

  return (
    <div className="admin">
      <div className="admin__body">
        <div className={cur === 'curation' || cur === 'forms' ? 'admin__wrap admin__wrap--wide' : 'admin__wrap'}>
          {cur === 'curation' && server && <Queue repo={repo} say={say} onChanged={onChanged} />}
          {cur === 'curation-log' && server && <Log logId={scr?.logId || null} />}
          {cur === 'forms' && server && <FormLibrary form={scr?.form || null} tab={scr?.formTab || 'stamp'} />}
          {cur === 'overview' && <Overview repo={repo} sync={sync} diag={diag} me={me} onCheck={onCheck} onSync={onSync} />}
          {cur === 'repo' && !server && <Repo state={state} repo={repo} diag={diag} firstRun={firstRun} onOpened={onOpened} say={say} />}
          {cur === 'docs' && <Docs me={me} say={say} onChanged={onChanged} />}
          {cur === 'sync' && !server && <Sync sync={sync} onSync={onSync} say={say} />}
          {cur === 'work' && (server ? <WorkReposServer say={say} /> : <WorkRepos state={state} patch={patch} say={say} />)}
          {cur === 'diag' && !server && <Diag diag={diag} repo={repo} say={say} />}
        </div>
      </div>
    </div>
  )
}
