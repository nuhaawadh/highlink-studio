/**
 * القوالب الجاهزة (الحركة 6 في docs/competitive/beat-higgsfield-halai.md): بيانات في content/templates/*.json
 * + دوال نقية هنا تشترك فيها الواجهة والاختبارات (ولاحقًا MCP/API). القالب لا يضيف منطق مال: يختار نموذجًا مفعّلًا
 * وإعدادات، ويبني البرومبت من حقول يملؤها المستخدم، ثم يمر الطلب من generate-media كأي توليد (التسعير modelCredits).
 */
import type { AspectRatio, ImageSize } from './types'

export type TemplateTierSet = 'text' | 'photo' | 'video'

export interface TemplateField {
  key: string
  label_ar: string
  label_en: string
  placeholder_ar?: string
  placeholder_en?: string
  /** arabic_text = يُكتب حرفيًا على الصورة بين « »؛ text = وصف يدخل البرومبت؛ choice = من قائمة */
  kind: 'arabic_text' | 'text' | 'choice'
  required: boolean
  max: number
  default?: string
  options?: Array<{ value: string; ar: string; en: string }>
}

export interface TemplateDef {
  id: string
  category: string
  season?: string
  title_ar: string
  title_en: string
  desc_ar: string
  desc_en: string
  tier_set: TemplateTierSet
  aspect_ratio: AspectRatio
  /** فيديو فقط */
  duration?: number
  fields: TemplateField[]
  prompt: string
}

export interface TemplateTier {
  key: string
  ar: string
  en: string
  model: string
  imageSize?: ImageSize
  resolution?: string
}

export interface Season {
  key: string
  ar: string
  en: string
  /** نافذة سنوية بالشهر-اليوم (قد تعبر رأس السنة) */
  recurring?: { from: string; to: string }
  /** نوافذ بتواريخ محددة (المواسم الهجرية — تقديرية وتُراجع مع تقويم أم القرى) */
  windows?: Array<{ from: string; to: string }>
}

export interface TemplateCategory {
  key: string
  ar: string
  en: string
  icon: string
}

export interface TemplateCatalog {
  version: number
  categories: TemplateCategory[]
  seasons: Season[]
  tiers: Record<TemplateTierSet, TemplateTier[]>
  templates: TemplateDef[]
}

/** قيمة المستخدم قبل دخولها البرومبت: بلا « » ولا أقواس قالب ولا أسطر، مسافات مطويّة، ومقصوصة على الحد */
export function cleanFieldValue(value: string, max: number): string {
  return value
    .replace(/[«»{}]/g, '')
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
    .trim()
}

function valueFor(t: TemplateDef, values: Record<string, string | undefined>, key: string): string {
  const field = t.fields.find((f) => f.key === key)
  if (!field) return ''
  const raw = values[key]
  const v = raw && raw.trim() ? raw : (field.default ?? '')
  return cleanFieldValue(v, field.max)
}

/** يبني البرومبت النهائي: {{key}} يُعوَّض، {{#if key}}…{{/if}} يظهر فقط إن كان للحقل قيمة، وأي وسم متبقٍّ يُحذف */
export function renderTemplatePrompt(t: TemplateDef, values: Record<string, string | undefined>): string {
  let out = t.prompt.replace(/\{\{#if (\w+)\}\}([\s\S]*?)\{\{\/if\}\}/g, (_m, key: string, body: string) => (valueFor(t, values, key) ? body : ''))
  out = out.replace(/\{\{(\w+)\}\}/g, (_m, key: string) => valueFor(t, values, key))
  return out
    .replace(/\{\{[^}]*\}\}/g, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/ +([.,;:])/g, '$1')
    .trim()
}

export function missingFields(t: TemplateDef, values: Record<string, string | undefined>): string[] {
  // الافتراض يكفي للحقل المطلوب (عبارة التهنئة، خيار الأجواء…) — المستخدم غير مُلزم بإعادة كتابته
  return t.fields.filter((f) => f.required && !valueFor(t, values, f.key)).map((f) => f.key)
}

/** أيام قبل بداية الموسم يُعرض فيها القالب كـ"قريبًا" — وقت كافٍ لتجهيز حملة */
export const UPCOMING_DAYS = 45

export type SeasonState = 'active' | 'upcoming' | 'off' | 'always'

const DAY = 86_400_000

function riyadhDay(d: Date): number {
  // يوم بتوقيت الرياض (UTC+3 بلا توقيت صيفي) كعدد أيام منذ epoch — المقارنة بالأيام لا بالساعات
  return Math.floor((d.getTime() + 3 * 3_600_000) / DAY)
}

function dayOf(iso: string): number {
  return Math.floor(Date.parse(`${iso}T00:00:00Z`) / DAY)
}

export function seasonStatus(season: Season | undefined, now: Date): SeasonState {
  if (!season) return 'always'
  const today = riyadhDay(now)
  const ranges: Array<[number, number]> = []
  for (const w of season.windows ?? []) ranges.push([dayOf(w.from), dayOf(w.to)])
  if (season.recurring) {
    const year = new Date(today * DAY).getUTCFullYear()
    for (const y of [year - 1, year, year + 1]) {
      const from = dayOf(`${y}-${season.recurring.from}`)
      let to = dayOf(`${y}-${season.recurring.to}`)
      if (to < from) to = dayOf(`${y + 1}-${season.recurring.to}`)
      ranges.push([from, to])
    }
  }
  if (ranges.some(([a, b]) => today >= a && today <= b)) return 'active'
  if (ranges.some(([a]) => a > today && a - today <= UPCOMING_DAYS)) return 'upcoming'
  return 'off'
}
