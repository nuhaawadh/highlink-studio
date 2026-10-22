/**
 * العقد المشترك — نسخة Edge Functions.
 * Edge Functions لا تستورد من خارج supabase/functions/ (قيود تجميع النشر)، لذا هذا الملف
 * يطابق packages/shared/types.ts ويضمن التطابق اختبار packages/shared/contract.test.ts.
 * لا يستورد شيئًا ولا يلمس Deno — يُختبر بـvitest.
 */

export const GENERATE_ERROR_CODES = [
  'INSUFFICIENT_CREDITS',
  'RATE_LIMITED',
  'MODEL_DISABLED',
  'UNSAFE_PROMPT',
  'INVALID_INPUT',
  'OVER_BUDGET',
  'PROVIDER_ERROR',
] as const

export type GenerateErrorCode = (typeof GENERATE_ERROR_CODES)[number]

/** الرسائل العربية الافتراضية لكل رمز (CLAUDE.md القاعدة 10). يمكن تخصيصها عند الرمي. */
export const ERROR_MESSAGES_AR: Record<GenerateErrorCode, string> = {
  INSUFFICIENT_CREDITS: 'رصيدك لا يكفي لهذه العملية — اشحن رصيدك وحاول مرة أخرى',
  RATE_LIMITED: 'لديك عمليات قيد التنفيذ تجاوزت حد باقتك — انتظر انتهاءها أو ارفع باقتك',
  MODEL_DISABLED: 'هذا النموذج غير متاح حاليًا',
  UNSAFE_PROMPT: 'النص يحوي محتوى غير مسموح به — عدّل الوصف وحاول مرة أخرى',
  INVALID_INPUT: 'مدخلات غير صالحة',
  OVER_BUDGET: 'تكلفة العملية تتجاوز السقف الذي حدّدته',
  PROVIDER_ERROR: 'تعذّر التوليد عند المزوّد — لم يُخصم رصيدك، حاول مرة أخرى',
}

/** حالة HTTP لكل رمز (402 للرصيد مثل هلاي) */
export const ERROR_HTTP_STATUS: Record<GenerateErrorCode, number> = {
  INSUFFICIENT_CREDITS: 402,
  RATE_LIMITED: 429,
  MODEL_DISABLED: 404,
  UNSAFE_PROMPT: 422,
  INVALID_INPUT: 400,
  OVER_BUDGET: 402,
  PROVIDER_ERROR: 502,
}

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '3:4'
export type ImageSize = '1K' | '2K' | '4K'
export type Provider = 'replicate' | 'fal' | 'google'
export type AssetStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'

export interface GenerateConfig {
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  duration?: number
  resolution?: '480p' | '720p' | '1080p'
  audio?: boolean
  seed?: number
}

export interface GenerateRequest {
  assetId: string
  model: string
  prompt: string
  images?: string[]
  config?: GenerateConfig
  feature_tag?: 'general' | 'product' | 'ads' | 'ugc' | 'shots' | 'storyboard' | 'characters'
  locale?: 'ar' | 'en'
  maxCredits?: number
}

export interface GenerateResponse {
  success: boolean
  assetId: string
  cost: number
  balanceAfter: number
  provider?: Provider
  providerJobId?: string
  error?: { code: GenerateErrorCode; message: string }
}

/** صف models كما تقرأه الوظائف (الأعمدة المستخدمة فقط) */
export interface ModelRow {
  id: string
  type: 'image' | 'video' | 'audio'
  provider: Provider
  provider_slug: string
  cost_credits: number | null
  cost_per_second: number | null
  max_duration_s: number | null
  supports: Record<string, unknown>
  default_params: Record<string, unknown>
  input_schema: Record<string, unknown> | null
  enabled: boolean
}
