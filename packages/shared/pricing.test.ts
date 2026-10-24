import { describe, expect, it } from 'vitest'
import { applyModelResolution, applyResolution, creditsForUsd, creditsForVideo, modelCredits, sarForCredits, type ModelPricingRow } from './pricing'

/**
 * Kling 3 عبر Replicate (2026-10-23): standard 0.168$/ث، pro 0.224$/ث، الصوت +50%، 4K 0.42$/ث → بالرصيد 12/16/18/24/30.
 * الجدول في supports.video_cost_per_second بمفاتيح "<دقة>" و"<دقة>+audio" — modelCredits يقرؤه قبل cps_by_resolution (دالة واحدة).
 */
const KLING_SUPPORTS = { video_cost_per_second: { '720p': 12, '720p+audio': 18, '1080p': 16, '1080p+audio': 24, '4K': 30, '4K+audio': 30 } }
const klingRow = (supports: unknown = KLING_SUPPORTS, defaults: unknown = { duration: 5, resolution: '720p' }): ModelPricingRow => ({
  type: 'video',
  cost_credits: null,
  cost_per_second: 12,
  max_duration_s: 15,
  supports,
  default_params: defaults,
})

describe('modelCredits — جدول video_cost_per_second (Kling عبر Replicate)', () => {
  it('أسعار Kling من صفحة Replicate تتحول إلى رصيد صحيح بلا كسور', () => {
    expect(creditsForUsd(0.168)).toBe(12)
    expect(creditsForUsd(0.224)).toBe(16)
    expect(creditsForUsd(0.252)).toBe(18)
    expect(creditsForUsd(0.336)).toBe(24)
    expect(creditsForUsd(0.42)).toBe(30)
  })
  it('5 ثوانٍ 720p = 60، 10 ثوانٍ 1080p مع صوت = 240، 5 ثوانٍ 720p مع صوت = 90', () => {
    expect(modelCredits(klingRow(), { duration: 5, resolution: '720p', audio: false })).toBe(60)
    expect(modelCredits(klingRow(), { duration: 10, resolution: '1080p', audio: true })).toBe(240)
    expect(modelCredits(klingRow(), { duration: 5, resolution: '720p', audio: true })).toBe(90)
  })
  it('مفتاح الجدول يطغى على audio_cps فلا يُضاف الصوت مرتين', () => {
    const row = klingRow({ ...KLING_SUPPORTS, audio_cps: 6 })
    expect(modelCredits(row, { duration: 5, resolution: '720p', audio: true })).toBe(90)
  })
  it('مفتاح غائب أو جدول غائب → cps_by_resolution ثم cost_per_second؛ 4K بالصوت نفس السعر', () => {
    expect(modelCredits(klingRow(), { duration: 5, resolution: '480p' })).toBe(60)
    expect(modelCredits(klingRow(KLING_SUPPORTS, { duration: 5 }), { duration: 5, audio: true })).toBe(60)
    expect(modelCredits(klingRow(undefined), { duration: 5, resolution: '720p' })).toBe(60)
    expect(modelCredits(klingRow(), { duration: 5, resolution: '4K', audio: true })).toBe(150)
  })
  it('الدقة الافتراضية من default_params تُسعَّر من الجدول', () => {
    expect(modelCredits(klingRow(KLING_SUPPORTS, { duration: 5, resolution: '1080p' }), {})).toBe(80)
  })
  it('قيمة جدول غير صالحة (صفر/سالب/نص) لا تسعّر بصفر — ترجع للأساس', () => {
    const bad = { video_cost_per_second: { '720p': 0, '1080p': -4, '720p+audio': '18' } }
    expect(modelCredits(klingRow(bad), { duration: 5, resolution: '720p' })).toBe(60)
    expect(modelCredits(klingRow(bad), { duration: 5, resolution: '1080p' })).toBe(60)
    expect(modelCredits(klingRow(bad), { duration: 5, resolution: '720p', audio: true })).toBe(60)
  })
})

describe('pricing — المخطط §7', () => {
  it('صورة سريعة 0.03$ ≈ 3 رصيد', () => {
    expect(creditsForUsd(0.03)).toBe(3)
  })
  it('نانو بنانا برو 2K عند 0.13$ ≈ 10 رصيد', () => {
    expect(creditsForUsd(0.13)).toBe(10)
  })
  it('فيديو 5 ثوانٍ × 0.07$/ث = 0.35$ ≈ 25 رصيد', () => {
    expect(creditsForVideo(0.07, 5)).toBe(25)
  })
  it('التقريب دائمًا لأعلى، وصفر يبقى صفرًا', () => {
    expect(creditsForUsd(0.0001)).toBe(1)
    expect(creditsForUsd(0)).toBe(0)
  })
  it('معامل الدقة: 2K ×1.5 و4K ×2', () => {
    expect(applyResolution(10, '1K')).toBe(10)
    expect(applyResolution(10, '2K')).toBe(15)
    expect(applyResolution(10, '4K')).toBe(20)
  })
  it('يرفض المدخلات غير الصالحة بدل خصم خاطئ', () => {
    expect(() => creditsForUsd(-1)).toThrow(RangeError)
    expect(() => creditsForUsd(Number.NaN)).toThrow(RangeError)
    expect(() => creditsForVideo(0.1, 0)).toThrow(RangeError)
    expect(() => creditsForVideo(0.1, 2.5)).toThrow(RangeError)
  })
  it('250 رصيد ≈ 40 ريال', () => {
    expect(sarForCredits(250)).toBe(40)
  })

  // nano-banana-pro عبر Replicate (ADR 0003): 1K/2K = 0.15$، 4K = 0.30$ — سعر Replicate بتاريخ 2026-10-22
  it('نانو بنانا برو: 0.15$ → 11 رصيدًا، 0.30$ → 22', () => {
    expect(creditsForUsd(0.15)).toBe(11)
    expect(creditsForUsd(0.3)).toBe(22)
  })
  it('معاملات الدقة لكل نموذج (models.supports.resolution_multipliers) تطغى على الجدول العام', () => {
    const nano = { '1K': 1, '2K': 1, '4K': 2 }
    expect(applyModelResolution(11, '1K', nano)).toBe(11)
    expect(applyModelResolution(11, '2K', nano)).toBe(11)
    expect(applyModelResolution(11, '4K', nano)).toBe(22)
  })
  it('بدون تجاوزات أو بتجاوز ناقص يرجع للجدول العام', () => {
    expect(applyModelResolution(10, '2K')).toBe(15)
    expect(applyModelResolution(10, '4K', null)).toBe(20)
    expect(applyModelResolution(10, '4K', { '2K': 1 })).toBe(20)
    expect(applyModelResolution(10, '2K', { '2K': 'x' as unknown as number })).toBe(15)
  })
})

