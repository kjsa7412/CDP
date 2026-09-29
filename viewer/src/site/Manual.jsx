// 설명서 — 세 권 + 설치 절차. 제품관리서비스 검토 §4.5.
//
// **원천은 `manual/` 그대로다.** 서버는 원문(`/site/manual/<id>.md`)만 내고 렌더는 화면이
// 한다(D10) — 뷰어가 문서를 그리는 것과 같은 `renderMarkdown`. 제목 앵커는 GitHub 규칙과
// 같아 책 안의 목차 링크(`#6-사람-관리--명부와-토큰`)가 그 절로 간다.
//
// 링크 재작성 — `*.md` 는 `/manual/<이름>` 으로, `../` 처럼 소스 레포를 가리키는 것은 GitHub 의
// 그 파일로. 깨진 링크를 조용히 두지 않는다.

import { useEffect, useMemo, useRef, useState } from 'react'
import { site } from '../lib/api.js'
import { useResource } from '../lib/cache.js'
import { navigate, Link, useTitle } from '../lib/router.jsx'
import { renderMarkdown, enhance } from '../lib/markdown.js'
import Icon from '../components/Icon.jsx'

const safeDecode = (v) => {
  try {
    return decodeURIComponent(v)
  } catch {
    return v
  }
}

const GITHUB = 'https://github.com/kjsa7412/CDP/blob/main/'
// 책이 소스 레포 어디에 있나 — `../` 링크를 풀 때 기준이 된다
const BASE_OF = (id) => (id === '설치절차' ? 'ops/deploy/' : 'manual/')
const ICON_OF = { 사용자_설명서: 'book', 관리자_설명서: 'shield', 개발자_설명서: 'gear', 설치절차: 'server' }

export default function Manual({ info, id: asked, hash }) {
  const books = info?.manuals || []
  // 책을 안 고르면(`/manual`) **첫 권을 바로 그린다** — 주소는 뒤따라 고친다. 전에는 주소만 고치고 화면은 「설명서」
  // 한 줄에 멈춰 오류처럼 보였다(자식의 replace 가 부모 구독보다 먼저 돌았다 · router.jsx)
  const id = asked || books[0]?.id || null
  // 원문은 캐시(화면 · 권한 검토 v0.1 R8) — 책을 오가도 「읽는 중…」 은 처음 한 번뿐이다. 판이 바뀌면 문서 교체가 오므로 오래 둬도 된다
  const res = useResource(id ? '/site/manual/' + id : null, () => site.manual(id).then(String), { enabled: !!id, ttl: 5 * 60_000 })
  const text = res.data ?? null
  const err = res.error?.message || null
  const [cur, setCur] = useState(null)
  const bodyRef = useRef(null)

  useEffect(() => {
    if (!asked && id) navigate('/manual/' + encodeURIComponent(id) + (hash || ''), { replace: true })
  }, [asked, id, hash])

  const rendered = useMemo(() => (text != null ? renderMarkdown(text) : null), [text])

  // 렌더 뒤 — 코드 복사 · 링크 재작성 · 앵커 이동
  useEffect(() => {
    const root = bodyRef.current
    if (!root || !rendered) return
    enhance(root, { coordLinks: false })
    for (const a of root.querySelectorAll('a[href]')) {
      const href = a.getAttribute('href') || ''
      if (href.startsWith('#')) continue
      const m = /^([^/#?:]+)\.md(#.*)?$/.exec(href)
      if (m) {
        // 같은 폴더의 다른 책 — 설명서 페이지 안에서 옮긴다
        // 렌더러가 href 를 이미 퍼센트 인코딩했다 — 풀고 다시 넣지 않으면 `%25EC…` 가 된다
        a.setAttribute('href', '/manual/' + encodeURIComponent(safeDecode(m[1])) + (m[2] || ''))
        a.dataset.route = '1'
        continue
      }
      if (/^https?:\/\//.test(href)) {
        a.target = '_blank'
        a.rel = 'noopener'
        continue
      }
      // 소스 레포 안의 파일 — GitHub 의 그 자리로
      try {
        a.setAttribute('href', new URL(href, GITHUB + BASE_OF(id)).href)
        a.target = '_blank'
        a.rel = 'noopener'
        a.title = '소스 레포(GitHub)의 파일'
      } catch {}
    }
    if (hash) {
      let key = hash.slice(1)
      try {
        key = decodeURIComponent(key)
      } catch {}
      document.getElementById(key)?.scrollIntoView({ block: 'start' })
    } else {
      window.scrollTo(0, 0)
    }
  }, [rendered, id, hash])

  // 책 안의 링크 — 라우터로. 앵커는 브라우저에 맡긴다(문서가 스크롤되는 면이라 그대로 돈다)
  const onClick = (e) => {
    const a = e.target.closest('a[data-route]')
    if (!a || e.metaKey || e.ctrlKey || e.shiftKey) return
    e.preventDefault()
    navigate(a.getAttribute('href'))
  }

  // 현재 절 — 스크롤 위치의 마지막 제목
  useEffect(() => {
    if (!rendered) return
    const onScroll = () => {
      let last = null
      for (const t of rendered.toc) {
        const el = document.getElementById(t.slug)
        if (!el) continue
        if (el.getBoundingClientRect().top <= 96) last = t.slug
        else break
      }
      setCur(last)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [rendered])

  const book = books.find((b) => b.id === id)
  useTitle(book ? `${book.title.replace(/^CDP\s*/, '')} · CDP` : '설명서 · CDP')
  return (
    <div className="man">
      <nav className="man__nav" aria-label="설명서">
        <div className="man__cap">설명서</div>
        {books.map((b) => (
          <Link key={b.id} to={'/manual/' + encodeURIComponent(b.id)} className="man__book" aria-current={b.id === id ? 'page' : undefined}>
            <Icon name={ICON_OF[b.id] || 'book'} size={14} />
            {b.title.replace(/^CDP\s*/, '')}
            <small>{b.id === '설치절차' ? 'deploy' : info?.version ? 'v' + info.version : ''}</small>
          </Link>
        ))}
        {info && !books.length && <div className="anote anote--warn">이 서버에 설명서가 없습니다.</div>}
        {rendered && rendered.toc.length > 0 && (
          <div className="man__toc">
            {rendered.toc.map((t) => (
              <a key={t.slug} href={'#' + t.slug} className={t.level === 3 ? 'is-h3' : undefined} aria-current={cur === t.slug ? 'true' : undefined} title={t.text}>
                {t.text}
              </a>
            ))}
          </div>
        )}
      </nav>
      <div className="man__body">
        <div className="man__crumb">
          설명서{book ? ` › ${book.title}` : ''}
        </div>
        {err && <div className="anote anote--bad">설명서를 읽지 못했습니다 — {err}</div>}
        {!err && text == null && id && <div className="amuted">읽는 중…</div>}
        {rendered && <article className="doc" ref={bodyRef} onClick={onClick} dangerouslySetInnerHTML={{ __html: rendered.html }} />}
      </div>
    </div>
  )
}
