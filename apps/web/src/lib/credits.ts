import { useEffect, useState } from 'react'
import { supabase } from './supabase'

/**
 * الرصيد المتاح للمستخدم الحالي.
 * القاعدة (المخطط §4): الواجهة تقرأ get_balance() فقط ولا تكتب في credit_ledger أبدًا.
 * التحديث اللحظي: نشترك في INSERT على credit_ledger للمستخدم (كل حجز/خصم/استرداد صف جديد).
 */
export function useCredits(userId: string | null) {
  const [balance, setBalance] = useState<number | null>(null)
  const [loading, setLoading] = useState<boolean>(!!userId)

  useEffect(() => {
    if (!userId) {
      setBalance(null)
      setLoading(false)
      return
    }
    let active = true

    const refresh = async () => {
      const { data, error } = await supabase.rpc('get_balance', { p_user: userId })
      if (!active) return
      if (error) {
        console.error('[credits] get_balance failed:', error.message)
        return
      }
      setBalance(typeof data === 'number' ? data : Number(data ?? 0))
      setLoading(false)
    }

    void refresh()

    const channel = supabase
      .channel(`credits-${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'credit_ledger', filter: `user_id=eq.${userId}` },
        () => void refresh(),
      )
      .subscribe()

    const onVisible = () => {
      if (document.visibilityState === 'visible') void refresh()
    }
    document.addEventListener('visibilitychange', onVisible)

    return () => {
      active = false
      document.removeEventListener('visibilitychange', onVisible)
      void supabase.removeChannel(channel)
    }
  }, [userId])

  return { balance, loading }
}
