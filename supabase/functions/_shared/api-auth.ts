import { extractApiKey } from './api-types.ts'
import { AppError, toAppError } from './errors.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * مصادقة API v1 (ADR 0004): المفتاح من الترويسة → sha256 → `api_authenticate` (service_role).
 * `count=true` على POST /v1/generate فقط: يزيد عدّ اليوم ذريًا ويرفض DAILY_LIMIT.
 * المفتاح نفسه لا يُسجَّل ولا يُخزَّن.
 */
export interface ApiPrincipal {
  keyId: string
  userId: string
  mode: 'live' | 'test'
  dailyLimit: number
  usedToday: number
  webhookUrl: string | null
  webhookSecret: string
  planId: string | null
}

export async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('')
}

export async function authenticateApiKey(req: Request, opts: { count: boolean }): Promise<ApiPrincipal> {
  const key = extractApiKey(req.headers)
  if (!key) throw new AppError('UNAUTHORIZED')
  const hash = await sha256Hex(key)
  const { data, error } = await supabaseAdmin().rpc('api_authenticate', { p_key_hash: hash, p_count: opts.count })
  if (error) throw toAppError(new Error(error.message))
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new AppError('UNAUTHORIZED')
  return {
    keyId: row.key_id,
    userId: row.user_id,
    mode: row.mode,
    dailyLimit: Number(row.daily_limit),
    usedToday: Number(row.used_today),
    webhookUrl: row.webhook_url ?? null,
    webhookSecret: row.webhook_secret,
    planId: row.plan_id ?? null,
  }
}

export function rateLimitHeaders(p: ApiPrincipal): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(p.dailyLimit),
    'X-RateLimit-Remaining': String(Math.max(0, p.dailyLimit - p.usedToday)),
  }
}
