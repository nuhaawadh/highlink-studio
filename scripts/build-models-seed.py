#!/usr/bin/env python3
"""
build-models-seed.py — يبني صفوف جدول `models` لكتالوج fal (ADR 0005) ويكتبها داخل supabase/seed.sql
بين العلامتين `-- BEGIN fal-catalog (generated)` و `-- END fal-catalog (generated)`.

المصادر (لا تُحرَّر صفوف الكتلة المولّدة يدويًا — عدّل المصدر ثم أعد التوليد):
  content/catalog/fal-launch.json      قائمة الإطلاق المنسّقة يدويًا (المعرّف، الأسماء، العائلة، النوع، الطبقة)
  content/catalog/pricing/<ep__>.json  سعر fal الرسمي لكل نقطة (وحدته ونصّه)
  content/catalog/schemas/<ep__>.json  مخطط مدخلات fal (OpenAPI) لكل نقطة

قواعد التسعير (CLAUDE.md القاعدة 7 والمخطط §7): 1 رصيد = 0.042$، هامش ×3.
  second     → cost_per_second = usd×3÷0.042 (رصيد/ثانية، 4 منازل)؛ تجاوزات بالدقة في supports.cps_by_resolution؛ زيادة الصوت في supports.audio_cps
  clip       → cost_credits = ceil(usd×3÷0.042) ثابت للمقطع؛ اختلاف المدة في supports.credits_by_duration
  image      → cost_credits = ceil(usd×3÷0.042)؛ اختلاف الدقة (1k/2k/4k) → supports.resolution_multipliers
  megapixel  → نعتبر 1K = 1 ميغابكسل و2K = 4 (تقريب محافظ لصالحنا)؛ sizes ['1K','2K']
  request    → cost_credits ثابت
  minute     → cost_per_second = usd/60×3÷0.042 (فيديوهات الأدوات — الطبقة b)
  1k_chars/token/unknown → لا يُفعَّل (الصوت في المرحلة 2؛ الصور المسعّرة بالتوكنات تحتاج per_image_estimate_usd)

التفعيل: tier a + سعر مؤكد (confidence ≠ low) + مخطط موجود + وحدة قابلة للتسعير + ليس 4K-فقط (حد التخزين 50MB حتى R2).
الاستخدام: python -I scripts/build-models-seed.py [--check]   (--check: يطبع الملخص بلا كتابة)
"""
from __future__ import annotations

import argparse
import json
import math
import re
import sys
from collections import Counter
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAUNCH = ROOT / 'content' / 'catalog' / 'fal-launch.json'
PRICING = ROOT / 'content' / 'catalog' / 'pricing'
SCHEMAS = ROOT / 'content' / 'catalog' / 'schemas'
SEED = ROOT / 'supabase' / 'seed.sql'
# نسخة JSON من الصفوف المولّدة — يقرأها اختبار supabase/functions/_shared/catalog.test.ts
GENERATED = ROOT / 'content' / 'catalog' / 'models.generated.json'
BEGIN = '-- BEGIN fal-catalog (generated)'
END = '-- END fal-catalog (generated)'

