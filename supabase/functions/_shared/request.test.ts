import { describe, expect, it } from 'vitest'
import { GenerateRequestSchema } from './request'

/** مخطط طلب generate-media (CLAUDE.md القاعدة 10) — الأمن في الحدود: روابط https فقط، سقف إنفاق موجب. */
const base = { assetId: '6f1b7c2e-3d4a-4b5c-9d8e-7f6a5b4c3d2e', model: 'nano-banana-pro', prompt: 'عطر على رخام' }

describe('GenerateRequestSchema', () => {
  it('يقبل الطلب الأدنى', () => {
    const r = GenerateRequestSchema.safeParse(base)
    expect(r.success).toBe(true)
  })

  it('المراجع: https فقط — يرفض http و ftp و file و javascript', () => {
    expect(GenerateRequestSchema.safeParse({ ...base, images: ['https://media.highlink.tech/up/u/a.png'] }).success).toBe(true)
    for (const bad of ['http://x.test/a.png', 'ftp://x.test/a.png', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url']) {
      const r = GenerateRequestSchema.safeParse({ ...base, images: [bad] })
      expect(r.success, bad).toBe(false)
    }
  })

  it('يرفض أكثر من 14 مرجعًا ورابطًا أطول من 2048 حرفًا', () => {
    const many = Array.from({ length: 15 }, (_, i) => `https://x.test/${i}.png`)
    expect(GenerateRequestSchema.safeParse({ ...base, images: many }).success).toBe(false)
    expect(GenerateRequestSchema.safeParse({ ...base, images: [`https://x.test/${'a'.repeat(2100)}`] }).success).toBe(false)
  })

  it('maxCredits عدد صحيح موجب؛ الصفر والسالب والكسور تُرفض', () => {
    expect(GenerateRequestSchema.safeParse({ ...base, maxCredits: 11 }).success).toBe(true)
    for (const bad of [0, -1, 1.5]) expect(GenerateRequestSchema.safeParse({ ...base, maxCredits: bad }).success, String(bad)).toBe(false)
  })

  it('assetId يجب أن يكون UUID، والبرومبت لا يكون فارغًا بعد القصّ', () => {
    expect(GenerateRequestSchema.safeParse({ ...base, assetId: 'abc' }).success).toBe(false)
    expect(GenerateRequestSchema.safeParse({ ...base, prompt: '   ' }).success).toBe(false)
  })

  it('config: قيم خارج القوائم تُرفض', () => {
    expect(GenerateRequestSchema.safeParse({ ...base, config: { imageSize: '8K' } }).success).toBe(false)
    expect(GenerateRequestSchema.safeParse({ ...base, config: { aspectRatio: '2:1' } }).success).toBe(false)
    expect(GenerateRequestSchema.safeParse({ ...base, config: { aspectRatio: '9:16', imageSize: '4K' } }).success).toBe(true)
  })
})
