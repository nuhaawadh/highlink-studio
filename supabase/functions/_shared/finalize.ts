import { scheduleAssetWebhook } from './client-webhook.ts'
import { confirmAssetHold, releaseAssetHold } from './credits.ts'
import { AppError, toAppError } from './errors.ts'
import { logRequest } from './log.ts'
import type { ProviderWebhookResult } from './providers/index.ts'
import { copyFromUrl } from './storage.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * إنهاء أصل بنتيجة المزوّد (المخطط §5 الخطوتان 4 و5) — يستدعيه provider-webhook عند وصول الحدث،
 * وreconcile عندما يسأل المزوّد بنفسه (backlog B9). الترتيب ثابت:
 *   نجاح: نسخ الناتج إلى التخزين الدائم → completed → تأكيد الخصم → webhook العميل
 *   فشل/إلغاء: تحرير الحجز → failed برسالة عربية → webhook العميل
 * كل خطوة idempotent عند إعادة المحاولة (الحالة مشروطة بـprocessing، والتأكيد/التحرير يرجعان false إن لم يوجد حجز).
 */
export interface FinalizableAsset {
  id: string
  user_id: string
  type: 'image' | 'video' | 'audio'
  status: string
  metadata: Record<string, unknown> | null
  api_key_id: string | null
}

export const FAILED_MESSAGE_AR = 'فشل التوليد عند المزوّد — استُرجع رصيدك كاملًا'
export const CANCELED_MESSAGE_AR = 'أُلغي التوليد — استُرجع رصيدك كاملًا'
export const TIMEOUT_MESSAGE_AR = 'انتهت مهلة التوليد — استُرجع رصيدك كاملًا'

export type FinalizeOutcome = 'completed' | 'failed' | 'skipped'

export async function finalizeAsset(asset: FinalizableAsset, result: ProviderWebhookResult, ctx: { fn: string; started: number }): Promise<FinalizeOutcome> {
  const db = supabaseAdmin()
  if (result.status === 'processing') return 'skipped'

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
        // الصور: المصغّر = الصورة (Cloudflare Image Resizing لاحقًا). الفيديو: يُلتقط في الواجهة عند أول عرض (asset-thumbnail، المخطط §6)
        thumbnail_url: asset.type === 'video' ? null : copied.url,
        completed_at: new Date().toISOString(),
        metadata: { ...(asset.metadata ?? {}), qa, provider_output: first, storage_path: copied.path, finalized_by: ctx.fn },
      })
      .eq('id', asset.id)
      .eq('status', 'processing')
    if (updErr) throw toAppError(new Error(updErr.message))
    const confirmed = await confirmAssetHold(asset.id)
    logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'COMPLETED', confirmed, bytes: copied.bytes, type: asset.type })
    if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
    return 'completed'
  }

  const released = await releaseAssetHold(asset.id, `provider ${result.status}: ${(result.error ?? '').slice(0, 200)}`)
  const { error: failErr } = await db
    .from('assets')
    .update({
      status: 'failed',
      error_code: 'PROVIDER_ERROR',
      error_message: result.status === 'canceled' ? CANCELED_MESSAGE_AR : FAILED_MESSAGE_AR,
      completed_at: new Date().toISOString(),
      metadata: { ...(asset.metadata ?? {}), provider_error: result.error ?? null, provider_status: result.status, finalized_by: ctx.fn },
    })
    .eq('id', asset.id)
    .eq('status', 'processing')
  if (failErr) throw toAppError(new Error(failErr.message))
  logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'FAILED_REFUNDED', released, detail: (result.error ?? '').slice(0, 200) })
  if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
  return 'failed'
}

/** مهلة قصوى بلا رد من المزوّد: تحرير + failed (reconcile فقط، بعد سؤال المزوّد وما زال "يعمل") */
export async function timeoutAsset(asset: FinalizableAsset, ctx: { fn: string; started: number }): Promise<boolean> {
  const db = supabaseAdmin()
  const released = await releaseAssetHold(asset.id, `${ctx.fn}: provider still running past hard cap`)
  const { error } = await db
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
  if (error) throw toAppError(new Error(error.message))
  logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: 'TIMED_OUT', released })
  if (asset.api_key_id) await scheduleAssetWebhook(asset.id)
  return released
}
