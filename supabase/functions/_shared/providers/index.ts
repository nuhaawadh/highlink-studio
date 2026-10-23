import { AppError } from '../errors.ts'
import type { Provider } from '../types.ts'
import { fal } from './fal.ts'
import { replicate } from './replicate.ts'

/** واجهة المزوّد الواحدة (المخطط §5). محوّلان: Replicate (نانو بنانا برو — ADR 0003) وfal (الكتالوج — ADR 0005)؛ google لاحقًا بنفس الواجهة. */
export interface ProviderJob {
  slug: string
  input: Record<string, unknown>
  webhookUrl: string
}

export type ProviderJobStatus = 'succeeded' | 'failed' | 'canceled' | 'processing'

export interface ProviderWebhookResult {
  jobId: string
  status: ProviderJobStatus
  outputs: string[]
  error?: string
}

export interface ProviderAdapter {
  readonly name: Provider
  submit(job: ProviderJob): Promise<{ jobId: string }>
  /** يتحقق من توقيع الطلب على الجسم الخام كما وصل */
  verifyWebhook(req: Request, rawBody: string): Promise<{ ok: true } | { ok: false; reason: string }>
  /** معرّف الحدث للـdedupe (ثابت عند إعادة الإرسال) */
  eventId(req: Request): string | null
  parseWebhook(rawBody: string): ProviderWebhookResult
}

const adapters: Record<string, ProviderAdapter> = { replicate, fal }

export function getProvider(name: string): ProviderAdapter {
  const p = adapters[name]
  if (!p) throw new AppError('MODEL_DISABLED', 'مزوّد هذا النموذج غير مفعّل بعد', { detail: `provider ${name}` })
  return p
}
