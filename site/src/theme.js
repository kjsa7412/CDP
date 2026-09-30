// 테마 — 제품과 같은 키(`cdp.theme`) · 같은 계산. 첫 페인트 전에는 index.html 의 인라인 스크립트가 붙였다.
// 값은 'light' · 'dark' · 없음(OS 를 따른다) 셋이다.

const KEY = 'cdp.theme'
const mq = () => window.matchMedia('(prefers-color-scheme: dark)')

export function themePref() {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export function applyTheme() {
  const t = themePref()
  const dark = t === 'dark' || (t !== 'light' && mq().matches)
  document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  window.dispatchEvent(new Event('cdp-theme'))
  return dark
}

export function setTheme(v) {
  try {
    if (v) localStorage.setItem(KEY, v)
    else localStorage.removeItem(KEY)
  } catch {}
  applyTheme()
}

export function followTheme() {
  applyTheme()
  mq().addEventListener('change', applyTheme)
  window.addEventListener('storage', (e) => e.key === KEY && applyTheme())
}

export const isDark = () => document.documentElement.dataset.theme === 'dark'
