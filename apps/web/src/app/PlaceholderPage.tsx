import { useI18n } from '@/i18n'

/**
 * صفحة مؤقتة للمسارات التي تُبنى في المراحل التالية (المخطط §11).
 * تُستبدل صفحةً صفحة — لا تُحذف قبل أن يكون البديل جاهزًا.
 */
export function PlaceholderPage({ titleKey, phase }: { titleKey: string; phase: number }) {
  const { t } = useI18n()
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-2 px-6 py-24 text-center">
      <h1 className="text-2xl font-extrabold">{t(titleKey)}</h1>
      <p className="text-sm text-muted">
        {t('studios.soon')} · {phase}
      </p>
    </section>
  )
}
