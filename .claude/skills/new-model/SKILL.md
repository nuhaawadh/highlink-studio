---
name: new-model
description: إضافة نموذج توليد جديد (fal أساسًا؛ Replicate/Gemini استثناءً) إلى كتالوج استوديو هاي لينك مع تسعيره ومخطط مدخلاته (ADR 0005). استخدمه عند "أضف نموذج" أو "فعّل Kling/Seedance/…".
---

# نموذج جديد: $ARGUMENTS

الكتالوج بيانات لا كود (ADR 0005): `content/catalog/fal-launch.json` (القائمة) + `content/catalog/schemas/` (مخطط المزوّد) + `content/catalog/pricing/` (السعر الرسمي) → `scripts/build-models-seed.py` → الكتلة المولّدة في `supabase/seed.sql`.

1. حدّد نقطة النهاية عند fal: ابحث في `content/catalog/fal-models.json` (`python -I scripts/fal-catalog.py` يحدّثه إن احتجت الأحدث). استنتج المعرّف الداخلي (kebab-case ≤ 40 حرفًا)، العائلة (`family`)، نوع العملية (`kind`: t2v/i2v/ref2v/t2i/edit/…)، الطبقة (`a` يعمل بالمحرك الحالي، `b` يحتاج مدخلات فيديو/صوت)، والاسمين العربي والإنجليزي بنمط القائمة.
2. أضف الصف إلى `fal-launch.json` (نفس حقول الصفوف الأخرى؛ `sort` التالي). نموذج بلا حقل `duration` في مخططه ومدته ثابتة → أضف `fixed_duration_s`.
3. المخطط: `python -I scripts/fal-schema.py <endpoint>` (يحتاج وصولًا إلى fal.ai؛ من بيئة محجوبة اجلب `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>` بأداة ويب واحفظه ثم `--raw <ملف> <endpoint>`).
4. السعر: اكتب `content/catalog/pricing/<endpoint مع __>.json` بالشكل الموثّق في رأس `build-models-seed.py` — **النص حرفيًا من صفحة fal الآن لا من الذاكرة** (القاعدة 7)، مع `unit` و`usd` و`by_resolution`/`by_duration`/`audio_surcharge_usd` إن وُجدت و`confidence`.
5. `python -I scripts/build-models-seed.py --check --show <id>` لمراجعة `supports`/`default_params`/التكلفة، ثم بلا `--check` لكتابة الكتلة. اعرض الحساب في الردّ: الصور ceil(usd×3÷0.042)، الفيديو usd×3÷0.042 رصيد/ثانية × المدة.
6. إن كان للنموذج اسم حقل جديد لا تعرفه `_shared/inputs.ts` (غير image_url/image_urls/duration/resolution/aspect_ratio/image_size/generate_audio…) أضف التعيين هناك مع حالة في `inputs.test.ts` — تعيين عام بالاسم، لا كود للنموذج.
7. `npm run typecheck && npm test`. ثم seed على القاعدة (`npx supabase db query --linked -f supabase/seed.sql` — يحتاج تأكيدًا) وبوابة النموذج: توليدة حقيقية تظهر عبر Realtime والرصيد يُخصم مرة واحدة؛ `rollout_pct` يُرفع إلى 100 بعد يوم بلا ارتفاع في الفشل.
