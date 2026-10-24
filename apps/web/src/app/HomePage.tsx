import { ArrowLeft } from 'lucide-react'
import { useMemo } from 'react'
import { Link } from 'react-router-dom'
import { MediaTile } from '@/components/studio/MediaTile'
import { TemplateCover } from '@/components/studio/TemplateIcon'
import { useI18n } from '@/i18n'
import { useAuth } from '@/lib/auth'
import { familyName, groupByFamily, modelDefaults, modelName, modelSupports, useModels, videoCost, type ModelRow } from '@/lib/models'
import { familyMedia, heroShowcase, templateMedia, wallMedia } from '@/lib/showcase'
import { templateCatalog, templateSeason } from '@/lib/templates'
import { cn } from '@/lib/utils'

const defaultVideoCost = (m: ModelRow) => videoCost(m, { duration: modelDefaults(m).duration, resolution: modelDefaults(m).resolution })

/**
 * الرئيسية (دليل الهوية V1 + معرض العرض): العنوان والزر في البداية، وجدار من نتائج حقيقية ولّدتها المنصة في النهاية —
 * الشغل نفسه هو الواجهة. الليموني مرة وحدة (زر البداية)، والتدرّج على كلمة وحدة في العنوان (قاعدة الدليل).
 * بلا معرض بعد (showcase.json فارغ) = نفس العنوان بلا جدار. الحركة الوحيدة: الفيديوهات نفسها وهي ظاهرة.
 */
