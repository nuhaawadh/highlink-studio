import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2'

/**
 * عميل service_role — يتجاوز RLS. يُستخدم من السيرفر فقط للكتابة في الرصيد والأصول والأحداث.
 * SUPABASE_URL وSUPABASE_SERVICE_ROLE_KEY تُحقن تلقائيًا في Edge Functions (لا تُرفع بـsecrets set).
 * بلا أنواع Database مولّدة: Edge Functions لا تستورد من خارج supabase/functions/ (قيود التجميع).
 */
function required(name: string): string {
  const v = Deno.env.get(name)
  if (!v) throw new Error(`Missing env ${name}`)
  return v
}

let cached: SupabaseClient | null = null

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached
  cached = createClient(required('SUPABASE_URL'), required('SUPABASE_SERVICE_ROLE_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  })
  return cached
}

/** رابط المشروع — يُبنى منه رابط الـwebhook للمزوّد */
export function projectUrl(): string {
  return required('SUPABASE_URL').replace(/\/$/, '')
}
