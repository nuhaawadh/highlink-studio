-- credits.test.sql — اختبارات دفتر الرصيد (CLAUDE.md القاعدة 9، المخطط §15 الطبقة 3)
-- يُشغَّل على القاعدة البعيدة داخل معاملة تُلغى دائمًا:
--   npx supabase db query --linked -f supabase/tests/credits.test.sql
-- أو في CI على Postgres محلي (انظر .github/workflows/ci.yml). لا يترك أي أثر.
-- أي فشل = exception برسالة تبدأ بـ T<n>. النجاح = صف واحد "ALL CREDIT TESTS PASSED".
-- T0–T8: دفتر الرصيد (0001/0002). T9–T11: حارس الأعمدة وسياسة INSERT وget_balance وreconcile_holds (0003). T25: حارس profiles (0009).

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
  av   uuid := gen_random_uuid();   -- فيديو processing 31 د → تحت مهلة الفيديو
  avo  uuid := gen_random_uuid();   -- فيديو processing 121 د → provider_check
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

  -- T11: reconcile_holds (0005: مهلة حسب النوع — صورة 30 د، فيديو 120 د — وprocessing بمهمة يُترك للمزوّد)
  --   سبعة أصول لـu2، كل واحد بحجز 2
  insert into public.assets (id, user_id, type, status, provider, provider_job_id) values
    (aq,  u2, 'image', 'queued',     null,        null),       -- قديم → تحرير + failed
    (ap,  u2, 'image', 'processing', 'replicate', 'job-ap'),   -- قديم بمهمة → provider_check بلا تغيير
    (ac,  u2, 'image', 'completed',  'replicate', 'job-ac'),   -- قديم → تأكيد
    (af,  u2, 'image', 'failed',     'replicate', 'job-af'),   -- قديم → تحرير
    (an,  u2, 'image', 'processing', 'replicate', 'job-an'),   -- حديث → لا يُمس
    (av,  u2, 'video', 'processing', 'replicate', 'job-av'),   -- فيديو 31 د → تحت مهلة الفيديو، لا يُدرج
    (avo, u2, 'video', 'processing', 'replicate', 'job-avo');  -- فيديو 121 د → provider_check
  perform public.hold_credits(u2, 2, aq);
  perform public.hold_credits(u2, 2, ap);
  perform public.hold_credits(u2, 2, ac);
  perform public.hold_credits(u2, 2, af);
  perform public.hold_credits(u2, 2, an);
  perform public.hold_credits(u2, 2, av);
  perform public.hold_credits(u2, 2, avo);
  if public.get_balance(u2) <> 16 then
    raise exception 'T11 setup: expected 16, got %', public.get_balance(u2);
  end if;
  update public.credit_ledger set created_at = now() - interval '31 minutes'
  where asset_id in (aq, ap, ac, af, av) and kind = 'hold' and status = 'held';
  update public.credit_ledger set created_at = now() - interval '121 minutes'
  where asset_id = avo and kind = 'hold' and status = 'held';

  select array_agg(action order by hold_id) into acts from public.reconcile_holds();
  if acts is distinct from array['released_timeout', 'provider_check', 'confirmed', 'released', 'provider_check'] then
    raise exception 'T11 reconcile actions: got %', acts;
  end if;
  -- aq وaf حُرّرا (+4)، ac صار charge (-2)، ap وan وav وavo ما زالت held (-8) → 30 - 2 - 8 = 20
  if public.get_balance(u2) <> 20 then
    raise exception 'T11 reconcile: expected 20, got %', public.get_balance(u2);
  end if;
  select kind, status into r from public.credit_ledger where asset_id = ac and kind in ('hold', 'charge');
  if r.kind <> 'charge' or r.status <> 'posted' then
    raise exception 'T11 completed asset: expected charge/posted, got %/%', r.kind, r.status;
  end if;
  select count(*) into n from public.credit_ledger where asset_id in (aq, af) and kind = 'refund' and status = 'released';
  if n <> 2 then
    raise exception 'T11 released: expected 2 refund rows, got %', n;
  end if;
  select count(*) into n from public.assets where id = aq and status = 'failed' and error_message is not null;
  if n <> 1 then
    raise exception 'T11 timeout queued asset: expected failed with message';
  end if;
  select count(*) into n from public.assets where id in (ap, an, av, avo) and status = 'processing';
  if n <> 4 then
    raise exception 'T11 processing assets with a job must stay processing (provider decides), got %', n;
  end if;
  select count(*) into n from public.credit_ledger where asset_id in (ap, an, av, avo) and kind = 'hold' and status = 'held';
  if n <> 4 then
    raise exception 'T11 holds of processing assets must stay held, got %', n;
  end if;
  -- تشغيل ثانٍ: لا تغيير في الحالة؛ يعيد فقط ما ينتظر سؤال المزوّد
  select array_agg(action order by hold_id) into acts from public.reconcile_holds();
  if acts is distinct from array['provider_check', 'provider_check'] then
    raise exception 'T11 second run: expected only provider_check rows, got %', acts;
  end if;
  -- مهلة فيديو أقصر تُدرج av أيضًا
  select count(*) into n from public.reconcile_holds(interval '30 minutes', interval '30 minutes') where action = 'provider_check';
  if n <> 3 then
    raise exception 'T11 custom video threshold: expected 3 provider_check rows, got %', n;
  end if;
