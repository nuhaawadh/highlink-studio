import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import { ImagePlus, X } from 'lucide-react'
import type { AspectRatio, VideoResolution } from '@shared/types'
import { AspectRatioPicker } from '@/components/studio/AspectRatioPicker'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { ModelPicker } from '@/components/studio/ModelPicker'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAsset, GenerateError, requestGeneration, useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { modelAspectRatios, modelDefaults, modelDurations, modelSupports, modelVideoCost, modelVideoResolutions, useModels } from '@/lib/models'
import { cn } from '@/lib/utils'

const inputClass =
  'h-10 w-full rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm text-text placeholder:text-muted outline-none transition-colors focus:border-brand disabled:opacity-50'

/**
 * توليد الفيديو (المخطط §8، Kling عبر Replicate): نص أو صورة→فيديو (رابط https أو صورة من مكتبتك)، المدة 5/10، النسبة، الدقة،
 * الصوت، والتكلفة على الزر قبل الضغط بنفس videoCredits التي يخصم بها السيرفر. التدفق الثابت (القاعدة 1): صف queued → generate-media → Realtime.
 */
export function VideoGeneratePage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const { models, loading: modelsLoading } = useModels('video')
  const { assets, loading: assetsLoading, upsertLocal } = useAssets(userId, { type: 'video', limit: 24 })
  const { assets: recentImages } = useAssets(userId, { type: 'image', limit: 12 })

  const [modelId, setModelId] = useState<string | null>(null)
  const [duration, setDuration] = useState(5)
  const [resolution, setResolution] = useState<VideoResolution>('720p')
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [audio, setAudio] = useState(false)
  const [startImage, setStartImage] = useState('')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `${t('nav.video')} — ${env.VITE_APP_NAME}`
  }, [t])

  const model = useMemo(() => models.find((m) => m.id === modelId) ?? models[0] ?? null, [models, modelId])

  useEffect(() => {
    if (!model) return
    const d = modelDefaults(model)
    const durations = modelDurations(model)
    const resolutions = modelVideoResolutions(model)
    const ratios = modelAspectRatios(model)
    setDuration(d.duration && durations.includes(d.duration) ? d.duration : durations[0])
    setResolution(d.resolution && resolutions.includes(d.resolution) ? d.resolution : resolutions[0])
    setAspectRatio(d.aspectRatio && ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0])
    setAudio(Boolean(d.audio))
  }, [model])

  const supports = model ? modelSupports(model) : {}
  const cost = model ? modelVideoCost(model, duration, resolution, audio) : 0
  const startImageOk = !startImage || /^https:\/\/\S+$/.test(startImage.trim())
  const canGenerate = Boolean(user && model && prompt.trim().length > 0 && startImageOk)
  const completedImages = recentImages.filter((a) => a.status === 'completed' && a.url && !(a.metadata as { sandbox?: unknown } | null)?.sandbox)

  async function onGenerate() {
    if (!user || !model || !prompt.trim() || !startImageOk) return
    setBusy(true)
    try {
      const asset = await createQueuedAsset({
        userId: user.id,
        type: 'video',
        model: model.id,
        prompt: prompt.trim(),
        aspectRatio,
        resolution,
        featureTag: 'general',
      })
      upsertLocal(asset)
      const res = await requestGeneration({
        assetId: asset.id,
        model: model.id,
        prompt: prompt.trim(),
        images: startImage.trim() ? [startImage.trim()] : undefined,
        config: { aspectRatio, duration, resolution, audio },
        feature_tag: 'general',
        locale,
        maxCredits: cost,
      })
      toast.success(t('generate.started', { n: res.cost }))
    } catch (e) {
      if (e instanceof GenerateError) {
        const key = `errors.${e.code}`
        const translated = t(key)
        toast.error(locale === 'ar' || translated === key ? e.message : translated)
      } else {
        console.error('[video-generate]', e)
        toast.error(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-6 md:py-8">
      <aside className="flex w-full shrink-0 flex-col gap-5 md:w-72">
        <div>
          <h1 className="text-xl font-bold">{t('video.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('video.subtitle')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.model')}</h2>
          <ModelPicker models={models} loading={modelsLoading} value={model?.id ?? null} onChange={setModelId} />
        </div>

        {model && (
          <>
            {supports.i2v && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('video.startImage')}</h2>
                <div className="flex gap-1.5">
                  <input
                    className={inputClass}
                    dir="ltr"
                    inputMode="url"
                    placeholder={t('video.startImagePlaceholder')}
                    value={startImage}
                    onChange={(e) => setStartImage(e.target.value)}
                    aria-invalid={!startImageOk}
                  />
                  {startImage && (
                    <button type="button" aria-label={t('video.clearStartImage')} onClick={() => setStartImage('')} className="flex size-10 shrink-0 items-center justify-center rounded-[var(--radius-sm)] border border-border text-muted hover:text-text">
                      <X className="size-4" />
                    </button>
                  )}
                </div>
                {!startImageOk && <p className="mt-1 text-xs text-danger">{t('video.startImageHttps')}</p>}
                {completedImages.length > 0 && (
                  <>
                    <p className="mb-1.5 mt-2 text-[11px] text-muted">{t('video.pickFromLibrary')}</p>
                    <div className="grid grid-cols-4 gap-1.5">
                      {completedImages.slice(0, 8).map((img) => (
                        <button
                          key={img.id}
                          type="button"
                          title={img.prompt ?? ''}
                          aria-pressed={startImage === img.url}
                          onClick={() => setStartImage(img.url ?? '')}
                          className={cn('aspect-square overflow-hidden rounded-[var(--radius-sm)] border transition-colors', startImage === img.url ? 'border-brand' : 'border-border hover:border-white/30')}
                        >
                          <img src={img.thumbnail_url ?? img.url ?? ''} alt="" className="size-full object-cover" loading="lazy" />
                        </button>
                      ))}
                    </div>
                  </>
                )}
                {startImage && <p className="mt-1 text-[11px] text-muted">{t('video.aspectIgnored')}</p>}
              </div>
            )}

            <div>
              <h2 className="mb-2 text-xs font-semibold text-muted">{t('video.duration')}</h2>
              <div role="radiogroup" aria-label={t('video.duration')} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${modelDurations(model).length}, minmax(0, 1fr))` }}>
                {modelDurations(model).map((d) => (
                  <button
                    key={d}
                    type="button"
                    role="radio"
                    aria-checked={duration === d}
                    onClick={() => setDuration(d)}
                    className={cn(
                      'flex flex-col items-center rounded-[var(--radius-sm)] border py-2 transition-colors',
                      duration === d ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="font-latin text-sm font-semibold">{t('video.seconds', { n: d })}</span>
                    <span className="text-[11px]">{t('credits.n', { n: modelVideoCost(model, d, resolution, audio) })}</span>
                  </button>
                ))}
              </div>
            </div>

            {!startImage && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.aspectRatio')}</h2>
                <AspectRatioPicker options={modelAspectRatios(model)} value={aspectRatio} onChange={setAspectRatio} />
              </div>
            )}

            <div>
              <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.resolution')}</h2>
              <div role="radiogroup" aria-label={t('generate.resolution')} className="grid gap-1.5" style={{ gridTemplateColumns: `repeat(${modelVideoResolutions(model).length}, minmax(0, 1fr))` }}>
                {modelVideoResolutions(model).map((r) => (
                  <button
                    key={r}
                    type="button"
                    role="radio"
                    aria-checked={resolution === r}
                    onClick={() => setResolution(r)}
                    className={cn(
                      'flex flex-col items-center rounded-[var(--radius-sm)] border py-2 transition-colors',
                      resolution === r ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-white/[0.04]',
                    )}
                  >
                    <span className="font-latin text-sm font-semibold">{r}</span>
                    <span className="text-[11px]">{t('credits.n', { n: modelVideoCost(model, duration, r, audio) })}</span>
                  </button>
                ))}
              </div>
            </div>

            {supports.audio && (
              <label className="flex cursor-pointer items-center justify-between gap-3 rounded-[var(--radius-sm)] border border-border px-3 py-2 text-sm">
                <span>
                  {t('video.audio')}
                  <span className="block text-[11px] text-muted">{t('video.audioHint', { n: modelVideoCost(model, duration, resolution, true) - modelVideoCost(model, duration, resolution, false) })}</span>
                </span>
                <input type="checkbox" checked={audio} onChange={(e) => setAudio(e.target.checked)} className="size-4 accent-[var(--color-brand)]" />
              </label>
            )}
          </>
        )}
      </aside>

      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex-1">
          {assetsLoading ? (
            <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-[var(--radius-lg)] bg-white/[0.04]" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center gap-2 rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-muted">
              <ImagePlus className="size-6" aria-hidden />
              {t('video.empty')}
            </div>
          ) : (
            <div data-testid="results-grid" className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
              {assets.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          )}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onGenerate()
          }}
          className="sticky bottom-3 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-surface/95 p-3 shadow-xl backdrop-blur md:flex-row md:items-end"
        >
          <label className="flex-1 text-sm">
            <span className="sr-only">{t('video.promptLabel')}</span>
            <Textarea
              rows={3}
              maxLength={2500}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('video.promptPlaceholder')}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                  e.preventDefault()
                  void onGenerate()
                }
              }}
            />
          </label>
          <CreditCostButton cost={cost} balance={balance} busy={busy} disabled={!canGenerate} onClick={() => void onGenerate()} className="md:w-64" />
        </form>
      </div>
    </section>
  )
}
