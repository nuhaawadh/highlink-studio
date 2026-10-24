import { AppError } from './errors.ts'
import { OutputRejectedError, permanentFetchStatus } from './output-errors.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * محوّل التخزين الواحد (ADR 0002). المرحلة 1: Supabase Storage bucket `media` (عام للقراءة، migration 0002).
 * بعد نقل DNS إلى Cloudflare يُبدَّل هذا الملف وحده إلى R2 عبر media.highlink.tech — المستدعون لا يتغيرون.
 * المسارات: نواتج التوليد u/{user_id}/{asset_id}.{ext}
 */
const BUCKET = 'media'

const EXT_BY_TYPE: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'video/mp4': 'mp4',
  'video/webm': 'webm',
  'video/quicktime': 'mov',
}

export function extensionFor(contentType: string): string | null {
  return EXT_BY_TYPE[contentType.split(';')[0].trim().toLowerCase()] ?? null
}

export async function put(path: string, bytes: Uint8Array, contentType: string): Promise<void> {
  const { error } = await supabaseAdmin()
    .storage.from(BUCKET)
    .upload(path, bytes, { contentType, upsert: true, cacheControl: '31536000' })
  if (error) throw new AppError('PROVIDER_ERROR', 'تعذّر حفظ الناتج في التخزين', { detail: error.message })
}

export function publicUrl(path: string): string {
  return supabaseAdmin().storage.from(BUCKET).getPublicUrl(path).data.publicUrl
}

export interface CopiedFile {
  url: string
  path: string
  bytes: number
  contentType: string
}

/**
 * ينسخ ناتج المزوّد (رابط مؤقت ينتهي خلال ساعات) إلى التخزين الدائم.
 * `basePath` بلا امتداد — الامتداد من Content-Type الفعلي. يرفض الملف الفارغ أو غير المطابق للنوع المتوقع (§15 الطبقة 5، الحد الأدنى).
 * الرفض النهائي (صيغة/حجم/فارغ/4xx) = OutputRejectedError، والعابر (شبكة/5xx/تخزين) = AppError — finalize يفرّق بينهما.
 */
/** مهلة الجلب وسقف الحجم (= file_size_limit للـbucket في migration 0002) — لا نقرأ ملفًا كاملًا في الذاكرة بلا حدود */
const FETCH_TIMEOUT_MS = 60_000
export const MAX_OUTPUT_BYTES = 52_428_800

export async function copyFromUrl(sourceUrl: string, basePath: string, expected: 'image' | 'video'): Promise<CopiedFile> {
  const res = await fetch(sourceUrl, { signal: AbortSignal.timeout(FETCH_TIMEOUT_MS) }).catch((e: unknown) => {
    throw new AppError('PROVIDER_ERROR', 'تعذّر جلب الناتج من المزوّد', { detail: `fetch: ${e instanceof Error ? e.name + ' ' + e.message : String(e)}` })
  })
  if (!res.ok) {
    if (permanentFetchStatus(res.status)) throw new OutputRejectedError('تعذّر جلب الناتج من المزوّد', `fetch ${res.status}`)
    throw new AppError('PROVIDER_ERROR', 'تعذّر جلب الناتج من المزوّد', { detail: `fetch ${res.status}` })
  }
  const contentType = (res.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase()
  const ext = extensionFor(contentType)
  if (!ext || !contentType.startsWith(`${expected}/`)) {
    throw new OutputRejectedError('ناتج المزوّد بصيغة غير متوقعة', `content-type ${contentType || 'none'}`)
  }
  const declared = Number(res.headers.get('content-length') ?? 0)
  if (declared > MAX_OUTPUT_BYTES) throw new OutputRejectedError('ناتج المزوّد أكبر من الحد المسموح', `content-length ${declared}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  if (bytes.byteLength === 0) throw new OutputRejectedError('ناتج المزوّد فارغ', 'zero bytes')
  if (bytes.byteLength > MAX_OUTPUT_BYTES) throw new OutputRejectedError('ناتج المزوّد أكبر من الحد المسموح', `bytes ${bytes.byteLength}`)
  const path = `${basePath}.${ext}`
  await put(path, bytes, contentType)
  return { url: publicUrl(path), path, bytes: bytes.byteLength, contentType }
}
