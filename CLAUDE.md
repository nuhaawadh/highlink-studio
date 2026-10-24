# Highlink Studio (codename: Rawnaq) — استوديو توليد عربي (صور + فيديو) بنظام رصيد

المخطط الكامل في `docs/blueprint.md` — اقرأه قبل أي مهمة تلمس أكثر من ملفين. الأرقام بين قوسين (§4، §15…) تشير لأقسامه.

## الستاك
- واجهة: Vite + React 19 + TypeScript (strict) + Tailwind v4 + مكوّنات على نمط shadcn في `apps/web`. RTL أولًا (`dir="rtl"`). لا Next.js.
- باك إند: Supabase (Auth, Postgres + RLS, Realtime, Edge Functions بـDeno). لا سيرفر آخر.
- ميديا: خلف محوّل واحد `supabase/functions/_shared/storage.ts` (`put`, `publicUrl`). المرحلة 1: Supabase Storage (bucket `media`). بعد نقل DNS إلى Cloudflare: R2 عبر `media.highlink.tech` — تبديل الملف الواحد فقط (ADR 0002).
- نماذج: **fal أساسي للكتالوج كله** (ADR 0005 — 233 نقطة نهاية في `content/catalog/fal-launch.json`)، Replicate لنانو بنانا برو فقط (ADR 0003)، Gemini مباشرة لاحقًا إن لزم. المفاتيح (`FAL_KEY`, `REPLICATE_API_TOKEN`) في Edge Functions فقط — لا مفتاح سري في `VITE_*`. مخطط مدخلات كل نموذج في `models.input_schema` يبني مدخلات المزوّد (`_shared/inputs.ts`) — لا كود لكل نموذج. التسعير بدالة واحدة `modelCredits` (صور بالدقة، فيديو بالثانية/بالمقطع).
- دفع: خلف محوّل واحد `_shared/payments/` — Paylink أولًا (صفحة دفع مستضافة + webhook + استعلام)، وMoyasar عند تفعيله (حفظ البطاقة + التجديد التلقائي). العملة ريال. التسعير في `packages/shared/pricing.ts` والباقات في `packages/shared/plans.ts` (المصدران الوحيدان).
- التوزيع: API عامة `v1` (وظيفة `v1` بلا JWT، مفاتيح `api_keys` بـsha256، نفس نواة `generate-media` — ADR 0004)، وسيرفر MCP في المرحلة 2 (ADR 0002). أي مسار جديد في الـAPI يمر بـ`_shared/api-auth.ts` ويرجع `{ error: { code, message } }`، ويُوثَّق في `docs/api.md` (دليل العميل: curl + n8n لكل مسار) في نفس الالتزام.
- البراند: هاي لينك — **دليل الهوية V1** (`docs/brand/highlink-brand-guide.pdf`، المطابقة في `docs/brand/palette.md`) وتُكتب القيم في `apps/web/src/styles/tokens.css` فقط: أبيض `#FFFFFF` وأسود `#0A0A0A` في الأساس، الليموني `#D0F94A` مرة وحدة في الشاشة (زر `variant="lime"` للإجراء الرئيسي فقط، والنص عليه أسود)، التدرّج `#4EA5A3→#6EDA8E→#D8F869` على كلمة وحدة في العنوان (`.text-brand-gradient`)، زوايا حادة (radius 0) بلا ظلال، خط Tajawal وIBM Plex Mono لأسماء الأدوات، والأرقام بالإنجليزي. الشعار ملفات أصلية في `apps/web/public/brand/` — لا يُكتب بخط عادي. النبرة: لهجة سعودية بسيطة، بلا تعجب ولا إيموجي ولا (حصري/ثورة/حلول متكاملة). الاسم الظاهر للمستخدم: "استوديو هاي لينك".

