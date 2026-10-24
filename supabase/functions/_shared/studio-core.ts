// تشغيل الاستوديو (ADR 0006): model = studio:<id>. يستدعيه generate-core لطلبات الواجهة فقط.
// الترتيب: الوصفة (المعطّل للمشرف فقط) → النموذج المقفل → المقاسات والمرجع → الأصول (نفس run_id) → الأمان → التسعير
//   → claim_and_hold_run (كل الحجوزات أو لا شيء) → إرسال مهمة لكل مقاس → كتابة المهمة لكل أصل.
// بعد إرسال مهمة لا نرمي لأجلها أبدًا (نفس قاعدة generate-core)؛ مقاس فشل إرساله يُحرَّر حجزه ويُعلَّم فاشلًا وحده.
import { claimAndHoldRun, getBalance, releaseAssetHold } from './credits.ts'
import { AppError, toAppError } from './errors.ts'
import { buildProviderInput } from './inputs.ts'
import { logRequest } from './log.ts'
import { normalizeOptions } from './options.ts'
import { modelCredits } from './pricing.ts'
import { getProvider } from './providers/index.ts'
import type { GenerateRequestInput } from './request.ts'
import { checkPromptSafety } from './safety.ts'
import { isOwnReferenceUrl, renderStudioPrompt, selectOutputs, StudioRecipeSchema, type StudioRecipe } from './studio.ts'
import { projectUrl, supabaseAdmin } from './supabaseAdmin.ts'
import { GENERATE_ERROR_CODES, type GenerateErrorCode, type GenerateResponse, type ModelRow } from './types.ts'

interface RunAsset {
  id: string
  user_id: string
  status: string
  run_id: string | null
  provider_job_id: string | null
  cost_credits: number | null
  metadata: Record<string, unknown> | null
}

/** ما يحمله كل أصل استوديو في metadata.studio — يقرؤه finalize لبوابة الجودة وإعادة الإرسال */
export interface StudioAssetMeta {
  id: string
  preset: string
  scene: string | null
  text: string | null
  output: string
  aspect_ratio: string
  run_id: string
  reference_url: string
  provider: string
  provider_slug: string
  qa: StudioRecipe['qa']
}

async function failQueued(ids: string[], userId: string, err: AppError, fn: string) {
  if (!ids.length) return
  await supabaseAdmin()
    .from('assets')
    .update({
      status: 'failed',
      error_code: err.code,
      error_message: err.message,
      completed_at: new Date().toISOString(),
      metadata: { error_detail: err.detail ?? null, failed_at_step: fn },
    })
    .in('id', ids)
    .eq('user_id', userId)
    .eq('status', 'queued')
}

async function failProcessing(id: string, userId: string, err: AppError, fn: string, metadata: Record<string, unknown> | null) {
  await supabaseAdmin()
    .from('assets')
    .update({
      status: 'failed',
      error_code: err.code,
      error_message: err.message,
      completed_at: new Date().toISOString(),
      metadata: { ...(metadata ?? {}), error_detail: err.detail ?? null, failed_at_step: fn },
    })
    .eq('id', id)
    .eq('user_id', userId)
    .eq('status', 'processing')
    .is('provider_job_id', null)
}

