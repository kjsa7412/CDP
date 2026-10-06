// 큐레이션 › 서식집 — 옛 패키지 넷이 서식집의 묶음이 됐다(개편안 §8.1 · §7.3 S5).
//
//   왼쪽   서식 찾기 · 묶음 거름 · 서식 목록(이 레포가 쓰는 서식은 「씀」)
//   오른쪽 고른 서식 — 탭 셋. 주소다(`/manage/forms/<묶음>/<번호>?tab=stamp|guide|example`)
//            만들어지는 문서  서버가 **실제로 찍을** 빈 문서 그대로(`stamp` — 찍는 함수와 같은 함수 · 위험: 미리보기가 갈라지지 않게)
//            작성지침        큐레이터가 읽는 것 — 문서로 가지 않는다
//            예시            큐레이터가 읽는 것 — 문서로 가지 않는다 · 좌표로 잡히지 않는다
//
// 렌더는 본문과 같은 함수(`renderMarkdown` — 살균까지). 서식 표지 주석(`<!-- cdp:form … -->`)은 찍히는 그대로 보이되 표지로 칠한다.

import { useMemo, useState } from 'react'
import Icon from '../../components/Icon.jsx'
import { Card, Note } from '../../components/admin/ui.jsx'
import { api, currentRepo } from '../../lib/api.js'
import { useResource } from '../../lib/cache.js'
import { Link } from '../../lib/router.jsx'
import { renderMarkdown } from '../../lib/markdown.js'
import { formPath } from '../../lib/curation.js'
import { repoBase } from '../../shell/nav.js'
import { ServerAbsent, isAbsent } from '../curation/marks.jsx'

const TABS = [
  ['stamp', '만들어지는 문서'],
  ['guide', '작성지침'],
  ['example', '예시'],
]

export default function FormLibrary({ form = null, tab = 'stamp' }) {
  const rk = currentRepo()
  const home = repoBase(rk) + 'manage/forms'
  const list = useResource('api:' + rk + '/forms', api.forms, { ttl: 60_000 })
  const [q, setQ] = useState('')
  const [group, setGroup] = useState(null)

  const forms = list.data?.forms || []
  const groups = list.data?.groups || []
  const shown = useMemo(() => {
    const s = q.trim().toLowerCase()
    return forms.filter((f) => (!group || f.group === group) && (!s || [f.title, f.number, f.id, f.kind].some((x) => String(x || '').toLowerCase().includes(s))))
  }, [forms, group, q])
  const used = forms.filter((f) => f.used)
  const picked = form ? `${form.group}/${form.id}` : null

  if (isAbsent(list.error)) return <ServerAbsent what="서식집" />
  if (list.error) return <Note tone="bad">서식집을 읽지 못했습니다 — {list.error.message}</Note>
  if (!list.data) return <span className="amuted">읽는 중…</span>

  return (
    <div className="fsplit">
      <Card title="서식집" hint={`묶음 ${groups.length} · 서식 ${forms.length}`}>
        <label className="tin fl__q">
          <Icon name="search" size={13} />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="서식 찾기 — 테이블 · DE_431 · 대장" spellCheck={false} aria-label="서식 찾기" />
        </label>
        <div className="fd__scope fl__groups" role="group" aria-label="묶음">
          <button type="button" className="fd__chip" aria-pressed={!group} onClick={() => setGroup(null)}>
            전체 <span className="fd__chipn">{forms.length}</span>
          </button>
          {groups.map((g) => (
            <button key={g.name} type="button" className="fd__chip" aria-pressed={group === g.name} onClick={() => setGroup(group === g.name ? null : g.name)} title={g.title || g.name}>
              {g.name}
              {g.version ? <span className="fd__chipn">v{g.version}</span> : null}
            </button>
          ))}
        </div>
        <div className="fl__list">
          {shown.map((f) => {
            const p = formPath(f)
            return (
              <Link key={p} to={home + '/' + p.split('/').map(encodeURIComponent).join('/')} className="fl__row" aria-current={picked === p ? 'page' : undefined} title={f.id}>
                <span className="fl__t">{f.title || f.id}</span>
                {f.used && <span className="cchip" title="이 레포가 이 서식으로 세운 문서가 있다">씀</span>}
                <span className="fl__m">
                  {f.group} · {f.number || ''}
                  {f.kind ? ` · ${f.kind}` : ''}
                </span>
              </Link>
            )
          })}
          {shown.length === 0 && <div className="fd__empty">{q ? `“${q}” 에 걸리는 서식이 없습니다` : '없습니다'}</div>}
        </div>
        {used.length > 0 && (
          <p className="fl__used">
            이 레포가 쓰는 서식 — {used.map((f) => f.number || f.id).join(' · ')}
          </p>
        )}
      </Card>

      {picked ? (
        <FormView path={picked} home={home} tab={tab} meta={forms.find((f) => formPath(f) === picked) || null} />
      ) : (
        <Card title="서식 하나를 고른다">
          <Note>
            서식에서 문서를 세우면 서버가 <b>제목 · 서식 표지 · 머리말</b>만 찍는다 — 예시 · 작성지침 · 관리번호 표는 문서로 가지 않는다(서식집에
            남는다). 그래서 예시가 섹션으로 잡혀 문서가 지저분해지는 일이 구조적으로 없다. 큐레이터의 에이전트는 같은 것을 <code>forms()</code> 로
            읽는다.
          </Note>
        </Card>
      )}
    </div>
  )
}

