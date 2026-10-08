// 기준선 뽑기의 순수 함수 — 옛 문서의 반영 이력 걷기 · 옮긴 글의 상대 링크. v1.0 리허설(다시 세운 dpms_wiki)에서 실측한 두 자리.

import { test } from 'node:test'
import assert from 'node:assert/strict'
import { stripHistory } from '../core/baseline.js'
import { rebaseLinks } from '../core/repopath.js'

test('stripHistory — 옛 이력 줄(**신설** · **변경** · **제기** 한 줄)과 **경과** 목록을 걷는다 · 내용 줄은 둔다', () => {
  const t = [
    '본문 첫 줄.',
    '',
    '**신설** · 2026-09-30 [`2026-0930-사업계획서분석`](../../work/2026-0930-사업계획서분석.md)',
    '**변경** · 2026-10-01 [`b`](../../work/b.md) 3 · 4 범위 밖',
    '**제기** · 2026-09-09 17:20 [`c`](../work/c.md)',
    '',
    '**경과**',
    '- 2026-10-02 [`d`](../work/d.md) 반영',
    '',
    '**해석(확정)** — 이 줄은 내용이다.',
  ].join('\n')
  assert.equal(stripHistory(t), '본문 첫 줄.\n\n**해석(확정)** — 이 줄은 내용이다.')
  // 옛 문서의 협의 · 결과(서식 예시의 내용)는 이력이 아니다
  assert.equal(stripHistory('**협의** · 2026-01-20 IE 는 제외.'), '**협의** · 2026-01-20 IE 는 제외.')
})

test('rebaseLinks — 옛 문서 자리의 상대 링크 · 그림을 새 문서 자리 기준으로 · 루트 · 스킴 · 앵커 · 코드 블록은 그대로', () => {
  const t = [
    '![개요](../../work/assets/a/fig01.png)',
    '| x | ![](../../work/assets/a/p1.png) |',
    '[기록](../../work/2026-0930-x.md#h) · [루트](/work/a.md) · [루트2](work/a.md) · [밖](http://x) · [앵커](#s)',
    '```',
    '![코드](../../work/x.png)',
    '```',
    '[이웃](BM_411_회의록.md) · [공백](<../../work/assets/a b.png>)',
  ].join('\n')
  assert.equal(
    rebaseLinks(t, 'docs/2.개발/AN_201_사업분석.md', 'docs/사업분석.md'),
    [
      '![개요](../work/assets/a/fig01.png)',
      '| x | ![](../work/assets/a/p1.png) |',
      '[기록](../work/2026-0930-x.md#h) · [루트](/work/a.md) · [루트2](work/a.md) · [밖](http://x) · [앵커](#s)',
      '```',
      '![코드](../../work/x.png)',
      '```',
      '[이웃](2.개발/BM_411_회의록.md) · [공백](<../work/assets/a b.png>)',
    ].join('\n')
  )
  // 같은 폴더로 옮기면 그대로
  assert.equal(rebaseLinks(t, 'docs/a.md', 'docs/b.md'), t)
})
