import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProviderInput } from '../../supabase/functions/_shared/inputs'
import type { ModelRow } from '../../supabase/functions/_shared/types'
import { modelCredits } from './pricing'
import { renderTemplatePrompt, type TemplateCatalog } from './templates'

/**
 * حارس القوالب (الحركة 6): كل قالب في content/templates/saudi.json يجب أن يشير إلى نماذج مفعّلة تعمل بنص فقط،
 * بخيارات (قياس/مدة/دقة/حجم) يدعمها النموذج فعلًا، وببرومبت كل وسومه معرّفة ويبني طلب مزوّد صالحًا بتكلفة موجبة.
 * يفشل هنا بدل أن يرفض المزوّد الطلب بعد حجز رصيد التاجر.
 */
const root = path.resolve(import.meta.dirname, '../..')
const catalog: TemplateCatalog = JSON.parse(readFileSync(path.join(root, 'content/templates/saudi.json'), 'utf8'))
const generated: ModelRow[] = JSON.parse(readFileSync(path.join(root, 'content/catalog/models.generated.json'), 'utf8')).models.map((r: ModelRow) => ({
  ...r,
  provider: 'fal',
}))

/** صف نانو بنانا برو اليدوي (Replicate — ADR 0003) يُقرأ من seed.sql نفسه: أول ثلاث قيم JSON بعد معرّفه */
function nanoFromSeed(): ModelRow {
  const seed = readFileSync(path.join(root, 'supabase/seed.sql'), 'utf8')
  const start = seed.indexOf("('nano-banana-pro'")
  const chunk = seed.slice(start, seed.indexOf('\n  (', start + 10))
  const jsons = [...chunk.matchAll(/'(\{.*?\})'/g)].map((m) => JSON.parse(m[1].replace(/''/g, "'")))
  return {
    id: 'nano-banana-pro',
    type: 'image',
    provider: 'replicate',
    provider_slug: 'google/nano-banana-pro',
    cost_credits: 11,
    cost_per_second: null,
    max_duration_s: null,
    enabled: /true,\s*'جديد'/.test(chunk),
    supports: jsons[0],
    default_params: jsons[1],
    input_schema: jsons[2],
  }
}

const models = new Map<string, ModelRow>([...generated.map((m) => [m.id, m] as const), ['nano-banana-pro', nanoFromSeed()]])
const list = (s: unknown, k: string) => ((s as Record<string, unknown>)[k] as unknown[] | undefined) ?? []

function sample(kind: string, max: number): string {
  return kind === 'arabic_text' ? 'نص تجريبي'.slice(0, max) : 'a sample product'.slice(0, max)
}

describe('كتالوج القوالب السعودية', () => {
  it('معرّفات فريدة، وكل فئة وموسم معرّفان', () => {
    const ids = catalog.templates.map((t) => t.id)
    expect(new Set(ids).size).toBe(ids.length)
    const cats = new Set(catalog.categories.map((c) => c.key))
    const seasons = new Set(catalog.seasons.map((s) => s.key))
    for (const t of catalog.templates) {
      expect(cats.has(t.category), t.id).toBe(true)
      if (t.season) expect(seasons.has(t.season), t.id).toBe(true)
    }
    expect(catalog.templates.length).toBeGreaterThanOrEqual(30)
  })

  it('كل مستوى جودة يشير إلى نموذج مفعّل يعمل بنص فقط', () => {
    for (const [set, tiers] of Object.entries(catalog.tiers)) {
      expect(tiers.length, set).toBeGreaterThan(0)
      for (const tier of tiers) {
        const m = models.get(tier.model)
        expect(m, `${set}/${tier.key} → ${tier.model}`).toBeDefined()
        expect(m!.enabled, tier.model).toBe(true)
        expect((m!.supports as { requires_ref?: boolean }).requires_ref ?? false, tier.model).toBe(false)
        expect(m!.type, tier.model).toBe(set === 'video' ? 'video' : 'image')
        if (tier.imageSize) expect(list(m!.supports, 'sizes'), `${tier.model} size`).toContain(tier.imageSize)
        if (tier.resolution) expect(list(m!.supports, 'resolutions'), `${tier.model} resolution`).toContain(tier.resolution)
      }
    }
  })

  it.each(catalog.templates.map((t) => [t.id, t] as const))('%s', (_id, t) => {
    const keys = new Set(t.fields.map((f) => f.key))
    // كل وسم في البرومبت معرّف، وكل حقل مطلوب مستخدم، والنص العربي دائمًا بين « »
    for (const m of t.prompt.matchAll(/\{\{(?:#if )?(\w+)\}\}/g)) expect(keys.has(m[1]), `${t.id} unknown {{${m[1]}}}`).toBe(true)
    for (const f of t.fields) {
      if (f.required) expect(t.prompt.includes(`{{${f.key}}}`), `${t.id} unused required ${f.key}`).toBe(true)
      if (f.kind === 'arabic_text' && t.prompt.includes(`{{${f.key}}}`)) expect(t.prompt.includes(`«{{${f.key}}}»`), `${t.id} ${f.key} not quoted`).toBe(true)
      if (f.kind === 'choice') {
        expect(f.options?.length, `${t.id} ${f.key} options`).toBeGreaterThan(1)
        if (f.default) expect(f.options!.map((o) => o.value), `${t.id} ${f.key} default`).toContain(f.default)
      }
      expect(f.label_ar && f.label_en, `${t.id} ${f.key} labels`).toBeTruthy()
    }
    if (t.tier_set === 'text') expect(t.fields.some((f) => f.kind === 'arabic_text'), `${t.id} text template without Arabic text`).toBe(true)
    if (t.tier_set === 'video') expect(t.duration, t.id).toBeGreaterThan(0)

    const values = Object.fromEntries(t.fields.map((f) => [f.key, f.kind === 'choice' ? (f.default ?? f.options![0].value) : sample(f.kind, f.max)]))
    const prompt = renderTemplatePrompt(t, values)
    expect(prompt, t.id).not.toMatch(/\{\{|\}\}/)
    expect(prompt.length, t.id).toBeLessThan(4000)

    for (const tier of catalog.tiers[t.tier_set]) {
      const m = models.get(tier.model)!
      expect(list(m.supports, 'aspect_ratios'), `${t.id} ${tier.model} ratio ${t.aspect_ratio}`).toContain(t.aspect_ratio)
      const config = { aspectRatio: t.aspect_ratio, imageSize: tier.imageSize, duration: t.duration, resolution: tier.resolution }
      if (t.tier_set === 'video') expect(list(m.supports, 'durations'), `${t.id} ${tier.model} duration`).toContain(t.duration)
      const { invalid } = buildProviderInput(m, prompt, undefined, config)
      expect(invalid, `${t.id} ${tier.model}`).toEqual([])
      expect(modelCredits(m, config), `${t.id} ${tier.model}`).toBeGreaterThan(0)
    }
  })
})
