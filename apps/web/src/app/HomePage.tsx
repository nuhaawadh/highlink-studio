import { ArrowLeft } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useAuth } from '@/lib/auth'

/**
 * الرئيسية (دليل الهوية V1): أبيض وأسود، التدرّج على كلمة وحدة في العنوان، والليموني مرة وحدة (زر البداية).
 * النبرة: النتيجة قبل الأداة، جمل قصيرة، بلا علامة تعجب. فيديو الهيرو وبطاقات الاستوديوهات في المرحلة 2 (المخطط §9).
 */
export function HomePage() {
  const { t } = useI18n()
  const { user } = useAuth()

  return (
    <section className="flex min-h-dvh flex-col justify-center px-6 pt-16">
      <div className="mx-auto w-full max-w-5xl space-y-8">
        <div className="h-1 w-24 bg-text" aria-hidden />
        <h1 className="text-5xl leading-[1.05] tracking-tight md:text-7xl">
          {t('home.hero1')}
          <br />
          {t('home.hero2')} <span className="text-brand-gradient">{t('home.hero3')}</span>
        </h1>
        <p className="max-w-2xl text-lg text-muted md:text-xl">{t('app.tagline')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Link
            to={user ? '/image-generate' : '/login'}
            className="inline-flex h-12 items-center gap-2 bg-lime px-6 text-base font-medium text-lime-ink transition hover:brightness-95"
          >
            {t('home.cta')} <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
          </Link>
          <Link to="/templates" className="inline-flex h-12 items-center border border-text px-6 text-base font-medium text-text transition-colors hover:bg-text hover:text-bg">
            {t('home.templates')}
          </Link>
        </div>
        <p className="border-t border-border pt-4 text-sm text-muted">{t('home.facts')}</p>
      </div>
    </section>
  )
}
