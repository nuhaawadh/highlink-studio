/**
 * الأنواع المشتركة بين الواجهة وEdge Functions (المخطط §5).
 * تُستورد في الواجهة عبر "@shared/types" وفي الوظائف عبر مسار نسبي.
 */

export type AssetType = 'image' | 'video' | 'audio'
export type AssetStatus = 'queued' | 'processing' | 'completed' | 'failed' | 'canceled'
export type FeatureTag = 'general' | 'product' | 'ads' | 'ugc' | 'shots' | 'storyboard' | 'characters'
export type Provider = 'replicate' | 'fal' | 'google'
export type AspectRatio = '1:1' | '9:16' | '16:9' | '4:5' | '3:4'
export type ImageSize = '1K' | '2K' | '4K'
/** دقة الفيديو كما يسمّيها مخطط المزوّد ('720p'، '1080p'، '768P'، '4k') — القائمة المتاحة لكل نموذج في models.supports.resolutions (ADR 0005) */
export type VideoResolution = '480p' | '720p' | '1080p' | (string & {})

export interface GenerateConfig {
  aspectRatio?: AspectRatio
  imageSize?: ImageSize
  duration?: number
  resolution?: VideoResolution
  audio?: boolean
  seed?: number
}

/** POST /functions/v1/generate-media */
export interface GenerateRequest {
  assetId: string
  model: string
  prompt: string
  images?: string[]
  config?: GenerateConfig
  feature_tag?: FeatureTag
  locale?: 'ar' | 'en'
  /** سقف إنفاق لهذا الطلب — يُرفض إن تجاوزته التكلفة (مقتبس من Higgsfield §14) */
  maxCredits?: number
  /** معرّف القالب الجاهز (content/templates) — للتحليلات فقط، لا يغيّر التسعير */
  template?: string
  /** الاستوديو (model = studio:<id>، ADR 0006): كل مقاس أصل queued بنفس run_id */
  studio?: StudioRequest
}

export interface StudioRequest {
  preset: string
  scene?: string
  text?: string
  outputs: Array<{ assetId: string; key: string }>
}

/** رموز الأخطاء — القائمة الواحدة؛ نسخة Edge Functions في supabase/functions/_shared/types.ts (يحرسها contract.test.ts) */
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

/** رموز API v1 (ADR 0004) — نسخة Edge Functions في supabase/functions/_shared/types.ts (يحرسها contract.test.ts) */
export const API_ERROR_CODES = ['UNAUTHORIZED', 'NOT_FOUND', 'DAILY_LIMIT', 'IDEMPOTENCY_CONFLICT', 'METHOD_NOT_ALLOWED'] as const
export type ApiErrorCode = (typeof API_ERROR_CODES)[number]

export interface GenerateResponse {
  success: boolean
  assetId: string
  cost: number
  balanceAfter: number
  provider?: Provider
  providerJobId?: string
  /** مفتاح hl_test_: تجربة جافة بلا مزوّد ولا خصم (ADR 0004) */
  sandbox?: boolean
  /** الاستوديو (ADR 0006): نتيجة إرسال كل مقاس — مقاس فشل إرساله حُرّر حجزه */
  outputs?: Array<{ assetId: string; key: string; ok: boolean; error?: { code: GenerateErrorCode; message: string } }>
  error?: { code: GenerateErrorCode; message: string }
}

/** تمثيل الأصل في API v1 (ADR 0004 القرار 8) */
export interface PublicAsset {
  id: string
  status: AssetStatus
  type: AssetType
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

/** POST /functions/v1/generate-media?estimate=1 — تسعير بلا حجز */
export interface EstimateResponse {
  cost: number
  balance: number
  affordable: boolean
}

/** نتيجة بوابة المخرجات (المخطط §15) تُحفظ في assets.metadata.qa */
export interface OutputQA {
  fileOk: boolean
  safe: boolean
  arabicTextExact?: boolean
  productMatchScore?: number
  retries: number
  notes?: string[]
}
