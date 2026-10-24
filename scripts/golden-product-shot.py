"""المجموعة الذهبية لاستوديو المنتجات (المخطط §15، ADR 0006) — تشغيل حقيقي عبر generate-media قبل التفعيل.

    python -I scripts/golden-product-shot.py            # يشغّل المجموعة ويكتب التقرير
    python -I scripts/golden-product-shot.py --cleanup  # بعد قراءة التقرير: يحذف المستخدم المؤقت وملفاته

المدخلات: content/golden/product-shot/inputs/*.png|jpg|jpeg|webp (مستثناة من git — صور منتجات حقيقية)
          content/golden/product-shot/products.json اختياري: [{"file": "a.jpg", "name": "عطر", "text": "عرض خاص", "preset": "luxury"}]
          بلا ملف: كل صورة بـpreset الوصفة الافتراضي وبلا نص.
المخرجات: content/golden/product-shot/report-<date>.html (مستثنى من git؛ الصور بروابطها العامة حتى --cleanup)
          content/golden/product-shot/results-<date>.json (درجات فقط — يُلتزم في git)

ما يفعله: مستخدم مؤقت + app_admins + باقة creators (تزامن 8) + منحة رصيد → يرفع كل صورة عبر سياسة up/{uid}/ الحقيقية
→ 3 أصول queued بنفس run_id → generate-media بالحزمة الافتراضية → ينتظر الحالات النهائية (سكربت، لا واجهة: الاستعلام مسموح)
→ التقرير. لا يطبع أي سر. معيار الاجتياز المقترح: كل صورة مسلَّمة نجحت في البوابة (≥ 7)، صفر نص خاطئ مسلَّم، فشل نهائي ≤ 2 من 30.
"""
import datetime, html, io, json, mimetypes, os, secrets, string, sys, time, urllib.error, urllib.request, uuid

for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
GOLD = os.path.join(ROOT, 'content', 'golden', 'product-shot')
INPUTS = os.path.join(GOLD, 'inputs')
STATE = os.path.join(GOLD, '.golden-user.json')
STUDIO = 'product-shot'
DEADLINE_S = 45 * 60


def read_env(path):
    env = {}
    for line in io.open(path, encoding='utf-8').read().splitlines():
        s = line.strip()
        if s and not s.startswith('#') and '=' in s:
            k, v = s.split('=', 1)
            env[k.strip()] = v.strip().strip('"').strip("'")
    return env


E = read_env(os.path.join(ROOT, 'supabase', '.env.local'))
W = read_env(os.path.join(ROOT, 'apps', 'web', '.env.local'))
URL = E['SUPABASE_URL'].rstrip('/')
SRK = E['SUPABASE_SERVICE_ROLE_KEY']
ANON = W['VITE_SUPABASE_ANON_KEY']


def call(method, path, body=None, *, key=None, jwt=None, headers=None, raw=None, timeout=120):
    h = {'apikey': key or ANON}
    if jwt:
        h['Authorization'] = 'Bearer ' + jwt
    elif key and key.startswith('eyJ'):
        h['Authorization'] = 'Bearer ' + key
    data = raw
    if body is not None:
        data = json.dumps(body).encode()
        h['Content-Type'] = 'application/json'
    h.update(headers or {})
    req = urllib.request.Request(URL + path, data=data, method=method, headers=h)
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r:
            t = r.read().decode('utf-8')
            return r.status, (json.loads(t) if t else None)
    except urllib.error.HTTPError as e:
        t = e.read().decode('utf-8', 'replace')
        try:
            return e.code, json.loads(t)
        except Exception:
            return e.code, t[:400]


def admin(method, path, body=None, **kw):
    return call(method, path, body, key=SRK, **kw)


