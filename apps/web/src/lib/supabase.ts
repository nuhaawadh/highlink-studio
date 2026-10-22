import { createClient } from '@supabase/supabase-js'
import type { Database } from '@shared/db'
import { env } from './env'

/**
 * عميل Supabase الوحيد في الواجهة (مفتاح anon فقط — RLS هي الحماية).
 * الأنواع تُولَّد بـ `npm run gen:types` إلى packages/shared/db.ts
 */
export const supabase = createClient<Database>(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
  },
  realtime: {
    params: { eventsPerSecond: 5 },
  },
})
