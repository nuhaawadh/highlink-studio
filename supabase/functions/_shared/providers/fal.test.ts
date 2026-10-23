import { describe, expect, it } from 'vitest'
import { AppError } from '../errors'
import { extractFalOutputs, fal } from './fal'

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
