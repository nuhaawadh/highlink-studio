import { describe, expect, it } from 'vitest'

/**
 * لا Deno محليًا: هذا الاختبار يحمّل وحدات المحرك عبر vitest (esbuild + إضافة npm: في vite.config.ts) ليكتشف
 * أخطاء الصياغة والاستيراد المكسور قبل النشر. لا ينفّذ أي دالة تلمس Deno أو الشبكة — التحميل فقط.
 */
describe('edge module graph loads', () => {
  it('generate-core + studio-core + studio-qa + finalize + gemini', async () => {
    ;(globalThis as { Deno?: unknown }).Deno ??= { env: { get: () => undefined } }
    const core = await import('./generate-core')
    const studio = await import('./studio-core')
    const qa = await import('./studio-qa')
    const fin = await import('./finalize')
    const gem = await import('./gemini')
    expect(typeof core.runGenerate).toBe('function')
    expect(typeof studio.runStudio).toBe('function')
    expect(typeof qa.studioQaGate).toBe('function')
    expect(typeof fin.finalizeAsset).toBe('function')
    expect(gem.judgeModels()).toEqual(['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'])
  })
})
