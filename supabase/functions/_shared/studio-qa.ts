// بوابة الجودة لأصول الاستوديو (المخطط §15 الطبقة 5، ADR 0006 القرار 5) — يستدعيها finalizeAsset قبل نسخ الناتج.
// القرار من qa.ts (نقي مختبر)، والحَكَم من gemini.ts. الإعادة على حساب المنصة: نفس الحجز، provider_job_id جديد.
import { AppError } from './errors.ts'
import { judgeModel, judgeStudioOutput } from './gemini.ts'
import { logRequest } from './log.ts'
import { getProvider } from './providers/index.ts'
import { nextQaAction, qaVerdict, type JudgeResult, type QaVerdict } from './qa.ts'
import { copyFromUrl } from './storage.ts'
import type { StudioAssetMeta } from './studio-core.ts'
import { projectUrl, supabaseAdmin } from './supabaseAdmin.ts'

export const QA_FAILED_MESSAGE_AR = 'الصورة لم تجتز فحص الجودة بعد عدة محاولات — استُرجع رصيدك كاملًا'

interface QaAttempt {
  job: string
  product_match: number | null
  text_found: string | null
  reasons: string[]
  rejected_path: string | null
}

export interface QaState {
  status: 'pending' | 'passed' | 'unchecked' | 'failed'
  attempts: QaAttempt[]
  retries_used: number
  judge_failures: number
  judge_model?: string
  product_match?: number | null
  text_exact?: boolean | null
  text_found?: string | null
  reasons?: string[]
  issues?: string[]
}

export type GateResult = { kind: 'deliver'; qa: QaState } | { kind: 'retried' } | { kind: 'fail'; qa: QaState; reason: string }

export function studioMeta(metadata: Record<string, unknown> | null): StudioAssetMeta | null {
  const m = metadata?.studio as StudioAssetMeta | undefined
  return m && typeof m === 'object' && typeof m.reference_url === 'string' ? m : null
}

function readState(metadata: Record<string, unknown> | null): QaState {
  const q = (metadata?.qa ?? {}) as Partial<QaState>
  return {
    status: 'pending',
    attempts: Array.isArray(q.attempts) ? q.attempts : [],
    retries_used: typeof q.retries_used === 'number' ? q.retries_used : 0,
    judge_failures: typeof q.judge_failures === 'number' ? q.judge_failures : 0,
  }
}

/** نسخة المحاولة المرفوضة للمراجعة (qa/{asset}/{n}) — أفضل جهد، لا تُفشل البوابة */
async function keepRejected(assetId: string, n: number, url: string): Promise<string | null> {
  try {
    return (await copyFromUrl(url, `qa/${assetId}/${n}`, 'image')).path
  } catch {
    return null
  }
}

export async function studioQaGate(
  asset: { id: string; user_id: string; metadata: Record<string, unknown> | null },
  jobId: string,
  outputUrl: string,
  ctx: { fn: string; started: number },
): Promise<GateResult> {
  const meta = studioMeta(asset.metadata)
  if (!meta) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'studio meta missing' })
  const state = readState(asset.metadata)
  const expectedText = meta.text ?? undefined

  // الحَكَم: محاولة، وإن تعطّل نعيده مرة (rejudge)، ثم unchecked
  let judge: JudgeResult | null = null
  let verdict: QaVerdict | undefined
  let judgeFailures = 0
  let judgeError: string | null = null
  for (;;) {
    try {
      judge = await judgeStudioOutput({ referenceUrl: meta.reference_url, outputUrl, expectedText })
      verdict = qaVerdict(judge, meta.qa, expectedText)
      break
    } catch (e) {
      judgeError = e instanceof Error ? e.message : String(e)
      const action = nextQaAction({ judgeFailed: true, retriesUsed: state.retries_used, judgeFailures, maxRetries: meta.qa.max_retries })
      judgeFailures++
      if (action !== 'rejudge') break
    }
  }

  const action = nextQaAction({ verdict, judgeFailed: !verdict, retriesUsed: state.retries_used, judgeFailures: verdict ? 0 : judgeFailures, maxRetries: meta.qa.max_retries })
  const base: QaState = {
    ...state,
    judge_failures: state.judge_failures + judgeFailures,
    judge_model: judgeModel(),
    product_match: judge?.product_match ?? null,
    text_exact: verdict?.text_exact ?? null,
    text_found: judge?.text_found ?? null,
    reasons: verdict?.reasons ?? (judgeError ? [`judge_error: ${judgeError.slice(0, 160)}`] : []),
    issues: judge?.issues ?? [],
  }
  logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: true, code: `QA_${action.toUpperCase()}`, product_match: base.product_match, text_exact: base.text_exact, retries_used: state.retries_used })

  if (action === 'pass') return { kind: 'deliver', qa: { ...base, status: 'passed' } }
  if (action === 'unchecked') return { kind: 'deliver', qa: { ...base, status: 'unchecked' } }

  // رسوب: نحفظ المحاولة المرفوضة للمراجعة
  const n = state.attempts.length + 1
  const rejected = await keepRejected(asset.id, n, outputUrl)
  const attempt: QaAttempt = { job: jobId, product_match: base.product_match ?? null, text_found: base.text_found ?? null, reasons: base.reasons ?? [], rejected_path: rejected }
  const attempts = [...state.attempts, attempt]

  if (action === 'fail') {
    return { kind: 'fail', qa: { ...base, status: 'failed', attempts }, reason: `qa failed after ${state.retries_used} retries: ${(base.reasons ?? []).join(',')}` }
  }

  // retry: مهمة جديدة بنفس المدخلات، على حساب المنصة (الحجز نفسه يبقى)
  const provider = getProvider(meta.provider)
  const input = (asset.metadata?.provider_input ?? null) as Record<string, unknown> | null
  if (!input) throw new AppError('PROVIDER_ERROR', undefined, { detail: 'studio retry: provider_input missing' })
  const { jobId: newJob } = await provider.submit({
    slug: meta.provider_slug,
    input,
    webhookUrl: `${projectUrl()}/functions/v1/provider-webhook?source=${provider.name}`,
  })
  const next: QaState = { ...base, status: 'pending', attempts, retries_used: state.retries_used + 1 }
  const { data: moved, error } = await supabaseAdmin()
    .from('assets')
    .update({ provider_job_id: newJob, metadata: { ...(asset.metadata ?? {}), qa: next } })
    .eq('id', asset.id)
    .eq('status', 'processing')
    .eq('provider_job_id', jobId)
    .select('id')
  if (error || !moved || moved.length === 0) {
    // سبقنا مُنهٍ آخر: المهمة الجديدة يتيمة (تكلفتها علينا)، والحالة الحالية هي المرجع
    logRequest({ fn: ctx.fn, user: asset.user_id, asset: asset.id, ms: Date.now() - ctx.started, ok: false, code: 'QA_RETRY_ORPHAN', detail: `new job ${newJob}: ${error?.message ?? 'state changed'}` })
  }
  return { kind: 'retried' }
}