CREDIT_USD = 0.042
MARKUP = 3
OUR_RATIOS = ['1:1', '9:16', '16:9', '4:5', '3:4']
PRESET_TO_RATIO = {'square_hd': '1:1', 'square': '1:1', 'landscape_16_9': '16:9', 'portrait_16_9': '9:16', 'portrait_4_3': '3:4', 'landscape_4_3': '4:3'}
# أنواع العمليات التي تعمل بالمحرك الحالي (نص/صور كمراجع → صورة أو فيديو). الباقي يحتاج مدخلات فيديو/صوت (المرحلة 2)
ENGINE_KINDS = {'t2v', 'i2v', 'ref2v', 'flf2v', 'transition', 't2i', 'edit', 'character', 'transparent', 'vector', 'vectorize', 'vto', 'product', 'expand', 'bg-replace', 'bg-remove', 'erase', 'fill', 'upscale'}
# أنواع تعمل على صورة/مرجع من المستخدم دائمًا (requires_ref حتى لو لم يطلبه المخطط)
REF_KINDS = {'i2v', 'ref2v', 'flf2v', 'transition', 'edit', 'character', 'vectorize', 'vto', 'product', 'expand', 'bg-replace', 'bg-remove', 'erase', 'fill', 'upscale'}
HIDE_UI = {'nano-banana-pro-fal'}
# حقول يملؤها inputs.ts من طلبنا الموحّد (أي حقل مطلوب خارجها بلا افتراض = النموذج معطّل)
FILLABLE = {'prompt', 'image_input', 'image_urls', 'reference_image_urls', 'image_url', 'start_image_url', 'end_image_url',
            'first_frame_url', 'first_image_url', 'last_frame_url', 'last_image_url', 'tail_image_url', 'person_image_url',
            'product_image_url', 'garment_image_url', 'product_image_urls', 'garment_image_urls', 'aspect_ratio', 'image_size',
            'resolution', 'duration', 'generate_audio', 'enable_audio', 'with_audio', 'num_images', 'output_format',
            'enable_safety_checker', 'seed'}
# أنواع تعمل في الواجهة بلا رفع مراجع (الباقي عبر API v1 حتى يُبنى رفع المراجع)
UI_KINDS = {'t2v', 't2i', 'vector', 'transparent'}
# دقات نستبعدها حتى الانتقال إلى R2 (حد bucket 50MB — migration 0002)
EXCLUDED_RES = {'4k', '2160p', '2k'}


def fname(ep: str) -> str:
    return ep.replace('/', '__') + '.json'


def credits(usd: float) -> int:
    return math.ceil(usd * MARKUP / CREDIT_USD - 1e-9)


def cps(usd_per_second: float) -> float:
    return round(usd_per_second * MARKUP / CREDIT_USD, 4)


def sql_str(s: str | None) -> str:
    return 'null' if s is None else "'" + s.replace("'", "''") + "'"


def sql_json(obj) -> str:
    return "'" + json.dumps(obj, ensure_ascii=False, separators=(',', ':')).replace("'", "''") + "'"


def effective(prop: dict) -> dict:
    if prop.get('type') or prop.get('enum'):
        return prop
    for a in prop.get('anyOf') or []:
        if a.get('type') != 'null' and (a.get('type') or a.get('enum')):
            return a
    return prop


def enum_of(prop: dict | None) -> list | None:
    if not prop:
        return None
    if isinstance(prop.get('enum'), list):
        return prop['enum']
    alts = [a['enum'] for a in (prop.get('anyOf') or []) if isinstance(a.get('enum'), list)]
    return [x for e in alts for x in e] or None


def accepts_object(prop: dict | None) -> bool:
    return bool(prop) and (prop.get('type') == 'object' or any(a.get('type') == 'object' for a in prop.get('anyOf') or []))


def parse_seconds(v) -> int | None:
    if isinstance(v, (int, float)) and v > 0:
        return int(math.ceil(v)) if float(v).is_integer() is False else int(v)
    if isinstance(v, str):
        m = re.fullmatch(r'(\d+)\s*s?', v.strip())
        if m:
            return int(m.group(1))
    return None


