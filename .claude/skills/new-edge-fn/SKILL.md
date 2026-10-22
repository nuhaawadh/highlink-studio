---
name: new-edge-fn
description: إنشاء Supabase Edge Function جديدة بنمط المشروع (zod، أخطاء موحّدة، CORS، service_role). استخدمه عند "أنشئ وظيفة" أو "edge function جديدة".
---

# Edge Function جديدة: $ARGUMENTS

1. اقرأ `supabase/functions/_shared/` (العميل الإداري، الأخطاء، CORS) و`packages/shared/types.ts`.
2. أنشئ `supabase/functions/<name>/index.ts` بهذا الهيكل الثابت:
   - `Deno.serve` + معالجة `OPTIONS` بـCORS من `_shared/cors.ts`.
   - التحقق من JWT المستخدم (`Authorization: Bearer`) عبر `supabase.auth.getUser()` — إلا webhooks الموقّعة.
   - مخطط zod للمدخلات؛ فشل التحقق → `400` برمز `INVALID_INPUT` ورسالة عربية.
   - كل الأخطاء عبر `_shared/errors.ts` → `{ success:false, error:{code,message} }` بالرموز في `GenerateErrorCode`.
   - الكتابة في الرصيد فقط عبر `hold_credits / confirm_hold / release_hold / grant_credits` بعميل service_role.
   - سجل واحد بنهاية كل طلب: `console.log(JSON.stringify({ fn, user, ms, ok, code }))`.
3. المفاتيح من `Deno.env.get()` فقط؛ أضف اسم المتغير إلى `supabase/.env.example`.
4. اختبار: `supabase functions serve <name> --env-file supabase/.env.local` + طلب curl في الرد للتجربة اليدوية.
5. لا تنشر (`functions deploy`) — النشر قرار المستخدمة.
