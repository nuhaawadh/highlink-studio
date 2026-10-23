# Blueprint — منصة الاستوديو الإبداعي

2026-10-21 · نهى عوض — هاي لينك · مصدر: مستند Claude (يُحدَّث هناك ثم يُصدَّر إلى هنا)

مخطط بناء كامل لمنصة عربية لتوليد الصور والفيديو بالذكاء الاصطناعي بنظام رصيد — مبني على تحليل الكود الفعلي لمنصة هلاي AI (halaiapp.ai) بتاريخ 21 أكتوبر 2026.

## 1. القرار والاسم

نبني **استوديو عربي لتوليد الصور والفيديو بنظام رصيد** بنفس بنية هلاي، لكن ندخل السوق من باب واحد: **إعلانات المتاجر (سلة/زد) + UGC بلهجة سعودية**، ثم نوسّع للاستوديوهات الباقية. هلاي يبيع "عدد النماذج"؛ نحن نبيع "النتيجة الجاهزة للنشر".

**القرار (22 أكتوبر 2026): الإطلاق الأول تحت هاي لينك.** الاسم العام للمنتج **استوديو هاي لينك** على `studio.highlink.tech`، بإيميل وهوية ووثيقة هاي لينك القائمة — بلا دومين جديد ولا حسابات جديدة. "رونق (Rawnaq)" يبقى اسمًا احتياطيًا لفصل المنتج كبراند مستقل بعد إثبات الطلب، وفي بقية المستند يُستخدم كاسم داخلي للمشروع (codename) فقط. الجدول أدناه مرجع لذلك الوقت.

