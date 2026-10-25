import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import type { ShowcaseMedia } from '@shared/showcase'
import { MediaTile } from '@/components/studio/MediaTile'
import { useI18n } from '@/i18n'
import { familyMedia, likeCost } from '@/lib/showcase'
import { familyName, groupByFamily, modelName, modelSupports, type ModelRow } from '@/lib/models'
import { cn } from '@/lib/utils'

/**
 * "اختر من النتيجة": معرض العائلات في مساحة العمل الفارغة — مثال حقيقي لكل عائلة (content/showcase) واسمها ومختبرها
 * وأقل تكلفة. الضغط يختار أول إصدار في العائلة؛ الإعدادات تبقى في الشريط الجانبي. بلا مثال بعد = بطاقة نصية بنفس المقاس.
 * "سوّ مثلها" (onLike) تحت كل مثال: ينسخ برومته ونموذجه وإعداداته (مثل Recreate عند هيغز فيلد)، والبرومت يظهر بالمرور.
 */
export function FamilyGallery({
  models,
  type,
  defaultCost,
  selectedId,
  onPick,
  onLike,
}: {
  models: ModelRow[]
  type: 'image' | 'video'
  defaultCost: (m: ModelRow) => number
  selectedId: string | null
  onPick: (id: string) => void
  onLike?: (media: ShowcaseMedia, family: string, headId: string) => void
}) {
  const { t, locale } = useI18n()
  const families = useMemo(() => groupByFamily(models, defaultCost), [models, defaultCost])
  const selectedFamily = useMemo(() => {
    const m = models.find((x) => x.id === selectedId)
    return m ? (modelSupports(m).family ?? m.id) : null
  }, [models, selectedId])
  if (!families.length) return null
  const aspect = type === 'video' ? 'aspect-video' : 'aspect-[4/5]'

  return (
    <section aria-labelledby="family-gallery" className="flex flex-col gap-3">
      <div>
        <h2 id="family-gallery" className="text-base font-extrabold">
          {t('gallery.title')}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{t(type === 'video' ? 'gallery.subtitleVideo' : 'gallery.subtitleImage')}</p>
      </div>
      <div className={cn('grid gap-3', type === 'video' ? 'grid-cols-1 sm:grid-cols-2 xl:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 xl:grid-cols-4')}>
        {families.map((f) => {
          const head = f.models[0]
          const media = familyMedia(type, f.key)
          const name = f.models.length > 1 ? familyName(head, locale) : modelName(head, locale)
          const lab = modelSupports(head).lab
          const on = f.key === selectedFamily
          const like = media ? likeCost(media, models) : null
          return (
            <div
              key={f.key}
              className={cn('group flex flex-col border bg-bg transition-colors', on ? 'border-text' : 'border-border hover:border-text/50')}
            >
              <button
                type="button"
                onClick={() => onPick(head.id)}
                aria-pressed={on}
                className="flex flex-col text-start focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
              >
                <div className={cn('lime-trace relative w-full overflow-hidden bg-inverse', aspect)}>
                  {media ? (
                    <>
                      <MediaTile media={media} alt={name} fill className="absolute inset-0" />
                      <span
                        dir="ltr"
                        className="pointer-events-none absolute inset-x-0 bottom-0 bg-inverse/85 p-2 text-start font-latin text-[11px] leading-snug text-inverse-ink opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
                      >
                        <span className="line-clamp-3">{media.prompt}</span>
                      </span>
                    </>
                  ) : (
                    <span className="absolute inset-0 flex items-end p-3 text-2xl font-extrabold text-inverse-ink">{name}</span>
                  )}
                </div>
                <span className="flex items-baseline justify-between gap-2 px-3 py-2.5">
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold">{name}</span>
                    {lab && <span className="block truncate font-mono text-[11px] text-muted">{lab}</span>}
                  </span>
                  <span className="shrink-0 font-latin text-xs tabular-nums text-muted">{t('generate.fromCost', { n: f.fromCost })}</span>
                </span>
              </button>
              {media && onLike && (
                <button
                  type="button"
                  onClick={() => onLike(media, f.key, head.id)}
                  className="flex items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs font-medium text-text transition-colors hover:bg-text hover:text-bg focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-text"
                >
                  <span className="inline-flex items-center gap-1.5">
                    {t('like.cta')}
                    <ArrowLeft className="size-3.5 ltr:rotate-180" aria-hidden />
                  </span>
                  {like != null && <span className="font-latin tabular-nums opacity-70">{t('credits.n', { n: like })}</span>}
                </button>
              )}
            </div>
          )
        })}
      </div>
    </section>
  )
}
