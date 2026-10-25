import { buildJudgePrompt, judgeResponseSchema, parseJudgeResponse, type JudgeResult } from './qa.ts'

/**
 * حَكَم بوابة الجودة: Gemini Flash مباشرة (ADR 0006 القرار 5). للتقييم فقط — التوليد يبقى عند Replicate/fal.
 * يرسل الصورتين (المرجع ثم الناتج) inline ويطلب JSON. أي خطأ نهائي يُرمى ليقرر finalize (rejudge ثم unchecked).
 * الأسرار: GEMINI_API_KEY. النماذج: GEMINI_QA_MODELS (قائمة مفصولة بفواصل) أو السلسلة الافتراضية أدناه.
 * الفحص الحي (2026-10-24): gemini-2.5-flash لم يعد متاحًا للحسابات الجديدة (404)، وإصدارات 3.x ترد 503 "high demand"
 * بالتناوب — فنجرّب السلسلة بالترتيب عند 429/5xx/مهلة، ونسجّل أيّها حكم.
 */
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 15_000
/** ميزانية الحكم الكلية داخل الـwebhook (backlog B33-T2) — بعدها يُرمى الخطأ فتسلّم البوابة unchecked بدل تجاوز حد Edge */
export const JUDGE_BUDGET_MS = 45_000

export interface JudgeDeps {
  fetch: typeof fetch
  now: () => number
}
const realDeps: JudgeDeps = { fetch: (...a) => fetch(...a), now: () => Date.now() }
const DEFAULT_MODELS = ['gemini-3.8-flash', 'gemini-3.7-flash', 'gemini-3.6-flash', 'gemini-3.5-flash']
/** حد الصورتين معًا قبل base64 — طلب Gemini inline محدود بـ20MB */
const MAX_TOTAL_BYTES = 14 * 1024 * 1024

export function judgeModels(): string[] {
  const fromEnv = (Deno.env.get('GEMINI_QA_MODELS') ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  return fromEnv.length ? fromEnv : DEFAULT_MODELS
}

/** للسجل: أول نموذج في السلسلة */
export function judgeModel(): string {
  return judgeModels()[0]
}

/** أخطاء تستحق تجربة النموذج التالي (ضغط/عطل عابر)، لا 400/401/403 (طلب أو مفتاح خاطئ) */
function retryable(status: number): boolean {
  return status === 404 || status === 429 || status >= 500
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

async function fetchImage(url: string, deps: JudgeDeps): Promise<{ mime: string; bytes: Uint8Array }> {
  const res = await deps.fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`judge: image fetch ${res.status}`)
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!mime.startsWith('image/')) throw new Error(`judge: not an image (${mime || 'none'})`)
  return { mime, bytes: new Uint8Array(await res.arrayBuffer()) }
}

export async function judgeStudioOutput(
  args: { referenceUrl: string; outputUrl: string; expectedText?: string },
  deps: JudgeDeps = realDeps,
): Promise<JudgeResult & { model: string }> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('judge: GEMINI_API_KEY missing')
  const started = deps.now()
  const [ref, out] = await Promise.all([fetchImage(args.referenceUrl, deps), fetchImage(args.outputUrl, deps)])
  if (ref.bytes.byteLength + out.bytes.byteLength > MAX_TOTAL_BYTES) {
    throw new Error(`judge: images too large (${ref.bytes.byteLength + out.bytes.byteLength} bytes)`)
  }
  const payload = JSON.stringify({
    contents: [
      {
        role: 'user',
        parts: [
          { text: buildJudgePrompt(args.expectedText) },
          { text: 'REFERENCE image:' },
          { inline_data: { mime_type: ref.mime, data: toBase64(ref.bytes) } },
          { text: 'GENERATED image:' },
          { inline_data: { mime_type: out.mime, data: toBase64(out.bytes) } },
        ],
      },
    ],
    generationConfig: { responseMimeType: 'application/json', responseSchema: judgeResponseSchema(), temperature: 0 },
  })
  const errors: string[] = []
  for (const model of judgeModels()) {
    const remaining = JUDGE_BUDGET_MS - (deps.now() - started)
    if (remaining <= 0) throw new Error(`judge: time budget exhausted (${errors.join('; ')})`)
    let res: Response
    try {
      res = await deps.fetch(`${API}/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
        body: payload,
        signal: AbortSignal.timeout(Math.min(TIMEOUT_MS, remaining)),
      })
    } catch (e) {
      errors.push(`${model}: ${e instanceof Error ? e.name : String(e)}`)
      continue
    }
    const text = await res.text()
    if (!res.ok) {
      errors.push(`${model}: ${res.status}`)
      if (retryable(res.status)) continue
      break
    }
    try {
      return { ...parseJudgeResponse(JSON.parse(text)), model }
    } catch (e) {
      // رد غير صالح من هذا النموذج — نجرب التالي بدل الحكم بلا دليل
      errors.push(`${model}: ${e instanceof Error ? e.message.slice(0, 80) : 'bad response'}`)
    }
  }
  throw new Error(`judge: all models failed (${errors.join('; ')})`)
}
