// generate-media — المرحلة 1 (المخطط §5). هذا هيكل أولي يتحقق من المدخلات ويرفض بوضوح؛ المنطق الكامل يُبنى بعد البوابة 0.
// الخطوات التسع في المخطط: JWT → حد التزامن → حلّ النموذج/الاستوديو → التسعير → أمان البرومبت → hold_credits → المزوّد → تحديث assets → تحرير الحجز عند أي استثناء.
import { z } from 'npm:zod@4'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const GenerateRequest = z.object({
  assetId: z.string().uuid(),
  model: z.string().min(1).max(64),
  prompt: z.string().min(1).max(4000),
  images: z.array(z.string().url()).max(4).optional(),
  config: z
    .object({
      aspectRatio: z.enum(['1:1', '9:16', '16:9', '4:5', '3:4']).optional(),
      imageSize: z.enum(['1K', '2K', '4K']).optional(),
      duration: z.number().int().min(1).max(30).optional(),
      resolution: z.enum(['480p', '720p', '1080p']).optional(),
      audio: z.boolean().optional(),
      seed: z.number().int().optional(),
    })
    .optional(),
  feature_tag: z.enum(['general', 'product', 'ads', 'ugc', 'shots', 'storyboard', 'characters']).optional(),
  locale: z.enum(['ar', 'en']).optional(),
  maxCredits: z.number().int().positive().optional(),
})

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (req.method !== 'POST') return json({ success: false, error: { code: 'INVALID_INPUT', message: 'طريقة غير مدعومة' } }, 405)

  const auth = req.headers.get('Authorization') ?? ''
  if (!auth.startsWith('Bearer ')) {
    return json({ success: false, error: { code: 'INVALID_INPUT', message: 'يلزم تسجيل الدخول' } }, 401)
  }

  const parsed = GenerateRequest.safeParse(await req.json().catch(() => null))
  if (!parsed.success) {
    return json({ success: false, error: { code: 'INVALID_INPUT', message: 'مدخلات غير صالحة', issues: parsed.error.issues } }, 400)
  }

  // TODO (المرحلة 1): الخطوات 1–9 من المخطط §5. حتى ذلك الحين نرفض بوضوح بدل التظاهر بالنجاح.
  return json(
    { success: false, assetId: parsed.data.assetId, error: { code: 'PROVIDER_ERROR', message: 'التوليد غير مفعّل بعد — المرحلة 1' } },
    501,
  )
})
