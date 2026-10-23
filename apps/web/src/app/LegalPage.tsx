import { useEffect } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { legal, type LegalKind } from '@/content/legal'
import { useI18n } from '@/i18n'
import { env } from '@/lib/env'

/** صفحة قانونية واحدة: كل بند = عنوان + جملة + ثلاث نقاط (بنية المركز القانوني). */
export function LegalPage({ kind }: { kind: LegalKind }) {
  const { locale, t } = useI18n()
  const doc = legal[locale][kind]

  useEffect(() => {
    document.title = `${doc.title} — ${env.VITE_APP_NAME}`
  }, [doc.title])

  return (
    <article className="mx-auto w-full max-w-3xl px-4 py-10 md:py-16">
      <Link to="/legal" className="mb-6 inline-flex items-center gap-1 text-sm text-muted hover:text-text">
        <ChevronRight className="size-4 rtl:rotate-0 ltr:rotate-180" aria-hidden />
        {t('nav.legal')}
      </Link>
      <header className="mb-10 border-b border-border pb-6">
        <h1 className="text-3xl font-extrabold">{doc.title}</h1>
        <p className="mt-2 text-sm text-muted">
          {t('legal.updated')}: {doc.updated}
        </p>
      </header>
      {doc.sections.map((s) => (
        <section key={s.h} className="mb-8">
          <h2 className="mb-2 text-lg font-semibold">{s.h}</h2>
          <p className="mb-3 leading-relaxed text-text/90">{s.p}</p>
          <ul className="flex flex-col gap-1.5 ps-5 text-sm text-text/80 marker:text-brand">
            {s.li.map((item) => (
              <li key={item} className="list-disc">
                {item}
              </li>
            ))}
          </ul>
        </section>
      ))}
      <footer className="mt-12 rounded-xl border border-border bg-surface p-4 text-sm">
        {t('legal.contactLine')}{' '}
        <a className="font-semibold text-brand underline-offset-4 hover:underline" href={`mailto:${env.VITE_SUPPORT_EMAIL}`} dir="ltr">
          {env.VITE_SUPPORT_EMAIL}
        </a>
      </footer>
    </article>
  )
}

/** المركز القانوني — فهرس المستندات. */
export function LegalCenterPage() {
  const { locale, t } = useI18n()
  useEffect(() => {
    document.title = `${t('nav.legal')} — ${env.VITE_APP_NAME}`
  }, [t])
  const docs: { kind: LegalKind; to: string }[] = [
    { kind: 'terms', to: '/terms' },
    { kind: 'privacy', to: '/privacy' },
    { kind: 'refund', to: '/refund-policy' },
    { kind: 'deletion', to: '/data-deletion' },
  ]
  return (
    <section className="mx-auto w-full max-w-3xl px-4 py-10 md:py-16">
      <h1 className="text-3xl font-extrabold">{t('nav.legal')}</h1>
      <p className="mt-2 text-muted">{t('legal.centerSubtitle')}</p>
      <ul className="mt-8 flex flex-col gap-3">
        {docs.map((d) => (
          <li key={d.kind}>
            <Link
              to={d.to}
              className="flex items-center justify-between rounded-xl border border-border bg-surface px-5 py-4 font-semibold hover:border-brand"
            >
              {legal[locale][d.kind].title}
              <ChevronRight className="size-4 text-muted rtl:rotate-180" aria-hidden />
            </Link>
          </li>
        ))}
      </ul>
    </section>
  )
}
