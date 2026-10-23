import { Volume2, VolumeX } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { AspectRatio } from '@shared/types'
import { AspectRatioPicker } from '@/components/studio/AspectRatioPicker'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { ModelPicker } from '@/components/studio/ModelPicker'
import { OptionChips } from '@/components/studio/OptionChips'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAsset, GenerateError, requestGeneration, useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { modelAspectRatios, modelDefaults, modelDurations, modelHasAudio, modelResolutions, useModels, videoCost, type ModelRow } from '@/lib/models'
import { cn } from '@/lib/utils'

/** تكلفة النموذج بإعداداته الافتراضية (مدة/دقة الافتراض، بلا صوت) — لبطاقات العائلات */
const defaultVideoCost = (m: ModelRow) => videoCost(m, { duration: modelDefaults(m).duration, resolution: modelDefaults(m).resolution })

/** الدقة كما يسمّيها المزوّد ("768P") تُعرض بحروف صغيرة موحّدة */
const formatResolution = (r: string) => r.toLowerCase()

/**
 * التوليد الحر للفيديو (المخطط §8، ADR 0005): نفس تدفق الصور — صف assets queued → generate-media → Realtime (لا polling).
 * الإعدادات (المدة، الدقة، القياس، الصوت) تأتي من `models.supports` المشتقة من مخطط المزوّد، والتكلفة من modelCredits نفسها.
 */
export function VideoGeneratePage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const { models, loading: modelsLoading } = useModels('video')
  const { assets, loading: assetsLoading, upsertLocal } = useAssets(userId, { type: 'video', limit: 24 })

  const [modelId, setModelId] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('16:9')
  const [duration, setDuration] = useState<number>(5)
  const [resolution, setResolution] = useState<string | undefined>(undefined)
  const [audio, setAudio] = useState(false)
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `${t('nav.video')} — ${env.VITE_APP_NAME}`
  }, [t])

  const model = useMemo(() => models.find((m) => m.id === modelId) ?? models[0] ?? null, [models, modelId])
  const durations = useMemo(() => (model ? modelDurations(model) : []), [model])
  const resolutions = useMemo(() => (model ? modelResolutions(model) : []), [model])
  const ratios = useMemo(() => (model ? modelAspectRatios(model) : []), [model])
  const hasAudio = model ? modelHasAudio(model) : false

  // عند تغيّر النموذج: نبدأ من افتراضياته (default_params) ضمن ما يدعمه
  useEffect(() => {
    if (!model) return
    const d = modelDefaults(model)
    const durs = modelDurations(model)
    const ress = modelResolutions(model)
    const rats = modelAspectRatios(model)
    setDuration(d.duration && durs.includes(d.duration) ? d.duration : (durs[0] ?? 5))
    setResolution(d.resolution && ress.includes(d.resolution) ? d.resolution : ress[0])
    setAspectRatio(d.aspectRatio && rats.includes(d.aspectRatio) ? d.aspectRatio : (rats[0] ?? '16:9'))
    setAudio(false)
  }, [model])

  const cost = model ? videoCost(model, { duration, resolution, audio: hasAudio ? audio : undefined }) : 0
  const canGenerate = Boolean(user && model && prompt.trim().length > 0 && cost > 0)

  async function onGenerate() {
    if (!user || !model || !prompt.trim()) return
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
        config: { aspectRatio, duration, resolution, ...(hasAudio ? { audio } : {}) },
        feature_tag: 'general',
        locale,
        // سقف الإنفاق = ما رآه المستخدم على الزر؛ لو تغيّر سعر النموذج بعد التحميل يُرفض الطلب بدل خصم أعلى
        maxCredits: cost,
      })
      toast.success(t('generate.started', { n: res.cost }))
    } catch (e) {
      if (e instanceof GenerateError) {
        const key = `errors.${e.code}`
        const translated = t(key)
        toast.error(locale === 'ar' || translated === key ? e.message : translated)
      } else {
        console.error('[generate:video]', e)
        toast.error(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-6 md:py-8">
      {/* شريط الإعدادات */}
      <aside className="flex w-full shrink-0 flex-col gap-5 md:w-80">
        <div>
          <h1 className="text-xl font-extrabold">{t('video.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('video.subtitle')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.model')}</h2>
          <div className="max-h-[50vh] overflow-y-auto pe-1 md:max-h-[60vh]">
            <ModelPicker models={models} loading={modelsLoading} value={model?.id ?? null} onChange={setModelId} defaultCost={defaultVideoCost} />
          </div>
        </div>

        {model && (
          <>
            {durations.length > 1 && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('video.duration')}</h2>
                <OptionChips
                  label={t('video.duration')}
                  options={durations.length > 8 ? pickDurations(durations) : durations}
                  value={duration}
                  format={(d) => t('video.seconds', { n: d })}
                  costFor={(d) => videoCost(model, { duration: d, resolution, audio: hasAudio ? audio : undefined })}
                  onChange={setDuration}
                />
              </div>
            )}
            {resolutions.length > 1 && resolution && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.resolution')}</h2>
                <OptionChips
                  label={t('generate.resolution')}
                  options={resolutions}
                  value={resolution}
                  format={formatResolution}
                  costFor={(r) => videoCost(model, { duration, resolution: r, audio: hasAudio ? audio : undefined })}
                  onChange={setResolution}
                />
              </div>
            )}
            {ratios.length > 1 && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.aspectRatio')}</h2>
                <AspectRatioPicker options={ratios} value={aspectRatio} onChange={setAspectRatio} />
              </div>
            )}
            {hasAudio && (
              <div>
                <h2 className="mb-2 text-xs font-semibold text-muted">{t('video.audio')}</h2>
                <button
                  type="button"
                  role="switch"
                  aria-checked={audio}
                  onClick={() => setAudio((a) => !a)}
                  className={cn(
                    'flex w-full items-center justify-between gap-3 rounded-[var(--radius-sm)] border px-3 py-2 text-sm transition-colors',
                    audio ? 'border-brand bg-brand/10 text-text' : 'border-border text-muted hover:bg-text/[0.04]',
                  )}
                >
                  <span className="flex items-center gap-2">
                    {audio ? <Volume2 className="size-4" aria-hidden /> : <VolumeX className="size-4" aria-hidden />}
                    {audio ? t('video.audioOn') : t('video.audioOff')}
                  </span>
                  <span className="text-xs">{t('video.audioHint')}</span>
                </button>
              </div>
            )}
          </>
        )}
      </aside>

      {/* مساحة العمل */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex-1">
          {assetsLoading ? (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="aspect-video animate-pulse rounded-[var(--radius-lg)] bg-text/[0.04]" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-muted">
              {t('video.empty')}
            </div>
          ) : (
            <div data-testid="results-grid" className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {assets.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          )}
        </div>

        {/* شريط البرومبت */}
        <form
          onSubmit={(e) => {
            e.preventDefault()
            void onGenerate()
          }}
          className="sticky bottom-3 flex flex-col gap-3 rounded-[var(--radius-lg)] border border-border bg-bg p-3 md:flex-row md:items-end"
        >
          <label className="flex-1 text-sm">
            <span className="sr-only">{t('video.promptLabel')}</span>
            <Textarea
              rows={3}
              maxLength={4000}
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

/** مدد كثيرة (مثل 3–30 ثانية) تُختصر إلى خيارات مألوفة موجودة فعلًا في القائمة */
function pickDurations(all: number[]): number[] {
  const preferred = [3, 4, 5, 6, 8, 10, 12, 15, 20, 25, 30]
  const picked = preferred.filter((d) => all.includes(d))
  return picked.length ? picked : all.slice(0, 8)
}