export function HomePage() {
  const { t, locale } = useI18n()
  const { user } = useAuth()
  const hero = heroShowcase()
  const wall = wallMedia(9)
  const hasWall = Boolean(hero) || wall.length >= 3

  // ثلاثة أعمدة متدرجة: العمود الأوسط ينزل قليلًا حتى لا يبدو جدولًا
  const columns = useMemo(() => [0, 1, 2].map((c) => wall.filter((_, i) => i % 3 === c)), [wall])

  const now = useMemo(() => new Date(), [])
  const featured = useMemo(() => {
    const withMedia = templateCatalog.templates.filter((tpl) => templateMedia(tpl.id))
    const pool = withMedia.length >= 4 ? withMedia : templateCatalog.templates
    const rank = (id: string) => {
      const s = templateSeason(pool.find((x) => x.id === id)!, now)
      return s === 'active' ? 0 : s === 'upcoming' ? 1 : 2
    }
    return [...pool].sort((a, b) => rank(a.id) - rank(b.id)).slice(0, 8)
  }, [now])

  const { models: videoModels } = useModels('video')
  const families = useMemo(() => groupByFamily(videoModels, defaultVideoCost), [videoModels])
  const shownFamilies = families.filter((f) => familyMedia('video', f.key)).slice(0, 6)

  const start = user ? '/image-generate' : '/login'

  return (
    <div className="pt-16">
      <section className={cn('mx-auto grid w-full max-w-7xl gap-10 px-4 md:px-6', hasWall ? 'py-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:items-center lg:py-16' : 'min-h-[calc(100dvh-4rem)] content-center')}>
        <div className="max-w-2xl space-y-7">
          <h1 className="text-5xl leading-[1.05] tracking-tight md:text-6xl xl:text-7xl">
            {t('home.hero1')}
            <br />
            {t('home.hero2')} <span className="text-brand-gradient">{t('home.hero3')}</span>
          </h1>
          <p className="max-w-xl text-lg text-muted">{t('app.tagline')}</p>
          <div className="flex flex-wrap items-center gap-3">
            <Link to={start} className="inline-flex h-12 items-center gap-2 bg-lime px-6 text-base font-medium text-lime-ink transition hover:brightness-95">
              {t('home.cta')} <ArrowLeft className="size-4 ltr:rotate-180" aria-hidden />
            </Link>
            <Link to="/templates" className="inline-flex h-12 items-center border border-text px-6 text-base font-medium text-text transition-colors hover:bg-text hover:text-bg">
              {t('home.templates')}
            </Link>
          </div>
          <p className="border-t border-border pt-4 text-sm text-muted">{t('home.facts')}</p>
        </div>

        {hasWall && (
          <div aria-label={t('home.wallLabel')} className="min-w-0">
            {hero ? (
              // الهيرو المختار كبير، وتحته صف من ثلاثة أمثلة بنفس القص (4:5)
              <div className="flex flex-col gap-2 md:gap-3">
                <MediaTile media={hero} alt={hero.prompt.slice(0, 120)} />
                <div className="grid grid-cols-3 gap-2 md:gap-3">
                  {wall.slice(0, 3).map((w) => (
                    <div key={w.key} className="relative aspect-[4/5] overflow-hidden bg-inverse">
                      <MediaTile media={w.media} alt={w.media.prompt.slice(0, 120)} fill className="absolute inset-0" />
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <>
                {/* جوال: شريط أفقي يُسحب؛ من md: ثلاثة أعمدة متدرجة بارتفاع محدود */}
                <div className="-mx-4 flex snap-x gap-2 overflow-x-auto px-4 pb-1 md:hidden">
                  {wall.map((w) => (
                    <div key={w.key} className="w-[58%] shrink-0 snap-start">
                      <MediaTile media={w.media} alt={w.media.prompt.slice(0, 120)} />
                    </div>
                  ))}
                </div>
                <div className="hidden max-h-[640px] grid-cols-3 gap-3 overflow-hidden md:grid">
                  {columns.map((col, c) => (
                    <div key={c} className={cn('flex flex-col gap-3', c === 1 && 'pt-10')}>
                      {col.map((w) => (
                        <MediaTile key={w.key} media={w.media} alt={w.media.prompt.slice(0, 120)} />
                      ))}
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </section>

      {/* ابدأ من قالب */}
      <section aria-labelledby="home-templates" className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
        <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
          <h2 id="home-templates" className="text-2xl font-extrabold md:text-3xl">
            {t('home.startTemplate')}
          </h2>
          <Link to="/templates" className="shrink-0 text-sm font-medium text-text underline-offset-4 hover:underline">
            {t('home.allTemplates', { n: templateCatalog.templates.length })}
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
          {featured.map((tpl, i) => {
            const cat = templateCatalog.categories.find((c) => c.key === tpl.category)
            const title = locale === 'ar' ? tpl.title_ar : tpl.title_en
            return (
              <Link key={tpl.id} to={`/templates/${tpl.id}`} className={cn('group flex flex-col gap-2', i >= 4 && 'max-sm:hidden')}>
                <TemplateCover category={tpl.category} icon={cat?.icon} media={templateMedia(tpl.id)} alt={title} className="aspect-[4/5] border border-border transition-colors group-hover:border-text" />
                <span className="line-clamp-2 text-sm font-medium leading-snug">{title}</span>
              </Link>
            )
          })}
        </div>
      </section>

      {/* النماذج بنتائجها */}
      {shownFamilies.length > 0 && (
        <section aria-labelledby="home-models" className="mx-auto w-full max-w-7xl px-4 pb-16 md:px-6">
          <div className="mb-4 flex items-end justify-between gap-4 border-b border-border pb-3">
            <div>
              <h2 id="home-models" className="text-2xl font-extrabold md:text-3xl">
                {t('home.models')}
              </h2>
              <p className="mt-1 text-sm text-muted">{t('home.modelsSub', { n: families.length })}</p>
            </div>
            <Link to={user ? '/video-generate' : '/login'} className="shrink-0 text-sm font-medium text-text underline-offset-4 hover:underline">
              {t('home.allModels')}
            </Link>
          </div>
          <div className="grid grid-cols-1 gap-x-3 gap-y-5 sm:grid-cols-2 lg:grid-cols-3">
            {shownFamilies.map((f) => {
              const head = f.models[0]
              const name = f.models.length > 1 ? familyName(head, locale) : modelName(head, locale)
              const lab = modelSupports(head).lab
              return (
                <Link key={f.key} to={user ? `/video-generate?model=${encodeURIComponent(head.id)}` : '/login'} className="group flex flex-col gap-2">
                  <div className="border border-border transition-colors group-hover:border-text">
                    <MediaTile media={familyMedia('video', f.key)!} alt={name} />
                  </div>
                  <span className="flex items-baseline justify-between gap-3">
                    <span className="text-base font-semibold">
                      {name}
                      {lab && <span className="ms-2 font-mono text-xs font-normal text-muted">{lab}</span>}
                    </span>
                    <span className="font-latin text-xs tabular-nums text-muted">{t('generate.fromCost', { n: f.fromCost })}</span>
                  </span>
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </div>
  )
}
