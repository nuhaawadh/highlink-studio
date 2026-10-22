// generate-media — المرحلة 1 (المخطط §5). الخطوات التسع بالترتيب، كل خطوة تفشل مبكرًا برمز واضح ورسالة عربية.
// التدفق الثابت (CLAUDE.md القاعدة 1): الواجهة تدرج صف assets (queued) → هذه الوظيفة → المزوّد → provider-webhook → Realtime.
// الرصيد (القاعدة 2): hold هنا، confirm/release في provider-webhook أو في catch هنا. لا كتابة أخرى في credit_ledger.
// بعد المراجعة المستقلة (2026-10-22):
//  - الأصل يُحجز ذريًا (queued → processing) قبل الحجز والإرسال، فالطلبات المتزامنة بنفس assetId تنتج مهمة واحدة عند المزوّد.
//  - بعد كتابة provider_job_id تنتقل ملكية الحجز إلى الـwebhook: الـcatch هنا لا يحرّره.
//  - assetId لا يُعتمد قبل التحقق من الملكية، فلا تُعلَّم أصول الآخرين فاشلة.
import { requireUser } from '../_shared/auth.ts'
import { handleOptions } from '../_shared/cors.ts'
import { getBalance, holdCredits, releaseAssetHold } from '../_shared/credits.ts'
import { AppError, errorResponse, jsonResponse, toAppError } from '../_shared/errors.ts'
import { buildProviderInput } from '../_shared/inputs.ts'
import { logRequest } from '../_shared/log.ts'
import { applyModelResolution } from '../_shared/pricing.ts'
import { getProvider } from '../_shared/providers/index.ts'
import { GenerateRequestSchema } from '../_shared/request.ts'
import { checkPromptSafety } from '../_shared/safety.ts'
import { projectUrl, supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import type { GenerateResponse, ModelRow } from '../_shared/types.ts'

interface AssetRow {
  id: string
  user_id: string
  status: string
  provider: string | null
  provider_job_id: string | null
  cost_credits: number | null
  metadata: Record<string, unknown> | null
}

/**
 * يعلّم الأصل فاشلًا برسالة عربية — Realtime يوصلها للبطاقة في الواجهة.
 * `from`: الحالة التي نملكها الآن — `queued` قبل الحجز الذرّي، أو `processing` بلا provider_job_id بعده.
 * لا يلمس أصلًا كتب السيرفر فيه provider_job_id (المهمة عند المزوّد والـwebhook هو المالك).
 * التفصيل التقني يُحفظ في metadata.error_detail للوحة الإدارة (المخطط §11 المرحلة 3) ولا يُعرض للمستخدم.
 */
async function markFailed(assetId: string, userId: string, from: 'queued' | 'processing', err: AppError, metadata: Record<string, unknown> | null) {
  await supabaseAdmin()
    .from('assets')
    .update({
      status: 'failed',
      error_code: err.code,
      error_message: err.message,
      completed_at: new Date().toISOString(),
      metadata: { ...(metadata ?? {}), error_detail: err.detail ?? null, failed_at_step: 'generate-media' },
    })
    .eq('id', assetId)
    .eq('user_id', userId)
    .eq('status', from)
    .is('provider_job_id', null)
}

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse(new AppError('INVALID_INPUT', 'طريقة غير مدعومة', { status: 405 }))

  let userId: string | null = null
  /** يُضبط فقط بعد التحقق من أن الأصل يخص المستخدم */
  let assetId: string | null = null
  let assetMetadata: Record<string, unknown> | null = null
  /** احتجزنا الأصل (queued → processing) ولم نكتب provider_job_id بعد */
  let claimed = false
  /** حجز رصيد نشط نملكه نحن (قبل انتقال الملكية إلى الـwebhook) */
  let held = false

  try {
    // 1) المستخدم + الأصل
    const user = await requireUser(req)
    userId = user.id

    const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      throw new AppError('INVALID_INPUT', undefined, { detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
    }
    const body = parsed.data
    const db = supabaseAdmin()

    const { data: asset, error: assetErr } = await db
      .from('assets')
      .select('id, user_id, status, provider, provider_job_id, cost_credits, metadata')
      .eq('id', body.assetId)
      .maybeSingle<AssetRow>()
    if (assetErr) throw toAppError(new Error(assetErr.message))
    if (!asset || asset.user_id !== user.id) {
      throw new AppError('INVALID_INPUT', 'الأصل غير موجود — أعد المحاولة من الصفحة', { status: 404 })
    }
    assetId = asset.id
    assetMetadata = asset.metadata

    // تكرار الطلب بنفس assetId بعد إرسال سابق → نفس الرد (idempotent) بدل حجز ثانٍ
    if (asset.status === 'processing' && asset.provider_job_id) {
      const res: GenerateResponse = {
        success: true,
        assetId: asset.id,
        cost: asset.cost_credits ?? 0,
        balanceAfter: await getBalance(user.id),
        provider: asset.provider as GenerateResponse['provider'],
        providerJobId: asset.provider_job_id,
      }
      logRequest({ fn: 'generate-media', user: userId, asset: assetId, ms: Date.now() - started, ok: true, code: 'IDEMPOTENT' })
      return jsonResponse(res)
    }
    if (asset.status === 'processing') {
      // طلب متزامن احتجز الأصل ولم يُرسل بعد — لا نحجز ولا نرسل مرة ثانية
      throw new AppError('INVALID_INPUT', 'هذا الطلب قيد التنفيذ', { status: 409 })
    }
    if (asset.status !== 'queued') {
      throw new AppError('INVALID_INPUT', 'هذا الطلب نُفّذ من قبل', { status: 409 })
    }

    // 2) حد التزامن حسب الباقة
    const [{ data: profile }, { count: processing }] = await Promise.all([
      db.from('profiles').select('plan_id, plans!inner(max_concurrent)').eq('id', user.id).maybeSingle<{ plan_id: string; plans: { max_concurrent: number } }>(),
      db.from('assets').select('id', { count: 'exact', head: true }).eq('user_id', user.id).eq('status', 'processing').is('deleted_at', null),
    ])
    const maxConcurrent = profile?.plans?.max_concurrent ?? 1
    if ((processing ?? 0) >= maxConcurrent) {
      throw new AppError('RATE_LIMITED', undefined, { detail: `processing=${processing} max=${maxConcurrent}` })
    }

    // 3) حلّ النموذج (الاستوديوهات في المرحلة 2)
    if (body.model.startsWith('studio:')) {
      throw new AppError('MODEL_DISABLED', 'الاستوديوهات تُفعَّل في المرحلة 2')
    }
    const { data: model, error: modelErr } = await db
      .from('models')
      .select('id, type, provider, provider_slug, cost_credits, cost_per_second, max_duration_s, supports, default_params, input_schema, enabled')
      .eq('id', body.model)
      .maybeSingle<ModelRow>()
    if (modelErr) throw toAppError(new Error(modelErr.message))
    if (!model || !model.enabled) throw new AppError('MODEL_DISABLED')
    if (model.type !== 'image' || model.cost_credits == null) {
      throw new AppError('MODEL_DISABLED', 'هذا النوع من النماذج يُفعَّل في جلسة لاحقة')
    }
    const provider = getProvider(model.provider)

    // 4) المدخلات ضد مخطط المزوّد + التسعير
    const built = buildProviderInput(model, body.prompt, body.images, body.config)
    if (built.invalid.length) {
      const first = built.invalid[0]
      throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${first.key}=${String(first.value)} not in ${JSON.stringify(first.allowed)}` })
    }
    const imageSize = (body.config?.imageSize ?? (model.default_params.imageSize as '1K' | '2K' | '4K' | undefined) ?? '1K')
    const cost = applyModelResolution(model.cost_credits, imageSize, model.supports.resolution_multipliers)
    if (body.maxCredits !== undefined && cost > body.maxCredits) {
      throw new AppError('OVER_BUDGET', undefined, { detail: `cost=${cost} max=${body.maxCredits}` })
    }

    // 5) أمان البرومبت
    const safety = checkPromptSafety(body.prompt)
    if (safety.unsafe) throw new AppError('UNSAFE_PROMPT', undefined, { detail: `term=${safety.term}` })

    // 5.5) الحجز الذرّي للأصل: صف واحد فقط ينتقل من queued إلى processing — الطلبات المتزامنة تحصل على 409
    const { data: claimedRows, error: claimErr } = await db
      .from('assets')
      .update({ status: 'processing', provider: provider.name, cost_credits: cost, model: model.id, type: model.type })
      .eq('id', asset.id)
      .eq('user_id', user.id)
      .eq('status', 'queued')
      .select('id')
    if (claimErr) throw toAppError(new Error(claimErr.message))
    if (!claimedRows || claimedRows.length === 0) {
      throw new AppError('INVALID_INPUT', 'هذا الطلب قيد التنفيذ', { status: 409 })
    }
    claimed = true

    // 6) حجز الرصيد (idempotent على assetId)
    await holdCredits(user.id, cost, asset.id)
    held = true

    // 7) المزوّد
    const webhookUrl = `${projectUrl()}/functions/v1/provider-webhook?source=${provider.name}`
    const { jobId } = await provider.submit({ slug: model.provider_slug, input: built.input, webhookUrl })

    // 8) كتابة المهمة → Realtime. من هنا الـwebhook هو مالك الحجز والحالة.
    const { data: written, error: updErr } = await db
      .from('assets')
      .update({
        provider_job_id: jobId,
        prompt: body.prompt,
        aspect_ratio: (built.input.aspect_ratio as string | undefined) ?? null,
        resolution: imageSize,
        feature_tag: body.feature_tag ?? 'general',
        input_urls: body.images ?? null,
        metadata: { ...(asset.metadata ?? {}), prompt_final: body.prompt, provider_input: built.input, locale: body.locale ?? 'ar' },
      })
      .eq('id', asset.id)
      .eq('status', 'processing')
      .is('provider_job_id', null)
      .select('id')
    if (updErr) throw toAppError(new Error(updErr.message))
    if (!written || written.length === 0) {
      throw new AppError('PROVIDER_ERROR', undefined, { detail: `asset ${asset.id} changed state before provider_job_id was written (job ${jobId})` })
    }
    held = false
    claimed = false

    const res: GenerateResponse = {
      success: true,
      assetId: asset.id,
      cost,
      // فشل القراءة هنا لا يُفشل طلبًا نجح فعلًا (المهمة عند المزوّد والحجز قائم)
      balanceAfter: await getBalance(user.id).catch(() => -1),
      provider: provider.name,
      providerJobId: jobId,
    }
    logRequest({ fn: 'generate-media', user: userId, asset: assetId, ms: Date.now() - started, ok: true, model: model.id, cost })
    return jsonResponse(res)
  } catch (e) {
    // 9) أي فشل قبل كتابة provider_job_id: تحرير الحجز إن كان لنا، تعليم الأصل فاشلًا، رمز + رسالة عربية
    const err = toAppError(e)
    let released = false
    if (assetId && userId) {
      try {
        if (held) released = await releaseAssetHold(assetId, `generate-media: ${err.code}`)
        await markFailed(assetId, userId, claimed ? 'processing' : 'queued', err, assetMetadata)
      } catch (inner) {
        logRequest({ fn: 'generate-media', user: userId, asset: assetId, ms: Date.now() - started, ok: false, code: 'CLEANUP_FAILED', detail: String(inner) })
      }
    }
    logRequest({ fn: 'generate-media', user: userId, asset: assetId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail, released })
    const balanceAfter = userId ? await getBalance(userId).catch(() => 0) : 0
    return errorResponse(err, { assetId, cost: 0, balanceAfter })
  }
})
