import { z } from 'npm:zod@4'

/**
 * بوابة المخرجات للاستوديوهات (المخطط §15 الطبقة 5، ADR 0006 القرار 5) — الجزء النقي: نص الحَكَم، تحليل رده، والقرار.
 * نداء الشبكة في gemini.ts، والتنفيذ (إعادة/فشل/تسليم) في finalize.ts.
 */

export interface QaConfig {
  product_match_min: number
  arabic_text_exact: boolean
  max_retries: number
}

/** يزيل التشكيل والتطويل وعلامات الاقتباس ويوحّد المسافات — لا يمس الحروف نفسها (المطابقة حرفية) */
export function normalizeForTextMatch(s: string): string {
  return s
    .normalize('NFC')
    .replace(/[ؐ-ًؚ-ٰٟۖ-ۭـ]/g, '')
    .replace(/[«»"'“”„]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function textMatches(expected: string, found: string | null | undefined): boolean {
  if (!found) return false
  return normalizeForTextMatch(expected) === normalizeForTextMatch(found)
}

/** تعليمات الحَكَم — الصورة الأولى المرجع، الثانية الناتج. الرد JSON فقط (responseMimeType). */
export function buildJudgePrompt(expectedText?: string): string {
  const lines = [
    'You are a strict QA inspector for e-commerce product photography.',
    'Image 1 is the REFERENCE photo of a real product. Image 2 is a GENERATED marketing image that must show the SAME product.',
    'Score product_match from 0 to 10: 10 = identical product (shape, proportions, colours, materials, logo and label design, cap/closure); 7 = same product with only minor rendering differences; 4 = similar but clearly a different variant or wrong label; 0 = different product or no product.',
    'Penalise heavily: changed or invented logo/label text, wrong colour, missing parts, duplicated products, warped or mirrored letters on the product.',
  ]
  if (expectedText) {
    lines.push(
      'The generated image should ALSO contain added headline typography (not the product label) that reads exactly the text given below. Transcribe that headline exactly as rendered, character by character, in text_found. If it is missing, garbled, or not clearly legible, return text_found = null.',
      `Expected headline text: «${expectedText}»`,
    )
  } else {
    lines.push('No added headline typography is expected; set text_found = null.')
  }
  lines.push('Respond with JSON only: {"product_match": <0-10 integer>, "same_product": <boolean>, "text_found": <string or null>, "issues": [<short strings>]}')
  return lines.join('\n')
}

export const JudgeResult = z.object({
  product_match: z.number().min(0).max(10),
  same_product: z.boolean(),
  text_found: z.string().nullable(),
  issues: z.array(z.string()).max(20).default([]),
})
export type JudgeResult = z.infer<typeof JudgeResult>

/** رد generateContent → JudgeResult. يرمي إن لم يكن JSON صالحًا بالشكل المطلوب. */
export function parseJudgeResponse(raw: unknown): JudgeResult {
  const text = (raw as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> })?.candidates?.[0]?.content?.parts
    ?.map((p) => p.text ?? '')
    .join('')
    .trim()
  if (!text) throw new Error('judge: empty response')
  const cleaned = text.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  let json: unknown
  try {
    json = JSON.parse(cleaned)
  } catch {
    throw new Error(`judge: non-JSON response: ${cleaned.slice(0, 120)}`)
  }
  const parsed = JudgeResult.safeParse(json)
  if (!parsed.success) throw new Error(`judge: bad shape: ${parsed.error.issues.map((i) => i.path.join('.')).join(',')}`)
  return { ...parsed.data, product_match: Math.round(parsed.data.product_match) }
}

export interface QaVerdict {
  pass: boolean
  product_match: number
  /** null = لم يُطلب نص */
  text_exact: boolean | null
  reasons: string[]
}

export function qaVerdict(judge: JudgeResult, config: QaConfig, expectedText?: string): QaVerdict {
  const reasons: string[] = []
  const matchOk = judge.same_product && judge.product_match >= config.product_match_min
  if (!judge.same_product) reasons.push('different_product')
  else if (judge.product_match < config.product_match_min) reasons.push(`product_match_${judge.product_match}_below_${config.product_match_min}`)
  let textExact: boolean | null = null
  if (expectedText && config.arabic_text_exact) {
    textExact = textMatches(expectedText, judge.text_found)
    if (!textExact) reasons.push('text_mismatch')
  }
  return { pass: matchOk && textExact !== false, product_match: judge.product_match, text_exact: textExact, reasons }
}

export type QaAction = 'pass' | 'retry' | 'fail' | 'rejudge' | 'unchecked'

/**
 * القرار التالي:
 * - حَكَم أجاب: نجاح → pass؛ رسوب والإعادات المستخدمة < الحد → retry؛ وإلا fail (استرداد).
 * - حَكَم تعطّل: أول مرة → rejudge؛ بعدها → unchecked (يُسلَّم ويُسجَّل — لا يُعاقب العميل على عطل عندنا).
 */
export function nextQaAction(args: { verdict?: QaVerdict; judgeFailed: boolean; retriesUsed: number; judgeFailures: number; maxRetries: number }): QaAction {
  if (args.judgeFailed || !args.verdict) return args.judgeFailures < 1 ? 'rejudge' : 'unchecked'
  if (args.verdict.pass) return 'pass'
  return args.retriesUsed < args.maxRetries ? 'retry' : 'fail'
}
