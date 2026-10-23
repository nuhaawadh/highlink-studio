# API استوديو هاي لينك — الإصدار v1

دليل الربط لأي عميل (n8n، متجر، سكربت). كل ما هنا مطابق لما هو منشور ومختبَر في `scripts/smoke-gate1.py`. القرارات في `docs/decisions/0004-api-v1.md`.

## 1. الأساسيات

| البند | القيمة |
| --- | --- |
| عنوان الـAPI | معروض في صفحة **الحساب** في الاستوديو. الآن بصيغة `https://<project>.supabase.co/functions/v1/v1`، وبعد نقل الدومين `https://api.highlink.tech/v1` (نفس المسارات). |
| المصادقة | `Authorization: Bearer hl_live_…` أو `X-API-Key: hl_live_…` |
| أنواع المفاتيح | `hl_live_` يولّد فعلًا ويخصم رصيدًا. `hl_test_` تجربة جافة: نفس التحقق والتسعير وفحص الرصيد، بلا صورة ولا خصم (الأصل يعود `completed` بـ`sandbox: true` و`url: null`). |
| الصيغة | JSON (`Content-Type: application/json`)، UTF-8، الرسائل بالعربية |
| الحد اليومي | على `POST /generate` فقط، لكل مفتاح، يتجدد منتصف الليل UTC. الافتراضي حسب الباقة: مجاني 50، ستارتر/بيسك 500، برو 2000، كريتورز 5000، ومفاتيح الاختبار 200. كل رد يحمل `X-RateLimit-Limit` و`X-RateLimit-Remaining`. |
| الأخطاء | `{ "error": { "code": "…", "message": "…" } }` بحالة HTTP مناسبة (القسم 7) |

إصدار المفتاح وإبطاله من صفحة الحساب. المفتاح وسر توقيع الـwebhook يظهران **مرة واحدة** عند الإصدار؛ احفظهما في Credentials عند n8n لا في العقدة نفسها. حد أقصى 10 مفاتيح نشطة.

**إعداد n8n المشترك لكل المسارات** — أنشئ Credential من نوع *Header Auth*:

| الحقل | القيمة |
| --- | --- |
| Name | `Authorization` |
| Value | `Bearer hl_live_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx` |

ثم في كل عقدة **HTTP Request**: `Authentication: Generic Credential Type → Header Auth` واختر هذا الـCredential.

## 2. `POST /generate` — طلب توليد

يُنشئ أصلًا ويُرسله للنموذج. الرد فوري (`202`) والنتيجة تصلك بالـwebhook (القسم 6) أو بالاستعلام عن الأصل (القسم 3).

**الجسم**

| الحقل | النوع | ملاحظات |
| --- | --- | --- |
| `model` | string | معرّف من `GET /models`، مثل `nano-banana-pro` |
| `prompt` | string | 1–4000 حرف، عربي أو إنجليزي |
| `config.aspectRatio` | `1:1` `9:16` `16:9` `4:5` `3:4` | اختياري؛ القيم المدعومة لكل نموذج في `GET /models` |
| `config.imageSize` | `1K` `2K` `4K` | صور — اختياري؛ تؤثر في التكلفة (`costs` في `GET /models`) |
| `config.duration` | integer (ثوانٍ) | فيديو — اختياري؛ من `durations` للنموذج، وإلا الافتراضي. التكلفة = السعر بالثانية × المدة |
| `config.resolution` | string | فيديو — اختياري؛ كما يسمّيها النموذج في `resolutions` (`720p`، `1080p`، `768P`…)؛ قد تغيّر السعر |
| `config.audio` | boolean | فيديو — اختياري؛ صوت أصلي من النموذج إن كان `audio: true`؛ قد يضيف تكلفة |
| `images` | string[] | اختياري، حتى 14 رابط **https** لمراجع (منتج، شخصية). نماذج `requires_ref: true` (صورة→فيديو، تعديل بالمراجع) ترفض الطلب بدونها بـ`INVALID_INPUT` |
| `maxCredits` | integer | اختياري: سقف إنفاق؛ إن تجاوزته التكلفة يُرفض الطلب بـ`OVER_BUDGET` بلا خصم |
| `webhook_url` | string | اختياري، https: يطغى على رابط الـwebhook المضبوط في المفتاح لهذا الطلب فقط |
| `feature_tag` | string | اختياري للتصنيف: `general` `product` `ads` `ugc` … |

**الترويسات الاختيارية**: `Idempotency-Key` (1–128 حرفًا). نفس المفتاح ونفس الجسم خلال إعادة المحاولة → نفس الرد الأول مع `Idempotency-Replayed: true` وبلا أصل جديد ولا خصم ثانٍ. نفس المفتاح بجسم مختلف، أو قبل اكتمال الأول → `409 IDEMPOTENCY_CONFLICT`. استخدمه دائمًا من n8n (`{{ $execution.id }}`) حتى لا يولّد التكرار التلقائي صورتين.

