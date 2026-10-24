// asset-thumbnail — صورة مصغّرة للفيديو تُلتقط في الواجهة عند أول عرض (المخطط §6: حل رخيص يكفي المرحلة 1؛ لا ffmpeg في Edge).
// JWT المستخدم؛ يقبل JPEG واحدًا (data URL ≤ 300KB) لأصل فيديو مكتمل يملكه المستخدم وبلا مصغّر بعد، ويرفعه بـservice_role
// إلى u/{user}/{asset}-thumb.jpg ثم يكتب thumbnail_url (الواجهة لا تملك كتابة في التخزين ولا في هذا العمود).
import { z } from 'npm:zod@4'
import { requireUser } from '../_shared/auth.ts'
import { handleOptions } from '../_shared/cors.ts'
import { AppError, errorResponse, jsonResponse, toAppError } from '../_shared/errors.ts'
import { logRequest } from '../_shared/log.ts'
import { publicUrl, put } from '../_shared/storage.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'

const MAX_BYTES = 300 * 1024
const Body = z.object({
  assetId: z.uuid(),
  image: z.string().startsWith('data:image/jpeg;base64,').max(Math.ceil((MAX_BYTES * 4) / 3) + 64),
})

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse(new AppError('INVALID_INPUT', 'طريقة غير مدعومة', { status: 405 }))

  let userId: string | null = null
  try {
    const user = await requireUser(req)
    userId = user.id
    const parsed = Body.safeParse(await req.json().catch(() => null))
    if (!parsed.success) throw new AppError('INVALID_INPUT', undefined, { detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
    const { assetId, image } = parsed.data

    const db = supabaseAdmin()
    const { data: asset, error } = await db
      .from('assets')
      .select('id, user_id, type, status, thumbnail_url')
      .eq('id', assetId)
      .maybeSingle<{ id: string; user_id: string; type: string; status: string; thumbnail_url: string | null }>()
    if (error) throw toAppError(new Error(error.message))
    if (!asset || asset.user_id !== user.id) throw new AppError('INVALID_INPUT', 'الأصل غير موجود', { status: 404 })
    if (asset.thumbnail_url) return jsonResponse({ success: true, thumbnail_url: asset.thumbnail_url, existing: true })
    if (asset.type !== 'video' || asset.status !== 'completed') throw new AppError('INVALID_INPUT', 'المصغّر للفيديو المكتمل فقط', { status: 409 })

    const b64 = image.slice('data:image/jpeg;base64,'.length)
    const bin = atob(b64)
    if (bin.length === 0 || bin.length > MAX_BYTES) throw new AppError('INVALID_INPUT', 'حجم الصورة المصغّرة غير مقبول')
    const bytes = new Uint8Array(bin.length)
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i)
    // JPEG يبدأ بـFF D8
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) throw new AppError('INVALID_INPUT', 'الملف ليس JPEG')

    const path = `u/${asset.user_id}/${asset.id}-thumb.jpg`
    await put(path, bytes, 'image/jpeg')
    const url = publicUrl(path)
    const { error: updErr } = await db.from('assets').update({ thumbnail_url: url }).eq('id', asset.id).is('thumbnail_url', null)
    if (updErr) throw toAppError(new Error(updErr.message))
    logRequest({ fn: 'asset-thumbnail', user: userId, asset: asset.id, ms: Date.now() - started, ok: true, bytes: bytes.length })
    return jsonResponse({ success: true, thumbnail_url: url })
  } catch (e) {
    const err = toAppError(e)
    logRequest({ fn: 'asset-thumbnail', user: userId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail })
    return errorResponse(err)
  }
})
