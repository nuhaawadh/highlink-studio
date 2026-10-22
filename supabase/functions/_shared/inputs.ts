import type { GenerateConfig, ModelRow } from './types.ts'

/**
 * بناء مدخلات المزوّد من طلبنا الموحّد اعتمادًا على `models.input_schema` (المخطط §15 الطبقة 1):
 * - لا كود لكل نموذج: إن كان للمخطط خاصية بهذا الاسم نضبطها، وإلا نتجاهلها.
 * - أي قيمة خارج enum المخطط تُرفض قبل الحجز (يرجع خطأ بسبب مفهوم).
 * نقي (بلا Deno) ليُختبر بـvitest.
 */
export interface BuiltInput {
  input: Record<string, unknown>
  /** مفاتيح رُفضت لأن قيمها خارج enum المخطط */
  invalid: Array<{ key: string; value: unknown; allowed: unknown[] }>
}

type SchemaProp = { type?: string; enum?: unknown[]; default?: unknown; maxItems?: number }

function props(model: ModelRow): Record<string, SchemaProp> {
  const p = (model.input_schema as { properties?: Record<string, SchemaProp> } | null)?.properties
  return p && typeof p === 'object' ? p : {}
}

export function buildProviderInput(model: ModelRow, prompt: string, images: string[] | undefined, config: GenerateConfig | undefined): BuiltInput {
  const schema = props(model)
  const input: Record<string, unknown> = { prompt }
  const invalid: BuiltInput['invalid'] = []

  const set = (key: string, value: unknown) => {
    const prop = schema[key]
    if (!prop || value === undefined) return
    if (Array.isArray(prop.enum) && !prop.enum.includes(value)) {
      invalid.push({ key, value, allowed: prop.enum })
      return
    }
    input[key] = value
  }

  const refs = images ?? []
  if (schema.image_input) {
    const max = schema.image_input.maxItems ?? refs.length
    input.image_input = refs.slice(0, max)
  }

  // إن وُجدت مراجع ولم يُطلب قياس، نترك النموذج يطابق قياس الصورة المرجعية (إن كان ذلك ضمن المخطط)
  const aspect = config?.aspectRatio ?? (refs.length && schema.aspect_ratio?.enum?.includes('match_input_image') ? 'match_input_image' : undefined)
  set('aspect_ratio', aspect ?? (model.default_params.aspectRatio as string | undefined))
  set('resolution', config?.imageSize ?? (model.default_params.imageSize as string | undefined))

  // قرارات ثابتة للمنصة: PNG دائمًا، مرشّح أمان متوسط، لا نموذج بديل (تسعير ثابت — ADR 0003)
  if (schema.output_format?.enum?.includes('png')) input.output_format = 'png'
  if (schema.safety_filter_level?.enum?.includes('block_medium_and_above')) input.safety_filter_level = 'block_medium_and_above'
  if (schema.allow_fallback_model) input.allow_fallback_model = false

  if (config?.seed !== undefined && schema.seed) input.seed = config.seed

  return { input, invalid }
}
