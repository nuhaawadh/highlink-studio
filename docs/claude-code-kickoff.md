# دليل تشغيل Claude Code على استوديو هاي لينك

## أ) وش تعطينه قبل أول جلسة

| # | الشيء | وين يروح | ملاحظة |
| --- | --- | --- | --- |
| 1 | مجلد `highlink-studio` (هذا المستودع) | `C:\Users\HP\OneDrive\Desktop\ai-visual-lab\highlink-studio` | افتحي Claude Code **من داخل المجلد** — `CLAUDE.md` والمهارات تنقرأ تلقائيًا |
| 2 | رابط Supabase + مفتاح anon | `apps/web/.env.local` (انسخي `.env.example`) | Supabase → Project Settings → API Keys. مشروع واحد اسمه `highlink-studio-dev`، منطقة باريس `eu-west-3` |
| 3 | مفتاح service_role + مفاتيح المزوّدين | `supabase/.env.local` (انسخي `supabase/.env.example`) | `SUPABASE_SERVICE_ROLE_KEY`, `REPLICATE_API_TOKEN`, `GEMINI_API_KEY`. لا تلصقينها في الشات أبدًا — Claude Code ممنوع من قراءة الملف (settings.json) ويرفعها بـ`supabase secrets set` |
| 4 | Supabase CLI | `npm i -D supabase` في جذر المستودع، ثم `npx supabase login` ثم `npx supabase link --project-ref <ref>` | الـref من رابط لوحة المشروع. Docker غير مطلوب |
| 5 | ملفات هوية هاي لينك | انسخي محتويات مجلد `highlink-brand` إلى `docs/brand/` | الألوان والخطوط والشعار — يحوّلها إلى `tokens.css` |
| 6 | قرارات مفتوحة (إن وجدت) | قوليها في أول رسالة | مثلًا: تغيير سن 18+، مهلة صلاحية الرصيد |

**ما تعطينه:** كلمات مرور، بيانات بطاقات، مفاتيح live للدفع قبل تفعيل البوابة.

## ب) طريقة الشغل معه
- جلسة واحدة = هدف واحد من القائمة أدناه. لا تدمجين هدفين.
- للمهام الكبيرة (الجلسة 2 و3): فعّلي **وضع التخطيط** (Shift+Tab حتى يظهر plan mode) والصقي الرسالة؛ راجعي الخطة ثم وافقي.
- لما يطلب تأكيد `db push` أو `functions deploy` أو `git push` — هذا متعمد؛ اقرئي وش بيسوي ووافقي.
- بعد كل بوابة ناجحة: `git add -A && git commit` ثم `git push` (يسألك).
- لو خالف قاعدة في `CLAUDE.md` قولي له: «راجع القاعدة رقم N في CLAUDE.md وصحّح».

## ج) الرسائل بالترتيب

### الجلسة 1 — التحقق من البيئة (10 دقائق)
```
اقرأ CLAUDE.md كاملًا، ثم docs/blueprint.md الأقسام 5 و7 و11 و15، ثم docs/decisions/0002.
بعدها تحقق من البيئة ولا تبنِ شيئًا:
1. npm run typecheck && npm test && npm run build تمر.
2. npx supabase projects list يعمل والمشروع مرتبط (npx supabase migration list).
3. apps/web/.env.local و supabase/.env.local موجودان (لا تقرأهما ولا تطبع أي قيمة — تحقق من وجود أسماء المتغيرات فقط عبر grep على أسماء المفاتيح).
4. docs/brand/ فيه ملفات الهوية.
اعرض لي جدولًا: جاهز / ناقص، وتوقف.
```

### الجلسة 2 — قاعدة البيانات على السحابة (30 دقيقة)
```
طبّق supabase/migrations/0001_init.sql على المشروع المرتبط بـ npx supabase db push (اطلب تأكيدي)، ثم طبّق supabase/seed.sql.
بعدها: npm run gen:types لتحديث packages/shared/db.ts، وتأكد أن typecheck يمر بعد التوليد.
تحقق: RLS مفعّل على الجداول العشرة، جدول plans فيه 5 صفوف وmodels فيه 5 وstudios فيه 3، وأن إنشاء مستخدم تجريبي عبر Auth Admin API يولّد profile ورصيد 30 (ثم احذف المستخدم التجريبي).
اعرض النتائج كجدول. لا تلمس Edge Functions في هذه الجلسة.
```