/**
 * تسعير صف النموذج كاملًا (ADR 0005) — نفس الدالة للزر في الواجهة ولحجز الرصيد في Edge Functions.
 * الفيديو بالثانية: cost_per_second رصيد/ثانية (= usd/ث × 3 ÷ 0.042)، تجاوز بالدقة عبر supports.cps_by_resolution،
 * زيادة الصوت عبر supports.audio_cps؛ الفيديو بالمقطع: cost_credits أو supports.credits_by_duration.
 */
describe('modelCredits — تسعير صف النموذج (ADR 0005)', () => {
  const kling = {
    type: 'video' as const,
    cost_credits: null,
    cost_per_second: 8, // 0.112$/ث × 3 ÷ 0.042 = 8
    max_duration_s: 15,
    supports: { durations: [5, 10, 15], resolutions: ['720p', '1080p'], audio_cps: 2 },
    default_params: { duration: 5, resolution: '720p' },
  }
  it('فيديو بالثانية: 8 رصيد/ث × 5 ث = 40؛ 10 ث = 80', () => {
    expect(modelCredits(kling, { duration: 5 })).toBe(40)
    expect(modelCredits(kling, { duration: 10 })).toBe(80)
  })
  it('بلا مدة → مدة default_params؛ التقريب لأعلى على الإجمالي لا على الثانية', () => {
    expect(modelCredits(kling, {})).toBe(40)
    expect(modelCredits({ ...kling, cost_per_second: 7.1428 }, { duration: 7 })).toBe(50) // 49.9996 → 50
  })
  it('الصوت يضيف audio_cps لكل ثانية عند طلبه فقط', () => {
    expect(modelCredits(kling, { duration: 5, audio: true })).toBe(50)
    expect(modelCredits(kling, { duration: 5, audio: false })).toBe(40)
  })
  it('تجاوز السعر بالدقة (cps_by_resolution) يطغى على cost_per_second', () => {
    const wan = { ...kling, cost_per_second: 7.143, supports: { cps_by_resolution: { '720p': 7.143, '1080p': 10.715 } } }
    expect(modelCredits(wan, { duration: 5, resolution: '720p' })).toBe(36)
    expect(modelCredits(wan, { duration: 5, resolution: '1080p' })).toBe(54)
    expect(modelCredits(wan, { duration: 5, resolution: '480p' })).toBe(36) // دقة غير مسعّرة → السعر الأساسي
  })
  it('فيديو بالمقطع (cost_per_second null): cost_credits ثابت أو حسب المدة', () => {
    const luma = { type: 'video' as const, cost_credits: 36, cost_per_second: null, max_duration_s: 9, supports: {}, default_params: { duration: 5 } }
    expect(modelCredits(luma, { duration: 5 })).toBe(36)
    expect(modelCredits(luma, { duration: 9 })).toBe(36)
    const hailuo = { ...luma, cost_credits: 20, supports: { credits_by_duration: { '6': 20, '10': 40 } } }
    expect(modelCredits(hailuo, { duration: 6 })).toBe(20)
    expect(modelCredits(hailuo, { duration: 10 })).toBe(40)
    expect(modelCredits(hailuo, { duration: 7 })).toBe(20) // مدة غير مسعّرة → cost_credits
  })
  it('صورة: نفس applyModelResolution القديمة (لا تغيير في نانو بنانا برو)', () => {
    const nano = { type: 'image' as const, cost_credits: 11, cost_per_second: null, max_duration_s: null, supports: { resolution_multipliers: { '1K': 1, '2K': 1, '4K': 2 } }, default_params: { imageSize: '2K' } }
    expect(modelCredits(nano, {})).toBe(11)
    expect(modelCredits(nano, { imageSize: '4K' })).toBe(22)
  })
  it('يرفض صفًا بلا سعر أو فيديو بالثانية بلا مدة بدل خصم صفر', () => {
    expect(() => modelCredits({ ...kling, default_params: {}, supports: {}, max_duration_s: null }, {})).toThrow(RangeError)
    // سلسلة الاحتياط للمدة: default_params → supports.durations[0] → max_duration_s
    expect(modelCredits({ ...kling, default_params: {} }, {})).toBe(40)
    expect(modelCredits({ ...kling, default_params: {}, supports: {} }, {})).toBe(120)
    expect(() => modelCredits({ ...kling, cost_per_second: null, cost_credits: null }, { duration: 5 })).toThrow(RangeError)
    expect(() => modelCredits({ type: 'image', cost_credits: null, cost_per_second: null, max_duration_s: null, supports: {}, default_params: {} }, {})).toThrow(RangeError)
  })
})
