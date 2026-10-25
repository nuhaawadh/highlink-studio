import { useEffect, useMemo, useState } from 'react'
import type { Tables } from '@shared/db'
import { modelCredits, resolveDuration } from '@shared/pricing'
import type { AspectRatio, ImageSize } from '@shared/types'
import { supabase } from './supabase'

/**
 * كتالوج النماذج من جدول `models` (RLS: المفعّل فقط). لا نموذج مكتوب في الكود — كل شيء من البيانات (CLAUDE.md القاعدة 7).
 * التكلفة تُحسب بنفس دالة التسعير التي تستخدمها Edge Functions (modelCredits — ADR 0005) حتى يطابق الزر ما يُخصم فعلًا.
 * الصفوف المولّدة من كتالوج fal تحمل في `supports` العائلة والإصدار ونوع العملية وقوائم المدد/الدقات المشتقة من مخطط المزوّد.
 */
export type ModelRow = Tables<'models'>

export interface Supports {
  family?: string
  family_ar?: string
  family_en?: string
  variant_ar?: string
  variant_en?: string
  kind?: string
  lab?: string
  /** يظهر في صفحات التوليد الحر (نص فقط)؛ false = متاح عبر API/الاستوديوهات فقط (يحتاج مراجع أو مدخلات أخرى) */
  ui?: boolean
  sizes?: ImageSize[]
  aspect_ratios?: AspectRatio[]
  /** دقات الفيديو كما يسمّيها المزوّد */
  resolutions?: string[]
  durations?: number[]
  audio?: boolean
  resolution_multipliers?: Record<string, number>
  cps_by_resolution?: Record<string, number>
  audio_cps?: number
  credits_by_duration?: Record<string, number>
  ref_images?: number
  requires_ref?: boolean
  /** أقل عدد مراجع يقبله النموذج (2 = إطار أول وأخير، أو شخص وقطعة) */
  min_refs?: number
  text?: boolean
  i2v?: boolean
  /** جدول كامل بالدقة والدقة+الصوت (Kling عبر Replicate) — يقرؤه modelCredits */
  video_cost_per_second?: Record<string, number>
  mode_by_resolution?: Record<string, string>
}

export interface ModelDefaults {
  imageSize?: ImageSize
  aspectRatio?: AspectRatio
  duration?: number
  resolution?: string
  audio?: boolean
}

export function modelSupports(model: ModelRow): Supports {
  return (model.supports && typeof model.supports === 'object' ? model.supports : {}) as Supports
}

export function modelDefaults(model: ModelRow): ModelDefaults {
  return (model.default_params && typeof model.default_params === 'object' ? model.default_params : {}) as ModelDefaults
}

export function modelSizes(model: ModelRow): ImageSize[] {
  const s = modelSupports(model).sizes
  return s && s.length ? s : ['1K']
}

export function modelAspectRatios(model: ModelRow): AspectRatio[] {
  const a = modelSupports(model).aspect_ratios
  return a && a.length ? a : ['1:1']
}

export function modelDurations(model: ModelRow): number[] {
  const d = modelSupports(model).durations
  if (d && d.length) return d
  const fallback = resolveDuration({ ...model, type: model.type as 'image' | 'video' | 'audio' }, undefined)
  return fallback ? [fallback] : []
}

export function modelResolutions(model: ModelRow): string[] {
  return modelSupports(model).resolutions ?? []
}

export function modelHasAudio(model: ModelRow): boolean {
  return modelSupports(model).audio === true
}

/** صوت بلا زيادة سعر (Seedance/Wan/LTX…): يبدأ مفعّلًا في الواجهة — نفس قاعدة السيرفر في inputs.ts */
export function modelAudioFree(model: ModelRow): boolean {
  const s = modelSupports(model)
  const tabled = Object.keys(s.video_cost_per_second ?? {}).some((k) => k.endsWith('+audio'))
  return s.audio === true && !(typeof s.audio_cps === 'number' && s.audio_cps > 0) && !tabled
}

/** تكلفة النموذج بإعداداته الافتراضية — فيديو: مدة ودقة الافتراض بلا صوت، صورة: دقة الافتراض */
export function defaultCost(model: ModelRow): number {
  const d = modelDefaults(model)
  return model.type === 'video' ? videoCost(model, { duration: d.duration, resolution: d.resolution }) : modelCost(model, d.imageSize ?? '1K')
}

/** كم توليدة يكفيها رصيد بأرخص نموذج في القائمة (بإعداداته الافتراضية) — "حتى"، لأن الأغلى أقل. بلا نماذج مسعّرة = null */
export function affordableCount(models: ModelRow[], credits: number): number | null {
  const costs = models.map(defaultCost).filter((c) => c > 0)
  return costs.length ? Math.floor(Math.max(0, credits) / Math.min(...costs)) : null
}

/** تكلفة صورة واحدة بهذا النموذج وبهذه الدقة — نفس حساب السيرفر */
export function modelCost(model: ModelRow, imageSize: ImageSize): number {
  return safeCredits(model, { imageSize })
}

/** تكلفة فيديو بهذه المدة/الدقة/الصوت — نفس حساب السيرفر (modelCredits) */
export function videoCost(model: ModelRow, opts: { duration?: number; resolution?: string; audio?: boolean }): number {
  return safeCredits(model, opts)
}

