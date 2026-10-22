import type { ImageSize } from '@shared/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** الدقة مع تكلفة كل خيار بالرصيد — التكلفة تظهر قبل الاختيار لا بعده. */
export function ResolutionPicker({
  options,
  value,
  costFor,
  onChange,
}: {
  options: ImageSize[]
  value: ImageSize
  costFor: (size: ImageSize) => number
  onChange: (v: ImageSize) => void
}) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('generate.resolution')} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${options.length}, minmax(0, 1fr))` }}>
      {options.map((s) => {
        const selected = s === value
        return (
          <button
            key={s}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(s)}
            className={cn(
              'flex flex-col items-center rounded-[var(--radius-sm)] border py-2 transition-colors',
              selected ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-white/[0.04]',
            )}
          >
            <span className="font-latin text-sm font-semibold">{s}</span>
            <span className="text-[11px]">{t('credits.n', { n: costFor(s) })}</span>
          </button>
        )
      })}
    </div>
  )
}
