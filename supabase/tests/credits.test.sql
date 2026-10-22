-- credits.test.sql — اختبارات دفتر الرصيد (CLAUDE.md القاعدة 9، المخطط §15 الطبقة 3)
-- يُشغَّل على القاعدة البعيدة داخل معاملة تُلغى دائمًا:
--   npx supabase db query --linked -f supabase/tests/credits.test.sql
-- أو في CI على Postgres محلي (انظر .github/workflows/ci.yml). لا يترك أي أثر.
-- أي فشل = exception برسالة تبدأ بـ T<n>. النجاح = صف واحد "ALL CREDIT TESTS PASSED".
-- T0–T8: دفتر الرصيد (0001/0002). T9–T11: حارس الأعمدة وسياسة INSERT وget_balance وreconcile_holds (0003).

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
  h2b  bigint;
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

  -- T7: أصل خُصم رصيده (a1 مؤكَّد) → حجز جديد له يُرفض ALREADY_CHARGED ولا يتغير الرصيد
  begin
    perform public.hold_credits(u, 5, a1);
    raise exception 'T7 should have failed';
  exception when others then
    if sqlerrm <> 'ALREADY_CHARGED' then
      raise exception 'T7 already charged: expected ALREADY_CHARGED, got %', sqlerrm;
    end if;
  end;
  if public.get_balance(u) <> 14 then
    raise exception 'T7 already charged: balance changed to %', public.get_balance(u);
  end if;

  -- T8: أصل حُرّر حجزه (a2) → إعادة المحاولة بنفس assetId تُنشئ حجزًا جديدًا (خصم واحد)
  h2b := public.hold_credits(u, 3, a2);
  if h2b = h2 then
    raise exception 'T8 re-hold after release: expected a new hold id, got the released one %', h2;
  end if;
  if public.get_balance(u) <> 11 then
    raise exception 'T8 re-hold after release: expected 11, got %', public.get_balance(u);
  end if;
  perform public.release_hold(h2b, 'test cleanup');
  if public.get_balance(u) <> 14 then
    raise exception 'T8 cleanup: expected 14, got %', public.get_balance(u);
  end if;
end $$;

