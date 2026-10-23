/**
 * تحقق توقيع webhooks من fal (ADR 0005) — WebCrypto فقط ليعمل في Deno وNode (vitest).
 * - الترويسات: X-Fal-Webhook-Request-Id، X-Fal-Webhook-User-Id، X-Fal-Webhook-Timestamp (ثوانٍ Unix)، X-Fal-Webhook-Signature (hex)
 * - الرسالة الموقّعة: `${request_id}\n${user_id}\n${timestamp}\n${sha256hex(body)}` بالجسم الخام كما وصل
 * - المفاتيح: JWKS من https://rest.fal.ai/.well-known/jwks.json — كل مفتاح OKP/Ed25519 وحقله `x` مفتاح عام خام base64url.
 *   يُقبل الطلب إن طابق أي مفتاح (دوران المفاتيح). الجلب والتخزين المؤقت (≤ 24 ساعة) في providers/fal.ts لا هنا.
 * المرجع: https://fal.ai/docs/model-endpoints/webhooks
 */

export const FAL_JWKS_URL = 'https://rest.fal.ai/.well-known/jwks.json'
export const DEFAULT_TOLERANCE_SECONDS = 300

export type FalVerifyReason = 'missing_headers' | 'no_keys' | 'timestamp_out_of_tolerance' | 'signature_mismatch'
export type FalVerifyResult = { ok: true } | { ok: false; reason: FalVerifyReason }

export interface FalVerifyInput {
  requestId: string | null | undefined
  userId: string | null | undefined
  timestamp: string | null | undefined
  /** hex */
  signature: string | null | undefined
  body: string
  /** مفاتيح Ed25519 عامة خام (32 بايت لكلٍّ) من parseFalJwks */
  keys: Uint8Array[]
  /** للاختبار — ثوانٍ Unix الآن */
  now?: number
  toleranceSeconds?: number
}

const enc = new TextEncoder()

function base64UrlToBytes(s: string): Uint8Array | null {
  try {
    const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4)
    const bin = atob(b64)
    const out = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
    return out
  } catch {
    return null
  }
}

function hexToBytes(hex: string): Uint8Array | null {
  const clean = hex.trim()
  if (!/^[0-9a-fA-F]+$/.test(clean) || clean.length % 2 !== 0) return null
  const out = new Uint8Array(clean.length / 2)
  for (let i = 0; i < out.length; i++) out[i] = parseInt(clean.slice(i * 2, i * 2 + 2), 16)
  return out
}

function bytesToHex(bytes: ArrayBuffer | Uint8Array): string {
  const u = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  let s = ''
  for (let i = 0; i < u.length; i++) s += u[i].toString(16).padStart(2, '0')
  return s
}

/** يستخرج مفاتيح Ed25519 الخام من مستند JWKS؛ يتجاهل أي مفتاح بنوع/منحنى آخر أو بحقل x تالف. */
export function parseFalJwks(jwks: unknown): Uint8Array[] {
  const keys = (jwks as { keys?: unknown[] } | null)?.keys
  if (!Array.isArray(keys)) return []
  const out: Uint8Array[] = []
  for (const k of keys) {
    const j = k as { kty?: unknown; crv?: unknown; x?: unknown }
    if (j?.kty !== 'OKP' || j.crv !== 'Ed25519' || typeof j.x !== 'string') continue
    const bytes = base64UrlToBytes(j.x)
    if (bytes && bytes.byteLength === 32) out.push(bytes)
  }
  return out
}

/** الرسالة التي وقّعها fal — تُبنى من الجسم الخام (أي إعادة تنسيق JSON تغيّر الهاش). */
export async function falSignedMessage(requestId: string, userId: string, timestamp: string, body: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', enc.encode(body))
  return `${requestId}\n${userId}\n${timestamp}\n${bytesToHex(digest)}`
}

export async function verifyFalWebhook(input: FalVerifyInput): Promise<FalVerifyResult> {
  const { requestId, userId, timestamp, signature, body } = input
  if (!requestId || !userId || !timestamp || !signature) return { ok: false, reason: 'missing_headers' }

  const ts = Number(timestamp)
  const now = input.now ?? Math.floor(Date.now() / 1000)
  const tolerance = input.toleranceSeconds ?? DEFAULT_TOLERANCE_SECONDS
  if (!Number.isFinite(ts) || Math.abs(now - ts) > tolerance) return { ok: false, reason: 'timestamp_out_of_tolerance' }

  if (!input.keys.length) return { ok: false, reason: 'no_keys' }
  const sig = hexToBytes(signature)
  if (!sig || sig.byteLength !== 64) return { ok: false, reason: 'signature_mismatch' }

  const message = enc.encode(await falSignedMessage(requestId, userId, timestamp, body))
  for (const raw of input.keys) {
    try {
      const key = await crypto.subtle.importKey('raw', raw as BufferSource, { name: 'Ed25519' }, false, ['verify'])
      if (await crypto.subtle.verify('Ed25519', key, sig as BufferSource, message)) return { ok: true }
    } catch {
      // مفتاح تالف — نجرّب التالي
    }
  }
  return { ok: false, reason: 'signature_mismatch' }
}
