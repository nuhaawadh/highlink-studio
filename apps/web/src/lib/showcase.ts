import raw from '@content/showcase/showcase.json'
import { familyKey, heroMedia, type ShowcaseFile, type ShowcaseMedia } from '@shared/showcase'

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
