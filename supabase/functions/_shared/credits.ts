import { toAppError } from './errors.ts'
import { supabaseAdmin } from './supabaseAdmin.ts'

/**
 * تغليف دوال SQL للرصيد (CLAUDE.md القاعدة 2): الكتابة في credit_ledger تمر من هنا فقط، بـservice_role.
 * - hold_credits idempotent على assetId (migration 0002): تكرار الطلب يعيد نفس الحجز.
 * - التأكيد/التحرير بالأصل لا بمعرّف الحجز، لأن الـwebhook لا يعرف إلا asset_id.
 */
export async function holdCredits(userId: string, amount: number, assetId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('hold_credits', { p_user: userId, p_amount: amount, p_asset: assetId })
  if (error) throw toAppError(new Error(error.message))
  return Number(data)
}

async function findActiveHold(assetId: string): Promise<number | null> {
  const { data, error } = await supabaseAdmin()
    .from('credit_ledger')
    .select('id')
    .eq('asset_id', assetId)
    .eq('kind', 'hold')
    .eq('status', 'held')
    .limit(1)
    .maybeSingle()
  if (error) throw toAppError(new Error(error.message))
  return data ? Number(data.id) : null
}

/** يحوّل الحجز إلى خصم نهائي. يرجع false إن لم يوجد حجز نشط (مؤكَّد أو محرَّر مسبقًا). */
export async function confirmAssetHold(assetId: string): Promise<boolean> {
  const holdId = await findActiveHold(assetId)
  if (holdId === null) return false
  const { error } = await supabaseAdmin().rpc('confirm_hold', { p_hold_id: holdId })
  if (error) throw toAppError(new Error(error.message))
  return true
}

/** يحرّر الحجز (استرداد كامل). يرجع false إن لم يوجد حجز نشط. */
export async function releaseAssetHold(assetId: string, note?: string): Promise<boolean> {
  const holdId = await findActiveHold(assetId)
  if (holdId === null) return false
  const { error } = await supabaseAdmin().rpc('release_hold', { p_hold_id: holdId, p_note: note ?? null })
  if (error) throw toAppError(new Error(error.message))
  return true
}

export async function getBalance(userId: string): Promise<number> {
  const { data, error } = await supabaseAdmin().rpc('get_balance', { p_user: userId })
  if (error) throw toAppError(new Error(error.message))
  return Number(data ?? 0)
}
