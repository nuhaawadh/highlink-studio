# `_shared/` — المشترك بين Edge Functions

القاعدة: كل وظيفة تستورد من هنا ولا تعيد كتابة شيء. الأسرار عبر `Deno.env.get()` ومُعلنة في `supabase/.env.example`.
zod يُستورد بصيغة Deno `npm:zod@4`؛ في vitest تحلّها إضافة `highlink:deno-npm-specifiers` في `apps/web/vite.config.ts` إلى حزمة zod المثبتة.
**لا استيراد من خارج `supabase/functions/`** (قيود تجميع النشر) — العقد منسوخ هنا ويحرسه `packages/shared/contract.test.ts`.

| الملف | الدور | نقي (يُختبر بـvitest) |
| --- | --- | --- |
| `types.ts` | رموز الأخطاء + الرسائل العربية + حالات HTTP + أنواع الطلب/الرد وصف `models` | ✓ |
| `errors.ts` | `AppError(code, messageAr, {status, detail})`، `toAppError` (يحوّل أخطاء SQL مثل `INSUFFICIENT_CREDITS`)، `jsonResponse`، `errorResponse` | |
| `cors.ts` | الترويسات + `handleOptions` | |
| `supabaseAdmin.ts` | عميل service_role (يتجاوز RLS) + `projectUrl()` لبناء رابط الـwebhook | |
| `auth.ts` | `requireUser(req)` من JWT الطلب | |
| `credits.ts` | `holdCredits` / `confirmAssetHold` / `releaseAssetHold` / `getBalance` — تغليف دوال SQL؛ التأكيد والتحرير بالأصل لأن الـwebhook لا يعرف إلا `asset_id` | |
| `storage.ts` | محوّل التخزين الواحد (ADR 0002/0003): `put`, `publicUrl`, `copyFromUrl` — Supabase Storage bucket `media` الآن، R2 لاحقًا بتبديل هذا الملف فقط | |
| `request.ts` | مخطط zod لطلب `generate-media` (روابط المراجع https فقط، `maxCredits` موجب) — منفصل عن index.ts ليُختبر | ✓ |
| `inputs.ts` | `buildProviderInput` من `models.input_schema` — لا كود لكل نموذج، القيم خارج enum تُرفض قبل الحجز | ✓ |
| `pricing.ts` | نسخة `applyModelResolution` (تطابق `packages/shared/pricing.ts`) | ✓ |
| `safety.ts` | قائمة كلمات عربية/إنجليزية بمطابقة الكلمة الكاملة بعد التطبيع | ✓ |
| `replicate-signature.ts` | تحقق توقيع Standard Webhooks بـWebCrypto | ✓ |
| `providers/index.ts` | واجهة `ProviderAdapter` + `getProvider()` | |
| `providers/replicate.ts` | `submit` (مهلة 30 ث) / `verifyWebhook` / `eventId` / `parseWebhook` (zod على الحمولة — مختبر) | parseWebhook ✓ |
| `log.ts` | سطر JSON واحد في نهاية كل طلب | |

لاحقًا بنفس الواجهة: `providers/google.ts`, `providers/fal.ts`, و`qa.ts` (بوابة المخرجات الكاملة، المخطط §15).
