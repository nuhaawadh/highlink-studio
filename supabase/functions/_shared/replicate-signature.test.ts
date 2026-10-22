import { createHmac, randomBytes } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { computeReplicateSignature, verifyReplicateWebhook } from './replicate-signature'

/**
 * تحقق توقيع webhooks من Replicate (Standard Webhooks):
 * signed = `${webhook-id}.${webhook-timestamp}.${body}`، HMAC-SHA256 بمفتاح = base64-decode(السر بعد "whsec_")،
 * والترويسة `webhook-signature` = "v1,<base64> v1,<base64> …".
 * المرجع المستقل هنا node:crypto؛ التنفيذ المختبَر يستخدم WebCrypto فقط ليعمل في Deno.
 */
const secretBytes = randomBytes(32)
const secret = `whsec_${secretBytes.toString('base64')}`
const id = 'msg_2fq1j8ZxT0'
const body = JSON.stringify({ id: 'pred_123', status: 'succeeded', output: 'https://replicate.delivery/x/out.png' })

function nodeSign(ts: string, payload = body, key = secretBytes) {
  return createHmac('sha256', key).update(`${id}.${ts}.${payload}`).digest('base64')
}

describe('replicate webhook signature', () => {
  it('يطابق مرجع node:crypto', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    expect(await computeReplicateSignature(secret, id, ts, body)).toBe(nodeSign(ts))
  })

  it('توقيع صحيح يمرّ', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${nodeSign(ts)}`, body })
    expect(res).toEqual({ ok: true })
  })

  it('يقبل عدة توقيعات مفصولة بمسافة إن طابق أحدها', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const other = createHmac('sha256', randomBytes(32)).update('x').digest('base64')
    const res = await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${other} v1,${nodeSign(ts)}`, body })
    expect(res.ok).toBe(true)
  })

  it('توقيع خاطئ يُرفض', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const res = await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${nodeSign(ts, body + ' ')}`, body })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('signature_mismatch')
  })

  it('جسم معدَّل (حتى بإعادة تنسيق JSON) يُرفض', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    const reformatted = JSON.stringify(JSON.parse(body), null, 2)
    const res = await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${nodeSign(ts)}`, body: reformatted })
    expect(res.ok).toBe(false)
  })

  it('طابع زمني أقدم من 5 دقائق يُرفض (إعادة إرسال)', async () => {
    const ts = String(Math.floor(Date.now() / 1000) - 6 * 60)
    const res = await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: `v1,${nodeSign(ts)}`, body })
    expect(res.ok).toBe(false)
    expect(res.reason).toBe('timestamp_out_of_tolerance')
  })

  it('ترويسات ناقصة أو سر غير صالح → رفض واضح', async () => {
    const ts = String(Math.floor(Date.now() / 1000))
    expect((await verifyReplicateWebhook({ secret, id: null, timestamp: ts, signature: 'v1,abc', body })).reason).toBe('missing_headers')
    expect((await verifyReplicateWebhook({ secret: 'nope', id, timestamp: ts, signature: 'v1,abc', body })).reason).toBe('invalid_secret')
    expect((await verifyReplicateWebhook({ secret, id, timestamp: ts, signature: 'v2,abc', body })).reason).toBe('signature_mismatch')
  })
})
