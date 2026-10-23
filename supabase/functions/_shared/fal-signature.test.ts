import { createHash } from 'node:crypto'
import { describe, expect, it } from 'vitest'
import { falSignedMessage, parseFalJwks, verifyFalWebhook } from './fal-signature'

/**
 * تحقق توقيع webhooks من fal (ADR 0005):
 * message = `${request_id}\n${user_id}\n${timestamp}\n${sha256hex(body)}`، التوقيع ED25519 بصيغة hex،
 * والمفاتيح العامة من JWKS (OKP/Ed25519، الحقل x بصيغة base64url). أي مفتاح يطابق يكفي.
 * المرجع المستقل هنا WebCrypto نفسه (Node 22) لتوليد زوج مفاتيح وتوقيع رسالة مبنية يدويًا.
 */
const enc = new TextEncoder()

async function keypair() {
  const k = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const jwk = await crypto.subtle.exportKey('jwk', k.publicKey)
  return { k, jwk }
}

function hex(bytes: ArrayBuffer): string {
  return Array.from(new Uint8Array(bytes))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

async function sign(k: CryptoKeyPair, message: string): Promise<string> {
  return hex(await crypto.subtle.sign('Ed25519', k.privateKey, enc.encode(message)))
}

const requestId = 'req_8f3a1c2d'
const userId = 'user_42'
const body = JSON.stringify({ request_id: requestId, status: 'OK', payload: { video: { url: 'https://v3.fal.media/x/out.mp4' } } })

describe('fal webhook signature', () => {
  it('الرسالة الموقّعة = id\\nuser\\nts\\nsha256(body) hex — تطابق node:crypto', async () => {
    const ts = '1760000000'
    const expectedHash = createHash('sha256').update(body).digest('hex')
    await expect(falSignedMessage(requestId, userId, ts, body)).resolves.toBe(`${requestId}\n${userId}\n${ts}\n${expectedHash}`)
  })

  it('يفكّ JWKS إلى مفاتيح Ed25519 خام (32 بايت) ويتجاهل غير OKP', async () => {
    const { jwk } = await keypair()
    const keys = parseFalJwks({ keys: [jwk, { kty: 'RSA', n: 'x', e: 'AQAB' }, { kty: 'OKP', crv: 'X25519', x: jwk.x }] })
    expect(keys).toHaveLength(1)
    expect(keys[0].byteLength).toBe(32)
  })

  it('توقيع صحيح يمرّ', async () => {
    const { k, jwk } = await keypair()
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = await sign(k, await falSignedMessage(requestId, userId, ts, body))
    const res = await verifyFalWebhook({ requestId, userId, timestamp: ts, signature, body, keys: parseFalJwks({ keys: [jwk] }) })
    expect(res).toEqual({ ok: true })
  })

  it('يقبل إن طابق أي مفتاح من عدة مفاتيح (دوران المفاتيح)', async () => {
    const a = await keypair()
    const b = await keypair()
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = await sign(b.k, await falSignedMessage(requestId, userId, ts, body))
    const res = await verifyFalWebhook({ requestId, userId, timestamp: ts, signature, body, keys: parseFalJwks({ keys: [a.jwk, b.jwk] }) })
    expect(res.ok).toBe(true)
  })

  it('جسم معدَّل (حتى بإعادة تنسيق JSON) يُرفض', async () => {
    const { k, jwk } = await keypair()
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = await sign(k, await falSignedMessage(requestId, userId, ts, body))
    const reformatted = JSON.stringify(JSON.parse(body), null, 2)
    const res = await verifyFalWebhook({ requestId, userId, timestamp: ts, signature, body: reformatted, keys: parseFalJwks({ keys: [jwk] }) })
    expect(res).toEqual({ ok: false, reason: 'signature_mismatch' })
  })

  it('مفتاح آخر أو توقيع hex غير صالح يُرفض', async () => {
    const a = await keypair()
    const b = await keypair()
    const ts = String(Math.floor(Date.now() / 1000))
    const signature = await sign(a.k, await falSignedMessage(requestId, userId, ts, body))
    expect((await verifyFalWebhook({ requestId, userId, timestamp: ts, signature, body, keys: parseFalJwks({ keys: [b.jwk] }) })).ok).toBe(false)
    expect((await verifyFalWebhook({ requestId, userId, timestamp: ts, signature: 'zz-not-hex', body, keys: parseFalJwks({ keys: [a.jwk] }) })).ok).toBe(false)
  })

  it('طابع زمني خارج 5 دقائق يُرفض (إعادة إرسال)', async () => {
    const { k, jwk } = await keypair()
    const ts = String(Math.floor(Date.now() / 1000) - 6 * 60)
    const signature = await sign(k, await falSignedMessage(requestId, userId, ts, body))
    const res = await verifyFalWebhook({ requestId, userId, timestamp: ts, signature, body, keys: parseFalJwks({ keys: [jwk] }) })
    expect(res).toEqual({ ok: false, reason: 'timestamp_out_of_tolerance' })
  })

  it('ترويسات ناقصة أو بلا مفاتيح → رفض واضح', async () => {
    const { jwk } = await keypair()
    const keys = parseFalJwks({ keys: [jwk] })
    expect(await verifyFalWebhook({ requestId: null, userId, timestamp: '1', signature: 'ab', body, keys })).toEqual({ ok: false, reason: 'missing_headers' })
    expect(await verifyFalWebhook({ requestId, userId: null, timestamp: '1', signature: 'ab', body, keys })).toEqual({ ok: false, reason: 'missing_headers' })
    expect(await verifyFalWebhook({ requestId, userId, timestamp: String(Math.floor(Date.now() / 1000)), signature: 'ab', body, keys: [] })).toEqual({ ok: false, reason: 'no_keys' })
  })
})
