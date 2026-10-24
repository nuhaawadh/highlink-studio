// v1 — API عامة (ADR 0004؛ ADR 0002 القرار 3). بلا JWT (--no-verify-jwt): المصادقة بمفتاح API (hl_live_/hl_test_).
// المسارات: POST /v1/generate · GET /v1/assets/{id} · GET /v1/models · GET /v1/balance
// التوليد يمر بنواة generate-media نفسها (_shared/generate-core.ts): نفس التسعير والأمان والحجز والـwebhook.
// Idempotency-Key على POST /v1/generate، وwebhook موقّع إلى رابط العميل عند اكتمال الأصل (_shared/client-webhook.ts).
import { z } from 'npm:zod@4'
import { authenticateApiKey, rateLimitHeaders, sha256Hex, type ApiPrincipal } from '../_shared/api-auth.ts'
import { canonicalJson, parseApiRoute, toPublicAsset, type AssetRowForApi } from '../_shared/api-types.ts'
import { scheduleAssetWebhook } from '../_shared/client-webhook.ts'
import { handleOptions } from '../_shared/cors.ts'
import { getBalance } from '../_shared/credits.ts'
import { AppError, jsonResponse, toAppError } from '../_shared/errors.ts'
import { runGenerate } from '../_shared/generate-core.ts'
import { logRequest } from '../_shared/log.ts'
import { modelCredits, resolveDuration } from '../_shared/pricing.ts'
import { GenerateRequestSchema } from '../_shared/request.ts'
import { supabaseAdmin } from '../_shared/supabaseAdmin.ts'
import type { ModelRow } from '../_shared/types.ts'

const FN = 'v1'
const ASSET_COLUMNS = 'id, status, type, model, prompt, aspect_ratio, resolution, url, thumbnail_url, cost_credits, error_code, error_message, metadata, created_at, completed_at'

/** جسم POST /v1/generate = طلب الواجهة بلا assetId (السيرفر ينشئه) + رابط webhook اختياري لهذا الطلب */
const ApiGenerateSchema = GenerateRequestSchema.omit({ assetId: true }).extend({
  webhook_url: z.url({ protocol: /^https$/ }).max(2048).optional(),
})
const IdempotencyKey = z.string().min(1).max(128)

function apiError(err: AppError, extra: Record<string, string> = {}): Response {
  return jsonResponse({ error: { code: err.code, message: err.message } }, err.status, extra)
}

async function loadAsset(id: string, userId: string): Promise<AssetRowForApi | null> {
  const { data, error } = await supabaseAdmin()
    .from('assets')
    .select(ASSET_COLUMNS)
    .eq('id', id)
    .eq('user_id', userId)
    .is('deleted_at', null)
    .maybeSingle<AssetRowForApi>()
  if (error) throw toAppError(new Error(error.message))
  return data
}

