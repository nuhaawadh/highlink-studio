-- =====================================================================
-- 0007_studios.sql — الاستوديوهات (ADR 0006): تشغيل متعدد الصور بحجز ذرّي، التزامن بالتشغيل،
--   المعاينة للمشرف قبل التفعيل، ورفع المراجع إلى Supabase Storage تحت up/{uid}/
-- لا يحذف ولا يعدّل بيانات (القاعدة 8). الاختبارات: supabase/tests/credits.test.sql T15–T21
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) run_id: كل صور التشغيل الواحد تشترك فيه (تكتبه الواجهة عند الإدراج فقط)
-- ---------------------------------------------------------------------
alter table public.assets add column if not exists run_id uuid;
create index if not exists assets_run_idx on public.assets (run_id) where run_id is not null;

-- حارس الأعمدة (آخر نسخة في 0004) + run_id لا يتغير بعد الإدراج إلا من السيرفر
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
       or new.run_id is distinct from old.run_id then
      raise exception 'FORBIDDEN_COLUMN_UPDATE';
    end if;
  end if;
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- 2) المشرفون: معاينة الاستوديوهات المعطّلة وتشغيل المجموعة الذهبية
--    لا سياسات للواجهة إطلاقًا — الإضافة والقراءة من service_role/SQL فقط
-- ---------------------------------------------------------------------
create table if not exists public.app_admins (
  user_id    uuid primary key references public.profiles(id) on delete cascade,
  note       text,
  created_at timestamptz not null default now()
);
alter table public.app_admins enable row level security;

-- بلا معامل: لا يكشف إن كان مستخدم آخر مشرفًا
create or replace function public.is_app_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (select 1 from public.app_admins where user_id = auth.uid());
$$;

drop policy if exists "studios: read enabled" on public.studios;
drop policy if exists "studios: read enabled or admin" on public.studios;
create policy "studios: read enabled or admin" on public.studios
  for select using (enabled or public.is_app_admin());

-- ---------------------------------------------------------------------
-- 3) رفع المراجع: المستخدم يكتب تحت up/{uid}/ فقط (لا تعديل ولا حذف من الواجهة)
--    الأنواع والحد الأقصى يفرضهما bucket media (0002)، و25MB تفحصها الواجهة قبل الرفع.
-- ---------------------------------------------------------------------
drop policy if exists "media: users upload own refs" on storage.objects;
create policy "media: users upload own refs" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'media'
    and name like 'up/' || auth.uid()::text || '/%'
    and position('..' in name) = 0
  );

-- ---------------------------------------------------------------------
-- 4) claim_and_hold: حد التزامن يعدّ التشغيلات لا الصور
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

  select pl.max_concurrent into v_max
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  v_max := coalesce(v_max, 1);

  update public.assets
  set status = 'processing', provider = p_provider, cost_credits = p_amount, model = p_model, type = p_type
  where id = p_asset and user_id = p_user and status = 'queued';
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
-- 5) claim_and_hold_run: كل صور التشغيل أو لا شيء، في معاملة واحدة تحت قفل المستخدم
--    الشروط: 1–6 أصول مختلفة، كلها للمستخدم، queued، وبنفس run_id غير الفارغ → وإلا INVALID_RUN
--    ثم حد التزامن (التشغيل = واحد)، ثم الرصيد للإجمالي، ثم حجز لكل صورة (idempotent على الأصل).
--    يرجع عدد الحجوزات.
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

  select count(*), count(distinct a.run_id) into v_ok, v_runs
  from public.assets a
  where a.id = any(p_assets) and a.user_id = p_user and a.status = 'queued' and a.run_id is not null and a.deleted_at is null;
  if v_ok <> v_n or v_runs <> 1 then
    raise exception 'INVALID_RUN';
  end if;

  select pl.max_concurrent into v_max
  from public.profiles pr join public.plans pl on pl.id = pr.plan_id
  where pr.id = p_user;
  v_max := coalesce(v_max, 1);

  update public.assets
  set status = 'processing', provider = p_provider, cost_credits = p_amount_each, model = p_model, type = p_type
  where id = any(p_assets) and user_id = p_user and status = 'queued';
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
