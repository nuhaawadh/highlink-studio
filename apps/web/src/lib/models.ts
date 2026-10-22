import { useEffect, useState } from 'react'
import type { Tables } from '@shared/db'
import { applyModelResolution, videoCredits } from '@shared/pricing'
import type { AspectRatio, ImageSize, VideoResolution } from '@shared/types'
import { supabase } from './supabase'

/**
 * كتالوج النماذج من جدول `models` (RLS: المفعّل فقط). لا نموذج مكتوب في الكود — كل شيء من البيانات (CLAUDE.md القاعدة 7).
 * التكلفة تُحسب بنفس دالة التسعير التي تستخدمها Edge Functions (applyModelResolution) حتى يطابق الزر ما يُخصم فعلًا.
 */
export type ModelRow = Tables<'models'>

interface Supports {
  sizes?: ImageSize[]
  aspect_ratios?: AspectRatio[]
  resolution_multipliers?: Record<string, number>
  ref_images?: number
  text?: boolean
  /** فيديو */
  i2v?: boolean
  audio?: boolean
  durations?: number[]
  resolutions?: VideoResolution[]
  video_cost_per_second?: Record<string, number>
}

export interface ModelDefaults {
  imageSize?: ImageSize
  aspectRatio?: AspectRatio
  duration?: number
  resolution?: VideoResolution
  audio?: boolean
}

export function modelSupports(model: ModelRow): Supports {
  return (model.supports && typeof model.supports === 'object' ? model.supports : {}) as Supports
}

export function modelDefaults(model: ModelRow): ModelDefaults {
  return (model.default_params && typeof model.default_params === 'object' ? model.default_params : {}) as ModelDefaults
}

/** الفيديو: المدد والدقات المدعومة وتكلفة مقطع بعينه — نفس videoCredits التي يخصم بها السيرفر */
export function modelDurations(model: ModelRow): number[] {
  const d = modelSupports(model).durations
  return d && d.length ? d : [5]
}

export function modelVideoResolutions(model: ModelRow): VideoResolution[] {
  const r = modelSupports(model).resolutions
  return r && r.length ? r : ['720p']
}

export function modelVideoCost(model: ModelRow, duration: number, resolution: VideoResolution, audio: boolean): number {
  return videoCredits(Number(model.cost_per_second ?? 0), duration, resolution, audio, model.supports)
}

/** أقل تكلفة ممكنة للعرض في منتقي النماذج ("من N رصيد") */
export function modelFromCost(model: ModelRow): number {
  if (model.type === 'video') {
    const d = modelDefaults(model)
    const durations = modelDurations(model)
    return modelVideoCost(model, Math.min(...durations), d.resolution ?? modelVideoResolutions(model)[0], false)
  }
  return modelCost(model, modelDefaults(model).imageSize ?? '1K')
}

export function modelSizes(model: ModelRow): ImageSize[] {
  const s = modelSupports(model).sizes
  return s && s.length ? s : ['1K']
}

export function modelAspectRatios(model: ModelRow): AspectRatio[] {
  const a = modelSupports(model).aspect_ratios
  return a && a.length ? a : ['1:1']
}

/** تكلفة صورة واحدة بهذا النموذج وبهذه الدقة — نفس حساب السيرفر */
export function modelCost(model: ModelRow, imageSize: ImageSize): number {
  return applyModelResolution(model.cost_credits ?? 0, imageSize, modelSupports(model).resolution_multipliers)
}

export function modelName(model: ModelRow, locale: 'ar' | 'en'): string {
  return locale === 'ar' ? model.name_ar : model.name_en
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

  return { models, loading, error }
}
