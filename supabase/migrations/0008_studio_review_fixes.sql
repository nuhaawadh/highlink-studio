-- =====================================================================
-- 0008_studio_review_fixes.sql — إصلاحات المراجعة المستقلة للاستوديو (2026-10-25، القاعدة 9)
--   C1: metadata يكتبها السيرفر فقط (حارس + سياسة إدراج)، وحالة بوابة الجودة في جدول studio_jobs بلا سياسات للواجهة.
--   C2: المحاولات المرفوضة في bucket خاص qa-private (لا قراءة عامة ولا سياسات).
--   I1: run_id لا يتجاوز حد التزامن: أصل له run_id لا يمر من claim_and_hold، والتشغيل يجب أن يضم كل أصول run_id.
-- لا حذف ولا تعديل بيانات (القاعدة 8). الاختبارات: supabase/tests/credits.test.sql T22–T24.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) C1: metadata ضمن أعمدة السيرفر في الحارس (آخر نسخة في 0007 + metadata)
-- ---------------------------------------------------------------------
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
       or new.api_key_id is distinct from old.api_key_id
       or new.run_id is distinct from old.run_id
       or new.metadata is distinct from old.metadata then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
  end if;
  return new;
end;
$$;

-- سياسة الإدراج (آخر نسخة في 0004) + metadata فارغة
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
    and metadata = '{}'::jsonb
  );

-- ---------------------------------------------------------------------
-- 2) C1/C2: studio_jobs — كل ما تحتاجه بوابة الجودة، يكتبه السيرفر فقط
--    (الإعدادات من الوصفة، المرجع المتحقق، المزوّد ومدخلاته، المحاولات المرفوضة بمساراتها الخاصة)
-- ---------------------------------------------------------------------
create table if not exists public.studio_jobs (
  asset_id        uuid primary key references public.assets(id) on delete cascade,
  user_id         uuid not null references public.profiles(id) on delete cascade,
  run_id          uuid not null,
  studio_id       text not null references public.studios(id),
  preset          text not null,
  scene           text,
  headline        text,
  output_key      text not null,
  reference_url   text not null,
  provider        text not null,
  provider_slug   text not null,
  provider_input  jsonb not null,
  qa_config       jsonb not null,
  retries_used    int not null default 0,
  judge_failures  int not null default 0,
  attempts        jsonb not null default '[]'::jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists studio_jobs_run_idx on public.studio_jobs (run_id);
alter table public.studio_jobs enable row level security;
-- لا سياسات: service_role فقط

-- ---------------------------------------------------------------------
-- 3) C2: bucket خاص للمحاولات المرفوضة — لا قراءة عامة ولا سياسات
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('qa-private', 'qa-private', false, 52428800, array['image/png', 'image/jpeg', 'image/webp'])
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

-- ---------------------------------------------------------------------
-- 4) I1: claim_and_hold للأصول بلا run_id فقط
-- ---------------------------------------------------------------------
create or replace function public.claim_and_hold(p_user uuid, p_asset uuid, p_amount int, p_provider text, p_model text, p_type text)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_max         int;
  v_processing  int;
  v_rows        int;
begin
  if p_amount <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  perform pg_advisory_xact_lock(hashtext(p_user::text));

  -- أصل ينتمي لتشغيل استوديو لا يُحجز منفردًا (وإلا يتجاوز حد التزامن داخل "تشغيل" قائم)
  if exists (select 1 from public.assets where id = p_asset and run_id is not null) then
    raise exception 'INVALID_RUN';
  end if;

  select pl.max_concurrent into v_max
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  v_max := coalesce(v_max, 1);

  update public.assets
  set status = 'processing', provider = p_provider, cost_credits = p_amount, model = p_model, type = p_type
  where id = p_asset and user_id = p_user and status = 'queued' and run_id is null and deleted_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'ALREADY_CLAIMED';
  end if;

  select count(distinct coalesce(a.run_id, a.id)) into v_processing
  from public.assets a
  where a.user_id = p_user and a.status = 'processing' and a.deleted_at is null;
  if v_processing > v_max then
    raise exception 'RATE_LIMITED';
  end if;

  return public.hold_credits(p_user, p_amount, p_asset);
end;
$$;
revoke execute on function public.claim_and_hold(uuid, uuid, int, text, text, text) from public, anon, authenticated;

-- ---------------------------------------------------------------------
-- 5) I1: claim_and_hold_run — التشغيل يضم كل أصول run_id (لأي مستخدم) ولا شيء غيرها
-- ---------------------------------------------------------------------
create or replace function public.claim_and_hold_run(p_user uuid, p_assets uuid[], p_amount_each int, p_provider text, p_model text, p_type text)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_n          int := coalesce(cardinality(p_assets), 0);
  v_max        int;
  v_processing int;
  v_ok         int;
  v_runs       int;
  v_run        uuid;
  v_rows       int;
  v_asset      uuid;
begin
  if p_amount_each is null or p_amount_each <= 0 then
    raise exception 'INVALID_AMOUNT';
  end if;
  if v_n < 1 or v_n > 6 or (select count(distinct x) from unnest(p_assets) x) <> v_n then
    raise exception 'INVALID_RUN';
  end if;

  perform pg_advisory_xact_lock(hashtext(p_user::text));

  select count(*), count(distinct a.run_id), min(a.run_id::text)::uuid into v_ok, v_runs, v_run
  from public.assets a
  where a.id = any(p_assets) and a.user_id = p_user and a.status = 'queued' and a.run_id is not null and a.deleted_at is null;
  if v_ok <> v_n or v_runs <> 1 then
    raise exception 'INVALID_RUN';
  end if;
  -- لا أصل آخر (لي أو لغيري) يحمل نفس run_id خارج هذا الطلب
  if exists (select 1 from public.assets where run_id = v_run and id <> all(p_assets)) then
    raise exception 'INVALID_RUN';
  end if;

  select pl.max_concurrent into v_max
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  v_max := coalesce(v_max, 1);

  update public.assets
  set status = 'processing', provider = p_provider, cost_credits = p_amount_each, model = p_model, type = p_type
  where id = any(p_assets) and user_id = p_user and status = 'queued' and deleted_at is null;
  get diagnostics v_rows = row_count;
  if v_rows <> v_n then
    raise exception 'ALREADY_CLAIMED';
  end if;

  select count(distinct coalesce(a.run_id, a.id)) into v_processing
  from public.assets a
  where a.user_id = p_user and a.status = 'processing' and a.deleted_at is null;
  if v_processing > v_max then
    raise exception 'RATE_LIMITED';
  end if;

  if public.get_balance(p_user) < p_amount_each * v_n then
    raise exception 'INSUFFICIENT_CREDITS';
  end if;

  foreach v_asset in array p_assets loop
    perform public.hold_credits(p_user, p_amount_each, v_asset);
  end loop;
  return v_n;
end;
$$;
revoke execute on function public.claim_and_hold_run(uuid, uuid[], int, text, text, text) from public, anon, authenticated;
