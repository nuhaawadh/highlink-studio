import { describe, expect, it } from 'vitest'
import catalog from '../../content/templates/saudi.json'
import plan from '../../content/showcase/plan.json'
import showcase from '../../content/showcase/showcase.json'
import campaignsRaw from '../../content/showcase/campaigns.json'
import {
  type CampaignsFile,
  cssAspect,
  EMPTY_SHOWCASE,
  familyKey,
  heroMedia,
  LIKE_HERO,
  likeMedia,
  likeSettings,
  mergeShowcase,
  pickAlternate,
  sampleValues,
  setAlternates,
  type ShowcaseFile,
  type ShowcaseMedia,
} from './showcase'
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

  it('البدائل: الدمج يحفظها، والاختيار يبدّل المعروض بالمحاولة المطلوبة والباقي يبقى بدائل', () => {
    const base: ShowcaseFile = { ...EMPTY_SHOWCASE, templates: { r: media('a1') } }
    const withAlts = setAlternates(base, 'templates/r', [media('a2'), media('a3')])
    expect(withAlts.alternates?.['templates/r'].map((m) => m.url)).toEqual(['a2', 'a3'])
    expect(base.alternates).toBeUndefined()
    // الدمج لا يمسح البدائل، وتشغيل بلا بدائل لا يضيف الحقل
    expect(mergeShowcase(withAlts, { templates: { x: media('x') } }).alternates?.['templates/r']).toHaveLength(2)
    expect('alternates' in mergeShowcase(base, { templates: { x: media('x') } })).toBe(false)
    const picked = pickAlternate(withAlts, 'templates/r', 3)
    expect(picked.templates.r.url).toBe('a3')
    expect(picked.alternates?.['templates/r'].map((m) => m.url)).toEqual(['a1', 'a2'])
    // 1 = المعروض الآن (لا تغيير في المعروض)
    expect(pickAlternate(withAlts, 'templates/r', 1).templates.r.url).toBe('a1')
    // مفاتيح العائلات فيها نقطتان
    const fam = setAlternates({ ...EMPTY_SHOWCASE, families: { 'video:kling': media('k1') } }, 'families/video:kling', [media('k2')])
    expect(pickAlternate(fam, 'families/video:kling', 2).families['video:kling'].url).toBe('k2')
    // قائمة فارغة تحذف الموضع، وبلا مواضع يُحذف الحقل
    expect('alternates' in setAlternates(withAlts, 'templates/r', [])).toBe(false)
    expect(() => pickAlternate(withAlts, 'templates/r', 4)).toThrow(RangeError)
    expect(() => pickAlternate(withAlts, 'templates/r', 0)).toThrow(RangeError)
    expect(() => pickAlternate(withAlts, 'hero/r', 1)).toThrow(RangeError)
    expect(() => pickAlternate(withAlts, 'templates/none', 1)).toThrow(RangeError)
  })

  it('likeMedia: الهيرو المختار، مفتاح عائلة، وغير المعروف null (ولا يقرأ خصائص الكائن الموروثة)', () => {
    const f: ShowcaseFile = { ...EMPTY_SHOWCASE, hero: { candidates: [media('h1'), media('h2')], selected: 1 }, families: { 'video:kling': media('k') } }
    expect(likeMedia(f, LIKE_HERO)?.url).toBe('h2')
    expect(likeMedia(f, 'video:kling')?.url).toBe('k')
    expect(likeMedia(f, 'video:none')).toBeNull()
    expect(likeMedia(f, 'toString')).toBeNull()
    expect(likeMedia(f, null)).toBeNull()
    expect(likeMedia(EMPTY_SHOWCASE, LIKE_HERO)).toBeNull()
  })

  it('likeSettings: ينسخ فقط ما يعرضه النموذج الآن، والنسبة من aspect للمداخل القديمة بلا config', () => {
    const old = media('x')
    expect(likeSettings(old, { aspectRatios: ['16:9', '9:16'] })).toEqual({ aspectRatio: '16:9' })
    expect(likeSettings(old, { aspectRatios: ['1:1'] })).toEqual({})
    const withConfig: ShowcaseMedia = { ...old, config: { aspectRatio: '9:16', duration: 8, resolution: '1080p', audio: true } }
    const offered = { aspectRatios: ['16:9', '9:16'], durations: [5, 8], resolutions: ['720p', '1080p'] }
    // الصوت لا يُنسخ أبدًا (المعرض صامت)
    expect(likeSettings(withConfig, offered)).toEqual({ aspectRatio: '9:16', duration: 8, resolution: '1080p' })
    // مدة أو دقة لم تعد معروضة تسقط ويبقى افتراض الصفحة
    expect(likeSettings(withConfig, { ...offered, durations: [5, 10], resolutions: ['720p'] })).toEqual({ aspectRatio: '9:16' })
    const image: ShowcaseMedia = { ...old, kind: 'image', aspect: '4:5', config: { aspectRatio: '4:5', imageSize: '2K' } }
    expect(likeSettings(image, { aspectRatios: ['1:1', '4:5'], sizes: ['1K', '2K'] })).toEqual({ aspectRatio: '4:5', imageSize: '2K' })
    expect(likeSettings(image, { aspectRatios: ['1:1', '4:5'], sizes: ['1K'] })).toEqual({ aspectRatio: '4:5' })
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