## قواعد لا تُكسر
1. التوليد دائمًا: الواجهة تدرج صف `assets` (status=queued) → `functions.invoke('generate-media')` → Realtime. ممنوع polling، ممنوع استدعاء أي مزوّد من الواجهة.
2. الرصيد يُكتب فقط عبر `credit_ledger` من Edge Functions (service_role) بدوال `hold_credits / confirm_hold / release_hold / grant_credits`. الواجهة تقرأ `get_balance()` فقط. `hold_credits` idempotent على `assetId` (فهرس فريد للحجز النشط — migration 0002)، والتأكيد/التحرير يتمان بالأصل عبر `_shared/credits.ts`.
3. كل جدول جديد = migration + RLS في نفس الملف. لا جدول بدون RLS. أي تغيير في المخطط عبر `supabase db diff`، ويُختبر محليًا قبل `db push`.
4. النصوص من `apps/web/src/i18n/ar.json` و`en.json`. لا نص عربي مكتوب داخل JSX.
5. Tailwind بالخصائص المنطقية (`ps/pe/ms/me/start/end`). ممنوع `ml/mr/left/right` إلا للأيقونات المتماثلة.
6. استوديو جديد = ملف `content/studios/<id>.json` + سطر في `supabase/seed.sql`. لا صفحة جديدة إلا إذا خرج عن `StudioWizard`.
7. نموذج جديد = سطر في `content/catalog/fal-launch.json` + مخططه (`python -I scripts/fal-schema.py <endpoint>`) + ملف سعره الرسمي في `content/catalog/pricing/` ثم `python -I scripts/build-models-seed.py` يكتب صفه في الكتلة المولّدة داخل `supabase/seed.sql` بتكلفة ceil(سعر المزوّد بالدولار × 3 ÷ 0.042) (ADR 0005). لا تحرّر الكتلة المولّدة يدويًا. نموذج من غير fal = صف يدوي فوق الكتلة بنفس القاعدة. الفيديو: `cost_per_second` بالرصيد/ث، أو جدول كامل `supports.video_cost_per_second` بمفاتيح `"<دقة>"` و`"<دقة>+audio"` (Kling عبر Replicate) — `modelCredits` تقرؤه، ولا كود لكل نموذج.
8. لا تحذف أصول المستخدمين أو سجلات الرصيد أبدًا في migration. الحذف منطقي (`deleted_at`).
9. أي منطق يلمس المال (رصيد، تسعير، دفع) يبدأ باختبار vitest/SQL قبل الكود، ويُراجَع من جلسة Claude Code ثانية قبل الدمج.
10. كل Edge Function تتحقق من مدخلاتها بـzod وترجع رموز الأخطاء في `packages/shared/types.ts` (`GenerateErrorCode`) ورسائل عربية.

