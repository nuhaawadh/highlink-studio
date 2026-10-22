"""يجهّز ملف أسرار مؤقتًا لـ`npx supabase secrets set` من supabase/.env.local — لا يطبع أي قيمة.
- يتخطى SUPABASE_* (تُحقن تلقائيًا في Edge Functions) والمتغيرات الفارغة.
- يجلب REPLICATE_WEBHOOK_SECRET من Replicate إن لم يكن في .env.local ويُلحقه به (مصدر الأسرار يبقى واحدًا).

الاستخدام (من جذر المستودع):
    python -I scripts/push-secrets.py <ملف مؤقت>
    npx supabase secrets set --env-file <ملف مؤقت>      # يطلب تأكيدًا
    ثم احذف الملف المؤقت.
"""
import io, json, os, sys, urllib.request

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ENV = os.path.join(ROOT, 'supabase', '.env.local')

if len(sys.argv) != 2:
    sys.exit(__doc__)
OUT = sys.argv[1]

lines = io.open(ENV, encoding='utf-8').read().splitlines()
env = {}
for line in lines:
    s = line.strip()
    if s and not s.startswith('#') and '=' in s:
        k, v = s.split('=', 1)
        env[k.strip()] = v.strip().strip('"').strip("'")

tok = env.get('REPLICATE_API_TOKEN', '')
if not tok:
    sys.exit('REPLICATE_API_TOKEN missing in supabase/.env.local')

if not env.get('REPLICATE_WEBHOOK_SECRET'):
    req = urllib.request.Request(
        'https://api.replicate.com/v1/webhooks/default/secret',
        headers={'Authorization': 'Bearer ' + tok, 'User-Agent': 'highlink-studio/0.1'},
    )
    with urllib.request.urlopen(req, timeout=30) as r:
        key = json.loads(r.read()).get('key', '')
    if not key.startswith('whsec_'):
        sys.exit('unexpected webhook secret format')
    env['REPLICATE_WEBHOOK_SECRET'] = key
    with io.open(ENV, 'a', encoding='utf-8') as f:
        f.write('\nREPLICATE_WEBHOOK_SECRET=' + key + '\n')
    print('appended REPLICATE_WEBHOOK_SECRET to supabase/.env.local')

out_keys, skipped = [], []
with io.open(OUT, 'w', encoding='utf-8', newline='\n') as f:
    for k, v in env.items():
        if k.startswith('SUPABASE_') or not v:
            skipped.append(k)
            continue
        f.write(f'{k}={v}\n')
        out_keys.append(k)
print('secrets to set:', ', '.join(out_keys))
print('skipped:', ', '.join(skipped))
