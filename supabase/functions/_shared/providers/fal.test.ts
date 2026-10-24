import { afterEach, describe, expect, it, vi } from 'vitest'
import { AppError } from '../errors'
import { extractFalOutputs, fal, falAppId } from './fal'

/** parseWebhook/extractFalOutputs نقيان (لا Deno): حمولة fal تختلف بشكلها بين النماذج — نتأكد أن الاستخراج يغطي الأشكال الشائعة (ADR 0005). */
describe('fal.extractFalOutputs', () => {
  it('video.url (Kling/Seedance/Veo/Wan)', () => {
    expect(extractFalOutputs({ video: { url: 'https://v3.fal.media/x/out.mp4', content_type: 'video/mp4' }, seed: 7 })).toEqual(['https://v3.fal.media/x/out.mp4'])
  })
  it('images[].url (Flux/Seedream/Nano Banana) — بالترتيب', () => {
    expect(extractFalOutputs({ images: [{ url: 'https://a/1.png' }, { url: 'https://a/2.png' }], description: 'x' })).toEqual(['https://a/1.png', 'https://a/2.png'])
  })
  it('audio.url (TTS) و audio_file.url (موسيقى)', () => {
    expect(extractFalOutputs({ audio: { url: 'https://a/v.mp3' } })).toEqual(['https://a/v.mp3'])
    expect(extractFalOutputs({ audio_file: { url: 'https://a/m.wav' } })).toEqual(['https://a/m.wav'])
  })
  it('الحقول المعروفة أولًا ثم المسح العام؛ لا تكرار؛ يتجاهل روابط غير ملفات', () => {
    expect(extractFalOutputs({ meta: { url: 'https://fal.ai/models/x' }, output: { url: 'https://a/o.webm' } })).toEqual(['https://a/o.webm'])
    expect(extractFalOutputs({ nested: { deep: { file: { url: 'https://a/d.png' } } } })).toEqual(['https://a/d.png'])
    expect(extractFalOutputs({ video_url: 'https://a/x.mp4', video: { url: 'https://a/x.mp4' } })).toEqual(['https://a/x.mp4'])
    expect(extractFalOutputs({ text: 'hello', seed: 1 })).toEqual([])
    expect(extractFalOutputs(null)).toEqual([])
  })
})

describe('fal.parseWebhook', () => {
  it('OK مع ناتج → succeeded', () => {
    const r = fal.parseWebhook(JSON.stringify({ request_id: 'r1', gateway_request_id: 'g1', status: 'OK', payload: { video: { url: 'https://v3.fal.media/x/out.mp4' } } }))
    expect(r).toEqual({ jobId: 'r1', status: 'succeeded', outputs: ['https://v3.fal.media/x/out.mp4'] })
  })

  it('OK بلا ملف (payload_error أو حمولة نصية) → failed حتى لا يُؤكَّد خصم بلا ناتج', () => {
    const r = fal.parseWebhook(JSON.stringify({ request_id: 'r2', status: 'OK', payload: null, payload_error: 'Response payload is not JSON serializable' }))
    expect(r.status).toBe('failed')
    expect(r.error).toContain('payload_error')
    expect(fal.parseWebhook(JSON.stringify({ request_id: 'r2b', status: 'OK', payload: { text: 'x' } })).status).toBe('failed')
  })

  it('ERROR مع تفاصيل 422 → failed برسالة مجمّعة', () => {
    const r = fal.parseWebhook(
      JSON.stringify({ request_id: 'r3', status: 'ERROR', error: 'Invalid status code: 422', payload: { detail: [{ loc: ['body', 'duration'], msg: 'duration must be one of 5, 10', type: 'value_error' }] } }),
    )
    expect(r.status).toBe('failed')
    expect(r.error).toBe('Invalid status code: 422: duration must be one of 5, 10')
  })

  it('حالة أخرى = processing', () => {
    expect(fal.parseWebhook(JSON.stringify({ request_id: 'r4', status: 'IN_PROGRESS' })).status).toBe('processing')
  })

  it('حمولة بلا request_id أو JSON معطوب → AppError INVALID_INPUT', () => {
    for (const bad of ['{}', '{"request_id":""}', '{"request_id":5}', '[]', 'null', '{not json']) {
      let err: unknown
      try {
        fal.parseWebhook(bad)
      } catch (e) {
        err = e
      }
      expect(err, bad).toBeInstanceOf(AppError)
      expect((err as AppError).code, bad).toBe('INVALID_INPUT')
    }
  })

  it('eventId ثابت من ترويسة request id', () => {
    expect(fal.eventId(new Request('https://x', { headers: { 'X-Fal-Webhook-Request-Id': 'abc' } }))).toBe('fal:abc')
    expect(fal.eventId(new Request('https://x'))).toBeNull()
  })
})

