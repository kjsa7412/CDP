// 변환(core/convert.js) — docx · xlsx · pptx · hwpx 를 Node 로 md 로 · 밖의 도구가 없으면 들이지 않는다. 지식 생성 · 작업실 검토 G8.
// 시험 파일은 core/zip.js 로 그 자리에서 짓는다(바이너리 픽스처를 레포에 두지 않는다).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { zip } from '../core/zip.js'
import { convertFile, parseXml, mdTable } from '../core/convert.js'

const PNG = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c6360000002000154a24f5d0000000049454e44ae426082', 'hex')
const W = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="r" xmlns:a="a"'
const p = (text, extra = '') => `<w:p><w:pPr>${extra}</w:pPr><w:r><w:t xml:space="preserve">${text}</w:t></w:r></w:p>`

async function tmp(name, entries) {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-conv-'))
  const f = path.join(d, name)
  await fs.writeFile(f, await zip(entries.map(([n, data]) => ({ name: n, data: Buffer.isBuffer(data) ? data : Buffer.from(data) }))))
  return { f, rm: () => fs.rm(d, { recursive: true, force: true }) }
}

test('parseXml · mdTable — 엔티티 · 빈 요소 · 표의 | 와 줄바꿈', () => {
  const t = parseXml('<a x="1 &amp; 2"><b/>글 &lt;3&gt; &#xAC00;</a>')
  assert.equal(t.kids[0].attrs.x, '1 & 2')
  assert.equal(t.kids[0].kids[1], '글 <3> 가')
  assert.equal(mdTable([['a', 'b|c'], ['1\n2']]), ['| a | b\\|c |', '| --- | --- |', '| 1<br>2 |  |'].join('\n'))
})

