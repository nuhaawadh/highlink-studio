// provider-webhook — المرحلة 1 (المخطط §5). يستقبل نتيجة المزوّد، يتحقق من التوقيع، يمنع التكرار،
// ينسخ الناتج إلى التخزين الدائم، يحدّث assets (Realtime) ويؤكد/يحرّر الحجز.
// verify_jwt=false في config.toml — الحماية الوحيدة هي التوقيع، فلا طريق بدونه.
// الترتيب مهم لأن المزوّد قد يرسل الحدث مرتين: التوقيع → dedupe → المعالجة → processed_at.
import { handleOptions } from '../_shared/cors.ts'
import { confirmAssetHold, releaseAssetHold } from '../_shared/credits.ts'
import { AppError, jsonResponse, toAppError } from '../_shared/errors.ts'
import { logRequest } from '../_shared/log.ts'
import { getProvider } from '../_shared/providers/index.ts'
import { copyFromUrl } from '../_shared/storage.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

interface AssetRow {
  id: string
  user_id: string
  type: 'image' | 'video' | 'audio'
  status: string
  metadata: Record<string, unknown> | null
}

const FAILED_MESSAGE_AR = 'فشل التوليد عند المزوّد — استُرجع رصيدك كاملًا'
const CANCELED_MESSAGE_AR = 'أُلغي التوليد — استُرجع رصيدك كاملًا'

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method' }, 405)

  const source = new URL(req.url).searchParams.get('source') ?? 'replicate'
  const db = supabaseAdmin()
  let eventId: string | null = null
  let jobId: string | null = null
  let assetId: string | null = null

  try {
    const provider = getProvider(source)
    const rawBody = await req.text()

    // 1) التوقيع — على الجسم الخام كما وصل
    const verified = await provider.verifyWebhook(req, rawBody)
    if (!verified.ok) {
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: false, code: 'BAD_SIGNATURE', detail: verified.reason, source })
      return jsonResponse({ ok: false, error: 'invalid signature' }, 401)
    }

    eventId = provider.eventId(req)
    if (!eventId) return jsonResponse({ ok: false, error: 'missing event id' }, 400)

    // 2) dedupe: صف واحد لكل حدث؛ المكرر يرجع 200 ويتوقف
    let payload: unknown = null
    try {
      payload = JSON.parse(rawBody)
    } catch {
      return jsonResponse({ ok: false, error: 'invalid json' }, 400)
    }
    const { data: inserted, error: evErr } = await db
      .from('webhook_events')
      .upsert({ source, event_id: eventId, payload }, { onConflict: 'event_id', ignoreDuplicates: true })
      .select('id')
    if (evErr) throw toAppError(new Error(evErr.message))
    if (!inserted || inserted.length === 0) {
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: true, code: 'DUPLICATE', event: eventId })
      return jsonResponse({ ok: true, duplicate: true })
    }

    const result = provider.parseWebhook(rawBody)
    jobId = result.jobId

    // 3) الأصل المرتبط بالمهمة
    const { data: asset, error: assetErr } = await db
      .from('assets')
      .select('id, user_id, type, status, metadata')
      .eq('provider', provider.name)
      .eq('provider_job_id', result.jobId)
      .maybeSingle<AssetRow>()
    if (assetErr) throw toAppError(new Error(assetErr.message))

    if (!asset) {
      // مهمة لا نعرفها بعد: قد يكون الحدث سبق تحديث الأصل في generate-media (فشل فوري عند المزوّد).
      // نحذف صف الحدث ونرد 404 ليعيد المزوّد الإرسال لاحقًا (Replicate يعيد المحاولة على غير 2xx).
      await db.from('webhook_events').delete().eq('event_id', eventId)
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: false, code: 'UNKNOWN_JOB', job: jobId })
      return jsonResponse({ ok: false, error: 'unknown job' }, 404)
    }
    assetId = asset.id

    if (asset.status === 'completed' || asset.status === 'failed' || asset.status === 'canceled') {
      await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: true, code: 'ALREADY_FINAL', asset: assetId, status: asset.status })
      return jsonResponse({ ok: true, alreadyFinal: true })
    }

    if (result.status === 'processing') {
      await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
      return jsonResponse({ ok: true, pending: true })
    }

    // 4) نجاح: نسخ الناتج إلى التخزين الدائم ثم completed ثم تأكيد الخصم
    if (result.status === 'succeeded') {
      const first = result.outputs[0]
      if (!first) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'succeeded without output' })
      const copied = await copyFromUrl(first, `u/${asset.user_id}/${asset.id}`, asset.type === 'video' ? 'video' : 'image')
      const qa = { fileOk: copied.bytes > 0, safe: true, retries: 0, notes: [`bytes=${copied.bytes}`, `type=${copied.contentType}`] }
      const { error: updErr } = await db
        .from('assets')
        .update({
          status: 'completed',
          url: copied.url,
          thumbnail_url: copied.url,
          completed_at: new Date().toISOString(),
          metadata: { ...(asset.metadata ?? {}), qa, provider_output: first, storage_path: copied.path },
        })
        .eq('id', asset.id)
      if (updErr) throw toAppError(new Error(updErr.message))
      const confirmed = await confirmAssetHold(asset.id)
      await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
      logRequest({ fn: 'provider-webhook', user: asset.user_id, asset: assetId, ms: Date.now() - started, ok: true, code: 'COMPLETED', confirmed, bytes: copied.bytes })
      return jsonResponse({ ok: true })
    }

    // 5) فشل/إلغاء: تحرير الحجز ثم failed برسالة عربية
    const released = await releaseAssetHold(asset.id, `provider ${result.status}: ${(result.error ?? '').slice(0, 200)}`)
    const { error: failErr } = await db
      .from('assets')
      .update({
        status: 'failed',
        error_code: 'PROVIDER_ERROR',
        error_message: result.status === 'canceled' ? CANCELED_MESSAGE_AR : FAILED_MESSAGE_AR,
        completed_at: new Date().toISOString(),
        metadata: { ...(asset.metadata ?? {}), provider_error: result.error ?? null, provider_status: result.status },
      })
      .eq('id', asset.id)
    if (failErr) throw toAppError(new Error(failErr.message))
    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    logRequest({ fn: 'provider-webhook', user: asset.user_id, asset: assetId, ms: Date.now() - started, ok: true, code: 'FAILED_REFUNDED', released, detail: result.error })
    return jsonResponse({ ok: true, refunded: released })
  } catch (e) {
    // 6) استثناء بعد تسجيل الحدث: نحذف صفه ليعيد المزوّد الإرسال، ونرد 500
    const err = toAppError(e)
    if (eventId) await db.from('webhook_events').delete().eq('event_id', eventId).is('processed_at', null)
    logRequest({ fn: 'provider-webhook', asset: assetId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail ?? err.message, job: jobId })
    return jsonResponse({ ok: false, error: err.code }, 500)
  }
})
