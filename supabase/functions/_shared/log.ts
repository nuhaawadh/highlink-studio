/** سطر JSON واحد في نهاية كل طلب (مهارة new-edge-fn). لا أسرار ولا برومبتات كاملة هنا. */
export function logRequest(entry: {
  fn: string
  user?: string | null
  asset?: string | null
  ms: number
  ok: boolean
  code?: string
  detail?: string
  [k: string]: unknown
}): void {
  console.log(JSON.stringify({ ts: new Date().toISOString(), ...entry }))
}
