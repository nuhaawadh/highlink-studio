import { scheduleAssetWebhook } from './client-webhook.ts'
import { confirmAssetHold, releaseAssetHold } from './credits.ts'
import { toAppError } from './errors.ts'
import { logRequest } from './log.ts'
import { isOutputRejected, OutputRejectedError } from './output-errors.ts'
import type { ProviderWebhookResult } from './providers/index.ts'
import { copyFromUrl } from './storage.ts'
import { defaultGateDeps, loadStudioJob, QA_FAILED_MESSAGE_AR, runQaGate, type QaSummary } from './studio-qa.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * إنهاء أصل بنتيجة المزوّد (المخطط §5 الخطوتان 4 و5) — يستدعيه provider-webhook عند وصول الحدث،
 * وreconcile عندما يسأل المزوّد بنفسه (backlog B9). الترتيب ثابت:
 *   نجاح: نسخ الناتج إلى التخزين الدائم → completed → تأكيد الخصم → webhook العميل
 *   فشل/إلغاء/ناتج مرفوض نهائيًا: failed برسالة عربية → تحرير الحجز → webhook العميل
 * الحالة تُكتب مشروطة بـprocessing و**تُرجع الصف**: فقط من غيّر الحالة يؤكد أو يحرر (المراجعة المستقلة 2026-10-24) —
 * فلو تسابق الـwebhook وreconcile بنتيجتين مختلفتين، تفوز واحدة ويتطابق الدفتر مع الحالة (لا ناتج مجاني ولا خصم بلا ناتج).
 * فشل التأكيد/التحرير بعد كتابة الحالة يُكمَل عند إعادة الإرسال (فرع alreadyFinal في provider-webhook) أو في reconcile_holds.
 * ناتج لا يمكن حفظه (OutputRejectedError: صيغة/حجم/فارغ/4xx/نجاح بلا ناتج) = فشل نهائي يحرّر الحجز، لا 500 يتكرر للأبد.
 */
export interface FinalizableAsset {
  id: string
  user_id: string
  type: 'image' | 'video' | 'audio'
  status: string
  metadata: Record<string, unknown> | null
  api_key_id: string | null
  /** المهمة الحالية للأصل — نتيجة مهمة أخرى (قديمة بعد إعادة البوابة) تُتجاهل (المراجعة المستقلة I2) */
  provider_job_id?: string | null
  run_id?: string | null
}

export const FAILED_MESSAGE_AR = 'فشل التوليد عند المزوّد — استُرجع رصيدك كاملًا'
export const CANCELED_MESSAGE_AR = 'أُلغي التوليد — استُرجع رصيدك كاملًا'
export const TIMEOUT_MESSAGE_AR = 'انتهت مهلة التوليد — استُرجع رصيدك كاملًا'
export const OUTPUT_REJECTED_MESSAGE_AR = 'تعذّر حفظ الناتج — استُرجع رصيدك كاملًا'
export const STUDIO_STATE_MISSING_AR = 'تعذّر فحص الصورة — استُرجع رصيدك كاملًا'

export type FinalizeOutcome = 'completed' | 'failed' | 'skipped'

