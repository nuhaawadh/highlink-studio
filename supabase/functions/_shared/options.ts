import { resolveDuration } from './pricing.ts'
import type { GenerateConfig, ModelRow } from './types.ts'

/**
 * تطبيع خيارات الطلب وفحصها قبل التسعير والحجز (المراجعة المستقلة 2026-10-24، الثغرة 1).
 * السيرفر يقبل فقط ما تعرضه `models.supports` — نفس ما تعرضه الواجهة و`GET /v1/models`:
 * - فيديو: الدقة ∈ supports.resolutions (وبلا قائمة: الافتراضي فقط)، المدة ∈ supports.durations
 *   (وبلا قائمة لنموذج بالمقطع: المدة الافتراضية فقط)، والصوت فقط إن supports.audio = true.
 * - صورة: الحجم ∈ supports.sizes (وبلا قائمة: الافتراضي أو 1K).
 * حالة الأحرف تتوحّد على اسم القائمة ("720P" → "720p") لأن جداول الأسعار مفهرسة بها.
 * نقي (بلا Deno) ليُختبر بـvitest؛ لا يعدّل الطلب الأصلي.
 */
export interface OptionIssue {
  key: 'resolution' | 'imageSize' | 'duration' | 'audio'
  value: unknown
  allowed: unknown[]
}

export interface NormalizedOptions {
  config: GenerateConfig
  issue: OptionIssue | null
}

function list<T>(x: unknown): T[] {
  return Array.isArray(x) ? (x as T[]) : []
}

function match(value: string, options: string[]): string | undefined {
  const v = value.toLowerCase()
  return options.find((o) => String(o).toLowerCase() === v)
}

export function normalizeOptions(model: ModelRow, config: GenerateConfig | undefined): NormalizedOptions {
  const out: GenerateConfig = { ...(config ?? {}) }
  const supports = (model.supports ?? {}) as Record<string, unknown>
  const defaults = (model.default_params ?? {}) as Record<string, unknown>

  if (model.type === 'image') {
    if (out.imageSize !== undefined) {
      const sizes = list<string>(supports.sizes)
      const allowed = sizes.length ? sizes : [typeof defaults.imageSize === 'string' ? defaults.imageSize : '1K']
      const hit = match(String(out.imageSize), allowed)
      if (!hit) return { config: out, issue: { key: 'imageSize', value: out.imageSize, allowed } }
      out.imageSize = hit as GenerateConfig['imageSize']
    }
    return { config: out, issue: null }
  }

  if (model.type === 'video') {
    if (out.resolution !== undefined) {
      const resolutions = list<string>(supports.resolutions)
      const allowed = resolutions.length ? resolutions : typeof defaults.resolution === 'string' ? [defaults.resolution] : []
      const hit = match(out.resolution, allowed)
      if (!hit) return { config: out, issue: { key: 'resolution', value: out.resolution, allowed } }
      out.resolution = hit
    }
    if (out.duration !== undefined) {
      const durations = list<number>(supports.durations)
      if (durations.length) {
        if (!durations.includes(out.duration)) return { config: out, issue: { key: 'duration', value: out.duration, allowed: durations } }
      } else if (model.cost_per_second == null) {
        // نموذج بالمقطع بلا قائمة مدد: سعره لمدته الافتراضية فقط
        const only = resolveDuration(model)
        if (out.duration !== only) return { config: out, issue: { key: 'duration', value: out.duration, allowed: only ? [only] : [] } }
      }
    }
    if (out.audio === true && supports.audio !== true) return { config: out, issue: { key: 'audio', value: true, allowed: [false] } }
    return { config: out, issue: null }
  }

  return { config: out, issue: null }
}
