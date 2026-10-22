// نواة التوليد المشتركة (المخطط §5، ADR 0004 القرار 2): الخطوات التسع بالترتيب، كل خطوة تفشل مبكرًا برمز واضح ورسالة عربية.
// يستدعيها غلافان رقيقان: generate-media (الواجهة بـJWT) وv1 (مفتاح API). مصدر حقيقة واحد للتسعير والأمان والحجز.
// الرصيد (القاعدة 2): hold هنا، confirm/release في provider-webhook/reconcile أو في catch هنا. لا كتابة أخرى في credit_ledger.
// بعد المراجعة المستقلة (2026-10-22) وbacklog B2 (0005):
//  - claim_and_hold في القاعدة: حد التزامن من الباقة + حجز الأصل (queued → processing) + حجز الرصيد في معاملة واحدة
//    تحت قفل المستخدم، فالطلبات المتزامنة بنفس assetId تنتج مهمة واحدة، وتجاوز التزامن لا يترك أثرًا.
//  - بعد كتابة provider_job_id تنتقل ملكية الحجز إلى الـwebhook: الـcatch هنا لا يحرّره.
//  - assetId لا يُعتمد قبل التحقق من الملكية، فلا تُعلَّم أصول الآخرين فاشلة.
// الفيديو (Kling): التكلفة = جدول الدقة/الصوت × المدة قبل الإرسال؛ الصورة→فيديو عبر images[0].
// sandbox (مفتاح hl_test_): نفس التحقق والتسعير والأمان وفحص الرصيد، ثم completed فورًا بلا مزوّد ولا حجز (ADR 0004 القرار 5).
import { claimAndHold, getBalance, releaseAssetHold } from './credits.ts'
import { AppError, toAppError } from './errors.ts'
import { buildProviderInput } from './inputs.ts'
import { logRequest } from './log.ts'
import { applyModelResolution, videoCredits } from './pricing.ts'
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

/** تسعير الطلب حسب نوع النموذج — صورة: cost_credits × معامل الدقة؛ فيديو: جدول الدقة/الصوت × المدة */
function priceRequest(model: ModelRow, body: GenerateRequestInput): { cost: number; resolution: string; duration: number | null; audio: boolean } {
  const defaults = model.default_params ?? {}
  if (model.type === 'video') {
    if (model.cost_per_second == null) throw new AppError('MODEL_DISABLED', 'هذا النموذج بلا تسعير بعد')
    const duration = body.config?.duration ?? (typeof defaults.duration === 'number' ? defaults.duration : 5)
    const allowed = (model.supports as { durations?: unknown }).durations
    if (Array.isArray(allowed) && allowed.length && !allowed.includes(duration)) {
      throw new AppError('INVALID_INPUT', 'مدة غير مدعومة لهذا النموذج', { detail: `duration=${duration} allowed=${JSON.stringify(allowed)}` })
    }
    if (model.max_duration_s != null && duration > model.max_duration_s) {
      throw new AppError('INVALID_INPUT', 'المدة تتجاوز الحد الأقصى لهذا النموذج', { detail: `duration=${duration} max=${model.max_duration_s}` })
    }
    const resolution = body.config?.resolution ?? (typeof defaults.resolution === 'string' ? defaults.resolution : '720p')
    const audio = body.config?.audio ?? (typeof defaults.audio === 'boolean' ? defaults.audio : false)
    return { cost: videoCredits(Number(model.cost_per_second), duration, resolution, audio, model.supports), resolution, duration, audio }
  }
  if (model.cost_credits == null) throw new AppError('MODEL_DISABLED', 'هذا النموذج بلا تسعير بعد')
  const imageSize = body.config?.imageSize ?? (defaults.imageSize as '1K' | '2K' | '4K' | undefined) ?? '1K'
  return { cost: applyModelResolution(model.cost_credits, imageSize, model.supports.resolution_multipliers), resolution: imageSize, duration: null, audio: false }
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
    if (model.type !== 'image' && model.type !== 'video') {
      throw new AppError('MODEL_DISABLED', 'هذا النوع من النماذج يُفعَّل في جلسة لاحقة')
    }
    const provider = getProvider(model.provider)

    // 4) المدخلات ضد مخطط المزوّد + التسعير
    const built = buildProviderInput(model, body.prompt, body.images, body.config)
    if (built.invalid.length) {
      const first = built.invalid[0]
      throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${first.key}=${String(first.value)} not in ${JSON.stringify(first.allowed)}` })
    }
    const price = priceRequest(model, body)
    const cost = price.cost
    if (body.maxCredits !== undefined && cost > body.maxCredits) {
      throw new AppError('OVER_BUDGET', undefined, { detail: `cost=${cost} max=${body.maxCredits}` })
    }

    // 5) أمان البرومبت
    const safety = checkPromptSafety(body.prompt)
    if (safety.unsafe) throw new AppError('UNSAFE_PROMPT', undefined, { detail: `term=${safety.term}` })

    const commonFields = {
      prompt: body.prompt,
      aspect_ratio: (built.input.aspect_ratio as string | undefined) ?? null,
      resolution: price.resolution,
      duration_s: price.duration,
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
          metadata: { ...(asset.metadata ?? {}), sandbox: true, would_cost: cost, prompt_final: body.prompt, provider_input: built.input, locale: body.locale ?? 'ar' },
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

    // 8) كتابة المهمة → Realtime. من هنا الـwebhook هو مالك الحجز والحالة.
    const { data: written, error: updErr } = await db
      .from('assets')
      .update({
        ...commonFields,
        provider_job_id: jobId,
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
      balanceAfter: await getBalance(userId).catch(() => -1),
      provider: provider.name,
      providerJobId: jobId,
    }
    logRequest({ fn, user: userId, asset: assetId, ms: Date.now() - started, ok: true, model: model.id, cost, type: model.type })
    return res
  } catch (e) {
    // 9) أي فشل قبل كتابة provider_job_id: تحرير الحجز إن كان لنا، تعليم الأصل فاشلًا، ثم إعادة الرمي للغلاف
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
