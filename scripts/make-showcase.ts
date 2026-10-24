/**
 * معرض العرض من المنصة نفسها (المخطط §9) — غلاف لكل قالب، مقطع لكل عائلة نماذج، و3 محاولات للهيرو.
 * كل توليدة تمر بنفس مسار المستخدمين (صف assets queued → generate-media → webhook → التخزين)، فهي اختبار قبول أيضًا.
 * لا يطبع أي سر. يقرأ supabase/.env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) وapps/web/.env.local (VITE_SUPABASE_ANON_KEY).
 *
 * التشغيل (من جذر المستودع، يحتاج Node 18+):
 *   node apps/web/node_modules/jiti/lib/jiti-cli.mjs scripts/make-showcase.ts                 ← خطة وتكلفة فقط (لا توليد)
 *   node apps/web/node_modules/jiti/lib/jiti-cli.mjs scripts/make-showcase.ts --run --limit 3 ← تجربة على 3
 *   node apps/web/node_modules/jiti/lib/jiti-cli.mjs scripts/make-showcase.ts --run           ← الكل (يسأل قبل البدء)
 * خيارات: --only hero|families|templates  --force (يعيد ما وُلّد سابقًا)  --concurrency 6
 *   --budget <دولار>  سقف ما يُصرف عند fal في هذا التشغيل (يختار الأعلى أثرًا لكل دولار أولًا: صور العائلات، صور القوالب،
 *                     فيديوهات العائلات من الأرخص، فيديوهات القوالب، ثم الهيرو) — والباقي يُكمَل في تشغيل لاحق بلا تكرار
 *   --replicate-budget <دولار>  نفس السقف لـReplicate (القوالب بنص عربي)
 *   --key <مفتاح,مفتاح>  عناصر بعينها فقط (video:kling، ramadan-greeting، hero) — مع --force لإعادة توليدها
 *
 * ما يفعله عند --run: مستخدم مؤقت بباقة كريتورز (تزامن 8) + منحة رصيد بقدر التكلفة (دفتر الرصيد، نوع bonus)، يولّد،
 * ينسخ كل ناتج إلى media/showcase/… (عام)، يكتب content/showcase/showcase.json بعد كل نجاح، ثم يحذف المستخدم المؤقت وملفاته.
 * الانتظار هنا بالاستعلام كل بضع ثوانٍ — سكربت إداري، لا الواجهة (القاعدة 1 للواجهة).
 */
import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { createInterface } from 'node:readline/promises'
import { CREDIT_USD, MARKUP, modelCredits, type ModelPricingRow } from '../packages/shared/pricing'
import { EMPTY_SHOWCASE, familyKey, mergeShowcase, sampleValues, type ShowcaseFile, type ShowcaseMedia } from '../packages/shared/showcase'
import { missingFields, renderTemplatePrompt, type TemplateCatalog, type TemplateDef } from '../packages/shared/templates'

// يُشغَّل من جذر المستودع (التعليمات أعلاه)
const ROOT = process.cwd()
if (!existsSync(path.join(ROOT, 'content', 'showcase', 'plan.json'))) {
  console.error('run this from the repository root (content/showcase/plan.json not found)')
  process.exit(1)
}
const args = process.argv.slice(2)
const flag = (n: string) => args.includes(n)
const opt = (n: string) => (args.includes(n) ? args[args.indexOf(n) + 1] : undefined)
const RUN = flag('--run')
/** خطة بلا شبكة من content/catalog/models.generated.json (للمراجعة فقط — بلا صفوف Replicate اليدوية) */
const OFFLINE = flag('--offline')
const FORCE = flag('--force')
const ONLY = opt('--only')
const LIMIT = opt('--limit') ? Number(opt('--limit')) : Infinity
const BUDGET: Record<string, number> = {
  fal: opt('--budget') ? Number(opt('--budget')) : Infinity,
  replicate: opt('--replicate-budget') ? Number(opt('--replicate-budget')) : Infinity,
}
const CONCURRENCY = Math.min(8, Number(opt('--concurrency') ?? 6))
const KEYS = opt('--key') ? new Set(opt('--key')!.split(',').map((k) => k.trim()).filter(Boolean)) : null

