import { useCallback, useEffect, useState } from 'react'
import type { Tables } from '@shared/db'
import { supabase } from './supabase'

/**
 * بيانات صفحة الحساب — كلها قراءة بصلاحية المستخدم (RLS: read own). الواجهة لا تكتب في الدفتر ولا المدفوعات أبدًا
 * (CLAUDE.md القاعدة 2)؛ الكتابة الوحيدة هنا تعديل الاسم واللغة في profiles.
 */
export type ProfileRow = Pick<Tables<'profiles'>, 'display_name' | 'plan_id' | 'locale' | 'created_at'>
export type LedgerRow = Pick<Tables<'credit_ledger'>, 'id' | 'amount' | 'kind' | 'status' | 'asset_id' | 'ref' | 'note' | 'created_at' | 'expires_at'>
export type LedgerAsset = Pick<Tables<'assets'>, 'id' | 'type' | 'model' | 'prompt' | 'status' | 'cost_credits' | 'thumbnail_url' | 'url' | 'metadata'>
export type PaymentRow = Pick<Tables<'payments'>, 'id' | 'created_at' | 'amount_sar' | 'vat_sar' | 'credits' | 'status' | 'provider'>

export function useProfile(userId: string | null) {
  const [profile, setProfile] = useState<ProfileRow | null>(null)
  const [loading, setLoading] = useState(Boolean(userId))

  const reload = useCallback(async () => {
    if (!userId) return
    const { data, error } = await supabase.from('profiles').select('display_name, plan_id, locale, created_at').eq('id', userId).maybeSingle()
    if (error) console.error('[account] profile load failed:', error.message)
    setProfile(data ?? null)
    setLoading(false)
  }, [userId])

  useEffect(() => {
    void reload()
  }, [reload])

  return { profile, loading, reload }
}

/** يحدّث الاسم الظاهر و/أو اللغة فقط (الباقة يحددها السيرفر — migration 0009 يمنع غيرها) */
export async function updateProfile(userId: string, patch: { display_name?: string | null; locale?: 'ar' | 'en' }): Promise<void> {
  const { error } = await supabase.from('profiles').update(patch).eq('id', userId)
  if (error) throw new Error(error.message)
}

const PAGE = 30

/** سجل الرصيد (الأحدث أولًا) مع أصل كل حركة إن وُجد — بلا علاقة FK، فالأصول تُجلب بالمعرّفات */
export function useLedger(userId: string | null) {
  const [rows, setRows] = useState<LedgerRow[]>([])
  const [assets, setAssets] = useState<Record<string, LedgerAsset>>({})
  const [loading, setLoading] = useState(Boolean(userId))
  const [more, setMore] = useState(false)

  const load = useCallback(
    async (offset: number) => {
      if (!userId) return
      const { data, error } = await supabase
        .from('credit_ledger')
        .select('id, amount, kind, status, asset_id, ref, note, created_at, expires_at')
        .eq('user_id', userId)
        .order('created_at', { ascending: false })
        .order('id', { ascending: false })
        .range(offset, offset + PAGE - 1)
      if (error) {
        console.error('[account] ledger load failed:', error.message)
        setLoading(false)
        return
      }
      const page = data ?? []
      setRows((prev) => (offset === 0 ? page : [...prev, ...page]))
      setMore(page.length === PAGE)
      const ids = [...new Set(page.map((r) => r.asset_id).filter((x): x is string => Boolean(x)))]
      if (ids.length) {
        const { data: a } = await supabase.from('assets').select('id, type, model, prompt, status, cost_credits, thumbnail_url, url, metadata').in('id', ids)
        setAssets((prev) => ({ ...prev, ...Object.fromEntries((a ?? []).map((x) => [x.id, x])) }))
      }
      setLoading(false)
    },
    [userId],
  )

  useEffect(() => {
    void load(0)
  }, [load])

  return { rows, assets, loading, more, loadMore: () => void load(rows.length) }
}

export function usePayments(userId: string | null) {
  const [rows, setRows] = useState<PaymentRow[]>([])
  const [loading, setLoading] = useState(Boolean(userId))
  useEffect(() => {
    if (!userId) return
    supabase
      .from('payments')
      .select('id, created_at, amount_sar, vat_sar, credits, status, provider')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error }) => {
        if (error) console.error('[account] payments load failed:', error.message)
        setRows(data ?? [])
        setLoading(false)
      })
  }, [userId])
  return { rows, loading }
}

export interface MonthStats {
  images: number
  videos: number
  spent: number
  refunded: number
}

/** أول يوم في الشهر الحالي بتوقيت الجهاز */
export function monthStart(now = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}

/** ملخص الشهر من الدفتر: الخصومات المؤكدة (charge) وعدد الاستردادات، وعدد ما اكتمل من صور وفيديو */
export function summarizeMonth(ledger: Pick<LedgerRow, 'amount' | 'kind'>[], assets: Pick<LedgerAsset, 'type' | 'status'>[]): MonthStats {
  let spent = 0
  let refunded = 0
  for (const r of ledger) {
    if (r.kind === 'charge') spent += -r.amount
    else if (r.kind === 'refund') refunded++
  }
  const done = assets.filter((a) => a.status === 'completed')
  return { images: done.filter((a) => a.type === 'image').length, videos: done.filter((a) => a.type === 'video').length, spent, refunded }
}

export function useMonthStats(userId: string | null) {
  const [stats, setStats] = useState<MonthStats | null>(null)
  useEffect(() => {
    if (!userId) return
    const since = monthStart().toISOString()
    void Promise.all([
      supabase.from('credit_ledger').select('amount, kind').eq('user_id', userId).gte('created_at', since).limit(2000),
      supabase.from('assets').select('type, status').eq('user_id', userId).is('deleted_at', null).gte('created_at', since).limit(2000),
    ]).then(([l, a]) => setStats(summarizeMonth(l.data ?? [], a.data ?? [])))
  }, [userId])
  return stats
}
