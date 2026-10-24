-- cron.test.sql — جدولة reconcile من داخل القاعدة (backlog B15، migration 0006)
-- يُشغَّل على السحابة داخل معاملة تُلغى دائمًا:
--   npx supabase db query --linked -f supabase/tests/cron.test.sql
-- وفي CI على Postgres 16 بلا pg_cron/pg_net/Vault: فحوص المهمة تُتخطّى، وفحوص الصلاحيات والقائمة البيضاء تعمل.
-- النجاح = صف واحد "ALL CRON TESTS PASSED".

begin;

do $$
declare
  n int;
begin
  -- T1: لا الواجهة ولا الزائر يستدعيان الدالتين (service_role / مالك المهمة فقط)
  if has_function_privilege('authenticated', 'public.invoke_reconcile()', 'execute') then
    raise exception 'T1 invoke_reconcile executable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.invoke_reconcile()', 'execute') then
    raise exception 'T1 invoke_reconcile executable by anon';
  end if;
  if has_function_privilege('authenticated', 'public.set_ops_secret(text, text)', 'execute') then
    raise exception 'T1 set_ops_secret executable by authenticated';
  end if;
  if has_function_privilege('anon', 'public.set_ops_secret(text, text)', 'execute') then
    raise exception 'T1 set_ops_secret executable by anon';
  end if;
  if not has_function_privilege('service_role', 'public.set_ops_secret(text, text)', 'execute') then
    raise exception 'T1 set_ops_secret not executable by service_role';
  end if;

  -- T2: القائمة البيضاء — أي اسم آخر يُرفض قبل لمس Vault
  begin
    perform public.set_ops_secret('anything_else', 'xxxxxxxxxxxxxxxx');
    raise exception 'T2 should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_SECRET_NAME' then
      raise exception 'T2 whitelist: expected INVALID_SECRET_NAME, got %', sqlerrm;
    end if;
  end;

  -- T3: قيمة فارغة أو قصيرة تُرفض
  begin
    perform public.set_ops_secret('ops_reconcile_secret', 'short');
    raise exception 'T3 should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_SECRET_VALUE' then
      raise exception 'T3 value: expected INVALID_SECRET_VALUE, got %', sqlerrm;
    end if;
  end;

  -- T4: المهمة مجدولة كل 5 دقائق، وأمرها لا يحوي أي سر (السر يُقرأ من Vault وقت التشغيل)
  if exists (select 1 from pg_namespace where nspname = 'cron') then
    execute $q$
      select count(*) from cron.job
      where jobname = 'reconcile-every-5-min'
        and schedule = '*/5 * * * *'
        and command = 'select public.invoke_reconcile()'
        and active
    $q$ into n;
    if n <> 1 then
      raise exception 'T4 cron job: expected 1 active job reconcile-every-5-min, got %', n;
    end if;
  else
    raise notice 'T4 skipped: pg_cron not installed (CI)';
  end if;
end $$;

select 'ALL CRON TESTS PASSED' as result;

rollback;
