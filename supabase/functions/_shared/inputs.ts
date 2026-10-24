import type { GenerateConfig, ModelRow } from './types.ts'

/**
 * بناء مدخلات المزوّد من طلبنا الموحّد اعتمادًا على `models.input_schema` (المخطط §15 الطبقة 1، ADR 0005):
 * - لا كود لكل نموذج: إن كان للمخطط خاصية بهذا الاسم نضبطها، وإلا نتجاهلها. الأسماء المعروفة تغطي Replicate وfal معًا
 *   (image_input | image_url/image_urls، resolution | image_size، duration نصية "5" أو "8s" أو رقمية، generate_audio…).
 * - القيمة تُحوَّل إلى نوع المخطط (نص/رقم) وأي قيمة خارج enum تُرفض قبل الحجز (يرجع خطأ بسبب مفهوم).
 * - الفيديو: `mode` من `supports.mode_by_resolution` (Kling عبر Replicate)، و`start_image`/`end_image` من المراجع.
 * نقي (بلا Deno) ليُختبر بـvitest.
 */
export interface BuiltInput {
  input: Record<string, unknown>
  /** مفاتيح رُفضت لأن قيمها خارج enum المخطط أو خارج نوعه */
  invalid: Array<{ key: string; value: unknown; allowed: unknown[] }>
}

type SchemaProp = {
  type?: string
  enum?: unknown[]
  default?: unknown
  maxItems?: number
  minimum?: number
  maximum?: number
  anyOf?: SchemaProp[]
}

/** أسماء fal المسمّاة لقياسات الصور (image_size) مقابل نسبنا؛ 4:5 لا اسم لها → أبعاد صريحة إن قبِل المخطط كائنًا */
const IMAGE_SIZE_PRESET: Record<string, string> = {
  '1:1': 'square_hd',
  '16:9': 'landscape_16_9',
  '9:16': 'portrait_16_9',
  '3:4': 'portrait_4_3',
  '4:3': 'landscape_4_3',
}
const IMAGE_SIZE_DIMENSIONS: Record<string, { width: number; height: number }> = {
  '1:1': { width: 1024, height: 1024 },
  '16:9': { width: 1280, height: 720 },
  '9:16': { width: 720, height: 1280 },
  '3:4': { width: 768, height: 1024 },
  '4:3': { width: 1024, height: 768 },
  '4:5': { width: 1024, height: 1280 },
}

function props(model: ModelRow): Record<string, SchemaProp> {
  const p = (model.input_schema as { properties?: Record<string, SchemaProp> } | null)?.properties
  return p && typeof p === 'object' ? p : {}
}

/** المخطط الفعلي للخاصية: نفسها إن كان لها نوع/enum، وإلا أول بديل غير null في anyOf (fal يكتب الاختياري كـ anyOf[X, null]) */
function effective(prop: SchemaProp): SchemaProp {
  if (prop.type || prop.enum) return prop
  const alt = prop.anyOf?.find((a) => a.type !== 'null' && (a.type || a.enum))
  return alt ?? prop
}

function enumOf(prop: SchemaProp): unknown[] | undefined {
  if (Array.isArray(prop.enum)) return prop.enum
  const alts = prop.anyOf?.filter((a) => Array.isArray(a.enum)).flatMap((a) => a.enum as unknown[])
  return alts && alts.length ? alts : undefined
}

function acceptsObject(prop: SchemaProp): boolean {
  return prop.type === 'object' || Boolean(prop.anyOf?.some((a) => a.type === 'object'))
}

