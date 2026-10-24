-- =====================================================================
-- 0006_reconcile_cron.sql — backlog B15/B7: شبكة أمان الحجوزات تعمل تلقائيًا
--   pg_cron يستدعي كل 5 دقائق public.invoke_reconcile() التي ترسل عبر pg_net طلب POST
--   إلى Edge Function `reconcile` بالسر RECONCILE_SECRET.
--   السر ورابط المشروع يُقرآن من Supabase Vault وقت التشغيل — لا يُكتب أي سر في هذا الملف ولا في أمر المهمة.
--   تعبئة Vault: scripts/push-vault-secrets.py (يستدعي set_ops_secret بمفتاح service_role).
-- الاختبارات: supabase/tests/cron.test.sql
-- في CI (Postgres 16 بلا pg_cron/pg_net/Vault): الدوال تُنشأ، والإضافات والمهمة تُتخطّى.
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1) الإضافات (إن كانت متاحة — Supabase نعم، CI لا)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net with schema extensions';
  else
    raise notice '0006: pg_net not available — skipped';
  end if;
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron with schema pg_catalog';
  else
    raise notice '0006: pg_cron not available — skipped';
  end if;
end $$;

-- ---------------------------------------------------------------------
-- 2) set_ops_secret — كتابة سرّين تشغيليين فقط في Vault (service_role)
--    القيمة تصل كمعامل RPC (JSON عبر PostgREST)، فلا تظهر في SQL مكتوب.
-- ---------------------------------------------------------------------
create or replace function public.set_ops_secret(p_name text, p_value text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if p_name is null or p_name not in ('ops_project_url', 'ops_reconcile_secret') then
    raise exception 'INVALID_SECRET_NAME';
  end if;
  if p_value is null or length(p_value) < 8 then
    raise exception 'INVALID_SECRET_VALUE';
  end if;

  select s.id into v_id from vault.secrets s where s.name = p_name;
  if v_id is null then
    perform vault.create_secret(p_value, p_name, 'highlink ops secret (0006)');
  else
    perform vault.update_secret(v_id, p_value, p_name, 'highlink ops secret (0006)');
  end if;
end;
$$;

revoke execute on function public.set_ops_secret(text, text) from public, anon, authenticated;
grant  execute on function public.set_ops_secret(text, text) to service_role;

-- ---------------------------------------------------------------------
-- 3) invoke_reconcile — يقرأ الرابط والسر من Vault ويرسل الطلب عبر pg_net
--    يرجع معرّف طلب pg_net (الرد يُقرأ من net._http_response)، أو null إن غاب سر.
-- ---------------------------------------------------------------------
create or replace function public.invoke_reconcile()
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_url    text;
  v_secret text;
  v_id     bigint;
begin
  select d.decrypted_secret into v_url    from vault.decrypted_secrets d where d.name = 'ops_project_url';
  select d.decrypted_secret into v_secret from vault.decrypted_secrets d where d.name = 'ops_reconcile_secret';
  if v_url is null or v_secret is null then
    raise notice 'invoke_reconcile: ops_project_url / ops_reconcile_secret missing in Vault — run scripts/push-vault-secrets.py';
    return null;
  end if;

  select net.http_post(
    url                  := rtrim(v_url, '/') || '/functions/v1/reconcile',
    body                 := '{}'::jsonb,
    headers              := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || v_secret),
    timeout_milliseconds := 60000
  ) into v_id;
  return v_id;
end;
$$;

revoke execute on function public.invoke_reconcile() from public, anon, authenticated;
grant  execute on function public.invoke_reconcile() to service_role;

-- ---------------------------------------------------------------------
-- 4) المهمة: كل 5 دقائق (idempotent: تُحذف ثم تُنشأ)
-- ---------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    if exists (select 1 from cron.job where jobname = 'reconcile-every-5-min') then
      perform cron.unschedule('reconcile-every-5-min');
    end if;
    perform cron.schedule('reconcile-every-5-min', '*/5 * * * *', 'select public.invoke_reconcile()');
  else
    raise notice '0006: cron schema missing — job not scheduled';
  end if;
end $$;
