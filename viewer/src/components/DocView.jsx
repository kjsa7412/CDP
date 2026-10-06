// 본문 — 설계서 §13-⓿ 의 본체.
//
// 화면의 주인은 본문이다. 유효성 블록은 읽기 전 판단 장치이고, 판단이 끝나면
// 시야에서 사라진다. 읽고 있는 본문은 디스크가 바뀌어도 자동으로 바꾸지
// 않는다 — 읽는 사람의 자리를 빼앗지 않는다(§13-⑥).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api, currentRepo } from '../lib/api.js'
import { load, peek } from '../lib/cache.js'
import { renderMarkdown, enhance, sectionSlug, bindImages } from '../lib/markdown.js'
import { kbd } from '../lib/keys.js'
import { repoPath } from '../../../core/repopath.js'
import { summaryText } from '../lib/format.js'
import ValidityBlock from './ValidityBlock.jsx'
import SectionRail from './SectionRail.jsx'
import Icon from './Icon.jsx'
import VisualFrame, { VisualTabs } from './VisualFrame.jsx'
import { copyText } from '../lib/clip.js'

export default function DocView({
  docId,
  at,
  coordIndex,
  myCoords,
  reading,
  changedPaths,
  onOpen,
  onCoord,
  onScrollSave,
  savedRatio,
  tocOpen = true,
  onToggleToc,
  visual = null,
  onVisual = () => {},
}) {
  // 본문은 캐시(화면 · 권한 검토 v0.1 R8) — 관리 · 그래프 · 콘솔에 갔다 돌아오면 「불러오는 중…」 없이 그 자리다
  const docKey = (id) => 'api:' + (currentRepo() || 'local') + '/docs/' + id
  const [doc, setDoc] = useState(() => (docId ? peek(docKey(docId)) || null : null))
  const [error, setError] = useState(null)
  const [reloadKey, setReloadKey] = useState(0)
  const [staleNote, setStaleNote] = useState(false)
  const [restored, setRestored] = useState(false)
  const [progress, setProgress] = useState(0)
  const [copied, setCopied] = useState('')
  const scrollRef = useRef(null)
  const bodyRef = useRef(null)

  // 문서 로드
  useEffect(() => {
    if (!docId) return
    let dead = false
    setError(null)
    const hit = peek(docKey(docId))
    if (hit) setDoc(hit)
    // 디스크가 바뀌어 다시 읽는 것(reloadKey)은 캐시를 건너뛴다
    load(docKey(docId), () => api.doc(docId), { ttl: 30_000, force: reloadKey > 0 })
      .then((d) => {
        if (dead) return
        setDoc(d)
        setStaleNote(false)
      })
      .catch((e) => !dead && setError(e.message))
    return () => {
      dead = true
    }
  }, [docId, reloadKey])

  // 읽는 중인 문서가 디스크에서 변경되면 — 내용은 그대로 두고 바 하나만 띄운다.
  // 자동으로 갈아치우면 읽던 자리를 잃는다(§23.2).
  useEffect(() => {
    if (doc && changedPaths?.has(doc.path)) setStaleNote(true)
  }, [changedPaths, doc?.path])

  const rendered = useMemo(() => (doc ? renderMarkdown(doc.text) : null), [doc?.id, doc?.text])

  // 렌더 후처리 — 하이라이팅·4섹션 마킹·좌표 링크(§19 · §27.8)
  useEffect(() => {
    if (!rendered || !bodyRef.current) return
    // 그림 먼저 — 하이라이팅(`enhance`)은 hljs 를 기다린다. 그림은 그 전에 부르기 시작한다
    bindImages(bodyRef.current, (src) => {
      const r = repoPath(doc.path, src)
      if (!r) return null
      return r.outside ? { outside: true, label: src } : { url: api.fileUrl(r.path), label: r.path }
    })
    enhance(bodyRef.current, {
      myCoords,
      coordIndex,
      coordLinks: reading.coordLinks !== false,
      sectionStates: doc.sectionStates || null,
    })
    // HTML 시각 자료 링크 — 새 탭이 아니라 이 문서의 자료 탭으로 간다(V5). 표시를 붙여 둔다
    for (const a of bodyRef.current.querySelectorAll('a[href]')) {
      const r = repoPath(doc.path, a.getAttribute('href') || '')
      if (r && !r.outside && VIS.test(r.path)) a.dataset.visual = r.path
    }
    // 본문 좌표 클릭 → 그 좌표로
    const onClick = (e) => {
      const t = e.target.closest('[data-coord]')
      if (t) {
        e.preventDefault()
        onCoord(t.dataset.coord)
        return
      }
      // 본문 그림 — 원본을 새 탭에(G4). 도식은 본문 폭에 줄어 보인다
      const img = e.target.closest('img[data-file]')
      if (img && !e.target.closest('a')) {
        window.open(img.dataset.file, '_blank', 'noopener')
        return
      }
      const a = e.target.closest('a')
      if (!a) return
      const href = a.getAttribute('href') || ''
      // 문서 간 상대 링크는 뷰어 내부 이동으로 가로챈다(§27.1)
      if (/^[a-z][a-z0-9+.-]*:/i.test(href)) {
        a.target = '_blank'
        a.rel = 'noreferrer noopener'
        return
      }
      if (href.startsWith('#')) return
      e.preventDefault()
      if (a.dataset.visual) {
        onVisual(a.dataset.visual)
        return
      }
      // `.md` 가 아닌 것(pdf · xlsx · 그림)은 문서가 아니라 파일이다 — 파일로 연다. 전에는 `x.pdf` 라는 문서를 찾다 끝났다
      const file = repoPath(doc.path, href)
      if (file && !file.outside && /\.[a-z0-9]{1,8}$/i.test(file.path) && !/\.(md|markdown)$/i.test(file.path)) {
        window.open(api.fileUrl(file.path), '_blank', 'noopener')
        return
      }
      // **href 는 인코딩돼 있다**(마크다운 렌더가 `../work/2026-0821-%EC%9D%91….md` 로 낸다) — 그대로 id 로 넘기면 한글 이름 문서가
      // 전부 「문서를 열 수 없습니다 · not-found」 였다(문서 이동 검토 실측). 풀어서 넘긴다
      let id = href.replace(/^\.\//, '').replace(/#.*$/, '').replace(/\.md$/i, '').split('/').pop()
      try {
        id = decodeURIComponent(id)
      } catch {}
      onOpen(id)
    }
    bodyRef.current.addEventListener('click', onClick)
    return () => bodyRef.current?.removeEventListener('click', onClick)
  }, [rendered, doc?.id, myCoords.join(','), reading.coordLinks, onVisual])

  // 섹션으로 이동 — 관리 문서에서 섹션(좌표) 줄을 눌러 왔을 때.
  //
  // 32개 섹션 중 어느 것인지 눈으로 찾게 만들면, 등록부로 자리를 특정해 놓은
  // 값이 거기서 사라진다. **조용히 옮기지는 않는다** — 어디로 갔는지 한 번
  // 보여 준다(§27.6 과 같은 이유).
  useEffect(() => {
    if (!at?.value || !rendered) return
    const pane = scrollRef.current
    const slug = sectionSlug(rendered.toc, at.value)
    const el = slug && document.getElementById(slug)
    if (!pane || !el) return
    // **컨테이너를 직접 옮긴다.** `scrollIntoView({behavior:'smooth'})` 를 통째로
    // 무시하는 환경이 있고(임베디드 웹뷰 — 실측), 그러면 조용히 아무 일도
    // 일어나지 않는다.
    //
    // 목차가 본문 위 sticky 레일이던 시절에는 그 높이만큼 띄워야 제목이 안
    // 가렸다. 지금은 옆으로 나갔으므로 숨 쉴 자리만 남긴다.
    const gap = 12
    const go = () => {
      const top = el.getBoundingClientRect().top - pane.getBoundingClientRect().top + pane.scrollTop - gap
      pane.scrollTop = Math.max(0, top)
    }
    go()
    // 화면 밖의 표는 어림 높이로 서 있다가 화면에 오면 그려진다(doc.css).
    // 옮긴 자리 근처의 표가 그려지며 제목이 밀릴 수 있어 한 번 더 맞춘다
    let raf = requestAnimationFrame(() => (raf = requestAnimationFrame(go)))
    el.classList.add('doc__at')
    const t = setTimeout(() => el.classList.remove('doc__at'), 2000)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
      el.classList.remove('doc__at')
    }
  }, [at?.value, at?.seq, rendered, doc?.id])

  // 읽기 위치 복원 — 조용히 중간에 떨어뜨리지 않고 알려준다(§27.6)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !rendered) return
    // 갈 섹션이 정해져 있으면 그쪽이 이긴다 — 읽던 위치로 되돌리면 방금 누른
    // 섹션이 아니라 어제 읽던 자리에 떨어진다
    if (at?.value) return
    if (savedRatio && savedRatio > 0.02) {
      requestAnimationFrame(() => {
        el.scrollTop = savedRatio * (el.scrollHeight - el.clientHeight)
        setRestored(true)
        setTimeout(() => setRestored(false), 3200)
      })
    } else {
      el.scrollTop = 0
      setRestored(false)
    }
  }, [rendered, doc?.id])

  // 진행률 + 위치 저장
  useEffect(() => {
    const el = scrollRef.current
    if (!el || !doc) return
    let t
    let raf = 0
    // 한 프레임에 한 번 — 스크롤 이벤트는 프레임보다 자주 온다
    const measure = () => {
      raf = 0
      const max = el.scrollHeight - el.clientHeight
      const ratio = max > 0 ? el.scrollTop / max : 0
      setProgress(Math.round(ratio * 100))
      clearTimeout(t)
      t = setTimeout(() => onScrollSave(doc.id, ratio), 400)
    }
    const onScroll = () => {
      if (!raf) raf = requestAnimationFrame(measure)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    measure()
    return () => {
      clearTimeout(t)
      cancelAnimationFrame(raf)
      el.removeEventListener('scroll', onScroll)
    }
  }, [doc?.id])

  const copy = (label, text) => {
    copyText(text).then((ok) => {
      if (!ok) return
      setCopied(label)
      setTimeout(() => setCopied(''), 1400)
    })
  }

  if (error) {
    return (
      <div className="empty">
        <p>문서를 열 수 없습니다</p>
        <p style={{ fontSize: 12 }}>{error}</p>
      </div>
    )
  }
  if (!doc || !rendered) {
    return (
      <div className="empty">
        <p style={{ opacity: 0.6 }}>불러오는 중…</p>
      </div>
    )
  }

  // **정정 고정 바를 세우지 않는다** (정정_판정모델_v2 §3).
  // `supersedes` 는 판정이 아니라 참조다. 정정한/정정당한 문서는 문서 머리의
  // 무채색 3단(ValidityBlock `RelTier`)과 왼쪽 뻗어나가기의 첫 갈래로 나온다 --
  // 무효 표시가 아니라 갈 수 있는 곳으로.
  // 시각 자료를 고르면 본문 자리를 틀이 차지한다. 본문은 **숨기기만** 한다 — 내리면 「본문」 으로 돌아왔을 때 읽던 자리를 잃는다
  const visuals = doc.visuals || []
  const shown = visual ? visuals.find((v) => v.path === visual) || { path: visual, title: null } : null
  const main = (
    <div className="docmain" hidden={!!shown}>
      <div className="docpane" ref={scrollRef}>
        {restored && (
          <div className="readmark">
            읽던 위치입니다 · {progress}%
            <button onClick={() => { scrollRef.current.scrollTop = 0; setRestored(false) }}>처음으로</button>
          </div>
        )}

        <div className="docwrap">
          {staleNote && (
            <div className="docchanged">
              이 문서가 디스크에서 변경되었습니다
              <button onClick={() => setReloadKey((k) => k + 1)}>다시 읽기</button>
            </div>
          )}

          {doc.isUnit ? (
            <ValidityBlock doc={doc} onOpen={onOpen} onRelation={onCoord} />
          ) : (
            /* 작업 기록이 아닌 문서 — 관리 문서 · 매뉴얼 · README 등.
               최신성 축이 없으므로 경로만 낸다.
               **"지식 단위 아님"이라고 쓰지 않는다** — 매뉴얼을 열었을 때
               그 배지가 뜨면 무엇이 잘못된 것처럼 읽힌다. 관리 문서에도
               마찬가지다. 없는 것을 없다고 말할 자리가 아니다. */
            <div className="vblock">
              <div className="vblock__tier vblock__time">
                <code style={{ fontSize: 11.5 }}>{doc.path}</code>
                <span className="topbar__spacer" />
                {doc.layer === 'managed' && <span className="badge badge--quiet">관리 문서</span>}
              </div>
            </div>
          )}

          {!doc.hasFrontmatter && doc.layer === 'work' && (
            <div className="whywarn"><Icon name="warn" size={13} /> 프론트매터가 없습니다 — 검색·좌표 매칭에 걸리지 않습니다</div>
          )}
          {doc.errors?.length > 0 && <div className="whywarn"><Icon name="block" size={13} /> {doc.errors.join(' / ')}</div>}
          {doc.id !== doc.fileId && doc.isUnit && (
            <div className="whywarn"><Icon name="warn" size={13} /> id 와 파일명이 다릅니다 — 파일명은 {doc.fileId}</div>
          )}
          {doc.isUnit && doc.source && (
            <div className="whyinfo">원문 출처 — {doc.source}</div>
          )}
          {doc.isUnit && doc.touchesEmpty && (
            <div className="whywarn"><Icon name="warn" size={13} /> 좌표가 없다 — 어느 좌표로도 이 기록에 닿지 않는다 · 사유: {doc.touchesEmpty}</div>
          )}
          {doc.unknownFields?.length > 0 && (
            <div className="whywarn">이 앱이 모르는 프론트매터 필드: {doc.unknownFields.join(', ')}</div>
          )}

          {/* 목차는 여기 없다 — **본문 옆 세로 레일로 나갔다.** 가로로 얹으면
              57개 섹션 중 14개만 적고 끊게 되고, 그 폭만큼 본문이 밀린다. */}

          {/* 본문이 얇으면 — 형식을 강요하지 않으므로 길이로 어림한다.
              오탐이 있으므로 단정하지 않는다 (수행 v1.0 §13) */}
          {doc.bodyThin && (
            <div className="whywarn">
              본문이 {doc.bodyChars}자입니다 — 6개월 뒤 이 결정을 뒤집으려는 사람에게
              '왜'가 남아 있는지 확인해 보세요
            </div>
          )}

          <article className="doc" ref={bodyRef} dangerouslySetInnerHTML={{ __html: rendered.html }} />

          {/* 첨부 — 프로토콜 §8.5 의 3계층 중 가장 긴 읽기가 여기서 일어난다 */}
          {doc.attachments.length > 0 && (
            <Attachments items={doc.attachments} base={doc.path} onOpen={onOpen} onVisual={onVisual} />
          )}

          {/* 이어 읽기 · 백링크 · 좌표 이력은 **왼쪽 뻗어나가기로 나갔다.**
              본문 열에는 문서로서의 정보만 남는다 — 유효성 두 단 · 목차 ·
              본문 · 첨부 · 복사. */}

          {/* 복사 — 프로토콜 §12.3 의 주입 형식과 같다(§28.1).
              종이에는 안 간다(`--copy`) — 누를 수 없는 버튼 줄이다. 첨부는
              간다: 그 문서가 무엇을 달고 있었는지는 종이에서도 사실이다. */}
          <section className="docsec docsec--copy">
            <div className="docsec__title">복사 {copied && <span className="count">· {copied} 복사됨</span>}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              {doc.isUnit && <button style={{ color: 'var(--accent)' }} onClick={() => copy('요약', summaryText(doc))}>요약 ({kbd('⇧C')})</button>}
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('id', doc.id)}>id</button>
              {doc.touches.length > 0 && (
                <button style={{ color: 'var(--accent)' }} onClick={() => copy('좌표', doc.touches.join(', '))}>좌표</button>
              )}
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('경로', doc.path)}>상대 경로</button>
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('원문', doc.raw)}>본문 원문</button>
              <button style={{ color: 'var(--accent)' }} onClick={() => window.print()}>인쇄</button>
              {/* 파일로 받는다 — 레포 안의 그 파일 그대로(프론트매터 포함). 묶음은 관리 › 현황의 「내려받기」 */}
              <a style={{ color: 'var(--accent)' }} href={api.downloadUrl(doc.path)} download>내려받기 (.md)</a>
            </div>
          </section>
        </div>
      </div>

      {/* 목차 — 본문 오른쪽. 스크롤되는 것은 본문이고 이것은 제자리에 선다 */}
      <SectionRail
        doc={doc}
        scrollRef={scrollRef}
        toc={rendered.toc}
        open={tocOpen}
        onToggle={onToggleToc}
      />
    </div>
  )
  if (!visuals.length && !shown) return main
  return (
    <div className="docvis">
      <VisualTabs visuals={visuals} active={visual} onPick={onVisual} />
      {main}
      {shown && <VisualFrame key={shown.path} path={shown.path} title={shown.title} />}
    </div>
  )
}

