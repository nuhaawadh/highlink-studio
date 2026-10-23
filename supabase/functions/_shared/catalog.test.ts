import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { buildProviderInput } from './inputs'
import { modelCredits } from './pricing'
import type { GenerateConfig, ModelRow } from './types'

/**
 * حارس الكتالوج المولّد (ADR 0005): كل نموذج مفعّل في content/catalog/models.generated.json (نفس صفوف seed.sql)
 * يجب أن يبني مدخلات مزوّد صالحة لكل خيار تعرضه الواجهة/الـAPI (كل مدة، دقة، قياس، حجم، صوت)، بلا حقل مطلوب ناقص،
 * وبتكلفة موجبة. يفشل هنا قبل أن يرفض المزوّد الطلب بعد حجز الرصيد. أعد التوليد: python -I scripts/build-models-seed.py
 */
type GeneratedRow = ModelRow & { name_ar: string; kind: string }
const file = path.resolve(import.meta.dirname, '../../../content/catalog/models.generated.json')
const rows: GeneratedRow[] = JSON.parse(readFileSync(file, 'utf8')).models.map((r: GeneratedRow) => ({ ...r, provider: 'fal' }))
const enabled = rows.filter((r) => r.enabled)

function configsFor(r: GeneratedRow): GenerateConfig[] {
  const s = r.supports as Record<string, unknown>
  const list = (k: string) => (Array.isArray(s[k]) ? (s[k] as unknown[]) : [])
  const out: GenerateConfig[] = [{}]
  if (r.type === 'video') {
    for (const duration of list('durations')) out.push({ duration: duration as number })
    for (const resolution of list('resolutions')) out.push({ resolution: resolution as string })
    if (s.audio === true) out.push({ audio: true })
  } else {
    for (const imageSize of list('sizes')) out.push({ imageSize: imageSize as GenerateConfig['imageSize'] })
  }
  for (const aspectRatio of list('aspect_ratios')) out.push({ aspectRatio: aspectRatio as GenerateConfig['aspectRatio'] })
  return out
}

describe('الكتالوج المولّد — كل خيار معروض يبني طلبًا صالحًا', () => {
  it('فيه نماذج مفعّلة من الصور والفيديو', () => {
    expect(enabled.filter((r) => r.type === 'image').length).toBeGreaterThan(20)
    expect(enabled.filter((r) => r.type === 'video').length).toBeGreaterThan(20)
    expect(new Set(rows.map((r) => r.id)).size).toBe(rows.length)
  })

  it.each(enabled.map((r) => [r.id, r] as const))('%s', (_id, r) => {
    const s = r.supports as Record<string, unknown>
    const refs = s.requires_ref ? ['https://x.test/a.png', 'https://x.test/b.png'] : undefined
    const required = ((r.input_schema as { required?: string[] } | null)?.required ?? []) as string[]
    for (const c of configsFor(r)) {
      const { input, invalid } = buildProviderInput(r, 'اختبار', refs, c)
      expect(invalid, JSON.stringify(c)).toEqual([])
      for (const k of required) expect(input, `${JSON.stringify(c)} required ${k}`).toHaveProperty(k)
      expect(modelCredits(r, c), JSON.stringify(c)).toBeGreaterThan(0)
    }
  })
})
