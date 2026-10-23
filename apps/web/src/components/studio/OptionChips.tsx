import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * رقائق خيارات عامة (المدة، دقة الفيديو…) مع تكلفة اختيارية تحت كل خيار — التكلفة تظهر قبل الاختيار لا بعده (المخطط §8).
 * تُستخدم حيث القيم نصوص حرة من مخطط المزوّد (مثل "768P") ولا يناسبها منتقي ثابت.
 */
export function OptionChips<T extends string | number>({
  label,
  options,
  value,
  format,
  costFor,
  onChange,
}: {
  label: string
  options: T[]
  value: T
  format?: (v: T) => string
  costFor?: (v: T) => number
  onChange: (v: T) => void
}) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={label} className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const selected = o === value
        return (
          <button
            key={String(o)}
            type="button"
            role="radio"
            aria-checked={selected}
            onClick={() => onChange(o)}
            className={cn(
              'flex min-w-12 flex-col items-center rounded-[var(--radius-sm)] border px-2.5 py-1.5 transition-colors',
              selected ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-white/[0.04]',
            )}
          >
            <span className="font-latin text-sm font-semibold">{format ? format(o) : String(o)}</span>
            {costFor && <span className="text-[11px]">{t('credits.n', { n: costFor(o) })}</span>}
          </button>
        )
      })}
    </div>
  )
}
