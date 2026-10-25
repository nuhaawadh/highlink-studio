import { describe, expect, it } from 'vitest'
import type { JudgeResult } from './qa'
import { runQaGate, type GateDeps, type StudioJobRow } from './studio-qa'

/**
 * بوابة الجودة بعد إصلاحات المراجعة المستقلة (2026-10-25):
 *   C1 — كل مدخلات البوابة من صف studio_jobs (يكتبه السيرفر)، لا من metadata.
 *   C2 — ما يصل للواجهة ملخّص فقط: لا مسارات مرفوضة ولا روابط مزوّد.
 *   I3 — فشل إرسال الإعادة = فشل نهائي واسترداد الآن، لا 500 وتعليق.
 *   T4 — المحاولة وعدّاد الإعادات يُحفظان قبل الإرسال.
 */
const job: StudioJobRow = {
  asset_id: 'a1',
  user_id: 'u1',
  run_id: 'r1',
  studio_id: 'product-shot',
  preset: 'luxury',
  scene: null,
  headline: 'عرض خاص',
  output_key: 'hero',
  reference_url: 'https://p.supabase.co/storage/v1/object/public/media/up/u1/ref.png',
  provider: 'replicate',
  provider_slug: 'google/nano-banana-pro',
  provider_input: { prompt: 'p' },
  qa_config: { product_match_min: 7, arabic_text_exact: true, max_retries: 2 },
  retries_used: 0,
  judge_failures: 0,
  attempts: [],
}

const v = (verdict: 'match' | 'different' | 'wrong') => ({ evidence: 'e', verdict })
const verdictOf = (pm: number, text: string | null): JudgeResult & { model: string } => ({
  product_match: pm,
  checks: { shape: v('match'), colour: v('match'), label: v('match'), brand_text: v('match'), details: v('match') },
  same_product: true,
  text_found: text,
  issues: [],
  model: 'gemini-test',
})

function fakeDeps(judgeResults: Array<(JudgeResult & { model: string }) | Error>, opts: { submitThrows?: boolean } = {}) {
  const calls: string[] = []
  const saved: Array<Partial<StudioJobRow>> = []
  const judged: Array<{ referenceUrl: string; outputUrl: string; expectedText?: string }> = []
  const deps: GateDeps = {
    async judge(args) {
      judged.push(args)
      calls.push('judge')
      const r = judgeResults.shift()
      if (!r || r instanceof Error) throw r ?? new Error('no result')
      return r
    },
    async keepRejected(assetId, n) {
      calls.push(`keep:${n}`)
      return `qa/${assetId}/${n}.png`
    },
    async saveJob(_assetId, patch) {
      calls.push('save')
      saved.push(patch)
    },
    async submit() {
      calls.push('submit')
      if (opts.submitThrows) throw new Error('replicate 402')
      return 'job-2'
    },
    async moveJob(_assetId, oldJob, newJob) {
      calls.push(`move:${oldJob}->${newJob}`)
      return true
    },
    log() {},
    judgeModel: () => 'gemini-test',
  }
  return { deps, calls, saved, judged }
}

const SUMMARY_KEYS = ['judge_model', 'product_match', 'retries_used', 'status', 'text_exact', 'text_found']

describe('runQaGate', () => {
  it('نجاح: يسلّم بملخّص فقط، والمرجع والنص من صف studio_jobs (C1)', async () => {
    const { deps, calls, judged } = fakeDeps([verdictOf(10, 'عرض خاص')])
    const r = await runQaGate(job, 'job-1', 'https://replicate.delivery/out.png', deps)
    expect(r.kind).toBe('deliver')
    if (r.kind !== 'deliver') return
    expect(r.summary).toMatchObject({ status: 'passed', product_match: 10, text_exact: true, retries_used: 0 })
    expect(Object.keys(r.summary).sort()).toEqual(SUMMARY_KEYS)
    expect(judged[0]).toEqual({ referenceUrl: job.reference_url, outputUrl: 'https://replicate.delivery/out.png', expectedText: 'عرض خاص' })
    expect(calls).not.toContain('submit')
  })

  it('رسوب مع إعادات متبقية: يحفظ المحاولة والعدّاد قبل الإرسال، ثم ينقل المهمة (T4)', async () => {
    const { deps, calls, saved } = fakeDeps([verdictOf(5, 'عرض خاص')])
    const r = await runQaGate(job, 'job-1', 'https://x/out.png', deps)
    expect(r.kind).toBe('retried')
    expect(calls).toEqual(['judge', 'keep:1', 'save', 'submit', 'move:job-1->job-2'])
    expect(saved[0].retries_used).toBe(1)
    expect(saved[0].attempts).toEqual([{ job: 'job-1', product_match: 5, text_found: 'عرض خاص', reasons: ['product_match_5_below_7'], rejected_path: 'qa/a1/1.png' }])
  })

  it('فشل إرسال الإعادة = فشل نهائي الآن، لا رمي (I3)', async () => {
    const { deps, calls } = fakeDeps([verdictOf(5, null)], { submitThrows: true })
    const r = await runQaGate(job, 'job-1', 'https://x/out.png', deps)
    expect(r.kind).toBe('fail')
    if (r.kind !== 'fail') return
    expect(r.reason).toContain('qa retry submit')
    expect(calls.some((c) => c.startsWith('move:'))).toBe(false)
  })

  it('رسوب بلا إعادات متبقية: فشل، والملخّص بلا مسارات مرفوضة ولا روابط (C2)', async () => {
    const { deps, calls } = fakeDeps([verdictOf(10, 'عرض خاض')])
    const r = await runQaGate({ ...job, retries_used: 2, attempts: [{ job: 'j0', product_match: 4, text_found: null, reasons: [], rejected_path: 'qa/a1/1.png' }] }, 'job-3', 'https://x/out.png', deps)
    expect(r.kind).toBe('fail')
    if (r.kind !== 'fail') return
    expect(r.summary).toMatchObject({ status: 'failed', text_exact: false })
    expect(Object.keys(r.summary).sort()).toEqual(SUMMARY_KEYS)
    expect(JSON.stringify(r.summary)).not.toContain('qa/')
    expect(calls).toContain('keep:2')
    expect(calls).not.toContain('submit')
  })

  it('عطل الحَكَم مرتين: يسلّم unchecked (لا عقاب على عطلنا) ويحفظ عدد الأعطال', async () => {
    const { deps, calls, saved } = fakeDeps([new Error('429'), new Error('429')])
    const r = await runQaGate(job, 'job-1', 'https://x/out.png', deps)
    expect(r.kind).toBe('deliver')
    if (r.kind !== 'deliver') return
    expect(r.summary.status).toBe('unchecked')
    expect(calls.filter((c) => c === 'judge')).toHaveLength(2)
    expect(saved.at(-1)?.judge_failures).toBe(2)
  })

  it('عطل ثم حكم ناجح: يسلّم passed', async () => {
    const { deps } = fakeDeps([new Error('503'), verdictOf(9, 'عرض خاص')])
    const r = await runQaGate(job, 'job-1', 'https://x/out.png', deps)
    expect(r.kind === 'deliver' && r.summary.status).toBe('passed')
  })
})
