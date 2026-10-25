// بوابة الجودة لأصول الاستوديو (المخطط §15 الطبقة 5، ADR 0006 القرار 5) — يستدعيها finalizeAsset قبل نسخ الناتج.
// بعد المراجعة المستقلة (2026-10-25، migration 0008):
//   C1 — كل المدخلات من صف studio_jobs (يكتبه السيرفر، بلا سياسات للواجهة)، لا من assets.metadata.
//   C2 — المحاولات المرفوضة تُنسخ إلى bucket خاص qa-private، ومساراتها في studio_jobs فقط؛ الواجهة ترى ملخّصًا.
//   I3 — فشل إرسال الإعادة = فشل نهائي واسترداد الآن.
//   T4 — المحاولة وعدّاد الإعادات يُحفظان قبل الإرسال، فلا تتكرر الإعادة بلا حد إن فشل نقل المهمة.
// المنطق في runQaGate بتبعيات قابلة للحقن (يُختبر بـvitest)، والتبعيات الحقيقية في defaultGateDeps.
import { judgeModel as geminiModel, judgeStudioOutput } from './gemini.ts'
import { logRequest } from './log.ts'
import { getProvider } from './providers/index.ts'
import { nextQaAction, qaVerdict, type JudgeResult, type QaConfig, type QaVerdict } from './qa.ts'
import { copyToPrivate } from './storage.ts'
import { projectUrl, supabaseAdmin } from './supabaseAdmin.ts'

export const QA_FAILED_MESSAGE_AR = 'الصورة لم تجتز فحص الجودة بعد عدة محاولات — استُرجع رصيدك كاملًا'

export interface QaAttempt {
  job: string
  product_match: number | null
  text_found: string | null
  reasons: string[]
  rejected_path: string | null
}

/** صف studio_jobs (migration 0008) */
export interface StudioJobRow {
  asset_id: string
  user_id: string
  run_id: string
  studio_id: string
  preset: string
  scene: string | null
  headline: string | null
  output_key: string
  reference_url: string
  provider: string
  provider_slug: string
  provider_input: Record<string, unknown>
  qa_config: QaConfig
  retries_used: number
  judge_failures: number
  attempts: QaAttempt[]
}

/** ما يصل للواجهة في assets.metadata.qa — لا مسارات ولا روابط (C2) */
export interface QaSummary {
  status: 'passed' | 'unchecked' | 'failed'
  product_match: number | null
  text_exact: boolean | null
  text_found: string | null
  retries_used: number
  judge_model: string
}

export type GateResult = { kind: 'deliver'; summary: QaSummary } | { kind: 'retried' } | { kind: 'fail'; summary: QaSummary; reason: string }

export interface GateDeps {
  judge(args: { referenceUrl: string; outputUrl: string; expectedText?: string }): Promise<JudgeResult & { model: string }>
  /** نسخة المحاولة المرفوضة إلى التخزين الخاص — أفضل جهد (null عند الفشل) */
  keepRejected(assetId: string, n: number, url: string): Promise<string | null>
  saveJob(assetId: string, patch: Partial<StudioJobRow>): Promise<void>
  /** مهمة جديدة بنفس المدخلات — يرجع معرّفها */
  submit(job: StudioJobRow): Promise<string>
  /** CAS على الأصل: provider_job_id من القديم إلى الجديد وهو processing. false = سبقنا مُنهٍ آخر */
  moveJob(assetId: string, oldJob: string, newJob: string): Promise<boolean>
  log(entry: Record<string, unknown>): void
  judgeModel(): string
}

