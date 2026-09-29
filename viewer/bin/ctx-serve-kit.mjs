// ctx serve kit-refresh — 서버 레포들의 도구 층(에이전트 세팅)을 이 번들의 판으로. 에이전트 세팅 갱신 TODO T3 · T7.
//
//   ctx serve kit-refresh --root <repos> [--packages <dir>] [--repo <이름>] [--dry] [--no-push]
//
// **upgrade.sh 가 서버를 멈춘 사이에 부른다** — 멈춘 동안이라 save 와 겹치지 않는다. 서버가 도는 중이면
// 콘솔의 [에이전트 세팅 갱신] 이 같은 함수를 save 와 같은 뮤텍스 안에서 부른다.
//
// 갱신이 안 된 레포가 있어도 exit 0 이다 — upgrade 를 실패로 만들 일이 아니다(서버 판은 올라갔다).
// 사람이 볼 줄을 남기고, 건너뛴 레포는 콘솔 › 지식 레포에 「다름」 으로 남는다. 인자 오류만 exit 2.

import path from 'node:path'
import { listRepos } from '../../core/reponew.js'
import { refreshToolLayer, planToolLayer, describe } from '../../core/toollayer.js'
import { enqueuePush } from '../../core/mirror.js'
import * as P from '../../core/packages.js'
import { resolvePackages, materializePackage } from './ctx-package.mjs'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)

/**
 * 도구 층의 원본 — 패키지 하나(이름순 첫 것)를 완성 폴더로. **도구 층은 패키지마다 같다**(assemble 의 첫 묶음)
 * — 둘째 패키지와 견줘 다르면 멈춘다(어느 쪽이 맞는지 기계가 고를 수 없다).
 * @returns {{ from, name, cleanup }}
 */
export async function kitSource(pk, { verify = true } = {}) {
  const list = await P.listPackages(pk.dir)
  if (!list.length) throw Object.assign(new Error(`패키지가 없다 — ${pk.dir}`), { code: 'E_INPUT' })
  const first = await materializePackage(pk, list[0].name)
  if (verify && list.length > 1) {
    const second = await materializePackage(pk, list[1].name)
    try {
      const { changes } = await planToolLayer(second.from, first.from)
      if (changes.length) {
        await first.cleanup()
        throw Object.assign(new Error(`패키지마다 도구 층이 다르다 (${list[0].name} ↔ ${list[1].name} · ${changes.slice(0, 3).map((c) => c.path).join(' · ')}) — 배포본을 다시 만든다`), { code: 'E_INPUT' })
      }
    } finally {
      await second.cleanup()
    }
  }
  return { from: first.from, name: list[0].name, cleanup: first.cleanup }
}

// 도는 서버 · 진단이 쓰는 것 — **프로세스에 한 번.** 소스로 돌 때 조립은 동기 복사라 요청마다 하면 서버가 멈칫한다.
// 서버 산출물(완성 폴더)이면 조립이 없어 비용이 없다. 패키지끼리 견주는 것은 CLI(upgrade)가 한다. 임시 폴더는 프로세스와 함께 간다
const shared = new Map()
export function sharedKitSource(pk) {
  if (!shared.has(pk.dir)) {
    shared.set(
      pk.dir,
      kitSource(pk, { verify: false }).catch((e) => {
        shared.delete(pk.dir)
        throw e
      })
    )
  }
  return shared.get(pk.dir)
}

// 커밋 메시지 — 어느 판으로 갈았는지 git 로그에서 보이게
export function kitMessage(built, n) {
  return `에이전트 세팅 갱신 — ${built ? '번들 ' + built + ' · ' : ''}도구 층 ${n}건`
}

export async function runKitRefresh(opt) {
  if (!opt.root) {
    err('ctx serve kit-refresh: --root <레포 폴더> 가 필요하다')
    return 2
  }
  const root = path.resolve(opt.root)
  const pk = await resolvePackages({ explicit: opt.packages })
  if (!pk) {
    err('ctx serve kit-refresh: 패키지 폴더를 못 찾았다 — --packages <dir>')
    return 2
  }
  let src
  try {
    src = await kitSource(pk)
  } catch (e) {
    err('ctx serve kit-refresh: ' + e.message)
    return 2
  }
  const built = opt.builtAt || null
  try {
    const repos = (await listRepos(root)).filter((r) => r.vocab && (!opt.repo || r.name === opt.repo))
    if (opt.repo && !repos.length) {
      err(`ctx serve kit-refresh: 그런 레포가 없다 — ${opt.repo}`)
      return 2
    }
    out(`에이전트 세팅 — 원본 packages/${src.name}${opt.dry ? ' (dry — 쓰지 않는다)' : ''}`)
    const w = Math.max(4, ...repos.map((r) => [...r.name].length))
    const tally = { same: 0, updated: 0, dry: 0, skipped: 0 }
    for (const r of repos) {
      let res
      try {
        res = await refreshToolLayer(r.path, src.from, { dry: !!opt.dry, message: (changes) => kitMessage(built, changes.length) })
      } catch (e) {
        out(`  ${r.name.padEnd(w)}  실패 — ${e.message}`)
        tally.skipped++
        continue
      }
      tally[res.state]++
      let line = `  ${r.name.padEnd(w)}  ${describe(res)}`
      if (res.state === 'updated' && !opt.noPush) {
        const p = await enqueuePush(r.path).catch(() => null)
        if (p && p.state !== 'off') line += p.ok ? ' · origin 에 보냄' : ` · origin 에 못 보냄(${p.reason}) — 다음 save 나 콘솔 「다시 보내기」 가 가져간다`
      }
      out(line)
    }
    out(`합계 — 최신 ${tally.same} · 갱신 ${tally.updated}${opt.dry ? ` · 다름 ${tally.dry}` : ''} · 건너뜀 ${tally.skipped}`)
    if (tally.updated) out('작업 레포는 관리 › 작업 레포 에 「낡음」 으로 뜬다 — 담당자가 자기 PC 에서 「일괄 갱신」 한 줄을 돌린다')
    return 0
  } finally {
    await src.cleanup()
  }
}
