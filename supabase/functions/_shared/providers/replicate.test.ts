import { describe, expect, it } from 'vitest'
import { AppError } from '../errors'
import { replicate } from './replicate'

/** parseWebhook نقي (لا Deno): حمولة Replicate تُتحقق بـzod قبل أن تمس الأصل أو الرصيد (CLAUDE.md القاعدة 10). */
describe('replicate.parseWebhook', () => {
  it('نجاح بناتج واحد (نص)', () => {
    const r = replicate.parseWebhook(JSON.stringify({ id: 'p1', status: 'succeeded', output: 'https://replicate.delivery/x/out.png' }))
    expect(r).toEqual({ jobId: 'p1', status: 'succeeded', outputs: ['https://replicate.delivery/x/out.png'], error: undefined })
  })

  it('نجاح بناتج مصفوفة — يُبقي الروابط النصية فقط', () => {
    const r = replicate.parseWebhook(JSON.stringify({ id: 'p2', status: 'succeeded', output: ['https://a/1.png', 7, null, 'https://a/2.png'] }))
    expect(r.outputs).toEqual(['https://a/1.png', 'https://a/2.png'])
  })

  it('فشل/إلغاء مع نص الخطأ؛ أي حالة أخرى = processing', () => {
    expect(replicate.parseWebhook(JSON.stringify({ id: 'p3', status: 'failed', error: 'NSFW' })).status).toBe('failed')
    expect(replicate.parseWebhook(JSON.stringify({ id: 'p3', status: 'failed', error: 'NSFW' })).error).toBe('NSFW')
    expect(replicate.parseWebhook(JSON.stringify({ id: 'p4', status: 'canceled' })).status).toBe('canceled')
    expect(replicate.parseWebhook(JSON.stringify({ id: 'p5', status: 'starting' })).status).toBe('processing')
    expect(replicate.parseWebhook(JSON.stringify({ id: 'p6' })).status).toBe('processing')
  })

  it('حمولة بلا id أو ليست كائنًا أو JSON معطوب → AppError INVALID_INPUT', () => {
    for (const bad of ['{}', '{"id":""}', '{"id":5}', '[]', 'null', '"x"', '{not json']) {
      let err: unknown
      try {
        replicate.parseWebhook(bad)
      } catch (e) {
        err = e
      }
      expect(err, bad).toBeInstanceOf(AppError)
      expect((err as AppError).code, bad).toBe('INVALID_INPUT')
    }
  })
})

describe('throttleWaitSeconds — 429 من Replicate (6/دقيقة بدفعة 1 تحت 5$)', () => {
  it('يقرأ retry_after من الجسم، ثم الترويسة، ثم 10 افتراضًا', async () => {
    const { throttleWaitSeconds } = await import('./replicate')
    expect(throttleWaitSeconds(429, JSON.stringify({ status: 429, retry_after: 10 }), null)).toBe(10)
    expect(throttleWaitSeconds(429, 'not json', '3')).toBe(3)
    expect(throttleWaitSeconds(429, '{}', null)).toBe(10)
    expect(throttleWaitSeconds(429, JSON.stringify({ retry_after: 0.2 }), null)).toBe(1)
  })
  it('لا إعادة لغير 429 أو لانتظار أطول من 15 ث', async () => {
    const { throttleWaitSeconds } = await import('./replicate')
    expect(throttleWaitSeconds(402, '{}', null)).toBeNull()
    expect(throttleWaitSeconds(500, '{}', '1')).toBeNull()
    expect(throttleWaitSeconds(429, JSON.stringify({ retry_after: 60 }), null)).toBeNull()
  })
})
