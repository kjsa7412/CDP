// 작업실 — 이 레포 하나의 것(만든다 · 정리한다 · 세운다 · write 이상). **창 전체를 쓰는 화면이다**(그래프를 패널에서 화면으로 올린 것과 같은 이유).
//
// **메뉴는 왼쪽 메뉴다**(좌측 메뉴 셸 설계 v0.1 · 개편안 §7.2) — 안쪽 메뉴(`admin__menu`)를 지웠고 탭은 주소로만 고른다
// (`shell/nav.js` 의 tab). 묶음은 작업의 성격으로 갈린다 —
//
//   큐레이션     대기열(탭 — 대기열 · 이력) · 진단 — 매일 바꾼다(큐레이터)
//   세운다 · 만든다   현황 · 관리 문서(탭 — 목록 · 문서 추가 › 서식집) · 작업 레포 연결 — 가끔 바꾼다
//                (읽기면 보인다 · 쓰는 단추만 write · 지우기 · 서식집은 curate)
// 탭은 주소다(`shell/routes.js` 의 sub) — 메뉴 항목을 늘리지 않고 한 화면에 둘(화면 22 → 16).
//
// 로컬 전용 탭(지식 레포 경로 · 동기화 · 진단)은 v1.0 에 없앴다 — 화면은 늘 서버가 내고, 서버에는 고를 경로도 사람이 누를
// pull/push 도 없다(개편안 §5.6 · §6.6.3). 옛 주소(`manage/repo` · `sync` · `diag`)는 셸이 현황으로 바꿔 쓴다.
// 옛 「정보」(판 · 내 계정 · 단축키)는 왼쪽 메뉴 맨 아래 내 계정으로 갔다 — 매일 가는 곳이 아니다(L6).
// **읽기 설정(글자 크기 · 본문 폭)은 여기 없다** — 레포 얼굴의 ⋯ 메뉴에 있다. 같은 값을 고치는 자리를 둘 두지 않는다.

import { useScreen } from '../../lib/slots.js'
import { currentRepo } from '../../lib/api.js'
import { can } from '../../lib/roles.js'
import { repoBase } from '../../shell/nav.js'
import ScreenTabs from '../ScreenTabs.jsx'
import Queue from '../../features/curation/Queue.jsx'
import Log from '../../features/curation/Log.jsx'
import Drift from '../../features/curation/Drift.jsx'
import FormLibrary from '../../features/forms/FormLibrary.jsx'
import Overview from './Overview.jsx'
import LinkedWorkRepos from './LinkedWorkRepos.jsx'
import Docs from './Docs.jsx'
import Ingest from './Ingest.jsx'
import Sources from './Sources.jsx'
import VocabView from './VocabView.jsx'

export default function AdminView({
  tab,
  repo,
  say,
  me = null,
  // 관리에서 레포를 바꾼 뒤(관리 문서 지우기 · 기록으로 둠) — 상단 「검증 N」 · 문서 목록이 옛 값으로 남지 않게 레포를 다시 읽는다(F9)
  onChanged = null,
}) {
  const scr = useScreen()
  // 없는 탭은 셸이 현황으로 바꿔 썼다
  const cur = tab || 'overview'

  const base = repoBase(currentRepo())
  const sub = scr?.sub || null
  const wide = cur === 'curation' || cur === 'drift' || cur === 'ingest' || cur === 'vocab' || (cur === 'docs' && sub === 'forms')
  return (
    <div className="admin">
      <div className="admin__body">
        <div className={wide ? 'admin__wrap admin__wrap--wide' : 'admin__wrap'}>
          {cur === 'curation' && (
            <>
              <ScreenTabs
                label="큐레이션"
                cur={sub}
                items={[
                  { key: 'queue', label: '대기열', to: base + 'manage/curation', n: repo?.curation?.queue || 0 },
                  { key: 'log', label: '이력', to: base + 'manage/curation/log' },
                ]}
              />
              {sub === 'log' ? <Log logId={scr?.logId || null} /> : <Queue repo={repo} me={me} say={say} onChanged={onChanged} />}
            </>
          )}
          {cur === 'drift' && <Drift say={say} onChanged={onChanged} />}
          {cur === 'overview' && <Overview repo={repo} me={me} />}
          {cur === 'docs' && (
            <>
              {/* 서식집 탭은 큐레이터만 — 문서를 들이는 사람이 서식을 볼 때뿐이다. 아니면 탭 줄째 없다(셸이 주소도 바꿔 쓴다) */}
              {can(me, 'curate', currentRepo()) && (
                <ScreenTabs
                  label="관리 문서"
                  cur={sub}
                  items={[
                    { key: 'list', label: '목록', to: base + 'manage/docs' },
                    { key: 'forms', label: '문서 추가 › 서식집', to: base + 'manage/forms' },
                  ]}
                />
              )}
              {sub === 'forms' ? <FormLibrary form={scr?.form || null} tab={scr?.formTab || 'stamp'} /> : <Docs me={me} say={say} onChanged={onChanged} />}
            </>
          )}
          {cur === 'work' && <LinkedWorkRepos me={me} say={say} />}
          {cur === 'ingest' && <Ingest me={me} say={say} sub={sub || 'list'} jobId={scr?.jobId || null} />}
          {cur === 'sources' && <Sources me={me} say={say} />}
          {cur === 'vocab' && <VocabView say={say} />}
        </div>
      </div>
    </div>
  )
}
