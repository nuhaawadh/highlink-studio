import { describe, expect, it } from 'vitest'
import { applyModelResolution, applyResolution, creditsForUsd, creditsForVideo, modelCredits, sarForCredits } from './pricing'

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
