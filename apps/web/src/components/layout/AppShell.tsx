import { Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { Footer } from './Footer'
import { Header } from './Header'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** الإطار العام: هيدر ثابت + محتوى + تنبيهات sonner. */
export function AppShell() {
  const { dir } = useI18n()
  const { pathname } = useLocation()
  const isHome = pathname === '/'

  return (
    <div dir={dir} className="relative flex min-h-dvh w-full flex-col bg-bg text-text">
      <Header />
      <main className={cn('flex flex-1 flex-col', !isHome && 'pt-12 md:pt-16')}>
        <Outlet />
      </main>
      <Footer />
      <Toaster dir={dir} theme="dark" position="bottom-center" richColors />
    </div>
  )
}
