import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { toast } from 'sonner'
import { Check } from 'lucide-react'
import { PAID_PLANS, SIGNUP_BONUS_CREDITS, type Plan } from '@shared/plans'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

/**
 * صفحة الباقات (المخطط §7). الأسعار من packages/shared/plans.ts — المصدر الواحد.
 * الدفع نفسه يُفعَّل في المرحلة 2 (billing-intent)؛ الآن الزر يوجّه للتسجيل أو يعلن "قريبًا".
 */
export function PricingPage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const [yearly, setYearly] = useState(false)

  useEffect(() => {
    document.title = `${t('nav.pricing')} — ${env.VITE_APP_NAME}`
  }, [t])

  const fmt = (n: number) => new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US').format(n)

  return (
    <section className="mx-auto w-full max-w-6xl px-4 py-10 md:py-16">
      <header className="mb-10 text-center">
        <h1 className="text-3xl font-extrabold md:text-4xl">{t('pricing.title')}</h1>
        <p className="mx-auto mt-3 max-w-2xl text-muted">{t('pricing.subtitle', { bonus: SIGNUP_BONUS_CREDITS })}</p>

        <div className="mt-6 inline-flex items-center gap-1 rounded-none border border-border bg-surface p-1 text-sm">
          <button
            type="button"
            onClick={() => setYearly(false)}
            className={cn('rounded-none px-4 py-1.5', !yearly && 'bg-text text-bg')}
          >
            {t('pricing.monthly')}
          </button>
          <button
            type="button"
            onClick={() => setYearly(true)}
            className={cn('rounded-none px-4 py-1.5', yearly && 'bg-text text-bg')}
          >
            {t('pricing.yearly')} <span className="text-xs opacity-80">{t('pricing.yearlySave')}</span>
          </button>
        </div>
      </header>

      {/* البداية المجانية منفصلة عن الباقات: زر الباقة المدفوعة يقول "اشترك" دائمًا (كان "ابدأ مجانًا" للزائر فيلخبط) */}
      {!user && (
        <div className="mb-8 flex flex-col items-start justify-between gap-3 border border-text p-4 sm:flex-row sm:items-center">
          <p className="text-sm">{t('pricing.freeStrip', { bonus: SIGNUP_BONUS_CREDITS })}</p>
          <Link
            to="/login?mode=signup"
            className="inline-flex h-10 shrink-0 items-center border border-text px-5 text-sm font-semibold text-text transition-colors hover:bg-text hover:text-bg"
          >
            {t('pricing.startFree')}
          </Link>
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {PAID_PLANS.map((plan) => (
          <PlanCard key={plan.id} plan={plan} yearly={yearly} fmt={fmt} signedIn={Boolean(user)} />
        ))}
      </div>

      <div className="mt-10 grid gap-4 rounded-2xl border border-border bg-surface p-6 text-sm md:grid-cols-3">
        <div>
          <h3 className="font-semibold">{t('pricing.whatIsCredit')}</h3>
          <p className="mt-1 text-muted">{t('pricing.creditExamples')}</p>
        </div>
        <div>
          <h3 className="font-semibold">{t('pricing.paymentMethods')}</h3>
          <p className="mt-1 text-muted">{t('pricing.paymentMethodsList')}</p>
        </div>
        <div>
          <h3 className="font-semibold">{t('pricing.refundTitle')}</h3>
          <p className="mt-1 text-muted">
            {t('pricing.refundLine')}{' '}
            <Link to="/refund-policy" className="text-brand underline-offset-4 hover:underline">
              {t('nav.refund')}
            </Link>
          </p>
        </div>
      </div>
    </section>
  )
}

function PlanCard({
  plan,
  yearly,
  fmt,
  signedIn,
}: {
  plan: Plan
  yearly: boolean
  fmt: (n: number) => string
  signedIn: boolean
}) {
  const { t } = useI18n()
  const popular = plan.id === 'pro'
  const price = yearly && plan.priceYearlySar ? Math.round(plan.priceYearlySar / 12) : plan.priceMonthlySar
  const credits = yearly ? plan.credits * 12 : plan.credits

  const features = [
    t('pricing.f.credits', { n: fmt(credits), period: t(yearly ? 'pricing.perYear' : 'pricing.perMonth') }),
    t('pricing.f.concurrent', { n: plan.maxConcurrent }),
    t(plan.privateByDefault ? 'pricing.f.private' : 'pricing.f.public'),
    t('pricing.f.allModels'),
    t('pricing.f.commercial'),
  ]

  return (
    <div
      className={cn(
        'relative flex flex-col border bg-bg p-6',
        popular ? 'border-2 border-text' : 'border-border',
      )}
    >
      {popular && (
        <div className="absolute -top-3 start-6">
          <Badge tone="new">{t('pricing.popular')}</Badge>
        </div>
      )}
      <h2 className="text-lg font-semibold">{t(`plans.${plan.id}`)}</h2>
      <p className="mt-3 flex items-baseline gap-1">
        <span className="text-4xl font-bold tabular-nums">{fmt(price)}</span>
        <span className="text-sm text-muted">
          {t('pricing.sar')} / {t('pricing.perMonth')}
        </span>
      </p>
      {yearly && plan.priceYearlySar && (
        <p className="mt-1 text-xs text-muted">{t('pricing.billedYearly', { n: fmt(plan.priceYearlySar) })}</p>
      )}
      <ul className="mt-6 flex flex-1 flex-col gap-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check className="mt-0.5 size-4 shrink-0 text-brand" aria-hidden />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      {signedIn ? (
        <Button
          className="mt-6 w-full"
          variant={popular ? 'lime' : 'secondary'}
          onClick={() => toast.info(t('pricing.checkoutSoon'))}
        >
          {t('pricing.subscribe')}
        </Button>
      ) : (
        // الزائر: التسجيل أولًا ثم يرجع للباقات (state.from) — الدفع نفسه يُفعَّل لاحقًا
        <Link
          to="/login?mode=signup"
          state={{ from: '/pricing' }}
          className={cn(
            'mt-6 inline-flex h-10 w-full items-center justify-center text-sm font-medium',
            popular ? 'bg-lime text-lime-ink' : 'border border-text bg-bg text-text hover:bg-text hover:text-bg',
          )}
        >
          {t('pricing.subscribe')}
        </Link>
      )}
    </div>
  )
}
