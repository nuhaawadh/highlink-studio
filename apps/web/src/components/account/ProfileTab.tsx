import { useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router-dom'
import { LifeBuoy, LogOut, ShieldAlert } from 'lucide-react'
import { toast } from 'sonner'
import { inputClass } from '@/components/account/DevelopersTab'
import { Button } from '@/components/ui/button'
import { useI18n } from '@/i18n'
import { updateProfile, type ProfileRow } from '@/lib/account'
import { useAuth } from '@/lib/auth'
import { supabase } from '@/lib/supabase'
import { cn } from '@/lib/utils'

/**
 * الملف الشخصي: الاسم الظاهر، لغة الواجهة (تُحفظ في profiles.locale وتُطبَّق فورًا)، البريد للعرض،
 * كلمة المرور لحسابات البريد (Google تُدار هناك)، الخروج، المساعدة، وطلب حذف البيانات (صفحة الحذف القانونية).
 */
export function ProfileTab({ profile, onSaved }: { profile: ProfileRow | null; onSaved: () => void }) {
  const { t, locale, setLocale } = useI18n()
  const { user, signOut } = useAuth()
  const [name, setName] = useState('')
  const [saving, setSaving] = useState(false)
  const [pw, setPw] = useState('')
  const [pw2, setPw2] = useState('')
  const [pwBusy, setPwBusy] = useState(false)
  const [pwError, setPwError] = useState<string | null>(null)

  useEffect(() => setName(profile?.display_name ?? ''), [profile?.display_name])

  const emailAccount = (user?.app_metadata?.provider ?? 'email') === 'email'

  async function onSaveName(e: FormEvent) {
    e.preventDefault()
    if (!user) return
    setSaving(true)
    try {
      await updateProfile(user.id, { display_name: name.trim() || null })
      toast.success(t('account.profile.saved'))
      onSaved()
    } catch {
      toast.error(t('account.error'))
    } finally {
      setSaving(false)
    }
  }

  async function onLanguage(l: 'ar' | 'en') {
    setLocale(l)
    if (!user) return
    try {
      await updateProfile(user.id, { locale: l })
    } catch {
      /* اللغة طُبّقت محليًا؛ الحفظ في الملف يُعاد عند التغيير القادم */
    }
  }

  async function onPassword(e: FormEvent) {
    e.preventDefault()
    setPwError(null)
    if (pw.length < 8) return setPwError(t('account.profile.passwordShort'))
    if (pw !== pw2) return setPwError(t('account.profile.passwordMismatch'))
    setPwBusy(true)
    try {
      const { error } = await supabase.auth.updateUser({ password: pw })
      if (error) throw error
      setPw('')
      setPw2('')
      toast.success(t('account.profile.passwordChanged'))
    } catch {
      toast.error(t('account.error'))
    } finally {
      setPwBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      <section aria-labelledby="pf-title" className="space-y-4">
        <h2 id="pf-title" className="text-lg font-bold">
          {t('account.profile.title')}
        </h2>
        <form onSubmit={(e) => void onSaveName(e)} className="grid gap-3 border border-border p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
          <label className="text-sm">
            <span className="mb-1 block text-xs text-muted">{t('account.profile.name')}</span>
            <input className={inputClass} value={name} maxLength={60} placeholder={t('account.profile.namePlaceholder')} onChange={(e) => setName(e.target.value)} />
          </label>
          <Button type="submit" disabled={saving || name.trim() === (profile?.display_name ?? '')}>
            {t('account.profile.save')}
          </Button>
          <div className="text-sm sm:col-span-2">
            <span className="mb-1 block text-xs text-muted">{t('account.email')}</span>
            <p dir="ltr" className="truncate text-start font-latin">
              {user?.email}
            </p>
            <p className="mt-1 text-xs text-muted">{t('account.profile.emailHint')}</p>
          </div>
        </form>
      </section>

      <section aria-labelledby="lang-title" className="space-y-3">
        <h2 id="lang-title" className="text-lg font-bold">
          {t('account.profile.language')}
        </h2>
        <div role="radiogroup" aria-labelledby="lang-title" className="inline-flex border border-border p-1">
          {(['ar', 'en'] as const).map((l) => (
            <button
              key={l}
              type="button"
              role="radio"
              aria-checked={locale === l}
              onClick={() => void onLanguage(l)}
              className={cn('px-4 py-1.5 text-sm', locale === l ? 'bg-text text-bg' : 'text-muted hover:text-text')}
            >
              {t(`account.profile.lang.${l}`)}
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="pw-title" className="space-y-3">
        <h2 id="pw-title" className="text-lg font-bold">
          {t('account.profile.password')}
        </h2>
        {emailAccount ? (
          <form onSubmit={(e) => void onPassword(e)} className="grid gap-3 border border-border p-4 sm:grid-cols-2">
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">{t('account.profile.newPassword')}</span>
              <input type="password" dir="ltr" autoComplete="new-password" className={inputClass} value={pw} onChange={(e) => setPw(e.target.value)} />
            </label>
            <label className="text-sm">
              <span className="mb-1 block text-xs text-muted">{t('account.profile.confirmPassword')}</span>
              <input type="password" dir="ltr" autoComplete="new-password" className={inputClass} value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </label>
            {pwError && (
              <p role="alert" className="text-sm text-danger sm:col-span-2">
                {pwError}
              </p>
            )}
            <div className="sm:col-span-2">
              <Button type="submit" variant="secondary" disabled={pwBusy || !pw}>
                {t('account.profile.changePassword')}
              </Button>
            </div>
          </form>
        ) : (
          <p className="border border-border p-4 text-sm text-muted">{t('account.profile.googleAccount')}</p>
        )}
      </section>

      <section className="grid gap-px border border-border bg-border sm:grid-cols-3">
        <button type="button" onClick={() => void signOut()} className="flex items-center gap-2 bg-bg p-4 text-start text-sm font-semibold hover:bg-text/[0.03]">
          <LogOut className="size-4" aria-hidden /> {t('nav.logout')}
        </button>
        <Link to="/contact" className="flex items-center gap-2 bg-bg p-4 text-sm font-semibold hover:bg-text/[0.03]">
          <LifeBuoy className="size-4" aria-hidden /> {t('account.profile.help')}
        </Link>
        <Link to="/data-deletion" className="flex flex-col gap-1 bg-bg p-4 text-sm hover:bg-text/[0.03]">
          <span className="flex items-center gap-2 font-semibold">
            <ShieldAlert className="size-4" aria-hidden /> {t('account.profile.delete')}
          </span>
          <span className="text-xs text-muted">{t('account.profile.deleteHint')}</span>
        </Link>
      </section>
    </div>
  )
}