async function handleGenerate(req: Request, p: ApiPrincipal, started: number): Promise<Response> {
  const db = supabaseAdmin()
  const raw = await req.json().catch(() => null)
  const parsed = ApiGenerateSchema.safeParse(raw)
  if (!parsed.success) {
    throw new AppError('INVALID_INPUT', undefined, { detail: parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ') })
  }
  const body = parsed.data
  const assetId = crypto.randomUUID()

  // Idempotency-Key: حجز الصف قبل التنفيذ؛ تكرار بنفس الجسم → الرد المخزَّن؛ جسم مختلف أو قيد التنفيذ → 409
  const idemHeader = req.headers.get('idempotency-key')
  const idem = idemHeader ? IdempotencyKey.safeParse(idemHeader.trim()) : null
  if (idemHeader && !idem?.success) throw new AppError('INVALID_INPUT', 'Idempotency-Key غير صالح (1–128 حرفًا)')
  const idemKey = idem?.success ? idem.data : null
  const requestHash = idemKey ? await sha256Hex(canonicalJson(body)) : null
  if (idemKey && requestHash) {
    const { error: insErr } = await db.from('api_idempotency').insert({ key_id: p.keyId, idempotency_key: idemKey, request_hash: requestHash, asset_id: assetId })
    if (insErr) {
      if (insErr.code !== '23505') throw toAppError(new Error(insErr.message))
      const { data: prev } = await db
        .from('api_idempotency')
        .select('request_hash, status, response')
        .eq('key_id', p.keyId)
        .eq('idempotency_key', idemKey)
        .maybeSingle<{ request_hash: string; status: number | null; response: unknown }>()
      if (!prev || prev.request_hash !== requestHash || prev.response == null || prev.status == null) {
        throw new AppError('IDEMPOTENCY_CONFLICT')
      }
      logRequest({ fn: FN, user: p.userId, ms: Date.now() - started, ok: true, code: 'IDEMPOTENT_REPLAY', key: p.keyId })
      return jsonResponse(prev.response, prev.status, { ...rateLimitHeaders(p), 'Idempotency-Replayed': 'true' })
    }
  }

  const finish = async (status: number, payload: unknown, extra: Record<string, string> = {}) => {
    if (idemKey) {
      // نخزّن 2xx و4xx (أخطاء العميل ثابتة)؛ 5xx يُحذف صفه ليُعاد الطلب
      if (status < 500) await db.from('api_idempotency').update({ status, response: payload }).eq('key_id', p.keyId).eq('idempotency_key', idemKey)
      else await db.from('api_idempotency').delete().eq('key_id', p.keyId).eq('idempotency_key', idemKey)
    }
    return jsonResponse(payload, status, { ...rateLimitHeaders(p), ...extra })
  }

  // صف الأصل (queued) مربوط بالمفتاح — ما تفعله الواجهة بصلاحية المستخدم نفعله هنا بـservice_role
  const { error: insAssetErr } = await db.from('assets').insert({
    id: assetId,
    user_id: p.userId,
    type: 'image',
    status: 'queued',
    model: body.model,
    prompt: body.prompt,
    feature_tag: body.feature_tag ?? 'general',
    api_key_id: p.keyId,
    metadata: { api: { key_id: p.keyId, mode: p.mode, webhook_url: body.webhook_url ?? null, idempotency_key: idemKey } },
  })
  if (insAssetErr) throw toAppError(new Error(insAssetErr.message))

  let res: Awaited<ReturnType<typeof runGenerate>>
  try {
    const { webhook_url: _w, ...generateBody } = body
    res = await runGenerate({ fn: FN, userId: p.userId, body: { ...generateBody, assetId }, sandbox: p.mode === 'test', started })
  } catch (e) {
    const err = toAppError(e)
    const balance = await getBalance(p.userId).catch(() => null)
    return await finish(err.status, { error: { code: err.code, message: err.message }, asset_id: assetId, balance })
  }
  // التوليد بدأ وحُجز الرصيد: أي فشل بعده (قراءة الأصل، webhook الاختبار) لا يُرجع 5xx — وإلا حُذف صف الـidempotency
  // وأعاد العميل الطلب فصارت مهمتان وخصمان (المراجعة المستقلة 2026-10-24)
  const row = await loadAsset(assetId, p.userId).catch(() => null)
  const asset = row ? toPublicAsset(row) : { id: assetId, status: res.sandbox ? 'completed' : 'processing' }
  if (res.sandbox) await scheduleAssetWebhook(assetId).catch(() => undefined)
  return await finish(res.sandbox ? 200 : 202, { asset, cost: res.cost, balance: res.balanceAfter, sandbox: res.sandbox === true })
}

async function handleModels(p: ApiPrincipal): Promise<Response> {
  const { data, error } = await supabaseAdmin()
    .from('models')
    .select('id, name_ar, name_en, type, cost_credits, cost_per_second, max_duration_s, supports, default_params, badge, sort')
    .eq('enabled', true)
    .order('sort', { ascending: true })
  if (error) throw toAppError(new Error(error.message))
  const models = (data ?? []).map((m) => {
    const supports = (m.supports ?? {}) as Record<string, unknown>
    const row = { ...m, type: m.type as ModelRow['type'], default_params: (m.default_params ?? {}) as Record<string, unknown> }
    const sizes = (Array.isArray(supports.sizes) ? supports.sizes : ['1K']) as Array<'1K' | '2K' | '4K'>
    const durations = Array.isArray(supports.durations) ? (supports.durations as number[]) : []
    const resolutions = Array.isArray(supports.resolutions) ? (supports.resolutions as string[]) : []
    // تكلفة كل خيار بنفس دالة الحجز (ADR 0005): للصور حسب الحجم، للفيديو حسب المدة بالدقة الافتراضية
    const costs: Record<string, number> = {}
    try {
      if (m.type === 'image') for (const s of sizes) costs[s] = modelCredits(row, { imageSize: s })
      else if (m.type === 'video') for (const d of durations.length ? durations : [resolveDuration(row, undefined) ?? 0]) if (d) costs[`${d}s`] = modelCredits(row, { duration: d })
    } catch {
      // صف بلا سعر صالح لا يُفترض أن يكون مفعّلًا؛ نرجعه بلا تكاليف بدل إسقاط القائمة كلها
    }
    return {
      id: m.id,
      name_ar: m.name_ar,
      name_en: m.name_en,
      type: m.type as ModelRow['type'],
      kind: (supports.kind as string | undefined) ?? (m.type === 'video' ? 't2v' : 't2i'),
      family: (supports.family as string | undefined) ?? null,
      cost_credits: m.cost_credits,
      cost_per_second: m.cost_per_second,
      max_duration_s: m.max_duration_s,
      costs,
      sizes: m.type === 'image' ? sizes : [],
      durations,
      resolutions,
      audio: supports.audio === true,
      ref_images: typeof supports.ref_images === 'number' ? supports.ref_images : 0,
      requires_ref: supports.requires_ref === true,
      aspect_ratios: Array.isArray(supports.aspect_ratios) ? supports.aspect_ratios : ['1:1'],
      default_params: m.default_params ?? {},
      badge: m.badge,
    }
  })
  return jsonResponse({ data: models }, 200, rateLimitHeaders(p))
}

async function handleBalance(p: ApiPrincipal): Promise<Response> {
  const balance = await getBalance(p.userId)
  return jsonResponse(
    { balance, currency: 'credits', mode: p.mode, plan: p.planId, daily_limit: p.dailyLimit, used_today: p.usedToday },
    200,
    rateLimitHeaders(p),
  )
}

async function handleAsset(p: ApiPrincipal, id: string): Promise<Response> {
  const row = await loadAsset(id, p.userId)
  if (!row) throw new AppError('NOT_FOUND', 'الأصل غير موجود')
  return jsonResponse({ asset: toPublicAsset(row) }, 200, rateLimitHeaders(p))
}

Deno.serve(async (req) => {
  const started = Date.now()
  const preflight = handleOptions(req)
  if (preflight) return preflight

  const route = parseApiRoute(new URL(req.url).pathname)
  let principal: ApiPrincipal | null = null
  try {
    if (route.name === 'unknown') throw new AppError('NOT_FOUND', 'مسار غير معروف')
    const wantsPost = route.name === 'generate'
    if (wantsPost && req.method !== 'POST') throw new AppError('METHOD_NOT_ALLOWED')
    if (!wantsPost && req.method !== 'GET') throw new AppError('METHOD_NOT_ALLOWED')

    principal = await authenticateApiKey(req, { count: wantsPost })

    switch (route.name) {
      case 'generate':
        return await handleGenerate(req, principal, started)
      case 'models':
        return await handleModels(principal)
      case 'balance':
        return await handleBalance(principal)
      case 'asset':
        return await handleAsset(principal, route.id)
      default:
        throw new AppError('NOT_FOUND', 'مسار غير معروف')
    }
  } catch (e) {
    const err = toAppError(e)
    logRequest({ fn: FN, user: principal?.userId ?? null, ms: Date.now() - started, ok: false, code: err.code, detail: err.detail, route: route.name })
    return apiError(err, principal ? rateLimitHeaders(principal) : {})
  }
})
