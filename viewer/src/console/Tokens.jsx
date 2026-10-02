// 토큰 — 신원만 증명한다. 권한은 사람에게 있다. 제품관리서비스 검토 §4.7 · 검토 v0.1 §3.4.
//
// 원문은 발급 · 재발급 응답에 **한 번** 온다 — 모달에 크게 보이고 닫으면 다시 못 본다.
// 잃었다 → **재발급 한 동작**(폐기 + 발급). 폐기한 행은 회색으로 남는다 — 이력이다.
// 원문 보관 · 재배정은 없다(D6).

import { useEffect, useMemo, useState } from 'react'
import { admin } from '../lib/api.js'
import { invalidate, useResource } from '../lib/cache.js'
import { navigate } from '../lib/router.jsx'
import Icon from '../components/Icon.jsx'
import { useSudo, CANCELLED } from './Console.jsx'
import { PageHead, Toolbar, Search, Note, Modal, Field, Seg, Chip, Confirm, Prompt, TokenReveal, when, daysText } from './ui.jsx'

export default function Tokens({ me, say, route }) {
  const withSudo = useSudo()
  const [q, setQ] = useState('')
  const [activeOnly, setActiveOnly] = useState(false)
  const [issuing, setIssuing] = useState(null) // { user }
  const [reveal, setReveal] = useState(null)
  const [confirm, setConfirm] = useState(null) // { kind: 'reissue'|'revoke', t }
  const [prompt, setPrompt] = useState(null) // { kind: 'note'|'expires', t }
  const [busy, setBusy] = useState(false)

  const { data, error, refresh: load } = useResource('/admin/tokens', admin.tokens)
  useEffect(() => {
    if (error) say(error.message, 6000)
  }, [error, say])
  // 사용자 페이지의 [발급] 이 `?user=` 를 들고 온다 — **한 번 열고 주소에서 지운다.** 전에는 쿼리가 남아, 발급 · 재발급 ·
  // 만료 창을 닫을 때마다(목록을 다시 읽을 때마다) 발급 창이 또 떴고 한 번 더 누르면 토큰이 하나 더 생겼다(실서버 종합 시험 F3)
  useEffect(() => {
    const u = route.query.get('user')
    if (!u || !data) return
    setIssuing({ user: u })
    navigate('/console/tokens', { replace: true })
  }, [route.query, data])

  const act = async (fn, ok) => {
    setBusy(true)
    try {
      const r = await withSudo(fn)
      if (ok) say(ok)
      invalidate('/admin/')
      await load()
      return r || true
    } catch (e) {
      if (e.message !== CANCELLED) say(e.message, 6000)
      return null
    } finally {
      setBusy(false)
    }
  }

  const rows = useMemo(() => {
    if (!data) return []
    const k = q.trim().toLowerCase()
    return data.tokens.filter((t) => (!activeOnly || t.status === 'active') && (!k || t.user.toLowerCase().includes(k) || (t.note || '').toLowerCase().includes(k) || t.id.includes(k)))
  }, [data, q, activeOnly])

  if (!data) return <span className="amuted">읽는 중…</span>
  const nActive = data.tokens.filter((t) => t.status === 'active').length
  // 만료 기본은 **토큰 주인의 역할**이 정한다 — 전에는 「내 토큰이면 30」 이라 writer 토큰 창에도 관리자 문구가 나왔다(F12)
  const roleOf = (name) => data.users.find((u) => u.name === name)?.role || null
  const defaultDays = (name) => (roleOf(name) === 'admin' ? 30 : 90)

  return (
    <>
      <PageHead title="토큰" sub="신원만 증명한다 — 권한은 사람에게 있다. 원문은 발급 때 한 번, 잃으면 재발급">
        <button className="btn btn--accent btn--sm" onClick={() => setIssuing({ user: '' })}>
          <Icon name="plus" size={13} /> 발급
        </button>
      </PageHead>

      <Toolbar>
        <Search value={q} onChange={setQ} placeholder="사용자 · 메모 · id" />
        <label className="tchk">
          <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)} /> 활성만
        </label>
        <span className="sp" />
        <span className="tcount">
          {data.tokens.length}개 · 활성 {nActive} · 폐기 {data.tokens.length - nActive}
        </span>
      </Toolbar>

      <section className="acard acard--table">
        <div className="acard__body">
          <table className="ctable">
            <thead>
              <tr>
                <th>id</th>
                <th>사용자</th>
                <th>메모</th>
                <th>발급</th>
                <th>만료</th>
                <th>마지막 사용</th>
                <th>상태</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="dim">해당하는 토큰이 없다</td>
                </tr>
              )}
              {rows.map((t) => {
                const off = t.status === 'revoked'
                const soon = !off && t.daysLeft !== null && t.daysLeft <= 7
                return (
                  <tr key={t.id} className={off ? 'is-off' : undefined}>
                    <td className="mono">{t.id}</td>
                    <td>
                      <span className="name">{t.user}</span>
                    </td>
                    <td>{t.note || <span className="dim">—</span>}</td>
                    <td className="dim nowrap">{t.issued || '—'}</td>
                    <td>
                      {soon ? (
                        <span className="awarn">
                          <Icon name="warn" size={12} /> <span className="nowrap">{t.expires}</span> · <span className="nowrap">{daysText(t)}</span>
                        </span>
                      ) : (
                        <>
                          <span className="nowrap">{t.expires === 'never' ? '무기한' : t.expires}</span>{' '}
                          {t.expires !== 'never' && <span className="dim nowrap">· {daysText(t)}</span>}
                        </>
                      )}
                    </td>
                    <td className="dim">{t.lastUsed ? when(t.lastUsed) : '—'}</td>
                    <td>
                      {off ? (
                        <Chip kind="off">
                          폐기 · {t.revokedAt || ''} {t.revokedBy || ''}
                        </Chip>
                      ) : soon ? (
                        <Chip kind="warn">만료 임박</Chip>
                      ) : (
                        <Chip>활성</Chip>
                      )}
                    </td>
                    <td>
                      <div className="rowact">
                        {!off && (
                          <>
                            <button className="abtn" onClick={() => setConfirm({ kind: 'reissue', t })}>재발급</button>
                            <button className="abtn" onClick={() => setPrompt({ kind: 'expires', t })} title="만료 바꾸기 — 늘리거나 줄인다">만료</button>
                          </>
                        )}
                        <button className="abtn" onClick={() => setPrompt({ kind: 'note', t })}>메모</button>
                        {!off && (
                          <button className="abtn abtn--warn" onClick={() => setConfirm({ kind: 'revoke', t })}>폐기</button>
                        )}
                      </div>
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
      </section>
      <Note>
        <b>원문은 어디에도 저장되지 않는다.</b> 표의 id 는 해시 앞 8자다. 폐기한 행은 회색으로 남는다 — "이 사람 토큰이 언제 있었나" 가 이력이다. 관리자 토큰은 기본 30일, 나머지는 90일.
      </Note>

      {issuing && (
        <Issue
          users={data.users}
          initialUser={issuing.user}
          busy={busy}
          onClose={() => setIssuing(null)}
          onOk={async (body) => {
            const r = await act(() => admin.tokenIssue(body), null)
            if (r?.raw) {
              setIssuing(null)
              setReveal(r)
            }
          }}
        />
      )}
      {reveal && <TokenReveal data={reveal} onClose={() => setReveal(null)} />}

      {confirm?.kind === 'reissue' && (
        <Confirm
          title="재발급"
          text={`${confirm.t.user} 의 토큰 ${confirm.t.id} 를 폐기하고 새 토큰을 발급합니다 — 한 동작입니다. 새 토큰의 만료는 역할 기본(${defaultDays(confirm.t.user)}일)이고, 바꾸려면 발급 뒤 [만료] 로. 사용자는 CDP_TOKEN 만 바꿉니다. 권한은 사람에 붙어 있어 잃는 것이 없습니다.`}
          okLabel="폐기하고 새로 발급"
          busy={busy}
          onClose={() => setConfirm(null)}
          onOk={async () => {
            const r = await act(() => admin.tokenReissue(confirm.t.id), null)
            if (r?.raw) {
              setConfirm(null)
              setReveal(r)
            }
          }}
        />
      )}
      {confirm?.kind === 'revoke' && (
        <Confirm
          title="폐기"
          text={`${confirm.t.user} 의 토큰 ${confirm.t.id} 를 폐기합니다. 다음 요청부터 막히고, 줄은 회색으로 남습니다. 되돌릴 수 없습니다 — 다시 쓰려면 새로 발급합니다.`}
          okLabel="폐기"
          danger
          busy={busy}
          onClose={() => setConfirm(null)}
          onOk={async () => (await act(() => admin.tokenRevoke(confirm.t.id), `${confirm.t.id} 폐기했다`)) && setConfirm(null)}
        />
      )}
      {prompt?.kind === 'note' && (
        <Prompt
          title={`메모 — ${prompt.t.user} · ${prompt.t.id}`}
          label="메모"
          hint="기기마다 하나씩 발급하고 메모를 붙인다 — 하나를 잃으면 그것만 폐기한다"
          initial={prompt.t.note || ''}
          busy={busy}
          onClose={() => setPrompt(null)}
          onOk={async (v) => (await act(() => admin.tokenSet(prompt.t.id, { note: v.trim() }), '메모를 고쳤다')) && setPrompt(null)}
        />
      )}
      {prompt?.kind === 'expires' && (
        <Prompt
          title={`만료 — ${prompt.t.user} · ${prompt.t.id}`}
          label="만료"
          hint="일수(예: 90) · 날짜(YYYY-MM-DD) · never. 지금부터 센다."
          initial={String(defaultDays(prompt.t.user))}
          mono
          busy={busy}
          onClose={() => setPrompt(null)}
          onOk={async (v) => {
            const x = v.trim()
            const expires = x === 'never' ? 'never' : /^\d{4}-\d{2}-\d{2}$/.test(x) ? x : Number(x)
            return (await act(() => admin.tokenSet(prompt.t.id, { expires }), '만료를 고쳤다')) && setPrompt(null)
          }}
        >
          <Note>
            지금 만료 {prompt.t.expires === 'never' ? '무기한' : prompt.t.expires}.
            {roleOf(prompt.t.user) === 'admin' ? ' 관리자 토큰은 30일 안으로 둔다.' : ` 기본은 ${defaultDays(prompt.t.user)}일.`}
          </Note>
        </Prompt>
      )}
    </>
  )
}

function Issue({ users, initialUser, busy, onClose, onOk }) {
  // 기본은 **아무도 아니다** — 전에는 명부 첫 사람(대개 나)이라, 사람을 안 고르고 누르면 엉뚱한 사람 토큰이 나왔다(F13)
  const [user, setUser] = useState(initialUser && users.some((u) => u.name === initialUser) ? initialUser : '')
  const [note, setNote] = useState('')
  const [exp, setExp] = useState('default')
  const [days, setDays] = useState('')
  const u = users.find((x) => x.name === user)
  const dflt = u?.role === 'admin' ? 30 : 90
  const body = () => {
    const b = { user, note: note.trim() || null }
    if (exp === '30') b.expiresDays = 30
    else if (exp === '90') b.expiresDays = 90
    else if (exp === 'never') b.expiresDays = 'never'
    else if (exp === 'custom') b.expiresDays = Number(days)
    return b
  }
  const ok = user && (exp !== 'custom' || Number(days) > 0)
  return (
    <Modal
      title="토큰 발급"
      onClose={onClose}
      foot={
        <>
          <span className="amuted" style={{ fontSize: 11.5 }}>원문은 다음 화면에 한 번 보인다 · 재인증</span>
          <span className="sp" />
          <button className="abtn" onClick={onClose}>취소</button>
          <button className="abtn abtn--accent" disabled={busy || !ok} onClick={() => onOk(body())}>
            발급
          </button>
        </>
      }
    >
      <Field label="사용자">
        <select value={user} onChange={(e) => setUser(e.target.value)}>
          <option value="" disabled>
            — 사람을 고른다 —
          </option>
          {users.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}
              {x.label ? ` — ${x.label}` : ''} ({x.role})
            </option>
          ))}
        </select>
      </Field>
      <Field label="메모" hint="기기마다 하나씩 발급한다. 하나를 잃으면 그것만 폐기한다.">
        <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="기기 — 노트북 · 폐쇄망 PC …" />
      </Field>
      <Field label="만료" hint={`기본은 역할이 정한다 — ${u?.role === 'admin' ? 'admin 30일' : '90일'}. 무기한은 감시용 계정에만.`}>
        {/* 단추 순서는 **고정**이다 — 전에는 역할마다 30 · 90 자리가 바뀌어 손이 엉뚱한 것을 눌렀다(F13). 「기본」 꼬리표만 옮긴다.
            사람을 바꾸면 고르지 않은 동안은 그 사람의 기본을 따라간다('default') */}
        <Seg
          value={exp === 'default' ? String(dflt) : exp}
          onChange={setExp}
          options={[
            ['30', '30일', dflt === 30 ? '기본' : undefined],
            ['90', '90일', dflt === 90 ? '기본' : undefined],
            ['custom', '일수…'],
            ['never', '무기한'],
          ]}
        />
        {exp === 'custom' && <input className="mono" style={{ marginTop: 6 }} value={days} onChange={(e) => setDays(e.target.value)} placeholder="일수" />}
      </Field>
    </Modal>
  )
}
