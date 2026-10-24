import { buildJudgePrompt, parseJudgeResponse, type JudgeResult } from './qa.ts'

/**
 * حَكَم بوابة الجودة: Gemini Flash مباشرة (ADR 0006 القرار 5). للتقييم فقط — التوليد يبقى عند Replicate/fal.
 * يرسل الصورتين (المرجع ثم الناتج) inline ويطلب JSON. أي خطأ يُرمى ليقرر finalize (rejudge ثم unchecked).
 * الأسرار: GEMINI_API_KEY. النموذج: GEMINI_QA_MODEL (افتراض gemini-2.5-flash).
 */
const API = 'https://generativelanguage.googleapis.com/v1beta/models'
const TIMEOUT_MS = 25_000
/** حد الصورتين معًا قبل base64 — طلب Gemini inline محدود بـ20MB */
const MAX_TOTAL_BYTES = 14 * 1024 * 1024

export function judgeModel(): string {
  return Deno.env.get('GEMINI_QA_MODEL') || 'gemini-2.5-flash'
}

function toBase64(bytes: Uint8Array): string {
  let bin = ''
  const chunk = 0x8000
  for (let i = 0; i < bytes.length; i += chunk) bin += String.fromCharCode(...bytes.subarray(i, i + chunk))
  return btoa(bin)
}

async function fetchImage(url: string): Promise<{ mime: string; bytes: Uint8Array }> {
  const res = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) })
  if (!res.ok) throw new Error(`judge: image fetch ${res.status}`)
  const mime = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  if (!mime.startsWith('image/')) throw new Error(`judge: not an image (${mime || 'none'})`)
  return { mime, bytes: new Uint8Array(await res.arrayBuffer()) }
}

export async function judgeStudioOutput(args: { referenceUrl: string; outputUrl: string; expectedText?: string }): Promise<JudgeResult> {
  const key = Deno.env.get('GEMINI_API_KEY')
  if (!key) throw new Error('judge: GEMINI_API_KEY missing')
  const [ref, out] = await Promise.all([fetchImage(args.referenceUrl), fetchImage(args.outputUrl)])
  if (ref.bytes.byteLength + out.bytes.byteLength > MAX_TOTAL_BYTES) {
    throw new Error(`judge: images too large (${ref.bytes.byteLength + out.bytes.byteLength} bytes)`)
  }
  const res = await fetch(`${API}/${encodeURIComponent(judgeModel())}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [
            { text: buildJudgePrompt(args.expectedText) },
            { inline_data: { mime_type: ref.mime, data: toBase64(ref.bytes) } },
            { inline_data: { mime_type: out.mime, data: toBase64(out.bytes) } },
          ],
        },
      ],
      generationConfig: { responseMimeType: 'application/json', temperature: 0 },
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`judge: gemini ${res.status}: ${text.slice(0, 200)}`)
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch {
    throw new Error('judge: gemini non-JSON envelope')
  }
  return parseJudgeResponse(json)
}
