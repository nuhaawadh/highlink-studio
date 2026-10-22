# ADR 0002 — التخزين والدفع وتوقيت الـAPI/MCP

**التاريخ:** 2026-10-22 · **الحالة:** معتمد

## القرارات
1. **التخزين خلف محوّل واحد** `supabase/functions/_shared/storage.ts` بدالتين (`put`, `publicUrl`). المرحلة 1 على Supabase Storage (bucket `media`) لأن DNS لم يُنقل بعد إلى Cloudflare؛ بعد النقل يُبدَّل التنفيذ إلى R2 عبر `media.highlink.tech` دون تغيير أي مستدعٍ. السبب: R2 لا يقبل دومينًا مخصصًا إلا لمنطقة DNS على Cloudflare، و`r2.dev` للتطوير فقط.
2. **الدفع خلف محوّل واحد** `_shared/payments/` بواجهة `createCheckout / verify / parseWebhook`. Paylink أولًا (وثيقة عمل حر مقبولة، تفعيل خلال 48 ساعة عمل، باقة بلا رسوم شهرية، صفحة دفع مستضافة) لبيع الباقات كدفعات لمرة واحدة؛ Moyasar عند تفعيله لحفظ البطاقة والتجديد التلقائي. الرصيد يُضاف بنفس `grant_credits` في الحالتين.
3. **API v1 تُبنى مباشرة بعد بوابة 1** (بدل المرحلة 3): هي نفس `generate-media` مع جدول `api_keys` (hash + حد يومي + idempotency). أول عميل لها هاي لينك نفسها (n8n).
4. **سيرفر MCP في المرحلة 2** (بدل 3–4): أداة واحدة `run_studio` + `estimate` + `check_generation` + `upload_reference` + `get_credits` + `list_models`، OAuth 2.1 PKCE عبر Supabase Auth.

## الأثر
- `CLAUDE.md` محدّث. خارطة الطريق في `docs/blueprint.md` §11 تُقرأ مع هذا القرار.
- السياسات القانونية على نمط هلاي: السلع الرقمية غير قابلة للاسترداد إلا عند فشل تقني؛ العمر 18+.
