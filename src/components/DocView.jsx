// 본문 — 설계서 §13-⓿ 의 본체.
//
// 화면의 주인은 본문이다. 유효성 블록은 읽기 전 판단 장치이고, 판단이 끝나면
// 시야에서 사라진다. 읽고 있는 본문은 디스크가 바뀌어도 자동으로 바꾸지
// 않는다 — 읽는 사람의 자리를 빼앗지 않는다(§13-⑥).

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { api } from '../lib/api.js'
import { renderMarkdown, enhance } from '../lib/markdown.js'
import { summaryText } from '../lib/format.js'
import ValidityBlock from './ValidityBlock.jsx'
import SectionRail from './SectionRail.jsx'

export default function DocView({
  docId,
  coordIndex,
  myCoords,
  reading,
  changedPaths,
  onOpen,
  onCoord,
  onScrollSave,
  savedRatio,
}) {
  const [doc, setDoc] = useState(null)
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
    api
      .doc(docId)
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
    enhance(bodyRef.current, {
      myCoords,
      coordIndex,
      coordLinks: reading.coordLinks !== false,
      sectionStates: doc.sectionStates || null,
    })
    // 본문 좌표 클릭 → 그 좌표로
    const onClick = (e) => {
      const t = e.target.closest('[data-coord]')
      if (t) {
        e.preventDefault()
        onCoord(t.dataset.coord)
        return
      }
      const a = e.target.closest('a')
      if (!a) return
      const href = a.getAttribute('href') || ''
      // 문서 간 상대 링크는 뷰어 내부 이동으로 가로챈다(§27.1)
      if (/^https?:/i.test(href)) {
        a.target = '_blank'
        a.rel = 'noreferrer noopener'
        return
      }
      if (href.startsWith('#')) return
      e.preventDefault()
      const id = href.replace(/^\.\//, '').replace(/\.md$/i, '').split('/').pop()
      onOpen(id)
    }
    bodyRef.current.addEventListener('click', onClick)
    return () => bodyRef.current?.removeEventListener('click', onClick)
  }, [rendered, doc?.id, myCoords.join(','), reading.coordLinks])

  // 읽기 위치 복원 — 조용히 중간에 떨어뜨리지 않고 알려준다(§27.6)
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (!el || !rendered) return
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
    const onScroll = () => {
      const max = el.scrollHeight - el.clientHeight
      const ratio = max > 0 ? el.scrollTop / max : 0
      setProgress(Math.round(ratio * 100))
      clearTimeout(t)
      t = setTimeout(() => onScrollSave(doc.id, ratio), 400)
    }
    el.addEventListener('scroll', onScroll, { passive: true })
    onScroll()
    return () => {
      clearTimeout(t)
      el.removeEventListener('scroll', onScroll)
    }
  }, [doc?.id])

  const copy = (label, text) => {
    navigator.clipboard?.writeText(text)
    setCopied(label)
    setTimeout(() => setCopied(''), 1400)
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
  // `supersedes` 는 판정이 아니라 참조다. 정정한/정정당한 문서는 왼쪽 아래에서
  // 다음 노드로 나온다 -- 무효 표시가 아니라 갈 수 있는 곳으로.
  return (
    <>
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
            <div className="vblock">
              <div className="vblock__tier vblock__time">
                <code style={{ fontSize: 11.5 }}>{doc.path}</code>
                <span className="topbar__spacer" />
                <span className="badge badge--quiet">지식 단위 아님</span>
              </div>
            </div>
          )}

          {!doc.hasFrontmatter && doc.layer === 'work' && (
            <div className="whywarn">⚠ 프론트매터가 없습니다 — 검색·좌표 매칭에 걸리지 않습니다</div>
          )}
          {doc.errors?.length > 0 && <div className="whywarn">⛔ {doc.errors.join(' / ')}</div>}
          {doc.id !== doc.fileId && doc.isUnit && (
            <div className="whywarn">⚠ id 와 파일명이 다릅니다 — 파일명은 {doc.fileId}</div>
          )}
          {doc.unknownFields?.length > 0 && (
            <div className="whywarn">이 앱이 모르는 프론트매터 필드: {doc.unknownFields.join(', ')}</div>
          )}

          <SectionRail doc={doc} scrollRef={scrollRef} toc={rendered.toc} />

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
            <Attachments items={doc.attachments} base={doc.path} onOpen={onOpen} />
          )}

          {/* 이어 읽기 · 백링크 · 좌표 이력은 **왼쪽 아래(뻗어나가기)로 나갔다.**
              본문 열에는 문서로서의 정보만 남는다 — 유효성 두 단 · 목차 ·
              본문 · 첨부 · 복사. */}

          {/* 복사 — 프로토콜 §12.3 의 주입 형식과 같다(§28.1) */}
          <section className="docsec">
            <div className="docsec__title">복사 {copied && <span className="count">· {copied} 복사됨</span>}</div>
            <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', fontSize: 12 }}>
              {doc.isUnit && <button style={{ color: 'var(--accent)' }} onClick={() => copy('요약', summaryText(doc))}>요약 (⇧C)</button>}
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('id', doc.id)}>id</button>
              {doc.touches.length > 0 && (
                <button style={{ color: 'var(--accent)' }} onClick={() => copy('좌표', doc.touches.join(', '))}>좌표</button>
              )}
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('경로', doc.path)}>상대 경로</button>
              <button style={{ color: 'var(--accent)' }} onClick={() => copy('원문', doc.raw)}>본문 원문</button>
              <button style={{ color: 'var(--accent)' }} onClick={() => window.print()}>인쇄</button>
            </div>
          </section>
        </div>
      </div>
    </>
  )
}


