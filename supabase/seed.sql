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
-- nano-banana-pro عبر Replicate (ADR 0003): سعر Replicate بتاريخ 2026-10-22: 1K/2K = 0.15$ → 11، 4K = 0.30$ → 22.
--   supports.resolution_multipliers يطغى على معامل الدقة العام (applyModelResolution)، وinput_schema من مخطط Replicate (المخطط §15 الطبقة 1).
--   المرحلة 1 تُفعّل nano-banana-pro فقط؛ الباقي enabled=false حتى تُبنى محوّلاتها وتُختبر (الجلسات التالية).
insert into public.models (id, name_ar, name_en, type, provider, provider_slug, fallback_slug, cost_credits, cost_per_second, max_duration_s, supports, default_params, input_schema, enabled, badge, sort) values
  ('nano-banana-pro', 'نانو بنانا برو', 'Nano Banana Pro', 'image', 'replicate', 'google/nano-banana-pro', null,
     11, null, null,
     '{"ref_images":14,"text":true,"sizes":["1K","2K","4K"],"aspect_ratios":["1:1","9:16","16:9","4:5","3:4"],"resolution_multipliers":{"1K":1,"2K":1,"4K":2}}',
     '{"imageSize":"2K","aspectRatio":"1:1"}',
     '{"required":["prompt"],"properties":{"prompt":{"type":"string"},"image_input":{"type":"array","items":{"type":"string","format":"uri"},"maxItems":14,"default":[]},"aspect_ratio":{"type":"string","enum":["match_input_image","1:1","2:3","3:2","3:4","4:3","4:5","5:4","9:16","16:9","21:9"],"default":"match_input_image"},"resolution":{"type":"string","enum":["1K","2K","4K"],"default":"2K"},"output_format":{"type":"string","enum":["jpg","png"],"default":"jpg"},"safety_filter_level":{"type":"string","enum":["block_low_and_above","block_medium_and_above","block_only_high"],"default":"block_only_high"},"allow_fallback_model":{"type":"boolean","default":false}},"output":{"type":"string","format":"uri"}}',
     true, 'جديد', 1),
  ('flux-fast',       'فلوكس السريع',  'FLUX fast',       'image', 'replicate', 'black-forest-labs/flux-schnell', 'fal-ai/flux/schnell',
     3, null, null, '{"ref_images":0,"text":false,"sizes":["1K"],"aspect_ratios":["1:1","9:16","16:9","4:5","3:4"]}', '{}', null, false, null, 2),
  ('kling-v3-turbo',  'كلينج 3 تيربو', 'Kling 3 Turbo',   'video', 'replicate', 'kwaivgi/kling-v3-video', 'fal-ai/kling-video/v3/turbo',
     null, 5, 15, '{"i2v":true,"audio":true,"resolutions":["720p","1080p"],"aspect_ratios":["16:9","9:16","1:1"]}', '{"duration":5,"resolution":"720p"}', null, false, 'جديد', 3),
  ('seedance-2.5',    'سيدانس 2.5',    'Seedance 2.5',    'video', 'replicate', 'bytedance/seedance-2.5', null,
     null, 6, 15, '{"i2v":true,"audio":true,"resolutions":["480p","720p","1080p"],"aspect_ratios":["16:9","9:16","1:1"]}', '{"duration":5,"resolution":"720p"}', null, false, null, 4),
  ('veo-3.1-fast',    'فيو 3.1 فاست',  'Veo 3.1 Fast',    'video', 'replicate', 'google/veo-3.1-fast', null,
     null, 12, 8, '{"i2v":true,"audio":true,"resolutions":["720p","1080p"],"aspect_ratios":["16:9","9:16"]}', '{"duration":8,"resolution":"1080p"}', null, false, null, 5)
on conflict (id) do update set
  name_ar = excluded.name_ar, name_en = excluded.name_en, type = excluded.type, provider = excluded.provider,
  provider_slug = excluded.provider_slug, fallback_slug = excluded.fallback_slug, cost_credits = excluded.cost_credits,
  cost_per_second = excluded.cost_per_second, max_duration_s = excluded.max_duration_s, supports = excluded.supports,
  default_params = excluded.default_params, input_schema = excluded.input_schema, enabled = excluded.enabled, badge = excluded.badge, sort = excluded.sort;

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
