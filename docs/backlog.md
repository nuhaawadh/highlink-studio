# Backlog — ما بقي من المراجعة المستقلة لمحرك المرحلة 1 (2026-10-22)

المرجع: تقرير المراجعة (الجلسة 4 في `docs/claude-code-kickoff.md`). الحرج والمهم (1–8) نُفّذت في migration 0003 والوظيفتين،
ومن التحسينات نُفّذ ما هو رخيص وأمني (zod على حمولة الـwebhook ومعامل `source`، تقييد المراجع بـhttps، إرسال `maxCredits`).
الباقي هنا بالترتيب المقترح؛ كل بند صغير بما يكفي لجلسة واحدة.

| # | البند | الملف/السطر | لماذا | متى |
| --- | --- | --- | --- | --- |
| B1 | احتياطي الدقة في التسعير `'1K'` بينما احتياطي مخطط المزوّد `'2K'`: إن غابت `config.imageSize` و`default_params.imageSize` نسعّر على 1K ولا نرسل `resolution` فيولّد المزوّد بافتراضه | `generate-media/index.ts` (حساب `imageSize`)، `_shared/inputs.ts` (`set('resolution', …)`) | لا خسارة مع نانو (1K=2K سعرًا) لكنها فجوة كامنة لأي نموذج قادم. أرسل `resolution` دائمًا أو اقرأ الافتراضي من `input_schema.properties.resolution.default` | قبل إضافة نموذج صور ثانٍ |
| ~~B2~~ | منجز في 0005 (`claim_and_hold` تحت قفل المستخدم) — 2026-10-23 | | | |
| B3 | بطاقة `queued` يتيمة عند فشل الشبكة قبل وصول الطلب للوظيفة، وأخطاء غير HTTP تعرض `error.message` الإنجليزية | `apps/web/src/lib/assets.ts` (`requestGeneration`)، `AssetCard.tsx` | اسمح بحذف منطقي من البطاقة أو إعادة المحاولة بنفس `assetId` (الحجز idempotent يدعمها)؛ وارجع `errors.generic` للأخطاء غير HTTP | مع صفحة المكتبة التالية |
| B4 | `release_hold` تصفّر `amount` فيفقد الدفتر مبلغ الاسترداد | `0001_init.sql` (`release_hold`) | التسوية اليومية (§15) تحتاج المبلغ. بديل: إبقاء الحجز وإدراج صف `refund` موجب مقابله — تغيير تصميمي يمس الاختبارات، يُقرَّر في ADR | قبل `billing-webhook` |
| B5 | السجلات/metadata: الـwebhook يسجّل `result.error` كما هو؛ `metadata.error_detail` مقروء للمستخدم عبر RLS ويحوي `term=` ومسارات zod | `provider-webhook/index.ts`، `generate-media/index.ts` (`markFailed`) | قصّ/تعقيم قبل التسجيل، أو نقل `error_detail` إلى جدول إداري | مع لوحة الإدارة (§11) |
| B6 | الـbucket `media` عام للقراءة بينما الباقات المدفوعة "خاص" | `0002_phase1_engine.sql`، ADR 0003 | متسق مع المخطط للمرحلة 1 (الحماية بعدم قابلية تخمين UUID)؛ يُوثَّق صراحة في ADR، ويُراجع مع الانتقال إلى R2 (روابط موقّعة للخاص) | نقل DNS/R2 |
| ~~B7~~ | منجز في 0006 (2026-10-24): pg_cron كل 5 دقائق → `invoke_reconcile()` → pg_net → وظيفة `reconcile`، والسر من Vault. أول 38 تشغيلًا ناجحة (HTTP 200) | | | |
| B8 | `supports.aspect_ratios` في seed (ما تعرضه الواجهة) و`input_schema.aspect_ratio.enum` (ما يقبله السيرفر) مصدران لنفس القائمة | `supabase/seed.sql` | اشتق قائمة الواجهة من `input_schema` مباشرة في `apps/web/src/lib/models.ts` لتختفي الازدواجية | عند إضافة نموذج |
| ~~B9~~ | منجز في 0005 + وظيفة `reconcile` (تسأل المزوّد، مهل حسب النوع، سقف صلب) — 2026-10-23 | | | |
| B13 | تدرّج الطرح: `models.rollout_pct` موجود (المخطط §15) لكن لا يُفرض — كل نموذج مفعّل يظهر للجميع | `apps/web/src/lib/models.ts`, `generate-core.ts` | hash(user_id) % 100 < rollout_pct في الواجهة والنواة معًا | قبل النموذج الثالث |
| B14 | مصغّر الفيديو يُلتقط في متصفح المالك عند أول عرض؛ لا مصغّر قبل ذلك (المعرض العام/API يرون `thumbnail_url=null`) | `_shared/finalize.ts`, `asset-thumbnail` | مع R2: Cloudflare Stream أو ffmpeg في Worker لالتقاط إطار عند الاكتمال | نقل DNS/R2 |
| ~~B15~~ | منجز في 0006 (2026-10-24): pg_cron كل 5 دقائق → `invoke_reconcile()` → pg_net → وظيفة `reconcile`، والسر من Vault. أول 38 تشغيلًا ناجحة (HTTP 200) | | | |
| B10 | إعادة إرسال webhook العميل الفاشلة (ADR 0004): الآن 3 محاولات خلال 8 ثوانٍ فقط ثم تُسجَّل فاشلة | `_shared/client-webhook.ts` + `cron-renewals` | تسليم موثوق لعملاء n8n/سلة؛ إعادة بتراجع أسّي حتى 24 ساعة من `api_webhook_deliveries` | مع `cron-renewals` |
| B11 | عرض الاستخدام اليومي وسجل التسليم في صفحة الحساب (`api_daily_usage`, `api_webhook_deliveries` مقروءان للمالك عبر RLS) | `apps/web/src/app/AccountPage.tsx` | الجداول جاهزة؛ ينقص العرض فقط | مع لوحة الحساب الكاملة (§8 البند 8) |
| B12 | إعادة إرسال webhook العميل لأصل API يفشل متزامنًا في `v1` (الآن الرد نفسه يحمل الخطأ ولا يُرسل حدث `asset.failed`) | `supabase/functions/v1/index.ts` | اتساق: كل حالة نهائية = حدث | عند طلب أول عميل |
| B13 | رفع المراجع في الواجهة (Uppy + رابط موقّع) — يفتح `i2v`/`edit`/`ref2v` (عشرات النماذج المفعّلة للـAPI فقط) لمستخدمي الواجهة | صفحة الصور والفيديو، Edge Function `upload-url` | أكبر قيمة محجوزة في الكتالوج بعد ADR 0005 | التالي بعد بوابة 2 |
| B14 | مدخلات فيديو/صوت في عقد `generate` (`video_url`, `audio_url`) + نوع `audio` في `copyFromUrl` — يفتح الطبقة b (motion، lipsync، avatar، TTS، upscale فيديو، Ad Multiplier) | `request.ts`, `inputs.ts`, `storage.ts`, `provider-webhook` | 66 نموذجًا مزروعًا معطّلًا ينتظرها | المرحلة 2 |
| B15 | `sweep-processing`: سؤال fal عن الطلبات الطويلة عبر `status_url` قبل أن تعتبرها `reconcile_holds` فاشلة بعد 30 دقيقة (Seedance 30 ث وKling 4 يأخذان دقائق) | وظيفة جديدة + `cron-renewals` | الفيديو الطويل قد ينجح متأخرًا؛ الاسترداد المبكر يخسر تكلفة المزوّد | مع أول نماذج الفيديو الطويلة |
| B16 | فتح 4K (`kling-v3-4k`، Veo `4k`) بعد الانتقال إلى R2 ورفع حد 50MB؛ وإزالة الاستبعاد في `build-models-seed.py` | `storage.ts`, migration bucket, السكربت | ADR 0005 القرار 5 | نقل DNS/R2 |
| B17 | مراقبة أسعار fal: تشغيل `fal-catalog.py` أسبوعيًا ومقارنة `pricing_text` لكل نموذج مفعّل بما في `pricing/`؛ تنبيه عند التغيّر (fal يكتب "subject to change") | سكربت + GitHub Action | هامش ×3 يتآكل بصمت إن ارتفع سعر مزوّد | قبل الإطلاق العام |
| B18 | النموذج "تلقائي" (`auto-image`/`auto-video`) + `prompt-enhancer` عربي→إنجليزي | `generate-core` (مزوّد داخلي يختار صفًا حقيقيًا)، Edge Function | الحركة 1 في `docs/competitive/beat-higgsfield-halai.md` | بعد بوابة 2 |
| B19 | **عناصري بالاسم (Elements)**: جدول `elements` (اسم، نوع: منتج/شخصية/مكان، صور) + منشن `@اسم` في البرومبت باقتراح تلقائي، والسيرفر يحوّله إلى `images[]` بالترتيب ويكتب الربط في البرومبت | migration + `generate-core` + الواجهة | أول شكوى من عملاء هلاي (المنشن بالترتيب فقط، لا Elements) — §7 في beat-higgsfield-halai.md | بعد B13 |
| B20 | تحويل المراجع عند الرفع: HEIC → JPEG، ≤ 2048px، حذف EXIF، معاينة؛ الحجم المعروف يفتح نماذج التعديل المسعّرة بالميغابكسل | Edge Function `upload-url` + الواجهة | «موضوع الصور هو المتعب» | مع B13 |
| B21 | زر «كمّل على هذا» على بطاقة الأصل: نفس النموذج والإعدادات والنتيجة مرجعًا/إطارًا أول (أو `extend-video`) | `AssetCard` + صفحات التوليد | عملاء هلاي يبون يكملون على نتيجة ناجحة | بعد B13 |
| B22 | **قرار تسعير**: هامش متدرّج بدل ×3 الموحّد (الفيديو وNano Banana Pro أغلى من Higgsfield 2–7 مرات) | `packages/shared/pricing.ts` + `build-models-seed.py` + اختبارات | شكوى فرق الكريدت؛ الجدول في §7 | قرار نهى أولًا |
| ~~B23~~ | منجز في 0006 (2026-10-24): pg_cron كل 5 دقائق → `invoke_reconcile()` → pg_net → وظيفة `reconcile`، والسر من Vault. أول 38 تشغيلًا ناجحة (HTTP 200) | | | |
| B24 | رسوم المراجع الإضافية: `gpt-image-2.5-*-edit` (~0.008$ لكل مرجع حتى 14)، `grok-*-edit/i2v` (+0.01$ لكل صورة)، `hailuo-h3-ref` (+0.08$ لكل مرجع بعد الخامس) — السعر الحالي لا يحسبها (الهامش ينزل لكن بلا خسارة) | `build-models-seed.py` (`per_ref_usd` في ملف السعر) + `modelCredits(images)` + اختبار | ×3 على كل عملية | مع B13 (الواجهة لا ترسل مراجع بعد؛ API فقط) |
| B25 | دعم SVG (نماذج vector الأربعة معطّلة): `image/svg+xml` في `storage.ts` مع تعقيم (لا سكربت/روابط خارجية) أو تقديمه تنزيلًا فقط | `storage.ts`، `build-models-seed.py` | XSS عبر SVG مستضاف على نطاقنا | عند طلب عميل |
| B26 | نواتج > 50MB (30 ث 1080p نادرًا) تُرفض الآن نهائيًا (failed + استرداد) ونخسر تكلفة المزوّد: رفع `file_size_limit` للـbucket أو R2 (B16) | migration bucket / `storage.ts` | خسارة نادرة لكنها حقيقية | مع B16 |
| B27 | انتهاء مهلة الإرسال (30 ث) بعد أن قبلت fal الطلب = استرداد ونحن ندفع: مفتاح idempotency عند المزوّد أو سؤال fal بالـ`gateway_request_id` | `providers/fal.ts`, `generate-core.ts` | خطر 6 في المراجعة المستقلة (الجزء المتبقي) | عند أول حادثة |
| B28 | تحقق إضافي في webhook fal: `X-Fal-Webhook-User-Id` = حسابنا، وترويسة request id = `request_id` في الجسم | `providers/fal.ts` | دفاع إضافي (معرّفات الطلب غير قابلة للتخمين اليوم) | لاحقًا |
| B29 | معرض العرض: توليده (`scripts/make-showcase.ts`) ثم نقله إلى Cloudflare Stream/R2 مع B16 (الآن Supabase Storage تحت `media/showcase/`)، وملصق (poster) صغير لكل فيديو بدل `#t=0.1` | `scripts/make-showcase.ts`, `storage.ts` | أول تحميل أخف على الجوال | مع R2 |

## ما يجب تذكّره عند لمس هذه الملفات
- أي تعديل على الرصيد أو السياسات: اختبار SQL أولًا في `supabase/tests/credits.test.sql` (يعمل على القاعدة السحابية داخل معاملة تُلغى وفي CI).
- محاكاة طلب الواجهة في اختبارات SQL: `set local role authenticated` + `set_config('request.jwt.claims', '{"role":"authenticated","sub":"<uuid>"}', true)` — لا `request.jwt.claim.*` (قديم ولا يضبطه PostgREST ≥ 9).
