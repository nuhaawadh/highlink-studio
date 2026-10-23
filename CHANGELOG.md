# سجل التغييرات

## الهوية — دليل الهوية البصرية V1 (2026-10-24)
- اعتماد `docs/brand/highlink-brand-guide.pdf` مصدرًا للهوية بدل ألوان الموقع السابقة (الكحلي والأزرق). المطابقة في `docs/brand/palette.md`.
- `tokens.css`: أبيض `#FFFFFF` خلفية أساسية، أسود `#0A0A0A` للنص والتحديد والأزرار العادية، الرمادي الفاتح `#F4F4F2` للأسطح، خط رفيع `#E4E4E4`، الليموني `#D0F94A` توكن مستقل (`lime`/`lime-ink`)، التدرّج `--grad-1..3`؛ كل الزوايا 0 وكل الظلال none.
- الخطوط: Tajawal (400/500/700/800) للعربي والإنجليزي، IBM Plex Mono لأسماء الأدوات (المختبرات في منتقي النماذج، المفاتيح، البرومبت). `h1` ExtraBold 800.
- الشعار الأصلي (مستخرج من الدليل بلا تعديل) في `public/brand/`: الهيدر بالشعار الكامل بعرض 120px والرمز لوحده على الجوال؛ الأيقونات من الرمز على الأسود.
- الليموني مرة وحدة في الشاشة: زر `variant="lime"` لزر التوليد، "ابدأ مجانًا"، الدخول، واشتراك الباقة الأشهر — وبقية الأزرار أسود أو بإطار. التدرّج على كلمة وحدة (`.text-brand-gradient`، معكوس في RTL ليبدأ بالتركوازي).
- كنس الواجهة: `bg-white/*` (تظليل الثيم الداكن) → `bg-text/*`، حذف `shadow-*` و`backdrop-blur`، `rounded-full/md` → حاد، أغلفة القوالب سطح معكوس أسود بأيقونة بيضاء.
- الرئيسية بنبرة الدليل: «صور متجرك وإعلاناته جاهزة بدقيقة» (بدل شعار يشبه شعار هلاي)، وسطر حقائق بأرقام إنجليزية.

## المرحلة 1 — القوالب السعودية الجاهزة (2026-10-23، الحركة 6 في خطة التفوّق)
- `content/templates/saudi.json`: **38 قالبًا** في 11 فئة — رمضان، الأعياد، اليوم الوطني ويوم التأسيس، المواسم والعروض (الجمعة البيضاء، العودة للمدارس، الشتاء والكشتات، موسم الفعاليات، الصيف)، العقار، المطاعم والمقاهي، العطور والعود، العبايات والأزياء، العيادات والتجميل، المتاجر الإلكترونية، محتوى السوشال (22 تصميمًا بنص عربي، 8 صور، 8 ريلز). كل قالب: حقول قليلة بالعربي، برومبت إنجليزي بأقسام مسمّاة، والنص العربي حرفيًا بين « ».
- مستويات جودة بدل أسماء النماذج: نص عربي دقيق (نانو بنانا برو)، صور اقتصادي/متوازن/فاخر (FLUX 3، Seedream 5 Pro، نانو بنانا برو)، فيديو اقتصادي/متوازن/سينمائي (Hailuo H3 Max Turbo، H3 Max، Kling 4).
- مواسم بنوافذ: سنوية (اليوم الوطني، التأسيس، الجمعة البيضاء…) وهجرية تقديرية لـ1448 (رمضان، العيدين — تُراجع مع أم القرى). ما في موسمه أو يبدأ خلال 45 يومًا يظهر أولًا.
- `packages/shared/templates.ts`: `renderTemplatePrompt` (تنظيف مدخلات المستخدم من « » وأقواس القالب والأسطر، أقسام `{{#if}}`)، `missingFields`، `seasonStatus` بتوقيت الرياض — اختبارات أولًا. حارس `templates.catalog.test.ts`: كل قالب يشير لنماذج مفعّلة تعمل بنص فقط، بقياس/مدة/دقة/حجم يدعمها النموذج، وكل وسم معرّف، ويبني طلب مزوّد صالحًا بتكلفة موجبة (285 اختبارًا).
- الواجهة: `/templates` (فلاتر بالفئة و"في موسمه"، بطاقات "من X رصيد") و`/templates/:id` (الحقول، مستوى الجودة بتكلفة كل خيار، معاينة البرومبت، النتائج عبر Realtime). التصفح عام والتوليد بعد الدخول. الطلب يحمل `template` يُحفظ في `metadata` للتحليلات.

