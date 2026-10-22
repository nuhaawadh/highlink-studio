import { Link } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { env } from '@/lib/env'

/** تذييل بروابط السياسات — مطلوب لمراجعة بوابات الدفع ولثقة المستخدم. */
export function Footer() {
  const { t } = useI18n()
  const links = [
    { to: '/pricing', label: t('nav.pricing') },
    { to: '/terms', label: t('nav.terms') },
    { to: '/refund-policy', label: t('nav.refund') },
    { to: '/privacy', label: t('nav.privacy') },
    { to: '/legal', label: t('nav.legal') },
    { to: '/contact', label: t('nav.contact') },
  ]
  return (
    <footer className="border-t border-border bg-bg">
      <div className="mx-auto flex w-full max-w-6xl flex-col items-center justify-between gap-4 px-4 py-8 text-sm text-muted md:flex-row">
        <nav className="flex flex-wrap items-center justify-center gap-x-5 gap-y-2">
          {links.map((l) => (
            <Link key={l.to} to={l.to} className="hover:text-text">
              {l.label}
            </Link>
          ))}
        </nav>
        <p>
          © {new Date().getFullYear()} {env.VITE_APP_NAME} · {t('footer.by')}
        </p>
      </div>
    </footer>
  )
}
