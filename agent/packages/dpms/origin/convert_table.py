# -*- coding: utf-8 -*-
"""GDI_DE_422 테이블정의서 → docs/테이블정의서.md  (03_템플릿규약 준수)"""
import sys, os, io, re
d=os.path.dirname(os.path.abspath(__file__))
exec(open(os.path.join(d,'xl.py'),encoding='utf-8').read().split("path, want =")[0])

SRC = "C:/project/DPMS/02. 개발 산출물/02. 설계(DE)/04. DB설계/03. 테이블정의/[참고] GDI_DE_422_테이블정의서.xlsx"
z, ss, names, files = load(SRC)
rs = rows(z, ss, files[names.index('GDI')])

# 블록 시작 = 1열 또는 9열이 'DB USER'
starts = [i for i, r in enumerate(rs) if r.get(1) == 'DB USER' or r.get(9) == 'DB USER']
blocks = []
for n, a in enumerate(starts):
    b = starts[n+1] if n+1 < len(starts) else len(rs)
    blocks.append(rs[a:b])

stat = dict(total=len(blocks), named=0, cols=0, asis_named=0, asis_cols=0,
            with_change=0, with_note=0, maxcol=0)
out = []
for blk in blocks:
    def cell(off, c):
        return blk[off].get(c, '') if off < len(blk) else ''
    LABELS = {'DB USER', '테이블 명(논리)', '테이블 명(물리)', 'AS-IS', 'TO-BE', '변환', ''}
    def val(off, c):
        v = cell(off, c)
        return '' if v in LABELS else v
    logi = val(1, 10); phys = val(2, 10)
    a_logi = val(1, 2); a_phys = val(2, 2)
    dbuser = val(0, 10)
    if not phys:
        continue
    stat['named'] += 1
    if a_phys: stat['asis_named'] += 1

    # 컬럼 행 — 헤더행(+3) 다음부터 '변경 대상' 전까지
    hdr_i = next((i for i, r in enumerate(blk) if r.get(9) == 'LOGICAL (COL)'), 3)
    end_i = next((i for i, r in enumerate(blk) if r.get(1) == '변경 대상'), len(blk))
    cols, acols = [], []
    for r in blk[hdr_i+1:end_i]:
        if r.get(10):
            cols.append(dict(logi=r.get(9,''), phys=r.get(10,''), key=r.get(11,''),
                             typ=r.get(12,''), nul=r.get(13,''), dft=r.get(14,''),
                             cmt=r.get(15,''), rmk=r.get(16,'')))
        if r.get(2): acols.append(r.get(2))
    stat['cols'] += len(cols); stat['asis_cols'] += len(acols)
    stat['maxcol'] = max(stat['maxcol'], len(cols))

    # 변경 이력 · 기타 특이 사항
    chg = []
    if end_i < len(blk):
        for r in blk[end_i+1:]:
            if r.get(1) == '기타 특이 사항': break
            if r.get(4) or r.get(5):
                chg.append((r.get(2,''), r.get(4,''), r.get(5,'')))
    note_i = next((i for i, r in enumerate(blk) if r.get(1) == '기타 특이 사항'), None)
    note = ''
    if note_i is not None:
        for r in blk[note_i:]:
            if r.get(1) == 'AS-IS': break          # 다음 블록 배너
            for k in sorted(r):
                if k > 1 and r[k] and r[k] not in LABELS:
                    note = r[k]; break
            if note: break
    if chg: stat['with_change'] += 1
    if note: stat['with_note'] += 1

    # ── MD ──
    out.append('## %s — %s' % (phys.lower(), logi or phys))
    out.append('<!-- applied: null -->')
    out.append('')
    head = []
    if dbuser: head.append(('DB USER', '`%s`' % dbuser))
    if a_phys: head.append(('AS-IS', '`%s`%s' % (a_phys, (' — ' + a_logi) if a_logi else '')))
    if head:
        out.append('| | |'); out.append('|---|---|')
        for k, v in head: out.append('| %s | %s |' % (k, v))
        out.append('')
    if cols:
        out.append('| 컬럼 | 타입 | NULL | 키 | 기본값 | 설명 |')
        out.append('|---|---|:--:|:--:|---|---|')
        for c in cols:
            nul = 'N' if str(c['nul']).replace(' ', '').lower().startswith('notnull') else 'Y'
            rmk = ' · '.join(x for x in (c['cmt'], c['rmk']) if x)
            desc = c['logi'] + ((' · ' + rmk) if rmk else '')
            out.append('| `%s` | %s | %s | %s | %s | %s |'
                       % (c['phys'], c['typ'], nul, c['key'], c['dft'], desc))
        out.append('')
    else:
        out.append('> ⚠ 아직 정리되지 않았습니다.'); out.append('')
    if note:
        out.append('**특이사항** — %s' % note); out.append('')
    for num, gubun, nm in chg:
        out.append('**변경** · %s %s %s' % (num, gubun, nm)); out.append('')

HEAD = """# 테이블 정의서

연구관리(RP) 스키마의 지금 상태. 섹션 하나가 테이블 하나다.

| | |
|---|---|
| 관리번호 | `GDI_DE_422` |
| 제출시기 | 설계완료 |
| 필수 제출 | 아니오 |
| 원천 | `GDI_DE_422_테이블정의서.xlsx` · `GDI` 시트 |
| 좌표 | `table:` — 값은 테이블 물리명(소문자) |

> 섹션마다 `applied` 주석이 있다. 그 작업 기록 이후에 같은 좌표를 건드린
> 작업이 있으면 파생이 남은 것이고, 그것은 오류다 — `ctx check` 가 커밋을
> 막는다.

"""
TAIL = """
---

## 작성지침

이 문서는 **연구관리 스키마의 지금 상태**다. 테이블을 바꾸면 그 섹션을 고친다.

| 항목 | 작성방법 | 필수 |
|---|---|:--:|
| 섹션 제목 | `<물리명 소문자> — <논리명>` | 필수 |
| `applied` | 이 섹션에 반영한 작업 기록 id. 없으면 `null` | 필수 |
| 컬럼 표 | TO-BE 기준. 타입은 원본 표기 그대로 | 필수 |
| AS-IS | 이관 전까지만. 끝나면 지운다 | 선택 |
| 변경 | `**변경** · 날짜 [작업기록] 무엇이` | 작업 후 필수 |
"""
dst = sys.argv[1]
os.makedirs(os.path.dirname(dst), exist_ok=True)
io.open(dst, 'w', encoding='utf-8', newline='\n').write(HEAD + '\n'.join(out) + TAIL)

print("블록 %d (이름 있는 것 %d)" % (stat['total'], stat['named']))
print("TO-BE 컬럼 %d (블록당 최대 %d)" % (stat['cols'], stat['maxcol']))
print("AS-IS 이름 있는 블록 %d · AS-IS 컬럼 %d" % (stat['asis_named'], stat['asis_cols']))
print("변경 이력이 **채워진** 블록 %d · 기타 특이사항 %d" % (stat['with_change'], stat['with_note']))
