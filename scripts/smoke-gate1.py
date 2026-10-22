"""بوابة 1 آليًا على المشروع السحابي المرتبط — لا يطبع أي سر.
يُشغَّل بعد `db push` و`functions deploy` (من جذر المستودع):
    python -I scripts/smoke-gate1.py [--keep]

ما يتحقق منه (المخطط §5/§15، المراجعة المستقلة):
  1. مستخدم تجريبي جديد يحصل على 30 رصيدًا (trigger التسجيل).
  2. طلبان متزامنان بنفس assetId → مهمة واحدة عند المزوّد (200 واحد + 409، أو 200 متطابقان)، حجز واحد في الدفتر.
  3. التوليدة الحقيقية تكتمل عبر الـwebhook: الأصل completed برابط دائم، الحجز صار charge، الرصيد 30 → 19.
  4. فشل حقيقي (مرجع صورة لا يمكن جلبه) → failed برسالة عربية، الحجز حُرّر، الرصيد يعود 19.
  5. حدث webhook واحد معالَج لكل مهمة، وتنظيف المستخدم التجريبي (cascade) وملفاته.
  6. الحارس عبر PostgREST: PATCH status من الواجهة مرفوض.
  7. API v1 (ADR 0004): مفتاح hl_test_ (models/balance/generate sandbox/idempotency/assets/401/429/إبطال)
     ومفتاح hl_live_ (توليدة حقيقية 202 → completed عبر الـwebhook، الرصيد 19 → 8) وسجل تسليم webhook العميل.

يقرأ supabase/.env.local (SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) وapps/web/.env.local (VITE_SUPABASE_ANON_KEY) ولا يطبع قيمها.
المفاتيح الجديدة (sb_secret_/sb_publishable_) ليست JWT وتُرسل كـapikey فقط؛ المفاتيح القديمة (JWT) تُرسل أيضًا في Authorization.
"""
import io, json, os, sys, time, uuid, threading, urllib.request, urllib.error

# طرفية Windows قد تكون cp1256 — نطبع UTF-8 دائمًا (عربي + رموز)
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
KEEP = '--keep' in sys.argv
MODEL = 'nano-banana-pro'
EXPECTED_COST = 11


def read_env(path):
    env = {}
    for line in io.open(path, encoding='utf-8').read().splitlines():
        s = line.strip()
        if s and not s.startswith('#') and '=' in s:
            k, v = s.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


fn_env = read_env(os.path.join(ROOT, 'supabase', '.env.local'))
web_env = read_env(os.path.join(ROOT, 'apps', 'web', '.env.local'))
URL = (fn_env.get('SUPABASE_URL') or web_env.get('VITE_SUPABASE_URL') or '').rstrip('/')
SERVICE = fn_env.get('SUPABASE_SERVICE_ROLE_KEY', '')
ANON = web_env.get('VITE_SUPABASE_ANON_KEY', '')
if not URL or not SERVICE or not ANON:
    sys.exit('missing SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY / VITE_SUPABASE_ANON_KEY in .env.local files')


def auth_headers(key, bearer=None):
    h = {'apikey': key, 'Content-Type': 'application/json'}
    if bearer:
        h['Authorization'] = 'Bearer ' + bearer
    elif key.startswith('eyJ'):
        h['Authorization'] = 'Bearer ' + key
    return h