test('docx — 제목(스타일 이름) · 문단 · 목록 · 표 · 그림 · 핵심 속성의 제목', async () => {
  const styles = `<w:styles ${W}><w:style w:styleId="1"><w:name w:val="heading 1"/></w:style><w:style w:styleId="a3"><w:name w:val="제목 2"/></w:style></w:styles>`
  const doc = `<w:document ${W}><w:body>
    ${p('정산 회의', '<w:pStyle w:val="1"/>')}
    ${p('한도를 &lt;올린다&gt;.')}
    ${p('세부', '<w:pStyle w:val="a3"/>')}
    ${p('첫째', '<w:numPr><w:ilvl w:val="0"/></w:numPr>')}
    ${p('둘째', '<w:numPr><w:ilvl w:val="1"/></w:numPr>')}
    <w:tbl><w:tr><w:tc>${p('항목')}</w:tc><w:tc>${p('값')}</w:tc></w:tr><w:tr><w:tc>${p('한도')}</w:tc><w:tc>${p('10MB')}</w:tc></w:tr></w:tbl>
    <w:p><w:r><w:drawing><a:blip r:embed="rId5"/></w:drawing></w:r></w:p>
  </w:body></w:document>`
  const rels = '<Relationships><Relationship Id="rId5" Type="image" Target="media/image1.png"/></Relationships>'
  const core = '<cp:coreProperties xmlns:cp="cp" xmlns:dc="dc"><dc:title>정산 회의록</dc:title></cp:coreProperties>'
  const t = await tmp('회의.docx', [['word/document.xml', doc], ['word/styles.xml', styles], ['word/_rels/document.xml.rels', rels], ['word/media/image1.png', PNG], ['docProps/core.xml', core]])
  try {
    const r = await convertFile(t.f)
    assert.equal(r.title, '정산 회의록')
    assert.match(r.md, /^# 정산 회의$/m)
    assert.match(r.md, /^한도를 <올린다>\.$/m)
    assert.match(r.md, /^## 세부$/m)
    assert.match(r.md, /^- 첫째$/m)
    assert.match(r.md, /^ {2}- 둘째$/m)
    assert.match(r.md, /^\| 항목 \| 값 \|$/m)
    assert.match(r.md, /^\| 한도 \| 10MB \|$/m)
    assert.match(r.md, /!\[\]\(image1\.png\)/)
    assert.deepEqual(r.images.map((x) => x.name), ['image1.png'])
  } finally {
    await t.rm()
  }
})

test('xlsx — 시트마다 표 · 공유 글 · 숨긴 시트는 뺀다 · 빈 열 자리', async () => {
  const wb = '<workbook xmlns:r="r"><sheets><sheet name="코드" r:id="rId1"/><sheet name="숨김" state="hidden" r:id="rId2"/></sheets></workbook>'
  const rels = '<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/></Relationships>'
  const ss = '<sst><si><t>코드</t></si><si><t>이름</t></si><si><r><t>사</t></r><r><t>용</t></r></si></sst>'
  const s1 = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="C1" t="s"><v>1</v></c></row><row r="2"><c r="A2"><v>10</v></c><c r="C2" t="s"><v>2</v></c></row></sheetData></worksheet>'
  const t = await tmp('코드표.xlsx', [['xl/workbook.xml', wb], ['xl/_rels/workbook.xml.rels', rels], ['xl/sharedStrings.xml', ss], ['xl/worksheets/sheet1.xml', s1], ['xl/worksheets/sheet2.xml', s1]])
  try {
    const r = await convertFile(t.f)
    assert.match(r.md, /^## 코드$/m)
    assert.ok(!r.md.includes('## 숨김'))
    assert.match(r.md, /^\| 코드 \|  \| 이름 \|$/m)
    assert.match(r.md, /^\| 10 \|  \| 사용 \|$/m)
  } finally {
    await t.rm()
  }
})

test('pptx — 슬라이드 순서 · 제목 자리 · 본문은 목록', async () => {
  const pres = '<p:presentation xmlns:p="p" xmlns:r="r"><p:sldIdLst><p:sldId r:id="rId2"/><p:sldId r:id="rId1"/></p:sldIdLst></p:presentation>'
  const rels = '<Relationships><Relationship Id="rId1" Target="slides/slide1.xml"/><Relationship Id="rId2" Target="slides/slide2.xml"/></Relationships>'
  const slide = (title, body) => `<p:sld xmlns:p="p" xmlns:a="a"><p:sp><p:nvSpPr><p:nvPr><p:ph type="title"/></p:nvPr></p:nvSpPr><p:txBody><a:p><a:r><a:t>${title}</a:t></a:r></a:p></p:txBody></p:sp><p:sp><p:txBody><a:p><a:r><a:t>${body}</a:t></a:r></a:p></p:txBody></p:sp></p:sld>`
  const t = await tmp('보고.pptx', [['ppt/presentation.xml', pres], ['ppt/_rels/presentation.xml.rels', rels], ['ppt/slides/slide1.xml', slide('둘째', '나중')], ['ppt/slides/slide2.xml', slide('첫째', '먼저')]])
  try {
    const r = await convertFile(t.f)
    assert.equal(r.title, '첫째')
    assert.ok(r.md.indexOf('## 1. 첫째') < r.md.indexOf('## 2. 둘째'), '목록 순서')
    assert.match(r.md, /^- 먼저$/m)
  } finally {
    await t.rm()
  }
})

test('hwpx — 문단 · 표', async () => {
  const sec = '<hs:sec xmlns:hs="hs" xmlns:hp="hp"><hp:p><hp:run><hp:t>업무 협의</hp:t></hp:run></hp:p><hp:p><hp:run><hp:tbl><hp:tr><hp:tc><hp:subList><hp:p><hp:run><hp:t>가</hp:t></hp:run></hp:p></hp:subList></hp:tc><hp:tc><hp:subList><hp:p><hp:run><hp:t>나</hp:t></hp:run></hp:p></hp:subList></hp:tc></hp:tr></hp:tbl></hp:run></hp:p></hs:sec>'
  const t = await tmp('협의.hwpx', [['Contents/section0.xml', sec], ['mimetype', 'application/hwp+zip']])
  try {
    const r = await convertFile(t.f)
    assert.match(r.md, /^업무 협의$/m)
    assert.match(r.md, /^\| 가 \| 나 \|$/m)
    assert.equal(r.title, '업무 협의')
  } finally {
    await t.rm()
  }
})

test('밖의 도구가 없으면 · 깨진 파일 — E_CONVERT(들이지 않는다)', async () => {
  const d = await fs.mkdtemp(path.join(os.tmpdir(), 'cdp-conv-'))
  try {
    await fs.writeFile(path.join(d, 'a.pdf'), '%PDF-1.4\n')
    await fs.writeFile(path.join(d, 'a.hwp'), 'x')
    await fs.writeFile(path.join(d, 'a.docx'), 'not zip')
    await assert.rejects(convertFile(path.join(d, 'a.pdf'), { have: {} }), (e) => e.code === 'E_CONVERT' && /pdftotext/.test(e.message))
    await assert.rejects(convertFile(path.join(d, 'a.hwp'), { have: {} }), (e) => e.code === 'E_CONVERT' && /soffice/.test(e.message))
    await assert.rejects(convertFile(path.join(d, 'a.docx')), (e) => e.code === 'E_CONVERT' && /zip/.test(e.message))
  } finally {
    await fs.rm(d, { recursive: true, force: true })
  }
})
