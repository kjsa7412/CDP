// serve.json — 서버의 설정 한 장. 제품화 2 검토 §5.2 · TODO ④(F5).
//
// 전에는 `ctx serve doctor` · `user` · `token` · `repo new` 를 부를 때마다 --root · --auth · --data · --web · --bind · --port 를
// 다시 줬다(doctor 는 플래그 일곱). 서버는 그 값을 이미 안다(유닛 ExecStart). 그래서 `install.sh` 가 한 장에 적고,
// 유닛 · 셸 명령이 같은 장을 읽는다 — 값이 두 곳에 있으면 갈라진다.
//
//   자리   --config <f> → 환경변수 CDP_SERVE_CONFIG → 번들 옆 <bin>/../serve.json
//   모양   { "root", "auth", "data", "web", "bind", "port", "mirror", "adminFrom", "publicUrl", "manual", "forms", "kit" }
//
// **명령줄이 이긴다** — 준 플래그는 그대로 두고 빈 칸만 채운다.

import fs from 'node:fs/promises'
import path from 'node:path'
import { hereDir } from '../server/runtime.js'

export const CONFIG_KEYS = ['root', 'auth', 'data', 'web', 'bind', 'port', 'mirror', 'adminFrom', 'publicUrl', 'manual', 'forms', 'kit']

export async function findServeConfig({ explicit = null, env = process.env, binDir = hereDir(import.meta.url) } = {}) {
  const cands = [explicit, env.CDP_SERVE_CONFIG, path.resolve(binDir, '..', 'serve.json')].filter(Boolean)
  for (const f of cands) {
    const raw = await fs.readFile(f, 'utf8').catch(() => null)
    if (raw == null) {
      if (f === explicit) throw new Error(`설정 파일이 없다 — ${f}`)
      continue
    }
    let j
    try {
      j = JSON.parse(raw)
    } catch (e) {
      throw new Error(`설정 파일이 JSON 이 아니다 — ${f}: ${e.message}`)
    }
    return { file: path.resolve(f), cfg: j && typeof j === 'object' ? j : {} }
  }
  return null
}

export function applyServeConfig(opt, cfg) {
  const out = { ...opt }
  for (const k of CONFIG_KEYS) if ((out[k] === undefined || out[k] === null) && cfg[k] !== undefined && cfg[k] !== null) out[k] = cfg[k]
  return out
}
