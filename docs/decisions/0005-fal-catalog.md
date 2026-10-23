# ADR 0005 — fal.ai مزوّد الكتالوج: كل النماذج الحديثة عبر محوّل واحد، وطبقات كتالوج مولّدة من بيانات المزوّد

**التاريخ:** 2026-10-23 · **الحالة:** معتمد (يعدّل سطر "النماذج" في ADR 0002/0003 ويُبقي نانو بنانا برو على Replicate)

## السياق
- الهدف المعلن: الوصول إلى ما وصلت إليه Higgsfield (تجميع كل نماذج الصور/الفيديو الكبرى في واجهة واحدة) وخدمة السوق العربي — وهلاي تعرض اليوم ~27 عائلة نماذج، كلها مأخوذة من fal/Replicate.
- fal.ai يعرض 1,627 نقطة نهاية (جُلب الكتالوج كاملًا في `content/catalog/fal-models.json` بتاريخ 2026-10-23) بواجهة واحدة (`queue.fal.run`)، فوترة واحدة، webhook موقّع بـED25519، ونماذج جديدة يوم إصدارها (Kling 4 نزل 2026-10-21 وهو على fal). Replicate يغطي أقل ويتأخر.
- المحرك (`generate-core`) كان يقبل الصور فقط ومزوّدًا واحدًا؛ مخطط المدخلات في `models.input_schema` يبني مدخلات المزوّد بلا كود لكل نموذج (المخطط §15) — نُبقي هذا المبدأ ونوسّعه.

## القرارات
1. **fal هو المزوّد الافتراضي لكل نموذج جديد.** Replicate يبقى لـ`nano-banana-pro` (ADR 0003، مختبَر في بوابة 1) ولأي نموذج لا يوجد إلا عنده. Gemini مباشرة يبقى مؤجلًا. المفتاح `FAL_KEY` في أسرار Edge Functions فقط.
2. **محوّل `_shared/providers/fal.ts`** بنفس واجهة `ProviderAdapter`: `submit` = `POST https://queue.fal.run/{endpoint}?fal_webhook=…` بـ`Authorization: Key`؛ الـwebhook يُتحقق منه بـ`_shared/fal-signature.ts` (الرسالة `request_id\nuser_id\ntimestamp\nsha256hex(body)`، مفاتيح JWKS من `rest.fal.ai` تُخزَّن مؤقتًا 12 ساعة وتُحدَّث مرة عند عدم التطابق — دوران المفاتيح)؛ `eventId = fal:{request_id}` للـdedupe لأن fal يرسل حدثًا نهائيًا واحدًا ويعيد الإرسال بنفس المعرّف عند غير 2xx. الناتج يُستخرج من الحمولة بالحقول المعروفة (`video.url`، `images[].url`، `audio.url`…) ثم بمسح عام؛ `OK` بلا ملف = فشل عندنا (لا يُؤكَّد خصم بلا ناتج). `provider-webhook` يقبل `source=fal`.
3. **كتالوج بثلاث طبقات، كلها بيانات لا كود:**
   - `content/catalog/fal-models.json` — كل fal (1,627) كما هو، يُحدَّث بـ`scripts/fal-catalog.py`.
   - `content/catalog/fal-launch.json` — قائمة الإطلاق المنسّقة يدويًا: **233** نقطة نهاية (فيديو 126، صور 86، صوت 21) = أحدث إصدار من كل عائلة تهمّ السوق (Kling 4/3، Seedance 2.5/2.0/1.5، Veo 3.1، Wan 3.0/2.6، Hailuo H3/H3 Max، Grok Imagine 1.5، FLUX 3 فيديو وصور، LTX 2.5، Luma Ray 3.2، PixVerse 6، Vidu Q4، Omni Flash 1.1، HeyGen Video، Nano Banana 2.1/2/Pro/Lite، Seedream 5/4.5، GPT Image 2/2.5، Ideogram 4.5 + متجهي + شخصية، Recraft 4.1، Qwen Image 3، Krea 3، Bria FIBO 2 + أدوات المنتجات، Topaz، ElevenLabs v4، MiniMax Speech 2.8، Sync 3، OmniHuman 2…). لكل صف: معرّف داخلي ≤ 40 حرفًا، اسم عربي/إنجليزي، `family`/`variant`/`kind`، وطبقة (`a` = يعمل بالمحرك الحالي، `b` = يحتاج مدخلات فيديو/صوت أو نوع audio — المرحلة 2). المستبعد عمدًا: 3D، التدريب، LLM/vision، الإصدارات القديمة.
   - `content/catalog/schemas/<endpoint>.json` و`content/catalog/pricing/<endpoint>.json` — مخطط OpenAPI الرسمي ونص السعر الرسمي لكل نقطة (`scripts/fal-schema.py` + جلب يدوي موثّق بالمصدر والثقة). **لا سعر من الذاكرة** (القاعدة 7).
   - `scripts/build-models-seed.py` يدمج الثلاثة ويكتب صفوف `models` داخل `supabase/seed.sql` بين `-- BEGIN/END fal-catalog (generated)`. تعديل أي نموذج = تعديل المصدر ثم إعادة التوليد؛ الكتلة لا تُحرَّر يدويًا.