def cleanup():
    if not os.path.exists(STATE):
        sys.exit('no golden user recorded')
    uid = json.load(io.open(STATE, encoding='utf-8'))['id']
    names = []
    for prefix in (f'u/{uid}', f'up/{uid}', 'qa/'):
        st, objs = admin('POST', '/storage/v1/object/list/media', {'prefix': prefix, 'limit': 1000, 'offset': 0})
        if isinstance(objs, list):
            names += [f'{prefix}/{o["name"]}' if not prefix.endswith('/') else f'{prefix}{o["name"]}' for o in objs if o.get('id')]
    # qa/ مجلدات حسب الأصل: نحذف فقط أصول هذا المستخدم
    st, assets = admin('GET', f'/rest/v1/assets?user_id=eq.{uid}&select=id')
    own = {a['id'] for a in assets} if isinstance(assets, list) else set()
    for aid in own:
        st, objs = admin('POST', '/storage/v1/object/list/media', {'prefix': f'qa/{aid}', 'limit': 100, 'offset': 0})
        if isinstance(objs, list):
            names += [f'qa/{aid}/{o["name"]}' for o in objs if o.get('id')]
    names = [n for n in names if not n.startswith('qa/') or n.split('/')[1] in own]
    if names:
        print('storage delete', admin('DELETE', '/storage/v1/object/media', {'prefixes': names})[0], len(names))
    print('user delete', admin('DELETE', f'/auth/v1/admin/users/{uid}')[0])
    os.remove(STATE)


def load_products():
    files = sorted(f for f in os.listdir(INPUTS) if f.lower().endswith(('.png', '.jpg', '.jpeg', '.webp'))) if os.path.isdir(INPUTS) else []
    if not files:
        sys.exit(f'no images in {INPUTS}')
    meta = {}
    pj = os.path.join(GOLD, 'products.json')
    if os.path.exists(pj):
        for p in json.load(io.open(pj, encoding='utf-8')):
            meta[p['file']] = p
    return [{'file': f, 'name': meta.get(f, {}).get('name') or os.path.splitext(f)[0], 'text': meta.get(f, {}).get('text'), 'preset': meta.get(f, {}).get('preset')} for f in files]


