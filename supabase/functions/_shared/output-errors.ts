import { AppError } from './errors.ts'

/**
 * رفض نهائي لناتج المزوّد (المراجعة المستقلة 2026-10-24، الثغرة 2): لن ينجح حفظه مهما أعدنا المحاولة —
 * صيغة لا يقبلها التخزين، أكبر من الحد، فارغ، رابط منتهٍ/محظور، أو "نجاح" بلا ناتج.
 * finalize يعامله كفشل (failed + تحرير الحجز) بدل رمي 500 يعيده المزوّد ثم reconcile إلى الأبد.
 * الأخطاء العابرة (شبكة، 5xx، التخزين) تبقى AppError عاديًا فتُعاد المحاولة.
 */
export class OutputRejectedError extends AppError {
  readonly permanent = true

  constructor(message: string, detail: string) {
    super('PROVIDER_ERROR', message, { detail })
    this.name = 'OutputRejectedError'
  }
}

export function isOutputRejected(e: unknown): e is OutputRejectedError {
  return e instanceof OutputRejectedError
}

/** حالة HTTP عند جلب الناتج: 4xx نهائي (الرابط لن يعود) إلا 408/429؛ ما عداها عابر */
export function permanentFetchStatus(status: number): boolean {
  return status >= 400 && status < 500 && status !== 408 && status !== 429
}
