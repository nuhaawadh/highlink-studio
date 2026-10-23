import { z } from 'npm:zod@4'
import { AppError } from '../errors.ts'
import { FAL_JWKS_URL, parseFalJwks, verifyFalWebhook } from '../fal-signature.ts'
import type { ProviderAdapter, ProviderWebhookResult } from './index.ts'

/**
 * محوّل fal (ADR 0005):
 * - submit: POST https://queue.fal.run/{endpoint}?fal_webhook={url} بـ`Authorization: Key FAL_KEY`. الرد {request_id, ...}.
 * - الـwebhook: {request_id, gateway_request_id, status: "OK"|"ERROR", payload, error?, payload_error?} موقّع ED25519
 *   (الترويسات X-Fal-Webhook-*)، والمفاتيح العامة من JWKS تُخزَّن مؤقتًا ≤ 24 ساعة (fal: لا تخزّنها أطول).
 * - الناتج: payload يختلف بشكله بين النماذج (video.url، images[].url، audio.url…) — نستخرج روابط الملفات بترتيب معروف ثم بمسح عام.
 * الأسرار: FAL_KEY فقط (لا سر للويبهوك — التحقق بمفاتيح fal العامة).
 */
const QUEUE = 'https://queue.fal.run'
const SUBMIT_TIMEOUT_MS = 30_000
const JWKS_TTL_MS = 12 * 60 * 60 * 1000
const JWKS_TIMEOUT_MS = 8_000

const WebhookPayload = z.object({
  request_id: z.string().min(1),
  status: z.string().optional(),
  payload: z.unknown().optional(),
  error: z.unknown().optional(),
  payload_error: z.unknown().optional(),
})

function key(): string {
  const k = Deno.env.get('FAL_KEY')
  if (!k) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'FAL_KEY missing' })
  return k
}

/** مخبأ JWKS على مستوى الوحدة (يعيش ما عاشت الـisolate)؛ يُحدَّث عند الانتهاء أو عند فشل التحقق مرة واحدة. */
let jwksCache: { keys: Uint8Array[]; fetchedAt: number } | null = null

async function loadJwks(force = false): Promise<Uint8Array[]> {
  if (!force && jwksCache && Date.now() - jwksCache.fetchedAt < JWKS_TTL_MS) return jwksCache.keys
  const res = await fetch(FAL_JWKS_URL, { signal: AbortSignal.timeout(JWKS_TIMEOUT_MS) }).catch(() => null)
  if (!res || !res.ok) {
    // تعذّر التحديث: نُبقي المخبأ القديم إن وُجد (أفضل من رفض كل الويبهوكات)، وإلا بلا مفاتيح → رفض
    return jwksCache?.keys ?? []
  }
  const keys = parseFalJwks(await res.json().catch(() => null))
  if (keys.length) jwksCache = { keys, fetchedAt: Date.now() }
  return keys.length ? keys : (jwksCache?.keys ?? [])
}

/** الحقول التي تحمل ناتج الوسائط عند fal بترتيب الأفضلية؛ بعدها مسح عام لأي كائن فيه url */
const OUTPUT_KEYS = ['video', 'videos', 'image', 'images', 'audio', 'audio_file', 'audio_url', 'video_url', 'image_url', 'output', 'result', 'file', 'files'] as const

