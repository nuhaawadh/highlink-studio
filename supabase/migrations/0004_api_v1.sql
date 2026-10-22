-- =====================================================================
-- 0004_api_v1.sql — API عامة v1 (ADR 0004؛ ADR 0002 القرار 3)
--   مفاتيح API (hash فقط، hl_live_/hl_test_، حد يومي، آخر استخدام، إبطال)، عدّ يومي، idempotency،
--   سجل تسليم webhook العميل، وربط الأصل بالمفتاح. كل جدول مع RLS (القاعدة 3).
--   الإصدار/الإبطال من الواجهة عبر RPC بـauth.uid()؛ المصادقة والعدّ من Edge Function بـservice_role.
-- الاختبارات: supabase/tests/api.test.sql
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الجداول
-- ---------------------------------------------------------------------
create table public.api_keys (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.profiles(id) on delete cascade,
  name            text not null check (char_length(name) between 1 and 60),
  mode            text not null check (mode in ('live', 'test')),
  key_hash        text not null unique,                 -- sha256(hex) للمفتاح الكامل؛ المفتاح نفسه لا يُخزَّن
  key_hint        text not null,                        -- hl_live_…abcd للعرض
  daily_limit     int  not null check (daily_limit > 0),
  webhook_url     text check (webhook_url is null or webhook_url ~ '^https://'),
  webhook_secret  text not null,                        -- whsec_… لتوقيع webhook العميل (Standard Webhooks)
  last_used_at    timestamptz,
  revoked_at      timestamptz,
  created_at      timestamptz not null default now()
);
create index api_keys_user_idx on public.api_keys (user_id);

create table public.api_daily_usage (
  key_id    uuid not null references public.api_keys(id) on delete cascade,
  day       date not null,                              -- يوم UTC
  requests  int  not null default 0,
  primary key (key_id, day)
);

create table public.api_idempotency (
  key_id           uuid not null references public.api_keys(id) on delete cascade,
  idempotency_key  text not null check (char_length(idempotency_key) between 1 and 128),
  request_hash     text not null,                       -- sha256 للجسم المطبّع
  asset_id         uuid,
  status           int,                                 -- حالة HTTP للرد المخزَّن
  response         jsonb,                               -- الرد المخزَّن (null = قيد التنفيذ)
  created_at       timestamptz not null default now(),
  primary key (key_id, idempotency_key)
);

create table public.api_webhook_deliveries (
  id            bigserial primary key,
  key_id        uuid references public.api_keys(id) on delete set null,
  asset_id      uuid,
  event         text not null,                          -- asset.completed | asset.failed
  url           text not null,
  attempts      int  not null default 0,
  status_code   int,
  ok            boolean not null default false,
  last_error    text,
  created_at    timestamptz not null default now(),
  delivered_at  timestamptz
);
create index api_webhook_deliveries_asset_idx on public.api_webhook_deliveries (asset_id);

alter table public.assets add column api_key_id uuid references public.api_keys(id) on delete set null;
create index assets_api_key_idx on public.assets (api_key_id) where api_key_id is not null;

-- ---------------------------------------------------------------------
-- 2) RLS
-- ---------------------------------------------------------------------
alter table public.api_keys               enable row level security;
alter table public.api_daily_usage        enable row level security;
alter table public.api_idempotency        enable row level security;
alter table public.api_webhook_deliveries enable row level security;

create policy "api_keys: read own" on public.api_keys for select using (auth.uid() = user_id);
-- لا إدراج/تعديل/حذف من الواجهة: create_api_key / revoke_api_key فقط
create policy "api_daily_usage: read own" on public.api_daily_usage for select
  using (exists (select 1 from public.api_keys k where k.id = key_id and k.user_id = auth.uid()));
-- api_idempotency: service_role فقط (لا سياسات)
create policy "api_webhook_deliveries: read own" on public.api_webhook_deliveries for select
  using (exists (select 1 from public.api_keys k where k.id = key_id and k.user_id = auth.uid()));

-- الواجهة لا تربط أصلًا بمفتاح: الربط يكتبه السيرفر فقط (وإلا وصل webhook مستخدم إلى رابط مستخدم آخر)
drop policy if exists "assets: insert own queued" on public.assets;
create policy "assets: insert own queued" on public.assets for insert
  with check (
    auth.uid() = user_id
    and status = 'queued'
    and provider is null
    and provider_job_id is null
    and url is null
    and thumbnail_url is null
    and cost_credits is null
    and error_code is null
    and error_message is null
    and completed_at is null
    and api_key_id is null
  );

create or replace function public.assets_guard_user_update()
returns trigger
language plpgsql
as $$
begin
  if coalesce(auth.role(), '') <> 'service_role'
     and current_user not in ('postgres', 'supabase_admin', 'service_role') then
    if new.status is distinct from old.status
       or new.url is distinct from old.url
       or new.thumbnail_url is distinct from old.thumbnail_url
       or new.cost_credits is distinct from old.cost_credits
       or new.provider is distinct from old.provider
       or new.provider_job_id is distinct from old.provider_job_id
       or new.user_id is distinct from old.user_id
       or new.type is distinct from old.type
       or new.model is distinct from old.model
       or new.api_key_id is distinct from old.api_key_id then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 3) الدوال
-- ---------------------------------------------------------------------

