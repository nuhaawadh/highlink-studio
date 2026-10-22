-- seed.sql — البيانات الابتدائية (المخطط §7 و§16). تُشغَّل بعد migrations محليًا: supabase db reset
-- أسعار المزوّدين تقريبية — تُراجَع من صفحات Replicate/Google قبل الإطلاق وتُحدَّث هنا لا في الكود.

insert into public.plans (id, name_ar, name_en, monthly_credits, price_sar_monthly, price_sar_yearly, max_concurrent, private_by_default, sort) values
  ('free',     'مجاني',   'Free',     0,    0,    null, 1, false, 0),
  ('starter',  'ستارتر',  'Starter',  250,  39,   329,  2, true,  1),
  ('basic',    'بيسك',    'Basic',    500,  79,   659,  2, true,  2),
  ('pro',      'برو',     'Pro',      1250, 199,  1669, 4, true,  3),
  ('creators', 'كريتورز', 'Creators', 4000, 599,  5029, 8, true,  4)
on conflict (id) do update set
  name_ar = excluded.name_ar, name_en = excluded.name_en, monthly_credits = excluded.monthly_credits,
  price_sar_monthly = excluded.price_sar_monthly, price_sar_yearly = excluded.price_sar_yearly,
  max_concurrent = excluded.max_concurrent, private_by_default = excluded.private_by_default, sort = excluded.sort;

-- النماذج الخمسة للمرحلة 1 (المخطط §11). cost_credits = ceil(usd × 3 ÷ 0.042)
insert into public.models (id, name_ar, name_en, type, provider, provider_slug, fallback_slug, cost_credits, cost_per_second, max_duration_s, supports, default_params, enabled, badge, sort) values
  ('nano-banana-pro', 'نانو بنانا برو', 'Nano Banana Pro', 'image', 'google',    'gemini-3-pro-image-preview', null,
     10, null, null, '{"ref_images":3,"text":true,"sizes":["1K","2K","4K"],"aspect_ratios":["1:1","9:16","16:9","4:5","3:4"]}', '{"imageSize":"2K"}', true, 'جديد', 1),
  ('flux-fast',       'فلوكس السريع',  'FLUX fast',       'image', 'replicate', 'black-forest-labs/flux-schnell', 'fal-ai/flux/schnell',
     3, null, null, '{"ref_images":0,"text":false,"sizes":["1K"],"aspect_ratios":["1:1","9:16","16:9","4:5","3:4"]}', '{}', true, null, 2),
  ('kling-v3-turbo',  'كلينج 3 تيربو', 'Kling 3 Turbo',   'video', 'replicate', 'kwaivgi/kling-v3-video', 'fal-ai/kling-video/v3/turbo',
     null, 5, 15, '{"i2v":true,"audio":true,"resolutions":["720p","1080p"],"aspect_ratios":["16:9","9:16","1:1"]}', '{"duration":5,"resolution":"720p"}', true, 'جديد', 3),
  ('seedance-2.5',    'سيدانس 2.5',    'Seedance 2.5',    'video', 'replicate', 'bytedance/seedance-2.5', null,
     null, 6, 15, '{"i2v":true,"audio":true,"resolutions":["480p","720p","1080p"],"aspect_ratios":["16:9","9:16","1:1"]}', '{"duration":5,"resolution":"720p"}', true, null, 4),
  ('veo-3.1-fast',    'فيو 3.1 فاست',  'Veo 3.1 Fast',    'video', 'replicate', 'google/veo-3.1-fast', null,
     null, 12, 8, '{"i2v":true,"audio":true,"resolutions":["720p","1080p"],"aspect_ratios":["16:9","9:16"]}', '{"duration":8,"resolution":"1080p"}', true, null, 5)
on conflict (id) do update set
  name_ar = excluded.name_ar, name_en = excluded.name_en, type = excluded.type, provider = excluded.provider,
  provider_slug = excluded.provider_slug, fallback_slug = excluded.fallback_slug, cost_credits = excluded.cost_credits,
  cost_per_second = excluded.cost_per_second, max_duration_s = excluded.max_duration_s, supports = excluded.supports,
  default_params = excluded.default_params, enabled = excluded.enabled, badge = excluded.badge, sort = excluded.sort;

-- الاستوديو الأول — الوصفة السميكة تُقرأ من content/studios/product-shot.json (تُزرع بسكريبت seed:studios)
insert into public.studios (id, name_ar, description_ar, icon, badge, pipeline, cost_credits, enabled, sort) values
  ('product-shot', 'استوديو المنتجات', 'صور منتجات احترافية من صورة جوال عادية', 'shopping-bag', 'جديد',
   '{"source":"content/studios/product-shot.json"}', 10, false, 1),
  ('ads-grid', 'استوديو الإعلانات', '9 صور إعلانية بنص عربي من لقطة واحدة', 'layout-grid', 'رائج',
   '{"source":"content/studios/ads-grid.json"}', 12, false, 2),
  ('ugc', 'استوديو UGC', 'شخصية تتكلم بلهجة سعودية عن منتجك', 'user-plus', 'Beta',
   '{"source":"content/studios/ugc.json"}', 45, false, 3)
on conflict (id) do update set
  name_ar = excluded.name_ar, description_ar = excluded.description_ar, icon = excluded.icon, badge = excluded.badge,
  pipeline = excluded.pipeline, cost_credits = excluded.cost_credits, enabled = excluded.enabled, sort = excluded.sort;
