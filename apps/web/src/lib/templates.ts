import { useMemo } from 'react'
import { seasonStatus, type SeasonState, type TemplateCatalog, type TemplateDef, type TemplateTier } from '@shared/templates'
import raw from '@content/templates/saudi.json'
import { modelCost, videoCost, type ModelRow } from './models'

/**
 * القوالب الجاهزة: بيانات ثابتة من content/templates/saudi.json تُحزَم مع الواجهة (لا جدول ولا migration — ADR 0005 نفس المبدأ:
 * بيانات لا كود). التكلفة تُحسب من صف النموذج في قاعدة البيانات بنفس دالة السيرفر، فلو تغيّر السعر يتغيّر الزر.
 */
export const templateCatalog = raw as unknown as TemplateCatalog

export function findTemplate(id: string | undefined): TemplateDef | undefined {
  return templateCatalog.templates.find((t) => t.id === id)
}

export function tiersFor(t: TemplateDef): TemplateTier[] {
  return templateCatalog.tiers[t.tier_set] ?? []
}

export function templateSeason(t: TemplateDef, now = new Date()): SeasonState {
  return seasonStatus(templateCatalog.seasons.find((s) => s.key === t.season), now)
}

export function seasonName(key: string | undefined, locale: 'ar' | 'en'): string | null {
  const s = templateCatalog.seasons.find((x) => x.key === key)
  return s ? (locale === 'ar' ? s.ar : s.en) : null
}

/** تكلفة مستوى جودة لقالب، أو null إن لم يكن نموذجه مفعّلًا في قاعدة البيانات */
export function tierCost(t: TemplateDef, tier: TemplateTier, models: Map<string, ModelRow>): number | null {
  const m = models.get(tier.model)
  if (!m) return null
  const cost = t.tier_set === 'video' ? videoCost(m, { duration: t.duration, resolution: tier.resolution }) : modelCost(m, tier.imageSize ?? '1K')
  return cost > 0 ? cost : null
}

/** أرخص تكلفة متاحة للقالب (لبطاقة "من X رصيد") */
export function templateFromCost(t: TemplateDef, models: Map<string, ModelRow>): number | null {
  const costs = tiersFor(t)
    .map((tier) => tierCost(t, tier, models))
    .filter((c): c is number => c != null)
  return costs.length ? Math.min(...costs) : null
}

export function useModelMap(image: ModelRow[], video: ModelRow[]): Map<string, ModelRow> {
  return useMemo(() => new Map([...image, ...video].map((m) => [m.id, m])), [image, video])
}
