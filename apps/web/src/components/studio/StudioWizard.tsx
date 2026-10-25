import { useMemo, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { Check, ImageUp, Loader2 } from 'lucide-react'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAssets, GenerateError, requestGeneration, useAssets, type AssetRow } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import type { StudioRecipe } from '@/lib/studios'
import { checkReferenceFile, uploadReference, UploadError, type UploadErrorCode } from '@/lib/uploads'
import { cn } from '@/lib/utils'

/**
 * معالج الاستوديو العام (المخطط §8، ADR 0006) — تقوده الوصفة كلها، لا كود لكل استوديو (القاعدة 6):
 *   1) صورة المنتج (رفع إلى up/{uid}/)  2) المشهد: بطاقة preset أو وصف حر + نص عربي اختياري
 *   3) المقاسات بتكلفة كل مقاس والإجمالي على الزر قبل البدء  4) النتائج مجمّعة بالتشغيل عبر Realtime.
 * التدفق (القاعدة 1): صفوف queued بنفس run_id → generate-media مرة واحدة → Realtime. لا polling.
 */
export function StudioWizard({ recipe, costEach, preview }: { recipe: StudioRecipe; costEach: number; preview: boolean }) {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const { assets, upsertLocal } = useAssets(userId, { type: 'image', limit: 60 })
  const fileInput = useRef<HTMLInputElement>(null)

  const [refUrl, setRefUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [preset, setPreset] = useState(recipe.defaults.preset)
  const [scene, setScene] = useState('')
  const [text, setText] = useState('')
  const [selected, setSelected] = useState<string[]>(() => recipe.outputs.filter((o) => o.default).map((o) => o.key))
  const [busy, setBusy] = useState(false)

  const total = costEach * selected.length
  const presetName = (k: string) => (locale === 'ar' ? recipe.presets[k]?.ar : recipe.presets[k]?.en) ?? k

  // نتائج هذا الاستوديو: أصول لها run_id، مجمّعة بالتشغيل، الأحدث أولًا
  const runs = useMemo(() => {
    const groups = new Map<string, AssetRow[]>()
    for (const a of assets) {
      if (!a.run_id || a.feature_tag !== 'product') continue
      const g = groups.get(a.run_id) ?? []
      g.push(a)
      groups.set(a.run_id, g)
    }
    return [...groups.entries()]
      .map(([id, list]) => ({ id, list: list.sort((x, y) => x.id.localeCompare(y.id)), at: list.reduce((m, a) => (a.created_at > m ? a.created_at : m), '') }))
      .sort((a, b) => b.at.localeCompare(a.at))
  }, [assets])

  const uploadMessage: Record<UploadErrorCode, string> = {
    too_large: t('studio.tooLarge'),
    bad_type: t('studio.badType'),
    failed: t('studio.uploadFailed'),
  }

  async function onFile(file: File | undefined) {
    if (!file || !userId) return
    const problem = checkReferenceFile(file)
    if (problem) {
      toast.error(uploadMessage[problem])
      return
    }
    setUploading(true)
    try {
      setRefUrl(await uploadReference(userId, file))
    } catch (e) {
      toast.error(e instanceof UploadError ? uploadMessage[e.code] : t('studio.uploadFailed'))
    } finally {
      setUploading(false)
    }
  }

  function onDrop(e: DragEvent<HTMLButtonElement>) {
    e.preventDefault()
    setDragOver(false)
    void onFile(e.dataTransfer.files?.[0])
  }

  function toggleOutput(key: string) {
    setSelected((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))
  }

  async function onStart() {
    if (!userId) return
    if (!refUrl) return toast.error(t('studio.needImage'))
    if (selected.length === 0) return toast.error(t('studio.needOutput'))
    setBusy(true)
    try {
      const runId = crypto.randomUUID()
      const outputs = recipe.outputs.filter((o) => selected.includes(o.key))
      const display = scene.trim() ? `${presetName(preset)} — ${scene.trim()}` : presetName(preset)
      const rows = await createQueuedAssets(
        outputs.map((o) => ({
          userId,
          type: 'image' as const,
          model: `studio:${recipe.id}`,
          prompt: display,
          aspectRatio: o.aspect_ratio,
          resolution: recipe.defaults.resolution,
          featureTag: 'product' as const,
          runId,
        })),
      )
      rows.forEach(upsertLocal)
      const res = await requestGeneration({
        assetId: rows[0].id,
        model: `studio:${recipe.id}`,
        prompt: display,
        images: [refUrl],
        feature_tag: 'product',
        locale,
        // سقف الإنفاق = الإجمالي الذي رآه المستخدم على الزر
        maxCredits: total,
        studio: {
          preset,
          scene: scene.trim() || undefined,
          text: text.trim() || undefined,
          outputs: rows.map((r, i) => ({ assetId: r.id, key: outputs[i].key })),
        },
      })
      toast.success(t('studio.started', { n: res.cost }))
    } catch (e) {
      if (e instanceof GenerateError) {
        const key = `errors.${e.code}`
        const translated = t(key)
        toast.error(locale === 'ar' || translated === key ? e.message : translated)
      } else {
        console.error('[studio]', e)
        toast.error(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-8">
      {preview && <p className="border border-border bg-surface px-3 py-2 text-xs text-muted">{t('studio.preview')}</p>}

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
        {/* 1) صورة المنتج */}
        <section aria-labelledby="studio-step-1" className="flex flex-col gap-3">
          <h2 id="studio-step-1" className="text-sm font-bold">
            <span className="font-latin">1</span> · {t('studio.step1')}
          </h2>
          <button
            type="button"
            onClick={() => fileInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault()
              setDragOver(true)
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
            disabled={uploading}
            className={cn(
              'relative flex aspect-square w-full flex-col items-center justify-center gap-3 overflow-hidden border border-dashed bg-surface p-6 text-center text-sm text-muted transition-colors',
              dragOver ? 'border-text bg-text/5' : 'border-border hover:border-text',
            )}
          >
            {refUrl ? (
              <>
                <img src={refUrl} alt={t('studio.step1')} className="absolute inset-0 size-full object-contain" />
                <span className="absolute inset-x-0 bottom-0 bg-inverse/80 py-2 text-xs text-inverse-ink">{t('studio.replace')}</span>
              </>
            ) : uploading ? (
              <>
                <Loader2 className="size-6 animate-spin" aria-hidden />
                {t('studio.uploading')}
              </>
            ) : (
              <>
                <ImageUp className="size-8" aria-hidden />
                {t('studio.uploadHint')}
              </>
            )}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              void onFile(e.target.files?.[0])
              e.target.value = ''
            }}
          />
        </section>

        <div className="flex flex-col gap-6">
          {/* 2) المشهد */}
          <section aria-labelledby="studio-step-2" className="flex flex-col gap-3">
            <h2 id="studio-step-2" className="text-sm font-bold">
              <span className="font-latin">2</span> · {t('studio.step2')}
            </h2>
            <div role="radiogroup" aria-labelledby="studio-step-2" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {Object.entries(recipe.presets).map(([key, p]) => {
                const on = key === preset
                return (
                  <button
                    key={key}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setPreset(key)}
                    className={cn(
                      'flex min-h-20 flex-col items-start gap-1 border p-3 text-start transition-colors',
                      on ? 'border-text bg-text text-bg' : 'border-border bg-bg hover:border-text',
                    )}
                  >
                    <span className="text-sm font-bold">{locale === 'ar' ? p.ar : p.en}</span>
                    <span className={cn('text-[11px] leading-snug', on ? 'text-bg/80' : 'text-muted')}>{p.desc_ar}</span>
                  </button>
                )
              })}
            </div>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('studio.sceneLabel')}
              <Textarea rows={2} maxLength={recipe.limits.scene_max} value={scene} onChange={(e) => setScene(e.target.value)} placeholder={t('studio.scenePlaceholder')} />
            </label>
            <label className="flex flex-col gap-1 text-xs text-muted">
              {t('studio.textLabel')}
              <input
                type="text"
                maxLength={recipe.limits.text_max}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={t('studio.textPlaceholder')}
                className="h-10 border border-border bg-bg px-3 text-sm text-text outline-none placeholder:text-muted focus:border-text"
              />
              <span>{t('studio.textHint')}</span>
            </label>
          </section>

          {/* 3) المقاسات */}
          <section aria-labelledby="studio-step-3" className="flex flex-col gap-3">
            <h2 id="studio-step-3" className="text-sm font-bold">
              <span className="font-latin">3</span> · {t('studio.step3')}
            </h2>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {recipe.outputs.map((o) => {
                const on = selected.includes(o.key)
                return (
                  <button
                    key={o.key}
                    type="button"
                    role="checkbox"
                    aria-checked={on}
                    onClick={() => toggleOutput(o.key)}
                    className={cn('flex items-center gap-2 border p-2.5 text-start transition-colors', on ? 'border-text' : 'border-border hover:border-text')}
                  >
                    <span className={cn('flex size-4 shrink-0 items-center justify-center border', on ? 'border-text bg-text text-bg' : 'border-border')}>
                      {on && <Check className="size-3" aria-hidden />}
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium">{locale === 'ar' ? o.ar : o.en}</span>
                      <span className="block text-[11px] text-muted">
                        <span className="font-latin">{o.aspect_ratio}</span> · {t('credits.n', { n: costEach })}
                      </span>
                    </span>
                  </button>
                )
              })}
            </div>
            <CreditCostButton cost={total} balance={balance} busy={busy} disabled={!refUrl || selected.length === 0 || uploading} onClick={() => void onStart()} />
            <p className="text-center text-xs text-muted">{t('studio.chargeNote', { n: selected.length, each: costEach })}</p>
          </section>
        </div>
      </div>

      {/* 4) النتائج */}
      <section aria-labelledby="studio-results" className="flex flex-col gap-4">
        <h2 id="studio-results" className="text-sm font-bold">
          {t('studio.results')}
        </h2>
        {runs.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center border border-dashed border-border p-6 text-center text-sm text-muted">{t('studio.empty')}</div>
        ) : (
          runs.map((run) => (
            <div key={run.id} data-testid="studio-run" className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              {run.list.map((a) => (
                <AssetCard key={a.id} asset={a} />
              ))}
            </div>
          ))
        )}
      </section>
    </div>
  )
}