def main():
    products = load_products()
    st, row = admin('GET', f'/rest/v1/studios?id=eq.{STUDIO}&select=pipeline')
    recipe = row[0]['pipeline']
    outputs = [o for o in recipe['outputs'] if o['default']]
    print(f'{len(products)} products × {len(outputs)} sizes = {len(products) * len(outputs)} images')

    # مستخدم مؤقت مشرف بباقة creators (تزامن 8) ورصيد كافٍ
    email = f'golden-{uuid.uuid4().hex[:6]}@example.invalid'
    pw = 'Gd-' + ''.join(secrets.choice(string.ascii_letters + string.digits) for _ in range(16))
    st, u = admin('POST', '/auth/v1/admin/users', {'email': email, 'password': pw, 'email_confirm': True})
    assert st == 200, (st, u)
    uid = u['id']
    io.open(STATE, 'w', encoding='utf-8').write(json.dumps({'id': uid, 'email': email}))
    assert admin('POST', '/rest/v1/app_admins', {'user_id': uid, 'note': 'golden set (temporary)'}, headers={'Prefer': 'return=minimal'})[0] == 201
    assert admin('PATCH', f'/rest/v1/profiles?id=eq.{uid}', {'plan_id': 'creators'}, headers={'Prefer': 'return=minimal'})[0] == 204
    assert admin('POST', '/rest/v1/rpc/grant_credits', {'p_user': uid, 'p_amount': 15 * len(products) * len(outputs), 'p_kind': 'bonus', 'p_ref': 'golden-set'})[0] == 200
    st, tok = call('POST', '/auth/v1/token?grant_type=password', {'email': email, 'password': pw})
    jwt = tok['access_token']
    print('golden user ready', uid)

    runs = []
    for p in products:
        path = os.path.join(INPUTS, p['file'])
        mime = mimetypes.guess_type(path)[0] or 'image/jpeg'
        ext = {'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp'}[mime]
        obj = f'up/{uid}/{uuid.uuid4()}.{ext}'
        st, _ = call('POST', f'/storage/v1/object/media/{obj}', jwt=jwt, raw=open(path, 'rb').read(), headers={'Content-Type': mime, 'x-upsert': 'false'})
        assert st in (200, 201), (p['file'], st, _)
        ref = f'{URL}/storage/v1/object/public/media/{obj}'
        run_id = str(uuid.uuid4())
        preset = p['preset'] or recipe['defaults']['preset']
        display = recipe['presets'][preset]['ar']
        ids = []
        for o in outputs:
            aid = str(uuid.uuid4())
            st, _ = call('POST', '/rest/v1/assets', {'id': aid, 'user_id': uid, 'type': 'image', 'status': 'queued', 'model': f'studio:{STUDIO}', 'prompt': display,
                                                     'aspect_ratio': o['aspect_ratio'], 'resolution': recipe['defaults']['resolution'], 'feature_tag': 'product', 'run_id': run_id},
                         jwt=jwt, headers={'Prefer': 'return=minimal'})
            assert st == 201, (st, _)
            ids.append((aid, o['key']))
        body = {'assetId': ids[0][0], 'model': f'studio:{STUDIO}', 'prompt': display, 'images': [ref], 'feature_tag': 'product', 'locale': 'ar',
                'studio': {'preset': preset, 'outputs': [{'assetId': a, 'key': k} for a, k in ids], **({'text': p['text']} if p['text'] else {})}}
        t0 = time.time()
        st, res = call('POST', '/functions/v1/generate-media', body, jwt=jwt, timeout=180)
        print(f"  {p['file']}: {st} cost={res.get('cost') if isinstance(res, dict) else '?'} {time.time() - t0:.0f}s" + ('' if st == 200 else f' {res}'))
        runs.append({**p, 'preset': preset, 'reference_url': ref, 'run_id': run_id, 'assets': ids, 'submit_status': st})

    # انتظار الحالات النهائية (QA قد يعيد الإرسال مرتين)
    all_ids = [a for r in runs for a, _ in r['assets']]
    started = time.time()
    while True:
        st, rows = admin('GET', f'/rest/v1/assets?id=in.({",".join(all_ids)})&select=id,status')
        pending = [r for r in rows if r['status'] not in ('completed', 'failed', 'canceled')]
        print(f'  waiting: {len(pending)} of {len(all_ids)} still running ({time.time() - started:.0f}s)')
        if not pending or time.time() - started > DEADLINE_S:
            break
        time.sleep(30)

    st, rows = admin('GET', f'/rest/v1/assets?id=in.({",".join(all_ids)})&select=id,status,url,aspect_ratio,error_message,metadata')
    by_id = {r['id']: r for r in rows}
    results = []
    for r in runs:
        for aid, key in r['assets']:
            a = by_id[aid]
            qa = (a.get('metadata') or {}).get('qa') or {}
            results.append({
                'product': r['name'], 'file': r['file'], 'preset': r['preset'], 'text': r['text'], 'output': key, 'aspect_ratio': a['aspect_ratio'],
                'status': a['status'], 'qa_status': qa.get('status'), 'product_match': qa.get('product_match'), 'text_exact': qa.get('text_exact'),
                'text_found': qa.get('text_found'), 'retries_used': qa.get('retries_used', 0), 'judge_model': qa.get('judge_model'),
                'reasons': qa.get('reasons'), 'attempts': qa.get('attempts', []), 'url': a.get('url'), 'reference_url': r['reference_url'],
                'error': a.get('error_message'),
            })

    delivered = [x for x in results if x['status'] == 'completed']
    summary = {
        'images': len(results),
        'delivered': len(delivered),
        'delivered_passed': sum(1 for x in delivered if x['qa_status'] == 'passed'),
        'delivered_unchecked': sum(1 for x in delivered if x['qa_status'] == 'unchecked'),
        'delivered_wrong_text': sum(1 for x in delivered if x['text'] and x['text_exact'] is False),
        'final_failures': sum(1 for x in results if x['status'] == 'failed'),
        'retries_total': sum(x['retries_used'] or 0 for x in results),
        'min_delivered_match': min((x['product_match'] for x in delivered if isinstance(x['product_match'], int)), default=None),
    }
    summary['pass'] = (summary['delivered_passed'] == summary['delivered'] and summary['delivered_wrong_text'] == 0 and summary['final_failures'] <= 2)
    date = datetime.date.today().isoformat()
    io.open(os.path.join(GOLD, f'results-{date}.json'), 'w', encoding='utf-8').write(json.dumps(
        {'date': date, 'studio': STUDIO, 'summary': summary, 'results': [{k: v for k, v in x.items() if k not in ('url', 'reference_url', 'attempts')} for x in results]},
        ensure_ascii=False, indent=2))
    write_report(os.path.join(GOLD, f'report-{date}.html'), date, summary, runs, results)
    print(json.dumps(summary, ensure_ascii=False))
    print('report:', os.path.join(GOLD, f'report-{date}.html'))
    print('after review: python -I scripts/golden-product-shot.py --cleanup')


