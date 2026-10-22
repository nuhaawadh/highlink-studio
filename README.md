# استوديو هاي لينك

منصة عربية لتوليد صور وفيديو المنتجات والإعلانات بالذكاء الاصطناعي بنظام رصيد. المخطط الكامل: [`docs/blueprint.md`](docs/blueprint.md). قواعد العمل مع Claude Code: [`CLAUDE.md`](CLAUDE.md).

## التشغيل محليًا

```bash
npm run install:web                       # تثبيت اعتماديات الواجهة
cp apps/web/.env.example apps/web/.env.local   # ثم املئي قيم Supabase
npm run dev                               # http://localhost:5173
```

قاعدة البيانات (يحتاج Docker + Supabase CLI):

```bash
supabase start
supabase db reset        # يطبّق supabase/migrations + seed.sql
npm run gen:types        # يحدّث packages/shared/db.ts
```

## الفحوصات قبل أي commit

```bash
npm run typecheck && npm test && npm run build
```

## الحالة
المرحلة 0 (الأساس) منجزة. انظر "حالة المشروع" في `CLAUDE.md` والمراحل في `docs/blueprint.md` §11.
