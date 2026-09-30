// 녹화한 시나리오 다섯 — site/demo/record.mjs 가 만든다. 손으로 고치지 않는다(판이 오르면 다시 녹화).
const mods = import.meta.glob('./examples/*.json', { eager: true, import: 'default' })
export const EXAMPLES = Object.values(mods).sort((a, b) => a.n - b.n)
export const exampleBySlug = Object.fromEntries(EXAMPLES.map((e) => [e.slug, e]))
