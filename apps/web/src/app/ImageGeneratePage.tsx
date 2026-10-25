import { useEffect, useMemo, useRef, useState } from 'react'
import { toast } from 'sonner'
import { likeSettings, type ShowcaseMedia } from '@shared/showcase'
import type { AspectRatio, ImageSize } from '@shared/types'
import { AspectRatioPicker } from '@/components/studio/AspectRatioPicker'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { FamilyGallery } from '@/components/studio/FamilyGallery'
import { ModelPicker } from '@/components/studio/ModelPicker'
import { ModeTabs } from '@/components/studio/ModeTabs'
import { ReferencePicker } from '@/components/studio/ReferencePicker'
import { ResolutionPicker } from '@/components/studio/ResolutionPicker'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAsset, GenerateError, requestGeneration, useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { modelAspectRatios, modelCost, modelDefaults, modelRefSpec, modelSizes, modelsForMode, modelSupports, modesFor, useModels, type GenMode, type ModelRow } from '@/lib/models'
import { likeFromUrl } from '@/lib/showcase'

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
  const { allModels, loading: modelsLoading } = useModels('image')
  const { assets, loading: assetsLoading, upsertLocal } = useAssets(userId, { type: 'image', limit: 24 })

  // ?like=<مفتاح> ("سوّ مثلها" من المعرض): البرومت والنموذج والإعدادات من المثال. ?model=<id>: النموذج فقط
  const [initialLike] = useState(() => {
    const l = likeFromUrl()
    return l && l.media.kind === 'image' ? { media: l.media, family: l.key.split(':')[1] ?? null } : null
  })
  const [modelId, setModelId] = useState<string | null>(() => initialLike?.media.model ?? new URLSearchParams(window.location.search).get('model'))
  const [aspectRatio, setAspectRatio] = useState<AspectRatio>('1:1')
  const [imageSize, setImageSize] = useState<ImageSize>('1K')
  const [prompt, setPrompt] = useState(initialLike?.media.prompt ?? '')
  const [busy, setBusy] = useState(false)
  // مثال ينتظر نموذجه حتى تُطبَّق إعداداته فوق الافتراض (النماذج تُحمَّل بعد أول عرض)
  const pendingLike = useRef<{ media: ShowcaseMedia; family: string | null } | null>(initialLike)

  // الخطوة 5: الوضع (من نص / تعديل صورة) يحدد النماذج المعروضة، والمراجع تُرفع إلى up/{uid}/
  const [mode, setMode] = useState<GenMode>('text')
  const [refs, setRefs] = useState<string[]>([])
  const models = useMemo(() => modelsForMode(allModels, 'image', mode), [allModels, mode])
  // رابط ?model=<id> لنموذج يحتاج مراجع → افتح وضعه مرة واحدة بعد تحميل النماذج
  const modeFromUrl = useRef(false)
  useEffect(() => {
    if (modeFromUrl.current || !allModels.length || !modelId) return
    modeFromUrl.current = true
    const owner = modesFor('image').find((m) => modelsForMode(allModels, 'image', m).some((x) => x.id === modelId))
    if (owner && owner !== 'text') setMode(owner)
  }, [allModels, modelId])

  useEffect(() => {
    document.title = `${t('nav.images')} — ${env.VITE_APP_NAME}`
  }, [t])

  // نموذج المثال لو لم يعد في القائمة → نفس العائلة، وإلا الأول
  const model = useMemo(
    () =>
      models.find((m) => m.id === modelId) ??
      (initialLike?.family ? models.find((m) => modelSupports(m).family === initialLike.family) : undefined) ??
      models[0] ??
      null,
    [models, modelId, initialLike],
  )

  // عند تغيّر النموذج: نبدأ من افتراضياته (default_params) ضمن ما يدعمه
  useEffect(() => {
    if (!model) return
    const d = modelDefaults(model)
    const sizes = modelSizes(model)
    const ratios = modelAspectRatios(model)
    setImageSize(d.imageSize && sizes.includes(d.imageSize) ? d.imageSize : sizes[0])
    setAspectRatio(d.aspectRatio && ratios.includes(d.aspectRatio) ? d.aspectRatio : ratios[0])
    setRefs((r) => r.slice(0, modelRefSpec(model).max))
    applyPendingLike(model)
  }, [model])

  /** تبديل الوضع: أول نموذج في الوضع الجديد، والمثال المنتظر يُلغى */
  function pickMode(m: GenMode) {
    pendingLike.current = null
    setModelId(null)
    setMode(m)
  }

  /** "سوّ مثلها": إعدادات المثال فوق الافتراض، ضمن ما يعرضه النموذج (أو عائلته لو تغيّر الإصدار) */
  function applyPendingLike(m: ModelRow) {
    const like = pendingLike.current
    // لا يُمسح هنا (StrictMode يعيد الأثر)؛ يُمسح عند اختيار نموذج آخر يدويًا (pickModel)
    if (!like || (like.media.model !== m.id && !(like.family && modelSupports(m).family === like.family))) return
    const s = likeSettings(like.media, { aspectRatios: modelAspectRatios(m), sizes: modelSizes(m) })
    if (s.imageSize) setImageSize(s.imageSize as ImageSize)
    if (s.aspectRatio) setAspectRatio(s.aspectRatio as AspectRatio)
  }

  /** اختيار يدوي للنموذج يلغي المثال المنتظر — إعداداته لا تُفرض على نموذج اختاره المستخدم */
  function pickModel(id: string) {
    pendingLike.current = null
    setModelId(id)
  }

  /** زر "سوّ مثلها" في معرض العائلات: البرومت الآن، والإعدادات عند تحديد النموذج */
  function makeLike(media: ShowcaseMedia, family: string, headId: string) {
    setPrompt(media.prompt)
    pendingLike.current = { media, family }
    const target = models.some((m) => m.id === media.model) ? media.model : headId
    if (model?.id === target) applyPendingLike(model)
    else setModelId(target)
    toast(t('like.applied'))
  }

  const cost = model ? modelCost(model, imageSize) : 0
  const refSpec = model ? modelRefSpec(model) : { min: 0, max: 0, frames: false }
  const canGenerate = Boolean(user && model && prompt.trim().length > 0 && refs.length >= refSpec.min)

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
        ...(refSpec.max > 0 && refs.length ? { images: refs.slice(0, refSpec.max) } : {}),
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
          <h1 className="text-xl font-extrabold">{t('generate.title')}</h1>
          <p className="mt-1 text-sm text-muted">{t('generate.subtitle')}</p>
        </div>

        <ModeTabs modes={modesFor('image')} value={mode} onChange={pickMode} />

        <div>
          <h2 className="mb-2 text-xs font-semibold text-muted">{t('generate.model')}</h2>
          <ModelPicker models={models} loading={modelsLoading} value={model?.id ?? null} onChange={pickModel} defaultCost={defaultImageCost} />
        </div>

        {model && userId && refSpec.max > 0 && <ReferencePicker userId={userId} spec={refSpec} refs={refs} onChange={setRefs} />}

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
            // مساحة فارغة = معرض: مثال حقيقي لكل عائلة، والضغط يختارها
            <div className="flex flex-col gap-4">
              <p className="border-b border-border pb-3 text-sm text-muted">{t('generate.empty')}</p>
              <FamilyGallery models={models} type="image" defaultCost={defaultImageCost} selectedId={model?.id ?? null} onPick={pickModel} onLike={makeLike} />
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
              placeholder={t(mode === 'edit' ? 'generate.editPlaceholder' : 'generate.promptPlaceholder')}
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
