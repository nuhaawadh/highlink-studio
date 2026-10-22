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
export type VideoResolution = '480p' | '720p' | '1080p'

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
}

export type GenerateErrorCode =
  | 'INSUFFICIENT_CREDITS'
  | 'RATE_LIMITED'
  | 'MODEL_DISABLED'
  | 'UNSAFE_PROMPT'
  | 'INVALID_INPUT'
  | 'OVER_BUDGET'
  | 'PROVIDER_ERROR'

export interface GenerateResponse {
  success: boolean
  assetId: string
  cost: number
  balanceAfter: number
  provider?: Provider
  providerJobId?: string
  error?: { code: GenerateErrorCode; message: string }
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