4. **وحدات التسعير** (1 رصيد = 0.042$، هامش ×3 — المخطط §7):
   | وحدة fal | أعمدة `models` | ملاحظة |
   | --- | --- | --- |
   | بالثانية | `cost_per_second` = usd×3÷0.042 (رصيد/ث، 4 منازل)؛ `supports.cps_by_resolution` عند اختلاف السعر بالدقة؛ `supports.audio_cps` زيادة الصوت | التقريب لأعلى على الإجمالي (`ceil(perSecond × duration)`) لا على الثانية |
   | بالمقطع | `cost_credits` ثابت؛ `supports.credits_by_duration` عند اختلافه بالمدة | Luma Ray، Hailuo 2.3… |
   | بالصورة/بالطلب | `cost_credits` = ceil(usd×3÷0.042)؛ `supports.resolution_multipliers` من أسعار 1K/2K/4K | |
   | بالميغابكسل | 1K = 1 MP، 2K = 4 MP (تقريب محافظ لصالحنا)؛ `sizes = ['1K','2K']` | FLUX 2 Pro/Max/Flex، Krea 3 |
   | بالتوكنات | يُقبل فقط إن ذكرت صفحة fal سعر صورة 1K (`per_image_estimate_usd`) | Nano Banana 2.1/Lite، GPT Image 2 |
   | بالحروف/بالدقيقة | يُخزَّن ولا يُفعَّل | الصوت في المرحلة 2 |
   دالة واحدة `modelCredits(row, {imageSize, duration, resolution, audio})` في `packages/shared/pricing.ts` ونسختها في `_shared/pricing.ts` (يحرسهما `contract.test.ts`) هي ما يعرضه الزر وما يُحجز.
