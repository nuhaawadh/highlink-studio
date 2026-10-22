// generate-media — غلاف الواجهة (JWT) حول نواة التوليد المشتركة `_shared/generate-core.ts` (المخطط §5، ADR 0004).
// التدفق الثابت (CLAUDE.md القاعدة 1): الواجهة تدرج صف assets (queued) → هذه الوظيفة → المزوّد → provider-webhook → Realtime.
import { requireUser } from '../_shared/auth.ts'
import { handleOptions } from '../_shared/cors.ts'
import { getBalance } from '../_shared/credits.ts'
import { AppError, errorResponse, jsonResponse, toAppError } from '../_shared/errors.ts'
import { runGenerate } from '../_shared/generate-core.ts'
import { logRequest } from '../_shared/log.ts'
import { GenerateRequestSchema } from '../_shared/request.ts'

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight
  if (req.method !== 'POST') return errorResponse(new AppError('INVALID_INPUT', 'طريقة غير مدعومة', { status: 405 }))

  let userId: string | null = null
  let assetId: string | null = null

  try {
    const user = await requireUser(req)
    userId = user.id

    const parsed = GenerateRequestSchema.safeParse(await req.json().catch(() => null))
    if (!parsed.success) {
      throw new AppError('INVALID_INPUT', undefined, { detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
    }
    assetId = parsed.data.assetId

    const res = await runGenerate({ fn: 'generate-media', userId: user.id, body: parsed.data, started })
    return jsonResponse(res)
  } catch (e) {
    const err = toAppError(e)
    if (!assetId) logRequest({ fn: 'generate-media', user: userId, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail })
    const balanceAfter = userId ? await getBalance(userId).catch(() => 0) : 0
    return errorResponse(err, { assetId, cost: 0, balanceAfter })
  }
})