def call(method, path, key, body=None, bearer=None, extra=None, timeout=60):
    data = None if body is None else json.dumps(body).encode('utf-8')
    headers = auth_headers(key, bearer)
    if extra:
        headers.update(extra)
    req = urllib.request.Request(URL + path, data=data, method=method, headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            raw = r.read().decode('utf-8')
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(raw)
        except Exception:
            return e.code, raw


results = []


def check(name, ok, detail=''):
    results.append((name, ok, detail))
    print(('PASS ' if ok else 'FAIL ') + name + (' — ' + detail if detail else ''))


def rest(method, path, bearer, body=None, extra=None):
    return call(method, '/rest/v1' + path, ANON, body, bearer=bearer, extra=extra)


def admin_rest(method, path, body=None, extra=None):
    return call(method, '/rest/v1' + path, SERVICE, body, extra=extra)


# ---------------------------------------------------------------- 1) مستخدم تجريبي
email = 'smoke-' + uuid.uuid4().hex[:10] + '@example.invalid'
password = uuid.uuid4().hex + 'Aa1!'
st, user = call('POST', '/auth/v1/admin/users', SERVICE, {'email': email, 'password': password, 'email_confirm': True})
if st not in (200, 201) or not isinstance(user, dict) or not user.get('id'):
    sys.exit(f'admin create user failed: HTTP {st} {str(user)[:200]}')
uid = user['id']
print('test user created')

st, sess = call('POST', '/auth/v1/token?grant_type=password', ANON, {'email': email, 'password': password})
if st != 200 or not sess.get('access_token'):
    sys.exit(f'password sign-in failed: HTTP {st}')
jwt = sess['access_token']


def balance():
    st, b = rest('POST', '/rpc/get_balance', jwt, {'p_user': uid})
    return b if st == 200 else None


def asset(aid):
    st, rows = rest('GET', f'/assets?id=eq.{aid}&select=*', jwt)
    return rows[0] if st == 200 and rows else None


def ledger(aid):
    st, rows = rest('GET', f'/credit_ledger?asset_id=eq.{aid}&select=id,kind,status,amount&order=id', jwt)
    return rows if st == 200 else []


def wait_final(aid, seconds=180):
    deadline = time.time() + seconds
    while time.time() < deadline:
        a = asset(aid)
        if a and a['status'] in ('completed', 'failed', 'canceled'):
            return a
        time.sleep(3)
    return asset(aid)


def generate(aid, prompt, images=None):
    body = {'assetId': aid, 'model': MODEL, 'prompt': prompt, 'config': {'aspectRatio': '1:1', 'imageSize': '1K'},
            'feature_tag': 'general', 'locale': 'ar', 'maxCredits': EXPECTED_COST}
    if images:
        body['images'] = images
    return call('POST', '/functions/v1/generate-media', ANON, body, bearer=jwt, timeout=120)


def new_queued(prompt):
    aid = str(uuid.uuid4())
    st, rows = rest('POST', '/assets', jwt,
                    {'id': aid, 'user_id': uid, 'type': 'image', 'status': 'queued', 'model': MODEL, 'prompt': prompt,
                     'aspect_ratio': '1:1', 'resolution': '1K', 'feature_tag': 'general'},
                    extra={'Prefer': 'return=representation'})
    if st != 201:
        sys.exit(f'insert queued asset failed: HTTP {st} {str(rows)[:200]}')
    return aid


try:
    b0 = balance()
    check('T1 رصيد الترحيب 30', b0 == 30, f'balance={b0}')

    # ------------------------------------------------------------ 2) طلبان متزامنان بنفس assetId
    a1 = new_queued('A single ripe orange on a white marble table, soft studio light, product photo')
    out = [None, None]

    def fire(i):
        out[i] = generate(a1, 'A single ripe orange on a white marble table, soft studio light, product photo')

    th = [threading.Thread(target=fire, args=(i,)) for i in range(2)]
    for t in th:
        t.start()
    for t in th:
        t.join()
    statuses = sorted(o[0] for o in out)
    jobs = {o[1].get('providerJobId') for o in out if isinstance(o[1], dict) and o[1].get('providerJobId')}
    ok_pair = statuses == [200, 409] or (statuses == [200, 200] and len(jobs) == 1)
    check('T2a طلبان متزامنان → 200 + 409 أو 200 متطابقان', ok_pair, f'statuses={statuses} distinct_jobs={len(jobs)}')
    time.sleep(2)
    a = asset(a1)
    holds = [r for r in ledger(a1) if r['kind'] in ('hold', 'charge')]
    check('T2b مهمة واحدة وحجز واحد', bool(a and a.get('provider_job_id')) and len(holds) == 1,
          f"status={a and a['status']} ledger={[(r['kind'], r['status'], r['amount']) for r in ledger(a1)]}")
    check('T2c الرصيد بعد الحجز 19', balance() == 19, f'balance={balance()}')

    # ------------------------------------------------------------ 3) الاكتمال عبر الـwebhook
    a = wait_final(a1)
    led = ledger(a1)
    charged = any(r['kind'] == 'charge' and r['status'] == 'posted' and r['amount'] == -EXPECTED_COST for r in led)
    check('T3a الأصل completed برابط دائم', bool(a and a['status'] == 'completed' and a.get('url')),
          f"status={a and a['status']} url={'yes' if a and a.get('url') else 'no'} err={a and a.get('error_message')}")
    check('T3b الحجز صار charge −11', charged, f"ledger={[(r['kind'], r['status'], r['amount']) for r in led]}")
    check('T3c الرصيد 19 بعد الاكتمال', balance() == 19, f'balance={balance()}')
    job1 = a and a.get('provider_job_id')

    # ------------------------------------------------------------ 4) فشل حقيقي → استرداد
    a2 = new_queued('Same orange, but with an unreachable reference image')
    st, res = generate(a2, 'Same orange, but with an unreachable reference image',
                       images=['https://example.invalid/does-not-exist-' + uuid.uuid4().hex + '.png'])
    path = 'submit-rejected' if st != 200 else 'webhook-failed'
    a = wait_final(a2)
    led = ledger(a2)
    refunded = any(r['kind'] == 'refund' and r['status'] == 'released' for r in led)
    check('T4a الفشل يعلّم الأصل failed برسالة عربية', bool(a and a['status'] == 'failed' and a.get('error_message')),
          f"path={path} http={st} status={a and a['status']} msg={a and a.get('error_message')}")
    check('T4b الحجز حُرّر (refund/released)', refunded, f"ledger={[(r['kind'], r['status'], r['amount']) for r in led]}")
    check('T4c الرصيد عاد 19', balance() == 19, f'balance={balance()}')
    job2 = a and a.get('provider_job_id')

    # ------------------------------------------------------------ 5) أحداث الـwebhook (service_role)
    for label, job in (('T5a', job1), ('T5b', job2)):
        if not job:
            check(f'{label} حدث webhook للمهمة', path == 'submit-rejected' and label == 'T5b', 'no provider_job_id (submit rejected)')
            continue
        st, evs = admin_rest('GET', '/webhook_events?select=id,processed_at,payload->>id&payload->>id=eq.' + job)
        processed = [e for e in (evs or []) if e.get('processed_at')]
        check(f'{label} حدث webhook واحد معالَج للمهمة', st == 200 and len(evs or []) == 1 and len(processed) == 1,
              f'events={len(evs or [])} processed={len(processed)}')

    # ------------------------------------------------------------ 6) الحارس عبر PostgREST (لا يمر تعديل status من الواجهة)
    st, res = rest('PATCH', f'/assets?id=eq.{a1}', jwt, {'status': 'queued'}, extra={'Prefer': 'return=minimal'})
    check('T6 PATCH status من الواجهة يُرفض (FORBIDDEN_COLUMN_UPDATE)', st in (400, 403, 409) and 'FORBIDDEN_COLUMN_UPDATE' in json.dumps(res),
          f'http={st} body={str(res)[:120]}')

    # ------------------------------------------------------------ 7) API v1 (ADR 0004): مفتاح hl_test_ (sandbox) ثم hl_live_ (توليدة حقيقية + webhook العميل)
    API = URL + '/functions/v1/v1'

    def api(method, path, key, body=None, extra=None, timeout=120):
        data = None if body is None else json.dumps(body).encode('utf-8')
        headers = {'Content-Type': 'application/json'}
        if key:
            headers['Authorization'] = 'Bearer ' + key
        if extra:
            headers.update(extra)
        req = urllib.request.Request(API + path, data=data, method=method, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                raw = r.read().decode('utf-8')
                return r.status, (json.loads(raw) if raw else None), {k.lower(): v for k, v in r.headers.items()}
        except urllib.error.HTTPError as e:
            raw = e.read().decode('utf-8', 'replace')
            try:
                return e.code, json.loads(raw), {k.lower(): v for k, v in e.headers.items()}
            except Exception:
                return e.code, raw, {}

    def rpc_create_key(name, mode, hook):
        st, rows = rest('POST', '/rpc/create_api_key', jwt, {'p_name': name, 'p_mode': mode, 'p_webhook_url': hook})
        if st != 200 or not rows:
            sys.exit(f'create_api_key failed: HTTP {st} {str(rows)[:200]}')
        return rows[0]

    hook = 'https://example.invalid/highlink-hook'
    kt = rpc_create_key('smoke test', 'test', hook)
    kl = rpc_create_key('smoke live', 'live', hook)
    key_test, key_live = kt['key'], kl['key']
    check('A1 إصدار مفتاحي test وlive بالصيغة المتوقعة', key_test.startswith('hl_test_') and key_live.startswith('hl_live_')
          and kt['webhook_secret'].startswith('whsec_') and kt['daily_limit'] == 200 and kl['daily_limit'] == 50,
          f"limits test={kt['daily_limit']} live={kl['daily_limit']}")

    st, body, hdr = api('GET', '/models', key_test)
    ids = [m.get('id') for m in (body or {}).get('data', [])] if st == 200 else []
    check('A2 GET /models بمفتاح API', st == 200 and MODEL in ids, f'http={st} models={ids}')

    st, body, hdr = api('GET', '/balance', key_test)
    check('A3 GET /balance = 19 بوضع test', st == 200 and body.get('balance') == 19 and body.get('mode') == 'test', f'http={st} body={body}')

    gen_body = {'model': MODEL, 'prompt': 'A ceramic coffee cup on a wooden table, soft light', 'config': {'aspectRatio': '1:1', 'imageSize': '1K'}, 'maxCredits': EXPECTED_COST}
    idem = 'smoke-' + uuid.uuid4().hex[:12]
    st, body, hdr = api('POST', '/generate', key_test, gen_body, extra={'Idempotency-Key': idem})
    sb_asset = (body or {}).get('asset') or {}
    check('A4 POST /generate بمفتاح test → sandbox مكتمل بلا خصم', st == 200 and body.get('sandbox') is True and sb_asset.get('status') == 'completed'
          and sb_asset.get('sandbox') is True and body.get('cost') == EXPECTED_COST and balance() == 19,
          f"http={st} status={sb_asset.get('status')} cost={body.get('cost') if body else None} balance={balance()} remaining={hdr.get('x-ratelimit-remaining')}")
    check('A4b X-RateLimit-Remaining = 199 بعد أول طلب', hdr.get('x-ratelimit-remaining') == '199', f"remaining={hdr.get('x-ratelimit-remaining')}")
    sb_id = sb_asset.get('id')

    st2, body2, hdr2 = api('POST', '/generate', key_test, gen_body, extra={'Idempotency-Key': idem})
    check('A5 إعادة نفس Idempotency-Key → نفس الرد مع Idempotency-Replayed', st2 == 200 and hdr2.get('idempotency-replayed') == 'true'
          and ((body2 or {}).get('asset') or {}).get('id') == sb_id, f"http={st2} replayed={hdr2.get('idempotency-replayed')}")
    st3, body3, _ = api('POST', '/generate', key_test, {**gen_body, 'prompt': 'different prompt'}, extra={'Idempotency-Key': idem})
    check('A6 نفس المفتاح بجسم مختلف → 409 IDEMPOTENCY_CONFLICT', st3 == 409 and (body3 or {}).get('error', {}).get('code') == 'IDEMPOTENCY_CONFLICT', f'http={st3} body={body3}')

    st, body, _ = api('GET', f'/assets/{sb_id}', key_test)
    check('A7 GET /assets/{id} يعيد الأصل بلا metadata داخلية', st == 200 and body.get('asset', {}).get('id') == sb_id and 'metadata' not in body.get('asset', {}),
          f"http={st} keys={sorted((body or {}).get('asset', {}).keys())}")
    st, body, _ = api('GET', f'/assets/{uuid.uuid4()}', key_test)
    check('A7b أصل غير موجود → 404', st == 404, f'http={st}')

    st, body, _ = api('GET', '/balance', 'hl_live_' + 'x' * 32)
    st_b, _, _ = api('GET', '/balance', None)
    check('A8 مفتاح خاطئ أو غائب → 401', st == 401 and st_b == 401, f'wrong={st} missing={st_b}')

    # مفتاح حي: توليدة حقيقية عبر API
    st, body, hdr = api('POST', '/generate', key_live, gen_body)
    live_asset = (body or {}).get('asset') or {}
    live_id = live_asset.get('id')
    check('A9 POST /generate بمفتاح live → 202 processing والرصيد 8', st == 202 and live_asset.get('status') == 'processing' and balance() == 8,
          f"http={st} status={live_asset.get('status')} balance={balance()}")
    a = wait_final(live_id) if live_id else None
    st, body, _ = api('GET', f'/assets/{live_id}', key_live) if live_id else (0, None, {})
    pub = (body or {}).get('asset') or {}
    check('A10 الأصل الحي يكتمل عبر الـwebhook: completed برابط وتكلفة 11', bool(a and a['status'] == 'completed') and pub.get('url') and pub.get('cost_credits') == EXPECTED_COST and balance() == 8,
          f"status={a and a['status']} url={'yes' if pub.get('url') else 'no'} cost={pub.get('cost_credits')} balance={balance()}")

    # webhook العميل: example.invalid لا يُحل → تُسجَّل 3 محاولات فاشلة لكل أصل (التوقيع نفسه مختبر في vitest)
    time.sleep(12)
    st, rows = admin_rest('GET', f'/api_webhook_deliveries?asset_id=in.({sb_id},{live_id})&select=asset_id,event,attempts,ok,url')
    by_asset = {r['asset_id']: r for r in (rows or [])} if st == 200 else {}
    check('A11 سجل تسليم webhook العميل للأصلين (3 محاولات، وجهة لا تُحل)',
          st == 200 and len(by_asset) == 2 and all(r['attempts'] == 3 and r['ok'] is False and r['url'] == hook for r in by_asset.values())
          and by_asset.get(sb_id, {}).get('event') == 'asset.completed' and by_asset.get(live_id, {}).get('event') == 'asset.completed',
          f"rows={[(r['event'], r['attempts'], r['ok']) for r in by_asset.values()]}")

    # الحد اليومي: نخفض حد مفتاح الاختبار إلى 1 (service_role) → الطلب التالي 429
    st, _ = admin_rest('PATCH', f"/api_keys?id=eq.{kt['id']}", {'daily_limit': 1}, extra={'Prefer': 'return=minimal'})
    st, body, _ = api('POST', '/generate', key_test, gen_body)
    check('A12 تجاوز الحد اليومي → 429 DAILY_LIMIT', st == 429 and (body or {}).get('error', {}).get('code') == 'DAILY_LIMIT', f'http={st} body={body}')

    # الواجهة لا تعدّل المفاتيح مباشرة (لا سياسة UPDATE) — صفر صفوف
    st, rows = rest('PATCH', f"/api_keys?id=eq.{kt['id']}", jwt, {'daily_limit': 999}, extra={'Prefer': 'return=representation'})
    check('A13 PATCH api_keys من الواجهة لا يصيب شيئًا', st in (200, 204) and not rows, f'http={st} rows={rows}')

    # الإبطال من المالك → المفتاح يتوقف فورًا
    st, ok = rest('POST', '/rpc/revoke_api_key', jwt, {'p_id': kt['id']})
    st2, _, _ = api('GET', '/balance', key_test)
    check('A14 revoke_api_key → true ثم 401', st == 200 and ok is True and st2 == 401, f'revoke={ok} after={st2}')
finally:
    if KEEP:
        print('kept test user (--keep)')
    else:
        st, _ = call('DELETE', f'/auth/v1/admin/users/{uid}', SERVICE)
        print('test user deleted' if st in (200, 204) else f'WARN could not delete test user: HTTP {st}')
        st, listing = call('POST', '/storage/v1/object/list/media', SERVICE, {'prefix': f'u/{uid}', 'limit': 100})
        names = [f"u/{uid}/{o['name']}" for o in (listing or []) if isinstance(o, dict) and o.get('name')] if st == 200 else []
        if names:
            st, _ = call('DELETE', '/storage/v1/object/media', SERVICE, {'prefixes': names})
            print(f'storage cleanup: {len(names)} file(s) ' + ('removed' if st == 200 else f'NOT removed (HTTP {st})'))

failed = [r for r in results if not r[1]]
print('\n' + ('GATE 1 PASSED' if not failed else f'GATE 1 FAILED ({len(failed)} check(s))'))
sys.exit(1 if failed else 0)
