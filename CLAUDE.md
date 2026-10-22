# Highlink Studio (codename: Rawnaq) — استوديو توليد عربي (صور + فيديو) بنظام رصيد

المخطط الكامل في `docs/blueprint.md` — اقرأه قبل أي مهمة تلمس أكثر من ملفين. الأرقام بين قوسين (§4، §15…) تشير لأقسامه.

## الستاك
- واجهة: Vite + React 19 + TypeScript (strict) + Tailwind v4 + مكوّنات على نمط shadcn في `apps/web`. RTL أولًا (`dir="rtl"`). لا Next.js.
- باك إند: Supabase (Auth, Postgres + RLS, Realtime, Edge Functions بـDeno). لا سيرفر آخر.
- ميديا: خلف محوّل واحد `supabase/functions/_shared/storage.ts` (`put`, `publicUrl`). المرحلة 1: Supabase Storage (bucket `media`). بعد نقل DNS إلى Cloudflare: R2 عبر `media.highlink.tech` — تبديل الملف الواحد فقط (ADR 0002).
- نماذج: Replicate (أساسي لكل شيء بما فيه نانو بنانا برو `google/nano-banana-pro` — ADR 0003)، Gemini مباشرة لاحقًا إن لزم، fal (احتياط). المفاتيح في Edge Functions فقط — لا مفتاح سري في `VITE_*`. مخطط مدخلات كل نموذج في `models.input_schema` يبني مدخلات المزوّد (`_shared/inputs.ts`) — لا كود لكل نموذج.
- دفع: خلف محوّل واحد `_shared/payments/` — Paylink أولًا (صفحة دفع مستضافة + webhook + استعلام)، وMoyasar عند تفعيله (حفظ البطاقة + التجديد التلقائي). العملة ريال. التسعير في `packages/shared/pricing.ts` والباقات في `packages/shared/plans.ts` (المصدران الوحيدان).
- التوزيع: API عامة `v1` (وظيفة `v1` بلا JWT، مفاتيح `api_keys` بـsha256، نفس نواة `generate-media` — ADR 0004)، وسيرفر MCP في المرحلة 2 (ADR 0002). أي مسار جديد في الـAPI يمر بـ`_shared/api-auth.ts` ويرجع `{ error: { code, message } }`.
- البراند: هاي لينك — الألوان والخطوط معتمدة من موقع هاي لينك وموثقة في `docs/brand/palette.md`، وتُكتب في `apps/web/src/styles/tokens.css` فقط (كحلي `#0B1020`، أزرق `#7FB8FF`، خطوط Alexandria + IBM Plex Sans Arabic). الاسم الظاهر للمستخدم: "استوديو هاي لينك".

## قواعد لا تُكسر
1. التوليد دائمًا: الواجهة تدرج صف `assets` (status=queued) → `functions.invoke('generate-media')` → Realtime. ممنوع polling، ممنوع استدعاء أي مزوّد من الواجهة.
2. الرصيد يُكتب فقط عبر `credit_ledger` من Edge Functions (service_role) بدوال `hold_credits / confirm_hold / release_hold / grant_credits`. الواجهة تقرأ `get_balance()` فقط. `hold_credits` idempotent على `assetId` (فهرس فريد للحجز النشط — migration 0002)، والتأكيد/التحرير يتمان بالأصل عبر `_shared/credits.ts`.
3. كل جدول جديد = migration + RLS في نفس الملف. لا جدول بدون RLS. أي تغيير في المخطط عبر `supabase db diff`، ويُختبر محليًا قبل `db push`.
4. النصوص من `apps/web/src/i18n/ar.json` و`en.json`. لا نص عربي مكتوب داخل JSX.
5. Tailwind بالخصائص المنطقية (`ps/pe/ms/me/start/end`). ممنوع `ml/mr/left/right` إلا للأيقونات المتماثلة.
6. استوديو جديد = ملف `content/studios/<id>.json` + سطر في `supabase/seed.sql`. لا صفحة جديدة إلا إذا خرج عن `StudioWizard`.
7. نموذج جديد = سطر في `supabase/seed.sql` (جدول `models`) بتكلفة من `creditsForUsd()` — ceil(سعر المزوّد بالدولار × 3 ÷ 0.042) — ومخطط مدخلاته من المزوّد في `input_schema`.
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
- حجز عالق؟ `select * from public.reconcile_holds();` عبر `db query --linked` (يحرّر/يؤكد ما هو أقدم من 30 دقيقة). بوابة 1 آليًا بعد أي نشر: `python -I scripts/smoke-gate1.py`.
- الأسرار: `supabase/.env.local` (لا يُقرأ ولا يُطبع) → `python -I scripts/push-secrets.py <tmp>` (يتخطى `SUPABASE_*` والفارغة، يجلب `REPLICATE_WEBHOOK_SECRET`) → `npx supabase secrets set --env-file <tmp>` → حذف tmp. الواجهة: `apps/web/.env.local`.
- مفاتيح Supabase الجديدة (`sb_secret_…`/`sb_publishable_…`) ليست JWT: في السكربتات تُرسل كـ`apikey` فقط (Auth Admin API يرفضها في `Authorization: Bearer`).
- لا Deno محليًا: الوحدات النقية في `_shared/` تُختبر بـvitest، والباقي يُتحقق عند النشر وبالفحص الدخاني بـcurl على الرابط السحابي.

