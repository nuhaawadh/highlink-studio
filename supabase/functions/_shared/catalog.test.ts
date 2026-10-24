import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProviderInput } from './inputs'
import { normalizeOptions } from './options'
import { modelCredits, resolveDuration } from './pricing'
import type { GenerateConfig, ModelRow } from './types'

/**
 * حارس الكتالوج المولّد (ADR 0005): كل نموذج مفعّل في content/catalog/models.generated.json (نفس صفوف seed.sql)
 * يجب أن يبني مدخلات مزوّد صالحة لكل خيار تعرضه الواجهة/الـAPI (كل مدة، دقة، قياس، حجم، صوت)، بلا حقل مطلوب ناقص،
 * وبتكلفة موجبة. يفشل هنا قبل أن يرفض المزوّد الطلب بعد حجز الرصيد. أعد التوليد: python -I scripts/build-models-seed.py
 */
type GeneratedRow = ModelRow & { name_ar: string; kind: string }
const file = path.resolve(import.meta.dirname, '../../../content/catalog/models.generated.json')
const rows: GeneratedRow[] = JSON.parse(readFileSync(file, 'utf8')).models.map((r: GeneratedRow) => ({ ...r, provider: 'fal' }))
const enabled = rows.filter((r) => r.enabled)

function configsFor(r: GeneratedRow): GenerateConfig[] {
  const s = r.supports as Record<string, unknown>
  const list = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]) : [])
  const out: GenerateConfig[] = [{}]
  if (r.type === 'video') {
    for (const duration of list('durations')) out.push({ duration: duration as number })
    for (const resolution of list('resolutions')) out.push({ resolution: resolution as string })
    if (s.audio === true) out.push({ audio: true })
  } else {
    for (const imageSize of list('sizes')) out.push({ imageSize: imageSize as GenerateConfig['imageSize'] })
  }
  for (const aspectRatio of list('aspect_ratios')) out.push({ aspectRatio: aspectRatio as GenerateConfig['aspectRatio'] })
  return out
}