function urlsIn(node: unknown, depth = 0, acc: string[] = []): string[] {
  if (depth > 4 || node == null) return acc
  if (typeof node === 'string') {
    if (/^https?:\/\//.test(node) && /\.(mp4|webm|mov|png|jpe?g|webp|gif|mp3|wav|m4a|ogg|flac|svg)(\?|$)/i.test(node)) acc.push(node)
    return acc
  }
  if (Array.isArray(node)) {
    for (const x of node) urlsIn(x, depth + 1, acc)
    return acc
  }
  if (typeof node === 'object') {
    const o = node as Record<string, unknown>
    if (typeof o.url === 'string' && /^https?:\/\//.test(o.url)) {
      acc.push(o.url)
      return acc
    }
    for (const v of Object.values(o)) urlsIn(v, depth + 1, acc)
  }
  return acc
}

/** يستخرج روابط ملفات الناتج من حمولة fal — الحقول المعروفة أولًا ثم المسح العام. نقي (يُختبر بـvitest). */
export function extractFalOutputs(payload: unknown): string[] {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return urlsIn(payload)
  const o = payload as Record<string, unknown>
  const out: string[] = []
  for (const k of OUTPUT_KEYS) if (k in o) urlsIn(o[k], 0, out)
  if (!out.length) urlsIn(o, 0, out)
  return Array.from(new Set(out))
}

/** رسالة الخطأ من fal: `error` نص، أو payload.detail (قائمة أخطاء التحقق 422) */
function errorText(p: z.infer<typeof WebhookPayload>): string | undefined {
  if (typeof p.error === 'string' && p.error) {
    const detail = (p.payload as { detail?: unknown } | null)?.detail
    if (Array.isArray(detail)) {
      const msgs = detail.map((d) => (d && typeof d === 'object' && 'msg' in d ? String((d as { msg: unknown }).msg) : String(d))).filter(Boolean)
      if (msgs.length) return `${p.error}: ${msgs.join('; ')}`.slice(0, 500)
    }
    return p.error.slice(0, 500)
  }
  if (p.payload_error != null) return `payload_error: ${String(p.payload_error)}`.slice(0, 500)
  return undefined
}

export const fal: ProviderAdapter = {
  name: 'fal',

  async submit({ slug, input, webhookUrl }) {
    const url = `${QUEUE}/${slug}?fal_webhook=${encodeURIComponent(webhookUrl)}`
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        Authorization: `Key ${key()}`,
        'Content-Type': 'application/json',
        'User-Agent': 'highlink-studio/0.1 (+https://highlink.tech)',
      },
      body: JSON.stringify(input),
      signal: AbortSignal.timeout(SUBMIT_TIMEOUT_MS),
    }).catch((e: unknown) => {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: `fal submit: ${e instanceof Error ? e.name + ' ' + e.message : String(e)}` })
    })
    const text = await res.text()
    if (!res.ok) {
      // 401/403 = مفتاح، 402 = رصيد المزوّد، 404 = نقطة نهاية خاطئة، 422 = مدخلات رفضها النموذج، 429 = ضغط
      const detail = `fal ${res.status} ${slug}: ${text.slice(0, 300)}`
      if (res.status === 422) throw new AppError('INVALID_INPUT', 'رفض النموذج هذه المدخلات — عدّل الإعدادات وحاول', { detail })
      if (res.status === 404) throw new AppError('MODEL_DISABLED', undefined, { detail })
      throw new AppError('PROVIDER_ERROR', undefined, { detail })
    }
    let json: { request_id?: string }
    try {
      json = JSON.parse(text)
    } catch {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: 'fal: non-JSON response' })
    }
    if (!json.request_id) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'fal: missing request_id' })
    return { jobId: json.request_id }
  },

  async verifyWebhook(req, rawBody) {
    const input = {
      requestId: req.headers.get('x-fal-webhook-request-id'),
      userId: req.headers.get('x-fal-webhook-user-id'),
      timestamp: req.headers.get('x-fal-webhook-timestamp'),
      signature: req.headers.get('x-fal-webhook-signature'),
      body: rawBody,
    }
    let result = await verifyFalWebhook({ ...input, keys: await loadJwks() })
    // عدم تطابق مع مخبأ قديم قد يعني دوران مفاتيح: نحدّث مرة واحدة ونعيد المحاولة
    if (!result.ok && (result.reason === 'signature_mismatch' || result.reason === 'no_keys')) {
      result = await verifyFalWebhook({ ...input, keys: await loadJwks(true) })
    }
    return result
  },

  eventId(req) {
    // fal يرسل حدثًا نهائيًا واحدًا لكل طلب ويعيد الإرسال بنفس request_id عند غير 2xx → معرّف ثابت للـdedupe
    const id = req.headers.get('x-fal-webhook-request-id')
    return id ? `fal:${id}` : null
  },

  parseWebhook(rawBody): ProviderWebhookResult {
    let json: unknown
    try {
      json = JSON.parse(rawBody)
    } catch {
      throw new AppError('INVALID_INPUT', undefined, { detail: 'webhook: invalid json' })
    }
    const parsed = WebhookPayload.safeParse(json)
    if (!parsed.success) {
      throw new AppError('INVALID_INPUT', undefined, { detail: `webhook: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}` })
    }
    const p = parsed.data
    if (p.status === 'OK') {
      const outputs = extractFalOutputs(p.payload)
      // OK بلا حمولة قابلة للتسلسل (payload_error) أو بلا ملف = فشل عندنا (لا نؤكد خصمًا بلا ناتج)
      if (!outputs.length) return { jobId: p.request_id, status: 'failed', outputs: [], error: errorText(p) ?? 'OK without media output' }
      return { jobId: p.request_id, status: 'succeeded', outputs }
    }
    if (p.status === 'ERROR') return { jobId: p.request_id, status: 'failed', outputs: [], error: errorText(p) ?? 'ERROR' }
    return { jobId: p.request_id, status: 'processing', outputs: [] }
  },
}
