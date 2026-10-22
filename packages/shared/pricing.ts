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

/**
 * معامل الدقة لنموذج بعينه (ADR 0003): `models.supports.resolution_multipliers` من قاعدة البيانات يطغى على الجدول العام
 * عندما يسعّر المزوّد الدقات بشكل مختلف (نانو بنانا برو: 1K و2K بنفس السعر، 4K ×2).
 * أي قيمة ناقصة أو غير صالحة ترجع للجدول العام — لا تسعير بصفر أو سالب أبدًا.
 */
export function applyModelResolution(
  baseCredits: number,
  resolution: keyof typeof RESOLUTION_MULTIPLIER,
  overrides?: unknown,
): number {
  const raw = overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>)[resolution] : undefined
  const m = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : RESOLUTION_MULTIPLIER[resolution]
  return Math.ceil(baseCredits * m)
}

/**
 * رصيد مقطع فيديو (المخطط §7، نموذج Kling عبر Replicate): `cost_per_second` بالرصيد × المدة، مقرّبًا لأعلى.
 * إن سعّر المزوّد الدقة/الصوت بشكل مختلف يأتي الجدول من `models.supports.video_cost_per_second`
 * بمفاتيح مثل "720p" و"720p+audio" — بيانات لا كود لكل نموذج (القاعدة 7). المفتاح الغائب يعود إلى `cost_per_second`.
 */
export function videoCredits(costPerSecond: number, durationSeconds: number, resolution: string | undefined, audio: boolean, supports?: unknown): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) throw new RangeError('durationSeconds must be a positive integer')
  if (!Number.isFinite(costPerSecond) || costPerSecond < 0) throw new RangeError('costPerSecond must be a non-negative number')
  const table = supports && typeof supports === 'object' ? (supports as { video_cost_per_second?: unknown }).video_cost_per_second : undefined
  const key = resolution ? `${resolution}${audio ? '+audio' : ''}` : undefined
  const raw = key && table && typeof table === 'object' ? (table as Record<string, unknown>)[key] : undefined
  const perSecond = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : costPerSecond
  return Math.ceil(perSecond * durationSeconds)
}

/** السعر بالريال لحزمة رصيد (شحن إضافي) — للعرض فقط. */
export function sarForCredits(credits: number): number {
  return Math.round(credits * CREDIT_SAR * 100) / 100
}
