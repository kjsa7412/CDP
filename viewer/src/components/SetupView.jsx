// 경로 지정 — 설계서 §26.1. 화면 한 장.
//
// 레포는 이미 규약대로 존재한다(§2.2 ③). 경로를 받고 그것이 맞는지 확인해
// 보여주는 것이 전부다. 마법사·자동 탐색·clone 은 전부 삭제됐다.
//
// 경로가 맞는지는 폴더 이름이 아니라 구조 검증 다섯 줄로 판단된다.
// 규약과 다르면 ⚠ 로 표시하고 그래도 열 수 있게 한다 — 프로토콜 도입
// 초기에는 규약이 덜 갖춰져 있다.

import { useEffect, useState } from 'react'
import { api } from '../lib/api.js'

const MARK = {
  ok: { icon: '✓', color: 'var(--text-2)' },
  warn: { icon: '⚠', color: 'var(--warn)' },
  none: { icon: '○', color: 'var(--text-3)' },
  x: { icon: '⛔', color: 'var(--danger)' },
}

export default function SetupView({ initialPath, onDone }) {
  const [path, setPath] = useState(initialPath || '')
  const [probe, setProbe] = useState(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState(null)

  // 입력하는 즉시 다섯 줄을 채운다
  useEffect(() => {
    if (!path.trim()) {
      setProbe(null)
      return
    }
    const t = setTimeout(() => {
      api
        .probe(path.trim())
        .then(setProbe)
        .catch(() => setProbe(null))
    }, 250)
    return () => clearTimeout(t)
  }, [path])

  const open = async () => {
    if (!path.trim()) return
    setBusy(true)
    setError(null)
    try {
      // saveState + rescan 으로는 안 된다 — 설정만 바뀌고 스캔 대상은
      // 그대로라 문서가 0건으로 남는다. 서버가 둘을 같이 옮긴다.
      await api.setRepo(path.trim())
      onDone()
    } catch (e) {
      setError(e.message || '열 수 없습니다')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div style={{ display: 'grid', placeItems: 'center', height: '100%', padding: 24, overflowY: 'auto' }}>
      <div style={{ width: 'min(620px, 100%)' }}>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: '0 0 4px' }}>지식 레포 경로</h1>
        <p style={{ color: 'var(--text-2)', margin: '0 0 20px' }}>
          경로를 붙여넣으면 규약에 맞는지 바로 확인합니다. <code>--repo</code> 인자로 넘기면 이 화면이 뜨지 않습니다.
        </p>

        <input
          value={path}
          onChange={(e) => setPath(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && probe?.ok && open()}
          placeholder="C:\project\mdviewer\sample-repo"
          spellCheck={false}
          autoFocus
          aria-label="지식 레포 경로"
          style={{
            width: '100%',
            padding: '10px 12px',
            font: '14px var(--font-mono)',
            color: 'var(--text)',
            background: 'var(--surface)',
            border: '1px solid var(--border-strong)',
            borderRadius: 'var(--r-badge)',
          }}
        />

        <div
          style={{
            marginTop: 16,
            padding: probe ? '10px 12px' : 0,
            background: probe ? 'var(--surface-2)' : 'none',
            border: probe ? '1px solid var(--border)' : 'none',
            borderRadius: 'var(--r-card)',
            minHeight: 120,
          }}
        >
          {!probe && (
            <p style={{ color: 'var(--text-3)', paddingTop: 10 }}>
              경로를 입력하면 <code>knowledge/</code> · <code>_vocab.md</code> · <code>INDEX.md</code> ·{' '}
              <code>bin/ctx</code> 를 확인합니다.
            </p>
          )}
          {probe?.rows?.map((r) => {
            const m = MARK[r.mark] || MARK.none
            return (
              <div
                key={r.name}
                style={{ display: 'flex', gap: 10, alignItems: 'baseline', padding: '3px 0', fontSize: 12.5 }}
              >
                <span style={{ color: m.color, width: 14 }}>{m.icon}</span>
                <code style={{ width: 130, color: 'var(--text)' }}>{r.name}</code>
                <span style={{ color: r.mark === 'warn' ? 'var(--warn)' : 'var(--text-2)' }}>{r.note}</span>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 16 }}>
          {error && <span style={{ fontSize: 12, color: 'var(--danger)', flex: 1 }}>⛔ {error}</span>}
          <span style={{ fontSize: 11.5, color: 'var(--text-3)', flex: error ? 0 : 1 }}>
            ✓ 규약대로 있음 · ⚠ 있지만 문제 있음 · ○ 없음(선택 항목).{' '}
            {probe?.ok && '⚠ 나 ○ 가 있어도 열 수 있습니다.'}
          </span>
          <button
            onClick={open}
            disabled={!probe?.ok || busy}
            style={{
              padding: '7px 18px',
              fontWeight: 600,
              color: probe?.ok ? '#fff' : 'var(--text-3)',
              background: probe?.ok ? 'var(--accent)' : 'var(--surface-3)',
              borderRadius: 'var(--r-badge)',
              cursor: probe?.ok ? 'pointer' : 'not-allowed',
            }}
          >
            {busy ? '읽는 중…' : '열기'}
          </button>
        </div>
      </div>
    </div>
  )
}
