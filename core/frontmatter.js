// 프론트매터 + 층 판정.
//
// 프로토콜 §8.1 — "프론트매터는 기계가 읽고, 본문은 사람과 AI가 읽는다".
// 그래서 이 모듈은 프론트매터만 정규화하고 본문은 손대지 않는다. 자르지도,
// 요약하지도, 필드로 추출하지도 않는다.
//
// **본문 형식을 강요하지 않는다** (수행 v1.0 §13). v0.2 는 프로토콜 §8.4 의
// 고정 4섹션을 파싱해 목차 레일을 미리 알았는데, 그 강제를 폐기했으므로
// 레일은 **실제 제목**으로 만든다. 형식이 없으니 "규약을 지켰는가"도 없다.

import yaml from 'js-yaml'
import { parseManagedSections } from './managed.js'

const FM = /^﻿?---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/

// 두 층 — 수행 v1.0 §2.
//   work/    작업 기록.  append-only.  여러 좌표가 함께 있다
//   docs/    관리 문서.  섹션이 1급 단위이고 팀이 하나로 관리한다
//   그 밖     문서가 아니다 (README · CLAUDE.md · _vocab.md · 첨부)
//
// knowledge/ 는 v0.2 배치다. 읽을 수 있게 남겨둔다 — 기존 레포를 열었을 때
// 아무것도 안 보이는 것보다 낫다.
export function layerOf(p) {
  if (/^work\/(?!assets\/)[^/]+\.md$/i.test(p)) return 'work'
  if (/^knowledge\/[^/]+\.md$/i.test(p)) return 'work'
  if (/^docs\/.+\.md$/i.test(p)) return 'managed'
  return null
}

// `date` 는 날짜만이거나 **시각까지**다.
//
//   2026-08-19            날짜만 — 하루 안의 순서를 모른다
//   2026-08-19 14:30      시각까지 — 순서가 결판난다
//
// 시각을 붙이면 **같은 날 사각지대가 닫힌다.** 하루에 같은 좌표를 두 번
// 건드려도 어느 것이 나중인지 알 수 있으므로 파생 누락이 오류로 잡힌다
// (validity.later 참고). `id` 와 파일명은 그대로 날짜 단위다 — 하루에 한 사람이
// 같은 slug 를 두 번 쓸 일은 없고, 파일명이 길어지면 읽기 어렵다.
//
// 정렬은 문자열 비교로 한다. 자리수가 고정이라 사전순 = 시간순이고,
// `2026-08-19` < `2026-08-19 14:30` 도 자연히 성립한다.
function normDate(v) {
  if (v == null) return null
  // js-yaml 은 인용 없는 2026-08-19 를 Date 객체로 만든다. 문자열로 되돌린다.
  //
  // **UTC 로 읽고 UTC 로 되돌린다.** 시각이 붙은 값도 js-yaml 은 타임존 없는
  // 것을 UTC 로 보므로, 같은 규칙으로 되돌리면 왕복이 어긋나지 않는다.
  // 여기서 지역 시간으로 바꾸면 아침에 쓴 기록이 전날로 밀린다.
  if (v instanceof Date) {
    const iso = v.toISOString()
    return iso.endsWith('T00:00:00.000Z') ? iso.slice(0, 10) : iso.slice(0, 16).replace('T', ' ')
  }
  return String(v).trim()
}

// `확정` 은 값이 아니라 기본값이다 -- 읽는 경계에서 지운다.
//
// 지식공유문서는 **작업의 완료에서 발생하는 문서**다(정정_판정모델_v2 §2).
// 그러니 완료가 기본이고, 기본을 적어 봐야 30건이 똑같은 말을 한다.
// **뜻이 남은 값은 하나도 없다.** `진행중` 도 없앴다 — 지식공유문서는 작업의
// 완료에서 발생하고, 항상 그 시점에 완료된 것이 넘어온다. 끝나지 않은 일은
// 문서가 아니라 아젠다이고 갈 곳은 이슈 대장이다.
//
// 그래서 여기서는 기본값만 지우고, 남는 값이 있으면 `check` 가 오류로 낸다.
function normStatus(v) {
  const t = v ? String(v).trim() : ''
  return !t || t === '확정' || t === '완료' ? null : t
}

