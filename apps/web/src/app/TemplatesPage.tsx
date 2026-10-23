import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import type { TemplateDef } from '@shared/templates'
import { TemplateCover } from '@/components/studio/TemplateIcon'
import { Badge } from '@/components/ui/badge'
import { useI18n } from '@/i18n'
import { env } from '@/lib/env'
import { useModels } from '@/lib/models'
import { seasonName, templateCatalog, templateFromCost, templateSeason, useModelMap } from '@/lib/templates'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'season' | string

/**
 * معرض القوالب السعودية (/templates — الحركة 6 في خطة التفوّق): مواسم (رمضان، الأعياد، اليوم الوطني، التأسيس، الجمعة البيضاء…)
 * وقطاعات (عقار، مطاعم، عطور، عبايات، عيادات، متاجر، سوشال). ما في موسمه الآن أو قريبًا يظهر أولًا.
 * التصفح عام؛ التوليد يحتاج دخولًا (في صفحة القالب).
 */
export function TemplatesPage() {
  const { t, locale } = useI18n()
  const { allModels: imageModels } = useModels('image')
  const { allModels: videoModels } = useModels('video')
  const models = useModelMap(imageModels, videoModels)
  const [filter, setFilter] = useState<Filter>('all')

  useEffect(() => {
    document.title = `${t('templates.title')} — ${env.VITE_APP_NAME}`
  }, [t])

  const now = useMemo(() => new Date(), [])
  const seasonal = useMemo(
    () => templateCatalog.templates.filter((tpl) => ['active', 'upcoming'].includes(templateSeason(tpl, now))).sort((a, b) => rank(a, now) - rank(b, now)),
    [now],
  )
  const shown = useMemo(() => {
    if (filter === 'season') return seasonal
    if (filter === 'all') return templateCatalog.templates
    return templateCatalog.templates.filter((tpl) => tpl.category === filter)
  }, [filter, seasonal])

  const chips: Array<{ key: Filter; label: string }> = [
    { key: 'all', label: t('templates.all') },
    ...(seasonal.length ? [{ key: 'season' as Filter, label: t('templates.inSeason') }] : []),
    ...templateCatalog.categories.map((c) => ({ key: c.key, label: locale === 'ar' ? c.ar : c.en })),
  ]

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-6 px-4 py-6 md:py-10">
      <header className="max-w-2xl">
        <h1 className="text-2xl font-extrabold md:text-3xl">{t('templates.title')}</h1>
        <p className="mt-2 text-sm text-muted md:text-base">{t('templates.subtitle', { n: templateCatalog.templates.length })}</p>
      </header>

      <div role="tablist" aria-label={t('templates.filter')} className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {chips.map((c) => (
          <button
            key={c.key}
            type="button"
            role="tab"
            aria-selected={filter === c.key}
            onClick={() => setFilter(c.key)}
            className={cn(
              'shrink-0 rounded-none border px-3.5 py-1.5 text-sm transition-colors',
              filter === c.key ? 'border-brand bg-brand text-brand-ink' : 'border-border text-muted hover:bg-text/[0.06]',
            )}
          >
            {c.label}
          </button>
        ))}
      </div>

      {filter === 'all' && seasonal.length > 0 && (
        <section aria-labelledby="in-season">
          <h2 id="in-season" className="mb-3 text-sm font-semibold text-muted">
            {t('templates.inSeasonTitle')}
          </h2>
          <Grid items={seasonal.slice(0, 8)} models={models} now={now} />
        </section>
      )}

      <section aria-label={t('templates.all')}>
        {filter === 'all' && seasonal.length > 0 && <h2 className="mb-3 text-sm font-semibold text-muted">{t('templates.allTitle')}</h2>}
        <Grid items={shown} models={models} now={now} />
      </section>
    </section>
  )
}

/** الآن قبل قريبًا، ثم بترتيب الملف */
function rank(tpl: TemplateDef, now: Date): number {
  return templateSeason(tpl, now) === 'active' ? 0 : 1
}

function Grid({ items, models, now }: { items: TemplateDef[]; models: ReturnType<typeof useModelMap>; now: Date }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
      {items.map((tpl) => (
        <TemplateCard key={tpl.id} tpl={tpl} cost={templateFromCost(tpl, models)} now={now} />
      ))}
    </div>
  )
}

function TemplateCard({ tpl, cost, now }: { tpl: TemplateDef; cost: number | null; now: Date }) {
  const { t, locale } = useI18n()
  const category = templateCatalog.categories.find((c) => c.key === tpl.category)
  const state = templateSeason(tpl, now)
  const season = seasonName(tpl.season, locale)

  return (
    <Link
      to={`/templates/${tpl.id}`}
      className="group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface transition-colors hover:border-brand/60"
    >
      <TemplateCover category={tpl.category} icon={category?.icon} className="h-28 md:h-32" />
      <div className="flex flex-1 flex-col gap-1.5 p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge>{t(`templates.kind.${tpl.tier_set}`)}</Badge>
          {state === 'active' && <Badge tone="new">{t('templates.now')}</Badge>}
          {state === 'upcoming' && <Badge tone="hot">{t('templates.soon')}</Badge>}
          {state === 'off' && season && <Badge>{t('templates.seasonal', { name: season })}</Badge>}
        </div>
        <h3 className="text-sm font-semibold leading-snug">{locale === 'ar' ? tpl.title_ar : tpl.title_en}</h3>
        <p className="line-clamp-2 text-xs text-muted">{locale === 'ar' ? tpl.desc_ar : tpl.desc_en}</p>
        <p className="mt-auto pt-1 text-xs font-semibold text-brand">{cost != null ? t('generate.fromCost', { n: cost }) : t('templates.unavailable')}</p>
      </div>
    </Link>
  )
}
