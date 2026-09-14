# -*- coding: utf-8 -*-
"""운영 이슈 관리대장(CSV) → 위험및이슈관리대장 관리문서 섹션.

**좌표를 붙이지 않는다.** 운영 이슈는 대개 며칠 안에 닫히는데, 그것마다
`issue:` 좌표를 등재하면 어휘가 단명하는 이름으로 찬다 -- 어휘는 6개월 뒤에도
같은 대상을 가리켜야 하는 이름표다(등록부_관리문서16종).

좌표를 갖는 것은 **결정이 필요해서 오래 남는 것**뿐이고, 그것은 사람이
`ISS-nnn` 으로 따로 올린다.

대신 **화면ID 가 어휘에 있으면 좌표 표기로 쓴다** -- 본문 좌표 링크가 걸려
그 화면의 지금 상태로 바로 갈 수 있다. 그게 이 반영의 값어치다.

    python ops/lib/import_ops_issues.py <csv> <repo>
"""
import csv
import io
import os
import re
import sys
import collections

BR = chr(10)
OPEN_ST = ('', '진행중', '확인필요', '진행검토')     # 아직 안 닫힌 것
DROP_ST = ('논이슈', '재현불가', '처리불가')          # 닫혔지만 조치가 없는 것


def cut(s, n):
    s = re.sub(r'\s+', ' ', (s or '').strip())
    s = s.replace('|', '/')          # 표를 깨뜨린다
    return s if len(s) <= n else s[: n - 1] + '…'


