# Highlink Studio (codename: Rawnaq) — استوديو توليد عربي (صور + فيديو) بنظام رصيد

المخطط الكامل في `docs/blueprint.md` — اقرأه قبل أي مهمة تلمس أكثر من ملفين. الأرقام بين قوسين (§4، §15…) تشير لأقسامه.

## الستاك
- واجهة: Vite + React 19 + TypeScript (strict) + Tailwind v4 + مكوّنات على نمط shadcn في `apps/web`. RTL أولًا (`dir="rtl"`). لا Next.js.
- باك إند: Supabase (Auth, Postgres + RLS, Realtime, Edge Functions بـDeno). لا سيرفر آخر.
- ميديا: خلف محوّل واحد `supabase/functions/_shared/storage.ts` (`put`, `publicUrl`). المرحلة 1: Supabase Storage (bucket `media`). بعد نقل DNS إلى Cloudflare: R2 عبر `media.highlink.tech` — تبديل الملف الواحد فقط (ADR 0002).
- نماذج: Replicate (أساسي)، Gemini (صور)، fal (احتياط). المفاتيح في Edge Functions فقط — لا مفتاح سري في `VITE_*`.
- دفع: خلف محوّل واحد `_shared/payments/` — Paylink أولًا (صفحة دفع مستضافة + webhook + استعلام)، وMoyasar عند تفعيله (حفظ البطاقة + التجديد التلقائي). العملة ريال. التسعير في `packages/shared/pricing.ts` والباقات في `packages/shared/plans.ts` (المصدران الوحيدان).
- التوزيع: API عامة `v1` تُبنى مباشرة بعد بوابة 1 (نفس `generate-media` + جدول `api_keys`)، وسيرفر MCP في المرحلة 2 (ADR 0002).
- البراند: هاي لينك — الألوان والخطوط من `docs/brand/` تُكتب في `apps/web/src/styles/tokens.css` فقط. الاسم الظاهر للمستخدم: "استوديو هاي لينك".

## قواعد لا تُكسر
1. التوليد دائمًا: الواجهة تدرج صف `assets` (status=queued) → `functions.invoke('generate-media')` → Realtime. ممنوع polling، ممنوع استدعاء أي مزوّد من الواجهة.
2. الرصيد يُكتب فقط عبر `credit_ledger` من Edge Functions (service_role) بدوال `hold_credits / confirm_hold / release_hold / grant_credits`. الواجهة تقرأ `get_balance()` فقط.
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
- بدون Docker (الوضع الافتراضي): نشتغل على مشروع Supabase السحابي `highlink-studio-dev` المرتبط بـ`supabase link`. `supabase db push` يطبّق migrations، ثم seed عبر SQL Editor أو `psql`. `supabase functions deploy <name>` للنشر، والاختبار بـcurl على الرابط السحابي.
- مع Docker (اختياري): `supabase start` ← Postgres + Functions محليًا؛ `supabase db reset` يطبّق migrations + seed؛ `supabase functions serve generate-media --env-file supabase/.env.local`.
- `supabase db push` / `functions deploy` / `secrets set` ← تحتاج تأكيدًا مني دائمًا (settings.json)
- `npm run gen:types` ← `supabase gen types typescript --linked > packages/shared/db.ts`
- الأسرار: `supabase/.env.local` (لا يُقرأ ولا يُطبع) → `supabase secrets set --env-file supabase/.env.local`. الواجهة: `apps/web/.env.local`.

## حالة المشروع
- المرحلة 0 منجزة: هيكل، تصميم، i18n، دخول، migration 0001 (مختبرة على Postgres 16: التسجيل، الحجز/التأكيد/الاسترداد، RLS)، seed، المركز القانوني، صفحة الباقات، وصفة `product-shot`، هيكل `generate-media` (يرفض 501).
- التالي (المرحلة 1) بالترتيب: (1) تطبيق migration+seed على المشروع السحابي وتوليد الأنواع (2) `_shared/` ثم `generate-media` الكاملة + `provider-webhook` بنموذج nano-banana-pro فقط (3) صفحة `/image-generate` الحقيقية + المكتبة عبر Realtime = **بوابة 1** (4) Kling عبر Replicate (5) API v1. لا تُبنى خطوة قبل اجتياز سابقتها.
- الدليل التشغيلي لجلسات Claude Code: `docs/claude-code-kickoff.md`.

## عند التردد
اقرأ `docs/blueprint.md`. إذا خالفته اكتب ADR قصيرًا في `docs/decisions/` قبل الكود.