## المرحلة 1 — كتالوج fal: كل النماذج الحديثة عبر محوّل واحد + الفيديو (2026-10-23، ADR 0005)
- **الكتالوج بيانات لا كود**: `content/catalog/fal-models.json` (كل fal — 1,627 نقطة نهاية) → `content/catalog/fal-launch.json` (قائمة الإطلاق: **233** نقطة نهاية — فيديو 126، صور 86، صوت 21 — بأسماء عربية/إنجليزية وعائلات وطبقات) → مخطط OpenAPI الرسمي وسعر fal الرسمي لكل نقطة في `content/catalog/{schemas,pricing}/` → `scripts/build-models-seed.py` يولّد صفوف `models` داخل `supabase/seed.sql` بين `BEGIN/END fal-catalog`. سكربتات: `fal-catalog.py`، `fal-schema.py`، `build-models-seed.py`.
- محوّل `_shared/providers/fal.ts`: `queue.fal.run` + `fal_webhook`؛ تحقق توقيع ED25519 بـ`_shared/fal-signature.ts` (JWKS مخزّن مؤقتًا مع تحديث عند دوران المفاتيح)؛ استخراج الناتج من أي شكل حمولة؛ `OK` بلا ملف = فشل مع استرداد. `provider-webhook` يقبل `source=fal`. اختبارات vitest للتوقيع (مرجع WebCrypto) ولتحليل الحمولة.
- التسعير: `modelCredits(row, {imageSize, duration, resolution, audio})` و`resolveDuration` في `packages/shared/pricing.ts` و`_shared/pricing.ts` (تطابق محروس في `contract.test.ts`): صور بالدقة، فيديو بالثانية (`cost_per_second` + `supports.cps_by_resolution` + `audio_cps`) أو بالمقطع (`credits_by_duration`). اختبارات قبل الكود (القاعدة 9).
- `_shared/inputs.ts` يغطي أسماء fal بلا كود لكل نموذج: `image_url`/`image_urls`/`start|end_image_url`/`reference_image_urls`، `image_size` المسمّى (وأبعاد صريحة لـ4:5)، `duration` نصية "5"/"8s" أو رقمية بتحويل النوع والتحقق من enum/الحدود، دقة بحالتي الأحرف (`768P`)، `generate_audio` عند الطلب فقط، `num_images=1`، وملء الحقول المطلوبة بافتراض المزوّد. 10 حالات اختبار جديدة.
- `generate-core`: يقبل `video` (المدة من الطلب → الافتراضي → المخطط، ويرفض ما يتجاوز `max_duration_s`)، يرفض نماذج المراجع بلا `images` برسالة عربية، ويسجّل دقة الفيديو على الأصل. `config.resolution` صار نصًا كما يسمّيه المزوّد (`request.ts`/`types.ts`). التخزين يقبل `webm`/`mov`.
- الواجهة: صفحة `/video-generate` (المدة والدقة والقياس والصوت من `supports`، التكلفة لكل خيار بنفس دالة السيرفر، بطاقة فيديو بمشغّل)؛ منتقي نماذج مجمّع بالعائلات (بطاقة "من X رصيد" + رقائق الإصدارات)؛ صفحات التوليد الحر تعرض ما يعمل بنص فقط (`supports.ui`/`requires_ref`)؛ `OptionChips`؛ نصوص `video.*` و`generate.new/variants/variant`.
- API v1: `GET /models` يعرض `kind`/`family`/`durations`/`resolutions`/`audio`/`ref_images`/`requires_ref` و`costs` بالمدة للفيديو؛ `docs/api.md` يوثّق `config.duration/resolution/audio` ومتطلبات المراجع.
- مستندات: ADR 0005، `docs/competitive/higgsfield-inventory-2026-10.md` (جرد حيّ من MCP Higgsfield: 122 أداة، 134 نموذجًا، 700+ بريسيت، الأسعار الفعلية، 10 ثغرات)، `docs/competitive/beat-higgsfield-halai.md` (مصفوفة النماذج وعشر حركات مرتّبة بالقيمة ÷ الجهد)، تحديث `CLAUDE.md` (القاعدة 7 والحالة) وسكيل `new-model`.
- الكتالوج المولّد: 233 نقطة نهاية بمخطط وسعر رسمي، **137 مفعّلًا** (63 صورة، 74 فيديو، 27 عائلة). قواعد أمان التسعير (العروض المؤقتة، الدقات بلا سعر، الأحجام، الصوت الصريح، التكلفة المعتمدة على حجم المدخل، المراجع الإلزامية، `min_refs`، الحقول غير المدعومة) في ADR 0005. حارس `catalog.test.ts` يبني طلب المزوّد لكل خيار لكل نموذج مفعّل (234 اختبارًا).
- **غير منشور بعد**: يحتاج `FAL_KEY` في الأسرار، نشر `provider-webhook`/`generate-media`/`v1`، تطبيق الـseed، ثم بوابة 2 (توليدة فيديو حقيقية عبر Realtime). 4K معطّل حتى R2 (حد 50MB).