def write_report(path, date, summary, runs, results):
    e = html.escape
    rows = []
    for r in runs:
        cells = [f'<figure class="ref"><img src="{e(r["reference_url"])}" alt=""><figcaption>المرجع</figcaption></figure>']
        for x in [x for x in results if x['file'] == r['file']]:
            ok = x['status'] == 'completed'
            score = f'{x["product_match"]}/10' if isinstance(x['product_match'], int) else '—'
            txt = ''
            if x['text']:
                txt = f'<div>النص: {"مطابق" if x["text_exact"] else "غير مطابق"} · قرئ: {e(str(x["text_found"]))}</div>'
            body = f'<img src="{e(x["url"])}" alt="">' if ok and x['url'] else f'<div class="fail">{e(x["error"] or x["status"])}</div>'
            rejected = ''.join(
                f'<a href="{e(URL)}/storage/v1/object/public/media/{e(t["rejected_path"])}" target="_blank">مرفوضة {i + 1} ({t.get("product_match")}/10)</a> '
                for i, t in enumerate(x['attempts']) if t.get('rejected_path'))
            cells.append(f'<figure class="{"ok" if ok else "bad"}">{body}<figcaption><b>{e(x["output"])} {e(x["aspect_ratio"] or "")}</b>'
                         f' · جودة {score} · {e(x["qa_status"] or "")} · إعادات {x["retries_used"] or 0}{txt}<div>{rejected}</div></figcaption></figure>')
        head = f'<h2>{e(r["name"])} <small>{e(r["preset"])}{" · نص: " + e(r["text"]) if r["text"] else ""}</small></h2>'
        rows.append(f'<section>{head}<div class="row">{"".join(cells)}</div></section>')
    verdict = 'يجتاز المعيار المقترح' if summary['pass'] else 'لا يجتاز المعيار المقترح'
    doc = f"""<!doctype html><html lang="ar" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>المجموعة الذهبية — استوديو المنتجات {date}</title>
<style>
:root{{--bg:#fff;--ink:#0a0a0a;--muted:#6b6b6b;--line:#e4e4e4;--ok:#6eda8e;--bad:#c0392b}}
@media (prefers-color-scheme: dark){{:root:not([data-theme="light"]){{--bg:#0a0a0a;--ink:#f4f4f2;--muted:#a3a3a3;--line:#2a2a2a}}}}
body{{margin:0;background:var(--bg);color:var(--ink);font-family:Tajawal,system-ui,sans-serif;padding:16px}}
h1{{font-weight:800;margin:0 0 4px}} h2{{font-size:18px;margin:24px 0 8px}} small{{color:var(--muted);font-weight:400}}
.sum{{border:1px solid var(--line);padding:12px;margin:12px 0;display:flex;flex-wrap:wrap;gap:16px}}
.row{{display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:8px}}
figure{{margin:0;border:1px solid var(--line)}} figure.ok{{border-color:var(--ok)}} figure.bad{{border-color:var(--bad)}}
img{{width:100%;display:block;aspect-ratio:auto;max-height:340px;object-fit:contain;background:#f4f4f2}}
figcaption{{font-size:12px;padding:6px;line-height:1.6}} .fail{{padding:24px 8px;color:var(--bad);font-size:13px}} a{{color:inherit}}
</style></head><body>
<h1>المجموعة الذهبية — استوديو المنتجات</h1><p><small>{date} · الحزمة الافتراضية · {verdict}</small></p>
<div class="sum"><span>الصور: {summary['images']}</span><span>المسلَّمة: {summary['delivered']}</span><span>اجتازت البوابة: {summary['delivered_passed']}</span>
<span>بلا فحص: {summary['delivered_unchecked']}</span><span>نص خاطئ مسلَّم: {summary['delivered_wrong_text']}</span><span>فشل نهائي: {summary['final_failures']}</span>
<span>إعادات على حساب المنصة: {summary['retries_total']}</span><span>أدنى درجة مسلَّمة: {summary['min_delivered_match']}</span></div>
{''.join(rows)}
</body></html>"""
    io.open(path, 'w', encoding='utf-8').write(doc)


if __name__ == '__main__':
    cleanup() if '--cleanup' in sys.argv else main()
