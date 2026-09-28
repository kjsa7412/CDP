// ctx serve git-auth — 서버가 origin 에 닿는 자격을 넣는다. git 자격 TODO G7.
//
//   ctx serve git-auth --host <호스트[:포트]> --user <계정> [--scheme http|https] [--file <경로>] [--test <url>] [--yes]
//        PAT 를 숨김 입력으로 받아 .git-credentials(600)에 쓴다 · credential.helper 를 store 로 · 같은 호스트 줄은 바꾼다
//   ctx serve git-auth --ssh --data <dir> [--rotate]      SSH 배포 키 — 콘솔 › 서버 › git 자격 과 같은 것
//   ctx serve git-auth --list [--data <dir>]              지금 상태 — 호스트 · 계정 · 키 지문(비밀 없음)
//
// **PAT 는 이 명령으로만 들어간다** — 콘솔은 받지 않는다(제품관리서비스 검토 D8 · 평문 HTTP). 셸을 가진 사람이
// cdp 사용자로 돌린다: `sudo -u cdp -H node /opt/cdp/bin/ctx.mjs serve git-auth …`. 계산은 `core/gitauth.js`.

import * as gitauth from '../../core/gitauth.js'
import { toError } from '../../core/tools.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

// 숨김 입력 — TTY 면 한 글자씩 받아 화면에 안 찍는다. 파이프면 첫 줄(`printf %s "$PAT" | …`)
function readSecret(prompt) {
  const stdin = process.stdin
  if (!stdin.isTTY) {
    return new Promise((resolve) => {
      let buf = ''
      stdin.setEncoding('utf8')
      stdin.on('data', (c) => (buf += c))
      stdin.on('end', () => resolve(buf.split(/\r?\n/)[0].trim()))
    })
  }
  return new Promise((resolve) => {
    process.stderr.write(prompt)
    let buf = ''
    stdin.setRawMode(true)
    stdin.resume()
    stdin.setEncoding('utf8')
    const onData = (ch) => {
      for (const c of ch) {
        if (c === '\r' || c === '\n' || c === '\u0004') {
          stdin.setRawMode(false)
          stdin.pause()
          stdin.off('data', onData)
          process.stderr.write(NL)
          return resolve(buf.trim())
        }
        if (c === '\u0003') {
          stdin.setRawMode(false)
          process.stderr.write(NL)
          process.exit(130)
        }
        if (c === '\u007f' || c === '\b') buf = buf.slice(0, -1)
        else buf += c
      }
    }
    stdin.on('data', onData)
  })
}

export async function runGitAuth(opt) {
  try {
    if (opt.list) {
      const cred = await gitauth.credentialState()
      out(`credential.helper  ${cred.helper || '(없음)'}`)
      for (const e of await gitauth.listCredentials(cred.file)) out(`  ${e.scheme}://${e.user}@${e.host}`)
      if (opt.data) {
        const k = await gitauth.keyInfo(opt.data)
        out(`SSH 배포 키        ${k.exists ? k.fingerprint + '  ' + k.path : '(없음 — --ssh 로 만든다)'}`)
        for (const h of await gitauth.knownHosts(opt.data)) out(`  믿는 호스트 ${h.host}  ${h.type} ${h.fingerprint}`)
      }
      return 0
    }

    if (opt.ssh) {
      if (!opt.data) {
        err('ctx serve git-auth --ssh --data <dir> [--rotate]')
        return 2
      }
      const k = await gitauth.createKey(opt.data, { rotate: !!opt.rotate })
      out(`배포 키를 만들었다 — ${k.fingerprint}${k.rotated ? '  (옛 키 → ' + k.rotated + ')' : ''}`)
      out('')
      out('이 공개 키를 GitLab › 프로젝트 › Settings › Repository › Deploy keys 에 붙이고 「Grant write permissions」 를 켠다:')
      out('')
      out(k.publicKey)
      out('')
      out('그 뒤 콘솔 › 서버 › git 자격 에서 「호스트 키 받기」 → 지문 확인 → 「접속 확인」. 이미 ssh 원격인 레포에는 콘솔의 키 만들기가 건다 —')
      out('셸에서 만들었으면 콘솔에서 레포의 「origin」 을 한 번 더 누르거나 git -C <레포> config core.sshCommand 를 건다.')
      return 0
    }

    if (!opt.host || !opt.user) {
      err('ctx serve git-auth --host <호스트[:포트]> --user <계정> [--scheme http|https] [--file <경로>] [--test <url>] [--yes]')
      err('ctx serve git-auth --ssh --data <dir> [--rotate]')
      err('ctx serve git-auth --list [--data <dir>]')
      return 2
    }
    const secret = await readSecret(`PAT (${opt.user}@${opt.host} — 화면에 안 찍힌다): `)
    const r = await gitauth.storeCredential({ scheme: opt.scheme || 'http', host: opt.host, user: opt.user, secret, file: opt.file || null, force: !!opt.yes })
    out(`저장했다 — ${r.scheme}://${r.user}@${r.host}  →  ${r.file} (600)${r.replaced ? '  · 같은 호스트의 옛 줄을 바꿨다' : ''}`)
    if (r.helperSet) out(`credential.helper = ${r.helper}`)
    if (opt.test) {
      const t = await gitauth.testRemote(opt.test)
      if (t.ok) out(`접속 확인 — ${t.url} ${t.empty ? '(빈 프로젝트)' : 'HEAD ' + t.head}`)
      else {
        err(`접속 실패 — ${t.reason}${t.message ? ': ' + t.message : ''}`)
        return 1
      }
    } else out('확인: ctx serve git-auth … --test <origin url>  또는 콘솔 › 서버 › git 자격 › 「접속 확인」')
    return 0
  } catch (e) {
    const x = toError(e)
    err(`ctx serve git-auth: ${x.message}`)
    return e?.code === 'E_EXISTS' ? 1 : 2
  }
}
