---
name: new-model
description: إضافة نموذج توليد جديد (Replicate / fal / Gemini) إلى كتالوج استوديو هاي لينك مع تسعيره ومخطط مدخلاته. استخدمه عند "أضف نموذج" أو "فعّل Kling/Seedance/…".
---

# نموذج جديد: $ARGUMENTS

1. اسألي عن (أو استنتجي من الوسيطة): المعرّف الداخلي (kebab-case)، المزوّد، الـslug عند المزوّد، النوع (image/video)، وسعر المزوّد بالدولار (ثابت للصورة أو لكل ثانية للفيديو). **السعر يُؤخذ من صفحة المزوّد الآن لا من الذاكرة** — اطلبيه من المستخدمة إن لم يكن متاحًا.
2. احسبي التكلفة بالرصيد: `creditsForUsd(usd)` أو `cost_per_second = usd/ث × 3 ÷ 0.042` (المخطط §7). اعرضي الحساب في الرد.
3. مخطط المدخلات (المخطط §15): لـReplicate اجلبي `GET https://api.replicate.com/v1/models/{owner}/{name}` → `latest_version.openapi_schema.components.schemas.Input` واحفظيه في `input_schema`؛ لـfal من OpenAPI الخاص بالنقطة؛ لـGemini اكتبيه يدويًا من الوثائق. لا تكتبي النسب والمدد من الذاكرة.
4. أضيفي الصف في `supabase/seed.sql` (جدول `models`) بـ`enabled = true` و`rollout_pct = 10` و`fallback_slug` إن وُجد بديل على fal.
5. أضيفي حالة اختبار في `supabase/functions/_shared/providers/*.test.ts` تتحقق أن المحوّل يبني الطلب الصحيح لهذا النموذج (بلا نداء شبكة).
6. `npm run typecheck && npm test`. ثم في الرد: الأمر لتشغيل المجموعة الذهبية على النموذج، ومتى يُرفع `rollout_pct` إلى 100 (بعد يوم بلا ارتفاع في الفشل).
