import { useEffect, useMemo, useState } from 'react'
import { toast } from 'sonner'
import type { AspectRatio, ImageSize } from '@shared/types'
import { AspectRatioPicker } from '@/components/studio/AspectRatioPicker'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { ModelPicker } from '@/components/studio/ModelPicker'
import { ResolutionPicker } from '@/components/studio/ResolutionPicker'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAsset, GenerateError, requestGeneration, useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { modelAspectRatios, modelCost, modelDefaults, modelSizes, useModels, type ModelRow } from '@/lib/models'

/** تكلفة النموذج بدقته الافتراضية — لبطاقات العائلات في المنتقي */
const defaultImageCost = (m: ModelRow) => modelCost(m, modelDefaults(m).imageSize ?? '1K')

/**
 * التوليد الحر للصور (المخطط §8): شريط إعدادات + شبكة نتائج + شريط برومبت فيه زر يعرض التكلفة قبل الضغط.
 * التدفق (CLAUDE.md القاعدة 1): صف assets queued → generate-media → Realtime يحوّل البطاقة إلى النتيجة. لا polling.
 */
export function ImageGeneratePage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const { models, loading: modelsLoading } = useModels('image')
  const { assets, loading: assetsLoading, upsertLocal } = useAssets(userId, { type: 'image', limit: 24 })

  const [modelId, setModelId] = useState<string | null>(null)
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [imageSize, setImageSize] = useState<ImageSize>('1K')
  const [prompt, setPrompt] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `${t('nav.images')} — ${env.VITE_APP_NAME}`
  }, [t])

  const model = useMemo(() => models.find((m) => m.id === modelId) ?? models[0] ?? null, [models, modelId])

  // عند تغيّر النموذج: نبدأ من افتراضياته (default_params) ضمن ما يدعمه
  useEffect(() => {
    if (!model) return
    const d = modelDefaults(model)
    const sizes = modelSizes(model)
    const ratios = modelAspectRatios(model)
    setImageSize(d.imageSize && sizes.includes(d.imageSize) ? d.imageSize : sizes[0])
    setAspectRatio(d.aspectRatio && ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0])
  }, [model])

  const cost = model ? modelCost(model, imageSize) : 0
  const canGenerate = Boolean(user && model && prompt.trim().length > 0)

  async function onGenerate() {
    if (!user || !model || !prompt.trim()) return
    setBusy(true)
    try {
      const asset = await createQueuedAsset({
        userId: user.id,
        type: 'image',
        model: model.id,
        prompt: prompt.trim(),
        aspectRatio,
        resolution: imageSize,
        featureTag: 'general',
      })
      upsertLocal(asset)
      const res = await requestGeneration({
        assetId: asset.id,
        model: model.id,
        prompt: prompt.trim(),
        config: { aspectRatio, imageSize },
        feature_tag: 'general',
        locale,
        // سقف الإنفاق = ما رآه المستخدم على الزر؛ لو تغيّر سعر النموذج بعد التحميل يُرفض الطلب بدل خصم أعلى
        maxCredits: cost,
      })
      toast.success(t('generate.started', { n: res.cost }))
    } catch (e) {
      if (e instanceof GenerateError) {
        // السيرفر يرسل الرسالة بالعربية؛ بالإنجليزية نعرض ترجمة الرمز إن وُجدت
        const key = `errors.${e.code}`
        const translated = t(key)
        toast.error(locale === 'ar' || translated === key ? e.message : translated)
      } else {
        console.error('[generate]', e)
        toast.error(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-4 px-4 py-6 md:flex-row md:gap-6 md:py-8">
      {/* شريط الإعدادات */}
      <aside className="flex w-full shrink-0 flex-col gap-5 md:w-72">
        <div>
          <h1 className="text-xl font-bold">{t('generate.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('generate.subtitle')}</p>
        </div>

        <div>
          <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.model')}</h2>
          <ModelPicker models={models} loading={modelsLoading} value={model?.id ?? null} onChange={setModelId} defaultCost={defaultImageCost} />
        </div>

        {model && (
          <>
            <div>
              <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.aspectRatio')}</h2>
              <AspectRatioPicker options={modelAspectRatios(model)} value={aspectRatio} onChange={setAspectRatio} />
            </div>
            <div>
              <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.resolution')}</h2>
              <ResolutionPicker options={modelSizes(model)} value={imageSize} costFor={(s) => modelCost(model, s)} onChange={setImageSize} />
            </div>
          </>
        )}
      </aside>

      {/* مساحة العمل */}
      <div className="flex min-w-0 flex-1 flex-col gap-4">
        <div className="flex-1">
          {assetsLoading ? (
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="aspect-square animate-pulse rounded-[var(--radius-lg)] bg-text/[0.04]" />
              ))}
            </div>
          ) : assets.length === 0 ? (
            <div className="flex h-full min-h-64 flex-col items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-muted">
              {t('generate.empty')}
            </div>
          ) : (
            <div data-testid="results-grid" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-4">
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
            <span className="sr-only">{t('generate.promptLabel')}</span>
            <Textarea
              rows={3}
              maxLength={4000}
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder={t('generate.promptPlaceholder')}
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
