import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { toast } from 'sonner'
import { Button } from '@/components/ui/button'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/i18n'

/** صفحة الدخول — Google + إيميل/كلمة مرور. لا تلمس الرصيد؛ الـtrigger في قاعدة البيانات يمنح 30 رصيدًا. */
export function LoginPage() {
  const { t } = useI18n()
  const { user, loading, signInWithGoogle, signInWithPassword, signUp } = useAuth()
  const [mode, setMode] = useState<'signin' | 'signup'>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)

  if (!loading && user) return <Navigate to="/library" replace />

  async function onSubmit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    try {
      if (mode === 'signin') {
        const { error } = await signInWithPassword(email, password)
        if (error) toast.error(t('auth.error'))
      } else {
        const { error, needsConfirm } = await signUp(email, password)
        if (error) toast.error(t('auth.error'))
        else if (needsConfirm) toast.success(t('auth.sent'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="flex flex-1 items-center justify-center px-4 py-12">
      <div className="w-full max-w-sm rounded-[var(--radius-lg)] border border-border bg-surface p-6 shadow-xl">
        <h1 className="text-xl font-bold">{t('auth.title')}</h1>
        <p className="mt-1 text-sm text-muted">{t('auth.subtitle')}</p>

        <Button variant="secondary" className="mt-6 w-full" onClick={() => void signInWithGoogle()}>
          {t('auth.google')}
        </Button>

        <div className="my-5 flex items-center gap-3 text-xs text-muted">
          <span className="h-px flex-1 bg-border" />
          {t('auth.or')}
          <span className="h-px flex-1 bg-border" />
        </div>

        <form onSubmit={onSubmit} className="space-y-3">
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t('auth.email')}</span>
            <input
              type="email"
              required
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              dir="ltr"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-text outline-none focus:border-brand"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-muted">{t('auth.password')}</span>
            <input
              type="password"
              required
              minLength={8}
              autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              dir="ltr"
              className="h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-text outline-none focus:border-brand"
            />
          </label>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === 'signin' ? t('auth.signin') : t('auth.signup')}
          </Button>
        </form>

        <button
          type="button"
          onClick={() => setMode((m) => (m === 'signin' ? 'signup' : 'signin'))}
          className="mt-4 w-full text-center text-xs text-muted hover:text-text"
        >
          {mode === 'signin' ? t('auth.switchToSignup') : t('auth.switchToSignin')}
        </button>
      </div>
    </section>
  )
}
