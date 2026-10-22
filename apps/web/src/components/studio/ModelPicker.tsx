import { Check } from 'lucide-react'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'
import { modelFromCost, modelName, type ModelRow } from '@/lib/models'
import { cn } from '@/lib/utils'

/** منتقي النماذج ببطاقات (المخطط §8): الاسم، الشارة، التكلفة بالدقة الافتراضية. */
export function ModelPicker({
  models,
  loading,
  value,
  onChange,
}: {
  models: ModelRow[]
  loading: boolean
  value: string | null
  onChange: (id: string) => void
}) {
  const { t, locale } = useI18n()

  if (loading) {
    return (
      <div className="flex flex-col gap-2">
        <Skeleton className="h-14" />
        <Skeleton className="h-14" />
      </div>
    )
  }
  if (!models.length) return <p className="text-sm text-muted">{t('generate.noModels')}</p>

  return (
    <div role="radiogroup" aria-label={t('generate.model')} className="flex flex-col gap-2">
      {models.map((m) => {
        const selected = m.id === value
        const cost = modelFromCost(m)
        return (
          <button
            key={m.id}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(m.id)}
            className={cn(
              'flex items-center gap-3 rounded-[var(--radius-sm)] border p-3 text-start transition-colors',
              selected ? 'border-brand bg-brand/10' : 'border-border bg-bg hover:bg-white/[0.04]',
            )}
          >
            <span
              className={cn(
                'flex size-5 shrink-0 items-center justify-center rounded-full border',
                selected ? 'border-brand bg-brand text-brand-ink' : 'border-border',
              )}
            >
              {selected && <Check className="size-3" aria-hidden />}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-center gap-2">
                <span className="truncate text-sm font-semibold">{modelName(m, locale)}</span>
                {m.badge && <Badge tone="new">{m.badge}</Badge>}
              </span>
              <span className="mt-0.5 block text-xs text-muted">
                {t('generate.fromCost', { n: cost })} · <span className="font-latin">{m.provider}</span>
              </span>
            </span>
          </button>
        )
      })}
    </div>
  )
}
