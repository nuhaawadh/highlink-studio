// provider-webhook — المرحلة 1 (المخطط §5). يستقبل نتيجة المزوّد، يتحقق من التوقيع، يمنع التكرار،
// ثم يُنهي الأصل عبر _shared/finalize.ts (نسخ الناتج، completed/failed، تأكيد/تحرير الحجز، webhook العميل).
// verify_jwt=false في config.toml — الحماية الوحيدة هي التوقيع، فلا طريق بدونه.
// الترتيب مهم لأن المزوّد قد يرسل الحدث مرتين: التوقيع → dedupe → المعالجة → processed_at.
import { z } from 'npm:zod@4'
import { handleOptions } from '../_shared/cors.ts'
import { confirmAssetHold, releaseAssetHold } from '../_shared/credits.ts'
import { jsonResponse, toAppError } from '../_shared/errors.ts'
import { finalizeAsset, type FinalizableAsset } from '../_shared/finalize.ts'
import { logRequest } from '../_shared/log.ts'
import { getProvider } from '../_shared/providers/index.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

/** المزوّدون الذين نقبل منهم webhooks (CLAUDE.md القاعدة 10) — google يُضاف مع محوّله */
const Source = z.enum(['replicate', 'fal'])

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method' }, 405)

  const sourceParsed = Source.safeParse(new URL(req.url).searchParams.get('source') ?? 'replicate')
  if (!sourceParsed.success) return jsonResponse({ ok: false, error: 'unknown source' }, 400)
  const source = sourceParsed.data
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

    let result = provider.parseWebhook(rawBody)
    jobId = result.jobId

    // 3) الأصل المرتبط بالمهمة
    const { data: asset, error: assetErr } = await db
      .from('assets')
      .select('id, user_id, type, status, metadata, api_key_id, model')
      .eq('provider', provider.name)
      .eq('provider_job_id', result.jobId)
      .maybeSingle<FinalizableAsset & { model: string | null }>()
    if (assetErr) throw toAppError(new Error(assetErr.message))

    if (!asset) {
      // مهمة لا نعرفها بعد: قد يكون الحدث سبق تحديث الأصل في generate-media (فشل فوري عند المزوّد).
      // نحذف صف الحدث ونرد 404 ليعيد المزوّد الإرسال لاحقًا (Replicate يعيد المحاولة على غير 2xx نحو دقيقة).
      await db.from('webhook_events').delete().eq('event_id', eventId)
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: false, code: 'UNKNOWN_JOB', job: jobId })
      return jsonResponse({ ok: false, error: 'unknown job' }, 404)
    }
    assetId = asset.id

    if (asset.status === 'completed' || asset.status === 'failed' || asset.status === 'canceled') {
      // تسوية: إن وصلنا هنا بإعادة إرسال بعد أن سُجّلت الحالة النهائية لكن فشل تأكيد/تحرير الحجز في المحاولة السابقة،
      // نكمله الآن (كلاهما idempotent ويعيد false إن لم يوجد حجز نشط) — وإلا بقي صف hold/held إلى الأبد.
      const reconciled = asset.status === 'completed' ? await confirmAssetHold(asset.id) : await releaseAssetHold(asset.id, `reconcile: asset ${asset.status}`)
      await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
      logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: true, code: 'ALREADY_FINAL', asset: assetId, status: asset.status, reconciled })
      return jsonResponse({ ok: true, alreadyFinal: true, reconciled })
    }

    // 3.5) "نجح" بلا ناتج في الحدث (fal: الحمولة كبيرة على الـwebhook) — نسأل المزوّد عن النتيجة قبل الاسترداد، لأنه حاسبنا.
    //      إن تعذّر السؤال نُكمل بالنتيجة كما وصلت (فشل يحرّر الحجز) ولا نرمي.
    if (result.refetch) {
      try {
        const { data: modelRow } = await db.from('models').select('provider_slug').eq('id', asset.model ?? '').maybeSingle<{ provider_slug: string }>()
        const fetched = await provider.getJob(result.jobId, modelRow?.provider_slug)
        logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: true, code: 'REFETCHED', asset: assetId, status: fetched.status })
        if (fetched.status === 'succeeded') result = fetched
      } catch (e) {
        logRequest({ fn: 'provider-webhook', ms: Date.now() - started, ok: false, code: 'REFETCH_FAILED', asset: assetId, detail: toAppError(e).detail ?? String(e) })
      }
    }

    // 4/5) الإنهاء الموحّد
    const outcome = await finalizeAsset(asset, result, { fn: 'provider-webhook', started })
    await db.from('webhook_events').update({ processed_at: new Date().toISOString() }).eq('event_id', eventId)
    return jsonResponse({ ok: true, outcome })
  } catch (e) {
    // 6) استثناء بعد تسجيل الحدث: نحذف صفه ليعيد المزوّد الإرسال، ونرد 500
    const err = toAppError(e)
    if (eventId) await db.from('webhook_events').delete().eq('event_id', eventId).is('processed_at', null)
    logRequest({ fn: 'provider-webhook', asset: assetId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail ?? err.message, job: jobId })
    return jsonResponse({ ok: false, error: err.code }, 500)
  }
})
