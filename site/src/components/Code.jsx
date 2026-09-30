// 코드 조각 — JSON 은 줄을 맞춰 보이고 키 · 문자열 · 오류 코드만 옅게 가른다. 새 색을 쓰지 않는다:
// 오류 코드(E_…)는 --danger, 나머지는 글자색의 단계뿐이다(tokens.css 색 예산).

const TOK = /("(?:[^"\\]|\\.)*")(\s*:)?|\b(true|false|null)\b|(-?\d+(?:\.\d+)?)/g

function json(text) {
  const out = []
  let last = 0
  let m
  let k = 0
  TOK.lastIndex = 0
  while ((m = TOK.exec(text))) {
    if (m.index > last) out.push(text.slice(last, m.index))
    if (m[1] && m[2]) out.push(<span key={k++} className="c-k">{m[1]}</span>, m[2])
    else if (m[1]) out.push(<span key={k++} className={/^"E_[A-Z]+"$/.test(m[1]) ? 'c-e' : 'c-s'}>{m[1]}</span>)
    else out.push(<span key={k++} className="c-n">{m[0]}</span>)
    last = TOK.lastIndex
  }
  out.push(text.slice(last))
  return out
}

export default function Code({ value, lang, title, tag, max }) {
  const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const isJson = lang === 'json' || typeof value !== 'string'
  return (
    <div className="code">
      {(title || tag) && (
        <div className="code__head">
          {title && <span className="code__title">{title}</span>}
          {tag && <span className="code__tag">{tag}</span>}
        </div>
      )}
      <pre className="code__body" style={max ? { maxHeight: max } : undefined}>
        <code>{isJson ? json(text) : text}</code>
      </pre>
    </div>
  )
}
