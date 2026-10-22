/**
 * نسخة Edge Functions من قواعد التسعير (packages/shared/pricing.ts) — نفس الأرقام، نفس السلوك.
 * لا نستورد من خارج supabase/functions/؛ اختبار packages/shared/contract.test.ts يضمن التطابق.
 * لا يستورد شيئًا ولا يلمس Deno.
 */
export const RESOLUTION_MULTIPLIER: Record<'1K' | '2K' | '4K', number> = {
  '1K': 1,
  '2K': 1.5,
  '4K': 2,
}

/** نسخة videoCredits من packages/shared/pricing.ts — نفس السلوك، يحرسها contract.test.ts */
export function videoCredits(costPerSecond: number, durationSeconds: number, resolution: string | undefined, audio: boolean, supports?: unknown): number {
  if (!Number.isInteger(durationSeconds) || durationSeconds <= 0) throw new RangeError('durationSeconds must be a positive integer')
  if (!Number.isFinite(costPerSecond) || costPerSecond < 0) throw new RangeError('costPerSecond must be a non-negative number')
  const table = supports && typeof supports === 'object' ? (supports as { video_cost_per_second?: unknown }).video_cost_per_second : undefined
  const key = resolution ? `${resolution}${audio ? '+audio' : ''}` : undefined
  const raw = key && table && typeof table === 'object' ? (table as Record<string, unknown>)[key] : undefined
  const perSecond = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : costPerSecond
  return Math.ceil(perSecond * durationSeconds)
}

export function applyModelResolution(
  baseCredits: number,
  resolution: keyof typeof RESOLUTION_MULTIPLIER,
  overrides?: unknown,
): number {
  const raw = overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>)[resolution] : undefined
  const m = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : RESOLUTION_MULTIPLIER[resolution]
  return Math.ceil(baseCredits * m)
}
