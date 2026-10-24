import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { StudioWizard } from '@/components/studio/StudioWizard'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'
import { env } from '@/lib/env'
import { useStudio } from '@/lib/studios'

/** مسار الواجهة → معرّف الاستوديو في جدول studios */
const SLUGS: Record<string, string> = { product: 'product-shot', ads: 'ads-grid', ugc: 'ugc' }

/**
 * صفحة الاستوديو العامة (القاعدة 6: لا صفحة لكل استوديو). الوصفة غير المقروءة (معطّل لغير المشرف، أو بلا وصفة بعد) = "قريبًا".
 */
export function StudioPage() {
  const { slug = '' } = useParams()
  const { t, locale } = useI18n()
  const studioId = SLUGS[slug] ?? null
  const { recipe, enabled, costEach, loading } = useStudio(studioId)
  const title = recipe ? (locale === 'ar' ? recipe.name_ar : recipe.name_en) : t(`studios.${slug}`)

  useEffect(() => {
    document.title = `${title} — ${env.VITE_APP_NAME}`
  }, [title])

  return (
    <section className="mx-auto w-full max-w-7xl flex-1 px-4 py-6 md:py-8">
      <header className="mb-6">
        <h1 className="text-2xl font-extrabold">{title}</h1>
        {recipe && <p className="mt-1 max-w-2xl text-sm text-muted">{t(`studio.subtitle.${slug}`)}</p>}
      </header>
      {loading ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="aspect-square" />
          <Skeleton className="h-64" />
        </div>
      ) : recipe && costEach != null ? (
        <StudioWizard recipe={recipe} costEach={costEach} preview={!enabled} />
      ) : (
        <div className="flex min-h-64 items-center justify-center border border-dashed border-border p-8 text-center text-sm text-muted">{t('studio.notAvailable')}</div>
      )}
    </section>
  )
}