export async function finalizeAsset(asset: FinalizableAsset, result: ProviderWebhookResult, ctx: { fn: string; started: number }): Promise<FinalizeOutcome> {
  const db = supabaseAdmin()
  if (result.status === 'processing') return 'skipped'
  // I2: نتيجة مهمة ليست الحالية للأصل (مثلًا job1 بعد أن أعادت البوابة الإرسال إلى job2) — لا تُنهي الأصل
  if (asset.provider_job_id && asset.provider_job_id !== result.jobId) {
    logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'STALE_JOB', job: result.jobId, current: asset.provider_job_id })
    return 'skipped'
  }

  if (result.status === 'succeeded') {
    // بوابة الجودة للاستوديوهات (ADR 0006): قبل النسخ — الرسوب يعيد الإرسال أو يفشل ويسترد، ولا يرى العميل الناتج المرفوض.
    // C1: البوابة تُفعَّل وتُدار من صف studio_jobs (يكتبه السيرفر) لا من metadata.
    let studioQa: QaSummary | null = null
    if (result.outputs[0]) {
      const job = await loadStudioJob(asset.id)
      if (job) {
        const gate = await runQaGate(job, result.jobId, result.outputs[0], defaultGateDeps({ fn: ctx.fn, started: ctx.started, userId: asset.user_id }))
        if (gate.kind === 'retried') return 'skipped'
        if (gate.kind === 'fail') {
          return await failAsset(asset, { ctx, jobId: result.jobId, message: QA_FAILED_MESSAGE_AR, reason: gate.reason, metadata: { qa: gate.summary } })
        }
        studioQa = gate.summary
      } else if (asset.run_id) {
        // I5 (دفاع): أصل استوديو بلا حالة بوابة — لا نسلّمه بلا فحص؛ فشل واسترداد
        return await failAsset(asset, { ctx, jobId: result.jobId, message: STUDIO_STATE_MISSING_AR, reason: 'studio asset without studio_jobs row', metadata: {} })
      }
    }
    let copied: Awaited<ReturnType<typeof copyFromUrl>>
    try {
      const first = result.outputs[0]
      if (!first) throw new OutputRejectedError('لم يرجع المزوّد ناتجًا', 'succeeded without output')
      copied = await copyFromUrl(first, `u/${asset.user_id}/${asset.id}`, asset.type === 'video' ? 'video' : 'image')
    } catch (e) {
      // عابر (شبكة/5xx/تخزين) → يُرمى فيعيد المزوّد الإرسال أو يعيد reconcile المحاولة؛ نهائي → فشل يحرّر الحجز
      if (!isOutputRejected(e)) throw e
      // لا رابط المزوّد في metadata (يقرؤها المالك): ناتج مرفوض + استرداد كامل لا يعطي صورة مجانية (C2)
      return await failAsset(asset, {
        ctx,
        jobId: result.jobId,
        message: OUTPUT_REJECTED_MESSAGE_AR,
        reason: `output rejected: ${e.detail ?? e.message}`,
        metadata: { output_rejected: e.detail ?? e.message, provider_status: result.status },
      })
    }
    const fileQa = { fileOk: copied.bytes > 0, safe: true, notes: [`bytes=${copied.bytes}`, `type=${copied.contentType}`] }
    const qa = studioQa ? { ...studioQa, fileOk: fileQa.fileOk, retries: studioQa.retries_used } : { ...fileQa, retries: 0 }
    const { data: won, error: updErr } = await db
      .from('assets')
      .update({
        status: 'completed',
        url: copied.url,
        // الصور: المصغّر = الصورة (Cloudflare Image Resizing لاحقًا). الفيديو: يُلتقط في الواجهة عند أول عرض (asset-thumbnail، المخطط §6)
        thumbnail_url: asset.type === 'video' ? null : copied.url,
        completed_at: new Date().toISOString(),
        metadata: { ...(asset.metadata ?? {}), qa, provider_output: result.outputs[0], storage_path: copied.path, finalized_by: ctx.fn },
      })
      .eq('id', asset.id)
      .eq('status', 'processing')
      .eq('provider_job_id', result.jobId)
      .select('id')
    if (updErr) throw toAppError(new Error(updErr.message))
    if (!won || won.length === 0) {
      // سبقنا مُنهٍ آخر (webhook أو reconcile) — حالته هي المرجع، ولا نلمس الدفتر
      logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'LOST_RACE', wanted: 'completed' })
      return 'skipped'
    }
    const confirmed = await confirmAssetHold(asset.id)
    logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'COMPLETED', confirmed, bytes: copied.bytes, type: asset.type })
    if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
    return 'completed'
  }

  return await failAsset(asset, {
    ctx,
    jobId: result.jobId,
    message: result.status === 'canceled' ? CANCELED_MESSAGE_AR : FAILED_MESSAGE_AR,
    reason: `provider ${result.status}: ${(result.error ?? '').slice(0, 200)}`,
    metadata: { provider_error: result.error ?? null, provider_status: result.status },
  })
}

/** failed مشروط بـprocessing، ثم تحرير الحجز فقط إن كنا من غيّر الحالة */
async function failAsset(
  asset: FinalizableAsset,
  opts: { ctx: { fn: string; started: number }; jobId: string; message: string; reason: string; metadata: Record<string, unknown> },
): Promise<FinalizeOutcome> {
  const db = supabaseAdmin()
  const { data: won, error: failErr } = await db
    .from('assets')
    .update({
      status: 'failed',
      error_code: 'PROVIDER_ERROR',
      error_message: opts.message,
      completed_at: new Date().toISOString(),
      metadata: { ...(asset.metadata ?? {}), ...opts.metadata, finalized_by: opts.ctx.fn },
    })
    .eq('id', asset.id)
    .eq('status', 'processing')
    // I2: فقط المهمة الحالية تُنهي الأصل
    .eq('provider_job_id', opts.jobId)
    .select('id')
  if (failErr) throw toAppError(new Error(failErr.message))
  if (!won || won.length === 0) {
    logRequest({ fn: opts.ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - opts.ctx.started, ok: true, code: 'LOST_RACE', wanted: 'failed' })
    return 'skipped'
  }
  const released = await releaseAssetHold(asset.id, opts.reason.slice(0, 250))
  logRequest({ fn: opts.ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - opts.ctx.started, ok: true, code: 'FAILED_REFUNDED', released, detail: opts.reason.slice(0, 200) })
  if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
  return 'failed'
}

/** مهلة قصوى بلا رد من المزوّد: failed + تحرير (reconcile فقط، بعد سؤال المزوّد وما زال "يعمل" أو تعذّر إنهاؤه) */
export async function timeoutAsset(asset: FinalizableAsset, ctx: { fn: string; started: number }): Promise<boolean> {
  const db = supabaseAdmin()
  const { data: won, error } = await db
    .from('assets')
    .update({
      status: 'failed',
      error_code: 'PROVIDER_ERROR',
      error_message: TIMEOUT_MESSAGE_AR,
      completed_at: new Date().toISOString(),
      metadata: { ...(asset.metadata ?? {}), reconciled_from: 'processing', reconciled_at: new Date().toISOString(), finalized_by: ctx.fn },
    })
    .eq('id', asset.id)
    .eq('status', 'processing')
    .select('id')
  if (error) throw toAppError(new Error(error.message))
  if (!won || won.length === 0) return false
  const released = await releaseAssetHold(asset.id, `${ctx.fn}: provider still running or unfinalizable past hard cap`)
  logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'TIMED_OUT', released })
  if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
  return released
}
