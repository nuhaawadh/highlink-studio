import { toPublicAsset, type AssetRowForApi } from './api-types.ts'
import { logRequest } from './log.ts'
import { computeReplicateSignature } from './replicate-signature.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * webhook العميل (ADR 0004 القرار 7): عند بلوغ أصل أُنشئ عبر API حالة نهائية، نرسل POST موقّعًا بمواصفة
 * Standard Webhooks نفسها التي نتحقق بها من Replicate (webhook-id / webhook-timestamp / webhook-signature v1,…).
 * 3 محاولات (0/2/6 ث) بمهلة 8 ث، تُسجَّل في api_webhook_deliveries، ولا تُفشل المستدعي أبدًا.
 */
const ATTEMPT_DELAYS_MS = [0, 2_000, 6_000]
const ATTEMPT_TIMEOUT_MS = 8_000

type AssetWithKey = AssetRowForApi & { api_key_id: string | null; user_id: string }

export type ClientWebhookEvent = 'asset.completed' | 'asset.failed'

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

/** يرسل الحدث لأصل بمعرّفه إن كان مرتبطًا بمفتاح API وله رابط webhook. يرجع true عند التسليم. */
export async function deliverAssetWebhook(assetId: string): Promise<boolean> {
  const db = supabaseAdmin()
  const { data: asset } = await db
    .from('assets')
    .select('id, user_id, status, type, model, prompt, aspect_ratio, resolution, url, thumbnail_url, cost_credits, error_code, error_message, metadata, created_at, completed_at, api_key_id')
    .eq('id', assetId)
    .maybeSingle<AssetWithKey>()
  if (!asset || !asset.api_key_id) return false
  if (asset.status !== 'completed' && asset.status !== 'failed' && asset.status !== 'canceled') return false

  const { data: key } = await db.from('api_keys').select('id, webhook_url, webhook_secret, revoked_at').eq('id', asset.api_key_id).maybeSingle<{
    id: string
    webhook_url: string | null
    webhook_secret: string
    revoked_at: string | null
  }>()
  if (!key) return false
  const override = (asset.metadata as { api?: { webhook_url?: unknown } } | null)?.api?.webhook_url
  const url = typeof override === 'string' && override.startsWith('https://') ? override : key.webhook_url
  if (!url) return false

  const event: ClientWebhookEvent = asset.status === 'completed' ? 'asset.completed' : 'asset.failed'
  const id = `evt_${crypto.randomUUID().replace(/-/g, '')}`
  const timestamp = String(Math.floor(Date.now() / 1000))
  const body = JSON.stringify({ id, event, created_at: new Date().toISOString(), data: toPublicAsset(asset) })
  const signature = `v1,${await computeReplicateSignature(key.webhook_secret, id, timestamp, body)}`

  const { data: delivery } = await db
    .from('api_webhook_deliveries')
    .insert({ key_id: key.id, asset_id: asset.id, event, url, attempts: 0 })
    .select('id')
    .maybeSingle<{ id: number }>()

  let attempts = 0
  let statusCode: number | null = null
  let lastError: string | null = null
  let ok = false
  for (const delay of ATTEMPT_DELAYS_MS) {
    if (delay) await sleep(delay)
    attempts++
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'highlink-studio-webhooks/1.0 (+https://highlink.tech)',
          'webhook-id': id,
          'webhook-timestamp': timestamp,
          'webhook-signature': signature,
        },
        body,
        signal: AbortSignal.timeout(ATTEMPT_TIMEOUT_MS),
      })
      statusCode = res.status
      if (res.ok) {
        ok = true
        break
      }
      lastError = `http ${res.status}`
    } catch (e) {
      lastError = e instanceof Error ? `${e.name}: ${e.message}`.slice(0, 300) : String(e).slice(0, 300)
    }
  }

  if (delivery) {
    await db
      .from('api_webhook_deliveries')
      .update({ attempts, status_code: statusCode, ok, last_error: ok ? null : lastError, delivered_at: ok ? new Date().toISOString() : null })
      .eq('id', delivery.id)
  }
  logRequest({ fn: 'client-webhook', user: asset.user_id, asset: asset.id, ms: 0, ok, code: ok ? 'DELIVERED' : 'FAILED', event, attempts, status: statusCode, detail: ok ? undefined : lastError ?? undefined })
  return ok
}

/** يجدول التسليم بعد الرد إن توفّر EdgeRuntime.waitUntil، وإلا ينتظره — لا يرمي أبدًا. */
export function scheduleAssetWebhook(assetId: string): Promise<void> {
  const task = deliverAssetWebhook(assetId)
    .then(() => undefined)
    .catch((e) => logRequest({ fn: 'client-webhook', asset: assetId, ms: 0, ok: false, code: 'EXCEPTION', detail: String(e) }))
  const rt = (globalThis as { EdgeRuntime?: { waitUntil?: (p: Promise<unknown>) => void } }).EdgeRuntime
  if (rt?.waitUntil) {
    rt.waitUntil(task)
    return Promise.resolve()
  }
  return task
}
