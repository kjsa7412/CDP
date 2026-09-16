// 앱 상태 — 읽음 표시 · 마지막 방문 · 읽기 위치 · 읽기 설정 · alias 미스 로그.
//
// 설계서 §6.1 — 레포 안에는 아무것도 쓰지 않는다. 캐시도, 읽음 표시도, 설정도.
// 레포에 커밋될 수 있는 파일을 뷰어는 단 하나도 만들지 않는다.
//
// §27.6 — 읽기 시간·체류 시간 통계는 저장하지 않는다. 로컬이라도 만들지 않는다.
// 쓸 데가 없고, 있으면 언젠가 지표로 쓰인다.

import fs from 'node:fs'
import path from 'node:path'
import os from 'node:os'

export function dataDir(exeDir) {
  // 포터블 모드 — exe 옆에 cdp.portable 이 있으면 exe 폴더에 쓴다(§6.1)
  if (exeDir && (fs.existsSync(path.join(exeDir, 'cdp.portable')) || fs.existsSync(path.join(exeDir, 'ctx-view.portable'))))
    return path.join(exeDir, 'data')

  const base = process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share')
  const dir = path.join(base, 'cdp')

  // **이름을 바꾸면 설정이 사라진다.**
  //
  // 사용자가 지정한 레포 경로가 `ctx-view/state.json` 에 있는데 폴더 이름만
  // 바꾸면 앱이 처음 실행처럼 뜬다 -- 그리고 사용자는 "경로를 넣었는데 안 된다"
  // 는 예전 증상으로 읽는다. 한 번만 옮겨 온다.
  try {
    const oldDir = path.join(base, 'ctx-view')
    if (!fs.existsSync(dir) && fs.existsSync(oldDir)) {
      fs.mkdirSync(dir, { recursive: true })
      for (const f of fs.readdirSync(oldDir)) {
        const src = path.join(oldDir, f)
        if (fs.statSync(src).isFile()) fs.copyFileSync(src, path.join(dir, f))
      }
    }
  } catch {}

  return dir
}

const DEFAULTS = {
  repoPath: null,
  theme: 'system',
  density: 'normal',
  watch: true,
  // `domain:` 은 산출물이 아니라 **분류축**이다 — 업무 영역에 "지금 상태"를
  // 적을 섹션이 없고, 입도가 굵어 후속이 항상 많다. 등록부에서도 뺐다.
  settledness: { excludeTypes: ['domain'] },
  panes: { sidebar: 264, list: 360 },
  // §27.5~27.7 — 읽기는 부가 기능이 아니라 본체다
  reading: { mode: 'browse', fontSize: 15, measure: 760, coordLinks: true },
  // 작업 레포 목록 — **개인 설정이다.**
  //
  // 지식 레포에 두면 팀원마다 경로가 달라 맞지 않는다. 그리고 한 사람이
  // 여러 작업 레포를 걸 수 있다 — 중요한 것은 **지식 레포가 하나**인 것이지
  // 작업 레포의 수가 아니다.
  //
  // v0.6 부터 **원소가 객체다** — { path, addedAt, lastApplied }.
  // 문자열 배열이던 것은 load() 가 한 번 감싸 준다(아래 migrate).
  workRepos: [],
  // 한 일의 기록 — **각각 20건에서 자른다.**
  //
  // 이 파일은 4초마다 통째로 다시 쓰인다. 무한히 자라면 그 비용도 같이 자란다.
  // 그리고 20건을 넘겨 봐야 사람이 읽지 않는다.
  syncLog: [],
  setupLog: [],
  myCoords: [],
  read: {}, // id → ISO 시각
  scroll: {}, // id → { ratio, at }
  lastVisit: null,
  aliasMisses: [], // { q, at, opened }
}

export class AppState {
  constructor(dir) {
    this.dir = dir
    this.file = path.join(dir, 'state.json')
    this.data = { ...DEFAULTS }
    this._dirty = false
    this.load()
    this._timer = setInterval(() => this.flush(), 4000)
    this._timer.unref?.()
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'))
      this.data = migrate(deepMerge({ ...DEFAULTS }, raw))
    } catch {
      this.data = { ...DEFAULTS }
    }
  }

  all() {
    return this.data
  }

  merge(patch) {
    this.data = migrate(deepMerge(this.data, patch || {}))
    this._dirty = true
    return this.data
  }

  // 이력 한 줄 — 맨 앞에 넣고 뒤를 자른다.
  //
  // **화면이 직접 넣지 않는다.** 서버가 일을 끝낸 자리에서 부른다 --
  // 클라이언트가 쓰면 탭이 둘일 때 같은 일이 두 줄로 남는다.
  push(key, entry, cap = 20) {
    const list = Array.isArray(this.data[key]) ? this.data[key] : []
    this.data = { ...this.data, [key]: [entry, ...list].slice(0, cap) }
    this._dirty = true
    return this.data[key]
  }

  // 작업 레포 한 곳의 기록을 갱신한다. 없으면 넣는다.
  markWorkRepo(p, lastApplied) {
    const list = (this.data.workRepos || []).map((w) => (typeof w === 'string' ? { path: w } : w))
    const i = list.findIndex((w) => samePath(w.path, p))
    if (i < 0) list.push({ path: p, addedAt: new Date().toISOString(), lastApplied })
    else list[i] = { ...list[i], lastApplied }
    this.data = { ...this.data, workRepos: list }
    this._dirty = true
    return list
  }

  flush() {
    if (!this._dirty) return
    try {
      fs.mkdirSync(this.dir, { recursive: true })
      fs.writeFileSync(this.file, JSON.stringify(this.data, null, 2), 'utf8')
      this._dirty = false
    } catch {}
  }

  close() {
    clearInterval(this._timer)
    this.flush()
  }
}

// 스키마 이관 — **옛 설정이 조용히 사라지지 않게.**
//
// 위 `dataDir` 이 `ctx-view` -> `cdp` 폴더를 한 번 옮겨 오는 것과 같은 일이다.
// 그때 배운 것이 하나 있다 — **모양이 바뀌면 옛 모양도 읽어야 한다.**
// 안 그러면 사용자는 "처음 실행" 화면을 보고 "경로를 넣었는데 안 된다" 고 읽는다.
function migrate(d) {
  const w = d.workRepos
  if (Array.isArray(w) && w.some((x) => typeof x === 'string')) {
    d = {
      ...d,
      workRepos: w
        .map((x) => (typeof x === 'string' ? { path: x, addedAt: null, lastApplied: null } : x))
        .filter((x) => x && x.path),
    }
  }
  return d
}

// 경로 비교 — Windows 다. 대소문자와 구분자가 다를 뿐 같은 폴더인 경우가 흔하다.
export function samePath(a, b) {
  const norm = (s) =>
    String(s || '')
      .replace(/[\\/]+$/, '')
      .split('\\')
      .join('/')
      .toLowerCase()
  return norm(a) === norm(b)
}

function deepMerge(a, b) {
  const out = Array.isArray(a) ? [...a] : { ...a }
  for (const [k, v] of Object.entries(b || {})) {
    if (v && typeof v === 'object' && !Array.isArray(v) && a?.[k] && typeof a[k] === 'object' && !Array.isArray(a[k])) {
      out[k] = deepMerge(a[k], v)
    } else {
      out[k] = v
    }
  }
  return out
}
