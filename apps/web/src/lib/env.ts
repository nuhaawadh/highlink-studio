import { z } from 'zod'

/**
 * متغيرات البيئة العامة فقط (تُحقن في الحزمة — لا أسرار هنا أبدًا).
 * المفاتيح السرية (Replicate, Gemini, Moyasar secret, R2) تعيش في Supabase Edge Functions فقط.
 */
const schema = z.object({
  VITE_SUPABASE_URL: z.string().url(),
  VITE_SUPABASE_ANON_KEY: z.string().min(20),
  VITE_MEDIA_BASE_URL: z.string().url().default('https://media.highlink.tech'),
  VITE_APP_NAME: z.string().default('استوديو هاي لينك'),
  VITE_SUPPORT_EMAIL: z.string().email().default('highlink.sa@gmail.com'),
})

const parsed = schema.safeParse(import.meta.env)

if (!parsed.success) {
  // نفشل مبكرًا وبوضوح بدل أخطاء غامضة لاحقًا
  console.error('[env] متغيرات البيئة ناقصة أو غير صالحة:', parsed.error.flatten().fieldErrors)
  throw new Error('Missing or invalid VITE_* environment variables — انظر apps/web/.env.example')
}

export const env = parsed.data
