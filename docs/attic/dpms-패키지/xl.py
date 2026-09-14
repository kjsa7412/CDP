# -*- coding: utf-8 -*-
"""시트 하나를 정확히 본다 — 병합 헤더 · 전체 컬럼 · 데이터 행수 · 표본."""
import sys, zipfile, re
from xml.etree import ElementTree as ET
NS = '{http://schemas.openxmlformats.org/spreadsheetml/2006/main}'

def colnum(ref):
    m = re.match(r'([A-Z]+)', ref or '')
    if not m: return None
    n = 0
    for ch in m.group(1): n = n*26 + (ord(ch)-64)
    return n

def load(path):
    z = zipfile.ZipFile(path)
    ss = []
    if 'xl/sharedStrings.xml' in z.namelist():
        for si in ET.fromstring(z.read('xl/sharedStrings.xml')):
            ss.append(''.join(t.text or '' for t in si.iter() if t.tag == NS+'t'))
    wb = ET.fromstring(z.read('xl/workbook.xml'))
    names = [s.get('name') for s in wb.iter() if s.tag == NS+'sheet']
    files = sorted([n for n in z.namelist() if re.match(r'xl/worksheets/sheet\d+\.xml$', n)],
                   key=lambda x: int(re.search(r'(\d+)', x).group(1)))
    return z, ss, names, files

def rows(z, ss, f, limit=None):
    root = ET.fromstring(z.read(f))
    out = []
    for r in root.iter():
        if r.tag != NS+'row': continue
        cells = {}
        for c in r:
            t = c.get('t'); v = None
            for ch in c:
                if ch.tag == NS+'v': v = ch.text
                if ch.tag == NS+'is': v = ''.join(x.text or '' for x in ch.iter() if x.tag == NS+'t')
            if v is None: continue
            if t == 's':
                try: v = ss[int(v)]
                except: pass
            cn = colnum(c.get('r'))
            if cn: cells[cn] = (v or '').replace('\n', ' ').strip()
        out.append(cells)
        if limit and len(out) >= limit: break
    return out

def merges(z, f):
    root = ET.fromstring(z.read(f))
    return [m.get('ref') for m in root.iter() if m.tag == NS+'mergeCell']

path, want = sys.argv[1], (sys.argv[2] if len(sys.argv) > 2 else None)
head_n = int(sys.argv[3]) if len(sys.argv) > 3 else 3
samp_n = int(sys.argv[4]) if len(sys.argv) > 4 else 3
z, ss, names, files = load(path)
print("시트:", " | ".join(names))
for i, f in enumerate(files):
    sn = names[i] if i < len(names) else f
    if want and sn != want: continue
    rs = rows(z, ss, f)
    nonempty = [r for r in rs if r]
    print("\n" + "="*90)
    print("[%s]  행 %d (비어있지 않은 행 %d)" % (sn, len(rs), len(nonempty)))
    mg = merges(z, f)
    if mg: print("병합 %d개 — 앞 12: %s" % (len(mg), " ".join(mg[:12])))
    for j, r in enumerate(nonempty[:head_n]):
        print(" H%d| " % (j+1) + "  ".join("%s:%s" % (k, r[k]) for k in sorted(r)))
    print(" ---")
    for r in nonempty[head_n:head_n+samp_n]:
        print(" D | " + "  ".join("%s:%s" % (k, r[k]) for k in sorted(r)))
