import { useEffect, useState } from 'react'
import { Link, NavLink, useLocation } from 'react-router-dom'
import { Globe, Image as ImageIcon, LayoutGrid, LayoutTemplate, Library, LogIn, LogOut, Menu, UserRound, Video, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { CreditBadge } from '@/components/studio/CreditBadge'
import { useAuth } from '@/lib/auth'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/**
 * الهيدر الثابت + درج الجوال (المخطط §8): شفاف على الرئيسية، داكن داخل التطبيق.
 * الاتجاه كله بخصائص منطقية (ps/pe/ms/me/start/end) — لا ml/mr.
 */
const navLinkClass = ({ isActive }: { isActive: boolean }) =>
  cn(
    'flex h-8 items-center gap-1 rounded-[var(--radius-sm)] px-2 text-sm font-medium transition-colors',
    isActive ? 'bg-white/[0.08] text-text' : 'text-muted hover:bg-white/[0.06] hover:text-text',
  )

export function Header() {
  const { t, locale, setLocale } = useI18n()
  const { user, signOut } = useAuth()
  const location = useLocation()
  const [open, setOpen] = useState(false)
  const transparent = location.pathname === '/'

  // أغلق الدرج عند تغيير الصفحة أو الضغط على Esc
  useEffect(() => setOpen(false), [location.pathname])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false)
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const studios = [
    { to: '/studio/product', label: t('studios.product'), badge: 'new' as const },
    { to: '/studio/ads', label: t('studios.ads'), badge: 'hot' as const },
    { to: '/studio/ugc', label: t('studios.ugc'), badge: 'beta' as const },
  ]

  return (
    <>
      <header
        data-app-topbar
        className={cn(
          'fixed inset-x-0 top-0 z-[9999] flex h-12 items-center justify-between px-3 md:h-16 md:px-6',
          transparent ? 'bg-transparent' : 'border-b border-border bg-bg/80 backdrop-blur-md',
        )}
      >
        <div className="flex h-full items-center">
          <button
            type="button"
            aria-label={t('nav.menu')}
            aria-expanded={open}
            aria-controls="mobile-drawer"
            onClick={() => setOpen((v) => !v)}
            className="-ms-2.5 me-1.5 flex size-10 items-center justify-center rounded-[var(--radius-sm)] text-text xl:hidden"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </button>

          <Link to="/" aria-label={t('app.name')} className="flex h-8 shrink-0 items-center font-bold text-text md:h-12">
            {t('app.name')}
          </Link>

          <nav className="hidden h-full items-center gap-0.5 xl:ms-5 xl:flex">
            <NavLink to="/image-generate" className={navLinkClass}>
              <ImageIcon className="size-4" /> {t('nav.images')}
            </NavLink>
            <NavLink to="/video-generate" className={navLinkClass}>
              <Video className="size-4" /> {t('nav.video')}
            </NavLink>
            <NavLink to="/templates" className={navLinkClass}>
              <LayoutTemplate className="size-4" /> {t('nav.templates')}
            </NavLink>
            {user && (
              <NavLink to="/library" className={navLinkClass}>
                <Library className="size-4" /> {t('nav.library')}
              </NavLink>
            )}
            <span className="ms-3 flex h-8 items-center gap-1.5 px-2 text-sm font-medium text-muted">
              <LayoutGrid className="size-4" /> {t('nav.studios')}
            </span>
            {studios.map((s) => (
              <NavLink key={s.to} to={s.to} className={navLinkClass}>
                {s.label} <Badge tone={s.badge}>{s.badge === 'beta' ? 'Beta' : t('studios.soon')}</Badge>
              </NavLink>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 md:gap-3">
          <Link
            to="/pricing"
            className="hidden h-8 items-center rounded-[var(--radius-sm)] border border-border bg-white/5 px-3 text-sm font-medium text-text hover:bg-white/10 md:flex"
          >
            {t('nav.pricing')}
          </Link>
          <CreditBadge />
          <Button
            variant="secondary"
            size="icon"
            title={t('nav.language')}
            aria-label={t('nav.language')}
            onClick={() => setLocale(locale === 'ar' ? 'en' : 'ar')}
          >
            <Globe className="size-3.5" />
          </Button>
          {user ? (
            <>
              <Link
                to="/account"
                title={t('nav.account')}
                aria-label={t('nav.account')}
                className="hidden size-9 items-center justify-center rounded-[var(--radius-sm)] border border-border bg-white/5 text-text hover:bg-white/10 md:inline-flex"
              >
                <UserRound className="size-3.5" />
              </Link>
              <Button variant="secondary" size="sm" onClick={() => void signOut()}>
                <LogOut className="size-3" /> <span className="hidden sm:inline">{t('nav.logout')}</span>
              </Button>
            </>
          ) : (
            <Link
              to="/login"
              className="inline-flex h-8 items-center gap-2 rounded-[var(--radius-sm)] bg-brand px-3 text-xs font-bold text-brand-ink transition-opacity hover:opacity-90"
            >
              <LogIn className="size-3" /> {t('nav.login')}
            </Link>
          )}
        </div>
      </header>

      {/* درج الجوال */}
      <div
        id="mobile-drawer"
        role="dialog"
        aria-modal="false"
        aria-label={t('nav.menu')}
        data-open={open}
        className={cn(
          'fixed bottom-0 start-0 top-12 z-[20000] w-[252px] transition-transform duration-200 md:top-16 xl:hidden',
          open ? 'translate-x-0' : 'rtl:translate-x-full ltr:-translate-x-full',
        )}
      >
        <div className="m-2 flex h-[calc(100%-1rem)] flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface">
          <div className="flex-1 overflow-y-auto px-1.5 pt-1.5 pb-3">
            <DrawerLink to="/image-generate" icon={<ImageIcon className="size-3" />} label={t('nav.images')} />
            <DrawerLink to="/video-generate" icon={<Video className="size-3" />} label={t('nav.video')} />
            <DrawerLink to="/templates" icon={<LayoutTemplate className="size-3" />} label={t('nav.templates')} />
            <p className="mt-2.5 px-2 text-[11px] font-medium text-muted">{t('nav.studios')}</p>
            {studios.map((s) => (
              <DrawerLink key={s.to} to={s.to} icon={<LayoutGrid className="size-3" />} label={s.label} />
            ))}
            <p className="mt-2.5 px-2 text-[11px] font-medium text-muted">{t('nav.library')}</p>
            <DrawerLink to="/library" icon={<LayoutGrid className="size-3" />} label={t('nav.library')} />
            {user && <DrawerLink to="/account" icon={<UserRound className="size-3" />} label={t('nav.account')} />}
            <DrawerLink to="/pricing" icon={<LayoutGrid className="size-3" />} label={t('nav.pricing')} />
          </div>
          <div className="border-t border-border p-2">
            {user ? (
              <Button variant="ghost" className="w-full justify-start" onClick={() => void signOut()}>
                <LogOut /> {t('nav.logout')}
              </Button>
            ) : (
              <Link to="/login" className="flex h-9 items-center gap-2 rounded-[var(--radius-sm)] px-2 text-sm font-medium text-text hover:bg-white/5">
                <LogIn className="size-4" /> {t('nav.login')}
              </Link>
            )}
          </div>
        </div>
      </div>
      {open && <button type="button" aria-label={t('nav.close')} onClick={() => setOpen(false)} className="fixed inset-0 z-[19999] bg-black/50 xl:hidden" />}
    </>
  )
}

function DrawerLink({ to, icon, label }: { to: string; icon: React.ReactNode; label: string }) {
  return (
    <NavLink
      to={to}
      className={({ isActive }) =>
        cn(
          'flex h-8 w-full items-center gap-1.5 rounded-[var(--radius-sm)] px-1.5 text-[13px] font-medium transition-colors',
          isActive ? 'bg-white/[0.06] text-text' : 'text-muted hover:bg-white/[0.04] hover:text-text',
        )
      }
    >
      <span className="flex size-5 items-center justify-center rounded-md bg-white/5">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{label}</span>
    </NavLink>
  )
}