/** يحوّل قيمتنا إلى شكل يقبله المخطط: رقم↔نص ("5"، "8s")، ويتحقق من enum والحدود. يرجع undefined إن لم يصلح. */
function coerce(prop: SchemaProp, value: unknown): unknown {
  const eff = effective(prop)
  const allowed = enumOf(prop)
  const candidates: unknown[] = [value]
  if (typeof value === 'number') candidates.push(String(value), `${value}s`)
  if (typeof value === 'string') {
    // الدقة تُكتب "720p" عند أغلب النماذج و"768P" عند MiniMax — نجرّب حالتي الأحرف قبل الرفض
    candidates.push(value.toUpperCase(), value.toLowerCase())
    if (/^\d+(\.\d+)?$/.test(value)) candidates.push(Number(value))
  }
  if (allowed) {
    const hit = candidates.find((c) => allowed.includes(c))
    return hit
  }
  if (eff.type === 'string') return candidates.find((c) => typeof c === 'string')
  if (eff.type === 'integer' || eff.type === 'number') {
    const n = candidates.find((c) => typeof c === 'number' && Number.isFinite(c)) as number | undefined
    if (n === undefined) return undefined
    if (eff.type === 'integer' && !Number.isInteger(n)) return undefined
    if (eff.minimum !== undefined && n < eff.minimum) return undefined
    if (eff.maximum !== undefined && n > eff.maximum) return undefined
    return n
  }
  if (eff.type === 'boolean') return typeof value === 'boolean' ? value : undefined
  return value
}

