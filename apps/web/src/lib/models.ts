import { useEffect, useState } from 'react'
import type { Tables } from '@shared/db'
import { applyModelResolution } from '@shared/pricing'
import type { AspectRatio, ImageSize } from '@shared/types'
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
}

export function modelSupports(model: ModelRow): Supports {
  return (model.supports && typeof model.supports === 'object' ? model.supports : {}) as Supports
}

export function modelDefaults(model: ModelRow): { imageSize?: ImageSize; aspectRatio?: AspectRatio } {
  return (model.default_params && typeof model.default_params === 'object' ? model.default_params : {}) as {
    imageSize?: ImageSize
    aspectRatio?: AspectRatio
  }
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
