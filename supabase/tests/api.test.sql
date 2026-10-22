-- api.test.sql — اختبارات API v1 (ADR 0004، CLAUDE.md القاعدة 9): مفاتيح API، الحد اليومي، الإبطال، idempotency، RLS
-- يُشغَّل على القاعدة البعيدة داخل معاملة تُلغى دائمًا:
--   npx supabase db query --linked -f supabase/tests/api.test.sql
-- وفي CI بعد الهجرات. أي فشل = exception برسالة تبدأ بـ A<n>. النجاح = صف واحد "ALL API TESTS PASSED".
-- محاكاة الواجهة: set local role authenticated + request.jwt.claims (كما في credits.test.sql T9).

begin;

do $$
declare
  u      uuid := gen_random_uuid();
  u2     uuid := gen_random_uuid();
  k      record;   -- مفتاح اختبار لـu
  k2     record;   -- مفتاح حي لـu
  a      record;
  r      record;
  n      int;
  h      text;
  h2     text;
  i      int;
begin
  insert into auth.users (id, instance_id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
  values
    (u,  '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'api-test-' || u  || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now()),
    (u2, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'api-test-' || u2 || '@example.invalid', '', now(), '{"provider":"email","providers":["email"]}'::jsonb, '{}'::jsonb, now(), now());

  -- ================= كمستخدم u (الواجهة) =================
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);

  -- A1: إصدار مفتاح اختبار → صيغة hl_test_ + 32 حرفًا، تلميح، سر whsec_، حد 200
  select * into k from public.create_api_key('n8n test', 'test', 'https://hooks.example.invalid/x');
  if k.key !~ '^hl_test_[A-Za-z0-9_-]{32}$' then
    raise exception 'A1 key format: got %', k.key;
  end if;
  if k.key_hint <> 'hl_test_…' || right(k.key, 4) then
    raise exception 'A1 key hint: got % for key ending %', k.key_hint, right(k.key, 4);
  end if;
  if k.webhook_secret !~ '^whsec_[A-Za-z0-9+/=]{32}$' then
    raise exception 'A1 webhook secret format: got %', k.webhook_secret;
  end if;
  if k.daily_limit <> 200 or k.mode <> 'test' then
    raise exception 'A1 test key defaults: limit=% mode=%', k.daily_limit, k.mode;
  end if;

  -- A2: مفتاح حي للباقة المجانية → حد 50؛ لا يُخزَّن المفتاح نفسه بل hash sha256
  select * into k2 from public.create_api_key('prod', 'live', null);
  if k2.key !~ '^hl_live_[A-Za-z0-9_-]{32}$' or k2.daily_limit <> 50 then
    raise exception 'A2 live key: key=% limit=%', k2.key, k2.daily_limit;
  end if;
  select count(*) into n from public.api_keys where key_hash = encode(digest(k2.key, 'sha256'), 'hex');
  if n <> 1 then
    raise exception 'A2 key hash: expected stored sha256 of the key, found % rows', n;
  end if;
  select count(*) into n from public.api_keys;
  if n <> 2 then
    raise exception 'A2 own keys visible: expected 2, got %', n;
  end if;

  -- A3: لا إدراج/تعديل مباشر من الواجهة (RLS) — فقط عبر RPC
  begin
    insert into public.api_keys (user_id, name, mode, key_hash, key_hint, daily_limit, webhook_secret)
    values (u, 'direct', 'live', 'x', 'y', 999999, 'whsec_x');
    raise exception 'A3 direct insert should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'A3 direct insert: expected 42501, got % (%)', sqlstate, sqlerrm; end if;
  end;
  update public.api_keys set daily_limit = 999999 where id = k2.id;
  get diagnostics n = row_count;
  if n <> 0 then
    raise exception 'A3 direct update: expected 0 rows (no update policy), got %', n;
  end if;

  -- A4: مدخلات مرفوضة: وضع غير معروف، رابط webhook غير https، اسم فارغ
  begin
    perform public.create_api_key('x', 'prod', null);
    raise exception 'A4 should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_MODE' then raise exception 'A4 mode: expected INVALID_MODE, got %', sqlerrm; end if;
  end;
  begin
    perform public.create_api_key('x', 'live', 'http://insecure.example.invalid/x');
    raise exception 'A4 should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_WEBHOOK_URL' then raise exception 'A4 webhook url: expected INVALID_WEBHOOK_URL, got %', sqlerrm; end if;
  end;
  begin
    perform public.create_api_key('   ', 'live', null);
    raise exception 'A4 should have failed';
  exception when others then
    if sqlerrm <> 'INVALID_NAME' then raise exception 'A4 name: expected INVALID_NAME, got %', sqlerrm; end if;
  end;

  -- A5: سياسة INSERT على assets ترفض api_key_id من الواجهة
  begin
    insert into public.assets (id, user_id, type, status, api_key_id) values (gen_random_uuid(), u, 'image', 'queued', k2.id);
    raise exception 'A5 should have failed';
  exception when others then
    if sqlstate <> '42501' then raise exception 'A5 api_key_id on insert: expected 42501, got %', sqlstate; end if;
  end;

  -- ================= كمستخدم u2 =================
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u2)::text, true);
  select count(*) into n from public.api_keys;
  if n <> 0 then
    raise exception 'A6 other user sees keys: expected 0, got %', n;
  end if;
  if public.revoke_api_key(k.id) then
    raise exception 'A6 other user revoked a key that is not theirs';
  end if;
  select count(*) into n from public.api_idempotency;
  if n <> 0 then
    raise exception 'A6 api_idempotency must not be readable from the client, got % rows', n;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);

  -- ================= كخدمة (service_role / postgres) =================
  -- A7: المصادقة بالـhash، العدّ اليومي، الحد
  h := encode(digest(k.key, 'sha256'), 'hex');
  select * into a from public.api_authenticate(h, false);
  if a.user_id is distinct from u or a.mode <> 'test' or a.used_today <> 0 or a.webhook_url <> 'https://hooks.example.invalid/x' or a.plan_id <> 'free' then
    raise exception 'A7 authenticate: user=% mode=% used=% url=% plan=%', a.user_id, a.mode, a.used_today, a.webhook_url, a.plan_id;
  end if;
  select * into a from public.api_authenticate(h, true);
  select * into a from public.api_authenticate(h, true);
  if a.used_today <> 2 then
    raise exception 'A7 count: expected used_today 2, got %', a.used_today;
  end if;
  update public.api_keys set daily_limit = 2 where id = k.id;
  begin
    perform public.api_authenticate(h, true);
    raise exception 'A7 should have failed';
  exception when others then
    if sqlerrm <> 'DAILY_LIMIT' then raise exception 'A7 limit: expected DAILY_LIMIT, got %', sqlerrm; end if;
  end;
  select requests into n from public.api_daily_usage where key_id = k.id and day = (now() at time zone 'utc')::date;
  if n <> 2 then
    raise exception 'A7 limit rollback: usage should stay 2, got %', n;
  end if;
  select last_used_at into r from public.api_keys where id = k.id;
  if r.last_used_at is null then
    raise exception 'A7 last_used_at not set';
  end if;
  select count(*) into n from public.api_authenticate('0000', false);
  if n <> 0 then
    raise exception 'A7 unknown hash: expected 0 rows, got %', n;
  end if;

  -- A8: الإبطال من المالك → true ثم false؛ بعدها المصادقة ترجع 0 صفوف
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u)::text, true);
  if not public.revoke_api_key(k.id) then
    raise exception 'A8 owner revoke should return true';
  end if;
  if public.revoke_api_key(k.id) then
    raise exception 'A8 second revoke should return false';
  end if;

  -- A9: حد 10 مفاتيح نشطة (k2 نشط، k مُبطَل → 9 أخرى تمر، العاشرة بعدها تُرفض)
  for i in 1..9 loop
    perform public.create_api_key('bulk ' || i, 'live', null);
  end loop;
  begin
    perform public.create_api_key('one too many', 'live', null);
    raise exception 'A9 should have failed';
  exception when others then
    if sqlerrm <> 'TOO_MANY_KEYS' then raise exception 'A9: expected TOO_MANY_KEYS, got %', sqlerrm; end if;
  end;
  -- الاستخدام اليومي مرئي للمالك فقط
  select count(*) into n from public.api_daily_usage;
  if n <> 1 then
    raise exception 'A9 own usage rows: expected 1, got %', n;
  end if;

  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
  select count(*) into n from public.api_authenticate(h, false);
  if n <> 0 then
    raise exception 'A8 revoked key must not authenticate, got % rows', n;
  end if;

  -- A10: idempotency: مفتاح واحد لكل (key_id, idempotency_key)
  h2 := encode(digest(k2.key, 'sha256'), 'hex');
  insert into public.api_idempotency (key_id, idempotency_key, request_hash) values (k2.id, 'req-1', 'hash-a');
  begin
    insert into public.api_idempotency (key_id, idempotency_key, request_hash) values (k2.id, 'req-1', 'hash-b');
    raise exception 'A10 should have failed';
  exception when others then
    if sqlstate <> '23505' then raise exception 'A10: expected unique violation 23505, got %', sqlstate; end if;
  end;

  -- A11: assets.api_key_id يقبل مفتاحًا موجودًا ويرفض المجهول، وسجل تسليم webhook يُربط بالمفتاح
  insert into public.assets (id, user_id, type, status, api_key_id) values (gen_random_uuid(), u, 'image', 'queued', k2.id);
  begin
    insert into public.assets (id, user_id, type, status, api_key_id) values (gen_random_uuid(), u, 'image', 'queued', gen_random_uuid());
    raise exception 'A11 should have failed';
  exception when others then
    if sqlstate <> '23503' then raise exception 'A11: expected FK violation 23503, got %', sqlstate; end if;
  end;
  insert into public.api_webhook_deliveries (key_id, asset_id, event, url, attempts, ok) values (k2.id, gen_random_uuid(), 'asset.completed', 'https://hooks.example.invalid/x', 1, true);
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('role', 'authenticated', 'sub', u2)::text, true);
  select count(*) into n from public.api_webhook_deliveries;
  if n <> 0 then
    raise exception 'A11 deliveries visible to another user: %', n;
  end if;
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

select 'ALL API TESTS PASSED' as result;

rollback;