5. **سياسة التفعيل** (`enabled`): طبقة `a` + سعر بثقة ≥ متوسطة + مخطط موجود + وحدة قابلة للتسعير + ليس 4K-فقط. **4K معطّل** (و`4k/2160p` مستبعدة من `supports.resolutions`) حتى الانتقال إلى R2 لأن bucket التخزين محدود بـ50 MB (migration 0002). نماذج `edit`/`i2v`/`ref2v` **مفعّلة للـAPI v1** (تقبل `images`) ومخفية من صفحات التوليد الحر (`supports.ui=false` أو `requires_ref=true`) حتى يُبنى رفع المراجع؛ المحرك يرفض طلبها بلا مراجع برسالة عربية بدل 422 من المزوّد. الطبقة `b` تُزرع معطّلة بمخططها وسعرها حتى تُبنى مدخلات الفيديو/الصوت (المرحلة 2: v2v، motion، lipsync، avatar، upscale فيديو، TTS…).
6. **المدخلات بلا كود لكل نموذج** (`_shared/inputs.ts`): الأسماء المعروفة تغطي المزوّدين (`image_input`/`image_url`/`image_urls`/`start|end_image_url`، `aspect_ratio` أو `image_size` المسمّى عند fal مع أبعاد صريحة لـ4:5، `resolution`، `duration` نصية "5"/"8s" أو رقمية بتحويل النوع والتحقق من enum/الحدود، `generate_audio` عند الطلب فقط، `num_images=1`، PNG، فاحص الأمان، وملء الحقول المطلوبة بافتراض المزوّد مثل `prompt_expansion_mode`). أي قيمة خارج المخطط تُرفض قبل الحجز. `config.resolution` صار نصًا كما يسمّيه المزوّد (`720p`/`768P`/`1080p`) والقائمة لكل نموذج في `supports.resolutions`.
7. **المحرك يقبل `video`** (`generate-core`): المدة من `config.duration` → `default_params.duration` → `supports.durations[0]` → `max_duration_s`، ويُرفض ما يتجاوز `max_duration_s`؛ `audio` لا يزال مرفوضًا (المرحلة 2). `provider-webhook` ينسخ الفيديو كما ينسخ الصورة (`video/mp4|webm|quicktime`).
8. **الواجهة**: صفحة `/video-generate` بنفس تدفق الصور (queued → Realtime)، ومنتقي نماذج بالعائلات (بطاقة لكل عائلة "من X رصيد" + رقائق الإصدارات) لأن قائمة مسطحة بعشرات النماذج غير قابلة للاستخدام؛ المدة والدقة والقياس والصوت من `supports`؛ التكلفة من `modelCredits` نفسها.

## البدائل المرفوضة
- **Replicate أساسي + fal بديل** (ADR 0002): تغطية أقل وتأخر في النماذج الجديدة، وسعران لكل نموذج يجب مراقبتهما.
- **كود لكل نموذج**: 233 ملفًا تتقادم مع كل إصدار. المخطط من المزوّد + دالة تحويل واحدة يكفيان، ونقطة النهاية الجديدة = سطر في `fal-launch.json` وتشغيل سكربتين.
- **تفعيل كل الكتالوج دفعة واحدة**: ما لم يُختبر لا يُفعَّل — بوابة لكل عائلة (توليدة حقيقية تظهر عبر Realtime والرصيد يُخصم مرة واحدة) قبل رفع `rollout_pct`.

## الأثر
- جديد: `_shared/providers/fal.ts` + اختبارات، `_shared/fal-signature.ts` + اختبارات، `modelCredits`/`resolveDuration` في نسختي التسعير + اختبارات، توسيع `inputs.ts` + اختبارات، `scripts/build-models-seed.py`، `content/catalog/*`، `apps/web/src/app/VideoGeneratePage.tsx`، `OptionChips`، منتقي العائلات.
- معدّل: `generate-core.ts` (فيديو، مراجع مطلوبة)، `provider-webhook` (`source=fal`)، `storage.ts` (webm/mov)، `request.ts`/`types.ts` (`resolution` نص)، `seed.sql` (الكتلة المولّدة)، `models.ts` في الواجهة (تصفية `ui`/`requires_ref`).
- الأسرار: `FAL_KEY` يُرفع عبر `scripts/push-secrets.py`. لا سر للويبهوك (مفاتيح fal العامة).
- بوابة 2 (قبل رفع أي `rollout_pct` إلى 100): توليدة فيديو حقيقية بأرخص نموذج (Hailuo H3 Max Turbo أو Wan 3.0) تظهر في `/video-generate` عبر Realtime والرصيد يُخصم مرة واحدة؛ وفشل حقيقي (مدة غير مدعومة عبر API) يعيد الرصيد. ثم عائلة عائلة.
- متابعة (backlog): رفع المراجع في الواجهة (يفتح i2v/edit لمستخدمي الواجهة)، مدخلات الفيديو/الصوت للطبقة `b`، `sweep-processing` لسؤال fal عن الطلبات الطويلة (`status_url`)، نقل DNS/R2 لفتح 4K، تجديد الأسعار دوريًا من `fal-models.json` مع تنبيه عند تغيّر سعر نموذج مفعّل.
