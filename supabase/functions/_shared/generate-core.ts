// نواة التوليد المشتركة (المخطط §5، ADR 0004 القرار 2): الخطوات التسع بالترتيب، كل خطوة تفشل مبكرًا برمز واضح ورسالة عربية.
// يستدعيها غلافان رقيقان: generate-media (الواجهة بـJWT) وv1 (مفتاح API). مصدر حقيقة واحد للتسعير والأمان والحجز.
// الرصيد (القاعدة 2): hold هنا، confirm/release في provider-webhook/reconcile أو في catch هنا. لا كتابة أخرى في credit_ledger.
// بعد المراجعة المستقلة (2026-10-22) وbacklog B2 (0005):
//  - claim_and_hold في القاعدة: حد التزامن من الباقة + حجز الأصل (queued → processing) + حجز الرصيد في معاملة واحدة
//    تحت قفل المستخدم، فالطلبات المتزامنة بنفس assetId تنتج مهمة واحدة، وتجاوز التزامن لا يترك أثرًا.
//  - بعد كتابة provider_job_id تنتقل ملكية الحجز إلى الـwebhook: الـcatch هنا لا يحرّره.
//  - assetId لا يُعتمد قبل التحقق من الملكية، فلا تُعلَّم أصول الآخرين فاشلة.
// التسعير: modelCredits وحدها (صورة بالدقة، فيديو بالثانية/بالمقطع/بجدول الدقة+الصوت) قبل الحجز — ADR 0005.
// sandbox (مفتاح hl_test_): نفس التحقق والتسعير والأمان وفحص الرصيد، ثم completed فورًا بلا مزوّد ولا حجز (ADR 0004 القرار 5).
import { claimAndHold, getBalance, releaseAssetHold } from './credits.ts'
import { AppError, toAppError } from './errors.ts'
import { buildProviderInput } from './inputs.ts'
import { logRequest } from './log.ts'
import { normalizeOptions } from './options.ts'
import { modelCredits, resolveDuration } from './pricing.ts'
import { getProvider } from './providers/index.ts'
import type { GenerateRequestInput } from './request.ts'
import { checkPromptSafety } from './safety.ts'
import { projectUrl, supabaseAdmin } from './supabaseAdmin.ts'
import type { GenerateResponse, ModelRow } from './types.ts'

interface AssetRow {
  id: string
  user_id: string
  status: string
  provider: string | null
  provider_job_id: string | null
  cost_credits: number | null
  metadata: Record<string, unknown> | null
}

export interface GenerateContext {
  /** اسم الوظيفة المستدعية للسجلات */
  fn: string
  userId: string
  body: GenerateRequestInput
  /** تجربة جافة: لا مزوّد ولا حجز */
  sandbox?: boolean
  started?: number
}

/**
 * يعلّم الأصل فاشلًا برسالة عربية — Realtime يوصلها للبطاقة في الواجهة.
 * `from`: الحالة التي نملكها الآن — `queued` قبل الحجز الذرّي، أو `processing` بلا provider_job_id بعده.
 * لا يلمس أصلًا كتب السيرفر فيه provider_job_id (المهمة عند المزوّد والـwebhook هو المالك).
 * التفصيل التقني يُحفظ في metadata.error_detail للوحة الإدارة (المخطط §11 المرحلة 3) ولا يُعرض للمستخدم.
 */
async function markFailed(fn: string, assetId: string, userId: string, from: 'queued' | 'processing', err: AppError, metadata: Record<string, unknown> | null) {
  await supabaseAdmin()
    .from('assets')
    .update({
      status: 'failed',
      error_code: err.code,
      error_message: err.message,
      completed_at: new Date().toISOString(),
      metadata: { ...(metadata ?? {}), error_detail: err.detail ?? null, failed_at_step: fn },
    })
    .eq('id', assetId)
    .eq('user_id', userId)
    .eq('status', from)
    .is('provider_job_id', null)
}


