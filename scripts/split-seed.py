"""يقسم supabase/seed.sql إلى ملفات صغيرة لـ`npx supabase db query --linked -f <ملف>` — الكتلة المولّدة (233 صفًا،
قرابة 1MB بسبب input_schema) تُرسل دفعات بدل طلب واحد كبير. نفس المحتوى حرفيًا: لا يغيّر صفًا ولا قيمة.

الاستخدام (من جذر المستودع):
    python -I scripts/split-seed.py supabase/seed.sql <مجلد مؤقت> [حجم الدفعة، افتراضي 25]
ثم شغّل الملفات بترتيب أسمائها (00-base.sql أولًا). scripts/deploy-fal.ps1 يفعل ذلك.
"""
import io, os, sys

if len(sys.argv) not in (3, 4):
    sys.exit(__doc__)
SRC, OUT = sys.argv[1], sys.argv[2]
BATCH = int(sys.argv[3]) if len(sys.argv) == 4 else 25

lines = io.open(SRC, encoding='utf-8').read().split('\n')
begin = lines.index('-- BEGIN fal-catalog (generated)')
end = lines.index('-- END fal-catalog (generated)')
block = lines[begin + 1:end]

hdr = next(i for i, l in enumerate(block) if l.startswith('insert into public.models'))
conflict = next(i for i, l in enumerate(block) if l.startswith('on conflict (id) do update set'))
header, rows, trailer = block[hdr], block[hdr + 1:conflict], block[conflict:]
if not rows or not all(r.startswith('  (') for r in rows):
    sys.exit('unexpected generated block: every row must be one line starting with "  ("')
if not trailer[-1].rstrip().endswith(';'):
    sys.exit('unexpected generated block: on conflict clause must end with ";"')
rows = [r.rstrip().rstrip(',') for r in rows]

os.makedirs(OUT, exist_ok=True)
with io.open(os.path.join(OUT, '00-base.sql'), 'w', encoding='utf-8', newline='\n') as f:
    f.write('\n'.join(lines[:begin] + lines[end + 1:]).rstrip() + '\n')

n = 0
for i in range(0, len(rows), BATCH):
    n += 1
    chunk = rows[i:i + BATCH]
    with io.open(os.path.join(OUT, f'{n:02d}-models.sql'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join([header, ',\n'.join(chunk)] + trailer) + '\n')

print(f'base + {n} model batch(es), {len(rows)} rows -> {OUT}')