## المرحلة 1 — API عامة v1 (2026-10-22، ADR 0004)
- وظيفة `v1` بلا JWT: `POST /v1/generate` · `GET /v1/assets/{id}` · `GET /v1/models` · `GET /v1/balance`، المصادقة بمفتاح `hl_live_`/`hl_test_` في `Authorization: Bearer` أو `X-API-Key`، وترويسات `X-RateLimit-*`.
- النواة مشتركة: منطق `generate-media` انتقل إلى `_shared/generate-core.ts` (`runGenerate`) ويستدعيه الغلافان (الواجهة بـJWT، الـAPI بالمفتاح) — تسعير وأمان وحجز واحد.
- migration `0004_api_v1`: `api_keys` (sha256 فقط + تلميح، حد يومي من الباقة، آخر استخدام، إبطال)، `api_daily_usage`، `api_idempotency`، `api_webhook_deliveries`، `assets.api_key_id`، RLS لكلٍّ، ودوال `create_api_key`/`revoke_api_key` (الواجهة بـ`auth.uid()`، حد 10 مفاتيح) و`api_authenticate` (service_role، عدّ ذرّي + `DAILY_LIMIT`). اختبارات `supabase/tests/api.test.sql` (A1–A11) قبل الكود.
- `Idempotency-Key`: نفس المفتاح ونفس الجسم → الرد المخزَّن مع `Idempotency-Replayed: true`؛ جسم مختلف أو قيد التنفيذ → `409 IDEMPOTENCY_CONFLICT`.
- مفاتيح `hl_test_` = تجربة جافة: نفس التحقق والتسعير وفحص الرصيد، بلا مزوّد ولا خصم؛ الأصل `completed` بـ`metadata.sandbox`.
- webhook العميل (`_shared/client-webhook.ts`): عند اكتمال/فشل أصل أُنشئ عبر API، POST موقّع بمواصفة Standard Webhooks (`webhook-id/timestamp/signature`، سر `whsec_` لكل مفتاح)، 3 محاولات، يُسجَّل في `api_webhook_deliveries`؛ التوقيع مختبر بدالة التحقق نفسها.
- الواجهة: صفحة `/account` (البريد، الباقة، الرصيد) لإصدار المفاتيح (الاسم، النوع، رابط webhook) مع عرض المفتاح والسر مرة واحدة، والإبطال؛ رابط الحساب في الهيدر والدرج؛ بطاقة الأصل تعرض "تجربة API" للأصول sandbox.
- رموز API (`UNAUTHORIZED`, `NOT_FOUND`, `DAILY_LIMIT`, `IDEMPOTENCY_CONFLICT`, `METHOD_NOT_ALLOWED`) في النسختين يحرسهما `contract.test.ts`. `smoke-gate1.py` يغطي الـAPI بمفتاحي test وlive (A1–A14).
- `docs/api.md`: دليل العميل — المصادقة والحدود، المسارات الأربعة بمثال curl وإعدادات عقدة HTTP Request في n8n، استقبال الـwebhook بعقدة Webhook (Raw Body) وكود التحقق من التوقيع، جدول الأخطاء وقواعد إعادة المحاولة، وتدفق n8n كامل لصور المنتجات.

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