**curl**

```bash
curl -X POST "$HL_API/generate" \
  -H "Authorization: Bearer $HL_KEY" \
  -H "Content-Type: application/json" \
  -H "Idempotency-Key: order-10452-main" \
  -d '{
    "model": "nano-banana-pro",
    "prompt": "عطر فاخر على رخام أبيض، إضاءة ستوديو ناعمة، لقطة منتج",
    "config": { "aspectRatio": "1:1", "imageSize": "2K" },
    "maxCredits": 11,
    "webhook_url": "https://n8n.example.com/webhook/highlink"
  }'
```

**الرد `202 Accepted`** (مفتاح حي) أو **`200`** (مفتاح اختبار، مكتمل فورًا):

```json
{
  "asset": {
    "id": "6f1b7c2e-3d4a-4b5c-9d8e-7f6a5b4c3d2e",
    "status": "processing",
    "type": "image",
    "model": "nano-banana-pro",
    "prompt": "عطر فاخر على رخام أبيض…",
    "aspect_ratio": "1:1",
    "resolution": "2K",
    "url": null,
    "thumbnail_url": null,
    "cost_credits": 11,
    "sandbox": false,
    "error": null,
    "created_at": "2026-10-22T20:11:02.133Z",
    "completed_at": null
  },
  "cost": 11,
  "balance": 239,
  "sandbox": false
}
```

الرصيد يُحجز عند القبول ويُخصم نهائيًا عند الاكتمال؛ أي فشل عند النموذج يسترده كاملًا. عند الفشل المتزامن (رصيد لا يكفي، نص مرفوض، إعداد غير مدعوم) يعود خطأ من القسم 7 مع `asset_id` و`balance`، ويظهر الأصل في مكتبتك بحالة `failed`.

**n8n — عقدة HTTP Request**

| الإعداد | القيمة |
| --- | --- |
| Method | `POST` |
| URL | `{{ $vars.HL_API }}/generate` |
| Authentication | Header Auth (القسم 1) |
| Send Headers | `Idempotency-Key` = `{{ $execution.id }}-{{ $itemIndex }}` |
| Send Body → JSON | انظر أدناه |
| Options → Response | `JSON` |

```json
{
  "model": "nano-banana-pro",
  "prompt": "{{ $json.prompt }}",
  "config": { "aspectRatio": "1:1", "imageSize": "2K" },
  "maxCredits": 11,
  "webhook_url": "{{ $vars.HL_WEBHOOK_URL }}"
}
```

مخرج العقدة فيه `asset.id`؛ احفظه (مثلًا في Data Table أو مع الطلب) لتربط نتيجة الـwebhook بسياقك. لا تضع حلقة انتظار بعدها؛ استقبل النتيجة بعقدة Webhook (القسم 6).

## 3. `GET /assets/{id}` — حالة أصل

```bash
curl "$HL_API/assets/6f1b7c2e-3d4a-4b5c-9d8e-7f6a5b4c3d2e" -H "Authorization: Bearer $HL_KEY"
```

**الرد `200`**: `{ "asset": { …نفس الحقول أعلاه… } }`. عند الاكتمال `status: "completed"` و`url` رابط دائم للصورة. عند الفشل `status: "failed"` و`error: { code, message }` والرصيد مسترد. `404 NOT_FOUND` إن لم يكن الأصل لك.

لا يُحسب على الحد اليومي. إن كنت لا تستطيع استقبال webhook، استعلم كل 5 ثوانٍ حتى تصبح الحالة نهائية (`completed` أو `failed` أو `canceled`)؛ الصور تكتمل عادة خلال 20–60 ثانية.

**n8n — HTTP Request**: `GET` إلى `{{ $vars.HL_API }}/assets/{{ $json.asset.id }}` بنفس الـCredential. للاستعلام الدوري: عقدة **Wait** (5 ثوانٍ) → HTTP Request → **IF** على `{{ ["completed","failed","canceled"].includes($json.asset.status) }}` → ارجع إلى Wait عند false.

## 4. `GET /models` — النماذج المتاحة وأسعارها

```bash
curl "$HL_API/models" -H "Authorization: Bearer $HL_KEY"
```

