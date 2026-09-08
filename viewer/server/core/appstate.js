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
      this.data = deepMerge({ ...DEFAULTS }, raw)
    } catch {
      this.data = { ...DEFAULTS }
    }
  }

  all() {
    return this.data
  }

  merge(patch) {
    this.data = deepMerge(this.data, patch || {})
    this._dirty = true
    return this.data
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
