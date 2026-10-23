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

/** رموز API v1 (ADR 0004) — إضافة إلى رموز التوليد؛ النسخة الأخرى في packages/shared/types.ts */
export const API_ERROR_CODES = ['UNAUTHORIZED', 'NOT_FOUND', 'DAILY_LIMIT', 'IDEMPOTENCY_CONFLICT', 'METHOD_NOT_ALLOWED'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]
export type ErrorCode = GenerateErrorCode | ApiErrorCode

export const API_ERROR_MESSAGES_AR: Record<ApiErrorCode, string> = {
  UNAUTHORIZED: 'مفتاح API مفقود أو غير صالح أو مُبطَل',
  NOT_FOUND: 'غير موجود',
  DAILY_LIMIT: 'تجاوزت الحد اليومي لهذا المفتاح — يتجدد منتصف الليل بتوقيت UTC',
  IDEMPOTENCY_CONFLICT: 'Idempotency-Key مستخدم من قبل بطلب مختلف أو ما زال قيد التنفيذ',
  METHOD_NOT_ALLOWED: 'طريقة غير مدعومة لهذا المسار',
}

export const API_ERROR_HTTP_STATUS: Record<ApiErrorCode, number> = {
  UNAUTHORIZED: 401,
  NOT_FOUND: 404,
  DAILY_LIMIT: 429,
  IDEMPOTENCY_CONFLICT: 409,
  METHOD_NOT_ALLOWED: 405,
}

export const ALL_ERROR_MESSAGES_AR: Record<ErrorCode, string> = { ...ERROR_MESSAGES_AR, ...API_ERROR_MESSAGES_AR }
export const ALL_ERROR_HTTP_STATUS: Record<ErrorCode, number> = { ...ERROR_HTTP_STATUS, ...API_ERROR_HTTP_STATUS }

export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '3:4'
export type ImageSize = '1K' | '2K' | '4K'
export type Provider = 'replicate' | 'fal' | 'google'
export type AssetStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'

export interface GenerateConfig {
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  duration?: number
  /** دقة الفيديو كما يسمّيها مخطط المزوّد ('720p'، '1080p'، '768P'، '4k') — القائمة المتاحة في models.supports.resolutions (ADR 0005) */
  resolution?: string
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
  /** مفتاح hl_test_: تجربة جافة بلا مزوّد ولا خصم (ADR 0004) */
  sandbox?: boolean
  error?: { code: GenerateErrorCode; message: string }
}

/** تمثيل الأصل في API v1 (ADR 0004 القرار 8) — ثابت؛ لا metadata داخلية ولا معرّف مهمة المزوّد */
export interface PublicAsset {
  id: string
  status: AssetStatus
  type: 'image' | 'video' | 'audio'
  model: string | null
  prompt: string | null
  aspect_ratio: string | null
  resolution: string | null
  url: string | null
  thumbnail_url: string | null
  cost_credits: number
  sandbox: boolean
  error: { code: string; message: string } | null
  created_at: string
  completed_at: string | null
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
