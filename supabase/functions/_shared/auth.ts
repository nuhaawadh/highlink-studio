import { AppError } from './errors.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * يستخرج المستخدم من ترويسة Authorization (JWT من Supabase Auth).
 * البوابة تتحقق من JWT أيضًا (verify_jwt=true) لكننا نعيد التحقق ونحصل على user_id من المصدر.
 */
export async function requireUser(req: Request): Promise<{ id: string }> {
  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    throw new AppError('INVALID_INPUT', 'يلزم تسجيل الدخول', { status: 401 })
  }
  const token = auth.slice('Bearer '.length).trim()
  const { data, error } = await supabaseAdmin().auth.getUser(token)
  if (error || !data.user) {
    throw new AppError('INVALID_INPUT', 'الجلسة غير صالحة — سجّل الدخول مجددًا', { status: 401, detail: error?.message })
  }
  return { id: data.user.id }
}
