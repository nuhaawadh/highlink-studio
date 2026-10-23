#!/usr/bin/env python3
"""
fal-catalog.py — يبني كتالوج fal.ai الكامل في content/catalog/fal-models.json (ADR 0005).

المصدر: واجهة fal العامة https://fal.ai/api/models?page=N&limit=500 (JSON، بلا مفتاح) + ملف sitemap
لنقاط النهاية المخفية عن الكتالوج (noindex: Veo 3.1، Seedance 2.5 غير الأمريكي…).

الاستخدام:
  python -I scripts/fal-catalog.py                       # يجلب من الشبكة ويكتب الكتالوج
  python -I scripts/fal-catalog.py --from-dir <dir>      # يقرأ page_1.json..page_N.json المحفوظة (بلا شبكة)
  python -I scripts/fal-catalog.py --hidden <file>       # قائمة معرّفات إضافية (سطر لكل معرّف) تُدرج كـhidden

المخرجات:
  content/catalog/fal-models.json  — كل نقطة نهاية: id, title, category, lab, family, license, tags, pricing_text,
                                     pricing (تحليل تقريبي: unit/usd/by_resolution), published_at, hidden
  content/catalog/fal-models.md    — ملخص بالأعداد حسب الفئة والمختبر

التسعير المحلَّل تقريبي ويُستخدم للفرز والعرض فقط؛ سعر أي نموذج يُفعَّل في seed.sql يُؤخذ من نص المزوّد وقت التفعيل (القاعدة 7).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
import urllib.request
from collections import Counter
from pathlib import Path

API = 'https://fal.ai/api/models?page={page}&limit=500'
ROOT = Path(__file__).resolve().parent.parent
OUT_JSON = ROOT / 'content' / 'catalog' / 'fal-models.json'
OUT_MD = ROOT / 'content' / 'catalog' / 'fal-models.md'

MONEY = r'\*{0,2}\$\s?([0-9]+(?:\.[0-9]+)?)\*{0,2}'
UNIT_PATTERNS: list[tuple[str, str]] = [
    (r'per\s+(?:generated\s+|video\s+|output\s+)?second', 'second'),
    (r'/\s*s(?:ec(?:ond)?)?\b', 'second'),
    (r'per\s+(?:generated\s+)?image', 'image'),
    (r'per\s+(?:generated\s+)?megapixel', 'megapixel'),
    (r'per\s+(?:1,?000|1k|thousand)\s+characters', '1k_chars'),
    (r'per\s+(?:1,?000|1k)\s+tokens', '1k_tokens'),
    (r'per\s+(?:output\s+|input\s+)?(?:audio\s+)?minute', 'minute'),
    (r'per\s+(?:video\s+)?generation', 'request'),
    (r'per\s+(?:request|edit|call|run|call)', 'request'),
    (r'per\s+(?:created\s+)?voice', 'voice'),
    (r'per\s+compute\s+second', 'compute_second'),
]
RES = r'(360p|480p|540p|576p|580p|720p|768p|1080p|1440p|2160p|2k|4k)'


def parse_pricing(text: str | None) -> dict | None:
    """تحليل تقريبي لنص التسعير: أول سعر ووحدته، وخريطة بالدقة إن وُجدت."""
    if not text:
        return None
    t = text.replace(' ', ' ')
    out: dict = {}
    m = re.search(MONEY, t)
    if not m:
        return None
    out['usd'] = float(m.group(1))
    tail = t[m.end(): m.end() + 60].lower()
    unit = None
    for pat, u in UNIT_PATTERNS:
        if re.search(pat, tail):
            unit = u
            break
    if unit is None:
        # أنماط "For 5s video your request will cost $X" / "A 5-second video ... costs $X"
        head = t[max(0, m.start() - 80): m.start()].lower()
        if re.search(r'(\d+)\s*-?\s*s(?:ec(?:ond)?)?\b.*(video|clip)', head):
            unit = 'clip'
    if unit is None:
        # الوحدة قد تسبق السعر ("For every second of video … charged $0.05") أو تأتي بصيغة أخرى — نبحث في النص كله
        whole = t.lower()
        for pat, u in [(r'every\s+second|per\s+(?:generated\s+|video\s+|output\s+)?second|/\s*second', 'second'),
                       (r'per\s+(?:output\s+|generated\s+)?image|each\s+image', 'image'),
                       (r'megapixel', 'megapixel'), (r'1,?000\s+characters', '1k_chars'), (r'1,?000\s+tokens|per\s+1m\s+', '1k_tokens'),
                       (r'per\s+minute|audio\s+minute', 'minute'), (r'per\s+(?:video\s+)?generation|per\s+request|per\s+call|per\s+edit', 'request')]:
            if re.search(pat, whole):
                unit = u
                break
    out['unit'] = unit or 'unknown'
    by_res: dict[str, float] = {}
    for mm in re.finditer(MONEY + r'[^$]{0,40}?' + RES, t, flags=re.I):
        by_res.setdefault(mm.group(2).lower(), float(mm.group(1)))
    for mm in re.finditer(RES + r'[^$]{0,40}?' + MONEY, t, flags=re.I):
        by_res.setdefault(mm.group(1).lower(), float(mm.group(2)))
    if by_res:
        out['by_resolution'] = by_res
    if re.search(r'promotional|limited time|discount', t, flags=re.I):
        out['promo'] = True
    return out


def normalize(item: dict, hidden: bool = False) -> dict:
    disc = item.get('discovery') or {}
    tags = sorted(set((disc.get('tags') or []) + [f'cat:{item.get("category")}']))
    pricing_text = ' '.join(x for x in [item.get('pricingInfoOverride'), item.get('billingMessage')] if x) or None
    return {
        'id': item['id'],
        'title': item.get('title'),
        'category': item.get('category'),
        'lab': item.get('modelLab') or disc.get('lab'),
        'family': item.get('modelFamily') or disc.get('family'),
        'license': item.get('licenseType'),
        'tags': tags,
        'description': item.get('shortDescription'),
        'pricing_text': pricing_text,
        'pricing': parse_pricing(pricing_text),
        'machine_type': item.get('machineType'),
        'published_at': item.get('publishedAt'),
        'deprecated': bool(item.get('deprecated')),
        'hidden': hidden,
        'thumbnail': item.get('thumbnailUrl'),
        'url': f'https://fal.ai/models/{item["id"]}',
        'schema_url': f'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id={item["id"]}',
    }


def fetch_pages() -> list[dict]:
    items: list[dict] = []
    page = 1
    while True:
        req = urllib.request.Request(API.format(page=page), headers={'User-Agent': 'highlink-studio/catalog'})
        with urllib.request.urlopen(req, timeout=60) as r:
            d = json.load(r)
        items += d['items']
        if page >= int(d.get('pages') or 1):
            break
        page += 1
    return items


def load_dir(d: Path) -> list[dict]:
    items: list[dict] = []
    for p in sorted(d.glob('page_*.json'), key=lambda x: int(re.sub(r'\D', '', x.stem) or 0)):
        items += json.loads(p.read_text())['items']
    return items


def guess_category(endpoint: str) -> str:
    e = endpoint.lower()
    for key, cat in [
        ('text-to-video', 'text-to-video'), ('image-to-video', 'image-to-video'), ('reference-to-video', 'image-to-video'),
        ('first-last-frame', 'image-to-video'), ('keyframes-to-video', 'image-to-video'), ('extend-video', 'video-to-video'),
        ('video-to-video', 'video-to-video'), ('edit-video', 'video-to-video'), ('lipsync', 'video-to-video'),
        ('text-to-image', 'text-to-image'), ('edit', 'image-to-image'), ('tts', 'text-to-speech'), ('speech', 'text-to-speech'),
        ('music', 'text-to-audio'), ('sound-effect', 'text-to-audio'), ('upscale/video', 'video-to-video'), ('upscale', 'image-to-image'),
        ('whisper', 'speech-to-text'), ('avatar', 'image-to-video'), ('omnihuman', 'image-to-video'),
    ]:
        if key in e:
            return cat
    return 'unknown'


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--from-dir', type=Path)
    ap.add_argument('--hidden', type=Path, help='معرّفات نقاط نهاية إضافية (hidden/noindex) سطرًا سطرًا')
    args = ap.parse_args()

    raw = load_dir(args.from_dir) if args.from_dir else fetch_pages()
    seen = {i['id'] for i in raw}
    models = [normalize(i) for i in raw]

    if args.hidden and args.hidden.exists():
        for line in args.hidden.read_text().splitlines():
            eid = line.strip()
            if not eid or eid in seen:
                continue
            models.append(normalize({'id': eid, 'title': eid.split('/')[-1].replace('-', ' ').title(), 'category': guess_category(eid),
                                     'licenseType': None, 'discovery': {}, 'shortDescription': None}, hidden=True))
            seen.add(eid)

    models.sort(key=lambda m: (m['category'] or '', m['id']))
    OUT_JSON.parent.mkdir(parents=True, exist_ok=True)
    OUT_JSON.write_text(json.dumps({'source': 'https://fal.ai/api/models', 'generated_by': 'scripts/fal-catalog.py', 'count': len(models), 'models': models},
                                   ensure_ascii=False, indent=1) + '\n')

    cats = Counter(m['category'] for m in models)
    labs = Counter(m['lab'] or '—' for m in models)
    priced = sum(1 for m in models if m['pricing'])
    md = ['# كتالوج fal.ai — ملخص', '', f'- نقاط النهاية: **{len(models)}** (منها {sum(1 for m in models if m["hidden"])} مخفية عن كتالوج fal/noindex)',
          f'- بسعر معلن قابل للتحليل: {priced} — الباقي يُسعَّر بوقت GPU أو بلا نص سعر', '', '## حسب الفئة', '', '| الفئة | العدد |', '| --- | --- |']
    md += [f'| {c} | {n} |' for c, n in cats.most_common()]
    md += ['', '## حسب المختبر (أعلى 30)', '', '| المختبر | العدد |', '| --- | --- |']
    md += [f'| {l} | {n} |' for l, n in labs.most_common(30)]
    md += ['', 'يُحدَّث بـ `python -I scripts/fal-catalog.py` (يحتاج وصولًا إلى fal.ai). التسعير المحلَّل تقريبي — سعر التفعيل يُؤخذ من صفحة المزوّد (القاعدة 7).']
    OUT_MD.write_text('\n'.join(md) + '\n')
    print(f'wrote {OUT_JSON.relative_to(ROOT)} ({len(models)} models, {priced} priced)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
