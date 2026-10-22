import { describe, expect, it } from 'vitest'
import { canonicalJson, extractApiKey, parseApiRoute, toPublicAsset } from './api-types'
import { computeReplicateSignature, verifyReplicateWebhook } from './replicate-signature'

const KEY = 'hl_live_' + 'a'.repeat(32)

describe('parseApiRoute', () => {
  it('يقبل المسار بكل البادئات الممكنة', () => {
    for (const p of ['/functions/v1/v1/generate', '/v1/generate', '/generate', '/v1/generate/']) {
      expect(parseApiRoute(p), p).toEqual({ name: 'generate' })
    }
    expect(parseApiRoute('/v1/models')).toEqual({ name: 'models' })
    expect(parseApiRoute('/v1/balance')).toEqual({ name: 'balance' })
  })

  it('assets/{id} يتطلب UUID ويطبّعه إلى أحرف صغيرة', () => {
    expect(parseApiRoute('/v1/assets/6F1B7C2E-3D4A-4B5C-9D8E-7F6A5B4C3D2E')).toEqual({ name: 'asset', id: '6f1b7c2e-3d4a-4b5c-9d8e-7f6a5b4c3d2e' })
    expect(parseApiRoute('/v1/assets/not-a-uuid').name).toBe('unknown')
    expect(parseApiRoute('/v1/assets/').name).toBe('unknown')
  })

  it('مسار غير معروف', () => {
    expect(parseApiRoute('/v1/whatever')).toEqual({ name: 'unknown', path: '/whatever' })
    expect(parseApiRoute('/v1')).toEqual({ name: 'unknown', path: '' })
  })
})

describe('extractApiKey', () => {
  it('Bearer أو X-API-Key بالصيغة الصحيحة فقط', () => {
    expect(extractApiKey(new Headers({ authorization: `Bearer ${KEY}` }))).toBe(KEY)
    expect(extractApiKey(new Headers({ 'x-api-key': KEY }))).toBe(KEY)
    expect(extractApiKey(new Headers({ authorization: 'Bearer eyJhbGciOi.jwt.token' }))).toBeNull()
    expect(extractApiKey(new Headers({ authorization: `Bearer hl_live_short` }))).toBeNull()
    expect(extractApiKey(new Headers({ 'x-api-key': 'hl_prod_' + 'a'.repeat(32) }))).toBeNull()
    expect(extractApiKey(new Headers())).toBeNull()
  })

  it('Bearer له الأولوية على X-API-Key', () => {
    const other = 'hl_test_' + 'b'.repeat(32)
    expect(extractApiKey(new Headers({ authorization: `Bearer ${KEY}`, 'x-api-key': other }))).toBe(KEY)
  })
})

describe('canonicalJson', () => {
  it('ترتيب المفاتيح لا يغيّر البصمة، وundefined يُحذف', () => {
    const a = canonicalJson({ prompt: 'x', config: { imageSize: '2K', aspectRatio: '1:1' }, model: 'm' })
    const b = canonicalJson({ model: 'm', config: { aspectRatio: '1:1', imageSize: '2K' }, prompt: 'x', images: undefined })
    expect(a).toBe(b)
    expect(a).toBe('{"config":{"aspectRatio":"1:1","imageSize":"2K"},"model":"m","prompt":"x"}')
  })

  it('اختلاف القيمة يغيّر البصمة، والمصفوفات تحفظ ترتيبها', () => {
    expect(canonicalJson({ images: ['a', 'b'] })).not.toBe(canonicalJson({ images: ['b', 'a'] }))
    expect(canonicalJson({ prompt: 'x' })).not.toBe(canonicalJson({ prompt: 'y' }))
  })
})

describe('toPublicAsset', () => {
  const base = {
    id: 'id', status: 'completed', type: 'image', model: 'nano-banana-pro', prompt: 'p', aspect_ratio: '1:1', resolution: '2K',
    url: 'https://m/x.png', thumbnail_url: 'https://m/x.png', cost_credits: 11, error_code: null, error_message: null,
    metadata: { provider_input: { secret: 'internal' }, qa: {} }, created_at: '2026-10-22T00:00:00Z', completed_at: '2026-10-22T00:01:00Z',
  }

  it('لا يسرّب metadata ولا معرّف المزوّد؛ error = null عند النجاح', () => {
    const pub = toPublicAsset(base)
    expect(pub).not.toHaveProperty('metadata')
    expect(pub).not.toHaveProperty('provider_job_id')
    expect(pub.error).toBeNull()
    expect(pub.sandbox).toBe(false)
    expect(pub.cost_credits).toBe(11)
  })

  it('failed → error{code,message}؛ sandbox من metadata؛ التكلفة الفارغة = 0', () => {
    const pub = toPublicAsset({ ...base, status: 'failed', error_code: 'PROVIDER_ERROR', error_message: 'فشل', cost_credits: null, metadata: { sandbox: true } })
    expect(pub.error).toEqual({ code: 'PROVIDER_ERROR', message: 'فشل' })
    expect(pub.sandbox).toBe(true)
    expect(pub.cost_credits).toBe(0)
  })
})

describe('توقيع webhook العميل = نفس مواصفة Standard Webhooks التي نتحقق بها من Replicate', () => {
  it('ما نوقّعه بسر whsec_ يتحقق بدالة التحقق نفسها', async () => {
    const secret = 'whsec_' + btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(24))))
    const id = 'evt_1'
    const ts = String(Math.floor(Date.now() / 1000))
    const body = JSON.stringify({ event: 'asset.completed', data: { id: 'x' } })
    const sig = await computeReplicateSignature(secret, id, ts, body)
    expect(await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${sig}`, body })).toEqual({ ok: true })
    expect((await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${sig}`, body: body + ' ' })).ok).toBe(false)
  })
})
