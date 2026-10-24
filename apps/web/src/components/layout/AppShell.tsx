import { Outlet, useLocation } from 'react-router-dom'
import { Toaster } from 'sonner'
import { BottomNav } from './BottomNav'
import { Footer } from './Footer'
import { Header } from './Header'
import { useI18n } from '@/i18n'
import { cn } from '@/lib/utils'

/** صفحات لها شريط ثابت تحت (البرومت) — بلا شريط تنقل سفلي في الجوال حتى لا يغطيه */
const NO_BOTTOM_NAV = ['/image-generate', '/video-generate']

/** الإطار العام: هيدر ثابت + محتوى + شريط سفلي للجوال + تنبيهات sonner. */
export function AppShell() {
  const { dir } = useI18n()
  const { pathname } = useLocation()
  const isHome = pathname === '/'
  const bottomNav = !NO_BOTTOM_NAV.includes(pathname)

  return (
    <div dir={dir} className={cn('relative flex min-h-dvh w-full flex-col bg-bg text-text', bottomNav && 'max-md:pb-[calc(3.5rem+env(safe-area-inset-bottom))]')}>
      <Header />
      <main className={cn('flex flex-1 flex-col', !isHome && 'pt-12 md:pt-16')}>
        <Outlet />
      </main>
      <Footer />
      {bottomNav && <BottomNav />}
      <Toaster dir={dir} theme="dark" position="bottom-center" richColors mobileOffset={bottomNav ? { bottom: 72 } : undefined} />
    </div>
  )
}
