import type { AspectRatio } from '@shared/types'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** أبعاد المستطيل المصغّر لكل نسبة (بالبكسل داخل صندوق 20×20) */
const SHAPES: Record<AspectRatio, { w: number; h: number }> = {
  '1:1': { w: 16, h: 16 },
  '9:16': { w: 10, h: 18 },
  '16:9': { w: 18, h: 10 },
  '4:5': { w: 14, h: 18 },
  '3:4': { w: 14, h: 18 },
}

export function AspectRatioPicker({ options, value, onChange }: { options: AspectRatio[]; value: AspectRatio; onChange: (v: AspectRatio) => void }) {
  const { t } = useI18n()
  return (
    <div role="radiogroup" aria-label={t('generate.aspectRatio')} className="grid grid-cols-5 gap-1.5">
      {options.map((r) => {
        const s = SHAPES[r] ?? SHAPES['1:1']
        const selected = r === value
        return (
          <button
            key={r}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={r}
            onClick={() => onChange(r)}
            className={cn(
              'flex flex-col items-center gap-1 rounded-[var(--radius-sm)] border py-2 text-[11px] transition-colors',
              selected ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-text/[0.04]',
            )}
          >
            <span className="flex size-5 items-center justify-center">
              <span className={cn('rounded-[2px] border', selected ? 'border-brand' : 'border-current')} style={{ width: s.w, height: s.h }} />
            </span>
            <span className="font-latin">{r}</span>
          </button>
        )
      })}
    </div>
  )
}