describe('الكتالوج المولّد — كل خيار معروض يبني طلبًا صالحًا', () => {
  it('فيه نماذج مفعّلة من الصور والفيديو', () => {
    expect(enabled.filter((r) => r.type === 'image').length).toBeGreaterThan(20)
    expect(enabled.filter((r) => r.type === 'video').length).toBeGreaterThan(20)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it.each(enabled.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    const s = r.supports as Record<string, unknown>
    const refs = s.requires_ref ? ['https://x.test/a.png', 'https://x.test/b.png'] : undefined
    const required = ((r.input_schema as { required?: string[] } | null)?.required ?? []) as string[]
    for (const c of configsFor(r)) {
      const { input, invalid } = buildProviderInput(r, 'اختبار', refs, c)
      expect(invalid, JSON.stringify(c)).toEqual([])
      for (const k of required) expect(input, `${JSON.stringify(c)} required ${k}`).toHaveProperty(k)
      expect(modelCredits(r, c), JSON.stringify(c)).toBeGreaterThan(0)
    }
  })
})

type Prop = { type?: string; enum?: unknown[]; default?: unknown; anyOf?: Prop[] }
const propsOf = (r: GeneratedRow) => ((r.input_schema as { properties?: Record<string, Prop> } | null)?.properties ?? {}) as Record<string, Prop>
const enumOf = (p?: Prop): unknown[] => (p ? (p.enum ?? (p.anyOf ?? []).flatMap((a) => a.enum ?? [])) : [])
const defaultOf = (p?: Prop): unknown => (p ? (p.default ?? (p.anyOf ?? []).find((a) => a.default !== undefined)?.default) : undefined)
const isBool = (p?: Prop) => Boolean(p && (p.type === 'boolean' || (p.anyOf ?? []).some((a) => a.type === 'boolean')))
const lower = (x: unknown) => String(x).toLowerCase()

/**
 * المراجعة المستقلة (2026-10-24): ما يُرسل للمزوّد = ما سعّرناه. لكل نموذج مفعّل:
 *  (1) كل قيمة دقة/حجم في مخطط المزوّد لا نعرضها في supports تُرفض قبل الحجز (لا تُسعَّر بالأرخص)،
 *  (2) الطلب بالافتراضيات يرسل نفس الدقة/الحجم/المدة التي سعّرها modelCredits (لا افتراض مزوّد أغلى خلف ظهرنا)،
 *  (3) مفاتيح الصوت المنطقية تُرسل صراحةً (false ما لم يُطلب) — افتراض بعض المزوّدين true.
 */
describe('الكتالوج المولّد — نرسل ما سعّرناه فقط', () => {
  it.each(enabled.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    const s = r.supports as Record<string, unknown>
    const props = propsOf(r)
    const refs = s.requires_ref ? ['https://x.test/a.png', 'https://x.test/b.png'] : undefined

    // (1) قيم المخطط غير المعروضة مرفوضة
    if (r.type === 'video') {
      const offered = ((s.resolutions as string[] | undefined) ?? []).map(lower)
      for (const v of enumOf(props.resolution)) {
        if (offered.includes(lower(v))) continue
        expect(normalizeOptions(r, { resolution: String(v) }).issue?.key, `resolution ${String(v)} must be rejected`).toBe('resolution')
      }
    } else if (r.type === 'image') {
      const offered = ((s.sizes as string[] | undefined) ?? []).map(lower)
      for (const v of enumOf(props.resolution)) {
        if (!['1k', '2k', '4k'].includes(lower(v)) || offered.includes(lower(v))) continue
        expect(normalizeOptions(r, { imageSize: String(v).toUpperCase() as '1K' }).issue?.key, `imageSize ${String(v)} must be rejected`).toBe('imageSize')
      }
    }

    // (2) الافتراضيات: المُرسل = المُسعّر
    const { input } = buildProviderInput(r, 'اختبار', refs, {})
    if (r.type === 'video') {
      const tabled = Object.keys((s.cps_by_resolution as object | undefined) ?? {}).length + Object.keys((s.video_cost_per_second as object | undefined) ?? {}).length > 0
      if (props.resolution && tabled) {
        const priced = (r.default_params as { resolution?: string }).resolution
        const sent = input.resolution ?? defaultOf(props.resolution)
        expect(priced, 'priced resolution must be set when the price depends on it').toBeDefined()
        expect(lower(sent), 'sent resolution = priced resolution').toBe(lower(priced))
      }
      if (props.duration) {
        const priced = resolveDuration(r)
        const sent = input.duration ?? defaultOf(props.duration)
        if (sent !== undefined) expect(Number(String(sent).replace(/s$/, '')), 'sent duration = priced duration').toBe(priced)
      }
    } else if (r.type === 'image' && props.resolution && enumOf(props.resolution).map(lower).includes('1k')) {
      const priced = (r.default_params as { imageSize?: string }).imageSize ?? '1K'
      const sent = input.resolution ?? defaultOf(props.resolution) ?? '1K'
      expect(lower(sent), 'sent image size = priced image size').toBe(lower(priced))
    }

    // (3) الصوت صريح: false ما لم يُطلب — إلا الصوت المجاني (بلا audio_cps ولا +audio) فيتبع افتراض المزوّد بلا أثر على السعر
    const vcps = Object.keys((s.video_cost_per_second as object | undefined) ?? {})
    const audioFree = s.audio === true && !(typeof s.audio_cps === 'number' && s.audio_cps > 0) && !vcps.some((k) => k.endsWith('+audio'))
    for (const k of ['generate_audio', 'enable_audio', 'with_audio', 'generate_audio_switch', 'audio']) {
      if (!isBool(props[k])) continue
      expect(input[k], `${k} must be sent explicitly`).toBe(audioFree ? defaultOf(props[k]) === true : false)
      expect(buildProviderInput(r, 'اختبار', refs, { audio: false }).input[k], `${k} must follow audio:false`).toBe(false)
      expect(modelCredits(r, {}), 'free audio must not change the price').toBe(modelCredits(r, { audio: audioFree ? true : undefined }))
      if (s.audio === true) expect(buildProviderInput(r, 'اختبار', refs, { audio: true }).input[k], `${k} must follow audio:true`).toBe(true)
    }
  })
})