| الاسم | المعنى | لماذا يناسب | المخاطر وما يجب التحقق منه |
| --- | --- | --- | --- |
| **رونق — Rawnaq** (التوصية) | بهاء، لمعان، جمال المظهر | يصف ناتج المنصة (صور لامعة)، سهل بالعربي والإنجليزي، نظيف من المنافسين | التحقق من rawnaq.ai و rawnaq.sa، وبحث علامة تجارية في الهيئة السعودية للملكية الفكرية (SAIP) |
| كادر — Kadr | "الكادر" = الإطار السينمائي؛ مصطلح دارج بين صنّاع المحتوى السعوديين | أقوى ارتباط بالفيديو والتصوير | يوجد تطبيق باسم [كادر - Kadr](https://apps.apple.com/us/app/-/id6464161837) على App Store → خطر تعارض |
| مشاهد — Mashahed | مَشاهد (جمع مشهد) | يوحي بالسينما والستوري بورد | يختلط مع كلمة "مُشاهد" وبمدينة مشهد في نتائج البحث |
| لوحة — Lawha | لوحة فنية / كانفس | بسيط ومرئي | عام جدًا، وصعب تمييزه في البحث |

**هوية الملكية:** هاي لينك هي الجهة والفاتورة والبراند؛ نظام التصميم يتبع هوية هاي لينك الحالية (ملفات Brand Identity/DLS) لا اللون الذهبي المقترح في القسم 8. عند الفصل لاحقًا يتغير الاسم والألوان والدومين فقط — الكود والجداول والوصفات لا تتغير.

- [ ] نقل DNS لدومين highlink.tech من Hostinger إلى Cloudflare (مجاني؛ شرط لدومين R2 المخصص وتحجيم الصور) — الموقع الحالي يبقى كما هو بنفس السجلات
- [ ] إنشاء السجلات: studio.highlink.tech (Pages)، media.highlink.tech (R2)، ولاحقًا mcp.highlink.tech
- [ ] كل الحسابات (Supabase، Cloudflare، Replicate، Google AI، Moyasar) على إيميل هاي لينك، وMoyasar بوثيقة العمل الحر باسم نهى عوض
- [ ] تأجيل فحص اسم رونق والعلامة التجارية إلى ما بعد البوابة 3

## 2. الستاك النهائي (مؤكد من كود هلاي)

كل طبقة أدناه مأخوذة من حزمة الجافاسكربت الفعلية لهلاي (7 MB، بُنية 21 أكتوبر 2026) — ليست تخمينًا. نستخدم نفس الاختيارات لأنها مجرّبة في الإنتاج مع نفس السوق.

| الطبقة | هلاي يستخدم | نحن نستخدم | ملاحظة |
| --- | --- | --- | --- |
| الواجهة | React 18.3.1 + Vite (SPA) | React 18 + Vite + TypeScript | لا Next.js؛ الـSPA أبسط للنشر على Cloudflare Pages |
| التنسيق | Tailwind + shadcn/ui (Radix) + lucide-react + sonner | نفسه | RTL أولًا، ثيم داكن |
| الحالة | React Context + hooks فقط | نفسه + TanStack Query للمكتبة | لا Redux/Zustand |
| السيو | react-helmet-async | نفسه | meta لكل صفحة برومبت |
| المصادقة | Supabase Auth: Google OAuth + One-Tap (signInWithIdToken) + إيميل + Passkeys | Google + إيميل في المرحلة 1 | Passkeys لاحقًا |
| قاعدة البيانات | Supabase Postgres + RLS | نفسه | 25 جدولًا عندهم؛ نبدأ بـ9 |
| الوقت الحقيقي | Supabase Realtime على جدول assets بفلتر user\_id | نفسه | لا polling |
| المنطق الخلفي | Supabase Edge Functions (Deno) — 27 وظيفة | نفسه — 10 وظائف في المرحلة 1 | الأساسية: generate-media |
| النماذج | Replicate (30 نموذجًا) + fal.ai (14) + Gemini مباشر (4) | Replicate أساسي + Gemini للصور؛ fal كبديل | المفاتيح على السيرفر فقط |
| تخزين الميديا | Cloudflare R2 عبر media.hallah.ai + Cloudflare Images للتحجيم | R2 + Images | ليس Supabase Storage |
| الرفع | Uppy + AwsS3 plugin + رابط موقّع من Edge Function | نفسه | multipart للفيديو |
| فيديو العرض | Cloudflare Stream | Cloudflare Stream أو R2 + hls.js | Stream أسهل |
| الدفع | Tap Payments (بطاقات + Apple Pay) عبر billing-intent/charge | Moyasar أو Tap | ريال + 15% ضريبة |
| الحماية | Cloudflare Turnstile + Sentry | نفسه | Turnstile على التسجيل والتوليد |
| التحليلات | GA4 + Meta Pixel + TikTok + X + Snap + OpenAI Ads | GA4 + Meta + TikTok في البداية |  |
| التوزيع | تطبيق سلة + تطبيق زد + سيرفر MCP (OAuth 2.1) + API عامة v1 | سلة أولًا، ثم MCP | زد والـAPI في المرحلة 3 |

**الاستضافة:** الواجهة على Cloudflare Pages (مجاني)، Supabase على خطة Pro (25 دولارًا شهريًا — مطلوبة لعدم إيقاف المشروع ولـRealtime المستقر)، R2 (10 GB مجانية ثم 0.015 دولار/GB، بدون رسوم إخراج).

**الدومينات (تحت highlink.tech):** `studio.highlink.tech` (التطبيق على Cloudflare Pages)، `media.highlink.tech` (R2 العام + تحجيم الصور)، `mcp.highlink.tech` (لاحقًا). دومين Supabase المخصص (`api.highlink.tech`) اختياري ومدفوع — نؤجله.

## 3. بنية النظام

المبدأ الواحد الذي يبني عليه هلاي كل شيء: **التوليد غير متزامن، والصف في جدول assets هو مصدر الحقيقة**. الواجهة لا تنتظر المزوّد أبدًا؛ تنشئ الصف، تطلق الطلب، وتستمع للتغيير.

```text
الواجهة React ──(1)──▶ generate-media (Edge) ──(2)──▶ المزوّد (Replicate / fal / Gemini) ──(3)──▶ provider-webhook (Edge)
  تدرج صفًا في assets         تحجز الرصيد (hold)            يولّد خلال 10–120 ث                     ينسخ الناتج إلى R2، يؤكد الخصم أو يسترد
  status = queued              ترسل للمزوّد مع webhook                                                   │ (4)
                                                                                                        ▼
الواجهة عبر Realtime ◀──(5) postgres_changes (UPDATE، filter user_id=eq.X) ──────────────── Postgres: assets (status=completed, url)
```

الخطوة 2 هي الوحيدة التي تلمس مفاتيح المزوّدين والرصيد، والخطوة 4 هي الوحيدة التي تكتب في R2 — كل ما عداهما قراءة محمية بـRLS.

**لماذا هذا التصميم وليس سيرفر Node تقليدي:**

- الفيديو يستغرق حتى دقيقتين؛ الطلب المتزامن ينقطع على الجوال ويضيّع الرصيد.
- المستخدم يقدر يطلق 5 توليدات ويغيّر الصفحة؛ النتائج تظهر في المكتبة عند العودة.
- الـWebhook يجعل الخصم عادلًا: الرصيد يُحجز عند الطلب ويُؤكّد عند النجاح أو يُسترد عند الفشل (هلاي يعلن "استرداد تلقائي للعمليات الفاشلة").
- لا سيرفر تديرينه: Supabase وCloudflare يتوسعان بدون تدخل، وهذا حاسم لشخص واحد يبني ويشغّل.

**الاستوديوهات ليست أنظمة منفصلة.** في كود هلاي، استديو المنتجات والإعلانات واللقطات والستوري بورد كلها تستدعي `generate-media` نفسها بقيمة `model` مختلفة (`product-studio`، `ads-studio-grid`، `shots-generator`، `storyboard`، `ugc-v2-flf2v`)، والسيرفر يحوّل كل قيمة إلى برومبت هندسي + نموذج + إعدادات. الاستوديو = سجل في جدول `studios` عندنا، لا كود جديد.

## 4. قاعدة البيانات

تسعة جداول تكفي المرحلة الأولى، والرصيد يُحسب من **دفتر حركات** (ledger) لا من عمود واحد يُعدّل — هذا ما يمنع الخصم المزدوج ويعطي سجلًا كاملًا لكل ريال. هلاي عنده جدول `server_transactions` لنفس الغرض.

```sql
-- المستخدم والخطة
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  username text unique, display_name text, avatar_url text,
  plan_id text references plans(id) default 'free',
  locale text default 'ar', created_at timestamptz default now()
);
create table plans (
  id text primary key,            -- free | starter | basic | pro | creators
  name_ar text, name_en text,
  monthly_credits int not null, price_sar_monthly numeric(10,2), price_sar_yearly numeric(10,2),
  max_concurrent int default 2, private_by_default bool default false, sort int
);
create table subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id), plan_id text references plans(id),
  status text check (status in ('active','past_due','canceled','trialing')),
  provider text default 'moyasar', provider_customer_id text, provider_token text,
  current_period_start timestamptz, current_period_end timestamptz,
  cancel_at_period_end bool default false, created_at timestamptz default now()
);

-- دفتر الرصيد: الرصيد الحالي = sum(amount) where status in ('posted')
create table credit_ledger (
  id bigserial primary key,
  user_id uuid references profiles(id) not null,
  amount int not null,             -- موجب = إضافة، سالب = خصم
  kind text check (kind in ('grant','hold','charge','refund','expire','bonus','adjust')),
  status text check (status in ('held','posted','released')) default 'posted',
  asset_id uuid, ref text, note text,
  expires_at timestamptz,          -- الرصيد الشهري ينتهي بنهاية الدورة (مثل هلاي)
  created_at timestamptz default now()
);
create index on credit_ledger (user_id, status);

-- المشاريع والأصول
create table projects (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references profiles(id), name text, created_at timestamptz default now()
);
create table assets (
  id uuid primary key,                       -- تنشئه الواجهة قبل الاستدعاء
  user_id uuid references profiles(id) not null,
  project_id uuid references projects(id),
  type text check (type in ('image','video','audio')) not null,
  status text check (status in ('queued','processing','completed','failed','canceled')) default 'queued',
  feature_tag text,                          -- general | product | ads | ugc | shots | storyboard | characters
  model text, prompt text, negative_prompt text,
  aspect_ratio text, duration_s numeric, resolution text,
  input_urls text[], url text, thumbnail_url text,
  provider text, provider_job_id text,       -- replicate | fal | google
  cost_credits int, error_code text, error_message text,
  visibility text check (visibility in ('private','public')) default 'private',
  metadata jsonb default '{}'::jsonb,
  created_at timestamptz default now(), completed_at timestamptz
);
create index on assets (user_id, created_at desc);
create unique index on assets (provider, provider_job_id) where provider_job_id is not null;

-- كتالوج النماذج والاستوديوهات (يُدار من لوحة الإدارة، لا من الكود)
create table models (
  id text primary key,                       -- kling-v3 | seedance-2.5 | nano-banana-pro ...
  name_ar text, name_en text, type text, provider text, provider_slug text,
  cost_credits int, cost_per_second numeric, max_duration_s int,
  supports jsonb,                            -- {i2v:true, ref_images:3, audio:true, resolutions:[...]}
  default_params jsonb, enabled bool default true, badge text, sort int
);
create table studios (
  id text primary key,                       -- product-studio | ads-studio | ugc-studio ...
  name_ar text, description_ar text, icon text, badge text,
  pipeline jsonb not null,                   -- خطوات: [{model, prompt_template, params}, ...]
  cost_credits int, enabled bool default true, sort int
);

-- المدفوعات وأحداث المزوّدين
create table payments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid, amount_sar numeric(10,2), vat_sar numeric(10,2), credits int,
  provider text, provider_payment_id text unique, status text, raw jsonb,
  created_at timestamptz default now()
);
create table webhook_events (
  id bigserial primary key, source text, event_id text unique, payload jsonb,
  processed_at timestamptz, created_at timestamptz default now()
);
```

**RLS — القاعدة الثابتة:** المستخدم يقرأ صفوفه فقط، ويكتب في `assets` و`projects` فقط؛ الرصيد والمدفوعات والنماذج **للقراءة فقط** من الواجهة، والكتابة فيها حصرًا عبر Edge Functions بمفتاح service\_role.

```sql
alter table assets enable row level security;
create policy "own assets" on assets for select using (auth.uid() = user_id or visibility = 'public');
create policy "insert own queued" on assets for insert with check (auth.uid() = user_id and status = 'queued');
create policy "update own meta" on assets for update using (auth.uid() = user_id)
  with check (auth.uid() = user_id);   -- الواجهة تعدّل visibility/project_id فقط (trigger يمنع غيرها)
alter table credit_ledger enable row level security;
create policy "read own ledger" on credit_ledger for select using (auth.uid() = user_id);

-- الرصيد المتاح (يستثني المحجوز والمنتهي)
create or replace function get_balance(p_user uuid) returns int language sql stable as $$
  select coalesce(sum(amount),0)::int from credit_ledger
  where user_id = p_user and status in ('posted','held')
    and (expires_at is null or expires_at > now());
$$;

-- حجز ذرّي: يفشل إذا الرصيد لا يكفي (يُستدعى من generate-media فقط)
create or replace function hold_credits(p_user uuid, p_amount int, p_asset uuid)
returns bigint language plpgsql security definer as $$
declare v_id bigint;
begin
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if get_balance(p_user) < p_amount then raise exception 'INSUFFICIENT_CREDITS'; end if;
  insert into credit_ledger (user_id, amount, kind, status, asset_id)
  values (p_user, -p_amount, 'hold', 'held', p_asset) returning id into v_id;
  return v_id;
end $$;
-- عند النجاح: update credit_ledger set kind='charge', status='posted' where id = hold_id;
-- عند الفشل:  update credit_ledger set kind='refund', status='released', amount=0 where id = hold_id;
```

**قرارات مهمة:**

- الـ`id` للأصل تنشئه الواجهة (`crypto.randomUUID()`) — نفس طريقة هلاي — لتظهر البطاقة فورًا قبل رد السيرفر.
- الرصيد الشهري يُمنح بصف `grant` له `expires_at` = نهاية الدورة؛ الرصيد المشترى بدون انتهاء. الخصم يأخذ من الأقرب انتهاءً أولًا.
- `webhook_events.event_id` فريد لمنع تكرار المعالجة إذا أعاد المزوّد إرسال الحدث.
- النماذج والاستوديوهات في جداول لا في الكود: تضيفين نموذجًا جديدًا بصف واحد بدون نشر.

## 5. Edge Functions

عشر وظائف تكفي للإطلاق، وواحدة منها (`generate-media`) تحمل 80% من المنطق. كلها Deno/TypeScript داخل Supabase، وتشترك في مجلد `_shared/` (عميل Supabase بصلاحية service\_role، محوّلات المزوّدين، التحقق من الجلسة).

| الوظيفة | من يستدعيها | ماذا تفعل | المرحلة |
| --- | --- | --- | --- |
| `generate-media` | الواجهة (JWT) | تحقق → تسعير → حجز رصيد → بناء البرومبت من الاستوديو → إرسال للمزوّد | 1 |
| `provider-webhook` | Replicate / fal (توقيع) | تحقق التوقيع → نسخ الناتج إلى R2 → تحديث assets → تأكيد/استرداد الرصيد | 1 |
| `generate-upload-url` | الواجهة | رابط PUT موقّع لـR2 (حد الحجم + النوع) | 1 |
| `prompt-enhancer` | الواجهة | يحوّل نص المستخدم العربي إلى برومبت إنجليزي محترف (Claude Haiku) | 1 |
| `billing-intent` | الواجهة | ينشئ عملية دفع في Moyasar/Tap ويرجع رابط/توكن | 1 |
| `billing-webhook` | بوابة الدفع | تأكيد الدفع → منح الرصيد → تفعيل الاشتراك | 1 |
| `delete-asset` | الواجهة | حذف من R2 + الجدول | 1 |
| `cron-renewals` | Supabase Cron (يومي) | تجديد الاشتراكات، إنهاء الرصيد المنتهي، تحرير الحجوزات المعلّقة > 30 دقيقة | 1 |
| `salla-products` / `salla-oauth` | تطبيق سلة | جلب منتجات المتجر وصورها | 2 |
| `publish-to-community` | الواجهة | نشر أصل في المعرض العام | 2 |

**عقد `generate-media`** (نفس حقول هلاي تقريبًا — رأيناها في الكود: `model, prompt, images, config, assetId, feature_tag`):

```typescript
// POST /functions/v1/generate-media   (Authorization: Bearer <user JWT>)
interface GenerateRequest {
  assetId: string;            // UUID أنشأته الواجهة وأدرجته في assets بحالة queued
  model: string;              // معرّف من جدول models أو studios
  prompt: string;
  images?: string[];          // روابط R2 للمراجع (منتج، شخصية، إطار أول)
  config?: { aspectRatio?: '1:1'|'9:16'|'16:9'|'4:5'|'3:4'; imageSize?: '1K'|'2K'|'4K';
             duration?: number; resolution?: '480p'|'720p'|'1080p'; audio?: boolean; seed?: number };
  feature_tag?: 'general'|'product'|'ads'|'ugc'|'shots'|'storyboard'|'characters';
  locale?: 'ar'|'en';
}
interface GenerateResponse {
  success: boolean; assetId: string; cost: number; balanceAfter: number;
  provider: 'replicate'|'fal'|'google'; providerJobId?: string;
  error?: { code: 'INSUFFICIENT_CREDITS'|'RATE_LIMITED'|'MODEL_DISABLED'|'UNSAFE_PROMPT'|'PROVIDER_ERROR'; message: string };
}
```

**خطوات الوظيفة بالترتيب** (كل خطوة تفشل مبكرًا وترجع رمز خطأ واضح):

1. تحقق JWT → `user_id`؛ تحقق أن `assets.id = assetId` يملكه المستخدم وحالته `queued`.
2. حد التزامن: عدد الأصول `processing` للمستخدم < `plans.max_concurrent` وإلا `RATE_LIMITED`.
3. حلّ `model`: إن كان استوديو → اقرأ `studios.pipeline` وابنِ البرومبت النهائي من القالب + نص المستخدم؛ إن كان نموذجًا خامًا → اقرأ `models`.
4. التسعير: `cost = models.cost_credits` أو `cost_per_second * duration`، مضروبًا في معامل الدقة (2K ×1.5، 4K ×2).
5. فحص أمان البرومبت (قائمة كلمات + نداء تصنيف رخيص للنص العربي) → `UNSAFE_PROMPT`.
6. `hold_credits(user, cost, assetId)` → إن فشل → `INSUFFICIENT_CREDITS` (HTTP 402 مثل هلاي).
7. استدعاء المحوّل: `providers[model.provider].submit({slug, input, webhookUrl})` → `providerJobId`.
8. تحديث `assets`: `status='processing', provider, provider_job_id, cost_credits, prompt_final` → Realtime يوصل التحديث للواجهة.
9. أي استثناء بعد الخطوة 6 → تحرير الحجز + `status='failed'` + رسالة عربية للمستخدم.

**طبقة المزوّدين** — واجهة واحدة، ثلاثة محوّلات. هذا ما يسمح بإضافة نموذج جديد في ساعة:

```typescript
interface ProviderAdapter {
  submit(job: { slug: string; input: Record<string, unknown>; webhookUrl: string }): Promise<{ jobId: string }>;
  parseWebhook(req: Request): Promise<{ jobId: string; status: 'succeeded'|'failed'; outputs: string[]; error?: string }>;
  verifySignature(req: Request): Promise<boolean>;
}
// replicate: POST https://api.replicate.com/v1/models/{owner}/{name}/predictions  { input, webhook, webhook_events_filter:['completed'] }
// fal:       POST https://queue.fal.run/{slug}  { ...input, webhook_url } → request_id
// google:    متزامن (صور فقط، 5–20 ث): generateContent بنموذج gemini image → النتيجة مباشرة إلى R2 ثم completed
```

**`provider-webhook`** — الترتيب مهم لأن المزوّد قد يرسل الحدث مرتين:

1. تحقق التوقيع (Replicate: `webhook-signature` بمفتاح سرّي؛ fal: توقيع ed25519).
2. `insert into webhook_events (event_id) ... on conflict do nothing` → إن كان مكررًا أرجع 200 وتوقف.
3. جلب الناتج من رابط المزوّد (مؤقت، ينتهي خلال ساعات) → رفعه إلى R2 تحت `u/{user_id}/{asset_id}.{ext}` → توليد صورة مصغّرة (للفيديو: إطار عبر Cloudflare Stream أو ffmpeg.wasm لاحقًا).
4. `update assets set status='completed', url, thumbnail_url, completed_at` → تحويل الحجز إلى `charge`.
5. عند الفشل: `status='failed', error_code` → تحرير الحجز (`refund`) → إشعار للمستخدم.

**الأسرار في Supabase Vault/Secrets فقط:** `REPLICATE_API_TOKEN`, `FAL_KEY`, `GEMINI_API_KEY`, `ANTHROPIC_API_KEY`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `MOYASAR_SECRET`, `WEBHOOK_SIGNING_SECRET`. لا شيء منها يلمس الواجهة (هلاي يكشف فقط مفتاح Supabase العام ومفتاح Tap العام، وهذا صحيح).

## 6. الميديا والتخزين

كل ملف يعيش في **Cloudflare R2** ويُخدم من `media.highlink.tech`، ولا يمر بايت واحد من الميديا عبر Supabase — هذا سبب اختيار هلاي لـR2: بدون رسوم إخراج (egress)، والفيديو هو أغلى شيء تخدمينه. الدومين المخصص لـR2 يشترط أن تكون DNS لـhighlink.tech على Cloudflare.

**ثلاثة مسارات للملفات:**

| المسار | الطريقة | التفاصيل |
| --- | --- | --- |
| رفع المستخدم (مراجع، منتجات) | الواجهة → `generate-upload-url` → PUT مباشر إلى R2 | رابط موقّع صالح 10 دقائق، الحد 25 MB للصور و200 MB للفيديو، المسار `up/{user_id}/{uuid}.{ext}`؛ Uppy للواجهة (سحب وإفلات + تقدم + استئناف) |
| نواتج التوليد | `provider-webhook` ينسخ من رابط المزوّد إلى R2 | `u/{user_id}/{asset_id}.{png,mp4}`؛ روابط المزوّدين تنتهي خلال ساعات، فالنسخ إلزامي |
| أصول الموقع (ديمو، أيقونات، هوية) | رفع يدوي إلى `cms/` في R2 | نفس نمط هلاي `media.hallah.ai/cms/static/...` |

**الصور المصغّرة والتحجيم:** لا تخزّني نسخًا متعددة. فعّلي **Cloudflare Image Resizing** على الدومين واطلبي المقاس في الرابط — تمامًا كما يفعل هلاي:

```text
https://media.highlink.tech/cdn-cgi/image/width=480,quality=82,format=auto/u/{user}/{asset}.png   ← بطاقة المكتبة
https://media.highlink.tech/cdn-cgi/image/width=1200,quality=88,format=jpeg/cms/og-card.png         ← بطاقة المشاركة
```

للفيديو: الصورة المصغّرة تأتي من المزوّد إن وفّرها (Replicate لا يوفّرها دائمًا)، وإلا تُلتقط في الواجهة عند أول عرض (`<video>` → canvas → رفع صورة 200 KB) — حل رخيص يكفي المرحلة 1. فيديوهات العرض على الصفحة الرئيسية ترفع إلى **Cloudflare Stream** (5 دولارات لكل 1000 دقيقة تخزين) لأنه يعطي صورة مصغّرة وHLS تكيّفي تلقائيًا — هلاي يستضيف عليه 343 مقطعًا.

**سياسة الاحتفاظ (تكلفة R2 تتراكم مع الفيديو):**

- الخطة المجانية: الأصول تُحذف بعد 30 يومًا (قاعدة Lifecycle في R2 على بادئة `u/` + وسم في الجدول).
- الخطط المدفوعة: بلا حد طالما الاشتراك نشط، وثمانية أسابيع سماح بعد الإلغاء.
- المراجع المرفوعة (`up/`) تُحذف بعد 7 أيام إن لم تُستخدم في أي توليد.

**التكلفة التقريبية:** فيديو 720p مدته 8 ثوانٍ ≈ 6 MB. ألف مستخدم نشط × 30 فيديو شهريًا = 180 GB ≈ 2.7 دولار شهريًا في R2 — التخزين ليس همّك؛ تكلفة التوليد هي الهم.

## 7. الرصيد والدفع

الرصيد الواحد يساوي **0.16 ريال (≈ 0.042 دولار)** — نفس قيمة رصيد هلاي في كل باقاته (250 رصيدًا بـ 10 دولارات … 4,000 بـ 158). القاعدة: **تكلفة النموذج بالرصيد = تكلفة المزوّد بالدولار × 3 ÷ 0.042**، مقرّبة لأعلى. الـ×3 تغطي التوليدات الفاشلة، رسوم الدفع، الرصيد المجاني، وهامشًا صافيًا قريبًا من 50%.

| الباقة | السعر الشهري (ريال) | الرصيد الشهري | سنوي (خصم 30%) | التزامن | الخصوصية |
| --- | --- | --- | --- | --- | --- |
| مجاني | 0 | 30 عند التسجيل (مرة واحدة) | — | 1 | عام في المعرض |
| ستارتر | 39 | 250 | 329 | 2 | خاص |
| بيسك | 79 | 500 | 659 | 2 | خاص |
| برو (الأكثر طلبًا) | 199 | 1,250 | 1,669 | 4 | خاص + أولوية |
| كريتورز | 599 | 4,000 | 5,029 | 8 | خاص + أولوية ×3 |
| شحن إضافي | 49 / 99 / 199 | 250 / 550 / 1,200 | — | — | لا ينتهي |

الأسعار مطابقة تقريبًا لهلاي بالريال (10 / 21 / 53 / 158 دولارًا) حتى لا تدخلي حرب أسعار؛ التميز في النتيجة لا في السعر. الرصيد الشهري ينتهي بنهاية الدورة (مثل هلاي)، والشحن الإضافي لا ينتهي — هذا الفرق نقطة بيع.

**تكلفة العمليات بالرصيد — أرقام المزوّدين تقريبية وتتغير شهريًا؛ تُسحب من صفحة أسعار Replicate قبل الإطلاق وتُحدّث في جدول `models` لا في الكود:**

| العملية | النموذج | تكلفة المزوّد (تقريبي، دولار) | الرصيد للمستخدم |
| --- | --- | --- | --- |
| صورة سريعة 1K | Flux / Nano Banana Lite | 0.02 – 0.04 | 2 – 3 |
| صورة عالية 2K | Nano Banana Pro | 0.10 – 0.15 | 8 – 10 |
| صورة 4K / ترقية | Nano Banana Pro 4K | 0.20 – 0.25 | 15 – 18 |
| لقطات (9 زوايا في صورة واحدة) | Nano Banana Pro 2K | 0.15 | 12 |
| فيديو 5 ث 720p بدون صوت | Kling 2.5 Turbo / Wan 2.5 Fast | 0.25 – 0.40 | 20 – 30 |
| فيديو 8 ث 1080p بصوت | Veo 3.1 Fast / Seedance | 1.0 – 1.6 | 75 – 115 |
| فيديو UGC 10 ث (شخصية تتكلم) | Omni Flash / Kling 3 Omni | 0.8 – 1.5 | 40 – 60 |
| استوديو المنتجات (4 زوايا + 2 بوست) | 6 صور بالتسلسل | 0.5 | 35 |
| تحسين البرومبت | Claude Haiku | 0.002 | 0 (مجاني) |

**بوابة الدفع:** ابدئي بـ **Moyasar** — إعداد أسرع للفرد/المؤسسة، يدعم مدى وApple Pay وSTC Pay وحفظ البطاقة (token) للتجديد الشهري. Tap (الذي يستخدمه هلاي) بديل مكافئ لكن تفعيله أبطأ. كلاهما يطلب وثيقة نظامية وحسابًا بنكيًا بنفس الاسم.

**تدفق الشراء (نفس بنية هلاي billing-intent → charge):**

1. الواجهة تستدعي `billing-intent` بـ `{plan_id | topup_id, cycle, coupon?}` → الوظيفة تحسب المبلغ وتنشئ سجل `payments(status='initiated')` وترجع معرّف الدفعة.
2. نموذج Moyasar المدمج (أو Apple Pay) يأخذ البطاقة — رقم البطاقة لا يلمس سيرفرك أبدًا.
3. `billing-webhook` يستلم `paid` → يتحقق التوقيع → يمنح الرصيد (`grant`) → يفعّل الاشتراك → الواجهة تشوف الرصيد عبر Realtime على `profiles`.
4. التجديد: `cron-renewals` يوميًا يخصم بالتوكن المحفوظ قبل الانتهاء بيوم؛ فشل الخصم → `past_due` + 3 محاولات خلال 7 أيام ثم تخفيض للمجاني.

**الضريبة والفواتير:** بوثيقة العمل الحر وبدون رقم ضريبي، لا تُحصّل ضريبة قيمة مضافة حتى تتجاوز الإيرادات 375,000 ريال في 12 شهرًا (التسجيل الإلزامي)، والتسجيل الاختياري ممكن من 187,500. الأسعار تُعرض نهائية وتُذكر الحالة في الشروط؛ عند التسجيل الضريبي يُضاف عمود `vat_sar` الموجود أصلًا في `payments` وتُصدر فاتورة متوافقة مع "فاتورة" (ZATCA) عبر مزوّد مثل قيود أو دفترة.

**سياسة الاسترداد (مطابقة لهلاي وللسوق):** الرصيد المستهلك لا يُسترد؛ التوليد الفاشل يُرجع رصيده تلقائيًا (النظام يفعلها بنفسه)؛ اشتراك لم يُستخدم منه أي رصيد يُسترد خلال 7 أيام نقدًا — هذا أكرم من هلاي ويقلل النزاعات مع البنك.

## 8. الواجهات

ننسخ **بنية** واجهة هلاي (التخطيط، التنقل، التدفقات) لا **هويته** (اللون الأخضر #74FF52 والشعار والنصوص ملكهم). البنية مجرّبة وتشتغل؛ الهوية لازم تكون لك.

**نظام التصميم (تُكتب كمتغيرات CSS في `:root` مثل هلاي تمامًا):**

| العنصر | هلاي | رونق (مقترح) |
| --- | --- | --- |
| الخلفية | #121212 والفوتر #080808 | #0B0B0F (أسود مزرق خفيف) والأسطح #15151B |
| لون البراند | #74FF52 أخضر نيون | #F5C542 ذهبي دافئ (يناسب "رونق" ويختلف عنهم بوضوح) |
| النص | أبيض / zinc-400 | أبيض #F4F4F5 / ثانوي #8A8A94 |
| الخط العربي | IBM Plex Sans Arabic | IBM Plex Sans Arabic (مجاني، ممتاز للواجهات) أو Tajawal |
| الخط اللاتيني | Rubik + Archivo للعناوين | Inter + Archivo Black للعناوين الضخمة |
| الزوايا | 10px للأزرار، 22px للبطاقات | نفسها |
| الاتجاه | `<html dir="rtl" lang="ar">` + تبديل للإنجليزية | نفسه — Tailwind بـ `ms-`/`me-`/`start`/`end` لا `ml`/`mr` |
| الشارات | "جديد" أخضر، "رائج" شفاف، "Beta" بحدود، مائلة -12° | نفس المنطق بلوننا |

**خريطة الصفحات (من خريطة موقع هلاي الفعلية، مرتبة حسب المرحلة):**

| المسار | الصفحة | المرحلة |
| --- | --- | --- |
| `/` | الرئيسية (هيرو فيديو + بطاقات الاستوديوهات) | 1 |
| `/image-generate`، `/video-generate` | التوليد الحر | 1 |
| `/ads-studio`، `/product-studio`، `/ugc-studio` | الاستوديوهات الثلاثة الأولى | 1 |
| `/library`، `/projects/:id` | المكتبة والمشاريع | 1 |
| `/pricing`، `/account`، `/account/billing`، `/account/usage` | الباقات والحساب | 1 |
| `/login`، `/reset-password`، `/complete-profile` | الدخول | 1 |
| `/terms`، `/privacy`، `/help`، `/contact` | القانوني والدعم | 1 |
| `/templates`، `/templates/:id` | قوالب سعودية جاهزة (38 في الإطلاق → 100+) — `content/templates/saudi.json` | 1 ✓ |
| `/characters`، `/storyboard`، `/shots`، `/cinema` | الاستوديوهات المتقدمة | 2 |
| `/community`، `/u/:username` | المعرض العام والملف الشخصي | 2 |
| `/promlog`، `/promlog/:slug` | مدونة البرومبتات (سيو) | 2 |
| `/models/:id` | صفحة لكل نموذج (سيو: "كلينج 3 بالعربي") | 2 |
| `/salla`، `/zid` | واجهة مضمّنة داخل لوحة المتجر (بدون تحليلات، مثلهم) | 2 |
| `/mcp`، `/tutorials`، `/ambassador`، `/brand` | التوزيع والنمو | 3 |
| `/admin/*` | لوحة إدارة: النماذج، الاستوديوهات، المستخدمون، الرصيد، الفشل | 1 (بسيطة) |

**التخطيط العام (Layout) — نسخة طبق الأصل من بنيتهم:**

- **شريط علوي ثابت** (h-16 سطح مكتب / h-12 جوال)، شفاف على الرئيسية وداكن في التطبيق. من اليمين: الشعار ← صور ▾ ← فيديو ▾ ← تطبيقات ← الاستديو ▾ ← مجتمع ▾. من اليسار: زر الباقات (أيقونة ماسة)، اللغة، زر تسجيل الدخول أبيض أو صورة الحساب + عداد الرصيد.
- **شريط إعلان فوق الهيدر** (40px، لون البراند، قابل للإغلاق): كوبون الخصم مع زر نسخ — هلاي يستخدمه لـ "AGENT -15%".
- **درج جانبي للجوال** (252px) بأقسام قابلة للطي: أساسي / الاستوديوهات / استكشف، وزر دخول مثبّت أسفل.
- **صفحة التوليد** بثلاثة أعمدة: شريط إعدادات (النموذج، النسبة، الدقة، المدة) + مساحة عمل وسطى تعرض النتائج شبكة + شريط برومبت سفلي ثابت فيه زر التوليد يعرض **التكلفة بالرصيد قبل الضغط** (هلاي: "قبل أي توليد تظهر التكلفة الحقيقية على أيقونة التوليد").

**وصف الشاشات الأساسية:**

1. **الرئيسية** — هيرو بارتفاع الشاشة: فيديو خلفي صامت بشفافية 60% + تدرج أسود من أسفل، عنوان ضخم سطرين (هلاي: "ابدع / بلا حدود." بحجم 12rem والسطر الثاني بتدرج لون البراند)، صف أيقونات النماذج (12 أيقونة في مربعات زجاجية 40px)، سطر وصف. تحته: **شريط بطاقات أفقي** بسحب (snap) كل بطاقة 440×275 (16:10) فيها فيديو يشتغل عند المرور، شارة أعلى اليمين، اسم الاستوديو بخط أسود عريض + سطرين وصف + "جرّبه ←" يظهر عند المرور. ثم أقسام لكل استوديو (فيديو يسار + نص يمين بالتناوب)، شريط شعارات متحرك (marquee 60 ث)، الباقات، الأسئلة، الفوتر بقائمة النماذج كاملة (سيو).
2. **التوليد الحر (صور/فيديو)** — منتقي نموذج ببطاقات (اسم، أيقونة المزوّد، شارة، التكلفة)، رفع مراجع حتى 3 صور، نسبة العرض، الدقة، زر "حسّن البرومبت" (يستدعي prompt-enhancer ويعرض النتيجة للموافقة)، شبكة نتائج ببطاقات تظهر فورًا بحالة "جاري التوليد" (هيكل نابض + شريط تقدم تقديري) وتتحول للنتيجة عبر Realtime. على كل نتيجة: تحميل، إعادة بنفس الإعدادات، تحويل لفيديو، ترقية 4K، نشر، حذف.
3. **استوديو المنتجات** — معالج خطوات: (1) ارفع صورة المنتج أو اختر من متجر سلة (2) اختر مشهدًا من 12 بطاقة مصوّرة (رخام، خشب، ستوديو أبيض، رمل صحراء، مقهى...) أو اكتب (3) النتيجة: 4 زوايا + بوست مربع + ستوري عمودي + زر "تصدير CSV لسلة". التكلفة الكاملة معروضة قبل البدء.
4. **استوديو الإعلانات** — صورة منتج + نوع الحملة (عرض، إطلاق، موسمي، اليوم الوطني) + نص العرض بالعربي → شبكة 9 صور إعلانية (هلاي: "9 صور احترافية من لقطة واحدة")، ثم ترقية أي واحدة HD. النص العربي على الصورة هو الميزة الأصعب — نانو بنانا برو هو الأفضل فيها حاليًا، ومع ذلك اعرضي زر "أعد النص" للتصحيح.
5. **استوديو UGC** — اختر شخصية (مكتبة 12 شخصية سعودية/خليجية مولّدة — رجال ونساء، أعمار مختلفة — أو ارفع صورة)، اكتب النص باللهجة (حد 45 كلمة لـ 15 ث)، اختر صوتًا من 6 أصوات، أضف منتجًا اختياريًا → فيديو 9:16. معاينة الصوت قبل التوليد توفّر رصيدًا وشكاوى.
6. **المكتبة** — شبكة masonry، فلاتر (نوع، استوديو، مشروع، تاريخ)، تحديد متعدد → تحميل ZIP (هلاي يحمّل jszip)، نقل لمشروع، نشر، حذف. البطاقة تعرض النموذج والتكلفة والبرومبت عند المرور.
7. **الباقات** — تبديل شهري/سنوي (شارة "وفّر 30%")، 4 بطاقات بأيقونة مجسّمة لكل باقة، "الأكثر طلبًا" على برو، قائمة مزايا بأيقونات النماذج، عداد تنازلي للخصم، سطر "الأرقام تقريبية بأقل نموذج تكلفة"، قسم الشركات، بطاقتا سلة/زد، 20 سؤالًا شائعًا.
8. **الحساب** — الرصيد وانتهاؤه، سجل الحركات، الاشتراك (ترقية/إلغاء)، طرق الدفع، الاستخدام (رسم recharts شهري)، التطبيقات المتصلة (MCP لاحقًا).

**مكوّنات shadcn المطلوبة:** button, card, dialog, drawer, dropdown-menu, select, slider, tabs, tooltip, badge, skeleton, progress, toast (sonner), sheet, scroll-area, avatar, switch, textarea, command (للبحث في النماذج). مكوّنات خاصة تُبنى: `ModelPicker`, `AspectRatioPicker`, `CreditCostButton`, `AssetCard` (بحالات queued/processing/completed/failed), `UploadDropzone` (Uppy), `StudioWizard`, `CreditBadge`, `PlanCard`, `HeroVideo` (صورة مصغّرة فورًا ثم فيديو يتلاشى للداخل — نفس تقنية هلاي).

**قواعد RTL التي توفّر أسابيع:** استخدمي خصائص Tailwind المنطقية (`ps/pe/ms/me/start/end`) حصرًا؛ الأسهم تأخذ `rtl:rotate-180`؛ الأرقام تبقى لاتينية في التطبيق وعربية (١٢٣) في التسويق فقط؛ النصوص كلها في ملف `i18n/ar.json` و`en.json` من اليوم الأول (هلاي يخزّن الترجمات كأزواج نص عربي → إنجليزي داخل الكود، وهذا أسوأ خيار عندهم — لا تنسخيه).

## 9. محتوى العرض (فيديوهات وصور الديمو)

نولّد **نفس نوعية** مقاطع هلاي بنفس النماذج، لكن بمواضيعنا نحن — مقاطعهم محمية ونسخها يعرّض الموقع للحذف. الميزانية الكاملة لكل محتوى الموقع أقل من **120 دولارًا** على Replicate (بما فيه المحاولات الفاشلة)، وتُنفّذ عبر منصتك نفسها في الأسبوع السادس — فهي اختبار القبول الحقيقي.

**المواصفات الموحّدة (مطابقة لما يعرضه هلاي):** بطاقات الرئيسية 16:10 (يُنتج 16:9 ويُقص CSS)، 5–8 ثوانٍ، حلقة مغلقة (الإطار الأخير قريب من الأول)، بلا صوت إلا UGC، تدريج لوني داكن دافئ ينسجم مع الواجهة، بلا نص مطبوع داخل الفيديو (النص يأتي من الواجهة ليترجم). تُرفع إلى Cloudflare Stream وتُعرض بصورة مصغّرة أولًا.

| # | الموضع | الموضوع | النموذج | المدخل | البرومبت (إنجليزي للنموذج) |
| --- | --- | --- | --- | --- | --- |
| 1 | هيرو الرئيسية | مونتاج سريع من 6 لقطات × 1.5 ث: عطر، عباية تتحرك، قهوة تُصب، سيارة في صحراء، تمر على رخام، شخصية تبتسم | Kling 3 Turbo (I2V) من صور Nano Banana Pro | 6 صور مولّدة | `Cinematic macro shot of an amber oud perfume bottle on black volcanic rock, slow dolly-in, dust particles catching warm rim light, 35mm anamorphic, shallow depth of field, luxury commercial grade` (وهكذا لكل لقطة) |
| 2 | بطاقة استوديو المنتجات | علبة عسل سدر تتحول من صورة جوال عادية إلى 4 مشاهد ستوديو (انتقال سريع) | Nano Banana Pro (صور) + Seedance 2.5 للحركة | صورة منتج حقيقية | `Professional product photography of the uploaded honey jar on warm oak wood, soft window light from the left, honeycomb and a wooden dipper beside it, shallow DOF, 3:4, no text` |
| 3 | بطاقة استوديو الإعلانات | شبكة 9 صور إعلانية لكوب قهوة مختصة تظهر واحدة تلو الأخرى ثم تكبر واحدة بنص عربي "خصم 30%" | Nano Banana Pro 2K (نص عربي على الصورة) | صورة الكوب | `Bold social media ad for an iced spanish latte, vibrant orange studio background, splash of milk frozen mid-air, large clean Arabic headline "خصم ٣٠ٰ" top center in heavy modern Arabic typeface, 4:5` |
| 4 | بطاقة استوديو UGC | شابة سعودية بعباية عصرية تمسك منتج عناية بالبشرة وتتكلم للكاميرا بلهجة سعودية (بصوت) | Omni Flash أو Kling 3 Omni (شخصية + نص + صوت) | صورة شخصية مولّدة + نص | النص: "صراحة هذا السيرم غيّر روتيني، ثلاث نقاط بالليل وتصحين ووجهك مرتاح" — المشهد: `vertical 9:16 selfie-style video, soft bedroom daylight, natural handheld micro-shake, authentic UGC feel, lip-sync to provided audio` |
| 5 | بطاقة الشخصيات | نفس الشخصية في 4 مشاهد مختلفة (مكتب، مقهى، سيارة، كورنيش) بثبات الوجه | Nano Banana Pro بمرجع وجه + Kling 3 | ورقة شخصية مولّدة | `Same character as reference (preserve identity exactly), sitting at a Jeddah corniche cafe at golden hour, candid laugh, 85mm portrait, consistent face and outfit` |
| 6 | بطاقة اللقطات (9 زوايا) | حذاء رياضي واحد → شبكة 3×3 بزوايا كاميرا مختلفة تتكشف بتتابع | Nano Banana Pro 2K (صورة واحدة شبكة) | صورة الحذاء | `3x3 contact sheet of the referenced sneaker: top-down, 3/4 front, side profile, heel, macro of laces, floating hero, on-foot street, in box, low angle; identical product, thin white separators, 1:1` |
| 7 | بطاقة السينما / الانتقالات | انتقال سينمائي من صورة مدينة العلا نهارًا إلى نفس المكان ليلًا بالنجوم | Kling 3 (إطار أول + أخير) | صورتان | `Smooth cinematic time-lapse transition between the two frames, camera slowly pushes forward, stars emerge, 8s` |
| 8 | بطاقة الستوري بورد | 4 لوحات مرسومة ثم تتحول كل لوحة إلى لقطة حية | Nano Banana (لوحات) + Seedance 2.0 Fast | نص سيناريو قصير | `Storyboard panel, pencil sketch style, then photoreal: a delivery rider at dawn in Riyadh handing a package, warm light` |
| 9 | قسم "نسختك المطابقة" (مثل هلاي ميميك) | فيديو مرجعي لشخص يلوّح → نفس الحركة على شخصية مولّدة (شاشة مقسومة) | Kling 3 Motion Control / Wan 2.2 Animate | فيديو مرجعي 5 ث + صورة | `Transfer the reference motion to the character image, keep camera and timing identical` |
| 10 | بطاقات النماذج (12) | لقطة توقيع لكل نموذج (ما يبرع فيه: Veo = صوت، Kling = حركة بشرية، Seedance = سرعة، Wan = شخصيات) | كل نموذج بنفسه | نص | برومبت موحّد للمقارنة: `A falcon landing on a leather glove in the desert at sunset, slow motion, 5s` — نفس البرومبت على 12 نموذجًا يصير أيضًا محتوى مقارنة ممتازًا للسوشال |

**الصور الثابتة المطلوبة:** بطاقة OG للمشاركة 1200×630، 12 صورة مشاهد لاستوديو المنتجات، 12 شخصية UGC (ورقة شخصية لكل واحدة: أمامي، 3/4، جانبي)، 4 أيقونات مجسّمة للباقات (هلاي يستخدم أجسامًا زجاجية ملوّنة)، 30 صورة للمعرض العام الافتتاحي حتى لا يبدو فارغًا.

**قواعد الإنتاج:** كل مقطع يُولّد 3 مرات ويُختار الأفضل؛ المنتجات في الديمو بلا علامات تجارية حقيقية (لا شعار مراعي أو ستاربكس)؛ الشخصيات كلها مولّدة وليست أشخاصًا حقيقيين؛ كل مقطع يُحفظ مع برومبته ونموذجه في جدول `promlog_posts` ليصير أول 20 منشورًا في مدونة البرومبتات — محتوى العرض ومحتوى السيو نفس الشغل.

## 10. التوزيع والنمو

قوة هلاي الحقيقية ليست في النماذج بل في **خمس قنوات توزيع** تشتغل بالتوازي. ننسخها بالترتيب الذي يعطي عملاء أسرع لشخص واحد.

| القناة | كيف يفعلها هلاي | خطتنا | المرحلة |
| --- | --- | --- | --- |
| تطبيق سلة | تطبيق مدرج في متجر سلة (69/173 ر.س)، واجهة مضمّنة على `salla.hallah.ai` تسحب صور المنتجات بـOAuth | نفسه: شراكة سلة → تطبيق بـ`salla-oauth` + `salla-products`؛ التاجر يختار منتجًا ويولّد صوره من لوحته | 2 |
| تطبيق زد | نفس النمط (`zid-oauth`, `zid-products`) | بعد سلة بشهر | 3 |
| مدونة البرومبتات (سيو) | 150+ صفحة `/promlog/<slug>` بعناوين إنجليزية طويلة ("cinematic perfume bottle prompt") — كل صفحة صورة + برومبت + زر "ولّد مثلها" | نفسه لكن **بالعربي أيضًا** ("برومبت تصوير عطر") — المنافسة على الكلمات العربية شبه معدومة؛ 3 صفحات يوميًا من نواتج المنصة نفسها | 2 |
| سيرفر MCP + سكيلز | `mcp.hallah.ai/mcp` بـOAuth 2.1 + PKCE، أدوات `generate_image/generate_video/check_generation/get_credits/list_models`، مستودع سكيلز مفتوح لـClaude Code/Cursor/Codex | نفسه بـ`@modelcontextprotocol/sdk` على Cloudflare Worker + Supabase Auth كمزوّد OAuth؛ حدود يومية/شهرية لكل تطبيق متصل | 3 |
| المعرض العام + الملفات الشخصية | الخطة المجانية عامة افتراضيًا → محتوى مجاني للموقع + إعادة توليد بضغطة (`community_recreate`) | نفسه | 2 |
| برنامج السفراء | جداول `ambassadors` + دفتر عمولات + طلبات سحب؛ مؤثرو AI على X ينشرون نتائجهم | كود سفير بسيط (20% أول 3 أشهر) يُدار يدويًا في البداية، والمستهدفون مجتمع Monetify أولًا | 2 |
| محتوى السوشال | 1,700 منشور على X خلال 8 أشهر: كل نموذج جديد = منشور + مقطع خلال 24 ساعة من صدوره | نفس الإيقاع على تيك توك وX: مقطع مقارنة نموذجين بنفس البرومبت يوميًا (من المنصة نفسها، بلا وجه) | 1 |

**الرسالة التسويقية التي تفرّقنا:** هلاي يقول "أقوى النماذج في مكان واحد". رونق يقول "صور متجرك وإعلاناته جاهزة للنشر في 60 ثانية — بلا مصور ولا مصمم". التاجر لا يعرف ما هو Kling، ولا يهمه.

**مؤشرات الشهر الأول بعد الإطلاق:** 300 تسجيل، 30 مشتركًا مدفوعًا (10%)، نسبة فشل توليد < 5%، تكلفة المزوّدين < 35% من الإيراد.

## 11. خطة التنفيذ

12 أسبوعًا بمعدل جلسات Claude Code مسائية — المحرك قبل الواجهة الجميلة، والدفع قبل الاستوديوهات المتقدمة. كل مرحلة تنتهي ببوابة تُقاس، لا بشعور "خلصنا".

```text
المرحلة 0 · الأساس (الأسبوع 1)        ◆ بوابة 1: أول توليدة عبر Realtime
المرحلة 1 · المحرك (الأسابيع 2–4)     ◆ بوابة 2: أول دفعة حقيقية
المرحلة 2 · الاستوديوهات (5–6)        ◆ بوابة 3: الموقع والديمو جاهزان
المرحلة 3 · بيتا خاصة (7–8)           ◆ بوابة 4: فشل < 5% و10 مدفوعين
المرحلة 4 · التوزيع (9–12)
◆ بوابة: لا تبدأ المرحلة التالية قبل تحقّقها
```

المرحلة 1 هي الأطول عمدًا: إذا اشتغل التوليد الحر بالرصيد وRealtime بشكل موثوق، فكل استوديو بعدها سجل في جدول ومعالج خطوات في الواجهة.

**المرحلة 0 — الأساس (الأسبوع 1)**

- [ ] مستودع `highlink-studio` على GitHub (خاص) بهيكل القسم 12 وCLAUDE.md
- [x] مشروع Supabase `highlink-studio-dev` (منطقة باريس `eu-west-3` — أُنشئ فيها بدل فرانكفورت؛ الفرق الزمني للسعودية مهمل) + تشغيل SQL القسم 4 كـmigration أولى
- [ ] Google OAuth + إيميل، صفحة دخول، trigger ينشئ `profiles` عند التسجيل ويمنح 30 رصيدًا
- [ ] حساب Cloudflare: نقل DNS لـhighlink.tech + R2 bucket + دومين media + Pages للواجهة + Turnstile
- [ ] Vite + React + TS + Tailwind + shadcn، متغيرات التصميم من هوية هاي لينك، RTL، i18n، Layout (هيدر + درج جوال)
- [ ] حسابات Replicate + Google AI Studio + Moyasar (البدء بالطلب لأن التفعيل يأخذ أيامًا)

**المرحلة 1 — المحرك (الأسابيع 2–4)**

- [ ] `generate-media` + محوّل Replicate + محوّل Google للصور (القسم 5)
- [ ] `provider-webhook` مع تحقق التوقيع والنسخ إلى R2 ومنع التكرار
- [ ] دفتر الرصيد: `hold_credits` والتأكيد والاسترداد + اختبارات للحالات الثلاث
- [ ] صفحة توليد الصور ثم الفيديو بـ`AssetCard` وRealtime وزر التكلفة
- [ ] الرفع عبر `generate-upload-url` + Uppy، و`prompt-enhancer`
- [ ] المكتبة (شبكة، فلاتر، حذف، تحميل) + صفحة الحساب بسجل الرصيد
- [ ] 5 نماذج فقط في البداية: Nano Banana Pro، Flux، Kling 3 Turbo، Seedance 2.5، Veo 3.1 Fast
- [ ] بوابة 1: 50 توليدة متتالية من جهازين بدون رصيد ضائع أو بطاقة عالقة

**المرحلة 2 — الاستوديوهات والدفع (الأسابيع 5–6)**

- [ ] جدول `studios` + معالج خطوات عام `StudioWizard` يقرأ منه
- [ ] استوديو المنتجات (12 مشهدًا + 4 زوايا + CSV سلة)، ثم الإعلانات (شبكة 9)، ثم UGC (12 شخصية + 6 أصوات)
- [ ] `billing-intent` + `billing-webhook` + صفحة الباقات + التجديد التلقائي + الكوبونات
- [ ] الصفحة الرئيسية + الشروط + الخصوصية + مركز المساعدة
- [ ] إنتاج محتوى العرض (القسم 9) من المنصة نفسها
- [ ] بوابة 2: دفعة حقيقية ببطاقة مدى تمنح رصيدًا وتظهر في السجل خلال ثوانٍ

**المرحلة 3 — بيتا خاصة (الأسابيع 7–8)**

- [ ] 30 مستخدمًا من مجتمع Monetify برصيد 200 مجانًا مقابل تغذية راجعة أسبوعية
- [ ] لوحة إدارة بسيطة: التوليدات الفاشلة، الرصيد، تعطيل نموذج، منح رصيد يدوي
- [ ] Sentry + تنبيه تلقرام/إيميل عند فشل > 10% في ساعة
- [ ] بوابة 3: فشل < 5%، 10 مستخدمين دفعوا فعليًا بعد الرصيد المجاني

**المرحلة 4 — التوزيع (الأسابيع 9–12)**

- [ ] الإطلاق العام + مدونة البرومبتات (20 صفحة أولى) + المعرض العام
- [ ] تطبيق سلة (طلب الشراكة يُقدّم في الأسبوع 5 لأن المراجعة تأخذ أسابيع)
- [ ] الشخصيات واللقطات والستوري بورد (سجلات studios جديدة لا كود جديد)
- [ ] سيرفر MCP + مستودع سكيلز عام (تسويق مباشر لمجتمع Claude Code العربي)
- [ ] بوابة 4: تطبيق سلة مقبول وأول 10 متاجر مثبّتة

## 12. هيكل المستودع وCLAUDE.md

مستودع واحد (monorepo بسيط بدون أدوات workspace) لأن Supabase CLI يتوقع مجلد `supabase/` في الجذر، ولأن شخصًا واحدًا لا يحتاج أكثر.

```text
highlink-studio/
├── CLAUDE.md                      ← قواعد المشروع لـClaude Code (أدناه)
├── .claude/
│   ├── skills/                    ← سكيلز المشروع: new-studio, new-model, new-edge-fn, demo-video
│   └── settings.json              ← صلاحيات: supabase db push يحتاج تأكيد، npm test تلقائي
├── apps/web/                      ← Vite + React + TS
│   ├── src/app/                   ← الصفحات (route per folder)
│   ├── src/components/ui/         ← shadcn (لا تُعدّل يدويًا)
│   ├── src/components/studio/     ← StudioWizard, ModelPicker, AssetCard, CreditCostButton
│   ├── src/lib/supabase.ts        ← عميل واحد + أنواع مولّدة (supabase gen types)
│   ├── src/lib/generation.ts      ← createAsset() → invoke('generate-media') → subscribe()
│   ├── src/i18n/{ar,en}.json
│   └── src/styles/tokens.css      ← متغيرات التصميم من هوية هاي لينك
├── supabase/
│   ├── migrations/                ← 0001_init.sql (القسم 4) …
│   ├── seed.sql                   ← plans + models + studios الابتدائية
│   └── functions/
│       ├── _shared/               ← supabaseAdmin.ts, providers/{replicate,fal,google}.ts, credits.ts, r2.ts
│       ├── generate-media/index.ts
│       ├── provider-webhook/index.ts
│       ├── generate-upload-url/index.ts
│       ├── prompt-enhancer/index.ts
│       ├── billing-intent/  billing-webhook/  cron-renewals/  delete-asset/
├── packages/shared/               ← أنواع مشتركة (GenerateRequest, AssetStatus) تُستورد في الطرفين
├── content/
│   ├── studios/*.json             ← تعريف كل استوديو (يُزرع في الجدول)
│   ├── models/*.json
│   └── demo/                      ← برومبتات القسم 9 + روابط Stream الناتجة
└── docs/
    ├── blueprint.md               ← نسخة هذا المستند
    └── decisions/                 ← ADR قصير لكل قرار يخالف المخطط
```

**CLAUDE.md الابتدائي** (يُنسخ كما هو ثم يُضبط):

```markdown
# Highlink Studio (codename: Rawnaq) — استوديو توليد عربي (صور + فيديو) بنظام رصيد

## الستاك
- واجهة: Vite + React 18 + TypeScript + Tailwind + shadcn/ui. RTL أولًا (dir="rtl"). لا Next.js.
- باك إند: Supabase (Auth, Postgres+RLS, Realtime, Edge Functions بـDeno). لا سيرفر آخر.
- ميديا: Cloudflare R2 عبر media.highlink.tech. لا Supabase Storage.
- نماذج: Replicate (أساسي)، Gemini (صور)، fal (احتياط). المفاتيح في Edge Functions فقط.
- دفع: Moyasar. العملة ريال.
- البراند: هاي لينك — الألوان والخطوط من ملفات هوية هاي لينك في docs/brand/. الاسم الظاهر للمستخدم: "استوديو هاي لينك".

## قواعد لا تُكسر
1. التوليد دائمًا: الواجهة تدرج صف assets (status=queued) → invoke('generate-media') → Realtime.
   ممنوع polling، ممنوع استدعاء أي مزوّد من الواجهة.
2. الرصيد يُكتب فقط عبر credit_ledger من Edge Functions (service_role). الواجهة تقرأ get_balance() فقط.
3. كل جدول جديد = migration + RLS في نفس الملف. لا جدول بدون RLS.
4. النصوص من i18n/ar.json وen.json. لا نص عربي مكتوب داخل JSX.
5. Tailwind بالخصائص المنطقية (ps/pe/ms/me/start/end). ممنوع ml/mr/left/right إلا للأيقونات المتماثلة.
6. استوديو جديد = ملف content/studios/<id>.json + سطر في seed. لا صفحة جديدة إلا إذا خرج عن StudioWizard.
7. نموذج جديد = سطر في content/models/*.json بتكلفة = ceil(سعر المزوّد بالدولار × 3 ÷ 0.042).
8. لا تحذف أصول المستخدمين أو سجلات الرصيد أبدًا في migration. الحذف منطقي (deleted_at).

## الأوامر
- npm run dev            ← الواجهة على localhost:5173
- supabase start         ← Postgres + Functions محليًا (Docker)
- supabase functions serve generate-media --env-file supabase/.env.local
- supabase db push       ← يحتاج تأكيدًا مني دائمًا
- npm run gen:types      ← supabase gen types typescript --local > packages/shared/db.ts
- npm test               ← vitest (الرصيد، التسعير، المحوّلات) — يجب أن ينجح قبل أي commit

## عند التردد
اقرأ docs/blueprint.md. إذا خالفته اكتب ADR في docs/decisions/ قبل الكود.
```

**سكيلز المشروع الأربعة** (في `.claude/skills/`، كل واحد SKILL.md قصير):

| السكيل | ماذا يفعل عند استدعائه |
| --- | --- |
| `/new-studio <id>` | ينشئ `content/studios/<id>.json` بالقالب، يضيف النصوص لـi18n، يزرع السجل، يضيف بطاقة للرئيسية |
| `/new-model <slug>` | يسحب سعر النموذج من صفحة Replicate، يحسب الرصيد، يضيف السجل، يكتب اختبار توليد واحد |
| `/new-edge-fn <name>` | ينشئ الوظيفة بنمط `_shared` (تحقق JWT، أخطاء موحّدة، CORS) |
| `/demo-video <n>` | يقرأ السطر n من جدول القسم 9، يولّد 3 نسخ عبر المنصة، يرفع الأفضل إلى Stream، يحدّث `content/demo/` |

## 13. المخاطر والقانون

أكبر خطرين ليسا تقنيين: **المحتوى الذي يولّده المستخدمون** و**الاعتماد على مزوّد واحد**. كلاهما يُعالج من اليوم الأول بتكلفة صفر تقريبًا، وبتكلفة كبيرة بعد الإطلاق.

| الخطر | الأثر | الإجراء |
| --- | --- | --- |
| محتوى مخالف (وجوه أشخاص حقيقيين، محتوى جنسي، إساءة دينية أو سياسية) | حجب الموقع في السعودية أو إغلاق حساب المزوّد | فحص البرومبت قبل الحجز (القسم 5 خطوة 5)، رفض رفع صور أشخاص حقيقيين للـUGC إلا بإقرار صريح أنها للمستخدم نفسه، المعرض العام يُراجَع يدويًا قبل النشر في السنة الأولى، زر إبلاغ على كل أصل عام |
| انقطاع أو تغيير أسعار Replicate | توقف التوليد أو خسارة على كل عملية | محوّل fal جاهز لنفس النماذج مع عمود `fallback_slug` في `models`؛ مراجعة أسعار شهرية وتحديث الرصيد في الجدول (هلاي يكتب "الأرقام تقريبية" لهذا السبب) |
| رخص النماذج التجارية | ادعاء "حقوق تجارية كاملة" بدون سند | النماذج المستضافة على Replicate وGoogle وfal تسمح بالاستخدام التجاري للنواتج حسب شروط كل نموذج — تُحفظ نسخة من شروط كل نموذج مفعّل في `docs/licenses/` وتُستبعد النماذج غير التجارية (بعض نماذج Flux المفتوحة مثلًا) |
| الرصيد المجاني يُستنزف بحسابات وهمية | خسارة مباشرة على المزوّدين | Turnstile على التسجيل، جدول `blocked_domains` للإيميلات المؤقتة (هلاي عنده نفس الجدول)، الرصيد المجاني يعمل على أرخص نموذج فقط، حد 3 حسابات لكل IP يوميًا |
| استردادات بنكية (chargebacks) | إيقاف حساب بوابة الدفع | شروط واضحة عند الشراء (رصيد رقمي يُستهلك فورًا)، سجل كامل لكل توليدة كدليل، استرداد طوعي خلال 7 أيام للرصيد غير المستخدم |
| بيانات المستخدمين خارج السعودية | مخالفة نظام حماية البيانات الشخصية (PDPL) | سياسة خصوصية تذكر صراحة أن البيانات تُعالج لدى مزوّدين خارج المملكة (هلاي يفعلها في بند "تشمل بيانات الذكاء الاصطناعي")، حد أدنى من البيانات (إيميل واسم فقط)، حذف الحساب ذاتيًا من الإعدادات |
| الوثيقة النظامية | بوابة الدفع وسلة تطلبان كيانًا | وثيقة العمل الحر تكفي لـMoyasar ولنشر تطبيق في سلة كمطوّر فردي؛ عند تجاوز 30 مشتركًا شهريًا تُنقل المنصة إلى سجل تجاري بنشاط "تطوير البرمجيات" (أو يُضاف النشاط للمؤسسة القائمة) |
| تشابه مع هلاي | شكوى علامة أو نسخ | اسم ولون وشعار ونصوص مختلفة بالكامل، ديمو مولّد بأنفسنا، لا نسخ لأي أيقونة أو صورة من موقعهم — البنية والأفكار ليست محمية، التعبير محمي |

**المستندات القانونية المطلوبة قبل الإطلاق:** شروط الخدمة (الرصيد، الاسترداد، المحتوى الممنوع، حدود المسؤولية بسقف المدفوع في 3 أشهر — نفس بند هلاي)، سياسة الخصوصية (PDPL + مزوّدون خارجيون)، سياسة الاستخدام المقبول (صفحة مستقلة قصيرة)، وسطر في الفوتر باسم الجهة والإيميل.

## 14. ما نقتبسه من Higgsfield

> تحديث 2026-10-23: جرد حيّ من داخل MCP الخاص بهم وخطة التفوّق المرتّبة في `docs/competitive/higgsfield-inventory-2026-10.md` و`docs/competitive/beat-higgsfield-halai.md` (ADR 0005 — الكتالوج عبر fal). هذا القسم يبقى المرجع الأصلي للميزات الاثنتي عشرة؛ الخطة الجديدة تضيف: النموذج التلقائي كافتراضي، رابط سلة/زد → إعلان، الصوت السعودي، الشخصية السعودية المتسقة، القوالب الموسمية، والحزم الصغيرة بالريال.

Higgsfield منصة بمئة نموذج وثلاثة عشر ميكروسيرفس وفريق كامل؛ لا ننسخ بنيتها بل نقتبس **سبع ميزات منتج** تنقص هلاي وتناسب التاجر السعودي، وكلها تُبنى فوق نفس `generate-media` ودفتر الرصيد. القراءة مبنية على واجهة MCP الرسمية (مئة أداة)، كتالوج نماذجها (الصفحة الأولى: 100 نموذج من أكثر)، وحزم الجافاسكربت لموقعها (2.5 MB من 87 ملفًا).

**بنيتها التقنية مقابل هلاي ومقابلنا:**

| الطبقة | Higgsfield | هلاي | رونق — القرار |
| --- | --- | --- | --- |
| الواجهة | TanStack Start (React بـSSR) + Vite، الصفحة تُرسل مرندرة (510 KB HTML) | React SPA | SPA، لكن صفحات البرومبتات والنماذج تُرندر مسبقًا (prerender) للسيو |
| المصادقة | Clerk (مدفوع) + خدمة device-auth للوكلاء | Supabase Auth | Supabase Auth + device flow في المرحلة 4 |
| الباك إند | بوابة `fnf-api-gw` أمام 13 خدمة: core, agent-gateway, campaign-api, score, series, notification, community, academy, ai-cmo, apps-marketplace, skills-marketplace, higgsclaw-cron, meet + Workers للـcanvas والدردشة | Edge Functions | Edge Functions — خدمة واحدة وجدول واحد لكل ميزة نقتبسها |
| تحديث الحالة | React Query polling (`refetchInterval`) | Supabase Realtime | Realtime (أرخص وأسرع) |
| الدفع | Stripe: Plus/Ultra شهري وسنوي، حزم 500/1000/2000/4000، تعبئة تلقائية، تجربة 3 أيام، فوترة فرق | Tap | Moyasar — Stripe لا يخدم المنشآت السعودية |
| الميديا | AWS S3 + CloudFront (4 توزيعات) + خدمة تحجيم `images.higgs.ai` | R2 + Cloudflare Images | R2 + Images |
| التحليلات | PostHog + Amplitude + Segment + GrowthBook (أعلام ميزات) + Datadog | بكسلات إعلانية فقط | PostHog (مجاني) من اليوم الأول — قمع التسجيل ← أول توليدة ← الدفع |
| النماذج | 42 صورة، 43 فيديو، 8 صوت، 7 ثلاثي أبعاد؛ 23 منها تحت اسم Higgsfield (Soul, Cinema Studio, Genjutsu, Katana, Ad Multiplier) = تغليف ببرومبت وإعدادات فوق نماذج الغير | 31 فيديو + صور | 5 نماذج ثم نزيد حسب الطلب |
| السكيلز | SKILL.md مُستضافة على السيرفر بإصدارات (`get_workflow_instructions`) — 12 ورك فلو | مستودع GitHub | مستضافة على السيرفر من جدول `studios` — نفس المصدر للواجهة وللوكلاء |

**الميزات التي نضيفها (مرتبة بالقيمة ÷ الجهد):**

| # | الميزة | كيف تعمل عند Higgsfield | لماذا تناسبنا | كيف نبنيها | المرحلة |
| --- | --- | --- | --- | --- | --- |
| 1 | **التعبئة التلقائية للرصيد** | عند نفاد الرصيد يُعرض auto-refill قبل الحزم؛ خصم تلقائي عند النزول تحت حد | أعلى إيراد للمستخدم بلا احتكاك؛ هلاي لا يملكها | توكن Moyasar محفوظ + حقل `auto_refill_threshold/amount` في profiles + فحص في `provider-webhook` بعد كل خصم | 2 |
| 2 | **عرض السعر قبل التنفيذ + سقف إنفاق للطلب** | `ads_studio_quote` يرجع التوزيع والإجمالي بلا حجز؛ كل توليد يقبل `max_credits` | ثقة التاجر بالرصيد وحماية من وكيل خارج السيطرة | نقطة `estimate` في `generate-media` (تسعير بلا حجز) + حقل `maxCredits` يرفض إن تجاوزته التكلفة | 1 |
| 3 | **نموذج "تلقائي"** | مودل `image_auto` يختار النموذج حسب البرومبت؛ `models_explore recommend` للوكلاء | التاجر لا يعرف الفرق بين Kling وSeedance ولا يريد | خيار افتراضي "تلقائي": تصنيف بـClaude Haiku (نص على الصورة ← Nano Banana Pro، منتج واقعي ← Seedream، سريع ← Flux) داخل `prompt-enhancer` | 1 |
| 4 | **الصوت باللهجة + استنساخ الصوت + مزامنة الشفاه** | 8 نماذج صوت (ElevenLabs v4, Qwen TTS, Inworld)، `create_voice` من تسجيل، `sync_so` للشفاه، `dubbing` | هلاي يعترف أن استنساخ الصوت "قادم"؛ صوت سعودي حقيقي في UGC = أقوى نقطة بيع عندنا | ElevenLabs API (العربية مدعومة) للـTTS والاستنساخ بموافقة صريحة + Sync Lipsync عبر fal + جدول `voices` | 3 |
| 5 | **مضاعف الإعلان (Ad Multiplier)** | فيديو 4–30 ث ← استبدال الأشخاص/المنتج/الخلفية أو إعادة تصوير لسوق آخر، مبني على Seedance 2.5 بوضع `video_edit`/`omni_reference` | التاجر عنده إعلان واحد ناجح ويريد 10 نسخ للاختبار | استوديو جديد في `studios` يستدعي Seedance 2.5 video-edit على Replicate بمرجع الفيديو + صورة المنتج | 4 |
| 6 | **تقييم قبل النشر (Virality Score)** | خدمة `fnf-score` + أداة `virality_predictor`: قوة الـhook، خطر التسرب، استجابة الجمهور | ميزة غير موجودة بالعربي إطلاقًا | Gemini بفهم الفيديو + برومبت تقييم موحّد ← درجة من 100 + 3 توصيات؛ تكلفة رصيد 2 | 3 |
| 7 | **الجدولة التلقائية (وكيل يشتغل وحده)** | خدمة `higgsclaw-cron` + `ai-cmo`: مهام دورية تولّد وتنشر | هذا بالضبط ما تبيعه هاي لينك — تمييز لا يستطيعه هلاي | "خطة محتوى أسبوعية": التاجر يختار منتجات وإيقاعًا ← Supabase Cron + n8n يولّد ثلاث صور وريل كل يوم ويرسلها واتساب للموافقة | 4 |
| 8 | **النشر المباشر لتيك توك** | `tiktok_connect` → `tiktok_music_trending` → `tiktok_prepare_publish` → `publish_status` | يختصر الطريق من التوليد للنشر؛ تيك توك أول منصة للمتاجر السعودية | TikTok Content Posting API (يحتاج موافقة تطبيق) + Instagram Graph — نفس بنية مشروع أتمتة النشر القائم | 4 |
| 9 | **المسابقات** | مسابقات مجتمع بجوائز وتصويت (127 موضعًا في الكود) | أرخص محرك محتوى وتسجيلات؛ هلاي جرّبها في اليوم الوطني (وظائف `nd_*`) | جدول `contests` + تصويت في المعرض + جائزة رصيد؛ مسابقة شهرية بموضوع سعودي (التأسيس، رمضان، العيد) | 3 |
| 10 | **فرق ومساحات عمل بفوترة موحّدة** | `workspace_kind: team_owner/team_member`، رصيد مشترك، المالك فقط يشتري | وكالات التسويق السعودية تدير 10 متاجر | جدول `workspaces` + `workspace_members` والرصيد على مستوى المساحة؛ باقة "وكالات" | 3 |
| 11 | **إشعارات اكتمال التوليد** | خدمة `fnf-notification` | الفيديو يأخذ دقيقتين والمستخدم يترك الصفحة | Web Push + إيميل Resend من `provider-webhook` | 2 |
| 12 | **سكيلز مستضافة بإصدارات للوكلاء** | كل ورك فلو SKILL.md مُستضاف برقم إصدار يُحمّل عند الطلب | تحديث السكيل بدون ما يحدّث المستخدم شيئًا | أداة MCP `get_studio_instructions` تقرأ من `studios.skill_md` | 4 |

**ما لا نقتبسه الآن:** الثلاثي الأبعاد (Meshy) والـrigging، باني المواقع والألعاب، سوق التطبيقات والسكيلز الخارجية، محرر الفيديو الأصلي (Higgsedit) والـcanvas بطبقات، والأكاديمية — كلها منتجات مستقلة تحتاج فرقًا. المونتاج والشورتس تبقى في مسار Remotion القائم خارج المنصة حتى يثبت الطلب.

**درس التسعير من Higgsfield:** ثلاث روافع لا يملكها هلاي — تجربة 3 أيام بـ 0 ريال تتحول لاشتراك تلقائيًا (ببطاقة)، "غير محدود 7 أيام" كإضافة مدفوعة على نماذج رخيصة، والتعبئة التلقائية. نبدأ بالتعبئة التلقائية (المرحلة 2) ونجرّب "غير محدود 7 أيام" بـ 49 ريالًا على نموذج الصور السريع في المرحلة 3.

- [ ] إضافة الميزات 2 و3 إلى عقد `generate-media` في القسم 5 قبل بدء المرحلة 1
- [ ] إضافة جدولي `voices` و`workspaces` إلى migration المرحلة 3
- [ ] طلب وصول TikTok Content Posting API في الأسبوع 6 (المراجعة تأخذ أسابيع)

## 15. ضمان الجودة: بناء بلا أخطاء ونتائج مضبوطة

القاعدة الواحدة: **تحقّق قبل الخصم، تحقّق قبل التسليم، وقِس كل يوم.** أكثر أخطاء منصات التوليد ليست في الكود بل في الحدود: بارامتر خاطئ يُرسل للمزوّد، ناتج معطوب يُسلّم للمستخدم، أو رصيد يُخصم مرتين. ست طبقات تغلق هذه الحدود.

| الطبقة | ما تمنعه | كيف |
| --- | --- | --- |
| 1. مخطط المدخلات | بارامتر لا يقبله النموذج (نسبة غير مدعومة، مدة خارج النطاق، صورة أكبر من الحد) | Replicate ينشر مخطط كل نموذج (`GET /v1/models/{owner}/{name}` → `latest_version.openapi_schema`)؛ يُخزّن في `models.input_schema` ويُتحقق به (zod/ajv) **قبل الحجز**؛ الواجهة تعرض فقط الخيارات الموجودة في المخطط (هلاي يكتبها يدويًا في الكود — مصدر أخطاء) |
| 2. البرومبت | برومبت عربي خام يعطي نتيجة ضعيفة أو نصًا مشوّهًا | `prompt-enhancer` يحوّل للإنجليزية بقالب ثابت (الموضوع، الإضاءة، العدسة، النسبة، النص المطلوب حرفيًا بين علامات)؛ المستخدم يرى النسخة المحسّنة ويوافق؛ النص العربي على الصور يذهب لنانو بنانا برو فقط |
| 3. التسعير والرصيد | خصم مزدوج، رصيد سالب، حجز عالق | قفل ذرّي في `hold_credits`، مفتاح idempotency = `assetId`، وظيفة تسوية يومية تقارن الحجوزات بالأصول وتحرّر أي حجز بلا أصل مكتمل بعد 30 دقيقة |
| 4. المزوّد | فشل صامت، webhook ضائع، تكرار | توقيع متحقّق، `webhook_events` فريد، وظيفة مسح كل 5 دقائق تسأل المزوّد عن أي أصل `processing` تجاوز ضعف مدته المتوقعة (شبكة أمان للـwebhook)؛ محوّل fal بديل لنفس النموذج |
| 5. **بوابة المخرجات** | ناتج معطوب أو مخالف أو بنص عربي خاطئ يصل للمستخدم | فحص آلي داخل `provider-webhook` قبل `completed` (التفاصيل أدناه) — الفشل = إعادة تلقائية ثم استرداد |
| 6. القياس المستمر | تراجع جودة نموذج بعد تحديث المزوّد دون أن تلاحظي | مجموعة ذهبية تُشغّل أسبوعيًا + إبهام المستخدم على كل نتيجة + لوحة نسبة الفشل لكل نموذج |

**بوابة المخرجات — تُنفّذ على كل ناتج قبل أن يراه المستخدم:**

1. **سلامة الملف**: حجم > 0، يُفك ترميزه، الأبعاد تطابق النسبة المطلوبة (±2%)، مدة الفيديو ضمن ±0.5 ث، ليس إطارًا أسود كاملًا (متوسط السطوع > 8).
2. **الأمان**: علامات المزوّد (NSFW) + تصنيف Gemini للصورة المصغّرة؛ المخالف يُرفض ويُسترد رصيده ويُسجّل.
3. **النص العربي** (استوديو الإعلانات): Gemini يقرأ النص المطبوع على الصورة ويُقارن بالمطلوب — اختلاف حرف واحد أو أكثر أو حروف مقطّعة = إعادة توليد ببذرة جديدة. هذا الفحص وحده هو الفرق بين "أداة AI" و"إعلان جاهز للنشر".
4. **مطابقة المنتج** (استوديو المنتجات/UGC): Gemini يقارن الناتج بصورة المرجع ويعطي درجة تشابه من 10؛ أقل من 7 = إعادة بوزن مرجع أعلى.
5. **سياسة الإعادة**: محاولتان كحد أقصى على حساب المنصة (لا تُخصم من المستخدم)، ثم فشل نهائي برسالة عربية واضحة واسترداد كامل. نتيجة كل فحص تُحفظ في `assets.metadata.qa` لتحليلها لاحقًا.
6. تكلفة البوابة: نداء Gemini Flash واحد أو اثنان لكل ناتج ≈ 0.001 دولار — لا تُذكر في الرصيد.

**المجموعة الذهبية (Golden Set):** 30 برومبتًا ثابتًا تمثّل استخدامات العملاء (10 منتجات، 8 إعلانات بنص عربي، 6 UGC، 6 فيديو حر) تُشغّل كل أحد على كل نموذج مفعّل وعند إضافة أي نموذج أو تعديل أي قالب برومبت. النتائج تُقيّم بـGemini (مطابقة البرومبت، الجودة، صحة النص) وتُحفظ في جدول `evals`؛ انخفاض أكثر من 10% عن الأسبوع السابق يعطّل النموذج تلقائيًا (`models.enabled=false`) ويرسل تنبيهًا. التكلفة ≈ 15 دولارًا أسبوعيًا — أرخص بكثير من عميل يرحل.

**بناء بلا أخطاء — الانضباط الهندسي:**

| الممارسة | التطبيق |
| --- | --- |
| أنواع صارمة | TypeScript `strict`، أنواع قاعدة البيانات مولّدة (`supabase gen types`) وتُحدّث في CI، zod على كل حد: مدخلات Edge Functions، ردود المزوّدين، webhooks |
| بيئتان | مشروع Supabase للتجريب (staging) + مشروع إنتاج؛ الواجهة على Cloudflare Pages تعطي رابط معاينة لكل فرع؛ مفاتيح المزوّدين في staging بسقف إنفاق 20 دولارًا |
| الهجرات | كل تغيير بـ`supabase db diff` ويُراجَع قبل التطبيق؛ لا تعديل مباشر على الإنتاج أبدًا؛ نسخ احتياطي باسترجاع نقطي (PITR) مفعّل |
| اختبارات المال أولًا | اختبارات vitest لـ`hold/charge/refund` والتسعير والتسوية تُكتب قبل الكود؛ اختبار RLS بمستخدمين (أُ يحاول قراءة أصول ب) |
| اختبار شامل | Playwright على ثلاث رحلات فقط: تسجيل ← توليد ← نتيجة؛ شراء ← رصيد؛ استوديو المنتجات كاملًا — تُشغّل قبل كل إصدار على staging بنموذج وهمي (mock provider) |
| بوابات CI | lint + typecheck + tests + تجربة migration على قاعدة مؤقتة — أي فشل يمنع الدمج |
| إطلاق تدريجي | نموذج جديد يُفعّل لـ 10% من المستخدمين (عمود `rollout_pct`) يومًا واحدًا قبل الجميع |
| المراقبة | Sentry للأخطاء، لوحة إدارة بنسبة الفشل ومتوسط الزمن لكل نموذج، تنبيه عند فشل > 10% خلال ساعة أو طابور > 50 |
| التسوية اليومية | وظيفة تقارن: مجموع الدفعات مع Moyasar، الحجوزات مع الأصول، ملفات R2 مع الجدول — وترسل تقريرًا صباحيًا |

**تعريف "منجز" لأي ميزة (لا تُدمج بدونه):**

- [ ] مدخلاتها متحقّق منها بـzod ورسائل الخطأ بالعربية
- [ ] اختبار وحدة لأي منطق يلمس الرصيد أو التسعير
- [ ] جُرّبت على staging بتوليدة حقيقية واحدة على الأقل ومرّت ببوابة المخرجات
- [ ] الفشل فيها يسترد الرصيد ويظهر رسالة مفهومة (جُرّب بقطع مفتاح المزوّد عمدًا)
- [ ] مراجعة من جلسة Claude Code جديدة لم تكتب الكود (مراجعة بعين جديدة)
- [ ] سطر في CHANGELOG وتحديث CLAUDE.md إن تغيّرت قاعدة

**قواعد العمل مع Claude Code لتجنّب الأخطاء:** خطة قبل الكود (plan mode) لأي مهمة تلمس أكثر من ملفين؛ ميزة واحدة لكل فرع؛ الاختبارات تُشغّل في نهاية كل جلسة؛ ممنوع `--force` و`db reset` على غير المحلي؛ أي تغيير في الرصيد أو الدفع يُراجَع من جلسة ثانية قبل الدمج؛ وكل قرار يخالف هذا المخطط يُكتب في `docs/decisions/` قبل تنفيذه.

## 16. السكيلز: كيف يبنونها وكيف نبني سكيلزنا

الفرق الجوهري: **سكيلز هلاي رقيقة** (تقول للوكيل أي أداة يستدعي، وهندسة البرومبت كلها على السيرفر)، و**سكيلز Higgsfield سميكة** (السكيل نفسه يكتب البرومبت بقالب مُقسّم، ويفحص النتيجة، ويعيد). نحن نأخذ شكل هلاي وعمق Higgsfield: الوصفات السميكة تعيش على السيرفر في جدول `studios` لتخدم الواجهة والوكلاء معًا، والسكيلز العامة تبقى رقيقة.

**هلاي — 4 سكيلز على GitHub (قرأت المستودع كاملًا، 105 KB):**

| السكيل | الأداة التي تستدعيها | المدخلات | ما فيه من خبرة |
| --- | --- | --- | --- |
| `halai-generate` | `generate_image` / `generate_video` | prompt, aspect\_ratio, count 1–4, duration 4–10، reference\_image\_url | افتراضيات النسب حسب المنصة، الوكيل لا يمرر اسم نموذج أبدًا (السيرفر يختار) |
| `halai-ugc-studio` | `generate_ugc_video` | script ≤ 1000 حرف، presenter\_image\_url، product\_image\_url، 9:16 | ميزانية الكلمات 150 كلمة/دقيقة (15 ث = 35 كلمة)، الخطاف في أول 3 كلمات، دليل صورة المقدّم |
| `halai-product-studio` | `generate_product_shot` | product\_image\_url، scene\_prompt، count | لوحة مشاهد: ستوديو / لايف ستايل / بنترست / هيرو / فاخر / **تراث سعودي** / **رمضان والعيد** |
| `halai-marketing-studio` | `generate_marketing_asset` | output\_type image/video، product\_image\_url، prompt، style | النص العربي على الصورة يُوجّه حصرًا لهنا (GPT Image 2 للتايبوغرافي)، النص يُكتب حرفيًا بين « » |

الملفات المحيطة أهم من السكيلز نفسها: `SCENARIOS.md` (18 KB) هو **دليل التوجيه** — جدول "المستخدم يقول → السكيل → الأداة → الوسائط"، قواعد فضّ التعارض (الأخص يفوز)، حالات خاصة للعربية، سلاسل متعددة الخطوات عبر الروابط، وقائمة أنماط ممنوعة. و`CLAUDE.md` يفرض: قاعدة 300 سطر لكل SKILL.md، كل سكيل مكتفٍ بذاته (لا `../`)، رقم إصدار واحد في 9 أماكن يفحصه CI، وCI يفشل إذا ظهرت كلمة `fal` أو `replicate` في أي ملف. قواعد الوكيل الثابتة: لا polling (نداء واحد `wait:true` يحجز 90 ث على السيرفر)، سؤال واحد فقط عند الغموض، الرد بلغة المستخدم، ولا تُذكر البنية التحتية أبدًا ("نموذج من Google" لا "Replicate").

**Higgsfield — 13 ورك فلو مُستضافًا على السيرفر** (تُحمّل عند الطلب بـ`get_workflow_instructions`، ومراجعها بـ`get_workflow_bundle_file`): ad-multiplier، ads-studio، brand-asset-creation، character-sheet، faceless-video، katana، narration، product-photoshoot، thumbnail-generation، ugc-video، video-editing، video-montage، website-builder-flow. قرأت ثلاثة منها بالكامل مع مراجعها. بنية السكيل السميك عندهم:

| العنصر | مثال من product-photoshoot | لماذا يضبط النتيجة |
| --- | --- | --- |
| أوضاع (modes) لكل واحد ملف مرجع | 10 أوضاع: product-shot, lifestyle, closeup-with-person, pinterest-pin, hero-banner, carousel, ad-pack, virtual-model, conceptual, restyle | يُحمّل ملف الوضع المختار فقط — سياق أقل، دقة أعلى |
| قوالب أسلوب (presets) | 8 للباكشوت: clean-studio, dramatic-studio, minimal, etsy-handmade, luxury-editorial, vibrant-color, floating, ingredient-flatlay — كل واحد بتوقيع بصري مكتوب | المستخدم يختار بالاسم، والسكيل يترجمه لوصف دقيق |
| قالب برومبت بأقسام مسمّاة | `[SUBJECT] [COMPOSITION] [LIGHTING] [LENS & CAMERA] [MATERIALS] [COLOR PALETTE] [STYLE REFERENCE] [BRAND] [QUALITY MARKERS] [AVOID]` وينتهي بـ `resolution: 2k` | النموذج يستجيب للبنية أكثر من النثر؛ لا قسم يُنسى |
| مراجع مصوّرين مُعقّمة | أسماء مصورين داخليًا لكل preset، لكن البرومبت يأخذ **الوصف** (إضاءة، سطح، باليت) ولا يذكر الاسم أبدًا؛ فحص قبل كل إرسال | جودة المحترفين بلا مخاطر قانونية |
| قاعدة النص الثلاثية | نص محدد → يُكتب حرفيًا داخل التكوين؛ سيضيف النص بنفسه → "مساحة هادئة متجانسة لونيًا داخل المشهد" (ليس "negative space" لأنها تنتج شريطًا فارغًا قبيحًا)؛ لم يذكر نصًا → لا تذكر النص إطلاقًا | أكثر سبب لصور إعلانات سيئة |
| بوابات جودة مكتوبة | قائمة تحقق: المنتج مطابق للمرجع، الإضاءة لها اتجاه، الظلال منطقية، نص الملصق حاد غير مشوّه، لا أثر AI على الحواف | نفس فكرة بوابة المخرجات في القسم 15 |
| تمرير تحسين محدود | تحسينان كحد أقصى لكل صورة، 3 إرسالات كحد أقصى، التحسين يأخذ آخر نسخة مرجعًا ويغيّر العيب المسمّى فقط | يمنع حرق الرصيد في حلقات |
| افتراضيات صامتة | "نفّذ بدون أسئلة" = 3 نسخ، clean-studio، 1:1، ألوان المنتج؛ وترتيب أولوية للأسئلة عند الحاجة؛ **ممنوع السؤال عن النموذج أو العدسة أو الإضاءة** (قرارات حرفة مقفلة) | التاجر يريد نتيجة لا استجوابًا |
| ثبات هوية المنتج عبر المجموعة | أول صورة تُولّد وتُعتمد، ثم تصير مرجعًا لبقية الزوايا | نفس المنتج في كل الصور |
| صدق في الفحص البصري | إن لم يستطع الوكيل رؤية الصورة يصرّح "لم تُفحص بصريًا" ولا يدّعي اجتياز البوابات | ثقة |

سكيل UGC عندهم أعمق بكثير (المرجع الواحد 64 KB): 6 صيغ (review, product, unboxing, try-on, tutorial, website)، سكريبت تخطيط المدة، لوحة 21:9 بثماني لقطات تُولّد أولًا ثم تتحول إلى كليب Seedance 2.5 بثماني قطعات داخلية وصوت أصلي، "قانون الخطاف في 0.1 ثانية"، قائمة عبارات ممنوعة تكشف AI، منع التحيات في الكليبات التالية، وقاعدة "فعل واحد للمنتج في كل قطعة". وسكيل Ads Studio يتبع نفس مبدئنا: بحث البراند من الموقع → انتظار الجاهزية → عرض سعر → "نعم" صريحة → توليد بمفتاح idempotency — ولا شيء يُنفق قبل الموافقة.

**تصميم سكيلز رونق — طبقتان:**

| الطبقة | أين تعيش | ما تحتوي | من يستخدمها |
| --- | --- | --- | --- |
| وصفات الاستوديوهات (سميكة) | جدول `studios` — تُحرّر كملفات `content/studios/*.json` وتُزرع | الأوضاع، الـpresets بتوقيعها البصري، قالب البرومبت بالأقسام، النفي، بوابات الجودة، النموذج المقفل، حدود الإعادة | `generate-media` ينفّذها للواجهة وللـMCP بنفس الكود — مصدر حقيقة واحد |
| سكيلز الوكلاء (رقيقة) | مستودع `highlink-skills` عام + تُخدم من `/v1/skills/{name}` بإصدار | أي أداة تُستدعى ومتى، الافتراضيات، قواعد UX، جدول أخطاء، سلاسل | Claude Code / Cursor / Codex عبر MCP |

سكيلز الوكلاء الخمسة: `highlink-generate`، `highlink-product`، `highlink-ads`، `highlink-ugc`، و\*\*`highlink-plan`\*\* (خطة محتوى أسبوعية من متجر سلة — لا يملكها أحد) + `SCENARIOS.md` بقواعد عربية إضافية (اللهجة في السكريبت، المناسبات السعودية، الأرقام العربية على الصور) + ملفات `.claude-plugin` و`.cursor-plugin` و`.codex-plugin` مثل هلاي حرفيًا.

**مثال وصفة استوديو (الطبقة السميكة) — `content/studios/product-shot.json`:**

```json
{
  "id": "product-shot",
  "name_ar": "استوديو المنتجات",
  "model": "nano-banana-pro",
  "locked": true,
  "inputs": { "product_image": "required", "scene": "optional", "preset": "optional", "text": "optional", "count": { "default": 3, "max": 6 } },
  "defaults": { "preset": "clean-studio", "aspect_ratio": "1:1", "resolution": "2K" },
  "presets": {
    "clean-studio":   { "ar": "ستوديو نظيف", "signature": "seamless white-to-light-grey gradient, soft frontal key, minimal shadow" },
    "saudi-heritage": { "ar": "تراث سعودي", "signature": "warm earth tones, aged wood or carved stone surface, oud and coffee accents, soft amber light" },
    "ramadan":        { "ar": "رمضاني", "signature": "warm lanterns, dates and coffee props, soft amber light, subtle geometric motifs" },
    "luxury":         { "ar": "فاخر", "signature": "polished marble or velvet, low warm key light, controlled reflections" }
  },
  "prompt_template": "[SUBJECT] Hero shot of the referenced product exactly as shown, {{material}}, label text preserved sharp.\n[COMPOSITION] {{angle}}, {{framing}}, product occupies 55-70% of frame.\n[LIGHTING] {{preset.signature}}.\n[LENS] 85mm, f/5.6, sharp focus on the label.\n[PALETTE] product colours dominant, {{brand_colors|neutral}}.\n[TYPOGRAPHY] {{#if text}}Integrated typography reads «{{text}}» in bold modern Arabic typeface, high contrast, correctly shaped letters{{/if}}.\n[QUALITY] tack-sharp, photorealistic, commercial grade.\n[AVOID] warped letters, extra fingers, duplicated product, watermark, flat empty bands.",
  "negative": "blurry, low-res, distorted label, mirrored text, extra products",
  "qa": { "product_match_min": 7, "arabic_text_exact": true, "max_retries": 2 },
  "cost_credits": 10
}
```

**قالب سكيل الوكيل (الطبقة الرقيقة) — `highlink-product/SKILL.md`، أقل من 120 سطرًا:**

```markdown
---
name: highlink-product
version: 0.1.0
description: صور منتجات احترافية عبر استوديو هاي لينك. استخدمه عند: "صور منتجي"، "صورة ستوديو"، "صور لسلة"، "خلفية بيضاء"، "منتجي على رخام". ليس للإعلانات بنص (highlink-ads) ولا لفيديو مقدّم (highlink-ugc).
allowed-tools: mcp__highlink__run_studio, mcp__highlink__estimate, mcp__highlink__check_generation, mcp__highlink__upload_reference, mcp__highlink__get_credits
---
# استوديو هاي لينك — المنتجات
1. المدخلات: صورة المنتج (إلزامية — ارفعها بـupload_reference)، المشهد أو الـpreset، النص إن وُجد حرفيًا بين « ».
2. افتراضيات صامتة: 3 نسخ، clean-studio، 1:1. لا تسأل عن النموذج أو الإضاءة أو العدسة — قرارات مقفلة على السيرفر.
3. estimate(studio:"product-shot", count) → اعرض التكلفة بالرصيد → نفّذ فقط بعد موافقة أو إذا قال "نفّذ مباشرة".
4. run_studio(...) → check_generation(asset_id, wait:true) مرة واحدة؛ timed_out → نداء واحد آخر. لا حلقات.
5. التسليم: الروابط + سطر واحد (الـpreset، النسبة، نتيجة فحص الجودة كما أرجعها السيرفر). لا أسماء نماذج، لا برومبت، لا معرّفات.
6. الأخطاء: INSUFFICIENT_CREDITS → رابط الباقات؛ QA_FAILED → السيرفر أعاد واسترد، اعرض السبب واقترح تعديل المدخل.
راجع SCENARIOS.md عند التردد بين السكيلز.
```

الفرق عن هلاي: أداة واحدة `run_studio` بدل أداة لكل استوديو (استوديو جديد = سجل جديد بلا تغيير في MCP)، و`estimate` قبل التنفيذ، والسيرفر يرجع نتيجة بوابة الجودة مع كل أصل. الفرق عن Higgsfield: الوكيل لا يكتب برومبتًا ولا يفحص صورة — كل ذلك على السيرفر، فالنتيجة واحدة سواء جاء الطلب من الموقع أو من Claude أو من تطبيق سلة.

- [ ] كتابة وصفات الاستوديوهات الثلاثة الأولى بهذا الشكل قبل المرحلة 2 (منتجات، إعلانات، UGC)
- [ ] نسخ بنية مستودع هلاي (`_template`، `SCENARIOS.md`، ملفات plugin، CI التحقق) كهيكل لمستودع `highlink-skills` في المرحلة 4
- [ ] اقتباس قائمة "عبارات تكشف AI" وقانون الخطاف من سكيل UGC عند Higgsfield وتعريبهما للهجة السعودية في وصفة UGC

## المصادر

التحليل التقني مبني على قراءة حزمة الجافاسكربت الرئيسية للموقع (`index.mvi66flv-qwsQk8hA.js`، 7.0 MB) وحزمتي React وSupabase بتاريخ 21 أكتوبر 2026، إضافة إلى الصفحات العامة:

- [الصفحة الرئيسية لهلاي](https://halaiapp.ai/) — البنية، البكسلات، مفاتيح Tap العامة، قائمة النماذج
- [الأسعار](https://halaiapp.ai/pricing) — الباقات والرصيد والأسئلة الشائعة
- [صفحة MCP](https://halaiapp.ai/mcp) — الأدوات، OAuth 2.1، الحدود
- [شروط الخدمة](https://hallah.ai/terms) و[سياسة الخصوصية](https://hallah.ai/privacy) — الكيان، Tap، الاسترداد، حدود المسؤولية
- [مستودع hallah-ai/skills](https://github.com/hallah-ai/skills) — أسماء أدوات MCP وبنية السكيلز
- [تطبيق هلاي في متجر سلة](https://apps.salla.sa/ar/app/1573412430) — باقات التجار والضريبة
- [حساب هلاي على X](https://x.com/halaiapp) — إيقاع النشر وتاريخ الإنشاء (فبراير 2026)

أسعار المزوّدين في القسم 7 تقريبية من الذاكرة وتُراجَع من صفحات Replicate وGoogle AI قبل ضبط الرصيد.
