import { describe, expect, it } from 'vitest'
import { applyModelResolution, applyResolution, creditsForUsd, creditsForVideo, sarForCredits, videoCredits } from './pricing'

/** Kling 3 عبر Replicate (2026-10-23): standard 0.168$/ث، pro 0.224$/ث، الصوت +50%، 4K 0.42$/ث → بالرصيد 12/16/18/24/30 */
const KLING_SUPPORTS = { video_cost_per_second: { '720p': 12, '720p+audio': 18, '1080p': 16, '1080p+audio': 24, '4K': 30, '4K+audio': 30 } }

describe('videoCredits — جدول الدقة/الصوت من supports (ADR Kling)', () => {
  it('أسعار Kling من صفحة Replicate تتحول إلى رصيد صحيح بلا كسور', () => {
    expect(creditsForUsd(0.168)).toBe(12)
    expect(creditsForUsd(0.224)).toBe(16)
    expect(creditsForUsd(0.252)).toBe(18)
    expect(creditsForUsd(0.336)).toBe(24)
    expect(creditsForUsd(0.42)).toBe(30)
  })
  it('5 ثوانٍ 720p = 60، 10 ثوانٍ 1080p مع صوت = 240', () => {
    expect(videoCredits(12, 5, '720p', false, KLING_SUPPORTS)).toBe(60)
    expect(videoCredits(12, 10, '1080p', true, KLING_SUPPORTS)).toBe(240)
    expect(videoCredits(12, 5, '720p', true, KLING_SUPPORTS)).toBe(90)
  })
  it('مفتاح غائب أو جدول غائب → cost_per_second الأساسي؛ 4K بالصوت نفس السعر', () => {
    expect(videoCredits(12, 5, '480p', false, KLING_SUPPORTS)).toBe(60)
    expect(videoCredits(12, 5, undefined, true, KLING_SUPPORTS)).toBe(60)
    expect(videoCredits(12, 5, '720p', false, undefined)).toBe(60)
    expect(videoCredits(12, 5, '4K', true, KLING_SUPPORTS)).toBe(150)
  })
  it('كسر لكل ثانية يُقرَّب لأعلى على الإجمالي، والمدخلات غير الصالحة تُرفض', () => {
    expect(videoCredits(2.5, 3, undefined, false)).toBe(8)
    expect(() => videoCredits(12, 0, '720p', false)).toThrow(RangeError)
    expect(() => videoCredits(12, 2.5, '720p', false)).toThrow(RangeError)
    expect(() => videoCredits(-1, 5, '720p', false)).toThrow(RangeError)
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
