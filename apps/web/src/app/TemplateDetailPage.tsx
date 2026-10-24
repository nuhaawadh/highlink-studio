import { ArrowRight } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { Link, useNavigate, useParams } from 'react-router-dom'
import { toast } from 'sonner'
import { missingFields, renderTemplatePrompt, type TemplateField } from '@shared/templates'
import { AssetCard } from '@/components/studio/AssetCard'
import { CreditCostButton } from '@/components/studio/CreditCostButton'
import { MediaTile } from '@/components/studio/MediaTile'
import { OptionChips } from '@/components/studio/OptionChips'
import { TemplateCover } from '@/components/studio/TemplateIcon'
import { Textarea } from '@/components/ui/textarea'
import { useI18n } from '@/i18n'
import { createQueuedAsset, GenerateError, requestGeneration, useAssets } from '@/lib/assets'
import { useAuth } from '@/lib/auth'
import { useCredits } from '@/lib/credits'
import { env } from '@/lib/env'
import { useModels } from '@/lib/models'
import { templateMedia } from '@/lib/showcase'
import { findTemplate, seasonName, templateCatalog, tierCost, tiersFor, useModelMap } from '@/lib/templates'
import { cn } from '@/lib/utils'

/**
 * صفحة القالب (/templates/:id): حقول قليلة بالعربي + مستوى الجودة (اقتصادي/متوازن/سينمائي) بدل اسم النموذج،
 * والتكلفة على الزر قبل الضغط. البرومبت الإنجليزي المهندَس يُبنى من القالب (renderTemplatePrompt) ويمر بالتدفق المعتاد
 * (CLAUDE.md القاعدة 1): صف queued → generate-media → Realtime. لا منطق مال هنا — التسعير modelCredits على السيرفر.
 */
