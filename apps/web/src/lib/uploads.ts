import { supabase } from './supabase'

/**
 * رفع صورة مرجعية (صورة المنتج) إلى Supabase Storage تحت up/{uid}/ (ADR 0006 القرار 6، migration 0007).
 * سياسة RLS تسمح بهذا المسار فقط؛ الـbucket يفرض الأنواع. الحد 8MB هنا لأن بوابة الجودة ترسل الصورة للحَكَم inline.
 */
export const MAX_REFERENCE_BYTES = 8 * 1024 * 1024
const TYPES: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

export type UploadErrorCode = 'too_large' | 'bad_type' | 'failed'

export class UploadError extends Error {
  readonly code: UploadErrorCode
  constructor(code: UploadErrorCode, detail?: string) {
    super(detail ?? code)
    this.name = 'UploadError'
    this.code = code
  }
}

export function checkReferenceFile(file: File): UploadErrorCode | null {
  if (!TYPES[file.type]) return 'bad_type'
  if (file.size > MAX_REFERENCE_BYTES) return 'too_large'
  return null
}

export async function uploadReference(userId: string, file: File): Promise<string> {
  const problem = checkReferenceFile(file)
  if (problem) throw new UploadError(problem)
  const path = `up/${userId}/${crypto.randomUUID()}.${TYPES[file.type]}`
  const { error } = await supabase.storage.from('media').upload(path, file, { contentType: file.type, upsert: false, cacheControl: '31536000' })
  if (error) throw new UploadError('failed', error.message)
  return supabase.storage.from('media').getPublicUrl(path).data.publicUrl
}
