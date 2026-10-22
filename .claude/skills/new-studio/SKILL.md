---
name: new-studio
description: إضافة استوديو جديد لاستوديو هاي لينك — وصفة JSON في content/studios + صف في seed + نصوص i18n + بطاقة في الواجهة. استخدمه عند "أضف استوديو" أو "استوديو جديد".
---

# استوديو جديد: $ARGUMENTS

اتبع الخطوات بالترتيب ولا تتجاوز خطوة:

1. اقرأ `content/studios/product-shot.json` و`content/studios/README.md` — هذا هو القالب والقواعد.
2. أنشئ `content/studios/<id>.json` بنفس الحقول: `model` مقفل، `inputs`، `defaults`، `presets` (كل preset بتوقيع بصري مكتوب بالإنجليزية)، `prompt_template` بالأقسام المسمّاة `[SUBJECT] [COMPOSITION] [LIGHTING] [LENS] [PALETTE] [TYPOGRAPHY] [QUALITY] [AVOID]`، `negative`، `qa`، `cost_credits`، `outputs`.
3. احسب `cost_credits` بـ`creditsForUsd()` من `packages/shared/pricing.ts` × عدد الصور في `outputs`.
4. أضف صف `studios` في `supabase/seed.sql` بـ`enabled = false` (يُفعَّل بعد المجموعة الذهبية).
5. أضف النصوص في `apps/web/src/i18n/ar.json` و`en.json` تحت `studios.<id>`.
6. أضف المسار `studio/<id>` في `apps/web/src/App.tsx` والرابط في `Header.tsx` — عبر `StudioWizard` العام، لا صفحة مخصصة.
7. شغّل `npm run typecheck && npm test`. لا تنهِ قبل نجاحهما.
8. اكتب في `CHANGELOG.md` سطرًا واحدًا، وفي الرد: ما تبقّى يدويًا (تشغيل المجموعة الذهبية ثم `enabled = true`).

ممنوع: ذكر أسماء مصوّرين أو منشورات في البرومبت، أو إضافة نموذج غير موجود في جدول `models`.
