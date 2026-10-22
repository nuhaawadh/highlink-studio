-- =====================================================================
-- 0001_init.sql — استوديو هاي لينك (المخطط §4)
-- الجداول الأساسية + RLS + دفتر الرصيد + الدوال + trigger التسجيل
-- القاعدة: الواجهة تقرأ؛ الكتابة في الرصيد والمدفوعات حصرًا عبر service_role
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- 1) الخطط (مرجع ثابت تُزرع من seed.sql)
-- ---------------------------------------------------------------------
create table public.plans (
  id                  text primary key,            -- free | starter | basic | pro | creators
  name_ar             text not null,
  name_en             text not null,
  monthly_credits     int  not null check (monthly_credits >= 0),
  price_sar_monthly   numeric(10,2),
  price_sar_yearly    numeric(10,2),
  max_concurrent      int  not null default 2,
  private_by_default  boolean not null default false,
  sort                int  not null default 0
);

-- ---------------------------------------------------------------------
-- 2) المستخدم
-- ---------------------------------------------------------------------
create table public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  username               text unique,
  display_name           text,
  avatar_url             text,
  plan_id                text not null references public.plans(id) default 'free',
  locale                 text not null default 'ar',
  auto_refill_threshold  int,                      -- المخطط §14 (1): تعبئة تلقائية — لاحقًا
  auto_refill_credits    int,
  created_at             timestamptz not null default now()
);

create table public.subscriptions (
  id                    uuid primary key default gen_random_uuid(),
  user_id               uuid not null references public.profiles(id) on delete cascade,
  plan_id               text not null references public.plans(id),
  status                text not null check (status in ('active','past_due','canceled','trialing')),
  provider              text not null default 'moyasar',
  provider_customer_id  text,
  provider_token        text,                      -- توكن البطاقة المحفوظ (ليس رقم البطاقة)
  current_period_start  timestamptz,
  current_period_end    timestamptz,
  cancel_at_period_end  boolean not null default false,
  created_at            timestamptz not null default now()
);
create index subscriptions_user_idx on public.subscriptions (user_id);

-- ---------------------------------------------------------------------
-- 3) دفتر الرصيد — الرصيد = مجموع الحركات، لا عمود يُعدَّل
-- ---------------------------------------------------------------------
create table public.credit_ledger (
  id          bigserial primary key,
  user_id     uuid not null references public.profiles(id) on delete cascade,
  amount      int  not null,                        -- موجب = إضافة، سالب = خصم/حجز
  kind        text not null check (kind in ('grant','hold','charge','refund','expire','bonus','adjust')),
  status      text not null default 'posted' check (status in ('held','posted','released')),
  asset_id    uuid,
  ref         text,                                 -- معرّف الدفعة / الكوبون / السبب
  note        text,
  expires_at  timestamptz,                          -- الرصيد الشهري ينتهي بنهاية الدورة
  created_at  timestamptz not null default now()
);
create index credit_ledger_user_status_idx on public.credit_ledger (user_id, status);
create index credit_ledger_asset_idx on public.credit_ledger (asset_id) where asset_id is not null;

-- ---------------------------------------------------------------------
-- 4) المشاريع والأصول
-- ---------------------------------------------------------------------
create table public.projects (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references public.profiles(id) on delete cascade,
  name        text not null,
  created_at  timestamptz not null default now(),
  deleted_at  timestamptz
);
create index projects_user_idx on public.projects (user_id);

create table public.assets (
  id               uuid primary key,                -- تنشئه الواجهة (crypto.randomUUID) قبل الاستدعاء
  user_id          uuid not null references public.profiles(id) on delete cascade,
  project_id       uuid references public.projects(id) on delete set null,
  type             text not null check (type in ('image','video','audio')),
  status           text not null default 'queued'
                   check (status in ('queued','processing','completed','failed','canceled')),
  feature_tag      text,                            -- general | product | ads | ugc | shots | storyboard | characters
  model            text,
  prompt           text,
  negative_prompt  text,
  aspect_ratio     text,
  duration_s       numeric,
  resolution       text,
  input_urls       text[],
  url              text,
  thumbnail_url    text,
  provider         text check (provider in ('replicate','fal','google')),
  provider_job_id  text,
  cost_credits     int,
  error_code       text,
  error_message    text,
  visibility       text not null default 'private' check (visibility in ('private','public')),
  metadata         jsonb not null default '{}'::jsonb,
  created_at       timestamptz not null default now(),
  completed_at     timestamptz,
  deleted_at       timestamptz                      -- حذف منطقي فقط (CLAUDE.md قاعدة 8)
);
create index assets_user_created_idx on public.assets (user_id, created_at desc);
create index assets_user_status_idx  on public.assets (user_id, status);
create unique index assets_provider_job_idx on public.assets (provider, provider_job_id) where provider_job_id is not null;

