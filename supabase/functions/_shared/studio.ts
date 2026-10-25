import { z } from 'npm:zod@4'

/**
 * وصفات الاستوديوهات (المخطط §16، ADR 0006) — نقي بلا Deno ولا شبكة، يُختبر بـvitest.
 * الوصفة تُقرأ من studios.pipeline (يكتبها scripts/sync-studios.py من content/studios/<id>.json).
 * الواجهة لا تختار نموذجًا ولا عدسة ولا إضاءة: كلها مقفلة هنا، والمستخدم يختار المشهد والمقاسات فقط.
 */

const AspectRatio = z.enum(['1:1', '4:5', '9:16', '16:9', '3:4'])

export const StudioRecipeSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,40}$/),
  name_ar: z.string().min(1),
  name_en: z.string().min(1),
  /** النموذج المقفل (صف في جدول models) */
  model: z.string().min(1).max(64),
  inputs: z.object({
    product_image: z.literal('required'),
    scene: z.literal('optional'),
    preset: z.literal('optional'),
    text: z.literal('optional'),
  }),
  defaults: z.object({
    preset: z.string().min(1),
    resolution: z.enum(['1K', '2K', '4K']),
  }),
  limits: z.object({ scene_max: z.number().int().positive(), text_max: z.number().int().positive() }),
  presets: z.record(
    z.string().regex(/^[a-z0-9-]{1,40}$/),
    z.object({ ar: z.string().min(1), en: z.string().min(1), desc_ar: z.string().min(1), signature: z.string().min(1) }),
  ),
  prompt_template: z.string().min(1),
  negative: z.string(),
  outputs: z
    .array(
      z.object({
        key: z.string().regex(/^[a-z0-9-]{1,32}$/),
        ar: z.string().min(1),
        en: z.string().min(1),
        aspect_ratio: AspectRatio,
        angle: z.string().min(1),
        framing: z.string().min(1),
        default: z.boolean(),
      }),
    )
    .min(1)
    .max(6),
  qa: z.object({
    product_match_min: z.number().min(0).max(10),
    arabic_text_exact: z.boolean(),
    max_retries: z.number().int().min(0).max(3),
    judge: z.literal('gemini-flash'),
  }),
})

export type StudioRecipe = z.infer<typeof StudioRecipeSchema>
export type StudioOutput = StudioRecipe['outputs'][number]

/** يزيل ما قد يكسر القالب أو يخرج من علامات « » ويطبع المسافات — للمشهد والنص اللذين يكتبهما المستخدم */
export function sanitizeUserText(input: string | undefined, max: number): string {
  if (!input) return ''
  return input
    .replace(/[{}«»<>]/g, ' ')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

/**
 * يملأ القالب: {{#if x}}…{{/if}}، {{a.b}}، {{a|احتياطي}}. أي متغير مجهول = فارغ.
 * النفي يُلحق بسطر [AVOID] (نانو بنانا بلا negative_prompt).
 */
export function renderTemplate(template: string, vars: Record<string, string | undefined>, negative = ''): string {
  let out = template.replace(/\{\{#if\s+([a-z_.]+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, name: string, body: string) => (vars[name] ? body : ''))
  out = out.replace(/\{\{\s*([a-z_.]+)(?:\|([^}]*))?\s*\}\}/g, (_m, name: string, fallback?: string) => vars[name] || fallback || '')
  out = out
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.length > 0)
    .join('\n')
  const neg = negative.trim()
  if (!neg) return out
  const lines = out.split('\n')
  const i = lines.findIndex((l) => l.startsWith('[AVOID]'))
  if (i === -1) return `${out}\n[AVOID] ${neg}.`
  lines[i] = `${lines[i].replace(/[.\s]+$/, '')}, ${neg}.`
  return lines.join('\n')
}

export interface StudioPromptInput {
  preset: string
  scene?: string
  text?: string
  output: StudioOutput
}

/** البرومبت النهائي لمقاس واحد من التشغيل */
export function renderStudioPrompt(recipe: StudioRecipe, input: StudioPromptInput): string {
  const preset = recipe.presets[input.preset]
  if (!preset) throw new Error(`unknown preset ${input.preset}`)
  const scene = sanitizeUserText(input.scene, recipe.limits.scene_max)
  const text = sanitizeUserText(input.text, recipe.limits.text_max)
  return renderTemplate(
    recipe.prompt_template,
    {
      angle: input.output.angle,
      framing: input.output.framing,
      'preset.signature': preset.signature,
      scene: scene || undefined,
      text: text || undefined,
    },
    recipe.negative,
  )
}

/** المقاسات المطلوبة: الافتراضية إن لم تُحدَّد؛ مفاتيح مجهولة أو مكررة → خطأ */
export function selectOutputs(recipe: StudioRecipe, keys?: string[]): StudioOutput[] {
  if (!keys || keys.length === 0) return recipe.outputs.filter((o) => o.default)
  if (new Set(keys).size !== keys.length) throw new Error('duplicate output keys')
  return keys.map((k) => {
    const o = recipe.outputs.find((x) => x.key === k)
    if (!o) throw new Error(`unknown output ${k}`)
    return o
  })
}

/**
 * صورة المنتج تُقبل فقط من تخزيننا العام للمستخدم نفسه (ADR 0006 القرار 7):
 *   {project}/storage/v1/object/public/media/up/{uid}/…  (رفع المراجع)
 *   {project}/storage/v1/object/public/media/u/{uid}/…   (نتيجة سابقة له)
 */
export function isOwnReferenceUrl(url: string, projectUrl: string, userId: string): boolean {
  let u: URL
  let p: URL
  try {
    u = new URL(url)
    p = new URL(projectUrl)
  } catch {
    return false
  }
  if (u.protocol !== 'https:' || u.host !== p.host || u.search || u.hash) return false
  let path: string
  try {
    path = decodeURIComponent(u.pathname)
  } catch {
    return false // ترميز % معطوب (backlog B33-T3)
  }
  if (path.includes('..') || path.includes('//')) return false
  const base = '/storage/v1/object/public/media/'
  return path.startsWith(`${base}up/${userId}/`) || path.startsWith(`${base}u/${userId}/`)
}