/** ينفّذ طلب توليد لأصل queued يملكه المستخدم. يرجع رد النجاح أو يرمي AppError بعد تنظيف الحجز والأصل. */
export async function runGenerate(ctx: GenerateContext): Promise<GenerateResponse> {
  const started = ctx.started ?? Date.now()
  const { fn, userId, body } = ctx
  const sandbox = ctx.sandbox === true
  const db = supabaseAdmin()

  /** يُضبط فقط بعد التحقق من أن الأصل يخص المستخدم */
  let assetId: string | null = null
  let assetMetadata: Record<string, unknown> | null = null
  /** احتجزنا الأصل (queued → processing) ولم نكتب provider_job_id بعد */
  let claimed = false
  /** حجز رصيد نشط نملكه نحن (قبل انتقال الملكية إلى الـwebhook) */
  let held = false

  try {
    // 1) الأصل
    const { data: asset, error: assetErr } = await db
      .from('assets')
      .select('id, user_id, status, provider, provider_job_id, cost_credits, metadata')
      .eq('id', body.assetId)
      .maybeSingle<AssetRow>()
    if (assetErr) throw toAppError(new Error(assetErr.message))
    if (!asset || asset.user_id !== userId) {
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
        balanceAfter: await getBalance(userId),
        provider: asset.provider as GenerateResponse['provider'],
        providerJobId: asset.provider_job_id,
      }
      logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: true, code: 'IDEMPOTENT' })
      return res
    }
    if (asset.status === 'processing') {
      // طلب متزامن احتجز الأصل ولم يُرسل بعد — لا نحجز ولا نرسل مرة ثانية
      throw new AppError('INVALID_INPUT', 'هذا الطلب قيد التنفيذ', { status: 409 })
    }
    if (asset.status !== 'queued') {
      throw new AppError('INVALID_INPUT', 'هذا الطلب نُفّذ من قبل', { status: 409 })
    }

    // 2) حد التزامن: يُفحص ذريًا داخل claim_and_hold (الخطوة 6) تحت قفل المستخدم — لا فحص مسبق هنا

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
    if (model.type === 'audio') {
      throw new AppError('MODEL_DISABLED', 'نماذج الصوت تُفعَّل في المرحلة 2')
    }
    // نماذج تحتاج مرجعًا (صورة→فيديو، تعديل بالمراجع…) ترفض الطلب بلا مراجع بسبب مفهوم بدل 422 من المزوّد
    const required = ((model.input_schema as { required?: unknown } | null)?.required ?? []) as unknown[]
    const needsRefs = model.supports.requires_ref === true || ['image_url', 'image_urls', 'start_image_url', 'image_input'].some((k) => required.includes(k))
    if (needsRefs && !(body.images && body.images.length)) {
      throw new AppError('INVALID_INPUT', 'هذا النموذج يحتاج صورة مرجعية واحدة على الأقل')
    }
    const minRefs = typeof model.supports.min_refs === 'number' ? model.supports.min_refs : 0
    if (minRefs > 1 && (body.images?.length ?? 0) < minRefs) {
      throw new AppError('INVALID_INPUT', 'هذا النموذج يحتاج صورتين: الأولى ثم الثانية (إطار أول وأخير، أو الشخص ثم القطعة)')
    }
    const provider = getProvider(model.provider)

    // 4) المدخلات ضد مخطط المزوّد + التسعير (ADR 0005: صورة بالدقة، فيديو بالثانية أو بالمقطع — modelCredits هي المصدر الوحيد)
    // الخيارات أولًا: ما لا تعرضه supports (دقة/حجم/مدة/صوت بلا سعر متحقق) يُرفض قبل بناء المدخلات والتسعير
    const normalized = normalizeOptions(model, body.config)
    if (normalized.issue) {
      const { key, value, allowed } = normalized.issue
      throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${key}=${String(value)} not in ${JSON.stringify(allowed)}` })
    }
    const config = normalized.config
    const built = buildProviderInput(model, body.prompt, body.images, config)
    if (built.invalid.length) {
      const first = built.invalid[0]
      throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${first.key}=${String(first.value)} not in ${JSON.stringify(first.allowed)}` })
    }
    const imageSize = (config.imageSize ?? (model.default_params.imageSize as '1K' | '2K' | '4K' | undefined) ?? '1K')
    const duration = model.type === 'video' ? resolveDuration(model, config.duration) : undefined
    if (model.type === 'video') {
      if (!duration) throw new AppError('MODEL_DISABLED', undefined, { detail: `model ${model.id} has no duration` })
      if (model.max_duration_s != null && duration > model.max_duration_s) {
        throw new AppError('INVALID_INPUT', 'المدة أطول مما يدعمه هذا النموذج', { detail: `duration=${duration} max=${model.max_duration_s}` })
      }
    }
    const videoResolution = model.type === 'video' ? (config.resolution ?? (model.default_params.resolution as string | undefined) ?? null) : null
    let cost: number
    try {
      cost = modelCredits(model, { imageSize, duration, resolution: videoResolution ?? undefined, audio: config.audio })
    } catch (e) {
      throw new AppError('MODEL_DISABLED', undefined, { detail: `pricing: ${e instanceof Error ? e.message : String(e)}` })
    }
    if (body.maxCredits !== undefined && cost > body.maxCredits) {
      throw new AppError('OVER_BUDGET', undefined, { detail: `cost=${cost} max=${body.maxCredits}` })
    }

    // 5) أمان البرومبت
    const safety = checkPromptSafety(body.prompt)
    if (safety.unsafe) throw new AppError('UNSAFE_PROMPT', undefined, { detail: `term=${safety.term}` })

    const commonFields = {
      prompt: body.prompt,
      aspect_ratio: (built.input.aspect_ratio as string | undefined) ?? config.aspectRatio ?? null,
      resolution: model.type === 'video' ? videoResolution : imageSize,
      duration_s: model.type === 'video' ? (duration ?? null) : null,
      feature_tag: body.feature_tag ?? 'general',
      input_urls: body.images ?? null,
    }

    // 5.s) sandbox: الرصيد يكفي؟ ثم completed فورًا بلا مزوّد ولا حجز
    if (sandbox) {
      const balance = await getBalance(userId)
      if (balance < cost) throw new AppError('INSUFFICIENT_CREDITS', undefined, { detail: `sandbox balance=${balance} cost=${cost}` })
      const { data: done, error: sbErr } = await db
        .from('assets')
        .update({
          ...commonFields,
          status: 'completed',
          model: model.id,
          type: model.type,
          cost_credits: 0,
          completed_at: new Date().toISOString(),
          metadata: { ...(asset.metadata ?? {}), sandbox: true, would_cost: cost, prompt_final: body.prompt, provider_input: built.input, locale: body.locale ?? 'ar', template: body.template ?? null },
        })
        .eq('id', asset.id)
        .eq('status', 'queued')
        .select('id')
      if (sbErr) throw toAppError(new Error(sbErr.message))
      if (!done || done.length === 0) throw new AppError('INVALID_INPUT', 'هذا الطلب قيد التنفيذ', { status: 409 })
      logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: true, model: model.id, cost, sandbox: true })
      return { success: true, assetId: asset.id, cost, balanceAfter: balance, provider: provider.name, sandbox: true }
    }

    // 6) حد التزامن + حجز الأصل + حجز الرصيد — معاملة واحدة تحت قفل المستخدم (0005)
    await claimAndHold({ userId, assetId: asset.id, amount: cost, provider: provider.name, model: model.id, type: model.type })
    claimed = true
    held = true

    // 7) المزوّد
    const webhookUrl = `${projectUrl()}/functions/v1/provider-webhook?source=${provider.name}`
    const { jobId } = await provider.submit({ slug: model.provider_slug, input: built.input, webhookUrl })

    // 8) كتابة المهمة → Realtime. من هنا الـwebhook هو مالك الحجز والحالة. محاولة ثانية عند خطأ عابر في القاعدة.
    const writeJob = () =>
      db
        .from('assets')
        .update({
          ...commonFields,
          provider_job_id: jobId,
          metadata: { ...(asset.metadata ?? {}), prompt_final: body.prompt, provider_input: built.input, locale: body.locale ?? 'ar', template: body.template ?? null },
        })
        .eq('id', asset.id)
        .eq('status', 'processing')
        .is('provider_job_id', null)
        .select('id')
    // بعد الإرسال لا نرمي أبدًا: المهمة تعمل عند المزوّد وتُحسب علينا — خطأ هنا يُفهم "أعد المحاولة" فتصير مهمتان وخصمان
    // (المراجعة المستقلة الثانية 2026-10-24). إن تعذّر ربط المهمة بالأصل نحاول بلا شرط الحالة، ونرد بالنجاح والحجز قائم:
    // الـwebhook يُنهي إن وجد الأصل، وإلا يسوّيه reconcile_holds بعد المهلة.
    let { data: written, error: updErr } = await writeJob()
    if (updErr) ({ data: written, error: updErr } = await writeJob())
    if (updErr || !written || written.length === 0) {
      await db
        .from('assets')
        .update({ provider_job_id: jobId })
        .eq('id', asset.id)
        .is('provider_job_id', null)
        .then(
          () => undefined,
          () => undefined,
        )
      logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: false, code: 'JOB_NOT_RECORDED', detail: `job ${jobId}: ${updErr?.message ?? 'asset changed state before provider_job_id was written'}` })
    }
    held = false
    claimed = false

    const res: GenerateResponse = {
      success: true,
      assetId: asset.id,
      cost,
      // فشل القراءة هنا لا يُفشل طلبًا نجح فعلًا (المهمة عند المزوّد والحجز قائم)
      balanceAfter: await getBalance(userId).catch(() => -1),
      provider: provider.name,
      providerJobId: jobId,
    }
    logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: true, model: model.id, cost, type: model.type })
    return res
  } catch (e) {
    // 9) أي فشل قبل كتابة provider_job_id: تحرير الحجز إن كان لنا، تعليم الأصل فاشلًا، ثم إعادة الرمي للغلاف.
    //    (بعد الإرسال لا يصل التنفيذ إلى هنا — الخطوة 8 لا ترمي)
    const err = toAppError(e)
    let released = false
    if (assetId) {
      try {
        if (held) released = await releaseAssetHold(assetId, `${fn}: ${err.code}`)
        await markFailed(fn, assetId, userId, claimed ? 'processing' : 'queued', err, assetMetadata)
      } catch (inner) {
        logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: false, code: 'CLEANUP_FAILED', detail: String(inner) })
      }
    }
    logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail, released })
    throw err
  }
}
