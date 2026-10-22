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

export function applyModelResolution(
  baseCredits: number,
  resolution: keyof typeof RESOLUTION_MULTIPLIER,
  overrides?: unknown,
): number {
  const raw = overrides && typeof overrides === 'object' ? (overrides as Record<string, unknown>)[resolution] : undefined
  const m = typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : RESOLUTION_MULTIPLIER[resolution]
  return Math.ceil(baseCredits * m)
}
