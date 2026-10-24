"""يعبّئ Supabase Vault بالسرّين اللذين تحتاجهما مهمة reconcile المجدولة (migration 0006) — لا يطبع أي قيمة.

    python -I scripts/push-vault-secrets.py

- ops_project_url      ← SUPABASE_URL من supabase/.env.local
- ops_reconcile_secret ← RECONCILE_SECRET من supabase/.env.local (نفس السر المرفوع لـEdge Function `reconcile`)

يستدعي RPC `set_ops_secret` بمفتاح service_role: القيمة تمر كـJSON في جسم الطلب، فلا تُكتب في أي SQL أو ملف.
بعد تدوير RECONCILE_SECRET: ارفعه للوظائف (push-secrets.py ثم secrets set) ثم أعد تشغيل هذا السكربت.
"""
import io, json, os, sys, urllib.request, urllib.error

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'supabase', '.env.local')

env = {}
for line in io.open(ENV, encoding='utf-8').read().splitlines():
    s = line.strip()
    if s and not s.startswith('#') and '=' in s:
        k, v = s.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

url = env.get('SUPABASE_URL', '').rstrip('/')
key = env.get('SUPABASE_SERVICE_ROLE_KEY', '')
secret = env.get('RECONCILE_SECRET', '')
missing = [n for n, v in (('SUPABASE_URL', url), ('SUPABASE_SERVICE_ROLE_KEY', key), ('RECONCILE_SECRET', secret)) if not v]
if missing:
    sys.exit('missing in supabase/.env.local: ' + ', '.join(missing))

headers = {'apikey': key, 'Content-Type': 'application/json'}
# المفاتيح القديمة (JWT) تُرسل في Authorization أيضًا؛ الجديدة (sb_secret_) لا
if key.startswith('eyJ'):
    headers['Authorization'] = 'Bearer ' + key


def set_secret(name, value):
    body = json.dumps({'p_name': name, 'p_value': value}).encode()
    req = urllib.request.Request(url + '/rest/v1/rpc/set_ops_secret', data=body, method='POST', headers=headers)
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            return r.status, ''
    except urllib.error.HTTPError as e:
        # رسالة الخطأ من PostgREST لا تحوي القيمة
        return e.code, e.read().decode('utf-8', 'replace')[:300]


ok = True
for name, value in (('ops_project_url', url), ('ops_reconcile_secret', secret)):
    status, detail = set_secret(name, value)
    print(f'{name}: HTTP {status}' + (f' {detail}' if detail else ''))
    ok = ok and 200 <= status < 300
sys.exit(0 if ok else 1)
