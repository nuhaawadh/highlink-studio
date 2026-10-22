import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, KeyRound, Plus, Trash2 } from 'lucide-react'
import { toast } from 'sonner'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { ApiKeyError, apiBaseUrl, createApiKey, listApiKeys, revokeApiKey, type ApiKeyMode, type ApiKeyRow, type CreatedApiKey } from '@/lib/apiKeys'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

const inputClass =
  'h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-brand disabled:opacity-50'

/**
 * صفحة الحساب (المخطط §8 البند 8 — الجزء المنجز الآن: البيانات، الرصيد، ومفاتيح API v1 / ADR 0004).
 * المفتاح الكامل يظهر مرة واحدة بعد الإصدار؛ القائمة تعرض التلميح فقط.
 */
export function AccountPage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const { balance } = useCredits(user?.id ?? null)
  const [planId, setPlanId] = useState<string | null>(null)
  const [keys, setKeys] = useState<ApiKeyRow[]>([])
  const [loading, setLoading] = useState(true)
  const [created, setCreated] = useState<CreatedApiKey | null>(null)
  const [name, setName] = useState('')
  const [mode, setMode] = useState<ApiKeyMode>('test')
  const [webhookUrl, setWebhookUrl] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `${t('account.title')} — ${env.VITE_APP_NAME}`
  }, [t])

  const reload = useCallback(async () => {
    try {
      setKeys(await listApiKeys())
    } catch (e) {
      console.error('[account] keys load failed:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (!user) return
    void reload()
    supabase
      .from('profiles')
      .select('plan_id')
      .eq('id', user.id)
      .maybeSingle()
      .then(({ data }) => setPlanId(data?.plan_id ?? null))
  }, [user, reload])

  async function onCreate(e: FormEvent) {
    e.preventDefault()
    if (!name.trim()) return
    if (webhookUrl.trim() && !webhookUrl.trim().startsWith('https://')) {
      toast.error(t('account.invalidWebhook'))
      return
    }
    setBusy(true)
    try {
      const row = await createApiKey({ name, mode, webhookUrl })
      setCreated(row)
      setName('')
      setWebhookUrl('')
      await reload()
    } catch (err) {
      if (err instanceof ApiKeyError && err.code === 'TOO_MANY_KEYS') toast.error(t('account.tooMany'))
      else if (err instanceof ApiKeyError && err.code === 'INVALID_WEBHOOK_URL') toast.error(t('account.invalidWebhook'))
      else toast.error(t('account.error'))
    } finally {
      setBusy(false)
    }
  }

  async function onRevoke(id: string) {
    if (!window.confirm(t('account.revokeConfirm'))) return
    try {
      await revokeApiKey(id)
      toast.success(t('account.revokedToast'))
      await reload()
    } catch {
      toast.error(t('account.error'))
    }
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text)
      toast.success(t('account.copied'))
    } catch {
      toast.error(t('account.error'))
    }
  }

  const fmt = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { dateStyle: 'medium', timeStyle: 'short' })

  return (
    <section className="mx-auto w-full max-w-5xl flex-1 px-4 py-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-xl font-bold">{t('account.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('account.subtitle')}</p>
      </header>

      <dl className="mb-8 grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 text-sm sm:grid-cols-3">
        <div>
          <dt className="text-xs text-muted">{t('account.email')}</dt>
          <dd className="mt-1 truncate font-latin" dir="ltr">
            {user?.email ?? '—'}
          </dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('account.plan')}</dt>
          <dd className="mt-1">{planId ? t(`plans.${planId}`) : '—'}</dd>
        </div>
        <div>
          <dt className="text-xs text-muted">{t('account.balance')}</dt>
          <dd className="mt-1 font-latin tabular-nums">{balance == null ? '…' : t('credits.n', { n: balance })}</dd>
        </div>
      </dl>

      <section aria-labelledby="api-keys-title" className="space-y-4">
        <div>
          <h2 id="api-keys-title" className="flex items-center gap-2 text-lg font-bold">
            <KeyRound className="size-4 text-brand" aria-hidden /> {t('account.apiKeys')}
          </h2>
          <p className="mt-1 text-sm text-muted">{t('account.apiKeysHint')}</p>
          <p className="mt-2 text-xs text-muted">
            {t('account.baseUrl')}:{' '}
            <code dir="ltr" className="select-all rounded bg-white/5 px-1.5 py-0.5 font-latin text-text">
              {apiBaseUrl()}
            </code>
          </p>
          <p className="mt-1 font-latin text-xs text-muted" dir="auto">
            {t('account.endpoints')}
          </p>
        </div>

        {created && (
          <div data-testid="created-key" className="space-y-3 rounded-[var(--radius-lg)] border border-brand/40 bg-brand/10 p-4">
            <p className="text-sm font-bold text-text">{t('account.createdTitle')}</p>
            <SecretRow label={t('account.key')} value={created.key} onCopy={copy} copyLabel={t('account.copy')} />
            <SecretRow label={t('account.webhookSecret')} value={created.webhook_secret} onCopy={copy} copyLabel={t('account.copy')} />
            <p className="text-xs text-muted">{t('account.createdHint')}</p>
            <Button variant="secondary" size="sm" onClick={() => setCreated(null)}>
              <Check /> {t('account.done')}
            </Button>
          </div>
        )}

        <form onSubmit={(e) => void onCreate(e)} className="grid grid-cols-1 gap-3 rounded-[var(--radius-lg)] border border-border bg-surface p-4 md:grid-cols-2">
          <h3 className="flex items-center gap-2 text-sm font-semibold md:col-span-2">
            <Plus className="size-4" aria-hidden /> {t('account.newKey')}
          </h3>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t('account.keyName')}</span>
            <input className={inputClass} value={name} maxLength={60} required placeholder={t('account.keyNamePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </label>
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t('account.webhookUrl')}</span>
            <input className={inputClass} dir="ltr" value={webhookUrl} inputMode="url" placeholder="https://" onChange={(e) => setWebhookUrl(e.target.value)} />
          </label>
          <fieldset className="md:col-span-2">
            <legend className="mb-1 text-xs text-muted">{t('account.mode')}</legend>
            <div className="flex flex-col gap-2 sm:flex-row">
              {(['test', 'live'] as const).map((m) => (
                <label
                  key={m}
                  className={cn(
                    'flex flex-1 cursor-pointer items-center gap-2 rounded-[var(--radius-sm)] border px-3 py-2 text-sm',
                    mode === m ? 'border-brand bg-brand/10' : 'border-border hover:bg-white/5',
                  )}
                >
                  <input type="radio" name="mode" value={m} checked={mode === m} onChange={() => setMode(m)} className="accent-[var(--color-brand)]" />
                  <span>{t(m === 'live' ? 'account.modeLive' : 'account.modeTest')}</span>
                </label>
              ))}
            </div>
          </fieldset>
          <div className="md:col-span-2">
            <Button type="submit" disabled={busy || !name.trim()}>
              {busy ? t('account.creating') : t('account.create')}
            </Button>
          </div>
        </form>

        {loading ? (
          <div className="h-24 animate-pulse rounded-[var(--radius-lg)] bg-white/[0.04]" />
        ) : keys.length === 0 ? (
          <p className="rounded-[var(--radius-lg)] border border-dashed border-border p-6 text-center text-sm text-muted">{t('account.empty')}</p>
        ) : (
          <ul data-testid="api-keys-list" className="divide-y divide-border overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
            {keys.map((k) => {
              const revoked = Boolean(k.revoked_at)
              return (
                <li key={k.id} className={cn('flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 text-sm', revoked && 'opacity-60')}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-semibold">{k.name}</span>
                      <Badge tone={k.mode === 'live' ? 'new' : 'beta'}>{k.mode}</Badge>
                      <Badge tone={revoked ? 'neutral' : 'hot'}>{revoked ? t('account.revoked') : t('account.active')}</Badge>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                      <code dir="ltr" className="font-latin text-text">
                        {k.key_hint}
                      </code>
                      <span>
                        {t('account.dailyLimit')}: {t('account.perDay', { n: k.daily_limit })}
                      </span>
                      <span>
                        {t('account.lastUsed')}: {k.last_used_at ? fmt.format(new Date(k.last_used_at)) : t('account.never')}
                      </span>
                      <span>
                        {t('account.createdAt')}: {fmt.format(new Date(k.created_at))}
                      </span>
                    </div>
                  </div>
                  {!revoked && (
                    <Button variant="ghost" size="sm" onClick={() => void onRevoke(k.id)} aria-label={`${t('account.revoke')} ${k.name}`}>
                      <Trash2 /> {t('account.revoke')}
                    </Button>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </section>
  )
}

function SecretRow({ label, value, onCopy, copyLabel }: { label: string; value: string; onCopy: (v: string) => void; copyLabel: string }) {
  return (
    <div className="text-sm">
      <span className="mb-1 block text-xs text-muted">{label}</span>
      <div className="flex items-center gap-2">
        <code dir="ltr" className="min-w-0 flex-1 select-all overflow-x-auto rounded bg-bg px-2 py-1.5 font-latin text-xs text-text">
          {value}
        </code>
        <Button variant="secondary" size="sm" onClick={() => onCopy(value)} aria-label={copyLabel}>
          <Copy /> {copyLabel}
        </Button>
      </div>
    </div>
  )
}