-- =====================================================================
-- T9–T11: migration 0003 — حارس الأعمدة عبر PostgREST (request.jwt.claims)، سياسة INSERT، get_balance للمالك، reconcile_holds
-- محاكاة طلب الواجهة: set local role authenticated + request.jwt.claims (JSON) كما يفعل PostgREST ≥ 9.
-- =====================================================================
do $$
declare
  u    uuid := gen_random_uuid();
  u2   uuid := gen_random_uuid();
  a9   uuid := gen_random_uuid();
  aq   uuid := gen_random_uuid();   -- queued  + حجز قديم → تحرير + failed
  ap   uuid := gen_random_uuid();   -- processing + حجز قديم → تحرير + failed
  ac   uuid := gen_random_uuid();   -- completed + حجز قديم ما زال held → تأكيد (charge)
  af   uuid := gen_random_uuid();   -- failed + حجز قديم → تحرير
  an   uuid := gen_random_uuid();   -- processing + حجز حديث → لا يُمس
  n    int;
  r    record;
  acts text[];
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-' || u  || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-test-' || u2 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  -- أصل processing للمستخدم u (كما يكتبه السيرفر)
  insert into public.assets (id, user_id, type, status, provider, provider_job_id, cost_credits)
  values (a9, u, 'image', 'processing', 'replicate', 'job-t9', 11);

  -- ---- كمستخدم مسجّل (الواجهة) ----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);

  -- T9a: تعديل عمود مسموح (visibility) يمر ويصيب صفًا واحدًا — يثبت أن RLS وauth.uid() يعملان في هذه المحاكاة
  update public.assets set visibility = 'public' where id = a9;
  get diagnostics n = row_count;
  if n <> 1 then
    raise exception 'T9a own update: expected 1 row, got % (auth.uid() simulation broken?)', n;
  end if;

  -- T9b: أعمدة السيرفر (status/url/cost/provider/job/type/model) → FORBIDDEN_COLUMN_UPDATE
  for r in select unnest(array[
      'status = ''completed''', 'url = ''https://evil.invalid/x.png''', 'thumbnail_url = ''https://evil.invalid/t.png''',
      'cost_credits = 0', 'provider = ''fal''', 'provider_job_id = ''hijack''', 'type = ''video''', 'model = ''other''']) as stmt
  loop
    begin
      execute 'update public.assets set ' || r.stmt || ' where id = $1' using a9;
      raise exception 'T9b guard: update "%" should have failed', r.stmt;
    exception when others then
      if sqlerrm not like '%FORBIDDEN_COLUMN_UPDATE%' then
        raise exception 'T9b guard "%": expected FORBIDDEN_COLUMN_UPDATE, got %', r.stmt, sqlerrm;
      end if;
    end;
  end loop;

  -- T9c: إدراج queued نظيف يمر؛ إدراج بأعمدة السيرفر يُرفض بسياسة INSERT (42501)
  insert into public.assets (id, user_id, type, status, model, prompt) values (gen_random_uuid(), u, 'image', 'queued', 'nano-banana-pro', 'ok');
  for r in select unnest(array[
      'url', 'thumbnail_url', 'provider_job_id']) as col
  loop
    begin
      execute format('insert into public.assets (id, user_id, type, status, %I) values ($1, $2, ''image'', ''queued'', ''x'')', r.col) using gen_random_uuid(), u;
      raise exception 'T9c insert policy: column % should have been rejected', r.col;
    exception when others then
      if sqlstate <> '42501' then
        raise exception 'T9c insert policy "%": expected 42501 RLS violation, got % (%)', r.col, sqlstate, sqlerrm;
      end if;
    end;
  end loop;
  begin
    insert into public.assets (id, user_id, type, status, cost_credits) values (gen_random_uuid(), u, 'image', 'queued', 999);
    raise exception 'T9c insert policy: cost_credits should have been rejected';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T9c insert policy cost_credits: expected 42501, got %', sqlstate; end if;
  end;
  begin
    insert into public.assets (id, user_id, type, status, provider) values (gen_random_uuid(), u, 'image', 'queued', 'replicate');
    raise exception 'T9c insert policy: provider should have been rejected';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T9c insert policy provider: expected 42501, got %', sqlstate; end if;
  end;

  -- T10: get_balance للمالك فقط — رصيد مستخدم آخر يعود 0
  if public.get_balance(u) <> 30 then
    raise exception 'T10 own balance: expected 30, got %', public.get_balance(u);
  end if;
  if public.get_balance(u2) <> 0 then
    raise exception 'T10 other balance: expected 0 for another user, got %', public.get_balance(u2);
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ---- كخدمة (postgres) ----
  if public.get_balance(u2) <> 30 then
    raise exception 'T10 service balance: expected 30, got %', public.get_balance(u2);
  end if;

  -- T11: reconcile_holds — خمسة أصول لـu2، كل واحد بحجز 2
  insert into public.assets (id, user_id, type, status, provider, provider_job_id) values
    (aq, u2, 'image', 'queued',     null,        null),
    (ap, u2, 'image', 'processing', 'replicate', 'job-ap'),
    (ac, u2, 'image', 'completed',  'replicate', 'job-ac'),
    (af, u2, 'image', 'failed',     'replicate', 'job-af'),
    (an, u2, 'image', 'processing', 'replicate', 'job-an');
  perform public.hold_credits(u2, 2, aq);
  perform public.hold_credits(u2, 2, ap);
  perform public.hold_credits(u2, 2, ac);
  perform public.hold_credits(u2, 2, af);
  perform public.hold_credits(u2, 2, an);
  if public.get_balance(u2) <> 20 then
    raise exception 'T11 setup: expected 20, got %', public.get_balance(u2);
  end if;
  update public.credit_ledger set created_at = now() - interval '31 minutes'
  where asset_id in (aq, ap, ac, af) and kind = 'hold' and status = 'held';

  select array_agg(action order by hold_id) into acts from public.reconcile_holds();
  if coalesce(array_length(acts, 1), 0) <> 4 then
    raise exception 'T11 reconcile: expected 4 actions, got %', acts;
  end if;
  if public.get_balance(u2) <> 26 then
    raise exception 'T11 reconcile: expected 26 (charge 2 + fresh hold 2), got %', public.get_balance(u2);
  end if;
  select kind, status into r from public.credit_ledger where asset_id = ac and kind in ('hold', 'charge');
  if r.kind <> 'charge' or r.status <> 'posted' then
    raise exception 'T11 completed asset: expected charge/posted, got %/%', r.kind, r.status;
  end if;
  select count(*) into n from public.credit_ledger where asset_id in (aq, ap, af) and kind = 'refund' and status = 'released';
  if n <> 3 then
    raise exception 'T11 released: expected 3 refund rows, got %', n;
  end if;
  select count(*) into n from public.assets where id in (aq, ap) and status = 'failed' and error_message is not null;
  if n <> 2 then
    raise exception 'T11 timeout assets: expected queued+processing → failed, got %', n;
  end if;
  select status into r from public.assets where id = an;
  if r.status <> 'processing' then
    raise exception 'T11 fresh hold: asset should stay processing, got %', r.status;
  end if;
  select kind, status into r from public.credit_ledger where asset_id = an and kind = 'hold';
  if r.status <> 'held' then
    raise exception 'T11 fresh hold: should remain held, got %', r.status;
  end if;
  -- تشغيل ثانٍ لا يفعل شيئًا (idempotent)
  select count(*) into n from public.reconcile_holds();
  if n <> 0 then
    raise exception 'T11 idempotent: expected 0 actions on second run, got %', n;
  end if;
end $$;

select 'ALL CREDIT TESTS PASSED' as result;

rollback;