const VIS = /\.html?$/i


// 첨부 — 프로토콜 §8.5. 외부 원본은 제목·시점·요지를 먼저, 링크는 뒤에.
// "링크는 썩지만 제목·시점·요지는 썩지 않는다"는 순서를 화면 순서로 옮긴다.
function Attachments({ items, base, onOpen, onVisual }) {
  return (
    <section className="docsec">
      <div className="docsec__title">
        첨부 <span className="count">{items.length}건</span>
      </div>
      {items.map((p) => (
        <Attachment key={p} path={p} base={base} onOpen={onOpen} onVisual={onVisual} />
      ))}
    </section>
  )
}

function Attachment({ path, base, onOpen, onVisual }) {
  const [state, setState] = useState(null)
  const isMd = /\.(md|markdown|txt)$/i.test(path)
  const isVis = VIS.test(path)
  const isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path)

  // **첨부는 그 문서가 있는 폴더 기준이다.**
  //
  // v0.2 는 `knowledge/` 하나뿐이라 그것을 붙였는데, CDP 는 `work/` 와 `docs/`
  // 두 층이다. 그대로 두면 `work/assets/…` 에 멀쩡히 있는 파일이 전부
  // "경로를 찾을 수 없음" 으로 나온다 -- 실측에서 그랬다.
  //
  // 규칙은 본문 그림과 **한 함수**다(`core/repopath.js` · 그림 · 첨부 검토 v0.1 G1).
  const resolved = repoPath(base, path)
  const rel = resolved && !resolved.outside ? resolved.path : null

  useEffect(() => {
    let dead = false
    if (!rel) {
      setState(resolved?.outside ? 'outside' : 'missing')
      return
    }
    fetch(api.fileUrl(rel), { method: 'HEAD' })
      .then((r) => !dead && setState(r.ok ? 'ok' : r.status === 403 ? 'outside' : 'missing'))
      .catch(() => !dead && setState('missing'))
    return () => {
      dead = true
    }
  }, [rel])

  return (
    <div className="attach">
      <Icon name={isImg ? 'image' : 'file'} size={14} />
      <span className="attach__name">{path.split('/').pop()}</span>
      <code style={{ fontSize: 11, color: 'var(--text-3)' }}>{path}</code>
      {state === 'missing' && <span className="attach__missing">경로를 찾을 수 없음</span>}
      {state === 'outside' && <span className="attach__outside">레포 밖을 가리키는 링크</span>}
      {state === 'ok' && (
        <span className="attach__actions">
          {isMd && (
            <button style={{ color: 'var(--accent)' }} onClick={() => onOpen(rel)}>
              열기
            </button>
          )}
          {isVis && (
            <button style={{ color: 'var(--accent)' }} onClick={() => onVisual(rel)}>
              보기
            </button>
          )}
          <a href={api.fileUrl(rel)} target="_blank" rel="noreferrer">
            원문 <Icon name="external" size={12} />
          </a>
        </span>
      )}
      {state === 'ok' && isImg && (
        <img src={api.fileUrl(rel)} alt={path} style={{ width: '100%', marginTop: 8, borderRadius: 6 }} />
      )}
    </div>
  )
}