export async function runQaGate(job: StudioJobRow, jobId: string, outputUrl: string, deps: GateDeps): Promise<GateResult> {
  const expectedText = job.headline ?? undefined
  const cfg = job.qa_config

  // الحَكَم: محاولة، وإن تعطّل نعيده مرة (rejudge)، ثم unchecked
  let judge: (JudgeResult & { model: string }) | null = null
  let verdict: QaVerdict | undefined
  let judgeFailures = 0
  let judgeError: string | null = null
  for (;;) {
    try {
      judge = await deps.judge({ referenceUrl: job.reference_url, outputUrl, expectedText })
      verdict = qaVerdict(judge, cfg, expectedText)
      break
    } catch (e) {
      judgeError = e instanceof Error ? e.message : String(e)
      const next = nextQaAction({ judgeFailed: true, retriesUsed: job.retries_used, judgeFailures, maxRetries: cfg.max_retries })
      judgeFailures++
      if (next !== 'rejudge') break
    }
  }

  const action = nextQaAction({ verdict, judgeFailed: !verdict, retriesUsed: job.retries_used, judgeFailures: verdict ? 0 : judgeFailures, maxRetries: cfg.max_retries })
  const reasons = verdict?.reasons ?? (judgeError ? [`judge_error: ${judgeError.slice(0, 160)}`] : [])
  const summary = (status: QaSummary['status'], retries: number): QaSummary => ({
    status,
    product_match: judge?.product_match ?? null,
    text_exact: verdict?.text_exact ?? null,
    text_found: judge?.text_found ?? null,
    retries_used: retries,
    judge_model: judge?.model ?? deps.judgeModel(),
  })
  const judgeFailuresTotal = job.judge_failures + judgeFailures
  deps.log({ code: `QA_${action.toUpperCase()}`, asset: job.asset_id, product_match: judge?.product_match ?? null, text_exact: verdict?.text_exact ?? null, retries_used: job.retries_used })

  if (action === 'pass' || action === 'unchecked') {
    await deps.saveJob(job.asset_id, { judge_failures: judgeFailuresTotal })
    return { kind: 'deliver', summary: summary(action === 'pass' ? 'passed' : 'unchecked', job.retries_used) }
  }

  // رسوب: المحاولة المرفوضة تُحفظ في التخزين الخاص، ومسارها في studio_jobs فقط
  const n = job.attempts.length + 1
  const rejected = await deps.keepRejected(job.asset_id, n, outputUrl)
  const attempts: QaAttempt[] = [...job.attempts, { job: jobId, product_match: judge?.product_match ?? null, text_found: judge?.text_found ?? null, reasons, rejected_path: rejected }]

  if (action === 'fail') {
    await deps.saveJob(job.asset_id, { attempts, judge_failures: judgeFailuresTotal })
    return { kind: 'fail', summary: summary('failed', job.retries_used), reason: `qa failed after ${job.retries_used} retries: ${reasons.join(',')}` }
  }

  // retry: نحفظ المحاولة والعدّاد أولًا (T4)، ثم مهمة جديدة على حساب المنصة بنفس الحجز
  const retries = job.retries_used + 1
  await deps.saveJob(job.asset_id, { attempts, retries_used: retries, judge_failures: judgeFailuresTotal })
  let newJob: string
  try {
    newJob = await deps.submit(job)
  } catch (e) {
    // I3: لا نعلّق الأصل ساعات بين إعادات الـwebhook وreconcile — فشل نهائي واسترداد الآن
    return { kind: 'fail', summary: summary('failed', retries), reason: `qa retry submit: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}` }
  }
  const moved = await deps.moveJob(job.asset_id, jobId, newJob)
  if (!moved) deps.log({ code: 'QA_RETRY_ORPHAN', asset: job.asset_id, detail: `new job ${newJob}: asset changed state` })
  return { kind: 'retried' }
}

/** صف studio_jobs للأصل (service_role) أو null للأصول العادية */
export async function loadStudioJob(assetId: string): Promise<StudioJobRow | null> {
  const { data, error } = await supabaseAdmin().from('studio_jobs').select('*').eq('asset_id', assetId).maybeSingle<StudioJobRow>()
  if (error) throw new Error(`studio_jobs: ${error.message}`)
  return data ?? null
}

export function defaultGateDeps(ctx: { fn: string; started: number; userId: string }): GateDeps {
  const db = supabaseAdmin()
  return {
    judge: (args) => judgeStudioOutput(args),
    async keepRejected(assetId, n, url) {
      try {
        return (await copyToPrivate(url, `${assetId}/${n}`)).path
      } catch {
        return null
      }
    },
    async saveJob(assetId, patch) {
      const { error } = await db.from('studio_jobs').update({ ...patch, updated_at: new Date().toISOString() }).eq('asset_id', assetId)
      if (error) throw new Error(`studio_jobs update: ${error.message}`)
    },
    async submit(job) {
      const provider = getProvider(job.provider)
      const { jobId } = await provider.submit({
        slug: job.provider_slug,
        input: job.provider_input,
        webhookUrl: `${projectUrl()}/functions/v1/provider-webhook?source=${provider.name}`,
      })
      return jobId
    },
    async moveJob(assetId, oldJob, newJob) {
      const { data, error } = await db
        .from('assets')
        .update({ provider_job_id: newJob })
        .eq('id', assetId)
        .eq('status', 'processing')
        .eq('provider_job_id', oldJob)
        .select('id')
      return !error && Boolean(data && data.length)
    },
    log: (entry) => logRequest({ fn: ctx.fn, user: ctx.userId, ms: Date.now() - ctx.started, ok: true, ...entry }),
    judgeModel: geminiModel,
  }
}