function safeCredits(model: ModelRow, opts: Parameters<typeof modelCredits>[1]): number {
  try {
    // عمود type نصي في الأنواع المولّدة؛ القيد في القاعدة يحصره في image/video/audio
    return modelCredits({ ...model, type: model.type as 'image' | 'video' | 'audio' }, opts)
  } catch {
    // صف بلا سعر صالح (لا يُفترض أن يصل للواجهة لأن RLS تعرض المفعّل فقط) — نعرض 0 ولا نخفي النموذج، والسيرفر يرفض
    return 0
  }
}

export function modelName(model: ModelRow, locale: 'ar' | 'en'): string {
  return locale === 'ar' ? model.name_ar : model.name_en
}

export function familyName(model: ModelRow, locale: 'ar' | 'en'): string {
  const s = modelSupports(model)
  return (locale === 'ar' ? s.family_ar : s.family_en) ?? modelName(model, locale)
}

export function variantName(model: ModelRow, locale: 'ar' | 'en'): string {
  const s = modelSupports(model)
  return (locale === 'ar' ? s.variant_ar : s.variant_en) ?? ''
}

export interface ModelFamily {
  key: string
  models: ModelRow[]
  /** أرخص تكلفة افتراضية بين إصدارات العائلة — لبطاقة العائلة */
  fromCost: number
  isNew: boolean
}

/** يجمّع النماذج بالعائلة (كلينج، سيدانس…) مع الحفاظ على ترتيب `sort`؛ نموذج بلا عائلة يكوّن عائلة بنفسه */
export function groupByFamily(models: ModelRow[], defaultCost: (m: ModelRow) => number): ModelFamily[] {
  const map = new Map<string, ModelFamily>()
  for (const m of models) {
    const key = modelSupports(m).family ?? m.id
    const cost = defaultCost(m)
    const f = map.get(key)
    if (f) {
      f.models.push(m)
      f.fromCost = Math.min(f.fromCost, cost)
      f.isNew = f.isNew || Boolean(m.badge)
    } else {
      map.set(key, { key, models: [m], fromCost: cost, isNew: Boolean(m.badge) })
    }
  }
  return Array.from(map.values())
}

/**
 * أوضاع صفحات التوليد الحر (الخطوة 5 — رفع المراجع): كل وضع يعرض أنواعه فقط، فلا تتكرر رقائق الإصدار
 * (kling-v4 وkling-v4-i2v كلاهما "4") ويظهر منتقي المراجع بالعدد الصحيح.
 *   text  — كما كان: ما لا يحتاج مراجع ولم يُخفَ (supports.ui !== false)
 *   edit  — الصور: تعديل بالمراجع
 *   image — الفيديو: من صورة (إطار أول، وأول+أخير)
 *   refs  — الفيديو: بمراجع (شخصية/منتج/أسلوب)
 */
export type GenMode = 'text' | 'edit' | 'image' | 'refs'

const MODE_KINDS: Record<'image' | 'video', Partial<Record<GenMode, string[]>>> = {
  image: { edit: ['edit'] },
  video: { image: ['i2v', 'flf2v'], refs: ['ref2v'] },
}

export function modesFor(type: 'image' | 'video'): GenMode[] {
  return ['text', ...(Object.keys(MODE_KINDS[type]) as GenMode[])]
}

export function modelsForMode(models: ModelRow[], type: 'image' | 'video', mode: GenMode): ModelRow[] {
  const ofType = models.filter((m) => m.type === type)
  if (mode === 'text') return ofType.filter((m) => modelSupports(m).ui !== false && modelSupports(m).requires_ref !== true)
  const kinds = MODE_KINDS[type][mode]
  if (!kinds) return []
  return ofType.filter((m) => kinds.includes(String(modelSupports(m).kind ?? '')))
}

/** أقصى عدد مراجع يعرضه المنتقي في الواجهة (المزوّد قد يقبل أكثر؛ الـAPI يقبل حتى 14) */
const UI_MAX_REFS = 4

/**
 * مواصفة منتقي المراجع للنموذج: الحد الأدنى والأعلى، و`frames` = المراجع إطارات (الأول ثم الأخير) لا مجموعة صور.
 * الخادم يفرض الحد الأدنى نفسه (generate-core: requires_ref/min_refs) — هذا للعرض والتعطيل قبل الضغط.
 */
export function modelRefSpec(model: ModelRow): { min: number; max: number; frames: boolean } {
  const s = modelSupports(model)
  if (!s.requires_ref) return { min: 0, max: 0, frames: false }
  const kind = String(s.kind ?? '')
  const frames = kind === 'i2v' || kind === 'flf2v'
  const min = Math.max(1, s.min_refs ?? 1)
  const declared = s.ref_images && s.ref_images > 0 ? s.ref_images : min
  const max = Math.max(min, Math.min(frames ? 2 : UI_MAX_REFS, declared))
  return { min, max, frames }
}

export function useModels(type: 'image' | 'video') {
  const [models, setModels] = useState<ModelRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let active = true
    setLoading(true)
    supabase
      .from('models')
      .select('*')
      .eq('type', type)
      .eq('enabled', true)
      .order('sort', { ascending: true })
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          console.error('[models] load failed:', error.message)
          setError(error.message)
        } else {
          setModels(data ?? [])
        }
        setLoading(false)
      })
    return () => {
      active = false
    }
  }, [type])

  // صفحات التوليد الحر تعرض ما يعمل بنص فقط؛ ما يحتاج مراجع (تعديل، صورة→فيديو) يبقى للـAPI والاستوديوهات حتى يُبنى رفع المراجع
  const uiModels = useMemo(() => models.filter((m) => modelSupports(m).ui !== false && modelSupports(m).requires_ref !== true), [models])

  return { models: uiModels, allModels: models, loading, error }
}
