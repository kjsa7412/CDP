// 설치 한 줄 — 서버의 `install.mjs` 를 받아 돌리는 명령. **한 곳에서 짓는다**(작업 레포 · 일괄 갱신 · 큐레이터 폴더).
//
// 받은 파일은 **임시 폴더에** — 작업 레포 · 큐레이터 폴더에 남지 않는다. 대상 폴더는 `.`(그 폴더에서 붙여넣는다).
// **토큰은 명령에 없다**(§6.7.3 · 설치 한 줄 TODO I3) — 설치기가 묻고 확인하고 이 PC 에 둔다. 명령에 원문을 채우면
// 클립보드 · 셸 이력에 남는다.
//
//   작업 레포     --repo <레포> --workrepo <등록 id> .   대장에 보고한다(git 레포 · 등록이 있어야 한다)
//   일괄 갱신     --update                                이 PC 에 이 서버로 설치한 작업 레포 전부(설치 목록)
//   큐레이터 폴더  --curator --repo <레포> .              git 도 대장 등록도 없다 — 서버가 큐레이터 kit 을 준다(v1.0 §6.3 · W5)
//
// React 를 import 하지 않는다 — `node --test` 가 모양을 지킨다.

export const SHELLS = [
  { key: 'ps', label: 'PowerShell' },
  { key: 'cmd', label: '명령 프롬프트' },
  { key: 'sh', label: 'macOS · Linux' },
]

//   그 밖         args 로 설치기 인자를 그대로 — 서버의 「다음 할 일」(`/next` 의 cmd.args)이 정한 것
export function installCommand(shell, { origin, repo = null, id = null, update = false, curator = false, args: given = null }) {
  const url = `${origin}/install.mjs`
  const args = given ? String(given) : update ? '--update' : curator ? `--curator --repo ${repo} .` : `--repo ${repo} --workrepo ${id} .`
  if (shell === 'ps') return `curl.exe -fsSLo "$env:TEMP\\cdp-install.mjs" ${url}; if ($?) { node "$env:TEMP\\cdp-install.mjs" ${args} }`
  if (shell === 'cmd') return `curl -fsSLo "%TEMP%\\cdp-install.mjs" ${url} && node "%TEMP%\\cdp-install.mjs" ${args}`
  return `curl -fsSLo /tmp/cdp-install.mjs ${url} && node /tmp/cdp-install.mjs ${args}`
}

// 처음 고를 셸 — 그 PC 의 것
export const guessShell = (nav = typeof navigator === 'undefined' ? null : navigator) =>
  /Win/i.test(nav?.platform || nav?.userAgent || '') ? 'ps' : 'sh'
