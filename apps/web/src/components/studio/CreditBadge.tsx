import { Coins } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** عداد الرصيد في الهيدر — يتحدّث لحظيًا عبر Realtime على credit_ledger. */
export function CreditBadge({ className }: { className?: string }) {
  const { user } = useAuth()
  const { balance, loading } = useCredits(user?.id ?? null)
  const { t } = useI18n()

  if (!user) return null

  const low = balance !== null && balance < 10

  return (
    <Link
      to="/pricing"
      title={t('credits.topup')}
      className={cn(
        'flex h-8 items-center gap-1.5 rounded-[var(--radius-sm)] border border-border bg-text/5 ps-2 pe-3 text-sm font-semibold text-text transition-colors hover:bg-text/10',
        low && 'border-danger/50 text-danger',
        className,
      )}
    >
      <Coins className="size-4 text-brand" aria-hidden />
      <span className="font-latin tabular-nums">{loading || balance === null ? t('credits.loading') : balance}</span>
      <span className="text-xs text-muted">{t('credits.label')}</span>
    </Link>
  )
}
