// core/tar — 서버 산출물을 우리가 싼다(제품화 2 S1 — macOS bsdtar 가 한글 이름을 NFD 로 쌌다).

import { test } from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { spawnSync } from 'node:child_process'
import { packTar, packDir, unpackTar, extractTar } from '../core/tar.js'

const nfd = (s) => s.normalize('NFD')

test('packTar · unpackTar — 한글 이름은 NFC 로 · 긴 이름 · 실행 비트 · 디렉터리', () => {
  const long = 'a/' + 'b'.repeat(150) + '.txt'
  const buf = packTar([
    { name: 'p', dir: true },
    { name: nfd('p/manual/사용자_설명서.md'), data: Buffer.from('# 사용자') },
    { name: 'p/bin/ctx', data: Buffer.from('#!/bin/sh\n'), mode: 0o755 },
    { name: long, data: Buffer.from('x') },
  ])
  const got = unpackTar(buf)
  const names = got.map((e) => e.name)
  assert.ok(names.includes('p/manual/사용자_설명서.md'))
  assert.equal(names.find((n) => n.includes('설명서')), 'p/manual/사용자_설명서.md'.normalize('NFC'))
  assert.ok(names.includes(long))
  assert.equal(got.find((e) => e.name === 'p/bin/ctx').mode & 0o100, 0o100)
  assert.ok(got.find((e) => e.name === 'p').dir)
})

test('packDir → 시스템 tar 가 같은 이름(NFC)으로 푼다', (t) => {
  if (spawnSync('tar', ['--version']).status !== 0) return t.skip('tar 없음')
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tar-'))
  const src = path.join(tmp, 'src')
  fs.mkdirSync(path.join(src, 'kit'), { recursive: true })
  fs.writeFileSync(path.join(src, 'kit', 'CLAUDE-프로젝트레포.md'), '블록')
  fs.writeFileSync(path.join(tmp, 'a.tar.gz'), packDir(src, 'cdp-server-v9'))
  // 시스템 tar 가 푼다 — macOS bsdtar 는 풀 때 디스크 이름을 NFD 로 바꿀 수 있으니 NFC 로 견준다(읽는 쪽 readNfc 와 같은 규칙)
  const sys = path.join(tmp, 'sys')
  fs.mkdirSync(sys)
  assert.equal(spawnSync('tar', ['-xzf', path.join(tmp, 'a.tar.gz'), '-C', sys]).status, 0)
  assert.deepEqual(fs.readdirSync(path.join(sys, 'cdp-server-v9', 'kit')).map((n) => n.normalize('NFC')), ['CLAUDE-프로젝트레포.md'])
  const out = path.join(tmp, 'out')
  fs.mkdirSync(out)
  extractTar(fs.readFileSync(path.join(tmp, 'a.tar.gz')), out)
  assert.equal(fs.readFileSync(path.join(out, 'cdp-server-v9', 'kit', 'CLAUDE-프로젝트레포.md'), 'utf8'), '블록')
  fs.rmSync(tmp, { recursive: true, force: true })
})

test('extractTar — 밖으로 나가는 이름은 거절', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cdp-tar-'))
  assert.throws(() => extractTar(packTar([{ name: '../evil', data: Buffer.from('x') }]), tmp), /밖으로/)
  fs.rmSync(tmp, { recursive: true, force: true })
})
