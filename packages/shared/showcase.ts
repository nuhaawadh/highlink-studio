import type { TemplateDef } from './templates'

/**
 * معرض العرض (المخطط §9): صور وفيديوهات حقيقية ولّدتها المنصة نفسها — غلاف لكل قالب، مقطع لكل عائلة نماذج،
 * وثلاث محاولات للهيرو تختار منها نهى. يكتبها `scripts/make-showcase.ts` في content/showcase/showcase.json،
 * والملفات في bucket media تحت showcase/ (عامة القراءة). الواجهة تقرأ الملف فقط — لا توليد ولا رصيد من هنا.
 */
export interface ShowcaseMedia {
  url: string
  kind: 'image' | 'video'
  /** "16:9" — نسبة العرض كما وُلّدت */
  aspect: string
  model: string
  prompt: string
  created_at: string
}

export interface ShowcaseFile {
  version: 1
  generated_at: string | null
  hero: { candidates: ShowcaseMedia[]; selected: number }
  templates: Record<string, ShowcaseMedia>
  /** المفتاح familyKey(type, family) — "video:kling"، "image:seedream" */
  families: Record<string, ShowcaseMedia>
}

export const EMPTY_SHOWCASE: ShowcaseFile = { version: 1, generated_at: null, hero: { candidates: [], selected: 0 }, templates: {}, families: {} }

export function familyKey(type: string, family: string): string {
  return `${type}:${family}`
}

/** الهيرو المختار؛ رقم خارج المدى يرجع لأول محاولة، وبلا محاولات = null */
export function heroMedia(f: ShowcaseFile): ShowcaseMedia | null {
  const c = f.hero.candidates
  if (!c.length) return null
  const i = Number.isInteger(f.hero.selected) && f.hero.selected >= 0 && f.hero.selected < c.length ? f.hero.selected : 0
  return c[i]
}

/** دمج تشغيل جديد فوق القديم: ما نجح الآن يحل محل القديم، وما لم يُولَّد يبقى كما كان (التشغيل الجزئي لا يمسح شيئًا) */
export function mergeShowcase(prev: ShowcaseFile, next: Partial<Omit<ShowcaseFile, 'version'>>): ShowcaseFile {
  return {
    version: 1,
    generated_at: next.generated_at ?? prev.generated_at,
    hero: next.hero && next.hero.candidates.length ? next.hero : prev.hero,
    templates: { ...prev.templates, ...(next.templates ?? {}) },
    families: { ...prev.families, ...(next.families ?? {}) },
  }
}

/** "16:9" → "16 / 9" لـ CSS aspect-ratio؛ أي قيمة غير صالحة → 16 / 9 */
export function cssAspect(aspect: string | undefined): string {
  const m = /^(\d+):(\d+)$/.exec(aspect ?? '')
  return m ? `${m[1]} / ${m[2]}` : '16 / 9'
}

/**
 * قيم تجريبية لحقول القالب حتى يُولَّد غلافه: الافتراضي، ثم المثال المكتوب (بلا "مثال:"/"e.g.")، ثم أول خيار.
 * النص العربي الذي يُكتب على الصورة يأخذ المثال العربي، والوصف الذي يدخل البرومبت يأخذ المثال الإنجليزي.
 * `overrides` لحقول بلا مثال (content/showcase/plan.json).
 */
export function sampleValues(t: TemplateDef, overrides: Record<string, string> = {}): Record<string, string> {
  const out: Record<string, string> = {}
  for (const f of t.fields) {
    const strip = (s?: string) => (s ?? '').replace(/^\s*(مثال|e\.g\.)\s*[:：]?\s*/i, '').trim()
    const example = f.kind === 'arabic_text' ? strip(f.placeholder_ar) : strip(f.placeholder_en)
    const v = overrides[f.key] ?? f.default ?? (example || undefined) ?? f.options?.[0]?.value
    if (v) out[f.key] = v
  }
  return out
}
