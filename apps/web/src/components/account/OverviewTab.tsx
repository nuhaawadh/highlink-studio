import { ArrowLeft, Image as ImageIcon, RotateCcw, Sparkles, Video } from 'lucide-react'
import { useMemo, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import type { Plan } from '@shared/plans'
import { AssetCard } from '@/components/studio/AssetCard'
import { useI18n } from '@/i18n'
import { useMonthStats } from '@/lib/account'
import { useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { affordableCount, useModels } from '@/lib/models'

/**
 * نظرة عامة: الرصيد كبير (وكم يكفي)، الباقة وحدودها، أرقام الشهر، وآخر الأعمال.
 * الليموني لزر "اشحن رصيدك" فقط (دليل الهوية). الشحن نفسه من صفحة الباقات (الدفع يُفعَّل لاحقًا).
 */
export function OverviewTab({ plan, onOpenTab }: { plan: Plan; onOpenTab: (tab: 'credits' | 'billing') => void }) {
  const { t } = useI18n()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const stats = useMonthStats(userId)
  const { assets, loading } = useAssets(userId, { limit: 4 })
  const { models: imageModels } = useModels('image')
  const { models: videoModels } = useModels('video')

  const images = useMemo(() => (balance == null ? null : affordableCount(imageModels, balance)), [imageModels, balance])
  const videos = useMemo(() => (balance == null ? null : affordableCount(videoModels, balance)), [videoModels, balance])

  return (
    <div className="flex flex-col gap-8">
      {/* الرصيد */}
      <section aria-labelledby="ov-balance" className="grid gap-px border border-border bg-border md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="flex flex-col justify-between gap-6 bg-inverse p-6 text-inverse-ink">
          <div>
            <h2 id="ov-balance" className="text-sm font-medium text-inverse-ink/70">
              {t('account.overview.balance')}
            </h2>
            <p className="mt-2 flex items-baseline gap-2">
              <span className="font-latin text-6xl font-extrabold leading-none tabular-nums">{balance ?? '…'}</span>
              <span className="text-base text-inverse-ink/70">{t('credits.label')}</span>
            </p>
            {images != null && videos != null && (
              <p className="mt-3 text-sm text-inverse-ink/70">{t('account.overview.enough', { images, videos })}</p>
            )}
          </div>
          <div className="flex flex-wrap gap-3">
            <Link to="/pricing" className="inline-flex h-11 items-center gap-2 bg-lime px-5 text-sm font-semibold text-lime-ink transition hover:brightness-95">
              {t('account.overview.topup')} <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
            </Link>
            <Link
              to="/templates"
              className="inline-flex h-11 items-center gap-2 border border-inverse-ink/40 px-5 text-sm font-medium text-inverse-ink transition-colors hover:border-inverse-ink"
            >
              <Sparkles className="size-4" aria-hidden /> {t('account.overview.create')}
            </Link>
          </div>
        </div>
        <div className="flex flex-col justify-between gap-4 bg-bg p-6">
          <div>
            <h2 className="text-sm font-medium text-muted">{t('account.overview.plan')}</h2>
            <p className="mt-2 text-3xl font-extrabold">{t(`plans.${plan.id}`)}</p>
            <ul className="mt-3 space-y-1 text-sm text-muted">
              {plan.credits > 0 && <li>{t('account.overview.planMonthly', { n: plan.credits })}</li>}
              <li>{t('account.overview.planConcurrent', { n: plan.maxConcurrent })}</li>
              {plan.credits === 0 && <li>{t('account.overview.planFree')}</li>}
            </ul>
          </div>
          <Link to="/pricing" className="text-sm font-medium text-text underline underline-offset-4">
            {t('account.overview.upgrade')}
          </Link>
        </div>
      </section>

      {/* هذا الشهر */}
      <section aria-labelledby="ov-month">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="ov-month" className="text-lg font-bold">
            {t('account.overview.month')}
          </h2>
          <button type="button" onClick={() => onOpenTab('credits')} className="text-sm font-medium text-text underline-offset-4 hover:underline">
            {t('account.overview.history')}
          </button>
        </div>
        <div className="grid grid-cols-2 gap-px border border-border bg-border lg:grid-cols-4">
          <Stat icon={<ImageIcon className="size-4" aria-hidden />} value={stats?.images} label={t('account.overview.statImages')} />
          <Stat icon={<Video className="size-4" aria-hidden />} value={stats?.videos} label={t('account.overview.statVideos')} />
          <Stat icon={<Sparkles className="size-4" aria-hidden />} value={stats?.spent} label={t('account.overview.statSpent')} />
          <Stat icon={<RotateCcw className="size-4" aria-hidden />} value={stats?.refunded} label={t('account.overview.statRefunded')} />
        </div>
      </section>

      {/* آخر الأعمال */}
      <section aria-labelledby="ov-recent">
        <div className="mb-3 flex items-end justify-between gap-3">
          <h2 id="ov-recent" className="text-lg font-bold">
            {t('account.overview.recent')}
          </h2>
          <Link to="/library" className="text-sm font-medium text-text underline-offset-4 hover:underline">
            {t('account.overview.allWork')}
          </Link>
        </div>
        {loading ? (
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="aspect-square animate-pulse bg-text/[0.04]" />
            ))}
          </div>
        ) : assets.length === 0 ? (
          <div className="flex flex-col items-start gap-3 border border-dashed border-border p-6 text-sm text-muted">
            <p>{t('account.overview.noWork')}</p>
            <Link to="/templates" className="font-medium text-text underline underline-offset-4">
              {t('account.overview.noWorkCta')}
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 items-start gap-3 md:grid-cols-4">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        )}
      </section>

      {/* مساعدة سريعة */}
      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <QuickLink to="/templates" title={t('account.overview.qTemplates')} hint={t('account.overview.qTemplatesHint')} />
        <QuickLink to="/pricing" title={t('account.overview.qPricing')} hint={t('account.overview.qPricingHint')} />
        <QuickLink to="/contact" title={t('account.overview.qHelp')} hint={t('account.overview.qHelpHint')} />
      </section>
    </div>
  )
}

function Stat({ icon, value, label }: { icon: ReactNode; value: number | undefined; label: string }) {
  return (
    <div className="flex flex-col gap-2 bg-bg p-4">
      <span className="text-muted">{icon}</span>
      <span className="font-latin text-3xl font-extrabold tabular-nums">{value ?? '…'}</span>
      <span className="text-xs text-muted">{label}</span>
    </div>
  )
}

function QuickLink({ to, title, hint }: { to: string; title: string; hint: string }) {
  return (
    <Link to={to} className="group flex flex-col gap-1 bg-bg p-4 transition-colors hover:bg-text/[0.03]">
      <span className="flex items-center justify-between gap-2 text-sm font-semibold">
        {title} <ArrowLeft className="size-4 transition-transform group-hover:-translate-x-0.5 ltr:rotate-180 ltr:group-hover:translate-x-0.5" aria-hidden />
      </span>
      <span className="text-xs text-muted">{hint}</span>
    </Link>
  )
}