### الجلسة 3 — المحرك: صورة واحدة من أول مرة (وضع التخطيط)
```
ابدأ المرحلة 1 كما في CLAUDE.md «حالة المشروع» والمخطط §5 و§15 وADR 0002:
1. ابنِ supabase/functions/_shared حسب README الموجود فيه (supabaseAdmin, auth, errors, cors, credits, storage [Supabase Storage الآن], providers/google).
2. أكمل generate-media بالخطوات التسع (§5) لنموذج nano-banana-pro فقط، ثم provider-webhook / أو الإكمال المتزامن إن كان Gemini يرجع الصورة مباشرة — قرّر واكتب السبب في تعليق.
3. اختبارات منطق الرصيد أولًا (القاعدة 9): حجز → تأكيد عند النجاح، تحرير عند الفشل، لا خصم مزدوج عند تكرار الطلب بنفس assetId.
4. انشر الوظيفتين على المشروع المرتبط (اطلب تأكيدي) وارفع الأسرار بـ npx supabase secrets set --env-file supabase/.env.local (اطلب تأكيدي).
5. استبدل placeholder صفحة /image-generate بصفحة حقيقية: نموذج برومبت + اختيار النموذج + التكلفة قبل الزر، تُدرج صف assets ثم تستدعي generate-media، والنتيجة تظهر عبر Realtime بلا تحديث. و/library تعرض أصول المستخدم.
بوابة 1 (لا تعلن النجاح قبلها): توليدة حقيقية تظهر في الواجهة بدون تحديث، الرصيد ينقص 10 بالضبط، وفشل مصطنع (مفتاح خاطئ) يرجّع الرصيد ويعرض رسالة عربية.
اعرض لي الخطة أولًا قبل أي كود.
```

### الجلسة 4 — المراجعة المستقلة (قاعدة 9)
افتحي جلسة **جديدة** (أو `/clear`) والصقي:
```
راجع كمراجع مستقل لم يكتب الكود: supabase/functions/generate-media و_shared/credits.ts والاختبارات. ركّز على: خصم مزدوج، حجز لا يُحرَّر عند استثناء، webhook مكرر، مدخلات غير محقّقة، أسرار في الواجهة، RLS. اعرض قائمة مشاكل مرتبة بالخطورة مع سطر الإصلاح لكل واحدة، ولا تعدّل شيئًا قبل موافقتي.
```

### الجلسة 5 — الفيديو (Kling عبر Replicate)
```
استخدم المهارة /new-model لتفعيل kling-v3-turbo (موجود في seed) مع محوّل providers/replicate.ts وwebhook حقيقي من Replicate (التحقق من التوقيع + dedupe عبر webhook_events). التكلفة بالثانية من cost_per_second. صفحة /video-generate حقيقية. بوابة: مقطع 5 ثوانٍ يظهر في المكتبة عبر Realtime والرصيد ينقص 25.
```

### الجلسة 6 — API v1 (ADR 0002)
```
ابنِ API عامة v1 فوق generate-media نفسها: جدول api_keys (hash، حد يومي، آخر استخدام) + migration/RLS، إصدار المفاتيح من صفحة الحساب، نقاط POST /v1/generate وGET /v1/assets/{id} وGET /v1/models وGET /v1/balance، مفتاح Idempotency-Key، وwebhook موقّع إلى رابط العميل. اختبرها من n8n بسيناريو: HTTP Request → انتظار webhook → حفظ الرابط.
```

### الجلسة 7 — الاستوديو الأول
```
نفّذ content/studios/product-shot.json داخل generate-media (model=studio:product-shot) مع بوابة الجودة §15، وابنِ StudioWizard العام وصفحة /studio/product. استخدم /demo-video لإنتاج أول 3 صور عرض بعد نجاح المجموعة الذهبية.
```

### الجلسة 8 — الدفع
```
ابنِ _shared/payments/ بواجهة واحدة ومحوّل Paylink (بيئة الاختبار الموثقة في developer.paylink.sa)، ووظيفتي billing-intent وpayment-webhook، وجدول payments موجود. الرصيد يُضاف بـ grant_credits فقط بعد التحقق بالاستعلام لا بالـwebhook وحده. صفحة /pricing تفتح صفحة الدفع. اختبار كامل على مفاتيح test قبل أي مفتاح live.
```

### الجلسة 9 — MCP
```
ابنِ سيرفر MCP بـ @modelcontextprotocol/sdk على Cloudflare Worker (mcp.highlink.tech) بـ OAuth 2.1 PKCE عبر Supabase Auth، بالأدوات: run_studio, estimate, check_generation, upload_reference, get_credits, list_models — كلها تستدعي نفس generate-media. اختبره من Claude Desktop.
```
