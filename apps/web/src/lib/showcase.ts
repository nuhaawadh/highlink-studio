import raw from '@content/showcase/showcase.json'
import { familyKey, heroMedia, LIKE_HERO, likeMedia, likeSettings, type ShowcaseFile, type ShowcaseMedia } from '@shared/showcase'
import {
  modelAspectRatios,
  modelAudioFree,
  modelCost,
  modelDefaults,
  modelDurations,
  modelHasAudio,
  modelResolutions,
  modelSizes,
  videoCost,
  type ModelRow,
} from '@/lib/models'

/** معرض العرض المولَّد من المنصة (content/showcase/showcase.json — يكتبه scripts/make-showcase.ts). فارغ = الواجهة تعرض البديل النصي. */
export const showcase = raw as unknown as ShowcaseFile

export function templateMedia(id: string): ShowcaseMedia | null {
  return showcase.templates[id] ?? null
}

export function familyMedia(type: string, family: string): ShowcaseMedia | null {
  return showcase.families[familyKey(type, family)] ?? null
}

export function heroShowcase(): ShowcaseMedia | null {
  return heroMedia(showcase)
}

/** جدار الرئيسية: فيديوهات العائلات أولًا ثم الصور، بترتيب الملف — يُقطع حسب العدد المطلوب */
export function wallMedia(limit: number): Array<{ key: string; media: ShowcaseMedia }> {
  const entries = Object.entries(showcase.families).map(([key, media]) => ({ key, media }))
  const videos = entries.filter((e) => e.media.kind === 'video')
  const images = entries.filter((e) => e.media.kind === 'image')
  // تناوب فيديو/صورة حتى لا تتكدس الصور في عمود واحد
  const out: Array<{ key: string; media: ShowcaseMedia }> = []
  for (let i = 0; out.length < limit && (i < videos.length || i < images.length); i++) {
    if (videos[i]) out.push(videos[i])
    if (images[i] && out.length < limit) out.push(images[i])
  }
  return out
}

/** "سوّ مثلها": ?like=<مفتاح> في رابط الصفحة الحالية → المثال، أو null */
export function likeFromUrl(): { key: string; media: ShowcaseMedia } | null {
  const key = new URLSearchParams(window.location.search).get('like')
  const media = likeMedia(showcase, key)
  return key && media ? { key, media } : null
}

/** رابط "سوّ مثلها" لمثال عائلة أو للهيرو — صفحة التوليد بنوعه، والبرومت والنموذج والإعدادات تُعبّأ هناك */
export function likeHref(key: string, kind: ShowcaseMedia['kind']): string {
  return `/${kind === 'video' ? 'video' : 'image'}-generate?like=${encodeURIComponent(key)}`
}

/**
 * تكلفة "سوّ مثلها" كما ستظهر على زر التوليد: إعدادات المثال المعروضة فوق افتراض الصفحة، وصوت الصفحة الافتراضي
 * (المجاني مفعّل، المدفوع مطفأ) — نفس ما تفعله صفحتا التوليد. نموذج المثال ليس في القائمة = null (لا نعرض رقمًا لا يطابق).
 */
export function likeCost(media: ShowcaseMedia, models: ModelRow[]): number | null {
  const m = models.find((x) => x.id === media.model)
  if (!m) return null
  const d = modelDefaults(m)
  if (media.kind === 'video') {
    const durs = modelDurations(m)
    const ress = modelResolutions(m)
    const s = likeSettings(media, { aspectRatios: modelAspectRatios(m), durations: durs, resolutions: ress })
    const duration = s.duration ?? (d.duration && durs.includes(d.duration) ? d.duration : (durs[0] ?? 5))
    const resolution = s.resolution ?? (d.resolution && ress.includes(d.resolution) ? d.resolution : ress[0])
    const cost = videoCost(m, { duration, resolution, audio: modelHasAudio(m) ? modelAudioFree(m) : undefined })
    return cost > 0 ? cost : null
  }
  const sizes = modelSizes(m)
  const s = likeSettings(media, { aspectRatios: modelAspectRatios(m), sizes })
  const size = s.imageSize ?? (d.imageSize && sizes.includes(d.imageSize) ? d.imageSize : sizes[0])
  const cost = size ? modelCost(m, size as Parameters<typeof modelCost>[1]) : 0
  return cost > 0 ? cost : null
}

export { LIKE_HERO }
