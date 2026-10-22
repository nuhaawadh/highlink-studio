/**
 * الباقات — المصدر الواحد للواجهة وصفحة الأسعار (المخطط §7).
 * يجب أن تطابق صفوف `plans` في supabase/seed.sql — اختبار plans.test.ts يتحقق من ذلك.
 */
export interface Plan {
  id: 'free' | 'starter' | 'basic' | 'pro' | 'creators'
  credits: number
  priceMonthlySar: number
  priceYearlySar: number | null
  maxConcurrent: number
  privateByDefault: boolean
}

export const PLANS: readonly Plan[] = [
  { id: 'free', credits: 0, priceMonthlySar: 0, priceYearlySar: null, maxConcurrent: 1, privateByDefault: false },
  { id: 'starter', credits: 250, priceMonthlySar: 39, priceYearlySar: 329, maxConcurrent: 2, privateByDefault: true },
  { id: 'basic', credits: 500, priceMonthlySar: 79, priceYearlySar: 659, maxConcurrent: 2, privateByDefault: true },
  { id: 'pro', credits: 1250, priceMonthlySar: 199, priceYearlySar: 1669, maxConcurrent: 4, privateByDefault: true },
  { id: 'creators', credits: 4000, priceMonthlySar: 599, priceYearlySar: 5029, maxConcurrent: 8, privateByDefault: true },
] as const

/** رصيد الترحيب عند التسجيل — يطابق handle_new_user في 0001_init.sql */
export const SIGNUP_BONUS_CREDITS = 30

export const PAID_PLANS = PLANS.filter((p) => p.priceMonthlySar > 0)
