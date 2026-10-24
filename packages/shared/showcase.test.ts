import { describe, expect, it } from 'vitest'
import catalog from '../../content/templates/saudi.json'
import plan from '../../content/showcase/plan.json'
import showcase from '../../content/showcase/showcase.json'
import campaignsRaw from '../../content/showcase/campaigns.json'
import { type CampaignsFile, cssAspect, EMPTY_SHOWCASE, familyKey, heroMedia, mergeShowcase, sampleValues, type ShowcaseFile, type ShowcaseMedia } from './showcase'
import { missingFields, type TemplateCatalog } from './templates'

const media = (url: string): ShowcaseMedia => ({ url, kind: 'video', aspect: '16:9', model: 'm', prompt: 'p', created_at: '2026-10-24T00:00:00Z' })

describe('showcase', () => {
  it('heroMedia: المختار ضمن المدى، وإلا الأول، وبلا محاولات null', () => {
    expect(heroMedia(EMPTY_SHOWCASE)).toBeNull()
    const f: ShowcaseFile = { ...EMPTY_SHOWCASE, hero: { candidates: [media('a'), media('b')], selected: 1 } }
    expect(heroMedia(f)?.url).toBe('b')
    expect(heroMedia({ ...f, hero: { ...f.hero, selected: 7 } })?.url).toBe('a')
    expect(heroMedia({ ...f, hero: { ...f.hero, selected: -1 } })?.url).toBe('a')
  })

  it('mergeShowcase: الجديد يحل محل القديم والناقص يبقى؛ هيرو فارغ لا يمسح القديم', () => {
    const prev: ShowcaseFile = { ...EMPTY_SHOWCASE, templates: { a: media('old-a'), b: media('old-b') }, hero: { candidates: [media('h')], selected: 0 } }
    const out = mergeShowcase(prev, { templates: { b: media('new-b') }, hero: { candidates: [], selected: 0 } })
    expect(out.templates.a.url).toBe('old-a')
    expect(out.templates.b.url).toBe('new-b')
    expect(out.hero.candidates[0].url).toBe('h')
  })

  it('familyKey وcssAspect', () => {
    expect(familyKey('video', 'kling')).toBe('video:kling')
    expect(cssAspect('9:16')).toBe('9 / 16')
    expect(cssAspect('bad')).toBe('16 / 9')
    expect(cssAspect(undefined)).toBe('16 / 9')
  })

  it('كل قالب له قيم تجريبية تكفي حقوله المطلوبة (مع plan.json)', () => {
    const c = catalog as unknown as TemplateCatalog
    const overrides = (plan as { template_values: Record<string, Record<string, string>> }).template_values
    for (const t of c.templates) {
      const v = sampleValues(t, overrides[t.id])
      expect(missingFields(t, v), t.id).toEqual([])
      for (const val of Object.values(v)) expect(val, t.id).not.toMatch(/^(مثال|e\.g\.)/i)
    }
  })

  it('sampleValues: "مثال:" و"e.g." يُحذفان، والعربي للنص المكتوب والإنجليزي للوصف', () => {
    const t = (catalog as unknown as TemplateCatalog).templates.find((x) => x.id === 'ramadan-greeting')!
    expect(sampleValues(t)).toEqual({ message: 'رمضان كريم', brand: 'مقهى الحي' })
  })

  it('ملف المعرض بالشكل الصحيح', () => {
    const f = showcase as unknown as ShowcaseFile
    expect(f.version).toBe(1)
    for (const m of [...Object.values(f.templates), ...Object.values(f.families), ...f.hero.candidates]) {
      expect(m.url).toMatch(/^https:\/\//)
      expect(['image', 'video']).toContain(m.kind)
    }
  })

  it('الحملات: كل قطعة قالب موجود بنوعه الصحيح (ريل فيديو، بوستر بنص، صورة)، ومستويات المعرض موجودة في القوالب', () => {
    const c = catalog as unknown as TemplateCatalog
    const f = campaignsRaw as unknown as CampaignsFile
    const byId = new Map(c.templates.map((t) => [t.id, t]))
    const ids = new Set<string>()
    for (const camp of f.campaigns) {
      expect(ids.has(camp.id), camp.id).toBe(false)
      ids.add(camp.id)
      expect(byId.get(camp.video)?.tier_set, `${camp.id} video`).toBe('video')
      expect(byId.get(camp.poster)?.tier_set, `${camp.id} poster`).toBe('text')
      expect(byId.get(camp.photo)?.tier_set, `${camp.id} photo`).toBe('photo')
      expect(c.categories.some((k) => k.key === camp.category), camp.category).toBe(true)
    }
    for (const [set, key] of Object.entries(f.showcase_tiers)) {
      expect(c.tiers[set as 'video'].some((t) => t.key === key), `${set}:${key}`).toBe(true)
    }
  })
})
