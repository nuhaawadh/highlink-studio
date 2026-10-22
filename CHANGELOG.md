# سجل التغييرات

## المرحلة 1 — المحرك (2026-10-22)
- اختبارات أولًا (القاعدة 9): `supabase/tests/credits.test.sql` (حجز/تأكيد/تحرير، idempotency على assetId، رصيد غير كافٍ، dedupe للـwebhook) تمر على القاعدة السحابية وفي CI؛ vitest لتوقيع Replicate، قائمة الأمان، بناء المدخلات من المخطط، تطابق العقد والتسعير بين `packages/shared` و`_shared`.
- migration `0002_phase1_engine`: bucket `media` عام للقراءة (الكتابة service_role)، فهرس فريد للحجز النشط لكل أصل، `hold_credits` idempotent + حارس `ALREADY_CHARGED`.
- seed: nano-banana-pro عبر Replicate (`google/nano-banana-pro`) بتكلفة 11 (0.15$) ومعاملات دقة `{1K:1,2K:1,4K:2}` و`input_schema` من Replicate؛ النماذج الأربعة الأخرى معطّلة حتى تُبنى (ADR 0003).
- `_shared/`: admin, auth, errors (رسائل عربية لكل رمز), cors, credits, storage (Supabase Storage), inputs, pricing, safety, replicate-signature, providers/replicate, log.
- `generate-media` بالخطوات التسع (§5) مع تحرير الحجز وتعليم الأصل فاشلًا برسالة عربية عند أي خطأ، وتفصيل تقني في `metadata.error_detail`. `provider-webhook`: توقيع Standard Webhooks، dedupe عبر `webhook_events`، نسخ الناتج إلى التخزين، تأكيد/تحرير الحجز، 404 للمهمة غير المعروفة ليعيد المزوّد الإرسال.
- الواجهة: `/image-generate` (منتقي نموذج، قياس، دقة بتكلفة كل خيار، زر بالتكلفة قبل الضغط، شبكة نتائج تتحدث عبر Realtime) و`/library`. إصلاح `useCredits`: اسم قناة فريد لكل نسخة (كان يرمي خطأ عند استخدامه من مكوّنين).
- `scripts/push-secrets.py` لرفع الأسرار دون طباعة قيم، و`.claude/launch.json` لتشغيل الواجهة من المتصفح المدمج.
- الهوية: ألوان وخطوط موقع هاي لينك في `tokens.css` (كحلي/أزرق، Alexandria + IBM Plex Sans Arabic) — المصدر والمطابقة في `docs/brand/palette.md`، والأيقونة بلون البراند.
- **بوابة 1 مجتازة**: توليدة nano-banana-pro حقيقية ظهرت عبر Realtime بلا تحديث (`docs/brand/samples/gate1-first-image.png`)، الرصيد 30 → 19 بصف `charge` −11 وحدث webhook واحد معالَج؛ فشل حقيقي من المزوّد (402) أعاد الرصيد وعرض رسالة عربية.

## المرحلة 0 — الهيكل (2026-10-22)
- واجهة Vite + React 19 + TypeScript strict + Tailwind v4 بالعربية RTL مع تبديل إنجليزي.
- Supabase: migration `0001_init` (10 جداول، RLS كامل، دفتر رصيد بدوال `hold/confirm/release/grant`، حارس أعمدة الأصول) + seed (5 خطط، 5 نماذج، 3 استوديوهات معطّلة).
- `packages/shared`: تسعير الرصيد (مختبر)، الأنواع المشتركة، أنواع قاعدة البيانات المؤقتة.
- وصفة استوديو `product-shot` (8 presets، قالب برومبت بأقسام مسمّاة، بوابة جودة).
- هيكل `generate-media` يتحقق بـzod ويرفض بوضوح (501) حتى المرحلة 1.
- CI: typecheck + test + build + تطبيق migrations على Postgres 16.
- مهارات المشروع: `new-studio`, `new-model`, `new-edge-fn`, `demo-video`.
- المركز القانوني `/legal` على بنية هلاي (بند = جملة + 3 نقاط): شروط الخدمة (20 بندًا)، الخصوصية (17)، الاسترداد، حذف البيانات — عربي/إنجليزي، + صفحتا الباقات والتواصل وتذييل بروابطها.
- `packages/shared/plans.ts` مصدر واحد للباقات مع اختبار يطابقه بـseed.sql وrصيد الترحيب بالـmigration.
- `docs/policies/activation-pack.md` ملف يُرسل لفرق تفعيل ميسر/بيلينك.