-- إصدار مفتاح (من الواجهة): يرجع المفتاح الكامل مرة واحدة. الحد اليومي من الباقة؛ مفاتيح الاختبار 200.
create or replace function public.create_api_key(p_name text, p_mode text, p_webhook_url text default null)
returns table (id uuid, key text, key_hint text, webhook_secret text, daily_limit int, mode text)
language plpgsql
security definer
set search_path = public, extensions
as $$
#variable_conflict use_column
declare
  v_uid     uuid := auth.uid();
  v_plan    text;
  v_key     text;
  v_secret  text;
  v_hint    text;
  v_limit   int;
  v_active  int;
  v_id      uuid;
begin
  if v_uid is null then
    raise exception 'UNAUTHORIZED';
  end if;
  if p_mode is null or p_mode not in ('live', 'test') then
    raise exception 'INVALID_MODE';
  end if;
  if p_name is null or length(trim(p_name)) = 0 or length(p_name) > 60 then
    raise exception 'INVALID_NAME';
  end if;
  if p_webhook_url is not null and p_webhook_url !~ '^https://' then
    raise exception 'INVALID_WEBHOOK_URL';
  end if;

  select count(*) into v_active from public.api_keys k where k.user_id = v_uid and k.revoked_at is null;
  if v_active >= 10 then
    raise exception 'TOO_MANY_KEYS';
  end if;

  select p.plan_id into v_plan from public.profiles p where p.id = v_uid;
  v_limit := case
    when p_mode = 'test' then 200
    when v_plan = 'creators' then 5000
    when v_plan = 'pro' then 2000
    when v_plan in ('starter', 'basic') then 500
    else 50
  end;

  -- 24 بايت عشوائية → 32 حرف base64url بلا حشو
  v_key    := 'hl_' || p_mode || '_' || translate(rtrim(encode(gen_random_bytes(24), 'base64'), '='), '+/', '-_');
  v_secret := 'whsec_' || encode(gen_random_bytes(24), 'base64');
  v_hint   := 'hl_' || p_mode || '_…' || right(v_key, 4);

  insert into public.api_keys (user_id, name, mode, key_hash, key_hint, daily_limit, webhook_url, webhook_secret)
  values (v_uid, trim(p_name), p_mode, encode(digest(v_key, 'sha256'), 'hex'), v_hint, v_limit, p_webhook_url, v_secret)
  returning api_keys.id into v_id;

  id := v_id; key := v_key; key_hint := v_hint; webhook_secret := v_secret; daily_limit := v_limit; mode := p_mode;
  return next;
end;
$$;

-- إبطال مفتاح (من الواجهة): المالك فقط؛ true إن أُبطل الآن، false إن لم يوجد أو كان مُبطَلًا
create or replace function public.revoke_api_key(p_id uuid)
returns boolean
language plpgsql
security definer
set search_path = public
as $$
declare
  n int;
begin
  if auth.uid() is null then
    raise exception 'UNAUTHORIZED';
  end if;
  update public.api_keys set revoked_at = now()
  where id = p_id and user_id = auth.uid() and revoked_at is null;
  get diagnostics n = row_count;
  return n = 1;
end;
$$;

-- المصادقة (من Edge Function بـservice_role): hash → المفتاح النشط وصاحبه؛ p_count=true يزيد عدّ اليوم ذريًا ويرفض DAILY_LIMIT.
create or replace function public.api_authenticate(p_key_hash text, p_count boolean default false)
returns table (key_id uuid, user_id uuid, mode text, daily_limit int, used_today int, webhook_url text, webhook_secret text, plan_id text)
language plpgsql
security definer
set search_path = public
as $$
#variable_conflict use_column
declare
  k       public.api_keys%rowtype;
  v_used  int;
  v_plan  text;
  v_day   date := (now() at time zone 'utc')::date;
begin
  select * into k from public.api_keys a where a.key_hash = p_key_hash and a.revoked_at is null;
  if not found then
    return;
  end if;

  if p_count then
    insert into public.api_daily_usage as d (key_id, day, requests)
    values (k.id, v_day, 1)
    on conflict (key_id, day) do update set requests = d.requests + 1
    returning d.requests into v_used;
    if v_used > k.daily_limit then
      raise exception 'DAILY_LIMIT';   -- يلغي الزيادة أعلاه
    end if;
    update public.api_keys a set last_used_at = now() where a.id = k.id;
  else
    select d.requests into v_used from public.api_daily_usage d where d.key_id = k.id and d.day = v_day;
    v_used := coalesce(v_used, 0);
  end if;

  select p.plan_id into v_plan from public.profiles p where p.id = k.user_id;

  key_id := k.id; user_id := k.user_id; mode := k.mode; daily_limit := k.daily_limit; used_today := v_used;
  webhook_url := k.webhook_url; webhook_secret := k.webhook_secret; plan_id := v_plan;
  return next;
end;
$$;

-- ---------------------------------------------------------------------
-- 4) الصلاحيات
-- ---------------------------------------------------------------------
revoke execute on function public.create_api_key(text, text, text) from public, anon;
grant  execute on function public.create_api_key(text, text, text) to authenticated;
revoke execute on function public.revoke_api_key(uuid) from public, anon;
grant  execute on function public.revoke_api_key(uuid) to authenticated;
revoke execute on function public.api_authenticate(text, boolean) from public, anon, authenticated;
