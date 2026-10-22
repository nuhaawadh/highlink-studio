/**
 * تحقق توقيع webhooks من Replicate (مواصفة Standard Webhooks) — WebCrypto فقط ليعمل في Deno وNode.
 * - الترويسات: webhook-id, webhook-timestamp (ثوانٍ Unix), webhook-signature ("v1,<base64> v1,<base64> …")
 * - المحتوى الموقّع: `${id}.${timestamp}.${body}` بالجسم الخام كما وصل (أي إعادة تنسيق تكسر التوقيع)
 * - المفتاح: السر من GET /v1/webhooks/default/secret بصيغة "whsec_<base64>" → نفك base64 ونستخدم البايتات كمفتاح HMAC-SHA256
 * المرجع: https://replicate.com/docs/topics/webhooks/verify-webhook
 */

export const DEFAULT_TOLERANCE_SECONDS = 300

export type VerifyReason = 'missing_headers' | 'invalid_secret' | 'timestamp_out_of_tolerance' | 'signature_mismatch'

export interface VerifyInput {
  secret: string
  id: string | null | undefined
  timestamp: string | null | undefined
  signature: string | null | undefined
  body: string
  /** للاختبار — ثوانٍ Unix الآن */
  now?: number
  toleranceSeconds?: number
}

export type VerifyResult = { ok: true } | { ok: false; reason: VerifyReason }

function decodeSecret(secret: string): Uint8Array | null {
  if (typeof secret !== 'string' || !secret.startsWith('whsec_')) return null
  const b64 = secret.slice('whsec_'.length)
  if (!b64) return null
  try {
    const bin = atob(b64)
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    return bytes.length ? bytes : null
  } catch {
    return null
  }
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin)
}

/** مقارنة بزمن ثابت لمنع هجمات التوقيت */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

async function hmacBase64(keyBytes: Uint8Array, message: string): Promise<string> {
  const key = await crypto.subtle.importKey('raw', keyBytes as BufferSource, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'])
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(message))
  return bytesToBase64(new Uint8Array(sig))
}

/** التوقيع المتوقع لجسم معيّن — يُستخدم في الاختبارات ولتوليد توقيعات محلية. */
export async function computeReplicateSignature(secret: string, id: string, timestamp: string, body: string): Promise<string> {
  const keyBytes = decodeSecret(secret)
  if (!keyBytes) throw new Error('invalid_secret')
  return hmacBase64(keyBytes, `${id}.${timestamp}.${body}`)
}

export async function verifyReplicateWebhook(input: VerifyInput): Promise<VerifyResult> {
  const { id, timestamp, signature, body } = input
  if (!id || !timestamp || !signature) return { ok: false, reason: 'missing_headers' }

  const keyBytes = decodeSecret(input.secret)
  if (!keyBytes) return { ok: false, reason: 'invalid_secret' }

  const ts = Number(timestamp)
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return { ok: false, reason: 'timestamp_out_of_tolerance' }

  const expected = await hmacBase64(keyBytes, `${id}.${timestamp}.${body}`)
  const candidates = signature
    .split(' ')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const comma = entry.indexOf(',')
      return comma === -1 ? null : { version: entry.slice(0, comma), sig: entry.slice(comma + 1) }
    })
    .filter((c): c is { version: string; sig: string } => c !== null && c.version === 'v1' && c.sig.length > 0)

  return candidates.some((c) => timingSafeEqual(c.sig, expected)) ? { ok: true } : { ok: false, reason: 'signature_mismatch' }
}
