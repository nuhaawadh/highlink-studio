import { useRef, type SyntheticEvent } from 'react'
import { AlertTriangle, Download, ExternalLink, Loader2 } from 'lucide-react'
import { Skeleton } from '@/components/ui/skeleton'
import { useI18n } from '@/i18n'
import { uploadVideoThumbnail, type AssetRow } from '@/lib/assets'
import { cn } from '@/lib/utils'

/** نسبة العرض كقيمة CSS aspect-ratio من عمود aspect_ratio ("9:16" → "9 / 16") */
function cssAspect(ratio: string | null, type?: string): string {
  if (!ratio || !/^\d+:\d+$/.test(ratio)) return type === 'video' ? '16 / 9' : '1 / 1'
  const [w, h] = ratio.split(':')
  return `${w} / ${h}`
}

const THUMB_MAX_WIDTH = 640

/**
 * بطاقة الأصل بحالاتها (المخطط §8): queued/processing هيكل نابض، completed الصورة أو مشغّل الفيديو مع تحميل، failed رسالة عربية + استرداد.
 * الحالة تتغير عبر Realtime من useAssets — البطاقة لا تطلب شيئًا بنفسها،
 * إلا التقاط الصورة المصغّرة للفيديو عند أول عرض إن لم توجد (المخطط §6، asset-thumbnail).
 */
export function AssetCard({ asset, className }: { asset: AssetRow; className?: string }) {
  const { t, locale } = useI18n()
  const thumbAttempted = useRef(false)
  const time = new Intl.DateTimeFormat(locale === 'ar' ? 'ar-SA-u-nu-latn' : 'en-US', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(asset.created_at),
  )
  const pending = asset.status === 'queued' || asset.status === 'processing'
  const failed = asset.status === 'failed' || asset.status === 'canceled'
  // أصل من مفتاح API اختباري (ADR 0004): مكتمل بلا صورة ولا خصم
  const sandbox = asset.status === 'completed' && !asset.url && Boolean((asset.metadata as { sandbox?: unknown } | null)?.sandbox)
  const isVideo = asset.type === 'video'
  // بوابة الجودة (ADR 0006): درجة مطابقة المنتج على صور الاستوديو المكتملة
  const qa = (asset.metadata as { qa?: { status?: string; product_match?: number | null } } | null)?.qa
  const qaLabel =
    asset.status === 'completed' && qa?.status === 'passed' && typeof qa.product_match === 'number'
      ? t('studio.qa', { n: qa.product_match })
      : asset.status === 'completed' && qa?.status === 'unchecked'
        ? t('studio.qaUnchecked')
        : null

  function captureThumbnail(e: SyntheticEvent<HTMLVideoElement>) {
    if (asset.thumbnail_url || thumbAttempted.current) return
    thumbAttempted.current = true
    const video = e.currentTarget
    try {
      const scale = Math.min(1, THUMB_MAX_WIDTH / Math.max(1, video.videoWidth))
      const canvas = document.createElement('canvas')
      canvas.width = Math.max(1, Math.round(video.videoWidth * scale))
      canvas.height = Math.max(1, Math.round(video.videoHeight * scale))
      const ctx = canvas.getContext('2d')
      if (!ctx) return
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height)
      const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
      void uploadVideoThumbnail(asset.id, dataUrl)
    } catch {
      /* canvas ملوّث (CORS) أو متصفح يمنع — المصغّر تحسين لا شرط */
    }
  }

  return (
    <figure
      data-status={asset.status}
      data-type={asset.type}
      className={cn('group flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-border bg-surface', className)}
    >
      <div className="lime-trace relative w-full overflow-hidden bg-bg" style={{ aspectRatio: cssAspect(asset.aspect_ratio, asset.type) }}>
        {pending && (
          <>
            <Skeleton className="absolute inset-0 rounded-none" />
            <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 text-sm text-muted">
              <Loader2 className="size-6 animate-spin text-brand" aria-hidden />
              <span>{t(asset.status === 'queued' ? 'asset.queued' : isVideo ? 'asset.processingVideo' : 'asset.processing')}</span>
            </div>
          </>
        )}

        {asset.status === 'completed' && asset.url && (
          <>
            {isVideo ? (
              <video
                src={asset.url}
                poster={asset.thumbnail_url ?? undefined}
                controls
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
                onLoadedData={captureThumbnail}
                aria-label={asset.prompt ?? ''}
                className="size-full bg-black object-contain"
              />
            ) : (
              <img src={asset.url} alt={asset.prompt ?? ''} loading="lazy" className="size-full object-cover" />
            )}
            <div
              className={cn(
                'absolute inset-x-0 flex justify-end gap-1 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100',
                isVideo ? 'top-0 bg-gradient-to-b' : 'bottom-0',
              )}
            >
              <a
                href={asset.url}
                download
                target="_blank"
                rel="noreferrer"
                title={t('asset.download')}
                aria-label={t('asset.download')}
                className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-white/15 text-white backdrop-blur hover:bg-white/25"
              >
                <Download className="size-4" aria-hidden />
              </a>
              <a
                href={asset.url}
                target="_blank"
                rel="noreferrer"
                title={t('asset.open')}
                aria-label={t('asset.open')}
                className="flex size-8 items-center justify-center rounded-[var(--radius-sm)] bg-white/15 text-white backdrop-blur hover:bg-white/25"
              >
                <ExternalLink className="size-4" aria-hidden />
              </a>
            </div>
          </>
        )}

        {sandbox && (
          <div className="absolute inset-0 flex items-center justify-center p-4 text-center text-xs text-muted">{t('asset.sandbox')}</div>
        )}

        {failed && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertTriangle className="size-6 text-danger" aria-hidden />
            <p className="text-sm font-semibold text-danger">{t('asset.failed')}</p>
            <p className="text-xs text-muted">{asset.error_message ?? t('errors.generic')}</p>
            <p className="text-xs text-brand">{t('asset.refunded')}</p>
          </div>
        )}
      </div>

      <figcaption className="flex items-center justify-between gap-2 px-3 py-2 text-xs text-muted">
        <span className="min-w-0 truncate" title={asset.prompt ?? undefined}>
          {asset.prompt ?? '—'}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {qaLabel && <span className="border border-border px-1 text-[10px] text-text">{qaLabel}</span>}
          {isVideo && asset.duration_s != null && <span className="font-latin tabular-nums">{t('video.seconds', { n: Number(asset.duration_s) })}</span>}
          {asset.cost_credits != null && asset.status === 'completed' && (
            <span className="font-latin tabular-nums text-text">{t('credits.n', { n: asset.cost_credits })}</span>
          )}
          <time dateTime={asset.created_at} className="font-latin tabular-nums">
            {time}
          </time>
        </span>
      </figcaption>
    </figure>
  )
}