```json
{
  "data": [
    {
      "id": "nano-banana-pro",
      "name_ar": "نانو بنانا برو",
      "name_en": "Nano Banana Pro",
      "type": "image",
      "kind": "t2i",
      "family": "nano-banana",
      "cost_credits": 11,
      "cost_per_second": null,
      "max_duration_s": null,
      "costs": { "1K": 11, "2K": 11, "4K": 22 },
      "sizes": ["1K", "2K", "4K"],
      "durations": [],
      "resolutions": [],
      "audio": false,
      "ref_images": 14,
      "requires_ref": false,
      "aspect_ratios": ["1:1", "9:16", "16:9", "4:5", "3:4"],
      "default_params": { "imageSize": "2K", "aspectRatio": "1:1" },
      "badge": "جديد"
    },
    {
      "id": "kling-v4",
      "name_ar": "كلينج 4",
      "name_en": "Kling 4",
      "type": "video",
      "kind": "t2v",
      "family": "kling",
      "cost_credits": null,
      "cost_per_second": 11.2143,
      "max_duration_s": 30,
      "costs": { "3s": 34, "4s": 45, "5s": 57, "10s": 113 },
      "sizes": [],
      "durations": [3, 4, 5, 6, 7, 8, 9, 10],
      "resolutions": ["720p", "1080p"],
      "audio": false,
      "ref_images": 0,
      "requires_ref": false,
      "aspect_ratios": ["1:1", "9:16", "16:9"],
      "default_params": { "duration": 5, "resolution": "1080p", "aspectRatio": "16:9" }
    }
  ]
}
```

`kind` يصف العملية: `t2i` نص→صورة، `edit` تعديل بالمراجع (يحتاج `images`)، `t2v` نص→فيديو، `i2v` صورة→فيديو (يحتاج `images[0]`)، `ref2v` مراجع→فيديو، `flf2v` إطار أول وأخير (`images[0]` و`images[1]`). للفيديو `costs` بالمدة على الدقة الافتراضية؛ دقة أعلى أو صوت قد يرفعان السعر — مرّر `maxCredits` دائمًا.

`costs` هو ما سيُخصم لكل دقة؛ مرّره إلى `maxCredits` لتضمن ألا يتغير السعر تحتك. **n8n**: HTTP Request `GET` ثم **Split Out** على `data` إن أردت صفًا لكل نموذج.

## 5. `GET /balance` — الرصيد وحالة المفتاح

```bash
curl "$HL_API/balance" -H "Authorization: Bearer $HL_KEY"
```

```json
{ "balance": 239, "currency": "credits", "mode": "live", "plan": "pro", "daily_limit": 2000, "used_today": 14 }
```

**n8n**: مفيد كبوابة قبل دفعة كبيرة: HTTP Request `GET` → **IF** `{{ $json.balance >= $('Config').item.json.needed }}`.

## 6. Webhook النتيجة — استقبال الاكتمال أو الفشل

عند بلوغ الأصل حالة نهائية نرسل `POST` إلى `webhook_url` (من الطلب، وإلا من المفتاح). الترويسات والتوقيع بمواصفة **Standard Webhooks**:

| الترويسة | المعنى |
| --- | --- |
| `webhook-id` | معرّف الحدث (ثابت عند إعادة المحاولة) |
| `webhook-timestamp` | ثوانٍ Unix |
| `webhook-signature` | `v1,<base64>` حيث `base64 = HMAC-SHA256( key = base64decode(secret بعد "whsec_"), msg = "{id}.{timestamp}.{rawBody}" )` |

**الجسم**

```json
{
  "id": "evt_9c1f…",
  "event": "asset.completed",
  "created_at": "2026-10-22T20:11:41.902Z",
  "data": { "id": "6f1b7c2e-…", "status": "completed", "url": "https://…/u/…/6f1b7c2e-….png", "cost_credits": 11, "sandbox": false, "error": null, "…": "بقية حقول الأصل" }
}
```

`event` إما `asset.completed` أو `asset.failed` (مع `data.error`). نعيد المحاولة 3 مرات خلال ثوانٍ إن لم يرجع سيرفرك `2xx`، ثم نسجّل الفشل؛ فردّ بـ`200` فورًا وأكمل المعالجة بعده. إن فاتك حدث، `GET /assets/{id}` هو مصدر الحقيقة.

**تحقق التوقيع (Node.js / عقدة Code في n8n)** — ارفض ما لا يطابق، وارفض طابعًا زمنيًا أقدم من 5 دقائق:

```js
const crypto = require('crypto');

function verifyHighlinkWebhook({ secret, id, timestamp, signatureHeader, rawBody }) {
  const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
  const expected = crypto.createHmac('sha256', key).update(`${id}.${timestamp}.${rawBody}`).digest('base64');
  const fresh = Math.abs(Date.now() / 1000 - Number(timestamp)) <= 300;
  const ok = signatureHeader.split(' ').some((part) => {
    const [version, sig] = part.split(',');
    return version === 'v1' && sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  });
  return fresh && ok;
}
```

**n8n — عقدة Webhook**

| الإعداد | القيمة |
| --- | --- |
| HTTP Method | `POST` |
| Path | `highlink` (الرابط الناتج هو ما تضعه في `webhook_url` أو في المفتاح) |
| Respond | `Immediately` بـ`200` |
| Options → Raw Body | **مفعّل** (التوقيع يُحسب على النص الخام كما وصل؛ أي إعادة تنسيق تكسره) |

