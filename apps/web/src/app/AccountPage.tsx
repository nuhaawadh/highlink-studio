import { useEffect } from 'react'
import { useSearchParams } from 'react-router-dom'
import { CircleUser, Code2, CreditCard, LayoutDashboard, ReceiptText } from 'lucide-react'
import { PLANS } from '@shared/plans'
import { BillingTab } from '@/components/account/BillingTab'
import { CreditHistory } from '@/components/account/CreditHistory'
import { DevelopersTab } from '@/components/account/DevelopersTab'
import { OverviewTab } from '@/components/account/OverviewTab'
import { ProfileTab } from '@/components/account/ProfileTab'
import { useI18n } from '@/i18n'
import { useProfile } from '@/lib/account'
import { useAuth } from '@/lib/auth'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

const TABS = [
  { key: 'overview', icon: LayoutDashboard },
  { key: 'credits', icon: CreditCard },
  { key: 'billing', icon: ReceiptText },
  { key: 'profile', icon: CircleUser },
  { key: 'developers', icon: Code2 },
] as const
type TabKey = (typeof TABS)[number]['key']

/**
 * حساب العميل (المخطط §8 البند 8): كل ما يحتاجه في مكان واحد — رصيده وباقته وشغل الشهر، سجل الرصيد حركة بحركة،
 * الفواتير، ملفه وإعداداته، ومفاتيح API للمطورين. التبويب في الرابط (?tab=) فيُشارك ويُرجع له.
 * على الشاشات الكبيرة قائمة جانبية، وعلى الجوال شريط تبويبات يُسحب.
 */
export function AccountPage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { profile, reload } = useProfile(user?.id ?? null)
  const [params, setParams] = useSearchParams()
  const tab: TabKey = (TABS.find((x) => x.key === params.get('tab'))?.key ?? 'overview') as TabKey

  useEffect(() => {
    document.title = `${t('account.title')} — ${env.VITE_APP_NAME}`
  }, [t])

  const plan = PLANS.find((p) => p.id === profile?.plan_id) ?? PLANS[0]
  const name = profile?.display_name?.trim() || user?.email?.split('@')[0] || ''
  const since = profile?.created_at
    ? new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn-ca-gregory' : 'en-US', { month: 'long', year: 'numeric' }).format(new Date(profile.created_at))
    : null

  return (
    <section className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 md:px-6 md:py-10">
      <header className="mb-6 flex flex-wrap items-center gap-4 border-b border-border pb-6 md:mb-8">
        <span aria-hidden className="flex size-14 shrink-0 items-center justify-center bg-inverse text-2xl font-extrabold text-inverse-ink">
          {(name[0] ?? '·').toUpperCase()}
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-2xl font-extrabold md:text-3xl">{name || t('account.title')}</h1>
          <p className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted">
            <span dir="ltr" className="truncate font-latin">
              {user?.email}
            </span>
            <span className="border border-text px-1.5 py-px text-xs font-semibold text-text">{t(`plans.${plan.id}`)}</span>
            {since && <span>{t('account.memberSince', { date: since })}</span>}
          </p>
        </div>
      </header>

      <div className="flex flex-col gap-6 md:flex-row md:gap-10">
        <nav aria-label={t('account.title')} className="-mx-4 shrink-0 overflow-x-auto px-4 md:mx-0 md:w-52 md:overflow-visible md:px-0">
          <ul role="tablist" className="flex gap-1 md:sticky md:top-24 md:flex-col">
            {TABS.map(({ key, icon: Icon }) => {
              const on = key === tab
              return (
                <li key={key} role="presentation">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={on}
                    onClick={() => setParams(key === 'overview' ? {} : { tab: key }, { replace: true })}
                    className={cn(
                      'flex h-10 w-full items-center gap-2 whitespace-nowrap border-b-2 px-3 text-sm font-medium transition-colors md:border-b-0 md:border-s-2',
                      on ? 'border-text text-text md:bg-text/[0.04]' : 'border-transparent text-muted hover:text-text',
                    )}
                  >
                    <Icon className="size-4" aria-hidden />
                    {t(`account.tabs.${key}`)}
                  </button>
                </li>
              )
            })}
          </ul>
        </nav>

        <div role="tabpanel" className="min-w-0 flex-1">
          {tab === 'overview' && <OverviewTab plan={plan} onOpenTab={(k) => setParams({ tab: k }, { replace: true })} />}
          {tab === 'credits' && <CreditHistory />}
          {tab === 'billing' && <BillingTab />}
          {tab === 'profile' && <ProfileTab profile={profile} onSaved={reload} />}
          {tab === 'developers' && <DevelopersTab />}
        </div>
      </div>
    </section>
  )
}
