import { useEffect, useState } from 'react'
import type { AspectRatio, ImageSize } from '@shared/types'
import { modelCost, type ModelRow } from './models'
import { supabase } from './supabase'

/**
 * الاستوديوهات من جدول studios (ADR 0006): الوصفة كاملة في pipeline، والواجهة تعرض منها المشاهد والمقاسات فقط.
 * RLS: المفعّل للجميع، والمعطّل للمشرف فقط (معاينة قبل الإطلاق). التكلفة من صف النموذج المقفل — نفس حساب السيرفر.
 */
export interface StudioPreset {
  ar: string
  en: string
  desc_ar: string
  signature: string
}

export interface StudioOutputDef {
  key: string
  ar: string
  en: string
  aspect_ratio: AspectRatio
  angle: string
  framing: string
  default: boolean
}

export interface StudioRecipe {
  id: string
  name_ar: string
  name_en: string
  model: string
  defaults: { preset: string; resolution: ImageSize }
  limits: { scene_max: number; text_max: number }
  presets: Record<string, StudioPreset>
  outputs: StudioOutputDef[]
  qa: { product_match_min: number; arabic_text_exact: boolean; max_retries: number }
}

function asRecipe(pipeline: unknown): StudioRecipe | null {
  const r = pipeline as Partial<StudioRecipe> | null
  if (!r || typeof r !== 'object' || !r.id || !r.model || !r.presets || !Array.isArray(r.outputs) || !r.defaults) return null
  return r as StudioRecipe
}

export interface StudioState {
  recipe: StudioRecipe | null
  enabled: boolean
  model: ModelRow | null
  /** تكلفة صورة واحدة بدقة الوصفة */
  costEach: number | null
  loading: boolean
}

export function useStudio(studioId: string | null): StudioState {
  const [state, setState] = useState<StudioState>({ recipe: null, enabled: false, model: null, costEach: null, loading: Boolean(studioId) })

  useEffect(() => {
    if (!studioId) {
      setState({ recipe: null, enabled: false, model: null, costEach: null, loading: false })
      return
    }
    let active = true
    void (async () => {
      const { data: row } = await supabase.from('studios').select('id, enabled, pipeline').eq('id', studioId).maybeSingle()
      const recipe = asRecipe(row?.pipeline)
      let model: ModelRow | null = null
      if (recipe) {
        const { data } = await supabase.from('models').select('*').eq('id', recipe.model).maybeSingle()
        model = data ?? null
      }
      if (!active) return
      setState({
        recipe,
        enabled: Boolean(row?.enabled),
        model,
        costEach: recipe && model ? modelCost(model, recipe.defaults.resolution) : null,
        loading: false,
      })
    })()
    return () => {
      active = false
    }
  }, [studioId])

  return state
}
