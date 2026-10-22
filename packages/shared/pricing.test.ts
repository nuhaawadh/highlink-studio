import { describe, expect, it } from 'vitest'
import { applyResolution, creditsForUsd, creditsForVideo, sarForCredits } from './pricing'

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
})
