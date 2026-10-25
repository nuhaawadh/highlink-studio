import { describe, expect, it } from 'vitest'
import { modelRefSpec, modelsForMode, type ModelRow } from './models'

/** الخطوة 5 (رفع المراجع في التوليد الحر): كل وضع يعرض أنواعه فقط، ومواصفة المراجع من supports. */
const row = (id: string, type: 'image' | 'video', supports: Record<string, unknown>): ModelRow =>
  ({ id, type, supports, default_params: {}, enabled: true, name_ar: id, name_en: id, provider: 'fal', provider_slug: id, cost_credits: 5 }) as unknown as ModelRow

const all = [
  row('nano', 'image', { kind: 't2i', ref_images: 14 }),
  row('nano-edit', 'image', { kind: 'edit', requires_ref: true, ui: false, ref_images: 16 }),
  row('vto', 'image', { kind: 'vto', requires_ref: true, ui: false, min_refs: 2 }),
  row('hidden-t2i', 'image', { kind: 't2i', ui: false }),
  row('kling', 'video', { kind: 't2v' }),
  row('kling-i2v', 'video', { kind: 'i2v', requires_ref: true, ui: false, ref_images: 2, min_refs: 1 }),
  row('veo-flf', 'video', { kind: 'flf2v', requires_ref: true, ui: false, ref_images: 2, min_refs: 2 }),
  row('kling-ref', 'video', { kind: 'ref2v', requires_ref: true, ui: false, ref_images: 10, min_refs: 1 }),
  row('transition', 'video', { kind: 'transition', requires_ref: true, ui: false, min_refs: 2 }),
]

describe('modelsForMode', () => {
  it('من نص: كما كان — ما لا يحتاج مراجع ولم يُخفَ', () => {
    expect(modelsForMode(all, 'image', 'text').map((m) => m.id)).toEqual(['nano'])
    expect(modelsForMode(all, 'video', 'text').map((m) => m.id)).toEqual(['kling'])
  })
  it('تعديل صورة: نماذج edit فقط (لا vto ولا غيرها)', () => {
    expect(modelsForMode(all, 'image', 'edit').map((m) => m.id)).toEqual(['nano-edit'])
  })
  it('من صورة: i2v وflf2v؛ بمراجع: ref2v — والانتقال وغيره خارجها', () => {
    expect(modelsForMode(all, 'video', 'image').map((m) => m.id)).toEqual(['kling-i2v', 'veo-flf'])
    expect(modelsForMode(all, 'video', 'refs').map((m) => m.id)).toEqual(['kling-ref'])
  })
  it('وضع لا يخص النوع يرجع فارغًا', () => {
    expect(modelsForMode(all, 'image', 'refs')).toEqual([])
    expect(modelsForMode(all, 'video', 'edit')).toEqual([])
  })
})

describe('modelRefSpec', () => {
  const by = (id: string) => all.find((m) => m.id === id)!
  it('تعديل صورة: مطلوبة واحدة على الأقل، والحد الأعلى 4 في الواجهة', () => {
    expect(modelRefSpec(by('nano-edit'))).toEqual({ min: 1, max: 4, frames: false })
  })
  it('صورة→فيديو: الإطار الأول مطلوب والأخير اختياري', () => {
    expect(modelRefSpec(by('kling-i2v'))).toEqual({ min: 1, max: 2, frames: true })
  })
  it('أول وآخر إطار: صورتان مطلوبتان', () => {
    expect(modelRefSpec(by('veo-flf'))).toEqual({ min: 2, max: 2, frames: true })
  })
  it('بمراجع: حتى 4 في الواجهة', () => {
    expect(modelRefSpec(by('kling-ref'))).toEqual({ min: 1, max: 4, frames: false })
  })
  it('من نص بلا مراجع: لا شيء', () => {
    expect(modelRefSpec(by('kling'))).toEqual({ min: 0, max: 0, frames: false })
  })
})
