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
| B7 | `cron-renewals` يستدعي `reconcile_holds()` دوريًا (كل 5 دقائق أو يوميًا مع التجديد) بدل الاستدعاء اليدوي | وظيفة جديدة + `pg_cron` أو Supabase Cron | الدالة موجودة في 0003 ومختبرة (T11)؛ ينقصها المجدول | مع المرحلة 1 المتبقية |
| B8 | `supports.aspect_ratios` في seed (ما تعرضه الواجهة) و`input_schema.aspect_ratio.enum` (ما يقبله السيرفر) مصدران لنفس القائمة | `supabase/seed.sql` | اشتق قائمة الواجهة من `input_schema` مباشرة في `apps/web/src/lib/models.ts` لتختفي الازدواجية | عند إضافة نموذج |
| ~~B9~~ | منجز في 0005 + وظيفة `reconcile` (تسأل المزوّد، مهل حسب النوع، سقف صلب) — 2026-10-23 | | | |
| B13 | تدرّج الطرح: `models.rollout_pct` موجود (المخطط §15) لكن لا يُفرض — كل نموذج مفعّل يظهر للجميع | `apps/web/src/lib/models.ts`, `generate-core.ts` | hash(user_id) % 100 < rollout_pct في الواجهة والنواة معًا | قبل النموذج الثالث |
| B14 | مصغّر الفيديو يُلتقط في متصفح المالك عند أول عرض؛ لا مصغّر قبل ذلك (المعرض العام/API يرون `thumbnail_url=null`) | `_shared/finalize.ts`, `asset-thumbnail` | مع R2: Cloudflare Stream أو ffmpeg في Worker لالتقاط إطار عند الاكتمال | نقل DNS/R2 |
| B15 | مجدول لوظيفة `reconcile` (كل 5 دقائق) — الآن يدوي أو عبر سكربت الدخان | `cron-renewals` / pg_cron + pg_net | شبكة الأمان لا تعمل تلقائيًا بدونه | مع `cron-renewals` |
| B10 | إعادة إرسال webhook العميل الفاشلة (ADR 0004): الآن 3 محاولات خلال 8 ثوانٍ فقط ثم تُسجَّل فاشلة | `_shared/client-webhook.ts` + `cron-renewals` | تسليم موثوق لعملاء n8n/سلة؛ إعادة بتراجع أسّي حتى 24 ساعة من `api_webhook_deliveries` | مع `cron-renewals` |
| B11 | عرض الاستخدام اليومي وسجل التسليم في صفحة الحساب (`api_daily_usage`, `api_webhook_deliveries` مقروءان للمالك عبر RLS) | `apps/web/src/app/AccountPage.tsx` | الجداول جاهزة؛ ينقص العرض فقط | مع لوحة الحساب الكاملة (§8 البند 8) |
| B12 | إعادة إرسال webhook العميل لأصل API يفشل متزامنًا في `v1` (الآن الرد نفسه يحمل الخطأ ولا يُرسل حدث `asset.failed`) | `supabase/functions/v1/index.ts` | اتساق: كل حالة نهائية = حدث | عند طلب أول عميل |

## ما يجب تذكّره عند لمس هذه الملفات
- أي تعديل على الرصيد أو السياسات: اختبار SQL أولًا في `supabase/tests/credits.test.sql` (يعمل على القاعدة السحابية داخل معاملة تُلغى وفي CI).
- محاكاة طلب الواجهة في اختبارات SQL: `set local role authenticated` + `set_config('request.jwt.claims', '{"role":"authenticated","sub":"<uuid>"}', true)` — لا `request.jwt.claim.*` (قديم ولا يضبطه PostgREST ≥ 9).