## حالة المشروع
- المرحلة 0 منجزة: هيكل، تصميم، i18n، دخول، migration 0001 (مختبرة على Postgres 16: التسجيل، الحجز/التأكيد/الاسترداد، RLS)، seed، المركز القانوني، صفحة الباقات، وصفة `product-shot`، هيكل `generate-media` (يرفض 501).
- المرحلة 1 (2026-10-22): (1) migrations 0001+0002 وseed مطبّقة على `highlink-studio-dev` والأنواع مولّدة ✓ (2) `_shared/` + `generate-media` بالخطوات التسع + `provider-webhook` موقّع مع dedupe، منشورتان، الأسرار مرفوعة ✓ (3) `/image-generate` و`/library` بـRealtime ✓. **بوابة 1 مجتازة (2026-10-22)**: توليدة حقيقية ظهرت في الواجهة عبر Realtime بلا تحديث، الرصيد نزل 30 → 19 (صف `charge` −11)، وفشل حقيقي من المزوّد (402 قبل شحن Replicate) أعاد الرصيد وعرض رسالة عربية. النماذج الأربعة الأخرى `enabled=false` حتى تُبنى.
- المراجعة المستقلة (2026-10-22، الجلسة 4) منجزة: migration `0003_review_hardening` (حارس الأعمدة بـ`auth.role()`، سياسة INSERT، `get_balance` للمالك، `reconcile_holds()`) + حجز الأصل الذرّي في `generate-media` + تسوية الحجز في الـwebhook + zod/مهلات. ما بقي في `docs/backlog.md`.
- API v1 منجزة (2026-10-22، ADR 0004): وظيفة `v1` (`/functions/v1/v1/{generate|assets/{id}|models|balance}`) بمفاتيح `hl_live_`/`hl_test_`، migration 0004، نواة مشتركة `_shared/generate-core.ts`، webhook موقّع للعميل، صفحة `/account`. مفتاح الاختبار = تجربة جافة بلا مزوّد ولا خصم.
- التالي بالترتيب: (4) Kling عبر Replicate → (6) سيرفر MCP (المرحلة 2). لا تُبنى خطوة قبل اجتياز سابقتها.
- خارج النطاق حتى الآن: مجدول `reconcile_holds()` (مع `cron-renewals`) ومسح `processing` بسؤال المزوّد، المصنّف الآلي للأمان، `prompt-enhancer`، رفع المراجع، بوابة المخرجات الكاملة.
- الدليل التشغيلي لجلسات Claude Code: `docs/claude-code-kickoff.md`.

## عند التردد
اقرأ `docs/blueprint.md`. إذا خالفته اكتب ADR قصيرًا في `docs/decisions/` قبل الكود.