// ------------------------------------------------------------------ إعداد
function readEnv(p: string): Record<string, string> {
  if (!existsSync(p)) return {}
  const out: Record<string, string> = {}
  for (const line of readFileSync(p, 'utf8').split(/\r?\n/)) {
    const s = line.trim()
    if (!s || s.startsWith('#') || !s.includes('=')) continue
    const i = s.indexOf('=')
    out[s.slice(0, i).trim()] = s.slice(i + 1).trim().replace(/^["']|["']$/g, '')
  }
  return out
}
const fnEnv = readEnv(path.join(ROOT, 'supabase', '.env.local'))
const webEnv = readEnv(path.join(ROOT, 'apps', 'web', '.env.local'))
const URL_ = (fnEnv.SUPABASE_URL || webEnv.VITE_SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE = fnEnv.SUPABASE_SERVICE_ROLE_KEY ?? ''
const ANON = webEnv.VITE_SUPABASE_ANON_KEY ?? ''
if (!OFFLINE && (!URL_ || !SERVICE || !ANON)) {
  console.error('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY in the .env.local files')
  process.exit(1)
}

const SHOWCASE_FILE = path.join(ROOT, 'content', 'showcase', 'showcase.json')
const plan = JSON.parse(readFileSync(path.join(ROOT, 'content', 'showcase', 'plan.json'), 'utf8')) as {
  hero: { model: string; duration: number; aspect: string; attempts: number; prompt: string }
  family_defaults: { video: { aspect: string[]; duration: number }; image: { aspect: string[] } }
  families: Record<string, string>
  template_values: Record<string, Record<string, string>>
}
/** مستوى كل نوع قالب في المعرض — نفس ما تعرضه بطاقات الحملات في الرئيسية */
const showcaseTiers = (JSON.parse(readFileSync(path.join(ROOT, 'content', 'showcase', 'campaigns.json'), 'utf8')) as { showcase_tiers: Record<string, string> }).showcase_tiers
const templates = JSON.parse(readFileSync(path.join(ROOT, 'content', 'templates', 'saudi.json'), 'utf8')) as TemplateCatalog
const current: ShowcaseFile = existsSync(SHOWCASE_FILE) ? JSON.parse(readFileSync(SHOWCASE_FILE, 'utf8')) : EMPTY_SHOWCASE

// ------------------------------------------------------------------ HTTP
function headers(key: string, bearer?: string): Record<string, string> {
  const h: Record<string, string> = { apikey: key, 'Content-Type': 'application/json' }
  if (bearer) h.Authorization = `Bearer ${bearer}`
  else if (key.startsWith('eyJ')) h.Authorization = `Bearer ${key}`
  return h
}
async function call(method: string, p: string, key: string, body?: unknown, bearer?: string, extra: Record<string, string> = {}): Promise<{ status: number; data: any }> {
  for (let attempt = 1; ; attempt++) {
    try {
      const res = await fetch(URL_ + p, {
        method,
        headers: { ...headers(key, bearer), ...extra },
        body: body === undefined ? undefined : JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      })
      const text = await res.text()
      let data: any = text
      try {
        data = text ? JSON.parse(text) : null
      } catch {
        /* نص */
      }
      return { status: res.status, data }
    } catch (e) {
      // انقطاع شبكة عابر (حادثة Supabase 2026-10-24): 3 محاولات ثم نرمي
      if (attempt >= 3) throw e
      await sleep(5_000 * attempt)
    }
  }
}
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

// ------------------------------------------------------------------ الخطة
interface ModelRow extends ModelPricingRow {
  id: string
  provider: string
  sort: number
  enabled: boolean
}
interface Job {
  section: 'hero' | 'families' | 'templates'
  key: string
  slug: string
  model: ModelRow
  kind: 'image' | 'video'
  prompt: string
  aspect: string
  config: Record<string, unknown>
  resolution: string | null
  cost: number
  template?: string
}

function pick<T>(preferred: T[], available: T[] | undefined, fallback: T): T {
  const list = available ?? []
  return preferred.find((p) => list.includes(p)) ?? list[0] ?? fallback
}
const s = (m: ModelRow) => (m.supports ?? {}) as Record<string, any>
const d = (m: ModelRow) => (m.default_params ?? {}) as Record<string, any>

function videoJob(section: Job['section'], key: string, slug: string, m: ModelRow, prompt: string, duration: number, aspects: string[]): Job {
  const durations: number[] = s(m).durations ?? []
  const dur = durations.length ? (durations.includes(duration) ? duration : (d(m).duration ?? durations[0])) : d(m).duration
  const resolution = d(m).resolution ?? null
  const aspect = pick(aspects, s(m).aspect_ratios, '16:9')
  const config = { aspectRatio: aspect, duration: dur, ...(resolution ? { resolution } : {}), audio: false }
  return { section, key, slug, model: m, kind: 'video', prompt, aspect, config, resolution, cost: modelCredits(m, { duration: dur, resolution: resolution ?? undefined, audio: false }) }
}
function imageJob(section: Job['section'], key: string, slug: string, m: ModelRow, prompt: string, aspects: string[], imageSize?: string): Job {
  const size = imageSize ?? d(m).imageSize ?? '1K'
  const aspect = pick(aspects, s(m).aspect_ratios, '1:1')
  return { section, key, slug, model: m, kind: 'image', prompt, aspect, config: { aspectRatio: aspect, imageSize: size }, resolution: size, cost: modelCredits(m, { imageSize: size as '1K' }) }
}

async function buildPlan(models: ModelRow[]): Promise<{ jobs: Job[]; skipped: string[] }> {
  const byId = new Map(models.map((m) => [m.id, m]))
  const jobs: Job[] = []
  const skipped: string[] = []
  const want = (sec: string) => !ONLY || ONLY === sec

  if (want('hero') && (FORCE || !current.hero.candidates.length)) {
    const m = byId.get(plan.hero.model)
    if (!m) skipped.push(`hero: model ${plan.hero.model} not enabled`)
    else for (let i = 1; i <= plan.hero.attempts; i++) jobs.push(videoJob('hero', `hero-${i}`, `hero-${i}`, m, plan.hero.prompt, plan.hero.duration, [plan.hero.aspect]))
  }

  if (want('families')) {
    const heads = new Map<string, ModelRow>()
    for (const m of models) {
      if (s(m).ui !== true) continue
      const k = familyKey(m.type, s(m).family ?? m.id)
      if (!heads.has(k)) heads.set(k, m)
    }
    for (const [k, m] of heads) {
      if (!FORCE && current.families[k]) continue
      const prompt = plan.families[k]
      if (!prompt) {
        skipped.push(`family ${k}: no prompt in plan.json`)
        continue
      }
      const slug = k.replace(':', '-')
      jobs.push(m.type === 'video' ? videoJob('families', k, slug, m, prompt, plan.family_defaults.video.duration, plan.family_defaults.video.aspect) : imageJob('families', k, slug, m, prompt, plan.family_defaults.image.aspect))
    }
  }

  if (want('templates')) {
    for (const t of templates.templates as TemplateDef[]) {
      if (!FORCE && current.templates[t.id]) continue
      const tiers = templates.tiers[t.tier_set]
      const tier = tiers.find((x) => x.key === showcaseTiers[t.tier_set]) ?? tiers[0]
      const m = byId.get(tier.model)
      if (!m) {
        skipped.push(`template ${t.id}: model ${tier.model} not enabled`)
        continue
      }
      const values = sampleValues(t, plan.template_values[t.id])
      if (missingFields(t, values).length) {
        skipped.push(`template ${t.id}: missing sample values`)
        continue
      }
      const prompt = renderTemplatePrompt(t, values)
      const job =
        t.tier_set === 'video'
          ? videoJob('templates', t.id, t.id, m, prompt, t.duration ?? 5, [t.aspect_ratio])
          : imageJob('templates', t.id, t.id, m, prompt, [t.aspect_ratio], tier.imageSize)
      if (t.tier_set === 'video' && tier.resolution) {
        job.config.resolution = tier.resolution
        job.resolution = tier.resolution
        job.cost = modelCredits(m, { duration: job.config.duration as number, resolution: tier.resolution, audio: false })
      }
      job.template = t.id
      jobs.push(job)
    }
  }
  if (KEYS) {
    const keep = jobs.filter((j) => KEYS.has(j.key) || (KEYS.has('hero') && j.section === 'hero'))
    jobs.length = 0
    jobs.push(...keep)
  }
  // بسقف ميزانية: الأعلى أثرًا لكل دولار أولًا، وما لا يتسع يُترك لتشغيل لاحق (يتخطى ما وُلّد)
  const budgeted = Object.values(BUDGET).some((b) => Number.isFinite(b))
  if (!budgeted) return { jobs: jobs.slice(0, LIMIT), skipped }
  const rank = (j: Job) => (j.section === 'families' ? (j.kind === 'image' ? 0 : 2) : j.section === 'templates' ? (j.kind === 'image' ? 1 : 3) : 4)
  const ordered = [...jobs].sort((a, b) => rank(a) - rank(b) || a.cost - b.cost)
  const left: Record<string, number> = { ...BUDGET }
  const picked: Job[] = []
  for (const j of ordered) {
    const usd = (j.cost * CREDIT_USD) / MARKUP
    const p = j.model.provider
    if ((left[p] ?? Infinity) < usd) {
      skipped.push(`${j.section}/${j.key}: over the ${p} budget this run ($${usd.toFixed(2)})`)
      continue
    }
    left[p] = (left[p] ?? Infinity) - usd
    picked.push(j)
  }
  return { jobs: picked.slice(0, LIMIT), skipped }
}

// ------------------------------------------------------------------ التنفيذ
async function main() {
  let models: unknown
  if (OFFLINE) {
    const gen = JSON.parse(readFileSync(path.join(ROOT, 'content', 'catalog', 'models.generated.json'), 'utf8')).models as ModelRow[]
    models = gen.filter((m) => m.enabled).map((m) => ({ ...m, provider: m.provider ?? 'fal' })).sort((a, b) => a.sort - b.sort)
  } else {
    const r = await call('GET', '/rest/v1/models?select=*&enabled=eq.true&order=sort.asc', SERVICE)
    if (r.status !== 200 || !Array.isArray(r.data)) throw new Error(`could not load models: HTTP ${r.status}`)
    models = r.data
  }
  const { jobs, skipped } = await buildPlan(models as ModelRow[])

  const usd = (credits: number) => (credits * CREDIT_USD) / MARKUP
  const total = jobs.reduce((a, j) => a + j.cost, 0)
  const byProvider: Record<string, number> = {}
  for (const j of jobs) byProvider[j.model.provider] = (byProvider[j.model.provider] ?? 0) + usd(j.cost)
  console.log(`\nshowcase plan: ${jobs.length} generation(s)`)
  for (const sec of ['hero', 'families', 'templates'] as const) {
    const js = jobs.filter((j) => j.section === sec)
    if (!js.length) continue
    console.log(`\n  ${sec} (${js.length}):`)
    for (const j of js) console.log(`    ${j.key.padEnd(28)} ${j.model.id.padEnd(26)} ${j.kind} ${j.aspect.padEnd(5)} ${String(j.cost).padStart(4)} cr`)
  }
  for (const x of skipped) console.log(`  skipped: ${x}`)
  console.log(`\n  total: ${total} credits ≈ provider cost $${usd(total).toFixed(2)} (${Object.entries(byProvider).map(([p, v]) => `${p} $${v.toFixed(2)}`).join(', ')})`)
  if (!RUN || OFFLINE) {
    console.log('\nplan only — add --run to generate (try --run --limit 3 first).')
    return
  }
  if (!jobs.length) return

  const rl = createInterface({ input: process.stdin, output: process.stdout })
  const answer = (await rl.question(`\nGenerate ${jobs.length} item(s) for about $${usd(total).toFixed(2)} of provider credit? Type yes: `)).trim()
  rl.close()
  if (answer !== 'yes') return console.log('cancelled')

  // مستخدم مؤقت بباقة كريتورز + منحة بقدر التكلفة
  const email = `showcase-${randomUUID().slice(0, 10)}@example.invalid`
  const password = randomUUID() + 'Aa1!'
  const created = await call('POST', '/auth/v1/admin/users', SERVICE, { email, password, email_confirm: true })
  const uid: string | undefined = created.data?.id
  if (!uid) throw new Error(`admin create user failed: HTTP ${created.status}`)
  let ok = 0
  let failed = 0
  try {
    const plan1 = await call('PATCH', `/rest/v1/profiles?id=eq.${uid}`, SERVICE, { plan_id: 'creators' }, undefined, { Prefer: 'return=minimal' })
    if (plan1.status >= 300) throw new Error(`set plan failed: HTTP ${plan1.status}`)
    const grant = await call('POST', '/rest/v1/rpc/grant_credits', SERVICE, { p_user: uid, p_amount: Math.ceil(total * 1.1) + 10, p_kind: 'bonus', p_ref: 'showcase' })
    if (grant.status >= 300) throw new Error(`grant failed: HTTP ${grant.status} ${JSON.stringify(grant.data).slice(0, 200)}`)
    const sess = await call('POST', '/auth/v1/token?grant_type=password', ANON, { email, password })
    const jwt: string | undefined = sess.data?.access_token
    if (!jwt) throw new Error(`sign-in failed: HTTP ${sess.status}`)

    let next = 0
    let shown = current
    const heroNew: ShowcaseMedia[] = []
    const stamp = new Date().toISOString().replace(/[-:]/g, '').slice(0, 13)
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++]
        const label = `${j.section}/${j.key}`
        try {
          const media = await runJob(j, uid, jwt, stamp)
          if (!media) {
            failed++
            continue
          }
          ok++
          if (j.section === 'hero') {
            heroNew.push(media)
            const candidates = FORCE ? heroNew : [...current.hero.candidates, ...heroNew]
            shown = mergeShowcase(shown, { generated_at: new Date().toISOString(), hero: { candidates, selected: current.hero.selected } })
          } else {
            shown = mergeShowcase(shown, { generated_at: new Date().toISOString(), [j.section]: { [j.key]: media } })
          }
          writeFileSync(SHOWCASE_FILE, JSON.stringify(shown, null, 2) + '\n')
          console.log(`  done ${label} (${ok + failed}/${jobs.length})`)
        } catch (e) {
          failed++
          console.log(`  FAIL ${label}: ${e instanceof Error ? e.message : String(e)}`)
        }
      }
    }
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, jobs.length) }, worker))
  } finally {
    const del = await call('DELETE', `/auth/v1/admin/users/${uid}`, SERVICE)
    const list = await call('POST', '/storage/v1/object/list/media', SERVICE, { prefix: `u/${uid}`, limit: 1000 })
    const names = Array.isArray(list.data) ? list.data.filter((o: any) => o?.name).map((o: any) => `u/${uid}/${o.name}`) : []
    if (names.length) await call('DELETE', '/storage/v1/object/media', SERVICE, { prefixes: names })
    console.log(`\ntemp user ${del.status < 300 ? 'deleted' : `NOT deleted (HTTP ${del.status})`}, ${names.length} temp file(s) cleaned`)
  }
  console.log(`\nshowcase: ${ok} ok, ${failed} failed → content/showcase/showcase.json`)
  if (ok) console.log('commit it: git add content/showcase/showcase.json && git commit -m "content: showcase media" && git push')
}