export function TemplateDetailPage() {
  const { id } = useParams()
  const tpl = findTemplate(id)
  const { t, locale } = useI18n()
  const navigate = useNavigate()
  const { user } = useAuth()
  const userId = user?.id ?? null
  const { balance } = useCredits(userId)
  const { allModels: imageModels, loading: l1 } = useModels('image')
  const { allModels: videoModels, loading: l2 } = useModels('video')
  const models = useModelMap(imageModels, videoModels)
  const type = tpl?.tier_set === 'video' ? 'video' : 'image'
  const { assets, upsertLocal } = useAssets(userId, { type, limit: 6 })

  const tiers = useMemo(() => (tpl ? tiersFor(tpl) : []), [tpl])
  const available = useMemo(() => tiers.filter((tier) => tpl && tierCost(tpl, tier, models) != null), [tiers, tpl, models])
  const [tierKey, setTierKey] = useState<string | null>(null)
  const tier = available.find((x) => x.key === tierKey) ?? available[Math.min(1, available.length - 1)] ?? null
  const [values, setValues] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    if (tpl) document.title = `${locale === 'ar' ? tpl.title_ar : tpl.title_en} — ${env.VITE_APP_NAME}`
  }, [tpl, locale])

  if (!tpl) {
    return (
      <section className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-24 text-center">
        <p className="text-sm text-muted">{t('templates.notFound')}</p>
        <Link to="/templates" className="text-sm text-brand underline underline-offset-4">
          {t('templates.back')}
        </Link>
      </section>
    )
  }

  const category = templateCatalog.categories.find((c) => c.key === tpl.category)
  const cost = tier ? (tierCost(tpl, tier, models) ?? 0) : 0
  const missing = missingFields(tpl, values)
  const prompt = renderTemplatePrompt(tpl, values)
  const loadingModels = l1 || l2
  const canGenerate = Boolean(tier && cost > 0 && missing.length === 0)

  async function onGenerate() {
    if (!tpl || !tier) return
    if (!user) {
      navigate('/login', { state: { from: `/templates/${tpl.id}` } })
      return
    }
    if (missing.length) return
    setBusy(true)
    try {
      const asset = await createQueuedAsset({
        userId: user.id,
        type,
        model: tier.model,
        prompt,
        aspectRatio: tpl.aspect_ratio,
        resolution: tpl.tier_set === 'video' ? tier.resolution : tier.imageSize,
        featureTag: 'general',
      })
      upsertLocal(asset)
      const res = await requestGeneration({
        assetId: asset.id,
        model: tier.model,
        prompt,
        config:
          tpl.tier_set === 'video'
            ? { aspectRatio: tpl.aspect_ratio, duration: tpl.duration, resolution: tier.resolution }
            : { aspectRatio: tpl.aspect_ratio, imageSize: tier.imageSize },
        feature_tag: 'general',
        locale,
        template: tpl.id,
        // سقف الإنفاق = ما رآه المستخدم على الزر
        maxCredits: cost,
      })
      toast.success(t('generate.started', { n: res.cost }))
    } catch (e) {
      if (e instanceof GenerateError) {
        const key = `errors.${e.code}`
        const translated = t(key)
        toast.error(locale === 'ar' || translated === key ? e.message : translated)
      } else {
        console.error('[generate:template]', e)
        toast.error(t('errors.generic'))
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 md:flex-row md:gap-8 md:py-10">
      <div className="flex w-full shrink-0 flex-col gap-5 md:w-96">
        <Link to="/templates" className="inline-flex items-center gap-1 text-xs text-muted hover:text-text">
          <ArrowRight className="size-3.5 ltr:rotate-180" aria-hidden />
          {t('templates.back')}
        </Link>

        <div className="overflow-hidden rounded-[var(--radius-lg)] border border-border">
          {/* مثال حقيقي بنفس قياس القالب إن وُلّد، وإلا شريط الأيقونة */}
          {templateMedia(tpl.id) ? (
            <MediaTile media={templateMedia(tpl.id)!} alt={locale === 'ar' ? tpl.title_ar : tpl.title_en} className="max-h-[420px] object-contain" />
          ) : (
            <TemplateCover category={tpl.category} icon={category?.icon} className="h-32" />
          )}
          <div className="space-y-1 p-4">
            <p className="text-xs text-muted">
              {locale === 'ar' ? category?.ar : category?.en}
              {tpl.season && <> · {seasonName(tpl.season, locale)}</>} · {t(`templates.kind.${tpl.tier_set}`)} · <span className="font-latin">{tpl.aspect_ratio}</span>
              {tpl.duration ? <> · {t('video.seconds', { n: tpl.duration })}</> : null}
            </p>
            <h1 className="text-xl font-extrabold">{locale === 'ar' ? tpl.title_ar : tpl.title_en}</h1>
            <p className="text-sm text-muted">{locale === 'ar' ? tpl.desc_ar : tpl.desc_en}</p>
          </div>
        </div>

        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault()
            void onGenerate()
          }}
        >
          {tpl.fields.map((f) => (
            <FieldInput key={f.key} field={f} value={values[f.key] ?? ''} onChange={(v) => setValues((s) => ({ ...s, [f.key]: v }))} />
          ))}

          {available.length > 1 && tier && (
            <div>
              <h2 className="mb-2 text-xs font-semibold text-muted">{t('templates.quality')}</h2>
              <OptionChips
                label={t('templates.quality')}
                options={available.map((x) => x.key)}
                value={tier.key}
                format={(k) => {
                  const x = available.find((y) => y.key === k)
                  return x ? (locale === 'ar' ? x.ar : x.en) : k
                }}
                costFor={(k) => tierCost(tpl, available.find((y) => y.key === k)!, models) ?? 0}
                onChange={setTierKey}
              />
            </div>
          )}

          {!loadingModels && available.length === 0 && <p className="text-sm text-danger">{t('templates.unavailable')}</p>}
          {missing.length > 0 && <p className="text-xs text-muted">{t('templates.required')}</p>}

          <CreditCostButton cost={cost} balance={user ? balance : null} busy={busy} disabled={!canGenerate} onClick={() => void onGenerate()} />
          {!user && <p className="text-center text-xs text-muted">{t('templates.needsLogin')}</p>}

          <details className="rounded-[var(--radius-sm)] border border-border p-3 text-xs text-muted">
            <summary className="cursor-pointer select-none font-semibold">{t('templates.promptPreview')}</summary>
            <p dir="ltr" className="mt-2 whitespace-pre-wrap break-words font-mono leading-relaxed">
              {prompt}
            </p>
          </details>
        </form>
      </div>

      <div className="min-w-0 flex-1">
        <h2 className="mb-3 text-sm font-semibold text-muted">{t('templates.results')}</h2>
        {assets.length === 0 ? (
          <div className="flex min-h-48 items-center justify-center rounded-[var(--radius-lg)] border border-dashed border-border p-8 text-center text-sm text-muted">
            {t('templates.empty')}
          </div>
        ) : (
          <div className={cn('grid gap-3', type === 'video' ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-2 lg:grid-cols-3')}>
            {assets.map((a) => (
              <AssetCard key={a.id} asset={a} />
            ))}
          </div>
        )}
      </div>
    </section>
  )
}

function FieldInput({ field, value, onChange }: { field: TemplateField; value: string; onChange: (v: string) => void }) {
  const { locale } = useI18n()
  const label = locale === 'ar' ? field.label_ar : field.label_en
  const placeholder = (locale === 'ar' ? field.placeholder_ar : field.placeholder_en) ?? field.default ?? ''

  if (field.kind === 'choice' && field.options) {
    const current = value || field.default || field.options[0].value
    return (
      <div>
        <h2 className="mb-2 text-xs font-semibold text-muted">{label}</h2>
        <OptionChips
          label={label}
          options={field.options.map((o) => o.value)}
          value={current}
          format={(v) => {
            const o = field.options!.find((x) => x.value === v)
            return o ? (locale === 'ar' ? o.ar : o.en) : v
          }}
          onChange={onChange}
        />
      </div>
    )
  }

  return (
    <label className="flex flex-col gap-1.5 text-sm">
      <span className="text-xs font-semibold text-muted">
        {label}
        {field.required && <span className="text-danger"> *</span>}
      </span>
      {field.max > 40 ? (
        <Textarea rows={2} maxLength={field.max} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          type="text"
          maxLength={field.max}
          value={value}
          placeholder={placeholder}
          onChange={(e) => onChange(e.target.value)}
          className="h-10 rounded-[var(--radius-sm)] border border-border bg-bg px-3 text-sm outline-none placeholder:text-muted/60 focus:border-brand"
        />
      )}
      <span className="self-end font-latin text-[10px] tabular-nums text-muted">
        {value.length}/{field.max}
      </span>
    </label>
  )
}
