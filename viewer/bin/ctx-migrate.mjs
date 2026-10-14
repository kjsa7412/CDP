// ctx migrate — 옛 레포(파생 필수 시절)를 v1.0 으로 제자리 이행. 개편안 §9.2 · W7.
//
//   ctx migrate <레포 경로> [--dry] [--by <이름>] [--keep-tools]
//
//   1 전환 기록 — 지금 섹션이 최신인 기록은 반영됨 · 실을 섹션이 없던 기록은 기록으로 둠 · 옛 판정이 남긴 기록은 대기열에
//   2 서식 예시 — `example:` 좌표 · 짝 섹션이 남았으면 지운다(save 의 examples: "purge")
//   3 도구 층 — bin · .githooks · .claude · MANUAL* · CLAUDE.md · TEMPLATE-work.md · INDEX* 를 걷고 core.hooksPath 를 푼다(커밋 하나).
//      추적하지 않는 사본(무시된 .claude/ · tools/)은 디스크에서만 지운다 — 남기면 serve doctor 가 계속 경고한다
//
// **서버가 그 레포에 쓰는 동안 돌리지 않는다** — 서버의 save 뮤텍스는 이 프로세스와 공유되지 않는다. 서버를 멈추거나
// 사람이 쓰지 않는 때에. 레포를 다시 세우는 것(기록만 옮겨 빈 레포로)은 `ctx repo new --records-from` 이다(dpms_wiki).

import fs from 'node:fs/promises'
import path from 'node:path'
import { execFile } from 'node:child_process'
import { loadRepo } from '../../core/repo.js'
import { save } from '../../core/save.js'
import { planTransition, TOOL_LAYER } from '../../core/migrate.js'
import { toError } from '../../core/tools.js'

const NL = '\n'
const git = (cwd, args) =>
  new Promise((res) => execFile('git', ['-C', cwd, ...args], { windowsHide: true, encoding: 'utf8' }, (e, so, se) => res({ ok: !e, out: String(so || '').trim(), err: String(se || '').trim() })))
const escRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

export async function runMigrate(opt, io = {}) {
  const out = io.out || ((s = '') => process.stdout.write(s + NL))
  const err = io.err || ((s = '') => process.stderr.write(s + NL))
  const dir = opt.args[0]
  if (!dir) {
    err('ctx migrate <레포 경로> [--dry] [--by <이름>] [--keep-tools]')
    return 2
  }
  const root = path.resolve(dir)
  const by = opt.by || opt.user || 'cdp'
  try {
    const r = await loadRepo(root)
    out(`ctx migrate: ${root}`)

    // 1 전환 기록
    const p = planTransition(r)
    if (p.error) out(`  전환 기록 — 건너뜀: ${p.error}`)
    else {
      out(`  전환 기록 — 반영됨 ${p.stats.reflect} · 기록으로 둠 ${p.stats.keep} · 대기열에 남김 ${p.stats.queued}`)
      if (!opt.dry) {
        const res = await save(root, p.input, { user: by, write: true, curate: true })
        out(`    커밋 ${res.commit} · ${res.id}`)
      }
    }

    // 2 서식 예시
    const examples = [...r.vocab.coords.values()].filter((e) => e.example)
    if (examples.length) {
      out(`  서식 예시 — 좌표 ${examples.length}개 · 짝 섹션`)
      if (!opt.dry) {
        const p2 = (n) => String(n).padStart(2, '0')
        const d = new Date()
        const res = await save(
          root,
          {
            work: { id: `${d.getFullYear()}-${p2(d.getMonth() + 1)}${p2(d.getDate())}-전환-서식예시`, title: '전환 — 서식 예시 정리', date: `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())} ${p2(d.getHours())}:${p2(d.getMinutes())}`, touches: [], touchesEmpty: '서식 예시 정리', tags: ['docs-prune'], body: '패키지가 달고 온 서식 예시(example: 좌표 · (예시) 섹션)를 지운다 — v1.0 은 예시를 서식집에만 둔다.' },
            examples: 'purge',
          },
          { user: by, write: true, curate: true }
        )
        out(`    커밋 ${res.commit} · 지운 좌표 ${res.examples?.coords?.length ?? 0}`)
      }
    } else out('  서식 예시 — 없다')

    // 3 도구 층
    if (!opt.keepTools) {
      const present = []
      // git 이 추적하는 것만 — 무시된 사본(로컬형의 tools/ 처럼 .gitignore 에 든 것)까지 넣으면 git rm 전체가 실패한다
      for (const rel of TOOL_LAYER) if ((await git(root, ['ls-files', '--', rel])).out) present.push(rel)
      out(`  도구 층 — ${present.length ? present.join(' · ') : '없다'}`)
      // 추적하지 않는 사본(무시된 .claude/ · 로컬형 tools/ 같은 것) — 진단(serve doctor)은 디스크를 보므로 이것도 걷는다.
      // 커밋할 것이 없다. 못 지우는 것(돌고 있는 tools/cdp.exe 등)은 알리고 넘어간다 — 이행 전체를 멈추지 않는다
      const stray = []
      for (const rel of TOOL_LAYER) if (!present.includes(rel) && (await fs.stat(path.join(root, rel)).catch(() => null))) stray.push(rel)
      if (stray.length) out(`  도구 층(추적 안 함) — ${stray.join(' · ')}`)
      if (stray.length && !opt.dry) {
        for (const rel of stray) {
          const e = await fs.rm(path.join(root, rel), { recursive: true, force: true }).then(() => null, (x) => x)
          out(e ? `    ${rel} — 못 지웠다(${e.code || e.message}) · 손으로 지운다` : `    ${rel} — 지웠다`)
        }
        if (!present.length) await git(root, ['config', '--unset', 'core.hooksPath'])
      }
      if (present.length && !opt.dry) {
        const rm = await git(root, ['rm', '-r', '-q', '--', ...present])
        if (!rm.ok) throw new Error('git rm 실패 — ' + rm.err)
        await git(root, ['config', '--unset', 'core.hooksPath'])
        const c = await git(root, ['-c', `user.name=${by}`, '-c', `user.email=${by}@cdp`, 'commit', '-q', '--no-verify', '-m', '전환 — 레포에는 지식만: 도구 층(bin · 훅 · 스킬 사본 · 설명서 · INDEX)을 걷는다. kit 은 서버 번들에서 받는다(v1.0)'])
        if (!c.ok) throw new Error('커밋 실패 — ' + (c.err || c.out))
        out(`    커밋 ${(await git(root, ['rev-parse', '--short', 'HEAD'])).out}`)
        // README 는 레포의 얼굴이라 이행이 고치지 않는다 — 걷은 파일을 가리키는 고리만 알린다
        const readme = await fs.readFile(path.join(root, 'README.md'), 'utf8').catch(() => '')
        const link = new RegExp(`\\]\\((?:\\./)?(${present.map(escRe).join('|')})(?:[)#/])`)
        readme.split(/\r?\n/).forEach((line, i) => {
          const m = line.match(link)
          if (m) out(`    README.md:${i + 1} → ${m[1]} — 걷은 파일을 가리킨다(손으로 고친다)`)
        })
      }
    }
    out('')
    out(opt.dry ? '--dry — 아무것도 쓰지 않았다' : '다음 — 작업 레포마다 설치 한 줄 --update · 큐레이터는 queue 로 남은 대기열을 다룬다')
    return 0
  } catch (e) {
    const x = toError(e)
    err(`ctx migrate: ${x.code} ${x.message}`)
    return 1
  }
}
