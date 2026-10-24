import { describe, expect, it } from 'vitest'
import { normalizeOptions } from './options'
import type { ModelRow } from './types'

/**
 * الخيارات قبل التسعير (المراجعة المستقلة 2026-10-24، الثغرة 1): السيرفر يقبل فقط ما تعرضه `supports`
 * — دقة/حجم/مدة لم نتحقق من سعرها تُرفض قبل الحجز، لا تُسعَّر بالأرخص ثم يولّدها المزوّد بالأغلى.
 */
const video = (supports: Record<string, unknown>, extra: Partial<ModelRow> = {}): ModelRow => ({
  id: 'v',
  type: 'video',
  provider: 'fal',
  provider_slug: 'x/y/z',
  cost_credits: null,
  cost_per_second: 2,
  max_duration_s: 10,
  supports,
  default_params: { duration: 5, resolution: '720p' },
  input_schema: { properties: { prompt: { type: 'string' }, resolution: { type: 'string', enum: ['360p', '720p', '1080p', '4k'] } } },
  enabled: true,
  ...extra,
})
const image = (supports: Record<string, unknown>, defaults: Record<string, unknown> = {}): ModelRow => ({
  id: 'i',
  type: 'image',
  provider: 'fal',
  provider_slug: 'x/y',
  cost_credits: 4,
  cost_per_second: null,
  max_duration_s: null,
  supports,
  default_params: defaults,
  input_schema: { properties: { prompt: { type: 'string' }, resolution: { type: 'string', enum: ['1K', '2K', '4K'] } } },
  enabled: true,
})

describe('normalizeOptions — الفيديو', () => {
  const m = video({ resolutions: ['360p', '720p', '1080p'], durations: [5, 8, 10], cps_by_resolution: { '360p': 2, '720p': 7, '1080p': 11 }, audio: false })

  it('دقة معروضة تمر، وحالة الأحرف تتوحّد على اسم القائمة', () => {
    expect(normalizeOptions(m, { resolution: '1080p' })).toEqual({ config: { resolution: '1080p' }, issue: null })
    expect(normalizeOptions(m, { resolution: '720P' }).config.resolution).toBe('720p')
  })

  it('دقة في مخطط المزوّد لكنها غير معروضة (4k بلا سعر) → مرفوضة', () => {
    expect(normalizeOptions(m, { resolution: '4k' }).issue).toEqual({ key: 'resolution', value: '4k', allowed: ['360p', '720p', '1080p'] })
    expect(normalizeOptions(m, { resolution: '2160p' }).issue?.key).toBe('resolution')
  })

  it('نموذج بلا قائمة دقات: لا يُقبل إلا الافتراضي أو الغياب', () => {
    const k = video({ durations: [5, 10] }, { default_params: { duration: 5 } })
    expect(normalizeOptions(k, {}).issue).toBeNull()
    expect(normalizeOptions(k, { resolution: '1080p' }).issue).toEqual({ key: 'resolution', value: '1080p', allowed: [] })
    const d = video({}, { default_params: { duration: 5, resolution: '720p' } })
    expect(normalizeOptions(d, { resolution: '720P' })).toEqual({ config: { resolution: '720p' }, issue: null })
  })

  it('مدة خارج supports.durations → مرفوضة', () => {
    expect(normalizeOptions(m, { duration: 8 }).issue).toBeNull()
    expect(normalizeOptions(m, { duration: 7 }).issue).toEqual({ key: 'duration', value: 7, allowed: [5, 8, 10] })
  })

  it('نموذج بالمقطع بلا قائمة مدد: لا يُقبل إلا المدة الافتراضية', () => {
    const clip = video({}, { cost_per_second: null, cost_credits: 30, default_params: { duration: 5 } })
    expect(normalizeOptions(clip, { duration: 5 }).issue).toBeNull()
    expect(normalizeOptions(clip, { duration: 10 }).issue).toEqual({ key: 'duration', value: 10, allowed: [5] })
  })

  it('صوت لنموذج بلا صوت → مرفوض (لا نخصم إضافة لن تصل)', () => {
    expect(normalizeOptions(m, { audio: true }).issue).toEqual({ key: 'audio', value: true, allowed: [false] })
    expect(normalizeOptions(m, { audio: false }).issue).toBeNull()
    const withAudio = video({ audio: true, resolutions: ['720p'] })
    expect(normalizeOptions(withAudio, { audio: true }).issue).toBeNull()
  })

  it('لا يعدّل الطلب الأصلي ولا يضيف مفاتيح لم تُطلب', () => {
    const cfg = { resolution: '720P', aspectRatio: '16:9' as const }
    const out = normalizeOptions(m, cfg)
    expect(cfg.resolution).toBe('720P')
    expect(out.config).toEqual({ resolution: '720p', aspectRatio: '16:9' })
    expect(normalizeOptions(m, undefined)).toEqual({ config: {}, issue: null })
  })
})

describe('normalizeOptions — الصور', () => {
  it('حجم معروض يمر (وحالة الأحرف تتوحّد)، وغير المعروض يُرفض', () => {
    const m = image({ sizes: ['1K', '2K'] })
    expect(normalizeOptions(m, { imageSize: '2K' }).issue).toBeNull()
    expect(normalizeOptions(m, { imageSize: '2k' as never }).config.imageSize).toBe('2K')
    expect(normalizeOptions(m, { imageSize: '4K' }).issue).toEqual({ key: 'imageSize', value: '4K', allowed: ['1K', '2K'] })
  })

  it('صورة بلا قائمة أحجام: الافتراضي فقط (1K إن لم يُحدَّد)', () => {
    expect(normalizeOptions(image({}), { imageSize: '1K' }).issue).toBeNull()
    expect(normalizeOptions(image({}), { imageSize: '2K' }).issue).toEqual({ key: 'imageSize', value: '2K', allowed: ['1K'] })
    expect(normalizeOptions(image({}, { imageSize: '2K' }), { imageSize: '2K' }).issue).toBeNull()
  })

  it('مدة أو دقة فيديو على نموذج صور تُتجاهل في التسعير ولا تُرفض', () => {
    expect(normalizeOptions(image({ sizes: ['1K'] }), { duration: 5 }).issue).toBeNull()
  })
})
