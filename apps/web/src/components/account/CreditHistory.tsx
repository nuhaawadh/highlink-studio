import { Clock, Gift, Image as ImageIcon, Minus, Plus, RotateCcw, Video } from 'lucide-react'
import { useMemo } from 'react'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { useLedger, type LedgerAsset, type LedgerRow } from '@/lib/account'
import { useAuth } from '@/lib/auth'
import { modelName, useModels, type ModelRow } from '@/lib/models'
import { findTemplate } from '@/lib/templates'
import { cn } from '@/lib/utils'

/**
 * سجل الرصيد: كل صف في credit_ledger كما هو (حجز → خصم أو استرداد). الاسترداد يصفّر مبلغ الحجز في الدفتر،
 * فنعرض المبلغ المسترجع من تكلفة الأصل نفسه. الوصف: عنوان القالب إن وُلّد منه، وإلا اسم النموذج وأول البرومت.
 */
export function CreditHistory() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { rows, assets, loading, more, loadMore } = useLedger(user?.id ?? null)
  const { allModels: img } = useModels('image')
  const { allModels: vid } = useModels('video')
  const models = useMemo(() => new Map<string, ModelRow>([...img, ...vid].map((m) => [m.id, m])), [img, vid])
  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section aria-labelledby="ledger-title" className="space-y-4">
      <div>
        <h2 id="ledger-title" className="text-lg font-bold">
          {t('account.ledger.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('account.ledger.hint')}</p>
      </div>

      {loading ? (
        <div className="space-y-px border border-border bg-border">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-16 animate-pulse bg-bg" />
          ))}
        </div>
      ) : rows.length === 0 ? (
        <p className="border border-dashed border-border p-6 text-center text-sm text-muted">{t('account.ledger.empty')}</p>
      ) : (
        <>
          <ul data-testid="ledger-list" className="divide-y divide-border border border-border">
            {rows.map((r) => (
              <LedgerItem key={r.id} row={r} asset={r.asset_id ? assets[r.asset_id] : undefined} models={models} when={fmt.format(new Date(r.created_at))} />
            ))}
          </ul>
          {more && (
            <Button variant="secondary" onClick={loadMore}>
              {t('account.ledger.more')}
            </Button>
          )}
        </>
      )}
    </section>
  )
}

function LedgerItem({ row, asset, models, when }: { row: LedgerRow; asset?: LedgerAsset; models: Map<string, ModelRow>; when: string }) {
  const { t, locale } = useI18n()
  const kind = row.ref === 'signup' ? 'signup' : row.kind
  const title = t(`account.ledger.kinds.${kind}`)
  const template = asset?.metadata && typeof asset.metadata === 'object' ? findTemplate(String((asset.metadata as Record<string, unknown>).template ?? '')) : undefined
  const model = asset?.model ? models.get(asset.model) : undefined
  // بلا أصل: الملاحظة تظهر لتعديلات الدعم فقط (هدية التسجيل والرصيد الإضافي عنوانهما يكفي)
  const subject = template
    ? locale === 'ar'
      ? template.title_ar
      : template.title_en
    : model
      ? modelName(model, locale)
      : (asset?.model ?? (row.kind === 'adjust' ? (row.note ?? '') : ''))
  const prompt = template ? '' : (asset?.prompt ?? '').replace(/\s+/g, ' ').slice(0, 90)

  // المبلغ كما يراه العميل: الاسترداد يعرض ما رجع (تكلفة الأصل)، والحجز يظهر بين قوسين لأنه لم يُخصم نهائيًا بعد
  const refund = row.kind === 'refund'
  const amount = refund ? (asset?.cost_credits ?? null) : row.amount
  const positive = refund || row.amount > 0
  const Icon = kind === 'signup' || row.kind === 'bonus' ? Gift : refund ? RotateCcw : row.kind === 'hold' ? Clock : positive ? Plus : Minus

  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <span className="flex size-10 shrink-0 items-center justify-center overflow-hidden bg-text/[0.05]">
        {asset?.thumbnail_url ? (
          <img src={asset.thumbnail_url} alt="" className="size-full object-cover" loading="lazy" />
        ) : asset ? (
          asset.type === 'video' ? <Video className="size-4 text-muted" aria-hidden /> : <ImageIcon className="size-4 text-muted" aria-hidden />
        ) : (
          <Icon className="size-4 text-muted" aria-hidden />
        )}
      </span>
      <div className="min-w-0 flex-1">
        <p className="flex flex-wrap items-baseline gap-x-2 text-sm">
          <span className="font-semibold">{title}</span>
          {subject && <span className="truncate text-muted">{subject}</span>}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted">
          <span className="font-latin">{when}</span>
          {prompt && (
            <>
              {' · '}
              <span dir="auto">{prompt}</span>
            </>
          )}
          {row.expires_at && <> · {t('account.ledger.expires', { date: new Date(row.expires_at).toLocaleDateString(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-US') })}</>}
        </p>
      </div>
      <span
        className={cn('shrink-0 font-latin text-sm font-bold tabular-nums', row.kind === 'hold' && 'text-muted', refund && 'text-text')}
        dir="ltr"
      >
        {amount == null ? '—' : `${positive ? '+' : '−'}${Math.abs(amount)}`}
        {row.kind === 'hold' && <span className="ms-1 text-[11px] font-normal">{t('account.ledger.pending')}</span>}
      </span>
    </li>
  )
}
