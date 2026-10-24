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


/** السعر بالريال لحزمة رصيد (شحن إضافي) — للعرض فقط. */
export function sarForCredits(credits: number): number {
  return Math.round(credits * CREDIT_SAR * 100) / 100
}

/**
 * تسعير صف النموذج كاملًا (ADR 0005) — المصدر الوحيد للزر في الواجهة ولحجز الرصيد في Edge Functions.
 * - صورة: `cost_credits` × معامل الدقة (applyModelResolution مع `supports.resolution_multipliers`).
 * - فيديو بالثانية (`cost_per_second` رصيد/ثانية = usd/ث × 3 ÷ 0.042): السعر/ث يُؤخذ من `supports.video_cost_per_second["<دقة>"|"<دقة>+audio"]`
 *   (جدول كامل يشمل الصوت) إن وُجد، وإلا `supports.cps_by_resolution[resolution]`
 *   إن وُجد وإلا `cost_per_second`، يُضاف `supports.audio_cps` عند طلب الصوت، ثم × المدة والتقريب لأعلى على الإجمالي.
 * - فيديو بالمقطع (`cost_per_second` null): `supports.credits_by_duration[duration]` إن وُجد الجدول (ومدة ليست فيه = RangeError) وإلا `cost_credits`.
 * - دقة لها جدول (`video_cost_per_second`/`cps_by_resolution`) بلا سعر فيه = RangeError — لا تسعير بالأرخص.
 * - صوت: `cost_credits` ثابت (التسعير بالحروف يُضاف مع محرك الصوت).
 * المدة: من الخيارات ثم `default_params.duration` ثم `supports.durations[0]` ثم `max_duration_s` — وإلا RangeError (لا خصم بصفر).
 */
export interface ModelPricingRow {
  type: 'image' | 'video' | 'audio'
  cost_credits: number | null
  cost_per_second: number | null
  max_duration_s: number | null
  supports: unknown
  default_params: unknown
}

export interface ModelPricingOptions {
  imageSize?: keyof typeof RESOLUTION_MULTIPLIER
  duration?: number
  resolution?: string
  audio?: boolean
}

function obj(x: unknown): Record<string, unknown> {
  return x && typeof x === 'object' && !Array.isArray(x) ? (x as Record<string, unknown>) : {}
}

function positive(x: unknown): number | undefined {
  return typeof x === 'number' && Number.isFinite(x) && x > 0 ? x : undefined
}

/** المدة الفعلية لصف فيديو — نفس الاشتقاق في الواجهة والسيرفر */
export function resolveDuration(row: ModelPricingRow, duration?: number): number | undefined {
  const supports = obj(row.supports)
  const durations = Array.isArray(supports.durations) ? (supports.durations as unknown[]).filter((d): d is number => typeof d === 'number') : []
  return positive(duration) ?? positive(obj(row.default_params).duration) ?? positive(durations[0]) ?? positive(row.max_duration_s)
}

export function modelCredits(row: ModelPricingRow, opts: ModelPricingOptions): number {
  const supports = obj(row.supports)
  const defaults = obj(row.default_params)

  if (row.type === 'image') {
    if (row.cost_credits == null) throw new RangeError('image model without cost_credits')
    const size = opts.imageSize ?? (defaults.imageSize as keyof typeof RESOLUTION_MULTIPLIER | undefined) ?? '1K'
    return applyModelResolution(row.cost_credits, size, supports.resolution_multipliers)
  }

  if (row.type === 'video') {
    const duration = resolveDuration(row, opts.duration)
    if (!duration) throw new RangeError('video model without duration')
    if (row.cost_per_second != null) {
      const resolution = opts.resolution ?? (defaults.resolution as string | undefined)
      // جدول كامل بمفاتيح "<دقة>" و"<دقة>+audio" (Kling عبر Replicate: الصوت +50% يختلف حسب الدقة) يطغى على ما بعده.
      // دقة لها جدول لكن بلا سعر فيه = رفض، لا السعر الأساسي (الأرخص) — المراجعة المستقلة 2026-10-24
      const table = obj(supports.video_cost_per_second)
      if (resolution && Object.keys(table).length) {
        const key = opts.audio ? `${resolution}+audio` : resolution
        const tabled = positive(table[key])
        if (!tabled) throw new RangeError(`no price for ${key}`)
        return Math.ceil(tabled * duration)
      }
      const byRes = obj(supports.cps_by_resolution)
      let perSecond: number | undefined
      if (resolution && Object.keys(byRes).length) {
        perSecond = positive(byRes[resolution])
        if (!perSecond) throw new RangeError(`no price for resolution ${resolution}`)
      } else {
        perSecond = positive(row.cost_per_second)
      }
      if (!perSecond) throw new RangeError('video model with non-positive cost_per_second')
      const audio = opts.audio ? (positive(supports.audio_cps) ?? 0) : 0
      return Math.ceil((perSecond + audio) * duration)
    }
    const byDur = obj(supports.credits_by_duration)
    if (Object.keys(byDur).length && !positive(byDur[String(duration)])) throw new RangeError(`no price for duration ${duration}`)
    const flat = positive(byDur[String(duration)]) ?? positive(row.cost_credits)
    if (!flat) throw new RangeError('video model without cost_credits')
    return Math.ceil(flat)
  }

  if (row.cost_credits == null) throw new RangeError('audio model without cost_credits')
  return row.cost_credits
}