// 첨부 — 프로토콜 §8.5. 외부 원본은 제목·시점·요지를 먼저, 링크는 뒤에.
// "링크는 썩지만 제목·시점·요지는 썩지 않는다"는 순서를 화면 순서로 옮긴다.
function Attachments({ items, base, onOpen }) {
  return (
    <section className="docsec">
      <div className="docsec__title">
        첨부 <span className="count">{items.length}건</span>
      </div>
      {items.map((p) => (
        <Attachment key={p} path={p} base={base} onOpen={onOpen} />
      ))}
    </section>
  )
}

function Attachment({ path, base, onOpen }) {
  const [state, setState] = useState(null)
  const isMd = /\.(md|markdown|txt)$/i.test(path)
  const isImg = /\.(png|jpe?g|gif|webp|svg|avif)$/i.test(path)

  // **첨부는 그 문서가 있는 폴더 기준이다.**
  //
  // v0.2 는 `knowledge/` 하나뿐이라 그것을 붙였는데, CDP 는 `work/` 와 `docs/`
  // 두 층이다. 그대로 두면 `work/assets/…` 에 멀쩡히 있는 파일이 전부
  // "경로를 찾을 수 없음" 으로 나온다 -- 실측에서 그랬다.
  const dir = String(base || '').replace(/[^/]*$/, '')
  const rel = /^(work|docs|knowledge)\//.test(path) ? path : dir + path

  useEffect(() => {
    let dead = false
    fetch(api.fileUrl(rel), { method: 'HEAD' })
      .then((r) => !dead && setState(r.ok ? 'ok' : r.status === 403 ? 'outside' : 'missing'))
      .catch(() => !dead && setState('missing'))
    return () => {
      dead = true
    }
  }, [rel])

  return (
    <div className="attach">
      <span>{isImg ? '🖼' : '📄'}</span>
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
          <a href={api.fileUrl(rel)} target="_blank" rel="noreferrer">
            원문 ↗
          </a>
        </span>
      )}
      {state === 'ok' && isImg && (
        <img src={api.fileUrl(rel)} alt={path} style={{ width: '100%', marginTop: 8, borderRadius: 6 }} />
      )}
    </div>
  )
}
