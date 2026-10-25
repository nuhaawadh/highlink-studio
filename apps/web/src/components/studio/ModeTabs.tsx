import { useI18n } from '@/i18n'
import type { GenMode } from '@/lib/models'
import { cn } from '@/lib/utils'

/** أوضاع صفحة التوليد (من نص / تعديل صورة / من صورة / بمراجع) — كل وضع يعرض نماذجه فقط (الخطوة 5). */
export function ModeTabs({ modes, value, onChange }: { modes: GenMode[]; value: GenMode; onChange: (m: GenMode) => void }) {
  const { t } = useI18n()
  if (modes.length < 2) return null
  return (
    <div role="tablist" aria-label={t('modes.label')} className="grid border border-border" style={{ gridTemplateColumns: `repeat(${modes.length}, minmax(0, 1fr))` }}>
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === value}
          onClick={() => onChange(m)}
          className={cn('px-2 py-2 text-xs font-medium transition-colors', m === value ? 'bg-text text-bg' : 'text-muted hover:bg-text/5 hover:text-text')}
        >
          {t(`modes.${m}`)}
        </button>
      ))}
    </div>
  )
}