end $$;

-- =====================================================================
-- T12–T14: migration 0005 — claim_and_hold: حد التزامن + حجز الأصل + حجز الرصيد في معاملة واحدة تحت قفل المستخدم
-- =====================================================================
do $$
declare
  u3   uuid := gen_random_uuid();
  u4   uuid := gen_random_uuid();
  a    uuid := gen_random_uuid();
  b    uuid := gen_random_uuid();
  h    bigint;
  n    int;
  r    record;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u3, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claim-test-' || u3 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u4, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'claim-test-' || u4 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  -- الباقة المجانية: max_concurrent = 1
  insert into public.assets (id, user_id, type, status, model) values (a, u3, 'image', 'queued', 'm'), (b, u3, 'image', 'queued', 'm');

  -- T12: أول حجز يمر: الأصل processing بتكلفة ومزوّد ونوع، حجز 5، الرصيد 25
  h := public.claim_and_hold(u3, a, 5, 'replicate', 'nano-banana-pro', 'image');
  select status, provider, cost_credits, model, type into r from public.assets where id = a;
  if r.status <> 'processing' or r.provider <> 'replicate' or r.cost_credits <> 5 or r.model <> 'nano-banana-pro' or r.type <> 'image' then
    raise exception 'T12 claim: asset row %/%/%/%/%', r.status, r.provider, r.cost_credits, r.model, r.type;
  end if;
  if public.get_balance(u3) <> 25 then
    raise exception 'T12 claim: expected balance 25, got %', public.get_balance(u3);
  end if;

  -- T13: الثاني يُرفض بحد التزامن (1) ولا يلمس الأصل ولا الرصيد
  begin
    perform public.claim_and_hold(u3, b, 5, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T13 should have failed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise exception 'T13: expected RATE_LIMITED, got %', sqlerrm; end if;
  end;
  select status into r from public.assets where id = b;
  if r.status <> 'queued' then
    raise exception 'T13 rate limited asset must stay queued, got %', r.status;
  end if;
  if public.get_balance(u3) <> 25 then
    raise exception 'T13 rate limited must not hold, balance %', public.get_balance(u3);
  end if;
  -- إعادة حجز أصل محجوز → ALREADY_CLAIMED
  begin
    perform public.claim_and_hold(u3, a, 5, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T13b should have failed';
  exception when others then
    if sqlerrm <> 'ALREADY_CLAIMED' then raise exception 'T13b: expected ALREADY_CLAIMED, got %', sqlerrm; end if;
  end;
  -- أصل مستخدم آخر → ALREADY_CLAIMED (لا صف يطابق user_id)
  begin
    perform public.claim_and_hold(u4, b, 5, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T13c should have failed';
  exception when others then
    if sqlerrm <> 'ALREADY_CLAIMED' then raise exception 'T13c: expected ALREADY_CLAIMED, got %', sqlerrm; end if;
  end;

  -- T14: الذرّية: اكتمل a، ثم حجز b بمبلغ أكبر من الرصيد → INSUFFICIENT_CREDITS ويعود b إلى queued (لا حجز للأصل بلا رصيد)
  update public.assets set status = 'completed' where id = a;
  begin
    perform public.claim_and_hold(u3, b, 40, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T14 should have failed';
  exception when others then
    if sqlerrm <> 'INSUFFICIENT_CREDITS' then raise exception 'T14: expected INSUFFICIENT_CREDITS, got %', sqlerrm; end if;
  end;
  select status, cost_credits into r from public.assets where id = b;
  if r.status <> 'queued' or r.cost_credits is not null then
    raise exception 'T14 atomicity: asset claim must roll back with the hold, got %/%', r.status, r.cost_credits;
  end if;
  select count(*) into n from public.credit_ledger where asset_id = b;
  if n <> 0 then
    raise exception 'T14 atomicity: no ledger row expected for b, got %', n;
  end if;
  -- ثم بمبلغ يكفي يمر
  h := public.claim_and_hold(u3, b, 5, 'replicate', 'nano-banana-pro', 'image');
  if public.get_balance(u3) <> 20 then
    raise exception 'T14 claim after completion: expected 20, got %', public.get_balance(u3);
  end if;
end $$;

-- =====================================================================
-- T15–T21: migration 0007 — الاستوديوهات (ADR 0006): تشغيل متعدد الصور بحجز ذرّي، التزامن بالتشغيل،
--          حارس run_id، المعاينة للمشرف، ورفع المراجع تحت up/{uid}/
-- =====================================================================
do $$
declare
  u5    uuid := gen_random_uuid();
  u6    uuid := gen_random_uuid();
  run1  uuid := gen_random_uuid();
  run2  uuid := gen_random_uuid();
  r1a   uuid := gen_random_uuid();
  r1b   uuid := gen_random_uuid();
  r1c   uuid := gen_random_uuid();
  r2a   uuid := gen_random_uuid();
  r2b   uuid := gen_random_uuid();
  solo  uuid := gen_random_uuid();
  other uuid := gen_random_uuid();
  n     int;
  h     bigint;
  r     record;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u5, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'studio-test-' || u5 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u6, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'studio-test-' || u6 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  -- الباقة المجانية (تزامن 1)، رصيد 30. تشغيل من 3 صور × 11 = 33
  insert into public.assets (id, user_id, type, status, model, run_id) values
    (r1a, u5, 'image', 'queued', 'studio:product-shot', run1),
    (r1b, u5, 'image', 'queued', 'studio:product-shot', run1),
    (r1c, u5, 'image', 'queued', 'studio:product-shot', run1),
    (r2a, u5, 'image', 'queued', 'studio:product-shot', run2),
    (r2b, u5, 'image', 'queued', 'studio:product-shot', run2),
    (solo, u5, 'image', 'queued', 'nano-banana-pro', null),
    (other, u6, 'image', 'queued', 'studio:product-shot', gen_random_uuid());  -- تشغيل مستقل لمستخدم آخر (0008: run_id مشترك بين مستخدمين = INVALID_RUN، يغطيه T22c)

  -- T15a: رصيد 30 < 33 → INSUFFICIENT_CREDITS ولا أثر: الأصول queued ولا صف في الدفتر
  begin
    perform public.claim_and_hold_run(u5, array[r1a, r1b, r1c], 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T15a should have failed';
  exception when others then
    if sqlerrm <> 'INSUFFICIENT_CREDITS' then raise exception 'T15a: expected INSUFFICIENT_CREDITS, got %', sqlerrm; end if;
  end;
  select count(*) into n from public.assets where id in (r1a, r1b, r1c) and status = 'queued' and cost_credits is null;
  if n <> 3 then raise exception 'T15a atomicity: expected 3 untouched queued assets, got %', n; end if;
  select count(*) into n from public.credit_ledger where asset_id in (r1a, r1b, r1c);
  if n <> 0 then raise exception 'T15a atomicity: expected no ledger rows, got %', n; end if;

  -- T15b: بعد منحة 10 (رصيد 40) يمر: 3 حجوزات × 11، الأصول processing، الرصيد 7
  perform public.grant_credits(u5, 10, 'bonus', 'studio-test');
  n := public.claim_and_hold_run(u5, array[r1a, r1b, r1c], 11, 'replicate', 'nano-banana-pro', 'image');
  if n <> 3 then raise exception 'T15b: expected 3 holds, got %', n; end if;
  if public.get_balance(u5) <> 7 then raise exception 'T15b: expected balance 7, got %', public.get_balance(u5); end if;
  select count(*) into n from public.assets
  where id in (r1a, r1b, r1c) and status = 'processing' and cost_credits = 11 and provider = 'replicate' and model = 'nano-banana-pro' and type = 'image';
  if n <> 3 then raise exception 'T15b: expected 3 processing assets at 11, got %', n; end if;
  select count(*) into n from public.credit_ledger where asset_id in (r1a, r1b, r1c) and kind = 'hold' and status = 'held' and amount = -11;
  if n <> 3 then raise exception 'T15b: expected 3 holds of -11, got %', n; end if;

  -- T16: التزامن يعدّ التشغيل كواحد (الباقة المجانية = 1): تشغيل ثانٍ أو طلب منفرد → RATE_LIMITED بلا أثر
  perform public.grant_credits(u5, 100, 'bonus', 'studio-test');
  begin
    perform public.claim_and_hold_run(u5, array[r2a, r2b], 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T16 run should have failed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise exception 'T16 run: expected RATE_LIMITED, got %', sqlerrm; end if;
  end;
  begin
    perform public.claim_and_hold(u5, solo, 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T16 solo should have failed';
  exception when others then
    if sqlerrm <> 'RATE_LIMITED' then raise exception 'T16 solo: expected RATE_LIMITED, got %', sqlerrm; end if;
  end;
  select count(*) into n from public.assets where id in (r2a, r2b, solo) and status = 'queued';
  if n <> 3 then raise exception 'T16: rate-limited assets must stay queued, got %', n; end if;
  -- باقة برو (تزامن 4): التشغيل الثاني يمر لأن الأول يُعدّ واحدًا
  update public.profiles set plan_id = 'pro' where id = u5;
  n := public.claim_and_hold_run(u5, array[r2a, r2b], 11, 'replicate', 'nano-banana-pro', 'image');
  if n <> 2 then raise exception 'T16 pro: expected 2 holds, got %', n; end if;

  -- T17: تحرير صورة واحدة من التشغيل لا يمس أخواتها
  select id into h from public.credit_ledger where asset_id = r1b and kind = 'hold' and status = 'held';
  perform public.release_hold(h, 'qa failed');
  select count(*) into n from public.credit_ledger where asset_id in (r1a, r1c) and kind = 'hold' and status = 'held';
  if n <> 2 then raise exception 'T17: siblings must stay held, got %', n; end if;

  -- T18: تشغيل غير صالح → INVALID_RUN بلا أثر (فارغ، تكرار، run مختلط، أصل لمستخدم آخر، أصل بلا run، أكثر من 6)
  for r in select * from (values
      ('empty',   array[]::uuid[]),
      ('dup',     array[r2a, r2a]),
      ('mixed',   array[solo, r1a]),
      ('foreign', array[other]),
      ('no_run',  array[solo]),
      ('seven',   array[gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid(), gen_random_uuid()])
    ) as t(label, ids)
  loop
    begin
      perform public.claim_and_hold_run(u5, r.ids, 11, 'replicate', 'nano-banana-pro', 'image');
      raise exception 'T18 % should have failed', r.label;
    exception when others then
      if sqlerrm <> 'INVALID_RUN' then raise exception 'T18 %: expected INVALID_RUN, got %', r.label, sqlerrm; end if;
    end;
  end loop;
  select status into r from public.assets where id = other;
  if r.status <> 'queued' then raise exception 'T18 foreign asset must stay queued, got %', r.status; end if;

  -- ---- كمستخدم مسجّل (الواجهة) ----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u5)::text, true);

  -- T19: run_id يُكتب عند الإدراج فقط، ولا يتغير بعده
  insert into public.assets (id, user_id, type, status, model, run_id) values (gen_random_uuid(), u5, 'image', 'queued', 'studio:product-shot', gen_random_uuid());
  begin
    update public.assets set run_id = gen_random_uuid() where id = solo;
    raise exception 'T19 should have failed';
  exception when others then
    if sqlerrm not like '%FORBIDDEN_COLUMN_UPDATE%' then raise exception 'T19: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;

  -- T20: الاستوديو المعطّل لا يُقرأ إلا للمشرف؛ app_admins مغلق أمام الواجهة
  select count(*) into n from public.studios where id = 'product-shot';
  if n <> 0 then raise exception 'T20 disabled studio visible to non-admin (% rows)', n; end if;
  select count(*) into n from public.app_admins;
  if n <> 0 then raise exception 'T20 app_admins readable by authenticated (% rows)', n; end if;
  begin
    insert into public.app_admins (user_id) values (u5);
    raise exception 'T20 self-promotion should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T20 self-promotion: expected 42501, got % (%)', sqlstate, sqlerrm; end if;
  end;

  -- T21: رفع المراجع تحت up/{uid}/ فقط
  insert into storage.objects (bucket_id, name) values ('media', 'up/' || u5 || '/product.png');
  for r in select * from (values
      ('other_user', 'up/' || u6 || '/x.png'),
      ('outputs',    'u/'  || u5 || '/x.png'),
      ('root',       'x.png'),
      ('traversal',  'up/' || u5 || '/../' || u6 || '/x.png')
    ) as t(label, path)
  loop
    begin
      insert into storage.objects (bucket_id, name) values ('media', r.path);
      raise exception 'T21 % should have been rejected', r.label;
    exception when others then
      if sqlstate <> '42501' then raise exception 'T21 %: expected 42501, got % (%)', r.label, sqlstate, sqlerrm; end if;
    end;
  end loop;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- T20b: بعد إضافة المستخدم مشرفًا يرى الاستوديو المعطّل
  insert into public.app_admins (user_id) values (u5);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u5)::text, true);
  select count(*) into n from public.studios where id = 'product-shot';
  if n <> 1 then raise exception 'T20b admin should see disabled studio, got % rows', n; end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- =====================================================================
-- T22–T24: migration 0008 — إصلاحات المراجعة المستقلة للاستوديو (2026-10-25)
--   T22 (I1): run_id لا يتجاوز حد التزامن — أصل له run_id لا يمر من claim_and_hold، والتشغيل يجب أن يضم كل أصول run_id
--   T23 (C1): metadata لا يكتبها العميل (لا تحديث ولا إدراج بمحتوى)
--   T24 (C1/C2): studio_jobs وbucket qa-private مغلقان أمام الواجهة
-- =====================================================================
do $$
declare
  u7    uuid := gen_random_uuid();
  u8    uuid := gen_random_uuid();
  runA  uuid := gen_random_uuid();
  a1    uuid := gen_random_uuid();
  a2    uuid := gen_random_uuid();
  sneak uuid := gen_random_uuid();
  plain uuid := gen_random_uuid();
  n     int;
  r     record;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u7, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fix-test-' || u7 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u8, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'fix-test-' || u8 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());
  perform public.grant_credits(u7, 100, 'bonus', 'fix-test');
  insert into public.assets (id, user_id, type, status, model, run_id) values
    (a1, u7, 'image', 'queued', 'studio:product-shot', runA),
    (a2, u7, 'image', 'queued', 'studio:product-shot', runA),
    (sneak, u7, 'image', 'queued', 'nano-banana-pro', runA),
    (plain, u7, 'image', 'queued', 'nano-banana-pro', null);

  -- T22a: أصل عادي يحمل run_id → INVALID_RUN من claim_and_hold (لا يُحسب داخل تشغيل قائم)
  begin
    perform public.claim_and_hold(u7, sneak, 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T22a should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_RUN' then raise exception 'T22a: expected INVALID_RUN, got %', sqlerrm; end if;
  end;
  -- T22b: تشغيل لا يضم كل أصول run_id (sneak خارجه) → INVALID_RUN بلا أثر
  begin
    perform public.claim_and_hold_run(u7, array[a1, a2], 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T22b should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_RUN' then raise exception 'T22b: expected INVALID_RUN, got %', sqlerrm; end if;
  end;
  select count(*) into n from public.assets where id in (a1, a2, sneak) and status = 'queued';
  if n <> 3 then raise exception 'T22b atomicity: expected 3 queued, got %', n; end if;
  -- T22c: run_id لمستخدم آخر يطابق تشغيلي → INVALID_RUN (التشغيل يجب أن يكون كاملًا ولي وحدي)
  insert into public.assets (id, user_id, type, status, model, run_id) values (gen_random_uuid(), u8, 'image', 'queued', 'studio:product-shot', runA);
  begin
    perform public.claim_and_hold_run(u7, array[a1, a2, sneak], 11, 'replicate', 'nano-banana-pro', 'image');
    raise exception 'T22c should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_RUN' then raise exception 'T22c: expected INVALID_RUN, got %', sqlerrm; end if;
  end;
  -- T22d: الأصل العادي بلا run_id ما زال يمر
  perform public.claim_and_hold(u7, plain, 11, 'replicate', 'nano-banana-pro', 'image');

  -- ---- كمستخدم مسجّل (الواجهة) ----
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u7)::text, true);

  -- T23a: تحديث metadata من الواجهة → FORBIDDEN_COLUMN_UPDATE
  begin
    update public.assets set metadata = '{"studio":{"reference_url":"https://evil.invalid/x.png"}}'::jsonb where id = a1;
    raise exception 'T23a should have failed';
  exception when others then
    if sqlerrm not like '%FORBIDDEN_COLUMN_UPDATE%' then raise exception 'T23a: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;
  -- T23b: إدراج بـmetadata غير فارغة → سياسة الإدراج ترفض (42501)؛ بلا metadata يمر
  begin
    insert into public.assets (id, user_id, type, status, model, metadata) values (gen_random_uuid(), u7, 'image', 'queued', 'nano-banana-pro', '{"studio":{}}'::jsonb);
    raise exception 'T23b should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T23b: expected 42501, got % (%)', sqlstate, sqlerrm; end if;
  end;
  insert into public.assets (id, user_id, type, status, model) values (gen_random_uuid(), u7, 'image', 'queued', 'nano-banana-pro');

  -- T24a: studio_jobs لا يُقرأ ولا يُكتب من الواجهة
  select count(*) into n from public.studio_jobs;
  if n <> 0 then raise exception 'T24a studio_jobs readable by authenticated (% rows)', n; end if;
  begin
    insert into public.studio_jobs (asset_id, user_id, run_id, studio_id, preset, output_key, reference_url, provider, provider_slug, provider_input, qa_config)
    values (a1, u7, runA, 'product-shot', 'luxury', 'hero', 'https://x.test/a.png', 'replicate', 'x/y', '{}'::jsonb, '{}'::jsonb);
    raise exception 'T24a insert should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T24a insert: expected 42501, got % (%)', sqlstate, sqlerrm; end if;
  end;
  -- T24b: لا رفع إلى qa-private من الواجهة
  begin
    insert into storage.objects (bucket_id, name) values ('qa-private', 'up/' || u7 || '/x.png');
    raise exception 'T24b should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'T24b: expected 42501, got % (%)', sqlstate, sqlerrm; end if;
  end;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- T24c: qa-private موجود وخاص
  select public into r from storage.buckets where id = 'qa-private';
  if r.public is distinct from false then raise exception 'T24c qa-private bucket must exist and be private, got %', r.public; end if;
end $$;

-- =====================================================================
-- T25: migration 0009 — حارس profiles: المستخدم يعدّل اسمه ولغته فقط، لا باقته ولا التعبئة التلقائية
-- =====================================================================
do $$
declare
  u   uuid := gen_random_uuid();
  u2  uuid := gen_random_uuid();
  p   text;
  nm  text;
  lc  text;
  n   int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-test-' || u || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'profile-test-' || u2 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);

  -- T25a: الاسم واللغة يمرّان
  update public.profiles set display_name = 'نهى', locale = 'en' where id = u;

  -- T25b: رفع الباقة ممنوع
  begin
    update public.profiles set plan_id = 'creators' where id = u;
    raise exception 'T25b plan_id self-update should have failed';
  exception when others then
    if sqlerrm <> 'FORBIDDEN_COLUMN_UPDATE' then raise exception 'T25b: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;

  -- T25c: التعبئة التلقائية ممنوعة (تلمس الدفع)
  begin
    update public.profiles set auto_refill_credits = 4000, auto_refill_threshold = 1 where id = u;
    raise exception 'T25c auto_refill self-update should have failed';
  exception when others then
    if sqlerrm <> 'FORBIDDEN_COLUMN_UPDATE' then raise exception 'T25c: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;

  -- T25d: لغة غير مدعومة واسم أطول من 60
  begin
    update public.profiles set locale = 'fr' where id = u;
    raise exception 'T25d locale should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_LOCALE' then raise exception 'T25d: expected INVALID_LOCALE, got %', sqlerrm; end if;
  end;
  begin
    update public.profiles set display_name = repeat('x', 61) where id = u;
    raise exception 'T25d name should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_DISPLAY_NAME' then raise exception 'T25d: expected INVALID_DISPLAY_NAME, got %', sqlerrm; end if;
  end;

  -- T25g: قائمة سماح — username وavatar_url وcreated_at كلها ممنوعة (أي عمود غير الاسم واللغة)
  begin
    update public.profiles set username = 'highlink' where id = u;
    raise exception 'T25g username should have failed';
  exception when others then
    if sqlerrm <> 'FORBIDDEN_COLUMN_UPDATE' then raise exception 'T25g username: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;
  begin
    update public.profiles set avatar_url = 'javascript:alert(1)' where id = u;
    raise exception 'T25g avatar should have failed';
  exception when others then
    if sqlerrm <> 'FORBIDDEN_COLUMN_UPDATE' then raise exception 'T25g avatar: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;
  begin
    update public.profiles set created_at = now() - interval '5 years' where id = u;
    raise exception 'T25g created_at should have failed';
  exception when others then
    if sqlerrm <> 'FORBIDDEN_COLUMN_UPDATE' then raise exception 'T25g created_at: expected FORBIDDEN_COLUMN_UPDATE, got %', sqlerrm; end if;
  end;

  -- T25h: upsert بباقة مختلفة يُرفض (لا سياسة INSERT على profiles)
  begin
    insert into public.profiles (id, plan_id) values (u, 'creators') on conflict (id) do update set plan_id = excluded.plan_id;
    raise exception 'T25h upsert should have failed';
  exception when others then
    if sqlerrm not like 'new row violates row-level security policy%' then raise exception 'T25h: expected RLS violation, got %', sqlerrm; end if;
  end;

  -- T25i: التحقق على ما تغيّر فقط — اسم طويل موجود من قبل (مثلًا من التسجيل) لا يمنع تغيير اللغة
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set display_name = repeat('n', 80) where id = u2;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u2)::text, true);
  update public.profiles set locale = 'en' where id = u2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T25i: locale change with a long existing name should pass, got % rows', n; end if;
  -- T25j: ونفس الشي للغة: لغة قديمة غير مدعومة (كتبها السيرفر) لا تمنع تغيير الاسم
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  update public.profiles set locale = 'fr' where id = u2;
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u2)::text, true);
  update public.profiles set display_name = 'Short' where id = u2;
  get diagnostics n = row_count;
  if n <> 1 then raise exception 'T25j: name change with an old unsupported locale should pass, got % rows', n; end if;
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);

  -- T25e: صف مستخدم آخر لا يُمس (RLS: صفر صفوف)
  update public.profiles set display_name = 'x' where id = u2;
  get diagnostics n = row_count;
  if n <> 0 then raise exception 'T25e: updated another user''s profile (% rows)', n; end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select plan_id, display_name, locale into p, nm, lc from public.profiles where id = u;
  if p <> 'free' or nm <> 'نهى' or lc <> 'en' then raise exception 'T25 final: plan=% name=% locale=%', p, nm, lc; end if;

  -- T25f: السيرفر (service_role) يغيّر الباقة
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
  update public.profiles set plan_id = 'pro' where id = u;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select plan_id into p from public.profiles where id = u;
  if p <> 'pro' then raise exception 'T25f service_role plan change: got %', p; end if;
end $$;

select 'ALL CREDIT TESTS PASSED' as result;

rollback;