def durations_of(prop: dict | None) -> list[int]:
    if not prop:
        return []
    e = enum_of(prop)
    if e:
        out = sorted({d for d in (parse_seconds(x) for x in e) if d})
        return out
    eff = effective(prop)
    if eff.get('type') in ('integer', 'number'):
        lo = eff.get('minimum')
        hi = eff.get('maximum')
        if isinstance(hi, (int, float)):
            lo_i = max(1, int(math.ceil(lo))) if isinstance(lo, (int, float)) else 1
            return list(range(lo_i, int(hi) + 1))
    return []


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument('--check', action='store_true')
    ap.add_argument('--dump', type=Path, help='يكتب الصفوف المولّدة JSON للمراجعة (لا يغيّر seed)')
    ap.add_argument('--show', help='يطبع supports/default_params/التكلفة لمعرّف واحد')
    args = ap.parse_args()

    launch = json.loads(LAUNCH.read_text())
    rows: list[str] = []
    dumped: list[dict] = []
    stats = Counter()
    skipped: list[tuple[str, str]] = []
    enabled_ids: list[str] = []

    for m in launch['models']:
        ep = m['endpoint']
        mid = m['id']
        typ = m['type']
        kind = m['kind']
        pfile = PRICING / fname(ep)
        sfile = SCHEMAS / fname(ep)
        price = json.loads(pfile.read_text()) if pfile.exists() else None
        schema = json.loads(sfile.read_text()) if sfile.exists() else None
        props = (schema or {}).get('properties') or {}
        notes: list[str] = []

        # ---------- supports من المخطط
        supports: dict = {
            'family': m['family'], 'family_ar': m['family_ar'], 'family_en': m['family_en'],
            'variant_ar': m['variant_ar'], 'variant_en': m['variant_en'], 'kind': m['kind'], 'lab': m['lab'],
            'endpoint': ep,
        }
        # المراجع
        ref_images = 0
        for k in ('image_urls', 'image_input', 'reference_image_urls'):
            if k in props:
                ref_images = max(ref_images, int(props[k].get('maxItems') or 10))
        if 'image_url' in props or 'start_image_url' in props:
            ref_images = max(ref_images, 2 if 'end_image_url' in props else 1)
        supports['ref_images'] = ref_images
        # يحتاج مرجعًا إن طلبه المخطط، أو إن كان نوع العملية يعمل على صورة المستخدم أصلًا — بعض مخططات fal بلا required
        # وقيمة image_url الافتراضية فيها صورة مثال من fal، فلا نعتمد على required وحده (وإلا نولّد من صورة المثال ونخصم)
        supports['requires_ref'] = kind in REF_KINDS or any(k in ((schema or {}).get('required') or []) for k in ('image_url', 'image_urls', 'start_image_url', 'image_input'))
        supports['i2v'] = kind in ('i2v', 'flf2v', 'transition', 'ref2v')
        supports['audio'] = any(k in props for k in ('generate_audio', 'enable_audio', 'with_audio', 'audio'))
        # النِّسب
        ratios: list[str] = []
        if 'aspect_ratio' in props:
            e = enum_of(props['aspect_ratio']) or []
            ratios = [r for r in OUR_RATIOS if r in e]
        elif 'image_size' in props:
            e = enum_of(props['image_size']) or []
            ratios = [r for r in OUR_RATIOS if any(PRESET_TO_RATIO.get(p) == r for p in e)]
            if accepts_object(props['image_size']):
                ratios = [r for r in OUR_RATIOS if r in ratios or r == '4:5' or r in ('1:1', '9:16', '16:9', '3:4')]
        if ratios:
            supports['aspect_ratios'] = ratios
        # الدقات والمدد
        res_enum = enum_of(props.get('resolution')) or []
        res_all = [str(r) for r in res_enum]
        res = [r for r in res_all if r.lower() not in EXCLUDED_RES]
        if typ == 'video' and res:
            supports['resolutions'] = res
        durs = durations_of(props.get('duration')) if typ == 'video' else []
        if typ == 'video' and not durs and isinstance(m.get('fixed_duration_s'), int):
            durs = [int(m['fixed_duration_s'])]
            notes.append(f"مدة ثابتة {m['fixed_duration_s']} ث (بلا حقل duration في المخطط)")
        if durs:
            supports['durations'] = durs if len(durs) <= 40 else durs[:40]
        # أحجام الصور
        sizes: list[str] = []
        if typ == 'image':
            if any(str(r).upper() in ('1K', '2K', '4K') for r in res_all):
                sizes = [s for s in ('1K', '2K', '4K') if any(str(r).upper() == s for r in res_all)]
            else:
                sizes = ['1K']

        # ---------- التسعير
        cost_credits = None
        cost_per_second = None
        max_duration = max(durs) if durs else None
        priced = False
        unit = (price or {}).get('unit')
        usd = (price or {}).get('usd') or 0
        conf = (price or {}).get('confidence', 'low')
        by_res = (price or {}).get('by_resolution') or {}
        by_dur = (price or {}).get('by_duration') or {}
        if price and usd > 0 and conf != 'low':
            if unit == 'second' or unit == 'minute':
                per_s = usd if unit == 'second' else usd / 60
                cost_per_second = cps(per_s)
                # تجاوزات بالدقة: مفاتيح السعر (480p/720p/1080p) ↔ قيم enum المخطط (720p أو 768P…)
                cbr = {}
                for r in res:
                    for k, v in by_res.items():
                        if isinstance(v, (int, float)) and v > 0 and str(k).lower() == r.lower():
                            cbr[r] = cps(v if unit == 'second' else v / 60)
                if cbr:
                    # دقة بلا سعر معلن لا تُعرض — وإلا سُعّرت بالسعر الأساسي وهي أغلى عند المزوّد (Seedance 2.0 1080p)
                    dropped = [r for r in res if r not in cbr]
                    if dropped:
                        notes.append('دقات بلا سعر معلن أُخفيت: ' + ', '.join(dropped))
                    res = [r for r in res if r in cbr]
                    supports['resolutions'] = res
                    supports['cps_by_resolution'] = cbr
                    # السعر الأساسي = أرخص دقة معروضة (الزر يعرض "من X")
                    cost_per_second = min(cbr.values())
                elif len(res) > 1 and typ == 'video':
                    # سعر واحد بلا تفصيل بالدقة: نعرض دقة افتراض المزوّد فقط حتى يُعلن سعر الباقي
                    keep = str((props.get('resolution') or {}).get('default') or res[0])
                    res = [keep] if keep in res else res[:1]
                    supports['resolutions'] = res
                    notes.append('سعر واحد بلا تفصيل بالدقة — دقة الافتراض فقط')
                sur = price.get('audio_surcharge_usd')
                if isinstance(sur, (int, float)) and sur > 0:
                    supports['audio_cps'] = cps(sur)
                priced = typ == 'video'
                if typ != 'video':
                    notes.append('سعر بالثانية لنوع غير فيديو')
            elif unit == 'clip':
                cost_credits = credits(usd)
                # المقطع يُسعَّر لدقة واحدة (الأرخص المعلنة أو المذكورة في النص)؛ الدقات الأغلى تُخفى حتى يدعم modelCredits مضاعف الدقة للمقطع
                if typ == 'video' and res:
                    base = [r for r in res if any(str(k).lower() == r.lower() and abs(v - usd) < 1e-9 for k, v in by_res.items())]
                    if not base:
                        named = [r for r in res if r.lower() in ((price or {}).get('pricing_text') or '').lower()]
                        base = named[:1] or [str((props.get('resolution') or {}).get('default') or res[0])]
                    if base and base[0] in res and len(res) > 1:
                        notes.append('مقطع مسعّر لدقة ' + base[0] + ' فقط')
                        res = base[:1]
                        supports['resolutions'] = res
                cbd = {str(parse_seconds(k) or k): credits(v) for k, v in by_dur.items() if isinstance(v, (int, float)) and v > 0}
                if cbd:
                    supports['credits_by_duration'] = cbd
                    cost_credits = min(cbd.values())
                    durs2 = sorted({int(k) for k in cbd if str(k).isdigit()})
                    if durs2:
                        supports['durations'] = durs2
                        max_duration = max(durs2)
                priced = typ == 'video'
            elif unit in ('image', 'request'):
                cost_credits = credits(usd)
                mult = {}
                for k, v in by_res.items():
                    kk = str(k).upper()
                    if kk in ('1K', '2K', '4K') and isinstance(v, (int, float)) and v > 0 and usd > 0:
                        mult[kk] = round(v / usd, 3)
                if mult and typ == 'image':
                    mult.setdefault('1K', 1)
                    supports['resolution_multipliers'] = mult
                    # الحجم يُعرض فقط إن كان المخطط يستطيع طلبه (resolution بـ1K/2K/4K) — وإلا يدفع المستخدم 2K ويأخذ 1K
                    sizes = [s for s in sizes if s in mult] or ['1K']
                priced = typ in ('image', 'audio', 'video')
            elif unit == 'megapixel':
                cost_credits = credits(usd)
                if typ == 'image':
                    supports['resolution_multipliers'] = {'1K': 1, '2K': 4, '4K': 16}
                    # الأحجام التي يطلبها المخطط فعلًا فقط (أغلب نماذج الميغابكسل عند fal تُطلب بـimage_size = 1MP تقريبًا)
                    sizes = [s for s in sizes if s in ('1K', '2K', '4K')] or ['1K']
                    notes.append('تسعير بالميغابكسل: 1K=1MP، 2K=4MP، 4K=16MP (تقريب محافظ)')
                    priced = True
                else:
                    notes.append('تسعير بالميغابكسل لفيديو — غير مدعوم في المحرك بعد')
            elif unit == 'token' and isinstance(price.get('per_image_estimate_usd'), (int, float)) and price['per_image_estimate_usd'] > 0 and typ == 'image':
                cost_credits = credits(price['per_image_estimate_usd'])
                notes.append('تسعير بالتوكنات — التكلفة من تقدير fal لصورة 1K')
                priced = True
            elif unit == '1k_chars':
                cost_credits = credits(usd)
                supports['pricing_unit'] = '1k_chars'
                notes.append('تسعير بالحروف — يُفعَّل مع محرك الصوت')
            else:
                notes.append(f'وحدة تسعير غير مدعومة: {unit}')
        else:
            notes.append('سعر غير مؤكد' if price else 'لا ملف سعر')
        supports['pricing'] = {'unit': unit, 'usd': usd, 'confidence': conf, 'source': (price or {}).get('source_url')}
        if typ == 'image':
            # حجم أكبر من 1K يُعرض فقط إن كان سعره معلنًا (resolution_multipliers) — وإلا يُسعَّر بالجدول العام وقد يكون أغلى عند المزوّد
            mult = supports.get('resolution_multipliers') or {}
            sizes = [s for s in (sizes or ['1K']) if s == '1K' or s in mult]
            supports['sizes'] = sizes or ['1K']

        # ---------- الافتراضيات
        defaults: dict = {}
        if typ == 'image':
            defaults['imageSize'] = '1K' if '1K' in (sizes or ['1K']) else (sizes or ['1K'])[0]
            if ratios:
                defaults['aspectRatio'] = '1:1' if '1:1' in ratios else ratios[0]
        elif typ == 'video':
            d_default = parse_seconds((props.get('duration') or {}).get('default'))
            if durs:
                defaults['duration'] = d_default if d_default in durs else (5 if 5 in durs else durs[0])
            if res:
                r_default = str((props.get('resolution') or {}).get('default') or '')
                cbr = supports.get('cps_by_resolution') or {}
                # الافتراضي = أرخص دقة مسعّرة (الزر يعرض "من X" حقيقية)؛ وإلا افتراض المزوّد
                cheapest = min(cbr, key=lambda k: cbr[k]) if cbr else None
                defaults['resolution'] = cheapest if cheapest in res else (r_default if r_default in res else res[0])
            if ratios:
                defaults['aspectRatio'] = '16:9' if '16:9' in ratios else ratios[0]

        # ---------- التفعيل
        only_4k = typ == 'video' and bool(res_all) and not res
        # حقول مطلوبة لا يملؤها inputs.ts (فيديو مرجعي، قناع…) ولا افتراض نصي لها → لا نرسل طلبًا سيرفضه المزوّد
        unfillable = [k for k in ((schema or {}).get('required') or []) if k not in FILLABLE and not (
            (props.get(k) or {}).get('default') not in (None, '') and not re.search(r'(_url|_urls)$', k))]
        if unfillable:
            priced = False
            notes.append('حقول مطلوبة غير مدعومة بعد: ' + ', '.join(unfillable))
        # عدد المراجع الأدنى: إطار أول وأخير، أو شخص + قطعة/منتج
        req = set((schema or {}).get('required') or [])
        if req & {'last_frame_url', 'last_image_url', 'end_image_url', 'tail_image_url', 'product_image_url', 'garment_image_url', 'product_image_urls', 'garment_image_urls'}:
            supports['min_refs'] = 2
        elif supports.get('requires_ref'):
            supports['min_refs'] = 1
        # تكلفة تعتمد على حجم صورة المستخدم (ميغابكسل المدخل/المخرج، أو مكبّرات ناتجها أضعاف المدخل): لا نعرف الحجم قبل
        # التوليد فقد نخسر في صورة جوال 12MP — تبقى معطّلة حتى يُبنى رفع المراجع ويُقاس الحجم قبل الحجز
        size_dependent = (unit == 'megapixel' and kind != 't2i') or kind == 'upscale' and m['family'] in ('topaz', 'seedvr', 'clarity')
        if size_dependent:
            priced = False
            notes.append('التكلفة تعتمد على حجم صورة المستخدم — يُفعَّل مع رفع المراجع وقياس الحجم')
        # ناتج SVG (vector/vectorize): التخزين لا يقبل image/svg+xml، والـSVG يحتاج تعقيمًا (XSS) قبل عرضه — المراجعة المستقلة 2026-10-24
        svg_output = 'vector' in m['endpoint']
        if svg_output:
            priced = False
            notes.append('ناتج SVG — يُفعَّل مع دعم SVG معقّم في التخزين')
        is_4k_variant = '4K' in m['variant_en'].upper()
        enabled = bool(schema) and priced and m['tier'] == 'a' and kind in ENGINE_KINDS and not only_4k and not is_4k_variant and typ != 'audio'
        if typ == 'video' and enabled and not durs and cost_per_second is not None:
            # فيديو بالثانية بلا مدة في المخطط → لا نعرف ما سنحجزه؛ نعطّل حتى يُراجع
            enabled = False
            notes.append('لا مدة في المخطط')
        if is_4k_variant:
            notes.append('4K معطّل حتى R2 (حد التخزين 50MB)')
        if not schema:
            notes.append('لا مخطط')
        if kind not in ENGINE_KINDS:
            notes.append('يحتاج مدخلات فيديو/صوت (المرحلة 2)')
        # نسخة fal من نانو بنانا برو احتياط للـAPI فقط — الواجهة تعرض نسخة Replicate المختبرة في بوابة 1 (ADR 0003) بنفس العائلة
        supports['ui'] = enabled and kind in UI_KINDS and not supports['requires_ref'] and mid not in HIDE_UI
        if notes:
            supports['notes'] = '؛ '.join(notes)

        if args.show == mid:
            print(json.dumps({'id': mid, 'enabled': enabled, 'cost_credits': cost_credits, 'cost_per_second': cost_per_second, 'max_duration_s': max_duration, 'supports': supports, 'default_params': defaults, 'required': (schema or {}).get('required')}, ensure_ascii=False, indent=1))
        if enabled:
            enabled_ids.append(mid)
        stats[typ + (':enabled' if enabled else ':disabled')] += 1
        if not enabled:
            skipped.append((mid, '؛ '.join(notes) or 'الطبقة b'))

        dumped.append({'id': mid, 'name_ar': m['name_ar'], 'type': typ, 'kind': kind, 'tier': m['tier'], 'enabled': enabled, 'cost_credits': cost_credits, 'cost_per_second': cost_per_second, 'max_duration_s': max_duration, 'supports': supports, 'default_params': defaults, 'provider_slug': ep, 'input_schema': ({'required': (schema or {}).get('required') or [], 'properties': props} if schema else None)})
        badge = 'جديد' if (m.get('published_at') or '') >= '2026-09-01' else None
        input_schema = None
        if schema:
            input_schema = {'required': schema.get('required') or [], 'properties': props}
            if schema.get('output') is not None:
                input_schema['output'] = schema['output']
        rows.append(
            '  (' + ', '.join([
                sql_str(mid), sql_str(m['name_ar']), sql_str(m['name_en']), sql_str(typ), sql_str('fal'), sql_str(ep), 'null',
                'null' if cost_credits is None else str(int(cost_credits)),
                'null' if cost_per_second is None else repr(float(cost_per_second)),
                'null' if max_duration is None else str(int(max_duration)),
                sql_json(supports), sql_json(defaults), 'null' if input_schema is None else sql_json(input_schema),
                'true' if enabled else 'false', sql_str(badge), str(1000 + int(m['sort'])),
            ]) + ')'
        )

    header = [
        BEGIN,
        '-- مولَّد بـ scripts/build-models-seed.py من content/catalog/{fal-launch.json,pricing/,schemas/} (ADR 0005). لا تحرّر الصفوف يدويًا — عدّل المصدر وأعد التوليد.',
        f'-- {len(rows)} نموذجًا من fal: ' + ', '.join(f'{k}={v}' for k, v in sorted(stats.items())) + '. التكلفة: ceil(usd×3÷0.042)، بالثانية: usd×3÷0.042 رصيد/ث. المصدر الوحيد للتسعير وقت التشغيل: models (modelCredits).',
        'insert into public.models (id, name_ar, name_en, type, provider, provider_slug, fallback_slug, cost_credits, cost_per_second, max_duration_s, supports, default_params, input_schema, enabled, badge, sort) values',
    ]
    footer = [
        'on conflict (id) do update set',
        '  name_ar = excluded.name_ar, name_en = excluded.name_en, type = excluded.type, provider = excluded.provider,',
        '  provider_slug = excluded.provider_slug, fallback_slug = excluded.fallback_slug, cost_credits = excluded.cost_credits,',
        '  cost_per_second = excluded.cost_per_second, max_duration_s = excluded.max_duration_s, supports = excluded.supports,',
        '  default_params = excluded.default_params, input_schema = excluded.input_schema, enabled = excluded.enabled, badge = excluded.badge, sort = excluded.sort;',
        END,
    ]
    block = '\n'.join(header + [',\n'.join(rows)] + footer) + '\n'

    print(f'models: {len(rows)} | ' + ' | '.join(f'{k}={v}' for k, v in sorted(stats.items())))
    print('enabled:', len(enabled_ids))
    missing_schema = sum(1 for m in launch['models'] if not (SCHEMAS / fname(m['endpoint'])).exists())
    missing_price = sum(1 for m in launch['models'] if not (PRICING / fname(m['endpoint'])).exists())
    print(f'missing schemas: {missing_schema}, missing pricing: {missing_price}')
    if args.dump:
        args.dump.write_text(json.dumps(dumped, ensure_ascii=False, indent=1))
        print(f'dumped {len(dumped)} rows to {args.dump}')
        return 0
    if args.check:
        for mid, why in skipped[:400]:
            print(f'  - {mid}: {why}')
        return 0

    GENERATED.write_text(json.dumps({'generated_by': 'scripts/build-models-seed.py', 'count': len(dumped), 'models': dumped}, ensure_ascii=False, indent=1) + '\n')
    print(f'wrote {GENERATED.relative_to(ROOT)}')
    seed = SEED.read_text()
    if BEGIN in seed and END in seed:
        pre = seed[: seed.index(BEGIN)]
        post = seed[seed.index(END) + len(END) :].lstrip('\n')
        seed = pre + block + ('\n' + post if post else '')
    else:
        seed = seed.rstrip('\n') + '\n\n' + block
    SEED.write_text(seed)
    print(f'wrote {SEED.relative_to(ROOT)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