export function buildProviderInput(model: ModelRow, prompt: string, images: string[] | undefined, config: GenerateConfig | undefined): BuiltInput {
  const schema = props(model)
  // أدوات بلا برومبت (إزالة خلفية، تكبير) لا تستقبل prompt — نرسله فقط إن عرفه المخطط أو لا مخطط أصلًا
  const input: Record<string, unknown> = schema.prompt || !model.input_schema ? { prompt } : {}
  const invalid: BuiltInput['invalid'] = []
  const defaults = model.default_params ?? {}
  const supports = model.supports ?? {}

  /** يضبط المفتاح إن عرفه المخطط وقبِل القيمة؛ وإلا يسجّلها مرفوضة */
  const set = (key: string, value: unknown) => {
    const prop = schema[key]
    if (!prop || value === undefined) return
    const v = coerce(prop, value)
    if (v === undefined) {
      const eff = effective(prop)
      const range = eff.minimum !== undefined || eff.maximum !== undefined ? [eff.minimum ?? '-∞', eff.maximum ?? '∞'] : undefined
      invalid.push({ key, value, allowed: enumOf(prop) ?? range ?? [eff.type ?? 'unknown'] })
      return
    }
    input[key] = v
  }

  // ---- المراجع (صور): Replicate image_input (مصفوفة)، fal image_urls (مصفوفة) أو image_url (+ end_image_url للإطار الأخير)
  const refs = images ?? []
  if (schema.image_input) input.image_input = refs.slice(0, schema.image_input.maxItems ?? refs.length)
  if (schema.image_urls) input.image_urls = refs.slice(0, schema.image_urls.maxItems ?? refs.length)
  if (schema.reference_image_urls && refs.length) input.reference_image_urls = refs.slice(0, schema.reference_image_urls.maxItems ?? refs.length)
  if (refs[0] && schema.image_url && !schema.image_urls) input.image_url = refs[0]
  if (refs[0] && schema.start_image_url) input.start_image_url = refs[0]
  if (refs[1] && schema.end_image_url) input.end_image_url = refs[1]
  // أسماء بديلة للإطار الأول/الأخير (Veo: first/last_frame_url، PixVerse: first/last_image_url)
  for (const k of ['first_frame_url', 'first_image_url'] as const) if (refs[0] && schema[k]) input[k] = refs[0]
  for (const k of ['last_frame_url', 'last_image_url', 'tail_image_url', 'end_image'] as const) if (refs[1] && schema[k]) input[k] = refs[1]
  // تجربة الملابس/المنتج في اليد: images[0] = الشخص، images[1…] = القطعة أو المنتج (موثّق في docs/api.md)
  if (refs[0] && schema.person_image_url) input.person_image_url = refs[0]
  for (const k of ['product_image_url', 'garment_image_url'] as const) if (refs[1] && schema[k]) input[k] = refs[1]
  for (const k of ['product_image_urls', 'garment_image_urls'] as const) if (refs.length > 1 && schema[k]) input[k] = refs.slice(1, 1 + (schema[k].maxItems ?? refs.length))

  // ---- النسبة: aspect_ratio مباشرة، أو image_size المسمّى عند fal (أو أبعاد صريحة إن قبِل المخطط كائنًا)
  const wantRatio =
    config?.aspectRatio ?? (refs.length && enumOf(schema.aspect_ratio ?? {})?.includes('match_input_image') ? 'match_input_image' : undefined) ?? (defaults.aspectRatio as string | undefined)
  if (schema.aspect_ratio) set('aspect_ratio', wantRatio)
  else if (schema.image_size && wantRatio && wantRatio !== 'match_input_image') {
    const preset = IMAGE_SIZE_PRESET[wantRatio]
    const allowed = enumOf(schema.image_size)
    if (preset && allowed?.includes(preset)) input.image_size = preset
    else if (acceptsObject(schema.image_size) && IMAGE_SIZE_DIMENSIONS[wantRatio]) input.image_size = IMAGE_SIZE_DIMENSIONS[wantRatio]
    else invalid.push({ key: 'image_size', value: wantRatio, allowed: allowed ?? [] })
  }
  // فيديو من صورة: أول مرجع هو الإطار الأول
  if (schema.start_image && refs[0]) input.start_image = refs[0]

  // ---- الدقة: للصور 1K/2K/4K (imageSize)، للفيديو 480p/720p/1080p (resolution) — نفس المفتاح عند المزوّدين
  if (model.type === 'image') set('resolution', config?.imageSize ?? (defaults.imageSize as string | undefined))
  else set('resolution', config?.resolution ?? (defaults.resolution as string | undefined))

  // ---- وضع الجودة المشتق من دقة الفيديو (Kling عبر Replicate: 720p → standard، 1080p → pro) عبر supports.mode_by_resolution
  const videoRes = model.type === 'video' ? (config?.resolution ?? (defaults.resolution as string | undefined)) : undefined
  const modeByRes = (supports as { mode_by_resolution?: Record<string, unknown> }).mode_by_resolution
  if (schema.mode && videoRes && modeByRes && typeof modeByRes === 'object') {
    const mode = modeByRes[videoRes]
    if (mode === undefined) invalid.push({ key: 'resolution', value: videoRes, allowed: Object.keys(modeByRes) })
    else set('mode', mode)
  }

  // ---- المدة (فيديو): نصية "5" أو "8s" أو رقمية حسب المخطط
  if (model.type === 'video') set('duration', config?.duration ?? (defaults.duration as number | undefined))

  // ---- الصوت الأصلي: يُرسل دائمًا صراحةً (false ما لم يُطلب) — افتراض بعض المزوّدين true (Veo، Kling 3)
  //      وهو أغلى، فترك الافتراض يعني أن يولّد المزوّد بصوت ونحن سعّرنا بلا صوت
  for (const k of ['generate_audio', 'enable_audio', 'with_audio'] as const) if (schema[k]) set(k, config?.audio ?? false)

  // ---- قرارات ثابتة للمنصة: ناتج واحد لكل عملية (تسعير دقيق)، PNG، فاحص الأمان مفعّل، مرشّح متوسط، لا نموذج بديل (ADR 0003)
  if (schema.num_images) input.num_images = 1
  const fmt = enumOf(schema.output_format ?? {})
  if (fmt?.includes('png')) input.output_format = 'png'
  if (schema.enable_safety_checker) input.enable_safety_checker = true
  if (enumOf(schema.safety_filter_level ?? {})?.includes('block_medium_and_above')) input.safety_filter_level = 'block_medium_and_above'
  if (schema.allow_fallback_model) input.allow_fallback_model = false

  if (config?.seed !== undefined && schema.seed) input.seed = config.seed

  // ---- حقول يطلبها المخطط ولا نعرفها (مثل prompt_expansion_mode عند MiniMax): نرسل افتراض المزوّد إن وُجد بدل 422
  const required = ((model.input_schema as { required?: unknown } | null)?.required ?? []) as unknown[]
  for (const key of required) {
    // حقول المراجع لا تُملأ بافتراض المزوّد أبدًا — افتراضها صورة مثال من fal (نولّد من صورة غيرنا ونخصم)
    if (typeof key !== 'string' || key in input || /(^|_)(image|video|audio|mask)(_url|_urls|_input)?$|_url$|_urls$/.test(key)) continue
    const prop = schema[key]
    if (prop && prop.default !== undefined && prop.default !== null) input[key] = prop.default
  }

  return { input, invalid }
}
