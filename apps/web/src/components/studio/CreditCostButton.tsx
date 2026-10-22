import { Coins, Loader2, Sparkles } from 'lucide-react'
import { Link } from 'react-router-dom'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * زر التوليد يعرض التكلفة الحقيقية بالرصيد قبل الضغط (المخطط §8، مقتبس من هلاي).
 * معطّل إن لم يكفِ الرصيد، مع رابط الشحن.
 */
export function CreditCostButton({
  cost,
  balance,
  busy,
  disabled,
  onClick,
  className,
}: {
  cost: number
  balance: number | null
  busy: boolean
  disabled?: boolean
  onClick: () => void
  className?: string
}) {
  const { t } = useI18n()
  const insufficient = balance !== null && balance < cost

  return (
    <div className={cn('flex flex-col items-stretch gap-1', className)}>
      <Button type="button" size="lg" onClick={onClick} disabled={disabled || busy || insufficient} className="justify-between gap-3 ps-5 pe-2">
        <span className="flex items-center gap-2">
          {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Sparkles aria-hidden />}
          {busy ? t('generate.generating') : t('generate.generate')}
        </span>
        <span className="flex h-8 items-center gap-1 rounded-[calc(var(--radius-sm)-2px)] bg-black/15 px-2.5 text-xs font-bold">
          <Coins className="size-3.5" aria-hidden />
          <span className="font-latin tabular-nums">{cost}</span> {t('credits.label')}
        </span>
      </Button>
      {insufficient && (
        <p className="text-center text-xs text-danger">
          {t('credits.insufficient')}{' '}
          <Link to="/pricing" className="underline underline-offset-4">
            {t('credits.topup')}
          </Link>
        </p>
      )}
    </div>
  )
}