export async function runStudio(ctx: { fn: string; userId: string; body: GenerateRequestInput; started: number; sandbox: boolean }): Promise<GenerateResponse> {
  const { fn, userId, body, started } = ctx
  const db = supabaseAdmin()
  const studioId = body.model.slice('studio:'.length)
  const req = body.studio
  /** أصول تحققنا أنها للمستخدم و queued — تُعلَّم فاشلة إن فشل الطلب قبل الحجز */
  let ownedQueued: string[] = []

  try {
    if (ctx.sandbox || fn !== 'generate-media') {
      throw new AppError('MODEL_DISABLED', 'الاستوديوهات متاحة من الواجهة فقط حاليًا')
    }
    if (!req) throw new AppError('INVALID_INPUT', undefined, { detail: 'studio body missing' })
    const ids = req.outputs.map((o) => o.assetId)
    if (new Set(ids).size !== ids.length || !ids.includes(body.assetId)) {
      throw new AppError('INVALID_INPUT', undefined, { detail: 'studio outputs must be distinct and include assetId' })
    }

    // 1) الوصفة: المعطّل يعمل للمشرف فقط (المعاينة والمجموعة الذهبية)
    const [{ data: studio, error: stErr }, { data: admin }] = await Promise.all([
      db.from('studios').select('id, enabled, pipeline').eq('id', studioId).maybeSingle<{ id: string; enabled: boolean; pipeline: unknown }>(),
      db.from('app_admins').select('user_id').eq('user_id', userId).maybeSingle(),
    ])
    if (stErr) throw toAppError(new Error(stErr.message))
    if (!studio || (!studio.enabled && !admin)) throw new AppError('MODEL_DISABLED')
    const parsedRecipe = StudioRecipeSchema.safeParse(studio.pipeline)
    if (!parsedRecipe.success) throw new AppError('MODEL_DISABLED', undefined, { detail: `recipe ${studioId}: ${parsedRecipe.error.issues[0]?.path.join('.')}` })
    const recipe = parsedRecipe.data
    if (!recipe.presets[req.preset]) throw new AppError('INVALID_INPUT', 'مشهد غير معروف لهذا الاستوديو', { detail: `preset=${req.preset}` })

    // 2) النموذج المقفل
    const { data: model, error: modelErr } = await db
      .from('models')
      .select('id, type, provider, provider_slug, cost_credits, cost_per_second, max_duration_s, supports, default_params, input_schema, enabled')
      .eq('id', recipe.model)
      .maybeSingle<ModelRow>()
    if (modelErr) throw toAppError(new Error(modelErr.message))
    if (!model || !model.enabled || model.type !== 'image') throw new AppError('MODEL_DISABLED', undefined, { detail: `studio model ${recipe.model}` })
    const provider = getProvider(model.provider)

    // 3) المقاسات وصورة المنتج (من تخزيننا للمستخدم نفسه فقط)
    let outputs
    try {
      outputs = selectOutputs(recipe, req.outputs.map((o) => o.key))
    } catch (e) {
      throw new AppError('INVALID_INPUT', 'مقاس غير مدعوم لهذا الاستوديو', { detail: e instanceof Error ? e.message : String(e) })
    }
    const reference = body.images?.length === 1 ? body.images[0] : null
    if (!reference || !isOwnReferenceUrl(reference, projectUrl(), userId)) {
      throw new AppError('INVALID_INPUT', 'ارفع صورة المنتج أولًا', { detail: 'studio needs exactly one own reference image' })
    }

    // 4) الأصول: كلها للمستخدم وبنفس run_id
    const { data: rows, error: aErr } = await db
      .from('assets')
      .select('id, user_id, status, run_id, provider_job_id, cost_credits, metadata')
      .in('id', ids)
      .returns<RunAsset[]>()
    if (aErr) throw toAppError(new Error(aErr.message))
    const assets = rows ?? []
    if (assets.length !== ids.length || assets.some((a) => a.user_id !== userId)) {
      throw new AppError('INVALID_INPUT', 'الأصل غير موجود — أعد المحاولة من الصفحة', { status: 404 })
    }
    const runIds = new Set(assets.map((a) => a.run_id))
    if (runIds.size !== 1 || runIds.has(null)) throw new AppError('INVALID_INPUT', 'طلب الاستوديو غير صالح — أعد المحاولة من الصفحة', { status: 409, detail: 'run_id mismatch' })
    const runId = assets[0].run_id as string
    const queued = assets.filter((a) => a.status === 'queued')
    if (queued.length === 0 && assets.every((a) => a.provider_job_id)) {
      // تكرار الطلب بعد إرسال سابق → نفس الرد بلا حجز ثانٍ
      const cost = assets.filter((a) => a.status !== 'failed').reduce((s, a) => s + (a.cost_credits ?? 0), 0)
      logRequest({ fn, user: userId, asset: body.assetId, ms: Date.now() - started, ok: true, code: 'IDEMPOTENT', studio: studioId })
      return { success: true, assetId: body.assetId, cost, balanceAfter: await getBalance(userId), provider: provider.name, providerJobId: assets[0].provider_job_id ?? undefined }
    }
    if (queued.length !== assets.length) throw new AppError('INVALID_INPUT', 'هذا الطلب قيد التنفيذ', { status: 409 })
    ownedQueued = ids

    // 5) الأمان: الوصف المعروض والمشهد والنص
    for (const s of [body.prompt, req.scene ?? '', req.text ?? '']) {
      const safety = checkPromptSafety(s)
      if (safety.unsafe) throw new AppError('UNSAFE_PROMPT', undefined, { detail: `term=${safety.term}` })
    }

    // 6) المدخلات لكل مقاس + التسعير من النموذج (ADR 0006 القرار 4)
    const byId = new Map(req.outputs.map((o) => [o.assetId, o.key]))
    const plans = assets.map((a) => {
      const output = outputs.find((o) => o.key === byId.get(a.id))!
      const normalized = normalizeOptions(model, { aspectRatio: output.aspect_ratio as never, imageSize: recipe.defaults.resolution })
      if (normalized.issue) {
        throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${normalized.issue.key}=${String(normalized.issue.value)}` })
      }
      const prompt = renderStudioPrompt(recipe, { preset: req.preset, scene: req.scene, text: req.text, output })
      const built = buildProviderInput(model, prompt, [reference], normalized.config)
      if (built.invalid.length) {
        const f = built.invalid[0]
        throw new AppError('INVALID_INPUT', 'إعداد غير مدعوم لهذا النموذج', { detail: `${f.key}=${String(f.value)} not in ${JSON.stringify(f.allowed)}` })
      }
      return { asset: a, output, prompt, input: built.input }
    })
    let each: number
    try {
      each = modelCredits(model, { imageSize: recipe.defaults.resolution })
    } catch (e) {
      throw new AppError('MODEL_DISABLED', undefined, { detail: `pricing: ${e instanceof Error ? e.message : String(e)}` })
    }
    const total = each * plans.length
    if (body.maxCredits !== undefined && total > body.maxCredits) throw new AppError('OVER_BUDGET', undefined, { detail: `cost=${total} max=${body.maxCredits}` })

    // 7) كل الحجوزات أو لا شيء
    await claimAndHoldRun({ userId, assetIds: ids, amountEach: each, provider: provider.name, model: model.id, type: 'image' })
    ownedQueued = []

    // 8) إرسال مهمة لكل مقاس بالتتابع (دفعة Replicate = 1 تحت 5$ — التوازي خُنق في التجربة الحية 2026-10-24)، ثم كتابتها.
    //    فشل مقاس لا يمس أخواته.
    const webhookUrl = `${projectUrl()}/functions/v1/provider-webhook?source=${provider.name}`
    const sendOne = async (p: (typeof plans)[number]) => {
        const meta: StudioAssetMeta = {
          id: recipe.id,
          preset: req.preset,
          scene: req.scene || null,
          text: req.text || null,
          output: p.output.key,
          aspect_ratio: p.output.aspect_ratio,
          run_id: runId,
          reference_url: reference,
          provider: provider.name,
          provider_slug: model.provider_slug,
          qa: recipe.qa,
        }
        const metadata = {
          ...(p.asset.metadata ?? {}),
          prompt_final: p.prompt,
          provider_input: p.input,
          locale: body.locale ?? 'ar',
          studio: meta,
          qa: { status: 'pending', attempts: [], retries_used: 0, judge_failures: 0 },
        }
        let jobId: string
        try {
          ;({ jobId } = await provider.submit({ slug: model.provider_slug, input: p.input, webhookUrl }))
        } catch (e) {
          const err = toAppError(e)
          const released = await releaseAssetHold(p.asset.id, `${fn}: studio submit ${err.code}`).catch(() => false)
          await failProcessing(p.asset.id, userId, err, fn, metadata).catch(() => undefined)
          logRequest({ fn, user: userId, asset: p.asset.id, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail, released, studio: studioId })
          return { assetId: p.asset.id, key: p.output.key, ok: false as const, error: err }
        }
        const fields = {
          prompt: body.prompt,
          aspect_ratio: p.output.aspect_ratio,
          resolution: recipe.defaults.resolution,
          feature_tag: 'product',
          input_urls: [reference],
          provider_job_id: jobId,
          metadata,
        }
        const write = () =>
          db.from('assets').update(fields).eq('id', p.asset.id).eq('status', 'processing').is('provider_job_id', null).select('id')
        let { data: written, error: wErr } = await write()
        if (wErr) ({ data: written, error: wErr } = await write())
        if (wErr || !written || written.length === 0) {
          // المهمة تعمل عند المزوّد: لا نرمي. نربط المعرّف على الأقل؛ الـwebhook أو reconcile يُنهيان
          await db.from('assets').update({ provider_job_id: jobId }).eq('id', p.asset.id).is('provider_job_id', null).then(() => undefined, () => undefined)
          logRequest({ fn, user: userId, asset: p.asset.id, ms: Date.now() - started, ok: false, code: 'JOB_NOT_RECORDED', detail: `job ${jobId}: ${wErr?.message ?? 'state changed'}` })
        }
        return { assetId: p.asset.id, key: p.output.key, ok: true as const, jobId }
    }
    const results: Array<Awaited<ReturnType<typeof sendOne>>> = []
    for (const p of plans) results.push(await sendOne(p))

    const sent = results.filter((r) => r.ok)
    if (sent.length === 0) {
      // كل المقاسات فشل إرسالها: حجوزاتها حُرّرت وأصولها فاشلة — نعيد خطأ المزوّد الأول
      throw (results[0] as { error: AppError }).error
    }
    logRequest({ fn, user: userId, asset: body.assetId, ms: Date.now() - started, ok: true, studio: studioId, outputs: results.length, sent: sent.length, cost: each * sent.length })
    return {
      success: true,
      assetId: body.assetId,
      cost: each * sent.length,
      balanceAfter: await getBalance(userId).catch(() => -1),
      provider: provider.name,
      providerJobId: (sent[0] as { jobId: string }).jobId,
      // رموز خارج عقد generate (مثل UNAUTHORIZED) تُعرض كخطأ مزوّد — العقد العام لا يتسع لغيرها
      outputs: results.map((r) => ({ assetId: r.assetId, key: r.key, ok: r.ok, error: r.ok ? undefined : { code: asGenerateCode(r.error.code), message: r.error.message } })),
    }
  } catch (e) {
    const err = toAppError(e)
    // قبل الحجز: أصول التشغيل queued تُعلَّم فاشلة بالرسالة نفسها (Realtime يوصلها للبطاقات)
    await failQueued(ownedQueued, userId, err, fn).catch(() => undefined)
    logRequest({ fn, user: userId, asset: body.assetId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail, studio: studioId })
    throw err
  }
}

function asGenerateCode(code: string): GenerateErrorCode {
  return (GENERATE_ERROR_CODES as readonly string[]).includes(code) ? (code as GenerateErrorCode) : 'PROVIDER_ERROR'
}