-- ---------------------------------------------------------------------
-- 5) كتالوج النماذج والاستوديوهات — تُدار من البيانات لا من الكود
-- ---------------------------------------------------------------------
create table public.models (
  id               text primary key,                -- nano-banana-pro | kling-v3-turbo ...
  name_ar          text not null,
  name_en          text not null,
  type             text not null check (type in ('image','video','audio')),
  provider         text not null check (provider in ('replicate','fal','google')),
  provider_slug    text not null,
  fallback_slug    text,                            -- المخطط §13: بديل fal لنفس النموذج
  cost_credits     int,
  cost_per_second  numeric,
  max_duration_s   int,
  supports         jsonb not null default '{}'::jsonb,
  default_params   jsonb not null default '{}'::jsonb,
  input_schema     jsonb,                           -- المخطط §15: مخطط OpenAPI من المزوّد، يُتحقق به قبل الحجز
  enabled          boolean not null default true,
  rollout_pct      int not null default 100 check (rollout_pct between 0 and 100),
  badge            text,
  sort             int not null default 0
);

create table public.studios (
  id              text primary key,                 -- product-shot | ads-grid | ugc ...
  name_ar         text not null,
  description_ar  text,
  icon            text,
  badge           text,
  pipeline        jsonb not null,                   -- الوصفة السميكة (المخطط §16)
  cost_credits    int,
  enabled         boolean not null default true,
  sort            int not null default 0
);

-- ---------------------------------------------------------------------
-- 6) المدفوعات وأحداث المزوّدين
-- ---------------------------------------------------------------------
create table public.payments (
  id                   uuid primary key default gen_random_uuid(),
  user_id              uuid references public.profiles(id) on delete set null,
  amount_sar           numeric(10,2) not null,
  vat_sar              numeric(10,2) not null default 0,
  credits              int not null default 0,
  provider             text not null default 'moyasar',
  provider_payment_id  text unique,
  status               text not null default 'initiated'
                       check (status in ('initiated','paid','failed','refunded')),
  raw                  jsonb,
  created_at           timestamptz not null default now()
);

create table public.webhook_events (
  id            bigserial primary key,
  source        text not null,                      -- replicate | fal | moyasar
  event_id      text not null unique,               -- يمنع المعالجة المكررة
  payload       jsonb,
  processed_at  timestamptz,
  created_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 7) الدوال: الرصيد
-- ---------------------------------------------------------------------

-- الرصيد المتاح: المرحّل + المحجوز (سالب)، مع استبعاد المنتهي
create or replace function public.get_balance(p_user uuid)
returns int
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(sum(amount), 0)::int
  from public.credit_ledger
  where user_id = p_user
    and status in ('posted', 'held')
    and (expires_at is null or expires_at > now());
$$;

-- حجز ذرّي قبل التوليد — يُستدعى من Edge Functions فقط (service_role)
create or replace function public.hold_credits(p_user uuid, p_amount int, p_asset uuid)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));
  if public.get_balance(p_user) < p_amount then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;
  insert into public.credit_ledger (user_id, amount, kind, status, asset_id)
  values (p_user, -p_amount, 'hold', 'held', p_asset)
  returning id into v_id;
  return v_id;
end;
$$;

