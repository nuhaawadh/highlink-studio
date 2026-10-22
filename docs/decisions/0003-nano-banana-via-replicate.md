# ADR 0003 — نانو بنانا برو عبر Replicate، تسعير الدقة لكل نموذج، التخزين على Supabase Storage

**التاريخ:** 2026-10-22 · **الحالة:** معتمد

## القرارات
1. **nano-banana-pro يُشغَّل عبر Replicate** بالـslug `google/nano-banana-pro` بدل Gemini مباشرة: مزوّد واحد وفاتورة واحدة ومحوّل واحد (`_shared/providers/replicate.ts`) لكل النماذج في المرحلة 1. `GEMINI_API_KEY` لا يعتمد عليه أي مسار. محوّل Google يُبنى لاحقًا بنفس واجهة `ProviderAdapter` إن احتجنا الإكمال المتزامن.
2. **التسعير بالكلفة الفعلية لكل دقة**: Replicate يسعّر 1K و2K بنفس السعر (0.15$) و4K بالضعف (0.30$). المعامل العام في `pricing.ts` (2K ×1.5) يبقى افتراضيًا، لكن `models.supports.resolution_multipliers` يطغى عليه عندما يوجد (`applyModelResolution`). nano-banana-pro: `cost_credits=11` و`{"1K":1,"2K":1,"4K":2}` → 11 / 11 / 22.
3. **مخطط مدخلات المزوّد في البيانات لا في الكود**: `models.input_schema` (enums من Replicate) يبني مدخلات المزوّد ويرفض القيم خارج المخطط قبل الحجز (`_shared/inputs.ts`، المخطط §15 الطبقة 1).
4. **التخزين في المرحلة 1 على Supabase Storage**: bucket `media` عام للقراءة، الكتابة بـservice_role فقط (migration 0002)، المسار `u/{user_id}/{asset_id}.{ext}`. يُبدَّل إلى R2 بتعديل `_shared/storage.ts` وحده (ADR 0002).
5. **منع الخصم المزدوج في القاعدة**: فهرس فريد جزئي على الحجز النشط لكل أصل + `hold_credits` idempotent (تكرار الطلب بنفس `assetId` يعيد الحجز القائم؛ أصل خُصم رصيده لا يُحجز له مجددًا).
6. **Edge Functions لا تستورد من خارج `supabase/functions/`**: العقد (رموز الأخطاء، التسعير) منسوخ في `_shared/` ويحرسه `packages/shared/contract.test.ts`.

## الأثر
- `CLAUDE.md` محدّث (الستاك، القاعدة 2، الأوامر، حالة المشروع). `seed.sql` يفعّل nano-banana-pro فقط؛ النماذج الأربعة الأخرى `enabled=false` حتى تُبنى محوّلاتها وتُختبر.
- النماذج التي يسعّرها المزوّد بالدقة تُضاف مع `resolution_multipliers` في seed، لا بتعديل الكود.
- المفاتيح الجديدة لـSupabase (`sb_secret_…`, `sb_publishable_…`) ليست JWT: في السكربتات تُرسل كـ`apikey` فقط، وAuth Admin API يرفضها في `Authorization: Bearer`.