ثم عقدة **Code** (Run Once for Each Item) للتحقق قبل أي خطوة أخرى:

```js
const crypto = require('crypto');
const h = $input.item.json.headers;
const rawBody = Buffer.from($input.item.binary.data.data, 'base64').toString('utf8');
const secret = $vars.HL_WEBHOOK_SECRET; // من Variables أو Credential، لا في الكود
const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
const expected = crypto.createHmac('sha256', key).update(`${h['webhook-id']}.${h['webhook-timestamp']}.${rawBody}`).digest('base64');
const ok = String(h['webhook-signature'] || '').split(' ').some((p) => {
  const [v, sig] = p.split(',');
  return v === 'v1' && sig && sig.length === expected.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
});
if (!ok || Math.abs(Date.now() / 1000 - Number(h['webhook-timestamp'])) > 300) {
  throw new Error('invalid Highlink webhook signature');
}
return { json: JSON.parse(rawBody) };
```

بعدها **IF** على `{{ $json.event === 'asset.completed' }}`: الفرع الصحيح يأخذ `{{ $json.data.url }}` (حمّله بـHTTP Request إلى ملف، أو أرسله إلى سلة/واتساب)، والفرع الآخر يسجّل `{{ $json.data.error.message }}`. لتجنّب المعالجة المكررة احفظ `webhook-id` وتجاهل ما سبق.

## 7. رموز الأخطاء

| HTTP | `code` | متى | ماذا تفعل |
| --- | --- | --- | --- |
| 400 | `INVALID_INPUT` | جسم ناقص، رابط غير https، إعداد لا يدعمه النموذج، Idempotency-Key غير صالح | أصلح الطلب؛ لا يُعاد تلقائيًا |
| 401 | `UNAUTHORIZED` | مفتاح مفقود أو خاطئ أو مُبطَل | راجع الـCredential |
| 402 | `INSUFFICIENT_CREDITS` | الرصيد لا يكفي للتكلفة | اشحن ثم أعد |
| 402 | `OVER_BUDGET` | التكلفة تتجاوز `maxCredits` | ارفع السقف أو غيّر الدقة |
| 404 | `NOT_FOUND` | مسار غير معروف أو أصل ليس لك | — |
| 404 | `MODEL_DISABLED` | نموذج غير موجود أو معطّل | خذ القائمة من `GET /models` |
| 405 | `METHOD_NOT_ALLOWED` | طريقة خاطئة للمسار | — |
| 409 | `IDEMPOTENCY_CONFLICT` | نفس Idempotency-Key بجسم مختلف أو قيد التنفيذ | انتظر ثم أعد بنفس الجسم، أو غيّر المفتاح |
| 422 | `UNSAFE_PROMPT` | نص مرفوض | عدّل الوصف |
| 429 | `RATE_LIMITED` | تجاوزت حد التزامن لباقتك (عمليات قيد التنفيذ) | انتظر الاكتمال |
| 429 | `DAILY_LIMIT` | تجاوزت الحد اليومي للمفتاح | انتظر منتصف الليل UTC أو مفتاح آخر |
| 502 | `PROVIDER_ERROR` | تعذّر عند مزوّد النموذج قبل القبول | لم يُخصم شيء؛ أعد بعد قليل بنفس Idempotency-Key |

قاعدة إعادة المحاولة من n8n: أعد على `5xx` فقط وبنفس `Idempotency-Key` (Settings → Retry On Fail، 3 مرات، 5 ثوانٍ). لا تعد على `4xx`.

## 8. مثال تدفق n8n كامل (صور منتجات من متجر)

1. **Trigger** (منتج جديد في سلة / جدول Google Sheets).
2. **HTTP Request** `GET /balance` → **IF** الرصيد ≥ 11 وإلا أرسل تنبيهًا.
3. **HTTP Request** `POST /generate` بـ`Idempotency-Key = {{ $execution.id }}-{{ $json.sku }}` و`webhook_url` إلى عقدة Webhook في ورك فلو ثانٍ، و`images: [رابط صورة المنتج https]`، و`maxCredits: 11`.
4. احفظ `asset.id` مع `sku`.
5. ورك فلو ثانٍ: **Webhook** (Raw Body) → **Code** التحقق من التوقيع → **IF** `asset.completed` → **HTTP Request** تنزيل `data.url` → رفعه إلى المتجر؛ عند `asset.failed` سجّل `data.error.message` (الرصيد مسترد).

ابدأ بمفتاح `hl_test_` لتضبط التدفق كاملًا (بما فيه الـwebhook والتوقيع) بلا تكلفة، ثم بدّل الـCredential إلى مفتاح `hl_live_`.
