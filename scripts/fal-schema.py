#!/usr/bin/env python3
"""
fal-schema.py — يجلب مخطط OpenAPI لنقطة نهاية fal ويستخرج مخطط المدخلات (القاعدة 7 والمخطط §15)
ويحفظه في content/catalog/schemas/<endpoint>.json بالشكل الذي يقرأه _shared/inputs.ts:
  { "endpoint": "...", "required": [...], "properties": {...}, "output": {...}, "fetched_at": "..." }

الاستخدام:
  python -I scripts/fal-schema.py fal-ai/kling-video/v3/pro/text-to-video            # يجلب من الشبكة
  python -I scripts/fal-schema.py --raw openapi.json fal-ai/kling-video/v3/pro/text-to-video   # من ملف محفوظ
  python -I scripts/fal-schema.py --all                                               # كل نقاط content/catalog/fal-launch.json

المصدر: https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=<endpoint>
الـ$ref المتداخلة تُحل مرة واحدة (مثل File أو عناصر multi_prompt) وتُدمج في مكانها.
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / 'content' / 'catalog' / 'schemas'
LAUNCH = ROOT / 'content' / 'catalog' / 'fal-launch.json'
URL = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id={endpoint}'


def file_name(endpoint: str) -> str:
    return endpoint.replace('/', '__') + '.json'


def resolve(node, schemas: dict, depth: int = 0):
    """يحل $ref داخل المخطط (عمق محدود يكفي لـFile والعناصر البسيطة)."""
    if depth > 6:
        return node
    if isinstance(node, dict):
        if '$ref' in node and isinstance(node['$ref'], str):
            name = node['$ref'].split('/')[-1]
            target = schemas.get(name)
            if target is None:
                return node
            merged = {k: v for k, v in node.items() if k != '$ref'}
            merged.update(resolve(target, schemas, depth + 1))
            return merged
        return {k: resolve(v, schemas, depth + 1) for k, v in node.items() if k != 'x-fal-order-properties'}
    if isinstance(node, list):
        return [resolve(x, schemas, depth + 1) for x in node]
    return node


def extract(openapi: dict, endpoint: str) -> dict:
    schemas = (openapi.get('components') or {}).get('schemas') or {}
    paths = openapi.get('paths') or {}
    post = (paths.get(f'/{endpoint}') or {}).get('post')
    if not post:
        # بعض النقاط تُسجَّل بمسار مختلف قليلًا — نأخذ أول POST
        for p, ops in paths.items():
            if 'post' in ops:
                post = ops['post']
                break
    if not post:
        raise SystemExit(f'no POST path in openapi for {endpoint}')
    in_ref = post['requestBody']['content']['application/json']['schema']
    in_schema = resolve(in_ref, schemas)
    out_schema = None
    get_result = (paths.get(f'/{endpoint}/requests/{{request_id}}') or {}).get('get')
    if get_result:
        try:
            out_schema = resolve(get_result['responses']['200']['content']['application/json']['schema'], schemas)
        except KeyError:
            out_schema = None
    props = in_schema.get('properties') or {}
    # نبقي الحقول المفيدة فقط لكل خاصية (المخطط كبير؛ inputs.ts يحتاج type/enum/default/maxItems/items/anyOf)
    keep = ('type', 'enum', 'default', 'maxItems', 'minItems', 'items', 'anyOf', 'minimum', 'maximum', 'maxLength', 'description', 'title', 'format')
    slim = {k: {kk: vv for kk, vv in v.items() if kk in keep} for k, v in props.items() if isinstance(v, dict)}
    return {
        'endpoint': endpoint,
        'required': in_schema.get('required') or [],
        'properties': slim,
        'output': out_schema,
        'fetched_at': datetime.now(timezone.utc).isoformat(timespec='seconds'),
    }


def fetch(endpoint: str) -> dict:
    req = urllib.request.Request(URL.format(endpoint=endpoint), headers={'User-Agent': 'highlink-studio/schema'})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.load(r)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('endpoint', nargs='?')
    ap.add_argument('--raw', type=Path, help='ملف OpenAPI محفوظ بدل الجلب من الشبكة')
    ap.add_argument('--all', action='store_true', help='كل نقاط fal-launch.json (يجلب من الشبكة)')
    args = ap.parse_args()

    targets: list[tuple[str, dict | None]] = []
    if args.all:
        launch = json.loads(LAUNCH.read_text())
        targets = [(m['provider_slug'], None) for m in launch['models'] if m.get('provider') == 'fal']
    elif args.endpoint:
        targets = [(args.endpoint, json.loads(args.raw.read_text()) if args.raw else None)]
    else:
        ap.error('endpoint or --all required')

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for endpoint, raw in targets:
        openapi = raw if raw is not None else fetch(endpoint)
        data = extract(openapi, endpoint)
        out = OUT_DIR / file_name(endpoint)
        out.write_text(json.dumps(data, ensure_ascii=False, indent=1) + '\n')
        p = data['properties']
        summary = {k: (p[k].get('enum') or p[k].get('type')) for k in ('duration', 'resolution', 'aspect_ratio', 'image_url', 'image_urls', 'start_image_url', 'generate_audio', 'image_size', 'num_images') if k in p}
        print(f'{endpoint} -> {out.relative_to(ROOT)} | required={data["required"]} | {summary}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
