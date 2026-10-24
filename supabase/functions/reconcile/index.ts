// reconcile — شبكة أمان الحجوزات والـwebhook (backlog B9، المخطط §15 الطبقتان 3 و4).
// يُستدعى يدويًا أو من المجدول (cron-renewals لاحقًا) بسر RECONCILE_SECRET — لا JWT (--no-verify-jwt).
//   1) reconcile_holds() في القاعدة: حجوزات أقدم من المهلة (صورة 30 د، فيديو 120 د) — تأكيد لمكتمل، تحرير لفاشل/مفقود/queued،
//      وprocessing بمهمة يعود كـprovider_check بلا تغيير.
//   2) لكل provider_check: نسأل المزوّد (Replicate GET prediction، fal حالة الطابور ثم النتيجة) ونُنهي عبر _shared/finalize.ts كما لو وصل الـwebhook؛
//      وإن كان ما زال يعمل — أو تعذّر إنهاؤه بخطأ متكرر — بعد سقف صلب (صورة 4 س، فيديو 12 س) نحرّر ونعلّم failed.
import { handleOptions } from '../_shared/cors.ts'
import { jsonResponse, toAppError } from '../_shared/errors.ts'
import { finalizeAsset, timeoutAsset, type FinalizableAsset } from '../_shared/finalize.ts'
import { logRequest } from '../_shared/log.ts'
import { getProvider } from '../_shared/providers/index.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const HARD_CAP_MS: Record<string, number> = { image: 4 * 60 * 60_000, video: 12 * 60 * 60_000, audio: 4 * 60 * 60_000 }
const MAX_PROVIDER_CHECKS = 50

function pastHardCap(asset: { type: string; created_at: string }): boolean {
  const cap = HARD_CAP_MS[asset.type] ?? HARD_CAP_MS.image
  return Date.now() - new Date(asset.created_at).getTime() > cap
}

interface ReconcileRow {
  hold_id: number
  asset: string | null
  asset_status: string | null
  asset_type: string | null
  provider: string | null
  provider_job_id: string | null
  age: string
  action: string
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let diff = 0
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i)
  return diff === 0
}

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return jsonResponse({ ok: false, error: 'method' }, 405)

  const secret = Deno.env.get('RECONCILE_SECRET') ?? ''
  const given = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim()
  if (!secret || !given || !timingSafeEqual(given, secret)) {
    logRequest({ fn: 'reconcile', ms: Date.now() - started, ok: false, code: 'UNAUTHORIZED' })
    return jsonResponse({ ok: false, error: 'unauthorized' }, 401)
  }

  const db = supabaseAdmin()
  try {
    const { data, error } = await db.rpc('reconcile_holds')
    if (error) throw toAppError(new Error(error.message))
    const rows = (data ?? []) as ReconcileRow[]
    const sql: Record<string, number> = {}
    for (const r of rows) sql[r.action] = (sql[r.action] ?? 0) + 1

    const checks: Array<{ asset: string; job: string | null; provider_status?: string; outcome: string; detail?: string }> = []
    const pending = rows.filter((r) => r.action === 'provider_check' && r.asset && r.provider && r.provider_job_id).slice(0, MAX_PROVIDER_CHECKS)
    for (const r of pending) {
      const entry: (typeof checks)[number] = { asset: r.asset!, job: r.provider_job_id, outcome: 'skipped' }
      let asset: (FinalizableAsset & { created_at: string; model: string | null }) | null = null
      try {
        const { data } = await db
          .from('assets')
          .select('id, user_id, type, status, metadata, api_key_id, created_at, model')
          .eq('id', r.asset!)
          .maybeSingle<FinalizableAsset & { created_at: string; model: string | null }>()
        asset = data
        if (!asset || asset.status !== 'processing') {
          entry.outcome = 'not_processing'
        } else {
          const provider = getProvider(r.provider!)
          // fal يبني رابط الطابور من مسار النقطة (owner/app) — نأخذه من صف النموذج؛ Replicate يتجاهله
          const { data: modelRow } = asset.model
            ? await db.from('models').select('provider_slug').eq('id', asset.model).maybeSingle<{ provider_slug: string }>()
            : { data: null }
          const result = await provider.getJob(r.provider_job_id!, modelRow?.provider_slug)
          entry.provider_status = result.status
          if (result.status === 'processing') {
            if (pastHardCap(asset)) {
              await timeoutAsset(asset, { fn: 'reconcile', started })
              entry.outcome = 'timed_out'
            } else {
              entry.outcome = 'still_running'
            }
          } else {
            entry.outcome = await finalizeAsset(asset, result, { fn: 'reconcile', started })
          }
        }
      } catch (e) {
        const err = toAppError(e)
        entry.outcome = 'error'
        entry.detail = err.detail ?? err.message
        // خطأ يتكرر (مزوّد لا يرد، نسخ يفشل…) بعد السقف الصلب: لا نترك الحجز والتزامن عالقين للأبد (المراجعة المستقلة 2026-10-24)
        if (asset && asset.status === 'processing' && pastHardCap(asset)) {
          try {
            await timeoutAsset(asset, { fn: 'reconcile', started })
            entry.outcome = 'timed_out_after_error'
          } catch (inner) {
            entry.detail = `${entry.detail}; timeout failed: ${toAppError(inner).message}`
          }
        }
      }
      checks.push(entry)
    }

    logRequest({ fn: 'reconcile', ms: Date.now() - started, ok: true, code: 'DONE', sql, checked: checks.length })
    return jsonResponse({ ok: true, sql, checks, more: rows.filter((r) => r.action === 'provider_check').length > pending.length })
  } catch (e) {
    const err = toAppError(e)
    logRequest({ fn: 'reconcile', ms: Date.now() - started, ok: false, code: err.code, detail: err.detail ?? err.message })
    return jsonResponse({ ok: false, error: err.code }, 500)
  }
})
