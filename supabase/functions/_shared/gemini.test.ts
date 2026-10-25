import { describe, expect, it } from 'vitest'
import { judgeStudioOutput, JUDGE_BUDGET_MS } from './gemini'

/**
 * backlog B33-T2: الحَكَم داخل الـwebhook بميزانية زمنية كلية (لا 2 × 4 نماذج × 15 ث تتجاوز حد Edge).
 * fetch والساعة محقونان — لا شبكة.
 */
;(globalThis as { Deno?: unknown }).Deno ??= { env: { get: (k: string) => (k === 'GEMINI_API_KEY' ? 'test-key' : undefined) } }

const okImage = () => new Response(new Uint8Array([137, 80, 78, 71]), { headers: { 'content-type': 'image/png' } })
const verdict = { checks: Object.fromEntries(['shape', 'colour', 'label', 'brand_text', 'details'].map((k) => [k, { evidence: 'e', verdict: 'match' }])), same_product: true, text_found: null, issues: [] }
const geminiOk = () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(verdict) }] } }] }), { status: 200 })
const busy = () => new Response('{"error":{"code":503}}', { status: 503 })

function harness(modelResponses: Array<() => Response>, msPerModelCall: number) {
  let t = 0
  const tried: string[] = []
  const fetchFn = async (url: string | URL | Request) => {
    const u = String(url)
    if (!u.includes('generativelanguage')) return okImage()
    tried.push(u.split('/models/')[1].split(':')[0])
    t += msPerModelCall
    const next = modelResponses.shift()
    return next ? next() : busy()
  }
  return { tried, deps: { fetch: fetchFn as typeof fetch, now: () => t } }
}

const args = { referenceUrl: 'https://x/ref.png', outputUrl: 'https://x/out.png' }

describe('judgeStudioOutput — سلسلة النماذج والميزانية', () => {
  it('يجرّب التالي عند 503 ويرجع حكم أول نموذج يرد', async () => {
    const h = harness([busy, busy, geminiOk], 1000)
    const r = await judgeStudioOutput(args, h.deps)
    expect(r.product_match).toBe(10)
    expect(h.tried).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash'])
    expect(r.model).toBe('gemini-3.6-flash')
  })

  it('يتوقف عند نفاد الميزانية ولا يجرّب بقية السلسلة', async () => {
    const h = harness([busy, busy, busy, busy], JUDGE_BUDGET_MS / 2 + 1)
    await expect(judgeStudioOutput(args, h.deps)).rejects.toThrow(/budget/)
    expect(h.tried.length).toBe(2)
  })

  it('400 (طلب أو مفتاح خاطئ) لا يجرّب نماذج أخرى', async () => {
    const h = harness([() => new Response('{}', { status: 400 })], 100)
    await expect(judgeStudioOutput(args, h.deps)).rejects.toThrow(/400/)
    expect(h.tried.length).toBe(1)
  })
})
