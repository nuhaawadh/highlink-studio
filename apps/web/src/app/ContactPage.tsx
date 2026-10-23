import { useEffect } from 'react'
import { Mail } from 'lucide-react'
import { useI18n } from '@/i18n'
import { env } from '@/lib/env'

/** صفحة التواصل — قناة الدعم الرسمية بريد إلكتروني فقط (لا رقم جوال حاليًا). */
export function ContactPage() {
  const { t } = useI18n()
  useEffect(() => {
    document.title = `${t('nav.contact')} — ${env.VITE_APP_NAME}`
  }, [t])

  return (
    <section className="mx-auto w-full max-w-2xl px-4 py-16 text-center">
      <h1 className="text-3xl font-extrabold">{t('contact.title')}</h1>
      <p className="mt-3 text-muted">{t('contact.subtitle')}</p>
      <a
        href={`mailto:${env.VITE_SUPPORT_EMAIL}`}
        className="mt-8 inline-flex items-center gap-2 rounded-xl border border-border bg-surface px-5 py-3 font-semibold hover:border-brand"
      >
        <Mail className="size-5" aria-hidden />
        <span dir="ltr">{env.VITE_SUPPORT_EMAIL}</span>
      </a>
      <p className="mt-6 text-sm text-muted">{t('contact.sla')}</p>
    </section>
  )
}
