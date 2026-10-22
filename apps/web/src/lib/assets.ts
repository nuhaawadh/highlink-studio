import { useCallback, useEffect, useState } from 'react'
import { FunctionsHttpError } from '@supabase/supabase-js'
import type { Tables } from '@shared/db'
import type { AspectRatio, FeatureTag, GenerateErrorCode, GenerateRequest, GenerateResponse, ImageSize } from '@shared/types'
import { supabase } from './supabase'

/**
 * أصول المستخدم + التدفق الثابت للتوليد (CLAUDE.md القاعدة 1):
 *   createQueuedAsset (صف queued بصلاحية المستخدم) → requestGeneration (functions.invoke) → Realtime يحدّث البطاقة.
 * ممنوع polling وممنوع استدعاء أي مزوّد من هنا.
 */
export type AssetRow = Tables<'assets'>

const FINAL_STATUSES = new Set(['completed', 'failed', 'canceled'])

export function isFinal(asset: AssetRow): boolean {
  return FINAL_STATUSES.has(asset.status)
}

export function useAssets(userId: string | null, opts: { type?: 'image' | 'video'; limit?: number } = {}) {
  const { type, limit = 48 } = opts
  const [assets, setAssets] = useState<AssetRow[]>([])
  const [loading, setLoading] = useState<boolean>(!!userId)

  /** إدراج/تحديث محلي فوري (تفاؤلي) — Realtime يأتي بالنسخة النهائية لاحقًا */
  const upsertLocal = useCallback((row: AssetRow) => {
    setAssets((prev) => {
      const i = prev.findIndex((a) => a.id === row.id)
      if (i === -1) return [row, ...prev]
      const next = prev.slice()
      next[i] = { ...prev[i], ...row }
      return next
    })
  }, [])

  const refresh = useCallback(async () => {
    if (!userId) return
    let q = supabase.from('assets').select('*').eq('user_id', userId).is('deleted_at', null).order('created_at', { ascending: false }).limit(limit)
    if (type) q = q.eq('type', type)
    const { data, error } = await q
    if (error) {
      console.error('[assets] load failed:', error.message)
      return
    }
    setAssets(data ?? [])
    setLoading(false)
  }, [userId, type, limit])

  useEffect(() => {
    if (!userId) {
      setAssets([])
      setLoading(false)
      return
    }
    void refresh()

    // اسم فريد لكل نسخة (انظر credits.ts): قناتان بنفس الاسم = خطأ عند .on() بعد subscribe()
    const channel = supabase
      .channel(`assets-${userId}-${type ?? 'all'}-${crypto.randomUUID()}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'assets', filter: `user_id=eq.${userId}` }, (payload) => {
        if (payload.eventType === 'DELETE') {
          const old = payload.old as Partial<AssetRow>
          setAssets((prev) => prev.filter((a) => a.id !== old.id))
          return
        }
        const row = payload.new as AssetRow
        if (type && row.type !== type) return
        if (row.deleted_at) {
          setAssets((prev) => prev.filter((a) => a.id !== row.id))
          return
        }
        upsertLocal(row)
      })
      .subscribe()

    // عند العودة للتبويب نعيد القراءة مرة واحدة احتياطًا لأي حدث ضاع أثناء الخفاء (ليس polling)
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [userId, type, refresh, upsertLocal])

  return { assets, loading, upsertLocal, refresh }
}

export interface CreateAssetInput {
  userId: string
  type: 'image' | 'video'
  model: string
  prompt: string
  aspectRatio?: AspectRatio
  resolution?: ImageSize | string
  featureTag?: FeatureTag
}

/** يدرج صف assets بحالة queued — الوحيد المسموح للواجهة (سياسة RLS). المعرّف يُنشأ هنا ويُرسل لـgenerate-media. */
export async function createQueuedAsset(input: CreateAssetInput): Promise<AssetRow> {
  const id = crypto.randomUUID()
  const { data, error } = await supabase
    .from('assets')
    .insert({
      id,
      user_id: input.userId,
      type: input.type,
      status: 'queued',
      model: input.model,
      prompt: input.prompt,
      aspect_ratio: input.aspectRatio ?? null,
      resolution: input.resolution ?? null,
      feature_tag: input.featureTag ?? 'general',
    })
    .select('*')
    .single()
  if (error) throw new Error(error.message)
  return data
}

/**
 * صورة مصغّرة لفيديو مكتمل تُلتقط من أول إطار في المتصفح (المخطط §6) وتُرفع عبر Edge Function بصلاحية السيرفر.
 * يرجع الرابط أو null إن رُفض (ليس فشلًا يُعرض للمستخدم).
 */
export async function uploadVideoThumbnail(assetId: string, jpegDataUrl: string): Promise<string | null> {
  const { data, error } = await supabase.functions.invoke<{ success: boolean; thumbnail_url?: string }>('asset-thumbnail', { body: { assetId, image: jpegDataUrl } })
  if (error || !data?.success) return null
  return data.thumbnail_url ?? null
}

export class GenerateError extends Error {
  readonly code: GenerateErrorCode
  readonly balanceAfter: number | null
  constructor(code: GenerateErrorCode, message: string, balanceAfter: number | null = null) {
    super(message)
    this.name = 'GenerateError'
    this.code = code
    this.balanceAfter = balanceAfter
  }
}

/** يستدعي generate-media ويفكّ رسالة الخطأ العربية من جسم الرد عند غير 2xx */
export async function requestGeneration(body: GenerateRequest): Promise<GenerateResponse> {
  const { data, error } = await supabase.functions.invoke<GenerateResponse>('generate-media', { body })
  if (error) {
    let payload: Partial<GenerateResponse> | null = null
    if (error instanceof FunctionsHttpError) {
      try {
        payload = (await error.context.json()) as Partial<GenerateResponse>
      } catch {
        payload = null
      }
    }
    throw new GenerateError(payload?.error?.code ?? 'PROVIDER_ERROR', payload?.error?.message ?? error.message, payload?.balanceAfter ?? null)
  }
  if (!data || !data.success) {
    throw new GenerateError(data?.error?.code ?? 'PROVIDER_ERROR', data?.error?.message ?? 'unknown', data?.balanceAfter ?? null)
  }
  return data
}