/**
 * getJob — شبكة أمان الـwebhook (reconcile، backlog B9): fal يرجع حالة الطلب من
 * GET queue.fal.run/{owner}/{app}/requests/{id}/status (بلا مسار النقطة)، والفاشل حالته COMPLETED مع error.
 */
describe('fal.getJob', () => {
  afterEach(() => vi.unstubAllGlobals())

  const stub = (routes: Record<string, { status: number; body: unknown }>) => {
    const calls: string[] = []
    vi.stubGlobal('Deno', { env: { get: (k: string) => (k === 'FAL_KEY' ? 'test-key' : undefined) } })
    vi.stubGlobal('fetch', async (url: string, init?: RequestInit) => {
      calls.push(url)
      expect((init?.headers as Record<string, string>).Authorization).toBe('Key test-key')
      const hit = routes[url]
      if (!hit) return new Response('not found', { status: 404 })
      return new Response(JSON.stringify(hit.body), { status: hit.status })
    })
    return calls
  }
  const base = 'https://queue.fal.run/fal-ai/kling-video/requests/r1'
  const slug = 'fal-ai/kling-video/v3/standard/text-to-video'

  it('falAppId: أول مقطعين من المسار (owner/app)', () => {
    expect(falAppId('fal-ai/kling-video/v3/standard/text-to-video')).toBe('fal-ai/kling-video')
    expect(falAppId('kling/v4/text-to-video')).toBe('kling/v4')
    expect(falAppId('fal-ai/flux-2')).toBe('fal-ai/flux-2')
    expect(falAppId('bad')).toBeNull()
    expect(falAppId('')).toBeNull()
  })

  it('IN_QUEUE / IN_PROGRESS (202) → processing بلا طلب للنتيجة', async () => {
    for (const st of ['IN_QUEUE', 'IN_PROGRESS']) {
      const calls = stub({ [`${base}/status`]: { status: 202, body: { status: st, request_id: 'r1' } } })
      expect(await fal.getJob('r1', slug)).toEqual({ jobId: 'r1', status: 'processing', outputs: [] })
      expect(calls).toEqual([`${base}/status`])
    }
  })

  it('COMPLETED بلا خطأ → يجلب النتيجة → succeeded بروابطها', async () => {
    stub({
      [`${base}/status`]: { status: 200, body: { status: 'COMPLETED', request_id: 'r1' } },
      [base]: { status: 200, body: { video: { url: 'https://v3.fal.media/x/out.mp4' } } },
    })
    expect(await fal.getJob('r1', slug)).toEqual({ jobId: 'r1', status: 'succeeded', outputs: ['https://v3.fal.media/x/out.mp4'] })
  })

  it('COMPLETED مع error → failed بالرسالة، ولا يجلب النتيجة', async () => {
    const calls = stub({ [`${base}/status`]: { status: 200, body: { status: 'COMPLETED', request_id: 'r1', error: 'Out of memory', error_type: 'runner_error' } } })
    const r = await fal.getJob('r1', slug)
    expect(r.status).toBe('failed')
    expect(r.error).toContain('Out of memory')
    expect(calls).toEqual([`${base}/status`])
  })

  it('COMPLETED ونتيجة بلا ملف → failed (لا تأكيد خصم بلا ناتج)', async () => {
    stub({
      [`${base}/status`]: { status: 200, body: { status: 'COMPLETED', request_id: 'r1' } },
      [base]: { status: 200, body: { text: 'nothing' } },
    })
    expect((await fal.getJob('r1', slug)).status).toBe('failed')
  })

  it('404 (طلب غير موجود) → failed حتى لا يبقى الحجز عالقًا', async () => {
    stub({})
    const r = await fal.getJob('r1', slug)
    expect(r.status).toBe('failed')
    expect(r.error).toContain('404')
  })

  it('500 أو بلا slug → AppError PROVIDER_ERROR (reconcile يعيد المحاولة لاحقًا)', async () => {
    stub({ [`${base}/status`]: { status: 500, body: { detail: 'boom' } } })
    await expect(fal.getJob('r1', slug)).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await expect(fal.getJob('r1')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
    await expect(fal.getJob('r1', 'bad')).rejects.toMatchObject({ code: 'PROVIDER_ERROR' })
  })
})
