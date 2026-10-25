import { ReceiptText } from 'lucide-react'
import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { usePayments } from '@/lib/account'
import { useAuth } from '@/lib/auth'

/**
 * الفواتير: صفوف payments للمستخدم (قراءة فقط). الدفع الإلكتروني يُفعَّل مع محوّل Paylink (المرحلة 2)،
 * فالحالة الفارغة تشرح ذلك وتوجّه للباقات. لا ضريبة تُعرض — هاي لينك بلا رقم ضريبي.
 */
export function BillingTab() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { rows, loading } = usePayments(user?.id ?? null)
  const date = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-US', { dateStyle: 'medium' })
  const sar = new Intl.NumberFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })

  return (
    <section aria-labelledby="billing-title" className="space-y-4">
      <div>
        <h2 id="billing-title" className="text-lg font-bold">
          {t('account.billing.title')}
        </h2>
        <p className="mt-1 text-sm text-muted">{t('account.billing.hint')}</p>
      </div>

      {loading ? (
        <div className="h-24 animate-pulse bg-text/[0.04]" />
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-start gap-3 border border-dashed border-border p-6 text-sm">
          <ReceiptText className="size-5 text-muted" aria-hidden />
          <p className="font-semibold">{t('account.billing.empty')}</p>
          <p className="text-muted">{t('account.billing.soon')}</p>
          <Link to="/pricing" className="font-medium text-text underline underline-offset-4">
            {t('account.billing.seePlans')}
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto border border-border">
          <table className="w-full min-w-[520px] text-sm">
            <thead className="bg-text/[0.03] text-xs text-muted">
              <tr>
                <th className="px-4 py-2 text-start font-medium">{t('account.billing.date')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('account.billing.amount')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('account.billing.credits')}</th>
                <th className="px-4 py-2 text-start font-medium">{t('account.billing.status')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {rows.map((p) => (
                <tr key={p.id}>
                  <td className="px-4 py-3 font-latin">{date.format(new Date(p.created_at))}</td>
                  <td className="px-4 py-3 font-latin tabular-nums">{t('account.billing.sar', { n: sar.format(p.amount_sar) })}</td>
                  <td className="px-4 py-3 font-latin tabular-nums">{p.credits}</td>
                  <td className="px-4 py-3">{t(`account.billing.statuses.${p.status}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}
