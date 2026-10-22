import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { useI18n } from '@/i18n'
import { useAuth } from '@/lib/auth'

/**
 * الرئيسية — المرحلة 0: هيرو نصي فقط. فيديو الهيرو وبطاقات الاستوديوهات تأتي في المرحلة 2 (المخطط §9).
 */
export function HomePage() {
  const { t } = useI18n()
  const { user } = useAuth()

  return (
    <section className="relative flex min-h-dvh flex-col items-center justify-center overflow-hidden px-6 text-center">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.06),transparent_60%)]" />
      <div className="relative z-10 max-w-5xl space-y-6">
        <h1 className="text-5xl font-black leading-[0.9] tracking-tight md:text-8xl">
          {t('home.hero1')}
          <br />
          <span className="bg-gradient-to-br from-brand via-brand to-brand/40 bg-clip-text text-transparent">{t('home.hero2')}</span>
        </h1>
        <p className="mx-auto max-w-2xl text-lg font-light text-muted md:text-2xl">{t('app.tagline')}</p>
        <Link
          to={user ? '/library' : '/login'}
          className="inline-flex h-12 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-6 text-base font-bold text-brand-ink transition-opacity hover:opacity-90"
        >
          {t('home.cta')} <ArrowLeft className="size-4 ltr:rotate-180" />
        </Link>
        <p className="text-xs text-muted">{t('home.phase0')}</p>
      </div>
    </section>
  )
}
