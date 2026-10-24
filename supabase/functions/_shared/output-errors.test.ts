import { describe, expect, it } from 'vitest'
import { AppError } from './errors'
import { isOutputRejected, OutputRejectedError, permanentFetchStatus } from './output-errors'

/**
 * ناتج لا يمكن حفظه أبدًا (صيغة غير مدعومة، أكبر من الحد، فارغ، رابط منتهٍ) ≠ خطأ عابر (شبكة، 5xx، تخزين).
 * الأول يُنهي الأصل failed ويحرّر الحجز فورًا؛ الثاني يُعاد بإعادة إرسال الـwebhook أو reconcile
 * (المراجعة المستقلة 2026-10-24، الثغرة 2: حجز عالق للأبد + حد التزامن مقفول).
 */
describe('output-errors', () => {
  it('OutputRejectedError هو AppError برمز PROVIDER_ERROR ورسالة عربية وتفصيل', () => {
    const e = new OutputRejectedError('ناتج المزوّد فارغ', 'zero bytes')
    expect(e).toBeInstanceOf(AppError)
    expect(e.code).toBe('PROVIDER_ERROR')
    expect(e.message).toBe('ناتج المزوّد فارغ')
    expect(e.detail).toBe('zero bytes')
    expect(isOutputRejected(e)).toBe(true)
  })

  it('الأخطاء الأخرى ليست رفضًا نهائيًا', () => {
    expect(isOutputRejected(new AppError('PROVIDER_ERROR'))).toBe(false)
    expect(isOutputRejected(new Error('x'))).toBe(false)
    expect(isOutputRejected(null)).toBe(false)
  })

  it('حالة جلب الناتج: 4xx نهائي (رابط منتهٍ/محظور) إلا 408 و429؛ 5xx عابر', () => {
    for (const s of [400, 401, 403, 404, 410, 451]) expect(permanentFetchStatus(s), String(s)).toBe(true)
    for (const s of [408, 429, 500, 502, 503, 504]) expect(permanentFetchStatus(s), String(s)).toBe(false)
  })
})
