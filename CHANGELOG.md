# سجل التغييرات

## المرحلة 1 — API عامة v1 (2026-10-22، ADR 0004)
- وظيفة `v1` بلا JWT: `POST /v1/generate` · `GET /v1/assets/{id}` · `GET /v1/models` · `GET /v1/balance`، المصادقة بمفتاح `hl_live_`/`hl_test_` في `Authorization: Bearer` أو `X-API-Key`، وترويسات `X-RateLimit-*`.
- النواة مشتركة: منطق `generate-media` انتقل إلى `_shared/generate-core.ts` (`runGenerate`) ويستدعيه الغلافان (الواجهة بـJWT، الـAPI بالمفتاح) — تسعير وأمان وحجز واحد.
- migration `0004_api_v1`: `api_keys` (sha256 فقط + تلميح، حد يومي من الباقة، آخر استخدام، إبطال)، `api_daily_usage`، `api_idempotency`، `api_webhook_deliveries`، `assets.api_key_id`، RLS لكلٍّ، ودوال `create_api_key`/`revoke_api_key` (الواجهة بـ`auth.uid()`، حد 10 مفاتيح) و`api_authenticate` (service_role، عدّ ذرّي + `DAILY_LIMIT`). اختبارات `supabase/tests/api.test.sql` (A1–A11) قبل الكود.
- `Idempotency-Key`: نفس المفتاح ونفس الجسم → الرد المخزَّن مع `Idempotency-Replayed: true`؛ جسم مختلف أو قيد التنفيذ → `409 IDEMPOTENCY_CONFLICT`.
- مفاتيح `hl_test_` = تجربة جافة: نفس التحقق والتسعير وفحص الرصيد، بلا مزوّد ولا خصم؛ الأصل `completed` بـ`metadata.sandbox`.
- webhook العميل (`_shared/client-webhook.ts`): عند اكتمال/فشل أصل أُنشئ عبر API، POST موقّع بمواصفة Standard Webhooks (`webhook-id/timestamp/signature`، سر `whsec_` لكل مفتاح)، 3 محاولات، يُسجَّل في `api_webhook_deliveries`؛ التوقيع مختبر بدالة التحقق نفسها.
- الواجهة: صفحة `/account` (البريد، الباقة، الرصيد) لإصدار المفاتيح (الاسم، النوع، رابط webhook) مع عرض المفتاح والسر مرة واحدة، والإبطال؛ رابط الحساب في الهيدر والدرج؛ بطاقة الأصل تعرض "تجربة API" للأصول sandbox.
- رموز API (`UNAUTHORIZED`, `NOT_FOUND`, `DAILY_LIMIT`, `IDEMPOTENCY_CONFLICT`, `METHOD_NOT_ALLOWED`) في النسختين يحرسهما `contract.test.ts`. `smoke-gate1.py` يغطي الـAPI بمفتاحي test وlive (A1–A14).

## المرحلة 1 — المراجعة المستقلة وتصليب المحرك (2026-10-22)
- مراجعة من جلسة لم تكتب الكود (القاعدة 9، الجلسة 4): حرج واحد، سبعة مهمة، 11 تحسينًا — نُفّذ الحرج والمهم كلها والتحسينات الأمنية الرخيصة؛ الباقي في `docs/backlog.md`.
- `generate-media`: حجز الأصل ذريًا (`queued → processing` بشرط الحالة) قبل الحجز والإرسال، فالطلبات المتزامنة بنفس `assetId` تنتج مهمة واحدة عند المزوّد والباقي 409؛ بعد كتابة `provider_job_id` تنتقل ملكية الحجز إلى الـwebhook (لا تحرير من الـcatch)؛ `assetId` لا يُعتمد قبل فحص الملكية؛ `type` و`model` من جدول النماذج؛ مخطط الطلب في `_shared/request.ts` (روابط https فقط، مختبر).
- `provider-webhook`: فرع `ALREADY_FINAL` يُسوّي الحجز (تأكيد لمكتمل/تحرير لفاشل) بدل تركه `held`؛ `source` بـzod؛ حمولة Replicate بـzod (`parseWebhook` مختبر)؛ مهلة 30 ث على الإرسال و60 ث + سقف 50MB على نسخ الناتج.
- migration `0003_review_hardening`: حارس أعمدة `assets` كان يقرأ `request.jwt.claim.role` الذي لا يضبطه PostgREST ≥ 9 (لم يعمل قط) → `auth.role()` برفض افتراضي + `type`/`model`؛ سياسة INSERT تمنع أعمدة السيرفر؛ `get_balance` للمالك فقط؛ `reconcile_holds()` تحرّر/تؤكد الحجوزات الأقدم من 30 دقيقة وتعلّم الأصول المعلّقة فاشلة.
- اختبارات أولًا: T7 (`ALREADY_CHARGED`)، T8 (إعادة المحاولة بعد التحرير)، T9 (حارس وسياسة INSERT عبر محاكاة `request.jwt.claims`)، T10 (`get_balance`)، T11 (`reconcile_holds`) — تمر على القاعدة السحابية داخل معاملة تُلغى؛ CI يحاكي `auth.role()`/`request.jwt.claims` ويمنح صلاحيات الأدوار. vitest لمخطط الطلب وحمولة الـwebhook (محلّل `npm:zod@4` في `vite.config.ts`).
- الواجهة ترسل `maxCredits` = التكلفة المعروضة على الزر. `scripts/smoke-gate1.py` يعيد بوابة 1 آليًا (توليدة حقيقية، طلبان متزامنان، فشل مع استرداد، تنظيف).

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
