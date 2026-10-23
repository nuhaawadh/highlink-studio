import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { AssetCard } from '@/components/studio/AssetCard'
import { useI18n } from '@/i18n'
import { useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { env } from '@/lib/env'
import { cn } from '@/lib/utils'

type Filter = 'all' | 'image' | 'video'

/** المكتبة (المخطط §8): شبكة أصول المستخدم مع فلتر النوع؛ تتحدث لحظيًا عبر Realtime. */
export function LibraryPage() {
  const { t } = useI18n()
  const { user } = useAuth()
  const [filter, setFilter] = useState<Filter>('all')
  const { assets, loading } = useAssets(user?.id ?? null, { type: filter === 'all' ? undefined : filter, limit: 60 })

  useEffect(() => {
    document.title = `${t('nav.library')} — ${env.VITE_APP_NAME}`
  }, [t])

  const filters: Filter[] = ['all', 'image', 'video']

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:py-8">
      <header className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">{t('library.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('library.subtitle')}</p>
        </div>
        <div role="tablist" className="inline-flex items-center gap-1 rounded-none border border-border bg-surface p-1 text-sm">
          {filters.map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={filter === f}
              onClick={() => setFilter(f)}
              className={cn('rounded-none px-3 py-1', filter === f ? 'bg-text text-bg' : 'text-muted hover:text-text')}
            >
              {t(`library.${f}`)}
            </button>
          ))}
        </div>
      </header>

      {loading ? (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="aspect-square animate-pulse rounded-[var(--radius-lg)] bg-text/[0.04]" />
          ))}
        </div>
      ) : assets.length === 0 ? (
        <div className="flex min-h-64 flex-col items-center justify-center gap-3 rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-muted">
          <p>{t('library.empty')}</p>
          <Link to="/image-generate" className="rounded-[var(--radius-sm)] bg-brand px-4 py-2 text-xs font-bold text-brand-ink">
            {t('library.emptyCta')}
          </Link>
        </div>
      ) : (
        <>
          <p className="mb-3 text-xs text-muted">{t('library.count', { n: assets.length })}</p>
          <div data-testid="library-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        </>
      )}
    </section>
  )
}