-- تأكيد الخصم عند نجاح التوليد
create or replace function public.confirm_hold(p_hold_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update public.credit_ledger
  set kind = 'charge', status = 'posted'
  where id = p_hold_id and status = 'held';
$$;

-- تحرير الحجز (استرداد) عند الفشل
create or replace function public.release_hold(p_hold_id bigint, p_note text default null)
returns void
language sql
security definer
set search_path = public
as $$
  update public.credit_ledger
  set kind = 'refund', status = 'released', amount = 0, note = coalesce(p_note, note)
  where id = p_hold_id and status = 'held';
$$;

-- منح رصيد (دفعة، هدية، شهري) — service_role فقط
create or replace function public.grant_credits(p_user uuid, p_amount int, p_kind text, p_ref text default null, p_expires timestamptz default null)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id bigint;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if p_kind not in ('grant','bonus','adjust') then
    raise exception 'INVALID_KIND';
  end if;
  insert into public.credit_ledger (user_id, amount, kind, status, ref, expires_at)
  values (p_user, p_amount, p_kind, 'posted', p_ref, p_expires)
  returning id into v_id;
  return v_id;
end;
$$;

-- الدوال الحساسة لا تُستدعى من الواجهة
revoke execute on function public.hold_credits(uuid, int, uuid)                       from public, anon, authenticated;
revoke execute on function public.confirm_hold(bigint)                                from public, anon, authenticated;
revoke execute on function public.release_hold(bigint, text)                          from public, anon, authenticated;
revoke execute on function public.grant_credits(uuid, int, text, text, timestamptz)   from public, anon, authenticated;
grant  execute on function public.get_balance(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- 8) trigger: إنشاء profile عند التسجيل + 30 رصيدًا مجانيًا (مرة واحدة)
-- ---------------------------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url, locale)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url',
    'ar'
  )
  on conflict (id) do nothing;

  insert into public.credit_ledger (user_id, amount, kind, status, ref, note)
  values (new.id, 30, 'grant', 'posted', 'signup', 'رصيد ترحيبي');

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ---------------------------------------------------------------------
-- 9) حماية الأعمدة الحساسة في assets من الواجهة
--    (الواجهة تعدّل visibility/project_id/metadata فقط؛ الحالة والروابط والتكلفة من السيرفر)
-- ---------------------------------------------------------------------
create or replace function public.assets_guard_user_update()
returns trigger
language plpgsql
as $$
begin
  if current_setting('request.jwt.claim.role', true) = 'authenticated' then
    if new.status is distinct from old.status
       or new.url is distinct from old.url
       or new.thumbnail_url is distinct from old.thumbnail_url
       or new.cost_credits is distinct from old.cost_credits
       or new.provider is distinct from old.provider
       or new.provider_job_id is distinct from old.provider_job_id
       or new.user_id is distinct from old.user_id then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
  end if;
  return new;
end;
$$;

create trigger assets_guard_user_update
  before update on public.assets
  for each row execute function public.assets_guard_user_update();

-- ---------------------------------------------------------------------
-- 10) RLS — كل جدول محمي، لا استثناء
-- ---------------------------------------------------------------------
alter table public.plans          enable row level security;
alter table public.profiles       enable row level security;
alter table public.subscriptions  enable row level security;
alter table public.credit_ledger  enable row level security;
alter table public.projects       enable row level security;
alter table public.assets         enable row level security;
alter table public.models         enable row level security;
alter table public.studios        enable row level security;
alter table public.payments       enable row level security;
alter table public.webhook_events enable row level security;

-- مراجع عامة للقراءة
create policy "plans: public read"   on public.plans   for select using (true);
create policy "models: read enabled" on public.models  for select using (enabled);
create policy "studios: read enabled" on public.studios for select using (enabled);

-- profiles
create policy "profiles: read own"   on public.profiles for select using (auth.uid() = id);
create policy "profiles: update own" on public.profiles for update using (auth.uid() = id) with check (auth.uid() = id);

-- subscriptions / ledger / payments: قراءة فقط للمالك؛ الكتابة عبر service_role (يتجاوز RLS)
create policy "subscriptions: read own" on public.subscriptions for select using (auth.uid() = user_id);
create policy "ledger: read own"        on public.credit_ledger for select using (auth.uid() = user_id);
create policy "payments: read own"      on public.payments      for select using (auth.uid() = user_id);

-- projects
create policy "projects: read own"   on public.projects for select using (auth.uid() = user_id and deleted_at is null);
create policy "projects: insert own" on public.projects for insert with check (auth.uid() = user_id);
create policy "projects: update own" on public.projects for update using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- assets
create policy "assets: read own or public" on public.assets for select
  using ((auth.uid() = user_id and deleted_at is null) or (visibility = 'public' and deleted_at is null));
create policy "assets: insert own queued" on public.assets for insert
  with check (auth.uid() = user_id and status = 'queued');
create policy "assets: update own" on public.assets for update
  using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- webhook_events: لا وصول من الواجهة إطلاقًا (service_role فقط)

-- ---------------------------------------------------------------------
-- 11) Realtime — الجداول التي تستمع لها الواجهة (المخطط §3)
-- ---------------------------------------------------------------------
alter publication supabase_realtime add table public.assets;
alter publication supabase_realtime add table public.credit_ledger;
alter publication supabase_realtime add table public.profiles;