async function runJob(j: Job, uid: string, jwt: string, stamp: string): Promise<ShowcaseMedia | null> {
  const label = `${j.section}/${j.key}`
  const assetId = randomUUID()
  const ins = await call(
    'POST',
    '/rest/v1/assets',
    ANON,
    { id: assetId, user_id: uid, type: j.kind, status: 'queued', model: j.model.id, prompt: j.prompt, aspect_ratio: j.aspect, resolution: j.resolution, feature_tag: 'general' },
    jwt,
    { Prefer: 'return=minimal' },
  )
  if (ins.status >= 300) throw new Error(`insert asset HTTP ${ins.status} ${JSON.stringify(ins.data).slice(0, 200)}`)
  const gen = await call(
    'POST',
    '/functions/v1/generate-media',
    ANON,
    { assetId, model: j.model.id, prompt: j.prompt, config: j.config, feature_tag: 'general', locale: 'en', maxCredits: j.cost, ...(j.template ? { template: j.template } : {}) },
    jwt,
  )
  if (gen.status !== 200) {
    console.log(`  FAIL ${label}: generate-media HTTP ${gen.status} ${JSON.stringify(gen.data).slice(0, 240)}`)
    return null
  }
  console.log(`  started ${label} (${j.model.id}, ${gen.data?.cost ?? j.cost} cr)`)

  const deadline = Date.now() + (j.kind === 'video' ? 20 : 6) * 60_000
  let a: any = null
  while (Date.now() < deadline) {
    await sleep(6_000)
    const r = await call('GET', `/rest/v1/assets?id=eq.${assetId}&select=status,url,error_message,metadata`, ANON, undefined, jwt)
    a = Array.isArray(r.data) ? r.data[0] : null
    if (a && ['completed', 'failed', 'canceled'].includes(a.status)) break
  }
  if (!a || a.status !== 'completed' || !a.url) {
    console.log(`  FAIL ${label}: ${a?.status ?? 'timeout'} ${a?.error_message ?? ''}`)
    return null
  }
  const source: string | undefined = a.metadata?.storage_path
  if (!source) throw new Error('completed without storage_path')
  const ext = source.split('.').pop()
  const dest = `showcase/${j.section}/${j.slug}-${stamp}.${ext}`
  const copy = await call('POST', '/storage/v1/object/copy', SERVICE, { bucketId: 'media', sourceKey: source, destinationKey: dest })
  if (copy.status >= 300) throw new Error(`copy to ${dest} HTTP ${copy.status} ${JSON.stringify(copy.data).slice(0, 200)}`)
  return { url: `${URL_}/storage/v1/object/public/media/${dest}`, kind: j.kind, aspect: j.aspect, model: j.model.id, prompt: j.prompt, created_at: new Date().toISOString() }
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
