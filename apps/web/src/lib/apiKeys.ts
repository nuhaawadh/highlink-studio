import type { Tables } from '@shared/db'
import { env } from './env'
import { supabase } from './supabase'

/**
 * مفاتيح API v1 (ADR 0004): القراءة عبر RLS (المالك فقط)، الإصدار والإبطال عبر RPC بـauth.uid().
 * المفتاح الكامل يُرجَع مرة واحدة من create_api_key ولا يُخزَّن إلا hash.
 */
export type ApiKeyRow = Tables<'api_keys'>
export type ApiKeyMode = 'live' | 'test'

export interface CreatedApiKey {
  id: string
  key: string
  key_hint: string
  webhook_secret: string
  daily_limit: number
  mode: string
}

export type ApiKeyErrorCode = 'TOO_MANY_KEYS' | 'INVALID_WEBHOOK_URL' | 'INVALID_NAME' | 'INVALID_MODE' | 'UNAUTHORIZED' | 'UNKNOWN'

export class ApiKeyError extends Error {
  readonly code: ApiKeyErrorCode
  constructor(code: ApiKeyErrorCode, message: string) {
    super(message)
    this.name = 'ApiKeyError'
    this.code = code
  }
}

const KNOWN: ApiKeyErrorCode[] = ['TOO_MANY_KEYS', 'INVALID_WEBHOOK_URL', 'INVALID_NAME', 'INVALID_MODE', 'UNAUTHORIZED']

function toApiKeyError(message: string): ApiKeyError {
  const code = KNOWN.find((c) => message.includes(c)) ?? 'UNKNOWN'
  return new ApiKeyError(code, message)
}

/** عنوان الـAPI العام الآن (Supabase)؛ بعد نقل DNS يصبح https://api.highlink.tech/v1 بإعادة كتابة واحدة */
export function apiBaseUrl(): string {
  return `${env.VITE_SUPABASE_URL}/functions/v1/v1`
}

export async function listApiKeys(): Promise<ApiKeyRow[]> {
  const { data, error } = await supabase.from('api_keys').select('*').order('created_at', { ascending: false })
  if (error) throw toApiKeyError(error.message)
  return data ?? []
}

export async function createApiKey(input: { name: string; mode: ApiKeyMode; webhookUrl?: string }): Promise<CreatedApiKey> {
  const args: { p_name: string; p_mode: string; p_webhook_url?: string } = { p_name: input.name.trim(), p_mode: input.mode }
  if (input.webhookUrl?.trim()) args.p_webhook_url = input.webhookUrl.trim()
  const { data, error } = await supabase.rpc('create_api_key', args)
  if (error) throw toApiKeyError(error.message)
  const row = Array.isArray(data) ? data[0] : data
  if (!row) throw new ApiKeyError('UNKNOWN', 'empty response')
  return row as CreatedApiKey
}

export async function revokeApiKey(id: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('revoke_api_key', { p_id: id })
  if (error) throw toApiKeyError(error.message)
  return Boolean(data)
}
