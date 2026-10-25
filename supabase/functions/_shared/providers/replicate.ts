import { z } from 'npm:zod@4'
import { AppError } from '../errors.ts'
import { verifyReplicateWebhook } from '../replicate-signature.ts'
import type { ProviderAdapter, ProviderJobStatus, ProviderWebhookResult } from './index.ts'

/**
 * محوّل Replicate (المخطط §5):
 * - submit: POST /v1/models/{owner}/{name}/predictions غير متزامن مع webhook لحدث completed فقط.
 * - الـwebhook: الحمولة = كائن prediction النهائي (id, status, output, error). التوقيع بمواصفة Standard Webhooks.
 * الأسرار: REPLICATE_API_TOKEN، REPLICATE_WEBHOOK_SECRET (من GET /v1/webhooks/default/secret — يُرفع مع الأسرار).
 */
const API = 'https://api.replicate.com/v1'
/** مهلة إنشاء التنبؤ — بدونها قد تُقتل الوظيفة وهي تنتظر ويبقى الحجز معلّقًا (المراجعة، البند 8) */
const SUBMIT_TIMEOUT_MS = 30_000
const MAX_THROTTLE_RETRIES = 2
const MAX_THROTTLE_WAIT_S = 15

/**
 * ثوانٍ الانتظار قبل إعادة إنشاء تنبؤ خُنق (429)، أو null = لا إعادة.
 * من retry_after في الجسم أو ترويسة Retry-After، بحد أعلى 15 ث (أطول من ذلك = نفشل الآن ونسترد بدل تعليق الطلب).
 */
export function throttleWaitSeconds(status: number, bodyText: string, retryAfterHeader: string | null): number | null {
  if (status !== 429) return null
  let s: number | null = null
  try {
    const v = (JSON.parse(bodyText) as { retry_after?: unknown }).retry_after
    if (typeof v === 'number' && Number.isFinite(v)) s = v
  } catch {
    /* جسم غير JSON */
  }
  if (s === null && retryAfterHeader && /^\d+(\.\d+)?$/.test(retryAfterHeader.trim())) s = Number(retryAfterHeader)
  if (s === null) s = 10
  if (s < 0 || s > MAX_THROTTLE_WAIT_S) return null
  return Math.max(1, Math.ceil(s))
}

/** حمولة الـwebhook = كائن prediction (نقبل الحقول التي نستخدمها فقط؛ الباقي يُهمل) */
const PredictionPayload = z.object({
  id: z.string().min(1),
  status: z.string().optional(),
  output: z.unknown().optional(),
  error: z.unknown().optional(),
})

function token(): string {
  const t = Deno.env.get('REPLICATE_API_TOKEN')
  if (!t) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'REPLICATE_API_TOKEN missing' })
  return t
}

function mapStatus(s: unknown): ProviderJobStatus {
  switch (s) {
    case 'succeeded':
      return 'succeeded'
    case 'failed':
      return 'failed'
    case 'canceled':
      return 'canceled'
    default:
      return 'processing'
  }
}

export const replicate: ProviderAdapter = {
  name: 'replicate',

  async submit({ slug, input, webhookUrl, maxThrottleRetries }) {
    // 429 بمهلة قصيرة (Replicate يخنق إنشاء التنبؤات إلى 6/دقيقة بدفعة 1 حين يقل رصيد الحساب عن 5$): ننتظر ونعيد حتى مرتين.
    // آمن: 429 يعني أن التنبؤ لم يُنشأ، فلا مهمة مكررة ولا تكلفة مزدوجة.
    let res: Response
    let text: string
    for (let attempt = 0; ; attempt++) {
      res = await fetch(`${API}/models/${slug}/predictions`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token()}`,
          'Content-Type': 'application/json',
          'User-Agent': 'highlink-studio/0.1 (+https://highlink.tech)',
        },
        body: JSON.stringify({ input, webhook: webhookUrl, webhook_events_filter: ['completed'] }),
        signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
      }).catch((e: unknown) => {
        throw new AppError('PROVIDER_ERROR', undefined, { detail: `replicate submit: ${e instanceof Error ? e.name + ' ' + e.message : String(e)}` })
      })
      text = await res.text()
      const wait = attempt < (maxThrottleRetries ?? MAX_THROTTLE_RETRIES) ? throttleWaitSeconds(res.status, text, res.headers.get('retry-after')) : null
      if (wait === null) break
      await new Promise((r) => setTimeout(r, wait * 1000))
    }
    if (!res.ok) {
      // 401/403 = مفتاح خاطئ، 402 = رصيد المزوّد، 422 = مدخلات رفضها النموذج، 429 = ضغط
      const detail = `replicate ${res.status}: ${text.slice(0, 300)}`
      if (res.status === 422) throw new AppError('INVALID_INPUT', 'رفض النموذج هذه المدخلات — عدّل الإعدادات وحاول', { detail })
      throw new AppError('PROVIDER_ERROR', undefined, { detail })
    }
    let json: { id?: string }
    try {
      json = JSON.parse(text)
    } catch {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: 'replicate: non-JSON response' })
    }
    if (!json.id) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'replicate: missing prediction id' })
    return { jobId: json.id }
  },

  async verifyWebhook(req, rawBody) {
    const secret = Deno.env.get('REPLICATE_WEBHOOK_SECRET') ?? ''
    return await verifyReplicateWebhook({
      secret,
      id: req.headers.get('webhook-id'),
      timestamp: req.headers.get('webhook-timestamp'),
      signature: req.headers.get('webhook-signature'),
      body: rawBody,
    })
  },

  eventId(req) {
    const id = req.headers.get('webhook-id')
    return id ? `replicate:${id}` : null
  },

  parseWebhook(rawBody): ProviderWebhookResult {
    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw new AppError('INVALID_INPUT', undefined, { detail: 'webhook: invalid json' })
    }
    return parsePrediction(json, 'webhook')
  },

  async getJob(jobId): Promise<ProviderWebhookResult> {
    const res = await fetch(`${API}/predictions/${encodeURIComponent(jobId)}`, {
      headers: { Authorization: `Bearer ${token()}`, 'User-Agent': 'highlink-studio/0.1 (+https://highlink.tech)' },
      signal: AbortSignal.timeout(15_000),
    }).catch((e: unknown) => {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: `replicate get: ${e instanceof Error ? e.name + ' ' + e.message : String(e)}` })
    })
    const text = await res.text()
    if (!res.ok) throw new AppError('PROVIDER_ERROR', undefined, { detail: `replicate get ${res.status}: ${text.slice(0, 200)}` })
    let json: unknown
    try {
      json = JSON.parse(text)
    } catch {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: 'replicate get: non-JSON response' })
    }
    return parsePrediction(json, 'get')
  },
}

/** كائن prediction (من الـwebhook أو من GET) → نتيجة موحّدة؛ الحقول المستخدمة فقط تُتحقق بـzod */
export function parsePrediction(json: unknown, source: string): ProviderWebhookResult {
  const parsed = PredictionPayload.safeParse(json)
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', undefined, { detail: `${source}: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` })
  }
  const p = parsed.data
  const outputs = typeof p.output === 'string' ? [p.output] : Array.isArray(p.output) ? p.output.filter((o): o is string => typeof o === 'string') : []
  return {
    jobId: p.id,
    status: mapStatus(p.status),
    outputs,
    error: p.error == null ? undefined : String(p.error),
  }
}
