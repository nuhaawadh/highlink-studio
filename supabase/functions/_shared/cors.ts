/** ترويسات CORS للوظائف التي تستدعيها الواجهة. الـwebhooks لا تحتاجها لكنها لا تضر. */
export const corsHeaders: Record<string, string> = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}

/** يرد على preflight؛ يرجع null إن لم يكن الطلب OPTIONS */
export function handleOptions(req: Request): Response | null {
  if (req.method !== 'OPTIONS') return null
  return new Response('ok', { headers: corsHeaders })
}
