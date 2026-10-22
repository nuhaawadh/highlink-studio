# `_shared/` — المشترك بين Edge Functions (يُبنى في المرحلة 1)

| الملف | الدور |
| --- | --- |
| `supabaseAdmin.ts` | عميل service_role (يتجاوز RLS) — للكتابة في الرصيد والأصول فقط من السيرفر |
| `auth.ts` | استخراج المستخدم من JWT الطلب |
| `errors.ts` | `fail(code, messageAr, status)` → `{ success:false, error:{code,message} }` بالرموز في `packages/shared/types.ts` |
| `cors.ts` | ترويسات CORS + معالجة OPTIONS |
| `credits.ts` | `hold / confirm / release / grant` تغليف لدوال SQL |
| `providers/index.ts` | واجهة `ProviderAdapter` (المخطط §5) + `providers/replicate.ts`, `google.ts`, `fal.ts` |
| `r2.ts` | رفع ناتج إلى R2 (S3-compatible) وبناء رابط `media.highlink.tech` |
| `qa.ts` | بوابة المخرجات (المخطط §15): سلامة الملف، الأمان، النص العربي، مطابقة المنتج |

القاعدة: كل وظيفة تستورد من هنا ولا تعيد كتابة شيء. الأسرار عبر `Deno.env.get()` ومُعلنة في `supabase/.env.example`.
