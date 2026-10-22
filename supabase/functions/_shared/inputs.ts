import type { GenerateConfig, ModelRow } from './types.ts'

/**
 * بناء مدخلات المزوّد من طلبنا الموحّد اعتمادًا على `models.input_schema` (المخطط §15 الطبقة 1):
 * - لا كود لكل نموذج: إن كان للمخطط خاصية بهذا الاسم نضبطها، وإلا نتجاهلها.
 * - أي قيمة خارج enum المخطط أو خارج min/max تُرفض قبل الحجز (يرجع خطأ بسبب مفهوم).
 * - الفيديو (Kling): `start_image` من أول مرجع، `duration`، `generate_audio`، و`mode` من `supports.mode_by_resolution`.
 * نقي (بلا Deno) ليُختبر بـvitest.
 */
export interface BuiltInput {
  input: Record<string, unknown>
  /** مفاتيح رُفضت لأن قيمها خارج المخطط */
  invalid: Array<{ key: string; value: unknown; allowed: unknown[] }>
}

type SchemaProp = { type?: string; enum?: unknown[]; default?: unknown; maxItems?: number; minimum?: number; maximum?: number }

function props(model: ModelRow): Record<string, SchemaProp> {
  const p = (model.input_schema as { properties?: Record<string, SchemaProp> } | null)?.properties
  return p && typeof p === 'object' ? p : {}
}

export function buildProviderInput(model: ModelRow, prompt: string, images: string[] | undefined, config: GenerateConfig | undefined): BuiltInput {
  const schema = props(model)
  const input: Record<string, unknown> = { prompt }
  const invalid: BuiltInput['invalid'] = []
  const defaults = model.default_params ?? {}
  const supports = model.supports ?? {}

  const set = (key: string, value: unknown) => {
    const prop = schema[key]
    if (!prop || value === undefined) return
    if (Array.isArray(prop.enum) && !prop.enum.includes(value)) {
      invalid.push({ key, value, allowed: prop.enum })
      return
    }
    if (typeof value === 'number' && ((prop.minimum !== undefined && value < prop.minimum) || (prop.maximum !== undefined && value > prop.maximum))) {
      invalid.push({ key, value, allowed: [prop.minimum ?? '-∞', prop.maximum ?? '∞'] })
      return
    }
    input[key] = value
  }

  const refs = images ?? []
  if (schema.image_input) {
    const max = schema.image_input.maxItems ?? refs.length
    input.image_input = refs.slice(0, max)
  }
  // فيديو من صورة: أول مرجع هو الإطار الأول
  if (schema.start_image && refs[0]) input.start_image = refs[0]

  // إن وُجدت مراجع ولم يُطلب قياس، نترك النموذج يطابق قياس الصورة المرجعية (إن كان ذلك ضمن المخطط)
  const aspect = config?.aspectRatio ?? (refs.length && schema.aspect_ratio?.enum?.includes('match_input_image') ? 'match_input_image' : undefined)
  set('aspect_ratio', aspect ?? (defaults.aspectRatio as string | undefined))
  set('resolution', config?.imageSize ?? (defaults.imageSize as string | undefined))

  // فيديو: المدة، الصوت، والوضع (standard/pro) المشتق من دقة الفيديو عبر supports.mode_by_resolution
  set('duration', config?.duration ?? (defaults.duration as number | undefined))
  if (schema.generate_audio) input.generate_audio = Boolean(config?.audio ?? defaults.audio ?? false)
  const videoRes = config?.resolution ?? (defaults.resolution as string | undefined)
  const modeByRes = (supports as { mode_by_resolution?: Record<string, unknown> }).mode_by_resolution
  if (schema.mode && videoRes) {
    const mode = modeByRes && typeof modeByRes === 'object' ? modeByRes[videoRes] : undefined
    if (mode === undefined) invalid.push({ key: 'resolution', value: videoRes, allowed: modeByRes ? Object.keys(modeByRes) : [] })
    else set('mode', mode)
  }

  // قرارات ثابتة للمنصة: PNG دائمًا، مرشّح أمان متوسط، لا نموذج بديل (تسعير ثابت — ADR 0003)
  if (schema.output_format?.enum?.includes('png')) input.output_format = 'png'
  if (schema.safety_filter_level?.enum?.includes('block_medium_and_above')) input.safety_filter_level = 'block_medium_and_above'
  if (schema.allow_fallback_model) input.allow_fallback_model = false

  if (config?.seed !== undefined && schema.seed) input.seed = config.seed

  return { input, invalid }
}