function toArray(v) {
  if (v == null) return []
  return Array.isArray(v) ? v.filter((x) => x != null).map((x) => String(x).trim()) : [String(v).trim()]
}

// supersedes 는 **오기재 정정에만** 쓴다 (수행 v1.0 §6.3). 같은 좌표를 나중에
// 또 바꾼 것은 적을 필요가 없다 — later() 계산으로 나온다.
// 문자열 또는 [{ id, scope }] 를 모두 받아 정규화한다.
export function normalizeSupersedes(v) {
  if (v == null) return []
  const one = (x) => {
    if (x == null) return null
    if (typeof x === 'string') return { id: x.trim(), scope: null }
    if (typeof x === 'object' && x.id) return { id: String(x.id).trim(), scope: toArray(x.scope).length ? toArray(x.scope) : null }
    return null
  }
  return (Array.isArray(v) ? v : [v]).map(one).filter(Boolean)
}

// 본문의 실제 제목을 뽑는다. 코드펜스 안의 ## 은 건너뛴다 — 지식 문서는
// 코드펜스 안에 마크다운 예시를 넣는다.
export function outline(body) {
  const lines = body.split('\n')
  const found = []
  let fence = null

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const f = line.match(/^\s{0,3}(`{3,}|~{3,})/)
    if (f) {
      if (!fence) fence = f[1][0].repeat(3)
      else if (line.trim().startsWith(fence)) fence = null
      continue
    }
    if (fence) continue

    const h = line.match(/^(#{2,3})\s+(.+?)\s*$/)
    if (h) found.push({ level: h[1].length, title: h[2].trim(), line: i })
  }
  return found
}

// 본문이 얼마나 얇은가 — 형식 대신 쓰는 신호.
//
// 4섹션을 강제하지 않으므로 "왜 섹션이 비었다"를 볼 수 없다. 그런데 "왜가
// 없다"는 여전히 실제 문제다 (수행 v1.0 §13 — 6개월 뒤 뒤집으려는 사람에게
// 근거가 없다). 그래서 **길이**로 어림한다. 규약 위반이 아니라 눈에 걸리게만 한다.
// 임계는 샘플 21건에서 고른 값이다. 227자에 왜가 있고 126자에 없는 문서가
// 있어서 **길이로는 잘 갈리지 않는다** — 260자로 뒀을 때 7건 중 5건이 오탐이었다.
// 그래서 낮게 잡고 현황의 머리 지표에서 뺐다. 실측(TODO 4단계)에서 다시 본다.
const THIN_CHARS = 140

export function bodyWeight(body) {
  const text = body
    .split('\n')
    .filter((l) => !/^\s*(---|<!--|#{1,6}\s)/.test(l))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return { chars: text.length, thin: text.length > 0 && text.length < THIN_CHARS }
}

// path 는 레포 루트 기준 상대경로(POSIX 구분자).
export function parseDoc(path, text) {
  const m = text.match(FM)
  const errors = []
  let fm = {}
  let body = text

  if (m) {
    body = text.slice(m[0].length)
    try {
      fm = yaml.load(m[1]) || {}
      if (typeof fm !== 'object' || Array.isArray(fm)) {
        errors.push('프론트매터가 객체가 아님')
        fm = {}
      }
    } catch (e) {
      errors.push(`프론트매터 YAML 오류: ${e.reason || e.message}`)
      fm = {}
    }
  }

  const fileId = path.replace(/^.*\//, '').replace(/\.md$/i, '')
  const id = fm.id ? String(fm.id).trim() : fileId
  const layer = layerOf(path)
  const headings = outline(body)
  const weight = bodyWeight(body)

  const doc = {
    path,
    id,
    fileId,
    layer, // 'work' | 'managed' | null
    isUnit: layer === 'work' && !!m,
    hasFrontmatter: !!m,
    title: fm.title ? String(fm.title).trim() : fileId,
    date: normDate(fm.date),
    author: fm.author ? String(fm.author).trim() : null,
    // **`확정` 은 읽는 경계에서 지운다.**
    //
    // 기본값이라 아무것도 구별하지 않는다(30건 중 28건). 여기서 지우면 화면·
    // 클립보드·검사 전부가 자동으로 조용해지고, 이미 `status: 확정` 이 적힌
    // 기존 기록도 그대로 둔 채 동작한다 -- 데이터를 고치러 다니지 않는다.
    status: normStatus(fm.status),
    touches: toArray(fm.touches),
    hasTouchesKey: Object.prototype.hasOwnProperty.call(fm, 'touches'),
    // 좌표 0개의 사유(`save` 가 요구한다) · 편입한 원문의 출처(cdp-import ④)
    touchesEmpty: fm.touchesEmpty ? String(fm.touchesEmpty).trim() : null,
    source: fm.source ? String(fm.source).trim() : null,
    supersedes: normalizeSupersedes(fm.supersedes),
    attachments: toArray(fm.attachments),
    tags: toArray(fm.tags),
    unknownFields: Object.keys(fm).filter(
      (k) => !['id', 'title', 'date', 'author', 'source', 'status', 'touches', 'touchesEmpty', 'supersedes', 'attachments', 'tags'].includes(k)
    ),
    headings,
    bodyChars: weight.chars,
    // 전에는 `진행중` 이면 본문이 비어도 정상으로 봤다. 그 상태가 없어졌으니
    // 예외도 없다 — 완료된 작업의 기록이 비어 있으면 그냥 얇은 기록이다.
    bodyThin: layer === 'work' && weight.thin,
    // 형식을 강요하지 않으므로 목차 레일은 항상 실제 제목으로 만든다
    sections: [],
    conforms: false,
    bodyOffset: m ? m[0].length : 0,
    errors,
  }

  // 관리 문서는 섹션이 1급 단위다. 여기서 분해해 두면 좌표 → 섹션 조회가
  // 스캔 결과만으로 끝난다.
  if (layer === 'managed') {
    doc.managedSections = parseManagedSections(body)
    doc.sectionCount = doc.managedSections.filter((s) => s.hasAppliedComment || s.level === 2).length
    doc.appliedTop = topApplied(body)
  }

  return doc
}

// 문서 머리의 applied — 등록부의 `—`(문서 전체) 규칙이 읽는 값.
//
// 문서 전체가 좌표 하나의 상태이면 applied 주석은 섹션 아래가 아니라 **파일 첫 줄**에 있다.
// 첫 3줄 안 · 첫 헤딩 전까지만 본다 — `## 첫 섹션` 바로 아래의 주석을 문서의 것으로 읽지 않게
// (`parseManagedSections` 가 같은 이유로 다음 제목을 넘어가지 않는다). `sliceSection` 이 앞 3줄의
// 주석을 걷어 내는 규칙과 짝이다. 전에는 아무도 읽지 않아 `—` 섹션이 늘 `applied: null` 이었다
// (동시 기록 검토 v0.1 M5).
export function topApplied(text) {
  const lines = String(text || '').split('\n')
  for (let i = 0; i < Math.min(3, lines.length); i++) {
    if (/^#{1,6}\s/.test(lines[i])) break
    const m = /<!--\s*applied\s*:\s*(.*?)\s*-->/i.exec(lines[i])
    if (m) return m[1] && m[1] !== 'null' && m[1] !== '-' ? m[1] : null
  }
  return null
}
