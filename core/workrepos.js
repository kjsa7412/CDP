// 설치 대장. MCP 설계서 §6.7.2.
//
// **브라우저는 사용자 PC 에 파일을 쓸 수 없다**(§6.7.1). 그래서 관리 서비스가
// 맡는 것은 설치 행위가 아니라 그 앞뒤다 — 등록 · 꾸러미 발급 · 결과 추적.
// 이 파일은 그 셋 중 첫째와 셋째를 든다.
//
// **git 밖의 상태가 둘이 된다.** §4.4 는 "명부뿐" 이었는데 여기서 대장이 붙는다.
// 다만 대장은 **권한을 들지 않는다** — 잃어도 등록만 다시 하면 되고, 그래서
// 백업 대상이 아니다. 명부와 같은 급으로 다루지 않는다.

import crypto from 'node:crypto'
import fs from 'node:fs/promises'
import path from 'node:path'

export class WorkReposError extends Error {
  constructor(code, message, detail) {
    super(message)
    this.name = 'WorkReposError'
    this.code = code
    this.detail = detail
  }
}

const NAME_RE = /^[^\s/\\][^/\\]{0,79}$/

function file(dataDir) {
  return path.join(dataDir, 'workrepos.json')
}

export async function load(dataDir) {
  if (!dataDir) return { repos: [] }
  const raw = await fs.readFile(file(dataDir), 'utf8').catch(() => null)
  if (raw == null) return { repos: [] }
  try {
    const j = JSON.parse(raw)
    return { repos: Array.isArray(j?.repos) ? j.repos : [] }
  } catch {
    // 깨진 대장은 **덮어쓰지 않는다.** 사람이 고칠 것이고, 그 사이 등록은 막힌다.
    throw new WorkReposError('E_REPO', 'workrepos.json 이 JSON 이 아니다', { file: file(dataDir) })
  }
}

export async function save(dataDir, db) {
  await fs.mkdir(dataDir, { recursive: true }).catch(() => {})
  await fs.writeFile(file(dataDir), JSON.stringify(db, null, 2) + '\n', 'utf8')
}

// 등록 — **`owner` 는 명부에 있어야 한다**(§6.7.2).
//
// §4.7 의 "누가 `ctx setup --server` 를 돌리나" 를 "아무나" 가 아니라 **담당자
// 한 명**으로 못 박는 장치다. 아무나 돌리면 시점이 달라 스킬 버전이 제각각
// 커밋된다.
export function add(db, { name, knowledge, owner, note = null }, { users = [], repos = [] } = {}) {
  if (!NAME_RE.test(String(name || ''))) throw new WorkReposError('E_INPUT', '이름 형식이 아니다', { name })
  if (db.repos.some((r) => r.name === name && r.knowledge === knowledge)) {
    throw new WorkReposError('E_EXISTS', '이미 등록돼 있다', { name, knowledge })
  }
  if (!repos.includes(knowledge)) {
    throw new WorkReposError('E_INPUT', '그런 지식 레포가 없다', { knowledge })
  }
  if (owner && !users.includes(owner)) {
    throw new WorkReposError('E_INPUT', '명부에 없는 담당자다', { owner })
  }
  const row = {
    id: 'wr_' + crypto.randomBytes(3).toString('hex'),
    name,
    knowledge,
    owner: owner || null,
    note,
    createdAt: new Date().toISOString().slice(0, 10),
    applied: null,
  }
  db.repos.push(row)
  return row
}

export function remove(db, id) {
  const before = db.repos.length
  db.repos = db.repos.filter((r) => r.id !== id)
  if (db.repos.length === before) throw new WorkReposError('E_NOT_FOUND', '그런 등록이 없다', { id })
}

// 설치 결과 보고 (§6.7.4).
//
// **보고는 추적용이지 관문이 아니다.** 보고가 없어도 설치는 된다 — 대장이
// "미설치" 로 남을 뿐이다. 그래서 여기서 실패해도 클라이언트를 막지 않는다.
export function applied(db, id, { kit, by }) {
  const r = db.repos.find((x) => x.id === id)
  if (!r) throw new WorkReposError('E_NOT_FOUND', '그런 등록이 없다', { id })
  // `by` 는 **서버가 토큰에서 채운다.** `save.work.author` 와 같은 규칙(§4.5) —
  // 클라이언트가 보낼 수 있으면 남의 이름으로 기록이 남는다.
  r.applied = { at: new Date().toISOString().slice(0, 16).replace('T', ' '), by, kit: kit || null }
  return r
}

// 상태 — 대장의 `applied.kit` 과 **서버가 지금 든 kit 해시**를 견준다.
//
//   최신     같다
//   낡음     다르다 — 서버 kit 이 바뀌었는데 그 작업 레포는 옛 판이다
//   미설치   보고가 없다
export function state(row, kitNow) {
  if (!row.applied?.kit) return '미설치'
  return row.applied.kit === kitNow ? '최신' : '낡음'
}

// `known` — 지금 서버에 있는 지식 레포 이름들. 주면 거기 없는 등록에 `orphan: true` 를 단다 — 레포를 휴지통으로
// 보낸 뒤에도 등록은 기록으로 남는데, 전에는 표지가 없어 「미설치」 로만 보였고 지울 길도 없었다(실서버 종합 시험 F5).
export function list(db, { kits = {}, known = null } = {}) {
  return db.repos.map((r) => ({
    ...r,
    kitNow: kits[r.knowledge] ?? null,
    state: state(r, kits[r.knowledge] ?? null),
    ...(known ? { orphan: !known.includes(r.knowledge) } : {}),
  }))
}