def main():
    csv_path = sys.argv[1]
    repo = sys.argv[2]
    raw = io.open(csv_path, 'rb').read()
    text = raw.decode('utf-8-sig')
    rows = list(csv.reader(io.StringIO(text)))
    hdr = rows[0]
    C = {n: i for i, n in enumerate(hdr)}
    # 1행은 `ex)` 예시다. 데이터가 아니다.
    data = [r for r in rows[2:] if any((c or '').strip() for c in r)]

    # 어휘에 있는 화면 좌표만 좌표 표기로 쓴다. 없는 것을 좌표처럼 쓰면
    # `_vocab.md 미등재` 로 커밋이 막힌다 -- 본문은 검사 대상이 아니지만
    # 사람이 그것을 좌표로 믿는 것이 더 나쁘다.
    voc = io.open(os.path.join(repo, '_vocab.md'), encoding='utf-8').read()
    known = set(re.findall(r'`screen:([A-Za-z0-9_]+)`', voc))

    # **백틱을 쓰지 않는다.** 본문 좌표 링크는 `CODE` 안을 건너뛴다(코드
    # 스팬은 글자 그대로여야 하니 맞는 동작이다). 백틱으로 감싸면 좌표처럼
    # 보이기만 하고 눌러도 아무 일이 없다 -- 실측에서 링크 0개였다.
    def scr(v):
        v = (v or '').strip()
        if not v:
            return '—'
        return ('screen:%s' % v) if v in known else v

    def st(r):
        return re.sub(r'\s+', ' ', (r[C['처리상태']] or '').strip())

    opened = [r for r in data if st(r) in OPEN_ST]
    closed = [r for r in data if st(r) not in OPEN_ST]

    out = []
    a = out.append
    a('## 운영 이슈 — GDI_TR_221 안정화')
    a('')
    a('> 출처 `GDI_TR_221_안정화_운영이슈_관리대장`. 현업이 유지하는 시트를 이')
    a('> 문서로 반영한 것이다.')
    a('>')
    a('> **좌표를 붙이지 않는다.** 운영 이슈는 대개 며칠 안에 닫히는데 그것마다')
    a('> `issue:` 를 등재하면 어휘가 단명하는 이름으로 찬다. 좌표를 갖는 것은')
    a('> 위의 `ISS-nnn` -- **결정이 필요해서 오래 남는 것**뿐이다.')
    a('>')
    a('> 화면ID 가 어휘에 있으면 좌표로 적었다. 눌러서 그 화면의 지금 상태로')
    a('> 갈 수 있다.')
    a('')

    a('### 현황')
    a('')
    a('| | 건 |')
    a('|---|---:|')
    a('| 전체 | %d |' % len(data))
    a('| **열려 있는 것** | **%d** |' % len(opened))
    a('| 닫힌 것 | %d |' % len(closed))
    a('')
    by = collections.Counter((r[C['업무구분']] or '(미지정)').strip() or '(미지정)' for r in opened)
    a('열린 것의 업무구분 — ' + ' · '.join('%s %d' % (k, v) for k, v in by.most_common()))
    a('')

    a('### 열려 있는 것 %d건' % len(opened))
    a('')
    a('**상태가 빈 것은 아직 아무도 잡지 않은 것이다.** 담당이 비어 있으면')
    a('그것부터 정해야 한다.')
    a('')
    a('| 번호 | 등록일 | 업무 | 화면 | 내용 | 담당 | 상태 |')
    a('|---:|---|---|---|---|---|---|')
    for r in sorted(opened, key=lambda x: ((x[C['등록일']] or ''), x[C['번호']])):
        a('| %s | %s | %s | %s | %s | %s | %s |' % (
            cut(r[C['번호']], 6), cut(r[C['등록일']], 10) or '—',
            cut(r[C['업무구분']], 12) or '—', scr(r[C['화면ID']]),
            cut(r[C['오류내용']], 78) or '—',
            cut(r[C['처리담당자']], 8) or '**미정**',
            st(r) or '**미착수**'))
    a('')

    a('### 닫힌 것 %d건' % len(closed))
    a('')
    a('**지운 것이 아니라 닫은 것이다.** 같은 증상이 다시 오면 여기를 먼저 본다')
    a('-- 재발인지 신규인지가 조치내용에서 갈린다.')
    a('')
    a('| 번호 | 등록일 | 업무 | 화면 | 내용 | 조치 | 완료일 |')
    a('|---:|---|---|---|---|---|---|')
    for r in sorted(closed, key=lambda x: ((x[C['등록일']] or ''), x[C['번호']])):
        s = st(r)
        mark = '' if s == '완료' else ' *(%s)*' % s
        a('| %s | %s | %s | %s | %s | %s%s | %s |' % (
            cut(r[C['번호']], 6), cut(r[C['등록일']], 10) or '—',
            cut(r[C['업무구분']], 12) or '—', scr(r[C['화면ID']]),
            cut(r[C['오류내용']], 60) or '—',
            cut(r[C['조치내용']], 60) or '—', mark,
            cut(r[C['조치완료일']], 10) or '—'))
    a('')

    body = BR.join(out)

    # 문서에 끼워 넣는다. 이미 있으면 그 절만 교체한다 -- **덧붙이지 않는다.**
    doc_path = os.path.join(repo, 'docs', '위험및이슈관리대장.md')
    cur = io.open(doc_path, encoding='utf-8', newline='').read()
    crlf = ('\r' + BR) in cur
    cur = cur.replace('\r' + BR, BR)
    mark = '## 운영 이슈 — GDI_TR_221 안정화'
    if mark in cur:
        head = cur[: cur.index(mark)]
        new = head + body
    else:
        new = cur.rstrip(BR) + BR * 2 + body
    io.open(doc_path, 'w', encoding='utf-8',
            newline=('\r' + BR) if crlf else BR).write(new.rstrip(BR) + BR)

    print('반영: %s' % doc_path)
    print('  전체 %d · 열림 %d · 닫힘 %d' % (len(data), len(opened), len(closed)))
    print('  좌표로 연결된 화면 %d개' % len({(r[C['화면ID']] or '').strip()
                                        for r in data
                                        if (r[C['화면ID']] or '').strip() in known}))


if __name__ == '__main__':
    main()
