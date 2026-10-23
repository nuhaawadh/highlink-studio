import { Check } from 'lucide-react'
import { useMemo } from 'react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'
import { familyName, groupByFamily, modelName, modelSupports, variantName, type ModelRow } from '@/lib/models'
import { cn } from '@/lib/utils'

/**
 * منتقي النماذج (المخطط §8، ADR 0005): بطاقة لكل عائلة (كلينج، سيدانس، فيو…) تعرض "من X رصيد" وشارة الجديد،
 * وداخل العائلة المختارة رقائق للإصدارات (برو/ستاندرد/تيربو…). عائلة بإصدار واحد = بطاقة بلا رقائق.
 * `defaultCost` = تكلفة النموذج بإعداداته الافتراضية (نفس دالة السيرفر) حتى تتطابق البطاقة مع الزر.
 */
export function ModelPicker({
  models,
  loading,
  value,
  onChange,
  defaultCost,
}: {
  models: ModelRow[]
  loading: boolean
  value: string | null
  onChange: (id: string) => void
  defaultCost: (m: ModelRow) => number
}) {
  const { t, locale } = useI18n()
  const families = useMemo(() => groupByFamily(models, defaultCost), [models, defaultCost])
  const selected = models.find((m) => m.id === value) ?? null
  const selectedFamily = selected ? (modelSupports(selected).family ?? selected.id) : null

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    )
  }
  if (!models.length) return <p className="text-sm text-muted">{t('generate.noModels')}</p>

  return (
    <div role="radiogroup" aria-label={t('generate.model')} className="flex flex-col gap-2">
      {families.map((f) => {
        const isSelectedFamily = f.key === selectedFamily
        const head = f.models[0]
        const lab = modelSupports(head).lab
        return (
          <div key={f.key} className={cn('rounded-[var(--radius-sm)] border transition-colors', isSelectedFamily ? 'border-brand bg-brand/10' : 'border-border bg-bg hover:bg-text/[0.04]')}>
            <button
              type="button"
              role="radio"
              aria-checked={isSelectedFamily}
              onClick={() => onChange(isSelectedFamily ? (selected?.id ?? head.id) : head.id)}
              className="flex w-full items-center gap-3 p-3 text-start"
            >
              <span className={cn('flex size-5 shrink-0 items-center justify-center rounded-none border', isSelectedFamily ? 'border-brand bg-brand text-brand-ink' : 'border-border')}>
                {isSelectedFamily && <Check className="size-3" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-2">
                  <span className="truncate text-sm font-semibold">{f.models.length > 1 ? familyName(head, locale) : modelName(head, locale)}</span>
                  {f.isNew && <Badge tone="new">{t('generate.new')}</Badge>}
                </span>
                <span className="mt-0.5 block text-xs text-muted">
                  {t('generate.fromCost', { n: f.fromCost })}
                  {lab && (
                    <>
                      {' · '}
                      <span className="font-mono">{lab}</span>
                    </>
                  )}
                  {f.models.length > 1 && <> · {t('generate.variants', { n: f.models.length })}</>}
                </span>
              </span>
            </button>

            {isSelectedFamily && f.models.length > 1 && (
              <div role="radiogroup" aria-label={t('generate.variant')} className="flex flex-wrap gap-1.5 border-t border-border/60 p-2">
                {f.models.map((m) => {
                  const on = m.id === value
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="radio"
                      aria-checked={on}
                      onClick={() => onChange(m.id)}
                      className={cn(
                        'rounded-none border px-2.5 py-1 text-xs transition-colors',
                        on ? 'border-brand bg-brand text-brand-ink' : 'border-border text-muted hover:bg-text/[0.06]',
                      )}
                      title={modelName(m, locale)}
                    >
                      {variantName(m, locale) || modelName(m, locale)}
                      <span className="font-latin tabular-nums"> · {defaultCost(m)}</span>
                    </button>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