## الأوامر
- `npm run dev` ← الواجهة على localhost:5173 (من الجذر؛ يوجّه إلى apps/web)
- `npm run typecheck` / `npm test` / `npm run build` ← يجب أن تنجح كلها قبل أي commit
- بدون Docker (الوضع الافتراضي): نشتغل على مشروع Supabase السحابي `highlink-studio-dev` (منطقة باريس `eu-west-3`) المرتبط بـ`supabase link`. `supabase db push` يطبّق migrations، ثم seed عبر `npx supabase db query --linked -f supabase/seed.sql` (أو SQL Editor). `supabase functions deploy <name>` للنشر، والاختبار بـcurl على الرابط السحابي.
- مع Docker (اختياري): `supabase start` ← Postgres + Functions محليًا؛ `supabase db reset` يطبّق migrations + seed؛ `supabase functions serve generate-media --env-file supabase/.env.local`.
- `supabase db push` / `functions deploy` / `secrets set` ← تحتاج تأكيدًا مني دائمًا (settings.json). النشر: `generate-media` بـJWT، و`provider-webhook` و`v1` بـ`--no-verify-jwt`.
- `npm run gen:types` ← `supabase gen types typescript --linked > packages/shared/db.ts`
- اختبارات الرصيد على القاعدة البعيدة (تُلغى دائمًا): `npx supabase db query --linked -f supabase/tests/credits.test.sql` ← `ALL CREDIT TESTS PASSED`، و`-f supabase/tests/api.test.sql` ← `ALL API TESTS PASSED`. لاختبار migration جديدة قبل `db push`: ملف مؤقت = `begin;` + الـmigration + ملف الاختبار (ينتهي بـ`rollback`) ويُشغَّل بنفس الأمر.
- محاكاة طلب الواجهة في SQL: `set local role authenticated` + `set_config('request.jwt.claims', '{"role":"authenticated","sub":"<uuid>"}', true)`. ممنوع `request.jwt.claim.*` (قديم، لا يضبطه PostgREST ≥ 9).
- حجز عالق؟ استدعِ وظيفة `reconcile` بـ`curl -X POST <SUPABASE_URL>/functions/v1/reconcile -H "Authorization: Bearer $RECONCILE_SECRET"` (تسأل المزوّد قبل الاسترداد؛ المهل: صورة 30 د، فيديو 120 د). بوابة 1 آليًا بعد أي نشر: `python -I scripts/smoke-gate1.py` (تشمل فيديو Kling؛ تستغرق دقائق).
- النشر الكامل: `generate-media` و`asset-thumbnail` بـJWT؛ `provider-webhook` و`v1` و`reconcile` بـ`--no-verify-jwt`.
- الأسرار: `supabase/.env.local` (لا يُقرأ ولا يُطبع) → `python -I scripts/push-secrets.py <tmp>` (يتخطى `SUPABASE_*` والفارغة، يجلب `REPLICATE_WEBHOOK_SECRET`) → `npx supabase secrets set --env-file <tmp>` → حذف tmp. الواجهة: `apps/web/.env.local`.
- مفاتيح Supabase الجديدة (`sb_secret_…`/`sb_publishable_…`) ليست JWT: في السكربتات تُرسل كـ`apikey` فقط (Auth Admin API يرفضها في `Authorization: Bearer`).
- لا Deno محليًا: الوحدات النقية في `_shared/` تُختبر بـvitest، و`npm run typecheck:functions` يتحقق من أنواع كل Edge Functions بـtsc عبر بديل أنواع Deno في `scripts/denocheck/` (يُشغَّل مع `typecheck` قبل أي commit)، والباقي يُتحقق عند النشر وبالفحص الدخاني بـcurl على الرابط السحابي.

