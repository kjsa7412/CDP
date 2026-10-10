// ctx repo — 지식 레포를 세우고 센다. v1.0 개편안 §8.2 · §9.1.
//
//   ctx repo new  <경로> [--title <한 줄>] [--origin <url> [--no-push]] [--dry] [--records-from <옛 레포>]
//                 --origin 을 주면 첫 커밋을 바로 보낸다(콘솔과 같다 · 제품화 2 F6) — 안 보내려면 --no-push
//                 빈 틀 하나로 선다(README · _vocab.md · _managed.md · docs/ · work/). 서식은 서식집 · 스킬은 서버 kit 이다
//                 --records-from — 다시 세우기(§9.1): 옛 레포의 작업 기록 · 첨부 · 그 기록의 어휘만 옮긴다. 관리 문서는 큐레이션으로 다시
//   ctx repo list --root <폴더>
//
// **계산은 `core/reponew.js` 가 한다.** 관리 서비스의 콘솔(`POST /admin/repos`)이 같은
// 함수를 부른다 — CLI 로 세운 것과 화면에서 세운 것이 같은 모양이어야 한다.

import path from 'node:path'
import { newRepo, listRepos } from '../../core/reponew.js'
import { toError } from '../../core/tools.js'

const NL = String.fromCharCode(10)
const out = (s = '') => process.stdout.write(s + NL)
const err = (s = '') => process.stderr.write(s + NL)
const pad = (s, n) => {
  const w = [...String(s ?? '')].reduce((a, c) => a + (c.codePointAt(0) > 0x1100 ? 2 : 1), 0)
  return String(s ?? '') + ' '.repeat(Math.max(0, n - w))
}

export async function runRepo(opt) {
  const [sub, arg] = opt.args
  try {
    if (sub === 'new') {
      if (!arg) {
        err('ctx repo new <경로> [--title <한 줄>] [--origin <url> [--no-push]] [--dry] [--records-from <옛 레포>]')
        return 2
      }
      // v0.x 의 패키지는 v1.0 에서 없다 — 서식은 서식집(큐레이터가 문서를 세울 때 고른다). 주면 알리고 빈 틀로 간다
      if (opt.package && opt.package !== 'blank') err(`ctx repo new: --package ${opt.package} 는 v1.0 에서 없다 — 빈 틀로 세운다. 서식은 큐레이터가 서식집(forms)에서 고른다`)
      // origin 이면 push 가 기본(콘솔 `POST /admin/repos` 와 같다) — 따로 받던 --push 는 남겨 둔다(있어도 같은 뜻)
      const push = !!opt.origin && !opt.noPush
      const r = await newRepo({ dest: arg, title: opt.title || null, origin: opt.origin || null, push, dry: !!opt.dry, records: opt.recordsFrom ? { root: opt.recordsFrom } : null })
      if (r.dry) {
        out(`ctx repo new --dry: ${r.dest}`)
        for (const s of r.steps) out('  ' + s)
        return 0
      }
      out(`ctx repo new: ${r.dest}`)
      out(`  첫 커밋 ${r.commit} · 파일 ${r.files}`)
      if (r.records) {
        out(`  옮긴 것  ${r.records.from} 의 작업 기록 ${r.records.records}건 · 첨부 ${r.records.assets}곳 · 어휘 ${r.records.vocab}줄${r.records.skipped.length ? ` · 옛 기계 기록 ${r.records.skipped.length}건은 두고 왔다` : ''}`)
        if (r.records.missing.length) out(`  ⚠ 옛 어휘에 없던 좌표 ${r.records.missing.length}개 — ${r.records.missing.slice(0, 5).join(' · ')}${r.records.missing.length > 5 ? ' …' : ''} (check 가 미등재로 알린다)`)
        out('  옮긴 기록은 전부 큐레이션 대기열에 선다 — 큐레이터가 cdp-curate 로 관리 문서를 세운다')
      }
      if (r.origin) out(`  origin  ${r.origin}${r.pushed ? '  (push 완료)' : r.pushError ? '  (push 실패: ' + r.pushError + ')' : '  (push 안 함)'}`)
      if (r.pushError) out(`  다시 보내기 — git -C "${r.dest}" push -u origin HEAD   (자격: ctx serve git-auth · 빈 프로젝트인지 확인)`)
      // install.sh 처럼 부르는 쪽이 다음 할 일을 한 번에 말할 때는 뺀다
      if (process.env.CDP_QUIET_NEXT) return r.pushError ? 1 : 0
      out('')
      out('다음 —')
      out(`  혼자 · 서버 없이   ctx up "${r.dest}"            화면 · MCP · 토큰까지 한 번에(--install <코드 폴더> 로 작업 레포도)`)
      out(`  팀 서버            서버의 레포 폴더(--root) 아래에 두면 1분 안에 화면 · MCP 에 선다 — 사람 · 큐레이터는 콘솔 › 사람`)
      if (!r.origin) out(`  원격               git -C "${r.dest}" remote add origin <url> && git -C "${r.dest}" push -u origin HEAD   (또는 콘솔 「origin 연결」)`)
      return r.pushError ? 1 : 0
    }

    if (sub === 'list') {
      const root = opt.root || arg
      if (!root) {
        err('ctx repo list --root <폴더>')
        return 2
      }
      const rows = await listRepos(path.resolve(root))
      if (opt.json) {
        out(JSON.stringify(rows, null, 2))
        return 0
      }
      out(`${pad('이름', 16)}${pad('레포', 6)}${pad('git', 5)}${pad('head', 9)}${pad('미러', 8)}upstream`)
      for (const r of rows) {
        out(
          pad(r.name, 16) +
            pad(r.vocab ? 'O' : '-', 6) +
            pad(r.git ? 'O' : '-', 5) +
            pad(r.head || '-', 9) +
            pad(!r.git ? '-' : !r.upstream ? 'off' : r.ahead > 0 ? `lag ${r.ahead}` : 'ok', 8) +
            (r.upstream || '')
        )
      }
      return 0
    }

    err('ctx repo: new · list')
    return 2
  } catch (e) {
    const x = toError(e)
    err(`ctx repo: ${x.message}`)
    if (x.detail?.message) err('  ' + String(x.detail.message).split(NL).join(NL + '  '))
    return 2
  }
}
