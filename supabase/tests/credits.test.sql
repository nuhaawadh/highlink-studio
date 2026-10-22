-- credits.test.sql — اختبارات دفتر الرصيد (CLAUDE.md القاعدة 9، المخطط §15 الطبقة 3)
-- يُشغَّل على القاعدة البعيدة داخل معاملة تُلغى دائمًا:
--   npx supabase db query --linked -f supabase/tests/credits.test.sql
-- أو في CI على Postgres محلي (انظر .github/workflows/ci.yml). لا يترك أي أثر.
-- أي فشل = exception برسالة تبدأ بـ T<n>. النجاح = صف واحد "ALL CREDIT TESTS PASSED".

begin;

do $$
declare
  u    uuid := gen_random_uuid();
  a1   uuid := gen_random_uuid();
  a2   uuid := gen_random_uuid();
  a3   uuid := gen_random_uuid();
  h1   bigint;
  h2   bigint;
  h3   bigint;
  h3b  bigint;
  n    int;
  r    record;
begin
  -- مستخدم مؤقت: trigger التسجيل ينشئ profile ويمنح 30 رصيدًا
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values (u, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'credits-test-' || u || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  if public.get_balance(u) <> 30 then
    raise exception 'T0 signup grant: expected 30, got %', public.get_balance(u);
  end if;

  -- T1: حجز 11 ثم تأكيد → الرصيد 19 وصف charge/posted بـ -11
  h1 := public.hold_credits(u, 11, a1);
  if public.get_balance(u) <> 19 then
    raise exception 'T1 hold: expected 19, got %', public.get_balance(u);
  end if;
  perform public.confirm_hold(h1);
  if public.get_balance(u) <> 19 then
    raise exception 'T1 confirm: expected 19, got %', public.get_balance(u);
  end if;
  select kind, status, amount into r from public.credit_ledger where id = h1;
  if r.kind <> 'charge' or r.status <> 'posted' or r.amount <> -11 then
    raise exception 'T1 confirm row: expected charge/posted/-11, got %/%/%', r.kind, r.status, r.amount;
  end if;

  -- T2: حجز 11 ثم تحرير → الرصيد يعود 19 وصف refund/released بـ 0
  h2 := public.hold_credits(u, 11, a2);
  if public.get_balance(u) <> 8 then
    raise exception 'T2 hold: expected 8, got %', public.get_balance(u);
  end if;
  perform public.release_hold(h2, 'test release');
  if public.get_balance(u) <> 19 then
    raise exception 'T2 release: expected 19, got %', public.get_balance(u);
  end if;
  select kind, status, amount into r from public.credit_ledger where id = h2;
  if r.kind <> 'refund' or r.status <> 'released' or r.amount <> 0 then
    raise exception 'T2 release row: expected refund/released/0, got %/%/%', r.kind, r.status, r.amount;
  end if;

  -- T3: تكرار الحجز لنفس assetId → نفس المعرّف، خصم واحد فقط (idempotency — المخطط §15 الطبقة 3)
  h3  := public.hold_credits(u, 5, a3);
  h3b := public.hold_credits(u, 5, a3);
  if h3 <> h3b then
    raise exception 'T3 idempotent hold: expected same hold id, got % and %', h3, h3b;
  end if;
  if public.get_balance(u) <> 14 then
    raise exception 'T3 idempotent hold: expected 14 (one deduction), got %', public.get_balance(u);
  end if;
  select count(*) into n from public.credit_ledger where asset_id = a3 and kind = 'hold';
  if n <> 1 then
    raise exception 'T3 idempotent hold: expected 1 hold row, got %', n;
  end if;

  -- T4: رصيد 14 وحجز 15 → INSUFFICIENT_CREDITS ولا صف جديد
  begin
    perform public.hold_credits(u, 15, gen_random_uuid());
    raise exception 'T4 should have failed';
  exception when others then
    if sqlerrm <> 'INSUFFICIENT_CREDITS' then
      raise exception 'T4 insufficient: expected INSUFFICIENT_CREDITS, got %', sqlerrm;
    end if;
  end;
  if public.get_balance(u) <> 14 then
    raise exception 'T4 insufficient: balance changed to %', public.get_balance(u);
  end if;

  -- T5: تحرير حجز مؤكَّد لا يفعل شيئًا (لا استرداد بعد الخصم)
  perform public.release_hold(h1, 'should be noop');
  if public.get_balance(u) <> 14 then
    raise exception 'T5 release after confirm: expected 14, got %', public.get_balance(u);
  end if;

  -- T6: webhook مكرر → on conflict do nothing يرجع 0 صفوف
  insert into public.webhook_events (source, event_id) values ('replicate', 'replicate:test-evt-1');
  insert into public.webhook_events (source, event_id) values ('replicate', 'replicate:test-evt-1')
    on conflict (event_id) do nothing;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'T6 webhook dedupe: expected 0 rows on duplicate, got %', n;
  end if;
end $$;

select 'ALL CREDIT TESTS PASSED' as result;

rollback;
