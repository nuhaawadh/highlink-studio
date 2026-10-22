import type { PublicAsset } from './types.ts'

/**
 * أجزاء API v1 النقية (ADR 0004) — بلا Deno ولا شبكة، تُختبر بـvitest:
 * - المسار العام → اسم المسار ومعرّفه
 * - استخراج مفتاح API من الترويسات
 * - تطبيع جسم الطلب لحساب بصمة Idempotency
 * - التمثيل العام للأصل (لا metadata داخلية ولا معرّف مهمة المزوّد)
 */

export type ApiRoute =
  | { name: 'generate' }
  | { name: 'asset'; id: string }
  | { name: 'models' }
  | { name: 'balance' }
  | { name: 'unknown'; path: string }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

/** يقبل `/functions/v1/v1/generate` و`/v1/generate` و`/generate` (اسم الوظيفة v1 قد يظهر أو لا حسب البوابة) */
export function parseApiRoute(pathname: string): ApiRoute {
  let p = pathname.replace(/\/+$/, '')
  p = p.replace(/^\/functions\/v1/, '')
  p = p.replace(/^\/v1(?=\/|$)/, '')
  if (p === '/generate') return { name: 'generate' }
  if (p === '/models') return { name: 'models' }
  if (p === '/balance') return { name: 'balance' }
  const m = /^\/assets\/([^/]+)$/.exec(p)
  if (m && UUID.test(m[1])) return { name: 'asset', id: m[1].toLowerCase() }
  return { name: 'unknown', path: p }
}

export const API_KEY_PATTERN = /^hl_(live|test)_[A-Za-z0-9_-]{32}$/

/** `Authorization: Bearer hl_…` أو `X-API-Key: hl_…` — يرجع null إن غاب أو خالف الصيغة (لا نكشف أيهما) */
export function extractApiKey(headers: Headers): string | null {
  const auth = headers.get('authorization') ?? ''
  const bearer = auth.startsWith('Bearer ') ? auth.slice(7).trim() : ''
  const candidate = bearer || (headers.get('x-api-key') ?? '').trim()
  return API_KEY_PATTERN.test(candidate) ? candidate : null
}

/** JSON بمفاتيح مرتّبة بلا undefined — نفس الجسم المنطقي يعطي نفس النص مهما اختلف ترتيب الحقول */
export function canonicalJson(value: unknown): string {
  return JSON.stringify(sortKeys(value))
}

function sortKeys(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeys)
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {}
    for (const k of Object.keys(value as Record<string, unknown>).sort()) {
      const v = (value as Record<string, unknown>)[k]
      if (v !== undefined) out[k] = sortKeys(v)
    }
    return out
  }
  return value
}

/** صف assets كما تقرأه الوظائف (الأعمدة المستخدمة في التمثيل العام) */
export interface AssetRowForApi {
  id: string
  status: string
  type: string
  model: string | null
  prompt: string | null
  aspect_ratio: string | null
  resolution: string | null
  url: string | null
  thumbnail_url: string | null
  cost_credits: number | null
  error_code: string | null
  error_message: string | null
  metadata: Record<string, unknown> | null
  created_at: string
  completed_at: string | null
}

export function toPublicAsset(row: AssetRowForApi): PublicAsset {
  const sandbox = Boolean((row.metadata as { sandbox?: unknown } | null)?.sandbox)
  return {
    id: row.id,
    status: row.status as PublicAsset['status'],
    type: row.type as PublicAsset['type'],
    model: row.model,
    prompt: row.prompt,
    aspect_ratio: row.aspect_ratio,
    resolution: row.resolution,
    url: row.url,
    thumbnail_url: row.thumbnail_url,
    cost_credits: row.cost_credits ?? 0,
    sandbox,
    error: row.status === 'failed' || row.status === 'canceled' ? { code: row.error_code ?? 'PROVIDER_ERROR', message: row.error_message ?? '' } : null,
    created_at: row.created_at,
    completed_at: row.completed_at,
  }
}