function FormView({ path, home, tab, meta }) {
  const rk = currentRepo()
  const f = useResource('api:' + rk + '/forms/' + path, () => api.form(path), { ttl: 60_000 })
  const d = f.data
  const text = d ? (tab === 'guide' ? d.guide : tab === 'example' ? d.example : d.stamp) : null
  const html = useMemo(() => (text ? markStamp(renderMarkdown(text).html) : null), [text])
  const self = home + '/' + path.split('/').map(encodeURIComponent).join('/')
  const kind = d?.kind || meta?.kind
  const registry = meta?.registry || []

  return (
    <Card title={d?.title || meta?.title || path} hint={path}>
      {isAbsent(f.error) ? (
        <ServerAbsent what="서식 하나" />
      ) : f.error ? (
        <Note tone="bad">서식을 읽지 못했습니다 — {f.error.message}</Note>
      ) : (
        <>
          <div className="fv__head">
            <span className="cchip">{path}</span>
            {kind && <span className="cchip" title="문서 종류 — 서식 머리에서 온다(대상 · 대장 · 정의 · 사건 · 서술)">{kind}</span>}
            {registry.map((r) => (
              <span key={r.pattern} className="cchip cchip--new" title="이 서식의 등록부 행 — 좌표가 이 섹션으로 간다">
                {r.pattern} → {r.anchor}
              </span>
            ))}
            {meta?.used && <span className="cchip">이 레포에서 씀</span>}
          </div>
          <div className="mtabs fv__tabs" role="tablist">
            {TABS.map(([k, l]) => (
              <Link key={k} to={self + (k === 'stamp' ? '' : '?tab=' + k)} role="tab" aria-selected={tab === k} replace>
                {l}
              </Link>
            ))}
          </div>
          {!d ? (
            <span className="amuted">읽는 중…</span>
          ) : html ? (
            <div className={tab === 'stamp' ? 'fv__paper fv__paper--stamp' : 'fv__paper'}>
              {tab === 'stamp' && <div className="fv__lbl">새 관리 문서 — 서버가 찍는 그대로 · 여기부터 큐레이션 save 의 섹션이 붙는다</div>}
              {tab !== 'stamp' && <div className="fv__lbl">큐레이터가 읽는다 · 문서로 가지 않는다{tab === 'example' ? ' · 좌표로 잡히지 않는다' : ''}</div>}
              <article className="doc" dangerouslySetInnerHTML={{ __html: html }} />
            </div>
          ) : (
            <Note>{tab === 'guide' ? '작성지침이 없는 서식이다.' : tab === 'example' ? '예시가 없는 서식이다.' : '찍을 머리말이 없다.'}</Note>
          )}
        </>
      )}
    </Card>
  )
}

// 서식 표지 주석 — 마크다운이 글자로 낸 `<!-- cdp:form x -->` 문단을 표지로 칠한다(살균된 HTML 의 글자 그대로 · 새 태그는 code 하나)
function markStamp(html) {
  return String(html).replace(/<p>(&lt;!--\s*cdp:form\s[^<]*?--&gt;)<\/p>/g, '<p class="fv__mark"><code>$1</code> 서식 표지 — 이 문서를 세운 서식(화면이 칩으로 그린다)</p>')
}
