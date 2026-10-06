// HTML 시각 자료 — 본문 자리를 꽉 채우는 틀 하나(HTML 시각 자료 검토 V3 · S3 · V6).
//
// 자료는 문서가 아니라 첨부다. 클로드 코드가 내놓는 한 장짜리 HTML(도면 · 표 · 인터랙션)을 **그대로** 보여 주되
// 이 화면과 갈라 둔다 — 틀의 `sandbox` 에 `allow-same-origin` 이 없고, 파일 API 도 같은 sandbox CSP 를 붙인다(두 겹).
// 그래서 틀 안의 스크립트는 돌지만 이 화면의 쿠키 · 저장소 · DOM 에 닿지 못한다.
//
// 높이는 자료에 맞추지 않는다 — 불투명 출처는 크기를 알려 주지 않는다. 자리를 통째로 주고 틀 안이 스스로 스크롤한다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'
import Icon from './Icon.jsx'

const schemeNow = () => (document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light')

export default function VisualFrame({ path, title }) {
  // 테마 — 파일 API 에 `theme=` 로 넘기면 서버가 루트에 `data-theme` 을 넣어 낸다(V6 · `core/assets.js` themeHtml).
  // 틀 요소의 `color-scheme` 으로 틀 안 `prefers-color-scheme` 을 바꾸는 길은 Chrome 154 에서 듣지 않았다(실측).
  // 불투명 출처라 화면이 안을 만질 수도 없다. 테마를 바꾸면 틀을 다시 읽는다
  const [scheme, setScheme] = useState(schemeNow)
  useEffect(() => {
    const ob = new MutationObserver(() => setScheme(schemeNow()))
    ob.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] })
    return () => ob.disconnect()
  }, [])

  // 없는 파일이면 틀에 서버의 JSON 오류가 뜬다 — 먼저 묻고 사람 말로
  const raw = api.fileUrl(path)
  const url = raw + '&theme=' + scheme
  const [state, setState] = useState(null)
  useEffect(() => {
    let dead = false
    setState(null)
    fetch(raw, { method: 'HEAD' })
      .then((r) => !dead && setState(r.ok ? 'ok' : r.status === 403 ? 'outside' : 'missing'))
      .catch(() => !dead && setState('missing'))
    return () => {
      dead = true
    }
  }, [raw])

  return (
    <div className="visframe">
      <div className="visframe__bar">
        <Icon name="eye" size={13} />
        <code className="visframe__path" title={path}>{path}</code>
        <span className="visframe__note" title="이 자료는 화면과 갈라진 틀 안에서 돈다 — 화면의 로그인 · 데이터에 닿지 못한다">격리된 보기</span>
        <span className="topbar__spacer" />
        <a href={url} target="_blank" rel="noreferrer noopener">
          새 탭에서 <Icon name="external" size={12} />
        </a>
        <a href={api.downloadUrl(path)} download>
          내려받기
        </a>
      </div>
      {state === 'missing' || state === 'outside' ? (
        <div className="empty">
          <p>자료를 찾을 수 없습니다</p>
          <p style={{ fontSize: 12 }}>
            {state === 'outside' ? '레포 밖을 가리킨다' : '경로'} · <code>{path}</code>
          </p>
        </div>
      ) : (
        <iframe
          className="visframe__f"
          src={url}
          title={title || path}
          sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox"
          referrerPolicy="no-referrer"
        />
      )}
    </div>
  )
}

// 「본문 | 자료」 탭 줄(V2). 자료가 없으면 그리지 않는다 — 탭이 하나뿐인 줄은 소음이다
export function VisualTabs({ visuals, active, onPick }) {
  const list = active && !visuals.some((v) => v.path === active) ? [...visuals, { path: active, title: active.split('/').pop().replace(/\.html?$/i, '') }] : visuals
  if (!list.length) return null
  return (
    <div className="vistabs" role="tablist" aria-label="본문과 시각 자료">
      <button className="vistab" role="tab" aria-selected={!active} onClick={() => onPick(null)}>
        <Icon name="doc" size={13} /> 본문
      </button>
      {list.map((v) => (
        <button key={v.path} className="vistab" role="tab" aria-selected={active === v.path} title={`${v.title} — ${v.path}`} onClick={() => onPick(v.path)}>
          <Icon name="eye" size={13} />
          <span className="vistab__t">{v.title}</span>
        </button>
      ))}
    </div>
  )
}
