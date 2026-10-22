import { ALL_ERROR_HTTP_STATUS, ALL_ERROR_MESSAGES_AR, type ErrorCode } from './types.ts'
import { corsHeaders } from './cors.ts'

/**
 * خطأ تطبيقي برمز من العقد ورسالة عربية (CLAUDE.md القاعدة 10).
 * `detail` للسجلات فقط — لا يُرسل للمستخدم.
 */
export class AppError extends Error {
  readonly code: ErrorCode
  readonly status: number
  readonly detail?: string

  constructor(code: ErrorCode, message?: string, opts?: { status?: number; detail?: string }) {
    super(message ?? ALL_ERROR_MESSAGES_AR[code])
    this.name = 'AppError'
    this.code = code
    this.status = opts?.status ?? ALL_ERROR_HTTP_STATUS[code]
    this.detail = opts?.detail
  }
}

/** يحوّل أي استثناء (خاصة أخطاء SQL من دوال الرصيد والمفاتيح) إلى AppError */
export function toAppError(err: unknown): AppError {
  if (err instanceof AppError) return err
  const msg = err instanceof Error ? err.message : String(err)
  if (msg.includes('INSUFFICIENT_CREDITS')) return new AppError('INSUFFICIENT_CREDITS')
  if (msg.includes('ALREADY_CHARGED')) return new AppError('INVALID_INPUT', 'هذا الطلب نُفّذ من قبل', { status: 409 })
  if (msg.includes('INVALID_AMOUNT') || msg.includes('INVALID_ASSET')) return new AppError('INVALID_INPUT', undefined, { detail: msg })
  if (msg.includes('DAILY_LIMIT')) return new AppError('DAILY_LIMIT')
  if (msg.includes('UNAUTHORIZED')) return new AppError('UNAUTHORIZED')
  return new AppError('PROVIDER_ERROR', undefined, { detail: msg })
}

export function jsonResponse(body: unknown, status = 200, extraHeaders: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json; charset=utf-8', ...extraHeaders },
  })
}

/** ردّ فشل موحّد: { success:false, error:{code,message}, ...extra } */
export function errorResponse(err: AppError, extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ success: false, ...extra, error: { code: err.code, message: err.message } }, err.status)
}