## حالة المشروع
- المرحلة 0 منجزة: هيكل، تصميم، i18n، دخول، migration 0001 (مختبرة على Postgres 16: التسجيل، الحجز/التأكيد/الاسترداد، RLS)، seed، المركز القانوني، صفحة الباقات، وصفة `product-shot`، هيكل `generate-media` (يرفض 501).
- المرحلة 1 (2026-10-22): (1) migrations 0001+0002 وseed مطبّقة على `highlink-studio-dev` والأنواع مولّدة ✓ (2) `_shared/` + `generate-media` بالخطوات التسع + `provider-webhook` موقّع مع dedupe، منشورتان، الأسرار مرفوعة ✓ (3) `/image-generate` و`/library` بـRealtime ✓. **بوابة 1 مجتازة (2026-10-22)**: توليدة حقيقية ظهرت في الواجهة عبر Realtime بلا تحديث، الرصيد نزل 30 → 19 (صف `charge` −11)، وفشل حقيقي من المزوّد (402 قبل شحن Replicate) أعاد الرصيد وعرض رسالة عربية. النماذج الأربعة الأخرى `enabled=false` حتى تُبنى.
- المراجعة المستقلة (2026-10-22، الجلسة 4) منجزة: migration `0003_review_hardening` (حارس الأعمدة بـ`auth.role()`، سياسة INSERT، `get_balance` للمالك، `reconcile_holds()`) + حجز الأصل الذرّي في `generate-media` + تسوية الحجز في الـwebhook + zod/مهلات. ما بقي في `docs/backlog.md`.
- API v1 منجزة (2026-10-22، ADR 0004): وظيفة `v1` (`/functions/v1/v1/{generate|assets/{id}|models|balance}`) بمفاتيح `hl_live_`/`hl_test_`، migration 0004، نواة مشتركة `_shared/generate-core.ts`، webhook موقّع للعميل، صفحة `/account`. مفتاح الاختبار = تجربة جافة بلا مزوّد ولا خصم.
- الفيديو (2026-10-23): Kling 3 عبر Replicate (`kling-v3-turbo`، 12 رصيد/ث، جدول `supports.video_cost_per_second`) — اجتاز بوابة الفيديو على السحابة، ثم **عُطّل عند دمج كتالوج fal (2026-10-24)** لأن Kling 3 من fal بنصف السعر، `/video-generate` حقيقية، المصغّر يُلتقط في الواجهة عبر `asset-thumbnail`. migration 0005: `claim_and_hold` (حد التزامن + حجز الأصل + حجز الرصيد ذريًا) و`reconcile_holds` بمهلة حسب النوع، ووظيفة `reconcile` تسأل المزوّد قبل الاسترداد.
- كتالوج fal (2026-10-23، ADR 0005): محوّل `fal` بتوقيع ED25519 + `source=fal` في الـwebhook ✓، `inputs.ts` يغطي أسماء fal (image_url/image_urls، duration نصية/رقمية، image_size، generate_audio، الحقول المطلوبة بافتراضها) ✓، `modelCredits` للفيديو بالثانية/بالمقطع في نسختي التسعير ✓، المحرك يقبل `video` ويرفض نماذج المراجع بلا `images` ✓، صفحة `/video-generate` ومنتقي بالعائلات ✓، `GET /v1/models` يعرض المدد/الدقات/التكاليف ✓. الكتالوج: 233 نقطة نهاية بمخططاتها وأسعارها الرسمية في `content/catalog/{schemas,pricing}/`، والكتلة المولّدة في `seed.sql` (**137 مفعّلًا**: 63 صورة، 74 فيديو، 27 عائلة) + `content/catalog/models.generated.json` يحرسه `_shared/catalog.test.ts`. محوّل fal يدعم `getJob` (حالة الطابور ثم النتيجة) لوظيفة `reconcile`. **دُمج مع main (0005، finalize، reconcile) في 2026-10-24؛ لم يُنشر بعد ولم تُجتز بوابة 2** — انظر ADR 0005 (الأثر).
- القوالب السعودية (2026-10-23): 38 قالبًا في `content/templates/saudi.json` بمستويات جودة (لا أسماء نماذج)، `/templates` و`/templates/:id`، دوال `packages/shared/templates.ts`، وحارس `templates.catalog.test.ts`. قالب جديد = كائن في الملف نفسه؛ الحارس يرفض أي نموذج أو خيار غير مدعوم.
- التالي بالترتيب: (4) نشر `provider-webhook` + `generate-media` + `v1` + `reconcile` + `asset-thumbnail` ورفع `FAL_KEY` ثم seed → بوابة 2 (توليدة فيديو حقيقية عبر Realtime بأرخص نموذج) → (5) رفع المراجع في الواجهة (يفتح i2v/edit) → (6) سيرفر MCP (المرحلة 2). لا تُبنى خطوة قبل اجتياز سابقتها.
- خارج النطاق حتى الآن: مجدول يستدعي `reconcile` دوريًا (مع `cron-renewals`)، المصنّف الآلي للأمان، `prompt-enhancer`، رفع المراجع (B13 — نقطة البداية: منتقي «صورة البداية» من صورك الأخيرة أو رابط https في صفحة الفيديو على main، e915e0e)، بوابة المخرجات الكاملة، تدرّج الطرح (`rollout_pct` موجود ولا يُفرض).
- الدليل التشغيلي لجلسات Claude Code: `docs/claude-code-kickoff.md`.

## عند التردد
اقرأ `docs/blueprint.md`. إذا خالفته اكتب ADR قصيرًا في `docs/decisions/` قبل الكود.
