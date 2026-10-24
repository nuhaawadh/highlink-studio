import raw from '@content/showcase/campaigns.json'
import type { CampaignDef, CampaignsFile } from '@shared/showcase'
import { Link } from 'react-router-dom'
import { MediaTile } from '@/components/studio/MediaTile'
import { useI18n } from '@/i18n'
import type { ModelRow } from '@/lib/models'
import { templateMedia } from '@/lib/showcase'
import { findTemplate, tierCost, tiersFor } from '@/lib/templates'
import { cn } from '@/lib/utils'

const file = raw as unknown as CampaignsFile

/**
 * "حملة كاملة لقطاعك" (الرئيسية — جواب "إعلانات احترافية مثل هيغز فيلد"): لكل قطاع ريل + بوستر بنص عربي + صورة منتج،
 * كلها نتائج حقيقية من قوالبنا بالمستوى المكتوب في showcase_tiers. كل قطعة رابط لقالبها بنفس المستوى (?tier=)،
 * فالعميل يولّد مثلها بنفس السعر المعروض. حملة بلا ريل مولَّد بعد لا تظهر.
 */
export function CampaignsSection({ models }: { models: Map<string, ModelRow> }) {
  const { t, locale } = useI18n()
  const ready = file.campaigns.filter((c) => templateMedia(c.video))
  if (!ready.length) return null

  return (
    <section aria-labelledby="home-campaigns" className="mx-auto w-full max-w-7xl px-4 py-10 md:px-6">
      <div className="mb-5 border-b border-border pb-3">
        <h2 id="home-campaigns" className="text-2xl font-extrabold md:text-3xl">
          {t('campaigns.title')}
        </h2>
        <p className="mt-1 max-w-2xl text-sm text-muted">{t('campaigns.subtitle')}</p>
      </div>
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 md:grid-cols-2">
        {ready.map((c) => (
          <CampaignCard key={c.id} c={c} models={models} title={locale === 'ar' ? c.title_ar : c.title_en} />
        ))}
      </div>
    </section>
  )
}

function piece(id: string, kind: 'video' | 'text' | 'photo', models: Map<string, ModelRow>) {
  const tpl = findTemplate(id)
  const tierKey = file.showcase_tiers[kind]
  const tier = tpl ? (tiersFor(tpl).find((x) => x.key === tierKey) ?? tiersFor(tpl)[0]) : undefined
  const cost = tpl && tier ? tierCost(tpl, tier, models) : null
  return { tpl, tier, cost, media: templateMedia(id), href: tpl ? `/templates/${tpl.id}${tier ? `?tier=${tier.key}` : ''}` : '/templates' }
}

function CampaignCard({ c, models, title }: { c: CampaignDef; models: Map<string, ModelRow>; title: string }) {
  const { t, locale } = useI18n()
  const reel = piece(c.video, 'video', models)
  const poster = piece(c.poster, 'text', models)
  const photo = piece(c.photo, 'photo', models)
  const total = [reel, poster, photo].reduce<number | null>((a, p) => (a == null || p.cost == null ? null : a + p.cost), 0)
  const wide = reel.media?.aspect === '16:9'
  const label = (p: typeof reel) => (p.tpl ? (locale === 'ar' ? p.tpl.title_ar : p.tpl.title_en) : '')

  const still = (p: typeof reel, name: string) => (
    <Link to={p.href} className="group relative block h-full min-h-0 overflow-hidden border border-border bg-inverse" aria-label={`${name}: ${label(p)}`}>
      {p.media ? (
        <MediaTile media={p.media} alt={label(p)} fill className="absolute inset-0" />
      ) : (
        <span className="absolute inset-0 flex items-end p-3 text-sm font-semibold text-inverse-ink">{label(p)}</span>
      )}
      <span className="absolute inset-x-0 bottom-0 bg-inverse px-2 py-1 text-[11px] font-medium text-inverse-ink">{name}</span>
    </Link>
  )

  return (
    <article className="flex flex-col gap-3">
      <div className={cn('grid gap-2', wide ? 'grid-cols-2 grid-rows-[auto_auto]' : 'grid-cols-[1.15fr_1fr]')}>
        <Link
          to={reel.href}
          className={cn('group relative block overflow-hidden border border-border bg-inverse', wide && 'col-span-2')}
          aria-label={`${t('campaigns.reel')}: ${label(reel)}`}
        >
          <MediaTile media={reel.media!} alt={label(reel)} />
          <span className="absolute inset-x-0 bottom-0 bg-inverse px-2 py-1 text-[11px] font-medium text-inverse-ink">{t('campaigns.reel')}</span>
        </Link>
        {wide ? (
          <>
            <div className="aspect-[4/5]">{still(poster, t('campaigns.poster'))}</div>
            <div className="aspect-[4/5]">{still(photo, t('campaigns.photo'))}</div>
          </>
        ) : (
          <div className="grid min-h-0 grid-rows-2 gap-2">
            {still(poster, t('campaigns.poster'))}
            {still(photo, t('campaigns.photo'))}
          </div>
        )}
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-lg font-extrabold">{title}</h3>
          <p className="text-xs text-muted">{t('campaigns.pieces')}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {total != null && total > 0 && <span className="font-latin text-xs tabular-nums text-muted">{t('campaigns.total', { n: total })}</span>}
          <Link to={`/templates?c=${c.category}`} className="text-sm font-medium text-text underline-offset-4 hover:underline">
            {t('campaigns.cta')}
          </Link>
        </div>
      </div>
    </article>
  )
}
