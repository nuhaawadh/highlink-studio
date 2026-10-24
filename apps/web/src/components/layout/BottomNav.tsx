import { House, LayoutTemplate, Library, LogIn, UserRound } from 'lucide-react'
import type { ReactNode } from 'react'
import { NavLink } from 'react-router-dom'
import { useI18n } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { cn } from '@/lib/utils'

/**
 * شريط التنقل السفلي للجوال (مثل هيغز فيلد: الرئيسية/المجتمع/المكتبة/الملف — بأقسامنا). تحت md فقط، وفوق المحتوى بخط رفيع
 * بلا ظلال (دليل الهوية). النشط بخط أسود فوقه لا بالليموني — الليموني لزر الإجراء الرئيسي في الصفحة.
 * لا يظهر في صفحات التوليد (لها شريط برومت ثابت تحت) — AppShell يقرر.
 */
export function BottomNav() {
  const { t } = useI18n()
  const { user } = useAuth()
  return (
    <nav
      aria-label={t('bottomNav.label')}
      className="fixed inset-x-0 bottom-0 z-[9998] grid grid-cols-4 border-t border-border bg-bg pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      <Item to="/" end icon={<House className="size-5" aria-hidden />} label={t('bottomNav.home')} />
      <Item to="/templates" icon={<LayoutTemplate className="size-5" aria-hidden />} label={t('bottomNav.templates')} />
      <Item to="/library" icon={<Library className="size-5" aria-hidden />} label={t('bottomNav.library')} />
      {user ? (
        <Item to="/account" icon={<UserRound className="size-5" aria-hidden />} label={t('bottomNav.account')} />
      ) : (
        <Item to="/login" icon={<LogIn className="size-5" aria-hidden />} label={t('bottomNav.login')} />
      )}
    </nav>
  )
}

function Item({ to, icon, label, end }: { to: string; icon: ReactNode; label: string; end?: boolean }) {
  return (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) =>
        cn(
          'relative flex h-14 flex-col items-center justify-center gap-1 text-[11px] font-medium transition-colors',
          isActive ? 'text-text before:absolute before:inset-x-5 before:top-0 before:h-0.5 before:bg-text' : 'text-muted hover:text-text',
        )
      }
    >
      {icon}
      {label}
    </NavLink>
  )
}
