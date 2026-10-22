/**
 * قواعد التسعير (المخطط §7) — المصدر الوحيد للحسابات في الواجهة وEdge Functions.
 * 1 رصيد = 0.16 ريال ≈ 0.042 دولار. تكلفة النموذج بالرصيد = ceil(تكلفة المزوّد بالدولار × 3 ÷ 0.042).
 */
export const CREDIT_USD = 0.042
export const CREDIT_SAR = 0.16
export const MARKUP = 3

export const RESOLUTION_MULTIPLIER: Record<'1K' | '2K' | '4K', number> = {
  '1K': 1,
  '2K': 1.5,
  '4K': 2,
}

/** رصيد عملية ثابتة التكلفة (صورة). */
export function creditsForUsd(providerUsd: number): number {
  if (!Number.isFinite(providerUsd) || providerUsd < 0) throw new RangeError('providerUsd must be a non-negative number')
  return Math.ceil((providerUsd * MARKUP) / CREDIT_USD)
}

/** رصيد عملية بالثانية (فيديو): تكلفة الثانية × المدة. */
export function creditsForVideo(providerUsdPerSecond: number, durationSeconds: number): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) throw new RangeError('durationSeconds must be a positive integer')
  return creditsForUsd(providerUsdPerSecond * durationSeconds)
}

/** تطبيق معامل الدقة على رصيد أساسي. */
export function applyResolution(baseCredits: number, resolution: keyof typeof RESOLUTION_MULTIPLIER): number {
  return Math.ceil(baseCredits * RESOLUTION_MULTIPLIER[resolution])
}

/** السعر بالريال لحزمة رصيد (شحن إضافي) — للعرض فقط. */
export function sarForCredits(credits: number): number {
  return Math.round(credits * CREDIT_SAR * 100) / 100
}
